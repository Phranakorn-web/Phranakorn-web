// =========================================================================
// --- MODULE 3.1: INBOUND CORE STATE, MODERN ENTERPRISE UI & DOC REFS ---
// --- 100% Clean State (Zero Auto-Delete), Tax Invoice & PO, 0ms Audio ---
// --- Cross-OS Safe (Windows, macOS, iOS, Android, Handheld Scanners) ---
// =========================================================================

// ใช้ var + window binding เพื่อป้องกัน SyntaxError ข้ามไฟล์ไม่ว่าสคริปต์จะโหลดลำดับใด
var PERSISTENT_DB_QUEUE_KEY = (typeof window !== 'undefined' && window.PERSISTENT_DB_QUEUE_KEY)
    ? window.PERSISTENT_DB_QUEUE_KEY
    : 'WMS_INBOUND_PERSISTENT_DB_QUEUE_V2';
var INBOUND_DOC_HISTORY_KEY = 'WMS_INBOUND_DOC_REF_HISTORY_V2';
var INBOUND_DOC_ACTIVE_KEY = 'WMS_INBOUND_ACTIVE_DOC_REF_V2';

// Global Shared State Across All Inbound Modules (Single Source of Truth)
var recentInboundList = (typeof window !== 'undefined' && Array.isArray(window.recentInboundList))
    ? window.recentInboundList
    : [];
var persistentDbSyncQueue = (typeof window !== 'undefined' && Array.isArray(window.persistentDbSyncQueue))
    ? window.persistentDbSyncQueue
    : [];
var pendingFastSnSet = (typeof window !== 'undefined' && window.pendingFastSnSet instanceof Set)
    ? window.pendingFastSnSet
    : new Set();
var pendingFastLocationSet = (typeof window !== 'undefined' && window.pendingFastLocationSet instanceof Set)
    ? window.pendingFastLocationSet
    : new Set();

var currentInboundTaxInvoice = (typeof window !== 'undefined' && typeof window.currentInboundTaxInvoice === 'string')
    ? window.currentInboundTaxInvoice
    : '';
var currentInboundPoNumber = (typeof window !== 'undefined' && typeof window.currentInboundPoNumber === 'string')
    ? window.currentInboundPoNumber
    : '';
var isInboundDocRefLocked = (typeof window !== 'undefined' && typeof window.isInboundDocRefLocked === 'boolean')
    ? window.isInboundDocRefLocked
    : true;
var activeDocTargetScanField = null; // null = S/N | 'tax_invoice' | 'po_number'

var recentFeedSearchQuery = '';
var sessionScannedSuccessCount = 0;
var sessionDbConfirmedCount = 0;
var dbSyncSequenceCounter = 0;

var scanSpeedCounter = 0;
var scanSpeedTimer = null;
var isFlushingDbQueue = false;
var persistentQueueSaveTimer = null;
var recentFeedSaveTimer = null;
var networkMonitorTimer = null;
var isFeedRenderScheduled = false;

var isBatchGenerating = false;
var batchSnMonotonicSeed = 0;

var isCameraScannerActive = false;
var isTorchOn = false;
var isContinuousCameraScanMode = true;
var currentCameraFacingMode = 'environment';
var cameraSessionScanCount = 0;
var lastCameraScannedCode = '';
var lastCameraScannedTime = 0;
var activeCameraStream = null;
var html5QrCodeScanner = null;
var cameraScanInterval = null;

var userHasSelectedAisle = false;
var cachedOccupiedSet = null;
var sharedWmsAudioCtx = null;

if (typeof window !== 'undefined') {
    window.PERSISTENT_DB_QUEUE_KEY = PERSISTENT_DB_QUEUE_KEY;
    window.recentInboundList = recentInboundList;
    window.persistentDbSyncQueue = persistentDbSyncQueue;
    window.pendingFastSnSet = pendingFastSnSet;
    window.pendingFastLocationSet = pendingFastLocationSet;
    window.currentInboundTaxInvoice = currentInboundTaxInvoice;
    window.currentInboundPoNumber = currentInboundPoNumber;
    window.isInboundDocRefLocked = isInboundDocRefLocked;
}

// =========================================================================
// 1. CORE UTILITIES (ESCAPE, TOAST, CLIPBOARD, USER RESOLVER, OS DETECTION)
// =========================================================================

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function isTouchMobileDevice() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isMobileUa || isIpadOs;
}

function showToast(message, isError = false, duration = 2400) {
    const toastEl = document.getElementById('toastAlert');
    const msgEl = document.getElementById('toastMessage');
    if (toastEl && msgEl) {
        msgEl.textContent = String(message || '');
        toastEl.classList.remove('error', 'show');
        if (isError) toastEl.classList.add('error');
        const iconEl = toastEl.querySelector('i');
        if (iconEl) {
            iconEl.className = isError
                ? 'fa-solid fa-circle-exclamation'
                : 'fa-solid fa-circle-check';
        }
        void toastEl.offsetWidth;
        toastEl.classList.add('show');
        clearTimeout(toastEl._hideTimer);
        toastEl._hideTimer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, duration);
    }
}

