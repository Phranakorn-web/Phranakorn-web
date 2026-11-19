// =========================================================================
// --- MODULE 6: APPROVAL REQUESTS DATABASE & REALTIME ENGINE (FAST 25 & ROLE GUARD) ---
// --- UPDATED: UNIFIED 5-TIER SYNC + INTERACTIVE ADMIN APPROVE/REJECT POPUP ---
// --- + AUTO OUTBOUND WORK ORDER WITH COMPANY LOGO & SIGNATURES ON APPROVAL ---
// =========================================================================

// Safe Escape HTML Helper Fallback (Secures against XSS vulnerabilities)
if (typeof escapeHTML !== 'function') {
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Dynamic Environment Configuration (Prevents exposing hardcoded Supabase Secrets in client JS)
const WMS_SUPABASE_URL = (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_URL) ? window.ENV.SUPABASE_URL : '';
const WMS_SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_ANON_KEY) ? window.ENV.SUPABASE_ANON_KEY : '';

let pendingApprovalsList = [];
let approvalStatusFilter = 'ALL';
let approvalTypeFilter = 'ALL';
let approvalRequesterFilter = 'ALL';
let approvalApproverFilter = 'ALL';
let approvalSearchQuery = '';
let approvalSortOrder = 'NEWEST'; // 'NEWEST' | 'OLDEST' | 'PENDING_FIRST'

// ค่าเริ่มต้น 25 รายการ เพื่อความรวดเร็วสูงสุดในการโหลดข้อมูล
let approvalDisplayLimit = (() => {
    try {
        const saved = sessionStorage.getItem('wms_approval_display_limit_v2');
        return saved ? (saved === 'ALL' ? 'ALL' : Number(saved) || 25) : 25;
    } catch (e) {
        return 25;
    }
})();

let selectedApprovalIds = new Set();
let lastApprovalsRenderSignature = '';
let isTTSMuted = (() => {
    try {
        return localStorage.getItem('wms_approval_tts_muted') === 'true';
    } catch (e) {
        return false;
    }
})();

let approvalPollingTimer = null;
let approvalRealtimeChannel = null;
let isInitialAdminSyncDone = false;
let lastKnownAdminRoleState = null;
let wmsAdminPopupActiveIndex = 0;
let wmsAdminPopupMinimized = false;
let wmsAdminPopupDismissedSignature = '';
let wmsSharedChimeAudioCtx = null;

const LOCAL_APPROVALS_KEY = 'wms_local_pending_approvals_v2';
const WMS_BRIDGE_LOCAL_QUEUE_KEY = 'WMS_LOCAL_APPROVAL_QUEUE_V2';
const WMS_BRIDGE_SETTINGS_KEY = 'wms_approval_requests_queue';
const WMS_BRIDGE_CHANNEL_NAME = 'WMS_APPROVAL_SYNC_CHANNEL_V2';
const WMS_BRIDGE_STORAGE_PING_KEY = 'WMS_APPROVAL_LATEST_PING_V2';
const TRACKED_STATUSES_SESSION_KEY = 'wms_tracked_request_statuses_v2';
const ADMIN_NOTIFIED_IDS_SESSION_KEY = 'wms_admin_notified_ids_v3';

let wmsApprovalsBridgeChannel = null;

// โหลดสถานะการติดตามคำขอจาก sessionStorage เพื่อไม่ให้แจ้งเตือนหลุดแม้ผู้ใช้รีเฟรชหน้าเว็บ
let userTrackedRequestStatuses = (() => {
    try {
        const saved = sessionStorage.getItem(TRACKED_STATUSES_SESSION_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        return {};
    }
})();

let adminNotifiedRequestIds = (() => {
    try {
        const saved = sessionStorage.getItem(ADMIN_NOTIFIED_IDS_SESSION_KEY);
        return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (e) {
        return new Set();
    }
})();

function persistTrackedStatuses() {
    try {
        sessionStorage.setItem(TRACKED_STATUSES_SESSION_KEY, JSON.stringify(userTrackedRequestStatuses));
    } catch (e) {}
}

function persistAdminNotifiedIds() {
    try {
        const arr = Array.from(adminNotifiedRequestIds).slice(-600);
        sessionStorage.setItem(ADMIN_NOTIFIED_IDS_SESSION_KEY, JSON.stringify(arr));
    } catch (e) {}
}

// 🟢 คงฟังก์ชัน preloadTTSVoices ไว้เพื่อความเข้ากันได้ 100% กับโค้ดส่วนอื่น
let availableTTSVoices = [];
function preloadTTSVoices() {
    if ('speechSynthesis' in window) {
        try {
            availableTTSVoices = window.speechSynthesis.getVoices();
        } catch (e) {}
    }
}
if ('speechSynthesis' in window) {
    preloadTTSVoices();
    window.speechSynthesis.onvoiceschanged = preloadTTSVoices;
}

// -------------------------------------------------------------------------
// 0. ตรวจสอบสถานะว่าผู้ใช้เข้าสู่ระบบสำเร็จแล้วหรือยัง (ป้องกัน False-Negative 100%)
// -------------------------------------------------------------------------
function isElementActuallyVisible(el) {
    if (!el) return false;
    try {
        if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
        if (el.classList.contains('hidden') || el.classList.contains('d-none') || el.classList.contains('is-hidden')) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    } catch (e) {
        return false;
    }
}

function resolveStoredUserObject() {
    const globalCandidates = [
        typeof currentUser !== 'undefined' ? currentUser : null,
        typeof window !== 'undefined' ? window.currentUser : null,
        typeof window !== 'undefined' ? window.loggedInUser : null,
        typeof window !== 'undefined' ? window.authUser : null,
        typeof window !== 'undefined' ? window.appUser : null,
        typeof window !== 'undefined' ? window.userProfile : null
    ];

    for (const candidate of globalCandidates) {
        if (candidate && typeof candidate === 'object' && Object.keys(candidate).length > 0) {
            return candidate;
        }
    }

    const storageKeys = [
        'WMS_CURRENT_USER',
        'currentUser',
        'user',
        'wms_user',
        'wms_current_user',
        'wms_auth_user',
        'loggedInUser',
        'authUser',
        'userData',
        'userProfile',
        'user_info',
        'profile'
    ];

    for (const key of storageKeys) {
        try {
            const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (raw && raw !== '{}' && raw !== 'null' && raw !== 'undefined') {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                    return parsed;
                }
            }
        } catch (e) {}
    }

    return null;
}

function isUserLoggedIn() {
    // 1. ตรวจสอบว่าหน้า Login หรือ Login Modal กำลังเปิดแสดงผลอยู่บนหน้าจอจริงหรือไม่
    const loginContainers = [
        document.getElementById('loginModal'),
        document.getElementById('loginView'),
        document.getElementById('loginSection'),
        document.getElementById('login-modal'),
        document.getElementById('authModal'),
        document.querySelector('.login-container'),
        document.querySelector('.login-box'),
        document.querySelector('#login-form')
    ].filter(Boolean);

    for (const box of loginContainers) {
        if (isElementActuallyVisible(box)) {
            return false;
        }
    }

    if (document.body && (document.body.classList.contains('login-page') || document.body.classList.contains('is-logged-out'))) {
        return false;
    }

    // 2. ตรวจสอบข้อมูลผู้ใช้ที่ล็อกอินอยู่ใน Memory หรือ Storage
    const userObj = resolveStoredUserObject();
    if (userObj && (userObj.id || userObj.username || userObj.email || userObj.name || userObj.role || userObj.user_role || userObj.userRole)) {
        return true;
    }

    try {
        const hasStandaloneRole =
            window.currentUserRole || window.userRole || window.WMS_CURRENT_ROLE ||
            localStorage.getItem('WMS_USER_ROLE') || localStorage.getItem('user_role') || localStorage.getItem('userRole') || localStorage.getItem('role') || localStorage.getItem('wms_role') ||
            sessionStorage.getItem('WMS_USER_ROLE') || sessionStorage.getItem('user_role') || sessionStorage.getItem('userRole') || sessionStorage.getItem('role') || sessionStorage.getItem('wms_role');
        const hasStandaloneUsername =
            localStorage.getItem('username') || localStorage.getItem('user_name') || localStorage.getItem('WMS_USERNAME') ||
            sessionStorage.getItem('username') || sessionStorage.getItem('user_name') || sessionStorage.getItem('WMS_USERNAME');
        if (hasStandaloneRole || hasStandaloneUsername) {
            return true;
        }
    } catch (e) {}

    // 3. ตรวจสอบโครงสร้างหน้าหลักของแอปพลิเคชันที่เปิดใช้งานอยู่
    const appShell = document.getElementById('app-content') || document.getElementById('sidebar') || document.querySelector('.main-content') || document.getElementById('view-approvals');
    if (appShell) {
        return true;
    }

    return false;
}

// -------------------------------------------------------------------------
// 1. ระบบตรวจจับสิทธิ์ Admin / ผู้ควบคุมดูแลเว็บ vs User ทั่วไป (Dynamic Role Guard 100%)
// -------------------------------------------------------------------------
function getCurrentUserIdentity() {
    const userObj = resolveStoredUserObject() || {};

    let fallbackUsername = '';
    let fallbackName = '';
    try {
        fallbackUsername = localStorage.getItem('WMS_USERNAME') || localStorage.getItem('username') || sessionStorage.getItem('WMS_USERNAME') || sessionStorage.getItem('username') || '';
        fallbackName = localStorage.getItem('user_name') || localStorage.getItem('displayName') || sessionStorage.getItem('user_name') || '';
    } catch (e) {}

    const username = String(
        userObj.username || userObj.user_name || userObj.login || userObj.email || userObj.id || fallbackUsername || 'user'
    ).trim();

    const name = String(
        userObj.name || userObj.full_name || userObj.fullname || userObj.displayName || userObj.display_name || fallbackName || username || 'User General'
    ).trim();

    const rawRole = String(
        userObj.role || userObj.user_role || userObj.userRole || userObj.type || userObj.role_name || userObj.position || userObj.level || ''
    ).trim();

    return { userObj, username, name, rawRole };
}

function getUserRoleClassification() {
    if (!isUserLoggedIn()) {
        return {
            isLoggedIn: false,
            isAdmin: false,
            isGeneralUser: false,
            roleCode: 'GUEST',
            roleLabel: 'ยังไม่เข้าสู่ระบบ'
        };
    }

    const { userObj, username, rawRole } = getCurrentUserIdentity();

    let storageRole = '';
    let storageIsAdmin = '';
    try {
        storageRole = String(
            window.currentUserRole ||
            window.userRole ||
            window.WMS_CURRENT_ROLE ||
            localStorage.getItem('WMS_USER_ROLE') ||
            localStorage.getItem('user_role') ||
            localStorage.getItem('userRole') ||
            localStorage.getItem('role') ||
            localStorage.getItem('wms_role') ||
            sessionStorage.getItem('WMS_USER_ROLE') ||
            sessionStorage.getItem('user_role') ||
            sessionStorage.getItem('userRole') ||
            sessionStorage.getItem('role') ||
            sessionStorage.getItem('wms_role') || ''
        ).toLowerCase().trim();

        storageIsAdmin = String(
            localStorage.getItem('isAdmin') ||
            localStorage.getItem('is_admin') ||
            sessionStorage.getItem('isAdmin') ||
            sessionStorage.getItem('is_admin') || ''
        ).toLowerCase().trim();
    } catch (e) {}

    const combinedRole = (rawRole || storageRole || '').toLowerCase().trim();
    const unameLower = String(username || '').toLowerCase().trim();

    // 1. ตรวจสอบ Flag boolean ชัดเจนก่อน
    if (userObj.isAdmin === false || userObj.is_admin === false || storageIsAdmin === 'false' || storageIsAdmin === '0') {
        return {
            isLoggedIn: true,
            isAdmin: false,
            isGeneralUser: true,
            roleCode: 'USER',
            roleLabel: 'ผู้ใช้งานทั่วไป (General User)'
        };
    }

    if (userObj.isAdmin === true || userObj.is_admin === true || storageIsAdmin === 'true' || storageIsAdmin === '1') {
        return {
            isLoggedIn: true,
            isAdmin: true,
            isGeneralUser: false,
            roleCode: 'ADMIN',
            roleLabel: 'ผู้ดูแลระบบ / ผู้อนุมัติ (Admin)'
        };
    }

    // 2. คัดกรองรหัสสิทธิ์ User ทั่วไปอย่างเข้มงวด -> ต้องส่งคำขออนุมัติทุกกรณี 100%
    const generalUserKeywords = [
        'user', 'general', 'staff', 'operator', 'employee', 'worker',
        'warehouse_staff', 'picker', 'packer', 'scanner', 'member', 'viewer',
        'ทั่วไป', 'ผู้ใช้งานทั่วไป', 'พนักงาน', 'เจ้าหน้าที่คลัง'
    ];

    if (combinedRole && generalUserKeywords.some(k => combinedRole === k || combinedRole.includes(k))) {
        return {
            isLoggedIn: true,
            isAdmin: false,
            isGeneralUser: true,
            roleCode: 'USER',
            roleLabel: 'ผู้ใช้งานทั่วไป (General User)'
        };
    }

    // 3. คัดกรองรหัสสิทธิ์ผู้ดูแลระบบ / แอดมิน / ผู้อนุมัติ -> ทำงานได้ทุกอย่างทันทีไม่ต้องขออนุมัติ
    const adminKeywords = [
        'admin', 'superadmin', 'super_admin', 'administrator', 'webmaster',
        'owner', 'approver', 'manager', 'supervisor', 'director', 'head',
        'ผู้ดูแลระบบ', 'ผู้ควบคุมดูแล', 'แอดมิน', 'ผู้อนุมัติ', 'หัวหน้าคลัง'
    ];

    if (
        (combinedRole && adminKeywords.some(k => combinedRole === k || combinedRole.includes(k))) ||
        unameLower === 'admin' ||
        unameLower === 'superadmin' ||
        unameLower === 'administrator' ||
        unameLower === 'webmaster'
    ) {
        return {
            isLoggedIn: true,
            isAdmin: true,
            isGeneralUser: false,
            roleCode: 'ADMIN',
            roleLabel: 'ผู้ดูแลระบบ / ผู้อนุมัติ (Admin)'
        };
    }

    // 4. Default Safe Policy: หากไม่ระบุสิทธิ์เป็น Admin ชัดเจน ให้ถือเป็น User ทั่วไปเสมอ เพื่อความปลอดภัยสูงสุด
    return {
        isLoggedIn: true,
        isAdmin: false,
        isGeneralUser: true,
        roleCode: 'USER',
        roleLabel: 'ผู้ใช้งานทั่วไป (General User)'
    };
}

function isCurrentUserAdmin() {
    return getUserRoleClassification().isAdmin;
}

function isCurrentUserGeneralUser() {
    const info = getUserRoleClassification();
    return info.isLoggedIn && !info.isAdmin;
}

// ปลดล็อกระบบเสียง Web Audio API ทันทีเมื่อผู้ใช้แตะหรือคลิกหน้าจอ
function unlockWmsApprovalsAudio() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!wmsSharedChimeAudioCtx) {
            wmsSharedChimeAudioCtx = new AudioCtx();
        }
        if (wmsSharedChimeAudioCtx.state === 'suspended') {
            wmsSharedChimeAudioCtx.resume().catch(() => {});
        }
        return wmsSharedChimeAudioCtx;
    } catch (e) {
        return null;
    }
}

document.addEventListener('pointerdown', unlockWmsApprovalsAudio, { passive: true });
document.addEventListener('keydown', unlockWmsApprovalsAudio, { passive: true });

// 🟢 เสียงกระดิ่งแจ้งเตือนสังเคราะห์ Web Audio API (ไม่มีเสียงพูดคนหรือเสียง AI)
function playNotificationChime(toneType = 'info') {
    if (!isUserLoggedIn() || isTTSMuted) return;
    try {
        const ctx = unlockWmsApprovalsAudio();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const playTone = (freq, startOffset, duration, peakGain = 0.14, wave = 'sine') => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = wave;
            osc.frequency.setValueAtTime(freq, now + startOffset);
            gain.gain.setValueAtTime(0.0001, now + startOffset);
            gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + startOffset);
            osc.stop(now + startOffset + duration + 0.02);
        };

        if (toneType === 'warning') {
            // เสียงกระดิ่ง 3 โทนใสสำหรับคำขอใหม่เข้าศูนย์อนุมัติ Admin
            playTone(783.99, 0.00, 0.20, 0.15, 'sine');      // G5
            playTone(987.77, 0.10, 0.22, 0.16, 'sine');      // B5
            playTone(1318.51, 0.20, 0.34, 0.18, 'triangle'); // E6
        } else if (toneType === 'success') {
            playTone(587.33, 0.00, 0.18, 0.13, 'sine');      // D5
            playTone(880.00, 0.11, 0.28, 0.15, 'sine');      // A5
        } else if (toneType === 'danger') {
            playTone(440.00, 0.00, 0.18, 0.13, 'triangle');  // A4
            playTone(349.23, 0.13, 0.24, 0.13, 'triangle');  // F4
        } else {
            playTone(659.25, 0.00, 0.22, 0.13, 'sine');      // E5
        }
    } catch (e) {
        // Safe Catch
    }
}

// 🟢 เล่นเสียงเอฟเฟกต์แจ้งเตือนทันที (ตัดเสียงพูดคนและเสียง AI ออกทั้งหมด)
function playTTSNotification(text, toneType = 'info') {
    if (!isUserLoggedIn() || isTTSMuted) return;
    playNotificationChime(toneType);
}

// 🟢 ระบบ Auto-Refresh หน้ารายการสินค้าอัตโนมัติเมื่อมีความเปลี่ยนแปลง
function triggerAutoUIRefresh() {
    if (!isUserLoggedIn()) return;
    try {
        if (typeof loadInventoryFromDB === 'function') loadInventoryFromDB(true);
        if (typeof loadDataFromDatabase === 'function') loadDataFromDatabase();
        if (typeof fetchInventoryData === 'function') fetchInventoryData();
        if (typeof renderStockTable === 'function') renderStockTable();
        if (typeof refreshWarehouseUI === 'function') refreshWarehouseUI();
        if (typeof renderWarehouseMap === 'function') renderWarehouseMap();
        if (typeof loadOutboundHistory === 'function') loadOutboundHistory();
        if (typeof loadRecentOutboundFeedFromDB === 'function') loadRecentOutboundFeedFromDB();
    } catch(e) {
        // Safe Catch
    }
}

// 🟢 ดึงหรือสร้าง Supabase Client 100% (Secure Instance Retrieval)
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase && typeof _supabase.from === 'function') return _supabase;
    if (window._supabase && typeof window._supabase.from === 'function') return window._supabase;
    if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') return window.supabaseClient;
    if (window.sbClient && typeof window.sbClient.from === 'function') return window.sbClient;
    if (window.dbClient && typeof window.dbClient.from === 'function') return window.dbClient;

    try {
        const sbLib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
        if (sbLib && typeof sbLib.createClient === 'function' && WMS_SUPABASE_URL && WMS_SUPABASE_ANON_KEY) {
            window._supabase = sbLib.createClient(WMS_SUPABASE_URL, WMS_SUPABASE_ANON_KEY);
            return window._supabase;
        }
    } catch(e) {
        // Safe catch to protect credentials and connection errors
    }
    return null;
}

