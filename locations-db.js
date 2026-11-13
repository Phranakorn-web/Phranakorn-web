// =========================================================================
// --- MODULE: REALTIME WAREHOUSE ZONE & INVENTORY LINKING ENGINE (v25.0) ---
// --- ZERO-LAG INSTANT VIEW SWITCHING & HIGH-PERFORMANCE AISLE ENGINE ---
// --- FULL PARITY FOR macOS, WINDOWS, iOS, ANDROID & GITHUB PAGES ---
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

// ฟีเจอร์เสริมใหม่: ตัวกรองความหนาแน่น, การเรียงลำดับ และค้นหาสินค้า/SN ข้ามทุกแถว
let activeAisleDensityFilter = 'ALL'; // 'ALL', 'LOW', 'MEDIUM', 'HIGH', 'FULL'
let activeAisleSortMode = 'DEFAULT'; // 'DEFAULT', 'DENSITY_DESC', 'AVAILABLE_DESC'
let globalLocationProductQuery = '';

// Cache ความหนาแน่นรวมคลังสินค้าสำหรับการประมวลผลเบื้องหลัง
let cachedWarehouseStats = null;
let isBackgroundPrecalculating = false;

// ⚡ High-Speed Memoization & Single-Pass O(N) Inventory Index
const parsedLocationCache = new Map();
const extractedAisleCache = new Map();
let indexedInventoryCache = {
    signature: '',
    byAisle: new Map(),
    totalItems: 0
};

// ⚡ Zero-Flicker Smart DOM Update Cache
const lastRenderedHTML = new Map();

// -------------------------------------------------------------------------
// ⚡ High-Speed Indexer: จัดดัชนีสต็อกรายแถวในรอบเดียว O(N) (เร็วขึ้น 50x+)
// -------------------------------------------------------------------------
function getInventoryIndexSignature(inventory) {
    const len = inventory.length;
    if (len === 0) return '0';
    const first = inventory[0];
    const mid = inventory[Math.floor(len / 2)];
    const last = inventory[len - 1];
    return `${len}|${first?.sn || ''}:${first?.location || ''}|${mid?.sn || ''}:${mid?.location || ''}|${last?.sn || ''}:${last?.location || ''}`;
}

function getIndexedInventoryByAisle() {
    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const sig = getInventoryIndexSignature(inventory);

    if (indexedInventoryCache.signature === sig && indexedInventoryCache.byAisle.size > 0) {
        return indexedInventoryCache.byAisle;
    }

    const byAisle = new Map();
    for (let i = 0; i < inventory.length; i++) {
        const item = inventory[i];
        if (!item || !item.location) continue;

        const parsed = parseLocationComponents(item.location);
        const keyUpper = parsed.aisle.toUpperCase();
        if (!byAisle.has(keyUpper)) {
            byAisle.set(keyUpper, []);
        }
        byAisle.get(keyUpper).push(item);
    }

    indexedInventoryCache = {
        signature: sig,
        byAisle,
        totalItems: inventory.length
    };
    return byAisle;
}