function copyToClipboard(text) {
    const str = String(text || '');
    if (!str) return;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(str).catch(() => {
            fallbackCopyTextToClipboard(str);
        });
    } else {
        fallbackCopyTextToClipboard(str);
    }
}

function fallbackCopyTextToClipboard(str) {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
}

function getCurrentUserFullName() {
    try {
        const badgeText = document.getElementById('currentUserNameText')?.textContent?.trim();
        if (badgeText) return badgeText;
        const storedUser = localStorage.getItem('WMS_CURRENT_USER') || localStorage.getItem('wms_user');
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            return parsed.full_name || parsed.fullName || parsed.username || 'admin';
        }
    } catch (e) {}
    return 'admin';
}

// =========================================================================
// 2. ZERO-LATENCY WEB AUDIO FEEDBACK ENGINE
// =========================================================================

function getSharedWmsAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedWmsAudioCtx) {
        try {
            sharedWmsAudioCtx = new AudioCtx();
        } catch (e) {
            return null;
        }
    }
    if (sharedWmsAudioCtx && sharedWmsAudioCtx.state === 'suspended') {
        sharedWmsAudioCtx.resume().catch(() => {});
    }
    return sharedWmsAudioCtx;
}

function playAudioFeedback(type = 'success') {
    const ctx = getSharedWmsAudioContext();
    if (!ctx) return;

    try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1046.5, now);
            osc.frequency.setValueAtTime(1318.5, now + 0.055);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc.start(now);
            osc.stop(now + 0.14);
        } else if (type === 'duplicate' || type === 'occupied') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.setValueAtTime(240, now + 0.09);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.start(now);
            osc.stop(now + 0.22);
        } else {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(280, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch (e) {}
}

function ensureSnInputFocus(selectAll = false) {
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;
    const activeView = document.getElementById('view-inbound');
    if (activeView && !activeView.classList.contains('active')) return;
    if (isCameraScannerActive) return;

    // ป้องกันคีย์บอร์ดมือถือเด้งบังหน้าจอโดยไม่ตั้งใจหากผู้ใช้กำลังเลือก Dropdown อยู่
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (isTouchMobileDevice() && activeTag === 'SELECT') return;

    try {
        snInput.focus({ preventScroll: true });
        if (selectAll && snInput.value) {
            snInput.select();
        }
    } catch (e) {}
}

// =========================================================================
// 3. EXPLICIT USER ITEM REMOVAL HELPER (NO AUTO-PURGE / NO TOMBSTONE)
// =========================================================================

function removeInboundItemFromLocalStateOnly(snStr, itemIdStr = '') {
    const targetSnUpper = String(snStr || '').trim().toUpperCase();
    const targetId = String(itemIdStr || '').trim();

    let removedLocation = '';

    recentInboundList = (Array.isArray(recentInboundList) ? recentInboundList : []).filter(item => {
        if (!item) return false;
        const itemSnUpper = String(item.sn || '').trim().toUpperCase();
        const itemId = item.id !== undefined && item.id !== null ? String(item.id).trim() : '';
        const isMatch = (targetId && itemId && itemId === targetId) ||
                        (targetSnUpper && itemSnUpper && itemSnUpper === targetSnUpper);
        if (isMatch) {
            if (item.location) removedLocation = item.location;
            return false;
        }
        return true;
    });

    if (typeof window !== 'undefined') {
        window.recentInboundList = recentInboundList;
        if (Array.isArray(window.globalInventoryData)) {
            window.globalInventoryData = window.globalInventoryData.filter(item => {
                if (!item) return false;
                const itemSnUpper = String(item.sn || '').trim().toUpperCase();
                return !(targetSnUpper && itemSnUpper === targetSnUpper);
            });
        }
    }

    if (targetSnUpper) {
        pendingFastSnSet.delete(targetSnUpper);
    }
    if (removedLocation && typeof removeOccupiedLocFromSet === 'function') {
        removeOccupiedLocFromSet(pendingFastLocationSet, removedLocation);
        if (typeof occupiedLocationsSet !== 'undefined') {
            removeOccupiedLocFromSet(occupiedLocationsSet, removedLocation);
        }
        cachedOccupiedSet = null;
    }

    if (Array.isArray(persistentDbSyncQueue) && targetSnUpper) {
        for (let i = persistentDbSyncQueue.length - 1; i >= 0; i--) {
            if (String(persistentDbSyncQueue[i]?.payload?.sn || '').trim().toUpperCase() === targetSnUpper) {
                persistentDbSyncQueue.splice(i, 1);
            }
        }
        if (typeof savePersistentDbQueueImmediate === 'function') {
            savePersistentDbQueueImmediate();
        } else if (typeof savePersistentDbQueue === 'function') {
            savePersistentDbQueue();
        }
    }

    if (typeof saveRecentInboundFeedToCache === 'function') {
        saveRecentInboundFeedToCache();
    }
    if (typeof renderLiveInboundFeed === 'function') {
        renderLiveInboundFeed();
    }
    if (typeof updateInboundNetworkSyncHUD === 'function') {
        updateInboundNetworkSyncHUD();
    }
    if (typeof updateLocationCapacityHUD === 'function') {
        updateLocationCapacityHUD();
    }
}

// =========================================================================
// 4. MODERN ENTERPRISE INBOUND UI STYLES & TAX INVOICE / PO CARD
// =========================================================================

function injectModernScanUIStyles() {
    if (document.getElementById('wmsInboundModernEnterpriseStyles')) return;
    const style = document.createElement('style');
    style.id = 'wmsInboundModernEnterpriseStyles';
    style.textContent = `
        /* Modern Inbound Section Polish */
        #view-inbound .fullscreen-split-layout {
            grid-template-columns: minmax(0, 1.18fr) minmax(360px, 0.92fr);
            gap: 1.25rem;
            align-items: start;
        }
        @media (max-width: 1120px) {
            #view-inbound .fullscreen-split-layout {
                grid-template-columns: 1fr;
            }
        }

        /* Enhanced Master Products Hero Bar */
        #view-inbound .db-stat-box {
            background: linear-gradient(135deg, var(--primary-light) 0%, rgba(99, 102, 241, 0.08) 100%) !important;
            border: 1px solid var(--primary-border) !important;
            border-radius: var(--radius-lg) !important;
            padding: 1rem 1.35rem !important;
            box-shadow: var(--shadow-sm);
        }

        /* Tax Invoice & PO Reference Card */
        .wms-doc-ref-card {
            background: linear-gradient(135deg, var(--bg-subtle) 0%, var(--primary-light) 100%);
            border: 1.5px solid var(--primary-border);
            border-radius: var(--radius-md);
            padding: 0.95rem 1rem;
            margin-bottom: 1rem;
            position: relative;
            box-shadow: var(--shadow-xs);
        }
        .wms-doc-ref-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 0.65rem;
        }
        .wms-doc-ref-title {
            font-size: 0.85rem;
            font-weight: 800;
            color: var(--primary-text);
            display: flex;
            align-items: center;
            gap: 7px;
        }
        .wms-doc-tools-group {
            display: flex;
            align-items: center;
            gap: 5px;
            flex-wrap: wrap;
        }
        .wms-doc-tool-btn {
            background: var(--bg-surface);
            border: 1px solid var(--border-strong);
            color: var(--text-sub);
            border-radius: 8px;
            padding: 4px 9px;
            font-size: 0.74rem;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            transition: all 0.15s ease;
        }
        .wms-doc-tool-btn:hover {
            border-color: var(--primary);
            color: var(--primary-text);
        }
        .wms-doc-tool-btn.pinned {
            background: var(--primary);
            border-color: var(--primary);
            color: #ffffff;
        }
        .wms-doc-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
        }
        @media (max-width: 640px) {
            .wms-doc-grid {
                grid-template-columns: 1fr;
            }
        }
        .wms-doc-input-wrap {
            position: relative;
            display: flex;
            align-items: center;
        }
        .wms-doc-input-wrap input {
            padding-right: 36px !important;
            font-weight: 700 !important;
            background: var(--bg-surface) !important;
        }
        .wms-doc-scan-mini-btn {
            position: absolute;
            right: 6px;
            width: 28px;
            height: 28px;
            border-radius: 7px;
            border: 1px solid var(--border-strong);
            background: var(--bg-subtle);
            color: var(--primary-text);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 0.78rem;
        }
        .wms-doc-scan-mini-btn:hover {
            background: var(--primary);
            color: #ffffff;
        }
        .wms-doc-summary-strip {
            margin-top: 0.6rem;
            padding-top: 0.5rem;
            border-top: 1px dashed var(--primary-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
            font-size: 0.75rem;
            color: var(--text-sub);
        }

        /* Scan Flash & Live HUD */
        .scan-flash-success {
            box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.35) !important;
            border-color: #10b981 !important;
        }
        .scan-flash-error {
            box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.35) !important;
            border-color: #ef4444 !important;
        }
        .wms-instant-scan-hud {
            margin-top: 8px;
            padding: 8px 12px;
            border-radius: 10px;
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            font-size: 0.78rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
        }

        /* Batch Generator Bar */
        .wms-batch-sn-bar {
            background: var(--bg-subtle);
            border: 1px solid var(--border-strong);
            border-radius: var(--radius-md);
            padding: 0.85rem 1rem;
            margin-bottom: 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 9px;
        }
        .wms-batch-sn-bar-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
        }
        .wms-batch-icon-pill {
            width: 32px;
            height: 32px;
            border-radius: 9px;
            background: linear-gradient(135deg, var(--primary) 0%, #6366f1 100%);
            color: #ffffff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.88rem;
            flex-shrink: 0;
        }
        .wms-batch-sn-btn-row {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 7px;
        }
        @media (max-width: 600px) {
            .wms-batch-sn-btn-row {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }
        .btn-batch-sn-preset {
            background: var(--bg-surface);
            border: 1px solid var(--border-strong);
            color: var(--text-main);
            border-radius: 9px;
            padding: 7px 10px;
            font-size: 0.78rem;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all 0.15s ease;
        }
        .btn-batch-sn-preset:hover:not(:disabled) {
            border-color: var(--primary);
            color: var(--primary-text);
            background: var(--primary-light);
        }
        .btn-batch-sn-preset.highlight {
            background: var(--primary-light);
            border-color: var(--primary-border);
            color: var(--primary-text);
        }
        .btn-batch-sn-preset.custom {
            background: var(--purple-light);
            border-color: var(--purple-border);
            color: var(--purple-text);
        }

        /* Network Sync HUD */
        .wms-network-sync-hud {
            padding: 9px 12px;
            border-radius: 10px;
            background: var(--success-light);
            border: 1px solid var(--success-border);
            margin-bottom: 10px;
        }
        .wms-network-sync-hud.syncing {
            background: var(--primary-light);
            border-color: var(--primary-border);
        }
        .wms-network-sync-hud.offline {
            background: var(--warning-light);
            border-color: var(--warning-border);
        }
        .pulse-live-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--success);
            box-shadow: 0 0 8px var(--success);
        }
        .net-dot.offline {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--warning);
        }

        /* Feed Cards */
        .modern-feed-card {
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            border-left: 4px solid var(--success);
            border-radius: 12px;
            padding: 11px 13px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-shadow: var(--shadow-xs);
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .modern-feed-card.is-syncing {
            border-left-color: var(--primary);
        }
        .modern-feed-card.is-sync-error {
            border-left-color: var(--danger);
        }
        .modern-feed-card:hover {
            transform: translateY(-1px);
            box-shadow: var(--shadow-sm);
        }
        .full-sn-text {
            font-family: 'JetBrains Mono', monospace;
            font-weight: 800;
            color: var(--primary-text);
            word-break: break-all;
        }
        .feed-card-actions {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .btn-card-action, .wms-mini-tool-btn {
            background: var(--bg-surface);
            border: 1px solid var(--border-strong);
            color: var(--text-sub);
            border-radius: 7px;
            padding: 4px 9px;
            font-size: 0.73rem;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            transition: all 0.15s ease;
        }
        .btn-card-action:hover, .wms-mini-tool-btn:hover {
            border-color: var(--primary);
            color: var(--primary-text);
            background: var(--primary-light);
        }
        .btn-card-action.btn-card-delete:hover {
            border-color: var(--danger);
            color: var(--danger);
            background: var(--danger-light);
        }
    `;
    document.head.appendChild(style);
}

// =========================================================================
// 5. TAX INVOICE & PO REFERENCE CARD & STATE MANAGEMENT
// =========================================================================

function loadSavedInboundDocRefState() {
    try {
        const raw = localStorage.getItem(INBOUND_DOC_ACTIVE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            currentInboundTaxInvoice = String(parsed.taxInvoice || '').trim();
            currentInboundPoNumber = String(parsed.poNumber || '').trim();
            if (typeof parsed.locked === 'boolean') {
                isInboundDocRefLocked = parsed.locked;
            }
            if (typeof window !== 'undefined') {
                window.currentInboundTaxInvoice = currentInboundTaxInvoice;
                window.currentInboundPoNumber = currentInboundPoNumber;
                window.isInboundDocRefLocked = isInboundDocRefLocked;
            }
        }
    } catch (e) {}
}

function saveActiveInboundDocRefState() {
    try {
        if (typeof window !== 'undefined') {
            window.currentInboundTaxInvoice = currentInboundTaxInvoice;
            window.currentInboundPoNumber = currentInboundPoNumber;
            window.isInboundDocRefLocked = isInboundDocRefLocked;
        }
        localStorage.setItem(INBOUND_DOC_ACTIVE_KEY, JSON.stringify({
            taxInvoice: currentInboundTaxInvoice,
            poNumber: currentInboundPoNumber,
            locked: isInboundDocRefLocked
        }));
    } catch (e) {}
}

function upgradeInboundEnterpriseUXUI() {
    injectModernScanUIStyles();
    loadSavedInboundDocRefState();

    const inboundForm = document.getElementById('inboundForm');
    if (!inboundForm) return;

    if (!document.getElementById('wmsInboundDocRefCard')) {
        const docCard = document.createElement('div');
        docCard.id = 'wmsInboundDocRefCard';
        docCard.className = 'wms-doc-ref-card';
        docCard.innerHTML = `
            <div class="wms-doc-ref-header">
                <div class="wms-doc-ref-title">
                    <i class="fa-solid fa-file-invoice-dollar"></i>
                    <span>ข้อมูลเอกสารรับเข้า (เลขที่ใบกำกับภาษี & ใบสั่งซื้อ PO)</span>
                </div>
                <div class="wms-doc-tools-group" style="position:relative;">
                    <button type="button" id="btnPinInboundDocRef" class="wms-doc-tool-btn ${isInboundDocRefLocked ? 'pinned' : ''}" onclick="toggleInboundDocRefLock()" title="ปักหมุดเลขใบกำกับภาษีและ PO ค้างไว้เวลายิง S/N ต่อเนื่องหลายชิ้น">
                        <i class="fa-solid fa-thumbtack"></i> ${isInboundDocRefLocked ? 'ปักหมุดเอกสาร: เปิด' : 'ปักหมุดเอกสาร: ปิด'}
                    </button>
                    <button type="button" class="wms-doc-tool-btn history" onclick="toggleInboundDocHistoryPopover()" title="เลือกจากประวัติเลขที่ใบกำกับภาษีและ PO ล่าสุด">
                        <i class="fa-solid fa-clock-rotate-left"></i> ประวัติเอกสาร
                    </button>
                    <button type="button" class="wms-doc-tool-btn" onclick="clearInboundDocRefs()" title="ล้างเลขที่ใบกำกับภาษีและ PO">
                        <i class="fa-solid fa-eraser"></i> ล้าง
                    </button>
                    <div id="inboundDocHistoryPopover" style="display:none; position:absolute; right:0; top:calc(100% + 6px); width:320px; max-width:88vw; background:var(--bg-surface); border:1px solid var(--border-strong); border-radius:12px; box-shadow:var(--shadow-lg); z-index:1600; padding:10px;"></div>
                </div>
            </div>

            <div class="wms-doc-grid">
                <div>
                    <label for="inboundTaxInvoice" style="font-size:0.78rem; font-weight:700; color:var(--text-sub); display:block; margin-bottom:4px;">
                        <i class="fa-solid fa-receipt" style="color:var(--primary);"></i> เลขที่ใบกำกับภาษี (Tax Invoice No.)
                    </label>
                    <div class="wms-doc-input-wrap">
                        <input type="text"
                               id="inboundTaxInvoice"
                               class="form-control mono"
                               placeholder="เช่น INV-2026-00125"
                               value="${escapeHTML(currentInboundTaxInvoice)}"
                               oninput="onInboundDocRefInputChange()"
                               autocomplete="off">
                        <button type="button" class="wms-doc-scan-mini-btn" onclick="focusAndScanDocField('tax_invoice')" title="สแกนบาร์โค้ดใบกำกับภาษีด้วยกล้องหรือปืนยิง">
                            <i class="fa-solid fa-camera"></i>
                        </button>
                    </div>
                </div>

                <div>
                    <label for="inboundPoNumber" style="font-size:0.78rem; font-weight:700; color:var(--text-sub); display:block; margin-bottom:4px;">
                        <i class="fa-solid fa-file-contract" style="color:var(--purple);"></i> เลขที่ใบสั่งซื้อ (PO Number)
                    </label>
                    <div class="wms-doc-input-wrap">
                        <input type="text"
                               id="inboundPoNumber"
                               class="form-control mono"
                               placeholder="เช่น PO-2026-8841"
                               value="${escapeHTML(currentInboundPoNumber)}"
                               oninput="onInboundDocRefInputChange()"
                               autocomplete="off">
                        <button type="button" class="wms-doc-scan-mini-btn" onclick="focusAndScanDocField('po_number')" title="สแกนบาร์โค้ดเลข PO ด้วยกล้องหรือปืนยิง">
                            <i class="fa-solid fa-camera"></i>
                        </button>
                    </div>
                </div>
            </div>

            <div id="inboundDocRefSummaryStrip" class="wms-doc-summary-strip"></div>
        `;

        inboundForm.insertBefore(docCard, inboundForm.firstChild);

        const taxEl = document.getElementById('inboundTaxInvoice');
        const poEl = document.getElementById('inboundPoNumber');
        if (taxEl) {
            taxEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (poEl) { poEl.focus(); poEl.select(); }
                }
            });
        }
        if (poEl) {
            poEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    activeDocTargetScanField = null;
                    const skuSearch = document.getElementById('skuSearchInput');
                    if (skuSearch && !document.getElementById('inboundCategory')?.value) {
                        skuSearch.focus();
                    } else {
                        ensureSnInputFocus(true);
                    }
                }
            });
        }
    }

    updateInboundDocRefSummaryUI();
}

