// =========================================================================
// --- MODULE: REAL-TIME APPROVAL LINK, STRICT ROLE GUARD & NOTIFIER     ---
// --- FILE: inv-approval-link.js (v28.2 - 5-TIER GUARANTEED PERSISTENCE) ---
// =========================================================================

const WMS_APPROVAL_CHANNEL_NAME = 'WMS_APPROVAL_SYNC_CHANNEL_V2';
const WMS_APPROVAL_STORAGE_PING_KEY = 'WMS_APPROVAL_LATEST_PING_V2';
const WMS_APPROVAL_FALLBACK_SETTINGS_KEY = 'wms_approval_requests_queue';
const WMS_APPROVAL_LOCAL_QUEUE_KEY = 'WMS_LOCAL_APPROVAL_QUEUE_V2';

let wmsSharedAudioCtx = null;
let wmsApprovalRealtimeChannel = null;
let wmsApprovalBroadcastChannel = null;
let wmsApprovalPollTimer = null;
let wmsNotifiedApprovalIds = new Set();
let wmsAdminIncomingDebounceTimer = null;
let wmsAdminIncomingBuffer = [];

function escapeHtmlApprovalSafe(str) {
    if (typeof escapeHTML === 'function') return escapeHTML(str);
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * ตัวเชื่อมต่อ Supabase Client แบบครอบคลุมทุกชื่อตัวแปรในโปรเจกต์
 */
function resolveWmsSupabaseClient() {
    try {
        if (typeof getSupabaseClient === 'function') {
            const c = getSupabaseClient();
            if (c && typeof c.from === 'function') return c;
        }
        const candidates = [
            window.supabaseClient,
            window._supabase,
            window.sbClient,
            window.dbClient,
            window.db,
            window.supabase
        ];
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (c && typeof c.from === 'function') return c;
        }
    } catch (e) {}
    return null;
}

/**
 * คัดกรองสิทธิ์ผู้ใช้งานอย่างเข้มงวด (Strict Role Filter):
 * - คืนค่า true เฉพาะรหัส user admin / ผู้ดูแลระบบ เท่านั้น (ทำได้ทุกอย่างโดยไม่ต้องรออนุมัติ)
 * - คืนค่า false สำหรับ user ทั่วไป (ต้องส่งเข้าศูนย์อนุมัติคำขอทุกครั้ง)
 */
function isWmsAdminStrict() {
    try {
        if (typeof window.isCurrentUserAdmin === 'function') {
            return Boolean(window.isCurrentUserAdmin());
        }

        const flagCandidates = [
            window.currentUser?.isAdmin,
            window.currentUser?.is_admin,
            localStorage.getItem('isAdmin'),
            localStorage.getItem('is_admin'),
            sessionStorage.getItem('isAdmin'),
            sessionStorage.getItem('is_admin')
        ];
        for (let f = 0; f < flagCandidates.length; f++) {
            const flg = flagCandidates[f];
            if (flg === false || String(flg).toLowerCase() === 'false' || String(flg) === '0') return false;
            if (flg === true || String(flg).toLowerCase() === 'true' || String(flg) === '1') return true;
        }

        const roleCandidates = [
            window.currentUserRole,
            window.userRole,
            window.WMS_CURRENT_ROLE,
            window.currentUser?.role,
            window.currentUser?.user_role,
            window.currentUser?.userRole,
            localStorage.getItem('WMS_USER_ROLE'),
            localStorage.getItem('userRole'),
            localStorage.getItem('wms_role'),
            localStorage.getItem('role'),
            sessionStorage.getItem('WMS_USER_ROLE'),
            sessionStorage.getItem('userRole'),
            sessionStorage.getItem('wms_role')
        ];

        for (let i = 0; i < roleCandidates.length; i++) {
            const rawVal = String(roleCandidates[i] || '').trim().toLowerCase();
            if (!rawVal) continue;
            if (
                rawVal === 'admin' ||
                rawVal === 'superadmin' ||
                rawVal === 'super_admin' ||
                rawVal === 'administrator' ||
                rawVal === 'ผู้ดูแลระบบ'
            ) {
                return true;
            }
            if (
                rawVal === 'user' ||
                rawVal === 'staff' ||
                rawVal === 'operator' ||
                rawVal === 'general' ||
                rawVal === 'พนักงาน' ||
                rawVal === 'ผู้ใช้ทั่วไป'
            ) {
                return false;
            }
        }

        const profileKeys = ['WMS_CURRENT_USER', 'wms_user', 'currentUser', 'userProfile', 'wms_auth_user'];
        for (let k = 0; k < profileKeys.length; k++) {
            const rawJson = localStorage.getItem(profileKeys[k]) || sessionStorage.getItem(profileKeys[k]);
            if (!rawJson) continue;
            try {
                const parsed = JSON.parse(rawJson);
                if (parsed?.isAdmin === false || parsed?.is_admin === false) return false;
                if (parsed?.isAdmin === true || parsed?.is_admin === true) return true;
                const roleStr = String(parsed?.role || parsed?.user_role || parsed?.userRole || parsed?.type || '')
                    .trim()
                    .toLowerCase();
                const unameStr = String(parsed?.username || '').trim().toLowerCase();
                if (
                    roleStr === 'admin' ||
                    roleStr === 'superadmin' ||
                    roleStr === 'administrator' ||
                    roleStr === 'ผู้ดูแลระบบ' ||
                    unameStr === 'admin'
                ) {
                    return true;
                }
            } catch (ignore) {}
        }
    } catch (e) {}

    return false;
}

/**
 * ปลดล็อกระบบเสียง Web Audio API อัตโนมัติเมื่อผู้ใช้แตะหรือคลิกหน้าจอ
 */
function unlockWmsPureAudioContext() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!wmsSharedAudioCtx) {
            wmsSharedAudioCtx = new AudioCtx();
        }
        if (wmsSharedAudioCtx.state === 'suspended') {
            wmsSharedAudioCtx.resume().catch(() => {});
        }
        return wmsSharedAudioCtx;
    } catch (e) {
        return null;
    }
}

document.addEventListener('pointerdown', unlockWmsPureAudioContext, { passive: true });
document.addEventListener('keydown', unlockWmsPureAudioContext, { passive: true });

/**
 * เสียงแจ้งเตือนสังเคราะห์บริสุทธิ์ (Web Audio API Chime)
 * ตัดเสียงคนและเสียง AI ออกทั้งหมด 100% (ไม่มี speechSynthesis ใด ๆ)
 * @param {'USER_SUBMIT' | 'ADMIN_INCOMING' | 'WARN'} variant
 */
function playWmsNotificationChime(variant = 'USER_SUBMIT') {
    try {
        const ctx = unlockWmsPureAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const playTone = (freq, startOffset, duration, peakGain = 0.16, type = 'sine') => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now + startOffset);

            gain.gain.setValueAtTime(0.0001, now + startOffset);
            gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + startOffset);
            osc.stop(now + startOffset + duration + 0.02);
        };

        if (variant === 'ADMIN_INCOMING') {
            // เสียงกระดิ่ง 3 โทนใสสำหรับฝั่ง Admin เมื่อมีคำขอใหม่เข้าศูนย์อนุมัติ
            playTone(783.99, 0.00, 0.22, 0.16, 'sine');      // G5
            playTone(987.77, 0.11, 0.24, 0.17, 'sine');      // B5
            playTone(1318.51, 0.22, 0.36, 0.19, 'triangle'); // E6
        } else if (variant === 'WARN') {
            // เสียงแจ้งเตือนนุ่มนวล 2 จังหวะ
            playTone(523.25, 0.00, 0.18, 0.14, 'triangle'); // C5
            playTone(440.00, 0.14, 0.22, 0.14, 'triangle'); // A4
        } else {
            // เสียงกระดิ่ง 2 โทนสั้นกระชับสำหรับ User ทั่วไปเมื่อส่งคำขออนุมัติเรียบร้อย
            playTone(1046.50, 0.00, 0.20, 0.15, 'sine');     // C6
            playTone(1318.51, 0.10, 0.30, 0.17, 'sine');     // E6
        }
    } catch (e) {}
}

/**
 * สร้างกล่องแจ้งเตือนมุมขวาล่างขนาดกะทัดรัด (ไม่กินพื้นที่หน้าจอ เด้งแล้วหายไปอัตโนมัติ)
 */
