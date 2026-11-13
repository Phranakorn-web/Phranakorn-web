// =========================================================================
// --- MODULE 3: FAST INBOUND DATABASE ENGINE (ENTERPRISE REALTIME v7.0.0) ---
// --- High-Speed Queue, Offline-First Sync, Blank Aisle Default & Mobile Cam ---
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
    if (scanProcessingQueue.length === 0 && persistentDbSyncQueue.length === 0) {
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

// 🗑️ ระบบลบรายการสินค้าในหน้า Feed แบบ Realtime 100%
async function deleteInboundItem(sn, id = '', location = '') {
    if (!sn && !id) return;

    if (!confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบรายการ S/N: ${sn} ออกจากฐานข้อมูลคลังสินค้า?`)) {
        return;
    }

    // 1. ลบออกจากหน่วยความจำ Local และ Cache ทันที (0ms Synchronous UI Update)
    purgeDispatchedOrDeletedItemFromMemory(sn, id, location);

    // 2. ลบออกจาก Supabase Database ในเบื้องหลัง 100%
    if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
        try {
            let query = _supabase.from('warehouse_items').delete();
            if (id) {
                query = query.eq('id', id);
            } else if (sn) {
                query = query.eq('sn', sn);
            }
            const { error } = await query;
            if (error) {
                console.error("Supabase delete error:", error);
                showToast(`⚠️ เกิดข้อผิดพลาดในการลบข้อมูลจากเซิร์ฟเวอร์: ${error.message}`, true);
            } else {
                showToast(`🗑️ ลบรายการ S/N: ${sn} ออกจากฐานข้อมูลเรียบร้อยแล้ว`, false);
            }
        } catch (err) {
            console.error("DB Delete Exception:", err);
        }
    }

    // 3. กระจายคำสั่งลบไปยัง Tab อื่นๆ แบบ Cross-Tab Realtime
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.postMessage({ action: 'DELETE', sn, id, location });
        }
    } catch (e) {}

    if (userHasSelectedAisle) {
        forceSyncAndSelectAvailableLocation(true);
    }
}

// 🟢 ดึงและแยกองค์ประกอบพิกัดจัดเก็บอย่างถูกต้องแม่นยำ 100%
function parseLocComponentsInternal(locStr) {
    if (!locStr) return null;
    let raw = String(locStr).trim().toUpperCase();
    raw = raw.replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    const specialList = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
    if (specialList.includes(raw)) {
        return { isSpecial: true, code: raw };
    }

    let codeOnly = raw.replace(/แถว|ล็อก|ชั้น|ช่อง|BAY|SHELF|SLOT|•|📍/gi, ' ').trim();
    let parts = codeOnly.split(/[\-\/_ \t]+/).filter(Boolean);

    if (parts.length >= 4) {
        const aisleName = parts[0].trim().toUpperCase();
        const bayNum = parseInt(parts[1], 10);
        const shelfNum = parseInt(parts[2], 10);
        const slotRaw = parts[3].trim().toUpperCase();

        if (aisleName && !isNaN(bayNum) && !isNaN(shelfNum)) {
            const cfg = getAisleConfig(aisleName);
            const maxShelves = cfg ? (cfg.shelves || 10) : 10;
            const validShelf = (shelfNum > maxShelves && maxShelves > 0) ? Math.min(shelfNum, maxShelves) : shelfNum;
            const slotVal = slotRaw === 'FULL' ? 'FULL' : String(parseInt(slotRaw, 10) || 1).padStart(2, '0');

            return {
                isSpecial: false,
                aisle: aisleName,
                bay: String(bayNum).padStart(2, '0'),
                shelf: String(validShelf).padStart(2, '0'),
                slot: slotVal
            };
        }
    }

    const thaiMatch = raw.match(/แถว\s*([A-Z0-9]+)\s*ล็อก\s*(\d+)\s*ชั้น\s*(\d+)\s*ช่อง\s*(\d+|FULL)/i) ||
                      raw.match(/แถว\s*([A-Z0-9]+)(?:.*?ล็อก\s*(\d+))(?:.*?ชั้น\s*(\d+))(?:.*?ช่อง\s*(\d+|FULL))/i);
    if (thaiMatch && thaiMatch[1]) {
        const aisleName = thaiMatch[1].trim().toUpperCase();
        const bayNum = parseInt(thaiMatch[2], 10) || 1;
        const shelfNum = parseInt(thaiMatch[3], 10) || 1;
        const cfg = getAisleConfig(aisleName);
        const maxShelves = cfg ? (cfg.shelves || 10) : 10;
        const validShelf = (shelfNum > maxShelves && maxShelves > 0) ? Math.min(shelfNum, maxShelves) : shelfNum;
        const slotVal = thaiMatch[4] === 'FULL' ? 'FULL' : String(parseInt(thaiMatch[4], 10) || 1).padStart(2, '0');

        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(bayNum).padStart(2, '0'),
            shelf: String(validShelf).padStart(2, '0'),
            slot: slotVal
        };
    }

    if (parts.length === 3) {
        const aisleName = parts[0].trim().toUpperCase();
        const bayNum = parseInt(parts[1], 10) || 1;
        const shelfNum = parseInt(parts[2], 10) || 1;
        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(bayNum).padStart(2, '0'),
            shelf: String(shelfNum).padStart(2, '0'),
            slot: '01'
        };
    }

    let p = null;
    if (typeof window !== 'undefined' && typeof window.parseLocationComponents === 'function') {
        p = window.parseLocationComponents(raw);
    } else if (typeof parseLocationComponents === 'function') {
        p = parseLocationComponents(raw);
    }

    if (p && p.aisle && p.bay) {
        const aisleName = String(p.aisle).trim().toUpperCase();
        const cfg = getAisleConfig(aisleName);
        const maxShelves = cfg ? (cfg.shelves || 10) : 10;
        const rawShelf = parseInt(p.shelf, 10) || 1;
        const validShelf = (rawShelf > maxShelves && maxShelves > 0) ? Math.min(rawShelf, maxShelves) : rawShelf;

        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(parseInt(p.bay, 10) || 1).padStart(2, '0'),
            shelf: String(validShelf).padStart(2, '0'),
            slot: String(parseInt(p.slot, 10) || 1).padStart(2, '0')
        };
    }

    return null;
}

function addOccupiedLocToSet(targetSet, loc) {
    if (!loc || !(targetSet instanceof Set)) return;
    const rawUpper = String(loc).trim().toUpperCase();
    if (!rawUpper) return;

    targetSet.add(rawUpper);
    const normKey = getNormalizedLocKey(rawUpper);
    if (normKey) targetSet.add(normKey);

    const p = parseLocComponentsInternal(rawUpper);
    if (p && !p.isSpecial) {
        const standardKey = `${p.aisle}-${p.bay}-${p.shelf}-${p.slot}`;
        targetSet.add(standardKey);
        targetSet.add(formatLocationSpaced(standardKey));
        targetSet.add(`${p.aisle}-${parseInt(p.bay, 10)}-${parseInt(p.shelf, 10)}-${parseInt(p.slot, 10)}`);
    }
}

function removeOccupiedLocFromSet(targetSet, loc) {
    if (!loc || !(targetSet instanceof Set)) return;
    const rawUpper = String(loc).trim().toUpperCase();
    if (!rawUpper) return;

    targetSet.delete(rawUpper);
    const normKey = getNormalizedLocKey(rawUpper);
    if (normKey) targetSet.delete(normKey);

    const p = parseLocComponentsInternal(rawUpper);
    if (p && !p.isSpecial) {
        const standardKey = `${p.aisle}-${p.bay}-${p.shelf}-${p.slot}`;
        targetSet.delete(standardKey);
        targetSet.delete(formatLocationSpaced(standardKey));
        targetSet.delete(`${p.aisle}-${parseInt(p.bay, 10)}-${parseInt(p.shelf, 10)}-${parseInt(p.slot, 10)}`);
    }
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

function getAisleConfig(aisleName) {
    const key = String(aisleName || '').trim().toUpperCase();
    if (!key || key === 'SELECT' || key === 'NONE' || key.includes('โปรดเลือก')) {
        return { bays: 0, shelves: 0, slots: 0 };
    }

    const findInObj = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj[key]) return obj[key];
        const foundKey = Object.keys(obj).find(k => String(k).trim().toUpperCase() === key);
        return foundKey ? obj[foundKey] : null;
    };

    const findInArray = (arr) => {
        if (!Array.isArray(arr)) return null;
        return arr.find(item => {
            if (!item) return false;
            const name = typeof item === 'object' ? (item.name || item.aisle || item.key || item.code || item.title || '') : String(item);
            return String(name).trim().toUpperCase() === key;
        });
    };

    let cfg = findInObj(typeof window !== 'undefined' && window.aisleConfigs) ||
              findInObj(typeof aisleConfigs !== 'undefined' ? aisleConfigs : null) ||
              findInObj(typeof window !== 'undefined' && window.masterWarehouseConfigs) ||
              findInObj(typeof masterWarehouseConfigs !== 'undefined' ? masterWarehouseConfigs : null);

    if (!cfg) {
        const itemInMaster = findInArray(typeof window !== 'undefined' && window.masterAisles) ||
                             findInArray(typeof masterAisles !== 'undefined' ? masterAisles : null);
        if (itemInMaster && typeof itemInMaster === 'object') cfg = itemInMaster;
    }

    if (!cfg && typeof localStorage !== 'undefined') {
        try {
            const localCfg = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (localCfg) cfg = findInObj(JSON.parse(localCfg));

            if (!cfg) {
                const localMaster = localStorage.getItem('WMS_MASTER_AISLES');
                if (localMaster) {
                    const parsedMaster = JSON.parse(localMaster);
                    const found = findInArray(parsedMaster) || findInObj(parsedMaster);
                    if (found && typeof found === 'object') cfg = found;
                }
            }
        } catch (e) {}
    }

    if (cfg) {
        const bays = parseInt(cfg.bays || cfg.bay || cfg.baysCount || cfg.totalBays || cfg.bayCount, 10);
        const shelves = parseInt(cfg.shelves || cfg.shelf || cfg.shelvesCount || cfg.totalShelves || cfg.shelfCount, 10);
        const slots = parseInt(cfg.slots || cfg.slot || cfg.slotsCount || cfg.totalSlots || cfg.slotCount, 10);
        return {
            bays: (!isNaN(bays) && bays >= 0) ? bays : 10,
            shelves: (!isNaN(shelves) && shelves >= 0) ? shelves : 3,
            slots: (!isNaN(slots) && slots >= 0) ? slots : 10
        };
    }
    return { bays: 10, shelves: 3, slots: 10 };
}

function getNormalizedLocKey(locStr) {
    if (!locStr) return '';
    let clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) return clean;

    const parsed = parseLocComponentsInternal(clean);
    if (parsed) {
        if (parsed.isSpecial) return parsed.code;
        return `${parsed.aisle}-${parsed.bay}-${parsed.shelf}-${parsed.slot}`;
    }
    return clean;
}

function normalizeLocationStandard(locStr) {
    return getNormalizedLocKey(locStr);
}

function formatLocationSpaced(locStr) {
    if (!locStr || locStr.includes('โปรดเลือก')) return '-';
    const clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return clean;
    }

    const p = parseLocComponentsInternal(clean);
    if (p && !p.isSpecial) {
        const isFull = clean.endsWith('-FULL') || clean.includes('FULL');
        const slotStr = isFull ? 'FULL' : p.slot;
        return `แถว ${p.aisle} • ล็อก ${p.bay} • ชั้น ${p.shelf} • ช่อง ${slotStr}`;
    }

    return clean.replace(/[\-_]/g, ' • ');
}

function formatLocationCode(locStr) {
    return formatLocationSpaced(locStr);
}

function formatLocationBadgeHTML(locStr) {
    if (!locStr || locStr === 'SELECT' || locStr === '' || locStr.includes('โปรดเลือก')) {
        return `<span class="loc-badge-container compact unselected"><span class="loc-segment">⚠️ โปรดเลือกแถวจัดเก็บ</span></span>`;
    }

    const clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return `<span class="loc-badge-container compact special"><span class="loc-segment loc-aisle">📍 โซนพิเศษ: ${escapeHTML(clean)}</span></span>`;
    }

    const p = parseLocComponentsInternal(clean);
    if (p && !p.isSpecial) {
        const isFull = clean.endsWith('-FULL') || clean.includes('FULL');
        const slotStr = isFull ? 'FULL' : p.slot;

        return `
            <span class="loc-badge-container compact ${isFull ? 'full-slot' : ''}" title="${escapeHTML(clean)}">
                <span class="loc-segment loc-aisle"><i class="fa-solid fa-layer-group" style="font-size:0.7rem; margin-right:3px;"></i> แถว ${escapeHTML(p.aisle)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-bay">ล็อก ${escapeHTML(p.bay)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-shelf">ชั้น ${escapeHTML(p.shelf)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-slot ${isFull ? 'full' : ''}">ช่อง ${escapeHTML(slotStr)}</span>
            </span>
        `.trim();
    }

    return `<span class="loc-badge-container compact"><span class="loc-segment">📍 ${escapeHTML(clean)}</span></span>`;
}

function getOccupyingSnDetails(locStr) {
    if (!locStr) return null;
    const targetKey = getNormalizedLocKey(locStr);
    const searchTarget = String(locStr).trim().toUpperCase();

    const checkList = (list) => {
        if (!Array.isArray(list)) return null;
        for (const item of list) {
            if (!item) continue;
            const isOut = item.status === 'OUT' || item.status === 'DISPATCHED' || item.status === 'ISSUED' || item.status === 'RELEASED' || item.is_deleted || Number(item.qty) <= 0;
            if (isOut) continue;

            if (item.location) {
                const itemRaw = String(item.location).trim().toUpperCase();
                const itemKey = getNormalizedLocKey(item.location);
                if (itemRaw === searchTarget || (itemKey && targetKey && itemKey === targetKey)) {
                    return item;
                }
            }
        }
        return null;
    };

    let found = checkList(typeof globalInventoryData !== 'undefined' ? globalInventoryData : null);
    if (!found) found = checkList(typeof offlineInboundQueue !== 'undefined' ? offlineInboundQueue : null);
    if (!found) found = checkList(typeof recentInboundList !== 'undefined' ? recentInboundList : null);
    if (!found && Array.isArray(persistentDbSyncQueue)) {
        found = checkList(persistentDbSyncQueue.map(q => q && q.payload));
    }

    return found;
}

function getAllOccupiedLocationsSet() {
    if (cachedOccupiedSet) {
        pendingFastLocationSet.forEach(loc => addOccupiedLocToSet(cachedOccupiedSet, loc));
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
            occupiedLocationsSet.forEach(loc => addOccupiedLocToSet(cachedOccupiedSet, loc));
        }
        return cachedOccupiedSet;
    }

    const occupied = new Set();
    const isItemOccupying = (item) => {
        if (!item) return false;
        const statusUpper = String(item.status || '').toUpperCase();
        if (statusUpper === 'OUT' || statusUpper === 'DISPATCHED' || statusUpper === 'ISSUED' || statusUpper === 'RELEASED' || item.is_deleted || Number(item.qty) <= 0) {
            return false;
        }
        return true;
    };

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        for (let i = 0; i < globalInventoryData.length; i++) {
            const item = globalInventoryData[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        for (let i = 0; i < offlineInboundQueue.length; i++) {
            const item = offlineInboundQueue[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (Array.isArray(persistentDbSyncQueue)) {
        for (let i = 0; i < persistentDbSyncQueue.length; i++) {
            const item = persistentDbSyncQueue[i] && persistentDbSyncQueue[i].payload;
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList)) {
        for (let i = 0; i < recentInboundList.length; i++) {
            const item = recentInboundList[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
        occupiedLocationsSet.forEach(loc => addOccupiedLocToSet(occupied, loc));
    }

    pendingFastLocationSet.forEach(loc => addOccupiedLocToSet(occupied, loc));

    cachedOccupiedSet = occupied;
    return cachedOccupiedSet;
}

function calculateNextAvailableSlotInShelf(aisleName, bayName, shelfName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    const bayNum = parseInt(bayName, 10) || 1;
    const shelfNum = parseInt(shelfName, 10) || 1;
    const pad2 = (num) => String(num).padStart(2, '0');
    const bayStr = pad2(bayNum);
    const shelfStr = pad2(shelfNum);

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก') || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return { isFull: false, location: aisle, bay: '00', shelf: '00', slot: '00', freeSlots: 0, occupiedCount: 0, shelfCapacity: 0 };
    }

    const cfg = getAisleConfig(aisle);
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const occupied = getAllOccupiedLocationsSet();

    let shelfOccupiedCount = 0;
    let targetSlot = 0;
    let foundAvailable = false;

    for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
        const slStr = pad2(sl);
        const candNorm = `${aisle}-${bayStr}-${shelfStr}-${slStr}`;

        const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

        if (isOccupied) {
            shelfOccupiedCount++;
        } else if (!foundAvailable) {
            targetSlot = sl;
            foundAvailable = true;
        }
    }

    const freeSlots = Math.max(0, totalSlotsPerShelf - shelfOccupiedCount);

    if (!foundAvailable || freeSlots === 0) {
        return {
            isFull: true,
            location: `${aisle}-${bayStr}-${shelfStr}-FULL`,
            bay: bayStr,
            shelf: shelfStr,
            slot: '00',
            shelfCapacity: totalSlotsPerShelf,
            occupiedCount: shelfOccupiedCount,
            freeSlots: 0
        };
    }

    return {
        isFull: false,
        location: `${aisle}-${bayStr}-${shelfStr}-${pad2(targetSlot)}`,
        bay: bayStr,
        shelf: shelfStr,
        slot: pad2(targetSlot),
        shelfCapacity: totalSlotsPerShelf,
        occupiedCount: shelfOccupiedCount,
        freeSlots: freeSlots
    };
}

function calculateNextAvailableSlotInBayStrictAisle(aisleName, bayName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    const bayNum = parseInt(bayName, 10) || 1;
    const pad2 = (num) => String(num).padStart(2, '0');
    const bayStr = pad2(bayNum);

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก') || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return { isFull: false, location: aisle, bay: '00', shelf: '00', slot: '00', bayCapacity: 0, freeSlots: 0, occupiedCount: 0 };
    }

    const cfg = getAisleConfig(aisle);
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const bayCapacity = totalShelves * totalSlotsPerShelf;
    const occupied = getAllOccupiedLocationsSet();

    let bayOccupiedCount = 0;
    let targetShelf = 0;
    let targetSlot = 0;
    let foundAvailable = false;

    for (let s = 1; s <= totalShelves; s++) {
        for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
            const slStr = pad2(sl);
            const sStr = pad2(s);
            const candNorm = `${aisle}-${bayStr}-${sStr}-${slStr}`;

            const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

            if (isOccupied) {
                bayOccupiedCount++;
            } else if (!foundAvailable) {
                targetShelf = s;
                targetSlot = sl;
                foundAvailable = true;
            }
        }
    }

    const freeSlots = Math.max(0, bayCapacity - bayOccupiedCount);

    if (!foundAvailable || freeSlots === 0) {
        return {
            isFull: true,
            location: `${aisle}-${bayStr}-FULL`,
            bay: bayStr,
            shelf: '00',
            slot: '00',
            bayCapacity: bayCapacity,
            occupiedCount: bayOccupiedCount,
            freeSlots: 0
        };
    }

    return {
        isFull: false,
        location: `${aisle}-${bayStr}-${pad2(targetShelf)}-${pad2(targetSlot)}`,
        bay: bayStr,
        shelf: pad2(targetShelf),
        slot: pad2(targetSlot),
        bayCapacity: bayCapacity,
        occupiedCount: bayOccupiedCount,
        freeSlots: freeSlots
    };
}

function calculateAisleCapacityAndNextSlot(aisleName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก')) {
        return { location: 'โปรดเลือกแถวจัดเก็บ', bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0, isFull: true };
    }

    const specialLocations = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
    if (specialLocations.includes(aisle)) {
        return { location: aisle, bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0, isFull: false };
    }

    const cfg = getAisleConfig(aisle);

    const totalBays = parseInt(cfg.bays || cfg.bay, 10) || 10;
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const totalCapacity = totalBays * totalShelves * totalSlotsPerShelf;

    const occupied = getAllOccupiedLocationsSet();

    let aisleOccupiedCount = 0;
    for (let b = 1; b <= totalBays; b++) {
        for (let s = 1; s <= totalShelves; s++) {
            for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
                const bStr = String(b).padStart(2, '0');
                const sStr = String(s).padStart(2, '0');
                const slStr = String(sl).padStart(2, '0');
                const candNorm = `${aisle}-${bStr}-${sStr}-${slStr}`;
                if (occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm))) {
                    aisleOccupiedCount++;
                }
            }
        }
    }

    const freeSlots = Math.max(0, totalCapacity - aisleOccupiedCount);
    const pad2 = (num) => String(num).padStart(2, '0');

    let nextLocation = `${aisle}-FULL`;
    let targetBay = 0, targetShelf = 0, targetSlot = 0;
    let found = false;

    for (let b = 1; b <= totalBays; b++) {
        for (let s = 1; s <= totalShelves; s++) {
            for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
                const bStr = pad2(b);
                const sStr = pad2(s);
                const slStr = pad2(sl);
                const candNorm = `${aisle}-${bStr}-${sStr}-${slStr}`;

                if (!occupied.has(candNorm) && !occupied.has(getNormalizedLocKey(candNorm)) && !occupied.has(formatLocationSpaced(candNorm))) {
                    nextLocation = candNorm;
                    targetBay = b;
                    targetShelf = s;
                    targetSlot = sl;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (found) break;
    }

    return {
        location: nextLocation,
        bay: targetBay,
        shelf: targetShelf,
        slot: targetSlot,
        totalSlots: totalCapacity,
        occupiedCount: aisleOccupiedCount,
        freeSlots: freeSlots,
        baysConfigured: totalBays,
        shelvesConfigured: totalShelves,
        slotsConfigured: totalSlotsPerShelf,
        isFull: !found
    };
}

function populateInboundSlotDropdown(aisle, bay, shelf) {
    const slotSelect = document.getElementById('inboundSlotSelect');
    if (!slotSelect) return '01';

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก')) {
        slotSelect.innerHTML = `<option value="" selected>-- โปรดเลือกแถวก่อน --</option>`;
        slotSelect.disabled = true;
        return '';
    }

    const cfg = getAisleConfig(aisle);
    const totalSlots = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const occupied = getAllOccupiedLocationsSet();
    const pad2 = (n) => String(n).padStart(2, '0');

    let slotHtml = '';
    let autoSelectedSlot = '';

    const bayStr = pad2(bay);
    const shelfNum = parseInt(shelf, 10) || 1;
    const shelfStr = pad2(shelfNum);

    for (let sl = 1; sl <= totalSlots; sl++) {
        const slStr = pad2(sl);
        const candNorm = `${aisle}-${bayStr}-${shelfStr}-${slStr}`;

        const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

        if (isOccupied) {
            const item = getOccupyingSnDetails(candNorm);
            const snLabel = item && item.sn ? ` - SN: ${item.sn}` : '';
            slotHtml += `<option value="${slStr}" disabled style="color:#ef4444; background:#fef2f2;">🔴 ช่อง ${slStr} (ไม่ว่าง${snLabel})</option>`;
        } else {
            if (!autoSelectedSlot) {
                autoSelectedSlot = slStr;
            }
            slotHtml += `<option value="${slStr}">🟢 ช่อง ${slStr} (ว่าง)</option>`;
        }
    }

    slotSelect.innerHTML = slotHtml;

    if (autoSelectedSlot) {
        slotSelect.value = autoSelectedSlot;
    } else if (slotSelect.options.length > 0) {
        slotSelect.value = slotSelect.options[0].value;
    }

    return autoSelectedSlot;
}

// 🟢 🎯 บังคับค่าเริ่มต้นของ "แถวจัดเก็บ" ให้เว้นว่าง / แสดง "-- โปรดเลือกแถวจัดเก็บ --" เป็นหลักเสมอ
function populateInboundAisleDropdown(preserveUserChoice = false) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (!aisleSelect) return;

    const prevVal = preserveUserChoice && userHasSelectedAisle ? (aisleSelect.value || '').trim().toUpperCase() : '';

    let aislesList = [];
    if (typeof window !== 'undefined' && Array.isArray(window.masterAisles) && window.masterAisles.length > 0) {
        aislesList = window.masterAisles.map(a => typeof a === 'object' ? (a.name || a.aisle || a.key || a.code || a) : a);
    } else if (typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem('WMS_MASTER_AISLES');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) aislesList = parsed.map(a => typeof a === 'object' ? (a.name || a.aisle || a.key || a.code || a) : a);
            }
        } catch (e) {}
    }

    if (aislesList.length === 0) {
        aislesList = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    }

    const cleanAisles = [];
    const seen = new Set();
    aislesList.forEach(a => {
        const str = String(a || '').trim().toUpperCase();
        if (str && str !== 'DOCK' && str !== 'SELECT' && str !== 'NONE' && !str.includes('โปรดเลือก') && !seen.has(str)) {
            seen.add(str);
            cleanAisles.push(str);
        }
    });

    // 🟢 ใส่ "-- โปรดเลือกแถวจัดเก็บ --" (value="") เป็นตัวเลือกหลักและค่าเริ่มต้นเสมอ (ไม่เลือกแถวในคลังอัตโนมัติ)
    let html = `<option value="" ${!prevVal ? 'selected' : ''}>-- โปรดเลือกแถวจัดเก็บ --</option>`;
    html += `<option value="DOCK" ${prevVal === 'DOCK' ? 'selected' : ''}>📍 โซนลาน DOCK (รับฝากชั่วคราว)</option>`;

    cleanAisles.forEach(cleanA => {
        html += `<option value="${escapeHTML(cleanA)}" ${prevVal === cleanA ? 'selected' : ''}>แถว ${escapeHTML(cleanA)}</option>`;
    });

    aisleSelect.innerHTML = html;
    aisleSelect.value = prevVal || '';
}

// 🟢 ป้องกันไม่ให้สคริปต์ภายนอกบังคับเปลี่ยนค่าเริ่มต้นของ #inboundAisleSelect
function installAisleDropdownBlankGuard() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (!aisleSelect || aisleDropdownObserver) return;

    aisleDropdownObserver = new MutationObserver(() => {
        const firstOpt = aisleSelect.options[0];
        const hasPlaceholder = firstOpt && firstOpt.value === '' && firstOpt.text.includes('โปรดเลือก');

        if (!hasPlaceholder) {
            const placeholderOpt = document.createElement('option');
            placeholderOpt.value = '';
            placeholderOpt.textContent = '-- โปรดเลือกแถวจัดเก็บ --';
            aisleSelect.insertBefore(placeholderOpt, aisleSelect.firstChild);
        }

        if (!userHasSelectedAisle && aisleSelect.value !== '') {
            aisleSelect.value = '';
            populateInboundLocationDropdownsStrict('');
        }
    });

    aisleDropdownObserver.observe(aisleSelect, { childList: true });
}

// 🟢 🎯 คำนวณอัปเดตพิกัดแบบ Strict โดยหากยังไม่ได้เลือกแถว จะเว้นว่างและปิดล็อกตัวเลือกอื่น ๆ
function populateInboundLocationDropdownsStrict(aisleName, keepBay = null, autoSelectFirstAvailable = false) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (!aisleSelect) return;

    if (aisleSelect.options.length <= 1 || !aisleSelect.options[0] || aisleSelect.options[0].value !== '') {
        populateInboundAisleDropdown(true);
    }

    let aisle = (aisleName !== undefined && aisleName !== null) ? aisleName : (userHasSelectedAisle ? aisleSelect.value : '');
    aisle = String(aisle || '').trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    if (!baySelect || !shelfSelect || !slotSelect) return;

    // 🟢 บังคับให้เว้นว่างหากยังไม่ได้เลือกแถวจัดเก็บ
    if (!aisle || aisle === 'SELECT' || aisle === '' || aisle.includes('โปรดเลือก')) {
        aisleSelect.value = '';
        baySelect.innerHTML = `<option value="" selected>-- โปรดเลือกแถวก่อน --</option>`;
        shelfSelect.innerHTML = `<option value="" selected>-- โปรดเลือกแถวก่อน --</option>`;
        slotSelect.innerHTML = `<option value="" selected>-- โปรดเลือกแถวก่อน --</option>`;
        baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = true;
        updateInboundLocationPreviewFromDropdowns();
        return;
    }

    aisleSelect.value = aisle;

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        baySelect.innerHTML = `<option value="00">00 (โซนพิเศษ)</option>`;
        shelfSelect.innerHTML = `<option value="00">00 (โซนพิเศษ)</option>`;
        slotSelect.innerHTML = `<option value="00">00 (โซนพิเศษ)</option>`;
        baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = true;
        updateInboundLocationPreviewFromDropdowns();
        ensureSnInputFocus();
        return;
    }

    baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = false;

    const cfg = getAisleConfig(aisle);
    const totalBays = parseInt(cfg.bays || cfg.bay, 10) || 10;
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;

    let bayHtml = '';
    for (let b = 1; b <= totalBays; b++) {
        const bStr = String(b).padStart(2, '0');
        bayHtml += `<option value="${bStr}">ล็อก ${bStr}</option>`;
    }
    baySelect.innerHTML = bayHtml;

    let shelfHtml = '';
    for (let s = 1; s <= totalShelves; s++) {
        const sStr = String(s).padStart(2, '0');
        shelfHtml += `<option value="${sStr}">ชั้น ${sStr}</option>`;
    }
    shelfSelect.innerHTML = shelfHtml;

    const aisleDetails = calculateAisleCapacityAndNextSlot(aisle);

    let targetBayStr = '01';

    if ((autoSelectFirstAvailable || keepBay === null || keepBay === undefined || keepBay === '') && !aisleDetails.isFull && aisleDetails.bay > 0) {
        targetBayStr = String(aisleDetails.bay).padStart(2, '0');
    } else {
        targetBayStr = keepBay || baySelect.value || '01';
    }

    let targetBayNum = parseInt(targetBayStr, 10) || 1;
    if (targetBayNum > totalBays) targetBayNum = 1;

    targetBayStr = String(targetBayNum).padStart(2, '0');
    let resBay = calculateNextAvailableSlotInBayStrictAisle(aisle, targetBayStr);

    if (resBay.isFull) {
        for (let bOffset = 1; bOffset < totalBays; bOffset++) {
            let testBayNum = ((targetBayNum - 1 + bOffset) % totalBays) + 1;
            let testBayStr = String(testBayNum).padStart(2, '0');
            let testRes = calculateNextAvailableSlotInBayStrictAisle(aisle, testBayStr);

            if (!testRes.isFull) {
                targetBayStr = testBayStr;
                resBay = testRes;
                break;
            }
        }
    }

    baySelect.value = targetBayStr;

    if (!resBay.isFull) {
        shelfSelect.value = resBay.shelf;
        populateInboundSlotDropdown(aisle, targetBayStr, resBay.shelf);
    } else {
        populateInboundSlotDropdown(aisle, targetBayStr, shelfSelect.value || '01');
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function onInboundBayChange(bayValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

    const currentBay = bayValue || (baySelect ? baySelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    const res = calculateNextAvailableSlotInBayStrictAisle(currentAisle, currentBay);

    if (res.isFull) {
        populateInboundSlotDropdown(currentAisle, currentBay, shelfSelect ? shelfSelect.value : '01');
    } else {
        if (shelfSelect) shelfSelect.value = res.shelf;
        populateInboundSlotDropdown(currentAisle, currentBay, res.shelf);
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function onInboundShelfChange(shelfValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

    const currentBay = baySelect ? baySelect.value : '01';
    const currentShelf = shelfValue || (shelfSelect ? shelfSelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    populateInboundSlotDropdown(currentAisle, currentBay, currentShelf);
    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function onInboundSlotChange(slotValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

    const currentBay = baySelect ? baySelect.value : '01';
    const currentShelf = shelfSelect ? shelfSelect.value : '01';
    const currentSlot = slotValue || (slotSelect ? slotSelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    const formattedLoc = `${currentAisle}-${currentBay}-${currentShelf}-${currentSlot}`;
    const occupied = getAllOccupiedLocationsSet();

    if (occupied.has(formattedLoc) || occupied.has(getNormalizedLocKey(formattedLoc))) {
        const autoSlot = populateInboundSlotDropdown(currentAisle, currentBay, currentShelf);
        if (slotSelect) slotSelect.value = autoSlot;
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function getSelectedLocationFromDropdowns() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    const aisle = (aisleSelect ? aisleSelect.value : '').trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    if (!aisle || aisle.includes('โปรดเลือก')) return '';

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return aisle;
    }

    const pad2 = (val) => String(parseInt(val, 10) || 1).padStart(2, '0');
    const bay = pad2(baySelect ? baySelect.value : '01');
    const shelf = pad2(shelfSelect ? shelfSelect.value : '01');
    const slot = pad2(slotSelect ? slotSelect.value : '01');

    return `${aisle}-${bay}-${shelf}-${slot}`;
}

function updateInboundLocationPreviewFromDropdowns() {
    const previewElem = document.getElementById('inboundLocationPreview');
    const hiddenLocInput = document.getElementById('inboundLocation');

    const dbLocKey = getSelectedLocationFromDropdowns();

    if (previewElem) {
        previewElem.innerHTML = formatLocationBadgeHTML(dbLocKey);
        previewElem.classList.remove('pulse-highlight');
        void previewElem.offsetWidth;
        previewElem.classList.add('pulse-highlight');
    }

    if (hiddenLocInput) hiddenLocInput.value = dbLocKey;

    const aisleSelect = document.getElementById('inboundAisleSelect');
    const aisle = aisleSelect ? aisleSelect.value : '';

    if (!aisle || aisle.includes('โปรดเลือก')) {
        renderAisleSlotBreakdownUI({ location: 'โปรดเลือกแถวจัดเก็บ', bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0 });
        return;
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        renderAisleSlotBreakdownUI(calculateAisleCapacityAndNextSlot(aisle));
        return;
    }

    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const bay = baySelect ? baySelect.value : '01';
    const shelf = shelfSelect ? shelfSelect.value : '01';

    const details = calculateAisleCapacityAndNextSlot(aisle);
    details.bay = parseInt(bay, 10);
    details.shelf = parseInt(shelf, 10);
    details.location = dbLocKey;

    renderAisleSlotBreakdownUI(details);
}

function onInboundAisleChange(aisleValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const currentAisle = aisleValue !== undefined ? aisleValue : (aisleSelect ? aisleSelect.value : '');

    if (!currentAisle || currentAisle.includes('โปรดเลือก')) {
        userHasSelectedAisle = false;
        populateInboundLocationDropdownsStrict('');
        updateInboundLocationPreviewFromDropdowns();
        return '';
    }

    userHasSelectedAisle = true;
    populateInboundLocationDropdownsStrict(currentAisle, null, true);
    const hiddenLoc = document.getElementById('inboundLocation');
    return hiddenLoc ? hiddenLoc.value : currentAisle;
}

// 🟢 🎲 ป๊อปอัปสุ่ม S/N (Random SN Batch Generator: 1, 10, 50, 100, 500, 1000 หรือระบุเอง)
function initRandomSnModal() {
    let modal = document.getElementById('wmsRandomSnModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsRandomSnModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="card" style="max-width: 450px; width: 92%; border-radius: 20px; padding: 24px; background: var(--bg-surface, #ffffff); box-shadow: 0 20px 40px rgba(0,0,0,0.25); text-align: center;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
                    <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 8px; margin: 0;">
                        <i class="fa-solid fa-dice" style="color: var(--primary, #0284c7);"></i> สุ่มสร้าง S/N รับเข้าคลัง
                    </h3>
                    <button type="button" onclick="closeRandomSnModal()" style="background: none; border: none; font-size: 1.4rem; color: var(--text-muted, #64748b); cursor: pointer; padding: 0 4px;">&times;</button>
                </div>

                <p style="font-size: 0.85rem; color: var(--text-sub, #475569); margin-bottom: 18px; text-align: left; line-height: 1.4;">
                    โปรดเลือกจำนวน S/N ที่ต้องการสุ่มทดสอบรับเข้าสู่ระบบ โดยระบบจะประมวลผลอย่างแม่นยำและอัปเดตสต็อกเรียลไทม์ให้อัตโนมัติ:
                </p>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px;">
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(10)" style="font-weight: 700; border-radius: 12px; padding: 10px;">10 ชิ้น</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(50)" style="font-weight: 700; border-radius: 12px; padding: 10px;">50 ชิ้น</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(100)" style="font-weight: 700; border-radius: 12px; padding: 10px;">100 ชิ้น</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(500)" style="font-weight: 700; border-radius: 12px; padding: 10px;">500 ชิ้น</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(1000)" style="font-weight: 700; border-radius: 12px; padding: 10px;">1,000 ชิ้น</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(1)" style="font-weight: 700; border-radius: 12px; padding: 10px; color: var(--primary-text, #0284c7);">1 ชิ้น (ใส่ช่อง)</button>
                </div>

                <div class="form-group" style="text-align: left; margin-bottom: 18px;">
                    <label for="randomSnCustomInput" style="font-size: 0.82rem; font-weight: 700;">หรือระบุจำนวนที่ต้องการสุ่มเอง:</label>
                    <input type="number" id="randomSnCustomInput" class="form-control" placeholder="ระบุจำนวน (เช่น 25, 200)" min="1" max="5000" style="border-radius: 10px; font-weight: 700;" />
                </div>

                <div style="display: flex; gap: 10px;">
                    <button type="button" class="btn btn-secondary" onclick="closeRandomSnModal()" style="flex: 1; border-radius: 10px;">ยกเลิก</button>
                    <button type="button" class="btn btn-primary" onclick="confirmBatchRandomInboundProcess()" style="flex: 2; border-radius: 10px; font-weight: 700;">
                        <i class="fa-solid fa-bolt"></i> เริ่มการสุ่มรับเข้าคลัง
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function openRandomSnModal() {
    initRandomSnModal();
    const modal = document.getElementById('wmsRandomSnModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('randomSnCustomInput');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

function closeRandomSnModal() {
    const modal = document.getElementById('wmsRandomSnModal');
    if (modal) modal.style.display = 'none';
    ensureSnInputFocus(true);
}

function selectRandomQtyPreset(qty) {
    const input = document.getElementById('randomSnCustomInput');
    if (input) input.value = qty;
    confirmBatchRandomInboundProcess();
}

// 🟢 🚀 ฟังก์ชันเริ่มการสุ่มรับเข้าคลังแบบยกล็อต Realtime 100%
async function confirmBatchRandomInboundProcess() {
    const input = document.getElementById('randomSnCustomInput');
    let qty = parseInt(input ? input.value : 1, 10);

    if (isNaN(qty) || qty <= 0) {
        qty = 1;
    }

    closeRandomSnModal();

    if (qty === 1) {
        const snInput = document.getElementById('inboundSn');
        if (!snInput) return;
        const prefix = 'SN-' + new Date().getFullYear();
        const rand = Math.floor(100000 + Math.random() * 900000);
        snInput.value = `${prefix}-${rand}`;
        triggerScanInputFlash('success');
        ensureSnInputFocus(true);
        return;
    }

    const categoryElem = document.getElementById('inboundCategory');
    const nameElem = document.getElementById('inboundName');

    let category = categoryElem ? categoryElem.value.trim() : '';
    let name = nameElem ? nameElem.value.trim() : '';

    if (!category || !name) {
        category = 'CABLE-FIBER';
        name = 'สายไฟเบอร์ออฟติก 1 Core (Random Test SKU)';
        if (categoryElem) categoryElem.value = category;
        if (nameElem) nameElem.value = name;
    }

    const currentSelectedLoc = getSelectedLocationFromDropdowns();

    if (!currentSelectedLoc || currentSelectedLoc.includes('โปรดเลือก') || currentSelectedLoc === '') {
        showToast('⚠️ กรุณาเลือกแถวจัดเก็บคลังสินค้าก่อนสุ่มรับเข้า!', true);
        const aisleSelect = document.getElementById('inboundAisleSelect');
        if (aisleSelect) aisleSelect.focus();
        return;
    }

    showToast(`🚀 กำลังสุ่มรับเข้าสินค้าจำนวน ${qty.toLocaleString()} รายการ...`, false, 4000);

    const prefix = 'SN-' + new Date().getFullYear();
    const activeUser = getCurrentUserFullName();
    const nowISO = new Date().toISOString();
    const currentTimeStr = new Date().toLocaleTimeString('th-TH');
    const isOnlineNow = navigator.onLine;

    let processed = 0;

    while (processed < qty) {
        const rand = Math.floor(100000 + Math.random() * 900000);
        const sn = `${prefix}-${rand}`;
        const snUpper = sn.toUpperCase();

        if (pendingFastSnSet.has(snUpper)) continue;
        pendingFastSnSet.add(snUpper);

        let targetLoc = currentSelectedLoc;

        if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentSelectedLoc)) {
            targetLoc = currentSelectedLoc;
        } else {
            const aisleSelect = document.getElementById('inboundAisleSelect');
            const aisle = aisleSelect ? aisleSelect.value : 'A';
            const details = calculateAisleCapacityAndNextSlot(aisle);

            if (!details.isFull && details.location && !details.location.includes('FULL')) {
                targetLoc = details.location;
            } else {
                targetLoc = 'DOCK';
            }
        }

        addOccupiedLocToSet(pendingFastLocationSet, targetLoc);

        const feedItem = {
            sn,
            category,
            name,
            meter: 100,
            location: targetLoc,
            received_by: activeUser,
            time: currentTimeStr,
            created_at: nowISO,
            isOffline: !isOnlineNow,
            db_status: isOnlineNow ? 'SYNCING' : 'PENDING'
        };

        const dbPayload = {
            category,
            name,
            sn,
            meter: 100,
            location: targetLoc,
            qty: 1,
            status: 'IN_STOCK',
            received_by: activeUser,
            created_at: nowISO
        };

        recentInboundList.unshift(feedItem);

        if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
            globalInventoryData.unshift(dbPayload);
        }

        enqueuePersistentDbSync(dbPayload, feedItem);
        processed++;
    }

    if (recentInboundList.length > 100) recentInboundList.length = 100;
    saveRecentInboundFeedToCache();
    scheduleDebouncedFeedRender();
    playAudioFeedback('success');
    forceSyncAndSelectAvailableLocation(true);

    // เริ่มส่งคิวเข้า DB ตามลำดับ FIFO ทันที
    flushPersistentDbSyncQueue();

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.postMessage({ action: 'BATCH_INBOUND', count: qty });
        }
    } catch (e) {}

    document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: { action: 'BATCH', count: qty } }));
    document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: { action: 'BATCH', count: qty } }));

    showToast(`✅ สุ่มรับเข้าคลังเรียบร้อยแล้ว ${qty.toLocaleString()} รายการ`, false, 3500);
}

function generateAutoSN() {
    openRandomSnModal();
}

// 🟢 📹 ระบบกล้องสแกน SN ผ่านโทรศัพท์มือถือ (Android & iOS) และอุปกรณ์ทุกชนิด (เปิดทันที + ยิงต่อเนื่อง 100%)
function initMobileCameraScannerModal() {
    let modal = document.getElementById('cameraScannerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cameraScannerModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="card camera-scanner-card" style="max-width: 500px; width: 95%; max-height: 92dvh; text-align: center; padding: 16px; border-radius: 22px; background: var(--bg-surface, #ffffff); border: 1px solid var(--border-color, #e2e8f0); box-shadow: 0 24px 50px -10px rgba(0,0,0,0.35); overflow-y: auto; backdrop-filter: blur(12px);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px;">
                    <h3 style="font-size: 1.02rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 7px; margin: 0;">
                        <i class="fa-solid fa-camera" style="color: var(--primary, #0284c7);"></i> สแกนบาร์โค้ด / QR
                    </h3>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button type="button" onclick="toggleCameraScanMode()" id="btnCameraContinuousMode" title="สลับโหมดยิงต่อเนื่อง" style="background: #dcfce7; border: 1px solid #86efac; border-radius: 99px; padding: 5px 10px; color: #15803d; cursor: pointer; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; gap: 4px; min-height: 34px;">
                            <i class="fa-solid fa-repeat"></i> <span id="cameraModeText">ยิงต่อเนื่อง</span>
                        </button>
                        <button type="button" onclick="toggleCameraTorch()" title="เปิด/ปิด ไฟฉาย" id="btnCameraTorchToggle" style="background: var(--bg-subtle, #f1f5f9); border: 1px solid var(--border-strong, #cbd5e1); border-radius: 50%; width: 36px; height: 36px; color: var(--text-main, #0f172a); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.92rem;">
                            <i class="fa-solid fa-bolt"></i>
                        </button>
                        <button type="button" onclick="switchCameraFacingMode()" title="สลับกล้องหน้า/หลัง" style="background: var(--primary-light, #e0f2fe); border: 1px solid var(--primary-border, #bae6fd); border-radius: 50%; width: 36px; height: 36px; color: var(--primary-text, #0284c7); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.92rem;">
                            <i class="fa-solid fa-camera-rotate"></i>
                        </button>
                        <button type="button" onclick="closeCameraScanner()" style="background: #f1f5f9; border: none; border-radius: 50%; width: 36px; height: 36px; font-size: 1.35rem; color: var(--text-muted, #64748b); cursor: pointer; line-height: 1; display: flex; align-items: center; justify-content: center;">&times;</button>
                    </div>
                </div>

                <div id="cameraViewfinderBox" style="position: relative; width: 100%; height: clamp(230px, 44dvh, 330px); background: #090d16; border-radius: 16px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(56, 189, 248, 0.35);">
                    <div id="html5QrCodeReader" style="width: 100%; height: 100%;"></div>
                    <video id="cameraScannerVideo" autoplay playsinline webkit-playsinline muted style="width: 100%; height: 100%; object-fit: cover; display: none;"></video>

                    <div id="cameraScannerFlashOverlay" style="position:absolute; inset:0; background:rgba(16,185,129,0.35); opacity:0; pointer-events:none; transition:opacity 0.18s ease;"></div>

                    <div class="camera-scanner-frame" style="pointer-events:none;">
                        <div class="camera-scanner-laser"></div>
                    </div>

                    <div id="cameraLiveLastScanHud" style="display:none; position:absolute; top:10px; left:10px; right:10px; background:rgba(6, 78, 59, 0.92); color:#ecfdf5; padding:7px 12px; border-radius:12px; font-size:0.78rem; font-weight:700; backdrop-filter:blur(8px); border:1px solid #34d399; justify-content:space-between; align-items:center; gap:8px; z-index:10;">
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><i class="fa-solid fa-circle-check" style="color:#34d399;"></i> ล่าสุด: <span id="cameraLastScanCodeText" class="mono">-</span></span>
                        <span id="cameraSessionBadge" style="background:#10b981; color:#022c22; padding:2px 8px; border-radius:99px; font-size:0.72rem; flex-shrink:0;">0 ชิ้น</span>
                    </div>

                    <div style="position: absolute; bottom: 10px; background: rgba(15, 23, 42, 0.86); color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 0.74rem; backdrop-filter: blur(10px); pointer-events: none; border: 1px solid rgba(255,255,255,0.16); display: flex; align-items: center; gap: 6px; max-width: 92%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 4px 12px rgba(0,0,0,0.28); z-index:10;">
                        <i class="fa-solid fa-expand" style="color: #38bdf8;"></i> <span id="cameraScannerStatusText">เล็งบาร์โค้ด / QR ได้ทุกประเภท อ่านอัตโนมัติทันที</span>
                    </div>
                </div>

                <div class="camera-controls-grid" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; width: 100%;">
                    <button type="button" class="btn btn-secondary" style="flex: 1 1 calc(33.333% - 6px); min-width: 95px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 700;" onclick="closeCameraScanner()">
                        <i class="fa-solid fa-xmark"></i> ปิดกล้อง
                    </button>
                    <button type="button" class="btn btn-secondary" style="flex: 1 1 calc(33.333% - 6px); min-width: 105px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 700;" onclick="switchCameraFacingMode()">
                        <i class="fa-solid fa-camera-rotate"></i> กล้อง (<span id="cameraFacingLabel">หลัง</span>)
                    </button>
                    <button type="button" class="btn btn-primary" style="flex: 1 1 calc(33.333% - 6px); min-width: 105px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 700;" onclick="simulateCameraScanSuccess()">
                        <i class="fa-solid fa-bolt"></i> สแกนจำลอง
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function toggleCameraScanMode() {
    isContinuousCameraScanMode = !isContinuousCameraScanMode;
    const btn = document.getElementById('btnCameraContinuousMode');
    const txt = document.getElementById('cameraModeText');
    if (btn && txt) {
        if (isContinuousCameraScanMode) {
            btn.style.background = '#dcfce7';
            btn.style.borderColor = '#86efac';
            btn.style.color = '#15803d';
            txt.textContent = 'ยิงต่อเนื่อง';
        } else {
            btn.style.background = '#f1f5f9';
            btn.style.borderColor = '#cbd5e1';
            btn.style.color = '#475569';
            txt.textContent = 'ยิง 1 ครั้ง';
        }
    }
}

function triggerMobileCameraScan() {
    openCameraScanner();
}

function openCameraScanner() {
    // ปลดล็อกเสียงทันทีที่ผู้ใช้แตะเปิดกล้อง (สำคัญมากสำหรับ iOS Safari / Android Chrome)
    getSharedWmsAudioContext();

    initMobileCameraScannerModal();
    const modal = document.getElementById('cameraScannerModal');
    if (!modal) return;

    // เด้งเปิดหน้าต่างกล้องขึ้นมาทันที 0ms
    modal.style.display = 'flex';
    isCameraScannerActive = true;
    cameraSessionScanCount = 0;
    lastCameraScannedCode = '';
    lastCameraScannedTime = 0;

    const hud = document.getElementById('cameraLiveLastScanHud');
    if (hud) hud.style.display = 'none';

    const statusText = document.getElementById('cameraScannerStatusText');
    if (statusText) statusText.textContent = 'กำลังเชื่อมต่อกล้องความเร็วสูง...';

    // เริ่มสตรีมกล้องในเฟรมถัดไปทันทีเพื่อไม่ให้บล็อก UI
    requestAnimationFrame(() => {
        startCameraWithCurrentFacingMode();
    });
}

function getAllSupportedHtml5QrcodeFormats() {
    if (typeof Html5QrcodeSupportedFormats === 'undefined') return undefined;
    const F = Html5QrcodeSupportedFormats;
    return [
        F.QR_CODE,
        F.CODE_128,
        F.CODE_39,
        F.CODE_93,
        F.CODABAR,
        F.EAN_13,
        F.EAN_8,
        F.ITF,
        F.UPC_A,
        F.UPC_E,
        F.DATA_MATRIX,
        F.AZTEC,
        F.PDF_417
    ].filter(v => v !== undefined);
}

async function startCameraWithCurrentFacingMode() {
    const facingLabel = document.getElementById('cameraFacingLabel');
    if (facingLabel) {
        facingLabel.textContent = currentCameraFacingMode === 'user' ? 'หน้า' : 'หลัง';
    }

    const statusText = document.getElementById('cameraScannerStatusText');

    // หยุดสตรีมเดิมก่อนเริ่มใหม่เสมอ (ป้องกันกล้องค้างบน iOS Safari)
    await stopActiveCameraStreamsOnly();

    if (!isCameraScannerActive) return;

    if (typeof Html5Qrcode !== 'undefined') {
        const qrCodeContainer = document.getElementById('html5QrCodeReader');
        if (qrCodeContainer) {
            qrCodeContainer.style.display = 'block';
            const videoElem = document.getElementById('cameraScannerVideo');
            if (videoElem) videoElem.style.display = 'none';

            const formatsToSupport = getAllSupportedHtml5QrcodeFormats();
            html5QrCodeScanner = formatsToSupport
                ? new Html5Qrcode('html5QrCodeReader', { formatsToSupport, verbose: false })
                : new Html5Qrcode('html5QrCodeReader', { verbose: false });

            const config = {
                fps: 30,
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const w = Math.min(Math.floor(viewfinderWidth * 0.84), 340);
                    const h = Math.min(Math.floor(viewfinderHeight * 0.65), 220);
                    return { width: Math.max(180, w), height: Math.max(130, h) };
                },
                videoConstraints: {
                    facingMode: { ideal: currentCameraFacingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                }
            };

            try {
                await html5QrCodeScanner.start(
                    { facingMode: currentCameraFacingMode },
                    config,
                    (decodedText) => {
                        if (decodedText && decodedText.trim()) {
                            onCameraBarcodeDetected(decodedText.trim());
                        }
                    },
                    () => {}
                );

                if (statusText) statusText.textContent = 'พร้อมสแกน! เล็งบาร์โค้ดหรือ QR ทุกประเภทในกรอบ';

                // เสริมความเร็วด้วย Native BarcodeDetector ควบคู่กับ Html5Qrcode บนวิดีโอภายใน
                const innerVideo = qrCodeContainer.querySelector('video');
                if (innerVideo) {
                    innerVideo.setAttribute('playsinline', 'true');
                    innerVideo.setAttribute('webkit-playsinline', 'true');
                    innerVideo.muted = true;
                    tryEnableContinuousAutoFocus(innerVideo.srcObject);
                    startContinuousBarcodeDetection(innerVideo);
                }
                return;
            } catch (err) {
                console.warn('Html5Qrcode start fallback to native getUserMedia:', err);
            }
        }
    }

    startFallbackMediaScanner();
}

function tryEnableContinuousAutoFocus(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') return;
    const track = stream.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') return;
    try {
        const caps = track.getCapabilities();
        if (caps && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
    } catch (e) {}
}

async function stopActiveCameraStreamsOnly() {
    if (cameraScanInterval) {
        clearInterval(cameraScanInterval);
        cameraScanInterval = null;
    }

    if (html5QrCodeScanner) {
        try {
            if (html5QrCodeScanner.isScanning) {
                await html5QrCodeScanner.stop();
            }
            html5QrCodeScanner.clear();
        } catch (e) {}
        html5QrCodeScanner = null;
    }

    if (activeCameraStream) {
        try {
            activeCameraStream.getTracks().forEach(track => track.stop());
        } catch (e) {}
        activeCameraStream = null;
    }
}

async function switchCameraFacingMode() {
    currentCameraFacingMode = (currentCameraFacingMode === 'environment') ? 'user' : 'environment';
    isTorchOn = false;
    const btn = document.getElementById('btnCameraTorchToggle');
    if (btn) btn.style.background = 'var(--bg-subtle, #f1f5f9)';

    if (isCameraScannerActive) {
        await startCameraWithCurrentFacingMode();
    }
}

async function toggleCameraTorch() {
    isTorchOn = !isTorchOn;
    const btn = document.getElementById('btnCameraTorchToggle');

    if (html5QrCodeScanner && isCameraScannerActive) {
        try {
            await html5QrCodeScanner.applyVideoConstraints({
                advanced: [{ torch: isTorchOn }]
            });
            if (btn) btn.style.background = isTorchOn ? '#f59e0b' : 'var(--bg-subtle, #f1f5f9)';
            return;
        } catch (e) {}
    }

    const activeVideo = document.querySelector('#html5QrCodeReader video') || document.getElementById('cameraScannerVideo');
    const stream = activeCameraStream || (activeVideo && activeVideo.srcObject);
    if (stream && typeof stream.getVideoTracks === 'function') {
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === 'function') {
            try {
                await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
                if (btn) btn.style.background = isTorchOn ? '#f59e0b' : 'var(--bg-subtle, #f1f5f9)';
                return;
            } catch (e) {}
        }
    }
    isTorchOn = false;
    showToast('⚠️ อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดไฟฉาย', true);
}

async function startFallbackMediaScanner() {
    const video = document.getElementById('cameraScannerVideo');
    const qrContainer = document.getElementById('html5QrCodeReader');
    const statusText = document.getElementById('cameraScannerStatusText');
    if (qrContainer) qrContainer.style.display = 'none';
    if (!video) return;

    video.style.display = 'block';
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('⚠️ เบราว์เซอร์ไม่รองรับการเปิดกล้อง (ต้องใช้งานผ่าน HTTPS)', true);
        closeCameraScanner();
        return;
    }

    const constraintCandidates = [
        {
            video: {
                facingMode: { ideal: currentCameraFacingMode },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        },
        {
            video: { facingMode: currentCameraFacingMode },
            audio: false
        },
        {
            video: true,
            audio: false
        }
    ];

    let stream = null;
    for (const constraints of constraintCandidates) {
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
        } catch (err) {}
    }

    if (!stream) {
        showToast('⚠️ ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตสิทธิ์การใช้กล้องในเบราว์เซอร์', true);
        closeCameraScanner();
        ensureSnInputFocus(true);
        return;
    }

    if (!isCameraScannerActive) {
        stream.getTracks().forEach(t => t.stop());
        return;
    }

    activeCameraStream = stream;
    video.srcObject = stream;
    tryEnableContinuousAutoFocus(stream);

    try {
        await video.play();
    } catch (e) {}

    if (statusText) statusText.textContent = 'พร้อมสแกน! เล็งบาร์โค้ดหรือ QR ทุกประเภทในกรอบ';
    startContinuousBarcodeDetection(video);
}

async function startContinuousBarcodeDetection(videoElement) {
    if (cameraScanInterval) clearInterval(cameraScanInterval);

    let barcodeDetector = null;
    if ('BarcodeDetector' in window) {
        try {
            let formats = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'upc_a', 'upc_e', 'codabar', 'itf', 'aztec', 'pdf417'];
            if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
                const supported = await window.BarcodeDetector.getSupportedFormats();
                if (Array.isArray(supported) && supported.length > 0) {
                    formats = supported;
                }
            }
            barcodeDetector = new window.BarcodeDetector({ formats });
        } catch (e) {
            try { barcodeDetector = new window.BarcodeDetector(); } catch (err) {}
        }
    }

    if (!barcodeDetector) return;

    cameraScanInterval = setInterval(async () => {
        if (!isCameraScannerActive || !videoElement || videoElement.readyState < 2) return;

        try {
            const barcodes = await barcodeDetector.detect(videoElement);
            if (barcodes && barcodes.length > 0) {
                const detectedVal = barcodes[0].rawValue || barcodes[0].rawValueText;
                if (detectedVal && detectedVal.trim()) {
                    onCameraBarcodeDetected(detectedVal.trim());
                }
            }
        } catch (e) {}
    }, 90);
}

function onCameraBarcodeDetected(scannedCode) {
    if (!isCameraScannerActive) return;
    const cleanCode = String(scannedCode || '').replace(/[\r\n\t\u200B-\u200D\uFEFF]/g, '').trim();
    if (!cleanCode) return;

    const now = Date.now();
    const codeUpper = cleanCode.toUpperCase();

    // ป้องกันการอ่านบาร์โค้ดเดิมซ้ำในเสี้ยววินาทีขณะถือกล้องค้างไว้
    if (codeUpper === lastCameraScannedCode && (now - lastCameraScannedTime) < 1500) {
        return;
    }
    if ((now - lastCameraScannedTime) < 300) {
        return;
    }

    lastCameraScannedCode = codeUpper;
    lastCameraScannedTime = now;

    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        snInput.value = cleanCode;
    }

    // แสดงเอฟเฟกต์แฟลชสีเขียวในกรอบกล้องทันที
    const flashOverlay = document.getElementById('cameraScannerFlashOverlay');
    if (flashOverlay) {
        flashOverlay.style.opacity = '1';
        setTimeout(() => { flashOverlay.style.opacity = '0'; }, 160);
    }

    if (isContinuousCameraScanMode) {
        // โหมดยิงต่อเนื่อง: ส่งเข้าคิวรับเข้าคลังทันทีโดยไม่ต้องปิดกล้อง
        handleInboundSubmit();

        cameraSessionScanCount++;
        const hud = document.getElementById('cameraLiveLastScanHud');
        const lastTxt = document.getElementById('cameraLastScanCodeText');
        const badge = document.getElementById('cameraSessionBadge');
        if (hud && lastTxt && badge) {
            hud.style.display = 'flex';
            lastTxt.textContent = cleanCode;
            badge.textContent = `${cameraSessionScanCount} ชิ้น`;
        }
    } else {
        closeCameraScanner();
        handleInboundSubmit();
    }
}

function closeCameraScanner() {
    isCameraScannerActive = false;
    isTorchOn = false;
    stopActiveCameraStreamsOnly();

    const video = document.getElementById('cameraScannerVideo');
    if (video) video.srcObject = null;

    const modal = document.getElementById('cameraScannerModal');
    if (modal) modal.style.display = 'none';
    ensureSnInputFocus(true);
}

function simulateCameraScanSuccess() {
    const sampleSn = 'SN-' + Math.floor(100000 + Math.random() * 900000);
    onCameraBarcodeDetected(sampleSn);
}

function renderAisleSlotBreakdownUI(details) {
    let infoContainer = document.getElementById('inboundAisleSlotDetailBox');

    if (!infoContainer) {
        const previewElem = document.getElementById('inboundLocationPreview');
        if (previewElem && previewElem.parentElement) {
            infoContainer = document.createElement('div');
            infoContainer.id = 'inboundAisleSlotDetailBox';
            infoContainer.className = 'glass-hud-box';
            previewElem.parentElement.appendChild(infoContainer);
        } else {
            return;
        }
    }

    if (!details.location || details.location.includes('โปรดเลือก')) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--warning, #d97706); font-weight:600; padding:12px; background:rgba(254, 243, 199, 0.6); border-radius:12px; border:1px solid #fde68a; backdrop-filter:blur(6px);">
                ⚠️ โปรดเลือกแถวจัดเก็บจากรายการด้านบนก่อนทำการสแกน
            </div>
        `;
        return;
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(details.location)) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--primary-text, #0284c7); font-weight:600; padding:10px; background:rgba(224, 242, 254, 0.7); border-radius:12px; border:1px solid var(--primary-border, #bae6fd); backdrop-filter:blur(6px);">
                📍 พิกัดพิเศษ: <strong>${details.location}</strong> (รับเข้าโซนส่วนกลาง)
            </div>
        `;
        return;
    }

    if (details.location.endsWith('-FULL') || details.location.includes('FULL')) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--danger, #ef4444); font-weight:700; padding:12px; background:rgba(254, 226, 226, 0.7); border-radius:12px; border:1px solid #fca5a5; backdrop-filter:blur(6px);">
                ⚠️ ล็อก/แถวนี้เต็มแล้ว! (ใช้ไป ${details.occupiedCount}/${details.totalSlots} ช่อง จากทั้งหมด ${details.baysConfigured} ล็อก)
            </div>
        `;
        return;
    }

    const usedPercent = details.totalSlots > 0 ? Math.round((details.occupiedCount / details.totalSlots) * 100) : 0;
    const progressColor = usedPercent > 85 ? '#ef4444' : (usedPercent > 60 ? '#f59e0b' : '#10b981');

    infoContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border-color, #e2e8f0);">
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="pulse-live-dot"></span>
                <span style="font-weight:700; color:var(--text-main, #0f172a); font-size:0.83rem;">สถานะจัดเก็บ Realtime 100%</span>
            </div>
            <button type="button" onclick="triggerAutoFindNextSlot()" style="background:none; border:none; color:var(--primary-text, #0284c7); font-size:0.75rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; transition:opacity 0.2s ease;">
                <i class="fa-solid fa-rotate-right"></i> รีเฟรชพิกัด
            </button>
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; text-align:center; margin-bottom:12px;">
            <div style="background:var(--primary-light, #e0f2fe); padding:8px 6px; border-radius:10px; border:1px solid var(--primary-border, #bae6fd);">
                <span style="font-size:0.7rem; color:var(--text-sub, #475569); display:block; margin-bottom:2px;">ล็อกที่เลือก</span>
                <strong style="font-size:1rem; color:var(--primary-text, #0284c7);" class="mono">ล็อก ${String(details.bay).padStart(2, '0')}</strong>
            </div>
            <div style="background:var(--primary-light, #e0f2fe); padding:8px 6px; border-radius:10px; border:1px solid var(--primary-border, #bae6fd);">
                <span style="font-size:0.7rem; color:var(--text-sub, #475569); display:block; margin-bottom:2px;">ชั้นที่เลือก</span>
                <strong style="font-size:1rem; color:var(--primary-text, #0284c7);" class="mono">ชั้น ${String(details.shelf).padStart(2, '0')}</strong>
            </div>
            <div style="background:rgba(220, 252, 231, 0.8); padding:8px 6px; border-radius:10px; border:1px solid rgba(16,185,129,0.3);">
                <span style="font-size:0.7rem; color:#15803d; display:block; margin-bottom:2px;">ช่องว่าง Auto</span>
                <strong style="font-size:1rem; color:#10b981;" class="mono">ช่อง ${String(details.slot).padStart(2, '0')}</strong>
            </div>
        </div>

        <div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-sub, #64748b); margin-bottom:4px;">
                <span>อัตราความจุแถวนี้:</span>
                <strong style="color:${progressColor}">${usedPercent}% (${details.occupiedCount}/${details.totalSlots})</strong>
            </div>
            <div style="width:100%; height:8px; background:var(--bg-subtle, #e2e8f0); border-radius:99px; overflow:hidden;">
                <div style="width:${usedPercent}%; height:100%; background:${progressColor}; transition:width 0.4s ease-in-out; border-radius:99px;"></div>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-sub, #64748b); border-top:1px dashed var(--border-color, #cbd5e1); padding-top:10px; margin-top:6px;">
            <span>🟢 ช่องว่างคงเหลือ: <strong style="color:var(--success, #10b981);" class="mono">${details.freeSlots}</strong> / ${details.totalSlots} ช่อง</span>
            <button type="button" class="btn btn-sm" onclick="triggerAutoFindNextSlot()" style="font-size:0.72rem; padding:4px 12px; background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); border:1px solid var(--primary-border, #bae6fd); border-radius:8px; cursor:pointer; font-weight:600; transition:all 0.2s ease;">
                ⚡ หาช่องว่างถัดไป
            </button>
        </div>
    `;
}

function triggerAutoFindNextSlot() {
    invalidateOccupiedLocationsCache();
    forceSyncAndSelectAvailableLocation(true);
}

function forceSyncAndSelectAvailableLocation(autoSelectFirstAvailable = true) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');

    if (!userHasSelectedAisle) {
        populateInboundLocationDropdownsStrict('', null, false);
        return;
    }

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) {
        populateInboundLocationDropdownsStrict('', null, autoSelectFirstAvailable);
        return;
    }

    const currentBay = baySelect ? baySelect.value : '01';
    populateInboundLocationDropdownsStrict(currentAisle, autoSelectFirstAvailable ? null : currentBay, autoSelectFirstAvailable);
}

function autoSelectNextAvailableSlotAfterInbound() {
    forceSyncAndSelectAvailableLocation(true);
}

// ⚡ HIGH-SPEED SCAN ENGINE
function triggerScanInputFlash(status = 'success') {
    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        snInput.classList.remove('scan-flash-success', 'scan-flash-error');
        void snInput.offsetWidth;
        snInput.classList.add(status === 'success' ? 'scan-flash-success' : 'scan-flash-error');

        setTimeout(() => {
            snInput.classList.remove('scan-flash-success', 'scan-flash-error');
        }, 280);
    }

    playAudioFeedback(status);
}

function recordScanSpeedMetrics() {
    scanSpeedCounter++;
    if (!scanSpeedTimer) {
        scanSpeedTimer = setTimeout(() => {
            const badge = document.getElementById('fastScanSpeedMeterBadge');
            if (badge) {
                badge.textContent = `⚡ ${scanSpeedCounter} ชิ้น/วินาที`;
                badge.style.display = 'inline-block';
            }
            scanSpeedCounter = 0;
            scanSpeedTimer = null;
        }, 1000);
    }
}

// =========================================================================
// 🌐 OFFLINE-FIRST PERSISTENT FIFO QUEUE & NETWORK SYNC HUD ENGINE
// =========================================================================

function loadPersistentDbQueue() {
    try {
        const raw = localStorage.getItem(PERSISTENT_DB_QUEUE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                persistentDbSyncQueue = parsed;
                // คืนค่าล็อก SN และพิกัดที่รอส่งขึ้น DB เพื่อป้องกันซ้ำแม้รีเฟรชหน้าเว็บขณะออฟไลน์
                persistentDbSyncQueue.forEach(entry => {
                    if (entry && entry.payload) {
                        if (entry.payload.sn) pendingFastSnSet.add(String(entry.payload.sn).trim().toUpperCase());
                        if (entry.payload.location) addOccupiedLocToSet(pendingFastLocationSet, entry.payload.location);
                    }
                });
            }
        }
    } catch (e) {
        persistentDbSyncQueue = [];
    }
}

function savePersistentDbQueue() {
    try {
        localStorage.setItem(PERSISTENT_DB_QUEUE_KEY, JSON.stringify(persistentDbSyncQueue));
    } catch (e) {}
}

function enqueuePersistentDbSync(rawPayload, feedItem) {
    dbSyncSequenceCounter++;
    const txId = `tx_${dbSyncSequenceCounter}_${Math.random().toString(36).slice(2, 7)}`;
    if (feedItem) {
        feedItem._txId = txId;
    }
    persistentDbSyncQueue.push({
        txId,
        seq: dbSyncSequenceCounter,
        payload: rawPayload,
        enqueuedAt: new Date().toISOString(),
        retries: 0
    });
    savePersistentDbQueue();
    updateInboundNetworkSyncHUD();
}

function ensureInboundNetworkSyncHUD() {
    let hud = document.getElementById('inboundNetworkSyncHud');
    if (hud) return hud;

    const feedContainer = document.getElementById('liveInboundFeedContainer');
    const snInput = document.getElementById('inboundSn');
    const anchorParent = (feedContainer && feedContainer.parentElement) || (snInput && snInput.closest('form, .card, .section-card'));

    if (!anchorParent) return null;

    hud = document.createElement('div');
    hud.id = 'inboundNetworkSyncHud';
    hud.className = 'wms-network-sync-hud';

    if (feedContainer && feedContainer.parentElement === anchorParent) {
        anchorParent.insertBefore(hud, feedContainer);
    } else {
        anchorParent.appendChild(hud);
    }
    return hud;
}

function updateInboundNetworkSyncHUD() {
    const hud = ensureInboundNetworkSyncHUD();
    if (!hud) return;

    const isOnline = navigator.onLine;
    const pendingCount = persistentDbSyncQueue.length;

    if (!isOnline) {
        hud.className = 'wms-network-sync-hud offline';
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:9px;">
                    <span class="net-dot offline"></span>
                    <div>
                        <div style="font-weight:800; font-size:0.83rem; color:#9a3412;">🟠 โหมดออฟไลน์ (ไม่มีสัญญาณอินเทอร์เน็ต)</div>
                        <div style="font-size:0.75rem; color:#c2410c;">สแกนรับสินค้าต่อเนื่องได้ตามปกติ 100% ระบบจะจัดคิวส่งทันทีที่เน็ตกลับมา</div>
                    </div>
                </div>
                <div style="background:#ffedd5; border:1px solid #fdba74; color:#9a3412; padding:4px 12px; border-radius:99px; font-size:0.78rem; font-weight:800;">
                    <i class="fa-solid fa-layer-group"></i> คิวรอส่ง: <span class="mono">${pendingCount}</span> รายการ
                </div>
            </div>
        `;
        return;
    }

    if (pendingCount > 0 || isFlushingDbQueue) {
        hud.className = 'wms-network-sync-hud syncing';
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:9px;">
                    <i class="fa-solid fa-arrows-rotate fa-spin" style="color:#0284c7; font-size:1rem;"></i>
                    <div>
                        <div style="font-weight:800; font-size:0.83rem; color:#075985;">🔄 กำลังจัดลำดับคิวส่งเข้าฐานข้อมูลเรียลไทม์...</div>
                        <div style="font-size:0.75rem; color:#0369a1;">เรียงลำดับคิว FIFO อัตโนมัติ (เหลืออีก ${pendingCount} รายการ)</div>
                    </div>
                </div>
                <button type="button" onclick="flushPersistentDbSyncQueue(true)" style="background:#0284c7; color:#fff; border:none; padding:5px 12px; border-radius:99px; font-size:0.75rem; font-weight:700; cursor:pointer;">
                    ซิงค์ทันที
                </button>
            </div>
        `;
        return;
    }

    hud.className = 'wms-network-sync-hud online';
    hud.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="pulse-live-dot"></span>
                <span style="font-weight:700; font-size:0.8rem; color:#065f46;">ออนไลน์ • เชื่อมต่อฐานข้อมูลเรียลไทม์ 100%</span>
            </div>
            <span style="font-size:0.74rem; color:#047857; font-weight:600;">
                <i class="fa-solid fa-shield-check"></i> พร้อมรับสแกนต่อเนื่อง & โหมดออฟไลน์อัตโนมัติ
            </span>
        </div>
    `;
}

// 🚀 ส่งคิวที่ค้างอยู่ใน LocalStorage ขึ้น Supabase แบบเรียงลำดับ FIFO 100%
async function flushPersistentDbSyncQueue(manualTrigger = false) {
    updateInboundNetworkSyncHUD();

    if (isFlushingDbQueue || persistentDbSyncQueue.length === 0) return;

    if (!navigator.onLine) {
        if (manualTrigger) {
            showToast('🟠 ขณะนี้อยู่ในโหมดออฟไลน์ ระบบจะส่งคิวทันทีเมื่ออินเทอร์เน็ตกลับมา', true);
        }
        return;
    }

    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    isFlushingDbQueue = true;
    updateInboundNetworkSyncHUD();

    let totalSyncedInRun = 0;

    try {
        while (persistentDbSyncQueue.length > 0 && navigator.onLine) {
            // ดึงทีละชุดสูงสุด 25 รายการตามลำดับคิว FIFO
            const batchEntries = persistentDbSyncQueue.slice(0, 25);
            const activeUserFullName = getCurrentUserFullName() || 'เจ้าหน้าที่คลังสินค้า';

            const cleanBatch = batchEntries.map(entry => {
                let cleanData = typeof sanitizeForDb === 'function' ? sanitizeForDb({ ...entry.payload }) : { ...entry.payload };
                if (!cleanData.received_by) {
                    cleanData.received_by = activeUserFullName;
                }
                return cleanData;
            });

            // อัปเดตสถานะบนการ์ดเป็น SYNCING
            batchEntries.forEach(entry => {
                const feedMatch = recentInboundList.find(f => f && (f._txId === entry.txId || (f.sn && String(f.sn).toUpperCase() === String(entry.payload.sn).toUpperCase())));
                if (feedMatch && feedMatch.db_status !== 'SYNCED') {
                    feedMatch.db_status = 'SYNCING';
                    feedMatch.isOffline = false;
                }
            });
            scheduleDebouncedFeedRender();

            const { data, error } = await client.from('warehouse_items').insert(cleanBatch).select('*');

            if (!error) {
                // บันทึกสำเร็จทั้งชุด!
                batchEntries.forEach((entry, idx) => {
                    const insertedRow = Array.isArray(data) ? (data.find(d => d && String(d.sn).toUpperCase() === String(entry.payload.sn).toUpperCase()) || data[idx]) : null;
                    const feedMatch = recentInboundList.find(f => f && (f._txId === entry.txId || (f.sn && String(f.sn).toUpperCase() === String(entry.payload.sn).toUpperCase())));
                    if (feedMatch) {
                        if (insertedRow && insertedRow.id) feedMatch.id = insertedRow.id;
                        feedMatch.db_status = 'SYNCED';
                        feedMatch.isOffline = false;
                    }
                    if (insertedRow && typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                        const gIdx = globalInventoryData.findIndex(g => g && String(g.sn).toUpperCase() === String(entry.payload.sn).toUpperCase());
                        if (gIdx !== -1) {
                            globalInventoryData[gIdx] = { ...globalInventoryData[gIdx], ...insertedRow };
                        }
                    }
                });

                persistentDbSyncQueue.splice(0, batchEntries.length);
                savePersistentDbQueue();
                saveRecentInboundFeedToCache();
                totalSyncedInRun += batchEntries.length;
                updateInboundNetworkSyncHUD();
                scheduleDebouncedFeedRender();
            } else {
                // กรณีติด Error บางรายการในชุด (เช่น SN ซ้ำใน DB หรือ Network ขาดกะทันหัน) ให้แยกยิงทีละรายการในชุดนี้
                console.warn('Batch sync fallback to single-item FIFO:', error.message);
                let networkFailed = false;

                for (let i = 0; i < batchEntries.length; i++) {
                    if (!navigator.onLine) {
                        networkFailed = true;
                        break;
                    }
                    const singleEntry = batchEntries[i];
                    const singleClean = cleanBatch[i];

                    const singleRes = await client.from('warehouse_items').insert([singleClean]).select('*');
                    if (!singleRes.error) {
                        const insertedRow = singleRes.data && singleRes.data[0];
                        const feedMatch = recentInboundList.find(f => f && (f._txId === singleEntry.txId || (f.sn && String(f.sn).toUpperCase() === String(singleEntry.payload.sn).toUpperCase())));
                        if (feedMatch) {
                            if (insertedRow && insertedRow.id) feedMatch.id = insertedRow.id;
                            feedMatch.db_status = 'SYNCED';
                            feedMatch.isOffline = false;
                        }
                        persistentDbSyncQueue = persistentDbSyncQueue.filter(q => q.txId !== singleEntry.txId);
                        savePersistentDbQueue();
                        totalSyncedInRun++;
                    } else {
                        const errMsg = String(singleRes.error.message || '').toLowerCase();
                        const errCode = String(singleRes.error.code || '');
                        if (errCode === '23505' || errMsg.includes('duplicate') || errMsg.includes('unique')) {
                            // มีข้อมูลใน DB อยู่แล้ว -> ถือว่าซิงค์แล้วเพื่อไม่ให้ค้างคิว
                            const feedMatch = recentInboundList.find(f => f && (f._txId === singleEntry.txId || (f.sn && String(f.sn).toUpperCase() === String(singleEntry.payload.sn).toUpperCase())));
                            if (feedMatch) {
                                feedMatch.db_status = 'SYNCED';
                                feedMatch.isOffline = false;
                            }
                            persistentDbSyncQueue = persistentDbSyncQueue.filter(q => q.txId !== singleEntry.txId);
                            savePersistentDbQueue();
                        } else {
                            // เน็ตหลุดหรือเซิร์ฟเวอร์ไม่ตอบสนอง -> คืนสถานะเป็น PENDING รอเน็ตกลับมา
                            const feedMatch = recentInboundList.find(f => f && (f._txId === singleEntry.txId || (f.sn && String(f.sn).toUpperCase() === String(singleEntry.payload.sn).toUpperCase())));
                            if (feedMatch) {
                                feedMatch.db_status = 'PENDING';
                                feedMatch.isOffline = true;
                            }
                            networkFailed = true;
                            break;
                        }
                    }
                }

                saveRecentInboundFeedToCache();
                scheduleDebouncedFeedRender();
                updateInboundNetworkSyncHUD();

                if (networkFailed) break;
            }
        }
    } catch (err) {
        console.error('Flush DB queue exception:', err);
        persistentDbSyncQueue.forEach(entry => {
            const feedMatch = recentInboundList.find(f => f && (f._txId === entry.txId || (f.sn && String(f.sn).toUpperCase() === String(entry.payload.sn).toUpperCase())));
            if (feedMatch && feedMatch.db_status === 'SYNCING') {
                feedMatch.db_status = 'PENDING';
                feedMatch.isOffline = true;
            }
        });
        saveRecentInboundFeedToCache();
        scheduleDebouncedFeedRender();
    } finally {
        isFlushingDbQueue = false;
        invalidateOccupiedLocationsCache();
        updateInboundNetworkSyncHUD();
        updateMasterDbCountBadge();

        if (totalSyncedInRun > 0 && persistentDbSyncQueue.length === 0) {
            document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: { action: 'SYNC_COMPLETE', count: totalSyncedInRun } }));
            document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: { action: 'SYNC_COMPLETE', count: totalSyncedInRun } }));
        }
    }
}

