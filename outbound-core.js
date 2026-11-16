// =========================================================================
// --- MODULE 4.1: OUTBOUND CORE STATE, O(1) STOCK INDEX & INSTANT HUD ---
// --- 0ms Lookup Engine, Singleton Audio, Slot Release & Status Box ---
// =========================================================================

let recentOutboundList = [];
const outboundScanQueue = [];
let isProcessingOutboundQueue = false;

// ⚡ 0ms Synchronous Lock & O(1) Stock Index (รองรับสต็อก 3,500+ รายการโดยไม่หน่วง)
const pendingFastOutboundSnSet = new Set();
const activeStockBySnMap = new Map();
let lastIndexedInventoryRef = null;
let lastIndexedInventoryLen = -1;

// 🚀 Persistent Offline-First FIFO Queue สำหรับงานเบิกออก
const PERSISTENT_OUTBOUND_QUEUE_KEY = 'WMS_PERSISTENT_OUTBOUND_SYNC_QUEUE';
const RECENT_OUTBOUND_CACHE_KEY = 'WMS_RECENT_OUTBOUND_FEED_CACHE';
let persistentOutboundDbQueue = [];
let isFlushingOutboundDbQueue = false;
let outboundSyncSequenceCounter = Date.now();
let outboundNetworkMonitorTimer = null;

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
            gain.gain.setValueAtTime(0.12, now);
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
            gain.gain.setValueAtTime(0.15, now);
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

function getOutboundOperatorName() {
    if (typeof window !== 'undefined' && typeof window.getCurrentUserFullName === 'function') {
        return window.getCurrentUserFullName();
    }
    return 'เจ้าหน้าที่คลังสินค้า';
}

function isItemActiveInStock(item) {
    if (!item || typeof item !== 'object') return false;
    const statusUpper = String(item.status || '').toUpperCase();
    if (
        statusUpper === 'OUT' ||
        statusUpper === 'DISPATCHED' ||
        statusUpper === 'ISSUED' ||
        statusUpper === 'RELEASED' ||
        item.is_deleted ||
        Number(item.qty) <= 0
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

    // รวมรายการที่เพิ่งสแกนรับเข้าในเครื่องเดียวกันแต่ยังรอซิงค์เข้า DB (เบิกออกต่อได้ทันที!)
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

    // Fallback: สแกนหาใน globalInventoryData เผื่อมีการอัปเดตอาเรย์โดยไม่เปลี่ยน reference
    const invList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : [];
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

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        for (let i = 0; i < globalInventoryData.length; i++) {
            const row = globalInventoryData[i];
            if (row && row.sn && String(row.sn).trim().toUpperCase() === snUpper) {
                row.status = 'OUT';
                row.qty = 0;
                row.dispatched_by = dispatchMeta.dispatched_by || getOutboundOperatorName();
                row.dispatched_at = dispatchMeta.dispatched_at || new Date().toISOString();
                if (dispatchMeta.recipient) row.recipient = dispatchMeta.recipient;
            }
        }
        lastIndexedInventoryLen = globalInventoryData.length;
    }

    // คืนพิกัดจัดเก็บให้หน้างานรับเข้าคลัง (Inbound) ทันที 0ms
    if (typeof window !== 'undefined' && typeof window.purgeDispatchedOrDeletedItemFromMemory === 'function') {
        window.purgeDispatchedOrDeletedItemFromMemory(sn, itemId, freedLocation);
    }

    return {
        item: existingItem,
        freedLocation,
        itemId
    };
}