function getLocalApprovalsStore() {
    try {
        const stored = localStorage.getItem(LOCAL_APPROVALS_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch(e) { return []; }
}

function saveLocalApprovalsStore(data) {
    try {
        const trimmed = Array.isArray(data) ? data.slice(0, 800) : [];
        localStorage.setItem(LOCAL_APPROVALS_KEY, JSON.stringify(trimmed));
    } catch(e) {}
}

function getBridgeLocalQueueStore() {
    try {
        const stored = localStorage.getItem(WMS_BRIDGE_LOCAL_QUEUE_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveBridgeLocalQueueStore(data) {
    try {
        const trimmed = Array.isArray(data) ? data.slice(0, 2500) : [];
        localStorage.setItem(WMS_BRIDGE_LOCAL_QUEUE_KEY, JSON.stringify(trimmed));
    } catch (e) {}
}

// =========================================================================
// --- 1.1 UNIFIED 5-TIER DATA READER & NORMALIZER (BRIDGE + DB MERGE)   ---
// =========================================================================
function normalizeActionType(rawType) {
    const t = String(rawType || 'OTHER').toUpperCase().trim();
    if (t === 'OUTBOUND' || t === 'WITHDRAW' || t === 'ISSUE' || t.includes('เบิก') || t.includes('จ่าย')) return 'DISPATCH';
    if (t === 'MOVE' || t === 'RELOCATE' || t.includes('ย้าย')) return 'TRANSFER';
    if (t === 'REMOVE' || t.includes('ลบ')) return 'DELETE';
    if (t === 'UPDATE' || t.includes('แก้ไข')) return 'EDIT';
    return t;
}

function normalizeAndGroupUnifiedRecords(rawRows) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

    const groupedMap = new Map();

    rawRows.forEach((raw) => {
        if (!raw) return;

        const normStatus = String(raw.status || 'PENDING').toUpperCase().trim();
        const normType = normalizeActionType(raw.request_type || raw.type || 'DELETE');
        const sourceTag = raw._source || 'APPROVAL_REQUESTS';
        const batchId = String(raw.batch_id || (raw.payload && raw.payload.batch_id) || '').trim();

        const rawSns = Array.isArray(raw.target_sns)
            ? raw.target_sns
            : (raw.sn ? [raw.sn] : (raw.target_sns ? [raw.target_sns] : []));
        const cleanSns = rawSns.map(s => String(s || '').trim()).filter(Boolean);

        const reqUser = String(raw.requester_username || raw.requested_by || raw.requester || raw.requester_name || 'user').trim();
        const reqName = String(raw.requester_name || raw.requested_by || raw.requester || reqUser).trim();
        const targetLoc = String(
            raw.target_location ||
            (raw.payload && (raw.payload.target_location || raw.payload.new_location || raw.payload.location)) ||
            ''
        ).trim();
        const srcLoc = String(raw.location || (raw.payload && raw.payload.source_location) || '').trim();
        const itemName = String(raw.name || raw.category || (raw.payload && (raw.payload.name || raw.payload.category)) || '').trim();
        const reasonTxt = String(raw.reason || raw.details || '').trim();
        const extractedOutboundPayload = raw.outbound_order_payload || (raw.payload && raw.payload.outbound_order_payload) || undefined;

        let descText = String(raw.description || '').trim();
        if (!descText) {
            const typeMeta = getRequestTypeMeta(normType);
            const parts = [typeMeta.label];
            if (itemName) parts.push(`รุ่น/สินค้า: ${itemName}`);
            if (targetLoc) parts.push(`ไปยังพิกัด ${targetLoc}`);
            else if (srcLoc) parts.push(`จากพิกัด ${srcLoc}`);
            if (reasonTxt) parts.push(`(${reasonTxt})`);
            descText = parts.join(' • ');
        }

        // Group items sharing the same batch_id + request_type + status so bulk user submissions appear as 1 clean card/row
        const groupKey = batchId ? `BATCH::${batchId}::${normType}::${normStatus}` : `SINGLE::${sourceTag}::${String(raw.id)}`;

        if (!groupedMap.has(groupKey)) {
            const itemMetaMap = {};
            cleanSns.forEach(sn => {
                itemMetaMap[sn] = {
                    sn,
                    category: raw.category || '',
                    name: raw.name || itemName || '',
                    location: srcLoc || '',
                    target_location: targetLoc || ''
                };
            });

            groupedMap.set(groupKey, {
                id: batchId ? `BATCH_${batchId}` : String(raw.id),
                batch_id: batchId || null,
                requester_username: reqUser,
                requester_name: reqName,
                request_type: normType,
                description: descText,
                target_sns: [...cleanSns],
                payload: {
                    ...(raw.payload && typeof raw.payload === 'object' ? raw.payload : {}),
                    target_location: targetLoc || undefined,
                    source_location: srcLoc || undefined,
                    category: raw.category || undefined,
                    name: itemName || undefined,
                    reason: reasonTxt || undefined,
                    batch_id: batchId || undefined,
                    outbound_order_payload: extractedOutboundPayload,
                    itemMetaMap
                },
                status: normStatus,
                approved_by: raw.approved_by || raw.reviewed_by || null,
                created_at: raw.created_at || new Date().toISOString(),
                updated_at: raw.updated_at || raw.reviewed_at || raw.created_at || new Date().toISOString(),
                _sources: new Set([sourceTag]),
                _primaryRowIds: sourceTag === 'APPROVAL_REQUESTS' && raw.id !== undefined ? [raw.id] : [],
                _settingsQueueIds: sourceTag === 'SYSTEM_SETTINGS_QUEUE' && raw.id !== undefined ? [String(raw.id)] : [],
                _logRowIds: sourceTag === 'INVENTORY_LOGS_QUEUE' && raw._logId !== undefined ? [raw._logId] : [],
                _localBridgeIds: sourceTag === 'LOCAL_EMERGENCY_QUEUE' && raw.id !== undefined ? [String(raw.id)] : [],
                _localLegacyIds: sourceTag === 'LEGACY_LOCAL_STORE' && raw.id !== undefined ? [String(raw.id)] : []
            });
        } else {
            const existing = groupedMap.get(groupKey);
            existing._sources.add(sourceTag);

            if (sourceTag === 'APPROVAL_REQUESTS' && raw.id !== undefined && !existing._primaryRowIds.includes(raw.id)) {
                existing._primaryRowIds.push(raw.id);
            }
            if (sourceTag === 'SYSTEM_SETTINGS_QUEUE' && raw.id !== undefined && !existing._settingsQueueIds.includes(String(raw.id))) {
                existing._settingsQueueIds.push(String(raw.id));
            }
            if (sourceTag === 'INVENTORY_LOGS_QUEUE' && raw._logId !== undefined && !existing._logRowIds.includes(raw._logId)) {
                existing._logRowIds.push(raw._logId);
            }
            if (sourceTag === 'LOCAL_EMERGENCY_QUEUE' && raw.id !== undefined && !existing._localBridgeIds.includes(String(raw.id))) {
                existing._localBridgeIds.push(String(raw.id));
            }
            if (sourceTag === 'LEGACY_LOCAL_STORE' && raw.id !== undefined && !existing._localLegacyIds.includes(String(raw.id))) {
                existing._localLegacyIds.push(String(raw.id));
            }

            if (extractedOutboundPayload && existing.payload && !existing.payload.outbound_order_payload) {
                existing.payload.outbound_order_payload = extractedOutboundPayload;
            }

            cleanSns.forEach(sn => {
                if (!existing.target_sns.includes(sn)) {
                    existing.target_sns.push(sn);
                }
                if (existing.payload && existing.payload.itemMetaMap) {
                    existing.payload.itemMetaMap[sn] = {
                        sn,
                        category: raw.category || '',
                        name: raw.name || itemName || '',
                        location: srcLoc || '',
                        target_location: targetLoc || ''
                    };
                }
            });

            if (raw.created_at && new Date(raw.created_at) > new Date(existing.created_at)) {
                existing.created_at = raw.created_at;
            }
            if (!existing.approved_by && (raw.approved_by || raw.reviewed_by)) {
                existing.approved_by = raw.approved_by || raw.reviewed_by;
            }
        }
    });

    // Build readable descriptions for grouped multi-SN items
    const finalized = Array.from(groupedMap.values()).map(item => {
        if (item.batch_id && item.target_sns.length > 1) {
            const typeMeta = getRequestTypeMeta(item.request_type);
            const targetLoc = item.payload?.target_location;
            const itemName = item.payload?.name;
            const reasonTxt = item.payload?.reason;
            const parts = [`${typeMeta.label} (${item.target_sns.length.toLocaleString('th-TH')} รายการ)`];
            if (itemName) parts.push(`รุ่น: ${itemName}`);
            if (targetLoc) parts.push(`→ พิกัด ${targetLoc}`);
            if (reasonTxt) parts.push(`(${reasonTxt})`);
            item.description = parts.join(' • ');
        }
        return item;
    });

    return finalized.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

async function readBridgeSettingsQueue(client) {
    if (!client) return [];
    try {
        const { data, error } = await client
            .from('system_settings')
            .select('value')
            .eq('key', WMS_BRIDGE_SETTINGS_KEY)
            .limit(1);
        if (error || !Array.isArray(data) || data.length === 0 || !data[0]?.value) return [];
        let parsed = data[0].value;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(r => ({ ...r, _source: 'SYSTEM_SETTINGS_QUEUE' }));
    } catch (e) {
        return [];
    }
}

async function writeBridgeSettingsQueue(client, list) {
    if (!client) return;
    const trimmed = Array.isArray(list) ? list.slice(0, 2500) : [];
    const { data: existingRows, error: selErr } = await client
        .from('system_settings')
        .select('key')
        .eq('key', WMS_BRIDGE_SETTINGS_KEY)
        .limit(1);
    if (selErr) return;

    if (Array.isArray(existingRows) && existingRows.length > 0) {
        const { error: upErr } = await client
            .from('system_settings')
            .update({ value: trimmed })
            .eq('key', WMS_BRIDGE_SETTINGS_KEY);
        if (upErr) {
            await client
                .from('system_settings')
                .update({ value: JSON.stringify(trimmed) })
                .eq('key', WMS_BRIDGE_SETTINGS_KEY);
        }
    } else {
        const { error: insErr } = await client
            .from('system_settings')
            .insert([{ key: WMS_BRIDGE_SETTINGS_KEY, value: trimmed }]);
        if (insErr) {
            await client
                .from('system_settings')
                .insert([{ key: WMS_BRIDGE_SETTINGS_KEY, value: JSON.stringify(trimmed) }]);
        }
    }
}

async function readBridgeInventoryLogsQueue(client, fetchLimit = 400) {
    if (!client) return [];
    try {
        const { data, error } = await client
            .from('inventory_logs')
            .select('*')
            .in('action', ['APPROVAL_REQUEST_PENDING', 'APPROVAL_REQUEST_APPROVED', 'APPROVAL_REQUEST_REJECTED'])
            .order('created_at', { ascending: false })
            .limit(fetchLimit);

        if (error || !Array.isArray(data)) return [];

        const unpacked = [];
        data.forEach(logRow => {
            try {
                const rawDetails = String(logRow.details || '');
                const markerIdx = rawDetails.indexOf('WMS_REQ_JSON:');
                if (markerIdx === -1) return;
                const payloadObj = JSON.parse(rawDetails.slice(markerIdx + 'WMS_REQ_JSON:'.length));
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
                        request_type: payloadObj.request_type || it.request_type || 'DELETE',
                        batch_id: payloadObj.batch_id || it.batch_id || '',
                        sn: it.sn || '',
                        category: it.category || '',
                        name: it.name || '',
                        location: it.location || '',
                        target_location: it.target_location || '',
                        requested_by: payloadObj.requested_by || logRow.performed_by || 'User',
                        reason: payloadObj.reason || '',
                        outbound_order_payload: payloadObj.outbound_order_payload || it.outbound_order_payload || undefined,
                        status: derivedStatus,
                        created_at: logRow.created_at || payloadObj.created_at
                    });
                });
            } catch (ignore) {}
        });

        return unpacked;
    } catch (e) {
        return [];
    }
}

function mergeDbAndLocalApprovals(dbRows, localRows) {
    // Combine all sources and deduplicate resolved statuses (DB status overrides older PENDING local cache)
    const statusByBatchOrId = new Map();

    (Array.isArray(dbRows) ? dbRows : []).forEach(r => {
        if (!r) return;
        const st = String(r.status || 'PENDING').toUpperCase();
        if (r.id !== undefined && r.id !== null) statusByBatchOrId.set(`ID:${r.id}`, st);
        if (r.batch_id) statusByBatchOrId.set(`BATCH:${r.batch_id}`, st);
    });

    const filteredLocal = (Array.isArray(localRows) ? localRows : []).filter(r => {
        if (!r) return false;
        const dbIdStatus = r.id !== undefined ? statusByBatchOrId.get(`ID:${r.id}`) : null;
        const dbBatchStatus = r.batch_id ? statusByBatchOrId.get(`BATCH:${r.batch_id}`) : null;
        // If DB already recorded APPROVED/REJECTED for this ID or batch, drop stale PENDING local entry
        if ((dbIdStatus && dbIdStatus !== 'PENDING') || (dbBatchStatus && dbBatchStatus !== 'PENDING')) {
            return false;
        }
        return true;
    });

    return normalizeAndGroupUnifiedRecords([...(Array.isArray(dbRows) ? dbRows : []), ...filteredLocal]);
}

// =========================================================================
// --- 1.15 HELPERS สร้างใบงานจ่ายสินค้าพร้อมโลโก้และลายเซ็น (OUTBOUND WORK ORDER) ---
// =========================================================================
function getSavedCompanyProfileForWorkOrder() {
    if (typeof loadOutboundCompanyProfile === 'function') {
        try {
            return loadOutboundCompanyProfile();
        } catch (e) {}
    }
    try {
        const raw = localStorage.getItem('WMS_OUTBOUND_COMPANY_PROFILE');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return {
                    company_title: parsed.company_title || 'คลังสินค้าหลัก (Main Warehouse)',
                    company_address: parsed.company_address || '',
                    company_phone_tax: parsed.company_phone_tax || '',
                    logo_data_url: parsed.logo_data_url || ''
                };
            }
        }
    } catch (e) {}
    return {
        company_title: 'คลังสินค้าหลัก (Main Warehouse)',
        company_address: '',
        company_phone_tax: '',
        logo_data_url: ''
    };
}

function parseOutboundNameQtyUnit(rawName, fallbackUnit = 'ชิ้น') {
    const text = String(rawName || '').trim();
    const match = text.match(/^(.*?)\s*\((\d+)\s*([^)]+)\)\s*$/);
    if (match) {
        return {
            model: match[1].trim() || text,
            qty: parseInt(match[2], 10) || 1,
            unit: match[3].trim() || fallbackUnit
        };
    }
    return {
        model: text || '-',
        qty: 1,
        unit: fallbackUnit
    };
}

function extractOutboundRefDocFromText(text) {
    const str = String(text || '');
    const match = str.match(/อ้างอิง\s*(?:PO\/ใบเบิก|ใบเบิก\/PO|PO)\s*:\s*([^\]|·]+)/i);
    return match ? match[1].trim() : '';
}

function buildApprovedOutboundWorkOrderPayload(cleanSns, payloadData = {}, actorName = 'admin', nowIso = new Date().toISOString()) {
    const draft = (payloadData.outbound_order_payload && typeof payloadData.outbound_order_payload === 'object')
        ? payloadData.outbound_order_payload
        : {};
    const savedProfile = getSavedCompanyProfileForWorkOrder();
    const itemMetaMap = (payloadData && payloadData.itemMetaMap) || {};

    const doNo = draft.do_number || payloadData.batch_id || (
        'DO-' +
        new Date().getFullYear() +
        String(new Date().getMonth() + 1).padStart(2, '0') +
        String(new Date().getDate()).padStart(2, '0') +
        '-' +
        Math.floor(1000 + Math.random() * 9000)
    );

    const draftItemsBySn = new Map();
    if (Array.isArray(draft.items)) {
        draft.items.forEach(item => {
            if (item && item.sn) {
                draftItemsBySn.set(String(item.sn).trim().toUpperCase(), item);
            }
        });
    }

    const finalItems = cleanSns.map((sn, idx) => {
        const snUpper = String(sn || '').trim().toUpperCase();
        const matchedDraft = draftItemsBySn.get(snUpper);
        const meta = itemMetaMap[sn] || {};
        const stockMatch = typeof findActiveStockItemBySn === 'function' ? findActiveStockItemBySn(snUpper) : null;
        const fallbackUnit = typeof inferOutboundItemUnit === 'function'
            ? inferOutboundItemUnit(stockMatch || meta)
            : 'ชิ้น';
        const parsedFromName = parseOutboundNameQtyUnit(meta.name || payloadData.name || '', fallbackUnit);

        const modelName = (matchedDraft && (matchedDraft.model || matchedDraft.name)) ||
                          (stockMatch && typeof inferOutboundItemModel === 'function' ? inferOutboundItemModel(stockMatch) : '') ||
                          parsedFromName.model;
        const qtyVal = (matchedDraft && parseInt(matchedDraft.qty, 10)) || parsedFromName.qty || 1;
        const unitVal = (matchedDraft && matchedDraft.unit) || parsedFromName.unit || 'ชิ้น';

        return {
            no: idx + 1,
            id: (matchedDraft && matchedDraft.id) || (stockMatch && stockMatch.id) || null,
            sn: sn,
            category: (matchedDraft && matchedDraft.category) || meta.category || payloadData.category || (stockMatch && stockMatch.category) || 'ทั่วไป',
            name: modelName,
            model: modelName,
            qty: qtyVal,
            unit: unitVal,
            meter: (matchedDraft && matchedDraft.meter) || (stockMatch && stockMatch.meter) || 0,
            location: (matchedDraft && matchedDraft.location) || meta.location || payloadData.source_location || (stockMatch && stockMatch.location) || 'DOCK'
        };
    });

    const totalQty = finalItems.reduce((sum, i) => sum + (parseInt(i.qty, 10) || 1), 0);
    const refDocNo = draft.ref_doc_no || extractOutboundRefDocFromText(payloadData.reason || payloadData.description || '');

    return {
        do_number: doNo,
        ref_doc_no: refDocNo,
        ref_project: draft.ref_project || '',
        company_title: draft.company_title || savedProfile.company_title || 'คลังสินค้าหลัก (Main Warehouse)',
        company_address: draft.company_address || savedProfile.company_address || '',
        company_phone_tax: draft.company_phone_tax || savedProfile.company_phone_tax || '',
        company_logo: draft.company_logo || savedProfile.logo_data_url || '',
        customer_name: draft.customer_name || payloadData.target_location || payloadData.recipient || '',
        customer_address: draft.customer_address || '',
        contact_person: draft.contact_person || '',
        salesperson: draft.salesperson || '',
        dispatcher: draft.dispatcher || payloadData.requester_name || actorName || 'เจ้าหน้าที่คลังสินค้า',
        receiver: draft.receiver || payloadData.receiver || '',
        dispatcher_signature: draft.dispatcher_signature || '',
        receiver_signature: draft.receiver_signature || '',
        destination_notes: draft.destination_notes || payloadData.reason || payloadData.description || '',
        show_original_location: Boolean(draft.show_original_location),
        items: finalItems,
        total_items: finalItems.length,
        total_qty: totalQty,
        created_at: nowIso
    };
}