function initNetworkStatusListeners() {
    window.addEventListener('online', () => {
        updateInboundNetworkSyncHUD();
        if (persistentDbSyncQueue.length > 0) {
            showToast(`🌐 อินเทอร์เน็ตกลับมาแล้ว! กำลังจัดลำดับคิวส่งเข้าคลัง ${persistentDbSyncQueue.length} รายการ...`, false, 3500);
            flushPersistentDbSyncQueue();
        } else {
            showToast('🟢 เชื่อมต่ออินเทอร์เน็ตเรียลไทม์เรียบร้อยแล้ว', false, 2200);
        }
    });

    window.addEventListener('offline', () => {
        updateInboundNetworkSyncHUD();
        showToast('🟠 สัญญาณอินเทอร์เน็ตหลุด! เปิดใช้งานโหมดออฟไลน์ สามารถยิงสแกนรับเข้าได้ต่อเนื่องทันที', true, 4000);
    });

    // ตัวตรวจสอบอัตโนมัติทุก 4 วินาที กรณีมือถือ Android/iOS สัญญาณกลับมาแล้วแต่ event online ยังไม่ทำงาน
    if (!networkMonitorTimer) {
        networkMonitorTimer = setInterval(() => {
            updateInboundNetworkSyncHUD();
            if (navigator.onLine && persistentDbSyncQueue.length > 0 && !isFlushingDbQueue) {
                flushPersistentDbSyncQueue();
            }
        }, 4000);
    }
}

