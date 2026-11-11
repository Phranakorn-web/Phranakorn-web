// =========================================================================
// --- MODULE: REALTIME WAREHOUSE ZONE & INVENTORY LINKING ENGINE (v24.0) ---
// --- HIGH-PERFORMANCE EXPANDED AISLE POPUP & INSTANT INVENTORY ROUTING ---
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

// Cache ความหนาแน่นรวมคลังสินค้าสำหรับการประมวลผลเบื้องหลัง
let cachedWarehouseStats = null;
let isBackgroundPrecalculating = false;

// ⚡ Zero-Flicker Smart DOM Update Cache
const lastRenderedHTML = new Map();

// -------------------------------------------------------------------------
// 🎯 Realtime Active View Persistence Engine (ค้างหน้าเดิมตลอดแม้กดรีเฟรช)
// -------------------------------------------------------------------------
(function hookViewSwitchPersistence() {
    if (typeof window.switchView === 'function') {
        const originalSwitchView = window.switchView;
        window.switchView = function(viewId, ...args) {
            if (viewId) {
                localStorage.setItem('WMS_ACTIVE_VIEW_ID', viewId);
            }
            return originalSwitchView.apply(this, [viewId, ...args]);
        };
    }
})();

// -------------------------------------------------------------------------
// Smart DOM Updating Function (Flicker-Free Rendering Engine)
// -------------------------------------------------------------------------
function smartUpdateDOM(elementId, newHTML) {
    const elem = document.getElementById(elementId);
    if (!elem) return;

    const currentCached = lastRenderedHTML.get(elementId);
    if (currentCached === newHTML) {
        return;
    }

    lastRenderedHTML.set(elementId, newHTML);

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
        } catch (e) {
            console.warn('Background Precalculation Error:', e);
        } finally {
            isBackgroundPrecalculating = false;
        }
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(runCalculation, { timeout: 1000 });
    } else {
        setTimeout(runCalculation, 0);
    }
}

