// =========================================================================
// --- MODULE 3.1: INBOUND CORE STATE, AUDIO, SECURITY & UI HELPERS ---
// --- Central State, Loud Standard Audio, XSS Guard, Toast & Focus ---
// =========================================================================

let recentInboundList = [];
let fastScanLock = false;

// ⚡ Fast-Scan Memory Locking Sets (0ms Synchronous Lock Engine)
const pendingFastSnSet = new Set();
const pendingFastLocationSet = new Set();

let cachedOccupiedSet = null;
let isFeedRenderScheduled = false;

// 🗑️ Tombstone Registry สำหรับ S/N ที่เพิ่งถูกลบออกจากหน้าเช็กสต็อก (ป้องกัน Cache/DB เก่าดึงกลับมาแสดงซ้ำ)
const RECENTLY_DELETED_SN_STORAGE_KEY = 'WMS_RECENTLY_DELETED_SNS_V1';
const recentlyDeletedSnMap = new Map();
const DELETED_SN_TOMBSTONE_TTL_MS = 45000; // เก็บประวัติการลบชั่วคราว 45 วินาทีเพื่อกันข้อมูลค้างจาก Read Replica

// 🚀 FIFO SCAN QUEUE & PERSISTENT DB SYNC ENGINE
const scanProcessingQueue = [];
let isProcessingScanQueue = false;
let scanSpeedCounter = 0;
let scanSpeedTimer = null;

// 📊 Session Scan Verification Counters (ตรวจสอบจำนวนที่ยิงได้จริง vs จำนวนที่เข้า DB ครบ)
let sessionScannedSuccessCount = 0;
let sessionDbConfirmedCount = 0;

const PERSISTENT_DB_QUEUE_KEY = 'WMS_PERSISTENT_INBOUND_SYNC_QUEUE';
let persistentDbSyncQueue = [];
let isFlushingDbQueue = false;
let dbSyncSequenceCounter = Date.now();
let networkMonitorTimer = null;

// 💾 Non-blocking Storage Persistence Timers (ป้องกันการหน่วงขณะยิงสแกนรัวต่อเนื่อง)
let recentFeedSaveTimer = null;
let persistentQueueSaveTimer = null;

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

// 🔊 WAREHOUSE-GRADE LOUD STANDARD BARCODE AUDIO SYNTHESIZER
const WMS_AUDIO_MODE_STORAGE_KEY = 'WMS_INBOUND_AUDIO_MODE_V1';
let wmsAudioVolumeMode = 'turbo'; // 'turbo' (ดังพิเศษ 100%), 'standard' (มาตรฐาน 75%), 'mute' (ปิดเสียง)
let sharedWmsAudioCtx = null;
let sharedWmsMasterGain = null;
let sharedWmsCompressor = null;

function loadInboundAudioMode() {
    try {
        const saved = localStorage.getItem(WMS_AUDIO_MODE_STORAGE_KEY);
        if (saved === 'turbo' || saved === 'standard' || saved === 'mute') {
            wmsAudioVolumeMode = saved;
        }
    } catch (e) {}
}

loadInboundAudioMode();

function saveInboundAudioMode() {
    try {
        localStorage.setItem(WMS_AUDIO_MODE_STORAGE_KEY, wmsAudioVolumeMode);
    } catch (e) {}
}

function getSharedWmsAudioContext() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!sharedWmsAudioCtx) {
            sharedWmsAudioCtx = new AudioCtx();

            // สร้าง DynamicsCompressor + MasterGain เพื่อให้เสียงดังคมชัดไม่แตกพร่าแม้เปิดดังสุด
            sharedWmsCompressor = sharedWmsAudioCtx.createDynamicsCompressor();
            sharedWmsCompressor.threshold.setValueAtTime(-14, sharedWmsAudioCtx.currentTime);
            sharedWmsCompressor.knee.setValueAtTime(12, sharedWmsAudioCtx.currentTime);
            sharedWmsCompressor.ratio.setValueAtTime(8, sharedWmsAudioCtx.currentTime);
            sharedWmsCompressor.attack.setValueAtTime(0.002, sharedWmsAudioCtx.currentTime);
            sharedWmsCompressor.release.setValueAtTime(0.08, sharedWmsAudioCtx.currentTime);

            sharedWmsMasterGain = sharedWmsAudioCtx.createGain();
            sharedWmsMasterGain.gain.setValueAtTime(1.0, sharedWmsAudioCtx.currentTime);

            sharedWmsCompressor.connect(sharedWmsMasterGain);
            sharedWmsMasterGain.connect(sharedWmsAudioCtx.destination);
        }
        if (sharedWmsAudioCtx.state === 'suspended') {
            sharedWmsAudioCtx.resume().catch(() => {});
        }
        return sharedWmsAudioCtx;
    } catch (e) {
        return null;
    }
}

