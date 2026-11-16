// =========================================================================
// --- MODULE 5.1: HIGH-SPEED STOCK CHECK ENGINE (O(1) SCAN & 60FPS UI) ---
// --- Instant Barcode Lookup, Quick-Dispatch Mode & Non-Blocking Render ---
// =========================================================================

let isStockCheckQuickDispatchMode = false;
let isStockCheckRenderScheduled = false;
let stockCheckCurrentPage = 1;
const STOCK_CHECK_PAGE_SIZE = 100;
let stockCheckExactSnMap = new Map();
let lastStockCheckSourceRef = null;
let lastStockCheckSourceLen = -1;

// ⚡ สร้างดัชนีค้นหา S/N แบบ O(1) สำหรับหน้าเช็กสต็อก (รองรับ 3,576+ รายการโดยไม่ค้าง)
function rebuildStockCheckLookupIndex(force = false) {
    const sourceList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : [];

    if (!force && sourceList === lastStockCheckSourceRef && sourceList.length === lastStockCheckSourceLen) {
        return stockCheckExactSnMap;
    }

    stockCheckExactSnMap.clear();
    for (let i = 0; i < sourceList.length; i++) {
        const item = sourceList[i];
        if (!item || !item.sn) continue;
        const statusUpper = String(item.status || '').toUpperCase();
        if (statusUpper === 'OUT' || statusUpper === 'DISPATCHED' || statusUpper === 'ISSUED' || item.is_deleted || Number(item.qty) <= 0) {
            continue;
        }
        stockCheckExactSnMap.set(String(item.sn).trim().toUpperCase(), item);
    }

    lastStockCheckSourceRef = sourceList;
    lastStockCheckSourceLen = sourceList.length;
    return stockCheckExactSnMap;
}

function getStockCheckSearchInput() {
    return document.getElementById('stockSearchInput') ||
           document.getElementById('inventorySearchInput') ||
           document.getElementById('checkStockSearchInput') ||
           document.querySelector('[data-role="stock-search-input"]');
}

// ⚡ แถบควบคุมโหมดสแกนความเร็วสูงในหน้าเช็กสต็อก (โหมดสแกนค้นหา vs โหมดยิงเบิกออกทันที)
function ensureStockCheckQuickDispatchControlBar() {
    let bar = document.getElementById('stockCheckQuickDispatchBar');
    if (bar) return bar;

    const searchInput = getStockCheckSearchInput();
    if (!searchInput) return null;

    const host = searchInput.closest('.card, .section-card, .filter-bar, .search-wrapper') || searchInput.parentElement;
    if (!host || !host.parentElement) return null;

    bar = document.createElement('div');
    bar.id = 'stockCheckQuickDispatchBar';
    bar.className = 'stock-quick-dispatch-banner';
    bar.innerHTML = `
        <div style="display:flex; align-items:center; gap:9px; flex-wrap:wrap;">
            <span class="pulse-live-dot"></span>
            <span id="stockCheckModeLabel" style="font-size:0.8rem; font-weight:800; color:#0f172a;">
                🔍 โหมดสแกนตรวจสอบสต็อก (ยิงปืนสแกน S/N เพื่อค้นหาทันทีใน 0ms)
            </span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" id="btnToggleStockQuickDispatch" onclick="toggleStockCheckQuickDispatchMode()" style="padding:6px 12px; border-radius:99px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; font-size:0.76rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> เปิดโหมดยิงเบิกออกทันที
            </button>
        </div>
    `;

    host.parentElement.insertBefore(bar, host.nextSibling);
    return bar;
}