async function handleInboundSubmit(e) {
    if (e) e.preventDefault();

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

    const rawSn = snInput.value || '';
    // รองรับกรณีปืนสแกนส่งรหัสติดกันหลายบรรทัดในเสี้ยววินาที
    const snTokens = rawSn
        .split(/[\r\n]+/)
        .map(s => s.replace(/[\t\u200B-\u200D\uFEFF]/g, '').trim())
        .filter(Boolean);

    if (snTokens.length === 0) {
        ensureSnInputFocus(true);
        return;
    }

    const category = (document.getElementById('inboundCategory')?.value || '').trim();
    const name = (document.getElementById('inboundName')?.value || '').trim();
    const meterVal = parseInt(document.getElementById('inboundMeter')?.value) || 0;

    if (!category || !name) {
        triggerScanInputFlash('error');
        showToast('⚠️ กรุณาระบุหมวดหมู่ SKU และชื่อรุ่นสินค้าก่อนทำการสแกนรับเข้า', true);
        snInput.select();
        return;
    }

    const currentSelectedLoc = getSelectedLocationFromDropdowns();

    if (!currentSelectedLoc || currentSelectedLoc.includes('โปรดเลือก') || currentSelectedLoc === '') {
        triggerScanInputFlash('error');
        showToast('⚠️ กรุณาเลือกแถวจัดเก็บคลังสินค้าก่อนทำการสแกนรับเข้า!', true);
        const aisleSelect = document.getElementById('inboundAisleSelect');
        if (aisleSelect) aisleSelect.focus();
        return;
    }

    // ล้างช่องกรอกทันทีเพื่อให้พร้อมรับการยิงนัดถัดไปใน 0ms
    snInput.value = '';
    ensureSnInputFocus(true);

    const nowBase = Date.now();
    snTokens.forEach((cleanSn, index) => {
        scanProcessingQueue.push({
            sn: cleanSn,
            category,
            name,
            meterVal,
            location: index === 0 ? currentSelectedLoc : null,
            timestamp: nowBase + index
        });
        recordScanSpeedMetrics();
    });

    if (!isProcessingScanQueue) {
        processScanProcessingQueue();
    }
}