function getAudioOutputNode(ctx) {
    if (sharedWmsCompressor) return sharedWmsCompressor;
    return ctx.destination;
}

function cycleInboundAudioVolumeMode() {
    if (wmsAudioVolumeMode === 'turbo') {
        wmsAudioVolumeMode = 'standard';
    } else if (wmsAudioVolumeMode === 'standard') {
        wmsAudioVolumeMode = 'mute';
    } else {
        wmsAudioVolumeMode = 'turbo';
    }
    saveInboundAudioMode();
    if (wmsAudioVolumeMode !== 'mute') {
        playAudioFeedback('success');
    }
    renderInstantScanBoxStatus('ready');
}

function testInboundScannerAudio() {
    if (wmsAudioVolumeMode === 'mute') {
        wmsAudioVolumeMode = 'turbo';
        saveInboundAudioMode();
    }
    playAudioFeedback('success');
    renderInstantScanBoxStatus('ready');
}

function resetInboundSessionCounters() {
    sessionScannedSuccessCount = 0;
    sessionDbConfirmedCount = 0;
    renderInstantScanBoxStatus('ready');
    showToast('🔄 รีเซ็ตตัวนับยอดสแกนรอบปัจจุบันเป็น 0 เรียบร้อยแล้ว', false, 2000);
    ensureSnInputFocus(true);
}

