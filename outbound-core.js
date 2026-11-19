// =========================================================================
// --- MODULE 4.1: OUTBOUND CORE STATE, O(1) STOCK INDEX & INSTANT HUD ---
// --- 0ms Lookup Engine, Role Guard, Company Profile/Logo & Work Order ---
// =========================================================================

let recentOutboundList = [];
let outboundCartList = [];
let recentOutboundOrdersList = [];
let isOutboundLocationVisible = false; // ซ่อนพิกัดเดิมเป็นค่าเริ่มต้น (Default Hidden)
let isOutboundDirectFastScanMode = false; // โหมดยิงตัดจ่ายด่วนทีละชิ้น (เฉพาะ Admin เปิดใช้ได้)

const outboundScanQueue = [];
let isProcessingOutboundQueue = false;

// ⚡ 0ms Synchronous Lock & O(1) Stock Index (รองรับสต็อก 3,500+ รายการโดยไม่หน่วง)
const pendingFastOutboundSnSet = new Set();
const activeStockBySnMap = new Map();
let lastIndexedInventoryRef = null;
let lastIndexedInventoryLen = -1;

// 🚀 Persistent Offline-First FIFO Queue & Company Profile Storage Keys
const PERSISTENT_OUTBOUND_QUEUE_KEY = 'WMS_PERSISTENT_OUTBOUND_SYNC_QUEUE';
const RECENT_OUTBOUND_CACHE_KEY = 'WMS_RECENT_OUTBOUND_FEED_CACHE';
const RECENT_OUTBOUND_ORDERS_KEY = 'WMS_RECENT_OUTBOUND_ORDERS';
const OUTBOUND_COMPANY_PROFILE_KEY = 'WMS_OUTBOUND_COMPANY_PROFILE';

let persistentOutboundDbQueue = [];
let isFlushingOutboundDbQueue = false;
let outboundSyncSequenceCounter = Date.now();
let outboundNetworkMonitorTimer = null;

// 🏢 ข้อมูลหัวบริษัทและโลโก้เริ่มต้น (บันทึกถาวรในเครื่องผู้ใช้)
let outboundCompanyProfile = {
    company_title: 'คลังสินค้าหลัก (Main Warehouse)',
    company_address: '',
    company_phone_tax: '',
    logo_data_url: ''
};

// 💾 Non-blocking Storage & Render Timers
let outboundFeedSaveTimer = null;
let outboundQueueSaveTimer = null;
let isOutboundFeedRenderScheduled = false;
let outboundSearchQuery = '';

// ⚡ Speed Metrics
let outboundScanSpeedCounter = 0;
let outboundScanSpeedTimer = null;
let latestOutboundMeasuredRate = 0;

// 🔊 Singleton Web Audio API (ไม่ค้างแม้ยิงรัวต่อเนื่อง 1,000+ ครั้ง)
let sharedOutboundAudioCtx = null;

function getOutboundSharedAudioContext() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!sharedOutboundAudioCtx) {
            sharedOutboundAudioCtx = new AudioCtx();
        }
        if (sharedOutboundAudioCtx.state === 'suspended') {
            sharedOutboundAudioCtx.resume().catch(() => {});
        }
        return sharedOutboundAudioCtx;
    } catch (e) {
        return null;
    }
}

function playOutboundAudioFeedback(type = 'success') {
    if (typeof window !== 'undefined' && typeof window.playAudioFeedback === 'function') {
        window.playAudioFeedback(type);
        return;
    }

    try {
        const ctx = getOutboundSharedAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        if (type === 'success') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1975, now);
            osc.frequency.setValueAtTime(2637, now + 0.05);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'duplicate') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.setValueAtTime(175, now + 0.09);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.24);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.24);
        } else {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(310, now);
            osc.frequency.linearRampToValueAtTime(125, now + 0.22);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.22);
        }
    } catch (e) {}

    if (navigator.vibrate) {
        try {
            if (type === 'success') navigator.vibrate([25, 20, 25]);
            else if (type === 'duplicate') navigator.vibrate([70, 40, 70]);
            else navigator.vibrate([120, 60, 120]);
        } catch (e) {}
    }
}