function previewOutboundWorkOrderFromApproval(id) {
    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;
    const cleanSns = Array.isArray(req.target_sns) ? req.target_sns : [];
    const workOrder = buildApprovedOutboundWorkOrderPayload(cleanSns, {
        ...(req.payload || {}),
        batch_id: req.batch_id,
        requester_name: req.requester_name || req.requester_username,
        description: req.description
    }, req.approved_by || 'Admin', req.updated_at || req.created_at || new Date().toISOString());

    if (typeof openOutboundWorkOrderModal === 'function') {
        openOutboundWorkOrderModal(workOrder, req.status === 'PENDING');
    } else if (typeof showToast === 'function') {
        showToast('⚠️ โมดูลแสดงใบงานจ่ายสินค้า (outbound-db.js) ยังไม่ถูกโหลดในหน้านี้', true);
    }
}

// -------------------------------------------------------------------------
// 1.2 ตัวประมวลผลคำสั่งคลังสินค้า (เบิกออก / ย้ายพิกัด / ลบ / แก้ไข)
// ใช้ร่วมกันทั้งกรณี Admin ทำทันที และกรณี Admin กดอนุมัติคำขอของ User
// -------------------------------------------------------------------------
async function executeDirectWarehouseMutation(type, targetSns, payloadData = {}, actorName = 'admin') {
    const normalizedType = normalizeActionType(type);
    const cleanSns = Array.isArray(targetSns)
        ? targetSns.filter(s => s !== null && s !== undefined && String(s).trim() !== '').map(s => String(s).trim())
        : (targetSns ? [String(targetSns).trim()] : []);

    if (cleanSns.length === 0) return { success: false, message: 'ไม่พบหมายเลข S/N' };

    const client = getSupabaseClient();
    const itemMetaMap = (payloadData && payloadData.itemMetaMap) || {};
    const nowIso = new Date().toISOString();

    try {
        if (normalizedType === 'DISPATCH') {
            // 🟢 สร้างโครงสร้างใบงานจ่ายสินค้าฉบับสมบูรณ์พร้อมโลโก้บริษัท เลขที่อ้างอิง PO และลายเซ็นผู้จ่าย-ผู้รับ
            const workOrderPayload = buildApprovedOutboundWorkOrderPayload(cleanSns, payloadData, actorName, nowIso);
            const doNumber = workOrderPayload.do_number;

            // 🟢 กรณีเบิกจ่ายสินค้าออก (OUTBOUND / DISPATCH): อัปเดตสถานะเป็น OUT, qty = 0 และคืนพิกัดจัดเก็บ
            if (client) {
                const snVariantsSet = new Set();
                cleanSns.forEach(sn => {
                    snVariantsSet.add(sn);
                    snVariantsSet.add(sn.toUpperCase());
                    snVariantsSet.add(sn.toLowerCase());
                });
                const snVariants = Array.from(snVariantsSet);

                const CHUNK = 200;
                for (let i = 0; i < snVariants.length; i += CHUNK) {
                    const snChunk = snVariants.slice(i, i + CHUNK);

                    // 1) อัปเดตตาราง warehouse_items เป็น OUT
                    let { error: whErr } = await client
                        .from('warehouse_items')
                        .update({
                            status: 'OUT',
                            qty: 0,
                            dispatched_at: nowIso,
                            dispatched_by: workOrderPayload.dispatcher || actorName,
                            delivery_note_no: doNumber
                        })
                        .in('sn', snChunk);

                    if (whErr && (String(whErr.code) === 'PGRST204' || String(whErr.code) === '42703' || String(whErr.message || '').includes('column'))) {
                        await client
                            .from('warehouse_items')
                            .update({ status: 'OUT', qty: 0 })
                            .in('sn', snChunk);
                    }

                    // 2) รองรับตาราง inventory หากระบบมีการใช้งานควบคู่กัน
                    try {
                        await client.from('inventory').delete().in('sn', snChunk);
                    } catch (invIgnore) {}
                }

                // 3) บันทึกใบงานจ่ายสินค้าฉบับสมบูรณ์ (พร้อมโลโก้และลายเซ็น) ลงตาราง outbound_orders อัตโนมัติ
                try {
                    const combinedNotes = [
                        workOrderPayload.ref_doc_no ? `อ้างอิงใบเบิก/PO: ${workOrderPayload.ref_doc_no}` : '',
                        workOrderPayload.ref_project ? `โครงการ/แผนก: ${workOrderPayload.ref_project}` : '',
                        workOrderPayload.destination_notes || ''
                    ].filter(Boolean).join(' | ');

                    const fullDbOrderRecord = {
                        do_number: workOrderPayload.do_number,
                        ref_doc_no: workOrderPayload.ref_doc_no || null,
                        ref_project: workOrderPayload.ref_project || null,
                        company_title: workOrderPayload.company_title,
                        company_address: workOrderPayload.company_address || null,
                        company_phone_tax: workOrderPayload.company_phone_tax || null,
                        company_logo: workOrderPayload.company_logo || null,
                        customer_name: workOrderPayload.customer_name || null,
                        customer_address: workOrderPayload.customer_address || null,
                        contact_person: workOrderPayload.contact_person || null,
                        salesperson: workOrderPayload.salesperson || null,
                        dispatcher: workOrderPayload.dispatcher || null,
                        receiver: workOrderPayload.receiver || null,
                        dispatcher_signature: workOrderPayload.dispatcher_signature || null,
                        receiver_signature: workOrderPayload.receiver_signature || null,
                        destination_notes: combinedNotes || null,
                        show_original_location: Boolean(workOrderPayload.show_original_location),
                        items: workOrderPayload.items,
                        total_items: workOrderPayload.total_items,
                        total_qty: workOrderPayload.total_qty,
                        created_at: nowIso
                    };

                    let { error: doErr } = await client.from('outbound_orders').insert([fullDbOrderRecord]);
                    if (doErr && (String(doErr.code) === 'PGRST204' || String(doErr.code) === '42703' || String(doErr.message || '').includes('column'))) {
                        const baseDbOrderRecord = {
                            do_number: workOrderPayload.do_number,
                            company_title: workOrderPayload.company_title,
                            customer_name: workOrderPayload.customer_name,
                            customer_address: workOrderPayload.customer_address,
                            contact_person: workOrderPayload.contact_person,
                            salesperson: workOrderPayload.salesperson,
                            dispatcher: workOrderPayload.dispatcher,
                            receiver: workOrderPayload.receiver,
                            destination_notes: combinedNotes,
                            show_original_location: Boolean(workOrderPayload.show_original_location),
                            items: workOrderPayload.items,
                            total_items: workOrderPayload.total_items,
                            created_at: nowIso
                        };
                        await client.from('outbound_orders').insert([baseDbOrderRecord]);
                    }
                } catch (doErr) {}

                // 4) บันทึกประวัติลง inventory_logs / stock_history
                try {
                    await client.from('inventory_logs').insert([{
                        action: 'APPROVED_DISPATCH',
                        details: `${payloadData.description || 'อนุมัติจ่ายสินค้าออก'} (${doNumber}) | S/N: ${cleanSns.slice(0, 10).join(', ')}${cleanSns.length > 10 ? ` (+${cleanSns.length - 10})` : ''}`,
                        performed_by: actorName,
                        created_at: nowIso
                    }]);
                } catch (logErr) {}

                try {
                    const historyRows = cleanSns.slice(0, 200).map(sn => ({
                        sn: sn,
                        action: 'DISPATCH',
                        details: payloadData.description || payloadData.reason || 'APPROVED_DISPATCH',
                        recipient: workOrderPayload.receiver || workOrderPayload.customer_name || '-',
                        performed_by: actorName,
                        created_at: nowIso
                    }));
                    await client.from('stock_history').insert(historyRows);
                } catch (histErr) {}
            }

            // อัปเดตประวัติใบงานจ่ายสินค้าใน Local Cache และ UI
            if (typeof recentOutboundOrdersList !== 'undefined' && Array.isArray(recentOutboundOrdersList)) {
                const exists = recentOutboundOrdersList.some(o => o && o.do_number === doNumber);
                if (!exists) {
                    recentOutboundOrdersList.unshift(workOrderPayload);
                    if (recentOutboundOrdersList.length > 60) recentOutboundOrdersList.length = 60;
                    try {
                        localStorage.setItem('WMS_RECENT_OUTBOUND_ORDERS', JSON.stringify(recentOutboundOrdersList));
                    } catch (e) {}
                }
                if (typeof renderLiveOutboundFeed === 'function') {
                    renderLiveOutboundFeed();
                }
            }

            // ล้างรายการออกจากหน่วยความจำในเบราว์เซอร์ทันที
            cleanSns.forEach(sn => {
                const meta = itemMetaMap[sn] || {};
                if (typeof markStockItemDispatchedInMemory === 'function') {
                    markStockItemDispatchedInMemory(sn, {
                        id: meta.id || null,
                        dispatched_by: workOrderPayload.dispatcher || actorName,
                        dispatched_at: nowIso,
                        recipient: workOrderPayload.receiver || workOrderPayload.customer_name,
                        delivery_note_no: doNumber
                    });
                } else if (typeof purgeDispatchedOrDeletedItemFromMemory === 'function') {
                    purgeDispatchedOrDeletedItemFromMemory(sn, meta.id || null, meta.location || '');
                }
            });

            return { success: true, workOrder: workOrderPayload };
        } else if (normalizedType === 'DELETE') {
            let executedViaHostHelper = false;

            if (typeof executeChunkedWarehouseDelete === 'function') {
                try {
                    const structuredItems = cleanSns.map(sn => itemMetaMap[sn] || {
                        sn,
                        category: payloadData.category || '',
                        name: payloadData.name || '',
                        location: payloadData.source_location || ''
                    });
                    await executeChunkedWarehouseDelete(structuredItems, payloadData.description || `อนุมัติคำขอลบโดย ${actorName}`);
                    executedViaHostHelper = true;
                } catch (helperErr) {}
            }

            if (!executedViaHostHelper && client) {
                const candidateTables = ['inventory', 'warehouse_items'];
                let anyDeleted = false;
                let lastErrMsg = '';

                for (const tbl of candidateTables) {
                    const CHUNK = 200;
                    for (let i = 0; i < cleanSns.length; i += CHUNK) {
                        const snChunk = cleanSns.slice(i, i + CHUNK);
                        const { error } = await client.from(tbl).delete().in('sn', snChunk);
                        if (!error) {
                            anyDeleted = true;
                        } else {
                            lastErrMsg = error.message || '';
                        }
                    }
                }

                if (!anyDeleted && lastErrMsg && !lastErrMsg.toLowerCase().includes('does not exist')) {
                    return { success: false, message: lastErrMsg };
                }

                try {
                    await client.from('inventory_logs').insert([{
                        action: 'APPROVED_DELETE',
                        details: `${payloadData.description || 'APPROVED_DELETE'} | S/N: ${cleanSns.slice(0, 10).join(', ')}${cleanSns.length > 10 ? ` (+${cleanSns.length - 10})` : ''}`,
                        performed_by: actorName,
                        created_at: nowIso
                    }]);
                } catch (logErr) {}

                try {
                    const historyRows = cleanSns.slice(0, 200).map(sn => ({
                        sn: sn,
                        action: 'DELETE',
                        details: payloadData.description || payloadData.reason || 'DELETE',
                        recipient: '-',
                        performed_by: actorName,
                        created_at: nowIso
                    }));
                    await client.from('stock_history').insert(historyRows);
                } catch (histErr) {}
            }
        } else if (normalizedType === 'TRANSFER') {
            const targetLocation = payloadData.target_location || payloadData.new_location || payloadData.location || payloadData.to_location;
            if (!targetLocation) {
                return { success: false, message: 'ไม่พบข้อมูลพิกัดปลายทางสำหรับการย้ายพิกัด' };
            }

            let executedViaHostHelper = false;
            if (typeof executeChunkedBatchRelocate === 'function') {
                try {
                    const assignments = cleanSns.map(sn => {
                        const meta = itemMetaMap[sn] || {
                            sn,
                            category: payloadData.category || '',
                            name: payloadData.name || '',
                            location: payloadData.source_location || '-'
                        };
                        return {
                            item: meta,
                            oldLocation: meta.location || payloadData.source_location || '-',
                            newLocation: String(targetLocation).trim()
                        };
                    });
                    await executeChunkedBatchRelocate(assignments, payloadData.description || `อนุมัติคำขอย้ายพิกัดโดย ${actorName}`);
                    executedViaHostHelper = true;
                } catch (helperErr) {}
            }

            if (!executedViaHostHelper && client) {
                const updateFields = {
                    location: String(targetLocation).trim(),
                    updated_at: nowIso
                };
                if (payloadData.row !== undefined) updateFields.row = payloadData.row;
                if (payloadData.zone !== undefined) updateFields.zone = payloadData.zone;

                const candidateTables = ['inventory', 'warehouse_items'];
                let anyUpdated = false;
                let lastErrMsg = '';

                for (const tbl of candidateTables) {
                    const CHUNK = 200;
                    for (let i = 0; i < cleanSns.length; i += CHUNK) {
                        const snChunk = cleanSns.slice(i, i + CHUNK);
                        const { error } = await client.from(tbl).update(updateFields).in('sn', snChunk);
                        if (!error) {
                            anyUpdated = true;
                        } else {
                            lastErrMsg = error.message || '';
                        }
                    }
                }

                if (!anyUpdated && lastErrMsg && !lastErrMsg.toLowerCase().includes('does not exist')) {
                    return { success: false, message: lastErrMsg };
                }

                try {
                    await client.from('inventory_logs').insert([{
                        action: 'APPROVED_RELOCATE',
                        details: `ย้ายพิกัด ${cleanSns.length} รายการ ไปยัง ${targetLocation} | ${payloadData.description || ''}`,
                        performed_by: actorName,
                        created_at: nowIso
                    }]);
                } catch (logErr) {}
            }
        } else if (normalizedType === 'EDIT' && payloadData.updates && typeof payloadData.updates === 'object' && client) {
            const safeUpdates = { ...payloadData.updates, updated_at: nowIso };
            delete safeUpdates.id;
            delete safeUpdates.sn;
            for (const tbl of ['inventory', 'warehouse_items']) {
                try {
                    await client.from(tbl).update(safeUpdates).in('sn', cleanSns);
                } catch (e) {}
            }
        }

        return { success: true };
    } catch (e) {
        return { success: false, message: e.message || 'เกิดข้อผิดพลาดในการอัปเดตฐานข้อมูล' };
    }
}