// 🔊 เสียงแจ้งเตือนมาตรฐานเครื่องสแกนคลังสินค้า (Zebra / Honeywell Grade • ดังคมชัด)
function playAudioFeedback(type = 'success') {
    try {
        if (wmsAudioVolumeMode === 'mute') return;

        const ctx = getSharedWmsAudioContext();
        if (!ctx) return;

        const outNode = getAudioOutputNode(ctx);
        const now = ctx.currentTime;
        const boost = wmsAudioVolumeMode === 'turbo' ? 1.0 : 0.68;

        if (type === 'success') {
            // มาตรฐานปืนยิงบาร์โค้ด: Dual-Tone High-Clarity Chime (2400Hz -> 3200Hz)
            const oscMain = ctx.createOscillator();
            const oscHarmonic = ctx.createOscillator();
            const gain = ctx.createGain();

            oscMain.type = 'square';
            oscHarmonic.type = 'triangle';

            oscMain.frequency.setValueAtTime(2400, now);
            oscMain.frequency.setValueAtTime(3200, now + 0.055);

            oscHarmonic.frequency.setValueAtTime(1200, now);
            oscHarmonic.frequency.setValueAtTime(1600, now + 0.055);

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.88 * boost, now + 0.006);
            gain.gain.setValueAtTime(0.92 * boost, now + 0.055);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.145);

            oscMain.connect(gain);
            oscHarmonic.connect(gain);
            gain.connect(outNode);

            oscMain.start(now);
            oscHarmonic.start(now);
            oscMain.stop(now + 0.15);
            oscHarmonic.stop(now + 0.15);
        } else if (type === 'duplicate') {
            // เสียงเตือน S/N ซ้ำมาตรฐาน: 2 จังหวะเสียงต่ำหนักแน่น (310Hz x 2)
            for (let pulse = 0; pulse < 2; pulse++) {
                const startAt = now + pulse * 0.135;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(310, startAt);
                osc.frequency.setValueAtTime(250, startAt + 0.045);

                gain.gain.setValueAtTime(0.001, startAt);
                gain.gain.linearRampToValueAtTime(0.95 * boost, startAt + 0.006);
                gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.095);

                osc.connect(gain);
                gain.connect(outNode);
                osc.start(startAt);
                osc.stop(startAt + 0.10);
            }
        } else if (type === 'occupied') {
            // เสียงเตือนพิกัดเต็ม: เสียงไล่ระดับลงชัดเจน (560Hz -> 260Hz)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(560, now);
            osc.frequency.linearRampToValueAtTime(260, now + 0.26);

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.95 * boost, now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);

            osc.connect(gain);
            gain.connect(outNode);
            osc.start(now);
            osc.stop(now + 0.28);
        } else {
            // เสียงเตือนข้อผิดพลาดมาตรฐาน: 3 จังหวะเสียงต่ำ (230Hz x 3)
            for (let pulse = 0; pulse < 3; pulse++) {
                const startAt = now + pulse * 0.105;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(230, startAt);

                gain.gain.setValueAtTime(0.001, startAt);
                gain.gain.linearRampToValueAtTime(0.95 * boost, startAt + 0.005);
                gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.075);

                osc.connect(gain);
                gain.connect(outNode);
                osc.start(startAt);
                osc.stop(startAt + 0.08);
            }
        }
    } catch (e) {}

    if (navigator.vibrate) {
        try {
            if (type === 'success') navigator.vibrate([35, 20, 35]);
            else if (type === 'duplicate') navigator.vibrate([90, 45, 90]);
            else if (type === 'occupied') navigator.vibrate([120, 50, 120]);
            else navigator.vibrate([110, 45, 110, 45, 110]);
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

function buildAudioAndCounterControlsHTML() {
    const audioIcon = wmsAudioVolumeMode === 'mute'
        ? '<i class="fa-solid fa-volume-xmark"></i> ปิดเสียง'
        : (wmsAudioVolumeMode === 'turbo'
            ? '<i class="fa-solid fa-volume-high"></i> เสียงดังพิเศษ'
            : '<i class="fa-solid fa-volume-low"></i> เสียงมาตรฐาน');

    return `
        <div class="wms-scan-session-strip">
            <div class="wms-session-counter-group">
                <span class="wms-session-pill captured" title="จำนวน S/N ที่สแกนผ่านเข้าระบบในรอบนี้">
                    <i class="fa-solid fa-barcode"></i> ยิงได้รอบนี้: <strong class="mono">${sessionScannedSuccessCount.toLocaleString()}</strong> ชิ้น
                </span>
                <span class="wms-session-pill confirmed" title="จำนวน S/N ที่บันทึกเข้าฐานข้อมูลเรียบร้อยแล้วในรอบนี้">
                    <i class="fa-solid fa-database"></i> เข้า DB ครบ: <strong class="mono">${sessionDbConfirmedCount.toLocaleString()}</strong> ชิ้น
                </span>
                <button type="button" class="wms-mini-tool-btn" onclick="resetInboundSessionCounters()" title="รีเซ็ตตัวนับยอดสแกนรอบนี้เป็น 0">
                    <i class="fa-solid fa-rotate-left"></i> รีเซ็ตตัวนับ
                </button>
            </div>
            <div class="wms-audio-control-group">
                <button type="button" class="wms-mini-tool-btn audio-mode ${wmsAudioVolumeMode}" onclick="cycleInboundAudioVolumeMode()" title="สลับระดับความดังเสียงสแกน">
                    ${audioIcon}
                </button>
                <button type="button" class="wms-mini-tool-btn test-beep" onclick="testInboundScannerAudio()" title="กดเพื่อทดสอบเสียงสแกน">
                    <i class="fa-solid fa-bell"></i> ทดสอบเสียง
                </button>
            </div>
        </div>
    `;
}

// ⚡ แถบแสดงสถานะการสแกนทันทีตรงใต้ช่องสแกน S/N (0ms Instant Scan Box HUD)
function ensureInstantScanBoxIndicator() {
    let box = document.getElementById('inboundInstantScanIndicator');
    if (box) return box;

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return null;

    const targetHost = snInput.closest('.form-group, .input-group-wrapper, .field-box') || snInput.parentElement;
    if (!targetHost) return null;

    box = document.createElement('div');
    box.id = 'inboundInstantScanIndicator';
    box.className = 'wms-instant-scan-box ready';
    targetHost.appendChild(box);
    renderInstantScanBoxStatus('ready');
    return box;
}

function renderInstantScanBoxStatus(statusType = 'success', snText = '', locationText = '', queueRemaining = null, speedPerSec = 0) {
    const box = ensureInstantScanBoxIndicator();
    if (!box) return;

    const pendingCount = typeof queueRemaining === 'number' ? queueRemaining : persistentDbSyncQueue.length;
    const safeSn = escapeHTML(snText);
    const safeLoc = locationText ? escapeHTML(formatLocationSpaced(locationText)) : '';
    const speedHtml = speedPerSec > 1 ? `<span class="wms-instant-speed-pill">⚡ ${speedPerSec} ชิ้น/วิ</span>` : '';

    const queueBadgeHtml = pendingCount > 0
        ? `<span id="inboundInstantQueuePill" class="wms-instant-queue-pill syncing"><i class="fa-solid fa-arrows-rotate fa-spin"></i> รันคิวเข้า DB: ${pendingCount.toLocaleString()}</span>`
        : `<span id="inboundInstantQueuePill" class="wms-instant-queue-pill synced"><i class="fa-solid fa-check"></i> DB ครบตามคิว</span>`;

    const controlsStripHtml = buildAudioAndCounterControlsHTML();

    box.classList.remove('ready', 'success', 'synced', 'duplicate', 'occupied', 'error', 'pop');
    void box.offsetWidth;

    if (statusType === 'ready') {
        box.classList.add('ready');
        box.innerHTML = `
            <div class="wms-instant-scan-top-row">
                <div class="wms-instant-scan-left">
                    <span class="pulse-live-dot"></span>
                    <span class="wms-instant-scan-msg">พร้อมยิงสแกนความเร็วสูง (รับ S/N เต็มทุกตัว 100% + บันทึกเข้า DB ตามคิวทันที)</span>
                </div>
                <div class="wms-instant-scan-right">
                    ${speedHtml}
                    ${queueBadgeHtml}
                </div>
            </div>
            ${controlsStripHtml}
        `;
    } else if (statusType === 'success') {
        box.classList.add('success', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-top-row">
                <div class="wms-instant-scan-left">
                    <i class="fa-solid fa-bolt" style="color:#059669; flex-shrink:0;"></i>
                    <span class="wms-instant-scan-msg">
                        รับเข้าหน้าเว็บแล้ว: <strong class="mono">${safeSn}</strong>
                        ${safeLoc ? `<span class="wms-instant-loc-tag">📍 ${safeLoc}</span>` : ''}
                    </span>
                </div>
                <div class="wms-instant-scan-right">
                    ${speedHtml}
                    ${queueBadgeHtml}
                </div>
            </div>
            ${controlsStripHtml}
        `;
    } else if (statusType === 'synced') {
        box.classList.add('synced');
        box.innerHTML = `
            <div class="wms-instant-scan-top-row">
                <div class="wms-instant-scan-left">
                    <i class="fa-solid fa-circle-check" style="color:#059669; flex-shrink:0;"></i>
                    <span class="wms-instant-scan-msg">✅ บันทึก S/N เข้าฐานข้อมูลครบตามลำดับคิวทุกรายการแล้ว</span>
                </div>
                <div class="wms-instant-scan-right">
                    ${speedHtml}
                    ${queueBadgeHtml}
                </div>
            </div>
            ${controlsStripHtml}
        `;
    } else if (statusType === 'duplicate') {
        box.classList.add('duplicate', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-top-row">
                <div class="wms-instant-scan-left">
                    <i class="fa-solid fa-ban" style="color:#dc2626; flex-shrink:0;"></i>
                    <span class="wms-instant-scan-msg">ข้าม S/N ซ้ำ: <strong class="mono">${safeSn}</strong> (มีในระบบแล้ว)</span>
                </div>
                <div class="wms-instant-scan-right">
                    ${queueBadgeHtml}
                </div>
            </div>
            ${controlsStripHtml}
        `;
    } else if (statusType === 'occupied') {
        box.classList.add('occupied', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-top-row">
                <div class="wms-instant-scan-left">
                    <i class="fa-solid fa-triangle-exclamation" style="color:#d97706; flex-shrink:0;"></i>
                    <span class="wms-instant-scan-msg">พิกัดเต็ม (${safeLoc}) — ระบบเลื่อนไปช่องว่างถัดไปให้อัตโนมัติ</span>
                </div>
                <div class="wms-instant-scan-right">
                    ${queueBadgeHtml}
                </div>
            </div>
            ${controlsStripHtml}
        `;
    } else if (statusType === 'error') {
        box.classList.add('error', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-top-row">
                <div class="wms-instant-scan-left">
                    <i class="fa-solid fa-circle-exclamation" style="color:#dc2626; flex-shrink:0;"></i>
                    <span class="wms-instant-scan-msg">${safeSn || 'กรุณาตรวจสอบข้อมูล SKU และแถวจัดเก็บก่อนสแกน'}</span>
                </div>
                <div class="wms-instant-scan-right">
                    ${queueBadgeHtml}
                </div>
            </div>
            ${controlsStripHtml}
        `;
    }
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

    // ปลดล็อก fastScanLock อัตโนมัติหากไม่มีคิวกำลังประมวลผลค้างอยู่ (ป้องกันยิง S/N ใหม่ไม่ได้หลังสลับหน้า)
    if (fastScanLock && !isProcessingScanQueue && scanProcessingQueue.length === 0) {
        fastScanLock = false;
    }

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

    // ตรวจสอบให้แน่ใจว่าไม่มีการจำกัดความยาว S/N และไม่ได้ถูก disabled ค้างไว้
    if (snInput.hasAttribute('maxlength')) {
        snInput.removeAttribute('maxlength');
    }
    if (snInput.disabled) {
        snInput.disabled = false;
    }
    if (snInput.readOnly) {
        snInput.readOnly = false;
    }

    // ตรวจสอบว่ากำลังเปิดหน้าเมนูรับสินค้าเข้าคลังอยู่หรือไม่ (ป้องกันแย่งโฟกัสเมนูอื่น)
    const inboundSection = document.getElementById('inboundSection') ||
                           document.getElementById('tab-inbound') ||
                           document.getElementById('inbound') ||
                           snInput.closest('.tab-content, .page-section, section');
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

// 🗑️ บันทึก Tombstone เมื่อ S/N ถูกลบ เพื่อป้องกัน Cache หรือ DB ที่ยังซิงก์ไม่เสร็จดึงกลับมาแสดงซ้ำ
function recordDeletedSnTombstone(snList = []) {
    const now = Date.now();
    // ล้างรายการหมดอายุ
    for (const [key, ts] of recentlyDeletedSnMap.entries()) {
        if (now - ts > DELETED_SN_TOMBSTONE_TTL_MS) {
            recentlyDeletedSnMap.delete(key);
        }
    }

    try {
        const storedRaw = localStorage.getItem(RECENTLY_DELETED_SN_STORAGE_KEY);
        if (storedRaw) {
            const parsed = JSON.parse(storedRaw);
            if (parsed && typeof parsed === 'object') {
                Object.entries(parsed).forEach(([k, ts]) => {
                    if (now - Number(ts) <= DELETED_SN_TOMBSTONE_TTL_MS) {
                        recentlyDeletedSnMap.set(k.toUpperCase(), Number(ts));
                    }
                });
            }
        }
    } catch (e) {}

    snList.forEach(sn => {
        const clean = String(sn || '').trim().toUpperCase();
        if (clean) {
            recentlyDeletedSnMap.set(clean, now);
        }
    });

    try {
        const obj = {};
        recentlyDeletedSnMap.forEach((ts, k) => {
            obj[k] = ts;
        });
        localStorage.setItem(RECENTLY_DELETED_SN_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {}
}

function clearDeletedSnTombstone(sn) {
    const clean = String(sn || '').trim().toUpperCase();
    if (!clean) return;
    recentlyDeletedSnMap.delete(clean);
    try {
        const storedRaw = localStorage.getItem(RECENTLY_DELETED_SN_STORAGE_KEY);
        if (storedRaw) {
            const parsed = JSON.parse(storedRaw);
            if (parsed && typeof parsed === 'object' && parsed[clean]) {
                delete parsed[clean];
                localStorage.setItem(RECENTLY_DELETED_SN_STORAGE_KEY, JSON.stringify(parsed));
            }
        }
    } catch (e) {}
}

function isSnRecentlyDeletedTombstone(sn) {
    const clean = String(sn || '').trim().toUpperCase();
    if (!clean) return false;
    const now = Date.now();

    let ts = recentlyDeletedSnMap.get(clean);
    if (!ts) {
        try {
            const storedRaw = localStorage.getItem(RECENTLY_DELETED_SN_STORAGE_KEY);
            if (storedRaw) {
                const parsed = JSON.parse(storedRaw);
                if (parsed && parsed[clean]) {
                    ts = Number(parsed[clean]);
                    recentlyDeletedSnMap.set(clean, ts);
                }
            }
        } catch (e) {}
    }

    if (ts && (now - ts) <= DELETED_SN_TOMBSTONE_TTL_MS) {
        return true;
    }
    if (ts) {
        recentlyDeletedSnMap.delete(clean);
    }
    return false;
}

// 🟢 คืนค่าและรีเซ็ตพิกัดจากความจำ + ลบออกจากประวัติรับเข้าล่าสุดแบบเรียลไทม์ 100%
function purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId, targetLocation = null) {
    if (!targetSn && !targetId && !targetLocation) return;

    const snUpperSet = new Set();
    const idStrSet = new Set();
    const locUpperSet = new Set();

    const collectTarget = (val, targetSet, toUpper = false) => {
        if (val === null || val === undefined || val === '') return;
        if (Array.isArray(val)) {
            val.forEach(v => collectTarget(v, targetSet, toUpper));
            return;
        }
        if (typeof val === 'object') {
            if (val.sn || val.serialNumber || val.SN) collectTarget(val.sn || val.serialNumber || val.SN, snUpperSet, true);
            if (val.id !== undefined && val.id !== null) collectTarget(val.id, idStrSet, false);
            if (val.location || val.loc) collectTarget(val.location || val.loc, locUpperSet, true);
            return;
        }
        const cleaned = String(val).trim();
        if (cleaned) {
            targetSet.add(toUpper ? cleaned.toUpperCase() : cleaned);
        }
    };

    collectTarget(targetSn, snUpperSet, true);
    collectTarget(targetId, idStrSet, false);
    collectTarget(targetLocation, locUpperSet, true);

    // 1. ค้นหาข้อมูล S/N และพิกัดที่เกี่ยวข้องจากหน่วยความจำทั้งหมดก่อนลบ เพื่อไม่ให้ตกหล่น
    const currentGlobalList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData) ? window.globalInventoryData : []);

    currentGlobalList.forEach(item => {
        if (!item) return;
        const itemIdStr = item.id !== undefined && item.id !== null ? String(item.id).trim() : '';
        const itemSnUpper = item.sn ? String(item.sn).trim().toUpperCase() : '';
        const itemLocUpper = item.location ? String(item.location).trim().toUpperCase() : '';

        if ((itemIdStr && idStrSet.has(itemIdStr)) || (itemSnUpper && snUpperSet.has(itemSnUpper))) {
            if (itemSnUpper) snUpperSet.add(itemSnUpper);
            if (itemIdStr) idStrSet.add(itemIdStr);
            if (itemLocUpper) locUpperSet.add(itemLocUpper);
        }
    });

    if (Array.isArray(recentInboundList)) {
        recentInboundList.forEach(item => {
            if (!item) return;
            const itemIdStr = item.id !== undefined && item.id !== null ? String(item.id).trim() : '';
            const itemSnUpper = item.sn ? String(item.sn).trim().toUpperCase() : '';
            const itemLocUpper = item.location ? String(item.location).trim().toUpperCase() : '';

            if ((itemIdStr && idStrSet.has(itemIdStr)) || (itemSnUpper && snUpperSet.has(itemSnUpper))) {
                if (itemSnUpper) snUpperSet.add(itemSnUpper);
                if (itemIdStr) idStrSet.add(itemIdStr);
                if (itemLocUpper) locUpperSet.add(itemLocUpper);
            }
        });
    }

    // บันทึก Tombstone ป้องกันข้อมูลเก่ากลับมาทับเมื่อยิงสแกนต่อทันที
    if (snUpperSet.size > 0) {
        recordDeletedSnTombstone(Array.from(snUpperSet));
    }

    // 2. ลบออกจาก globalInventoryData และ window.globalInventoryData
    const filterOutDeleted = (item) => {
        if (!item) return false;
        const itemIdStr = item.id !== undefined && item.id !== null ? String(item.id).trim() : '';
        const itemSnUpper = item.sn ? String(item.sn).trim().toUpperCase() : '';
        if (itemIdStr && idStrSet.has(itemIdStr)) return false;
        if (itemSnUpper && snUpperSet.has(itemSnUpper)) return false;
        return true;
    };

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        globalInventoryData = globalInventoryData.filter(filterOutDeleted);
        if (typeof window !== 'undefined') window.globalInventoryData = globalInventoryData;
    } else if (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData)) {
        window.globalInventoryData = window.globalInventoryData.filter(filterOutDeleted);
    }

    // 3. ลบออกจากประวัติการรับเข้าล่าสุด (recentInboundList) และอัปเดต Cache ทันที
    if (Array.isArray(recentInboundList)) {
        recentInboundList = recentInboundList.filter(filterOutDeleted);
        if (typeof window !== 'undefined') window.recentInboundList = recentInboundList;
        if (typeof saveRecentInboundFeedToCache === 'function') {
            saveRecentInboundFeedToCache();
        } else {
            try {
                localStorage.setItem('WMS_RECENT_INBOUND_CACHE', JSON.stringify(recentInboundList.slice(0, 1000)));
            } catch (e) {}
        }
    }

    // 4. ปลดล็อก S/N ออกจาก pendingFastSnSet และคิวซิงก์ เพื่อให้ยิง S/N เดิมซ้ำหรือยิง S/N ใหม่ได้ทันที 0ms
    snUpperSet.forEach(snUpper => {
        pendingFastSnSet.delete(snUpper);
    });

    if (snUpperSet.size > 0 && Array.isArray(persistentDbSyncQueue)) {
        const beforeLen = persistentDbSyncQueue.length;
        persistentDbSyncQueue = persistentDbSyncQueue.filter(q => !snUpperSet.has(String(q.payload?.sn || '').trim().toUpperCase()));
        if (persistentDbSyncQueue.length !== beforeLen) {
            if (typeof savePersistentDbQueue === 'function') savePersistentDbQueue();
            if (typeof updateInboundNetworkSyncHUD === 'function') updateInboundNetworkSyncHUD();
        }
    }

    // 5. คืนพิกัดจัดเก็บให้ว่างทันทีอย่างปลอดภัย (ป้องกัน Error หาก helper โหลดคนละลำดับ)
    locUpperSet.forEach(locUpper => {
        if (typeof removeOccupiedLocFromSet === 'function') {
            removeOccupiedLocFromSet(pendingFastLocationSet, locUpper);
        } else {
            pendingFastLocationSet.delete(locUpper);
        }
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
            if (typeof removeOccupiedLocFromSet === 'function') {
                removeOccupiedLocFromSet(occupiedLocationsSet, locUpper);
            } else {
                occupiedLocationsSet.delete(locUpper);
            }
        }
    });

    // ปลดล็อกตัวสแกนเผื่อค้างจากการสลับแท็บ
    if (!isProcessingScanQueue && scanProcessingQueue.length === 0) {
        fastScanLock = false;
    }

    invalidateOccupiedLocationsCache();

    if (userHasSelectedAisle && typeof forceSyncAndSelectAvailableLocation === 'function') {
        try { forceSyncAndSelectAvailableLocation(true); } catch (e) {}
    }
    if (typeof scheduleDebouncedFeedRender === 'function') {
        scheduleDebouncedFeedRender();
    } else if (typeof renderLiveInboundFeed === 'function') {
        renderLiveInboundFeed();
    }
    if (typeof updateMasterDbCountBadge === 'function') {
        try { updateMasterDbCountBadge(); } catch (e) {}
    }
}

function purgeDeletedSnFromMemory(targetSn, targetId) {
    purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId);
}