function getActiveInboundDocRefs() {
    const taxEl = document.getElementById('inboundTaxInvoice');
    const poEl = document.getElementById('inboundPoNumber');
    const taxInvoice = taxEl ? String(taxEl.value || '').trim() : String(currentInboundTaxInvoice || '').trim();
    const poNumber = poEl ? String(poEl.value || '').trim() : String(currentInboundPoNumber || '').trim();
    return {
        taxInvoice,
        poNumber,
        hasAnyDoc: Boolean(taxInvoice || poNumber)
    };
}

function setInboundDocRefs(taxVal = '', poVal = '', lockState = undefined) {
    currentInboundTaxInvoice = String(taxVal || '').trim();
    currentInboundPoNumber = String(poVal || '').trim();
    if (typeof lockState === 'boolean') {
        isInboundDocRefLocked = lockState;
    }

    const taxEl = document.getElementById('inboundTaxInvoice');
    const poEl = document.getElementById('inboundPoNumber');
    if (taxEl) taxEl.value = currentInboundTaxInvoice;
    if (poEl) poEl.value = currentInboundPoNumber;

    saveActiveInboundDocRefState();
    updateInboundDocRefSummaryUI();
    if (typeof updateBatchSnBarDocContextHint === 'function') updateBatchSnBarDocContextHint();
    if (typeof updateInboundNetworkSyncHUD === 'function') updateInboundNetworkSyncHUD();
}

