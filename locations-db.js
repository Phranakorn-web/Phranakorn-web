// =========================================================================
// --- MODULE: REALTIME WAREHOUSE ZONE & INVENTORY LINKING ENGINE (v29.0) ---
// --- CLICK-TRIGGERED AISLE SUMMARY POPUP (NO HOVER AUTO-POPUP)         ---
// --- FULL SYNC WITH STOCK CHECK & INBOUND (INV/PO, TOMBSTONE, ACTIONS) ---
// --- ENTERPRISE MODEL PICKING SEARCH & MOBILE SAFE-AREA 100% PARITY    ---
// --- ZERO-LAG INSTANT VIEW SWITCHING & HIGH-PERFORMANCE AISLE ENGINE   ---
// --- FULL PARITY FOR macOS, WINDOWS, iOS, ANDROID & GITHUB PAGES       ---
// =========================================================================

// 🛡️ 1. Safe Escape HTML Helper (XSS Protection 100%)
if (typeof window.escapeHTML !== 'function') {
    window.escapeHTML = function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
}

// 🛡️ 1.1 Safe Attribute JS String Escaper (ป้องกันชื่อรุ่นที่มีเครื่องหมาย ' หรือ " ทำปุ่มคลิกพัง)
function escapeAttrJs(str) {
    if (str === null || str === undefined) return '';
    return window.escapeHTML(
        String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r?\n/g, ' ')
    );
}

