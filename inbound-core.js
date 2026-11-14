// =========================================================================
// --- MODULE 3.1: INBOUND CORE STATE, AUDIO, SECURITY & UI HELPERS ---
// --- Central State, Web Audio API, XSS Guard, Toast, Focus & Styles ---
// =========================================================================

let recentInboundList = [];
let fastScanLock = false;

// ⚡ Fast-Scan Memory Locking Sets (0ms Synchronous Lock Engine)
const pendingFastSnSet = new Set();
const pendingFastLocationSet = new Set();

let cachedOccupiedSet = null;
let isFeedRenderScheduled = false;

// 🚀 FIFO SCAN QUEUE & PERSISTENT DB SYNC ENGINE
const scanProcessingQueue = [];
let isProcessingScanQueue = false;
let scanSpeedCounter = 0;
let scanSpeedTimer = null;

const PERSISTENT_DB_QUEUE_KEY = 'WMS_PERSISTENT_INBOUND_SYNC_QUEUE';
let persistentDbSyncQueue = [];
let isFlushingDbQueue = false;
let dbSyncSequenceCounter = Date.now();
let networkMonitorTimer = null;

// 🎲 Batch SN Generation State
let isBatchGenerating = false;
let batchSnMonotonicSeed = 0;

// 🧭 Aisle Selection State Guard (บังคับเว้นว่าง / โปรดเลือกแถวจัดเก็บเป็นหลักจนกว่าผู้ใช้จะเลือกเอง)
let userHasSelectedAisle = false;
let aisleDropdownObserver = null;

// 🔍 Filter & Search State for Recent Inbound Feed
let recentFeedSearchQuery = '';

// 📹 CAMERA SCANNER STREAM STATE & ENGINE
let activeCameraStream = null;
let isCameraScannerActive = false;
let cameraScanInterval = null;
let html5QrCodeScanner = null;
let currentCameraFacingMode = 'environment'; // 🟢 'environment' = กล้องหลัง, 'user' = กล้องหน้า
let isTorchOn = false;
let isContinuousCameraScanMode = true; // 🟢 โหมดสแกนต่อเนื่องผ่านกล้องมือถือ
let lastCameraScannedCode = '';
let lastCameraScannedTime = 0;
let cameraSessionScanCount = 0;

// 🔊 SINGLETON WEB AUDIO API SYNTHESIZER (ไม่ค้างแม้ยิงรัวต่อเนื่อง 1,000+ ครั้ง)
let sharedWmsAudioCtx = null;

function getSharedWmsAudioContext() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!sharedWmsAudioCtx) {
            sharedWmsAudioCtx = new AudioCtx();
        }
        if (sharedWmsAudioCtx.state === 'suspended') {
            sharedWmsAudioCtx.resume().catch(() => {});
        }
        return sharedWmsAudioCtx;
    } catch (e) {
        return null;
    }
}

function playAudioFeedback(type = 'success') {
    try {
        const ctx = getSharedWmsAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        if (type === 'success') {
            const osc1 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(1760, now);
            osc1.frequency.setValueAtTime(2637, now + 0.055);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            osc1.connect(gain);
            gain.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.13);
        } else if (type === 'duplicate') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.setValueAtTime(180, now + 0.1);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'occupied') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(350, now);
            osc.frequency.linearRampToValueAtTime(150, now + 0.3);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } else {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(120, now + 0.22);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.22);
        }
    } catch (e) {}

    if (navigator.vibrate) {
        try {
            if (type === 'success') navigator.vibrate([30, 25, 30]);
            else if (type === 'duplicate') navigator.vibrate([70, 40, 70]);
            else if (type === 'occupied') navigator.vibrate([100, 50, 100]);
            else navigator.vibrate([120, 60, 120]);
        } catch (e) {}
    }
}

// 🔒 SECURITY HELPER: Prevent XSS Attack 100%
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 🔒 SECURITY GUARDS: ป้องกันการคัดลอกโค้ด & DevTools
function initFrontendSecurityGuards() {
    document.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
    }, false);

    document.addEventListener('keydown', (e) => {
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
            (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.key === 'S' || e.key === 's'))
        ) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, false);
}

// 🟢 Toast Notification Glassmorphism
function showToast(message, isError = false, duration = 3200) {
    showToastPopup(message, isError, duration);
}