function onInboundDocRefInputChange() {
    const refs = getActiveInboundDocRefs();
    currentInboundTaxInvoice = refs.taxInvoice;
    currentInboundPoNumber = refs.poNumber;
    saveActiveInboundDocRefState();
    updateInboundDocRefSummaryUI();
    if (typeof updateBatchSnBarDocContextHint === 'function') updateBatchSnBarDocContextHint();
    if (typeof updateInboundNetworkSyncHUD === 'function') updateInboundNetworkSyncHUD();
}

function toggleInboundDocRefLock() {
    isInboundDocRefLocked = !isInboundDocRefLocked;
    saveActiveInboundDocRefState();
    updateInboundDocRefSummaryUI();
    showToast(
        isInboundDocRefLocked
            ? '📌 เปิดปักหมุดเอกสารแล้ว (คงเลขใบกำกับภาษีและ PO ไว้ต่อเนื่อง)'
            : '🔓 ปิดปักหมุดเอกสารแล้ว (ล้างช่องเอกสารอัตโนมัติหลังรับเข้า)',
        false,
        2000
    );
}

function clearInboundDocRefs() {
    setInboundDocRefs('', '', isInboundDocRefLocked);
    showToast('🧹 ล้างเลขที่ใบกำกับภาษีและเลข PO เรียบร้อยแล้ว', false, 1800);
}