// 🟢 🚀 ประมวลผลคิวสแกนสินค้าแบบต่อเนื่องความเร็วสูง 100%
async function processScanProcessingQueue() {
    if (isProcessingScanQueue || scanProcessingQueue.length === 0) return;
    isProcessingScanQueue = true;

    let enqueuedAnyForDb = false;

    while (scanProcessingQueue.length > 0) {
        const item = scanProcessingQueue.shift();
        const { sn, category, name, meterVal, location } = item;

        let dbLocation = location || getSelectedLocationFromDropdowns();
        const snUpper = sn.toUpperCase();

        const isDuplicateSn = pendingFastSnSet.has(snUpper) ||
                              (typeof globalInventoryData !== 'undefined' && globalInventoryData.some(i => i && String(i.sn).toUpperCase() === snUpper && i.status !== 'OUT' && !i.is_deleted)) ||
                              (typeof recentInboundList !== 'undefined' && recentInboundList.some(r => r && String(r.sn).toUpperCase() === snUpper));

        if (isDuplicateSn) {
            triggerScanInputFlash('duplicate');
            showToast(`⚠️ ซีเรียล S/N: ${sn} มีอยู่ในคลังสินค้าเรียบร้อยแล้ว ห้ามสแกนซ้ำเด็ดขาด!`, true);
            ensureSnInputFocus(true);
            continue;
        }

        const specialLocations = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
        const isSpecialZone = specialLocations.includes(dbLocation.toUpperCase());

        if (!isSpecialZone) {
            const occupiedSet = getAllOccupiedLocationsSet();
            const normLocKey = getNormalizedLocKey(dbLocation);
            const isLocOccupied = occupiedSet.has(dbLocation) || (normLocKey && occupiedSet.has(normLocKey));

            if (isLocOccupied) {
                const occupyingItem = getOccupyingSnDetails(dbLocation);
                const occupyingSn = occupyingItem ? occupyingItem.sn : 'ไม่ทราบ S/N';

                triggerScanInputFlash('occupied');
                showToast(`⚠️ พิกัด ${formatLocationSpaced(dbLocation)} มีสินค้า (S/N: ${occupyingSn}) จัดเก็บอยู่แล้ว`, true);

                forceSyncAndSelectAvailableLocation(true);
                ensureSnInputFocus(true);
                continue;
            }
        }

        // จอง S/N และพิกัดในหน่วยความจำทันที (0ms Synchronous Lock)
        pendingFastSnSet.add(snUpper);
        addOccupiedLocToSet(pendingFastLocationSet, dbLocation);

        const activeUserFullName = getCurrentUserFullName() || 'เจ้าหน้าที่คลังสินค้า';
        const nowISO = new Date().toISOString();
        const currentTimeStr = new Date().toLocaleTimeString('th-TH');

        const rawPayload = {
            category,
            name,
            sn,
            meter: meterVal,
            location: dbLocation,
            qty: 1,
            status: 'IN_STOCK',
            received_by: activeUserFullName,
            created_at: nowISO
        };

        const isOnlineNow = navigator.onLine;

        const feedItem = {
            sn,
            category,
            name,
            meter: meterVal,
            location: dbLocation,
            received_by: activeUserFullName,
            time: currentTimeStr,
            created_at: nowISO,
            isOffline: !isOnlineNow,
            db_status: isOnlineNow ? 'SYNCING' : 'PENDING'
        };

        recentInboundList.unshift(feedItem);
        if (recentInboundList.length > 100) recentInboundList.length = 100;

        if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
            globalInventoryData.unshift(rawPayload);
        }

        // ใส่เข้าคิวถาวร (Persistent FIFO Queue) เพื่อรองรับทั้งออนไลน์และออฟไลน์ 100%
        enqueuePersistentDbSync(rawPayload, feedItem);
        enqueuedAnyForDb = true;

        saveRecentInboundFeedToCache();
        forceSyncAndSelectAvailableLocation(true);
        triggerScanInputFlash('success');

        if (!isOnlineNow) {
            if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
                offlineInboundQueue.push(rawPayload);
                if (typeof persistQueue === 'function') persistQueue();
                if (typeof updateOnlineOfflineUI === 'function') updateOnlineOfflineUI(false);
            }
        }

        scheduleDebouncedFeedRender();

        // กระจายคำสั่งการรับเข้าใหม่ไปยังหน้าเช็กสต็อกสินค้า Realtime 100%
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel('wms_realtime_sync_channel');
                channel.postMessage({ action: 'INBOUND', item: rawPayload });
            }
        } catch (e) {}

        document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: rawPayload }));
        document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: rawPayload }));
    }

    isProcessingScanQueue = false;
    ensureSnInputFocus(true);

    // สั่งซิงค์คิว FIFO เข้าฐานข้อมูลทันทีหากออนไลน์
    if (enqueuedAnyForDb && navigator.onLine) {
        flushPersistentDbSyncQueue();
    }
}

