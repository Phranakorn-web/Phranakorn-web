// =========================================================================
// --- MODULE 2B: INVENTORY TABLE VIEW, REALTIME BANNER, INV/PO & ACTIONS ---
// --- FILE: inv-table-view.js (v29.0 REALTIME INBOUND SYNC & INV/PO VIEW)  ---
// =========================================================================

// ตัวแปรควบคุมตัวกรองและการเรียงลำดับหน้าเช็กสต็อกสินค้า
let wmsCurrentDocFilter = 'ALL';
let wmsCurrentLocationFilter = 'ALL';
let wmsCurrentSortBy = 'LATEST';
let wmsActiveDeleteModalPayload = null;
let wmsActiveRelocatePayload = null;

// Helper: จัดรูปแบบวันเวลาภาษาไทยแบบกระชับ
function formatThaiCompactDateTime(isoStr) {
    if (!isoStr) return '-';
    try {
        const d = new Date(isoStr);
        if (Number.isNaN(d.getTime())) return String(isoStr);
        return d.toLocaleString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return String(isoStr);
    }
}

// Helper: สร้างป้ายแสดงผลเลข INV และ PO แบบสะอาดตา พร้อมคลิกคัดลอกได้ทันที
function renderInvPoBadgesHTML(invNo, poNo, compact = false) {
    const cleanInv = String(invNo || '').trim();
    const cleanPo = String(poNo || '').trim();

    if (!cleanInv && !cleanPo) {
        return `<span class="wms-doc-empty-badge" title="ยังไม่ได้ผูกเลขที่เอกสาร INV / PO">-</span>`;
    }

    const parts = [];
    if (cleanInv) {
        const safeInv = escapeHTML(cleanInv);
        const jsSafeInv = cleanInv.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        parts.push(
            `<button type="button" class="wms-doc-pill wms-doc-pill--inv ${compact ? 'is-compact' : ''}" ` +
            `onclick="event.stopPropagation(); copyTextToClipboard('${jsSafeInv}', 'เลขที่ใบกำกับภาษี (INV)');" ` +
            `title="คลิกเพื่อคัดลอก INV: ${safeInv}">` +
            `<span class="wms-doc-pill__tag">INV</span>` +
            `<span class="wms-doc-pill__val mono">${safeInv}</span>` +
            `</button>`
        );
    }

    if (cleanPo) {
        const safePo = escapeHTML(cleanPo);
        const jsSafePo = cleanPo.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        parts.push(
            `<button type="button" class="wms-doc-pill wms-doc-pill--po ${compact ? 'is-compact' : ''}" ` +
            `onclick="event.stopPropagation(); copyTextToClipboard('${jsSafePo}', 'เลขที่ใบสั่งซื้อ (PO)');" ` +
            `title="คลิกเพื่อคัดลอก PO: ${safePo}">` +
            `<span class="wms-doc-pill__tag">PO</span>` +
            `<span class="wms-doc-pill__val mono">${safePo}</span>` +
            `</button>`
        );
    }

    return `<div class="wms-doc-pill-stack ${compact ? 'is-compact' : ''}">${parts.join('')}</div>`;
}

// Helper: สร้างป้ายสรุปรายการ INV / PO ระดับกลุ่มรุ่นสินค้า (Grouped Mode)
function renderGroupInvPoSummaryHTML(group) {
    const invList = Array.isArray(group.invList) ? group.invList : [];
    const poList = Array.isArray(group.poList) ? group.poList : [];

    if (invList.length === 0 && poList.length === 0) {
        return `<span class="wms-doc-empty-badge">ยังไม่ระบุ INV / PO</span>`;
    }

    const maxVisible = 2;
    const htmlParts = [];

    const visibleInvs = invList.slice(0, maxVisible);
    visibleInvs.forEach(inv => {
        const safeInv = escapeHTML(inv);
        const jsSafeInv = inv.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        htmlParts.push(
            `<button type="button" class="wms-doc-pill wms-doc-pill--inv is-compact" ` +
            `onclick="event.stopPropagation(); copyTextToClipboard('${jsSafeInv}', 'เลขที่ใบกำกับภาษี (INV)');" ` +
            `title="คลิกคัดลอก INV: ${safeInv}">` +
            `<span class="wms-doc-pill__tag">INV</span>` +
            `<span class="wms-doc-pill__val mono">${safeInv}</span>` +
            `</button>`
        );
    });
    if (invList.length > maxVisible) {
        const restInv = invList.slice(maxVisible).join(', ');
        htmlParts.push(
            `<span class="wms-doc-more-chip wms-doc-more-chip--inv" title="INV อื่นๆ: ${escapeHTML(restInv)}">+${invList.length - maxVisible} INV</span>`
        );
    }

    const visiblePos = poList.slice(0, maxVisible);
    visiblePos.forEach(po => {
        const safePo = escapeHTML(po);
        const jsSafePo = po.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        htmlParts.push(
            `<button type="button" class="wms-doc-pill wms-doc-pill--po is-compact" ` +
            `onclick="event.stopPropagation(); copyTextToClipboard('${jsSafePo}', 'เลขที่ใบสั่งซื้อ (PO)');" ` +
            `title="คลิกคัดลอก PO: ${safePo}">` +
            `<span class="wms-doc-pill__tag">PO</span>` +
            `<span class="wms-doc-pill__val mono">${safePo}</span>` +
            `</button>`
        );
    });
    if (poList.length > maxVisible) {
        const restPo = poList.slice(maxVisible).join(', ');
        htmlParts.push(
            `<span class="wms-doc-more-chip wms-doc-more-chip--po" title="PO อื่นๆ: ${escapeHTML(restPo)}">+${poList.length - maxVisible} PO</span>`
        );
    }

    return `<div class="wms-doc-pill-stack is-compact">${htmlParts.join('')}</div>`;
}

// Helper: สร้างป้ายพิกัดจัดเก็บ
function renderLocationBadgeHTML(locStr, onClickAttr = '') {
    const loc = String(locStr || 'DOCK').toUpperCase().trim();
    let variantClass = 'wms-loc-badge--rack';
    let iconHtml = '<i class="fa-solid fa-location-dot"></i>';

    if (loc === 'DOCK') {
        variantClass = 'wms-loc-badge--dock';
        iconHtml = '<i class="fa-solid fa-truck-ramp-box"></i>';
    } else if (loc === 'OFFICE') {
        variantClass = 'wms-loc-badge--office';
        iconHtml = '<i class="fa-solid fa-building"></i>';
    } else if (loc === 'PENDING') {
        variantClass = 'wms-loc-badge--pending';
        iconHtml = '<i class="fa-solid fa-clock"></i>';
    }

    return `<span class="wms-loc-badge ${variantClass} mono" ${onClickAttr} title="พิกัดจัดเก็บ: ${escapeHTML(loc)}">${iconHtml} ${escapeHTML(loc)}</span>`;
}