function showToastPopup(message, isError = false, duration = 3200) {
    let overlay = document.getElementById('wmsToastPopupOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'wmsToastPopupOverlay';
        overlay.className = 'wms-popup-toast-overlay';
        document.body.appendChild(overlay);
    }

    const popupCard = document.createElement('div');
    popupCard.className = `wms-popup-toast-card ${isError ? 'error' : 'success'}`;

    const iconHtml = isError
        ? '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; font-size:1.35rem;"></i>'
        : '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:1.35rem;"></i>';

    popupCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; width:100%;">
            <div style="flex-shrink:0; display:flex; align-items:center;">${iconHtml}</div>
            <div style="flex:1; font-size:0.85rem; font-weight:600; color:var(--text-main, #0f172a); line-height:1.35; word-break:break-word;">
                ${escapeHTML(message)}
            </div>
            <button type="button" onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; font-size:1.1rem; color:var(--text-muted, #64748b); cursor:pointer; padding:0 2px; opacity:0.6;">&times;</button>
        </div>
    `;

    overlay.appendChild(popupCard);
    requestAnimationFrame(() => popupCard.classList.add('show'));

    setTimeout(() => {
        popupCard.classList.remove('show');
        setTimeout(() => { if (popupCard.parentNode) popupCard.parentNode.removeChild(popupCard); }, 300);
    }, duration);
}

function showBiometricSuccessToast(userName) {
    showToastPopup(`🔓 ยืนยันตัวตนสำเร็จ: ยินดีต้อนรับคุณ ${userName}`, false, 3500);
}

// 🟢 ระบบเปิด-ปิด Sidebar Responsive มือถือ
function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    let backdrop = document.getElementById('sidebarBackdrop');

    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sidebarBackdrop';
        backdrop.className = 'sidebar-backdrop';
        backdrop.onclick = toggleMobileSidebar;
        document.body.appendChild(backdrop);
    }

    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('active');
    }
}

function checkAndHideLoginOverlay() {
    const loginOverlay = document.querySelector('.login-overlay') || document.getElementById('loginOverlay') || document.getElementById('loginSection');
    const isLoggedIn = (typeof window.currentUser !== 'undefined' && window.currentUser) ||
                       (typeof currentUser !== 'undefined' && currentUser) ||
                       localStorage.getItem('WMS_ACTIVE_USER') ||
                       localStorage.getItem('WMS_USER') ||
                       localStorage.getItem('currentUser') ||
                       sessionStorage.getItem('WMS_ACTIVE_USER');

    if (loginOverlay && isLoggedIn) {
        loginOverlay.classList.add('hidden');
        loginOverlay.style.display = 'none';
        loginOverlay.style.visibility = 'hidden';
        loginOverlay.style.opacity = '0';
        loginOverlay.style.pointerEvents = 'none';
    }
}

function ensureSnInputFocus(force = false) {
    if (isCameraScannerActive) return;
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

    // ตรวจสอบว่ากำลังเปิดหน้าเมนูรับสินค้าเข้าคลังอยู่หรือไม่ (ป้องกันแย่งโฟกัสเมนูอื่น)
    const inboundSection = document.getElementById('inboundSection') || document.getElementById('tab-inbound') || snInput.closest('.tab-content, .page-section, section');
    if (inboundSection && (inboundSection.style.display === 'none' || inboundSection.classList.contains('hidden'))) {
        return;
    }

    const active = document.activeElement;
    const isOtherInputActive = active && active !== document.body && active !== snInput &&
        (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA') &&
        active.id !== 'inboundSn';

    if (!isOtherInputActive || force) {
        try {
            snInput.focus({ preventScroll: true });
        } catch (e) {
            snInput.focus();
        }
    }
}

function invalidateOccupiedLocationsCache() {
    cachedOccupiedSet = null;
    if (scanProcessingQueue.length === 0 && persistentDbSyncQueue.length === 0 && !isBatchGenerating) {
        pendingFastLocationSet.clear();
        pendingFastSnSet.clear();
    }
}

// 🟢 คืนค่าและรีเซ็ตพิกัดจากความจำ พร้อมอัปเดตช่องว่างลำดับแรกอัตโนมัติ 100%
function purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId, targetLocation = null) {
    if (!targetSn && !targetId && !targetLocation) return;

    let targetSnUpper = targetSn ? String(targetSn).trim().toUpperCase() : null;
    let targetLocUpper = targetLocation ? String(targetLocation).trim().toUpperCase() : null;

    if ((!targetLocUpper || !targetSnUpper) && typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        const matchedItem = globalInventoryData.find(item => {
            if (!item) return false;
            if (targetId && (item.id === targetId || String(item.id) === String(targetId))) return true;
            if (targetSnUpper && item.sn && String(item.sn).trim().toUpperCase() === targetSnUpper) return true;
            return false;
        });
        if (matchedItem) {
            if (!targetSnUpper && matchedItem.sn) targetSnUpper = String(matchedItem.sn).trim().toUpperCase();
            if (!targetLocUpper && matchedItem.location) targetLocUpper = String(matchedItem.location).trim().toUpperCase();
        }
    }

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        globalInventoryData = globalInventoryData.filter(item => {
            if (!item) return false;
            if (targetId && (item.id === targetId || String(item.id) === String(targetId))) return false;
            if (targetSnUpper && item.sn && String(item.sn).trim().toUpperCase() === targetSnUpper) return false;
            return true;
        });
        if (typeof window !== 'undefined') window.globalInventoryData = globalInventoryData;
    }

    if (Array.isArray(recentInboundList)) {
        recentInboundList = recentInboundList.filter(item => {
            if (!item) return false;
            if (targetId && (item.id === targetId || String(item.id) === String(targetId))) return false;
            if (targetSnUpper && item.sn && String(item.sn).trim().toUpperCase() === targetSnUpper) return false;
            return true;
        });
        saveRecentInboundFeedToCache();
    }

    if (targetSnUpper) {
        pendingFastSnSet.delete(targetSnUpper);
        const beforeLen = persistentDbSyncQueue.length;
        persistentDbSyncQueue = persistentDbSyncQueue.filter(q => String(q.payload?.sn || '').trim().toUpperCase() !== targetSnUpper);
        if (persistentDbSyncQueue.length !== beforeLen) {
            savePersistentDbQueue();
            updateInboundNetworkSyncHUD();
        }
    }

    if (targetLocUpper) {
        removeOccupiedLocFromSet(pendingFastLocationSet, targetLocUpper);
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
            removeOccupiedLocFromSet(occupiedLocationsSet, targetLocUpper);
        }
    }

    invalidateOccupiedLocationsCache();
    if (userHasSelectedAisle) {
        forceSyncAndSelectAvailableLocation(true);
    }
    scheduleDebouncedFeedRender();
}

function purgeDeletedSnFromMemory(targetSn, targetId) {
    purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId);
}

// 🟢 👤 ดึงชื่อผู้ใช้ที่ล็อกอินเข้าใช้งาน
function getCurrentUserFullName() {
    let userName = '';

    const profileElem = document.querySelector('.user-profile-badge') ||
                        document.querySelector('.user-name') ||
                        document.getElementById('userProfileBadge') ||
                        document.getElementById('currentUserNameText') ||
                        document.getElementById('userNameDisplay') ||
                        document.querySelector('.username') ||
                        document.querySelector('[data-user-name]');
    if (profileElem) {
        const fullText = profileElem.innerText || profileElem.textContent || '';
        const cleanText = fullText.replace(/\(.*\)/g, '')
                                  .replace(/[\r\n\t]/g, '')
                                  .replace(/🟢|🔴|👤|👤\s*/g, '')
                                  .replace(/เข้าสู่ระบบ|Log\s*in|Sign\s*in/gi, '')
                                  .trim();
        if (cleanText && cleanText.length > 1 && cleanText !== 'ผู้ใช้งาน') {
            userName = cleanText;
        }
    }

    if (!userName) {
        const globalUserObjs = [
            typeof window !== 'undefined' ? window.currentUser : null,
            typeof currentUser !== 'undefined' ? currentUser : null,
            typeof window !== 'undefined' ? window.loggedInUser : null,
            typeof window !== 'undefined' ? window.userProfile : null,
            typeof window !== 'undefined' ? window.WMS_USER : null,
            typeof window !== 'undefined' ? window.activeUser : null
        ];

        for (const u of globalUserObjs) {
            if (!u) continue;
            if (typeof u === 'string' && u.trim().length > 1) {
                const cleanStr = u.replace(/\(.*\)/g, '').trim();
                if (cleanStr && cleanStr.length > 1 && !cleanStr.includes('{')) {
                    userName = cleanStr;
                    break;
                }
            }
            if (typeof u === 'object') {
                const meta = u.user_metadata || u.profile || u;
                const fn = meta.first_name || meta.firstname || meta.firstName || meta.full_name || meta.fullname || meta.name || meta.display_name || u.first_name || u.firstname || u.name || '';
                const ln = meta.last_name || meta.lastname || meta.lastName || u.last_name || u.lastname || '';
                if (fn || ln) {
                    const combined = `${fn} ${ln}`.trim();
                    if (combined && combined.length > 1) {
                        userName = combined;
                        break;
                    }
                }
                if (u.email) {
                    userName = u.email.split('@')[0];
                    break;
                }
            }
        }
    }

    if (!userName) {
        const storageKeys = [
            'WMS_ACTIVE_USER', 'WMS_USER', 'currentUser', 'user', 'sb-session',
            'WMS_LOGGED_USER', 'wms_user_name', 'user_fullname', 'display_name',
            'profile', 'session', 'auth_user', 'WMS_USER_PROFILE'
        ];

        for (const key of storageKeys) {
            try {
                const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
                if (raw) {
                    if (raw.startsWith('{') || raw.startsWith('[')) {
                        const parsed = JSON.parse(raw);
                        const userObj = parsed.user || parsed.current_user || parsed.data?.user || parsed;
                        if (userObj && typeof userObj === 'object') {
                            const meta = userObj.user_metadata || userObj.profile || userObj;
                            const fn = meta.first_name || meta.firstname || meta.full_name || meta.fullname || meta.name || meta.display_name || '';
                            const ln = meta.last_name || meta.lastname || '';
                            if (fn || ln) {
                                const combined = `${fn} ${ln}`.trim();
                                if (combined && combined.length > 1) {
                                    userName = combined;
                                    break;
                                }
                            }
                            if (userObj.email) {
                                userName = userObj.email.split('@')[0];
                                break;
                            }
                        }
                    } else if (raw.trim().length > 1 && !raw.includes('{')) {
                        const cleanStr = raw.replace(/\(.*\)/g, '').trim();
                        if (cleanStr && cleanStr.length > 1) {
                            userName = cleanStr;
                            break;
                        }
                    }
                }
            } catch (e) {}
        }
    }

    if (!userName || userName.trim().length === 0) {
        userName = 'เจ้าหน้าที่คลังสินค้า';
    }

    return userName.trim();
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function injectModernScanUIStyles() {
    if (document.getElementById('fastScanModernStyles')) return;
    const styleElem = document.createElement('style');
    styleElem.id = 'fastScanModernStyles';
    styleElem.textContent = `
        .full-sn-text {
            word-break: break-all !important;
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            font-family: var(--font-mono, 'JetBrains Mono', monospace);
            font-weight: 700;
            color: var(--text-main, #0f172a);
            letter-spacing: -0.2px;
        }

        /* 🎲 Batch SN Generator Bar (เต็มความกว้างใต้ช่อง S/N และเลขมิเตอร์) */
        .wms-batch-sn-bar {
            grid-column: 1 / -1;
            width: 100%;
            box-sizing: border-box;
            margin: 10px 0 14px 0;
            padding: 12px 14px;
            border-radius: 14px;
            background: linear-gradient(135deg, rgba(240, 249, 255, 0.92), rgba(224, 242, 254, 0.72));
            border: 1px solid var(--primary-border, #bae6fd);
            box-shadow: 0 4px 14px rgba(2, 132, 199, 0.06);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .wms-batch-sn-bar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .wms-batch-icon-pill {
            width: 30px;
            height: 30px;
            border-radius: 9px;
            background: var(--primary, #0284c7);
            color: #ffffff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.85rem;
            flex-shrink: 0;
            box-shadow: 0 3px 8px rgba(2, 132, 199, 0.25);
        }
        .wms-batch-sn-btn-row {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            width: 100%;
        }
        .btn-batch-sn-preset {
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--primary-border, #bae6fd);
            color: var(--primary-text, #0369a1);
            border-radius: 10px;
            padding: 9px 10px;
            font-size: 0.8rem;
            font-weight: 800;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-height: 38px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }
        .btn-batch-sn-preset:hover:not(:disabled) {
            background: var(--primary, #0284c7);
            color: #ffffff;
            border-color: var(--primary, #0284c7);
            transform: translateY(-1px);
            box-shadow: 0 6px 14px rgba(2, 132, 199, 0.22);
        }
        .btn-batch-sn-preset.highlight {
            background: linear-gradient(135deg, #0284c7, #0369a1);
            color: #ffffff;
            border-color: #0369a1;
        }
        .btn-batch-sn-preset.highlight:hover:not(:disabled) {
            background: linear-gradient(135deg, #0369a1, #075985);
        }
        .btn-batch-sn-preset.custom {
            background: var(--bg-subtle, #f8fafc);
            color: var(--text-main, #0f172a);
            border-color: var(--border-strong, #cbd5e1);
        }
        .btn-batch-sn-preset.custom:hover:not(:disabled) {
            background: #0f172a;
            color: #ffffff;
            border-color: #0f172a;
        }

        .scan-flash-success { animation: scanFlashGreen 0.28s cubic-bezier(0.4, 0, 0.2, 1) !important; }
        .scan-flash-error { animation: scanFlashRed 0.28s cubic-bezier(0.4, 0, 0.2, 1) !important; }
        @keyframes scanFlashGreen {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.85); border-color: #10b981 !important; background: #ecfdf5 !important; }
            50% { box-shadow: 0 0 20px 4px rgba(16, 185, 129, 0.5); border-color: #10b981 !important; background: #d1fae5 !important; }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes scanFlashRed {
            0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.85); border-color: #ef4444 !important; background: #fef2f2 !important; }
            50% { box-shadow: 0 0 20px 4px rgba(239, 68, 68, 0.5); border-color: #ef4444 !important; background: #fee2e2 !important; }
            100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        .pulse-live-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            box-shadow: 0 0 10px #10b981;
            animation: pulseLiveDot 1.2s infinite alternate;
            flex-shrink: 0;
        }
        .net-dot.offline {
            display: inline-block;
            width: 9px;
            height: 9px;
            background: #f97316;
            border-radius: 50%;
            box-shadow: 0 0 10px #f97316;
            animation: pulseLiveDot 0.9s infinite alternate;
            flex-shrink: 0;
        }
        @keyframes pulseLiveDot {
            from { opacity: 0.45; transform: scale(0.85); }
            to { opacity: 1; transform: scale(1.2); }
        }

        .wms-network-sync-hud {
            margin-bottom: 12px;
            padding: 10px 14px;
            border-radius: 14px;
            border: 1px solid #a7f3d0;
            background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
            transition: all 0.25s ease;
        }
        .wms-network-sync-hud.offline {
            border-color: #fdba74;
            background: linear-gradient(135deg, #fff7ed, #ffedd5);
        }
        .wms-network-sync-hud.syncing {
            border-color: #7dd3fc;
            background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
        }

        .glass-hud-box {
            margin-top: 14px;
            padding: 16px;
            background: rgba(255, 255, 255, 0.85);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
            font-size: 0.84rem;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }
        .feed-card-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .btn-card-action {
            background: var(--bg-subtle, #f8fafc);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 8px;
            padding: 5px 10px;
            font-size: 0.74rem;
            font-weight: 600;
            color: var(--text-sub, #475569);
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: inline-flex;
            align-items: center;
            gap: 4px;
            min-height: 32px;
        }
        .btn-card-action:hover {
            background: var(--primary-light, #e0f2fe);
            color: var(--primary-text, #0284c7);
            border-color: var(--primary-border, #bae6fd);
            transform: translateY(-1px);
        }
        .btn-card-action.btn-card-delete:hover {
            background: #fee2e2 !important;
            color: #ef4444 !important;
            border-color: #fca5a5 !important;
        }
        .modern-feed-card {
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 14px;
            padding: 12px 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
            transition: all 0.25s ease;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .modern-feed-card:hover {
            box-shadow: 0 10px 24px rgba(0,0,0,0.08);
            border-color: var(--primary-border, #bae6fd);
            transform: translateY(-2px);
        }

        /* 📱 Responsive All Screen Sizes & Mobile OS (iOS / Android) */
        @media (max-width: 768px) {
            #inboundSn,
            #skuSearchInput,
            #inboundCategory,
            #inboundName,
            #inboundMeter,
            #inboundAisleSelect,
            #inboundBaySelect,
            #inboundShelfSelect,
            #inboundSlotSelect,
            #recentFeedSearchInput {
                font-size: 16px !important; /* ป้องกัน iOS Safari Auto-Zoom เวลาโฟกัสช่องสแกน */
                min-height: 44px;
            }
            #btnOpenCameraController,
            #cameraScanBtn {
                min-width: 44px;
                min-height: 44px;
                touch-action: manipulation;
            }
            .wms-batch-sn-btn-row {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .inbound-feed-scroll-wrapper {
                max-height: 62dvh !important;
            }
        }
        @media (max-width: 420px) {
            .inbound-feed-grid {
                grid-template-columns: 1fr !important;
            }
            .camera-scanner-card {
                padding: 12px !important;
                border-radius: 18px !important;
            }
        }
    `;
    document.head.appendChild(styleElem);
}