function scheduleDebouncedFeedRender() {
    if (isFeedRenderScheduled) return;
    isFeedRenderScheduled = true;
    requestAnimationFrame(() => {
        renderLiveInboundFeed();
        isFeedRenderScheduled = false;
        ensureSnInputFocus();
    });
}

function loadRecentInboundFeedFromCache() {
    try {
        const cached = localStorage.getItem('WMS_RECENT_INBOUND_CACHE');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                recentInboundList = parsed;
                renderLiveInboundFeed();
            }
        }
    } catch (e) {}
}

function saveRecentInboundFeedToCache() {
    try {
        localStorage.setItem('WMS_RECENT_INBOUND_CACHE', JSON.stringify(recentInboundList.slice(0, 100)));
    } catch (e) {}
}

async function loadRecentInboundFeedFromDB() {
    if (!navigator.onLine || typeof _supabase === 'undefined' || !_supabase) return;
    try {
        const { data, error } = await _supabase
            .from('warehouse_items')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            // คงรายการที่ยังรอส่งในคิวออฟไลน์ไว้ด้านบนสุดเสมอ
            const pendingMap = new Map();
            persistentDbSyncQueue.forEach(q => {
                if (q && q.payload && q.payload.sn) {
                    pendingMap.set(String(q.payload.sn).toUpperCase(), q);
                }
            });

            const pendingLocalItems = recentInboundList.filter(item => item && pendingMap.has(String(item.sn).toUpperCase()));

            const dbItems = data
                .filter(item => item && !pendingMap.has(String(item.sn).toUpperCase()))
                .map(item => {
                    let rName = item.received_by || item.receiver || item.created_by;
                    if (!rName || rName === 'nakorn.c' || rName === 'Nakorn C' || rName === 'ไม่ระบุผู้บันทึก') {
                        rName = getCurrentUserFullName();
                    }
                    return {
                        id: item.id,
                        sn: item.sn,
                        category: item.category || 'N/A',
                        name: item.name || '-',
                        meter: item.meter || 0,
                        location: item.location || 'DOCK',
                        received_by: escapeHTML(rName),
                        time: item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-',
                        created_at: item.created_at,
                        isOffline: false,
                        db_status: 'SYNCED'
                    };
                });

            recentInboundList = pendingLocalItems.concat(dbItems).slice(0, 100);
            saveRecentInboundFeedToCache();
            scheduleDebouncedFeedRender();
        }
    } catch (e) {}
}