// =========================================================================
// --- REALTIME STATUS BAR, DOCUMENT FILTER & FLOATING BULK TOOLBAR ---
// =========================================================================
function ensureStockBulkActionToolbar() {
    if (typeof document === 'undefined') return;
    ensureWmsInvDbStyles();

    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    const tableEl = tbody.closest('table');
    const tableWrapper = tableEl ? (tableEl.closest('.table-responsive, .table-wrapper, .wms-table-container') || tableEl.parentElement) : null;
    if (!tableWrapper || !tableWrapper.parentElement) return;

    // 1. แถบสถานะซิงก์เรียลไทม์ + ตัวกรองด่วน (Inject เหนือตารางหากยังไม่มี)
    let liveBar = document.getElementById('wmsStockRealtimeHeaderBar');
    if (!liveBar) {
        liveBar = document.createElement('div');
        liveBar.id = 'wmsStockRealtimeHeaderBar';
        liveBar.className = 'wms-stock-realtime-bar';
        liveBar.innerHTML = `
            <div class="wms-stock-realtime-bar__left">
                <span id="wmsStockLiveSyncBadge" class="wms-live-pill ${wmsRealtimeConnected ? 'is-online' : ''}">
                    <span class="wms-live-dot"></span>
                    <span id="wmsStockLiveSyncText">${wmsRealtimeConnected ? 'ซิงก์เรียลไทม์กับงานรับเข้าแล้ว' : 'พร้อมซิงก์เรียลไทม์ (Inbound ↔ Stock)'}</span>
                </span>
                <span id="wmsStockFilteredSummaryBadge" class="wms-stock-count-pill">แสดง 0 รายการ</span>
            </div>
            <div class="wms-stock-realtime-bar__right">
                <div class="wms-stock-view-switch" role="group" aria-label="รูปแบบการแสดงผลตาราง">
                    <button type="button" id="btnViewModeGrouped" class="wms-view-btn ${inventoryViewMode === 'grouped' ? 'is-active' : ''}" onclick="setInventoryViewMode('grouped')">
                        <i class="fa-solid fa-layer-group"></i> จัดกลุ่มตามรุ่น
                    </button>
                    <button type="button" id="btnViewModeIndividual" class="wms-view-btn ${inventoryViewMode === 'individual' ? 'is-active' : ''}" onclick="setInventoryViewMode('individual')">
                        <i class="fa-solid fa-barcode"></i> รายซีเรียล (S/N)
                    </button>
                </div>
                <select id="wmsQuickDocFilterSelect" class="wms-stock-mini-select" onchange="handleQuickDocFilterChange(this.value)" title="กรองตามเอกสาร INV / PO">
                    <option value="ALL">เอกสาร: ทั้งหมด (INV & PO)</option>
                    <option value="HAS_ANY_DOC">มีเลข INV หรือ PO</option>
                    <option value="HAS_INV">มีเลขใบกำกับภาษี (INV)</option>
                    <option value="HAS_PO">มีเลขใบสั่งซื้อ (PO)</option>
                    <option value="NO_DOC">ยังไม่ผูก INV / PO</option>
                </select>
                <button type="button" class="wms-stock-sync-now-btn" onclick="loadDataFromDatabase({ silent: false })" title="ดึงข้อมูลล่าสุดจากฐานข้อมูลทันที">
                    <i class="fa-solid fa-rotate"></i> ซิงก์ล่าสุด
                </button>
            </div>
        `;
        tableWrapper.parentElement.insertBefore(liveBar, tableWrapper);
    } else {
        const liveBadge = document.getElementById('wmsStockLiveSyncBadge');
        if (liveBadge && wmsRealtimeConnected) {
            liveBadge.classList.add('is-online');
        }
        const btnGrouped = document.getElementById('btnViewModeGrouped');
        const btnIndiv = document.getElementById('btnViewModeIndividual');
        if (btnGrouped) btnGrouped.classList.toggle('is-active', inventoryViewMode === 'grouped');
        if (btnIndiv) btnIndiv.classList.toggle('is-active', inventoryViewMode === 'individual');
    }

    // 2. แถบจัดการรายการที่เลือกหลายรายการ (Floating Bulk Action Bar)
    let bulkBar = document.getElementById('wmsStockBulkActionBar');
    if (!bulkBar) {
        bulkBar = document.createElement('div');
        bulkBar.id = 'wmsStockBulkActionBar';
        bulkBar.className = 'wms-stock-bulk-bar';
        bulkBar.style.display = 'none';
        document.body.appendChild(bulkBar);
    }

    const selectedCount = selectedItemSnSet.size;
    if (selectedCount > 0) {
        const selectedItems = globalInventoryData.filter(it => selectedItemSnSet.has(it.sn));
        const docSummary = extractGroupInvPoSummary(selectedItems);
        const docInfoText = docSummary.hasAnyDoc
            ? ` · ${docSummary.invCount} INV / ${docSummary.poCount} PO`
            : '';

        bulkBar.style.display = 'flex';
        bulkBar.innerHTML = `
            <div class="wms-stock-bulk-bar__info">
                <span class="wms-bulk-count-badge mono">${selectedCount.toLocaleString()}</span>
                <span>รายการที่เลือก${escapeHTML(docInfoText)}</span>
            </div>
            <div class="wms-stock-bulk-bar__actions">
                <button type="button" class="wms-bulk-btn wms-bulk-btn--relocate" onclick="openQuickRelocateModal('BATCH')">
                    <i class="fa-solid fa-dolly"></i> ย้ายพิกัดที่เลือก
                </button>
                <button type="button" class="wms-bulk-btn wms-bulk-btn--export" onclick="exportInventoryToCSV(true)">
                    <i class="fa-solid fa-file-csv"></i> ส่งออก CSV
                </button>
                <button type="button" class="wms-bulk-btn wms-bulk-btn--delete" onclick="triggerDeleteItemAction('BATCH')">
                    <i class="fa-solid fa-trash-can"></i> ลบที่เลือก
                </button>
                <button type="button" class="wms-bulk-btn wms-bulk-btn--clear" onclick="clearAllInventorySelections()">
                    <i class="fa-solid fa-xmark"></i> ยกเลิก
                </button>
            </div>
        `;
    } else {
        bulkBar.style.display = 'none';
    }
}

function handleQuickDocFilterChange(val) {
    wmsCurrentDocFilter = val || 'ALL';
    filterInventoryData(true);
}