// 🔒 XSS Guard Helper
function escapeOutboundHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatOutboundLocationText(locStr) {
    if (!locStr) return '-';
    if (typeof window !== 'undefined' && typeof window.formatLocationSpaced === 'function') {
        return window.formatLocationSpaced(locStr);
    }
    return String(locStr).trim().toUpperCase();
}

// 🏢 โหลดและบันทึกข้อมูลหัวบริษัท + โลโก้อัตโนมัติ
function loadOutboundCompanyProfile() {
    try {
        const raw = localStorage.getItem(OUTBOUND_COMPANY_PROFILE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                outboundCompanyProfile = {
                    company_title: parsed.company_title || 'คลังสินค้าหลัก (Main Warehouse)',
                    company_address: parsed.company_address || '',
                    company_phone_tax: parsed.company_phone_tax || '',
                    logo_data_url: parsed.logo_data_url || ''
                };
            }
        }
    } catch (e) {}
    return outboundCompanyProfile;
}

function saveOutboundCompanyProfile(partialUpdate = {}) {
    outboundCompanyProfile = {
        ...outboundCompanyProfile,
        ...partialUpdate
    };
    try {
        localStorage.setItem(OUTBOUND_COMPANY_PROFILE_KEY, JSON.stringify(outboundCompanyProfile));
    } catch (e) {
        console.warn('⚠️ ไม่สามารถบันทึกข้อมูลหัวบริษัทลง localStorage:', e);
    }
}