// 🔍 ค้นหาช่องกรอก S/N ของหน้าเบิกสินค้าออก (รองรับหลายชื่อ ID ตามโครงสร้าง HTML)
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

    box = document.createElement('div');
    box.id = 'outboundInstantScanIndicator';
    box.className = 'wms-instant-scan-box ready';
    box.innerHTML = `
        <div class="wms-instant-scan-left">
            <span class="pulse-live-dot"></span>
            <span class="wms-instant-scan-msg">พร้อมยิงสแกนเบิกสินค้าออกความเร็วสูง (ตัดสต็อกหน้าเว็บทันที + รันคิวเข้า DB ตามลำดับ)</span>
        </div>
        <div class="wms-instant-scan-right">
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

    const queueBadgeHtml = pendingCount > 0
        ? `<span id="outboundInstantQueuePill" class="wms-instant-queue-pill syncing"><i class="fa-solid fa-arrows-rotate fa-spin"></i> รันคิวเข้า DB: ${pendingCount.toLocaleString()}</span>`
        : `<span id="outboundInstantQueuePill" class="wms-instant-queue-pill synced"><i class="fa-solid fa-check"></i> DB ครบตามคิว</span>`;

    box.classList.remove('ready', 'success', 'synced', 'duplicate', 'error', 'pop');
    void box.offsetWidth;

    if (statusType === 'success') {
        box.classList.add('success', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-left">
                <i class="fa-solid fa-bolt" style="color:#059669; flex-shrink:0;"></i>
                <span class="wms-instant-scan-msg">
                    เบิกออกหน้าเว็บแล้ว: <strong class="mono">${safeSn}</strong>
                    ${safeName ? `<span style="color:#065f46; font-weight:600;">(${safeName})</span>` : ''}
                    ${safeLoc ? `<span class="wms-instant-loc-tag">🔓 คืนพิกัด: ${safeLoc}</span>` : ''}
                </span>
            </div>
            <div class="wms-instant-scan-right">
                ${speedHtml}
                ${queueBadgeHtml}
            </div>
        `;
    } else if (statusType === 'synced') {
        box.classList.add('synced');
        const rightEl = box.querySelector('.wms-instant-scan-right');
        if (rightEl) {
            rightEl.innerHTML = `${speedHtml}${queueBadgeHtml}`;
        }
    } else if (statusType === 'duplicate') {
        box.classList.add('duplicate', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-left">
                <i class="fa-solid fa-ban" style="color:#dc2626; flex-shrink:0;"></i>
                <span class="wms-instant-scan-msg">ข้าม S/N ซ้ำ: <strong class="mono">${safeSn}</strong> (ถูกสแกนเบิกออกไปแล้ว)</span>
            </div>
            <div class="wms-instant-scan-right">
                ${queueBadgeHtml}
            </div>
        `;
    } else if (statusType === 'not_found') {
        box.classList.add('error', 'pop');
        box.innerHTML = `
            <div class="wms-instant-scan-left">
                <i class="fa-solid fa-circle-xmark" style="color:#dc2626; flex-shrink:0;"></i>
                <span class="wms-instant-scan-msg">ไม่พบ S/N: <strong class="mono">${safeSn}</strong> ในสต็อกคงเหลือ (หรือถูกเบิกออกไปแล้ว)</span>
            </div>
            <div class="wms-instant-scan-right">
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
            <div class="wms-instant-scan-right">
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
            grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
            gap: 10px;
        }
        .outbound-feed-card {
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 14px;
            padding: 12px 14px;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
            display: flex;
            flex-direction: column;
            gap: 7px;
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
            padding: 2px 8px;
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
        .stock-quick-dispatch-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            padding: 10px 14px;
            border-radius: 12px;
            margin-bottom: 12px;
            background: linear-gradient(135deg, #f8fafc, #f1f5f9);
            border: 1px solid var(--border-color, #cbd5e1);
            transition: all 0.2s ease;
        }
        .stock-quick-dispatch-banner.active {
            background: linear-gradient(135deg, #fff1f2, #ffe4e6);
            border-color: #fda4af;
        }
        .stock-row-flash-match {
            animation: stockMatchPulse 0.45s ease;
        }
        @keyframes stockMatchPulse {
            0% { background-color: rgba(16, 185, 129, 0.28); }
            100% { background-color: transparent; }
        }
        @media (max-width: 768px) {
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