function setInventoryViewMode(mode) {
    if (mode !== 'grouped' && mode !== 'individual') return;
    inventoryViewMode = mode;
    wmsMainTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;

    const btnGrouped = document.getElementById('btnViewModeGrouped');
    const btnIndiv = document.getElementById('btnViewModeIndividual');
    if (btnGrouped) btnGrouped.classList.toggle('is-active', mode === 'grouped');
    if (btnIndiv) btnIndiv.classList.toggle('is-active', mode === 'individual');

    // อัปเดตปุ่มเดิมใน HTML หากมี
    const legacyGroupedBtn = document.getElementById('viewModeGroupedBtn') || document.querySelector('[data-view-mode="grouped"]');
    const legacyIndivBtn = document.getElementById('viewModeIndividualBtn') || document.querySelector('[data-view-mode="individual"]');
    if (legacyGroupedBtn) legacyGroupedBtn.classList.toggle('active', mode === 'grouped');
    if (legacyIndivBtn) legacyIndivBtn.classList.toggle('active', mode === 'individual');

    renderInventoryTable();
}

function toggleInventoryViewMode(mode) {
    if (mode) {
        setInventoryViewMode(mode);
    } else {
        setInventoryViewMode(inventoryViewMode === 'grouped' ? 'individual' : 'grouped');
    }
}

// =========================================================================
// --- HIGH-SPEED FILTERING, GROUPING & SORTING ENGINE (10,000+ ITEMS) ---
// =========================================================================
function filterInventoryData(skipDebounce = false) {
    if (!skipDebounce) {
        if (wmsFilterDebounceTimer) clearTimeout(wmsFilterDebounceTimer);
        wmsFilterDebounceTimer = setTimeout(() => {
            wmsFilterDebounceTimer = null;
            executeInventoryFilterAndRender();
        }, 90);
        return;
    }
    executeInventoryFilterAndRender();
}

function executeInventoryFilterAndRender() {
    ensureStockBulkActionToolbar();

    const searchInput = document.getElementById('inventorySearchInput') ||
        document.getElementById('stockSearchInput') ||
        document.getElementById('searchInventoryInput');
    const rawQuery = searchInput ? String(searchInput.value || '').trim().toLowerCase() : '';
    const searchTokens = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];

    const locSelect = document.getElementById('inventoryLocationFilter') ||
        document.getElementById('filterLocationSelect') ||
        document.getElementById('stockLocationFilter');
    const selectedLoc = locSelect ? String(locSelect.value || 'ALL').toUpperCase().trim() : wmsCurrentLocationFilter;

    const docSelect = document.getElementById('inventoryDocFilter') || document.getElementById('wmsQuickDocFilterSelect');
    const selectedDoc = docSelect ? String(docSelect.value || 'ALL').toUpperCase().trim() : wmsCurrentDocFilter;

    const sortSelect = document.getElementById('inventorySortSelect') || document.getElementById('stockSortSelect');
    const selectedSort = sortSelect ? String(sortSelect.value || 'LATEST').toUpperCase().trim() : wmsCurrentSortBy;

    const filtered = [];
    for (let i = 0; i < globalInventoryData.length; i++) {
        const item = globalInventoryData[i];
        if (!item || isSnInTombstone(item.sn)) continue;

        // 1. กรองพิกัดจัดเก็บ
        if (selectedLoc && selectedLoc !== 'ALL') {
            const itemLoc = String(item.location || 'DOCK').toUpperCase();
            if (selectedLoc === 'RACK') {
                if (itemLoc === 'DOCK' || itemLoc === 'OFFICE' || itemLoc === 'PENDING') continue;
            } else if (selectedLoc === 'DOCK' || selectedLoc === 'OFFICE' || selectedLoc === 'PENDING') {
                if (itemLoc !== selectedLoc) continue;
            } else {
                if (!itemLoc.startsWith(selectedLoc)) continue;
            }
        }

        // 2. กรองตามสถานะเอกสาร INV / PO
        if (selectedDoc && selectedDoc !== 'ALL') {
            const hasInv = Boolean(item.inv_no);
            const hasPo = Boolean(item.po_no);
            if (selectedDoc === 'HAS_ANY_DOC' && !hasInv && !hasPo) continue;
            if (selectedDoc === 'HAS_INV' && !hasInv) continue;
            if (selectedDoc === 'HAS_PO' && !hasPo) continue;
            if (selectedDoc === 'NO_DOC' && (hasInv || hasPo)) continue;
        }

        // 3. กรองคำค้นหา (รองรับค้นหาพร้อมกันหลายคำ ทั้ง SKU, ชื่อรุ่น, S/N, พิกัด, INV, PO, ผู้รับเข้า)
        if (searchTokens.length > 0) {
            const idxStr = item._searchIndex || '';
            let allMatched = true;
            for (let t = 0; t < searchTokens.length; t++) {
                if (!idxStr.includes(searchTokens[t])) {
                    allMatched = false;
                    break;
                }
            }
            if (!allMatched) continue;
        }

        filtered.push(item);
    }

    // จัดเรียงรายการ
    if (selectedSort === 'SKU_ASC') {
        filtered.sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')));
    } else if (selectedSort === 'SN_ASC') {
        filtered.sort((a, b) => String(a.sn || '').localeCompare(String(b.sn || '')));
    } else if (selectedSort === 'LOC_ASC') {
        filtered.sort((a, b) => String(a.location || '').localeCompare(String(b.location || '')));
    } else if (selectedSort === 'OLDEST') {
        filtered.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    }
    // ค่าเริ่มต้น LATEST คงลำดับล่าสุดบนสุดไว้แล้ว

    currentFilteredItems = filtered;
    currentInventoryGroups = buildInventoryGroupsFromItems(filtered);

    if (selectedSort === 'QTY_DESC') {
        currentInventoryGroups.sort((a, b) => b.totalCount - a.totalCount);
    } else if (selectedSort === 'QTY_ASC') {
        currentInventoryGroups.sort((a, b) => a.totalCount - b.totalCount);
    }

    wmsMainTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    updateFilteredSummaryHeader();
    renderInventoryTable();

    // อัปเดตหน้าต่าง Modal ซีเรียลรายรุ่นหากกำลังเปิดอยู่
    if (currentDetailModalGroupKey && typeof renderModelSerialModalBody === 'function') {
        const modalEl = document.getElementById('modelSerialDetailModal');
        if (modalEl && (modalEl.style.display === 'flex' || modalEl.style.display === 'block' || modalEl.classList.contains('active'))) {
            renderModelSerialModalBody(currentDetailModalGroupKey);
        }
    }
}