function updateMasterDbCountBadge() {
    const badgeElem = document.getElementById('masterDbCountBadge') || document.getElementById('sidebarDbStatusBox');
    if (!badgeElem) return;

    const masterList = typeof globalMasterProducts !== 'undefined' ? globalMasterProducts : [];
    const inventoryList = typeof globalInventoryData !== 'undefined' ? globalInventoryData : [];

    const totalMasterCount = masterList.length;
    const totalInventoryCount = inventoryList.length;

    const uniqueModelNames = new Set();
    masterList.concat(inventoryList).forEach(item => {
        if (!item) return;
        const modelName = (item.name || item.description || item.model || '').trim();
        if (modelName) uniqueModelNames.add(modelName.toLowerCase());
    });
    const totalModelCount = uniqueModelNames.size;

    const isOnline = navigator.onLine;
    const statusDotClass = isOnline ? 'pulse-live-dot' : 'net-dot offline';
    const statusText = isOnline ? 'เชื่อมต่อ DB สำเร็จ' : 'โหมดออฟไลน์ (เก็บคิว)';

    badgeElem.innerHTML = `
        <div class="db-status-container-2line">
            <div class="db-status-line line-1">
                <span class="db-online-tag"><span class="${statusDotClass}"></span> ${statusText}</span>
                <span class="db-stat-item"><i class="fa-solid fa-database"></i> Master <strong>${totalMasterCount.toLocaleString()}</strong> SKU</span>
            </div>
            <div class="db-status-line line-2">
                <span class="db-stat-item"><i class="fa-solid fa-boxes-stacked"></i> ในสต็อก <strong>${totalInventoryCount.toLocaleString()}</strong> ชิ้น</span>
                <span class="db-stat-item"><i class="fa-solid fa-tags"></i> ใน DB <strong>${totalModelCount.toLocaleString()}</strong> รุ่น</span>
            </div>
        </div>
    `;

    const inboundKpiElem = document.getElementById('inboundTotalCountKpi') || document.getElementById('inboundStockBadge');
    if (inboundKpiElem) inboundKpiElem.textContent = `${totalInventoryCount.toLocaleString()} ชิ้น`;

    if (typeof updateKPIs === 'function') {
        try { updateKPIs(); } catch (e) {}
    }
}