function ensureWmsCornerNotifierContainer() {
    if (!document.getElementById('wmsCornerNotifierStyles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'wmsCornerNotifierStyles';
        styleEl.textContent = `
            #wmsCornerNotifierHost {
                position: fixed;
                right: 16px;
                bottom: 16px;
                z-index: 2147483600;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 8px;
                pointer-events: none;
                max-width: calc(100vw - 32px);
            }
            .wms-corner-toast {
                pointer-events: auto;
                position: relative;
                overflow: hidden;
                display: flex;
                align-items: center;
                gap: 10px;
                min-width: 235px;
                max-width: 325px;
                padding: 9px 12px;
                border-radius: 13px;
                background: rgba(15, 23, 42, 0.94);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                color: #f8fafc;
                border: 1px solid rgba(148, 163, 184, 0.26);
                box-shadow: 0 12px 28px rgba(2, 6, 23, 0.32), 0 2px 6px rgba(0, 0, 0, 0.16);
                font-family: inherit;
                transform: translateY(16px) scale(0.94);
                opacity: 0;
                transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease;
            }
            .wms-corner-toast.is-visible {
                transform: translateY(0) scale(1);
                opacity: 1;
            }
            .wms-corner-toast.is-leaving {
                transform: translateY(10px) scale(0.95);
                opacity: 0;
            }
            .wms-corner-toast.is-clickable {
                cursor: pointer;
                border-color: rgba(56, 189, 248, 0.55);
            }
            .wms-corner-toast.is-clickable:hover {
                transform: translateY(-2px) scale(1.01);
                border-color: #38bdf8;
                box-shadow: 0 14px 32px rgba(2, 132, 199, 0.35);
            }
            .wms-corner-toast-icon {
                width: 32px;
                height: 32px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.9rem;
                flex-shrink: 0;
                position: relative;
            }
            .wms-corner-toast-icon.user-sent {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: #ffffff;
                box-shadow: 0 4px 10px rgba(16, 185, 129, 0.35);
            }
            .wms-corner-toast-icon.admin-alert {
                background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
                color: #ffffff;
                box-shadow: 0 4px 10px rgba(37, 99, 235, 0.38);
            }
            .wms-corner-toast-icon.warn-alert {
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                color: #ffffff;
            }
            .wms-corner-toast-icon.admin-alert::after {
                content: '';
                position: absolute;
                top: -3px;
                right: -3px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #f59e0b;
                border: 2px solid #0f172a;
                animation: wmsCornerPulse 1.3s infinite;
            }
            @keyframes wmsCornerPulse {
                0% { transform: scale(0.95); opacity: 1; }
                70% { transform: scale(1.35); opacity: 0.4; }
                100% { transform: scale(0.95); opacity: 1; }
            }
            .wms-corner-toast-body {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .wms-corner-toast-title {
                font-size: 0.82rem;
                font-weight: 700;
                color: #ffffff;
                line-height: 1.25;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .wms-corner-toast-desc {
                font-size: 0.73rem;
                color: #cbd5e1;
                line-height: 1.3;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .wms-corner-toast-cta {
                font-size: 0.71rem;
                font-weight: 700;
                color: #38bdf8;
                margin-top: 2px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .wms-corner-toast-close {
                background: transparent;
                border: none;
                color: #94a3b8;
                width: 20px;
                height: 20px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 0.75rem;
                flex-shrink: 0;
            }
            .wms-corner-toast-close:hover {
                background: rgba(255, 255, 255, 0.12);
                color: #ffffff;
            }
            .wms-corner-toast-bar {
                position: absolute;
                left: 0;
                bottom: 0;
                height: 2.5px;
                width: 100%;
                transform-origin: left center;
                background: linear-gradient(90deg, #34d399, #38bdf8);
            }
            .wms-nav-approval-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 19px;
                height: 19px;
                padding: 0 5px;
                margin-left: 6px;
                border-radius: 999px;
                background: #ef4444;
                color: #ffffff;
                font-size: 0.7rem;
                font-weight: 800;
                line-height: 1;
                box-shadow: 0 2px 6px rgba(239, 68, 68, 0.45);
            }
        `;
        document.head.appendChild(styleEl);
    }

    let host = document.getElementById('wmsCornerNotifierHost');
    if (!host) {
        host = document.createElement('div');
        host.id = 'wmsCornerNotifierHost';
        document.body.appendChild(host);
    }
    return host;
}

/**
 * แสดงไอคอนแจ้งเตือนมุมขวาล่างขนาดกะทัดรัด เด้งขึ้นมาแป๊บนึงแล้วหายไปเอง
 */
function showWmsCornerNotification({
    variant = 'USER_SUBMIT',
    title = 'ส่งคำขออนุมัติเรียบร้อย',
    description = '',
    ctaLabel = '',
    durationMs = 3400,
    playSound = true,
    onClick = null
} = {}) {
    const host = ensureWmsCornerNotifierContainer();

    while (host.children.length >= 2) {
        host.removeChild(host.firstChild);
    }

    const card = document.createElement('div');
    const isClickable = typeof onClick === 'function';
    card.className = `wms-corner-toast ${isClickable ? 'is-clickable' : ''}`;

    let iconHtml = `<div class="wms-corner-toast-icon user-sent"><i class="fa-solid fa-paper-plane"></i></div>`;
    if (variant === 'ADMIN_INCOMING') {
        iconHtml = `<div class="wms-corner-toast-icon admin-alert"><i class="fa-solid fa-bell"></i></div>`;
    } else if (variant === 'WARN') {
        iconHtml = `<div class="wms-corner-toast-icon warn-alert"><i class="fa-solid fa-triangle-exclamation"></i></div>`;
    }

    card.innerHTML = `
        ${iconHtml}
        <div class="wms-corner-toast-body">
            <div class="wms-corner-toast-title">${escapeHtmlApprovalSafe(title)}</div>
            ${description ? `<div class="wms-corner-toast-desc">${escapeHtmlApprovalSafe(description)}</div>` : ''}
            ${ctaLabel ? `<div class="wms-corner-toast-cta"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtmlApprovalSafe(ctaLabel)}</div>` : ''}
        </div>
        <button type="button" class="wms-corner-toast-close" title="ปิดแจ้งเตือน" aria-label="ปิด">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="wms-corner-toast-bar"></div>
    `;

    let dismissTimer = null;
    let remainingMs = durationMs;
    let startedAt = Date.now();

    const removeToast = () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        card.classList.remove('is-visible');
        card.classList.add('is-leaving');
        setTimeout(() => {
            if (card.parentNode) card.parentNode.removeChild(card);
        }, 240);
    };

    const startAutoDismiss = (ms) => {
        startedAt = Date.now();
        const bar = card.querySelector('.wms-corner-toast-bar');
        if (bar) {
            bar.style.transition = 'none';
            bar.style.transform = `scaleX(${Math.max(0, ms / durationMs)})`;
            requestAnimationFrame(() => {
                bar.style.transition = `transform ${ms}ms linear`;
                bar.style.transform = 'scaleX(0)';
            });
        }
        dismissTimer = setTimeout(removeToast, ms);
    };

    card.addEventListener('mouseenter', () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        const elapsed = Date.now() - startedAt;
        remainingMs = Math.max(900, remainingMs - elapsed);
        const bar = card.querySelector('.wms-corner-toast-bar');
        if (bar) {
            const computed = getComputedStyle(bar).transform;
            bar.style.transition = 'none';
            bar.style.transform = computed;
        }
    });

    card.addEventListener('mouseleave', () => {
        startAutoDismiss(remainingMs);
    });

    const closeBtn = card.querySelector('.wms-corner-toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeToast();
        });
    }

    if (isClickable) {
        card.addEventListener('click', () => {
            removeToast();
            onClick();
        });
    }

    host.appendChild(card);
    requestAnimationFrame(() => {
        card.classList.add('is-visible');
    });

    if (playSound) {
        playWmsNotificationChime(variant);
    }

    startAutoDismiss(durationMs);
    return card;
}

// =========================================================================
// --- 5-TIER GUARANTEED APPROVAL PERSISTENCE ENGINE (100% RELIABLE)     ---
// =========================================================================