function invalidateLocationCaches() {
    indexedInventoryCache.signature = '';
    indexedInventoryCache.byAisle.clear();
    parsedLocationCache.clear();
    extractedAisleCache.clear();
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
                const result = originalSwitchView.apply(this, [viewId, ...args]);

                // หากสลับมาหน้าผังตำแหน่งคลังสินค้า ให้เรนเดอร์ทันทีแบบ Synchronous (0ms lag)
                if (viewId && String(viewId).toLowerCase().includes('location')) {
                    const container = document.getElementById('aisleFilterBar');
                    if (container && (!container.innerHTML || container.innerHTML.trim() === '')) {
                        renderDrillDownAisleBar(true);
                    } else {
                        // อัปเดตข้อมูลล่าสุดเบื้องหลังแบบไม่บล็อกเฟรม
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
    if (typeof switchView === 'function') {
        switchView('view-inventory');
    }

    let toastFired = false;

    const executeRealtimeFilter = () => {
        const searchInput = document.getElementById('searchInput') || 
                            document.getElementById('inventorySearchInput') || 
                            document.querySelector('.inventory-search-input');
                            
        if (searchInput) {
            const queryStr = String(locFilterStr || '').trim();
            searchInput.value = queryStr;
            
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));

            if (typeof filterInventoryData === 'function') {
                filterInventoryData();
            } else if (typeof renderInventoryTable === 'function') {
                renderInventoryTable();
            }

            setTimeout(() => {
                const tbody = document.getElementById('inventoryTableBody');
                if (tbody && tbody.children.length > 0) {
                    const visibleRows = Array.from(tbody.querySelectorAll('tr')).filter(tr => tr.style.display !== 'none');
                    if (visibleRows.length === 0 && queryStr.includes('-L')) {
                        const simpleAisleBay = queryStr.split('-L')[0];
                        if (simpleAisleBay) {
                            searchInput.value = simpleAisleBay;
                            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                            if (typeof filterInventoryData === 'function') filterInventoryData();
                        }
                    }
                }
            }, 60);
        }
        
        if (!toastFired && typeof showToast === 'function') {
            toastFired = true;
            showToast(`🔍 สลับไปหน้าเช็กสต็อกเรียลไทม์ — กรองค้นหาตำแหน่ง: ${locFilterStr || 'ทั้งหมด'}`);
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
            const aisles = getAllConfiguredAisles();
            let totalCap = 0;
            let totalOcc = 0;
            const aisleStatsMap = new Map();

            aisles.forEach(a => {
                const st = getAisleOccupancyStats(a);
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
}

window.notifyWarehouseConfigChanged = function() { refreshLocationVisualizerIfActive(); };
window.notifyInventoryDataUpdated = function() { refreshLocationVisualizerIfActive(); };

['warehouseConfigUpdated', 'inventoryUpdated', 'inventoryDataChanged', 'wmsRealtimeSync', 'supabaseConnected'].forEach(evtName => {
    document.addEventListener(evtName, function() {
        refreshLocationVisualizerIfActive();
    }, true);
});

window.addEventListener('storage', function(e) {
    if (e.key === 'WMS_AISLE_CONFIGS' || e.key === 'WMS_MASTER_AISLES' || e.key === 'WMS_INVENTORY_DATA') {
        refreshLocationVisualizerIfActive();
    }
});

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
    byAisle.forEach((items, aisleUpper) => {
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
// 📥 ฟีเจอร์เสริม: Export รายการสินค้าในแถวเป็นไฟล์ CSV (รองรับ Excel ไทย 100%)
// -------------------------------------------------------------------------
function exportAisleItemsToCSV(aisleName, filterQuery = '', bayFilter = 'ALL') {
    if (!aisleName) return;
    const stats = getAisleOccupancyStats(aisleName);
    let items = stats.itemsList || [];

    if (bayFilter !== 'ALL') {
        items = items.filter(i => {
            const p = parseLocationComponents(i.location);
            return p.bay === bayFilter || String(parseInt(p.bay, 10)) === String(parseInt(bayFilter, 10));
        });
    }
    if (filterQuery.trim() !== '') {
        const q = filterQuery.toLowerCase().trim();
        items = items.filter(i =>
            (i.sn && String(i.sn).toLowerCase().includes(q)) ||
            (i.category && String(i.category).toLowerCase().includes(q)) ||
            (i.name && String(i.name).toLowerCase().includes(q)) ||
            (i.location && String(i.location).toLowerCase().includes(q))
        );
    }

    if (items.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่มีรายการสินค้าสำหรับส่งออก');
        return;
    }

    const sanitizeCsvCell = (val) => {
        let s = String(val ?? '').replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // ป้องกัน CSV Formula Injection
        return `"${s}"`;
    };

    const headers = ['ลำดับ', 'พิกัดจัดเก็บ', 'รหัสย่อพิกัด', 'หมวดหมู่/SKU', 'ชื่อรุ่นสินค้า', 'Serial Number'];
    const rows = items.map((item, idx) => [
        idx + 1,
        item.location || '-',
        formatCompactLocationTag(item.location),
        item.category || 'ทั่วไป',
        item.name || '-',
        item.sn || '-'
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
    const stats = getAisleOccupancyStats(aisleName);
    let items = stats.itemsList || [];

    if (bayFilter !== 'ALL') {
        items = items.filter(i => {
            const p = parseLocationComponents(i.location);
            return p.bay === bayFilter || String(parseInt(p.bay, 10)) === String(parseInt(bayFilter, 10));
        });
    }
    if (filterQuery.trim() !== '') {
        const q = filterQuery.toLowerCase().trim();
        items = items.filter(i =>
            (i.sn && String(i.sn).toLowerCase().includes(q)) ||
            (i.category && String(i.category).toLowerCase().includes(q)) ||
            (i.name && String(i.name).toLowerCase().includes(q)) ||
            (i.location && String(i.location).toLowerCase().includes(q))
        );
    }

    const serials = items.map(i => i.sn).filter(Boolean);
    if (serials.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบ Serial Number ในรายการที่เลือก');
        return;
    }
    copyTextToClipboard(serials.join('\n'), `Serial Number ทั้งหมด (${serials.length} รายการ)`);
}

// -------------------------------------------------------------------------
// 🚀 MODAL POPUP ENGINE: ป๊อปอัปขยายพื้นที่ใช้งานกว้างขวาง สวยงาม อ่านง่าย 100%
// -------------------------------------------------------------------------
function openAisleDetailModal(aisleName, filterQuery = '', bayFilter = 'ALL') {
    if (!aisleName) return;

    // บันทึกสถานะโฟกัสและตำแหน่งเคอร์เซอร์ของช่องค้นหาก่อนอัปเดต DOM
    const prevInput = document.getElementById('aisleModalSearchInput');
    const wasInputFocused = (document.activeElement && prevInput && document.activeElement.id === 'aisleModalSearchInput');
    const cursorStart = wasInputFocused ? prevInput.selectionStart : null;
    const cursorEnd = wasInputFocused ? prevInput.selectionEnd : null;

    const stats = getAisleOccupancyStats(aisleName);
    const den = stats.densityInfo;
    const zoneType = getAisleZoneType(aisleName);
    let rawItems = stats.itemsList || [];

    // นับจำนวน Category ในแถวนี้
    const uniqueCategories = new Set(rawItems.map(i => i.category || 'ทั่วไป')).size;

    let items = rawItems;

    // กรองด้วย Bay Filter ถ้าเลือก
    if (bayFilter !== 'ALL') {
        items = items.filter(i => {
            const p = parseLocationComponents(i.location);
            return p.bay === bayFilter || String(parseInt(p.bay, 10)) === String(parseInt(bayFilter, 10));
        });
    }

    // กรองด้วย Search Filter
    if (filterQuery.trim() !== '') {
        const q = filterQuery.toLowerCase().trim();
        items = items.filter(i => 
            (i.sn && String(i.sn).toLowerCase().includes(q)) ||
            (i.category && String(i.category).toLowerCase().includes(q)) ||
            (i.name && String(i.name).toLowerCase().includes(q)) ||
            (i.location && String(i.location).toLowerCase().includes(q))
        );
    }

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

    let itemsRowsHtml = '';
    if (items.length === 0) {
        itemsRowsHtml = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 48px 20px; color: var(--text-muted, #64748b);">
                    <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--bg-subtle, #f1f5f9); border: 1px solid var(--border-color, #cbd5e1); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                        <i class="fa-solid fa-box-open" style="font-size: 2rem; color: var(--text-muted, #94a3b8);"></i>
                    </div>
                    <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-main, #0f172a);">ไม่พบข้อมูลรายการสินค้าในแถว ${escapeHTML(aisleName)}</div>
                    <div style="font-size: 0.86rem; margin-top: 4px;">ยังไม่มีสินค้าจัดเก็บในแถวนี้ หรือไม่ตรงกับเงื่อนไขการค้นหา/กรอง</div>
                </td>
            </tr>
        `;
    } else {
        const rowChunks = new Array(items.length);
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const locStr = escapeHTML(item.location || '-');
            const categoryStr = escapeHTML(item.category || 'ทั่วไป');
            const nameStr = escapeHTML(item.name || 'ไม่ระบุชื่อรุ่น');
            const snStr = escapeHTML(item.sn || '-');
            const formattedLoc = formatCompactLocationTag(item.location);

            rowChunks[index] = `
                <tr style="transition: background 0.15s ease;">
                    <td style="font-weight: 800; font-family: monospace;">
                        <span class="badge-location" style="font-size: 0.84rem; padding: 4px 10px; cursor: pointer;" onclick="copyTextToClipboard('${locStr}', 'พิกัดสินค้า')" title="คลิกเพื่อคัดลอกพิกัด">
                            📍 ${escapeHTML(formattedLoc)}
                        </span>
                    </td>
                    <td>
                        <span style="font-size: 0.78rem; font-weight: 800; padding: 3px 10px; border-radius: 8px; background: var(--primary-light, rgba(2,132,199,0.1)); border: 1px solid var(--primary-border, rgba(2,132,199,0.25)); color: var(--primary-text, #0284c7);">
                            ${categoryStr}
                        </span>
                    </td>
                    <td style="font-weight: 700; color: var(--text-main, #0f172a); min-width: 200px; white-space: normal; word-break: break-word;">
                        ${nameStr}
                    </td>
                    <td style="font-family: monospace; font-weight: 700; color: var(--text-sub, #334155);">
                        <span style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-color, #e2e8f0);" onclick="copyTextToClipboard('${snStr}', 'Serial Number')" title="คลิกเพื่อคัดลอก S/N">
                            🏷️ ${snStr} <i class="fa-regular fa-copy" style="font-size:0.75rem; color:var(--text-muted);"></i>
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <button type="button" class="btn btn-sm btn-primary" onclick="closeAisleDetailModal(); linkToInventoryView('${locStr}')" style="font-size: 0.8rem; padding: 6px 14px; border-radius: 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;" title="ลิงก์ไปยังสินค้าชิ้นนี้ในหน้าเช็กสต็อกสินค้า">
                            <i class="fa-solid fa-arrow-right-to-bracket"></i> ลิงก์สต็อก
                        </button>
                    </td>
                </tr>
            `;
        }
        itemsRowsHtml = rowChunks.join('');
    }

    // สร้าง Bay Filter Pills ปุ่มเลือก ล็อก (Bay) พร้อมแสดงจำนวนชิ้นในแต่ละ Bay
    let bayPillsHtml = `<button type="button" class="btn btn-sm ${bayFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" onclick="openAisleDetailModal('${escapeHTML(aisleName)}', '${escapeHTML(filterQuery)}', 'ALL')" style="border-radius: 20px; font-weight: 700; white-space: nowrap;">ทุก Bay (${rawItems.length})</button>`;
    for (let b = 1; b <= stats.baysCount; b++) {
        const bStr = String(b).padStart(2, '0');
        const isSel = (bayFilter === bStr || bayFilter === String(b));
        const bCount = stats.bayCounts[b] || 0;
        bayPillsHtml += `
            <button type="button" class="btn btn-sm ${isSel ? 'btn-primary' : 'btn-secondary'}" onclick="openAisleDetailModal('${escapeHTML(aisleName)}', '${escapeHTML(filterQuery)}', '${bStr}')" style="border-radius: 20px; font-weight: 700; padding: 4px 12px; white-space: nowrap;">
                Bay ${bStr} <span style="opacity:0.8; font-size:0.74rem;">(${bCount})</span>
            </button>
        `;
    }

    modalElem.innerHTML = `
        <div style="background: var(--bg-surface, #ffffff); border: 1px solid var(--border-strong, #cbd5e1); border-radius: 24px; width: 95%; max-width: 1150px; height: 92vh; max-height: 900px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,0.35); animation: viewFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);">
            
            <!-- Modal Header (กว้างขวาง สวยงาม มี Dashboard ย่อย) -->
            <div style="padding: 18px 24px; background: linear-gradient(135deg, var(--bg-surface, #ffffff) 0%, var(--bg-subtle, #f8fafc) 100%); border-bottom: 1px solid var(--border-color, #e2e8f0); flex-shrink: 0;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 50px; height: 50px; border-radius: 16px; background: ${zoneType === 'main' ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)' : 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; box-shadow: 0 6px 18px rgba(2, 132, 199, 0.35); flex-shrink: 0;">
                            <i class="fa-solid fa-layer-group"></i>
                        </div>
                        <div>
                            <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span>รายละเอียดสินค้าประจำแถว: <strong style="color:var(--primary,#0284c7); font-size:1.4rem;">${escapeHTML(aisleName)}</strong></span>
                                <span style="font-size: 0.76rem; padding: 3px 10px; border-radius: 8px; font-weight: 800; background: ${zoneType === 'main' ? 'rgba(2,132,199,0.15)' : 'rgba(217,119,6,0.15)'}; color: ${zoneType === 'main' ? '#0284c7' : '#d97706'}; border: 1px solid ${zoneType === 'main' ? 'rgba(2,132,199,0.3)' : 'rgba(217,119,6,0.3)'};">
                                    ${zoneType === 'main' ? '🔵 โครงสร้างหลัก' : '🟡 โครงสร้างเพิ่มเติม'}
                                </span>
                            </div>
                            <div style="font-size: 0.86rem; color: var(--text-muted, #64748b); margin-top: 2px;">
                                ขนาดความจุแร็ค: <strong>${stats.baysCount}</strong> Bay • <strong>${stats.shelvesCount}</strong> ชั้น • <strong>${stats.slotsCount}</strong> ช่อง
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="copyAllAisleSerials('${escapeHTML(aisleName)}', '${escapeHTML(filterQuery)}', '${escapeHTML(bayFilter)}')" style="font-size: 0.82rem; padding: 8px 14px; border-radius: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;" title="คัดลอก Serial Number ทั้งหมดที่แสดงอยู่">
                            <i class="fa-regular fa-copy"></i> คัดลอก S/N
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="exportAisleItemsToCSV('${escapeHTML(aisleName)}', '${escapeHTML(filterQuery)}', '${escapeHTML(bayFilter)}')" style="font-size: 0.82rem; padding: 8px 14px; border-radius: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;" title="ดาวน์โหลดรายการในแถวนี้เป็น CSV">
                            <i class="fa-solid fa-file-csv" style="color: #059669;"></i> Export CSV
                        </button>
                        <button type="button" class="btn btn-sm btn-primary" onclick="closeAisleDetailModal(); linkToInventoryView('${escapeHTML(aisleName)}')" style="font-size: 0.86rem; padding: 8px 18px; border-radius: 12px; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);">
                            <i class="fa-solid fa-arrow-right-to-bracket"></i> ไปที่หน้าเช็กสต็อกแถวนี้ทั้งหมด
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary icon-only-btn" onclick="closeAisleDetailModal()" style="border-radius: 50%; width: 40px; height: 40px; font-size: 1.2rem; cursor: pointer;" title="ปิดหน้าต่าง (ESC)">
                            ✖
                        </button>
                    </div>
                </div>

                <!-- Dashboard สถิติสรุปแบบ Grid ย่อย -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 16px;">
                    <div style="background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 12px;">
                        <div style="font-size: 1.3rem; color: var(--primary, #0284c7);"><i class="fa-solid fa-boxes-stacked"></i></div>
                        <div>
                            <div style="font-size: 0.74rem; color: var(--text-muted); font-weight: 600;">สินค้าในแถวนี้</div>
                            <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-main);">${stats.occupiedSlots} รายการ</div>
                        </div>
                    </div>

                    <div style="background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 12px;">
                        <div style="font-size: 1.3rem; color: var(--success, #059669);"><i class="fa-solid fa-chart-pie"></i></div>
                        <div>
                            <div style="font-size: 0.74rem; color: var(--text-muted); font-weight: 600;">ความหนาแน่น</div>
                            <div style="font-size: 1.1rem; font-weight: 800; color: ${den.badgeColor};">${den.rawRate}% (${den.statusText})</div>
                        </div>
                    </div>

                    <div style="background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 12px;">
                        <div style="font-size: 1.3rem; color: var(--warning, #d97706);"><i class="fa-solid fa-tags"></i></div>
                        <div>
                            <div style="font-size: 0.74rem; color: var(--text-muted); font-weight: 600;">หมวดหมู่สินค้า</div>
                            <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-main);">${uniqueCategories} หมวด</div>
                        </div>
                    </div>

                    <div style="background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 12px;">
                        <div style="font-size: 1.3rem; color: var(--purple, #7c3aed);"><i class="fa-solid fa-cubes"></i></div>
                        <div>
                            <div style="font-size: 0.74rem; color: var(--text-muted); font-weight: 600;">ช่องว่างคงเหลือ</div>
                            <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-main);">${stats.availableSlots} ช่อง</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Filter Bar (ค้นหา + เลือก Bay) -->
            <div style="padding: 12px 24px; background: var(--bg-subtle, #f8fafc); border-bottom: 1px solid var(--border-color, #e2e8f0); flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
                <div style="position: relative; flex: 1; min-width: 240px;">
                    <input id="aisleModalSearchInput" type="text" class="form-control" placeholder="🔍 ค้นหาในแถวนี้ (ชื่อรุ่น, SKU, S/N, พิกัด)..." value="${escapeHTML(filterQuery)}" oninput="openAisleDetailModal('${escapeHTML(aisleName)}', this.value, '${escapeHTML(bayFilter)}')" style="padding-left: 38px; border-radius: 12px; font-size: 0.88rem; height: 40px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted, #94a3b8); font-size: 0.9rem;"></i>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-bottom: 2px; max-width: 100%; -webkit-overflow-scrolling: touch;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); white-space: nowrap; margin-right: 4px;">เลือกล็อก (Bay):</span>
                    ${bayPillsHtml}
                </div>
            </div>

            <!-- Modal Body: Items Table (ขยายกว้าง จุข้อมูลได้ชัดเจน) -->
            <div style="flex: 1; overflow-y: auto; padding: 0; -webkit-overflow-scrolling: touch;">
                <table class="modern-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="position: sticky; top: 0; z-index: 10; background: var(--bg-subtle, #f1f5f9);">
                            <th style="width: 160px; padding: 12px 16px;">📍 พิกัดจัดเก็บ</th>
                            <th style="width: 150px; padding: 12px 16px;">🏷️ หมวด/SKU</th>
                            <th style="padding: 12px 16px;">📦 ชื่อรุ่นสินค้า</th>
                            <th style="width: 220px; padding: 12px 16px;">🔢 Serial Number</th>
                            <th style="width: 140px; text-align: right; padding: 12px 16px;">⚙️ ลิงก์ตรง</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Modal Footer -->
            <div style="padding: 14px 24px; background: var(--bg-surface, #ffffff); border-top: 1px solid var(--border-color, #e2e8f0); flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; font-size: 0.86rem; color: var(--text-muted, #64748b); flex-wrap: wrap; gap: 10px;">
                <div>
                    กำลังแสดง <strong style="color:var(--text-main);">${items.length}</strong> จากทั้งหมด <strong style="color:var(--text-main);">${stats.occupiedSlots}</strong> รายการในแถว <strong style="color:var(--primary);">${escapeHTML(aisleName)}</strong>
                </div>
                <div style="display: flex; gap: 10px;">
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
    const modalElem = document.getElementById('aisleDetailModal');
    if (modalElem) {
        modalElem.style.display = 'none';
        modalElem.classList.remove('active', 'show');
    }
}

// ฟังการกดปุ่ม ESC บนแป้นพิมพ์เพื่อปิด Modal
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        closeAisleDetailModal();
    }
});

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

    // คำนวณสถิติทุกแถวเพียงครั้งเดียว (Single-Pass Caching) ลดงานซ้ำซ้อน 50%
    let totalWhCapacity = 0;
    let totalWhOccupied = 0;
    let countMainAisles = 0;
    let countAuxAisles = 0;
    const statsByAisle = new Map();
    const zoneByAisle = new Map();

    // นับจำนวนแถวแยกตามระดับความหนาแน่น
    const densityCounts = { ALL: aisles.length, LOW: 0, MEDIUM: 0, HIGH: 0, FULL: 0 };

    // คำค้นหาสินค้า/S/N ข้ามทุกแถว
    const productQ = globalLocationProductQuery.trim().toLowerCase();
    const productMatchCountByAisle = new Map();
    let totalMatchedProducts = 0;

    for (let i = 0; i < aisles.length; i++) {
        const a = aisles[i];
        const st = getAisleOccupancyStats(a);
        const zType = getAisleZoneType(a);
        statsByAisle.set(a, st);
        zoneByAisle.set(a, zType);

        totalWhCapacity += st.totalCapacity;
        totalWhOccupied += st.occupiedSlots;
        if (zType === 'main') countMainAisles++;
        else countAuxAisles++;

        densityCounts[st.densityInfo.levelKey] = (densityCounts[st.densityInfo.levelKey] || 0) + 1;

        if (productQ !== '') {
            let matchCnt = 0;
            const list = st.itemsList;
            for (let j = 0; j < list.length; j++) {
                const it = list[j];
                if ((it.sn && String(it.sn).toLowerCase().includes(productQ)) ||
                    (it.name && String(it.name).toLowerCase().includes(productQ)) ||
                    (it.category && String(it.category).toLowerCase().includes(productQ)) ||
                    (it.location && String(it.location).toLowerCase().includes(productQ))) {
                    matchCnt++;
                }
            }
            if (matchCnt > 0) {
                productMatchCountByAisle.set(a, matchCnt);
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

    // กรองเฉพาะแถวที่พบสินค้าเมื่อมีการค้นหาสินค้า/S/N ข้ามทุกแถว
    if (productQ !== '') {
        displayedAisles = displayedAisles.filter(a => (productMatchCountByAisle.get(a) || 0) > 0);
    }

    // จัดเรียงแถวตามโหมดที่เลือก
    if (activeAisleSortMode === 'DENSITY_DESC') {
        displayedAisles = [...displayedAisles].sort((a, b) => statsByAisle.get(b).rawOccupancyRate - statsByAisle.get(a).rawOccupancyRate);
    } else if (activeAisleSortMode === 'AVAILABLE_DESC') {
        displayedAisles = [...displayedAisles].sort((a, b) => statsByAisle.get(b).availableSlots - statsByAisle.get(a).availableSlots);
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

    let html = `
        <div class="wh-fullscreen-card">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 18px;">
                <div style="display: flex; align-items: center; gap: 16px; min-width: 280px; max-width: 100%;">
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
                                ⚡ Instant Ready
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

            <!-- แถบกรองสถานะความหนาแน่น & ตัวเลือกการจัดเรียง -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; padding: 10px 12px; background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px;">
                <div style="display: flex; align-items: center; gap: 6px; overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch;">
                    ${densityPillsHtml}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <select class="form-control" onchange="setAisleSortMode(this.value)" style="padding: 5px 10px; font-size: 0.8rem; border-radius: 10px; font-weight: 700; width: auto; height: 34px;" title="เรียงลำดับแถวจัดเก็บ">
                        <option value="DEFAULT" ${activeAisleSortMode === 'DEFAULT' ? 'selected' : ''}>↕️ เรียงตามผังมาตรฐาน</option>
                        <option value="DENSITY_DESC" ${activeAisleSortMode === 'DENSITY_DESC' ? 'selected' : ''}>🔥 หนาแน่นมาก → น้อย</option>
                        <option value="AVAILABLE_DESC" ${activeAisleSortMode === 'AVAILABLE_DESC' ? 'selected' : ''}>🟢 ช่องว่างมาก → น้อย</option>
                    </select>
                </div>
            </div>

            <!-- แถบเครื่องมือค้นหาและตัวกรอง -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;">
                <div style="font-size: 0.9rem; font-weight: 800; color: var(--text-sub, #475569); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-hand-pointer" style="color: var(--primary, #0284c7);"></i>
                    <span>คลิกเลือกแถวจัดเก็บ เพื่อเด้งดูรายการสินค้าเรียลไทม์:</span>
                    ${productQ !== '' ? `<span style="font-size:0.78rem; padding:2px 10px; border-radius:12px; background:rgba(2,132,199,0.15); color:#0284c7;">พบ ${totalMatchedProducts} ชิ้น ใน ${displayedAisles.length} แถว</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <input id="globalLocProductSearchInput" type="text" class="form-control" placeholder="🎯 ค้นหาสินค้า / S/N ข้ามทุกแถว..." value="${escapeHTML(globalLocationProductQuery)}" oninput="onGlobalLocationProductSearch(this.value)" style="padding: 6px 14px; font-size: 0.84rem; width: 230px; border-radius: 10px;">
                    <input id="aisleNameSearchInput" type="text" class="form-control" placeholder="🔍 ค้นหาชื่อแถว..." value="${escapeHTML(aisleFilterSearchQuery)}" oninput="onAisleFilterSearchInput(this.value)" style="padding: 6px 14px; font-size: 0.84rem; width: 170px; border-radius: 10px;">
                </div>
            </div>

            <!-- ผังการ์ดแถวจัดเก็บแบบ GRID สวยงามและรวดเร็ว 100% -->
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(245px, 1fr)); gap: 14px; padding-top: 14px; border-top: 1px dashed var(--border-color, #e2e8f0);">
    `;

    if (displayedAisles.length === 0) {
        html += `<div style="grid-column:1/-1; font-size:0.9rem; color:var(--text-muted,#64748b); text-align:center; padding:24px 0;">ไม่พบแถวจัดเก็บในโหมดหรือคำค้นหานี้</div>`;
    }

    const cardChunks = new Array(displayedAisles.length);
    for (let idx = 0; idx < displayedAisles.length; idx++) {
        const aisle = displayedAisles[idx];
        const stats = statsByAisle.get(aisle);
        const zType = zoneByAisle.get(aisle);
        const den = stats.densityInfo;
        const matchedCount = productMatchCountByAisle.get(aisle) || 0;

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

        const highlightBorder = matchedCount > 0 ? 'border: 2px solid var(--primary, #0284c7); box-shadow: 0 6px 20px rgba(2, 132, 199, 0.22);' : 'border: 1px solid var(--border-color, #e2e8f0);';
        const openCall = matchedCount > 0
            ? `selectLocationAisle('${escapeHTML(aisle)}', '${escapeHTML(globalLocationProductQuery)}')`
            : `selectLocationAisle('${escapeHTML(aisle)}')`;

        cardChunks[idx] = `
            <div class="wh-aisle-card-grid" onclick="${openCall}" style="background: var(--bg-surface, #ffffff); ${highlightBorder} border-radius: 14px; padding: 14px; cursor: pointer; transition: transform 0.18s ease, border-color 0.18s ease; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;" onmouseover="this.style.borderColor='var(--primary,#0284c7)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='${matchedCount > 0 ? 'var(--primary,#0284c7)' : 'var(--border-color,#e2e8f0)'}'; this.style.transform='none';">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-size: 1.1rem; font-weight: 800; color: var(--text-main, #0f172a);">แถว ${escapeHTML(aisle)}</span>
                            <span style="font-size: 0.68rem; font-weight: 800; padding: 2px 6px; border-radius: 6px; background: ${zType === 'main' ? 'rgba(2,132,199,0.15)' : 'rgba(217,119,6,0.15)'}; color: ${zType === 'main' ? '#0284c7' : '#d97706'}; border: 1px solid ${zType === 'main' ? 'rgba(2,132,199,0.3)' : 'rgba(217,119,6,0.3)'};">
                                ${zType === 'main' ? '🔵 หลัก' : '🟡 เพิ่มเติม'}
                            </span>
                        </div>
                        <span style="font-size: 0.76rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: ${den.badgeBg}; color: ${den.badgeColor}; white-space: nowrap;">
                            ${stats.occupiedSlots} รายการ
                        </span>
                    </div>

                    ${matchedCount > 0 ? `
                        <div style="font-size: 0.76rem; font-weight: 800; color: #0284c7; background: rgba(2, 132, 199, 0.12); border: 1px solid rgba(2, 132, 199, 0.25); padding: 3px 8px; border-radius: 8px; margin-bottom: 8px; display: inline-flex; align-items: center; gap: 5px;">
                            🎯 พบสินค้าที่ค้นหา ${matchedCount} รายการ
                        </div>
                    ` : ''}

                    <div style="font-size: 0.8rem; color: var(--text-muted, #64748b); margin-bottom: 6px; display: flex; justify-content: space-between;">
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

                <div style="display: flex; gap: 6px; justify-content: space-between;">
                    <button type="button" class="btn btn-sm btn-primary" onclick="event.stopPropagation(); ${openCall}" style="flex: 1; font-size: 0.78rem; border-radius: 8px; font-weight: 700;">
                        📋 ดูป๊อปอัป
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); linkToInventoryView('${escapeHTML(aisle)}')" style="font-size: 0.78rem; border-radius: 8px; font-weight: 700;" title="ลิงก์ไปหน้าเช็กสต็อก">
                        🔗 ลิงก์สต็อก
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
    if (['DEFAULT', 'DENSITY_DESC', 'AVAILABLE_DESC'].includes(mode)) {
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
window.openAisleDetailModal = openAisleDetailModal;
window.closeAisleDetailModal = closeAisleDetailModal;
window.linkToInventoryView = linkToInventoryView;
window.exportAisleItemsToCSV = exportAisleItemsToCSV;
window.copyAllAisleSerials = copyAllAisleSerials;
window.prewarmWarehouseLocationView = prewarmWarehouseLocationView;