function buildInventoryGroupsFromItems(items) {
    const groupMap = new Map();

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const sku = String(it.category || 'UNSPECIFIED').trim();
        const name = String(it.name || 'ไม่ระบุชื่อรุ่นสินค้า').trim();
        const groupKey = `${sku}::${name}`;

        let group = groupMap.get(groupKey);
        if (!group) {
            group = {
                groupKey,
                sku,
                name,
                items: [],
                totalCount: 0,
                dockCount: 0,
                rackCount: 0,
                officeCount: 0,
                pendingSyncCount: 0,
                invSet: new Set(),
                poSet: new Set(),
                locSet: new Set(),
                latestReceiver: it.received_by || 'ไม่ระบุ',
                latestCreatedAt: it.created_at || ''
            };
            groupMap.set(groupKey, group);
        }

        group.items.push(it);
        group.totalCount++;

        const locUpper = String(it.location || 'DOCK').toUpperCase().trim();
        group.locSet.add(locUpper);
        if (locUpper === 'DOCK') {
            group.dockCount++;
        } else if (locUpper === 'OFFICE') {
            group.officeCount++;
        } else {
            group.rackCount++;
        }

        if (it._pending) group.pendingSyncCount++;
        if (it.inv_no) group.invSet.add(it.inv_no);
        if (it.po_no) group.poSet.add(it.po_no);

        if (it.created_at && (!group.latestCreatedAt || it.created_at > group.latestCreatedAt)) {
            group.latestCreatedAt = it.created_at;
            if (it.received_by) group.latestReceiver = it.received_by;
        }
    }

    const result = [];
    groupMap.forEach(g => {
        g.invList = Array.from(g.invSet);
        g.poList = Array.from(g.poSet);
        g.locList = Array.from(g.locSet);
        result.push(g);
    });
    return result;
}

function updateFilteredSummaryHeader() {
    const summaryPill = document.getElementById('wmsStockFilteredSummaryBadge');
    if (!summaryPill) return;

    const totalFiltered = currentFilteredItems.length;
    const totalGroups = currentInventoryGroups.length;
    const docStats = getInventoryDocumentStats(currentFilteredItems);

    summaryPill.innerHTML =
        `พบ <strong class="mono">${totalFiltered.toLocaleString()}</strong> เครื่อง ` +
        `(<strong class="mono">${totalGroups.toLocaleString()}</strong> รุ่น · ` +
        `<span class="wms-text-inv mono">${docStats.invCount.toLocaleString()} INV</span> / ` +
        `<span class="wms-text-po mono">${docStats.poCount.toLocaleString()} PO</span>)`;
}

// =========================================================================
// --- MAIN TABLE RENDERER (GROUPED MODE & INDIVIDUAL SERIAL MODE) ---
// =========================================================================
function renderInventoryTable() {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;

    const tableEl = tbody.closest('table');
    const thead = tableEl ? tableEl.querySelector('thead') : null;

    if (inventoryViewMode === 'grouped') {
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="width:42px; text-align:center;">
                        <input type="checkbox" id="selectAllInventoryCheckbox" onchange="toggleSelectAllVisibleItems(this.checked)" title="เลือกทั้งหมดที่แสดง">
                    </th>
                    <th style="width:54px; text-align:center;">#</th>
                    <th style="width:140px;">รหัสสินค้า (SKU)</th>
                    <th>ชื่อรุ่น / รายการสินค้า</th>
                    <th style="min-width:190px;">เลขที่ใบกำกับภาษี (INV) / PO</th>
                    <th style="min-width:165px;">สรุปพิกัดจัดเก็บ</th>
                    <th style="width:120px; text-align:right;">จำนวนคงเหลือ</th>
                    <th style="width:155px;">รับเข้าล่าสุด</th>
                    <th style="width:170px; text-align:center;">จัดการ</th>
                </tr>
            `;
        }
        renderGroupedInventoryRows(tbody);
    } else {
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="width:42px; text-align:center;">
                        <input type="checkbox" id="selectAllInventoryCheckbox" onchange="toggleSelectAllVisibleItems(this.checked)" title="เลือกทั้งหมดที่แสดง">
                    </th>
                    <th style="width:54px; text-align:center;">#</th>
                    <th style="width:135px;">รหัสสินค้า (SKU)</th>
                    <th>ชื่อรุ่นสินค้า</th>
                    <th style="min-width:165px;">Serial Number (S/N)</th>
                    <th style="min-width:145px;">เลขที่ใบกำกับภาษี (INV)</th>
                    <th style="min-width:140px;">เลขที่ใบสั่งซื้อ (PO)</th>
                    <th style="width:90px; text-align:right;">มิเตอร์</th>
                    <th style="width:125px;">พิกัดจัดเก็บ</th>
                    <th style="width:155px;">ผู้รับเข้า / เวลา</th>
                    <th style="width:135px; text-align:center;">จัดการ</th>
                </tr>
            `;
        }
        renderIndividualInventoryRows(tbody);
    }

    syncSelectAllCheckboxState();
    ensureStockBulkActionToolbar();
}