// 🔄 เทียบและซิงก์ประวัติรับเข้าล่าสุดให้ตรงกับข้อมูลสต็อกปัจจุบัน (ลบรายการที่ไม่มีในสต็อกแล้วออกอัตโนมัติ)
function reconcileRecentInboundWithInventory(activeInventoryList = null) {
    const sourceList = Array.isArray(activeInventoryList)
        ? activeInventoryList
        : ((typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
            ? globalInventoryData
            : (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData) ? window.globalInventoryData : null));

    if (!Array.isArray(recentInboundList)) return false;

    const deletedStatuses = new Set(['DELETED', 'OUT', 'DISPATCHED', 'CANCELLED', 'VOID', 'REMOVED']);
    const pendingQueueSnSet = new Set(
        (Array.isArray(persistentDbSyncQueue) ? persistentDbSyncQueue : [])
            .map(q => String(q?.payload?.sn || '').trim().toUpperCase())
            .filter(Boolean)
    );

    // ถ้ามีรายการใน globalInventoryData ให้สร้าง Set ของ S/N ที่ยังมีตัวตนอยู่จริงในคลัง
    const activeStockSnSet = new Set();
    const explicitlyRemovedSnSet = new Set();

    if (Array.isArray(sourceList)) {
        sourceList.forEach(item => {
            if (!item || !item.sn) return;
            const snUpper = String(item.sn).trim().toUpperCase();
            const stUpper = String(item.status || '').trim().toUpperCase();
            if (item.is_deleted === true || deletedStatuses.has(stUpper) || isSnRecentlyDeletedTombstone(snUpper)) {
                explicitlyRemovedSnSet.add(snUpper);
            } else {
                activeStockSnSet.add(snUpper);
            }
        });
    }

    let hasChanges = false;
    const removedSns = [];

    const nextRecentList = recentInboundList.filter(item => {
        if (!item || !item.sn) return false;
        const snUpper = String(item.sn).trim().toUpperCase();

        // ถ้าอยู่ในคิวรอส่ง DB ของเครื่องนี้ ให้เก็บไว้ก่อน
        if (pendingQueueSnSet.has(snUpper)) return true;

        // ถ้าถูกบันทึกว่าเพิ่งลบ หรือสถานะในสต็อกถูกลบ/เบิกออกไปแล้ว -> ลบออกทันที
        if (explicitlyRemovedSnSet.has(snUpper) || isSnRecentlyDeletedTombstone(snUpper)) {
            hasChanges = true;
            removedSns.push(snUpper);
            return false;
        }

        // หากข้อมูลสต็อกหลักโหลดเสร็จสมบูรณ์แล้ว และ S/N นี้ซิงก์เข้า DB ไปแล้วแต่หายไปจากสต็อกหลัก (ถูกลบจากหน้าเช็กสต็อก)
        if (Array.isArray(sourceList) && sourceList.length > 0 && item.db_status === 'SYNCED' && !item.isOffline && !activeStockSnSet.has(snUpper)) {
            hasChanges = true;
            removedSns.push(snUpper);
            return false;
        }

        return true;
    });

    if (hasChanges) {
        removedSns.forEach(snUpper => {
            pendingFastSnSet.delete(snUpper);
            recordDeletedSnTombstone([snUpper]);
        });
        recentInboundList = nextRecentList;
        if (typeof window !== 'undefined') window.recentInboundList = recentInboundList;
        if (typeof saveRecentInboundFeedToCache === 'function') {
            saveRecentInboundFeedToCache();
        } else {
            try {
                localStorage.setItem('WMS_RECENT_INBOUND_CACHE', JSON.stringify(recentInboundList.slice(0, 1000)));
            } catch (e) {}
        }
        invalidateOccupiedLocationsCache();
        if (typeof scheduleDebouncedFeedRender === 'function') {
            scheduleDebouncedFeedRender();
        } else if (typeof renderLiveInboundFeed === 'function') {
            renderLiveInboundFeed();
        }
    }

    return hasChanges;
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

        /* ⚡ Instant Scan Box Status Bar (แสดงผลทันทีตรงใต้ช่องสแกน S/N) */
        .wms-instant-scan-box {
            margin-top: 6px;
            padding: 8px 11px;
            border-radius: 10px;
            border: 1px solid var(--border-color, #e2e8f0);
            background: var(--bg-subtle, #f8fafc);
            display: flex;
            flex-direction: column;
            gap: 7px;
            font-size: 0.77rem;
            line-height: 1.35;
            transition: background-color 0.16s ease, border-color 0.16s ease;
        }
        .wms-instant-scan-top-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
            width: 100%;
        }
        .wms-scan-session-strip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
            padding-top: 6px;
            border-top: 1px dashed rgba(148, 163, 184, 0.35);
            width: 100%;
        }
        .wms-session-counter-group,
        .wms-audio-control-group {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .wms-session-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 8px;
            border-radius: 7px;
            font-size: 0.71rem;
            font-weight: 700;
        }
        .wms-session-pill.captured {
            background: rgba(2, 132, 199, 0.12);
            color: #0369a1;
            border: 1px solid rgba(2, 132, 199, 0.28);
        }
        .wms-session-pill.confirmed {
            background: rgba(16, 185, 129, 0.12);
            color: #047857;
            border: 1px solid rgba(16, 185, 129, 0.28);
        }
        .wms-mini-tool-btn {
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-strong, #cbd5e1);
            color: var(--text-sub, #334155);
            border-radius: 7px;
            padding: 2px 8px;
            font-size: 0.7rem;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            min-height: 24px;
            transition: all 0.15s ease;
        }
        .wms-mini-tool-btn:hover {
            border-color: var(--primary, #0284c7);
            color: var(--primary-text, #0284c7);
        }
        .wms-mini-tool-btn.audio-mode.turbo {
            background: #fef3c7;
            border-color: #f59e0b;
            color: #92400e;
        }
        .wms-mini-tool-btn.audio-mode.standard {
            background: #e0f2fe;
            border-color: #38bdf8;
            color: #0369a1;
        }
        .wms-mini-tool-btn.audio-mode.mute {
            background: #f1f5f9;
            border-color: #cbd5e1;
            color: #64748b;
        }
        .wms-mini-tool-btn.test-beep {
            background: #ecfdf5;
            border-color: #6ee7b7;
            color: #065f46;
        }
        .wms-instant-scan-box.success {
            background: linear-gradient(135deg, #ecfdf5, #d1fae5);
            border-color: #6ee7b7;
            color: #065f46;
        }
        .wms-instant-scan-box.synced {
            background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
            border-color: #a7f3d0;
            color: #047857;
        }
        .wms-instant-scan-box.duplicate,
        .wms-instant-scan-box.error {
            background: linear-gradient(135deg, #fef2f2, #fee2e2);
            border-color: #fca5a5;
            color: #991b1b;
        }
        .wms-instant-scan-box.occupied {
            background: linear-gradient(135deg, #fffbeb, #fef3c7);
            border-color: #fcd34d;
            color: #92400e;
        }
        .wms-instant-scan-box.pop {
            animation: wmsInstantScanPop 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes wmsInstantScanPop {
            0% { transform: scale(0.985); }
            50% { transform: scale(1.01); }
            100% { transform: scale(1); }
        }
        .wms-instant-scan-left {
            display: flex;
            align-items: center;
            gap: 7px;
            flex-wrap: wrap;
            min-width: 0;
            flex: 1 1 auto;
        }
        .wms-instant-scan-msg {
            font-weight: 700;
            word-break: break-word;
        }
        .wms-instant-loc-tag {
            display: inline-block;
            margin-left: 4px;
            padding: 1px 7px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.85);
            border: 1px solid rgba(16, 185, 129, 0.35);
            color: #047857;
            font-weight: 800;
            font-size: 0.72rem;
        }
        .wms-instant-scan-right {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }
        .wms-instant-queue-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 9px;
            border-radius: 99px;
            font-size: 0.71rem;
            font-weight: 800;
            white-space: nowrap;
        }
        .wms-instant-queue-pill.idle {
            background: #e2e8f0;
            color: #475569;
        }
        .wms-instant-queue-pill.syncing {
            background: #dbeafe;
            color: #1d4ed8;
            border: 1px solid #93c5fd;
        }
        .wms-instant-queue-pill.synced {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #6ee7b7;
        }
        .wms-instant-speed-pill {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 99px;
            font-size: 0.7rem;
            font-weight: 800;
            background: #fef3c7;
            color: #b45309;
            border: 1px solid #fde68a;
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

        .scan-flash-success { animation: scanFlashGreen 0.24s cubic-bezier(0.4, 0, 0.2, 1) !important; }
        .scan-flash-error { animation: scanFlashRed 0.24s cubic-bezier(0.4, 0, 0.2, 1) !important; }
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