function toggleStockCheckQuickDispatchMode(forceState = null) {
    isStockCheckQuickDispatchMode = typeof forceState === 'boolean' ? forceState : !isStockCheckQuickDispatchMode;

    const bar = ensureStockCheckQuickDispatchControlBar();
    const label = document.getElementById('stockCheckModeLabel');
    const btn = document.getElementById('btnToggleStockQuickDispatch');
    const searchInput = getStockCheckSearchInput();

    if (bar) {
        bar.classList.toggle('active', isStockCheckQuickDispatchMode);
    }
    if (label) {
        label.innerHTML = isStockCheckQuickDispatchMode
            ? `⚡ <span style="color:#be123c;">เปิดใช้งานโหมดยิงเบิกสินค้าออกทันที (0ms Optimistic Dispatch)</span> — ยิง S/N แล้วตัดสต็อกเข้าคิว DB ทันที`
            : `🔍 โหมดสแกนตรวจสอบสต็อก (ยิงปืนสแกน S/N เพื่อค้นหาทันทีใน 0ms)`;
    }
    if (btn) {
        btn.style.background = isStockCheckQuickDispatchMode ? '#e11d48' : '#ffffff';
        btn.style.color = isStockCheckQuickDispatchMode ? '#ffffff' : '#0f172a';
        btn.style.borderColor = isStockCheckQuickDispatchMode ? '#be123c' : '#cbd5e1';
        btn.innerHTML = isStockCheckQuickDispatchMode
            ? `<i class="fa-solid fa-shield-halved"></i> สลับกลับเป็นโหมดค้นหา`
            : `<i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> เปิดโหมดยิงเบิกออกทันที`;
    }
    if (searchInput) {
        searchInput.placeholder = isStockCheckQuickDispatchMode
            ? '⚡ ยิง S/N เพื่อเบิกสินค้าออกทันที (0ms Optimistic)...'
            : '🔍 สแกนหรือพิมพ์ S/N, ชื่อรุ่น, หมวดหมู่, พิกัด...';
        searchInput.focus();
    }
}

// 🔫 รองรับปืนสแกนความเร็วสูงในช่องค้นหา/สแกนหน้าเช็กสต็อก
function attachStockCheckFastScannerListener(searchInput) {
    if (!searchInput || searchInput.dataset.stockCheckScannerBound === 'true') return;
    searchInput.dataset.stockCheckScannerBound = 'true';

    let lastKeyTime = 0;
    let burstCount = 0;
    let burstTimer = null;

    const executeStockScanAction = () => {
        const rawVal = String(searchInput.value || '').trim();
        if (!rawVal) return;

        // หากเปิด "โหมดยิงเบิกออกทันที" ให้ส่งเข้าคิว 0ms Outbound Queue ทันที
        if (isStockCheckQuickDispatchMode && typeof window.outboundScanQueue !== 'undefined') {
            const tokens = rawVal.split(/[\r\n\t]+/).map(s => s.trim()).filter(Boolean);
            searchInput.value = '';
            searchInput.focus();

            tokens.forEach((snToken, idx) => {
                const speed = typeof recordOutboundScanSpeedMetrics === 'function' ? recordOutboundScanSpeedMetrics() : 1;
                outboundScanQueue.push({
                    sn: snToken,
                    recipient: '',
                    timestamp: Date.now() + idx,
                    measuredSpeed: speed
                });
            });
            if (typeof processOutboundScanQueue === 'function') {
                processOutboundScanQueue();
            }
            scheduleStockCheckRender('QUICK_DISPATCH');
            return;
        }

        // โหมดตรวจสอบสต็อก: ค้นหา S/N แบบ O(1) ใน 0ms แล้วเลือกข้อความไว้เพื่อให้ยิงนัดถัดไปทับได้ทันที!
        rebuildStockCheckLookupIndex(false);
        const exactMatch = stockCheckExactSnMap.get(rawVal.toUpperCase());
        if (exactMatch && typeof playOutboundAudioFeedback === 'function') {
            playOutboundAudioFeedback('success');
        }
        scheduleStockCheckRender('SCAN_LOOKUP');
        searchInput.select();
    };

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Tab') {
            e.preventDefault();
            if (burstTimer) clearTimeout(burstTimer);
            burstCount = 0;
            executeStockScanAction();
            return;
        }

        const now = Date.now();
        if (e.key && e.key.length === 1) {
            burstCount = (now - lastKeyTime < 75) ? (burstCount + 1) : 1;
            lastKeyTime = now;
        }
    });

    searchInput.addEventListener('input', () => {
        if (burstTimer) clearTimeout(burstTimer);
        if (burstCount >= 3 && searchInput.value.trim().length >= 3) {
            burstTimer = setTimeout(() => {
                burstCount = 0;
                executeStockScanAction();
            }, 60);
        } else {
            stockCheckCurrentPage = 1;
            scheduleStockCheckRender('FILTER_INPUT');
        }
    });
}