function renderGroupedInventoryRows(tbody) {
    const totalGroups = currentInventoryGroups.length;
    if (totalGroups === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="wms-table-empty-cell">
                    <div class="wms-empty-state">
                        <i class="fa-solid fa-box-open"></i>
                        <div class="wms-empty-state__title">ไม่พบข้อมูลสต็อกสินค้าตามเงื่อนไขที่ค้นหา</div>
                        <div class="wms-empty-state__sub">ลองเปลี่ยนคำค้นหา (SKU, ชื่อรุ่น, S/N, เลข INV หรือ PO) หรือกดปุ่มซิงก์ล่าสุด</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const renderCount = Math.min(totalGroups, wmsMainTableRenderLimit);
    const rowsHtml = [];

    for (let i = 0; i < renderCount; i++) {
        const g = currentInventoryGroups[i];
        const jsGroupKey = g.groupKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const isGroupAllSelected = g.items.length > 0 && g.items.every(it => selectedItemSnSet.has(it.sn));

        const locSummaryParts = [];
        if (g.rackCount > 0) {
            locSummaryParts.push(`<span class="wms-mini-stat-pill is-rack" title="จัดเก็บบนชั้นวางแล้ว">ชั้นวาง: <strong class="mono">${g.rackCount}</strong></span>`);
        }
        if (g.dockCount > 0) {
            locSummaryParts.push(`<span class="wms-mini-stat-pill is-dock" title="รอจัดเก็บที่ลาน DOCK">DOCK: <strong class="mono">${g.dockCount}</strong></span>`);
        }
        if (g.officeCount > 0) {
            locSummaryParts.push(`<span class="wms-mini-stat-pill is-office" title="อยู่ที่ออฟฟิศ">OFFICE: <strong class="mono">${g.officeCount}</strong></span>`);
        }

        const pendingTag = g.pendingSyncCount > 0
            ? `<span class="wms-sync-pending-tag" title="กำลังซิงก์เข้าฐานข้อมูล"><i class="fa-solid fa-cloud-arrow-up"></i> รอซิงก์ ${g.pendingSyncCount}</span>`
            : '';

        rowsHtml.push(`
            <tr class="wms-stock-row ${isGroupAllSelected ? 'is-selected' : ''}" onclick="openModelSerialModal('${jsGroupKey}')">
                <td style="text-align:center;" onclick="event.stopPropagation();">
                    <input type="checkbox" ${isGroupAllSelected ? 'checked' : ''} onchange="toggleSelectGroupItems('${jsGroupKey}', this.checked)">
                </td>
                <td style="text-align:center;" class="mono wms-text-muted">${(i + 1).toLocaleString()}</td>
                <td>
                    <span class="wms-sku-badge mono">${escapeHTML(g.sku)}</span>
                </td>
                <td>
                    <div class="wms-model-title">${escapeHTML(g.name)} ${pendingTag}</div>
                    <div class="wms-model-sub">คลิกเพื่อดูรายละเอียด S/N ทั้งหมด (${g.totalCount.toLocaleString()} เครื่อง)</div>
                </td>
                <td>
                    ${renderGroupInvPoSummaryHTML(g)}
                </td>
                <td>
                    <div class="wms-loc-summary-wrap">${locSummaryParts.join(' ')}</div>
                </td>
                <td style="text-align:right;">
                    <span class="wms-qty-badge mono">${g.totalCount.toLocaleString()}</span>
                    <span class="wms-qty-unit">เครื่อง</span>
                </td>
                <td>
                    <div class="wms-receiver-name">${escapeHTML(g.latestReceiver || '-')}</div>
                    <div class="wms-receiver-time mono">${escapeHTML(formatThaiCompactDateTime(g.latestCreatedAt))}</div>
                </td>
                <td style="text-align:center;" onclick="event.stopPropagation();">
                    <div class="wms-row-actions">
                        <button type="button" class="wms-icon-btn wms-icon-btn--view" onclick="openModelSerialModal('${jsGroupKey}')" title="เปิดดูรายการ S/N และเลข INV/PO">
                            <i class="fa-solid fa-list-check"></i>
                        </button>
                        <button type="button" class="wms-icon-btn wms-icon-btn--relocate" onclick="openQuickRelocateModal('GROUP', '${jsGroupKey}')" title="ย้ายพิกัดทั้งรุ่นนี้">
                            <i class="fa-solid fa-dolly"></i>
                        </button>
                        <button type="button" class="wms-icon-btn wms-icon-btn--delete" onclick="triggerDeleteItemAction('GROUP', '${jsGroupKey}')" title="ลบสต็อกรุ่นนี้">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `);
    }

    if (totalGroups > renderCount) {
        const remaining = totalGroups - renderCount;
        rowsHtml.push(`
            <tr class="wms-load-more-row">
                <td colspan="9" style="text-align:center; padding:14px;">
                    <button type="button" class="wms-load-more-btn" onclick="loadMoreMainInventoryRows()">
                        <i class="fa-solid fa-angles-down"></i> แสดงเพิ่มอีก ${Math.min(WMS_TABLE_RENDER_BATCH_SIZE, remaining).toLocaleString()} รุ่น (เหลืออีก ${remaining.toLocaleString()} รุ่น)
                    </button>
                </td>
            </tr>
        `);
    }

    tbody.innerHTML = rowsHtml.join('');
}

function renderIndividualInventoryRows(tbody) {
    const totalItems = currentFilteredItems.length;
    if (totalItems === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="wms-table-empty-cell">
                    <div class="wms-empty-state">
                        <i class="fa-solid fa-barcode"></i>
                        <div class="wms-empty-state__title">ไม่พบรายการซีเรียล (S/N) ตามเงื่อนไขที่ค้นหา</div>
                        <div class="wms-empty-state__sub">ลองตรวจสอบตัวกรองเอกสาร INV/PO พิกัดจัดเก็บ หรือคำค้นหาอีกครั้ง</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const renderCount = Math.min(totalItems, wmsMainTableRenderLimit);
    const rowsHtml = [];

    for (let i = 0; i < renderCount; i++) {
        const it = currentFilteredItems[i];
        const snStr = String(it.sn || '');
        const jsSafeSn = snStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const isSelected = selectedItemSnSet.has(snStr);

        const invHtml = it.inv_no
            ? renderInvPoBadgesHTML(it.inv_no, '', true)
            : `<span class="wms-doc-empty-badge">-</span>`;
        const poHtml = it.po_no
            ? renderInvPoBadgesHTML('', it.po_no, true)
            : `<span class="wms-doc-empty-badge">-</span>`;

        const pendingBadge = it._pending
            ? `<span class="wms-sync-pending-tag" title="กำลังบันทึกเข้าฐานข้อมูล"><i class="fa-solid fa-cloud-arrow-up"></i> รอซิงก์</span>`
            : '';

        const meterVal = Number(it.meter || 0);

        rowsHtml.push(`
            <tr class="wms-stock-row ${isSelected ? 'is-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelectSingleItem('${jsSafeSn}', this.checked)">
                </td>
                <td style="text-align:center;" class="mono wms-text-muted">${(i + 1).toLocaleString()}</td>
                <td>
                    <span class="wms-sku-badge mono">${escapeHTML(it.category || '-')}</span>
                </td>
                <td>
                    <div class="wms-model-title">${escapeHTML(it.name || '-')}</div>
                </td>
                <td>
                    <div class="wms-sn-cell">
                        <button type="button" class="wms-sn-copy-btn mono" onclick="copyTextToClipboard('${jsSafeSn}', 'Serial Number')" title="คลิกเพื่อคัดลอก S/N: ${escapeHTML(snStr)}">
                            ${escapeHTML(snStr)}
                        </button>
                        ${pendingBadge}
                    </div>
                </td>
                <td>${invHtml}</td>
                <td>${poHtml}</td>
                <td style="text-align:right;" class="mono">${meterVal > 0 ? meterVal.toLocaleString() : '-'}</td>
                <td>
                    ${renderLocationBadgeHTML(it.location, `onclick="openQuickRelocateModal('SINGLE', '${jsSafeSn}')" style="cursor:pointer;"`)}
                </td>
                <td>
                    <div class="wms-receiver-name">${escapeHTML(it.received_by || '-')}</div>
                    <div class="wms-receiver-time mono">${escapeHTML(formatThaiCompactDateTime(it.created_at))}</div>
                </td>
                <td style="text-align:center;">
                    <div class="wms-row-actions">
                        <button type="button" class="wms-icon-btn wms-icon-btn--relocate" onclick="openQuickRelocateModal('SINGLE', '${jsSafeSn}')" title="ย้ายพิกัดจัดเก็บ">
                            <i class="fa-solid fa-dolly"></i>
                        </button>
                        <button type="button" class="wms-icon-btn wms-icon-btn--delete" onclick="triggerDeleteItemAction('SINGLE', '${jsSafeSn}', '${escapeHTML(it.id || '')}')" title="ลบซีเรียลนี้ออกจากสต็อก">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `);
    }

    if (totalItems > renderCount) {
        const remaining = totalItems - renderCount;
        rowsHtml.push(`
            <tr class="wms-load-more-row">
                <td colspan="11" style="text-align:center; padding:14px;">
                    <button type="button" class="wms-load-more-btn" onclick="loadMoreMainInventoryRows()">
                        <i class="fa-solid fa-angles-down"></i> แสดงเพิ่มอีก ${Math.min(WMS_TABLE_RENDER_BATCH_SIZE, remaining).toLocaleString()} รายการ (เหลืออีก ${remaining.toLocaleString()} รายการ)
                    </button>
                </td>
            </tr>
        `);
    }

    tbody.innerHTML = rowsHtml.join('');
}

function loadMoreMainInventoryRows() {
    wmsMainTableRenderLimit += WMS_TABLE_RENDER_BATCH_SIZE;
    renderInventoryTable();
}

// =========================================================================
// --- ROW SELECTION MANAGEMENT ---
// =========================================================================
function toggleSelectSingleItem(sn, isChecked) {
    if (!sn) return;
    if (isChecked) {
        selectedItemSnSet.add(sn);
    } else {
        selectedItemSnSet.delete(sn);
    }
    renderInventoryTable();
}

function toggleSelectGroupItems(groupKey, isChecked) {
    const group = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!group) return;
    group.items.forEach(it => {
        if (isChecked) {
            selectedItemSnSet.add(it.sn);
        } else {
            selectedItemSnSet.delete(it.sn);
        }
    });
    renderInventoryTable();
}

function toggleSelectAllVisibleItems(isChecked) {
    if (isChecked) {
        currentFilteredItems.forEach(it => {
            if (it && it.sn) selectedItemSnSet.add(it.sn);
        });
    } else {
        currentFilteredItems.forEach(it => {
            if (it && it.sn) selectedItemSnSet.delete(it.sn);
        });
    }
    renderInventoryTable();
}

function clearAllInventorySelections() {
    selectedItemSnSet.clear();
    renderInventoryTable();
}

function syncSelectAllCheckboxState() {
    const selectAllCb = document.getElementById('selectAllInventoryCheckbox');
    if (!selectAllCb) return;
    if (currentFilteredItems.length === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
        return;
    }
    let selectedVisible = 0;
    for (let i = 0; i < currentFilteredItems.length; i++) {
        if (selectedItemSnSet.has(currentFilteredItems[i].sn)) selectedVisible++;
    }
    selectAllCb.checked = (selectedVisible === currentFilteredItems.length);
    selectAllCb.indeterminate = (selectedVisible > 0 && selectedVisible < currentFilteredItems.length);
}

// =========================================================================
// --- UNIFIED DELETE CONFIRMATION POPUP & DATABASE EXECUTION ---
// =========================================================================
function triggerDeleteItemAction(mode, targetKey = '', itemId = '') {
    let targetItems = [];
    let titleText = '';

    if (mode === 'SINGLE') {
        const found = globalInventoryData.find(it => normalizeSnKey(it.sn) === normalizeSnKey(targetKey));
        if (found) {
            targetItems = [found];
        } else if (targetKey) {
            targetItems = [normalizeInventoryItemFields({ id: itemId || null, sn: targetKey, category: '-', name: '-', location: 'DOCK' })];
        }
        titleText = `ยืนยันการลบซีเรียลสินค้า: ${targetKey}`;
    } else if (mode === 'GROUP') {
        const group = currentInventoryGroups.find(g => g.groupKey === targetKey);
        if (group) {
            targetItems = [...group.items];
            titleText = `ยืนยันการลบสต็อกทั้งรุ่น: ${group.name} (${targetItems.length.toLocaleString()} เครื่อง)`;
        }
    } else if (mode === 'BATCH') {
        targetItems = globalInventoryData.filter(it => selectedItemSnSet.has(it.sn));
        titleText = `ยืนยันการลบรายการสต็อกที่เลือก (${targetItems.length.toLocaleString()} เครื่อง)`;
    }

    if (targetItems.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบรายการที่ต้องการลบ');
        return;
    }

    openUnifiedBulkDeleteModal({
        mode: mode,
        sn: targetItems[0].sn,
        id: targetItems[0].id,
        title: titleText,
        items: targetItems
    });
}

function openUnifiedBulkDeleteModal(payload) {
    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return;
    ensureWmsInvDbStyles();
    wmsActiveDeleteModalPayload = payload;

    let modal = document.getElementById('wmsUnifiedStockDeleteModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsUnifiedStockDeleteModal';
        modal.className = 'wms-modal-backdrop';
        document.body.appendChild(modal);
    }

    const items = payload.items;
    const docSummary = extractGroupInvPoSummary(items);
    const previewLimit = 80;
    const previewRows = items.slice(0, previewLimit).map((it, idx) => `
        <tr>
            <td class="mono" style="text-align:center;">${idx + 1}</td>
            <td class="mono"><strong>${escapeHTML(it.sn)}</strong></td>
            <td class="mono">${escapeHTML(it.category || '-')}</td>
            <td>${escapeHTML(it.name || '-')}</td>
            <td>${renderInvPoBadgesHTML(it.inv_no, it.po_no, true)}</td>
            <td>${renderLocationBadgeHTML(it.location)}</td>
        </tr>
    `).join('');

    const extraNote = items.length > previewLimit
        ? `<div class="wms-delete-more-note">... และอีก ${(items.length - previewLimit).toLocaleString()} รายการ</div>`
        : '';

    modal.innerHTML = `
        <div class="wms-modal-card wms-modal-card--danger" role="dialog" aria-modal="true" aria-labelledby="wmsDeleteModalTitle">
            <div class="wms-modal-header wms-modal-header--danger">
                <div class="wms-modal-title-wrap">
                    <div class="wms-modal-danger-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <div>
                        <h3 id="wmsDeleteModalTitle" class="wms-modal-title">${escapeHTML(payload.title || 'ยืนยันการลบข้อมูลสต็อกสินค้า')}</h3>
                        <p class="wms-modal-subtitle">การดำเนินการนี้จะลบรายการออกจากคลังสินค้าและซิงก์ไปยังหน้างานรับเข้าทันที</p>
                    </div>
                </div>
                <button type="button" class="wms-modal-close-btn" onclick="closeUnifiedBulkDeleteModal()" aria-label="ปิด">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div class="wms-modal-body">
                <div class="wms-delete-summary-strip">
                    <span>จำนวนที่จะลบ: <strong class="mono">${items.length.toLocaleString()}</strong> เครื่อง</span>
                    <span>เอกสารที่เกี่ยวข้อง: <strong class="mono">${docSummary.invCount} INV</strong> / <strong class="mono">${docSummary.poCount} PO</strong></span>
                </div>

                <div class="wms-delete-preview-scroll">
                    <table class="wms-mini-preview-table">
                        <thead>
                            <tr>
                                <th style="width:44px; text-align:center;">#</th>
                                <th>Serial Number (S/N)</th>
                                <th>SKU</th>
                                <th>ชื่อรุ่นสินค้า</th>
                                <th>เลข INV / PO</th>
                                <th>พิกัด</th>
                            </tr>
                        </thead>
                        <tbody>${previewRows}</tbody>
                    </table>
                    ${extraNote}
                </div>

                <div class="wms-delete-reason-box">
                    <label for="wmsStockDeleteReasonInput">เหตุผลการลบรายการ (บันทึกในประวัติระบบ):</label>
                    <input type="text" id="wmsStockDeleteReasonInput" class="wms-modal-input" placeholder="ระบุเหตุผล เช่น สแกนซ้ำ / คีย์เอกสารผิด / ยกเลิกรับเข้า (ไม่บังคับ)">
                </div>
            </div>

            <div class="wms-modal-footer">
                <button type="button" class="wms-btn wms-btn--secondary" onclick="closeUnifiedBulkDeleteModal()">
                    ยกเลิก
                </button>
                <button type="button" id="btnConfirmStockDeleteExec" class="wms-btn wms-btn--danger" onclick="executeConfirmedStockDeletion()">
                    <i class="fa-solid fa-trash-can"></i> ยืนยันลบ ${items.length.toLocaleString()} รายการถาวร
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeUnifiedBulkDeleteModal() {
    const modal = document.getElementById('wmsUnifiedStockDeleteModal');
    if (modal) modal.style.display = 'none';
    wmsActiveDeleteModalPayload = null;
}

async function executeConfirmedStockDeletion() {
    if (!wmsActiveDeleteModalPayload || !Array.isArray(wmsActiveDeleteModalPayload.items)) return;

    const btnConfirm = document.getElementById('btnConfirmStockDeleteExec');
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังลบข้อมูล...`;
    }

    const itemsToDelete = [...wmsActiveDeleteModalPayload.items];
    const snList = itemsToDelete.map(it => it.sn).filter(Boolean);
    const reasonInput = document.getElementById('wmsStockDeleteReasonInput');
    const deleteReason = reasonInput ? String(reasonInput.value || '').trim() : '';

    wmsIsBulkDeleting = true;

    try {
        // 1. บันทึก Tombstone + อัปเดต UI และ Broadcast เรียลไทม์ทันที (0ms Zero-Bounce)
        applyRealtimeInventoryMutation('DELETE', snList, { fromBroadcast: false });

        // 2. ลบออกจากฐานข้อมูล Supabase เป็นชุด (Batch Chunk 200 รายการต่อรอบ)
        const client = getSupabaseClient();
        if (client && navigator.onLine && snList.length > 0) {
            const chunkSize = 200;
            for (let i = 0; i < snList.length; i += chunkSize) {
                const chunkSns = snList.slice(i, i + chunkSize);
                const { error } = await client
                    .from('warehouse_items')
                    .delete()
                    .in('sn', chunkSns);
                if (error) throw error;
            }

            // บันทึก Log กิจกรรมการลบลง user_activities
            try {
                await client.from('user_activities').insert([{
                    action_type: 'DELETE_STOCK',
                    actor_name: getCurrentReceiverName(),
                    details: `ลบสต็อกสินค้าจำนวน ${snList.length} รายการ (${snList.slice(0, 5).join(', ')}${snList.length > 5 ? '...' : ''})${deleteReason ? ' เหตุผล: ' + deleteReason : ''}`,
                    created_at: new Date().toISOString()
                }]);
            } catch (logErr) {}
        }

        closeUnifiedBulkDeleteModal();
        if (typeof showToast === 'function') {
            showToast(`🗑️ ลบสต็อกสินค้าเรียบร้อย ${snList.length.toLocaleString()} รายการ`);
        }
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`⚠️ เกิดข้อผิดพลาดในการลบจากฐานข้อมูล: ${err && err.message ? err.message : 'กรุณาลองใหม่'}`);
        }
    } finally {
        wmsIsBulkDeleting = false;
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = `<i class="fa-solid fa-trash-can"></i> ยืนยันลบถาวร`;
        }
    }
}

