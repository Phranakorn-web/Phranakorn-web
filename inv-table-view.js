// =========================================================================
// --- MODULE 2B: INVENTORY TABLE, FILTERING, GROUPING & BULK SELECTION ---
// --- FILE: inv-table-view.js (v25.0 MODULAR ARCHITECTURE) ---
// =========================================================================

function debouncedFilterInventoryData() {
    if (wmsFilterDebounceTimer) clearTimeout(wmsFilterDebounceTimer);
    wmsFilterDebounceTimer = setTimeout(() => {
        filterInventoryData();
    }, 110);
}

// คืนค่ารายการที่ติ๊กเลือกเฉพาะที่ตรงกับตัวกรองปัจจุบัน 100%
function getScopedSelectedItems() {
    const modal = document.getElementById('stockDetailModal');
    const isModalOpen = Boolean(currentDetailModalGroupKey && modal && modal.style.display !== 'none');

    if (isModalOpen) {
        const modalPool = Array.isArray(wmsLastModalFilteredItems) ? wmsLastModalFilteredItems : [];
        return modalPool.filter(item => selectedItemSnSet.has(item.sn) && !isSnInTombstone(item.sn));
    }

    const pagePool = Array.isArray(currentFilteredItems) ? currentFilteredItems : [];
    return pagePool.filter(item => selectedItemSnSet.has(item.sn) && !isSnInTombstone(item.sn));
}

function filterInventoryData(preserveLimit = false) {
    if (!preserveLimit) {
        wmsMainTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    }

    const searchInput = document.getElementById('searchInput');
    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const aisleFilter = aisleSelect ? aisleSelect.value : 'ALL';
    const bayFilter = baySelect ? baySelect.value : 'ALL';
    const locFilter = locSelect ? locSelect.value : 'ALL';

    currentFilteredItems = globalInventoryData.filter(item => {
        if (isSnInTombstone(item.sn)) return false;

        const matchText = !query ||
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.category && item.category.toLowerCase().includes(query)) ||
            (item.name && item.name.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            (item.received_by && item.received_by.toLowerCase().includes(query));

        let matchAisle = true;
        if (aisleFilter !== 'ALL') {
            if (aisleFilter === 'DOCK') matchAisle = (item.location || '').toUpperCase() === 'DOCK';
            else matchAisle = (item.location || '').toUpperCase().startsWith(`${aisleFilter}-`) || (item.location || '').toUpperCase() === aisleFilter;
        }

        let matchBay = true;
        if (bayFilter !== 'ALL' && aisleFilter !== 'ALL' && aisleFilter !== 'DOCK') {
            matchBay = (item.location || '').toUpperCase().startsWith(`${aisleFilter}-${bayFilter}-`);
        }

        let matchLoc = true;
        if (locFilter !== 'ALL') {
            matchLoc = (item.location || '').toUpperCase() === locFilter.toUpperCase();
        }

        return matchText && matchAisle && matchBay && matchLoc;
    });

    if (selectedItemSnSet.size > 0) {
        const validFilteredSnSet = new Set(currentFilteredItems.map(i => i.sn));
        Array.from(selectedItemSnSet).forEach(sn => {
            if (!validFilteredSnSet.has(sn)) {
                selectedItemSnSet.delete(sn);
            }
        });
    }

    renderInventoryTable(currentFilteredItems);
    if (typeof refreshStockDetailModalIfActive === 'function') {
        refreshStockDetailModalIfActive();
    }
}

function buildInventoryGroups(items) {
    const map = new Map();
    items.forEach(item => {
        const cat = (item.category || 'N/A').trim();
        const name = (item.name || '-').trim();
        const key = `${cat}||${name}`;

        if (!map.has(key)) {
            map.set(key, {
                groupKey: key,
                category: cat,
                name: name,
                items: [],
                totalQty: 0,
                locationSet: new Set(),
                pendingCount: 0
            });
        }
        const grp = map.get(key);
        grp.items.push(item);
        grp.totalQty += (parseInt(item.qty) || 1);
        if (item.location) grp.locationSet.add(item.location.toUpperCase());
        if (item._pending) grp.pendingCount++;
    });

    const groups = [];
    map.forEach(grp => {
        groups.push({
            groupKey: grp.groupKey,
            category: grp.category,
            name: grp.name,
            items: grp.items,
            totalQty: grp.totalQty,
            locations: Array.from(grp.locationSet).sort(),
            pendingCount: grp.pendingCount
        });
    });
    return groups;
}