// ⚡ กรองข้อมูลสต็อกแบบความเร็วสูง (ถ้าพิมพ์/ยิง S/N ตรงกับรายการ จะคืนผลใน O(1) 0.01ms)
function filterStockItemsFast(queryStr = '', categoryFilter = '', aisleFilter = '') {
    rebuildStockCheckLookupIndex(false);
    const q = String(queryStr || '').trim().toUpperCase();
    const cat = String(categoryFilter || '').trim().toUpperCase();
    const aisle = String(aisleFilter || '').trim().toUpperCase();

    // O(1) Fast Path เมื่อยิงบาร์โค้ด S/N เต็มใบ
    if (q && !cat && !aisle && stockCheckExactSnMap.has(q)) {
        return [stockCheckExactSnMap.get(q)];
    }

    const results = [];
    stockCheckExactSnMap.forEach((item) => {
        if (cat && cat !== 'ALL' && String(item.category || '').toUpperCase() !== cat) return;
        if (aisle && aisle !== 'ALL' && !String(item.location || '').toUpperCase().startsWith(aisle)) return;

        if (q) {
            const snMatch = String(item.sn || '').toUpperCase().includes(q);
            const nameMatch = String(item.name || '').toUpperCase().includes(q);
            const locMatch = String(item.location || '').toUpperCase().includes(q);
            const catMatch = String(item.category || '').toUpperCase().includes(q);
            if (!snMatch && !nameMatch && !locMatch && !catMatch) return;
        }
        results.push(item);
    });

    return results;
}

// ⚡ จัดตารางเรนเดอร์ผ่าน requestAnimationFrame (60fps ไม่บล็อกปืนสแกน)
function scheduleStockCheckRender(reason = '') {
    if (isStockCheckRenderScheduled) return;
    isStockCheckRenderScheduled = true;

    requestAnimationFrame(() => {
        isStockCheckRenderScheduled = false;

        // เรียกฟังก์ชันเรนเดอร์หลักของระบบเดิมหากมีอยู่
        if (typeof window !== 'undefined' && typeof window.renderInventoryTable === 'function') {
            window.renderInventoryTable();
        } else if (typeof window !== 'undefined' && typeof window.filterAndRenderStock === 'function') {
            window.filterAndRenderStock();
        } else {
            renderFallbackFastStockTable();
        }
    });
}