function updateOutboundLogoPreviewUI() {
    const previewImg = document.getElementById('outboundCompanyLogoPreviewImg');
    const placeholderEl = document.getElementById('outboundCompanyLogoPlaceholder');
    const removeBtn = document.getElementById('btnRemoveOutboundLogo');

    if (outboundCompanyProfile.logo_data_url) {
        if (previewImg) {
            previewImg.src = outboundCompanyProfile.logo_data_url;
            previewImg.style.display = 'block';
        }
        if (placeholderEl) placeholderEl.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
        if (previewImg) {
            previewImg.src = '';
            previewImg.style.display = 'none';
        }
        if (placeholderEl) placeholderEl.style.display = 'flex';
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function handleOutboundLogoUpload(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        if (typeof showToast === 'function') showToast('⚠️ กรุณาเลือกไฟล์รูปภาพ (PNG, JPG, WebP, SVG) เท่านั้น', true);
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const maxW = 340;
            const maxH = 120;
            let targetW = img.width || 200;
            let targetH = img.height || 80;

            if (targetW > maxW || targetH > maxH) {
                const ratio = Math.min(maxW / targetW, maxH / targetH);
                targetW = Math.round(targetW * ratio);
                targetH = Math.round(targetH * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, targetW, targetH);
            ctx.drawImage(img, 0, 0, targetW, targetH);

            const compressedDataUrl = canvas.toDataURL('image/png');
            saveOutboundCompanyProfile({ logo_data_url: compressedDataUrl });
            updateOutboundLogoPreviewUI();

            if (typeof showToast === 'function') {
                showToast('🖼️ อัปโหลดและบันทึกโลโก้หัวใบงานจ่ายสินค้าเรียบร้อยแล้ว');
            }
        };
        img.onerror = function () {
            if (typeof showToast === 'function') showToast('❌ ไม่สามารถอ่านไฟล์รูปภาพโลโก้ได้', true);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function removeOutboundCompanyLogo() {
    saveOutboundCompanyProfile({ logo_data_url: '' });
    const fileInput = document.getElementById('outboundCompanyLogoInput');
    if (fileInput) fileInput.value = '';
    updateOutboundLogoPreviewUI();
    if (typeof showToast === 'function') {
        showToast('🗑️ ลบรูปโลโก้หัวใบงานเรียบร้อยแล้ว');
    }
}

function getOutboundOperatorName() {
    if (typeof window !== 'undefined' && typeof window.getCurrentUserFullName === 'function') {
        const full = window.getCurrentUserFullName();
        if (full) return full;
    }
    try {
        const keys = ['WMS_CURRENT_USER', 'WMS_USER_SESSION', 'wms_user', 'currentUser'];
        for (const k of keys) {
            const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.full_name || parsed.fullName || parsed.name || parsed.username)) {
                return parsed.full_name || parsed.fullName || parsed.name || parsed.username;
            }
        }
    } catch (e) {}
    return 'เจ้าหน้าที่คลังสินค้า';
}

// 👑 ตรวจสอบสิทธิ์ผู้ดูแลระบบ (Admin) อย่างแม่นยำครอบคลุมทุกตัวแปรในระบบ
function checkOutboundUserIsAdmin() {
    try {
        if (typeof isWmsAdminStrict === 'function' && isWmsAdminStrict()) return true;
        if (typeof window !== 'undefined') {
            if (typeof window.isWmsAdminStrict === 'function' && window.isWmsAdminStrict()) return true;
            if (typeof window.isAdminUser === 'function' && window.isAdminUser()) return true;
            if (window.isAdmin === true || window.IS_ADMIN === true) return true;

            const directRole = String(
                window.currentUserRole ||
                window.userRole ||
                (window.currentUser && (window.currentUser.role || window.currentUser.user_role)) ||
                ''
            ).trim().toUpperCase();
            if (['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'OWNER', 'MANAGER', 'แอดมิน', 'ผู้ดูแลระบบ'].includes(directRole)) {
                return true;
            }
        }

        if (typeof currentUserRole !== 'undefined') {
            const r = String(currentUserRole || '').trim().toUpperCase();
            if (['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'OWNER', 'แอดมิน', 'ผู้ดูแลระบบ'].includes(r)) {
                return true;
            }
        }

        if (typeof currentUser !== 'undefined' && currentUser) {
            if (currentUser.is_admin === true || currentUser.isAdmin === true) return true;
            const r = String(currentUser.role || currentUser.user_role || '').trim().toUpperCase();
            if (['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'OWNER', 'แอดมิน', 'ผู้ดูแลระบบ'].includes(r)) {
                return true;
            }
        }

        const storageKeys = ['WMS_CURRENT_USER', 'WMS_USER_SESSION', 'wms_user', 'currentUser', 'wms_session'];
        for (const key of storageKeys) {
            const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (!raw) continue;
            try {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === 'object') {
                    if (obj.is_admin === true || obj.isAdmin === true) return true;
                    const roleVal = String(obj.role || obj.user_role || obj.userRole || obj.type || '').trim().toUpperCase();
                    if (['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'OWNER', 'แอดมิน', 'ผู้ดูแลระบบ'].includes(roleVal)) {
                        return true;
                    }
                }
            } catch (parseErr) {}
        }

        const simpleRole = String(
            localStorage.getItem('userRole') ||
            localStorage.getItem('WMS_USER_ROLE') ||
            sessionStorage.getItem('userRole') ||
            sessionStorage.getItem('WMS_USER_ROLE') ||
            ''
        ).trim().toUpperCase();
        if (['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'OWNER', 'แอดมิน', 'ผู้ดูแลระบบ'].includes(simpleRole)) {
            return true;
        }

        if (document.body && String(document.body.dataset.userRole || '').toUpperCase() === 'ADMIN') {
            return true;
        }
        const approvalMenu = document.getElementById('menuApprovalCenter') || document.getElementById('navApprovalCenter');
        if (approvalMenu && approvalMenu.style.display !== 'none' && !approvalMenu.classList.contains('hidden')) {
            if (approvalMenu.dataset.adminOnly === 'true') return true;
        }
    } catch (e) {}

    return false;
}

// 📦 ดึงชื่อรุ่น (Model Name) จากข้อมูลสินค้าอัตโนมัติ
function inferOutboundItemModel(item) {
    if (!item || typeof item !== 'object') return '-';
    const explicitModel = item.model || item.model_name || item.spec || item.variant || item.sku;
    if (explicitModel && String(explicitModel).trim() !== '' && String(explicitModel).trim() !== '-') {
        return String(explicitModel).trim();
    }
    return String(item.name || item.category || '-').trim();
}

// 📏 ดึงหน่วยนับ (Unit) จากข้อมูลสินค้าหรือหมวดหมู่
function inferOutboundItemUnit(item) {
    if (!item || typeof item !== 'object') return 'ชิ้น';
    const explicitUnit = item.unit || item.uom || item.unit_name;
    if (explicitUnit && String(explicitUnit).trim() !== '') {
        return String(explicitUnit).trim();
    }
    const text = `${item.category || ''} ${item.name || ''}`.toLowerCase();
    if (Number(item.meter) > 0 || text.includes('สาย') || text.includes('cable') || text.includes('wire') || text.includes('ม้วน')) {
        return 'ม้วน';
    }
    if (text.includes('ชุด') || text.includes('set') || text.includes('kit')) return 'ชุด';
    if (text.includes('กล่อง') || text.includes('box') || text.includes('ลัง')) return 'กล่อง';
    if (text.includes('เครื่อง') || text.includes('router') || text.includes('switch') || text.includes('onu') || text.includes('กล้อง') || text.includes('camera')) {
        return 'เครื่อง';
    }
    return 'ชิ้น';
}

function isItemActiveInStock(item) {
    if (!item || typeof item !== 'object') return false;
    const statusUpper = String(item.status || '').trim().toUpperCase();
    if (
        statusUpper === 'OUT' ||
        statusUpper === 'DISPATCHED' ||
        statusUpper === 'ISSUED' ||
        statusUpper === 'RELEASED' ||
        item.is_deleted === true ||
        (item.qty !== undefined && item.qty !== null && Number(item.qty) <= 0)
    ) {
        return false;
    }
    return true;
}

// ⚡ สร้างดัชนีสต็อกแบบ O(1) Map เพื่อค้นหา S/N ได้ใน 0.001ms แม้มีสินค้าหลายหมื่นชิ้น
function rebuildActiveStockIndex(force = false) {
    const invList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData) ? window.globalInventoryData : []);

    if (!force && invList === lastIndexedInventoryRef && invList.length === lastIndexedInventoryLen) {
        return activeStockBySnMap;
    }

    activeStockBySnMap.clear();
    for (let i = 0; i < invList.length; i++) {
        const item = invList[i];
        if (!isItemActiveInStock(item) || !item.sn) continue;
        const snUpper = String(item.sn).trim().toUpperCase();
        if (snUpper && !pendingFastOutboundSnSet.has(snUpper)) {
            activeStockBySnMap.set(snUpper, item);
        }
    }

    if (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList)) {
        for (let i = 0; i < recentInboundList.length; i++) {
            const inb = recentInboundList[i];
            if (!inb || !inb.sn) continue;
            const snUpper = String(inb.sn).trim().toUpperCase();
            if (snUpper && !pendingFastOutboundSnSet.has(snUpper) && !activeStockBySnMap.has(snUpper)) {
                activeStockBySnMap.set(snUpper, {
                    id: inb.id || null,
                    sn: inb.sn,
                    category: inb.category || 'ทั่วไป',
                    name: inb.name || 'สินค้าคลัง',
                    model: inb.model || inb.name || 'สินค้าคลัง',
                    unit: inb.unit || inferOutboundItemUnit(inb),
                    meter: inb.meter || 0,
                    location: inb.location || 'DOCK',
                    qty: 1,
                    status: 'IN_STOCK'
                });
            }
        }
    }

    lastIndexedInventoryRef = invList;
    lastIndexedInventoryLen = invList.length;
    return activeStockBySnMap;
}

function findActiveStockItemBySn(sn) {
    const snUpper = String(sn || '').trim().toUpperCase();
    if (!snUpper) return null;

    rebuildActiveStockIndex(false);
    const cached = activeStockBySnMap.get(snUpper);
    if (cached && isItemActiveInStock(cached)) {
        return cached;
    }

    const invList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData) ? window.globalInventoryData : []);

    for (let i = 0; i < invList.length; i++) {
        const item = invList[i];
        if (item && item.sn && String(item.sn).trim().toUpperCase() === snUpper && isItemActiveInStock(item)) {
            activeStockBySnMap.set(snUpper, item);
            return item;
        }
    }
    return null;
}

// ⚡ ตัดสต็อกและคืนพิกัดจัดเก็บในหน่วยความจำทันที (0ms Optimistic Memory Commit)
function markStockItemDispatchedInMemory(sn, dispatchMeta = {}) {
    const snUpper = String(sn || '').trim().toUpperCase();
    if (!snUpper) return null;

    const existingItem = findActiveStockItemBySn(snUpper);
    const freedLocation = existingItem && existingItem.location ? String(existingItem.location).trim().toUpperCase() : '';
    const itemId = existingItem ? existingItem.id : (dispatchMeta.id || null);

    pendingFastOutboundSnSet.add(snUpper);
    activeStockBySnMap.delete(snUpper);

    const invList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData) ? window.globalInventoryData : null);

    if (invList) {
        for (let i = 0; i < invList.length; i++) {
            const row = invList[i];
            if (row && row.sn && String(row.sn).trim().toUpperCase() === snUpper) {
                row.status = 'OUT';
                row.qty = 0;
                row.dispatched_by = dispatchMeta.dispatched_by || getOutboundOperatorName();
                row.dispatched_at = dispatchMeta.dispatched_at || new Date().toISOString();
                if (dispatchMeta.recipient) row.recipient = dispatchMeta.recipient;
                if (dispatchMeta.delivery_note_no) row.delivery_note_no = dispatchMeta.delivery_note_no;
            }
        }
        lastIndexedInventoryLen = invList.length;
    }

    if (typeof window !== 'undefined' && typeof window.purgeDispatchedOrDeletedItemFromMemory === 'function') {
        window.purgeDispatchedOrDeletedItemFromMemory(sn, itemId, freedLocation);
    }

    return {
        item: existingItem,
        freedLocation,
        itemId
    };
}