function refreshLocationVisualizerIfActive() {
    scheduleBackgroundPrecalculation();
    renderDrillDownAisleBar();
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

function extractAisleFromLocation(locStr) {
    if (!locStr) return '';
    let rawStr = String(locStr).trim();
    
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

    for (let key of knownAisles) {
        const keyUpper = key.toUpperCase().trim();
        const rawUpper = rawStr.toUpperCase();

        if (rawUpper === keyUpper) return key;
        if (rawUpper.startsWith(keyUpper + '-') || 
            rawUpper.startsWith(keyUpper + '/') || 
            rawUpper.startsWith(keyUpper + '_') || 
            rawUpper.startsWith(keyUpper + ' ')) {
            return key;
        }
    }

    let parts = rawStr.split(/[\-\/_]+/).filter(Boolean);
    if (parts.length > 0) {
        let p0 = parts[0].trim();
        let matchEngNum = p0.match(/^([A-Z0-9_]+)$/i);
        if (matchEngNum) return matchEngNum[1].toUpperCase();
        return p0;
    }

    return rawStr;
}

function parseLocationComponents(locStr) {
    if (!locStr) return { aisle: 'DOCK', bay: '01', shelf: '1', slot: '01', raw: '' };
    let cleanStr = String(locStr).trim().toUpperCase();

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(cleanStr)) {
        return { aisle: cleanStr, bay: '01', shelf: '1', slot: '01', raw: cleanStr };
    }

    let aisle = extractAisleFromLocation(cleanStr) || 'A';
    let remainder = cleanStr;
    if (remainder.startsWith(aisle)) {
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

    return {
        aisle: aisle,
        bay: bayStr,
        shelf: String(shelfNum),
        slot: slotStr,
        raw: cleanStr,
        formatted: `${aisle}-${bayStr}-${shelfNum}-${slotStr}`
    };
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

    if (rawRate > 100) {
        statusText = `เกินความจุ (${rawRate}%)`;
        badgeBg = 'rgba(225, 29, 72, 0.2)';
        badgeColor = '#e11d48';
        barGradient = 'linear-gradient(90deg, #e11d48 0%, #9f1239 100%)';
        statusIcon = '🚨';
    } else if (rate >= 95) {
        statusText = 'เต็มพื้นที่';
        badgeBg = 'rgba(239, 68, 68, 0.18)';
        badgeColor = '#dc2626';
        barGradient = 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)';
        statusIcon = '🔴';
    } else if (rate >= 75) {
        statusText = 'หนาแน่นสูง';
        badgeBg = 'rgba(245, 158, 11, 0.18)';
        badgeColor = '#d97706';
        barGradient = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
        statusIcon = '🟡';
    } else if (rate >= 40) {
        statusText = 'หนาแน่นปานกลาง';
        badgeBg = 'rgba(2, 132, 199, 0.15)';
        badgeColor = '#0284c7';
        barGradient = 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)';
        statusIcon = '🔵';
    }

    return {
        rate, rawRate, count, capacity: totalCap,
        available: Math.max(0, totalCap - count),
        statusText, badgeBg, badgeColor, barGradient, statusIcon
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

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    inventory.forEach(item => {
        if (item && item.location) {
            const aisle = extractAisleFromLocation(item.location);
            if (aisle && !aisleMap.has(aisle)) {
                addAisle(aisle, 9999);
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
        return { totalCapacity: 0, configuredCapacity: 0, occupiedSlots: 0, availableSlots: 0, occupancyRate: 0, rawOccupancyRate: 0, baysCount: 0, maxFoundBay: 0, itemsList: [], densityInfo: getDensityInfo(0, 100) };
    }

    const targetAisle = String(aisleName).trim();
    const targetAisleUpper = targetAisle.toUpperCase();

    const config = getAisleConfig(targetAisle);
    const configuredBays = Math.max(1, parseInt(config.bays || config.bay, 10) || 10);
    const configuredShelves = Math.max(1, parseInt(config.shelves || config.shelf, 10) || 1);
    const configuredSlots = Math.max(1, parseInt(config.slots || config.slot, 10) || 10);

    const inventory = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];
    const itemsInAisle = inventory.filter(item => {
        if (!item || !item.location) return false;
        
        const parsed = parseLocationComponents(item.location);
        if (parsed.aisle.toUpperCase() === targetAisleUpper) return true;

        const rawLocUpper = String(item.location).trim().toUpperCase();
        return rawLocUpper === targetAisleUpper ||
               rawLocUpper.startsWith(targetAisleUpper + '-') ||
               rawLocUpper.startsWith(targetAisleUpper + '/') ||
               rawLocUpper.startsWith(targetAisleUpper + '_') ||
               rawLocUpper.startsWith(targetAisleUpper + ' ');
    });

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
        densityInfo
    };
}

// -------------------------------------------------------------------------
// 🚀 MODAL POPUP ENGINE: ป๊อปอัปขยายพื้นที่ใช้งานกว้างขวาง สวยงาม อ่านง่าย 100%
// -------------------------------------------------------------------------
function openAisleDetailModal(aisleName, filterQuery = '', bayFilter = 'ALL') {
    if (!aisleName) return;

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
        items.forEach((item, index) => {
            const locStr = escapeHTML(item.location || '-');
            const categoryStr = escapeHTML(item.category || 'ทั่วไป');
            const nameStr = escapeHTML(item.name || 'ไม่ระบุชื่อรุ่น');
            const snStr = escapeHTML(item.sn || '-');
            const formattedLoc = formatCompactLocationTag(item.location);

            itemsRowsHtml += `
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
        });
    }

    // สร้าง Bay Filter Pills ปุ่มเลือก ล็อก (Bay)
    let bayPillsHtml = `<button type="button" class="btn btn-sm ${bayFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" onclick="openAisleDetailModal('${escapeHTML(aisleName)}', '${escapeHTML(filterQuery)}', 'ALL')" style="border-radius: 20px; font-weight: 700;">ทุก Bay</button>`;
    for (let b = 1; b <= stats.baysCount; b++) {
        const bStr = String(b).padStart(2, '0');
        const isSel = (bayFilter === bStr || bayFilter === String(b));
        bayPillsHtml += `
            <button type="button" class="btn btn-sm ${isSel ? 'btn-primary' : 'btn-secondary'}" onclick="openAisleDetailModal('${escapeHTML(aisleName)}', '${escapeHTML(filterQuery)}', '${bStr}')" style="border-radius: 20px; font-weight: 700; padding: 4px 12px;">
                Bay ${bStr}
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

                    <div style="display: flex; align-items: center; gap: 10px;">
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
                    <input type="text" class="form-control" placeholder="🔍 ค้นหาในแถวนี้ (ชื่อรุ่น, SKU, S/N, พิกัด)..." value="${escapeHTML(filterQuery)}" oninput="openAisleDetailModal('${escapeHTML(aisleName)}', this.value, '${escapeHTML(bayFilter)}')" style="padding-left: 38px; border-radius: 12px; font-size: 0.88rem; height: 40px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted, #94a3b8); font-size: 0.9rem;"></i>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-bottom: 2px; max-width: 100%;">
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
function renderDrillDownAisleBar() {
    const container = document.getElementById('aisleFilterBar');
    if (!container) return;

    const aisles = getAllConfiguredAisles();

    // คำนวณภาพรวมความหนาแน่นและนับประเภทแถว
    let totalWhCapacity = 0;
    let totalWhOccupied = 0;
    let countMainAisles = 0;
    let countAuxAisles = 0;

    aisles.forEach(a => {
        const st = getAisleOccupancyStats(a);
        totalWhCapacity += st.totalCapacity;
        totalWhOccupied += st.occupiedSlots;
        const zType = getAisleZoneType(a);
        if (zType === 'main') countMainAisles++;
        else countAuxAisles++;
    });

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
        displayedAisles = displayedAisles.filter(a => getAisleZoneType(a) === 'main');
    } else if (activeAisleZoneFilter === 'AUXILIARY') {
        displayedAisles = displayedAisles.filter(a => getAisleZoneType(a) === 'auxiliary');
    }

    // กรองด้วยคำค้นชื่อแถว
    if (aisleFilterSearchQuery.trim() !== '') {
        const q = aisleFilterSearchQuery.toLowerCase().trim();
        displayedAisles = displayedAisles.filter(a => a.toLowerCase().includes(q));
    }

    let html = `
        <div class="wh-fullscreen-card">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px;">
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
                        </div>
                        <div style="font-size: 0.86rem; color: var(--text-muted, #64748b); margin-top: 4px;">
                            โครงสร้างหลัก: <strong style="color:var(--primary);">${countMainAisles}</strong> แถว • โครงสร้างเพิ่มเติม: <strong style="color:var(--warning);">${countAuxAisles}</strong> แถว (จัดเก็บแล้ว <strong>${totalWhOccupied.toLocaleString()}</strong> รายการ)
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

            <!-- แถบเครื่องมือค้นหาและตัวกรอง -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;">
                <div style="font-size: 0.9rem; font-weight: 800; color: var(--text-sub, #475569); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-hand-pointer" style="color: var(--primary, #0284c7);"></i>
                    <span>คลิกเลือกแถวจัดเก็บ เพื่อเด้งดูรายการสินค้าเรียลไทม์:</span>
                </div>
                <input type="text" class="form-control" placeholder="🔍 ค้นหาแถว..." value="${escapeHTML(aisleFilterSearchQuery)}" oninput="onAisleFilterSearchInput(this.value)" style="padding: 6px 14px; font-size: 0.84rem; width: 200px; border-radius: 10px;">
            </div>

            <!-- ผังการ์ดแถวจัดเก็บแบบ GRID สวยงามและรวดเร็ว 100% -->
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; padding-top: 14px; border-top: 1px dashed var(--border-color, #e2e8f0);">
    `;

    if (displayedAisles.length === 0) {
        html += `<div style="grid-column:1/-1; font-size:0.9rem; color:var(--text-muted,#64748b); text-align:center; padding:24px 0;">ไม่พบแถวจัดเก็บในโหมดหรือคำค้นหานี้</div>`;
    }

    displayedAisles.forEach(aisle => {
        const stats = getAisleOccupancyStats(aisle);
        const zType = getAisleZoneType(aisle);
        const den = stats.densityInfo;

        html += `
            <div class="wh-aisle-card-grid" onclick="selectLocationAisle('${escapeHTML(aisle)}')" style="background: var(--bg-surface, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 14px; cursor: pointer; transition: all 0.2s ease; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;" onmouseover="this.style.borderColor='var(--primary,#0284c7)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='var(--border-color,#e2e8f0)'; this.style.transform='none';">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.1rem; font-weight: 800; color: var(--text-main, #0f172a);">แถว ${escapeHTML(aisle)}</span>
                        <span style="font-size: 0.68rem; font-weight: 800; padding: 2px 6px; border-radius: 6px; background: ${zType === 'main' ? 'rgba(2,132,199,0.15)' : 'rgba(217,119,6,0.15)'}; color: ${zType === 'main' ? '#0284c7' : '#d97706'}; border: 1px solid ${zType === 'main' ? 'rgba(2,132,199,0.3)' : 'rgba(217,119,6,0.3)'};">
                            ${zType === 'main' ? '🔵 โครงสร้างหลัก' : '🟡 โครงสร้างเพิ่มเติม'}
                        </span>
                    </div>
                    <span style="font-size: 0.76rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: ${den.badgeBg}; color: ${den.badgeColor};">
                        ${stats.occupiedSlots} รายการ
                    </span>
                </div>

                <div style="font-size: 0.8rem; color: var(--text-muted, #64748b); margin-bottom: 8px;">
                    ความจุ: ${stats.totalCapacity} ช่อง (${den.rawRate}% หนาแน่น)
                </div>

                <div style="width: 100%; height: 6px; background: var(--bg-subtle); border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
                    <div style="width: ${den.rate}%; height: 100%; background: ${den.barGradient};"></div>
                </div>

                <div style="display: flex; gap: 6px; justify-content: space-between;">
                    <button type="button" class="btn btn-sm btn-primary" onclick="event.stopPropagation(); selectLocationAisle('${escapeHTML(aisle)}')" style="flex: 1; font-size: 0.78rem; border-radius: 8px; font-weight: 700;">
                        📋 ดูป๊อปอัป
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); linkToInventoryView('${escapeHTML(aisle)}')" style="font-size: 0.78rem; border-radius: 8px; font-weight: 700;" title="ลิงก์ไปหน้าเช็กสต็อก">
                        🔗 ลิงก์สต็อก
                    </button>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    smartUpdateDOM('aisleFilterBar', html);
}

function selectLocationAisle(aisleName) {
    activeLocationAisle = aisleName;
    openAisleDetailModal(aisleName);
}

function setAisleZoneFilter(mode) {
    if (['ALL', 'MAIN', 'AUXILIARY'].includes(mode)) {
        activeAisleZoneFilter = mode;
        renderDrillDownAisleBar();
    }
}

function onAisleFilterSearchInput(val) {
    aisleFilterSearchQuery = val;
    renderDrillDownAisleBar();
}

// Global Export
window.renderDrillDownAisleBar = renderDrillDownAisleBar;
window.selectLocationAisle = selectLocationAisle;
window.setAisleZoneFilter = setAisleZoneFilter;
window.openAisleDetailModal = openAisleDetailModal;
window.closeAisleDetailModal = closeAisleDetailModal;
window.linkToInventoryView = linkToInventoryView;