function onSkuSearchInput(val) {
    const box = document.getElementById('skuSuggestionsBox');
    if (!box) return;

    const masterList = (typeof globalMasterProducts !== 'undefined' ? globalMasterProducts : [])
        .concat(typeof globalInventoryData !== 'undefined' ? globalInventoryData : []);

    const uniqueModelNames = new Set();
    masterList.forEach(item => {
        if (!item) return;
        const modelName = (item.name || item.description || item.model || '').trim();
        if (modelName) uniqueModelNames.add(modelName.toLowerCase());
    });
    const totalModelCount = uniqueModelNames.size;

    if (!val.trim()) {
        box.style.display = 'none';
        return;
    }

    const query = val.toLowerCase().trim();
    const skuMap = new Map();

    for (let i = 0; i < masterList.length; i++) {
        const item = masterList[i];
        if (!item) continue;
        const skuKey = (item.sku || item.category || item.code || '').trim();
        const nameVal = (item.name || item.description || item.model || '').trim();

        if (skuKey && !skuMap.has(skuKey.toLowerCase())) {
            if (skuKey.toLowerCase().includes(query) || nameVal.toLowerCase().includes(query)) {
                skuMap.set(skuKey.toLowerCase(), { sku: skuKey, name: nameVal });
            }
        }
        if (skuMap.size >= 100) break;
    }

    const uniqueResults = Array.from(skuMap.values());

    let headerHtml = `
        <div style="padding:10px 14px; background:var(--bg-subtle, #f8fafc); border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-sub, #64748b);">
            <span><i class="fa-solid fa-magnifying-glass"></i> ผลการค้นหา (${uniqueResults.length})</span>
            <span style="background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); padding:2px 10px; border-radius:12px; font-weight:600; font-size:0.75rem;">
                <i class="fa-solid fa-tags"></i> มี ${totalModelCount.toLocaleString()} ชื่อรุ่นใน DB
            </span>
        </div>
    `;

    if (uniqueResults.length === 0) {
        box.innerHTML = headerHtml + `<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:0.82rem;">ไม่พบสินค้าในฐานข้อมูล (${masterList.length.toLocaleString()} รายการ)</div>`;
        box.style.display = 'block';
        return;
    }

    let html = headerHtml;
    uniqueResults.forEach(item => {
        const itemSku = escapeHTML(item.sku);
        const itemName = escapeHTML(item.name || 'ไม่ระบุชื่อรุ่น');
        html += `
            <div class="suggestion-item" style="padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border-color, #f1f5f9); display:flex; justify-content:space-between; align-items:center; transition:background 0.15s ease;" onclick="selectSkuSuggestion('${itemSku}', '${itemName}')">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                    <span class="mono font-bold" style="color:var(--primary-text, #0284c7); font-size:0.88rem; flex-shrink:0;">${itemSku}</span>
                    <span style="color:var(--text-muted, #94a3b8); font-size:0.82rem;">—</span>
                    <span style="color:var(--text-main, #0f172a); font-size:0.85rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
                        <i class="fa-solid fa-box-archive" style="font-size:0.75rem; color:var(--primary, #0284c7); margin-right:4px;"></i> ${itemName}
                    </span>
                </div>
                <span style="font-size:0.75rem; color:var(--text-sub, #64748b); flex-shrink:0; background:var(--bg-body, #f8fafc); padding:2px 8px; border-radius:6px; border:1px solid var(--border-color, #e2e8f0); font-weight:600;">
                    <i class="fa-solid fa-tag" style="color:var(--primary, #0284c7);"></i> ชื่อรุ่น
                </span>
            </div>
        `;
    });
    box.innerHTML = html;
    box.style.display = 'block';
}

function selectSkuSuggestion(sku, name) {
    const categoryElem = document.getElementById('inboundCategory');
    const nameElem = document.getElementById('inboundName');
    const searchElem = document.getElementById('skuSearchInput');
    const box = document.getElementById('skuSuggestionsBox');

    if (categoryElem) categoryElem.value = sku;
    if (nameElem) nameElem.value = name;
    if (searchElem) searchElem.value = `${sku} - ${name}`;
    if (box) box.style.display = 'none';

    ensureSnInputFocus(true);
}

function initMasterProductsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_products_changes_inbound')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
                if (typeof loadMasterProductsFromDB === 'function') {
                    await loadMasterProductsFromDB();
                    updateMasterDbCountBadge();
                }
            })
            .subscribe();
    } catch (e) {}
}

async function autoRefreshInboundDatabaseAndLocations() {
    invalidateOccupiedLocationsCache();

    if (typeof fetchInventoryData === 'function') {
        try { await fetchInventoryData(); } catch (e) {}
    } else if (typeof loadInventoryFromDB === 'function') {
        try { await loadInventoryFromDB(); } catch (e) {}
    }

    if (typeof loadRecentInboundFeedFromDB === 'function') {
        try { await loadRecentInboundFeedFromDB(); } catch (e) {}
    }

    // 🟢 คงค่าแถวจัดเก็บให้เว้นว่างไว้หากผู้ใช้ยังไม่เคยกดเลือกแถว
    populateInboundAisleDropdown(true);
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (userHasSelectedAisle && aisleSelect && aisleSelect.value && !aisleSelect.value.includes('โปรดเลือก')) {
        populateInboundLocationDropdownsStrict(aisleSelect.value, null, true);
    } else {
        populateInboundLocationDropdownsStrict('', null, false);
    }

    scheduleDebouncedFeedRender();
    ensureSnInputFocus();
}

function initWarehouseItemsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_warehouse_items_realtime_inbound_v70')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_items' }, async (payload) => {
                if (payload.eventType === 'DELETE') {
                    const oldObj = payload.old || {};
                    purgeDispatchedOrDeletedItemFromMemory(oldObj.sn, oldObj.id, oldObj.location);
                } else if (payload.eventType === 'UPDATE' && payload.new) {
                    const statusUpper = String(payload.new.status || '').toUpperCase();
                    const isOut = statusUpper === 'OUT' || statusUpper === 'DISPATCHED' || statusUpper === 'ISSUED' || statusUpper === 'RELEASED' || payload.new.is_deleted || Number(payload.new.qty) <= 0;

                    if (isOut) {
                        purgeDispatchedOrDeletedItemFromMemory(payload.new.sn, payload.new.id, payload.new.location);
                    } else {
                        if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                            const idx = globalInventoryData.findIndex(item => item && (item.id === payload.new.id || (payload.new.sn && String(item.sn).toUpperCase() === String(payload.new.sn).toUpperCase())));
                            if (idx !== -1) {
                                globalInventoryData[idx] = { ...globalInventoryData[idx], ...payload.new };
                            } else {
                                globalInventoryData.unshift(payload.new);
                            }
                        }
                    }
                } else if (payload.eventType === 'INSERT' && payload.new) {
                    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                        const exists = globalInventoryData.some(item => item && (item.id === payload.new.id || (payload.new.sn && String(item.sn).toUpperCase() === String(payload.new.sn).toUpperCase())));
                        if (!exists) {
                            globalInventoryData.unshift(payload.new);
                        }
                    }
                }

                saveRecentInboundFeedToCache();
                await autoRefreshInboundDatabaseAndLocations();

                document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: payload }));
                document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: payload }));
            })
            .subscribe();
    } catch (e) {}
}

function initCrossTabBroadcastListener() {
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.onmessage = async (event) => {
                const data = event.data;
                if (!data) return;

                const actionUpper = String(data.action || data.type || '').toUpperCase();
                if (actionUpper.includes('DELETE') || actionUpper.includes('DISPATCH') || actionUpper.includes('OUT') || actionUpper.includes('ISSUE') || actionUpper.includes('TRANSFER')) {
                    purgeDispatchedOrDeletedItemFromMemory(data.sn, data.id, data.location);
                }

                await autoRefreshInboundDatabaseAndLocations();
            };
        }
    } catch (e) {}
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

function onRecentFeedSearch(queryText) {
    recentFeedSearchQuery = (queryText || '').toLowerCase().trim();
    renderLiveInboundFeed();
}

function triggerReprintStickerFromFeed(sn, name = '', category = '', location = '') {
    if (!sn) return;

    if (typeof window.openPrintBarcodeModal === 'function') {
        window.openPrintBarcodeModal('SINGLE', sn);
        return;
    }
    if (typeof window.printSingleBarcode === 'function') {
        window.printSingleBarcode(sn);
        return;
    }
    copyToClipboard(sn);
}