// 🔍 ค้นหาช่องกรอก S/N ของหน้าเบิกสินค้าออก
function getOutboundSnInputElement() {
    return document.getElementById('outboundSn') ||
           document.getElementById('outboundScanInput') ||
           document.getElementById('dispatchSnInput') ||
           document.querySelector('[data-role="outbound-sn-input"]');
}

function ensureOutboundSnInputFocus(force = false) {
    if (typeof isCameraScannerActive !== 'undefined' && isCameraScannerActive) return;
    const snInput = getOutboundSnInputElement();
    if (!snInput) return;

    const outboundSection = document.getElementById('outboundSection') ||
                            document.getElementById('tab-outbound') ||
                            snInput.closest('.tab-content, .page-section, section');
    if (outboundSection && (outboundSection.style.display === 'none' || outboundSection.classList.contains('hidden'))) {
        return;
    }

    const active = document.activeElement;
    const isOtherInputActive = active && active !== document.body && active !== snInput &&
        (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');

    if (!isOtherInputActive || force) {
        try {
            snInput.focus({ preventScroll: true });
        } catch (e) {
            snInput.focus();
        }
    }
}

// ⚡ แถบแสดงสถานะการสแกนเบิกออกทันทีตรงใต้ช่อง S/N (0ms Instant Outbound Box HUD)
function ensureOutboundInstantScanBoxIndicator() {
    let box = document.getElementById('outboundInstantScanIndicator');
    if (box) return box;

    const snInput = getOutboundSnInputElement();
    if (!snInput) return null;

    const targetHost = snInput.closest('.form-group, .input-group-wrapper, .field-box') || snInput.parentElement;
    if (!targetHost) return null;

    const isAdmin = checkOutboundUserIsAdmin();
    const roleBadge = isAdmin
        ? `<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:99px; font-size:0.71rem; font-weight:800;">👑 สิทธิ์ Admin: ตัดสต็อกได้ทันที</span>`
        : `<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:99px; font-size:0.71rem; font-weight:800;">👤 สิทธิ์ผู้ใช้งาน: ส่งคำขออนุมัติก่อนตัดสต็อก</span>`;

    box = document.createElement('div');
    box.id = 'outboundInstantScanIndicator';
    box.className = 'wms-instant-scan-box ready';
    box.innerHTML = `
        <div class="wms-instant-scan-left">
            <span class="pulse-live-dot"></span>
            <span class="wms-instant-scan-msg">พร้อมยิงสแกน S/N เข้าใบงานจ่ายสินค้าออกจากคลัง</span>
        </div>
        <div class="wms-instant-scan-right" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            ${roleBadge}
            <span id="outboundInstantQueuePill" class="wms-instant-queue-pill idle">คิวเบิก DB: 0</span>
        </div>
    `;

    targetHost.appendChild(box);
    return box;
}

function renderOutboundInstantScanBoxStatus(statusType = 'success', snText = '', itemName = '', freedLocation = '', queueRemaining = 0, speedPerSec = 0) {
    const box = ensureOutboundInstantScanBoxIndicator();
    if (!box) return;

    const pendingCount = typeof queueRemaining === 'number' ? queueRemaining : persistentOutboundDbQueue.length;
    const safeSn = escapeOutboundHTML(snText);
    const safeName = itemName ? escapeOutboundHTML(itemName) : '';
    const safeLoc = freedLocation ? escapeOutboundHTML(formatOutboundLocationText(freedLocation)) : '';
    const speedHtml = speedPerSec > 1 ? `<span class="wms-instant-speed-pill">⚡ ${speedPerSec} ชิ้น/วิ</span>` : '';

    const isAdmin = checkOutboundUserIsAdmin();
    const roleBadge = isAdmin
        ? `<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:99px; font-size:0.7rem; font-weight:800;">👑 Admin</span>`
        : `<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:99px; font-size:0.7rem; font-weight:800;">👤 รออนุมัติ</span>`;

    const queueBadgeHtml = pendingCount > 0
        ? `<span id="outboundInstantQueuePill" class="wms-instant-queue-pill syncing" onclick="flushPersistentOutboundSyncQueue(true)" style="cursor:pointer;" title="คลิกเพื่อซิงค์ทันที"><i class="fa-solid fa-arrows-rotate fa-spin"></i> คิว DB: ${pendingCount.toLocaleString()}</span>`
        : `<span id="outboundInstantQueuePill" class="wms-instant-queue-pill synced"><i class="fa-solid fa-check"></i> DB ครบตามคิว</span>`;

    box.classList.remove('ready', 'success', 'synced', 'duplicate', 'error', 'pop');
    void box.offsetWidth;

    if (statusType === 'cart_added') {
        box.classList.add('success', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-left">
                <i class="fa-solid fa-cart-plus" style="color:#059669; flex-shrink:0;"></i>
                <span class="wms-instant-scan-msg">
                    เพิ่มลงใบงานแล้ว: <strong class="mono">${safeSn}</strong>
                    ${safeName ? `<span style="color:#065f46; font-weight:600;">(${safeName})</span>` : ''}
                    ${safeLoc ? `<span class="wms-instant-loc-tag">📍 พิกัด: ${safeLoc}</span>` : ''}
                </span>
            </div>
            <div class="wms-instant-scan-right" style="display:flex; align-items:center; gap:6px;">
                ${roleBadge}
                ${speedHtml}
                ${queueBadgeHtml}
            </div>
        `;
    } else if (statusType === 'success') {
        box.classList.add('success', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-left">
                <i class="fa-solid fa-bolt" style="color:#059669; flex-shrink:0;"></i>
                <span class="wms-instant-scan-msg">
                    ตัดจ่ายออกจากคลังแล้ว: <strong class="mono">${safeSn}</strong>
                    ${safeName ? `<span style="color:#065f46; font-weight:600;">(${safeName})</span>` : ''}
                    ${safeLoc ? `<span class="wms-instant-loc-tag">🔓 คืนพิกัด: ${safeLoc}</span>` : ''}
                </span>
            </div>
            <div class="wms-instant-scan-right" style="display:flex; align-items:center; gap:6px;">
                ${roleBadge}
                ${speedHtml}
                ${queueBadgeHtml}
            </div>
        `;
    } else if (statusType === 'synced') {
        box.classList.add('synced');
        const rightEl = box.querySelector('.wms-instant-scan-right');
        if (rightEl) {
            rightEl.innerHTML = `${roleBadge}${speedHtml}${queueBadgeHtml}`;
        }
    } else if (statusType === 'duplicate') {
        box.classList.add('duplicate', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-left">
                <i class="fa-solid fa-ban" style="color:#dc2626; flex-shrink:0;"></i>
                <span class="wms-instant-scan-msg">ข้าม S/N ซ้ำ: <strong class="mono">${safeSn}</strong> (อยู่ในรายการเบิกจ่ายแล้ว)</span>
            </div>
            <div class="wms-instant-scan-right" style="display:flex; align-items:center; gap:6px;">
                ${roleBadge}
                ${queueBadgeHtml}
            </div>
        `;
    } else if (statusType === 'not_found') {
        box.classList.add('error', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-left">
                <i class="fa-solid fa-circle-xmark" style="color:#dc2626; flex-shrink:0;"></i>
                <span class="wms-instant-scan-msg">ไม่พบ S/N: <strong class="mono">${safeSn}</strong> ในสต็อกคงเหลือ (หรือถูกจ่ายออกไปแล้ว)</span>
            </div>
            <div class="wms-instant-scan-right" style="display:flex; align-items:center; gap:6px;">
                ${roleBadge}
                ${queueBadgeHtml}
            </div>
        `;
    } else {
        box.classList.add('error', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-left">
                <i class="fa-solid fa-circle-exclamation" style="color:#dc2626; flex-shrink:0;"></i>
                <span class="wms-instant-scan-msg">${safeSn || 'เกิดข้อผิดพลาดในการสแกนเบิกสินค้าออก'}</span>
            </div>
            <div class="wms-instant-scan-right" style="display:flex; align-items:center; gap:6px;">
                ${roleBadge}
                ${queueBadgeHtml}
            </div>
        `;
    }
}

function injectOutboundModernStyles() {
    if (document.getElementById('outboundFastScanModernStyles')) return;
    const style = document.createElement('style');
    style.id = 'outboundFastScanModernStyles';
    style.textContent = `
        .outbound-feed-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 12px;
        }
        .outbound-feed-card {
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 14px;
            padding: 13px 15px;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
            display: flex;
            flex-direction: column;
            gap: 8px;
            transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .outbound-feed-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
            border-color: #93c5fd;
        }
        .outbound-status-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 9px;
            border-radius: 99px;
            font-size: 0.7rem;
            font-weight: 800;
        }
        .outbound-status-pill.synced {
            background: #d1fae5;
            color: #065f46;
        }
        .outbound-status-pill.syncing {
            background: #dbeafe;
            color: #1d4ed8;
        }
        .outbound-status-pill.pending {
            background: #ffedd5;
            color: #9a3412;
        }
        .outbound-header-config-box {
            background: var(--bg-subtle, #f8fafc);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 12px;
            padding: 12px 14px;
            margin-bottom: 12px;
        }
        .outbound-header-config-grid {
            display: grid;
            grid-template-columns: 165px 1fr;
            gap: 12px;
            align-items: start;
        }
        .outbound-logo-dropzone {
            border: 1.5px dashed #94a3b8;
            border-radius: 10px;
            background: #ffffff;
            padding: 8px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 92px;
            gap: 6px;
        }
        .outbound-wo-field-label {
            display: block;
            font-size: 0.73rem;
            font-weight: 700;
            color: var(--text-sub, #475569);
            margin-bottom: 3px;
        }
        .outbound-wo-input-inline {
            width: 100%;
            padding: 5px 8px;
            border: 1px solid var(--border-color, #cbd5e1);
            border-radius: 7px;
            font-size: 0.8rem;
            background: var(--bg-surface, #ffffff);
            color: var(--text-main, #0f172a);
        }
        .outbound-wo-input-inline:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }
        .outbound-signature-box-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
            gap: 12px;
            margin-top: 12px;
            padding: 12px;
            background: var(--bg-subtle, #f8fafc);
            border: 1px dashed var(--border-color, #cbd5e1);
            border-radius: 12px;
        }
        .outbound-sig-card {
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 10px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .outbound-sig-canvas {
            width: 100%;
            height: 76px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #ffffff;
            cursor: crosshair;
            touch-action: none;
        }
        .outbound-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(3px);
            z-index: 99990;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        }
        .outbound-modal-sheet {
            background: #ffffff;
            color: #0f172a;
            width: 100%;
            max-width: 920px;
            max-height: 92vh;
            overflow-y: auto;
            border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
            padding: 24px;
        }
        @media (max-width: 768px) {
            .outbound-header-config-grid {
                grid-template-columns: 1fr;
            }
            #outboundSn,
            #outboundScanInput,
            #dispatchSnInput,
            #outboundRecipient,
            #outboundNote,
            #stockSearchInput {
                font-size: 16px !important;
                min-height: 44px;
            }
            .outbound-feed-grid {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.appendChild(style);
}