function focusAndScanDocField(fieldType) {
    activeDocTargetScanField = fieldType;
    const targetInput = fieldType === 'tax_invoice'
        ? document.getElementById('inboundTaxInvoice')
        : document.getElementById('inboundPoNumber');
    if (targetInput) {
        targetInput.focus();
        targetInput.select();
    }
    if (typeof openCameraScanner === 'function') {
        openCameraScanner(fieldType);
    }
}

function updateInboundDocRefSummaryUI() {
    const pinBtn = document.getElementById('btnPinInboundDocRef');
    if (pinBtn) {
        if (isInboundDocRefLocked) {
            pinBtn.classList.add('pinned');
            pinBtn.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ปักหมุดเอกสาร: เปิด`;
        } else {
            pinBtn.classList.remove('pinned');
            pinBtn.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ปักหมุดเอกสาร: ปิด`;
        }
    }

    const strip = document.getElementById('inboundDocRefSummaryStrip');
    if (!strip) return;

    const { taxInvoice, poNumber, hasAnyDoc } = getActiveInboundDocRefs();
    if (hasAnyDoc) {
        strip.innerHTML = `
            <span><i class="fa-solid fa-link" style="color:var(--success);"></i> พร้อมผูกกับทุก S/N:
                ${taxInvoice ? `<strong class="mono" style="color:var(--primary-text);">INV: ${escapeHTML(taxInvoice)}</strong>` : ''}
                ${taxInvoice && poNumber ? ' • ' : ''}
                ${poNumber ? `<strong class="mono" style="color:var(--purple-text);">PO: ${escapeHTML(poNumber)}</strong>` : ''}
            </span>
            <span style="font-size:0.71rem; color:var(--text-muted);">คีย์ลัด: Alt+1 ใบกำกับฯ | Alt+2 PO | Alt+3 ยิง S/N</span>
        `;
    } else {
        strip.innerHTML = `
            <span><i class="fa-regular fa-circle-question"></i> กรอกหรือสแกนเลขที่ใบกำกับภาษีและ PO เพื่อบันทึกคู่กับ S/N ทุกรายการ</span>
            <span style="font-size:0.71rem; color:var(--text-muted);">คีย์ลัด: Alt+1 / Alt+2</span>
        `;
    }
}