// =========================================================================
// --- QUICK RELOCATE MODAL (SINGLE / GROUP / BATCH) ---
// =========================================================================
function openQuickRelocateModal(mode, targetKey = '') {
    ensureWmsInvDbStyles();
    let targetItems = [];
    let titleLabel = '';

    if (mode === 'SINGLE') {
        const found = globalInventoryData.find(it => normalizeSnKey(it.sn) === normalizeSnKey(targetKey));
        if (found) targetItems = [found];
        titleLabel = `ย้ายพิกัดจัดเก็บ S/N: ${targetKey}`;
    } else if (mode === 'GROUP') {
        const group = currentInventoryGroups.find(g => g.groupKey === targetKey);
        if (group) {
            targetItems = [...group.items];
            titleLabel = `ย้ายพิกัดทั้งรุ่น: ${group.name} (${targetItems.length.toLocaleString()} เครื่อง)`;
        }
    } else if (mode === 'BATCH') {
        targetItems = globalInventoryData.filter(it => selectedItemSnSet.has(it.sn));
        titleLabel = `ย้ายพิกัดรายการที่เลือก (${targetItems.length.toLocaleString()} เครื่อง)`;
    }

    if (targetItems.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบรายการที่ต้องการย้ายพิกัด');
        return;
    }

    wmsActiveRelocatePayload = { mode, items: targetItems };

    let modal = document.getElementById('wmsQuickRelocateModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsQuickRelocateModal';
        modal.className = 'wms-modal-backdrop';
        document.body.appendChild(modal);
    }

    const currentLoc = targetItems[0].location || 'DOCK';

    modal.innerHTML = `
        <div class="wms-modal-card" role="dialog" aria-modal="true" aria-labelledby="wmsRelocateModalTitle">
            <div class="wms-modal-header">
                <div class="wms-modal-title-wrap">
                    <div class="wms-modal-info-icon"><i class="fa-solid fa-dolly"></i></div>
                    <div>
                        <h3 id="wmsRelocateModalTitle" class="wms-modal-title">${escapeHTML(titleLabel)}</h3>
                        <p class="wms-modal-subtitle">พิกัดปัจจุบัน: <strong class="mono">${escapeHTML(currentLoc)}</strong> · จำนวน <strong class="mono">${targetItems.length.toLocaleString()}</strong> เครื่อง</p>
                    </div>
                </div>
                <button type="button" class="wms-modal-close-btn" onclick="closeQuickRelocateModal()" aria-label="ปิด">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="wms-modal-body">
                <label for="wmsNewLocationInput" style="display:block; font-weight:700; margin-bottom:6px;">ระบุพิกัดจัดเก็บปลายทางใหม่:</label>
                <input type="text" id="wmsNewLocationInput" class="wms-modal-input mono" style="text-transform:uppercase; font-size:1.05rem;" placeholder="เช่น A-01-1-01, DOCK, OFFICE" value="${escapeHTML(currentLoc === 'DOCK' ? '' : currentLoc)}">
                <div class="wms-quick-loc-chips">
                    <button type="button" class="wms-chip-btn" onclick="document.getElementById('wmsNewLocationInput').value='DOCK'">DOCK</button>
                    <button type="button" class="wms-chip-btn" onclick="document.getElementById('wmsNewLocationInput').value='OFFICE'">OFFICE</button>
                    <button type="button" class="wms-chip-btn" onclick="document.getElementById('wmsNewLocationInput').value='A-01-1-01'">A-01-1-01</button>
                    <button type="button" class="wms-chip-btn" onclick="document.getElementById('wmsNewLocationInput').value='B-01-1-01'">B-01-1-01</button>
                </div>
            </div>
            <div class="wms-modal-footer">
                <button type="button" class="wms-btn wms-btn--secondary" onclick="closeQuickRelocateModal()">ยกเลิก</button>
                <button type="button" id="btnConfirmRelocateExec" class="wms-btn wms-btn--primary" onclick="confirmQuickRelocate()">
                    <i class="fa-solid fa-check"></i> บันทึกพิกัดใหม่
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    setTimeout(() => {
        const inp = document.getElementById('wmsNewLocationInput');
        if (inp) inp.focus();
    }, 50);
}

function closeQuickRelocateModal() {
    const modal = document.getElementById('wmsQuickRelocateModal');
    if (modal) modal.style.display = 'none';
    wmsActiveRelocatePayload = null;
}

async function confirmQuickRelocate() {
    if (!wmsActiveRelocatePayload || !Array.isArray(wmsActiveRelocatePayload.items)) return;
    const inp = document.getElementById('wmsNewLocationInput');
    const newLoc = inp ? String(inp.value || '').trim().toUpperCase() : '';

    if (!newLoc) {
        if (typeof showToast === 'function') showToast('⚠️ กรุณาระบุพิกัดจัดเก็บปลายทาง');
        if (inp) inp.focus();
        return;
    }

    const btn = document.getElementById('btnConfirmRelocateExec');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...`;
    }

    const items = wmsActiveRelocatePayload.items;
    const snList = items.map(it => it.sn).filter(Boolean);
    const updatedPatches = snList.map(sn => ({ sn, location: newLoc }));

    try {
        applyRealtimeInventoryMutation('RELOCATE', updatedPatches, { fromBroadcast: false });

        const client = getSupabaseClient();
        if (client && navigator.onLine && snList.length > 0) {
            const chunkSize = 200;
            for (let i = 0; i < snList.length; i += chunkSize) {
                const chunkSns = snList.slice(i, i + chunkSize);
                const { error } = await client
                    .from('warehouse_items')
                    .update({ location: newLoc })
                    .in('sn', chunkSns);
                if (error) throw error;
            }
        }

        closeQuickRelocateModal();
        if (typeof showToast === 'function') {
            showToast(`📍 ย้ายพิกัด ${snList.length.toLocaleString()} รายการ ไปยัง ${newLoc} เรียบร้อยแล้ว`);
        }
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`⚠️ ย้ายพิกัดไม่สำเร็จ: ${err && err.message ? err.message : 'กรุณาลองใหม่'}`);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-check"></i> บันทึกพิกัดใหม่`;
        }
    }
}