// 🟢 Render รายการสแกนรับเข้าพร้อมแสดงสถานะการบันทึกเข้า DB บน UI การ์ดแบบทันสมัย
function renderLiveInboundFeed() {
    const container = document.getElementById('liveInboundFeedContainer');
    if (!container) return;

    ensureInboundNetworkSyncHUD();
    updateInboundNetworkSyncHUD();
    updateMasterDbCountBadge();

    let filteredList = recentInboundList;
    if (recentFeedSearchQuery) {
        filteredList = recentInboundList.filter(item => {
            if (!item) return false;
            const snMatch = String(item.sn || '').toLowerCase().includes(recentFeedSearchQuery);
            const nameMatch = String(item.name || '').toLowerCase().includes(recentFeedSearchQuery);
            const catMatch = String(item.category || '').toLowerCase().includes(recentFeedSearchQuery);
            const locMatch = String(item.location || '').toLowerCase().includes(recentFeedSearchQuery);
            const receiverMatch = String(item.received_by || item.receiver || '').toLowerCase().includes(recentFeedSearchQuery);
            return snMatch || nameMatch || catMatch || locMatch || receiverMatch;
        });
    }

    if (recentInboundList.length === 0) {
        container.innerHTML = `
            <div style="padding:32px 20px; text-align:center; color:var(--text-muted, #94a3b8); font-size:0.88rem; background:var(--bg-surface, #ffffff); border-radius:16px; border:1px solid var(--border-color, #e2e8f0); box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                <i class="fa-solid fa-box-open" style="font-size:2.5rem; margin-bottom:10px; opacity:0.35; color:var(--primary, #0284c7);"></i><br/>
                ยังไม่มีรายการรับเข้าในเซสชันนี้
            </div>`;
        return;
    }

    const countElem = document.getElementById('recentInboundCountBadge');
    if (countElem) countElem.textContent = `${recentInboundList.length} รายการ`;

    const currentActiveUserName = getCurrentUserFullName();

    let html = `
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="pulse-live-dot"></span>
                    <span style="font-size:0.9rem; font-weight:700; color:var(--text-main, #0f172a);">
                        ประวัติการรับเข้าล่าสุด Realtime (${filteredList.length}/${recentInboundList.length})
                    </span>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="clearRecentInboundFeedView()" style="font-size:0.75rem; padding:4px 10px; border-radius:8px;" title="ล้างหน้าจอแสดงผล">
                    <i class="fa-solid fa-eraser"></i> เคลียร์
                </button>
            </div>
            <div style="position:relative; width:100%;">
                <input type="text"
                       id="recentFeedSearchInput"
                       oninput="onRecentFeedSearch(this.value)"
                       value="${escapeHTML(recentFeedSearchQuery)}"
                       placeholder="🔍 ค้นหาในประวัติ (S/N, SKU, พิกัด, ผู้รับ)..."
                       style="width:100%; padding:8px 14px 8px 34px; font-size:0.82rem; border-radius:10px; border:1px solid var(--border-color, #cbd5e1); background:var(--bg-subtle, #f8fafc); color:var(--text-main, #0f172a); outline:none; transition:all 0.2s ease;" />
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:0.8rem; color:var(--text-muted, #94a3b8);"></i>
            </div>
        </div>
        <div class="inbound-feed-scroll-wrapper" style="max-height: calc(100vh - 330px); overflow-y: auto; padding-right: 6px; margin-right: -4px;">
            <div class="inbound-feed-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap:12px;">
    `;

    if (filteredList.length === 0) {
        html += `
            <div style="grid-column: 1 / -1; padding:24px; text-align:center; color:var(--text-muted, #94a3b8); font-size:0.84rem; background:var(--bg-surface, #ffffff); border-radius:12px; border:1px dashed var(--border-color, #cbd5e1);">
                ไม่พบรายการประวัติที่ตรงกับ "${escapeHTML(recentFeedSearchQuery)}"
            </div>
        `;
    } else {
        filteredList.forEach(item => {
            const locBadgeHTML = formatLocationBadgeHTML(item.location);

            let displayReceiver = item.received_by || item.receiver || item.created_by;
            if (!displayReceiver || displayReceiver === 'nakorn.c' || displayReceiver === 'Nakorn C' || displayReceiver === 'ไม่ระบุผู้บันทึก') {
                displayReceiver = currentActiveUserName;
            }

            const receiverName = escapeHTML(displayReceiver);
            const itemSn = escapeHTML(item.sn);
            const itemId = escapeHTML(item.id || '');
            const itemCategory = escapeHTML(item.category);
            const itemName = escapeHTML(item.name);
            const itemTime = escapeHTML(item.time || (item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-'));

            let dbStatusBadgeHTML = '';
            if (item.db_status === 'SYNCED' || (!item.isOffline && !item._pending && item.db_status !== 'PENDING' && item.db_status !== 'SYNCING')) {
                dbStatusBadgeHTML = `<span class="badge-action inbound" style="background:linear-gradient(135deg, #ecfdf5, #d1fae5); color:#047857; border:1px solid #a7f3d0; padding:3px 9px; border-radius:12px; font-weight:700; font-size:0.72rem; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-circle-check"></i> บันทึกเข้า DB สำเร็จ</span>`;
            } else if (item.db_status === 'SYNCING') {
                dbStatusBadgeHTML = `<span class="badge-action warning" style="background:linear-gradient(135deg, #eff6ff, #dbeafe); color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 9px; border-radius:12px; font-weight:700; font-size:0.72rem; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกเข้า DB</span>`;
            } else {
                dbStatusBadgeHTML = `<span class="badge-action warning" style="background:linear-gradient(135deg, #fffbeb, #fef3c7); color:#b45309; border:1px solid #fde68a; padding:3px 9px; border-radius:12px; font-weight:700; font-size:0.72rem; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-cloud-arrow-up fa-bounce"></i> รอบันทึกเข้า DB (ออฟไลน์)</span>`;
            }

            html += `
                <div class="feed-item modern-feed-card animate-feed-entry">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%; gap:6px;">
                        <div style="display:flex; flex-direction:column; width:100%;">
                            <span style="font-size:0.68rem; color:var(--text-muted, #94a3b8); font-weight:700; text-transform:uppercase;">ซีเรียล S/N:</span>
                            <span class="full-sn-text" style="font-size:0.92rem;">
                                ${itemSn}
                            </span>
                        </div>
                        <div class="feed-card-actions" style="flex-shrink:0;">
                            <button type="button" class="btn-card-action" onclick="copyToClipboard('${itemSn}');" title="คัดลอก S/N">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                            <button type="button" class="btn-card-action" onclick="triggerReprintStickerFromFeed('${itemSn}', '${itemName}', '${itemCategory}', '${item.location}')" title="ดีดไปที่ศูนย์พิมพ์บาร์โค้ด">
                                <i class="fa-solid fa-print"></i> พิมพ์
                            </button>
                            <button type="button" class="btn-card-action btn-card-delete" onclick="deleteInboundItem('${itemSn}', '${itemId}', '${item.location}')" title="ลบรายการนี้" style="color:#ef4444; border-color:#fca5a5; background:#fef2f2;">
                                <i class="fa-solid fa-trash-can"></i> ลบ
                            </button>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1px; margin-bottom:2px;">
                        ${dbStatusBadgeHTML}
                    </div>

                    <div style="display:flex; flex-direction:column; gap:4px; background:var(--bg-subtle, #f8fafc); padding:8px 12px; border-radius:10px; border:1px solid var(--border-color, #e2e8f0);">
                        <span style="font-size:0.68rem; color:var(--text-muted, #64748b); font-weight:700;">📍 พิกัดจัดเก็บ (1 คอลัมน์):</span>
                        <div style="width:100%;">
                            ${locBadgeHTML}
                        </div>
                    </div>

                    <div style="font-size:0.82rem; color:var(--text-sub, #475569); line-height:1.3; word-break:break-word;" title="[${itemCategory}] ${itemName}">
                        <strong style="color:var(--primary-text, #0284c7);">[${itemCategory}]</strong> ${itemName}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.73rem; color:var(--text-muted, #94a3b8); border-top:1px dashed var(--border-color, #e2e8f0); padding-top:6px; margin-top:2px;">
                        <span style="font-weight:600; color:var(--text-main, #0f172a);"><i class="fa-solid fa-user-check" style="color:var(--success, #10b981);"></i> ${receiverName}</span>
                        <span><i class="fa-regular fa-clock"></i> ${itemTime} น.</span>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function clearRecentInboundFeedView() {
    recentInboundList = [];
    saveRecentInboundFeedToCache();
    renderLiveInboundFeed();
    ensureSnInputFocus();
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

// 🔫 ตัวจัดการปืนสแกนบาร์โค้ดทุกประเภท (Enter, Tab, Paste, และ Rapid Burst Keystroke)
function attachUniversalScannerGunListener(snInput) {
    if (!snInput || snInput.dataset.universalScannerBound === 'true') return;
    snInput.dataset.universalScannerBound = 'true';

    let lastKeyTime = 0;
    let burstKeyCount = 0;
    let burstAutoSubmitTimer = null;

    snInput.addEventListener('keydown', function (e) {
        // ปลดล็อกเสียงบนเบราว์เซอร์ตั้งแต่การกดปุ่มแรก
        getSharedWmsAudioContext();

        if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Tab') {
            e.preventDefault();
            if (burstAutoSubmitTimer) {
                clearTimeout(burstAutoSubmitTimer);
                burstAutoSubmitTimer = null;
            }
            burstKeyCount = 0;
            handleInboundSubmit(e);
            return;
        }

        const now = Date.now();
        if (e.key && e.key.length === 1) {
            if (now - lastKeyTime < 45) {
                burstKeyCount++;
            } else {
                burstKeyCount = 1;
            }
            lastKeyTime = now;
        }
    });

    snInput.addEventListener('input', function () {
        if (burstAutoSubmitTimer) {
            clearTimeout(burstAutoSubmitTimer);
            burstAutoSubmitTimer = null;
        }
        // หากตรวจพบการยิงรหัสความเร็วสูงจากปืนสแกน (4 ตัวขึ้นไปติดกัน <45ms) ที่ไม่ได้ส่ง Enter ต่อท้าย ให้บันทึกอัตโนมัติทันที
        if (burstKeyCount >= 4 && snInput.value.trim().length >= 4) {
            burstAutoSubmitTimer = setTimeout(() => {
                burstKeyCount = 0;
                if (snInput.value.trim().length >= 4) {
                    handleInboundSubmit();
                }
            }, 85);
        }
    });

    snInput.addEventListener('paste', function () {
        setTimeout(() => {
            if (snInput.value && snInput.value.trim().length > 0) {
                handleInboundSubmit();
            }
        }, 15);
    });

    snInput.addEventListener('blur', () => setTimeout(() => ensureSnInputFocus(false), 60));
}

function initInboundEventListeners() {
    injectModernScanUIStyles();
    initFrontendSecurityGuards();
    checkAndHideLoginOverlay();

    // โหลดคิวที่ค้างจากการสแกนออฟไลน์ก่อนหน้า (ถ้ามี)
    loadPersistentDbQueue();
    loadRecentInboundFeedFromCache();

    // 🟢 บังคับค่าเริ่มต้นของ แถวจัดเก็บ ให้เว้นว่าง / "-- โปรดเลือกแถวจัดเก็บ --" เสมอเมื่อเปิดหน้าเว็บ
    userHasSelectedAisle = false;
    populateInboundAisleDropdown(false);
    populateInboundLocationDropdownsStrict('', null, false);
    installAisleDropdownBlankGuard();

    ensureInboundNetworkSyncHUD();
    updateInboundNetworkSyncHUD();
    initNetworkStatusListeners();

    loadRecentInboundFeedFromDB();

    // หากมีคิวค้างอยู่และออนไลน์ ให้ซิงค์เข้าฐานข้อมูลตามลำดับทันที
    if (navigator.onLine && persistentDbSyncQueue.length > 0) {
        flushPersistentDbSyncQueue();
    }

    document.addEventListener('biometricLoginSuccess', function (e) {
        const userName = (e && e.detail && e.detail.userName) ? e.detail.userName : getCurrentUserFullName();
        showBiometricSuccessToast(userName);
    });

    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        attachUniversalScannerGunListener(snInput);
    }

    // เชื่อมปุ่มและไอคอนกล้องสแกนบาร์โค้ดทุกจุดให้กดแล้วเด้งขึ้นมาทันที
    const cameraTriggerBtn = document.getElementById('btnOpenCameraController') || document.getElementById('cameraScanBtn');
    if (cameraTriggerBtn) {
        cameraTriggerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openCameraScanner();
        });
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#btnOpenCameraController, #cameraScanBtn, [data-action="open-camera-scanner"], .camera-scan-trigger');
        if (btn && btn !== cameraTriggerBtn) {
            e.preventDefault();
            openCameraScanner();
        }
    });

    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (aisleSelect) {
        aisleSelect.addEventListener('change', function (e) {
            onInboundAisleChange(e.target.value);
        });
    }

    const baySelect = document.getElementById('inboundBaySelect');
    if (baySelect) {
        baySelect.addEventListener('change', function (e) {
            onInboundBayChange(e.target.value);
        });
    }

    const shelfSelect = document.getElementById('inboundShelfSelect');
    if (shelfSelect) {
        shelfSelect.addEventListener('change', function (e) {
            onInboundShelfChange(e.target.value);
        });
    }

    const slotSelect = document.getElementById('inboundSlotSelect');
    if (slotSelect) {
        slotSelect.addEventListener('change', function (e) {
            onInboundSlotChange(e.target.value);
        });
    }

    const realtimeEvents = [
        'inventoryUpdated', 'inventoryDeleted', 'inventoryDispatched',
        'inventoryDataChanged', 'wmsRealtimeSync', 'warehouseConfigUpdated',
        'locationLayoutChanged', 'itemDeleted', 'itemDispatched',
        'stockUpdated', 'outboundCompleted'
    ];

    realtimeEvents.forEach(evtName => {
        document.addEventListener(evtName, async function (e) {
            if (e && e.detail) {
                const detail = e.detail;
                if (detail.action === 'SYNC_COMPLETE') return;
                const targetSn = detail.sn || detail.serialNumber || detail.SN;
                const targetId = detail.id;
                const targetLoc = detail.location || detail.loc;

                const statusUpper = String(detail.status || detail.action || '').toUpperCase();
                const isRemoval = evtName.toLowerCase().includes('delete') ||
                                  evtName.toLowerCase().includes('dispatch') ||
                                  evtName.toLowerCase().includes('outbound') ||
                                  statusUpper.includes('DELETE') ||
                                  statusUpper.includes('OUT') ||
                                  statusUpper.includes('DISPATCH') ||
                                  statusUpper.includes('ISSUE') ||
                                  detail.is_deleted;

                if (isRemoval) {
                    purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId, targetLoc);
                }
            }
            await autoRefreshInboundDatabaseAndLocations();
        }, true);
    });

    window.addEventListener('storage', async function (e) {
        if (e.key === 'WMS_AISLE_CONFIGS' || e.key === 'WMS_INVENTORY_DATA' || e.key === 'WMS_LAST_MUTATION' || e.key === 'WMS_MASTER_AISLES' || e.key === 'WMS_DELETED_ITEM' || e.key === 'WMS_DISPATCHED_ITEM') {
            if ((e.key === 'WMS_DELETED_ITEM' || e.key === 'WMS_DISPATCHED_ITEM') && e.newValue) {
                try {
                    const itemObj = JSON.parse(e.newValue);
                    purgeDispatchedOrDeletedItemFromMemory(itemObj.sn, itemObj.id, itemObj.location);
                } catch (err) {}
            }
            await autoRefreshInboundDatabaseAndLocations();
        }
    });

    initMasterProductsRealtime();
    initWarehouseItemsRealtime();
    initCrossTabBroadcastListener();
    ensureSnInputFocus();
}

if (typeof window !== 'undefined') {
    window.recentInboundList = recentInboundList;
    window.ensureSnInputFocus = ensureSnInputFocus;
    window.getCurrentUserFullName = getCurrentUserFullName;
    window.getAisleConfig = getAisleConfig;
    window.parseLocComponentsInternal = parseLocComponentsInternal;
    window.getNormalizedLocKey = getNormalizedLocKey;
    window.normalizeLocationStandard = normalizeLocationStandard;
    window.formatLocationSpaced = formatLocationSpaced;
    window.formatLocationCode = formatLocationCode;
    window.formatLocationBadgeHTML = formatLocationBadgeHTML;
    window.getOccupyingSnDetails = getOccupyingSnDetails;
    window.getAllOccupiedLocationsSet = getAllOccupiedLocationsSet;
    window.invalidateOccupiedLocationsCache = invalidateOccupiedLocationsCache;
    window.purgeDispatchedOrDeletedItemFromMemory = purgeDispatchedOrDeletedItemFromMemory;
    window.purgeDeletedSnFromMemory = purgeDeletedSnFromMemory;
    window.deleteInboundItem = deleteInboundItem;
    window.calculateNextAvailableSlotInShelf = calculateNextAvailableSlotInShelf;
    window.calculateNextAvailableSlotInBayStrictAisle = calculateNextAvailableSlotInBayStrictAisle;
    window.calculateAisleCapacityAndNextSlot = calculateAisleCapacityAndNextSlot;
    window.populateInboundSlotDropdown = populateInboundSlotDropdown;
    window.populateInboundAisleDropdown = populateInboundAisleDropdown;
    window.populateInboundLocationDropdownsStrict = populateInboundLocationDropdownsStrict;
    window.onInboundAisleChange = onInboundAisleChange;
    window.onInboundBayChange = onInboundBayChange;
    window.onInboundShelfChange = onInboundShelfChange;
    window.onInboundSlotChange = onInboundSlotChange;
    window.updateInboundLocationPreviewFromDropdowns = updateInboundLocationPreviewFromDropdowns;
    window.getSelectedLocationFromDropdowns = getSelectedLocationFromDropdowns;
    window.renderAisleSlotBreakdownUI = renderAisleSlotBreakdownUI;
    window.autoSelectNextAvailableSlotAfterInbound = autoSelectNextAvailableSlotAfterInbound;
    window.forceSyncAndSelectAvailableLocation = forceSyncAndSelectAvailableLocation;
    window.triggerAutoFindNextSlot = triggerAutoFindNextSlot;
    window.handleInboundSubmit = handleInboundSubmit;
    window.processScanProcessingQueue = processScanProcessingQueue;
    window.flushPersistentDbSyncQueue = flushPersistentDbSyncQueue;
    window.updateInboundNetworkSyncHUD = updateInboundNetworkSyncHUD;
    window.loadRecentInboundFeedFromCache = loadRecentInboundFeedFromCache;
    window.saveRecentInboundFeedToCache = saveRecentInboundFeedToCache;
    window.loadRecentInboundFeedFromDB = loadRecentInboundFeedFromDB;
    window.renderLiveInboundFeed = renderLiveInboundFeed;
    window.clearRecentInboundFeedView = clearRecentInboundFeedView;
    window.copyToClipboard = copyToClipboard;
    window.onSkuSearchInput = onSkuSearchInput;
    window.selectSkuSuggestion = selectSkuSuggestion;
    window.updateMasterDbCountBadge = updateMasterDbCountBadge;
    window.checkAndHideLoginOverlay = checkAndHideLoginOverlay;
    window.showToast = showToast;
    window.showToastPopup = showToastPopup;
    window.showBiometricSuccessToast = showBiometricSuccessToast;
    window.toggleMobileSidebar = toggleMobileSidebar;
    window.initMasterProductsRealtime = initMasterProductsRealtime;
    window.initWarehouseItemsRealtime = initWarehouseItemsRealtime;
    window.initCrossTabBroadcastListener = initCrossTabBroadcastListener;
    window.initInboundEventListeners = initInboundEventListeners;
    window.autoRefreshInboundDatabaseAndLocations = autoRefreshInboundDatabaseAndLocations;
    window.onRecentFeedSearch = onRecentFeedSearch;
    window.triggerReprintStickerFromFeed = triggerReprintStickerFromFeed;
    window.playAudioFeedback = playAudioFeedback;
    window.openCameraScanner = openCameraScanner;
    window.closeCameraScanner = closeCameraScanner;
    window.triggerMobileCameraScan = triggerMobileCameraScan;
    window.toggleCameraScanMode = toggleCameraScanMode;
    window.generateAutoSN = generateAutoSN;
    window.initRandomSnModal = initRandomSnModal;
    window.openRandomSnModal = openRandomSnModal;
    window.closeRandomSnModal = closeRandomSnModal;
    window.selectRandomQtyPreset = selectRandomQtyPreset;
    window.confirmBatchRandomInboundProcess = confirmBatchRandomInboundProcess;
    window.startCameraWithCurrentFacingMode = startCameraWithCurrentFacingMode;
    window.switchCameraFacingMode = switchCameraFacingMode;
    window.toggleCameraTorch = toggleCameraTorch;
    window.currentCameraFacingMode = currentCameraFacingMode;
}

document.addEventListener('DOMContentLoaded', () => {
    initInboundEventListeners();
});