function renderFallbackFastStockTable() {
    const tbody = document.getElementById('stockTableBody') || document.getElementById('inventoryTableBody');
    if (!tbody) return;

    const searchInput = getStockCheckSearchInput();
    const catSelect = document.getElementById('stockCategoryFilter') || document.getElementById('filterCategory');
    const aisleSelect = document.getElementById('stockAisleFilter') || document.getElementById('filterAisle');

    const matchedItems = filterStockItemsFast(
        searchInput ? searchInput.value : '',
        catSelect ? catSelect.value : '',
        aisleSelect ? aisleSelect.value : ''
    );

    const totalEl = document.getElementById('totalStockCountBadge') || document.getElementById('stockTotalCount');
    if (totalEl) {
        totalEl.textContent = matchedItems.length.toLocaleString();
    }

    if (matchedItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:24px; color:#64748b;">
                    ไม่พบรายการสินค้าคงเหลือที่ตรงกับเงื่อนไขการค้นหา
                </td>
            </tr>
        `;
        return;
    }

    const startIdx = (stockCheckCurrentPage - 1) * STOCK_CHECK_PAGE_SIZE;
    const pageSlice = matchedItems.slice(startIdx, startIdx + STOCK_CHECK_PAGE_SIZE);

    const rowsHtml = pageSlice.map((item, idx) => {
        const sn = escapeOutboundHTML(item.sn || '-');
        const name = escapeOutboundHTML(item.name || '-');
        const cat = escapeOutboundHTML(item.category || '-');
        const loc = escapeOutboundHTML(formatOutboundLocationText(item.location));
        const meter = Number(item.meter || 0).toLocaleString();
        const itemId = escapeOutboundHTML(item.id || '');

        return `
            <tr class="${matchedItems.length === 1 ? 'stock-row-flash-match' : ''}">
                <td class="mono">${startIdx + idx + 1}</td>
                <td class="mono" style="font-weight:700;">${sn}</td>
                <td>${cat}</td>
                <td>${name}</td>
                <td class="mono">${meter}</td>
                <td>${loc}</td>
                <td style="white-space:nowrap;">
                    <button type="button" onclick="quickDispatchSingleStockItem('${sn}')" class="btn-card-action" style="color:#0369a1;">
                        <i class="fa-solid fa-truck-ramp-box"></i> เบิกออก
                    </button>
                    <button type="button" onclick="requestOrExecuteStockDelete('${itemId}', '${sn}')" class="btn-card-action btn-card-delete">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHtml;
}

// ⚡ กดเบิกออกทันที 1 คลิกจากรายการเช็กสต็อก (เข้าคิว 0ms Optimistic FIFO)
function quickDispatchSingleStockItem(sn) {
    if (!sn) return;
    if (typeof outboundScanQueue !== 'undefined' && typeof processOutboundScanQueue === 'function') {
        outboundScanQueue.push({
            sn: String(sn).trim(),
            recipient: '',
            timestamp: Date.now(),
            measuredSpeed: 1
        });
        processOutboundScanQueue();
        scheduleStockCheckRender('SINGLE_DISPATCH');
    }
}

// 🔒 คงสิทธิ์การลบตามบทบาท (Admin ลบได้ทันที / ผู้ใช้ทั่วไปส่งคำขออนุมัติ)
function requestOrExecuteStockDelete(itemId, sn) {
    if (typeof window !== 'undefined' && typeof window.deleteInventoryItem === 'function') {
        window.deleteInventoryItem(itemId, sn);
        return;
    }
    if (typeof window !== 'undefined' && typeof window.openFallbackStockDeleteApprovalModal === 'function') {
        window.openFallbackStockDeleteApprovalModal(itemId, sn);
    }
}

function initStockCheckFastEngine() {
    rebuildStockCheckLookupIndex(true);
    ensureStockCheckQuickDispatchControlBar();

    const searchInput = getStockCheckSearchInput();
    if (searchInput) {
        attachStockCheckFastScannerListener(searchInput);
    }

    // รับการอัปเดตแบบ 0ms Optimistic จากหน้างานรับเข้าและหน้าเบิกออกโดยไม่ดึง DB ซ้ำซ้อน
    const syncHandler = (e) => {
        const detail = e && e.detail;
        if (detail && detail.sn) {
            const snUpper = String(detail.sn).trim().toUpperCase();
            const actionUpper = String(detail.action || detail.status || '').toUpperCase();

            if (actionUpper === 'DISPATCH' || actionUpper === 'OUT' || actionUpper === 'DELETE') {
                stockCheckExactSnMap.delete(snUpper);
            } else if (actionUpper === 'INBOUND' || actionUpper === 'IN_STOCK' || actionUpper === 'RESTORE_STOCK') {
                stockCheckExactSnMap.set(snUpper, detail);
            } else {
                rebuildStockCheckLookupIndex(true);
            }
        } else {
            rebuildStockCheckLookupIndex(true);
        }
        scheduleStockCheckRender('REALTIME_EVENT');
    };

    document.addEventListener('inventoryDataChanged', syncHandler);
    document.addEventListener('inventoryUpdated', syncHandler);
    document.addEventListener('inventoryDispatched', syncHandler);

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.onmessage = (event) => {
                if (event && event.data) {
                    syncHandler({ detail: event.data });
                }
            };
        }
    } catch (e) {}
}

if (typeof window !== 'undefined') {
    window.rebuildStockCheckLookupIndex = rebuildStockCheckLookupIndex;
    window.toggleStockCheckQuickDispatchMode = toggleStockCheckQuickDispatchMode;
    window.filterStockItemsFast = filterStockItemsFast;
    window.scheduleStockCheckRender = scheduleStockCheckRender;
    window.quickDispatchSingleStockItem = quickDispatchSingleStockItem;
    window.requestOrExecuteStockDelete = requestOrExecuteStockDelete;
    window.initStockCheckFastEngine = initStockCheckFastEngine;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initStockCheckFastEngine();
    });
} else {
    initStockCheckFastEngine();
}