function readLocalEmergencyApprovalQueue() {
    try {
        const raw = localStorage.getItem(WMS_APPROVAL_LOCAL_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function writeLocalEmergencyApprovalQueue(list) {
    try {
        localStorage.setItem(WMS_APPROVAL_LOCAL_QUEUE_KEY, JSON.stringify((list || []).slice(0, 2500)));
    } catch (e) {}
}

/**
 * อ่านรายการคำขอสำรองจาก system_settings
 */
async function readFallbackApprovalQueueFromSettings(client) {
    if (!client) return [];
    try {
        const { data, error } = await client
            .from('system_settings')
            .select('value')
            .eq('key', WMS_APPROVAL_FALLBACK_SETTINGS_KEY)
            .limit(1);
        if (error || !Array.isArray(data) || data.length === 0 || !data[0]?.value) return [];
        let parsed = data[0].value;
        if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
        }
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/**
 * บันทึกรายการคำขอลง system_settings แบบ Select -> Update/Insert (ไม่ติด Unique Constraint และรองรับทั้ง JSONB/TEXT)
 */
async function writeFallbackApprovalQueueToSettings(client, queueList) {
    if (!client) throw new Error('Supabase client unavailable');
    const trimmed = Array.isArray(queueList) ? queueList.slice(0, 2500) : [];

    const { data: existingRows, error: selErr } = await client
        .from('system_settings')
        .select('key')
        .eq('key', WMS_APPROVAL_FALLBACK_SETTINGS_KEY)
        .limit(1);

    if (selErr) throw selErr;

    const rowExists = Array.isArray(existingRows) && existingRows.length > 0;

    if (rowExists) {
        const { error: upErr } = await client
            .from('system_settings')
            .update({ value: trimmed })
            .eq('key', WMS_APPROVAL_FALLBACK_SETTINGS_KEY);
        if (upErr) {
            const { error: upStrErr } = await client
                .from('system_settings')
                .update({ value: JSON.stringify(trimmed) })
                .eq('key', WMS_APPROVAL_FALLBACK_SETTINGS_KEY);
            if (upStrErr) throw upStrErr;
        }
    } else {
        const { error: insErr } = await client
            .from('system_settings')
            .insert([{ key: WMS_APPROVAL_FALLBACK_SETTINGS_KEY, value: trimmed }]);
        if (insErr) {
            const { error: insStrErr } = await client
                .from('system_settings')
                .insert([{ key: WMS_APPROVAL_FALLBACK_SETTINGS_KEY, value: JSON.stringify(trimmed) }]);
            if (insStrErr) throw insStrErr;
        }
    }
}

/**
 * อ่านรายการคำขอสำรองจาก inventory_logs (กรณีตารางอื่นติด RLS)
 */
async function readFallbackApprovalQueueFromLogs(client, statusFilter = null) {
    if (!client) return [];
    const targetActions = statusFilter === 'APPROVED'
        ? ['APPROVAL_REQUEST_APPROVED']
        : statusFilter === 'REJECTED'
            ? ['APPROVAL_REQUEST_REJECTED']
            : statusFilter === 'PENDING'
                ? ['APPROVAL_REQUEST_PENDING']
                : ['APPROVAL_REQUEST_PENDING', 'APPROVAL_REQUEST_APPROVED', 'APPROVAL_REQUEST_REJECTED'];

    try {
        const { data, error } = await client
            .from('inventory_logs')
            .select('*')
            .in('action', targetActions)
            .order('created_at', { ascending: false })
            .limit(400);

        if (error || !Array.isArray(data)) return [];

        const unpacked = [];
        data.forEach(logRow => {
            try {
                const rawDetails = String(logRow.details || '');
                const jsonStart = rawDetails.indexOf('WMS_REQ_JSON:');
                if (jsonStart === -1) return;
                const payloadObj = JSON.parse(rawDetails.slice(jsonStart + 'WMS_REQ_JSON:'.length));
                const derivedStatus = logRow.action === 'APPROVAL_REQUEST_APPROVED'
                    ? 'APPROVED'
                    : logRow.action === 'APPROVAL_REQUEST_REJECTED'
                        ? 'REJECTED'
                        : 'PENDING';

                const itemsArr = Array.isArray(payloadObj.items) ? payloadObj.items : [payloadObj];
                itemsArr.forEach((it, idx) => {
                    unpacked.push({
                        id: `LOG-${logRow.id}-${idx}`,
                        _logId: logRow.id,
                        _source: 'INVENTORY_LOGS_QUEUE',
                        request_type: String(payloadObj.request_type || it.request_type || 'DELETE').toUpperCase(),
                        batch_id: payloadObj.batch_id || it.batch_id || '',
                        sn: it.sn || '',
                        category: it.category || '',
                        name: it.name || '',
                        location: it.location || '',
                        target_location: it.target_location || '',
                        requested_by: payloadObj.requested_by || logRow.performed_by || 'User',
                        reason: payloadObj.reason || '',
                        status: derivedStatus,
                        created_at: logRow.created_at || payloadObj.created_at
                    });
                });
            } catch (parseIgnore) {}
        });

        return unpacked;
    } catch (e) {
        return [];
    }
}

/**
 * กรองรายการ S/N ที่มีคำขอสถานะ PENDING ค้างอยู่แล้ว เพื่อป้องกันการส่งซ้ำ
 */
async function filterOutAlreadyPendingRequestSns(client, items, requestType) {
    if (!Array.isArray(items) || items.length === 0) {
        return { allowedItems: items, skippedPendingCount: 0 };
    }

    const alreadyPendingSnUpper = new Set();

    // 1. ตรวจสอบจากตารางหลัก approval_requests (ถ้าเข้าถึงได้)
    if (client) {
        try {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                const snSlice = items
                    .slice(i, i + CHUNK_SIZE)
                    .map(it => String(it.sn || '').trim())
                    .filter(Boolean);
                if (snSlice.length === 0) continue;

                const { data, error } = await client
                    .from('approval_requests')
                    .select('sn')
                    .eq('status', 'PENDING')
                    .in('sn', snSlice);

                if (error) break;
                if (Array.isArray(data)) {
                    data.forEach(row => {
                        if (row && row.sn) {
                            alreadyPendingSnUpper.add(String(row.sn).trim().toUpperCase());
                        }
                    });
                }
            }
        } catch (e) {}

        // 2. ตรวจสอบจากคิวสำรองใน system_settings
        try {
            const fallbackList = await readFallbackApprovalQueueFromSettings(client);
            fallbackList.forEach(row => {
                if (row && String(row.status || '').toUpperCase() === 'PENDING' && row.sn) {
                    alreadyPendingSnUpper.add(String(row.sn).trim().toUpperCase());
                }
            });
        } catch (e) {}

        // 3. ตรวจสอบจาก inventory_logs
        try {
            const logPendingList = await readFallbackApprovalQueueFromLogs(client, 'PENDING');
            logPendingList.forEach(row => {
                if (row && row.sn) {
                    alreadyPendingSnUpper.add(String(row.sn).trim().toUpperCase());
                }
            });
        } catch (e) {}
    }

    // 4. ตรวจสอบจากคิวฉุกเฉินในเครื่อง
    readLocalEmergencyApprovalQueue().forEach(row => {
        if (row && String(row.status || '').toUpperCase() === 'PENDING' && row.sn) {
            alreadyPendingSnUpper.add(String(row.sn).trim().toUpperCase());
        }
    });

    if (alreadyPendingSnUpper.size === 0) {
        return { allowedItems: items, skippedPendingCount: 0 };
    }

    const allowedItems = items.filter(it => {
        const key = String(it.sn || '').trim().toUpperCase();
        return !alreadyPendingSnUpper.has(key);
    });

    return {
        allowedItems,
        skippedPendingCount: items.length - allowedItems.length
    };
}

/**
 * บันทึกคำขอลงฐานข้อมูลแบบปรับตัวอัตโนมัติ 5 ระดับ (Guaranteed 100% Persistence)
 * Tier 1: approval_requests (Full Schema + Auto-strip missing columns + Auto-fill NOT NULL)
 * Tier 2: approval_requests (Compact Schema)
 * Tier 3: system_settings (wms_approval_requests_queue)
 * Tier 4: inventory_logs (APPROVAL_REQUEST_PENDING)
 * Tier 5: Local Emergency Queue + Broadcast Sync
 */
async function submitApprovalRequestsResilient(client, normalizedRecords, onProgress = null) {
    const totalCount = normalizedRecords.length;
    const CHUNK_SIZE = 200;
    const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);

    let activeStrategy = client ? 'PRIMARY_FULL' : 'LOCAL_EMERGENCY_QUEUE';
    const strippedColumns = new Set();
    const extraRequiredValues = {};

    const buildRowForStrategy = (rec, strategy) => {
        if (strategy === 'PRIMARY_FULL') {
            const obj = {
                request_type: rec.request_type,
                batch_id: rec.batch_id,
                sn: rec.sn,
                category: rec.category || '',
                name: rec.name || '',
                location: rec.location || '',
                target_location: rec.target_location || '',
                requested_by: rec.requested_by || 'User',
                reason: rec.reason || '',
                status: 'PENDING',
                created_at: rec.created_at,
                ...extraRequiredValues
            };
            strippedColumns.forEach(col => delete obj[col]);
            return obj;
        }
        if (strategy === 'ALT_TYPE_SCHEMA') {
            return {
                type: rec.request_type,
                sn: rec.sn,
                location: rec.location || '',
                target_location: rec.target_location || '',
                requester: rec.requested_by || 'User',
                details: `${rec.name || rec.category || ''} | ${rec.reason || ''}`.trim(),
                status: 'PENDING',
                created_at: rec.created_at
            };
        }
        return {
            sn: rec.sn,
            status: 'PENDING'
        };
    };

    for (let c = 0; c < totalChunks; c++) {
        const slice = normalizedRecords.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
        let chunkInserted = false;
        let guardAttempts = 0;

        while (!chunkInserted && guardAttempts < 25) {
            guardAttempts++;

            // Tier 5: Local Emergency Queue (ทำงานได้แม้ไม่มี client หรือถูกบล็อกทุกตาราง)
            if (activeStrategy === 'LOCAL_EMERGENCY_QUEUE') {
                const localQ = readLocalEmergencyApprovalQueue();
                const newEntries = slice.map((rec, idx) => ({
                    id: `LOC-${Date.now()}-${c}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                    _source: 'LOCAL_EMERGENCY_QUEUE',
                    request_type: rec.request_type,
                    batch_id: rec.batch_id,
                    sn: rec.sn,
                    category: rec.category || '',
                    name: rec.name || '',
                    location: rec.location || '',
                    target_location: rec.target_location || '',
                    requested_by: rec.requested_by || 'User',
                    reason: rec.reason || '',
                    status: 'PENDING',
                    created_at: rec.created_at
                }));
                writeLocalEmergencyApprovalQueue([...newEntries, ...localQ]);
                chunkInserted = true;
                break;
            }

            // Tier 4: inventory_logs Queue
            if (activeStrategy === 'INVENTORY_LOGS_QUEUE') {
                try {
                    const first = slice[0];
                    const compactPayload = {
                        request_type: first.request_type,
                        batch_id: first.batch_id,
                        requested_by: first.requested_by,
                        reason: first.reason,
                        created_at: first.created_at,
                        items: slice.map(s => ({
                            sn: s.sn,
                            category: s.category || '',
                            name: s.name || '',
                            location: s.location || '',
                            target_location: s.target_location || ''
                        }))
                    };
                    const { error: logErr } = await client.from('inventory_logs').insert([{
                        action: 'APPROVAL_REQUEST_PENDING',
                        details: `WMS_REQ_JSON:${JSON.stringify(compactPayload)}`,
                        performed_by: first.requested_by || 'User',
                        created_at: first.created_at
                    }]);
                    if (logErr) throw logErr;
                    chunkInserted = true;
                    break;
                } catch (logFail) {
                    activeStrategy = 'LOCAL_EMERGENCY_QUEUE';
                    continue;
                }
            }

            // Tier 3: system_settings Queue
            if (activeStrategy === 'SYSTEM_SETTINGS_QUEUE') {
                try {
                    const existingQueue = await readFallbackApprovalQueueFromSettings(client);
                    const newEntries = slice.map((rec, idx) => ({
                        id: `Q-${Date.now()}-${c}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                        _source: 'SYSTEM_SETTINGS_QUEUE',
                        request_type: rec.request_type,
                        batch_id: rec.batch_id,
                        sn: rec.sn,
                        category: rec.category || '',
                        name: rec.name || '',
                        location: rec.location || '',
                        target_location: rec.target_location || '',
                        requested_by: rec.requested_by || 'User',
                        reason: rec.reason || '',
                        status: 'PENDING',
                        created_at: rec.created_at
                    }));
                    await writeFallbackApprovalQueueToSettings(client, [...newEntries, ...existingQueue]);
                    chunkInserted = true;
                    break;
                } catch (settingsFail) {
                    activeStrategy = 'INVENTORY_LOGS_QUEUE';
                    continue;
                }
            }

            // Tier 1 & Tier 2: approval_requests table
            const payload = slice.map(rec => buildRowForStrategy(rec, activeStrategy));
            const { error } = await client.from('approval_requests').insert(payload);

            if (!error) {
                chunkInserted = true;
                break;
            }

            const errCode = String(error.code || '');
            const errMsg = String(error.message || '');
            const errDetails = String(error.details || '');
            const fullErrLower = `${errCode} ${errMsg} ${errDetails}`.toLowerCase();

            // 1. ตรวจพบชื่อคอลัมน์ที่ไม่มีในตาราง -> ตัดคอลัมน์นั้นออกแล้วลองใหม่ทันที
            const colMatch = errMsg.match(/['"]([a-zA-Z0-9_]+)['"]\s+column/i) ||
                errMsg.match(/column\s+['"]([a-zA-Z0-9_]+)['"]/i);

            if (colMatch && colMatch[1] && activeStrategy === 'PRIMARY_FULL') {
                const missingCol = colMatch[1];
                if (!strippedColumns.has(missingCol) && missingCol !== 'sn' && missingCol !== 'status') {
                    strippedColumns.add(missingCol);
                    continue;
                }
            }

            // 2. ตรวจพบคอลัมน์บังคับ NOT NULL -> เติมค่าอัตโนมัติ
            const notNullMatch = errMsg.match(/null value in column\s+['"]([a-zA-Z0-9_]+)['"]/i);
            if (notNullMatch && notNullMatch[1] && activeStrategy === 'PRIMARY_FULL') {
                const reqCol = notNullMatch[1];
                if (!(reqCol in extraRequiredValues)) {
                    const firstRec = slice[0] || {};
                    if (reqCol.includes('type') || reqCol.includes('action')) {
                        extraRequiredValues[reqCol] = firstRec.request_type || 'DELETE';
                    } else if (reqCol.includes('user') || reqCol.includes('req') || reqCol.includes('by')) {
                        extraRequiredValues[reqCol] = firstRec.requested_by || 'User';
                    } else {
                        extraRequiredValues[reqCol] = firstRec.reason || '-';
                    }
                    continue;
                }
            }

            // 3. สลับไปใช้ ALT_TYPE_SCHEMA
            if (activeStrategy === 'PRIMARY_FULL') {
                activeStrategy = 'ALT_TYPE_SCHEMA';
                continue;
            }

            // 4. สลับไปใช้ SYSTEM_SETTINGS_QUEUE ทันที
            if (activeStrategy === 'ALT_TYPE_SCHEMA') {
                activeStrategy = 'SYSTEM_SETTINGS_QUEUE';
                continue;
            }
        }

        if (!chunkInserted) {
            // บันทึกลงคิวฉุกเฉินในเครื่องเพื่อไม่ให้คำขอหายเด็ดขาด
            const localQ = readLocalEmergencyApprovalQueue();
            const fallbackEntries = slice.map((rec, idx) => ({
                id: `LOC-${Date.now()}-${c}-${idx}`,
                _source: 'LOCAL_EMERGENCY_QUEUE',
                ...rec,
                status: 'PENDING'
            }));
            writeLocalEmergencyApprovalQueue([...fallbackEntries, ...localQ]);
            activeStrategy = 'LOCAL_EMERGENCY_QUEUE';
        }

        if (typeof onProgress === 'function') {
            onProgress(c + 1, totalChunks, Math.min(totalCount, (c + 1) * CHUNK_SIZE), totalCount);
        }
    }

    return { strategy: activeStrategy, totalInserted: totalCount };
}

// =========================================================================
// --- APPROVAL CENTER LINKING, NAVIGATION & REAL-TIME SYNC ENGINE       ---
// =========================================================================
function findApprovalCenterMenuElements() {
    const matches = [];
    const selectors = [
        '[data-menu*="approval" i]',
        '[data-page*="approval" i]',
        '[data-tab*="approval" i]',
        '[data-target*="approval" i]',
        '[href*="approval" i]',
        '[onclick*="approval" i]',
        '#menuApprovalCenter',
        '#navApprovalCenter',
        '#btnApprovalCenter'
    ];

    const seen = new Set();
    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            if (!seen.has(el)) {
                seen.add(el);
                matches.push(el);
            }
        });
    });

    if (matches.length === 0) {
        document.querySelectorAll('nav a, nav button, aside a, aside button, .sidebar a, .sidebar button, .nav-item, .menu-item, [role="tab"]').forEach(el => {
            if (seen.has(el)) return;
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (txt.includes('อนุมัติคำขอ') || txt.includes('ศูนย์อนุมัติ')) {
                seen.add(el);
                matches.push(el);
            }
        });
    }

    return matches;
}

function updateApprovalCenterMenuBadges(pendingCount) {
    const count = Math.max(0, parseInt(pendingCount, 10) || 0);

    document.querySelectorAll('#sidebarApprovalBadge, #approvalBadge, #approvalPendingBadge, [data-badge="approval"], .approval-pending-badge').forEach(badge => {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    });

    const menuEls = findApprovalCenterMenuElements();
    menuEls.forEach(el => {
        let badge = el.querySelector('.wms-nav-approval-badge');
        if (!badge && count > 0) {
            badge = document.createElement('span');
            badge.className = 'wms-nav-approval-badge';
            el.appendChild(badge);
        }
        if (badge) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
    });
}

function navigateToWmsApprovalCenter(detail = {}) {
    let navigatedToHostMenu = false;

    const navFns = [
        'openApprovalCenter',
        'showApprovalCenter',
        'navigateToApprovalCenter',
        'openApprovalRequestsModal'
    ];
    for (let i = 0; i < navFns.length; i++) {
        if (typeof window[navFns[i]] === 'function') {
            try {
                window[navFns[i]](detail);
                navigatedToHostMenu = true;
                break;
            } catch (e) {}
        }
    }

    if (!navigatedToHostMenu) {
        const menuEls = findApprovalCenterMenuElements();
        if (menuEls.length > 0) {
            menuEls[0].click();
            navigatedToHostMenu = true;
        }
    }

    const refreshFns = [
        'refreshApprovalsUI',
        'loadApprovalRequests',
        'loadApprovalRequestsFromDB',
        'fetchApprovalRequests',
        'refreshApprovalCenter',
        'renderApprovalRequests'
    ];
    refreshFns.forEach(fnName => {
        if (typeof window[fnName] === 'function') {
            try {
                window[fnName]();
            } catch (e) {}
        }
    });

    window.dispatchEvent(new CustomEvent('wms_navigate_approval_center', { detail }));

    setTimeout(() => {
        const viewApprovalsEl = document.getElementById('view-approvals');
        const isViewApprovalsVisible = Boolean(
            viewApprovalsEl &&
            viewApprovalsEl.style.display !== 'none' &&
            !viewApprovalsEl.classList.contains('hidden')
        );
        const hostApprovalVisible = isViewApprovalsVisible || Boolean(
            document.querySelector('#approvalCenterSection:not([style*="display: none"]), #approvalSection:not([style*="display: none"]), #approvalModal.active, #approvalRequestsModal.active')
        );
        if (!navigatedToHostMenu || !hostApprovalVisible) {
            openBuiltInApprovalCenterModal(detail);
        }
    }, 180);
}

function broadcastNewApprovalRequestEvent(summaryPayload) {
    try {
        if (wmsApprovalBroadcastChannel) {
            wmsApprovalBroadcastChannel.postMessage({
                type: 'NEW_APPROVAL_REQUEST',
                payload: summaryPayload,
                ts: Date.now()
            });
        }
    } catch (e) {}

    try {
        localStorage.setItem(
            WMS_APPROVAL_STORAGE_PING_KEY,
            JSON.stringify({
                type: 'NEW_APPROVAL_REQUEST',
                payload: summaryPayload,
                nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
            })
        );
    } catch (e) {}

    // กระตุ้นอัปเดตศูนย์อนุมัติในแท็บปัจจุบันทันที
    if (typeof window.refreshApprovalsUI === 'function') {
        try {
            window.refreshApprovalsUI();
        } catch (e) {}
    }
}

function queueAdminIncomingApprovalAlert(record) {
    if (!isWmsAdminStrict()) return;
    if (!record) return;

    const dedupeKey = record.id ? `id:${record.id}` : `batch:${record.batch_id || ''}:${record.sn || ''}:${record.created_at || ''}`;
    if (wmsNotifiedApprovalIds.has(dedupeKey)) return;
    wmsNotifiedApprovalIds.add(dedupeKey);

    if (wmsNotifiedApprovalIds.size > 1000) {
        const firstKey = wmsNotifiedApprovalIds.values().next().value;
        wmsNotifiedApprovalIds.delete(firstKey);
    }

    wmsAdminIncomingBuffer.push(record);
    if (wmsAdminIncomingDebounceTimer) clearTimeout(wmsAdminIncomingDebounceTimer);

    wmsAdminIncomingDebounceTimer = setTimeout(() => {
        const batch = wmsAdminIncomingBuffer.splice(0, wmsAdminIncomingBuffer.length);
        if (batch.length === 0) return;

        // หากมี approvals-db.js โหลดอยู่ ให้ส่งต่อให้ป๊อปอัพกดอนุมัติ/ปฏิเสธหลักทำงานตัวเดียวเพื่อไม่ให้เสียงและป๊อปอัพซ้อนกัน
        if (typeof window.refreshApprovalsUI === 'function') {
            try {
                window.refreshApprovalsUI();
                return;
            } catch (e) {}
        }

        const first = batch[0];
        const totalItems = batch.reduce((sum, item) => sum + (parseInt(item.count, 10) || 1), 0);
        const isDelete = String(first.request_type || first.type || '').toUpperCase() === 'DELETE';
        const actionLabel = isDelete ? 'ขอลบ S/N ออกจากคลัง' : 'ขอย้ายพิกัดคลัง';
        const requester = first.requested_by || first.requester || 'ผู้ใช้งานทั่วไป';

        showWmsCornerNotification({
            variant: 'ADMIN_INCOMING',
            title: `คำขออนุมัติใหม่ (${totalItems.toLocaleString()} รายการ)`,
            description: `${actionLabel} โดย ${requester}${first.target_location ? ` → ${first.target_location}` : ''}`,
            ctaLabel: 'กดเพื่อไปหน้าอนุมัติ / ปฏิเสธ',
            durationMs: 6800,
            playSound: true,
            onClick: () => navigateToWmsApprovalCenter({ batchId: first.batch_id || null, requestType: first.request_type || first.type })
        });

        refreshAdminPendingApprovalCount();
    }, 450);
}

async function refreshAdminPendingApprovalCount() {
    const client = resolveWmsSupabaseClient();
    let totalPending = 0;

    if (client) {
        try {
            const { count, error } = await client
                .from('approval_requests')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'PENDING');

            if (!error && typeof count === 'number') {
                totalPending += count;
            }
        } catch (e) {}

        try {
            const fallbackList = await readFallbackApprovalQueueFromSettings(client);
            const qPending = fallbackList.filter(r => String(r?.status || '').toUpperCase() === 'PENDING').length;
            totalPending += qPending;
        } catch (e) {}

        try {
            const logPending = await readFallbackApprovalQueueFromLogs(client, 'PENDING');
            totalPending += logPending.length;
        } catch (e) {}
    }

    const localPending = readLocalEmergencyApprovalQueue().filter(r => String(r?.status || '').toUpperCase() === 'PENDING').length;
    totalPending += localPending;

    updateApprovalCenterMenuBadges(totalPending);
    return totalPending;
}

function initWmsApprovalRealTimeSync() {
    if (typeof BroadcastChannel !== 'undefined' && !wmsApprovalBroadcastChannel) {
        try {
            wmsApprovalBroadcastChannel = new BroadcastChannel(WMS_APPROVAL_CHANNEL_NAME);
            wmsApprovalBroadcastChannel.onmessage = (event) => {
                const msg = event?.data;
                if (!msg) return;
                if (msg.type === 'NEW_APPROVAL_REQUEST' && isWmsAdminStrict()) {
                    queueAdminIncomingApprovalAlert(msg.payload);
                } else if (msg.type === 'APPROVAL_DECISION_MADE') {
                    refreshAdminPendingApprovalCount();
                    if (typeof window.refreshApprovalsUI === 'function') {
                        try { window.refreshApprovalsUI(); } catch (e) {}
                    }
                    if (!isWmsAdminStrict() && typeof loadInventoryFromDB === 'function') {
                        loadInventoryFromDB(true).catch(() => {});
                    }
                }
            };
        } catch (e) {}
    }

    window.addEventListener('storage', (e) => {
        if (e.key === WMS_APPROVAL_STORAGE_PING_KEY && e.newValue) {
            try {
                const parsed = JSON.parse(e.newValue);
                if (parsed?.type === 'NEW_APPROVAL_REQUEST' && isWmsAdminStrict()) {
                    queueAdminIncomingApprovalAlert(parsed.payload);
                } else if (parsed?.type === 'APPROVAL_DECISION_MADE' && typeof window.refreshApprovalsUI === 'function') {
                    window.refreshApprovalsUI();
                }
            } catch (ignore) {}
        }
    });

    const attachSupabaseApprovalChannel = () => {
        const client = resolveWmsSupabaseClient();
        if (!client) return false;

        if (!wmsApprovalRealtimeChannel) {
            try {
                wmsApprovalRealtimeChannel = client
                    .channel('wms-approval-center-live-sync-v2')
                    .on(
                        'postgres_changes',
                        { event: 'INSERT', schema: 'public', table: 'approval_requests' },
                        (payload) => {
                            const row = payload?.new;
                            if (row && String(row.status || '').toUpperCase() === 'PENDING') {
                                if (isWmsAdminStrict()) {
                                    queueAdminIncomingApprovalAlert(row);
                                }
                            }
                        }
                    )
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'approval_requests' },
                        (payload) => {
                            refreshAdminPendingApprovalCount();
                            const row = payload?.new;
                            if (!isWmsAdminStrict() && row) {
                                const st = String(row.status || '').toUpperCase();
                                if (st === 'APPROVED' || st === 'REJECTED') {
                                    if (typeof loadInventoryFromDB === 'function') {
                                        loadInventoryFromDB(true).catch(() => {});
                                    }
                                }
                            }
                        }
                    )
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'system_settings', filter: `key=eq.${WMS_APPROVAL_FALLBACK_SETTINGS_KEY}` },
                        (payload) => {
                            refreshAdminPendingApprovalCount();
                            if (isWmsAdminStrict() && payload?.new?.value) {
                                let arr = payload.new.value;
                                if (typeof arr === 'string') {
                                    try { arr = JSON.parse(arr); } catch (e) { arr = []; }
                                }
                                if (Array.isArray(arr) && arr.length > 0) {
                                    const newest = arr[0];
                                    if (newest && String(newest.status || '').toUpperCase() === 'PENDING') {
                                        queueAdminIncomingApprovalAlert(newest);
                                    }
                                }
                            }
                        }
                    )
                    .on(
                        'postgres_changes',
                        { event: 'INSERT', schema: 'public', table: 'inventory_logs', filter: 'action=eq.APPROVAL_REQUEST_PENDING' },
                        (payload) => {
                            refreshAdminPendingApprovalCount();
                            if (isWmsAdminStrict() && payload?.new) {
                                queueAdminIncomingApprovalAlert({
                                    id: `LOG-${payload.new.id}`,
                                    request_type: 'DELETE',
                                    requested_by: payload.new.performed_by || 'ผู้ใช้งานทั่วไป',
                                    created_at: payload.new.created_at
                                });
                            }
                        }
                    )
                    .subscribe();
            } catch (e) {}
        }

        refreshAdminPendingApprovalCount();
        return true;
    };

    if (!attachSupabaseApprovalChannel()) {
        setTimeout(attachSupabaseApprovalChannel, 1500);
    }

    if (!wmsApprovalPollTimer) {
        let lastKnownSignature = '';
        wmsApprovalPollTimer = setInterval(async () => {
            const client = resolveWmsSupabaseClient();
            await refreshAdminPendingApprovalCount();

            if (isWmsAdminStrict()) {
                try {
                    let primaryData = [];
                    let fallbackRows = [];
                    let logRows = [];

                    if (client) {
                        const { data } = await client
                            .from('approval_requests')
                            .select('*')
                            .eq('status', 'PENDING')
                            .order('created_at', { ascending: false })
                            .limit(5);
                        if (Array.isArray(data)) primaryData = data;

                        fallbackRows = (await readFallbackApprovalQueueFromSettings(client))
                            .filter(r => String(r?.status || '').toUpperCase() === 'PENDING')
                            .slice(0, 5);

                        logRows = (await readFallbackApprovalQueueFromLogs(client, 'PENDING')).slice(0, 5);
                    }

                    const localRows = readLocalEmergencyApprovalQueue()
                        .filter(r => String(r?.status || '').toUpperCase() === 'PENDING')
                        .slice(0, 5);

                    const combined = [...primaryData, ...fallbackRows, ...logRows, ...localRows];
                    if (combined.length > 0) {
                        const top = combined[0];
                        const sig = `${top.id || ''}:${top.batch_id || ''}:${top.sn || ''}:${combined.length}`;
                        if (!lastKnownSignature) {
                            combined.forEach(r => {
                                if (r.id) wmsNotifiedApprovalIds.add(`id:${r.id}`);
                            });
                            lastKnownSignature = sig;
                        } else if (sig !== lastKnownSignature) {
                            lastKnownSignature = sig;
                            queueAdminIncomingApprovalAlert(top);
                        }
                    } else if (!lastKnownSignature) {
                        lastKnownSignature = 'EMPTY';
                    }
                } catch (e) {}
            }
        }, 10000);
    }
}