// =========================================================================
// --- CSV EXPORT WITH FULL INV / PO COLUMNS ---
// =========================================================================
function exportInventoryToCSV(onlySelected = false) {
    let sourceItems = currentFilteredItems;
    if (onlySelected && selectedItemSnSet.size > 0) {
        sourceItems = globalInventoryData.filter(it => selectedItemSnSet.has(it.sn));
    }

    if (!sourceItems || sourceItems.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่มีข้อมูลสต็อกสำหรับส่งออก CSV');
        return;
    }

    const headers = [
        'ลำดับ',
        'รหัสสินค้า (SKU)',
        'ชื่อรุ่นสินค้า',
        'Serial Number (S/N)',
        'เลขที่ใบกำกับภาษี (INV)',
        'เลขที่ใบสั่งซื้อ (PO)',
        'เลขมิเตอร์',
        'พิกัดจัดเก็บ',
        'ผู้รับเข้า',
        'วันที่บันทึก'
    ];

    const escapeCsvCell = (val) => {
        const str = val === null || val === undefined ? '' : String(val);
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const csvLines = [headers.map(escapeCsvCell).join(',')];
    for (let i = 0; i < sourceItems.length; i++) {
        const it = sourceItems[i];
        csvLines.push([
            i + 1,
            it.category || '',
            it.name || '',
            it.sn || '',
            it.inv_no || '',
            it.po_no || '',
            it.meter || 0,
            it.location || '',
            it.received_by || '',
            it.created_at || ''
        ].map(escapeCsvCell).join(','));
    }

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `WMS_Stock_Check_${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') {
        showToast(`📥 ส่งออกรายงานสต็อก CSV (${sourceItems.length.toLocaleString()} รายการ) เรียบร้อยแล้ว`);
    }
}

// Global Exports
window.filterInventoryData = filterInventoryData;
window.renderInventoryTable = renderInventoryTable;
window.loadMoreMainInventoryRows = loadMoreMainInventoryRows;
window.setInventoryViewMode = setInventoryViewMode;
window.toggleInventoryViewMode = toggleInventoryViewMode;
window.handleQuickDocFilterChange = handleQuickDocFilterChange;
window.toggleSelectSingleItem = toggleSelectSingleItem;
window.toggleSelectGroupItems = toggleSelectGroupItems;
window.toggleSelectAllVisibleItems = toggleSelectAllVisibleItems;
window.clearAllInventorySelections = clearAllInventorySelections;
window.ensureStockBulkActionToolbar = ensureStockBulkActionToolbar;
window.triggerDeleteItemAction = triggerDeleteItemAction;
window.openUnifiedBulkDeleteModal = openUnifiedBulkDeleteModal;
window.closeUnifiedBulkDeleteModal = closeUnifiedBulkDeleteModal;
window.executeConfirmedStockDeletion = executeConfirmedStockDeletion;
window.openQuickRelocateModal = openQuickRelocateModal;
window.closeQuickRelocateModal = closeQuickRelocateModal;
window.confirmQuickRelocate = confirmQuickRelocate;
window.exportInventoryToCSV = exportInventoryToCSV;
window.renderInvPoBadgesHTML = renderInvPoBadgesHTML;
window.renderLocationBadgeHTML = renderLocationBadgeHTML;
window.formatThaiCompactDateTime = formatThaiCompactDateTime;
window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.tableViewLoaded = true;