// 🛡️ 2. Safe Copy Text Helper Fallback
if (typeof window.copyTextToClipboard !== 'function') {
    window.copyTextToClipboard = function(text, label = 'ข้อความ') {
        if (!text) return;
        const safeText = String(text).trim();
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(safeText).then(() => {
                if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} แล้ว: ${safeText}`);
                else alert(`คัดลอก ${label} แล้ว: ${safeText}`);
            }).catch(() => {
                fallbackCopyText(safeText, label);
            });
        } else {
            fallbackCopyText(safeText, label);
        }
    };

    function fallbackCopyText(text, label) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            if (typeof showToast === 'function') showToast(`📋 คัดลอก ${label} แล้ว: ${text}`);
            else alert(`คัดลอก ${label} แล้ว: ${text}`);
        } catch (err) {
            console.error('Fallback Copy Error:', err);
        }
        document.body.removeChild(textArea);
    }
}

// 🎨 3. Auto-Inject Self-Contained Responsive Styles (ทำงานสมบูรณ์ 100% ทุก OS และมือถือ)
(function injectLocationVisualizerStyles() {
    if (typeof document === 'undefined') return;
    const oldStyle = document.getElementById('wmsLocationsDbV26Styles');
    if (oldStyle) oldStyle.remove();
    const prevV27Style = document.getElementById('wmsLocationsDbV27Styles');
    if (prevV27Style) prevV27Style.remove();
    if (document.getElementById('wmsLocationsDbV29Styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'wmsLocationsDbV29Styles';
    styleEl.textContent = `
        #aisleSummaryOverlay {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            height: 100dvh;
            z-index: 9850;
            background: rgba(15, 23, 42, 0.68);
            display: none;
            align-items: center;
            justify-content: center;
            padding: max(12px, env(safe-area-inset-top, 12px)) max(12px, env(safe-area-inset-right, 12px)) max(12px, env(safe-area-inset-bottom, 12px)) max(12px, env(safe-area-inset-left, 12px));
            box-sizing: border-box;
        }
        #aisleHoverSummaryPopover {
            width: 100%;
            max-width: 580px;
            max-height: calc(100vh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background: var(--bg-surface, #ffffff);
            color: var(--text-main, #0f172a);
            border: 1.5px solid var(--primary, #0284c7);
            border-radius: 20px;
            box-shadow: 0 24px 56px -12px rgba(15, 23, 42, 0.42), 0 0 0 1px rgba(2, 132, 199, 0.16);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: wmsSummaryModalPopIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
            box-sizing: border-box;
        }
        @keyframes wmsSummaryModalPopIn {
            from { opacity: 0; transform: translateY(8px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .wms-popover-scroll-list {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 9px;
            -webkit-overflow-scrolling: touch;
        }
        .wms-popover-model-row {
            background: var(--bg-subtle, #f8fafc);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 12px;
            padding: 10px 12px;
            cursor: pointer;
            transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .wms-popover-model-row:hover {
            border-color: var(--primary, #0284c7);
            background: var(--primary-light, rgba(2, 132, 199, 0.08));
            transform: translateX(2px);
        }
        .wms-popover-model-row.is-matched {
            border-color: var(--primary, #0284c7);
            background: rgba(2, 132, 199, 0.1);
            box-shadow: 0 2px 10px rgba(2, 132, 199, 0.14);
        }
        .wms-summary-footer-bar {
            flex-shrink: 0;
            padding: 11px 14px calc(11px + env(safe-area-inset-bottom, 0px)) 14px;
            background: var(--bg-subtle, #f8fafc);
            border-top: 1px solid var(--border-color, #e2e8f0);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
        }
        .wms-global-model-dropdown {
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            right: 0;
            min-width: 310px;
            max-width: min(480px, 92vw);
            max-height: 360px;
            overflow-y: auto;
            background: var(--bg-surface, #ffffff);
            border: 1.5px solid var(--primary-border, #93c5fd);
            border-radius: 14px;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
            z-index: 1200;
            display: none;
            -webkit-overflow-scrolling: touch;
        }
        .wms-global-model-dropdown.is-open {
            display: block;
        }
        .wms-model-suggest-item {
            padding: 9px 12px;
            border-bottom: 1px solid var(--border-color, #e2e8f0);
            cursor: pointer;
            transition: background 0.13s ease;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .wms-model-suggest-item:last-child {
            border-bottom: none;
        }
        .wms-model-suggest-item:hover {
            background: var(--primary-light, rgba(2, 132, 199, 0.1));
        }
        .wms-picking-route-banner {
            background: linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%);
            border: 1.5px solid var(--primary-border, rgba(2, 132, 199, 0.35));
            border-radius: 14px;
            padding: 12px 15px;
            margin-bottom: 14px;
            display: flex;
            flex-direction: column;
            gap: 9px;
        }
        .wms-modal-summary-chip {
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 11px;
            padding: 8px 12px;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            flex-direction: column;
            gap: 3px;
            min-width: 205px;
            max-width: 290px;
            flex: 1 1 210px;
        }
        .wms-modal-summary-chip:hover {
            border-color: var(--primary, #0284c7);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.12);
        }
        .wms-modal-summary-chip.is-active {
            border: 2px solid var(--primary, #0284c7);
            background: var(--primary-light, rgba(2, 132, 199, 0.1));
        }
        .wms-loc-doc-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 7px;
            border-radius: 6px;
            font-size: 0.72rem;
            font-weight: 700;
            font-family: monospace;
            cursor: pointer;
            border: 1px solid transparent;
            white-space: nowrap;
        }
        .wms-loc-doc-badge--inv {
            background: #eff6ff;
            border-color: #bfdbfe;
            color: #1d4ed8;
        }
        .wms-loc-doc-badge--po {
            background: #f0fdf4;
            border-color: #bbf7d0;
            color: #15803d;
        }
        [data-theme="dark"] .wms-loc-doc-badge--inv,
        .dark-mode .wms-loc-doc-badge--inv {
            background: rgba(37, 99, 235, 0.2);
            border-color: rgba(96, 165, 250, 0.35);
            color: #93c5fd;
        }
        [data-theme="dark"] .wms-loc-doc-badge--po,
        .dark-mode .wms-loc-doc-badge--po {
            background: rgba(22, 163, 74, 0.2);
            border-color: rgba(74, 222, 128, 0.35);
            color: #86efac;
        }
        .wms-staging-strip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px 14px;
            padding: 9px 14px;
            margin-bottom: 12px;
            border-radius: 12px;
            background: var(--bg-subtle, #f8fafc);
            border: 1px solid var(--border-color, #e2e8f0);
            font-size: 0.8rem;
        }
        .wms-loc-action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 5px 9px;
            border-radius: 8px;
            font-size: 0.76rem;
            font-weight: 700;
            cursor: pointer;
            border: 1px solid var(--border-strong, #cbd5e1);
            background: var(--bg-surface, #ffffff);
            color: var(--text-main, #0f172a);
            white-space: nowrap;
        }
        .wms-loc-action-btn:hover {
            border-color: var(--primary, #0284c7);
            color: var(--primary, #0284c7);
        }
        .wms-loc-action-btn--danger:hover {
            border-color: #dc2626;
            color: #dc2626;
            background: rgba(220, 38, 38, 0.08);
        }
        @media (max-width: 768px) {
            #aisleSummaryOverlay {
                padding: max(8px, env(safe-area-inset-top, 8px)) 8px max(8px, env(safe-area-inset-bottom, 8px)) 8px;
            }
            #aisleHoverSummaryPopover {
                max-width: 100%;
                max-height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
                border-radius: 16px;
            }
            #aisleSummarySearchInput,
            #globalLocProductSearchInput,
            #aisleNameSearchInput,
            #aisleModalSearchInput {
                font-size: 16px !important;
            }
            #globalLocSearchAutocompleteWrap,
            #globalLocProductSearchInput,
            #aisleNameSearchInput {
                width: 100% !important;
                min-width: 0 !important;
            }
            .wms-global-model-dropdown {
                min-width: 100%;
                max-width: 100%;
            }
        }
    `;
    document.head.appendChild(styleEl);
})();

// -------------------------------------------------------------------------
// ตัวแปรควบคุมสถานะส่วนกลาง (State Management)
// -------------------------------------------------------------------------
let activeLocationAisle = ''; 
let activeLocationBay = 'ALL';
let aisleSnSearchQuery = '';
let activePrintBarcodeSn = null;
let activeBarcodeSize = '50x30';

// ฟีเจอร์กรองค้นหาชื่อแถว และ ตัวกรองประเภทแถวโครงสร้าง
let aisleFilterSearchQuery = '';
let activeAisleZoneFilter = 'ALL'; // 'ALL', 'MAIN', 'AUXILIARY'

// ฟีเจอร์เสริม: ตัวกรองความหนาแน่น, การเรียงลำดับ และค้นหารุ่น/รหัสสินค้า/INV/PO/SN ข้ามทุกแถว
let activeAisleDensityFilter = 'ALL'; // 'ALL', 'LOW', 'MEDIUM', 'HIGH', 'FULL'
let activeAisleSortMode = 'DEFAULT'; // 'DEFAULT', 'DENSITY_DESC', 'AVAILABLE_DESC', 'MATCH_DESC'
let globalLocationProductQuery = '';

// สถานะสำหรับป๊อปอัปสรุปยอดเมื่อกดปุ่มสรุปยอด (Click-Triggered Only)
let activeSummaryPopupAisle = '';
let activeHoverPopoverTab = 'MODEL'; // 'MODEL' | 'SKU'
let summaryPopoverSearchQuery = '';
let activeModalSummaryTab = 'MODEL'; // 'MODEL' | 'SKU'
let activeModalDocFilter = 'ALL'; // 'ALL' | 'HAS_INV' | 'HAS_PO'
let isGlobalModelDropdownOpen = false;
let activeDetailModalState = {
    aisleName: '',
    filterQuery: '',
    bayFilter: 'ALL'
};

// Cache ความหนาแน่นรวมคลังสินค้าสำหรับการประมวลผลเบื้องหลัง
let cachedWarehouseStats = null;
let isBackgroundPrecalculating = false;

// ⚡ High-Speed Memoization & Single-Pass O(N) Inventory Index
const parsedLocationCache = new Map();
const extractedAisleCache = new Map();
const aisleModelSummaryCache = new Map();
let globalCatalogSummaryCache = {
    signature: '',
    models: [],
    skus: []
};
let indexedInventoryCache = {
    signature: '',
    byAisle: new Map(),
    dockItems: [],
    officeItems: [],
    pendingItems: [],
    totalItems: 0
};

// ⚡ Zero-Flicker Smart DOM Update Cache
const lastRenderedHTML = new Map();

// -------------------------------------------------------------------------
// 🔗 Shared Helpers with inv-core-sync.js (INV, PO & Tombstone Compatibility)
// -------------------------------------------------------------------------
function isLocationItemDeletedTombstone(sn) {
    if (!sn) return false;
    if (typeof window.isSnInTombstone === 'function') {
        return window.isSnInTombstone(sn);
    }
    return false;
}

function resolveLocationItemInvNo(item) {
    if (!item || typeof item !== 'object') return '';
    if (typeof window.resolveItemInvNo === 'function') {
        return window.resolveItemInvNo(item);
    }
    const direct = item.inv_no ?? item.invoice_no ?? item.tax_invoice_no ?? item.tax_inv_no ?? item.inv_number ?? item.inv ?? '';
    const clean = String(direct ?? '').trim();
    if (clean && clean !== '-' && clean.toLowerCase() !== 'null' && clean.toLowerCase() !== 'undefined') {
        return clean;
    }
    return '';
}

function resolveLocationItemPoNo(item) {
    if (!item || typeof item !== 'object') return '';
    if (typeof window.resolveItemPoNo === 'function') {
        return window.resolveItemPoNo(item);
    }
    const direct = item.po_no ?? item.po_number ?? item.purchase_order ?? item.purchase_order_no ?? item.po ?? '';
    const clean = String(direct ?? '').trim();
    if (clean && clean !== '-' && clean.toLowerCase() !== 'null' && clean.toLowerCase() !== 'undefined') {
        return clean;
    }
    return '';
}

function renderLocationDocBadgesHTML(invNo, poNo) {
    if (typeof window.renderInvPoBadgesHTML === 'function') {
        return window.renderInvPoBadgesHTML(invNo, poNo, true);
    }
    const cleanInv = String(invNo || '').trim();
    const cleanPo = String(poNo || '').trim();
    if (!cleanInv && !cleanPo) {
        return `<span style="font-size:0.74rem; color:var(--text-muted, #94a3b8);">-</span>`;
    }
    const parts = [];
    if (cleanInv) {
        parts.push(`<span class="wms-loc-doc-badge wms-loc-doc-badge--inv" onclick="event.stopPropagation(); copyTextToClipboard('${escapeAttrJs(cleanInv)}', 'เลขที่ใบกำกับภาษี (INV)')" title="คลิกคัดลอก INV: ${window.escapeHTML(cleanInv)}">INV: ${window.escapeHTML(cleanInv)}</span>`);
    }
    if (cleanPo) {
        parts.push(`<span class="wms-loc-doc-badge wms-loc-doc-badge--po" onclick="event.stopPropagation(); copyTextToClipboard('${escapeAttrJs(cleanPo)}', 'เลขที่ใบสั่งซื้อ (PO)')" title="คลิกคัดลอก PO: ${window.escapeHTML(cleanPo)}">PO: ${window.escapeHTML(cleanPo)}</span>`);
    }
    return `<div style="display:flex; flex-wrap:wrap; gap:4px;">${parts.join('')}</div>`;
}

// -------------------------------------------------------------------------
// ⚡ High-Speed Indexer: จัดดัชนีสต็อกรายแถวในรอบเดียว O(N) (เร็วขึ้น 50x+)
// -------------------------------------------------------------------------
function getInventoryIndexSignature(inventory) {
    const len = inventory.length;
    if (len === 0) return '0';
    const first = inventory[0];
    const mid = inventory[Math.floor(len / 2)];
    const last = inventory[len - 1];
    return `${len}|${first?.sn || ''}:${first?.location || ''}:${first?.name || ''}:${first?.inv_no || ''}:${first?.po_no || ''}|${mid?.sn || ''}:${mid?.location || ''}:${mid?.name || ''}|${last?.sn || ''}:${last?.location || ''}:${last?.name || ''}`;
}

function getIndexedInventoryByAisle() {
    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const sig = getInventoryIndexSignature(inventory);

    if (indexedInventoryCache.signature === sig && (indexedInventoryCache.byAisle.size > 0 || indexedInventoryCache.dockItems.length > 0 || indexedInventoryCache.officeItems.length > 0)) {
        return indexedInventoryCache.byAisle;
    }

    const byAisle = new Map();
    const dockItems = [];
    const officeItems = [];
    const pendingItems = [];
    let validCount = 0;

    for (let i = 0; i < inventory.length; i++) {
        const item = inventory[i];
        if (!item || !item.location) continue;
        if (isLocationItemDeletedTombstone(item.sn)) continue;

        validCount++;
        const parsed = parseLocationComponents(item.location);
        const keyUpper = parsed.aisle.toUpperCase();

        if (keyUpper === 'DOCK') {
            dockItems.push(item);
        } else if (keyUpper === 'OFFICE') {
            officeItems.push(item);
        } else if (keyUpper === 'PENDING') {
            pendingItems.push(item);
        }

        if (!byAisle.has(keyUpper)) {
            byAisle.set(keyUpper, []);
        }
        byAisle.get(keyUpper).push(item);
    }

    indexedInventoryCache = {
        signature: sig,
        byAisle,
        dockItems,
        officeItems,
        pendingItems,
        totalItems: validCount
    };
    aisleModelSummaryCache.clear();
    globalCatalogSummaryCache.signature = '';
    return byAisle;
}

function invalidateLocationCaches() {
    indexedInventoryCache.signature = '';
    indexedInventoryCache.byAisle.clear();
    indexedInventoryCache.dockItems = [];
    indexedInventoryCache.officeItems = [];
    indexedInventoryCache.pendingItems = [];
    parsedLocationCache.clear();
    extractedAisleCache.clear();
    aisleModelSummaryCache.clear();
    globalCatalogSummaryCache.signature = '';
    globalCatalogSummaryCache.models = [];
    globalCatalogSummaryCache.skus = [];
}

// -------------------------------------------------------------------------
// 📦 Helper ดึงรหัสสินค้า / SKU และชื่อรุ่นมาตรฐาน
// -------------------------------------------------------------------------
function resolveItemProductCode(item) {
    if (!item) return 'ทั่วไป';
    const code = item.sku || item.product_code || item.code || item.category || 'ทั่วไป';
    return String(code).trim() || 'ทั่วไป';
}

function resolveItemModelName(item) {
    if (!item) return 'ไม่ระบุชื่อรุ่น';
    return String(item.name || 'ไม่ระบุชื่อรุ่น').trim() || 'ไม่ระบุชื่อรุ่น';
}

function compareLocationsNaturally(locA, locB) {
    const pA = parseLocationComponents(locA);
    const pB = parseLocationComponents(locB);
    if (pA.aisle !== pB.aisle) return pA.aisle.localeCompare(pB.aisle, 'en', { numeric: true });
    const bayDiff = (parseInt(pA.bay, 10) || 0) - (parseInt(pB.bay, 10) || 0);
    if (bayDiff !== 0) return bayDiff;
    const shelfDiff = (parseInt(pA.shelf, 10) || 0) - (parseInt(pB.shelf, 10) || 0);
    if (shelfDiff !== 0) return shelfDiff;
    return (parseInt(pA.slot, 10) || 0) - (parseInt(pB.slot, 10) || 0);
}

// -------------------------------------------------------------------------
// 📊 High-Speed Model, SKU & INV/PO Breakdown Engine (รายแถว & ทั้งคลัง)
// -------------------------------------------------------------------------
function getAisleModelBreakdown(aisleName) {
    const targetAisle = String(aisleName || '').trim();
    const keyUpper = targetAisle.toUpperCase();
    const byAisle = getIndexedInventoryByAisle();
    const cacheKey = `${indexedInventoryCache.signature}::${keyUpper}`;

    if (aisleModelSummaryCache.has(cacheKey)) {
        return aisleModelSummaryCache.get(cacheKey);
    }

    const items = byAisle.get(keyUpper) || [];
    const modelMap = new Map();
    const skuMap = new Map();
    const aisleInvSet = new Set();
    const aislePoSet = new Set();

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const modelName = resolveItemModelName(it);
        const skuCode = resolveItemProductCode(it);
        const categoryName = String(it.category || 'ทั่วไป').trim() || 'ทั่วไป';
        const invNo = resolveLocationItemInvNo(it);
        const poNo = resolveLocationItemPoNo(it);
        const parsedLoc = parseLocationComponents(it.location);
        const compactTag = formatCompactLocationTag(it.location);

        if (invNo) aisleInvSet.add(invNo);
        if (poNo) aislePoSet.add(poNo);

        // 1. รวมกลุ่มตามชื่อรุ่น + รหัสสินค้า
        const mKey = `${modelName.toLowerCase()}|||${skuCode.toLowerCase()}`;
        if (!modelMap.has(mKey)) {
            modelMap.set(mKey, {
                name: modelName,
                skuCode: skuCode,
                category: categoryName,
                count: 0,
                baysSet: new Set(),
                invSet: new Set(),
                poSet: new Set(),
                locations: [],
                serials: []
            });
        }
        const mEntry = modelMap.get(mKey);
        mEntry.count += 1;
        mEntry.baysSet.add(parsedLoc.bay);
        if (invNo) mEntry.invSet.add(invNo);
        if (poNo) mEntry.poSet.add(poNo);
        mEntry.locations.push({ raw: it.location || '', tag: compactTag, bay: parsedLoc.bay });
        if (it.sn) mEntry.serials.push(String(it.sn));

        // 2. รวมกลุ่มตามรหัสสินค้า / SKU
        const sKey = skuCode.toLowerCase();
        if (!skuMap.has(sKey)) {
            skuMap.set(sKey, {
                skuCode: skuCode,
                count: 0,
                modelsCountMap: new Map(),
                baysSet: new Set(),
                invSet: new Set(),
                poSet: new Set(),
                locations: []
            });
        }
        const sEntry = skuMap.get(sKey);
        sEntry.count += 1;
        sEntry.modelsCountMap.set(modelName, (sEntry.modelsCountMap.get(modelName) || 0) + 1);
        sEntry.baysSet.add(parsedLoc.bay);
        if (invNo) sEntry.invSet.add(invNo);
        if (poNo) sEntry.poSet.add(poNo);
        sEntry.locations.push({ raw: it.location || '', tag: compactTag, bay: parsedLoc.bay });
    }

    const modelsList = Array.from(modelMap.values()).map(m => {
        m.locations.sort((a, b) => compareLocationsNaturally(a.raw, b.raw));
        const bays = Array.from(m.baysSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        return {
            name: m.name,
            skuCode: m.skuCode,
            category: m.category,
            count: m.count,
            bays,
            invList: Array.from(m.invSet),
            poList: Array.from(m.poSet),
            locations: m.locations,
            serials: m.serials
        };
    }).sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, 'th'));

    const skuList = Array.from(skuMap.values()).map(s => {
        s.locations.sort((a, b) => compareLocationsNaturally(a.raw, b.raw));
        const bays = Array.from(s.baysSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        const subModels = Array.from(s.modelsCountMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        return {
            skuCode: s.skuCode,
            count: s.count,
            modelsCount: subModels.length,
            subModels,
            bays,
            invList: Array.from(s.invSet),
            poList: Array.from(s.poSet),
            locations: s.locations
        };
    }).sort((a, b) => (b.count - a.count) || a.skuCode.localeCompare(b.skuCode, 'th'));

    // ผูกยอดรวมของรหัสสินค้าเดียวกันในแถวนี้เข้ากับแต่ละรายการรุ่น
    for (let i = 0; i < modelsList.length; i++) {
        const skuObj = skuMap.get(modelsList[i].skuCode.toLowerCase());
        modelsList[i].skuTotalInAisle = skuObj ? skuObj.count : modelsList[i].count;
    }

    const result = {
        aisle: targetAisle,
        totalItems: items.length,
        uniqueModelsCount: modelsList.length,
        uniqueSkusCount: skuList.length,
        invList: Array.from(aisleInvSet),
        poList: Array.from(aislePoSet),
        modelsList,
        skuList
    };

    if (aisleModelSummaryCache.size > 500) aisleModelSummaryCache.clear();
    aisleModelSummaryCache.set(cacheKey, result);
    return result;
}

function getGlobalCatalogBreakdown() {
    const byAisle = getIndexedInventoryByAisle();
    const sig = indexedInventoryCache.signature;
    if (globalCatalogSummaryCache.signature === sig && (globalCatalogSummaryCache.models.length > 0 || indexedInventoryCache.totalItems === 0)) {
        return globalCatalogSummaryCache;
    }

    const globalModelsMap = new Map();
    const globalSkusMap = new Map();

    byAisle.forEach((items) => {
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const modelName = resolveItemModelName(it);
            const skuCode = resolveItemProductCode(it);
            const invNo = resolveLocationItemInvNo(it);
            const poNo = resolveLocationItemPoNo(it);
            const parsedLoc = parseLocationComponents(it.location);
            const aisleName = parsedLoc.aisle;

            // Model index
            const mKey = modelName.toLowerCase();
            if (!globalModelsMap.has(mKey)) {
                globalModelsMap.set(mKey, {
                    name: modelName,
                    skus: new Set(),
                    invs: new Set(),
                    pos: new Set(),
                    totalCount: 0,
                    aisleCounts: new Map()
                });
            }
            const gm = globalModelsMap.get(mKey);
            gm.totalCount += 1;
            gm.skus.add(skuCode);
            if (invNo) gm.invs.add(invNo);
            if (poNo) gm.pos.add(poNo);
            gm.aisleCounts.set(aisleName, (gm.aisleCounts.get(aisleName) || 0) + 1);

            // SKU index
            const sKey = skuCode.toLowerCase();
            if (!globalSkusMap.has(sKey)) {
                globalSkusMap.set(sKey, {
                    skuCode: skuCode,
                    totalCount: 0,
                    modelsCount: new Set(),
                    invs: new Set(),
                    pos: new Set(),
                    aisleCounts: new Map()
                });
            }
            const gs = globalSkusMap.get(sKey);
            gs.totalCount += 1;
            gs.modelsCount.add(modelName);
            if (invNo) gs.invs.add(invNo);
            if (poNo) gs.pos.add(poNo);
            gs.aisleCounts.set(aisleName, (gs.aisleCounts.get(aisleName) || 0) + 1);
        }
    });

    const models = Array.from(globalModelsMap.values()).map(m => ({
        name: m.name,
        skus: Array.from(m.skus),
        invs: Array.from(m.invs),
        pos: Array.from(m.pos),
        totalCount: m.totalCount,
        aisles: Array.from(m.aisleCounts.entries())
            .map(([aisle, count]) => ({ aisle, count }))
            .sort((a, b) => b.count - a.count || a.aisle.localeCompare(b.aisle, 'en', { numeric: true }))
    })).sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name, 'th'));

    const skus = Array.from(globalSkusMap.values()).map(s => ({
        skuCode: s.skuCode,
        totalCount: s.totalCount,
        modelsCount: s.modelsCount.size,
        invs: Array.from(s.invs),
        pos: Array.from(s.pos),
        aisles: Array.from(s.aisleCounts.entries())
            .map(([aisle, count]) => ({ aisle, count }))
            .sort((a, b) => b.count - a.count || a.aisle.localeCompare(b.aisle, 'en', { numeric: true }))
    })).sort((a, b) => b.totalCount - a.totalCount || a.skuCode.localeCompare(b.skuCode, 'th'));

    globalCatalogSummaryCache = { signature: sig, models, skus };
    return globalCatalogSummaryCache;
}

// -------------------------------------------------------------------------
// 🎯 Realtime Active View Persistence & Instant View Hydration Engine
// -------------------------------------------------------------------------
(function hookViewSwitchPersistence() {
    const applySwitchViewHook = () => {
        if (typeof window.switchView === 'function' && !window.switchView.__wmsLocationHooked) {
            const originalSwitchView = window.switchView;
            const wrappedSwitchView = function(viewId, ...args) {
                if (viewId) {
                    localStorage.setItem('WMS_ACTIVE_VIEW_ID', viewId);
                }
                closeAisleSummaryPopup();
                const result = originalSwitchView.apply(this, [viewId, ...args]);

                // หากสลับมาหน้าผังตำแหน่งคลังสินค้า ให้เรนเดอร์ทันทีแบบ Synchronous (0ms lag)
                if (viewId && String(viewId).toLowerCase().includes('location')) {
                    const container = document.getElementById('aisleFilterBar');
                    if (container && (!container.innerHTML || container.innerHTML.trim() === '')) {
                        renderDrillDownAisleBar(true);
                    } else {
                        Promise.resolve().then(() => renderDrillDownAisleBar(true));
                    }
                }
                return result;
            };
            wrappedSwitchView.__wmsLocationHooked = true;
            window.switchView = wrappedSwitchView;
        }
    };

    applySwitchViewHook();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applySwitchViewHook);
    }
})();

// -------------------------------------------------------------------------
// Smart DOM Updating Function (Flicker-Free + Immediate Mode)
// -------------------------------------------------------------------------
function smartUpdateDOM(elementId, newHTML, immediate = false) {
    const elem = document.getElementById(elementId);
    if (!elem) return;

    const currentCached = lastRenderedHTML.get(elementId);
    if (currentCached === newHTML && elem.innerHTML !== '') {
        return;
    }

    lastRenderedHTML.set(elementId, newHTML);

    if (immediate) {
        elem.innerHTML = newHTML;
        return;
    }

    window.requestAnimationFrame(() => {
        elem.innerHTML = newHTML;
    });
}

// Dynamic Configuration Extractor
function getAisleConfig(aisleName) {
    const key = String(aisleName || '').trim();
    if (typeof window.aisleConfigs !== 'undefined' && window.aisleConfigs && window.aisleConfigs[key]) {
        return window.aisleConfigs[key];
    }
    if (typeof aisleConfigs !== 'undefined' && aisleConfigs && aisleConfigs[key]) {
        return aisleConfigs[key];
    }
    if (typeof window.masterWarehouseConfigs !== 'undefined' && window.masterWarehouseConfigs && window.masterWarehouseConfigs[key]) {
        return window.masterWarehouseConfigs[key];
    }
    if (typeof masterWarehouseConfigs !== 'undefined' && masterWarehouseConfigs && masterWarehouseConfigs[key]) {
        return masterWarehouseConfigs[key];
    }
    try {
        const localCfg = localStorage.getItem('WMS_AISLE_CONFIGS');
        if (localCfg) {
            const parsed = JSON.parse(localCfg);
            if (parsed && parsed[key]) return parsed[key];
        }
    } catch (e) {}

    return { bays: 10, shelves: 1, slots: 10 };
}

// ระบุประเภทแถวโครงสร้าง (Main vs Auxiliary)
function getAisleZoneType(aisleName) {
    const k = String(aisleName || '').trim();
    let cfg = null;
    if (typeof window.aisleConfigs !== 'undefined' && window.aisleConfigs && window.aisleConfigs[k]) {
        cfg = window.aisleConfigs[k];
    } else if (typeof aisleConfigs !== 'undefined' && aisleConfigs && aisleConfigs[k]) {
        cfg = aisleConfigs[k];
    } else if (typeof window.masterWarehouseConfigs !== 'undefined' && window.masterWarehouseConfigs && window.masterWarehouseConfigs[k]) {
        cfg = window.masterWarehouseConfigs[k];
    } else if (typeof masterWarehouseConfigs !== 'undefined' && masterWarehouseConfigs && masterWarehouseConfigs[k]) {
        cfg = masterWarehouseConfigs[k];
    }
    
    if (!cfg) {
        try {
            const localCfg = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (localCfg) {
                const parsed = JSON.parse(localCfg);
                if (parsed && parsed[k]) cfg = parsed[k];
            }
        } catch (e) {}
    }

    if (cfg && (cfg.zone_type || cfg.zoneType || cfg.type)) {
        const zType = String(cfg.zone_type || cfg.zoneType || cfg.type).toLowerCase();
        if (zType === 'auxiliary' || zType === 'aux') return 'auxiliary';
        if (zType === 'main') return 'main';
    }

    if (/^[A-D]$/i.test(k)) return 'main';
    return 'auxiliary';
}

// -------------------------------------------------------------------------
// 🎯 Realtime Stock Linking Engine (เชื่อมต่อไปยังหน้าเช็กสต็อกสินค้าแม่นยำ 100%)
// -------------------------------------------------------------------------
function linkToInventoryView(locFilterStr) {
    closeAisleSummaryPopup();
    if (typeof switchView === 'function') {
        switchView('view-inventory');
    }

    let toastFired = false;

    const executeRealtimeFilter = () => {
        const searchInput = document.getElementById('inventorySearchInput') || 
                            document.getElementById('stockSearchInput') || 
                            document.getElementById('searchInput') || 
                            document.querySelector('.inventory-search-input');
                            
        if (searchInput) {
            const queryStr = String(locFilterStr || '').trim();
            searchInput.value = queryStr;
            
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));

            if (typeof filterInventoryData === 'function') {
                filterInventoryData(true);
            } else if (typeof renderInventoryTable === 'function') {
                renderInventoryTable();
            }

            setTimeout(() => {
                const tbody = document.getElementById('inventoryTableBody');
                if (tbody && tbody.children.length > 0) {
                    const visibleRows = Array.from(tbody.querySelectorAll('tr')).filter(tr => tr.style.display !== 'none' && !tr.classList.contains('wms-table-empty-cell'));
                    if (visibleRows.length === 0 && queryStr.includes('-')) {
                        const parsed = parseLocationComponents(queryStr);
                        const fallbackQuery = parsed.aisle && parsed.bay ? `${parsed.aisle}-${parsed.bay}` : parsed.aisle;
                        if (fallbackQuery && fallbackQuery !== queryStr) {
                            searchInput.value = fallbackQuery;
                            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                            if (typeof filterInventoryData === 'function') filterInventoryData(true);
                        }
                    }
                }
            }, 60);
        }
        
        if (!toastFired && typeof showToast === 'function') {
            toastFired = true;
            showToast(`🔍 สลับไปหน้าเช็กสต็อกเรียลไทม์ — กรองค้นหา: ${locFilterStr || 'ทั้งหมด'}`);
        }
    };

    executeRealtimeFilter();
    setTimeout(executeRealtimeFilter, 120);
    setTimeout(executeRealtimeFilter, 320);
}

function scheduleBackgroundPrecalculation() {
    if (isBackgroundPrecalculating) return;
    isBackgroundPrecalculating = true;

    const runCalculation = () => {
        try {
            getIndexedInventoryByAisle();
            getGlobalCatalogBreakdown();
            const aisles = getAllConfiguredAisles();
            let totalCap = 0;
            let totalOcc = 0;
            const aisleStatsMap = new Map();

            aisles.forEach(a => {
                const st = getAisleOccupancyStats(a);
                getAisleModelBreakdown(a);
                aisleStatsMap.set(a, st);
                totalCap += st.totalCapacity;
                totalOcc += st.occupiedSlots;
            });

            const overallDensity = getDensityInfo(totalOcc, totalCap);
            cachedWarehouseStats = {
                totalCapacity: totalCap,
                totalOccupied: totalOcc,
                availableSlots: Math.max(0, totalCap - totalOcc),
                densityInfo: overallDensity,
                aislesCount: aisles.length,
                statsMap: aisleStatsMap,
                updatedAt: Date.now()
            };

            // Pre-warm DOM ล่วงหน้าแม้ผู้ใช้งานอยู่หน้าอื่น เพื่อเปิดปุ๊บติดปั๊บ
            renderDrillDownAisleBar(true);
        } catch (e) {
            console.warn('Background Precalculation Error:', e);
        } finally {
            isBackgroundPrecalculating = false;
        }
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(runCalculation, { timeout: 400 });
    } else {
        setTimeout(runCalculation, 0);
    }
}

function prewarmWarehouseLocationView() {
    scheduleBackgroundPrecalculation();
}

function refreshLocationVisualizerIfActive() {
    invalidateLocationCaches();
    scheduleBackgroundPrecalculation();
    renderDrillDownAisleBar(true);

    if (activeSummaryPopupAisle) {
        const overlay = document.getElementById('aisleSummaryOverlay');
        if (overlay && overlay.style.display === 'flex') {
            openAisleSummaryPopup(activeSummaryPopupAisle);
        }
    }

    if (activeDetailModalState && activeDetailModalState.aisleName) {
        const modalElem = document.getElementById('aisleDetailModal');
        if (modalElem && modalElem.style.display === 'flex') {
            openAisleDetailModal(
                activeDetailModalState.aisleName,
                activeDetailModalState.filterQuery,
                activeDetailModalState.bayFilter
            );
        }
    }
}

window.notifyWarehouseConfigChanged = function() { refreshLocationVisualizerIfActive(); };
window.notifyInventoryDataUpdated = function() { refreshLocationVisualizerIfActive(); };

['warehouseConfigUpdated', 'inventoryUpdated', 'inventoryDataChanged', 'wmsRealtimeSync', 'supabaseConnected', 'wms_inventory_updated', 'wms_inbound_saved', 'wms_inbound_batch_saved'].forEach(evtName => {
    document.addEventListener(evtName, function() {
        refreshLocationVisualizerIfActive();
    }, true);
    window.addEventListener(evtName, function() {
        refreshLocationVisualizerIfActive();
    }, true);
});

window.addEventListener('storage', function(e) {
    if (e.key === 'WMS_AISLE_CONFIGS' || e.key === 'WMS_MASTER_AISLES' || e.key === 'WMS_INVENTORY_DATA' || e.key === 'WMS_LOCAL_INVENTORY_CACHE') {
        refreshLocationVisualizerIfActive();
    }
});

// เชื่อมต่อ BroadcastChannel เดียวกับ inv-core-sync.js เพื่อซิงก์ข้ามหน้าจอทันที
try {
    if (typeof BroadcastChannel !== 'undefined') {
        const wmsLocSyncChannel = new BroadcastChannel('WMS_INVENTORY_REALTIME_SYNC_V1');
        wmsLocSyncChannel.onmessage = function(ev) {
            if (ev && ev.data && ev.data.type === 'WMS_INVENTORY_MUTATION') {
                refreshLocationVisualizerIfActive();
            }
        };
    }
} catch (e) {}

// เรียกเตรียมพร้อมหน้าผังตำแหน่งทันทีที่โหลดหน้าเว็บเสร็จ (รองรับทุก OS/Browser)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        renderDrillDownAisleBar(true);
        scheduleBackgroundPrecalculation();
    });
} else {
    renderDrillDownAisleBar(true);
    scheduleBackgroundPrecalculation();
}
window.addEventListener('load', () => {
    scheduleBackgroundPrecalculation();
});

function extractAisleFromLocation(locStr) {
    if (!locStr) return '';
    let rawStr = String(locStr).trim();
    if (extractedAisleCache.has(rawStr)) {
        return extractedAisleCache.get(rawStr);
    }
    
    const knownAisles = [];
    if (typeof window.masterAisles !== 'undefined' && Array.isArray(window.masterAisles)) {
        window.masterAisles.forEach(a => { if (a) knownAisles.push(typeof a === 'object' ? String(a.name || a.aisle) : String(a).trim()); });
    } else if (typeof masterAisles !== 'undefined' && Array.isArray(masterAisles)) {
        masterAisles.forEach(a => { if (a) knownAisles.push(typeof a === 'object' ? String(a.name || a.aisle) : String(a).trim()); });
    }

    if (typeof masterWarehouseConfigs !== 'undefined' && masterWarehouseConfigs) {
        Object.keys(masterWarehouseConfigs).forEach(a => { if (a) knownAisles.push(String(a).trim()); });
    }

    knownAisles.sort((a, b) => b.length - a.length);

    let resolved = '';
    for (let key of knownAisles) {
        const keyUpper = key.toUpperCase().trim();
        const rawUpper = rawStr.toUpperCase();

        if (rawUpper === keyUpper) { resolved = key; break; }
        if (rawUpper.startsWith(keyUpper + '-') || 
            rawUpper.startsWith(keyUpper + '/') || 
            rawUpper.startsWith(keyUpper + '_') || 
            rawUpper.startsWith(keyUpper + ' ')) {
            resolved = key;
            break;
        }
    }

    if (!resolved) {
        let parts = rawStr.split(/[\-\/_]+/).filter(Boolean);
        if (parts.length > 0) {
            let p0 = parts[0].trim();
            let matchEngNum = p0.match(/^([A-Z0-9_]+)$/i);
            resolved = matchEngNum ? matchEngNum[1].toUpperCase() : p0;
        } else {
            resolved = rawStr;
        }
    }

    if (extractedAisleCache.size > 15000) extractedAisleCache.clear();
    extractedAisleCache.set(rawStr, resolved);
    return resolved;
}

function parseLocationComponents(locStr) {
    if (!locStr) return { aisle: 'DOCK', bay: '01', shelf: '1', slot: '01', raw: '' };
    const rawKey = String(locStr);
    if (parsedLocationCache.has(rawKey)) {
        return parsedLocationCache.get(rawKey);
    }

    let cleanStr = rawKey.trim().toUpperCase();

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(cleanStr)) {
        const specialRes = { aisle: cleanStr, bay: '01', shelf: '1', slot: '01', raw: cleanStr };
        parsedLocationCache.set(rawKey, specialRes);
        return specialRes;
    }

    let aisle = extractAisleFromLocation(cleanStr) || 'A';
    let remainder = cleanStr;
    if (remainder.startsWith(aisle.toUpperCase())) {
        remainder = remainder.substring(aisle.length).replace(/^[\-\/_\s]+/, '');
    }

    let bayNum = 1, shelfNum = 1, slotNum = 1;
    let parts = remainder.split(/[\-\/_]+/).filter(Boolean);

    if (parts.length >= 1) {
        let bayMatch = parts[0].match(/(?:BAY|B|L)?(\d+)/i);
        if (bayMatch) bayNum = parseInt(bayMatch[1], 10) || 1;

        if (parts.length >= 2) {
            let shelfMatch = parts[1].match(/(?:SHELF|SH|LAYER|LV|L)?(\d+)/i);
            if (shelfMatch) shelfNum = parseInt(shelfMatch[1], 10) || 1;
        }

        if (parts.length >= 3) {
            let slotMatch = parts[2].match(/(?:SLOT|SL|S)?(\d+)/i);
            if (slotMatch) slotNum = parseInt(slotMatch[1], 10) || 1;
        }
    } else {
        let explicitBay = remainder.match(/(?:BAY|B)(\d+)/i);
        if (explicitBay) bayNum = parseInt(explicitBay[1], 10) || 1;
        else {
            let anyDigit = remainder.match(/(\d+)/);
            if (anyDigit) bayNum = parseInt(anyDigit[1], 10) || 1;
        }
    }

    let bayStr = String(bayNum).padStart(2, '0');
    let slotStr = String(slotNum).padStart(2, '0');

    const result = {
        aisle: aisle,
        bay: bayStr,
        shelf: String(shelfNum),
        slot: slotStr,
        raw: cleanStr,
        formatted: `${aisle}-${bayStr}-${shelfNum}-${slotStr}`
    };

    if (parsedLocationCache.size > 15000) parsedLocationCache.clear();
    parsedLocationCache.set(rawKey, result);
    return result;
}

function formatCompactLocationTag(locStr) {
    if (!locStr) return '-';
    const parsed = parseLocationComponents(locStr);
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(parsed.raw)) {
        return parsed.raw;
    }
    return `${parsed.aisle}${parsed.bay}-L${parsed.shelf}-S${parsed.slot}`;
}

function getDensityInfo(occupied, capacity) {
    const totalCap = Math.max(1, capacity || 1);
    const count = Math.max(0, occupied || 0);
    const rawRate = Math.round((count / totalCap) * 100);
    const rate = Math.min(100, rawRate);

    let statusText = 'ว่าง / หนาแน่นต่ำ';
    let badgeBg = 'rgba(16, 185, 129, 0.15)';
    let badgeColor = '#059669';
    let barGradient = 'linear-gradient(90deg, #10b981 0%, #34d399 100%)';
    let statusIcon = '🟢';
    let levelKey = 'LOW';

    if (rawRate > 100) {
        statusText = `เกินความจุ (${rawRate}%)`;
        badgeBg = 'rgba(225, 29, 72, 0.2)';
        badgeColor = '#e11d48';
        barGradient = 'linear-gradient(90deg, #e11d48 0%, #9f1239 100%)';
        statusIcon = '🚨';
        levelKey = 'FULL';
    } else if (rate >= 95) {
        statusText = 'เต็มพื้นที่';
        badgeBg = 'rgba(239, 68, 68, 0.18)';
        badgeColor = '#dc2626';
        barGradient = 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)';
        statusIcon = '🔴';
        levelKey = 'FULL';
    } else if (rate >= 75) {
        statusText = 'หนาแน่นสูง';
        badgeBg = 'rgba(245, 158, 11, 0.18)';
        badgeColor = '#d97706';
        barGradient = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
        statusIcon = '🟡';
        levelKey = 'HIGH';
    } else if (rate >= 40) {
        statusText = 'หนาแน่นปานกลาง';
        badgeBg = 'rgba(2, 132, 199, 0.15)';
        badgeColor = '#0284c7';
        barGradient = 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)';
        statusIcon = '🔵';
        levelKey = 'MEDIUM';
    }

    return {
        rate, rawRate, count, capacity: totalCap,
        available: Math.max(0, totalCap - count),
        statusText, badgeBg, badgeColor, barGradient, statusIcon, levelKey
    };
}

function getAllConfiguredAisles() {
    const aisleMap = new Map();

    const addAisle = (key, order) => {
        const k = String(key || '').trim();
        if (!k) return;
        if (!aisleMap.has(k)) {
            aisleMap.set(k, order);
        }
    };

    let masterList = null;
    if (typeof window.masterAisles !== 'undefined' && Array.isArray(window.masterAisles)) {
        masterList = window.masterAisles;
    } else if (typeof masterAisles !== 'undefined' && Array.isArray(masterAisles)) {
        masterList = masterAisles;
    }

    if (!masterList || masterList.length === 0) {
        try {
            const localMaster = localStorage.getItem('WMS_MASTER_AISLES');
            if (localMaster) masterList = JSON.parse(localMaster);
        } catch (e) {}
    }

    if (Array.isArray(masterList)) {
        masterList.forEach((a, idx) => {
            const key = (typeof a === 'object' && a !== null) ? (a.name || a.aisle || a.key || '') : String(a);
            const orderVal = (typeof a === 'object' && a !== null && a.sort_order !== undefined) ? Number(a.sort_order) : idx;
            if (key) addAisle(key, orderVal);
        });
    }

    let configs = null;
    if (typeof window.aisleConfigs !== 'undefined' && window.aisleConfigs) configs = window.aisleConfigs;
    else if (typeof aisleConfigs !== 'undefined' && aisleConfigs) configs = aisleConfigs;
    else if (typeof window.masterWarehouseConfigs !== 'undefined' && window.masterWarehouseConfigs) configs = window.masterWarehouseConfigs;
    else if (typeof masterWarehouseConfigs !== 'undefined' && masterWarehouseConfigs) configs = masterWarehouseConfigs;

    if (!configs) {
        try {
            const localCfg = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (localCfg) configs = JSON.parse(localCfg);
        } catch (e) {}
    }

    if (configs && typeof configs === 'object') {
        Object.keys(configs).forEach((a, idx) => {
            const cfg = configs[a] || {};
            const orderVal = cfg.sort_order !== undefined ? Number(cfg.sort_order) : (cfg.index !== undefined ? Number(cfg.index) : (aisleMap.has(a) ? aisleMap.get(a) : idx + 100));
            addAisle(a, orderVal);
        });
    }

    // ดึงแถวเพิ่มเติมจากดัชนี O(N) ทันทีโดยไม่วนลูปซ้ำ
    const byAisle = getIndexedInventoryByAisle();
    byAisle.forEach((items) => {
        if (items.length > 0) {
            const sampleAisle = parseLocationComponents(items[0].location).aisle;
            if (sampleAisle && !aisleMap.has(sampleAisle)) {
                addAisle(sampleAisle, 9999);
            }
        }
    });

    const allAisles = Array.from(aisleMap.keys()).filter(a => a !== '');

    return allAisles.sort((a, b) => {
        const orderA = aisleMap.has(a) ? aisleMap.get(a) : 9999;
        const orderB = aisleMap.has(b) ? aisleMap.get(b) : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
    });
}

function getAisleOccupancyStats(aisleName) {
    if (!aisleName) {
        return { totalCapacity: 0, configuredCapacity: 0, occupiedSlots: 0, availableSlots: 0, occupancyRate: 0, rawOccupancyRate: 0, baysCount: 0, maxFoundBay: 0, itemsList: [], bayCounts: {}, densityInfo: getDensityInfo(0, 100) };
    }

    const targetAisle = String(aisleName).trim();
    const targetAisleUpper = targetAisle.toUpperCase();

    const config = getAisleConfig(targetAisle);
    const configuredBays = Math.max(1, parseInt(config.bays || config.bay, 10) || 10);
    const configuredShelves = Math.max(1, parseInt(config.shelves || config.shelf, 10) || 1);
    const configuredSlots = Math.max(1, parseInt(config.slots || config.slot, 10) || 10);

    // ดึงข้อมูลจากดัชนี O(1) Map Lookup แทนการกรองทั้งอาร์เรย์ซ้ำๆ
    const byAisle = getIndexedInventoryByAisle();
    const itemsInAisle = byAisle.get(targetAisleUpper) || [];

    // นับจำนวนสินค้าต่อ Bay สำหรับแสดง Mini Bay Spark-Bar
    const bayCounts = {};
    for (let i = 0; i < itemsInAisle.length; i++) {
        const p = parseLocationComponents(itemsInAisle[i].location);
        const bNum = parseInt(p.bay, 10) || 1;
        bayCounts[bNum] = (bayCounts[bNum] || 0) + 1;
    }

    const occupiedSlots = itemsInAisle.length;
    const totalCapacity = configuredBays * configuredShelves * configuredSlots;
    const densityInfo = getDensityInfo(occupiedSlots, totalCapacity);

    return {
        totalCapacity,
        configuredCapacity: totalCapacity,
        occupiedSlots,
        availableSlots: Math.max(0, totalCapacity - occupiedSlots),
        occupancyRate: densityInfo.rate,
        rawOccupancyRate: densityInfo.rawRate,
        baysCount: configuredBays,
        shelvesCount: configuredShelves,
        slotsCount: configuredSlots,
        itemsList: itemsInAisle,
        bayCounts,
        densityInfo
    };
}

// -------------------------------------------------------------------------
// 📥 ฟีเจอร์เสริม: Export รายการสินค้าในแถวเป็นไฟล์ CSV & คัดลอกใบเบิกสินค้า (รองรับ INV/PO)
// -------------------------------------------------------------------------
function filterAisleItemsByCriteria(aisleName, filterQuery = '', bayFilter = 'ALL', docFilter = 'ALL') {
    const stats = getAisleOccupancyStats(aisleName);
    let items = [...(stats.itemsList || [])];

    if (bayFilter !== 'ALL') {
        items = items.filter(i => {
            const p = parseLocationComponents(i.location);
            return p.bay === bayFilter || String(parseInt(p.bay, 10)) === String(parseInt(bayFilter, 10));
        });
    }

    if (docFilter && docFilter !== 'ALL') {
        items = items.filter(i => {
            const inv = resolveLocationItemInvNo(i);
            const po = resolveLocationItemPoNo(i);
            if (docFilter === 'HAS_INV') return Boolean(inv);
            if (docFilter === 'HAS_PO') return Boolean(po);
            return true;
        });
    }

    if (filterQuery.trim() !== '') {
        const q = filterQuery.toLowerCase().trim();
        items = items.filter(i => {
            const inv = resolveLocationItemInvNo(i).toLowerCase();
            const po = resolveLocationItemPoNo(i).toLowerCase();
            return (i.sn && String(i.sn).toLowerCase().includes(q)) ||
                (i.category && String(i.category).toLowerCase().includes(q)) ||
                (i.sku && String(i.sku).toLowerCase().includes(q)) ||
                (i.code && String(i.code).toLowerCase().includes(q)) ||
                (i.name && String(i.name).toLowerCase().includes(q)) ||
                (i.location && String(i.location).toLowerCase().includes(q)) ||
                (inv && inv.includes(q)) ||
                (po && po.includes(q));
        });
    }

    items.sort((a, b) => compareLocationsNaturally(a.location, b.location));
    return items;
}

function exportAisleItemsToCSV(aisleName, filterQuery = '', bayFilter = 'ALL') {
    if (!aisleName) return;
    const items = filterAisleItemsByCriteria(aisleName, filterQuery, bayFilter, activeModalDocFilter);

    if (items.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่มีรายการสินค้าสำหรับส่งออก');
        return;
    }

    const sanitizeCsvCell = (val) => {
        let s = String(val ?? '').replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // ป้องกัน CSV Formula Injection
        return `"${s}"`;
    };

    const headers = ['ลำดับ', 'พิกัดจัดเก็บ', 'รหัสย่อพิกัด', 'รหัสสินค้า/หมวดหมู่', 'ชื่อรุ่นสินค้า', 'Serial Number', 'เลขที่ใบกำกับภาษี (INV)', 'เลขที่ใบสั่งซื้อ (PO)'];
    const rows = items.map((item, idx) => [
        idx + 1,
        item.location || '-',
        formatCompactLocationTag(item.location),
        resolveItemProductCode(item),
        resolveItemModelName(item),
        item.sn || '-',
        resolveLocationItemInvNo(item) || '',
        resolveLocationItemPoNo(item) || ''
    ].map(sanitizeCsvCell).join(','));

    const csvContent = '\uFEFF' + [headers.map(sanitizeCsvCell).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `WMS-Aisle-${aisleName}-${bayFilter}-${dateStamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    if (typeof showToast === 'function') {
        showToast(`📥 ส่งออกรายการแถว ${aisleName} จำนวน ${items.length} รายการสำเร็จ`);
    }
}

function copyAllAisleSerials(aisleName, filterQuery = '', bayFilter = 'ALL') {
    if (!aisleName) return;
    const items = filterAisleItemsByCriteria(aisleName, filterQuery, bayFilter, activeModalDocFilter);

    const serials = items.map(i => i.sn).filter(Boolean);
    if (serials.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบ Serial Number ในรายการที่เลือก');
        return;
    }
    copyTextToClipboard(serials.join('\n'), `Serial Number ทั้งหมด (${serials.length} รายการ)`);
}

function copyAislePickingSummary(aisleName, filterQuery = '', bayFilter = 'ALL') {
    if (!aisleName) return;
    const items = filterAisleItemsByCriteria(aisleName, filterQuery, bayFilter, 'ALL');
    if (items.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่มีรายการสินค้าสำหรับสร้างสรุปใบเบิก');
        return;
    }

    const grouped = new Map();
    items.forEach(it => {
        const mName = resolveItemModelName(it);
        const sCode = resolveItemProductCode(it);
        const invNo = resolveLocationItemInvNo(it);
        const poNo = resolveLocationItemPoNo(it);
        const key = `${mName}|||${sCode}`;
        if (!grouped.has(key)) {
            grouped.set(key, { name: mName, skuCode: sCode, count: 0, locs: [], invs: new Set(), pos: new Set() });
        }
        const g = grouped.get(key);
        g.count += 1;
        g.locs.push(formatCompactLocationTag(it.location));
        if (invNo) g.invs.add(invNo);
        if (poNo) g.pos.add(poNo);
    });

    const lines = [
        `📋 สรุปยอดสินค้าประจำแถว ${aisleName}${bayFilter !== 'ALL' ? ` (Bay ${bayFilter})` : ''} — รวม ${items.length} เครื่อง`
    ];
    let idx = 1;
    grouped.forEach(g => {
        const uniqueLocs = Array.from(new Set(g.locs));
        const locPreview = uniqueLocs.slice(0, 6).join(', ') + (uniqueLocs.length > 6 ? ` (+อีก ${uniqueLocs.length - 6} พิกัด)` : '');
        const docParts = [];
        if (g.invs.size > 0) docParts.push(`INV: ${Array.from(g.invs).join(', ')}`);
        if (g.pos.size > 0) docParts.push(`PO: ${Array.from(g.pos).join(', ')}`);
        const docSuffix = docParts.length > 0 ? ` | ${docParts.join(' · ')}` : '';
        lines.push(`${idx}. รุ่น: ${g.name} | รหัส: ${g.skuCode} | จำนวน: ${g.count} เครื่อง | พิกัด: ${locPreview}${docSuffix}`);
        idx++;
    });

    copyTextToClipboard(lines.join('\n'), `สรุปยอดแถว ${aisleName}`);
}

function copyGlobalPickingCoordinates() {
    const q = globalLocationProductQuery.trim().toLowerCase();
    if (!q) return;

    const aisles = getAllConfiguredAisles();
    const matchedItems = [];
    aisles.forEach(a => {
        const st = getAisleOccupancyStats(a);
        st.itemsList.forEach(it => {
            const mName = resolveItemModelName(it).toLowerCase();
            const sCode = resolveItemProductCode(it).toLowerCase();
            const snStr = String(it.sn || '').toLowerCase();
            const locStr = String(it.location || '').toLowerCase();
            const invStr = resolveLocationItemInvNo(it).toLowerCase();
            const poStr = resolveLocationItemPoNo(it).toLowerCase();
            if (mName.includes(q) || sCode.includes(q) || snStr.includes(q) || locStr.includes(q) || invStr.includes(q) || poStr.includes(q)) {
                matchedItems.push(it);
            }
        });
    });

    if (matchedItems.length === 0) return;
    matchedItems.sort((a, b) => compareLocationsNaturally(a.location, b.location));

    const lines = [
        `🎯 รายการพิกัดเบิกสินค้าคำค้น: "${globalLocationProductQuery.trim()}" (รวม ${matchedItems.length} เครื่อง)`
    ];
    matchedItems.forEach((it, i) => {
        const inv = resolveLocationItemInvNo(it);
        const po = resolveLocationItemPoNo(it);
        const docInfo = [inv ? `INV:${inv}` : '', po ? `PO:${po}` : ''].filter(Boolean).join(' ');
        lines.push(`${i + 1}. [${formatCompactLocationTag(it.location)}] ${resolveItemModelName(it)} (${resolveItemProductCode(it)}) — S/N: ${it.sn || '-'}${docInfo ? ` (${docInfo})` : ''}`);
    });

    copyTextToClipboard(lines.join('\n'), `พิกัดเบิกสินค้า (${matchedItems.length} เครื่อง)`);
}

// -------------------------------------------------------------------------
// 📊 CLICK-TRIGGERED SUMMARY POPUP ENGINE (v29.0)
// เด้งป๊อปอัปสรุปยอดเฉพาะเมื่อกดปุ่ม "สรุปยอด" เท่านั้น (ไม่เด้งตอนเลื่อนเมาส์)
// รองรับทั้ง Desktop และมือถือ 100% ไม่ตัดทอนส่วนล่าง + แสดงเลข INV/PO
// -------------------------------------------------------------------------
function ensureAisleSummaryOverlayElement() {
    let overlay = document.getElementById('aisleSummaryOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'aisleSummaryOverlay';
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                closeAisleSummaryPopup();
            }
        };
        document.body.appendChild(overlay);
    }

    let pop = document.getElementById('aisleHoverSummaryPopover');
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'aisleHoverSummaryPopover';
        overlay.appendChild(pop);
    } else if (pop.parentElement !== overlay) {
        overlay.appendChild(pop);
    }
    return { overlay, pop };
}

// คงฟังก์ชันชื่อเดิมไว้เป็น No-Op เพื่อความเข้ากันได้ 100% หากมีโค้ดภายนอกเรียกใช้
function handleAisleCardMouseEnter() {}
function handleAisleCardMouseLeave() {}

function closeAisleSummaryPopup() {
    activeSummaryPopupAisle = '';
    summaryPopoverSearchQuery = '';
    const overlay = document.getElementById('aisleSummaryOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function hideAisleHoverPopover() {
    closeAisleSummaryPopup();
}

function switchHoverPopoverTab(tabName) {
    if (tabName === 'MODEL' || tabName === 'SKU') {
        activeHoverPopoverTab = tabName;
        if (activeSummaryPopupAisle) {
            openAisleSummaryPopup(activeSummaryPopupAisle);
        }
    }
}

function onSummaryPopoverSearchInput(val) {
    summaryPopoverSearchQuery = val;
    if (activeSummaryPopupAisle) {
        openAisleSummaryPopup(activeSummaryPopupAisle);
    }
}

function openAisleSummaryPopup(aisleName) {
    if (!aisleName) return;

    // บันทึกตำแหน่งเคอร์เซอร์ของช่องค้นหาในป๊อปอัปสรุปยอด (ถ้ากำลังพิมพ์อยู่)
    const prevInput = document.getElementById('aisleSummarySearchInput');
    const wasInputFocused = (document.activeElement && prevInput && document.activeElement.id === 'aisleSummarySearchInput');
    const cursorStart = wasInputFocused ? prevInput.selectionStart : null;
    const cursorEnd = wasInputFocused ? prevInput.selectionEnd : null;

    activeSummaryPopupAisle = aisleName;
    const { overlay, pop } = ensureAisleSummaryOverlayElement();
    const stats = getAisleOccupancyStats(aisleName);
    const breakdown = getAisleModelBreakdown(aisleName);
    const den = stats.densityInfo;
    const zType = getAisleZoneType(aisleName);
    const globalQ = globalLocationProductQuery.trim().toLowerCase();
    const innerQ = summaryPopoverSearchQuery.trim().toLowerCase();

    const safeAisleJs = escapeAttrJs(aisleName);

    let listBodyHtml = '';
    if (breakdown.totalItems === 0) {
        listBodyHtml = `
            <div style="text-align: center; padding: 32px 16px; color: var(--text-muted, #64748b);">
                <div style="font-size: 2rem; margin-bottom: 8px;">📭</div>
                <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-main, #0f172a);">แถว ${window.escapeHTML(aisleName)} ยังว่างอยู่</div>
                <div style="font-size: 0.82rem; margin-top: 4px;">ว่างพร้อมจัดเก็บ ${stats.totalCapacity} ช่อง</div>
            </div>
        `;
    } else if (activeHoverPopoverTab === 'MODEL') {
        let models = [...breakdown.modelsList];
        if (innerQ !== '') {
            models = models.filter(m =>
                m.name.toLowerCase().includes(innerQ) ||
                m.skuCode.toLowerCase().includes(innerQ) ||
                m.invList.some(iv => iv.toLowerCase().includes(innerQ)) ||
                m.poList.some(po => po.toLowerCase().includes(innerQ)) ||
                m.locations.some(l => l.tag.toLowerCase().includes(innerQ) || l.raw.toLowerCase().includes(innerQ))
            );
        }
        if (globalQ !== '') {
            models.sort((a, b) => {
                const aMatch = (a.name.toLowerCase().includes(globalQ) || a.skuCode.toLowerCase().includes(globalQ) || a.invList.some(x => x.toLowerCase().includes(globalQ)) || a.poList.some(x => x.toLowerCase().includes(globalQ))) ? 1 : 0;
                const bMatch = (b.name.toLowerCase().includes(globalQ) || b.skuCode.toLowerCase().includes(globalQ) || b.invList.some(x => x.toLowerCase().includes(globalQ)) || b.poList.some(x => x.toLowerCase().includes(globalQ))) ? 1 : 0;
                if (aMatch !== bMatch) return bMatch - aMatch;
                return b.count - a.count;
            });
        }

        if (models.length === 0) {
            listBodyHtml = `
                <div style="text-align: center; padding: 26px 14px; color: var(--text-muted, #64748b); font-size: 0.84rem;">
                    ไม่พบรุ่นสินค้าหรือเอกสารที่ตรงกับ "${window.escapeHTML(summaryPopoverSearchQuery)}" ในแถว ${window.escapeHTML(aisleName)}
                </div>
            `;
        } else {
            listBodyHtml = models.map((m, idx) => {
                const isMatched = globalQ !== '' && (m.name.toLowerCase().includes(globalQ) || m.skuCode.toLowerCase().includes(globalQ) || m.invList.some(x => x.toLowerCase().includes(globalQ)) || m.poList.some(x => x.toLowerCase().includes(globalQ)));
                const bayText = m.bays.slice(0, 6).map(b => `Bay ${b}`).join(', ') + (m.bays.length > 6 ? ` +${m.bays.length - 6}` : '');
                const locSamples = m.locations.slice(0, 4).map(l => l.tag).join(', ') + (m.locations.length > 4 ? ` (+อีก ${m.locations.length - 4})` : '');
                const safeModelJs = escapeAttrJs(m.name);

                const docBadges = [];
                m.invList.slice(0, 2).forEach(inv => {
                    docBadges.push(`<span class="wms-loc-doc-badge wms-loc-doc-badge--inv" onclick="event.stopPropagation(); copyTextToClipboard('${escapeAttrJs(inv)}', 'INV')">INV: ${window.escapeHTML(inv)}</span>`);
                });
                if (m.invList.length > 2) docBadges.push(`<span class="wms-loc-doc-badge wms-loc-doc-badge--inv">+${m.invList.length - 2} INV</span>`);
                m.poList.slice(0, 2).forEach(po => {
                    docBadges.push(`<span class="wms-loc-doc-badge wms-loc-doc-badge--po" onclick="event.stopPropagation(); copyTextToClipboard('${escapeAttrJs(po)}', 'PO')">PO: ${window.escapeHTML(po)}</span>`);
                });
                if (m.poList.length > 2) docBadges.push(`<span class="wms-loc-doc-badge wms-loc-doc-badge--po">+${m.poList.length - 2} PO</span>`);

                return `
                    <div class="wms-popover-model-row ${isMatched ? 'is-matched' : ''}" onclick="closeAisleSummaryPopup(); openAisleDetailModal('${safeAisleJs}', '${safeModelJs}', 'ALL')" title="คลิกเพื่อเปิดดูพิกัดและ Serial Number ของรุ่นนี้">
                        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                            <div style="font-weight: 800; font-size: 0.88rem; color: var(--text-main, #0f172a); line-height: 1.35; word-break: break-word;">
                                ${isMatched ? '🎯 ' : `${idx + 1}. `}${window.escapeHTML(m.name)}
                            </div>
                            <span style="flex-shrink: 0; font-size: 0.8rem; font-weight: 800; padding: 3px 10px; border-radius: 20px; background: var(--primary, #0284c7); color: #ffffff;">
                                ${m.count} เครื่อง
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; font-size: 0.76rem;">
                            <span style="padding: 2px 8px; border-radius: 6px; background: rgba(2, 132, 199, 0.12); color: var(--primary-text, #0284c7); font-weight: 700;">
                                🏷️ รหัส: ${window.escapeHTML(m.skuCode)} (รวม ${m.skuTotalInAisle} เครื่อง)
                            </span>
                            <span style="color: var(--text-muted, #64748b); font-weight: 700;">
                                📍 ${window.escapeHTML(bayText)}
                            </span>
                        </div>
                        ${docBadges.length > 0 ? `<div style="display:flex; flex-wrap:wrap; gap:4px;">${docBadges.join('')}</div>` : ''}
                        <div style="font-size: 0.73rem; color: var(--text-sub, #475569); font-family: monospace; word-break: break-word;">
                            พิกัด: ${window.escapeHTML(locSamples)}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } else {
        // แท็บแยกตามรหัสสินค้า (SKU / Product Code)
        let skus = [...breakdown.skuList];
        if (innerQ !== '') {
            skus = skus.filter(s =>
                s.skuCode.toLowerCase().includes(innerQ) ||
                s.invList.some(iv => iv.toLowerCase().includes(innerQ)) ||
                s.poList.some(po => po.toLowerCase().includes(innerQ)) ||
                s.subModels.some(sm => sm.name.toLowerCase().includes(innerQ))
            );
        }
        if (globalQ !== '') {
            skus.sort((a, b) => {
                const aMatch = (a.skuCode.toLowerCase().includes(globalQ) || a.invList.some(x => x.toLowerCase().includes(globalQ)) || a.poList.some(x => x.toLowerCase().includes(globalQ))) ? 1 : 0;
                const bMatch = (b.skuCode.toLowerCase().includes(globalQ) || b.invList.some(x => x.toLowerCase().includes(globalQ)) || b.poList.some(x => x.toLowerCase().includes(globalQ))) ? 1 : 0;
                if (aMatch !== bMatch) return bMatch - aMatch;
                return b.count - a.count;
            });
        }

        if (skus.length === 0) {
            listBodyHtml = `
                <div style="text-align: center; padding: 26px 14px; color: var(--text-muted, #64748b); font-size: 0.84rem;">
                    ไม่พบรหัสสินค้าที่ตรงกับ "${window.escapeHTML(summaryPopoverSearchQuery)}" ในแถว ${window.escapeHTML(aisleName)}
                </div>
            `;
        } else {
            listBodyHtml = skus.map((s, idx) => {
                const isMatched = globalQ !== '' && (s.skuCode.toLowerCase().includes(globalQ) || s.invList.some(x => x.toLowerCase().includes(globalQ)) || s.poList.some(x => x.toLowerCase().includes(globalQ)));
                const bayText = s.bays.slice(0, 6).map(b => `Bay ${b}`).join(', ') + (s.bays.length > 6 ? ` +${s.bays.length - 6}` : '');
                const subModelsText = s.subModels.map(sm => `${sm.name} (${sm.count} เครื่อง)`).join(', ');
                const safeSkuJs = escapeAttrJs(s.skuCode);

                return `
                    <div class="wms-popover-model-row ${isMatched ? 'is-matched' : ''}" onclick="closeAisleSummaryPopup(); openAisleDetailModal('${safeAisleJs}', '${safeSkuJs}', 'ALL')" title="คลิกเพื่อเปิดดูรายการรหัสสินค้านี้ทั้งหมดในแถว">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <div style="font-weight: 800; font-size: 0.88rem; color: var(--primary-text, #0284c7); word-break: break-word;">
                                ${isMatched ? '🎯 ' : `${idx + 1}. `}🏷️ รหัสสินค้า: ${window.escapeHTML(s.skuCode)}
                            </div>
                            <span style="flex-shrink: 0; font-size: 0.8rem; font-weight: 800; padding: 3px 10px; border-radius: 20px; background: #059669; color: #ffffff;">
                                ${s.count} เครื่อง
                            </span>
                        </div>
                        <div style="font-size: 0.76rem; color: var(--text-sub, #334155); line-height: 1.4; word-break: break-word;">
                            📦 ประกอบด้วย <strong>${s.modelsCount} รุ่น</strong>: ${window.escapeHTML(subModelsText)}
                        </div>
                        <div style="font-size: 0.74rem; color: var(--text-muted, #64748b); font-weight: 700;">
                            📍 พิกัดจัดเก็บ: ${window.escapeHTML(bayText)} · เอกสาร: ${s.invList.length} INV / ${s.poList.length} PO
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    pop.innerHTML = `
        <!-- Summary Header -->
        <div style="flex-shrink: 0; padding: 14px 16px 12px 16px; background: linear-gradient(135deg, var(--bg-subtle, #f8fafc) 0%, var(--bg-surface, #ffffff) 100%); border-bottom: 1px solid var(--border-color, #e2e8f0);">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 1.08rem; font-weight: 800; color: var(--text-main, #0f172a);">📊 สรุปยอดแถว ${window.escapeHTML(aisleName)}</span>
                    <span style="font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: ${zType === 'main' ? 'rgba(2,132,199,0.14)' : 'rgba(217,119,6,0.14)'}; color: ${zType === 'main' ? '#0284c7' : '#d97706'};">
                        ${zType === 'main' ? '🔵 หลัก' : '🟡 เพิ่มเติม'}
                    </span>
                </div>
                <button type="button" onclick="closeAisleSummaryPopup()" style="background: var(--bg-subtle, #f1f5f9); border: 1px solid var(--border-color, #cbd5e1); border-radius: 50%; width: 32px; height: 32px; color: var(--text-main, #0f172a); cursor: pointer; font-size: 0.95rem; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;" title="ปิดหน้าต่างสรุปยอด">✖</button>
            </div>

            <!-- แถบสถิติรวมของแถว -->
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; font-size: 0.76rem;">
                <span style="font-weight: 800; padding: 3px 10px; border-radius: 12px; background: ${den.badgeBg}; color: ${den.badgeColor};">
                    รวม ${breakdown.totalItems} เครื่อง (${den.rawRate}%)
                </span>
                <span style="font-weight: 700; padding: 3px 10px; border-radius: 12px; background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); color: var(--text-sub, #334155);">
                    📦 ${breakdown.uniqueModelsCount} รุ่น • 🏷️ ${breakdown.uniqueSkusCount} รหัส • 📄 ${breakdown.invList.length} INV / ${breakdown.poList.length} PO
                </span>
                <span style="font-weight: 700; color: var(--text-muted, #64748b);">
                    ว่าง ${stats.availableSlots} ช่อง
                </span>
            </div>

            <!-- แท็บสลับมุมมอง + ช่องค้นหาในป๊อปอัป -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 10px;">
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button type="button" onclick="switchHoverPopoverTab('MODEL')" style="border: 1px solid ${activeHoverPopoverTab === 'MODEL' ? 'var(--primary, #0284c7)' : 'var(--border-color, #cbd5e1)'}; background: ${activeHoverPopoverTab === 'MODEL' ? 'var(--primary, #0284c7)' : 'var(--bg-surface, #fff)'}; color: ${activeHoverPopoverTab === 'MODEL' ? '#fff' : 'var(--text-main, #0f172a)'}; border-radius: 9px; padding: 5px 11px; font-size: 0.76rem; font-weight: 700; cursor: pointer;">
                        📦 รุ่นสินค้า (${breakdown.uniqueModelsCount})
                    </button>
                    <button type="button" onclick="switchHoverPopoverTab('SKU')" style="border: 1px solid ${activeHoverPopoverTab === 'SKU' ? 'var(--primary, #0284c7)' : 'var(--border-color, #cbd5e1)'}; background: ${activeHoverPopoverTab === 'SKU' ? 'var(--primary, #0284c7)' : 'var(--bg-surface, #fff)'}; color: ${activeHoverPopoverTab === 'SKU' ? '#fff' : 'var(--text-main, #0f172a)'}; border-radius: 9px; padding: 5px 11px; font-size: 0.76rem; font-weight: 700; cursor: pointer;">
                        🏷️ รหัสสินค้า (${breakdown.uniqueSkusCount})
                    </button>
                </div>

                ${breakdown.totalItems > 0 ? `
                    <input id="aisleSummarySearchInput" type="text" class="form-control" placeholder="🔍 กรองรุ่น/รหัส/INV/PO ในแถวนี้..." value="${window.escapeHTML(summaryPopoverSearchQuery)}" oninput="onSummaryPopoverSearchInput(this.value)" style="flex: 1 1 160px; min-width: 140px; height: 34px; min-height: 34px; padding: 4px 10px; font-size: 0.8rem; border-radius: 9px;">
                ` : ''}
            </div>
        </div>

        <!-- Summary Scrollable Body -->
        <div class="wms-popover-scroll-list">
            ${listBodyHtml}
        </div>

        <!-- Summary Footer (รองรับ Safe Area มือถือ 100% ไม่ตัดทอนด้านล่าง) -->
        <div class="wms-summary-footer-bar">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                ${breakdown.totalItems > 0 ? `
                    <button type="button" class="btn btn-sm btn-secondary" onclick="copyAislePickingSummary('${safeAisleJs}', '${escapeAttrJs(summaryPopoverSearchQuery)}', 'ALL')" style="font-size: 0.76rem; padding: 6px 11px; border-radius: 9px; font-weight: 700; min-height: 34px;">
                        📋 คัดลอกสรุปยอด
                    </button>
                ` : ''}
                <button type="button" class="btn btn-sm btn-primary" onclick="closeAisleSummaryPopup(); openAisleDetailModal('${safeAisleJs}', '${escapeAttrJs(summaryPopoverSearchQuery || globalLocationProductQuery)}', 'ALL')" style="font-size: 0.76rem; padding: 6px 12px; border-radius: 9px; font-weight: 700; min-height: 34px;">
                    🔍 ดู S/N ทั้งหมด
                </button>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="closeAisleSummaryPopup()" style="font-size: 0.76rem; padding: 6px 14px; border-radius: 9px; font-weight: 700; min-height: 34px;">
                ปิด
            </button>
        </div>
    `;

    overlay.style.display = 'flex';

    if (wasInputFocused) {
        const nextInput = document.getElementById('aisleSummarySearchInput');
        if (nextInput) {
            nextInput.focus();
            if (cursorStart !== null && cursorEnd !== null) {
                try { nextInput.setSelectionRange(cursorStart, cursorEnd); } catch (e) {}
            }
        }
    }
}

// คงชื่อฟังก์ชันเดิมไว้เพื่อความเข้ากันได้ย้อนหลัง 100%
function showAisleHoverPopover(aisleName) {
    openAisleSummaryPopup(aisleName);
}

// -------------------------------------------------------------------------
// 🚀 MODAL POPUP ENGINE: ป๊อปอัปขยายพื้นที่ใช้งานกว้างขวาง + สรุปรุ่น/รหัสสินค้า/INV/PO
// -------------------------------------------------------------------------
function switchModalSummaryTab(tabName, aisleName, filterQuery, bayFilter) {
    if (tabName === 'MODEL' || tabName === 'SKU') {
        activeModalSummaryTab = tabName;
        openAisleDetailModal(aisleName, filterQuery, bayFilter);
    }
}

function switchModalDocFilter(docMode, aisleName, filterQuery, bayFilter) {
    if (['ALL', 'HAS_INV', 'HAS_PO'].includes(docMode)) {
        activeModalDocFilter = docMode;
        openAisleDetailModal(aisleName, filterQuery, bayFilter);
    }
}

function openAisleDetailModal(aisleName, filterQuery = '', bayFilter = 'ALL') {
    if (!aisleName) return;
    closeAisleSummaryPopup();

    activeDetailModalState = { aisleName, filterQuery, bayFilter };

    // บันทึกสถานะโฟกัสและตำแหน่งเคอร์เซอร์ของช่องค้นหาก่อนอัปเดต DOM
    const prevInput = document.getElementById('aisleModalSearchInput');
    const wasInputFocused = (document.activeElement && prevInput && document.activeElement.id === 'aisleModalSearchInput');
    const cursorStart = wasInputFocused ? prevInput.selectionStart : null;
    const cursorEnd = wasInputFocused ? prevInput.selectionEnd : null;

    const stats = getAisleOccupancyStats(aisleName);
    const breakdown = getAisleModelBreakdown(aisleName);
    const den = stats.densityInfo;
    const zoneType = getAisleZoneType(aisleName);
    let rawItems = stats.itemsList || [];

    const safeAisleJs = escapeAttrJs(aisleName);
    const safeFilterJs = escapeAttrJs(filterQuery);
    const safeBayJs = escapeAttrJs(bayFilter);

    let items = [...rawItems];

    // กรองด้วย Bay Filter ถ้าเลือก
    if (bayFilter !== 'ALL') {
        items = items.filter(i => {
            const p = parseLocationComponents(i.location);
            return p.bay === bayFilter || String(parseInt(p.bay, 10)) === String(parseInt(bayFilter, 10));
        });
    }

    // กรองตามเอกสาร INV / PO
    if (activeModalDocFilter === 'HAS_INV') {
        items = items.filter(i => Boolean(resolveLocationItemInvNo(i)));
    } else if (activeModalDocFilter === 'HAS_PO') {
        items = items.filter(i => Boolean(resolveLocationItemPoNo(i)));
    }

    // กรองด้วย Search Filter (รองรับทั้งรุ่น, รหัส, S/N, พิกัด, INV, PO)
    if (filterQuery.trim() !== '') {
        const q = filterQuery.toLowerCase().trim();
        items = items.filter(i => {
            const inv = resolveLocationItemInvNo(i).toLowerCase();
            const po = resolveLocationItemPoNo(i).toLowerCase();
            return (i.sn && String(i.sn).toLowerCase().includes(q)) ||
                (i.category && String(i.category).toLowerCase().includes(q)) ||
                (i.sku && String(i.sku).toLowerCase().includes(q)) ||
                (i.code && String(i.code).toLowerCase().includes(q)) ||
                (i.name && String(i.name).toLowerCase().includes(q)) ||
                (i.location && String(i.location).toLowerCase().includes(q)) ||
                (inv && inv.includes(q)) ||
                (po && po.includes(q));
        });
    }

    // เรียงลำดับตามพิกัดจัดเก็บจริง (Bay -> Shelf -> Slot) เพื่อความสะดวกในการเบิกสินค้า
    items.sort((a, b) => compareLocationsNaturally(a.location, b.location));

    let modalElem = document.getElementById('aisleDetailModal');
    if (!modalElem) {
        modalElem = document.createElement('div');
        modalElem.id = 'aisleDetailModal';
        modalElem.className = 'modal-overlay';
        modalElem.style.display = 'none';
        document.body.appendChild(modalElem);
    }

    // ปิด Modal เมื่อคลิกที่พื้นหลัง Overlay
    modalElem.onclick = function(e) {
        if (e.target === modalElem) closeAisleDetailModal();
    };

    // สร้างแถบสรุปรุ่นสินค้าและรหัสสินค้าประจำแถวนี้ (คลิกเพื่อกรองเบิกได้ทันที)
    let summaryCardsHtml = '';
    if (breakdown.totalItems > 0) {
        if (activeModalSummaryTab === 'MODEL') {
            summaryCardsHtml = breakdown.modelsList.map(m => {
                const isSelected = filterQuery.trim().toLowerCase() === m.name.toLowerCase();
                const nextFilter = isSelected ? '' : m.name;
                const bayListStr = m.bays.slice(0, 4).map(b => `Bay ${b}`).join(', ') + (m.bays.length > 4 ? ` +${m.bays.length - 4}` : '');
                const docInfo = (m.invList.length > 0 || m.poList.length > 0)
                    ? ` · ${m.invList.length} INV / ${m.poList.length} PO`
                    : '';
                return `
                    <div class="wms-modal-summary-chip ${isSelected ? 'is-active' : ''}" onclick="openAisleDetailModal('${safeAisleJs}', '${escapeAttrJs(nextFilter)}', '${safeBayJs}')" title="คลิกเพื่อ${isSelected ? 'แสดงทุกรุ่น' : 'กรองดูเฉพาะรุ่นนี้'}">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                            <span style="font-weight: 800; font-size: 0.82rem; color: var(--text-main, #0f172a); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                📦 ${window.escapeHTML(m.name)}
                            </span>
                            <span style="flex-shrink: 0; font-size: 0.74rem; font-weight: 800; padding: 1px 8px; border-radius: 12px; background: var(--primary, #0284c7); color: #ffffff;">
                                ${m.count} เครื่อง
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 0.72rem; color: var(--text-muted, #64748b);">
                            <span>🏷️ <strong>${window.escapeHTML(m.skuCode)}</strong>${window.escapeHTML(docInfo)}</span>
                            <span>📍 ${window.escapeHTML(bayListStr)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            summaryCardsHtml = breakdown.skuList.map(s => {
                const isSelected = filterQuery.trim().toLowerCase() === s.skuCode.toLowerCase();
                const nextFilter = isSelected ? '' : s.skuCode;
                const bayListStr = s.bays.slice(0, 4).map(b => `Bay ${b}`).join(', ') + (s.bays.length > 4 ? ` +${s.bays.length - 4}` : '');
                return `
                    <div class="wms-modal-summary-chip ${isSelected ? 'is-active' : ''}" onclick="openAisleDetailModal('${safeAisleJs}', '${escapeAttrJs(nextFilter)}', '${safeBayJs}')" title="คลิกเพื่อ${isSelected ? 'แสดงทุกรหัสสินค้า' : 'กรองดูเฉพาะรหัสสินค้านี้'}">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                            <span style="font-weight: 800; font-size: 0.82rem; color: var(--primary-text, #0284c7);">
                                🏷️ ${window.escapeHTML(s.skuCode)}
                            </span>
                            <span style="flex-shrink: 0; font-size: 0.74rem; font-weight: 800; padding: 1px 8px; border-radius: 12px; background: #059669; color: #fff;">
                                ${s.count} เครื่อง
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 0.72rem; color: var(--text-muted, #64748b);">
                            <span>📦 ${s.modelsCount} รุ่น · ${s.invList.length} INV / ${s.poList.length} PO</span>
                            <span>📍 ${window.escapeHTML(bayListStr)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    let itemsRowsHtml = '';
    if (items.length === 0) {
        itemsRowsHtml = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 48px 20px; color: var(--text-muted, #64748b);">
                    <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--bg-subtle, #f1f5f9); border: 1px solid var(--border-color, #cbd5e1); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                        <i class="fa-solid fa-box-open" style="font-size: 2rem; color: var(--text-muted, #94a3b8);"></i>
                    </div>
                    <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-main, #0f172a);">ไม่พบข้อมูลรายการสินค้าในแถว ${window.escapeHTML(aisleName)}</div>
                    <div style="font-size: 0.86rem; margin-top: 4px;">ยังไม่มีสินค้าจัดเก็บในแถวนี้ หรือไม่ตรงกับเงื่อนไขการค้นหา/กรอง</div>
                </td>
            </tr>
        `;
    } else {
        const rowChunks = new Array(items.length);
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const rawLoc = item.location || '-';
            const locJs = escapeAttrJs(rawLoc);
            const categoryStr = window.escapeHTML(resolveItemProductCode(item));
            const nameStr = window.escapeHTML(resolveItemModelName(item));
            const rawSn = item.sn || '-';
            const snStr = window.escapeHTML(rawSn);
            const snJs = escapeAttrJs(rawSn);
            const idJs = escapeAttrJs(item.id || '');
            const formattedLoc = formatCompactLocationTag(item.location);
            const invNo = resolveLocationItemInvNo(item);
            const poNo = resolveLocationItemPoNo(item);
            const docBadgesHtml = renderLocationDocBadgesHTML(invNo, poNo);

            const relocateBtnHtml = typeof window.openQuickRelocateModal === 'function'
                ? `<button type="button" class="wms-loc-action-btn" onclick="openQuickRelocateModal('SINGLE', '${snJs}')" title="ย้ายพิกัดจัดเก็บเครื่องนี้">📍 ย้าย</button>`
                : '';

            const deleteBtnHtml = typeof window.triggerDeleteItemAction === 'function'
                ? `<button type="button" class="wms-loc-action-btn wms-loc-action-btn--danger" onclick="triggerDeleteItemAction('SINGLE', '${snJs}', '${idJs}')" title="ลบซีเรียลนี้ออกจากสต็อก">🗑️</button>`
                : '';

            rowChunks[index] = `
                <tr style="transition: background 0.15s ease;">
                    <td style="font-weight: 800; font-family: monospace;">
                        <span class="badge-location" style="font-size: 0.84rem; padding: 4px 10px; cursor: pointer;" onclick="copyTextToClipboard('${locJs}', 'พิกัดสินค้า')" title="คลิกเพื่อคัดลอกพิกัด">
                            📍 ${window.escapeHTML(formattedLoc)}
                        </span>
                    </td>
                    <td>
                        <span style="font-size: 0.78rem; font-weight: 800; padding: 3px 10px; border-radius: 8px; background: var(--primary-light, rgba(2,132,199,0.1)); border: 1px solid var(--primary-border, rgba(2,132,199,0.25)); color: var(--primary-text, #0284c7);">
                            ${categoryStr}
                        </span>
                    </td>
                    <td style="font-weight: 700; color: var(--text-main, #0f172a); min-width: 190px; white-space: normal; word-break: break-word;">
                        ${nameStr}
                    </td>
                    <td style="min-width: 150px;">
                        ${docBadgesHtml}
                    </td>
                    <td style="font-family: monospace; font-weight: 700; color: var(--text-sub, #334155);">
                        <span style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-color, #e2e8f0);" onclick="copyTextToClipboard('${snJs}', 'Serial Number')" title="คลิกเพื่อคัดลอก S/N">
                            🏷️ ${snStr} <i class="fa-regular fa-copy" style="font-size:0.75rem; color:var(--text-muted);"></i>
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <div style="display:inline-flex; align-items:center; gap:5px; justify-content:flex-end;">
                            ${relocateBtnHtml}
                            ${deleteBtnHtml}
                            <button type="button" class="btn btn-sm btn-primary" onclick="closeAisleDetailModal(); linkToInventoryView('${snJs !== '-' ? snJs : locJs}')" style="font-size: 0.78rem; padding: 5px 11px; border-radius: 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;" title="ลิงก์ไปยังสินค้าชิ้นนี้ในหน้าเช็กสต็อกสินค้า">
                                <i class="fa-solid fa-arrow-right-to-bracket"></i> สต็อก
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }
        itemsRowsHtml = rowChunks.join('');
    }

    // สร้าง Bay Filter Pills ปุ่มเลือก ล็อก (Bay) พร้อมแสดงจำนวนชิ้นในแต่ละ Bay
    let bayPillsHtml = `<button type="button" class="btn btn-sm ${bayFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" onclick="openAisleDetailModal('${safeAisleJs}', '${safeFilterJs}', 'ALL')" style="border-radius: 20px; font-weight: 700; white-space: nowrap;">ทุก Bay (${rawItems.length})</button>`;
    for (let b = 1; b <= stats.baysCount; b++) {
        const bStr = String(b).padStart(2, '0');
        const isSel = (bayFilter === bStr || bayFilter === String(b));
        const bCount = stats.bayCounts[b] || 0;
        bayPillsHtml += `
            <button type="button" class="btn btn-sm ${isSel ? 'btn-primary' : 'btn-secondary'}" onclick="openAisleDetailModal('${safeAisleJs}', '${safeFilterJs}', '${bStr}')" style="border-radius: 20px; font-weight: 700; padding: 4px 12px; white-space: nowrap;">
                Bay ${bStr} <span style="opacity:0.8; font-size:0.74rem;">(${bCount})</span>
            </button>
        `;
    }

    modalElem.innerHTML = `
        <div style="background: var(--bg-surface, #ffffff); border: 1px solid var(--border-strong, #cbd5e1); border-radius: 24px; width: 96%; max-width: 1240px; height: 93dvh; max-height: 920px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,0.35); animation: viewFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);">
            
            <!-- Modal Header -->
            <div style="padding: 14px 20px; background: linear-gradient(135deg, var(--bg-surface, #ffffff) 0%, var(--bg-subtle, #f8fafc) 100%); border-bottom: 1px solid var(--border-color, #e2e8f0); flex-shrink: 0;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 44px; height: 44px; border-radius: 14px; background: ${zoneType === 'main' ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)' : 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; box-shadow: 0 6px 18px rgba(2, 132, 199, 0.35); flex-shrink: 0;">
                            <i class="fa-solid fa-layer-group"></i>
                        </div>
                        <div>
                            <div style="font-size: 1.12rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <span>รายละเอียดสินค้าประจำแถว: <strong style="color:var(--primary,#0284c7); font-size:1.25rem;">${window.escapeHTML(aisleName)}</strong></span>
                                <span style="font-size: 0.74rem; padding: 2px 9px; border-radius: 8px; font-weight: 800; background: ${zoneType === 'main' ? 'rgba(2,132,199,0.15)' : 'rgba(217,119,6,0.15)'}; color: ${zoneType === 'main' ? '#0284c7' : '#d97706'}; border: 1px solid ${zoneType === 'main' ? 'rgba(2,132,199,0.3)' : 'rgba(217,119,6,0.3)'};">
                                    ${zoneType === 'main' ? '🔵 โครงสร้างหลัก' : '🟡 โครงสร้างเพิ่มเติม'}
                                </span>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted, #64748b); margin-top: 2px;">
                                ขนาดความจุแร็ค: <strong>${stats.baysCount}</strong> Bay • <strong>${stats.shelvesCount}</strong> ชั้น • <strong>${stats.slotsCount}</strong> ช่อง • เอกสาร: <strong>${breakdown.invList.length} INV / ${breakdown.poList.length} PO</strong>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 7px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="copyAislePickingSummary('${safeAisleJs}', '${safeFilterJs}', '${safeBayJs}')" style="font-size: 0.78rem; padding: 6px 12px; border-radius: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;" title="คัดลอกสรุปรุ่น รหัสสินค้า INV/PO และพิกัดสำหรับเบิก">
                            <i class="fa-solid fa-clipboard-list" style="color: #0284c7;"></i> คัดลอกสรุปเบิก
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="copyAllAisleSerials('${safeAisleJs}', '${safeFilterJs}', '${safeBayJs}')" style="font-size: 0.78rem; padding: 6px 12px; border-radius: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;" title="คัดลอก Serial Number ทั้งหมดที่แสดงอยู่">
                            <i class="fa-regular fa-copy"></i> คัดลอก S/N
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="exportAisleItemsToCSV('${safeAisleJs}', '${safeFilterJs}', '${safeBayJs}')" style="font-size: 0.78rem; padding: 6px 12px; border-radius: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;" title="ดาวน์โหลดรายการในแถวนี้เป็น CSV พร้อม INV/PO">
                            <i class="fa-solid fa-file-csv" style="color: #059669;"></i> Export CSV
                        </button>
                        <button type="button" class="btn btn-sm btn-primary" onclick="closeAisleDetailModal(); linkToInventoryView('${safeAisleJs}')" style="font-size: 0.8rem; padding: 6px 14px; border-radius: 10px; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);">
                            <i class="fa-solid fa-arrow-right-to-bracket"></i> ไปหน้าเช็กสต็อกแถวนี้
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary icon-only-btn" onclick="closeAisleDetailModal()" style="border-radius: 50%; width: 36px; height: 36px; font-size: 1.1rem; cursor: pointer;" title="ปิดหน้าต่าง (ESC)">
                            ✖
                        </button>
                    </div>
                </div>

                <!-- Dashboard สถิติสรุปแบบ Grid ย่อย -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 10px;">
                    <div style="background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 11px; padding: 7px 11px; display: flex; align-items: center; gap: 9px;">
                        <div style="font-size: 1.15rem; color: var(--primary, #0284c7);"><i class="fa-solid fa-boxes-stacked"></i></div>
                        <div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">สินค้าในแถวนี้</div>
                            <div style="font-size: 0.98rem; font-weight: 800; color: var(--text-main);">${stats.occupiedSlots} เครื่อง</div>
                        </div>
                    </div>

                    <div style="background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 11px; padding: 7px 11px; display: flex; align-items: center; gap: 9px;">
                        <div style="font-size: 1.15rem; color: var(--warning, #d97706);"><i class="fa-solid fa-tags"></i></div>
                        <div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">รุ่น / รหัสสินค้า</div>
                            <div style="font-size: 0.98rem; font-weight: 800; color: var(--text-main);">${breakdown.uniqueModelsCount} รุ่น • ${breakdown.uniqueSkusCount} รหัส</div>
                        </div>
                    </div>

                    <div style="background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 11px; padding: 7px 11px; display: flex; align-items: center; gap: 9px;">
                        <div style="font-size: 1.15rem; color: var(--success, #059669);"><i class="fa-solid fa-chart-pie"></i></div>
                        <div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">ความหนาแน่น</div>
                            <div style="font-size: 0.98rem; font-weight: 800; color: ${den.badgeColor};">${den.rawRate}%</div>
                        </div>
                    </div>

                    <div style="background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 11px; padding: 7px 11px; display: flex; align-items: center; gap: 9px;">
                        <div style="font-size: 1.15rem; color: var(--purple, #7c3aed);"><i class="fa-solid fa-cubes"></i></div>
                        <div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">ช่องว่างคงเหลือ</div>
                            <div style="font-size: 0.98rem; font-weight: 800; color: var(--text-main);">${stats.availableSlots} ช่อง</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- แผงสรุปรุ่นสินค้าและรหัสสินค้าประจำแถวนี้ (คลิกเพื่อคัดกรองเบิกทันที) -->
            ${breakdown.totalItems > 0 ? `
                <div style="padding: 9px 20px; background: var(--bg-subtle, #f8fafc); border-bottom: 1px solid var(--border-color, #e2e8f0); flex-shrink: 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 7px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-size: 0.76rem; font-weight: 800; color: var(--text-sub, #334155);">สรุปจำนวนเครื่องในแถว (คลิกเพื่อกรอง):</span>
                            <button type="button" class="btn btn-sm ${activeModalSummaryTab === 'MODEL' ? 'btn-primary' : 'btn-secondary'}" onclick="switchModalSummaryTab('MODEL', '${safeAisleJs}', '${safeFilterJs}', '${safeBayJs}')" style="border-radius: 20px; font-size: 0.73rem; padding: 3px 10px; font-weight: 700;">
                                📦 แยกตามชื่อรุ่น (${breakdown.uniqueModelsCount})
                            </button>
                            <button type="button" class="btn btn-sm ${activeModalSummaryTab === 'SKU' ? 'btn-primary' : 'btn-secondary'}" onclick="switchModalSummaryTab('SKU', '${safeAisleJs}', '${safeFilterJs}', '${safeBayJs}')" style="border-radius: 20px; font-size: 0.73rem; padding: 3px 10px; font-weight: 700;">
                                🏷️ แยกตามรหัสสินค้า (${breakdown.uniqueSkusCount})
                            </button>
                            <button type="button" class="btn btn-sm ${activeModalDocFilter === 'HAS_INV' ? 'btn-primary' : 'btn-secondary'}" onclick="switchModalDocFilter('${activeModalDocFilter === 'HAS_INV' ? 'ALL' : 'HAS_INV'}', '${safeAisleJs}', '${safeFilterJs}', '${safeBayJs}')" style="border-radius: 20px; font-size: 0.73rem; padding: 3px 10px; font-weight: 700;">
                                📄 มี INV (${breakdown.invList.length})
                            </button>
                            <button type="button" class="btn btn-sm ${activeModalDocFilter === 'HAS_PO' ? 'btn-primary' : 'btn-secondary'}" onclick="switchModalDocFilter('${activeModalDocFilter === 'HAS_PO' ? 'ALL' : 'HAS_PO'}', '${safeAisleJs}', '${safeFilterJs}', '${safeBayJs}')" style="border-radius: 20px; font-size: 0.73rem; padding: 3px 10px; font-weight: 700;">
                                🧾 มี PO (${breakdown.poList.length})
                            </button>
                            ${filterQuery.trim() !== '' ? `
                                <button type="button" class="btn btn-sm btn-warning" onclick="openAisleDetailModal('${safeAisleJs}', '', '${safeBayJs}')" style="border-radius: 20px; font-size: 0.73rem; padding: 3px 10px; font-weight: 700;">
                                    ✖ ล้างตัวกรอง (${window.escapeHTML(filterQuery)})
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch;">
                        ${summaryCardsHtml}
                    </div>
                </div>
            ` : ''}

            <!-- Modal Filter Bar (ค้นหา + เลือก Bay) -->
            <div style="padding: 9px 20px; background: var(--bg-surface, #ffffff); border-bottom: 1px solid var(--border-color, #e2e8f0); flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                <div style="position: relative; flex: 1; min-width: 220px;">
                    <input id="aisleModalSearchInput" type="text" class="form-control" placeholder="🔍 ค้นหาในแถวนี้ (ชื่อรุ่น, รหัสสินค้า, INV, PO, S/N, พิกัด)..." value="${window.escapeHTML(filterQuery)}" oninput="openAisleDetailModal('${safeAisleJs}', this.value, '${safeBayJs}')" style="padding-left: 36px; border-radius: 12px; font-size: 0.85rem; height: 38px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--text-muted, #94a3b8); font-size: 0.86rem;"></i>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-bottom: 2px; max-width: 100%; -webkit-overflow-scrolling: touch;">
                    <span style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); white-space: nowrap; margin-right: 4px;">เลือกล็อก (Bay):</span>
                    ${bayPillsHtml}
                </div>
            </div>

            <!-- Modal Body: Items Table (ขยายกว้าง จุข้อมูลได้ชัดเจน เรียงตามพิกัดเบิก + แสดง INV/PO) -->
            <div style="flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: auto; padding: 0; -webkit-overflow-scrolling: touch;">
                <table class="modern-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="position: sticky; top: 0; z-index: 10; background: var(--bg-subtle, #f1f5f9);">
                            <th style="width: 150px; padding: 10px 14px;">📍 พิกัดจัดเก็บ</th>
                            <th style="width: 140px; padding: 10px 14px;">🏷️ รหัสสินค้า/หมวด</th>
                            <th style="padding: 10px 14px;">📦 ชื่อรุ่นสินค้า</th>
                            <th style="width: 165px; padding: 10px 14px;">📄 เลขที่ INV / PO</th>
                            <th style="width: 205px; padding: 10px 14px;">🔢 Serial Number</th>
                            <th style="width: 195px; text-align: right; padding: 10px 14px;">⚙️ จัดการ / ลิงก์</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Modal Footer (รองรับ Safe Area มือถือครบ 100% ไม่โดนตัดด้านล่าง) -->
            <div style="padding: 11px 20px calc(11px + env(safe-area-inset-bottom, 0px)) 20px; background: var(--bg-surface, #ffffff); border-top: 1px solid var(--border-color, #e2e8f0); flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: var(--text-muted, #64748b); flex-wrap: wrap; gap: 8px;">
                <div>
                    กำลังแสดง <strong style="color:var(--text-main);">${items.length}</strong> จากทั้งหมด <strong style="color:var(--text-main);">${stats.occupiedSlots}</strong> เครื่องในแถว <strong style="color:var(--primary);">${window.escapeHTML(aisleName)}</strong>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="closeAisleDetailModal()" style="border-radius: 10px; font-weight: 700; padding: 6px 16px;">
                        ปิดหน้าต่าง
                    </button>
                </div>
            </div>
        </div>
    `;

    modalElem.style.display = 'flex';
    modalElem.classList.add('active', 'show');

    // คืนโฟกัสและตำแหน่งเคอร์เซอร์ให้ช่องค้นหาใน Modal (พิมพ์ต่อเนื่องไม่สะดุดทุก OS)
    if (wasInputFocused) {
        const nextInput = document.getElementById('aisleModalSearchInput');
        if (nextInput) {
            nextInput.focus();
            if (cursorStart !== null && cursorEnd !== null) {
                try { nextInput.setSelectionRange(cursorStart, cursorEnd); } catch (e) {}
            }
        }
    }
}

function closeAisleDetailModal() {
    activeDetailModalState = { aisleName: '', filterQuery: '', bayFilter: 'ALL' };
    activeModalDocFilter = 'ALL';
    const modalElem = document.getElementById('aisleDetailModal');
    if (modalElem) {
        modalElem.style.display = 'none';
        modalElem.classList.remove('active', 'show');
    }
}

// ฟังการกดปุ่ม ESC บนแป้นพิมพ์เพื่อปิด Modal หรือ Summary Popup
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        closeAisleDetailModal();
        closeAisleSummaryPopup();
        closeGlobalModelAutocomplete();
    }
});

// ปิด Dropdown แนะนำรุ่นสินค้าเมื่อคลิกพื้นที่ภายนอก
document.addEventListener('click', function(e) {
    const wrapper = document.getElementById('globalLocSearchAutocompleteWrap');
    if (wrapper && !wrapper.contains(e.target)) {
        closeGlobalModelAutocomplete();
    }
});

// -------------------------------------------------------------------------
// 🔍 Global Model / SKU / INV / PO Autocomplete Dropdown Helpers (v29.0)
// -------------------------------------------------------------------------
function openGlobalModelAutocomplete() {
    isGlobalModelDropdownOpen = true;
    renderGlobalModelAutocompleteDropdown();
}

function closeGlobalModelAutocomplete() {
    isGlobalModelDropdownOpen = false;
    const dd = document.getElementById('globalModelAutocompleteBox');
    if (dd) dd.classList.remove('is-open');
}

function applyGlobalModelSuggestion(selectedText) {
    globalLocationProductQuery = String(selectedText || '').trim();
    isGlobalModelDropdownOpen = false;
    renderDrillDownAisleBar(true);
}

function clearGlobalLocationProductSearch() {
    globalLocationProductQuery = '';
    isGlobalModelDropdownOpen = false;
    renderDrillDownAisleBar(true);
}

function renderGlobalModelAutocompleteDropdown() {
    const dd = document.getElementById('globalModelAutocompleteBox');
    if (!dd) return;

    if (!isGlobalModelDropdownOpen) {
        dd.classList.remove('is-open');
        return;
    }

    const catalog = getGlobalCatalogBreakdown();
    const q = globalLocationProductQuery.trim().toLowerCase();

    const matchedModels = catalog.models
        .filter(m => q === '' || m.name.toLowerCase().includes(q) || m.skus.some(s => s.toLowerCase().includes(q)) || m.invs.some(iv => iv.toLowerCase().includes(q)) || m.pos.some(po => po.toLowerCase().includes(q)))
        .sort((a, b) => {
            if (q !== '') {
                const aStarts = a.name.toLowerCase().startsWith(q) ? 1 : 0;
                const bStarts = b.name.toLowerCase().startsWith(q) ? 1 : 0;
                if (aStarts !== bStarts) return bStarts - aStarts;
            }
            return b.totalCount - a.totalCount;
        })
        .slice(0, 8);

    const matchedSkus = catalog.skus
        .filter(s => q === '' || s.skuCode.toLowerCase().includes(q) || s.invs.some(iv => iv.toLowerCase().includes(q)) || s.pos.some(po => po.toLowerCase().includes(q)))
        .slice(0, 5);

    if (matchedModels.length === 0 && matchedSkus.length === 0) {
        dd.innerHTML = `
            <div style="padding: 14px; text-align: center; font-size: 0.82rem; color: var(--text-muted, #64748b);">
                ไม่พบชื่อรุ่น รหัสสินค้า หรือเลข INV/PO ที่ตรงกับ "${window.escapeHTML(globalLocationProductQuery)}"
            </div>
        `;
        dd.classList.add('is-open');
        return;
    }

    let html = '';
    if (matchedModels.length > 0) {
        html += `<div style="padding: 6px 12px; font-size: 0.72rem; font-weight: 800; color: var(--text-muted, #64748b); background: var(--bg-subtle, #f8fafc); border-bottom: 1px solid var(--border-color, #e2e8f0);">📦 รุ่นสินค้าในคลัง (คลิกเพื่อคัดกรองแถวเบิก)</div>`;
        html += matchedModels.map(m => {
            const aisleBadges = m.aisles.map(a => `<span style="padding: 1px 6px; border-radius: 6px; background: rgba(2,132,199,0.12); color: #0284c7; font-weight: 700; font-size: 0.7rem;">แถว ${window.escapeHTML(a.aisle)} (${a.count})</span>`).join(' ');
            const docNote = (m.invs.length > 0 || m.pos.length > 0) ? ` · ${m.invs.length} INV / ${m.pos.length} PO` : '';
            return `
                <div class="wms-model-suggest-item" onclick="applyGlobalModelSuggestion('${escapeAttrJs(m.name)}')">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span style="font-weight: 800; font-size: 0.83rem; color: var(--text-main, #0f172a);">${window.escapeHTML(m.name)}</span>
                        <span style="font-size: 0.74rem; font-weight: 800; color: #059669; white-space: nowrap;">รวม ${m.totalCount} เครื่อง</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                        <span style="font-size: 0.7rem; color: var(--text-muted, #64748b);">รหัส: ${window.escapeHTML(m.skus.join(', '))}${window.escapeHTML(docNote)}</span>
                        ${aisleBadges}
                    </div>
                </div>
            `;
        }).join('');
    }

    if (matchedSkus.length > 0) {
        html += `<div style="padding: 6px 12px; font-size: 0.72rem; font-weight: 800; color: var(--text-muted, #64748b); background: var(--bg-subtle, #f8fafc); border-top: 1px solid var(--border-color, #e2e8f0); border-bottom: 1px solid var(--border-color, #e2e8f0);">🏷️ รหัสสินค้า / หมวดหมู่</div>`;
        html += matchedSkus.map(s => {
            const aisleBadges = s.aisles.map(a => `<span style="padding: 1px 6px; border-radius: 6px; background: rgba(5,150,105,0.12); color: #059669; font-weight: 700; font-size: 0.7rem;">แถว ${window.escapeHTML(a.aisle)} (${a.count})</span>`).join(' ');
            return `
                <div class="wms-model-suggest-item" onclick="applyGlobalModelSuggestion('${escapeAttrJs(s.skuCode)}')">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span style="font-weight: 800; font-size: 0.82rem; color: var(--primary-text, #0284c7);">🏷️ ${window.escapeHTML(s.skuCode)}</span>
                        <span style="font-size: 0.74rem; font-weight: 800; color: var(--text-main, #0f172a); white-space: nowrap;">${s.modelsCount} รุ่น • ${s.totalCount} เครื่อง</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                        ${aisleBadges}
                    </div>
                </div>
            `;
        }).join('');
    }

    dd.innerHTML = html;
    dd.classList.add('is-open');
}

// -------------------------------------------------------------------------
// UI Rendering Engine: ผังตำแหน่งคลังสินค้า (โครงสร้างหลัก & โครงสร้างเพิ่มเติม)
// -------------------------------------------------------------------------
function renderDrillDownAisleBar(immediate = true) {
    const container = document.getElementById('aisleFilterBar');
    if (!container) return;

    // เก็บสถานะโฟกัสของช่องค้นหาบนหน้าผัง (ถ้าผู้ใช้งานกำลังพิมพ์อยู่)
    const activeId = document.activeElement ? document.activeElement.id : '';
    const cursorStart = (activeId === 'aisleNameSearchInput' || activeId === 'globalLocProductSearchInput') ? document.activeElement.selectionStart : null;
    const cursorEnd = (activeId === 'aisleNameSearchInput' || activeId === 'globalLocProductSearchInput') ? document.activeElement.selectionEnd : null;

    const aisles = getAllConfiguredAisles();
    getIndexedInventoryByAisle();
    const dockWaitingCount = indexedInventoryCache.dockItems.length;
    const officeCount = indexedInventoryCache.officeItems.length;

    // คำนวณสถิติทุกแถวเพียงครั้งเดียว (Single-Pass Caching) ลดงานซ้ำซ้อน
    let totalWhCapacity = 0;
    let totalWhOccupied = 0;
    let countMainAisles = 0;
    let countAuxAisles = 0;
    const statsByAisle = new Map();
    const breakdownByAisle = new Map();
    const zoneByAisle = new Map();

    // นับจำนวนแถวแยกตามระดับความหนาแน่น
    const densityCounts = { ALL: aisles.length, LOW: 0, MEDIUM: 0, HIGH: 0, FULL: 0 };

    // คำค้นหารุ่น / รหัสสินค้า / INV / PO / S/N ข้ามทุกแถว
    const productQ = globalLocationProductQuery.trim().toLowerCase();
    const productMatchCountByAisle = new Map();
    const productMatchedDetailsByAisle = new Map();
    let totalMatchedProducts = 0;
    const allMatchedPickingLocations = [];

    for (let i = 0; i < aisles.length; i++) {
        const a = aisles[i];
        const st = getAisleOccupancyStats(a);
        const bd = getAisleModelBreakdown(a);
        const zType = getAisleZoneType(a);
        statsByAisle.set(a, st);
        breakdownByAisle.set(a, bd);
        zoneByAisle.set(a, zType);

        totalWhCapacity += st.totalCapacity;
        totalWhOccupied += st.occupiedSlots;
        if (zType === 'main') countMainAisles++;
        else countAuxAisles++;

        densityCounts[st.densityInfo.levelKey] = (densityCounts[st.densityInfo.levelKey] || 0) + 1;

        if (productQ !== '') {
            let matchCnt = 0;
            const matchedModelsInAisle = new Map();
            const matchedLocationsInAisle = [];
            const list = st.itemsList;

            for (let j = 0; j < list.length; j++) {
                const it = list[j];
                const mName = resolveItemModelName(it);
                const sCode = resolveItemProductCode(it);
                const snStr = String(it.sn || '');
                const locStr = String(it.location || '');
                const invStr = resolveLocationItemInvNo(it);
                const poStr = resolveLocationItemPoNo(it);

                if (snStr.toLowerCase().includes(productQ) ||
                    mName.toLowerCase().includes(productQ) ||
                    sCode.toLowerCase().includes(productQ) ||
                    locStr.toLowerCase().includes(productQ) ||
                    (invStr && invStr.toLowerCase().includes(productQ)) ||
                    (poStr && poStr.toLowerCase().includes(productQ))) {
                    matchCnt++;
                    const key = `${mName}|||${sCode}`;
                    if (!matchedModelsInAisle.has(key)) {
                        matchedModelsInAisle.set(key, { name: mName, skuCode: sCode, count: 0 });
                    }
                    matchedModelsInAisle.get(key).count += 1;
                    matchedLocationsInAisle.push(locStr);
                    allMatchedPickingLocations.push(locStr);
                }
            }
            if (matchCnt > 0) {
                matchedLocationsInAisle.sort(compareLocationsNaturally);
                productMatchCountByAisle.set(a, matchCnt);
                productMatchedDetailsByAisle.set(a, {
                    models: Array.from(matchedModelsInAisle.values()).sort((x, y) => y.count - x.count),
                    locations: matchedLocationsInAisle
                });
                totalMatchedProducts += matchCnt;
            }
        }
    }

    const whDensity = getDensityInfo(totalWhOccupied, totalWhCapacity);

    // อัปเดตสถานะปุ่มตัวกรองโครงสร้าง
    const btnAll = document.getElementById('btnZoneFilterAll');
    const btnMain = document.getElementById('btnZoneFilterMain');
    const btnAux = document.getElementById('btnZoneFilterAux');

    if (btnAll && btnMain && btnAux) {
        btnAll.style.background = activeAisleZoneFilter === 'ALL' ? 'var(--primary)' : 'transparent';
        btnAll.style.color = activeAisleZoneFilter === 'ALL' ? '#ffffff' : 'var(--text-main)';
        
        btnMain.style.background = activeAisleZoneFilter === 'MAIN' ? 'var(--primary)' : 'transparent';
        btnMain.style.color = activeAisleZoneFilter === 'MAIN' ? '#ffffff' : 'var(--text-main)';
        
        btnAux.style.background = activeAisleZoneFilter === 'AUXILIARY' ? 'var(--warning)' : 'transparent';
        btnAux.style.color = activeAisleZoneFilter === 'AUXILIARY' ? '#ffffff' : 'var(--text-main)';
    }

    // กรองแถวตามประเภทโครงสร้างที่เลือก
    let displayedAisles = aisles;
    if (activeAisleZoneFilter === 'MAIN') {
        displayedAisles = displayedAisles.filter(a => zoneByAisle.get(a) === 'main');
    } else if (activeAisleZoneFilter === 'AUXILIARY') {
        displayedAisles = displayedAisles.filter(a => zoneByAisle.get(a) === 'auxiliary');
    }

    // กรองตามระดับความหนาแน่น
    if (activeAisleDensityFilter !== 'ALL') {
        displayedAisles = displayedAisles.filter(a => statsByAisle.get(a).densityInfo.levelKey === activeAisleDensityFilter);
    }

    // กรองด้วยคำค้นชื่อแถว
    if (aisleFilterSearchQuery.trim() !== '') {
        const q = aisleFilterSearchQuery.toLowerCase().trim();
        displayedAisles = displayedAisles.filter(a => a.toLowerCase().includes(q));
    }

    // กรองเฉพาะแถวที่พบสินค้าเมื่อมีการค้นหารุ่น/รหัสสินค้า/INV/PO/S/N ข้ามทุกแถว
    if (productQ !== '') {
        displayedAisles = displayedAisles.filter(a => (productMatchCountByAisle.get(a) || 0) > 0);
    }

    // จัดเรียงแถวตามโหมดที่เลือก
    if (activeAisleSortMode === 'DENSITY_DESC') {
        displayedAisles = [...displayedAisles].sort((a, b) => statsByAisle.get(b).rawOccupancyRate - statsByAisle.get(a).rawOccupancyRate);
    } else if (activeAisleSortMode === 'AVAILABLE_DESC') {
        displayedAisles = [...displayedAisles].sort((a, b) => statsByAisle.get(b).availableSlots - statsByAisle.get(a).availableSlots);
    } else if (activeAisleSortMode === 'MATCH_DESC' && productQ !== '') {
        displayedAisles = [...displayedAisles].sort((a, b) => (productMatchCountByAisle.get(b) || 0) - (productMatchCountByAisle.get(a) || 0));
    }

    const densityPillsConfig = [
        { key: 'ALL', label: `ทั้งหมด (${densityCounts.ALL})` },
        { key: 'LOW', label: `🟢 ว่าง (${densityCounts.LOW})` },
        { key: 'MEDIUM', label: `🔵 ปานกลาง (${densityCounts.MEDIUM})` },
        { key: 'HIGH', label: `🟡 หนาแน่นสูง (${densityCounts.HIGH})` },
        { key: 'FULL', label: `🔴 เต็ม/เกิน (${densityCounts.FULL})` }
    ];

    const densityPillsHtml = densityPillsConfig.map(p => {
        const isAct = activeAisleDensityFilter === p.key;
        return `<button type="button" class="btn btn-sm ${isAct ? 'btn-primary' : 'btn-secondary'}" onclick="setAisleDensityFilter('${p.key}')" style="border-radius: 20px; font-size: 0.76rem; padding: 4px 11px; font-weight: 700; white-space: nowrap;">${p.label}</button>`;
    }).join('');

    // แถบแสดงพื้นที่พักรอจัดเก็บ DOCK / OFFICE (เชื่อมต่อข้อมูลเรียลไทม์จากหน้ารับเข้า)
    let stagingStripHtml = '';
    if (dockWaitingCount > 0 || officeCount > 0) {
        stagingStripHtml = `
            <div class="wms-staging-strip">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:800; color:var(--text-main, #0f172a);">🚚 จุดพักสินค้าส่วนกลาง (ซิงก์เรียลไทม์):</span>
                    ${dockWaitingCount > 0 ? `<span style="padding:2px 10px; border-radius:999px; background:rgba(217,119,6,0.14); color:#d97706; font-weight:800;">ลาน DOCK (รอขึ้นชั้นวาง): ${dockWaitingCount.toLocaleString()} เครื่อง</span>` : ''}
                    ${officeCount > 0 ? `<span style="padding:2px 10px; border-radius:999px; background:rgba(2,132,199,0.14); color:#0284c7; font-weight:800;">OFFICE: ${officeCount.toLocaleString()} เครื่อง</span>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${dockWaitingCount > 0 ? `<button type="button" class="btn btn-sm btn-secondary" onclick="linkToInventoryView('DOCK')" style="font-size:0.76rem; padding:4px 10px; border-radius:8px; font-weight:700;">📦 จัดการสต็อก DOCK</button>` : ''}
                    ${officeCount > 0 ? `<button type="button" class="btn btn-sm btn-secondary" onclick="linkToInventoryView('OFFICE')" style="font-size:0.76rem; padding:4px 10px; border-radius:8px; font-weight:700;">🏢 ดูสต็อก OFFICE</button>` : ''}
                </div>
            </div>
        `;
    }

    // สร้างแถบสรุปพิกัดเบิกสินค้าอัจฉริยะ (Picking Route Banner) เมื่อพิมพ์ค้นหารุ่น รหัสสินค้า หรือ INV/PO
    let pickingRouteBannerHtml = '';
    if (productQ !== '') {
        allMatchedPickingLocations.sort(compareLocationsNaturally);
        const topPickTags = Array.from(new Set(allMatchedPickingLocations.map(formatCompactLocationTag))).slice(0, 8);
        const aisleQuickButtons = displayedAisles.map(a => {
            const cnt = productMatchCountByAisle.get(a) || 0;
            const det = productMatchedDetailsByAisle.get(a);
            const firstBay = det && det.locations.length > 0 ? `Bay ${parseLocationComponents(det.locations[0]).bay}` : '';
            return `
                <button type="button" class="btn btn-sm btn-secondary" onclick="selectLocationAisle('${escapeAttrJs(a)}', '${escapeAttrJs(globalLocationProductQuery)}')" style="border-radius: 10px; font-size: 0.78rem; padding: 5px 11px; font-weight: 800; border: 1px solid var(--primary-border, #93c5fd); background: var(--bg-surface, #fff); color: var(--text-main, #0f172a);">
                    📍 แถว ${window.escapeHTML(a)} <span style="color: var(--primary, #0284c7);">(${cnt} เครื่อง${firstBay ? ` • ${firstBay}` : ''})</span>
                </button>
            `;
        }).join('');

        pickingRouteBannerHtml = `
            <div id="globalPickingSummaryBanner" class="wms-picking-route-banner">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-size: 0.88rem; font-weight: 800; color: var(--primary-text, #0284c7);">
                            🎯 สรุปพิกัดเบิกสินค้าคำค้น: "${window.escapeHTML(globalLocationProductQuery.trim())}"
                        </span>
                        <span style="font-size: 0.78rem; font-weight: 800; padding: 2px 10px; border-radius: 20px; background: #059669; color: #ffffff;">
                            พบทั้งหมด ${totalMatchedProducts} เครื่อง ใน ${displayedAisles.length} แถว
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        ${totalMatchedProducts > 0 ? `
                            <button type="button" class="btn btn-sm btn-primary" onclick="copyGlobalPickingCoordinates()" style="border-radius: 9px; font-size: 0.76rem; padding: 4px 11px; font-weight: 700;">
                                📋 คัดลอกรายการพิกัดเบิกทั้งหมด
                            </button>
                        ` : ''}
                        <button type="button" class="btn btn-sm btn-secondary" onclick="clearGlobalLocationProductSearch()" style="border-radius: 9px; font-size: 0.76rem; padding: 4px 10px; font-weight: 700;">
                            ✖ ล้างการค้นหา
                        </button>
                    </div>
                </div>
                ${displayedAisles.length > 0 ? `
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-size: 0.76rem; font-weight: 700; color: var(--text-sub, #475569);">แถวที่พบ (คลิกเพื่อเปิดเบิก):</span>
                        ${aisleQuickButtons}
                    </div>
                    <div style="font-size: 0.76rem; color: var(--text-sub, #334155); font-family: monospace; word-break: break-word;">
                        🧭 พิกัดเบิกแนะนำเรียงตามลำดับ: <strong>${window.escapeHTML(topPickTags.join(' → '))}${allMatchedPickingLocations.length > 8 ? ` ... (+อีก ${allMatchedPickingLocations.length - 8} พิกัด)` : ''}</strong>
                    </div>
                ` : `
                    <div style="font-size: 0.8rem; color: var(--danger, #dc2626); font-weight: 700;">
                        ⚠️ ไม่พบสินค้าที่ตรงกับคำค้นหานี้ในแถวจัดเก็บใดๆ
                    </div>
                `}
            </div>
        `;
    }

    let html = `
        <div class="wh-fullscreen-card">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 18px;">
                <div style="display: flex; align-items: center; gap: 16px; min-width: 260px; max-width: 100%;">
                    <div style="width: 54px; height: 54px; border-radius: 18px; background: linear-gradient(135deg, var(--primary, #0284c7) 0%, #2563eb 50%, #4f46e5 100%); color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0; box-shadow: 0 8px 25px rgba(2, 132, 199, 0.35);">
                        <i class="fa-solid fa-warehouse"></i>
                    </div>
                    <div style="min-width: 0;">
                        <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span>ผังตำแหน่งแถวจัดเก็บคลังสินค้า Realtime</span>
                            <span style="font-size: 0.78rem; padding: 4px 14px; border-radius: 20px; font-weight: 800; background: ${whDensity.badgeBg}; color: ${whDensity.badgeColor}; border: 1px solid ${whDensity.badgeColor}33;">
                                ${whDensity.statusIcon} ${whDensity.statusText}
                            </span>
                            <span style="font-size: 0.72rem; padding: 3px 10px; border-radius: 20px; font-weight: 800; background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.25);">
                                ⚡ Live Stock Sync v29
                            </span>
                        </div>
                        <div style="font-size: 0.86rem; color: var(--text-muted, #64748b); margin-top: 4px;">
                            โครงสร้างหลัก: <strong style="color:var(--primary);">${countMainAisles}</strong> แถว • โครงสร้างเพิ่มเติม: <strong style="color:var(--warning);">${countAuxAisles}</strong> แถว (จัดเก็บแล้ว <strong>${totalWhOccupied.toLocaleString()}</strong> / ${totalWhCapacity.toLocaleString()} ช่อง)
                        </div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 220px; flex: 1; max-width: 480px;">
                    <div style="flex: 1; min-width: 180px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.84rem; font-weight: 700; color: var(--text-sub, #334155); margin-bottom: 6px;">
                            <span>ความหนาแน่นรวมทั้งคลัง</span>
                            <span class="mono font-bold" style="color:var(--primary,#0284c7);">${whDensity.rawRate}%</span>
                        </div>
                        <div style="width: 100%; height: 12px; background: var(--bg-subtle, #f1f5f9); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color, #cbd5e1);">
                            <div style="width: ${whDensity.rate}%; height: 100%; background: ${whDensity.barGradient}; border-radius: 12px; transition: width 0.4s ease;"></div>
                        </div>
                    </div>
                </div>
            </div>

            ${stagingStripHtml}

            <!-- แถบกรองสถานะความหนาแน่น & ตัวเลือกการจัดเรียง -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; padding: 10px 12px; background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px;">
                <div style="display: flex; align-items: center; gap: 6px; overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch;">
                    ${densityPillsHtml}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <select class="form-control" onchange="setAisleSortMode(this.value)" style="padding: 5px 10px; font-size: 0.8rem; border-radius: 10px; font-weight: 700; width: auto; height: 34px;" title="เรียงลำดับแถวจัดเก็บ">
                        <option value="DEFAULT" ${activeAisleSortMode === 'DEFAULT' ? 'selected' : ''}>↕️ เรียงตามผังมาตรฐาน</option>
                        <option value="MATCH_DESC" ${activeAisleSortMode === 'MATCH_DESC' ? 'selected' : ''}>🎯 พบสินค้าที่ค้นหามาก → น้อย</option>
                        <option value="DENSITY_DESC" ${activeAisleSortMode === 'DENSITY_DESC' ? 'selected' : ''}>🔥 หนาแน่นมาก → น้อย</option>
                        <option value="AVAILABLE_DESC" ${activeAisleSortMode === 'AVAILABLE_DESC' ? 'selected' : ''}>🟢 ช่องว่างมาก → น้อย</option>
                    </select>
                </div>
            </div>

            <!-- แถบเครื่องมือค้นหารุ่นสินค้า / รหัสสินค้า / INV / PO และตัวกรอง -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px;">
                <div style="font-size: 0.88rem; font-weight: 800; color: var(--text-sub, #475569); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <i class="fa-solid fa-hand-pointer" style="color: var(--primary, #0284c7);"></i>
                    <span>กดปุ่ม "📊 สรุปยอด" เพื่อดูรุ่น/INV/PO หรือคลิกการ์ดเพื่อเปิดเบิก:</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1 1 auto; justify-content: flex-end;">
                    <div id="globalLocSearchAutocompleteWrap" style="position: relative; display: inline-flex; align-items: center;">
                        <input id="globalLocProductSearchInput" type="text" class="form-control" placeholder="🎯 พิมพ์ชื่อรุ่น / รหัส / INV / PO / S/N..." value="${window.escapeHTML(globalLocationProductQuery)}" onfocus="openGlobalModelAutocomplete()" oninput="onGlobalLocationProductSearch(this.value)" autocomplete="off" style="padding: 6px 32px 6px 14px; font-size: 0.84rem; width: 310px; border-radius: 10px;">
                        ${globalLocationProductQuery !== '' ? `
                            <button type="button" onclick="clearGlobalLocationProductSearch()" style="position: absolute; right: 8px; background: none; border: none; color: var(--text-muted, #64748b); cursor: pointer; font-size: 0.9rem; padding: 2px 4px;" title="ล้างคำค้นหา">✖</button>
                        ` : ''}
                        <div id="globalModelAutocompleteBox" class="wms-global-model-dropdown"></div>
                    </div>
                    <input id="aisleNameSearchInput" type="text" class="form-control" placeholder="🔍 ค้นหาชื่อแถว..." value="${window.escapeHTML(aisleFilterSearchQuery)}" oninput="onAisleFilterSearchInput(this.value)" style="padding: 6px 14px; font-size: 0.84rem; width: 165px; border-radius: 10px;">
                </div>
            </div>

            <!-- แถบสรุปพิกัดเบิกสินค้าอัจฉริยะ (แสดงเมื่อพิมพ์ชื่อรุ่น/รหัสสินค้า/INV/PO) -->
            ${pickingRouteBannerHtml}

            <!-- ผังการ์ดแถวจัดเก็บแบบ GRID สวยงามและรวดเร็ว 100% (ไม่เด้งป๊อปอัปตอนชี้เมาส์) -->
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(265px, 1fr)); gap: 14px; padding-top: 14px; border-top: 1px dashed var(--border-color, #e2e8f0);">
    `;

    if (displayedAisles.length === 0) {
        html += `<div style="grid-column:1/-1; font-size:0.9rem; color:var(--text-muted,#64748b); text-align:center; padding:24px 0;">ไม่พบแถวจัดเก็บในโหมดหรือคำค้นหานี้</div>`;
    }

    const cardChunks = new Array(displayedAisles.length);
    for (let idx = 0; idx < displayedAisles.length; idx++) {
        const aisle = displayedAisles[idx];
        const stats = statsByAisle.get(aisle);
        const bd = breakdownByAisle.get(aisle);
        const zType = zoneByAisle.get(aisle);
        const den = stats.densityInfo;
        const matchedCount = productMatchCountByAisle.get(aisle) || 0;
        const matchedDetails = productMatchedDetailsByAisle.get(aisle);

        const safeAisleJs = escapeAttrJs(aisle);
        const safeGlobalQJs = escapeAttrJs(globalLocationProductQuery);

        // สร้าง Mini Bay Spark-Bar แสดงความหนาแน่นรายล็อก (Bay) แบบกะทัดรัด
        const capPerBay = Math.max(1, stats.shelvesCount * stats.slotsCount);
        const maxSparkBays = Math.min(stats.baysCount, 16);
        let baySparkHtml = '';
        for (let b = 1; b <= maxSparkBays; b++) {
            const bOcc = stats.bayCounts[b] || 0;
            const bPct = Math.round((bOcc / capPerBay) * 100);
            let segColor = 'var(--border-color, #cbd5e1)';
            if (bPct > 100) segColor = '#e11d48';
            else if (bPct >= 95) segColor = '#ef4444';
            else if (bPct >= 75) segColor = '#f59e0b';
            else if (bPct >= 40) segColor = '#0284c7';
            else if (bOcc > 0) segColor = '#10b981';

            baySparkHtml += `<span title="Bay ${String(b).padStart(2, '0')}: ${bOcc}/${capPerBay} ช่อง (${bPct}%)" style="flex:1; height:5px; border-radius:2px; background:${segColor};"></span>`;
        }

        // สรุปรายละเอียดสินค้าที่ตรงกับคำค้นหาบนการ์ดแถวโดยตรง
        let matchedPreviewHtml = '';
        if (matchedCount > 0 && matchedDetails) {
            const topMatchedModels = matchedDetails.models.slice(0, 2).map(mm =>
                `<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">• <strong>${window.escapeHTML(mm.name)}</strong> [${window.escapeHTML(mm.skuCode)}]: <strong style="color:#059669;">${mm.count} เครื่อง</strong></div>`
            ).join('');
            const moreModelsNote = matchedDetails.models.length > 2 ? `<div style="font-size: 0.7rem; opacity: 0.85;">+ อีก ${matchedDetails.models.length - 2} รุ่นในแถวนี้</div>` : '';
            const locTags = Array.from(new Set(matchedDetails.locations.map(formatCompactLocationTag))).slice(0, 3).join(', ');

            matchedPreviewHtml = `
                <div style="font-size: 0.75rem; color: #0284c7; background: rgba(2, 132, 199, 0.1); border: 1px solid rgba(2, 132, 199, 0.28); padding: 6px 9px; border-radius: 9px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 2px;">
                    <div style="font-weight: 800; display: flex; align-items: center; justify-content: space-between;">
                        <span>🎯 พบสินค้าที่ค้นหา</span>
                        <span style="background: #0284c7; color: #fff; padding: 0 7px; border-radius: 10px; font-size: 0.72rem;">${matchedCount} เครื่อง</span>
                    </div>
                    <div style="color: var(--text-main, #0f172a); font-size: 0.73rem;">
                        ${topMatchedModels}
                        ${moreModelsNote}
                    </div>
                    <div style="font-size: 0.7rem; font-family: monospace; color: var(--text-sub, #334155);">
                        📍 พิกัด: ${window.escapeHTML(locTags)}${matchedDetails.locations.length > 3 ? '...' : ''}
                    </div>
                </div>
            `;
        }

        const docBadgeNote = (bd.invList.length > 0 || bd.poList.length > 0)
            ? `<span>📄 <strong>${bd.invList.length}</strong> INV / <strong>${bd.poList.length}</strong> PO</span>`
            : '';

        const highlightBorder = matchedCount > 0 ? 'border: 2px solid var(--primary, #0284c7); box-shadow: 0 6px 20px rgba(2, 132, 199, 0.22);' : 'border: 1px solid var(--border-color, #e2e8f0);';
        const openCall = matchedCount > 0
            ? `selectLocationAisle('${safeAisleJs}', '${safeGlobalQJs}')`
            : `selectLocationAisle('${safeAisleJs}')`;

        cardChunks[idx] = `
            <div class="wh-aisle-card-grid"
                 onmouseover="this.style.borderColor='var(--primary,#0284c7)'; this.style.transform='translateY(-2px)';"
                 onmouseout="this.style.borderColor='${matchedCount > 0 ? 'var(--primary,#0284c7)' : 'var(--border-color,#e2e8f0)'}'; this.style.transform='none';"
                 onclick="${openCall}"
                 style="background: var(--bg-surface, #ffffff); ${highlightBorder} border-radius: 14px; padding: 14px; cursor: pointer; transition: transform 0.18s ease, border-color 0.18s ease; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-size: 1.1rem; font-weight: 800; color: var(--text-main, #0f172a);">แถว ${window.escapeHTML(aisle)}</span>
                            <span style="font-size: 0.68rem; font-weight: 800; padding: 2px 6px; border-radius: 6px; background: ${zType === 'main' ? 'rgba(2,132,199,0.15)' : 'rgba(217,119,6,0.15)'}; color: ${zType === 'main' ? '#0284c7' : '#d97706'}; border: 1px solid ${zType === 'main' ? 'rgba(2,132,199,0.3)' : 'rgba(217,119,6,0.3)'};">
                                ${zType === 'main' ? '🔵 หลัก' : '🟡 เพิ่มเติม'}
                            </span>
                        </div>
                        <span style="font-size: 0.76rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: ${den.badgeBg}; color: ${den.badgeColor}; white-space: nowrap;">
                            ${stats.occupiedSlots} เครื่อง
                        </span>
                    </div>

                    <!-- สรุปจำนวนรุ่น รหัสสินค้า และเอกสาร INV/PO บนการ์ด -->
                    <div style="font-size: 0.75rem; color: var(--text-sub, #475569); margin-bottom: 7px; display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
                        <span>📦 <strong>${bd.uniqueModelsCount}</strong> รุ่น • 🏷️ <strong>${bd.uniqueSkusCount}</strong> รหัส</span>
                        ${docBadgeNote}
                    </div>

                    ${matchedPreviewHtml}

                    <div style="font-size: 0.78rem; color: var(--text-muted, #64748b); margin-bottom: 5px; display: flex; justify-content: space-between;">
                        <span>ความจุ: ${stats.totalCapacity} ช่อง</span>
                        <span style="font-weight: 700; color: ${den.badgeColor};">${den.rawRate}%</span>
                    </div>

                    <div style="width: 100%; height: 6px; background: var(--bg-subtle); border-radius: 6px; overflow: hidden; margin-bottom: 6px;">
                        <div style="width: ${den.rate}%; height: 100%; background: ${den.barGradient};"></div>
                    </div>

                    <!-- Mini Bay Spark-Bar -->
                    <div style="display: flex; gap: 2px; margin-bottom: 12px;" title="สถานะรายล็อก (Bay 01 - ${String(stats.baysCount).padStart(2, '0')})">
                        ${baySparkHtml}
                    </div>
                </div>

                <div style="display: flex; gap: 6px; justify-content: space-between; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openAisleSummaryPopup('${safeAisleJs}')" style="font-size: 0.78rem; border-radius: 8px; font-weight: 800; padding: 5px 10px; border-color: var(--primary-border, #bfdbfe); color: var(--primary-text, #1d4ed8); background: var(--primary-light, #eff6ff);" title="กดเพื่อเปิดป๊อปอัปสรุปยอดรุ่น รหัสสินค้า INV/PO และจำนวนเครื่อง">
                        📊 สรุปยอด
                    </button>
                    <button type="button" class="btn btn-sm btn-primary" onclick="event.stopPropagation(); ${openCall}" style="flex: 1 1 auto; font-size: 0.78rem; border-radius: 8px; font-weight: 700; padding: 5px 10px;">
                        📋 เปิดเบิก/S/N
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); linkToInventoryView('${safeAisleJs}')" style="font-size: 0.78rem; border-radius: 8px; font-weight: 700; padding: 5px 9px;" title="ลิงก์ไปหน้าเช็กสต็อก">
                        🔗
                    </button>
                </div>
            </div>
        `;
    }

    html += cardChunks.join('');
    html += `
            </div>
        </div>
    `;

    smartUpdateDOM('aisleFilterBar', html, immediate);

    // อัปเดต Autocomplete Dropdown หากกำลังเปิดอยู่
    if (isGlobalModelDropdownOpen) {
        renderGlobalModelAutocompleteDropdown();
    }

    // คืนโฟกัสให้ช่องค้นหาบนหน้าผังหากกำลังพิมพ์อยู่
    if (activeId === 'aisleNameSearchInput' || activeId === 'globalLocProductSearchInput') {
        const restored = document.getElementById(activeId);
        if (restored) {
            restored.focus();
            if (cursorStart !== null && cursorEnd !== null) {
                try { restored.setSelectionRange(cursorStart, cursorEnd); } catch (e) {}
            }
        }
    }
}

function selectLocationAisle(aisleName, initialSearch = '') {
    activeLocationAisle = aisleName;
    openAisleDetailModal(aisleName, initialSearch, 'ALL');
}

function setAisleZoneFilter(mode) {
    if (['ALL', 'MAIN', 'AUXILIARY'].includes(mode)) {
        activeAisleZoneFilter = mode;
        renderDrillDownAisleBar(true);
    }
}

function setAisleDensityFilter(level) {
    if (['ALL', 'LOW', 'MEDIUM', 'HIGH', 'FULL'].includes(level)) {
        activeAisleDensityFilter = level;
        renderDrillDownAisleBar(true);
    }
}

function setAisleSortMode(mode) {
    if (['DEFAULT', 'MATCH_DESC', 'DENSITY_DESC', 'AVAILABLE_DESC'].includes(mode)) {
        activeAisleSortMode = mode;
        renderDrillDownAisleBar(true);
    }
}

function onAisleFilterSearchInput(val) {
    aisleFilterSearchQuery = val;
    renderDrillDownAisleBar(true);
}

function onGlobalLocationProductSearch(val) {
    globalLocationProductQuery = val;
    isGlobalModelDropdownOpen = true;
    renderDrillDownAisleBar(true);
}

// Global Export
window.renderDrillDownAisleBar = renderDrillDownAisleBar;
window.selectLocationAisle = selectLocationAisle;
window.setAisleZoneFilter = setAisleZoneFilter;
window.setAisleDensityFilter = setAisleDensityFilter;
window.setAisleSortMode = setAisleSortMode;
window.onAisleFilterSearchInput = onAisleFilterSearchInput;
window.onGlobalLocationProductSearch = onGlobalLocationProductSearch;
window.openGlobalModelAutocomplete = openGlobalModelAutocomplete;
window.closeGlobalModelAutocomplete = closeGlobalModelAutocomplete;
window.applyGlobalModelSuggestion = applyGlobalModelSuggestion;
window.clearGlobalLocationProductSearch = clearGlobalLocationProductSearch;
window.openAisleDetailModal = openAisleDetailModal;
window.closeAisleDetailModal = closeAisleDetailModal;
window.switchModalSummaryTab = switchModalSummaryTab;
window.switchModalDocFilter = switchModalDocFilter;
window.openAisleSummaryPopup = openAisleSummaryPopup;
window.closeAisleSummaryPopup = closeAisleSummaryPopup;
window.onSummaryPopoverSearchInput = onSummaryPopoverSearchInput;
window.handleAisleCardMouseEnter = handleAisleCardMouseEnter;
window.handleAisleCardMouseLeave = handleAisleCardMouseLeave;
window.showAisleHoverPopover = showAisleHoverPopover;
window.hideAisleHoverPopover = hideAisleHoverPopover;
window.switchHoverPopoverTab = switchHoverPopoverTab;
window.getAisleModelBreakdown = getAisleModelBreakdown;
window.getGlobalCatalogBreakdown = getGlobalCatalogBreakdown;
window.linkToInventoryView = linkToInventoryView;
window.exportAisleItemsToCSV = exportAisleItemsToCSV;
window.copyAllAisleSerials = copyAllAisleSerials;
window.copyAislePickingSummary = copyAislePickingSummary;
window.copyGlobalPickingCoordinates = copyGlobalPickingCoordinates;
window.prewarmWarehouseLocationView = prewarmWarehouseLocationView;
window.refreshLocationVisualizerIfActive = refreshLocationVisualizerIfActive;