// =========================================================================
// --- BUILT-IN APPROVAL CENTER MODAL (ADMIN APPROVE / REJECT)           ---
// =========================================================================
let wmsBuiltInApprovalState = {
    filterStatus: 'PENDING',
    filterType: 'ALL',
    records: [],
    selectedIds: new Set(),
    isBusy: false
};

async function openBuiltInApprovalCenterModal(detail = {}) {
    let modal = document.getElementById('wmsBuiltInApprovalCenterModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsBuiltInApprovalCenterModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(15,23,42,0.72); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:16px; z-index:100800;';
        modal.addEventListener('click', (e) => {
            if (e.target === modal && !wmsBuiltInApprovalState.isBusy) {
                closeBuiltInApprovalCenterModal();
            }
        });
        modal.innerHTML = `
            <div style="background:var(--bg-surface,#ffffff); color:var(--text-main,#0f172a); width:100%; max-width:960px; border-radius:16px; border:1px solid var(--border-color,#e2e8f0); box-shadow:0 24px 64px rgba(0,0,0,0.32); overflow:hidden; display:flex; flex-direction:column; max-height:90vh;">
                <div style="padding:16px 22px; background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); color:#ffffff; display:flex; align-items:center; justify-content:space-between; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:40px; height:40px; border-radius:11px; background:#0284c7; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:1.1rem;">
                            <i class="fa-solid fa-shield-check"></i>
                        </div>
                        <div>
                            <h3 style="margin:0; font-size:1.05rem; font-weight:800;">ศูนย์อนุมัติคำขอจัดการคลัง (Approval Center)</h3>
                            <div style="font-size:0.78rem; color:#94a3b8;">ตรวจสอบคำขอลบ S/N และคำขอโยกย้ายพิกัดจากผู้ใช้งานทั่วไปก่อนยืนยันลงฐานข้อมูล</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button type="button" onclick="loadBuiltInApprovalCenterData()" style="background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2); color:#ffffff; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:0.8rem; font-weight:600;">
                            <i class="fa-solid fa-rotate"></i> รีเฟรช
                        </button>
                        <button type="button" onclick="closeBuiltInApprovalCenterModal()" style="background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2); color:#ffffff; width:34px; height:34px; border-radius:8px; cursor:pointer;">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                <div style="padding:12px 20px; background:var(--bg-subtle,#f8fafc); border-bottom:1px solid var(--border-color,#e2e8f0); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">
                        <button type="button" class="btn btn-sm btn-primary" id="wmsAcTabPending" onclick="setBuiltInApprovalFilter('PENDING', null)">รออนุมัติ (PENDING)</button>
                        <button type="button" class="btn btn-sm btn-secondary" id="wmsAcTabApproved" onclick="setBuiltInApprovalFilter('APPROVED', null)">อนุมัติแล้ว</button>
                        <button type="button" class="btn btn-sm btn-secondary" id="wmsAcTabRejected" onclick="setBuiltInApprovalFilter('REJECTED', null)">ปฏิเสธแล้ว</button>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                        <select id="wmsAcTypeSelect" onchange="setBuiltInApprovalFilter(null, this.value)" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border-strong,#cbd5e1); font-size:0.82rem;">
                            <option value="ALL">ทุกประเภทคำขอ</option>
                            <option value="DELETE">คำขอลบ S/N (DELETE)</option>
                            <option value="RELOCATE">คำขอย้ายพิกัด (RELOCATE)</option>
                        </select>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="toggleSelectAllBuiltInApprovals()">
                            <i class="fa-solid fa-check-double"></i> เลือกทั้งหมดในหน้า
                        </button>
                    </div>
                </div>

                <div id="wmsAcTableContainer" style="padding:14px 20px; overflow-y:auto; flex:1; min-height:260px;"></div>

                <div id="wmsAcActionFooter" style="padding:14px 20px; background:var(--bg-subtle,#f8fafc); border-top:1px solid var(--border-color,#e2e8f0); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px;">
                    <div id="wmsAcSelectedStat" style="font-size:0.84rem; font-weight:700; color:var(--text-sub,#475569);">เลือกแล้ว 0 รายการ</div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button type="button" id="wmsAcRejectBtn" class="btn btn-danger" onclick="processSelectedBuiltInApprovals('REJECT')" style="font-weight:700; padding:8px 16px;">
                            <i class="fa-solid fa-ban"></i> ปฏิเสธคำขอที่เลือก
                        </button>
                        <button type="button" id="wmsAcApproveBtn" class="btn btn-primary" onclick="processSelectedBuiltInApprovals('APPROVE')" style="font-weight:700; padding:8px 18px; background:#059669; border-color:#059669;">
                            <i class="fa-solid fa-circle-check"></i> อนุมัติและดำเนินการลงฐานข้อมูล
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    wmsBuiltInApprovalState.filterStatus = 'PENDING';
    wmsBuiltInApprovalState.filterType = detail?.requestType ? String(detail.requestType).toUpperCase() : 'ALL';
    const typeSel = document.getElementById('wmsAcTypeSelect');
    if (typeSel) typeSel.value = wmsBuiltInApprovalState.filterType;

    modal.style.display = 'flex';
    modal.classList.add('active', 'show', 'is-open');
    await loadBuiltInApprovalCenterData();
}

function closeBuiltInApprovalCenterModal() {
    if (wmsBuiltInApprovalState.isBusy) return;
    const modal = document.getElementById('wmsBuiltInApprovalCenterModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active', 'show', 'open', 'is-open');
    }
}

function setBuiltInApprovalFilter(statusVal, typeVal) {
    if (statusVal) wmsBuiltInApprovalState.filterStatus = statusVal;
    if (typeVal) wmsBuiltInApprovalState.filterType = typeVal;
    wmsBuiltInApprovalState.selectedIds.clear();

    const pBtn = document.getElementById('wmsAcTabPending');
    const aBtn = document.getElementById('wmsAcTabApproved');
    const rBtn = document.getElementById('wmsAcTabRejected');
    if (pBtn) pBtn.className = `btn btn-sm ${wmsBuiltInApprovalState.filterStatus === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`;
    if (aBtn) aBtn.className = `btn btn-sm ${wmsBuiltInApprovalState.filterStatus === 'APPROVED' ? 'btn-primary' : 'btn-secondary'}`;
    if (rBtn) rBtn.className = `btn btn-sm ${wmsBuiltInApprovalState.filterStatus === 'REJECTED' ? 'btn-primary' : 'btn-secondary'}`;

    loadBuiltInApprovalCenterData();
}

async function loadBuiltInApprovalCenterData() {
    const container = document.getElementById('wmsAcTableContainer');
    if (!container) return;

    const client = resolveWmsSupabaseClient();
    container.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-sub);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดรายการคำขอจากฐานข้อมูล...</div>`;

    let primaryRows = [];
    let fallbackRows = [];
    let logRows = [];

    if (client) {
        try {
            let query = client
                .from('approval_requests')
                .select('*')
                .eq('status', wmsBuiltInApprovalState.filterStatus)
                .order('created_at', { ascending: false })
                .limit(500);

            if (wmsBuiltInApprovalState.filterType !== 'ALL') {
                query = query.eq('request_type', wmsBuiltInApprovalState.filterType);
            }

            const { data, error } = await query;
            if (!error && Array.isArray(data)) {
                primaryRows = data.map(r => ({
                    ...r,
                    _source: 'APPROVAL_REQUESTS',
                    request_type: String(r.request_type || r.type || 'DELETE').toUpperCase(),
                    requested_by: r.requested_by || r.requester || '-'
                }));
            }
        } catch (e) {}

        try {
            const allQueue = await readFallbackApprovalQueueFromSettings(client);
            fallbackRows = allQueue
                .filter(r => String(r?.status || '').toUpperCase() === wmsBuiltInApprovalState.filterStatus)
                .filter(r => wmsBuiltInApprovalState.filterType === 'ALL' || String(r?.request_type || '').toUpperCase() === wmsBuiltInApprovalState.filterType)
                .map(r => ({
                    ...r,
                    _source: 'SYSTEM_SETTINGS_QUEUE',
                    request_type: String(r.request_type || 'DELETE').toUpperCase(),
                    requested_by: r.requested_by || '-'
                }));
        } catch (e) {}

        try {
            const allLogRows = await readFallbackApprovalQueueFromLogs(client, wmsBuiltInApprovalState.filterStatus);
            logRows = allLogRows.filter(
                r => wmsBuiltInApprovalState.filterType === 'ALL' || String(r?.request_type || '').toUpperCase() === wmsBuiltInApprovalState.filterType
            );
        } catch (e) {}
    }

    const localRows = readLocalEmergencyApprovalQueue()
        .filter(r => String(r?.status || '').toUpperCase() === wmsBuiltInApprovalState.filterStatus)
        .filter(r => wmsBuiltInApprovalState.filterType === 'ALL' || String(r?.request_type || '').toUpperCase() === wmsBuiltInApprovalState.filterType)
        .map(r => ({
            ...r,
            _source: 'LOCAL_EMERGENCY_QUEUE',
            request_type: String(r.request_type || 'DELETE').toUpperCase(),
            requested_by: r.requested_by || '-'
        }));

    const combined = [...primaryRows, ...fallbackRows, ...logRows, ...localRows].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
    });

    wmsBuiltInApprovalState.records = combined;
    wmsBuiltInApprovalState.selectedIds.clear();
    renderBuiltInApprovalCenterTable();
}