function recordInboundDocUsage(taxInvoice, poNumber, itemCount = 1) {
    const tax = String(taxInvoice || '').trim();
    const po = String(poNumber || '').trim();
    if (!tax && !po) return;

    try {
        const raw = localStorage.getItem(INBOUND_DOC_HISTORY_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const safeList = Array.isArray(list) ? list : [];
        const key = `${tax.toUpperCase()}||${po.toUpperCase()}`;

        const existingIdx = safeList.findIndex(x => `${String(x.tax || '').toUpperCase()}||${String(x.po || '').toUpperCase()}` === key);
        if (existingIdx >= 0) {
            safeList[existingIdx].count = (safeList[existingIdx].count || 0) + itemCount;
            safeList[existingIdx].updatedAt = new Date().toISOString();
            const moved = safeList.splice(existingIdx, 1)[0];
            safeList.unshift(moved);
        } else {
            safeList.unshift({
                tax,
                po,
                count: itemCount,
                updatedAt: new Date().toISOString()
            });
        }

        localStorage.setItem(INBOUND_DOC_HISTORY_KEY, JSON.stringify(safeList.slice(0, 25)));
    } catch (e) {}
}

function toggleInboundDocHistoryPopover() {
    const pop = document.getElementById('inboundDocHistoryPopover');
    if (!pop) return;

    if (pop.style.display !== 'none') {
        pop.style.display = 'none';
        return;
    }

    let items = [];
    try {
        const raw = localStorage.getItem(INBOUND_DOC_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) items = parsed;
    } catch (e) {}

    if (items.length === 0) {
        pop.innerHTML = `<div style="padding:12px; text-align:center; font-size:0.78rem; color:var(--text-muted);">ยังไม่มีประวัติเลขที่ใบกำกับภาษี / PO</div>`;
    } else {
        pop.innerHTML = `
            <div style="font-size:0.76rem; font-weight:800; color:var(--text-main); margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid var(--border-color);">
                เลือกเอกสารที่ใช้ล่าสุด (คลิกเพื่อใช้งานทันที)
            </div>
            <div style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:5px;">
                ${items.map(doc => `
                    <button type="button"
                            onclick="applyInboundDocHistoryPreset('${encodeURIComponent(doc.tax || '')}', '${encodeURIComponent(doc.po || '')}')"
                            style="text-align:left; background:var(--bg-subtle); border:1px solid var(--border-color); border-radius:8px; padding:6px 9px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:6px;">
                        <div style="font-size:0.74rem; line-height:1.35;">
                            <div><strong>INV:</strong> <span class="mono" style="color:var(--primary-text);">${escapeHTML(doc.tax || '-')}</span></div>
                            <div><strong>PO:</strong> <span class="mono" style="color:var(--purple-text);">${escapeHTML(doc.po || '-')}</span></div>
                        </div>
                        <span style="font-size:0.7rem; font-weight:800; background:var(--primary-light); color:var(--primary-text); padding:2px 7px; border-radius:99px;">${(doc.count || 1).toLocaleString()} ชิ้น</span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    pop.style.display = 'block';
}

function applyInboundDocHistoryPreset(encTax, encPo) {
    const tax = decodeURIComponent(encTax || '');
    const po = decodeURIComponent(encPo || '');
    setInboundDocRefs(tax, po, true);
    const pop = document.getElementById('inboundDocHistoryPopover');
    if (pop) pop.style.display = 'none';
    showToast(`📌 เลือกเอกสาร INV: ${tax || '-'} | PO: ${po || '-'} แล้ว`, false, 2000);
    ensureSnInputFocus(true);
}

// =========================================================================
// 6. INSTANT 0ms SCAN BOX STATUS HUD
// =========================================================================

function ensureInstantScanBoxIndicator() {
    let hud = document.getElementById('wmsInstantScanStatusHud');
    if (hud) return hud;

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return null;
    const snBox = snInput.closest('.form-group') || snInput.parentElement;
    if (!snBox) return null;

    hud = document.createElement('div');
    hud.id = 'wmsInstantScanStatusHud';
    hud.className = 'wms-instant-scan-hud';
    hud.innerHTML = `
        <span style="color:var(--primary-text);"><i class="fa-solid fa-bolt"></i> พร้อมยิงสแกน S/N ความเร็วสูง 0ms</span>
        <span class="mono" style="font-size:0.73rem; color:var(--text-muted);">รอบนี้: 0 ชิ้น</span>
    `;
    snBox.appendChild(hud);
    return hud;
}

function renderInstantScanBoxStatus(stateType, primaryText = '', locText = '', queueLen = 0, speedPerSec = 0) {
    const hud = ensureInstantScanBoxIndicator();
    if (!hud) return;

    const speedBadge = speedPerSec > 1 ? ` • ${speedPerSec} ชิ้น/วิ` : '';
    const queueBadge = queueLen > 0 ? ` (กำลังบันทึก ${queueLen})` : ' (เข้า DB แล้ว)';

    if (stateType === 'success') {
        hud.style.borderColor = 'var(--success-border)';
        hud.style.background = 'var(--success-light)';
        hud.innerHTML = `
            <span style="color:var(--success-text);"><i class="fa-solid fa-circle-check"></i> รับเข้า <strong class="mono">${escapeHTML(primaryText)}</strong> → <strong>${escapeHTML(locText)}</strong></span>
            <span class="mono" style="font-size:0.72rem; color:var(--success-text);">รวม ${sessionScannedSuccessCount.toLocaleString()}${speedBadge}${queueBadge}</span>
        `;
    } else if (stateType === 'duplicate') {
        hud.style.borderColor = 'var(--danger-border)';
        hud.style.background = 'var(--danger-light)';
        hud.innerHTML = `
            <span style="color:var(--danger-text);"><i class="fa-solid fa-ban"></i> S/N ซ้ำในระบบ: <strong class="mono">${escapeHTML(primaryText)}</strong></span>
            <span class="mono" style="font-size:0.72rem; color:var(--danger-text);">ข้ามรายการซ้ำแล้ว</span>
        `;
    } else if (stateType === 'occupied') {
        hud.style.borderColor = 'var(--warning-border)';
        hud.style.background = 'var(--warning-light)';
        hud.innerHTML = `
            <span style="color:var(--warning-text);"><i class="fa-solid fa-triangle-exclamation"></i> พิกัด ${escapeHTML(locText)} เต็มแล้ว</span>
            <span class="mono" style="font-size:0.72rem; color:var(--warning-text);">โปรดเลือกแถวใหม่</span>
        `;
    } else if (stateType === 'error') {
        hud.style.borderColor = 'var(--danger-border)';
        hud.style.background = 'var(--danger-light)';
        hud.innerHTML = `<span style="color:var(--danger-text);">${escapeHTML(primaryText)}</span>`;
    } else if (stateType === 'synced') {
        hud.style.borderColor = 'var(--success-border)';
        hud.style.background = 'var(--bg-surface)';
        hud.innerHTML = `
            <span style="color:var(--success-text);"><i class="fa-solid fa-cloud-check"></i> บันทึกเข้าฐานข้อมูลเรียลไทม์ครบทุกรายการแล้ว</span>
            <span class="mono" style="font-size:0.72rem; color:var(--text-muted);">รอบนี้: ${sessionScannedSuccessCount.toLocaleString()} ชิ้น</span>
        `;
    }
}

if (typeof window !== 'undefined') {
    window.escapeHTML = escapeHTML;
    window.showToast = showToast;
    window.copyToClipboard = copyToClipboard;
    window.getCurrentUserFullName = getCurrentUserFullName;
    window.getSharedWmsAudioContext = getSharedWmsAudioContext;
    window.playAudioFeedback = playAudioFeedback;
    window.ensureSnInputFocus = ensureSnInputFocus;
    window.removeInboundItemFromLocalStateOnly = removeInboundItemFromLocalStateOnly;
    window.upgradeInboundEnterpriseUXUI = upgradeInboundEnterpriseUXUI;
    window.getActiveInboundDocRefs = getActiveInboundDocRefs;
    window.setInboundDocRefs = setInboundDocRefs;
    window.onInboundDocRefInputChange = onInboundDocRefInputChange;
    window.toggleInboundDocRefLock = toggleInboundDocRefLock;
    window.clearInboundDocRefs = clearInboundDocRefs;
    window.focusAndScanDocField = focusAndScanDocField;
    window.recordInboundDocUsage = recordInboundDocUsage;
    window.toggleInboundDocHistoryPopover = toggleInboundDocHistoryPopover;
    window.applyInboundDocHistoryPreset = applyInboundDocHistoryPreset;
    window.ensureInstantScanBoxIndicator = ensureInstantScanBoxIndicator;
    window.renderInstantScanBoxStatus = renderInstantScanBoxStatus;
}