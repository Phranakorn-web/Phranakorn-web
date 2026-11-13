// =========================================================================
// --- MODULE 1: SUPABASE CONFIGURATION & REALTIME CONNECTION ENGINE ---
// =========================================================================

const SUPABASE_CONFIG = {
    url: window.WMS_ENV?.SUPABASE_URL || 'https://eusuehaqgwkcgowsgyco.supabase.co',
    key: window.WMS_ENV?.SUPABASE_KEY || 'sb_publishable_ww-mPdyom_i6S4XhfAFj9Q_vFBpTuaE'
};

const _supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'wms-master-app' } }
});

const QUEUE_KEY = 'WMS_OFFLINE_INBOUND_QUEUE';
const ACT_QUEUE_KEY = 'WMS_OFFLINE_ACTIVITY_QUEUE';
const WMS_LOGIN_SESSION_ID_KEY = 'WMS_LOGIN_SESSION_ID';
const WMS_INITIAL_DB_POPUP_SHOWN_KEY = 'WMS_INITIAL_DB_POPUP_SHOWN_SESSION';

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
let offlineInboundQueue = readJSON(QUEUE_KEY);
let offlineActivityQueue = readJSON(ACT_QUEUE_KEY);
let isOfflineMode = !navigator.onLine;
let isSyncing = false;
let lastSyncError = '';
let syncFailNotified = false;
let reloadTimer = null;
let initialPostLoginSyncPopupShown = false;
let dbPopupAutoCloseTimer = null;
let dbPopupDelayTimer = null;
let dbPopupProgressInterval = null;
let userDismissedSyncPopup = false;
let isBackgroundPreloading = false;
let backgroundPreloadCompleted = false;
let globalSyncPopupObserverInstalled = false;

// =========================================================================
// --- IMMEDIATE BOOTSTRAP GUARD (ทำงานทันทีก่อน DOM โหลดเสร็จ) ---
// =========================================================================
(function bootstrapEarlyLoginScreenGuard() {
    try {
        const hashStr = String(window.location.hash || '').toLowerCase();
        const isForceRelogin = sessionStorage.getItem('WMS_FORCE_RELOGIN_REQUIRED') === 'true';
        const isTabVerified = sessionStorage.getItem('WMS_TAB_SESSION_VERIFIED') === 'true';
        const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
        const lastActiveStr = localStorage.getItem('WMS_LAST_ACTIVE_TIME');
        const isExpired = !lastActiveStr || (Date.now() - parseInt(lastActiveStr, 10) >= 5 * 60 * 1000);

        const isNotVerifiedYet =
            hashStr.includes('auth-system') ||
            hashStr.includes('view-login') ||
            isForceRelogin ||
            !savedUserStr ||
            isExpired ||
            !isTabVerified;

        if (isNotVerifiedYet && document.documentElement) {
            document.documentElement.classList.add('wms-login-active', 'wms-unverified-session');
        }
    } catch (e) {}
})();

// =========================================================================
// --- DATABASE LOADING POPUP & BACKGROUND SILENT SYNC CONTROLLER ---
// =========================================================================

function isUserOnLoginOrUnverifiedScreen() {
    try {
        if (document.documentElement) {
            if (
                document.documentElement.classList.contains('wms-login-active') ||
                document.documentElement.classList.contains('wms-unverified-session')
            ) {
                return true;
            }
        }

        if (document.body) {
            if (
                document.body.classList.contains('wms-login-active') ||
                document.body.classList.contains('wms-unverified-session')
            ) {
                return true;
            }
        }

        const hashStr = String(window.location.hash || '').toLowerCase();
        if (hashStr.includes('auth-system') || hashStr.includes('view-login')) return true;

        if (!window.currentUser) return true;
        if (sessionStorage.getItem('WMS_FORCE_RELOGIN_REQUIRED') === 'true') return true;
        if (sessionStorage.getItem('WMS_TAB_SESSION_VERIFIED') !== 'true') return true;

        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            const computed = window.getComputedStyle(loginOverlay);
            if (computed.display !== 'none' && computed.visibility !== 'hidden' && computed.opacity !== '0') {
                return true;
            }
        }

        const newTabModal = document.getElementById('newTabSessionModal');
        if (newTabModal && newTabModal.style.display !== 'none') {
            return true;
        }
    } catch (e) {
        return true;
    }
    return false;
}

function isInventoryPageCurrentlyActive() {
    try {
        const invView = document.getElementById('view-inventory');
        if (invView && invView.style.display !== 'none' && invView.classList.contains('active')) {
            return true;
        }
        const hashStr = String(window.location.hash || '').toLowerCase();
        const searchStr = String(window.location.search || '').toLowerCase();
        if (
            hashStr.includes('inventory') ||
            hashStr.includes('inv-db') ||
            searchStr.includes('inventory') ||
            searchStr.includes('inv-db')
        ) {
            return true;
        }
    } catch (e) {}
    return false;
}

function shouldSuppressGlobalSyncPopup() {
    if (isUserOnLoginOrUnverifiedScreen()) return true;
    if (userDismissedSyncPopup) return true;
    return false;
}

function isExternalDbSyncOverlayElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (
        el.id === 'loginOverlay' ||
        el.id === 'newTabSessionModal' ||
        el.id === 'sessionWarningModal'
    ) {
        return false;
    }

    if (el.id === 'wmsDbFloatingPopup') return true;

    const text = el.textContent || '';
    if (!text) return false;

    const hasSyncSignature =
        text.includes('กำลังซิงค์ฐานข้อมูลออนไลน์') ||
        text.includes('ซ่อนหน้าต่าง (โหลดต่อเบื้องหลัง)') ||
        text.includes('กำลังโหลดโครงสร้างพิกัดและผังคลังสินค้า');

    if (!hasSyncSignature) return false;

    const styleAttr = (el.getAttribute('style') || '').toLowerCase();
    const idAndClass = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`.toLowerCase();
    let isFixedOverlay =
        styleAttr.includes('position: fixed') ||
        styleAttr.includes('position:fixed') ||
        idAndClass.includes('overlay') ||
        idAndClass.includes('modal') ||
        idAndClass.includes('popup') ||
        idAndClass.includes('sync');

    if (!isFixedOverlay && el.parentElement === document.body) {
        try {
            const computed = window.getComputedStyle(el);
            if (computed.position === 'fixed') isFixedOverlay = true;
        } catch (e) {}
    }

    return isFixedOverlay;
}

function hideAllDetectedSyncPopups() {
    const popup = document.getElementById('wmsDbFloatingPopup');
    if (popup) {
        popup.style.setProperty('display', 'none', 'important');
    }

    if (!document.body) return;

    const candidates = document.body.querySelectorAll('div[id], div[class], div[style*="fixed"]');
    candidates.forEach(el => {
        if (isExternalDbSyncOverlayElement(el)) {
            el.dataset.wmsSuppressedSyncOverlay = 'true';
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
        }
    });
}

// 🔽 ปุ่มกด "ซ่อนหน้าต่าง (โหลดต่อเบื้องหลัง)"
function dismissDbPopupToBackground() {
    userDismissedSyncPopup = true;
    if (dbPopupDelayTimer) {
        clearTimeout(dbPopupDelayTimer);
        dbPopupDelayTimer = null;
    }
    if (dbPopupAutoCloseTimer) {
        clearTimeout(dbPopupAutoCloseTimer);
        dbPopupAutoCloseTimer = null;
    }
    if (dbPopupProgressInterval) {
        clearInterval(dbPopupProgressInterval);
        dbPopupProgressInterval = null;
    }

    hideDatabaseLoadingPopup();
    hideAllDetectedSyncPopups();

    if (!isUserOnLoginOrUnverifiedScreen() && typeof showToast === 'function') {
        showToast('🔽 ซ่อนหน้าต่างแล้ว ระบบกำลังโหลดข้อมูลต่อในเบื้องหลัง...');
    }
}

function installGlobalSyncPopupGuard() {
    if (globalSyncPopupObserverInstalled || typeof MutationObserver === 'undefined') return;
    const rootTarget = document.documentElement || document.body;
    if (!rootTarget) return;

    globalSyncPopupObserverInstalled = true;

    const observer = new MutationObserver((mutations) => {
        if (!shouldSuppressGlobalSyncPopup()) return;

        let needsSweep = false;
        for (const m of mutations) {
            if (m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1) {
                        if (isExternalDbSyncOverlayElement(node)) {
                            node.dataset.wmsSuppressedSyncOverlay = 'true';
                            node.style.setProperty('display', 'none', 'important');
                            node.style.setProperty('visibility', 'hidden', 'important');
                            node.style.setProperty('opacity', '0', 'important');
                            node.style.setProperty('pointer-events', 'none', 'important');
                        } else {
                            needsSweep = true;
                        }
                    }
                }
            } else if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
                const targetEl = m.target;
                if (targetEl.dataset.wmsSuppressedSyncOverlay === 'true' || isExternalDbSyncOverlayElement(targetEl)) {
                    const currentDisplay = targetEl.style.display;
                    if (currentDisplay !== 'none') {
                        targetEl.dataset.wmsSuppressedSyncOverlay = 'true';
                        targetEl.style.setProperty('display', 'none', 'important');
                        targetEl.style.setProperty('visibility', 'hidden', 'important');
                        targetEl.style.setProperty('opacity', '0', 'important');
                        targetEl.style.setProperty('pointer-events', 'none', 'important');
                    }
                }
            }
        }

        if (needsSweep) {
            hideAllDetectedSyncPopups();
        }
    });

    observer.observe(rootTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
    });
}

function resetInitialDbSyncPopupState() {
    initialPostLoginSyncPopupShown = false;
    userDismissedSyncPopup = false;
    if (dbPopupDelayTimer) {
        clearTimeout(dbPopupDelayTimer);
        dbPopupDelayTimer = null;
    }
    if (dbPopupAutoCloseTimer) {
        clearTimeout(dbPopupAutoCloseTimer);
        dbPopupAutoCloseTimer = null;
    }
    if (dbPopupProgressInterval) {
        clearInterval(dbPopupProgressInterval);
        dbPopupProgressInterval = null;
    }
    try {
        localStorage.removeItem(WMS_LOGIN_SESSION_ID_KEY);
        localStorage.removeItem(WMS_INITIAL_DB_POPUP_SHOWN_KEY);
        sessionStorage.removeItem(WMS_INITIAL_DB_POPUP_SHOWN_KEY);
    } catch (e) {}
    hideDatabaseLoadingPopup();
    hideAllDetectedSyncPopups();
}

function markNewLoginSyncSession() {
    const newSessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    initialPostLoginSyncPopupShown = false;
    userDismissedSyncPopup = false;
    try {
        localStorage.setItem(WMS_LOGIN_SESSION_ID_KEY, newSessionId);
        localStorage.removeItem(WMS_INITIAL_DB_POPUP_SHOWN_KEY);
        sessionStorage.removeItem(WMS_INITIAL_DB_POPUP_SHOWN_KEY);
    } catch (e) {}
    return newSessionId;
}

function hasShownDbSyncPopupForCurrentLogin() {
    if (initialPostLoginSyncPopupShown) return true;
    try {
        const currentLoginId = localStorage.getItem(WMS_LOGIN_SESSION_ID_KEY);
        if (!currentLoginId) return true;
        const shownForLoginId = localStorage.getItem(WMS_INITIAL_DB_POPUP_SHOWN_KEY);
        return shownForLoginId === currentLoginId;
    } catch (e) {
        return true;
    }
}

function markDbSyncPopupAsShown() {
    initialPostLoginSyncPopupShown = true;
    try {
        const currentLoginId = localStorage.getItem(WMS_LOGIN_SESSION_ID_KEY) || String(Date.now());
        localStorage.setItem(WMS_LOGIN_SESSION_ID_KEY, currentLoginId);
        localStorage.setItem(WMS_INITIAL_DB_POPUP_SHOWN_KEY, currentLoginId);
        sessionStorage.setItem(WMS_INITIAL_DB_POPUP_SHOWN_KEY, 'true');
    } catch (e) {}
}

function ensureDbLoadingStylesAndPopup() {
    if (!document.getElementById('wmsDbLoaderStyles') && document.head) {
        const style = document.createElement('style');
        style.id = 'wmsDbLoaderStyles';
        style.textContent = `
            html.wms-login-active #wmsDbFloatingPopup,
            html.wms-unverified-session #wmsDbFloatingPopup,
            body.wms-login-active #wmsDbFloatingPopup,
            body.wms-unverified-session #wmsDbFloatingPopup,
            html.wms-login-active [data-wms-suppressed-sync-overlay="true"],
            html.wms-unverified-session [data-wms-suppressed-sync-overlay="true"],
            body.wms-login-active [data-wms-suppressed-sync-overlay="true"],
            body.wms-unverified-session [data-wms-suppressed-sync-overlay="true"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
            #wmsDbFloatingPopup {
                position: fixed;
                inset: 0;
                z-index: 99998;
                background: rgba(15, 23, 42, 0.48);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                display: none;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                transition: opacity 0.2s ease;
            }
            .wms-db-popup-box {
                background: var(--card-bg, #ffffff);
                color: var(--text-main, #0f172a);
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 20px;
                padding: 1.85rem 1.75rem 1.55rem;
                width: 100%;
                max-width: 420px;
                text-align: center;
                box-shadow: 0 24px 50px rgba(15, 23, 42, 0.28);
                position: relative;
                overflow: hidden;
            }
            .wms-db-icon-ring {
                width: 66px;
                height: 66px;
                margin: 0 auto 0.95rem;
                border-radius: 50%;
                background: #eef2ff;
                color: #4f46e5;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.65rem;
                position: relative;
                box-shadow: 0 6px 18px rgba(79, 70, 229, 0.16);
            }
            .wms-db-icon-ring::after {
                content: "";
                position: absolute;
                inset: -4px;
                border-radius: 50%;
                border: 3px solid transparent;
                border-top-color: #4f46e5;
                border-right-color: #0ea5e9;
                animation: wmsDbSpin 0.85s linear infinite;
            }
            @keyframes wmsDbSpin {
                to { transform: rotate(360deg); }
            }
            .wms-db-status-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 12px;
                border-radius: 999px;
                font-size: 0.76rem;
                font-weight: 700;
                background: #f1f5f9;
                color: #334155;
                border: 1px solid #e2e8f0;
                margin-bottom: 0.7rem;
            }
            .wms-db-status-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
                animation: wmsPulseDot 1.2s infinite;
            }
            @keyframes wmsPulseDot {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.25); opacity: 0.65; }
            }
            .wms-db-progress-track {
                width: 100%;
                height: 7px;
                border-radius: 999px;
                background: #e2e8f0;
                overflow: hidden;
                margin: 0.9rem 0 0.45rem;
            }
            .wms-db-progress-fill {
                height: 100%;
                width: 35%;
                border-radius: 999px;
                background: linear-gradient(90deg, #4f46e5 0%, #0ea5e9 55%, #10b981 100%);
                transition: width 0.25s ease;
            }
            .wms-db-progress-meta {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 0.76rem;
                color: #64748b;
                margin-bottom: 1rem;
            }
            .wms-db-bg-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                padding: 8px 18px;
                border-radius: 999px;
                border: 1px solid #cbd5e1;
                background: var(--bg-subtle, #f8fafc);
                color: var(--text-main, #1e293b);
                font-size: 0.82rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .wms-db-bg-btn:hover {
                background: #e2e8f0;
                border-color: #94a3b8;
            }
            .wms-table-loading-card {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 3.25rem 1.5rem;
                gap: 0.65rem;
                color: var(--text-main, #0f172a);
            }
            .wms-table-loading-badge {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 6px 14px;
                border-radius: 999px;
                font-size: 0.82rem;
                font-weight: 700;
                background: var(--primary-light, #e0f2fe);
                color: var(--primary-text, #0369a1);
                border: 1px solid var(--primary-border, #bae6fd);
            }
        `;
        document.head.appendChild(style);
    }

    installGlobalSyncPopupGuard();

    if (!document.getElementById('wmsDbFloatingPopup') && document.body) {
        const popup = document.createElement('div');
        popup.id = 'wmsDbFloatingPopup';
        popup.innerHTML = `
            <div class="wms-db-popup-box">
                <div class="wms-db-icon-ring">
                    <i class="fa-solid fa-database"></i>
                </div>
                <div class="wms-db-status-pill">
                    <span class="wms-db-status-dot"></span>
                    <span id="wmsDbPopupPillText">กำลังซิงค์ฐานข้อมูลออนไลน์</span>
                </div>
                <div id="wmsDbPopupTitle" style="font-size:1.08rem; font-weight:800; margin-bottom:4px;">
                    กำลังโหลดข้อมูลสต็อกสินค้า...
                </div>
                <div id="wmsDbPopupSubtitle" style="font-size:0.83rem; color:var(--text-muted, #64748b);">
                    ตรวจสอบรายการสินค้า พิกัด และจำนวนสต็อกทั้งหมด
                </div>
                <div class="wms-db-progress-track">
                    <div id="wmsDbPopupProgressBar" class="wms-db-progress-fill" style="width: 30%;"></div>
                </div>
                <div class="wms-db-progress-meta mono">
                    <span id="wmsDbPopupTarget">กำลังประมวลผลข้อมูล...</span>
                    <span id="wmsDbPopupPercent" style="font-weight:700;">30%</span>
                </div>
                <button type="button" id="wmsDbHideToBackgroundBtn" onclick="dismissDbPopupToBackground()" class="wms-db-bg-btn">
                    <i class="fa-solid fa-eye-slash"></i> ซ่อนหน้าต่าง (โหลดต่อเบื้องหลัง)
                </button>
            </div>
        `;
        document.body.appendChild(popup);
    }
}

// ติดตั้ง Style และตัวดักจับทันทีที่โหลดสคริปต์ (ก่อน DOMContentLoaded)
ensureDbLoadingStylesAndPopup();

function updateDatabaseLoadingProgress(percent = 50, metaText = null) {
    const bar = document.getElementById('wmsDbPopupProgressBar');
    const pctEl = document.getElementById('wmsDbPopupPercent');
    const targetEl = document.getElementById('wmsDbPopupTarget');
    const clamped = Math.max(5, Math.min(100, Math.round(percent)));

    if (bar) bar.style.width = `${clamped}%`;
    if (pctEl) pctEl.textContent = `${clamped}%`;
    if (metaText && targetEl) targetEl.textContent = metaText;
}

function renderPopupBoxNow(title, subtitle, targetMeta, initialPercent = 28) {
    if (isUserOnLoginOrUnverifiedScreen() || userDismissedSyncPopup) {
        hideAllDetectedSyncPopups();
        return;
    }

    ensureDbLoadingStylesAndPopup();
    const popup = document.getElementById('wmsDbFloatingPopup');
    const titleEl = document.getElementById('wmsDbPopupTitle');
    const subEl = document.getElementById('wmsDbPopupSubtitle');
    const targetEl = document.getElementById('wmsDbPopupTarget');

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (targetEl) targetEl.textContent = targetMeta;
    updateDatabaseLoadingProgress(initialPercent, targetMeta);

    if (popup) {
        popup.style.display = 'flex';
    }

    if (dbPopupProgressInterval) clearInterval(dbPopupProgressInterval);
    let currentPct = initialPercent;
    dbPopupProgressInterval = setInterval(() => {
        if (currentPct < 88) {
            currentPct += Math.max(2, Math.round((90 - currentPct) * 0.18));
            updateDatabaseLoadingProgress(currentPct);
        }
    }, 220);
}

/**
 * แสดงป๊อปอัปโหลดฐานข้อมูล:
 * - ห้ามแสดงบนหน้าล็อกอินหรือแท็บที่ยังไม่ยืนยันเด็ดขาด
 * - แสดงทันทีเมื่ออยู่หน้าเช็คสต็อกสินค้า (view-inventory) หรือสั่งบังคับ (force: true)
 * - สำหรับหน้าเมนูอื่น ๆ จะหน่วงเวลา 480ms เพื่อแสดงเฉพาะตอนโหลดช้าจริง ๆ เท่านั้น
 */
function showDatabaseLoadingPopup(title = 'กำลังโหลดข้อมูลสต็อกสินค้า...', subtitle = 'กรุณารอสักครู่ ระบบกำลังดึงข้อมูลจาก Supabase', targetFile = 'supabase/warehouse_items/inv-db.js', options = {}) {
    ensureDbLoadingStylesAndPopup();

    const isManualForce = Boolean(options && options.force === true);
    const isSlowLoadTrigger = Boolean(options && options.slowLoad === true);
    const onInventoryPage = isInventoryPageCurrentlyActive() || String(targetFile).toLowerCase().includes('inv-db');

    // 1. บล็อก 100% บนหน้าล็อกอินหรือหน้าต่างยืนยันแท็บใหม่
    if (isUserOnLoginOrUnverifiedScreen()) {
        hideAllDetectedSyncPopups();
        return;
    }

    // 2. หากผู้ใช้กด "ซ่อนหน้าต่าง (โหลดต่อเบื้องหลัง)" ในรอบนี้แล้ว ให้ซิงค์ต่อในเบื้องหลังโดยไม่เด้งซ้ำ
    if (!isManualForce && userDismissedSyncPopup) {
        hideAllDetectedSyncPopups();
        return;
    }

    const totalItemsCount = Array.isArray(window.globalInventoryData) ? window.globalInventoryData.length : 0;
    const metaLabel = totalItemsCount > 0
        ? `สต็อก ${totalItemsCount.toLocaleString()} รายการ`
        : targetFile;

    // 3. แสดงสถานะโหลดในตารางหน้าเช็คสต็อกสินค้าทันทีหากตารางยังว่างเปล่า
    const invTbody = document.getElementById('inventoryTableBody');
    if (invTbody && onInventoryPage && totalItemsCount === 0) {
        invTbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center; background:var(--card-bg, #ffffff);">
                    <div class="wms-table-loading-card">
                        <div class="wms-db-icon-ring" style="width:56px; height:56px; font-size:1.4rem; margin-bottom:0.4rem;">
                            <i class="fa-solid fa-database"></i>
                        </div>
                        <div style="font-size:1.05rem; font-weight:800;">${typeof escapeHTML === 'function' ? escapeHTML(title) : title}</div>
                        <div style="font-size:0.85rem; color:var(--text-muted, #64748b);">${typeof escapeHTML === 'function' ? escapeHTML(subtitle) : subtitle}</div>
                        <div class="wms-table-loading-badge mono" style="margin-top:4px;">
                            <i class="fa-solid fa-rotate fa-spin"></i> กำลังซิงค์ข้อมูลเรียลไทม์...
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    if (dbPopupDelayTimer) {
        clearTimeout(dbPopupDelayTimer);
        dbPopupDelayTimer = null;
    }

    // 4. หากอยู่หน้าเช็คสต็อกสินค้า (view-inventory) หรือทดสอบระบบด้วยตนเอง -> แสดงป๊อปอัปทันที
    if (onInventoryPage || isManualForce || isSlowLoadTrigger) {
        renderPopupBoxNow(title, subtitle, metaLabel, 32);
    } else {
        // สำหรับหน้าเมนูอื่น ๆ ให้รอ 480ms ก่อน หากโหลดเสร็จไวจะไม่เด้งป๊อปอัป จะแสดงเฉพาะตอนโหลดช้าเท่านั้น
        dbPopupDelayTimer = setTimeout(() => {
            if (!isUserOnLoginOrUnverifiedScreen() && !userDismissedSyncPopup) {
                renderPopupBoxNow(title, subtitle, metaLabel, 40);
            }
        }, 480);
    }

    if (dbPopupAutoCloseTimer) clearTimeout(dbPopupAutoCloseTimer);
    if (!isManualForce) {
        dbPopupAutoCloseTimer = setTimeout(() => {
            hideDatabaseLoadingPopup();
        }, 3500);
    }
}

function hideDatabaseLoadingPopup() {
    if (dbPopupDelayTimer) {
        clearTimeout(dbPopupDelayTimer);
        dbPopupDelayTimer = null;
    }
    if (dbPopupAutoCloseTimer) {
        clearTimeout(dbPopupAutoCloseTimer);
        dbPopupAutoCloseTimer = null;
    }
    if (dbPopupProgressInterval) {
        clearInterval(dbPopupProgressInterval);
        dbPopupProgressInterval = null;
    }
    const popup = document.getElementById('wmsDbFloatingPopup');
    if (popup) {
        popup.style.display = 'none';
    }
}

// ⏱️ ตัวช่วยแสดงป๊อปอัปเฉพาะหน้าเช็คสต็อกสินค้าที่มีข้อมูลเยอะ หรือหน้าเมนูที่โหลดช้า
function startSmartSlowLoadPopup(viewId, options = {}) {
    if (isUserOnLoginOrUnverifiedScreen()) {
        hideAllDetectedSyncPopups();
        return;
    }

    userDismissedSyncPopup = false;
    const isInventory = viewId === 'view-inventory';
    const itemCount = Number(options.itemCount || (Array.isArray(window.globalInventoryData) ? window.globalInventoryData.length : 0));

    const title = isInventory
        ? 'กำลังโหลดและจัดเรียงสต็อกสินค้า...'
        : 'กำลังโหลดข้อมูลเมนูระบบ...';
    const subtitle = isInventory
        ? 'กำลังประมวลผลรายการสินค้า พิกัด และตัวกรองข้อมูลทั้งหมด'
        : 'กรุณารอสักครู่ ระบบกำลังซิงค์ข้อมูลล่าสุด';
    const meta = itemCount > 0
        ? `สต็อก ${itemCount.toLocaleString()} รายการ`
        : (isInventory ? 'supabase/warehouse_items/inv-db.js' : 'กำลังเชื่อมต่อฐานข้อมูล...');

    // หน้าเช็คสต็อกสินค้าที่มีรายการเยอะ (> 250 รายการ) แสดงไวขึ้น (150ms) ส่วนเมนูอื่นแสดงเมื่อโหลดช้าเกิน 520ms
    const delayMs = isInventory ? (itemCount > 250 ? 150 : 320) : 520;

    if (dbPopupDelayTimer) clearTimeout(dbPopupDelayTimer);
    dbPopupDelayTimer = setTimeout(() => {
        if (!isUserOnLoginOrUnverifiedScreen() && !userDismissedSyncPopup) {
            renderPopupBoxNow(title, subtitle, meta, 28);
        }
    }, delayMs);
}

function finishSmartSlowLoadPopup() {
    if (dbPopupDelayTimer) {
        clearTimeout(dbPopupDelayTimer);
        dbPopupDelayTimer = null;
    }
    const popup = document.getElementById('wmsDbFloatingPopup');
    if (popup && popup.style.display !== 'none') {
        updateDatabaseLoadingProgress(100);
        setTimeout(() => {
            hideDatabaseLoadingPopup();
        }, 180);
    } else {
        hideDatabaseLoadingPopup();
    }
}

// 🔇 โหลดและอุ่นการเชื่อมต่อฐานข้อมูลในเบื้องหลังแบบเงียบระหว่างอยู่หน้าล็อกอิน (ไม่แสดงป๊อปอัปบดบังหน้าจอ)
async function preloadDatabaseSilentlyInBackground() {
    if (isBackgroundPreloading || !navigator.onLine) return;
    isBackgroundPreloading = true;
    hideAllDetectedSyncPopups();

    try {
        if (typeof loadDataFromDatabase === 'function') {
            await loadDataFromDatabase();
            backgroundPreloadCompleted = true;
        } else {
            const { error } = await _supabase.from('warehouse_items').select('id').limit(1);
            if (!error) {
                backgroundPreloadCompleted = true;
            }
        }
    } catch (e) {
        // ข้ามข้อผิดพลาดในเบื้องหลังอย่างปลอดภัย เพื่อไม่ให้รบกวนหน้าล็อกอิน
    } finally {
        isBackgroundPreloading = false;
        if (isUserOnLoginOrUnverifiedScreen()) {
            hideAllDetectedSyncPopups();
        }
    }
}

// ⚡ เรียกใช้ทันทีหลังจากผู้ใช้ล็อกอินเข้าสำเร็จ เพื่อซิงค์ฐานข้อมูลในเบื้องหลังอย่างรวดเร็ว (และแสดงป๊อปอัปเฉพาะกรณีโหลดช้าเท่านั้น)
async function runFastPostLoginInitialSync() {
    markNewLoginSyncSession();

    if (isUserOnLoginOrUnverifiedScreen()) {
        hideAllDetectedSyncPopups();
        return;
    }

    // เริ่มจับเวลาโหลดช้า (หากโหลดเสร็จภายใน 520ms จะไม่เด้งป๊อปอัปกวนหน้าแดชบอร์ด)
    startSmartSlowLoadPopup('view-dashboard');

    try {
        if (navigator.onLine) {
            const syncTasks = [];
            if (typeof loadDataFromDatabase === 'function') {
                syncTasks.push(loadDataFromDatabase());
            }
            if (typeof loadDashboardData === 'function') {
                syncTasks.push(loadDashboardData());
            } else if (typeof renderWarehouseDashboard === 'function') {
                renderWarehouseDashboard();
            } else if (typeof renderDashboardView === 'function') {
                renderDashboardView();
            }

            if (syncTasks.length > 0) {
                await Promise.race([
                    Promise.allSettled(syncTasks),
                    new Promise(resolve => setTimeout(resolve, 2500))
                ]);
            }
        }
    } catch (err) {
        console.warn('⚠️ Background post-login sync notice:', err);
    } finally {
        markDbSyncPopupAsShown();
        finishSmartSlowLoadPopup();
    }
}

function persistQueue() {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineInboundQueue));
        localStorage.setItem(ACT_QUEUE_KEY, JSON.stringify(offlineActivityQueue));
        return true;
    } catch (e) { return false; }
}

function clearOfflineInboundQueue() {
    if (offlineInboundQueue.length === 0) {
        showToast("ℹ️ ไม่พบรายการค้างบันทึกในคิว");
        return;
    }

    if (confirm(`คุณต้องการลบ/ยกเลิกรายการรอบันทึกทั้งหมดจำนวน ${offlineInboundQueue.length} รายการออกใช่หรือไม่?`)) {
        const pendingSns = new Set(offlineInboundQueue.map(i => String(i.sn).toLowerCase()));
        
        offlineInboundQueue = [];
        persistQueue();

        globalInventoryData = globalInventoryData.filter(i => !i._pending && !pendingSns.has(String(i.sn).toLowerCase()));
        recentInboundList = recentInboundList.filter(i => !i.isOffline);

        rebuildOccupiedSet();
        filterInventoryData();
        updateKPIs();
        renderLiveInboundFeed();
        updateOnlineOfflineUI(navigator.onLine);

        playSuccessSound();
        showToast("🗑️ ลบรายการรอบันทึกค้างทั้งหมดเรียบร้อยแล้ว");
    }
}

function removePendingItemBySn(sn) {
    const targetSn = String(sn).trim().toLowerCase();
    
    offlineInboundQueue = offlineInboundQueue.filter(i => String(i.sn).trim().toLowerCase() !== targetSn);
    persistQueue();

    globalInventoryData = globalInventoryData.filter(i => String(i.sn).trim().toLowerCase() !== targetSn || !i._pending);
    recentInboundList = recentInboundList.filter(i => String(i.sn).trim().toLowerCase() !== targetSn || !i.isOffline);

    rebuildOccupiedSet();
    filterInventoryData();
    updateKPIs();
    renderLiveInboundFeed();
    updateOnlineOfflineUI(navigator.onLine);

    playSuccessSound();
    showToast(`🗑️ ยกเลิก S/N: ${sn} จากคิวรอบันทึกเรียบร้อยแล้ว`);
}

function isPendingSn(sn) {
    const k = String(sn || '').toLowerCase();
    return offlineInboundQueue.some(p => String(p.sn).toLowerCase() === k);
}

function guardPendingSn(sn) {
    if (isPendingSn(sn)) { 
        playErrorSound(); 
        showToast(`⏳ S/N ${escapeHTML(sn)} ยังรอบันทึกเข้า DB กรุณารอซิงค์เสร็จก่อน`, true); 
        return true; 
    }
    return false;
}

function requireOnline(msg) {
    if (!navigator.onLine) { 
        playErrorSound(); 
        showToast(`📴 ${msg || 'ทำรายการนี้ต้องเชื่อมต่ออินเทอร์เน็ต'}`, true); 
        return false; 
    }
    return true;
}

function sanitizeForDb(item) {
    return {
        category: String(item.category || 'N/A').trim(),
        name: String(item.name || '-').trim(),
        sn: String(item.sn).trim(),
        meter: parseInt(item.meter) || 0,
        location: String(item.location || 'DOCK').trim(),
        qty: parseInt(item.qty) || 1,
        created_at: item.created_at || new Date().toISOString()
    };
}

function initOfflineSyncEngine() {
    ensureDbLoadingStylesAndPopup();
    updateOnlineOfflineUI(navigator.onLine);

    if (isUserOnLoginOrUnverifiedScreen()) {
        hideAllDetectedSyncPopups();
        if (navigator.onLine) {
            setTimeout(() => {
                if (isUserOnLoginOrUnverifiedScreen()) {
                    preloadDatabaseSilentlyInBackground();
                }
            }, 120);
        }
    }

    window.addEventListener('online', () => {
        updateOnlineOfflineUI(true);
        if (!isUserOnLoginOrUnverifiedScreen()) {
            showToast('🌐 อินเทอร์เน็ตกลับมาแล้ว กำลังบันทึกข้อมูลเข้า DB...');
        }
        syncOfflineQueueToDatabase();
    });
    window.addEventListener('offline', () => {
        updateOnlineOfflineUI(false);
        if (!isUserOnLoginOrUnverifiedScreen()) {
            showToast('📴 ออฟไลน์: ข้อมูลจะถูกเก็บไว้ในเครื่องและซิงค์เมื่อเชื่อมเน็ต', true);
        }
    });
    window.addEventListener('beforeunload', (e) => {
        if (offlineInboundQueue.length) { e.preventDefault(); e.returnValue = ''; }
    });
    
    setInterval(() => {
        if (offlineInboundQueue.length || offlineActivityQueue.length) syncOfflineQueueToDatabase();
    }, 8000);
}

function updateOnlineOfflineUI(isOnline) {
    isOfflineMode = !isOnline;
    const n = offlineInboundQueue.length;
    const banner = document.getElementById('offlineNoticeBanner');
    const badge = document.getElementById('offlineQueueBadge');
    const msg = document.getElementById('offlineBannerMsg');
    const dbStatusText = document.getElementById('dbStatusText');
    const hdr = document.getElementById('liveInboundHeaderBadge');

    if (badge) badge.textContent = n.toLocaleString();
    if (banner) {
        banner.style.display = (!isOnline || n > 0) ? 'flex' : 'none';
        banner.className = 'offline-banner ' + (!isOnline ? 'is-offline' : 'is-syncing');
        if (msg) {
            msg.textContent = !isOnline
                ? `โหมดออฟไลน์ — ยังรับสินค้าต่อได้ปกติ (รอบันทึกเข้า DB ${n} รายการ)`
                : isSyncing ? `กำลังบันทึก ${n} รายการเข้าฐานข้อมูล...`
                : `มี ${n} รายการรอบันทึกเข้า DB${lastSyncError ? ' — เชื่อมต่อไม่สำเร็จ จะลองใหม่อัตโนมัติ' : ''}`;
        }
    }
    if (hdr) {
        if (!isOnline) { hdr.className = 'status-badge warning'; hdr.innerHTML = `<i class="fa-solid fa-wifi"></i> ออฟไลน์ · รอซิงค์ ${n}`; }
        else if (n > 0) { hdr.className = 'status-badge warning'; hdr.innerHTML = `<i class="fa-solid fa-rotate ${isSyncing ? 'fa-spin' : ''}"></i> รอบันทึก ${n}`; }
        else { hdr.className = 'status-badge'; hdr.innerHTML = `<span class="pulse-dot"></span> บันทึก DB ครบแล้ว`; }
    }
    if (dbStatusText && (!isOnline || n > 0)) {
        dbStatusText.textContent = !isOnline ? `🟠 ออฟไลน์ (รอซิงค์ ${n})` : `🟡 รอบันทึก ${n} รายการ`;
        dbStatusText.style.color = 'var(--warning, #f59e0b)';
    }
}

async function syncOfflineQueueToDatabase() {
    if (isSyncing || !navigator.onLine) return;
    if (!offlineInboundQueue.length && !offlineActivityQueue.length) return;

    isSyncing = true; lastSyncError = '';
    updateOnlineOfflineUI(true);

    const doneInboundSns = new Set();
    let saved = 0, dup = 0;
    const batch = [...offlineInboundQueue];

    try {
        for (const rawItem of batch) {
            const snKey = String(rawItem.sn).trim().toLowerCase();

            const { data: existing } = await _supabase
                .from('warehouse_items')
                .select('sn')
                .eq('sn', rawItem.sn)
                .maybeSingle();

            if (existing) {
                dup++;
                doneInboundSns.add(snKey);
                continue;
            }

            const cleanPayload = sanitizeForDb(rawItem);
            const { error } = await _supabase.from('warehouse_items').insert([cleanPayload]);

            if (!error) {
                saved++;
                doneInboundSns.add(snKey);
            } else if (error.code === '23505') {
                dup++;
                doneInboundSns.add(snKey);
            } else {
                console.error(`Failed to sync SN ${rawItem.sn}:`, error);
                lastSyncError = error.message;
            }
        }

        if (offlineActivityQueue.length) {
            const acts = [...offlineActivityQueue];
            const { error } = await _supabase.from('user_activities').insert(acts);
            if (!error) offlineActivityQueue = offlineActivityQueue.filter(a => !acts.includes(a));
        }
    } catch (e) {
        lastSyncError = (e && e.message) || 'sync error';
    }

    offlineInboundQueue = offlineInboundQueue.filter(p => !doneInboundSns.has(String(p.sn).trim().toLowerCase()));
    persistQueue();

    globalInventoryData.forEach(item => {
        if (doneInboundSns.has(String(item.sn).trim().toLowerCase())) {
            delete item._pending;
        }
    });

    isSyncing = false;
    renderLiveInboundFeed();
    updateOnlineOfflineUI(navigator.onLine);

    if (saved + dup > 0) {
        syncFailNotified = false;
        if (!isUserOnLoginOrUnverifiedScreen()) {
            playSuccessSound();
            showToast(`✅ บันทึกเข้าฐานข้อมูลสำเร็จ ${saved} รายการ${dup ? ` (ข้าม S/N ที่มีใน DB แล้ว ${dup})` : ''}`);
        }
        logUserActivity('OFFLINE_SYNC', `ซิงค์รายการรับเข้า ${saved} รายการเข้า DB`);
        if (offlineInboundQueue.length === 0) {
            updateDBConnectionStatus(true, '(ซิงค์ครบ 100%)');
            await loadDataFromDatabase();
        }
    }
}

function updateDBConnectionStatus(isConnected, message = "") {
    const statusElem = document.getElementById('dbStatusText');
    const badgeElem = document.getElementById('dbStatusBadge');
    const nowStr = new Date().toLocaleTimeString('th-TH');

    if (!navigator.onLine) {
        if (statusElem) {
            statusElem.textContent = `📴 ออฟไลน์ (Offline Mode)`;
            statusElem.style.color = 'var(--warning, #f59e0b)';
        }
        if (badgeElem) badgeElem.className = 'status-badge warning';
        return;
    }

    const statusMessage = isConnected 
        ? `🟢 Supabase Connected - ${nowStr} ${message}`
        : `🔴 DB Disconnected - ${nowStr} ${message}`;

    if (statusElem) {
        statusElem.textContent = statusMessage;
        statusElem.style.color = isConnected ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)';
    }

    if (badgeElem) {
        badgeElem.className = isConnected ? 'status-badge' : 'status-badge warning';
    }
}

async function testDatabaseConnectionRealtime() {
    const btn = document.getElementById('testDbConnBtn');
    if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังทดสอบ...`;

    userDismissedSyncPopup = false;
    showDatabaseLoadingPopup('กำลังทดสอบเชื่อมต่อฐานข้อมูล...', 'กำลังตรวจสอบความเร็วในการตอบสนอง (Latency)', 'supabase/system_configs/db-config.js', { force: true });
    const startTime = performance.now();
    try {
        const { data, error } = await _supabase.from('warehouse_items').select('id').limit(1);
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);

        if (!error) {
            updateDatabaseLoadingProgress(100);
            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') showToast(`⚡ เชื่อมต่อ Supabase สำเร็จ! (Latency: ${latency} ms)`);
            updateDBConnectionStatus(true, `(Ping: ${latency}ms)`);
            if (btn) btn.innerHTML = `<i class="fa-solid fa-plug-circle-check"></i> ทดสอบการเชื่อมต่อ Realtime 100%`;
            return true;
        } else {
            throw error;
        }
    } catch (err) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`❌ การเชื่อมต่อขัดข้อง: ${err.message}`, true);
        updateDBConnectionStatus(false, `(${err.message})`);
        if (btn) btn.innerHTML = `<i class="fa-solid fa-plug-circle-xmark"></i> ทดสอบเชื่อมต่ออีกครั้ง`;
        return false;
    } finally {
        hideDatabaseLoadingPopup();
    }
}

window.showDatabaseLoadingPopup = showDatabaseLoadingPopup;
window.hideDatabaseLoadingPopup = hideDatabaseLoadingPopup;
window.dismissDbPopupToBackground = dismissDbPopupToBackground;
window.updateDatabaseLoadingProgress = updateDatabaseLoadingProgress;
window.startSmartSlowLoadPopup = startSmartSlowLoadPopup;
window.finishSmartSlowLoadPopup = finishSmartSlowLoadPopup;
window.hideAllDetectedSyncPopups = hideAllDetectedSyncPopups;
window.preloadDatabaseSilentlyInBackground = preloadDatabaseSilentlyInBackground;
window.runFastPostLoginInitialSync = runFastPostLoginInitialSync;
window.resetInitialDbSyncPopupState = resetInitialDbSyncPopupState;
window.isUserOnLoginOrUnverifiedScreen = isUserOnLoginOrUnverifiedScreen;
window.shouldSuppressGlobalSyncPopup = shouldSuppressGlobalSyncPopup;