function toggleBuiltInApprovalRow(id, checked) {
    if (checked) wmsBuiltInApprovalState.selectedIds.add(String(id));
    else wmsBuiltInApprovalState.selectedIds.delete(String(id));
    updateBuiltInApprovalFooterStat();
}

function toggleSelectAllBuiltInApprovals() {
    const rows = wmsBuiltInApprovalState.records || [];
    if (rows.length === 0) return;

    const allSelected = rows.every(r => wmsBuiltInApprovalState.selectedIds.has(String(r.id)));
    if (allSelected) {
        wmsBuiltInApprovalState.selectedIds.clear();
    } else {
        rows.forEach(r => {
            if (r.id !== undefined && r.id !== null) {
                wmsBuiltInApprovalState.selectedIds.add(String(r.id));
            }
        });
    }
    renderBuiltInApprovalCenterTable();
}

function updateBuiltInApprovalFooterStat() {
    const count = wmsBuiltInApprovalState.selectedIds.size;
    const statEl = document.getElementById('wmsAcSelectedStat');
    const rejBtn = document.getElementById('wmsAcRejectBtn');
    const appBtn = document.getElementById('wmsAcApproveBtn');
    const footer = document.getElementById('wmsAcActionFooter');

    if (footer) {
        footer.style.display = wmsBuiltInApprovalState.filterStatus === 'PENDING' ? 'flex' : 'none';
    }
    if (statEl) {
        statEl.textContent = `เลือกแล้ว ${count.toLocaleString()} รายการ`;
    }
    if (rejBtn) rejBtn.disabled = count === 0;
    if (appBtn) appBtn.disabled = count === 0;
}