function ensureStockBulkActionToolbar() {
    ensureWmsInvDbStyles();
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table || !table.parentElement) return;

    let bar = document.getElementById('wmsStockBulkActionToolbar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'wmsStockBulkActionToolbar';
        bar.className = 'wms-stock-action-bar';
        table.parentElement.insertBefore(bar, table);
    }

    const scopedSelected = getScopedSelectedItems();
    const selCount = scopedSelected.length;

    bar.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
            <span style="display:inline-flex; align-items:center; gap:6px; font-size:0.86rem; font-weight:700; color:var(--text-main, #0f172a); background:var(--bg-surface, #ffffff); padding:5px 11px; border-radius:8px; border:1px solid var(--border-strong, #cbd5e1);">
                <i class="fa-solid fa-square-check" style="color:var(--primary, #2563eb);"></i>
                เลือกไว้: <span class="mono" style="color:var(--primary, #2563eb); font-size:0.95rem;">${selCount.toLocaleString()}</span> S/N
            </span>
            ${selCount > 0 ? `
                <button type="button" class="btn btn-sm btn-secondary" onclick="clearAllSelectedItems()" style="font-weight:600; border-radius:7px;">
                    <i class="fa-solid fa-xmark"></i> ล้างที่เลือก
                </button>
            ` : ''}
            <span class="wms-realtime-pill" title="หน้าเว็บซิงค์ข้อมูลอัตโนมัติทันทีเมื่อมีการย้ายหรือลบ">
                <span class="wms-realtime-dot"></span> อัปเดตเรียลไทม์
            </span>
        </div>
        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="openPasteBulkDeleteModal()" style="font-weight:600; border-radius:7px;" title="เปิดหน้าต่างลบแบบวางรายการ S/N จำนวนมาก (รองรับ 6,500 - 50,000+ รายการ)">
                <i class="fa-solid fa-paste" style="color:#dc2626;"></i> ลบแบบวาง S/N
            </button>
            <button type="button" class="btn btn-sm btn-danger" onclick="deleteSelectedItemsFromInventory()" ${selCount === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed; font-weight:600; border-radius:7px;"' : 'style="font-weight:700; border-radius:7px; box-shadow:0 2px 6px rgba(220,38,38,0.22);"'}>
                <i class="fa-solid fa-trash-can"></i> ลบรายการที่เลือก (${selCount.toLocaleString()} S/N)
            </button>
        </div>
    `;
}

function clearAllSelectedItems() {
    selectedItemSnSet.clear();
    document.querySelectorAll('.group-checkbox, .item-checkbox, .item-checkbox-modal, #selectAllCheckbox, #modalSelectAllCb').forEach(cb => {
        cb.checked = false;
    });
    document.querySelectorAll('tr.is-selected').forEach(tr => tr.classList.remove('is-selected'));
    updateSelectedCountUI();
    ensureStockBulkActionToolbar();
    if (currentDetailModalGroupKey && typeof updateModalQuickPillUI === 'function') {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        if (grp) updateModalQuickPillUI(grp);
    }
}

function updateStockViewModeButtonUI() {
    const totalBadge = document.getElementById('totalCountBadge');
    let btn = document.getElementById('btnToggleInventoryViewMode');
    if (!btn && totalBadge && totalBadge.parentElement) {
        btn = document.createElement('button');
        btn.id = 'btnToggleInventoryViewMode';
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-secondary';
        btn.style.cssText = 'margin-left: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.05);';
        btn.onclick = toggleStockViewMode;
        totalBadge.parentElement.appendChild(btn);
    }

    let printAllBtn = document.getElementById('btnPrintAllFilteredBarcodes');
    if (!printAllBtn && totalBadge && totalBadge.parentElement) {
        printAllBtn = document.createElement('button');
        printAllBtn.id = 'btnPrintAllFilteredBarcodes';
        printAllBtn.type = 'button';
        printAllBtn.className = 'btn btn-sm btn-primary';
        printAllBtn.style.cssText = 'margin-left: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(37,99,235,0.2);';
        printAllBtn.onclick = printAllFilteredBarcodesFromInventory;
        totalBadge.parentElement.appendChild(printAllBtn);
    }

    if (btn) {
        if (inventoryViewMode === 'grouped') {
            btn.innerHTML = `<i class="fa-solid fa-layer-group" style="color:var(--primary);"></i> โหมดจัดกลุ่มตามรุ่น (Default)`;
            btn.title = 'คลิกเพื่อสลับเป็นโหมดแสดงรายการซีเรียลทั้งหมด';
        } else {
            btn.innerHTML = `<i class="fa-solid fa-list-check" style="color:var(--warning);"></i> โหมดแสดงทุกซีเรียล`;
            btn.title = 'คลิกเพื่อสลับเป็นโหมดจัดกลุ่มตามรุ่นเพื่อความรวดเร็ว';
        }
    }

    if (printAllBtn) {
        const filteredCount = currentFilteredItems.length;
        printAllBtn.innerHTML = `<i class="fa-solid fa-barcode"></i> พิมพ์บาร์โค้ดทั้งหมดที่แสดง (${filteredCount.toLocaleString()} S/N)`;
        printAllBtn.title = 'เปิดศูนย์พิมพ์บาร์โค้ดสติกเกอร์สำหรับรายการที่แสดงอยู่ทั้งหมด (รองรับหลักพัน–หลักหมื่น S/N)';
    }
}

function toggleStockViewMode() {
    inventoryViewMode = (inventoryViewMode === 'grouped') ? 'detailed' : 'grouped';
    wmsMainTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    updateStockViewModeButtonUI();
    renderInventoryTable(currentFilteredItems);
    if (typeof showToast === 'function') {
        showToast(`🎨 สลับเป็น: ${inventoryViewMode === 'grouped' ? 'โหมดจัดกลุ่มตามรุ่น (กระชับพื้นที่)' : 'โหมดแสดงทุกซีเรียล'}`);
    }
}

function updateInventoryTableHeader() {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table) return;

    let thead = table.querySelector('thead');
    if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, tbody);
    }

    if (inventoryViewMode === 'grouped') {
        const allChecked = currentInventoryGroups.length > 0 && currentInventoryGroups.every(g => g.items.every(i => selectedItemSnSet.has(i.sn)));
        thead.innerHTML = `
            <tr style="background: var(--bg-subtle, #f8fafc); border-bottom: 2px solid var(--border-color, #e2e8f0);">
                <th style="width:44px; text-align:center;"><input type="checkbox" id="selectAllCheckbox" ${allChecked ? 'checked' : ''} onchange="toggleSelectAllVisibleItems(this.checked)"></th>
                <th style="width:60px; text-align:center;">ลำดับ</th>
                <th style="width:160px; text-align:left;">รหัสสินค้า (SKU)</th>
                <th style="text-align:left;">ชื่อสินค้า / ชื่อรุ่น</th>
                <th style="width:220px; text-align:left;">พิกัดจัดเก็บในคลัง</th>
                <th style="width:130px; text-align:center;">ยอดรวมในคลัง</th>
                <th style="width:140px; text-align:center;">สถานะ DB</th>
                <th style="width:210px; text-align:center;">จัดการ / ซีเรียล / พิมพ์</th>
            </tr>
        `;
    } else {
        const allChecked = currentFilteredItems.length > 0 && currentFilteredItems.every(i => selectedItemSnSet.has(i.sn));
        thead.innerHTML = `
            <tr style="background: var(--bg-subtle, #f8fafc); border-bottom: 2px solid var(--border-color, #e2e8f0);">
                <th style="width:44px; text-align:center;"><input type="checkbox" id="selectAllCheckbox" ${allChecked ? 'checked' : ''} onchange="toggleSelectAllVisibleItems(this.checked)"></th>
                <th style="width:56px; text-align:center;">ลำดับ</th>
                <th style="text-align:left;">รหัสสินค้า (SKU)</th>
                <th style="text-align:left;">ชื่อรุ่น / รายละเอียด</th>
                <th style="text-align:center;">เลขมิเตอร์</th>
                <th style="text-align:left;">หมายเลขซีเรียล (S/N)</th>
                <th style="text-align:left;">พิกัดจัดเก็บ</th>
                <th style="text-align:center;">จำนวน</th>
                <th style="text-align:left;">ผู้รับสินค้าเข้า</th>
                <th style="text-align:center;">วันที่รับเข้า</th>
                <th style="text-align:center;">พิมพ์</th>
                <th style="text-align:center;">แก้ไข</th>
                <th style="text-align:center;">ย้าย</th>
                <th style="text-align:center;">ลบ</th>
            </tr>
        `;
    }
}

function loadMoreMainInventoryRows(showAll = false) {
    if (showAll) {
        wmsMainTableRenderLimit = currentFilteredItems.length;
    } else {
        wmsMainTableRenderLimit += WMS_TABLE_RENDER_BATCH_SIZE;
    }
    renderInventoryTable(currentFilteredItems);
}

function renderInventoryTable(items = currentFilteredItems) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    updateStockViewModeButtonUI();
    ensureStockBulkActionToolbar();

    if (inventoryViewMode === 'grouped') {
        currentInventoryGroups = buildInventoryGroups(items);
        updateInventoryTableHeader();

        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge) {
            totalBadge.textContent = `ดึงข้อมูลแล้ว ${items.length.toLocaleString()} รายการ (${currentInventoryGroups.length.toLocaleString()} รุ่น) / ${globalInventoryData.length.toLocaleString()} รายการทั้งหมด`;
        }

        if (currentInventoryGroups.length === 0) {
            const emptyMsg = wmsIsDatabaseLoading
                ? `<div style="display:inline-flex; align-items:center; gap:8px; color:var(--primary); font-weight:600;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูลสต็อกสินค้าจากฐานข้อมูล...</div>`
                : `ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา`;
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--text-muted); font-size:0.92rem;">${emptyMsg}</td></tr>`;
            updateSelectedCountUI();
            return;
        }

        const frag = document.createDocumentFragment();

        currentInventoryGroups.forEach((grp, idx) => {
            const isGroupAllChecked = grp.items.every(i => selectedItemSnSet.has(i.sn));
            const formatFn = typeof formatLocationCode === 'function' ? formatLocationCode : (l => l);

            let locHtml = '';
            if (grp.locations.length === 0) {
                locHtml = `
                    <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
                        <span class="badge-location mono" style="display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:6px; font-size:0.78rem; font-weight:600; background:var(--bg-subtle, #f1f5f9); border:1px solid var(--border-color, #e2e8f0); color:var(--text-sub, #475569);">
                            <i class="fa-solid fa-location-dot" style="color:#64748b;"></i> DOCK
                        </span>
                    </div>`;
            } else {
                const displayLocs = grp.locations.slice(0, 3);
                const locItems = displayLocs.map(loc =>
                    `<span class="badge-location mono" style="display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:6px; font-size:0.78rem; font-weight:700; background:linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(59,130,246,0.12) 100%); border:1px solid rgba(37,99,235,0.2); color:var(--primary, #2563eb); white-space:nowrap;">
                        <i class="fa-solid fa-location-dot" style="color:#2563eb; font-size:0.72rem;"></i> ${escapeHTML(formatFn(loc))}
                    </span>`
                ).join('');

                let moreBadge = '';
                if (grp.locations.length > 3) {
                    moreBadge = `<span class="badge-action nav" style="font-size:0.72rem; padding:2px 7px; border-radius:4px; font-weight:600; cursor:pointer;" title="${escapeHTML(grp.locations.map(formatFn).join(', '))}">+ อีก ${grp.locations.length - 3} พิกัด</span>`;
                }

                locHtml = `<div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start; max-height:85px; overflow-y:auto; padding-right:2px;">${locItems}${moreBadge}</div>`;
            }

            let statusBadge = `<span class="badge-action inbound" style="font-size:0.75rem; padding:3px 10px; border-radius:12px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> พร้อมใช้งาน</span>`;
            if (grp.pendingCount > 0) {
                statusBadge = `<span class="badge-action delete" style="font-size:0.72rem; padding:3px 8px; border-radius:12px; font-weight:700;"><i class="fa-solid fa-cloud-arrow-up"></i> รอบันทึก DB (${grp.pendingCount})</span>`;
            }

            const tr = document.createElement('tr');
            if (isGroupAllChecked) tr.classList.add('is-selected');
            tr.style.cssText = 'transition: background 0.15s ease;';
            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle;">
                    <input type="checkbox" class="group-checkbox" data-group-key="${escapeHTML(grp.groupKey)}" ${isGroupAllChecked ? 'checked' : ''} onchange="toggleGroupSelection('${escapeHTML(grp.groupKey)}', this.checked)">
                </td>
                <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${idx + 1}</td>
                <td style="text-align:left; vertical-align:middle;"><code class="mono font-bold" style="color:var(--primary-text); font-size:0.92rem; background:rgba(37,99,235,0.06); padding:3px 8px; border-radius:4px; border:1px solid rgba(37,99,235,0.15);">${escapeHTML(grp.category)}</code></td>
                <td style="text-align:left; vertical-align:middle;">
                    <div class="font-bold text-multiline-truncate wms-product-name-2line" style="color:var(--text-main); font-size:0.92rem;" title="${escapeHTML(grp.name)}">${escapeHTML(grp.name)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:3px;"><i class="fa-solid fa-barcode"></i> รวม ${grp.items.length.toLocaleString()} ซีเรียล</div>
                </td>
                <td style="text-align:left; vertical-align:middle;">${locHtml}</td>
                <td style="text-align:center; vertical-align:middle;">
                    <span class="mono font-bold" style="color:var(--success, #10b981); font-size:1.02rem; background:var(--bg-subtle, #f8fafc); padding:4px 12px; border-radius:8px; border:1px solid var(--border-color, #e2e8f0); display:inline-block; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                        ${grp.totalQty.toLocaleString()} เครื่อง
                    </span>
                </td>
                <td style="text-align:center; vertical-align:middle;">${statusBadge}</td>
                <td style="text-align:center; vertical-align:middle;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                        <button type="button" class="btn btn-sm btn-primary" onclick="openStockDetailModal('${escapeHTML(grp.groupKey)}')" title="กดดูซีเรียลและรายละเอียดสินค้า" style="border-radius:6px; font-weight:600; padding:5px 11px; transition:all 0.2s ease; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
                            <i class="fa-solid fa-eye"></i> ดูซีเรียล (${grp.items.length.toLocaleString()})
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary wms-action-btn-print" onclick="triggerPrintBarcodeAction('GROUP', '${escapeHTML(grp.groupKey)}')" title="พิมพ์บาร์โค้ดสติกเกอร์ทั้งหมดในรุ่นนี้ (${grp.items.length.toLocaleString()} S/N)" style="border-radius:6px; font-weight:600; padding:5px 10px;">
                            <i class="fa-solid fa-barcode"></i> พิมพ์
                        </button>
                    </div>
                </td>
            `;
            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
    } else {
        updateInventoryTableHeader();

        const totalBadge = document.getElementById('totalCountBadge');
        if (totalBadge) {
            totalBadge.textContent = `ดึงข้อมูลแล้ว ${items.length.toLocaleString()} / ${globalInventoryData.length.toLocaleString()} รายการ`;
        }

        if (items.length === 0) {
            const emptyMsg = wmsIsDatabaseLoading
                ? `<div style="display:inline-flex; align-items:center; gap:8px; color:var(--primary); font-weight:600;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูลสต็อกสินค้าจากฐานข้อมูล...</div>`
                : `ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา`;
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:32px; color:var(--text-muted); font-size:0.92rem;">${emptyMsg}</td></tr>`;
            updateSelectedCountUI();
            return;
        }

        const frag = document.createDocumentFragment();
        let allVisibleChecked = items.length > 0;
        const visibleSlice = items.slice(0, wmsMainTableRenderLimit);

        for (let i = 0; i < items.length; i++) {
            if (!selectedItemSnSet.has(items[i].sn)) {
                allVisibleChecked = false;
                break;
            }
        }

        visibleSlice.forEach((item, index) => {
            const isChecked = selectedItemSnSet.has(item.sn);
            const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
            const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;
            const receiverDisplay = item.received_by || item.created_by || item.received_by_name || 'ไม่ระบุ';

            const tr = document.createElement('tr');
            if (isChecked) tr.classList.add('is-selected');
            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle;"><input type="checkbox" class="item-checkbox" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
                <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${index + 1}</td>
                <td style="text-align:left; vertical-align:middle;"><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(item.category || 'N/A')}</code></td>
                <td style="text-align:left; vertical-align:middle;"><div class="text-multiline-truncate wms-product-name-2line" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
                <td style="text-align:center; vertical-align:middle;"><span class="mono font-bold" style="color:var(--warning); font-size:0.92rem;"><i class="fa-solid fa-gauge"></i> ${Number(meterValue).toLocaleString()}</span></td>
                <td style="text-align:left; vertical-align:middle;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <code class="mono font-bold">${escapeHTML(item.sn)}</code>
                        <button type="button" class="btn btn-sm btn-secondary" style="padding:1px 5px; font-size:0.7rem; border-radius:4px;" onclick="copyTextToClipboard('${escapeHTML(item.sn)}', 'S/N')" title="คัดลอก S/N"><i class="fa-solid fa-copy"></i></button>
                    </div>
                    ${item._pending ? ' <span class="badge-action delete" style="font-size:0.68rem;"><i class="fa-solid fa-clock"></i> รอบันทึก DB</span>' : ''}
                </td>
                <td style="text-align:left; vertical-align:middle;">
                    <span class="badge-location mono" style="display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:6px; font-size:0.78rem;">
                        <i class="fa-solid fa-location-dot" style="color:var(--primary);"></i> ${escapeHTML(formatLoc)}
                    </span>
                </td>
                <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${item.qty ?? 1}</td>
                <td style="text-align:left; vertical-align:middle;">
                    <span style="font-size:0.85rem; font-weight:600; color:var(--primary-text, #0f172a); display:inline-flex; align-items:center; gap:5px; background:var(--bg-subtle, #f8fafc); padding:3px 8px; border-radius:6px; border:1px solid var(--border-color, #e2e8f0);">
                        <i class="fa-solid fa-user-check" style="color:var(--success, #10b981); font-size:0.75rem;"></i> ${escapeHTML(receiverDisplay)}
                    </span>
                </td>
                <td style="text-align:center; font-size:0.78rem; color:var(--text-muted); vertical-align:middle;">${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}</td>
                <td style="text-align:center; vertical-align:middle;">
                    <button type="button" class="btn btn-sm btn-primary wms-action-btn-print" onclick="triggerPrintBarcodeAction('SINGLE', '${escapeHTML(item.sn)}')"><i class="fa-solid fa-barcode"></i> พิมพ์</button>
                </td>
                <td style="text-align:center; vertical-align:middle;">
                    <button type="button" class="btn btn-sm btn-secondary wms-action-btn-edit" onclick="triggerEditItemAction('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}')"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                </td>
                <td style="text-align:center; vertical-align:middle;">
                    <button type="button" class="btn btn-sm btn-secondary wms-action-btn-relocate" onclick="triggerRelocateAction('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}', '${escapeHTML(item.name)}', '${escapeHTML(item.location)}')"><i class="fa-solid fa-right-left"></i> ย้าย</button>
                </td>
                <td style="text-align:center; vertical-align:middle;">
                    <button type="button" class="btn btn-sm btn-danger wms-action-btn-delete" onclick="triggerDeleteItemAction('SINGLE', '${escapeHTML(item.sn)}', '${escapeHTML(String(item.id))}')"><i class="fa-solid fa-trash"></i> ลบ</button>
                </td>
            `;
            frag.appendChild(tr);
        });

        if (items.length > visibleSlice.length) {
            const remaining = items.length - visibleSlice.length;
            const loadMoreTr = document.createElement('tr');
            loadMoreTr.innerHTML = `
                <td colspan="14" style="text-align:center; padding:14px; background:var(--bg-subtle, #f8fafc);">
                    <div style="display:inline-flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:10px;">
                        <span style="font-size:0.84rem; color:var(--text-sub); font-weight:600;">
                            กำลังแสดง ${visibleSlice.length.toLocaleString()} จาก ${items.length.toLocaleString()} รายการ (ติ๊ก "เลือกทั้งหมด" ด้านบนจะเลือกครบทั้ง ${items.length.toLocaleString()} S/N ทันที)
                        </span>
                        <button type="button" class="btn btn-sm btn-primary" onclick="loadMoreMainInventoryRows(false)" style="font-weight:600;">
                            <i class="fa-solid fa-angles-down"></i> โหลดเพิ่มอีก ${Math.min(WMS_TABLE_RENDER_BATCH_SIZE, remaining).toLocaleString()} แถว
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="loadMoreMainInventoryRows(true)" style="font-weight:600;">
                            แสดงทั้งหมด (${items.length.toLocaleString()} แถว)
                        </button>
                    </div>
                </td>
            `;
            frag.appendChild(loadMoreTr);
        }

        tbody.appendChild(frag);
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb) selectAllCb.checked = allVisibleChecked;
    }

    updateSelectedCountUI();
    processPendingInboundDeleteRedirectIfAny();
}

// รับคำขอลบที่ถูกส่งต่อมาจากหน้าประวัติรับเข้าล่าสุด (inbound-feed.js)
function processPendingInboundDeleteRedirectIfAny() {
    if (typeof window === 'undefined' || !window.__WMS_PENDING_STOCK_DELETE__) return;
    const pending = window.__WMS_PENDING_STOCK_DELETE__;
    if (!pending || !pending.sn) return;

    // หมดอายุคำขออัตโนมัติหากเกิน 10 วินาที
    if (Date.now() - (pending.requestedAt || 0) > 10000) {
        window.__WMS_PENDING_STOCK_DELETE__ = null;
        return;
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value.trim().toUpperCase() !== pending.sn.toUpperCase()) {
        searchInput.value = pending.sn;
        filterInventoryData(false);
        return;
    }

    if (typeof triggerDeleteItemAction === 'function') {
        window.__WMS_PENDING_STOCK_DELETE__ = null;
        triggerDeleteItemAction('SINGLE', pending.sn, pending.id || '');
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('wms:openStockDeleteConfirmation', (e) => {
        const detail = e && e.detail ? e.detail : null;
        if (!detail || !detail.sn) return;
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = detail.sn;
            filterInventoryData(false);
        }
        if (typeof triggerDeleteItemAction === 'function') {
            window.__WMS_PENDING_STOCK_DELETE__ = null;
            triggerDeleteItemAction('SINGLE', detail.sn, detail.id || '');
        }
    });
}

function toggleGroupSelection(groupKey, checked) {
    const group = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!group) return;

    const filteredSnSet = new Set(currentFilteredItems.map(i => i.sn));
    group.items.forEach(item => {
        if (!filteredSnSet.has(item.sn)) return;
        if (checked) selectedItemSnSet.add(item.sn);
        else selectedItemSnSet.delete(item.sn);
    });

    const safeGroupSel = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(groupKey) : groupKey.replace(/"/g, '\\"');
    document.querySelectorAll(`.group-checkbox[data-group-key="${safeGroupSel}"]`).forEach(cb => {
        cb.checked = checked;
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('is-selected', checked);
    });

    document.querySelectorAll('.item-checkbox-modal').forEach(cb => {
        const sn = cb.getAttribute('data-sn');
        if (group.items.some(i => i.sn === sn)) {
            cb.checked = checked;
            const tr = cb.closest('tr');
            if (tr) tr.classList.toggle('is-selected', checked);
        }
    });

    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (selectAllCb && currentInventoryGroups.length > 0) {
        selectAllCb.checked = currentInventoryGroups.every(g => g.items.every(i => selectedItemSnSet.has(i.sn)));
    }

    updateSelectedCountUI();
}

function toggleSelectAllVisibleItems(checked) {
    if (inventoryViewMode === 'grouped') {
        currentInventoryGroups.forEach(grp => {
            grp.items.forEach(item => {
                if (checked) selectedItemSnSet.add(item.sn);
                else selectedItemSnSet.delete(item.sn);
            });
        });
        document.querySelectorAll('.group-checkbox').forEach(cb => {
            cb.checked = checked;
            const tr = cb.closest('tr');
            if (tr) tr.classList.toggle('is-selected', checked);
        });
    } else {
        for (let i = 0; i < currentFilteredItems.length; i++) {
            const sn = currentFilteredItems[i].sn;
            if (checked) selectedItemSnSet.add(sn);
            else selectedItemSnSet.delete(sn);
        }
        document.querySelectorAll('.item-checkbox').forEach(cb => {
            cb.checked = checked;
            const tr = cb.closest('tr');
            if (tr) tr.classList.toggle('is-selected', checked);
        });
    }

    updateSelectedCountUI();
}

function toggleItemSelection(sn, checked) {
    if (checked) selectedItemSnSet.add(sn);
    else selectedItemSnSet.delete(sn);

    const safeSelector = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(sn) : sn.replace(/"/g, '\\"');
    document.querySelectorAll(`.item-checkbox-modal[data-sn="${safeSelector}"]`).forEach(cb => {
        cb.checked = checked;
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('is-selected', checked);
    });
    document.querySelectorAll(`.item-checkbox[data-sn="${safeSelector}"]`).forEach(cb => {
        cb.checked = checked;
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('is-selected', checked);
    });

    if (currentDetailModalGroupKey && typeof updateModalQuickPillUI === 'function') {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        if (grp) updateModalQuickPillUI(grp);
    }

    updateSelectedCountUI();
}

function updateSelectedCountUI() {
    const scopedItems = getScopedSelectedItems();
    const count = scopedItems.length;
    const selCount = document.getElementById('selectedCountSpan');
    const selRelocateCount = document.getElementById('selectedRelocateCountSpan');

    if (selCount) selCount.textContent = count.toLocaleString();
    if (selRelocateCount) selRelocateCount.textContent = count.toLocaleString();

    ensureStockBulkActionToolbar();

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge && currentDetailModalGroupKey) {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        const totalInFilteredModal = Array.isArray(wmsLastModalFilteredItems) ? wmsLastModalFilteredItems.length : (grp ? grp.items.length : 0);
        const shownInModal = Math.min(wmsModalTableRenderLimit, totalInFilteredModal);
        footerBadge.textContent = `แสดงผล ${shownInModal.toLocaleString()} / ${totalInFilteredModal.toLocaleString()} ซีเรียล | เลือกแล้ว ${count.toLocaleString()} รายการ`;
    }
}

// Global Exports
window.filterInventoryTable = filterInventoryData;
window.renderInventoryTable = renderInventoryTable;
window.getScopedSelectedItems = getScopedSelectedItems;
window.debouncedFilterInventoryData = debouncedFilterInventoryData;
window.toggleStockViewMode = toggleStockViewMode;
window.toggleGroupSelection = toggleGroupSelection;
window.clearAllSelectedItems = clearAllSelectedItems;
window.loadMoreMainInventoryRows = loadMoreMainInventoryRows;
window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.tableViewLoaded = true;