// -------------------------------------------------------------------------
// 1.5 สร้างและอัปเกรด UX/UI สมัยใหม่สำหรับหน้าศูนย์อนุมัติอัตโนมัติ (Modern UI Engine)
// -------------------------------------------------------------------------
function getRequestTypeMeta(type) {
    const raw = normalizeActionType(type);
    const map = {
        'DELETE': { label: 'ลบรายการสต็อก', icon: 'fa-trash-can', bg: '#fee2e2', color: '#dc2626', border: '#fecaca' },
        'DISPATCH': { label: 'เบิกสินค้าออกจากคลัง', icon: 'fa-truck-ramp-box', bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
        'TRANSFER': { label: 'ย้ายพิกัดจัดเก็บ', icon: 'fa-right-left', bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' },
        'EDIT': { label: 'แก้ไขข้อมูลสินค้า', icon: 'fa-pen-to-square', bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe' },
        'RECEIVE': { label: 'รับสินค้าเข้าคลัง', icon: 'fa-boxes-packing', bg: '#d1fae5', color: '#059669', border: '#a7f3d0' }
    };
    return map[raw] || { label: raw, icon: 'fa-file-signature', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
}

function injectModernApprovalsStyles() {
    if (document.getElementById('wms-approvals-modern-styles')) return;
    const style = document.createElement('style');
    style.id = 'wms-approvals-modern-styles';
    style.textContent = `
        .wms-appr-shell {
            display: flex;
            flex-direction: column;
            gap: 14px;
            margin-bottom: 16px;
            font-family: 'Sarabun', 'Prompt', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .wms-appr-role-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
            padding: 11px 16px;
            border-radius: 12px;
            font-size: 0.84rem;
            font-weight: 700;
        }
        .wms-appr-role-banner.is-admin {
            background: linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%);
            border: 1px solid #a7f3d0;
            color: #065f46;
        }
        .wms-appr-role-banner.is-user {
            background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
            border: 1px solid #fde68a;
            color: #92400e;
        }
        .wms-appr-kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
        }
        @media (max-width: 900px) {
            .wms-appr-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 480px) {
            .wms-appr-kpi-grid { grid-template-columns: 1fr; }
        }
        .wms-appr-kpi-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
            position: relative;
            overflow: hidden;
        }
        .wms-appr-kpi-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
            border-color: #cbd5e1;
        }
        .wms-appr-kpi-card.active {
            border-width: 2px;
            box-shadow: 0 6px 16px rgba(37, 99, 235, 0.14);
        }
        .wms-appr-kpi-title {
            font-size: 0.82rem;
            font-weight: 600;
            color: #64748b;
            margin-bottom: 4px;
        }
        .wms-appr-kpi-value {
            font-size: 1.55rem;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.1;
        }
        .wms-appr-kpi-icon {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.15rem;
            flex-shrink: 0;
        }
        .wms-appr-toolbar {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 16px;
            box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .wms-appr-filter-row {
            display: grid;
            grid-template-columns: 1.8fr 1.1fr 1.2fr 1.2fr 1fr 1fr;
            gap: 10px;
            align-items: end;
        }
        @media (max-width: 1250px) {
            .wms-appr-filter-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 700px) {
            .wms-appr-filter-row { grid-template-columns: 1fr; }
        }
        .wms-appr-field label {
            display: block;
            font-size: 0.78rem;
            font-weight: 700;
            color: #475569;
            margin-bottom: 5px;
        }
        .wms-appr-input, .wms-appr-select {
            width: 100%;
            height: 38px;
            padding: 0 12px;
            border-radius: 10px;
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            color: #0f172a;
            font-size: 0.88rem;
            font-weight: 500;
            transition: all 0.15s ease;
            box-sizing: border-box;
        }
        .wms-appr-input:focus, .wms-appr-select:focus {
            outline: none;
            border-color: #2563eb;
            background: #ffffff;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
        }
        .wms-appr-meta-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding-top: 10px;
            border-top: 1px dashed #e2e8f0;
        }
        .wms-appr-limit-group {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
        }
        .wms-appr-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 34px;
            padding: 0 12px;
            border-radius: 9px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #334155;
            font-size: 0.82rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .wms-appr-btn:hover {
            background: #f1f5f9;
            border-color: #94a3b8;
        }
        .wms-appr-btn.primary {
            background: #2563eb;
            color: #ffffff;
            border-color: #2563eb;
        }
        .wms-appr-btn.primary:hover {
            background: #1d4ed8;
        }
        .wms-appr-btn.success {
            background: #10b981;
            color: #ffffff;
            border-color: #10b981;
        }
        .wms-appr-btn.success:hover {
            background: #059669;
        }
        .wms-appr-btn.danger {
            background: #ef4444;
            color: #ffffff;
            border-color: #ef4444;
        }
        .wms-appr-btn.danger:hover {
            background: #dc2626;
        }
        .wms-appr-btn.active-pill {
            background: #0f172a;
            color: #ffffff;
            border-color: #0f172a;
        }
        .wms-appr-live-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            display: inline-block;
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
            animation: wmsPulseLive 1.8s infinite;
        }
        @keyframes wmsPulseLive {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.65); }
            70% { box-shadow: 0 0 0 7px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .wms-appr-table-wrap {
            background: #ffffff;
            border-radius: 16px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
        .wms-appr-table-wrap table {
            width: 100%;
            border-collapse: collapse;
        }
        .wms-appr-table-wrap thead th {
            position: sticky;
            top: 0;
            z-index: 5;
            background: #f8fafc;
            color: #334155;
            font-weight: 800;
            font-size: 0.82rem;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            padding: 13px 12px;
            border-bottom: 2px solid #e2e8f0;
            white-space: nowrap;
        }
        .wms-appr-row {
            border-bottom: 1px solid #f1f5f9;
            transition: background-color 0.14s ease;
        }
        .wms-appr-row:hover {
            background-color: #f8fafc;
        }
        .wms-appr-row.is-pending {
            background-color: #fffbeb66;
        }
        .wms-appr-row.is-pending:hover {
            background-color: #fef3c755;
        }
        .wms-appr-desc-clamp {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            line-height: 1.45;
            max-height: 2.9em;
            font-size: 0.88rem;
            color: #1e293b;
        }
        .wms-appr-bulk-bar {
            display: none;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 12px;
            padding: 10px 14px;
        }
        .wms-appr-bulk-bar.visible {
            display: flex;
        }
        .wms-appr-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(3px);
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        }
        .wms-appr-modal-card {
            background: #ffffff;
            border-radius: 18px;
            width: 100%;
            max-width: 600px;
            max-height: 88vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 48px rgba(15, 23, 42, 0.25);
            overflow: hidden;
            animation: wmsModalPop 0.18s ease-out;
        }
        @keyframes wmsModalPop {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
        }
        /* Interactive Admin Actionable Popup (Bottom-Right) */
        #wmsAdminActionPopupHost {
            position: fixed;
            right: 18px;
            bottom: 18px;
            z-index: 2147483640;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 10px;
            max-width: calc(100vw - 32px);
            font-family: 'Sarabun', 'Prompt', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .wms-admin-popup-card {
            width: 390px;
            max-width: 100%;
            background: #0f172a;
            color: #f8fafc;
            border-radius: 16px;
            border: 1px solid rgba(56, 189, 248, 0.45);
            box-shadow: 0 20px 45px rgba(2, 6, 23, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.06);
            overflow: hidden;
            animation: wmsAdminCardSlideIn 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes wmsAdminCardSlideIn {
            from { opacity: 0; transform: translateY(18px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .wms-admin-popup-header {
            padding: 11px 14px;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            border-bottom: 1px solid rgba(148, 163, 184, 0.18);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .wms-admin-popup-body {
            padding: 13px 14px;
            display: flex;
            flex-direction: column;
            gap: 9px;
        }
        .wms-admin-popup-actions {
            padding: 10px 14px 13px;
            background: rgba(30, 41, 59, 0.65);
            border-top: 1px solid rgba(148, 163, 184, 0.15);
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .wms-admin-popup-btn {
            height: 36px;
            border-radius: 10px;
            border: none;
            font-size: 0.84rem;
            font-weight: 800;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: transform 0.12s ease, filter 0.15s ease;
        }
        .wms-admin-popup-btn:hover {
            filter: brightness(1.08);
            transform: translateY(-1px);
        }
        .wms-admin-popup-btn:active {
            transform: translateY(0);
        }
        .wms-admin-popup-btn.approve {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
        }
        .wms-admin-popup-btn.reject {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.32);
        }
        .wms-admin-popup-btn.center {
            grid-column: 1 / -1;
            height: 32px;
            background: rgba(56, 189, 248, 0.14);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.35);
            font-size: 0.78rem;
        }
        .wms-admin-dock-pill {
            display: inline-flex;
            align-items: center;
            gap: 9px;
            padding: 10px 15px;
            border-radius: 999px;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #ffffff;
            border: 1px solid rgba(251, 191, 36, 0.55);
            box-shadow: 0 10px 26px rgba(2, 6, 23, 0.38);
            cursor: pointer;
            font-size: 0.83rem;
            font-weight: 800;
            transition: transform 0.15s ease;
        }
        .wms-admin-dock-pill:hover {
            transform: translateY(-2px);
        }
    `;
    document.head.appendChild(style);
}

function ensureModernApprovalsUI() {
    if (!isUserLoggedIn()) return;
    injectModernApprovalsStyles();

    const tbody = document.getElementById('approvalsTableBody')
        || document.getElementById('approvalTableBody')
        || document.querySelector('#view-approvals table tbody');
    if (!tbody) return;

    const table = tbody.closest('table');
    if (!table) return;

    if (!table.parentElement.classList.contains('wms-appr-table-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'wms-appr-table-wrap';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
    }

    const tableWrap = table.parentElement;
    if (document.getElementById('wmsApprovalsModernControls')) return;

    const roleInfo = getUserRoleClassification();
    const isAdmin = roleInfo.isAdmin;
    const { name: displayName, username } = getCurrentUserIdentity();

    const shell = document.createElement('div');
    shell.id = 'wmsApprovalsModernControls';
    shell.className = 'wms-appr-shell';
    shell.innerHTML = `
        <!-- Role Policy Banner -->
        <div class="wms-appr-role-banner ${isAdmin ? 'is-admin' : 'is-user'}">
            <div>
                ${isAdmin
                    ? `<i class="fa-solid fa-shield-halved"></i> สิทธิ์ปัจจุบัน: <strong>${escapeHTML(roleInfo.roleLabel)} — ${escapeHTML(displayName)} (@${escapeHTML(username)})</strong> | สามารถเบิกจ่ายออก, ย้ายคลัง/ย้ายพิกัด และลบรายการได้ทันทีโดยไม่ต้องส่งคำขออนุมัติ`
                    : `<i class="fa-solid fa-user-lock"></i> สิทธิ์ปัจจุบัน: <strong>${escapeHTML(roleInfo.roleLabel)} — ${escapeHTML(displayName)} (@${escapeHTML(username)})</strong> | การลบ, ย้ายคลัง/ย้ายพิกัด และยิงจ่ายออก จะส่งคำขออนุมัติไปยังแอดมินทุกครั้ง`
                }
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${!isAdmin ? `
                    <button type="button" class="wms-appr-btn primary" onclick="filterApprovalsByRequester('${escapeHTML(username)}')">
                        <i class="fa-solid fa-user-clock"></i> ดูเฉพาะคำขอของฉัน
                    </button>
                ` : `
                    <button type="button" class="wms-appr-btn primary" onclick="filterApprovalsByApprover('${escapeHTML(username)}')">
                        <i class="fa-solid fa-user-shield"></i> รายการที่ฉันอนุมัติ/ปฏิเสธ
                    </button>
                `}
            </div>
        </div>

        <!-- KPI Summary Cards -->
        <div class="wms-appr-kpi-grid">
            <div class="wms-appr-kpi-card active" data-kpi-status="ALL" onclick="filterApprovalsByStatus('ALL')">
                <div>
                    <div class="wms-appr-kpi-title">คำขอทั้งหมดในระบบ</div>
                    <div class="wms-appr-kpi-value" id="wmsKpiTotalCount">0</div>
                </div>
                <div class="wms-appr-kpi-icon" style="background:#eff6ff; color:#2563eb;">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
            </div>
            <div class="wms-appr-kpi-card" data-kpi-status="PENDING" onclick="filterApprovalsByStatus('PENDING')">
                <div>
                    <div class="wms-appr-kpi-title">รออนุมัติ (Pending)</div>
                    <div class="wms-appr-kpi-value" id="wmsKpiPendingCount" style="color:#d97706;">0</div>
                </div>
                <div class="wms-appr-kpi-icon" style="background:#fef3c7; color:#d97706;">
                    <i class="fa-solid fa-hourglass-half"></i>
                </div>
            </div>
            <div class="wms-appr-kpi-card" data-kpi-status="APPROVED" onclick="filterApprovalsByStatus('APPROVED')">
                <div>
                    <div class="wms-appr-kpi-title">อนุมัติแล้ว (Approved)</div>
                    <div class="wms-appr-kpi-value" id="wmsKpiApprovedCount" style="color:#059669;">0</div>
                </div>
                <div class="wms-appr-kpi-icon" style="background:#d1fae5; color:#059669;">
                    <i class="fa-solid fa-circle-check"></i>
                </div>
            </div>
            <div class="wms-appr-kpi-card" data-kpi-status="REJECTED" onclick="filterApprovalsByStatus('REJECTED')">
                <div>
                    <div class="wms-appr-kpi-title">ปฏิเสธแล้ว (Rejected)</div>
                    <div class="wms-appr-kpi-value" id="wmsKpiRejectedCount" style="color:#dc2626;">0</div>
                </div>
                <div class="wms-appr-kpi-icon" style="background:#fee2e2; color:#dc2626;">
                    <i class="fa-solid fa-circle-xmark"></i>
                </div>
            </div>
        </div>

        <!-- Real-time Multi-Criteria Filter & Display Toolbar -->
        <div class="wms-appr-toolbar">
            <div class="wms-appr-filter-row">
                <div class="wms-appr-field">
                    <label for="wmsApprSearchInput"><i class="fa-solid fa-magnifying-glass"></i> ค้นหาด่วน (ผู้ขอ / แอดมิน / S/N / พิกัด)</label>
                    <input type="text" id="wmsApprSearchInput" class="wms-appr-input" placeholder="พิมพ์รหัสผู้ขอ, ชื่อแอดมิน, S/N, พิกัด..." oninput="handleApprovalSearchInput(this.value)">
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprTypeSelect"><i class="fa-solid fa-tags"></i> ประเภทคำขอ</label>
                    <select id="wmsApprTypeSelect" class="wms-appr-select" onchange="filterApprovalsByType(this.value)">
                        <option value="ALL">ทุกประเภทคำขอ (ทั้งหมด)</option>
                    </select>
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprRequesterSelect"><i class="fa-solid fa-user"></i> คัดกรองรหัส User ผู้ส่งคำขอ</label>
                    <select id="wmsApprRequesterSelect" class="wms-appr-select" onchange="filterApprovalsByRequester(this.value)">
                        <option value="ALL">User ผู้ส่งคำขอทุกคน (ทั้งหมด)</option>
                    </select>
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprApproverSelect"><i class="fa-solid fa-user-shield"></i> คัดกรองรหัส Admin ผู้อนุมัติ</label>
                    <select id="wmsApprApproverSelect" class="wms-appr-select" onchange="filterApprovalsByApprover(this.value)">
                        <option value="ALL">Admin ผู้อนุมัติทุกคน (ทั้งหมด)</option>
                    </select>
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprStatusSelect"><i class="fa-solid fa-filter"></i> สถานะคำขอ</label>
                    <select id="wmsApprStatusSelect" class="wms-appr-select" onchange="filterApprovalsByStatus(this.value)">
                        <option value="ALL">ทุกสถานะ</option>
                        <option value="PENDING">⏳ รออนุมัติ</option>
                        <option value="APPROVED">✅ อนุมัติแล้ว</option>
                        <option value="REJECTED">❌ ปฏิเสธ</option>
                    </select>
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprSortSelect"><i class="fa-solid fa-arrow-down-wide-short"></i> เรียงลำดับ</label>
                    <select id="wmsApprSortSelect" class="wms-appr-select" onchange="changeApprovalSortOrder(this.value)">
                        <option value="NEWEST">ล่าสุดขึ้นก่อน (ใหม่ -> เก่า)</option>
                        <option value="OLDEST">เก่าสุดขึ้นก่อน (เก่า -> ใหม่)</option>
                        <option value="PENDING_FIRST">รออนุมัติขึ้นก่อนเสมอ</option>
                    </select>
                </div>
            </div>

            <div class="wms-appr-meta-bar">
                <div class="wms-appr-limit-group">
                    <span style="font-size:0.82rem; font-weight:700; color:#475569;">
                        <span class="wms-appr-live-dot" style="margin-right:6px;"></span>
                        แสดงผล:
                    </span>
                    <select id="wmsApprLimitSelect" class="wms-appr-select" style="width:auto; height:34px; font-weight:700;" onchange="setApprovalDisplayLimit(this.value)">
                        <option value="25" selected>25 รายการ (ค่าเริ่มต้น)</option>
                        <option value="50">50 รายการ</option>
                        <option value="100">100 รายการ</option>
                        <option value="200">200 รายการ</option>
                        <option value="500">500 รายการ</option>
                        <option value="ALL">แสดงทั้งหมด (All)</option>
                    </select>
                    <button type="button" id="wmsApprShowAllBtn" class="wms-appr-btn" onclick="toggleShowAllApprovals()">
                        <i class="fa-solid fa-list-ul"></i> แสดงทุกรายการทั้งหมด
                    </button>
                    <span id="wmsApprCountSummary" style="font-size:0.82rem; color:#64748b; font-weight:600; margin-left:4px;">
                        กำลังโหลด...
                    </span>
                </div>

                <div class="wms-appr-limit-group">
                    <button type="button" id="wmsApprTTSBtn" class="wms-appr-btn" onclick="toggleApprovalTTSMute()" title="เปิด/ปิดเสียงแจ้งเตือน">
                        <i class="fa-solid ${isTTSMuted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i>
                        <span>${isTTSMuted ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}</span>
                    </button>
                    <button type="button" class="wms-appr-btn" onclick="exportFilteredApprovalsCSV()" title="ส่งออกรายการที่กรองเป็นไฟล์ CSV">
                        <i class="fa-solid fa-file-csv" style="color:#059669;"></i> ส่งออก CSV
                    </button>
                    <button type="button" class="wms-appr-btn" onclick="resetAllApprovalFilters()" title="ล้างตัวกรองทั้งหมด">
                        <i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง
                    </button>
                </div>
            </div>

            <!-- Bulk Action Bar (Admin Only when items selected) -->
            <div id="wmsApprBulkBar" class="wms-appr-bulk-bar">
                <div style="font-size:0.86rem; font-weight:700; color:#1e40af;">
                    <i class="fa-solid fa-check-double"></i> เลือกไว้แล้ว <span id="wmsApprSelectedCount">0</span> รายการ (เฉพาะรายการรออนุมัติ)
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="wms-appr-btn success" onclick="bulkApproveSelectedRequests()">
                        <i class="fa-solid fa-check"></i> อนุมัติที่เลือกทั้งหมด
                    </button>
                    <button type="button" class="wms-appr-btn danger" onclick="bulkRejectSelectedRequests()">
                        <i class="fa-solid fa-xmark"></i> ปฏิเสธที่เลือกทั้งหมด
                    </button>
                    <button type="button" class="wms-appr-btn" onclick="clearApprovalSelections()">
                        ยกเลิกการเลือก
                    </button>
                </div>
            </div>
        </div>
    `;

    tableWrap.parentNode.insertBefore(shell, tableWrap);
    syncApprovalFilterControlsUI();
}

function syncApprovalFilterControlsUI() {
    const statusSel = document.getElementById('wmsApprStatusSelect');
    if (statusSel && statusSel.value !== approvalStatusFilter) statusSel.value = approvalStatusFilter;

    const typeSel = document.getElementById('wmsApprTypeSelect');
    if (typeSel && typeSel.value !== approvalTypeFilter) typeSel.value = approvalTypeFilter;

    const reqSel = document.getElementById('wmsApprRequesterSelect');
    if (reqSel && reqSel.value !== approvalRequesterFilter) reqSel.value = approvalRequesterFilter;

    const apprSel = document.getElementById('wmsApprApproverSelect');
    if (apprSel && apprSel.value !== approvalApproverFilter) apprSel.value = approvalApproverFilter;

    const sortSel = document.getElementById('wmsApprSortSelect');
    if (sortSel && sortSel.value !== approvalSortOrder) sortSel.value = approvalSortOrder;

    const limitSel = document.getElementById('wmsApprLimitSelect');
    const limitValStr = String(approvalDisplayLimit);
    if (limitSel && limitSel.value !== limitValStr) limitSel.value = limitValStr;

    const showAllBtn = document.getElementById('wmsApprShowAllBtn');
    if (showAllBtn) {
        if (approvalDisplayLimit === 'ALL') {
            showAllBtn.classList.add('active-pill');
            showAllBtn.innerHTML = `<i class="fa-solid fa-compress"></i> กลับไปแสดง 25 รายการ`;
        } else {
            showAllBtn.classList.remove('active-pill');
            showAllBtn.innerHTML = `<i class="fa-solid fa-list-ul"></i> แสดงทุกรายการทั้งหมด`;
        }
    }

    document.querySelectorAll('.wms-appr-kpi-card').forEach(card => {
        const kpiStatus = card.getAttribute('data-kpi-status');
        if (kpiStatus === approvalStatusFilter) {
            card.classList.add('active');
            card.style.borderColor = '#2563eb';
        } else {
            card.classList.remove('active');
            card.style.borderColor = '#e2e8f0';
        }
    });
}

function updateDynamicFilterDropdowns(allRecords) {
    // 1. Update Request Types Dropdown dynamically
    const typeSel = document.getElementById('wmsApprTypeSelect');
    if (typeSel) {
        const standardTypes = ['DISPATCH', 'TRANSFER', 'DELETE', 'EDIT', 'RECEIVE'];
        const foundTypes = new Set(standardTypes);
        (allRecords || []).forEach(r => {
            if (r && r.request_type) foundTypes.add(normalizeActionType(r.request_type));
        });

        const typeOptions = Array.from(foundTypes);
        const signature = typeOptions.join('|');
        if (typeSel.dataset.optionsSig !== signature) {
            typeSel.dataset.optionsSig = signature;
            let optHtml = `<option value="ALL">ทุกประเภทคำขอ (${typeOptions.length} ประเภท)</option>`;
            typeOptions.forEach(t => {
                const meta = getRequestTypeMeta(t);
                optHtml += `<option value="${escapeHTML(t)}">${escapeHTML(meta.label)} (${escapeHTML(t)})</option>`;
            });
            typeSel.innerHTML = optHtml;
            typeSel.value = foundTypes.has(approvalTypeFilter) ? approvalTypeFilter : 'ALL';
        }
    }

    // 2. Update Requesters Dropdown dynamically (คัดกรองรหัส User ทั่วไปผู้ส่งคำขอ)
    const reqSel = document.getElementById('wmsApprRequesterSelect');
    if (reqSel) {
        const requesterMap = new Map();
        (allRecords || []).forEach(r => {
            if (!r) return;
            const uname = String(r.requester_username || '').trim();
            const dname = String(r.requester_name || uname || 'ไม่ระบุชื่อ').trim();
            const key = uname || dname;
            if (!key) return;

            if (!requesterMap.has(key)) {
                requesterMap.set(key, { key, name: dname, username: uname, count: 1 });
            } else {
                const existing = requesterMap.get(key);
                existing.count += 1;
                if (dname && dname !== uname) existing.name = dname;
            }
        });

        const sortedRequesters = Array.from(requesterMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'));
        const reqSig = sortedRequesters.map(u => `${u.key}:${u.name}:${u.count}`).join('|');
        if (reqSel.dataset.optionsSig !== reqSig) {
            reqSel.dataset.optionsSig = reqSig;
            let reqHtml = `<option value="ALL">User ผู้ส่งคำขอทุกคน (${sortedRequesters.length} คน)</option>`;
            sortedRequesters.forEach(u => {
                const displayLabel = (u.username && u.name !== u.username)
                    ? `${u.name} (@${u.username}) [${u.count}]`
                    : `${u.name} [${u.count}]`;
                reqHtml += `<option value="${escapeHTML(u.key)}">${escapeHTML(displayLabel)}</option>`;
            });
            reqSel.innerHTML = reqHtml;
            reqSel.value = requesterMap.has(approvalRequesterFilter) ? approvalRequesterFilter : 'ALL';
        }
    }

    // 3. Update Approvers Dropdown dynamically (คัดกรองรหัส Admin ผู้อนุมัติ)
    const apprSel = document.getElementById('wmsApprApproverSelect');
    if (apprSel) {
        const approverMap = new Map();
        (allRecords || []).forEach(r => {
            if (!r || !r.approved_by) return;
            const apprName = String(r.approved_by).trim();
            if (!apprName || apprName === '-') return;

            if (!approverMap.has(apprName)) {
                approverMap.set(apprName, { key: apprName, count: 1 });
            } else {
                approverMap.get(apprName).count += 1;
            }
        });

        const sortedApprovers = Array.from(approverMap.values()).sort((a, b) => a.key.localeCompare(b.key, 'th'));
        const apprSig = sortedApprovers.map(a => `${a.key}:${a.count}`).join('|');
        if (apprSel.dataset.optionsSig !== apprSig) {
            apprSel.dataset.optionsSig = apprSig;
            let apprHtml = `<option value="ALL">Admin ผู้อนุมัติทุกคน (${sortedApprovers.length} คน)</option>`;
            sortedApprovers.forEach(a => {
                apprHtml += `<option value="${escapeHTML(a.key)}">🛡️ ${escapeHTML(a.key)} [${a.count}]</option>`;
            });
            apprSel.innerHTML = apprHtml;
            apprSel.value = approverMap.has(approvalApproverFilter) ? approvalApproverFilter : 'ALL';
        }
    }

    // 4. Update KPI Summary Counters
    const totalEl = document.getElementById('wmsKpiTotalCount');
    const pendingEl = document.getElementById('wmsKpiPendingCount');
    const approvedEl = document.getElementById('wmsKpiApprovedCount');
    const rejectedEl = document.getElementById('wmsKpiRejectedCount');

    if (totalEl || pendingEl || approvedEl || rejectedEl) {
        const list = allRecords || [];
        const totalCount = list.length;
        const pendingCount = list.filter(r => r.status === 'PENDING').length;
        const approvedCount = list.filter(r => r.status === 'APPROVED').length;
        const rejectedCount = list.filter(r => r.status === 'REJECTED').length;

        if (totalEl) totalEl.textContent = totalCount.toLocaleString('th-TH');
        if (pendingEl) pendingEl.textContent = pendingCount.toLocaleString('th-TH');
        if (approvedEl) approvedEl.textContent = approvedCount.toLocaleString('th-TH');
        if (rejectedEl) rejectedEl.textContent = rejectedCount.toLocaleString('th-TH');
    }
}

function getFilteredAndSortedApprovals(sourceList) {
    const list = Array.isArray(sourceList) ? sourceList : [];
    const q = String(approvalSearchQuery || '').trim().toLowerCase();

    const filtered = list.filter(item => {
        if (!item) return false;

        if (approvalStatusFilter !== 'ALL' && item.status !== approvalStatusFilter) {
            return false;
        }

        if (approvalTypeFilter !== 'ALL') {
            const itemType = normalizeActionType(item.request_type);
            if (itemType !== approvalTypeFilter) return false;
        }

        if (approvalRequesterFilter !== 'ALL') {
            const uname = String(item.requester_username || '').trim();
            const dname = String(item.requester_name || '').trim();
            if (uname !== approvalRequesterFilter && dname !== approvalRequesterFilter) {
                return false;
            }
        }

        if (approvalApproverFilter !== 'ALL') {
            const appr = String(item.approved_by || '').trim();
            if (appr !== approvalApproverFilter) {
                return false;
            }
        }

        if (q) {
            const targetSnsArr = Array.isArray(item.target_sns) ? item.target_sns : (item.target_sns ? [item.target_sns] : []);
            const targetLoc = item.payload && (item.payload.target_location || item.payload.new_location || item.payload.location) ? (item.payload.target_location || item.payload.new_location || item.payload.location) : '';
            const haystack = [
                item.requester_name,
                item.requester_username,
                item.request_type,
                item.description,
                item.approved_by,
                targetLoc,
                ...targetSnsArr
            ].filter(Boolean).join(' ').toLowerCase();

            if (!haystack.includes(q)) return false;
        }

        return true;
    });

    const sorted = [...filtered];
    if (approvalSortOrder === 'OLDEST') {
        sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    } else if (approvalSortOrder === 'PENDING_FIRST') {
        sorted.sort((a, b) => {
            const aPend = a.status === 'PENDING' ? 0 : 1;
            const bPend = b.status === 'PENDING' ? 0 : 1;
            if (aPend !== bPend) return aPend - bPend;
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
    } else {
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    return sorted;
}

// -------------------------------------------------------------------------
// 2. ระบบส่งคำขออนุมัติ / ดำเนินการตามสิทธิ์ (User ขอทุกครั้ง 100% | Admin ทำได้ทันที)
// -------------------------------------------------------------------------
async function insertApprovalRecordToSupabase(client, requestPayload) {
    if (!client) return { data: null, error: new Error('No Supabase client') };

    // 1) พยายามบันทึกแบบเต็มรูปแบบ
    let res = await client.from('approval_requests').insert([requestPayload]).select();
    if (!res.error) return res;

    // 2) หากตารางใช้ Auto-ID (UUID/Serial) ให้ตัด id ออกแล้วส่งซ้ำ
    const withoutId = { ...requestPayload };
    delete withoutId.id;
    res = await client.from('approval_requests').insert([withoutId]).select();
    if (!res.error) return res;

    // 3) หากตารางไม่มีคอลัมน์เสริมบางตัว (เช่น updated_at หรือ payload) ให้ตัดคอลัมน์เสริมออกเพื่อไม่ให้คำขอตกหล่น
    const minimalPayload = {
        requester_username: requestPayload.requester_username,
        requester_name: requestPayload.requester_name,
        request_type: requestPayload.request_type,
        description: requestPayload.description,
        target_sns: requestPayload.target_sns,
        status: 'PENDING',
        created_at: requestPayload.created_at
    };
    res = await client.from('approval_requests').insert([minimalPayload]).select();
    if (!res.error) return res;

    // 4) บันทึกลงคิวสำรอง system_settings เพื่อให้ฝั่ง Admin มองเห็นและกดอนุมัติได้เสมอ 100%
    try {
        const existingQ = await readBridgeSettingsQueue(client);
        const batchId = `REQ-${Date.now()}`;
        const entries = (requestPayload.target_sns || []).map((sn, i) => ({
            id: `Q-${Date.now()}-${i}`,
            request_type: requestPayload.request_type,
            batch_id: batchId,
            sn,
            location: requestPayload.payload?.source_location || '',
            target_location: requestPayload.payload?.target_location || '',
            requested_by: requestPayload.requester_name || requestPayload.requester_username,
            reason: requestPayload.description,
            outbound_order_payload: requestPayload.payload?.outbound_order_payload || undefined,
            status: 'PENDING',
            created_at: requestPayload.created_at
        }));
        await writeBridgeSettingsQueue(client, [...entries, ...existingQ]);
        return { data: [requestPayload], error: null };
    } catch (e) {
        return res;
    }
}

async function createPendingApprovalRequest(type, desc, targetSns, payloadData, options = {}) {
    const cleanTargetSns = Array.isArray(targetSns)
        ? targetSns.filter(s => s !== null && s !== undefined && String(s).trim() !== '').map(s => String(s).trim())
        : (targetSns ? [String(targetSns).trim()] : []);

    if (cleanTargetSns.length === 0) {
        if (typeof showToast === 'function') showToast("⚠ ไม่พบหมายเลข S/N ที่ต้องการดำเนินการ", true);
        return false;
    }

    const { username: usernameVal, name: nameVal } = getCurrentUserIdentity();
    const normalizedType = normalizeActionType(type || 'DELETE');
    const isAdmin = isCurrentUserAdmin();

    // ⚡ 1. หากเป็นรหัสผู้ควบคุมดูแลเว็บหรือแอดมิน: ดำเนินการทันทีโดยไม่ต้องส่งคำขออนุมัติ (ยกเว้นสั่ง forceApproval: true)
    if (isAdmin && !options.forceApproval) {
        const directRes = await executeDirectWarehouseMutation(normalizedType, cleanTargetSns, {
            ...(payloadData || {}),
            requester_name: nameVal || usernameVal,
            description: desc
        }, nameVal || usernameVal);

        if (!directRes.success) {
            if (typeof showToast === 'function') showToast(`❌ ดำเนินการไม่สำเร็จ: ${directRes.message || ''}`, true);
            return false;
        }

        const typeMeta = getRequestTypeMeta(normalizedType);
        playTTSNotification(`${typeMeta.label}เรียบร้อยแล้ว`, 'success');
        showFloatingNotificationAlert(
            `⚡ ${typeMeta.label}สำเร็จทันที!`,
            `รายการ: ${desc}\nจำนวน: ${cleanTargetSns.length} รายการ (ดำเนินการด้วยสิทธิ์ผู้ดูแลระบบ)`,
            "success"
        );
        if (typeof showToast === 'function') showToast(`✅ ${typeMeta.label}สำเร็จทันที (${cleanTargetSns.length} รายการ)`);

        if (directRes.workOrder && typeof openOutboundWorkOrderModal === 'function') {
            openOutboundWorkOrderModal(directRes.workOrder, false);
        }

        triggerAutoUIRefresh();
        return true;
    }

    // 🔒 2. หากเป็นรหัส User ทั่วไป: บังคับส่งคำขออนุมัติ (PENDING) ทุกกรณี 100%
    const typeMeta = getRequestTypeMeta(normalizedType);
    const finalDesc = desc && String(desc).trim()
        ? String(desc).trim()
        : `${typeMeta.label} จำนวน ${cleanTargetSns.length} รายการ`;

    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const nowIso = new Date().toISOString();

    const requestPayload = {
        id: reqId,
        requester_username: String(usernameVal),
        requester_name: String(nameVal),
        request_type: String(normalizedType),
        description: finalDesc,
        target_sns: cleanTargetSns,
        payload: payloadData || {},
        status: 'PENDING',
        approved_by: null,
        created_at: nowIso,
        updated_at: nowIso
    };

    let savedDbRecord = null;
    const client = getSupabaseClient();

    if (client) {
        try {
            const { data, error } = await insertApprovalRecordToSupabase(client, requestPayload);
            if (!error && data && data.length > 0) {
                savedDbRecord = data[0];
            }
        } catch (e) {
            // Safe Catch - ยังคงบันทึกและแจ้งเตือนผ่าน Local Store ต่อได้ทันที
        }
    }

    const activeRecord = savedDbRecord || requestPayload;

    // บันทึกลง Local Store เสมอเพื่อให้ข้ามแท็บและหน้าศูนย์อนุมัติเห็นทันทีแม้ DB ดีเลย์
    const localList = getLocalApprovalsStore();
    localList.unshift(activeRecord);
    saveLocalApprovalsStore(localList);

    // แจ้งเตือนข้ามแท็บทันทีผ่าน BroadcastChannel + Storage Ping
    try {
        if (wmsApprovalsBridgeChannel) {
            wmsApprovalsBridgeChannel.postMessage({ type: 'NEW_APPROVAL_REQUEST', payload: activeRecord });
        }
        localStorage.setItem(WMS_BRIDGE_STORAGE_PING_KEY, JSON.stringify({
            type: 'NEW_APPROVAL_REQUEST',
            nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        }));
    } catch (e) {}

    // บันทึกสถานะ PENDING ลง Session เพื่อติดตามการอนุมัติกลับมายัง User รายนี้โดยเฉพาะ
    userTrackedRequestStatuses[String(activeRecord.id)] = 'PENDING';
    persistTrackedStatuses();

    // แจ้งเตือนฝั่ง User ผู้ส่งคำขอทันที (เสียงกระดิ่ง + ป๊อปอัพมุมขวาล่าง + Toast)
    playTTSNotification(`ส่งคำขอ${typeMeta.label}เรียบร้อยแล้ว`, 'warning');

    showFloatingNotificationAlert(
        `📤 ส่งคำขอ${typeMeta.label}เรียบร้อยแล้ว!`,
        `ผู้ส่งคำขอ: ${nameVal} (@${usernameVal})\nรายการ: ${finalDesc}\nจำนวน: ${cleanTargetSns.length} รายการ\nสถานะ: ส่งแจ้งเตือนไปยังแอดมินแล้ว รอการอนุมัติ`,
        "warning"
    );

    if (typeof showToast === 'function') {
        showToast(`✅ ส่งคำขอ${typeMeta.label}ไปยังแอดมินเรียบร้อยแล้ว`);
    }

    await loadPendingApprovalsFromDB(true);
    return true;
}

// -------------------------------------------------------------------------
// 2.5 ฟังก์ชันกลางสำหรับงานลบ / เบิกจ่ายออก / ย้ายคลัง (Role Guard 100%)
// รองรับการเรียกใช้งานจากทุกหน้าและทุกชื่อฟังก์ชัน
// -------------------------------------------------------------------------
async function requestOrExecuteWarehouseAction(actionType, desc, targetSns, payloadData = {}) {
    return await createPendingApprovalRequest(actionType, desc, targetSns, payloadData, { forceApproval: false });
}

async function submitDeleteWithRoleGuard(targetSns, reasonOrNote = '', extraPayload = {}) {
    const cleanSns = Array.isArray(targetSns) ? targetSns : [targetSns];
    const desc = reasonOrNote
        ? `ขอลบรายการสต็อก (${cleanSns.length} รายการ) - ${reasonOrNote}`
        : `ขอลบรายการสต็อกจำนวน ${cleanSns.length} รายการ`;
    return await requestOrExecuteWarehouseAction('DELETE', desc, cleanSns, {
        reason: reasonOrNote,
        ...extraPayload
    });
}

async function submitOutboundDispatchWithRoleGuard(targetSns, recipientOrNote = '', extraPayload = {}) {
    const cleanSns = Array.isArray(targetSns) ? targetSns : [targetSns];
    const desc = recipientOrNote
        ? `เบิกจ่ายสินค้าออกจากคลัง (${cleanSns.length} รายการ) -> ${recipientOrNote}`
        : `เบิกจ่ายสินค้าออกจากคลังจำนวน ${cleanSns.length} รายการ`;
    return await requestOrExecuteWarehouseAction('DISPATCH', desc, cleanSns, {
        recipient: recipientOrNote,
        ...extraPayload
    });
}

async function submitLocationTransferWithRoleGuard(targetSns, targetLocation, extraPayload = {}) {
    const cleanSns = Array.isArray(targetSns) ? targetSns : [targetSns];
    const locLabel = targetLocation ? `[${targetLocation}]` : '';
    const desc = `ย้ายคลัง/ย้ายพิกัดจัดเก็บ (${cleanSns.length} รายการ) ไปยัง ${locLabel}`.trim();
    return await requestOrExecuteWarehouseAction('TRANSFER', desc, cleanSns, {
        target_location: targetLocation,
        ...extraPayload
    });
}

// -------------------------------------------------------------------------
// 3. โหลดคำขออนุมัติจาก DB & แยกการแจ้งเตือนฝั่ง Admin และฝั่ง User 100%
// -------------------------------------------------------------------------
async function loadPendingApprovalsFromDB(forceRender = false) {
    let dbRowsCombined = [];
    let dbSuccess = false;

    const client = getSupabaseClient();
    const fetchCeiling = approvalDisplayLimit === 'ALL' ? 2500 : Math.max(300, Number(approvalDisplayLimit) * 4);

    if (client) {
        // 1) อ่านจากตารางหลัก approval_requests
        try {
            const { data, error } = await client
                .from('approval_requests')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(fetchCeiling);

            if (!error && Array.isArray(data)) {
                dbRowsCombined.push(...data.map(r => ({ ...r, _source: 'APPROVAL_REQUESTS' })));
                dbSuccess = true;
            }
        } catch (e) {}

        // 2) อ่านจากตารางสำรอง system_settings (wms_approval_requests_queue)
        try {
            const settingsQueue = await readBridgeSettingsQueue(client);
            if (settingsQueue.length > 0) {
                dbRowsCombined.push(...settingsQueue);
                dbSuccess = true;
            }
        } catch (e) {}

        // 3) อ่านจากตารางสำรอง inventory_logs (APPROVAL_REQUEST_PENDING / APPROVED / REJECTED)
        try {
            const logsQueue = await readBridgeInventoryLogsQueue(client, fetchCeiling);
            if (logsQueue.length > 0) {
                dbRowsCombined.push(...logsQueue);
                dbSuccess = true;
            }
        } catch (e) {}
    }

    const legacyLocalData = getLocalApprovalsStore().map(r => ({ ...r, _source: 'LEGACY_LOCAL_STORE' }));
    const bridgeLocalData = getBridgeLocalQueueStore().map(r => ({ ...r, _source: 'LOCAL_EMERGENCY_QUEUE' }));
    const allLocalData = [...legacyLocalData, ...bridgeLocalData];

    const mergedData = dbSuccess
        ? mergeDbAndLocalApprovals(dbRowsCombined, allLocalData)
        : normalizeAndGroupUnifiedRecords(allLocalData);

    if (mergedData) {
        const pendingRequests = mergedData.filter(r => r.status === 'PENDING');
        const pendingCount = pendingRequests.length;
        const loggedIn = isUserLoggedIn();
        const isAdmin = isCurrentUserAdmin();

        // ตรวจจับการสลับสิทธิ์ (เช่น ออกจาก User ทั่วไป แล้วเข้าสู่ระบบด้วย Admin) -> รีเซ็ตสถานะการแจ้งเตือนทันที
        if (lastKnownAdminRoleState !== isAdmin) {
            lastKnownAdminRoleState = isAdmin;
            if (isAdmin) {
                isInitialAdminSyncDone = false;
                wmsAdminPopupMinimized = false;
                wmsAdminPopupDismissedSignature = '';
            } else {
                removeAdminActionPopupUI();
            }
        }

        // 🚨 บล็อกการแสดงผลแจ้งเตือนทุกชนิดเฉพาะตอนอยู่หน้า Login จริงเท่านั้น
        if (!loggedIn) {
            updateAdminApprovalBadgeUI(0);
            removeAdminActionPopupUI();
            mergedData.forEach(req => {
                userTrackedRequestStatuses[String(req.id)] = req.status;
            });
            pendingApprovalsList = mergedData;
            return;
        }

        // 🟢 ฝั่ง ADMIN / ผู้ดูแลระบบ: เด้งป๊อปอัพพร้อมปุ่มกดอนุมัติหรือปฏิเสธทันที!
        if (isAdmin) {
            updateAdminApprovalBadgeUI(pendingCount);

            if (pendingCount === 0) {
                removeAdminActionPopupUI();
            } else {
                const { username: adminUname } = getCurrentUserIdentity();
                let newlyArrivedReq = null;

                pendingRequests.forEach(req => {
                    const idStr = String(req.id);
                    const scopedKey = `${adminUname}::${idStr}`;
                    userTrackedRequestStatuses[idStr] = 'PENDING';
                    if (!adminNotifiedRequestIds.has(scopedKey)) {
                        adminNotifiedRequestIds.add(scopedKey);
                        if (!newlyArrivedReq) newlyArrivedReq = req;
                    }
                });

                if (newlyArrivedReq) {
                    persistAdminNotifiedIds();
                    persistTrackedStatuses();
                    wmsAdminPopupMinimized = false;
                    wmsAdminPopupDismissedSignature = '';
                    wmsAdminPopupActiveIndex = 0;

                    if (!isInitialAdminSyncDone) {
                        isInitialAdminSyncDone = true;
                        playTTSNotification(`มีคำขอรออนุมัติจำนวน ${pendingCount} รายการ`, 'warning');
                        showAdminActionablePopup(pendingRequests, 0);
                    } else {
                        triggerAdminNotification(newlyArrivedReq, pendingCount, pendingRequests);
                    }
                } else {
                    isInitialAdminSyncDone = true;
                    // อัปเดตการ์ดป๊อปอัพหรือแถบสถานะมุมขวาล่างให้ตรงกับจำนวนรายการปัจจุบันเสมอ
                    syncAdminActionPopupWithPendingList(pendingRequests);
                }
            }
        } else {
            // 🟢 ฝั่ง USER ทั่วไป: แจ้งเตือนทันทีเมื่อแอดมินอนุมัติหรือปฏิเสธคำขอของตนเอง
            updateAdminApprovalBadgeUI(0);
            removeAdminActionPopupUI();

            const { username: currentUname, name: currentDisplayName } = getCurrentUserIdentity();
            const currentUnameLower = String(currentUname || '').toLowerCase();
            const currentNameLower = String(currentDisplayName || '').toLowerCase();

            mergedData.forEach(req => {
                const reqUnameLower = String(req.requester_username || '').toLowerCase();
                const reqNameLower = String(req.requester_name || '').toLowerCase();
                const isMyRequest = (currentUnameLower && reqUnameLower === currentUnameLower)
                    || (currentNameLower && reqNameLower === currentNameLower);

                if (isMyRequest) {
                    const idStr = String(req.id);
                    const oldStatus = userTrackedRequestStatuses[idStr];
                    const typeMeta = getRequestTypeMeta(req.request_type);

                    if (oldStatus === 'PENDING' && req.status === 'APPROVED') {
                        playTTSNotification(`คำขอ${typeMeta.label}ของคุณได้รับการอนุมัติแล้ว`, 'success');
                        showFloatingNotificationAlert(
                            `🎉 คำขอ${typeMeta.label}ได้รับการอนุมัติแล้ว!`,
                            `รายการ: ${req.description}\nอนุมัติโดยแอดมิน: ${req.approved_by || 'Admin'}`,
                            "success"
                        );
                        triggerAutoUIRefresh();
                    } else if (oldStatus === 'PENDING' && req.status === 'REJECTED') {
                        playTTSNotification(`คำขอ${typeMeta.label}ของคุณถูกปฏิเสธ`, 'danger');
                        showFloatingNotificationAlert(
                            `❌ คำขอ${typeMeta.label}ไม่ผ่านการอนุมัติ`,
                            `รายการ: ${req.description}\nดำเนินการโดยแอดมิน: ${req.approved_by || 'Admin'}`,
                            "danger"
                        );
                    }

                    userTrackedRequestStatuses[idStr] = req.status;
                }
            });
            persistTrackedStatuses();
        }

        pendingApprovalsList = mergedData;
        ensureModernApprovalsUI();
        updateDynamicFilterDropdowns(mergedData);
        renderApprovalsTable(mergedData, forceRender);
    }
}

// =========================================================================
// --- 3.5 INTERACTIVE ADMIN POPUP (กดอนุมัติ / ปฏิเสธ ได้ทันทีทุกหน้า)   ---
// =========================================================================
function removeAdminActionPopupUI() {
    const host = document.getElementById('wmsAdminActionPopupHost');
    if (host) host.remove();
}

function minimizeAdminActionPopup() {
    wmsAdminPopupMinimized = true;
    const pendingRequests = pendingApprovalsList.filter(r => r.status === 'PENDING');
    syncAdminActionPopupWithPendingList(pendingRequests);
}

function expandAdminActionPopup() {
    wmsAdminPopupMinimized = false;
    wmsAdminPopupDismissedSignature = '';
    const pendingRequests = pendingApprovalsList.filter(r => r.status === 'PENDING');
    if (pendingRequests.length > 0) {
        showAdminActionablePopup(pendingRequests, wmsAdminPopupActiveIndex);
    }
}

function stepAdminActionPopup(delta) {
    const pendingRequests = pendingApprovalsList.filter(r => r.status === 'PENDING');
    if (pendingRequests.length === 0) {
        removeAdminActionPopupUI();
        return;
    }
    wmsAdminPopupActiveIndex = (wmsAdminPopupActiveIndex + delta + pendingRequests.length) % pendingRequests.length;
    showAdminActionablePopup(pendingRequests, wmsAdminPopupActiveIndex);
}

function syncAdminActionPopupWithPendingList(pendingRequests) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) {
        removeAdminActionPopupUI();
        return;
    }
    if (!Array.isArray(pendingRequests) || pendingRequests.length === 0) {
        removeAdminActionPopupUI();
        return;
    }
    if (wmsAdminPopupActiveIndex >= pendingRequests.length) {
        wmsAdminPopupActiveIndex = 0;
    }
    showAdminActionablePopup(pendingRequests, wmsAdminPopupActiveIndex);
}

function showAdminActionablePopup(pendingRequests, index = 0) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;
    if (!Array.isArray(pendingRequests) || pendingRequests.length === 0) {
        removeAdminActionPopupUI();
        return;
    }

    injectModernApprovalsStyles();

    let host = document.getElementById('wmsAdminActionPopupHost');
    if (!host) {
        host = document.createElement('div');
        host.id = 'wmsAdminActionPopupHost';
        document.body.appendChild(host);
    }

    const safeIdx = Math.max(0, Math.min(index, pendingRequests.length - 1));
    wmsAdminPopupActiveIndex = safeIdx;
    const currentReq = pendingRequests[safeIdx];
    const reqIdEscaped = escapeHTML(String(currentReq.id));
    const totalPending = pendingRequests.length;

    // หากผู้ดูแลระบบกดพับเก็บไว้ ให้แสดงปุ่มแคปซูลมุมขวาล่างเพื่อกดขยายกลับมาอนุมัติได้ตลอดเวลา
    if (wmsAdminPopupMinimized) {
        const dockSig = `DOCK::${totalPending}`;
        if (host.dataset.renderSig === dockSig) return;
        host.dataset.renderSig = dockSig;

        host.innerHTML = `
            <button type="button" class="wms-admin-dock-pill" onclick="expandAdminActionPopup()" title="คลิกเพื่อเปิดหน้าต่างอนุมัติคำขอ">
                <span class="wms-appr-live-dot" style="background:#f59e0b;"></span>
                <span>🛡️ มีคำขอรออนุมัติ ${totalPending.toLocaleString('th-TH')} รายการ</span>
                <span style="background:#ef4444; color:#fff; padding:2px 8px; border-radius:999px; font-size:0.74rem;">เปิดดู</span>
            </button>
        `;
        return;
    }

    const typeMeta = getRequestTypeMeta(currentReq.request_type);
    const isOutboundReq = normalizeActionType(currentReq.request_type) === 'DISPATCH';
    const snsArr = Array.isArray(currentReq.target_sns) ? currentReq.target_sns : [];
    const snPreview = snsArr.slice(0, 3).join(', ') + (snsArr.length > 3 ? ` (+อีก ${snsArr.length - 3} S/N)` : '');
    const targetLoc = currentReq.payload && (currentReq.payload.target_location || currentReq.payload.new_location || currentReq.payload.location);
    const timeStr = currentReq.created_at
        ? new Date(currentReq.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '-';

    const cardSig = `CARD::${currentReq.id}::${safeIdx}::${totalPending}::${snsArr.length}`;
    if (host.dataset.renderSig === cardSig) return;
    host.dataset.renderSig = cardSig;

    host.innerHTML = `
        <div class="wms-admin-popup-card" role="dialog" aria-label="แจ้งเตือนคำขออนุมัติใหม่">
            <div class="wms-admin-popup-header">
                <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                    <span style="width:28px; height:28px; border-radius:8px; background:#f59e0b; color:#0f172a; display:flex; align-items:center; justify-content:center; font-size:0.88rem; flex-shrink:0;">
                        <i class="fa-solid fa-bell"></i>
                    </span>
                    <div style="min-width:0;">
                        <div style="font-size:0.84rem; font-weight:800; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            คำขออนุมัติ (${safeIdx + 1}/${totalPending})
                        </div>
                        <div style="font-size:0.7rem; color:#94a3b8;">เวลาส่ง ${escapeHTML(timeStr)} น.</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    ${totalPending > 1 ? `
                        <button type="button" onclick="stepAdminActionPopup(-1)" title="คำขอก่อนหน้า" style="background:rgba(255,255,255,0.1); border:none; color:#e2e8f0; width:26px; height:26px; border-radius:7px; cursor:pointer; font-size:0.75rem;">
                            <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <button type="button" onclick="stepAdminActionPopup(1)" title="คำขอถัดไป" style="background:rgba(255,255,255,0.1); border:none; color:#e2e8f0; width:26px; height:26px; border-radius:7px; cursor:pointer; font-size:0.75rem;">
                            <i class="fa-solid fa-chevron-right"></i>
                        </button>
                    ` : ''}
                    <button type="button" onclick="minimizeAdminActionPopup()" title="พับเก็บชั่วคราว" style="background:rgba(255,255,255,0.1); border:none; color:#cbd5e1; width:26px; height:26px; border-radius:7px; cursor:pointer; font-size:0.8rem;">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                </div>
            </div>

            <div class="wms-admin-popup-body">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                    <span style="display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:7px; background:${typeMeta.bg}; color:${typeMeta.color}; font-size:0.76rem; font-weight:800;">
                        <i class="fa-solid ${typeMeta.icon}"></i> ${escapeHTML(typeMeta.label)}
                    </span>
                    <span style="font-size:0.76rem; color:#cbd5e1; font-weight:700;">
                        <i class="fa-solid fa-user" style="color:#38bdf8;"></i> ${escapeHTML(currentReq.requester_name || currentReq.requester_username || 'User')}
                    </span>
                </div>

                <div style="font-size:0.82rem; color:#f1f5f9; line-height:1.4; background:rgba(30,41,59,0.75); padding:8px 10px; border-radius:9px; border:1px solid rgba(148,163,184,0.16);">
                    ${escapeHTML(currentReq.description || '-')}
                    ${targetLoc ? `<div style="margin-top:4px; color:#38bdf8; font-weight:700; font-size:0.77rem;"><i class="fa-solid fa-location-dot"></i> พิกัดปลายทาง: ${escapeHTML(String(targetLoc))}</div>` : ''}
                </div>

                ${snPreview ? `
                    <div style="font-size:0.75rem; color:#94a3b8; display:flex; align-items:center; justify-content:space-between; gap:6px;">
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            <strong style="color:#e2e8f0;">S/N (${snsArr.length}):</strong> <span style="font-family:monospace;">${escapeHTML(snPreview)}</span>
                        </span>
                        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                            ${isOutboundReq ? `
                                <button type="button" onclick="previewOutboundWorkOrderFromApproval('${reqIdEscaped}')" style="background:none; border:none; color:#fbbf24; font-size:0.74rem; font-weight:700; cursor:pointer; white-space:nowrap; text-decoration:underline;">
                                    ดูใบงาน
                                </button>
                            ` : ''}
                            <button type="button" onclick="openApprovalDetailModal('${reqIdEscaped}')" style="background:none; border:none; color:#38bdf8; font-size:0.74rem; font-weight:700; cursor:pointer; white-space:nowrap; text-decoration:underline;">
                                ดู S/N
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>

            <div class="wms-admin-popup-actions">
                <button type="button" class="wms-admin-popup-btn approve" onclick="approveUserRequest('${reqIdEscaped}')">
                    <i class="fa-solid fa-circle-check"></i> ${isOutboundReq ? 'อนุมัติ & ออกใบงาน' : 'อนุมัติทันที'}
                </button>
                <button type="button" class="wms-admin-popup-btn reject" onclick="rejectUserRequest('${reqIdEscaped}')">
                    <i class="fa-solid fa-circle-xmark"></i> ปฏิเสธ
                </button>
                <button type="button" class="wms-admin-popup-btn center" onclick="navigateToApprovalCenter()">
                    <i class="fa-solid fa-list-check"></i> เปิดหน้าศูนย์อนุมัติทั้งหมด (${totalPending.toLocaleString('th-TH')} รายการ)
                </button>
            </div>
        </div>
    `;
}

// -------------------------------------------------------------------------
// 4. Render ตารางรายการอนุมัติและประวัติทั้งหมด (Smart Diff 60fps Engine)
// -------------------------------------------------------------------------
function renderApprovalsTable(approvals, forceRender = false) {
    if (!isUserLoggedIn()) return;

    ensureModernApprovalsUI();

    const tbody = document.getElementById('approvalsTableBody') 
        || document.getElementById('approvalTableBody')
        || document.querySelector('#view-approvals table tbody');
        
    if (!tbody) return;

    const table = tbody.closest('table');
    const isAdmin = isCurrentUserAdmin();

    // Ensure checkbox header column exists for Admin bulk actions
    if (table && table.tHead && table.tHead.rows.length > 0) {
        const headerRow = table.tHead.rows[0];
        const hasSelectCol = headerRow.querySelector('.wms-appr-select-all-th');
        if (isAdmin && !hasSelectCol) {
            const th = document.createElement('th');
            th.className = 'wms-appr-select-all-th';
            th.style.cssText = 'width:40px; text-align:center;';
            th.innerHTML = `<input type="checkbox" id="wmsApprSelectAllCheckbox" title="เลือกรายการรออนุมัติทั้งหมดที่แสดง" onchange="toggleSelectAllVisiblePending(this.checked)" style="width:16px; height:16px; cursor:pointer;">`;
            headerRow.insertBefore(th, headerRow.firstChild);
        }
    }

    const colSpanCount = (table && table.tHead && table.tHead.rows.length > 0)
        ? table.tHead.rows[0].cells.length
        : (isAdmin ? 8 : 7);

    const filteredList = getFilteredAndSortedApprovals(approvals);
    const totalFilteredCount = filteredList.length;

    const displayedList = (approvalDisplayLimit === 'ALL')
        ? filteredList
        : filteredList.slice(0, Number(approvalDisplayLimit) || 25);

    // Update counter text
    const countSummaryEl = document.getElementById('wmsApprCountSummary');
    if (countSummaryEl) {
        if (totalFilteredCount === 0) {
            countSummaryEl.textContent = `พบ 0 รายการ (จากทั้งหมด ${(approvals || []).length.toLocaleString('th-TH')} รายการ)`;
        } else {
            countSummaryEl.innerHTML = `กำลังแสดง <strong>${displayedList.length.toLocaleString('th-TH')}</strong> จาก <strong>${totalFilteredCount.toLocaleString('th-TH')}</strong> รายการ`
                + (totalFilteredCount !== (approvals || []).length ? ` (กรองจากทั้งหมด ${(approvals || []).length.toLocaleString('th-TH')} รายการ)` : '');
        }
    }

    // Prune stale selected IDs that are no longer PENDING
    const validPendingIds = new Set((approvals || []).filter(r => r.status === 'PENDING').map(r => String(r.id)));
    selectedApprovalIds.forEach(id => {
        if (!validPendingIds.has(String(id))) selectedApprovalIds.delete(id);
    });
    updateBulkActionBarUI(displayedList);

    // Compute lightweight signature to prevent unnecessary DOM re-renders every 1s
    const renderSig = [
        isAdmin ? '1' : '0',
        approvalStatusFilter,
        approvalTypeFilter,
        approvalRequesterFilter,
        approvalApproverFilter,
        approvalSearchQuery,
        approvalSortOrder,
        String(approvalDisplayLimit),
        Array.from(selectedApprovalIds).sort().join(','),
        displayedList.map(r => `${r.id}:${r.status}:${r.updated_at || ''}:${r.approved_by || ''}`).join('|')
    ].join('::');

    if (!forceRender && renderSig === lastApprovalsRenderSignature) {
        return;
    }
    lastApprovalsRenderSignature = renderSig;

    if (!displayedList || displayedList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${colSpanCount}" style="text-align:center; padding:36px 16px; color:#64748b;">
                    <div style="font-size:2rem; margin-bottom:8px;">📭</div>
                    <div style="font-weight:700; font-size:0.95rem; color:#334155;">ไม่พบรายการคำขอที่ตรงกับเงื่อนไข</div>
                    <div style="font-size:0.82rem; margin-top:4px;">ลองเปลี่ยนตัวกรองสถานะ ประเภทคำขอ หรือกด "ล้างตัวกรอง" เพื่อดูรายการทั้งหมด</div>
                </td>
            </tr>`;
        return;
    }

    let html = '';

    displayedList.forEach((item, idx) => {
        const itemIdStr = String(item.id);
        const isPending = item.status === 'PENDING';
        const isChecked = selectedApprovalIds.has(itemIdStr);
        const isOutboundReq = normalizeActionType(item.request_type) === 'DISPATCH';

        let statusBadge = `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:3px 10px; border-radius:999px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:4px;">⏳ รออนุมัติ</span>`;
        if (item.status === 'APPROVED') {
            statusBadge = `<span style="background:#d1fae5; color:#047857; border:1px solid #a7f3d0; padding:3px 10px; border-radius:999px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:4px;">✅ อนุมัติแล้ว</span>`;
        } else if (item.status === 'REJECTED') {
            statusBadge = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:3px 10px; border-radius:999px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:4px;">❌ ปฏิเสธ</span>`;
        }

        const typeMeta = getRequestTypeMeta(item.request_type);
        const typeBadge = `<span style="font-weight:700; color:${typeMeta.color}; background:${typeMeta.bg}; border:1px solid ${typeMeta.border}; padding:3px 8px; border-radius:6px; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid ${typeMeta.icon}"></i> ${escapeHTML(typeMeta.label)}</span>`;

        const formattedDate = item.created_at ? new Date(item.created_at).toLocaleString('th-TH', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        }) : '-';
        
        let snsFormattedHtml = '-';
        const targetSnsArr = Array.isArray(item.target_sns) ? item.target_sns : (item.target_sns ? [item.target_sns] : []);

        if (targetSnsArr.length > 0) {
            const visibleSns = targetSnsArr.slice(0, 4);
            const remainingCount = targetSnsArr.length - visibleSns.length;

            const snTags = visibleSns.map(sn => 
                `<code style="
                    background: #f1f5f9; 
                    color: #0f172a; 
                    padding: 2px 7px; 
                    border-radius: 5px; 
                    font-size: 0.76rem; 
                    font-weight: 700;
                    border: 1px solid #cbd5e1;
                    white-space: nowrap;
                    display: inline-block;
                ">${escapeHTML(String(sn))}</code>`
            ).join('');

            const moreBadge = remainingCount > 0
                ? `<button type="button" onclick="openApprovalDetailModal('${escapeHTML(itemIdStr)}')" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:5px; font-size:0.75rem; font-weight:700; cursor:pointer;">+${remainingCount} S/N (ดูทั้งหมด)</button>`
                : '';

            snsFormattedHtml = `
                <div style="display:flex; flex-wrap:wrap; gap:4px; max-width:240px; align-items:center;">
                    ${snTags}
                    ${moreBadge}
                </div>
            `;
        }

        const checkboxCell = isAdmin ? `
            <td style="text-align:center; padding:12px 8px;">
                ${isPending ? `<input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleApprovalSelection('${escapeHTML(itemIdStr)}', this.checked)" style="width:16px; height:16px; cursor:pointer;">` : `<span style="color:#cbd5e1;">•</span>`}
            </td>
        ` : '';

        const requesterKey = item.requester_username || item.requester_name || '';
        const targetLoc = item.payload && (item.payload.target_location || item.payload.new_location || item.payload.location);
        const recipientInfo = item.payload && (item.payload.recipient || item.payload.receiver);

        html += `
            <tr class="wms-appr-row ${isPending ? 'is-pending' : ''}">
                ${checkboxCell}
                <td style="text-align:center; padding:12px 10px; font-weight:700; color:#64748b;" class="mono">${idx + 1}</td>
                <td style="font-size:0.8rem; color:#475569; padding:12px 10px; white-space:nowrap;">
                    <i class="fa-regular fa-clock" style="color:#94a3b8; margin-right:4px;"></i>${escapeHTML(formattedDate)}
                </td>
                <td style="padding:12px 10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:30px; height:30px; border-radius:50%; background:#e2e8f0; color:#334155; font-weight:800; font-size:0.78rem; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            ${escapeHTML(String(item.requester_name || item.requester_username || 'U').charAt(0).toUpperCase())}
                        </div>
                        <div>
                            <a href="javascript:void(0)" onclick="filterApprovalsByRequester('${escapeHTML(requesterKey)}')" title="คลิกเพื่อกรองเฉพาะ User ผู้ขอรายนี้" style="color:#0f172a; font-weight:700; text-decoration:none; font-size:0.88rem;">
                                ${escapeHTML(item.requester_name || '-')}
                            </a>
                            <div style="font-size:0.76rem; color:#64748b;">@${escapeHTML(item.requester_username || '-')} <span style="background:#f1f5f9; padding:1px 5px; border-radius:4px; font-size:0.7rem;">User</span></div>
                        </div>
                    </div>
                </td>
                <td style="padding:12px 10px;">
                    <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-start;">
                        ${typeBadge}
                        ${statusBadge}
                    </div>
                </td>
                <td style="padding:12px 10px; max-width:270px; word-break:break-word;">
                    <div class="wms-appr-desc-clamp" title="${escapeHTML(item.description || '-')}">${escapeHTML(item.description || '-')}</div>
                    ${targetLoc ? `<div style="margin-top:4px; font-size:0.76rem; color:#0284c7; font-weight:700;"><i class="fa-solid fa-location-dot"></i> พิกัดปลายทาง: ${escapeHTML(String(targetLoc))}</div>` : ''}
                    ${recipientInfo ? `<div style="margin-top:4px; font-size:0.76rem; color:#d97706; font-weight:700;"><i class="fa-solid fa-user-tag"></i> ผู้เบิก/ปลายทาง: ${escapeHTML(String(recipientInfo))}</div>` : ''}
                </td>
                <td style="padding:12px 10px;">${snsFormattedHtml}</td>
                <td style="text-align:center; padding:12px 10px; white-space:nowrap;">
                    <div style="display:inline-flex; align-items:center; gap:5px; flex-wrap:wrap; justify-content:center;">
                        ${isOutboundReq ? `
                            <button type="button" onclick="previewOutboundWorkOrderFromApproval('${escapeHTML(itemIdStr)}')" title="เปิดดูใบงานจ่ายสินค้าพร้อมโลโก้และลายเซ็น" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:6px 9px; border-radius:7px; cursor:pointer; font-weight:700; font-size:0.8rem;">
                                <i class="fa-solid fa-file-invoice"></i>
                            </button>
                        ` : ''}
                        <button type="button" onclick="openApprovalDetailModal('${escapeHTML(itemIdStr)}')" title="ดูรายละเอียดและ S/N ทั้งหมด" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:6px 9px; border-radius:7px; cursor:pointer; font-weight:700; font-size:0.8rem;">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        ${(isPending && isAdmin) ? `
                            <button type="button" onclick="approveUserRequest('${escapeHTML(itemIdStr)}')" style="background:#10b981; color:#fff; border:none; padding:6px 11px; border-radius:7px; cursor:pointer; font-weight:700; font-size:0.8rem; box-shadow:0 2px 6px rgba(16,185,129,0.28);"><i class="fa-solid fa-check"></i> อนุมัติ</button>
                            <button type="button" onclick="rejectUserRequest('${escapeHTML(itemIdStr)}')" style="background:#ef4444; color:#fff; border:none; padding:6px 11px; border-radius:7px; cursor:pointer; font-weight:700; font-size:0.8rem; box-shadow:0 2px 6px rgba(239,68,68,0.25);"><i class="fa-solid fa-xmark"></i> ปฏิเสธ</button>
                        ` : `<span style="font-size:0.78rem; color:#64748b; font-weight:600;">${item.approved_by ? `<a href="javascript:void(0)" onclick="filterApprovalsByApprover('${escapeHTML(item.approved_by)}')" style="color:#0369a1; text-decoration:none; font-weight:700;" title="คลิกเพื่อกรองตามแอดมินผู้อนุมัติ">🛡️ ${escapeHTML(item.approved_by)}</a>` : (isPending ? '⏳ รอแอดมินอนุมัติ' : '-')}</span>`}
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// -------------------------------------------------------------------------
// 4.5 หน้าต่าง Modal แสดงรายละเอียดคำขอ + S/N ทั้งหมด + คัดลอก S/N
// -------------------------------------------------------------------------
function openApprovalDetailModal(id) {
    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;

    const existing = document.getElementById('wmsApprovalDetailModal');
    if (existing) existing.remove();

    const targetSnsArr = Array.isArray(req.target_sns) ? req.target_sns : (req.target_sns ? [req.target_sns] : []);
    const typeMeta = getRequestTypeMeta(req.request_type);
    const isOutboundReq = normalizeActionType(req.request_type) === 'DISPATCH';
    const isAdmin = isCurrentUserAdmin();
    const isPending = req.status === 'PENDING';
    const createdStr = req.created_at ? new Date(req.created_at).toLocaleString('th-TH') : '-';
    const updatedStr = req.updated_at ? new Date(req.updated_at).toLocaleString('th-TH') : '-';
    const targetLoc = req.payload && (req.payload.target_location || req.payload.new_location || req.payload.location);
    const recipientInfo = req.payload && (req.payload.recipient || req.payload.receiver);

    const modal = document.createElement('div');
    modal.id = 'wmsApprovalDetailModal';
    modal.className = 'wms-appr-modal-backdrop';
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    const snBadgesHtml = targetSnsArr.length > 0
        ? targetSnsArr.map((sn, i) => `
            <span style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a; padding:4px 9px; border-radius:6px; font-family:monospace; font-size:0.82rem; font-weight:700;">
                <span style="color:#94a3b8; margin-right:4px;">${i + 1}.</span>${escapeHTML(String(sn))}
            </span>
        `).join('')
        : '<span style="color:#64748b;">ไม่มีรายการ S/N</span>';

    modal.innerHTML = `
        <div class="wms-appr-modal-card">
            <div style="padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; background:#f8fafc;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="background:${typeMeta.bg}; color:${typeMeta.color}; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1rem;">
                        <i class="fa-solid ${typeMeta.icon}"></i>
                    </span>
                    <div>
                        <div style="font-weight:800; font-size:1.02rem; color:#0f172a;">${escapeHTML(typeMeta.label)} (${escapeHTML(req.request_type || '-')})</div>
                        <div style="font-size:0.78rem; color:#64748b;">รหัสอ้างอิง: ${escapeHTML(String(req.id))}</div>
                    </div>
                </div>
                <button type="button" onclick="document.getElementById('wmsApprovalDetailModal').remove()" style="background:none; border:none; font-size:1.4rem; color:#64748b; cursor:pointer; line-height:1;">&times;</button>
            </div>

            <div style="padding:18px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
                <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; background:#f8fafc; padding:12px; border-radius:12px; border:1px solid #e2e8f0; font-size:0.85rem;">
                    <div><span style="color:#64748b;">รหัส User ผู้ส่งคำขอ:</span> <strong>${escapeHTML(req.requester_name || '-')}</strong> (@${escapeHTML(req.requester_username || '-')})</div>
                    <div><span style="color:#64748b;">สถานะปัจจุบัน:</span> <strong>${escapeHTML(req.status || '-')}</strong></div>
                    <div><span style="color:#64748b;">เวลาส่งคำขอ:</span> <strong>${escapeHTML(createdStr)}</strong></div>
                    <div><span style="color:#64748b;">อัปเดตล่าสุด:</span> <strong>${escapeHTML(updatedStr)}</strong></div>
                    ${req.approved_by ? `<div style="grid-column:1/-1;"><span style="color:#64748b;">รหัส Admin ผู้อนุมัติ/ดำเนินการ:</span> <strong>🛡️ ${escapeHTML(req.approved_by)}</strong></div>` : ''}
                    ${targetLoc ? `<div style="grid-column:1/-1;"><span style="color:#64748b;">พิกัดปลายทาง:</span> <strong style="color:#0284c7;">${escapeHTML(String(targetLoc))}</strong></div>` : ''}
                    ${recipientInfo ? `<div style="grid-column:1/-1;"><span style="color:#64748b;">ผู้เบิก / ปลายทางรับสินค้า:</span> <strong style="color:#d97706;">${escapeHTML(String(recipientInfo))}</strong></div>` : ''}
                </div>

                <div>
                    <div style="font-size:0.82rem; font-weight:700; color:#475569; margin-bottom:5px;">รายละเอียดการดำเนินการ:</div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:0.9rem; color:#0f172a; line-height:1.5;">
                        ${escapeHTML(req.description || '-')}
                    </div>
                </div>

                <div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                        <span style="font-size:0.82rem; font-weight:700; color:#475569;">รายการ Serial Numbers (${targetSnsArr.length} รายการ):</span>
                        ${targetSnsArr.length > 0 ? `<button type="button" class="wms-appr-btn" onclick="copyApprovalSerialNumbers('${escapeHTML(String(req.id))}')"><i class="fa-regular fa-copy"></i> คัดลอก S/N ทั้งหมด</button>` : ''}
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; max-height:200px; overflow-y:auto; padding:10px; border:1px solid #e2e8f0; border-radius:10px; background:#ffffff;">
                        ${snBadgesHtml}
                    </div>
                </div>
            </div>

            <div style="padding:14px 20px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                ${isOutboundReq ? `
                    <button type="button" class="wms-appr-btn primary" onclick="previewOutboundWorkOrderFromApproval('${escapeHTML(String(req.id))}')">
                        <i class="fa-solid fa-file-invoice"></i> ดูใบงานจ่ายสินค้า (โลโก้ & ลายเซ็น)
                    </button>
                ` : ''}
                ${(isPending && isAdmin) ? `
                    <button type="button" class="wms-appr-btn success" onclick="approveUserRequest('${escapeHTML(String(req.id))}'); document.getElementById('wmsApprovalDetailModal').remove();">
                        <i class="fa-solid fa-check"></i> ${isOutboundReq ? 'อนุมัติ & ออกใบงาน' : 'อนุมัติคำขอนี้'}
                    </button>
                    <button type="button" class="wms-appr-btn danger" onclick="rejectUserRequest('${escapeHTML(String(req.id))}'); document.getElementById('wmsApprovalDetailModal').remove();">
                        <i class="fa-solid fa-xmark"></i> ปฏิเสธคำขอนี้
                    </button>
                ` : ''}
                <button type="button" class="wms-appr-btn" onclick="document.getElementById('wmsApprovalDetailModal').remove()">ปิดหน้าต่าง</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function copyApprovalSerialNumbers(id) {
    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;
    const sns = Array.isArray(req.target_sns) ? req.target_sns.join('\n') : String(req.target_sns || '');
    if (!sns) return;
    try {
        navigator.clipboard.writeText(sns);
        if (typeof showToast === 'function') showToast(`📋 คัดลอก S/N ทั้งหมด ${req.target_sns.length} รายการแล้ว`);
    } catch (e) {
        // Fallback
    }
}

// -------------------------------------------------------------------------
// 5. Update Badge Count (เฉพาะ Admin)
// -------------------------------------------------------------------------
function updateAdminApprovalBadgeUI(count) {
    if (!isUserLoggedIn()) return;
    const badges = document.querySelectorAll('#sidebarApprovalBadge, #approvalBadge, #approvalPendingBadge, [data-badge="approval"], .approval-pending-badge');
    badges.forEach(b => {
        if (count > 0 && isCurrentUserAdmin()) {
            b.style.display = 'inline-flex';
            b.textContent = count > 99 ? '99+' : String(count);
        } else {
            b.style.display = 'none';
        }
    });
}

// -------------------------------------------------------------------------
// 6. ป๊อปอัพเด้งแจ้งเตือนฝั่ง Admin มุมขวาล่างพร้อมปุ่มอนุมัติ/ปฏิเสธทันที
// -------------------------------------------------------------------------
function triggerAdminNotification(record, count, allPendingList = null) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    playTTSNotification('มีคำขออนุมัติใหม่เข้ามา', 'warning');

    const pendingQueue = Array.isArray(allPendingList) && allPendingList.length > 0
        ? allPendingList
        : [record];
    const targetIndex = Math.max(0, pendingQueue.findIndex(r => String(r.id) === String(record.id)));
    showAdminActionablePopup(pendingQueue, targetIndex);
}

function showFloatingNotificationAlert(title, message, type = 'info', isClickable = false) {
    if (!isUserLoggedIn()) return;

    let container = document.getElementById('globalFloatingNotificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'globalFloatingNotificationContainer';
        container.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 999999;
            display: flex; flex-direction: column; gap: 12px;
            max-width: 420px; width: calc(100vw - 48px); pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const card = document.createElement('div');
    let borderColor = '#2563eb';
    if (type === 'success') borderColor = '#10b981';
    if (type === 'warning') borderColor = '#f59e0b';
    if (type === 'danger') borderColor = '#ef4444';

    card.style.cssText = `
        background: #ffffff; border-left: 6px solid ${borderColor};
        border-radius: 12px; padding: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.25);
        color: #0f172a; pointer-events: auto; cursor: ${(isClickable && isCurrentUserAdmin()) ? 'pointer' : 'default'};
        transition: all 0.3s ease; position: relative; font-family: sans-serif;
    `;

    if (isClickable && isCurrentUserAdmin()) {
        card.onclick = (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            navigateToApprovalCenter();
            card.remove();
        };
    }

    card.innerHTML = `
        <div style="font-weight: 800; font-size: 1rem; margin-bottom: 4px; color: ${borderColor}; padding-right: 20px;">
            ${escapeHTML(title)}
        </div>
        <div style="font-size: 0.88rem; color: #334155; white-space: pre-line; line-height: 1.45;">${escapeHTML(message)}</div>
        ${(isClickable && isCurrentUserAdmin()) ? `<div style="margin-top:8px; font-weight:800; font-size:0.8rem; color:${borderColor};">👉 คลิกที่นี่เพื่อเปิดศูนย์อนุมัติคำขอทันที</div>` : ''}
        <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; right:12px; background:none; border:none; font-size:1.2rem; cursor:pointer; color:#64748b;">&times;</button>
    `;

    container.appendChild(card);
    setTimeout(() => { if (card && card.parentElement) card.remove(); }, 10000);
}

// -------------------------------------------------------------------------
// 7. สลับ View ไปยังหน้าอนุมัติ (อัปเดต URL และส่วนหัวให้ตรง approvals-db.js)
// -------------------------------------------------------------------------
function navigateToApprovalCenter() {
    if (!isUserLoggedIn()) return;
    
    if (typeof switchView === 'function') {
        switchView('view-approvals');
    } else if (typeof executeSwitchView === 'function') {
        executeSwitchView('view-approvals');
    } else {
        document.querySelectorAll('.view-section, .page-section, section[id^="view-"]').forEach(s => s.style.display = 'none');
        const target = document.getElementById('view-approvals');
        if (target) target.style.display = 'block';
        if (typeof syncRouteToBrowserAndHeader === 'function') {
            syncRouteToBrowserAndHeader('view-approvals');
        }
    }
    loadPendingApprovalsFromDB(true);
}

// -------------------------------------------------------------------------
// 8. Realtime Engine (Fast Polling + WebSocket Listener 3 Tables + Cross-Tab Sync)
// -------------------------------------------------------------------------
function startApprovalRealtimeMonitor() {
    initApprovalRealtimeSubscription();
    if (approvalPollingTimer) clearInterval(approvalPollingTimer);

    // เชื่อมต่อ BroadcastChannel สำหรับซิงก์ข้ามแท็บแบบทันที (< 10ms)
    if (typeof BroadcastChannel !== 'undefined' && !wmsApprovalsBridgeChannel) {
        try {
            wmsApprovalsBridgeChannel = new BroadcastChannel(WMS_BRIDGE_CHANNEL_NAME);
            wmsApprovalsBridgeChannel.onmessage = () => {
                loadPendingApprovalsFromDB(true);
            };
        } catch (e) {}
    }

    // ซิงก์ข้ามแท็บทันทีเมื่อ Local Store มีการเพิ่ม/แก้ไขคำขอ
    window.removeEventListener('storage', handleCrossTabApprovalStorageSync);
    window.addEventListener('storage', handleCrossTabApprovalStorageSync);

    loadPendingApprovalsFromDB(true);
    approvalPollingTimer = setInterval(() => loadPendingApprovalsFromDB(false), 1500);
}

function handleCrossTabApprovalStorageSync(event) {
    if (!event) return;
    if (
        event.key === LOCAL_APPROVALS_KEY ||
        event.key === WMS_BRIDGE_LOCAL_QUEUE_KEY ||
        event.key === WMS_BRIDGE_STORAGE_PING_KEY
    ) {
        loadPendingApprovalsFromDB(true);
    }
}

function initApprovalRealtimeSubscription() {
    const client = getSupabaseClient();
    if (!client) {
        setTimeout(initApprovalRealtimeSubscription, 1000);
        return;
    }

    if (approvalRealtimeChannel) {
        try { client.removeChannel(approvalRealtimeChannel); } catch(e) {}
    }

    approvalRealtimeChannel = client
        .channel('public_approval_requests_unified_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, () => {
            loadPendingApprovalsFromDB(true);
            triggerAutoUIRefresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings', filter: `key=eq.${WMS_BRIDGE_SETTINGS_KEY}` }, () => {
            loadPendingApprovalsFromDB(true);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_logs', filter: 'action=eq.APPROVAL_REQUEST_PENDING' }, () => {
            loadPendingApprovalsFromDB(true);
        })
        .subscribe();
}

// -------------------------------------------------------------------------
// 9. Admin Actions (อนุมัติ / ปฏิเสธ แบบ Optimistic Realtime 100% ครบทุกชั้นข้อมูล)
// -------------------------------------------------------------------------
async function persistDecisionAcrossAllSources(req, newStatus, adminUser, nowIso) {
    const client = getSupabaseClient();

    // 1) อัปเดตตารางหลัก approval_requests (รองรับทั้ง schema เก่าและใหม่)
    if (client && Array.isArray(req._primaryRowIds) && req._primaryRowIds.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < req._primaryRowIds.length; i += CHUNK) {
            const idChunk = req._primaryRowIds.slice(i, i + CHUNK);
            const { error: e1 } = await client
                .from('approval_requests')
                .update({ status: newStatus, approved_by: adminUser, updated_at: nowIso })
                .in('id', idChunk);

            if (e1) {
                const { error: e2 } = await client
                    .from('approval_requests')
                    .update({ status: newStatus, reviewed_by: adminUser, reviewed_at: nowIso })
                    .in('id', idChunk);

                if (e2) {
                    await client
                        .from('approval_requests')
                        .update({ status: newStatus })
                        .in('id', idChunk);
                }
            }
        }
    }

    // 2) อัปเดตคิวสำรองใน system_settings (wms_approval_requests_queue)
    if (client && (Array.isArray(req._settingsQueueIds) && req._settingsQueueIds.length > 0 || req.batch_id)) {
        try {
            const queueIdSet = new Set((req._settingsQueueIds || []).map(String));
            const currentSettingsQueue = await readBridgeSettingsQueue(client);
            let changed = false;
            const updatedSettingsQueue = currentSettingsQueue.map(q => {
                const matchById = q.id !== undefined && queueIdSet.has(String(q.id));
                const matchByBatch = req.batch_id && String(q.batch_id || '') === String(req.batch_id);
                if (matchById || matchByBatch) {
                    changed = true;
                    return {
                        ...q,
                        status: newStatus,
                        approved_by: adminUser,
                        reviewed_by: adminUser,
                        updated_at: nowIso,
                        reviewed_at: nowIso
                    };
                }
                return q;
            });
            if (changed) {
                await writeBridgeSettingsQueue(client, updatedSettingsQueue);
            }
        } catch (e) {}
    }

    // 3) อัปเดตคิวสำรองใน inventory_logs
    if (client && Array.isArray(req._logRowIds) && req._logRowIds.length > 0) {
        try {
            const nextAction = newStatus === 'APPROVED' ? 'APPROVAL_REQUEST_APPROVED' : 'APPROVAL_REQUEST_REJECTED';
            await client
                .from('inventory_logs')
                .update({ action: nextAction })
                .in('id', req._logRowIds);
        } catch (e) {}
    }

    // 4) อัปเดต Local Bridge Queue (WMS_LOCAL_APPROVAL_QUEUE_V2)
    try {
        const bridgeIdSet = new Set((req._localBridgeIds || []).map(String));
        const bridgeList = getBridgeLocalQueueStore();
        let bridgeChanged = false;
        const nextBridgeList = bridgeList.map(q => {
            const matchById = q.id !== undefined && bridgeIdSet.has(String(q.id));
            const matchByBatch = req.batch_id && String(q.batch_id || '') === String(req.batch_id);
            if (matchById || matchByBatch) {
                bridgeChanged = true;
                return {
                    ...q,
                    status: newStatus,
                    approved_by: adminUser,
                    reviewed_by: adminUser,
                    updated_at: nowIso
                };
            }
            return q;
        });
        if (bridgeChanged) {
            saveBridgeLocalQueueStore(nextBridgeList);
        }
    } catch (e) {}

    // 5) อัปเดต Legacy Local Approvals Store (wms_local_pending_approvals_v2)
    try {
        const localList = getLocalApprovalsStore();
        let legacyChanged = false;
        localList.forEach(r => {
            if (String(r.id) === String(req.id) || (req.batch_id && String(r.batch_id || '') === String(req.batch_id))) {
                r.status = newStatus;
                r.approved_by = adminUser;
                r.updated_at = nowIso;
                legacyChanged = true;
            }
        });
        if (legacyChanged) {
            saveLocalApprovalsStore(localList);
        }
    } catch (e) {}

    // แจ้งเตือนข้ามแท็บทันที
    try {
        if (wmsApprovalsBridgeChannel) {
            wmsApprovalsBridgeChannel.postMessage({ type: 'APPROVAL_DECISION_MADE', status: newStatus, id: req.id });
        }
        localStorage.setItem(WMS_BRIDGE_STORAGE_PING_KEY, JSON.stringify({
            type: 'APPROVAL_DECISION_MADE',
            status: newStatus,
            nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        }));
    } catch (e) {}
}

async function approveUserRequest(id, silent = false) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) {
        if (typeof showToast === 'function') showToast("⛔ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถอนุมัติคำขอได้", true);
        return;
    }

    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;

    const { username, name } = getCurrentUserIdentity();
    const adminUser = username || name || 'admin';
    const nowIso = new Date().toISOString();

    // Optimistic UI update immediately (< 10ms response)
    req.status = 'APPROVED';
    req.approved_by = adminUser;
    req.updated_at = nowIso;
    selectedApprovalIds.delete(String(id));

    const remainingPending = pendingApprovalsList.filter(r => r.status === 'PENDING');
    updateAdminApprovalBadgeUI(remainingPending.length);
    syncAdminActionPopupWithPendingList(remainingPending);
    updateDynamicFilterDropdowns(pendingApprovalsList);
    renderApprovalsTable(pendingApprovalsList, true);

    let generatedWorkOrder = null;

    try {
        // ประมวลผลการเปลี่ยนแปลงในคลังสินค้าจริง (เบิกออก / ย้ายพิกัด / ลบ / แก้ไข)
        const mutRes = await executeDirectWarehouseMutation(req.request_type, req.target_sns, {
            ...(req.payload || {}),
            batch_id: req.batch_id,
            requester_name: req.requester_name || req.requester_username,
            description: req.description
        }, adminUser);

        if (mutRes && mutRes.workOrder) {
            generatedWorkOrder = mutRes.workOrder;
        }

        if (!mutRes.success && !silent) {
            if (typeof showToast === 'function') showToast(`⚠ หมายเหตุฐานข้อมูลคลัง: ${mutRes.message}`, true);
        }

        await persistDecisionAcrossAllSources(req, 'APPROVED', adminUser, nowIso);
    } catch (e) {
        // Safe Catch
    }

    if (!silent) {
        playTTSNotification("อนุมัติคำขอเรียบร้อยแล้ว", 'success');
        if (typeof showToast === 'function') {
            showToast(
                generatedWorkOrder
                    ? `✅ อนุมัติตัดจ่ายสินค้าและออกใบงาน ${generatedWorkOrder.do_number} พร้อมโลโก้และลายเซ็นสำเร็จ!`
                    : `✅ อนุมัติคำขอเรียบร้อยแล้ว (${(req.target_sns || []).length} รายการ)`
            );
        }
        triggerAutoUIRefresh();
        await loadPendingApprovalsFromDB(true);

        // เปิดใบงานจ่ายสินค้าพร้อมโลโก้และลายเซ็นให้ Admin ตรวจสอบและพิมพ์ PDF ทันที
        if (generatedWorkOrder && typeof openOutboundWorkOrderModal === 'function') {
            openOutboundWorkOrderModal(generatedWorkOrder, false);
        }
    }
}

async function rejectUserRequest(id, silent = false) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) {
        if (typeof showToast === 'function') showToast("⛔ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถปฏิเสธคำขอได้", true);
        return;
    }

    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;

    const { username, name } = getCurrentUserIdentity();
    const adminUser = username || name || 'admin';
    const nowIso = new Date().toISOString();

    // Optimistic UI update immediately (< 10ms response)
    req.status = 'REJECTED';
    req.approved_by = adminUser;
    req.updated_at = nowIso;
    selectedApprovalIds.delete(String(id));

    const remainingPending = pendingApprovalsList.filter(r => r.status === 'PENDING');
    updateAdminApprovalBadgeUI(remainingPending.length);
    syncAdminActionPopupWithPendingList(remainingPending);
    updateDynamicFilterDropdowns(pendingApprovalsList);
    renderApprovalsTable(pendingApprovalsList, true);

    try {
        await persistDecisionAcrossAllSources(req, 'REJECTED', adminUser, nowIso);
    } catch (e) {
        // Safe Catch
    }

    if (!silent) {
        playTTSNotification("ปฏิเสธคำขอเรียบร้อยแล้ว", 'danger');
        if (typeof showToast === 'function') showToast("⛔ ปฏิเสธคำขอเรียบร้อยแล้ว");
        triggerAutoUIRefresh();
        await loadPendingApprovalsFromDB(true);
    }
}

// -------------------------------------------------------------------------
// 9.5 Bulk Actions (อนุมัติ / ปฏิเสธ หลายรายการพร้อมกัน)
// -------------------------------------------------------------------------
function toggleApprovalSelection(id, checked) {
    const idStr = String(id);
    if (checked) {
        selectedApprovalIds.add(idStr);
    } else {
        selectedApprovalIds.delete(idStr);
    }
    updateBulkActionBarUI();
}

function toggleSelectAllVisiblePending(checked) {
    const filteredList = getFilteredAndSortedApprovals(pendingApprovalsList);
    const displayedList = (approvalDisplayLimit === 'ALL')
        ? filteredList
        : filteredList.slice(0, Number(approvalDisplayLimit) || 25);

    displayedList.forEach(item => {
        if (item.status === 'PENDING') {
            if (checked) selectedApprovalIds.add(String(item.id));
            else selectedApprovalIds.delete(String(item.id));
        }
    });
    renderApprovalsTable(pendingApprovalsList, true);
}

function clearApprovalSelections() {
    selectedApprovalIds.clear();
    renderApprovalsTable(pendingApprovalsList, true);
}

function updateBulkActionBarUI(displayedListOverride) {
    const bar = document.getElementById('wmsApprBulkBar');
    const countEl = document.getElementById('wmsApprSelectedCount');
    if (!bar || !countEl) return;

    if (selectedApprovalIds.size > 0 && isCurrentUserAdmin()) {
        bar.classList.add('visible');
        countEl.textContent = selectedApprovalIds.size;
    } else {
        bar.classList.remove('visible');
        countEl.textContent = '0';
    }

    const selectAllCb = document.getElementById('wmsApprSelectAllCheckbox');
    if (selectAllCb && Array.isArray(displayedListOverride)) {
        const visiblePending = displayedListOverride.filter(r => r.status === 'PENDING');
        selectAllCb.checked = visiblePending.length > 0 && visiblePending.every(r => selectedApprovalIds.has(String(r.id)));
    }
}

async function bulkApproveSelectedRequests() {
    if (!isUserLoggedIn() || !isCurrentUserAdmin() || selectedApprovalIds.size === 0) return;
    const ids = Array.from(selectedApprovalIds);
    for (const id of ids) {
        await approveUserRequest(id, true);
    }
    playTTSNotification(`อนุมัติคำขอพร้อมกัน ${ids.length} รายการเรียบร้อยแล้ว`, 'success');
    if (typeof showToast === 'function') showToast(`✅ อนุมัติคำขอพร้อมกัน ${ids.length} รายการเรียบร้อยแล้ว`);
    triggerAutoUIRefresh();
    await loadPendingApprovalsFromDB(true);
}

async function bulkRejectSelectedRequests() {
    if (!isUserLoggedIn() || !isCurrentUserAdmin() || selectedApprovalIds.size === 0) return;
    const ids = Array.from(selectedApprovalIds);
    for (const id of ids) {
        await rejectUserRequest(id, true);
    }
    playTTSNotification(`ปฏิเสธคำขอพร้อมกัน ${ids.length} รายการเรียบร้อยแล้ว`, 'danger');
    if (typeof showToast === 'function') showToast(`⛔ ปฏิเสธคำขอพร้อมกัน ${ids.length} รายการเรียบร้อยแล้ว`);
    triggerAutoUIRefresh();
    await loadPendingApprovalsFromDB(true);
}

// -------------------------------------------------------------------------
// 10. ตัวกรองประวัติรายการคำขอแบบเรียลไทม์ & การตั้งค่าจำนวนแสดงผล (Default: 25)
// -------------------------------------------------------------------------
function filterApprovalsByStatus(status) {
    approvalStatusFilter = status || 'ALL';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function filterApprovalsByType(type) {
    approvalTypeFilter = type ? normalizeActionType(type) : 'ALL';
    if (type === 'ALL') approvalTypeFilter = 'ALL';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function filterApprovalsByRequester(requesterKey) {
    approvalRequesterFilter = requesterKey || 'ALL';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function filterApprovalsByApprover(approverKey) {
    approvalApproverFilter = approverKey || 'ALL';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function handleApprovalSearchInput(query) {
    approvalSearchQuery = String(query || '');
    renderApprovalsTable(pendingApprovalsList, true);
}

function changeApprovalSortOrder(order) {
    approvalSortOrder = order || 'NEWEST';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function setApprovalDisplayLimit(limitVal) {
    const wasAll = approvalDisplayLimit === 'ALL';
    approvalDisplayLimit = (limitVal === 'ALL') ? 'ALL' : (Number(limitVal) || 25);
    try {
        sessionStorage.setItem('wms_approval_display_limit_v2', String(approvalDisplayLimit));
    } catch (e) {}

    syncApprovalFilterControlsUI();
    if (approvalDisplayLimit === 'ALL' && !wasAll) {
        loadPendingApprovalsFromDB(true);
    } else {
        renderApprovalsTable(pendingApprovalsList, true);
    }
}

function toggleShowAllApprovals() {
    if (approvalDisplayLimit === 'ALL') {
        setApprovalDisplayLimit(25);
    } else {
        setApprovalDisplayLimit('ALL');
    }
}

function resetAllApprovalFilters() {
    approvalStatusFilter = 'ALL';
    approvalTypeFilter = 'ALL';
    approvalRequesterFilter = 'ALL';
    approvalApproverFilter = 'ALL';
    approvalSearchQuery = '';
    approvalSortOrder = 'NEWEST';
    selectedApprovalIds.clear();

    const searchInput = document.getElementById('wmsApprSearchInput');
    if (searchInput) searchInput.value = '';

    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function toggleApprovalTTSMute() {
    isTTSMuted = !isTTSMuted;
    try {
        localStorage.setItem('wms_approval_tts_muted', String(isTTSMuted));
    } catch (e) {}

    if (isTTSMuted && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    const btn = document.getElementById('wmsApprTTSBtn');
    if (btn) {
        btn.innerHTML = `<i class="fa-solid ${isTTSMuted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i><span>${isTTSMuted ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}</span>`;
    }
    if (typeof showToast === 'function') {
        showToast(isTTSMuted ? "🔇 ปิดเสียงแจ้งเตือนแล้ว" : "🔊 เปิดเสียงแจ้งเตือนแล้ว");
    }
}

function exportFilteredApprovalsCSV() {
    const rows = getFilteredAndSortedApprovals(pendingApprovalsList);
    if (!rows.length) {
        if (typeof showToast === 'function') showToast("⚠ ไม่มีข้อมูลสำหรับส่งออก CSV", true);
        return;
    }

    const headers = ['ลำดับ', 'วันที่เวลา', 'รหัส User ผู้ขออนุมัติ', 'Username', 'ประเภทคำขอ', 'สถานะ', 'รายละเอียด', 'รายการ S/N', 'รหัส Admin ผู้อนุมัติ'];
    const csvLines = [headers.join(',')];

    rows.forEach((r, idx) => {
        const sns = Array.isArray(r.target_sns) ? r.target_sns.join(' | ') : String(r.target_sns || '');
        const line = [
            idx + 1,
            r.created_at ? new Date(r.created_at).toLocaleString('th-TH') : '-',
            r.requester_name || '-',
            r.requester_username || '-',
            r.request_type || '-',
            r.status || '-',
            r.description || '-',
            sns,
            r.approved_by || '-'
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvLines.push(line.join(','));
    });

    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WMS_Approvals_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Global Exports (Preserved 100% + Extended Role Guard, Outbound Work Order & Filter Helpers)
window.getUserRoleClassification = getUserRoleClassification;
window.isCurrentUserAdmin = isCurrentUserAdmin;
window.isCurrentUserGeneralUser = isCurrentUserGeneralUser;
window.createPendingApprovalRequest = createPendingApprovalRequest;
window.requestOrExecuteWarehouseAction = requestOrExecuteWarehouseAction;
window.submitDeleteWithRoleGuard = submitDeleteWithRoleGuard;
window.submitOutboundDispatchWithRoleGuard = submitOutboundDispatchWithRoleGuard;
window.submitLocationTransferWithRoleGuard = submitLocationTransferWithRoleGuard;
window.executeDirectWarehouseMutation = executeDirectWarehouseMutation;
window.buildApprovedOutboundWorkOrderPayload = buildApprovedOutboundWorkOrderPayload;
window.previewOutboundWorkOrderFromApproval = previewOutboundWorkOrderFromApproval;

// Compatibility Aliases (ป้องกันการเขียนทับ requestOutboundApproval ของ outbound-db.js)
const _existingCartOutboundFn = typeof window.requestOutboundApproval === 'function' ? window.requestOutboundApproval : null;
window.submitApprovalRequest = (type, desc, targetSns, payloadData) => createPendingApprovalRequest(type, desc, targetSns, payloadData);
window.sendApprovalRequest = (type, desc, targetSns, payloadData) => createPendingApprovalRequest(type, desc, targetSns, payloadData);
window.createApprovalRequest = (type, desc, targetSns, payloadData) => createPendingApprovalRequest(type, desc, targetSns, payloadData);
window.requestDeleteApproval = (targetSns, reason, extra) => submitDeleteWithRoleGuard(targetSns, reason, extra);
window.requestTransferApproval = (targetSns, targetLocation, extra) => submitLocationTransferWithRoleGuard(targetSns, targetLocation, extra);
window.requestOutboundApproval = function(targetSns, recipient, extra) {
    if (arguments.length === 0 && typeof _existingCartOutboundFn === 'function') {
        return _existingCartOutboundFn();
    }
    return submitOutboundDispatchWithRoleGuard(targetSns, recipient, extra);
};
window.requestDispatchApproval = (targetSns, recipient, extra) => submitOutboundDispatchWithRoleGuard(targetSns, recipient, extra);

window.refreshApprovalsUI = () => loadPendingApprovalsFromDB(true);
window.navigateToApprovalCenter = navigateToApprovalCenter;
window.minimizeAdminActionPopup = minimizeAdminActionPopup;
window.expandAdminActionPopup = expandAdminActionPopup;
window.stepAdminActionPopup = stepAdminActionPopup;
window.filterApprovalsByStatus = filterApprovalsByStatus;
window.filterApprovalsByType = filterApprovalsByType;
window.filterApprovalsByRequester = filterApprovalsByRequester;
window.filterApprovalsByApprover = filterApprovalsByApprover;
window.handleApprovalSearchInput = handleApprovalSearchInput;
window.changeApprovalSortOrder = changeApprovalSortOrder;
window.setApprovalDisplayLimit = setApprovalDisplayLimit;
window.toggleShowAllApprovals = toggleShowAllApprovals;
window.resetAllApprovalFilters = resetAllApprovalFilters;
window.toggleApprovalTTSMute = toggleApprovalTTSMute;
window.exportFilteredApprovalsCSV = exportFilteredApprovalsCSV;
window.openApprovalDetailModal = openApprovalDetailModal;
window.copyApprovalSerialNumbers = copyApprovalSerialNumbers;
window.approveUserRequest = approveUserRequest;
window.rejectUserRequest = rejectUserRequest;
window.toggleApprovalSelection = toggleApprovalSelection;
window.toggleSelectAllVisiblePending = toggleSelectAllVisiblePending;
window.clearApprovalSelections = clearApprovalSelections;
window.bulkApproveSelectedRequests = bulkApproveSelectedRequests;
window.bulkRejectSelectedRequests = bulkRejectSelectedRequests;

// Auto Run Engine
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApprovalRealtimeMonitor);
} else {
    startApprovalRealtimeMonitor();
}