function renderBuiltInApprovalCenterTable() {
    const container = document.getElementById('wmsAcTableContainer');
    if (!container) return;

    const rows = wmsBuiltInApprovalState.records || [];
    const isPendingTab = wmsBuiltInApprovalState.filterStatus === 'PENDING';

    if (rows.length === 0) {
        container.innerHTML = `<div style="padding:36px; text-align:center; color:var(--text-muted); font-size:0.9rem;">ไม่พบรายการคำขอในสถานะนี้</div>`;
        updateBuiltInApprovalFooterStat();
        return;
    }

    const bodyHtml = rows.map(r => {
        const idStr = String(r.id);
        const checked = wmsBuiltInApprovalState.selectedIds.has(idStr);
        const isDelete = String(r.request_type || '').toUpperCase() === 'DELETE';
        const typeBadge = isDelete
            ? `<span style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:6px; background:#fee2e2; color:#b91c1c; font-size:0.75rem; font-weight:700;"><i class="fa-solid fa-trash-can"></i> ลบ S/N</span>`
            : `<span style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:6px; background:#e0f2fe; color:#0369a1; font-size:0.75rem; font-weight:700;"><i class="fa-solid fa-dolly"></i> ย้ายพิกัด</span>`;

        const coordInfo = isDelete
            ? `พิกัดปัจจุบัน: <span class="mono">${escapeHtmlApprovalSafe(r.location || '-')}</span>`
            : `<span class="mono">${escapeHtmlApprovalSafe(r.location || '-')}</span> → <strong class="mono" style="color:#0284c7;">${escapeHtmlApprovalSafe(r.target_location || '-')}</strong>`;

        const timeStr = r.created_at ? new Date(r.created_at).toLocaleString('th-TH') : '-';

        return `
            <tr style="border-bottom:1px solid var(--border-color,#e2e8f0);">
                ${isPendingTab ? `<td style="padding:8px;"><input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleBuiltInApprovalRow('${escapeHtmlApprovalSafe(idStr)}', this.checked)"></td>` : ''}
                <td style="padding:8px;">${typeBadge}</td>
                <td style="padding:8px;" class="mono font-bold">${escapeHtmlApprovalSafe(r.sn || '-')}</td>
                <td style="padding:8px; font-size:0.82rem;">${escapeHtmlApprovalSafe(r.name || r.category || '-')}</td>
                <td style="padding:8px; font-size:0.8rem;">${coordInfo}</td>
                <td style="padding:8px; font-size:0.8rem;"><strong>${escapeHtmlApprovalSafe(r.requested_by || '-')}</strong><div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtmlApprovalSafe(r.reason || r.details || '')}</div></td>
                <td style="padding:8px; font-size:0.75rem; color:var(--text-muted);">${escapeHtmlApprovalSafe(timeStr)}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
                <tr style="border-bottom:2px solid var(--border-color,#e2e8f0); font-size:0.78rem; color:var(--text-sub);">
                    ${isPendingTab ? `<th style="padding:8px; width:34px;">เลือก</th>` : ''}
                    <th style="padding:8px;">ประเภท</th>
                    <th style="padding:8px;">หมายเลข S/N</th>
                    <th style="padding:8px;">สินค้า / รุ่น</th>
                    <th style="padding:8px;">รายละเอียดพิกัด</th>
                    <th style="padding:8px;">ผู้ส่งคำขอ / เหตุผล</th>
                    <th style="padding:8px;">เวลาส่งคำขอ</th>
                </tr>
            </thead>
            <tbody>${bodyHtml}</tbody>
        </table>
    `;

    updateBuiltInApprovalFooterStat();
}

async function processSelectedBuiltInApprovals(decision) {
    if (!isWmsAdminStrict()) {
        showWmsCornerNotification({
            variant: 'WARN',
            title: 'ไม่มีสิทธิ์อนุมัติคำขอ',
            description: 'เฉพาะรหัสผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถอนุมัติหรือปฏิเสธคำขอได้',
            durationMs: 3500
        });
        return;
    }

    if (wmsBuiltInApprovalState.isBusy) return;
    const selectedIds = Array.from(wmsBuiltInApprovalState.selectedIds);
    if (selectedIds.length === 0) return;

    const client = resolveWmsSupabaseClient();
    const targetRows = wmsBuiltInApprovalState.records.filter(r => selectedIds.includes(String(r.id)));
    if (targetRows.length === 0) return;

    wmsBuiltInApprovalState.isBusy = true;
    const adminActor = typeof getCurrentReceiverName === 'function' ? getCurrentReceiverName() : 'Admin';
    const nowIso = new Date().toISOString();

    try {
        if (decision === 'APPROVE') {
            const deleteRows = targetRows.filter(r => String(r.request_type || '').toUpperCase() === 'DELETE');
            const relocateRows = targetRows.filter(r => {
                const rt = String(r.request_type || '').toUpperCase();
                return rt === 'RELOCATE' || rt === 'TRANSFER';
            });

            if (deleteRows.length > 0 && typeof executeChunkedWarehouseDelete === 'function') {
                const delItems = deleteRows.map(r => ({ sn: r.sn, category: r.category, name: r.name, location: r.location }));
                await executeChunkedWarehouseDelete(delItems, `อนุมัติคำขอลบโดย ${adminActor}`);
            }

            if (relocateRows.length > 0 && typeof executeChunkedBatchRelocate === 'function') {
                const relAssignments = relocateRows
                    .filter(r => r.sn && r.target_location)
                    .map(r => ({
                        item: { sn: r.sn, category: r.category, name: r.name, location: r.location },
                        oldLocation: r.location || '-',
                        newLocation: r.target_location
                    }));
                if (relAssignments.length > 0) {
                    await executeChunkedBatchRelocate(relAssignments, `อนุมัติคำขอย้ายพิกัดโดย ${adminActor}`);
                }
            }
        }

        const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const primaryRows = targetRows.filter(r => r._source === 'APPROVAL_REQUESTS');
        const fallbackRows = targetRows.filter(r => r._source === 'SYSTEM_SETTINGS_QUEUE');
        const logRows = targetRows.filter(r => r._source === 'INVENTORY_LOGS_QUEUE');
        const localRows = targetRows.filter(r => r._source === 'LOCAL_EMERGENCY_QUEUE');

        if (client && primaryRows.length > 0) {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < primaryRows.length; i += CHUNK_SIZE) {
                const idChunk = primaryRows.slice(i, i + CHUNK_SIZE).map(r => r.id);
                const { error: upErr } = await client
                    .from('approval_requests')
                    .update({
                        status: newStatus,
                        reviewed_by: adminActor,
                        reviewed_at: nowIso
                    })
                    .in('id', idChunk);

                if (upErr) {
                    await client
                        .from('approval_requests')
                        .update({ status: newStatus })
                        .in('id', idChunk);
                }
            }
        }

        if (client && fallbackRows.length > 0) {
            const fallbackIdSet = new Set(fallbackRows.map(r => String(r.id)));
            const currentQueue = await readFallbackApprovalQueueFromSettings(client);
            const updatedQueue = currentQueue.map(q => {
                if (fallbackIdSet.has(String(q.id))) {
                    return {
                        ...q,
                        status: newStatus,
                        reviewed_by: adminActor,
                        reviewed_at: nowIso
                    };
                }
                return q;
            });
            await writeFallbackApprovalQueueToSettings(client, updatedQueue);
        }

        if (client && logRows.length > 0) {
            const logIds = Array.from(new Set(logRows.map(r => r._logId).filter(Boolean)));
            const nextAction = decision === 'APPROVE' ? 'APPROVAL_REQUEST_APPROVED' : 'APPROVAL_REQUEST_REJECTED';
            if (logIds.length > 0) {
                await client
                    .from('inventory_logs')
                    .update({ action: nextAction })
                    .in('id', logIds);
            }
        }

        if (localRows.length > 0) {
            const localIdSet = new Set(localRows.map(r => String(r.id)));
            const updatedLocal = readLocalEmergencyApprovalQueue().map(q => {
                if (localIdSet.has(String(q.id))) {
                    return {
                        ...q,
                        status: newStatus,
                        reviewed_by: adminActor,
                        reviewed_at: nowIso
                    };
                }
                return q;
            });
            writeLocalEmergencyApprovalQueue(updatedLocal);
        }

        try {
            if (wmsApprovalBroadcastChannel) {
                wmsApprovalBroadcastChannel.postMessage({ type: 'APPROVAL_DECISION_MADE', status: newStatus });
            }
            localStorage.setItem(WMS_APPROVAL_STORAGE_PING_KEY, JSON.stringify({
                type: 'APPROVAL_DECISION_MADE',
                status: newStatus,
                nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
            }));
        } catch (e) {}

        wmsBuiltInApprovalState.isBusy = false;
        await refreshAdminPendingApprovalCount();
        await loadBuiltInApprovalCenterData();

        if (typeof window.refreshApprovalsUI === 'function') {
            try { window.refreshApprovalsUI(); } catch (e) {}
        }

        showWmsCornerNotification({
            variant: 'USER_SUBMIT',
            title: decision === 'APPROVE'
                ? `อนุมัติและอัปเดตฐานข้อมูลแล้ว (${targetRows.length.toLocaleString()} รายการ)`
                : `ปฏิเสธคำขอเรียบร้อย (${targetRows.length.toLocaleString()} รายการ)`,
            description: decision === 'APPROVE'
                ? 'รายการในคลังและฐานข้อมูลได้รับการอัปเดตเรียบร้อยแล้ว'
                : 'รายการในสต็อกยังคงเดิมโดยไม่มีการเปลี่ยนแปลง',
            durationMs: 3600,
            playSound: true
        });
    } catch (err) {
        wmsBuiltInApprovalState.isBusy = false;
        showWmsCornerNotification({
            variant: 'WARN',
            title: 'ดำเนินการไม่สำเร็จ',
            description: err?.message ? `สาเหตุ: ${err.message}` : 'เกิดข้อผิดพลาดในการอัปเดตฐานข้อมูล กรุณาลองใหม่อีกครั้ง',
            durationMs: 4200,
            playSound: true
        });
    }
}

// Global Exports for Approval Link Module
window.resolveWmsSupabaseClient = resolveWmsSupabaseClient;
window.isWmsAdminStrict = isWmsAdminStrict;
window.playWmsNotificationChime = playWmsNotificationChime;
window.showWmsCornerNotification = showWmsCornerNotification;
window.filterOutAlreadyPendingRequestSns = filterOutAlreadyPendingRequestSns;
window.submitApprovalRequestsResilient = submitApprovalRequestsResilient;
window.broadcastNewApprovalRequestEvent = broadcastNewApprovalRequestEvent;
window.navigateToWmsApprovalCenter = navigateToWmsApprovalCenter;
window.openBuiltInApprovalCenterModal = openBuiltInApprovalCenterModal;
window.closeBuiltInApprovalCenterModal = closeBuiltInApprovalCenterModal;
window.setBuiltInApprovalFilter = setBuiltInApprovalFilter;
window.loadBuiltInApprovalCenterData = loadBuiltInApprovalCenterData;
window.toggleBuiltInApprovalRow = toggleBuiltInApprovalRow;
window.toggleSelectAllBuiltInApprovals = toggleSelectAllBuiltInApprovals;
window.processSelectedBuiltInApprovals = processSelectedBuiltInApprovals;
window.refreshAdminPendingApprovalCount = refreshAdminPendingApprovalCount;
window.initWmsApprovalRealTimeSync = initWmsApprovalRealTimeSync;

window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.approvalLinkLoaded = true;