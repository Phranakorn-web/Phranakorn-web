// =========================================================================
// --- MODULE 2C: MODEL SERIAL DETAIL MODAL, INV/PO FILTER & BATCH TOOLS ---
// --- FILE: inv-serial-modal.js (v29.0 REALTIME SYNC & INV/PO INSPECTOR)  ---
// =========================================================================

let wmsModalSearchQuery = '';
let wmsModalSpecificDocFilter = '';
let wmsModalSortOrder = 'LATEST';

// สร้างโครงสร้าง Modal รายละเอียดซีเรียลรายรุ่นอัตโนมัติหากยังไม่มีในหน้า HTML
function ensureModelSerialDetailModalDOM() {
    if (typeof document === 'undefined') return null;
    ensureWmsInvDbStyles();

    let modal = document.getElementById('modelSerialDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modelSerialDetailModal';
        modal.className = 'wms-modal-backdrop wms-serial-modal-backdrop';
        modal.style.display = 'none';
        document.body.appendChild(modal);
    }

    if (!modal.dataset.backdropBound) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModelSerialModal();
            }
        });
        modal.dataset.backdropBound = 'true';
    }

    return modal;
}

// เปิดหน้าต่างแสดงรายการ Serial Number ทั้งหมดของรุ่นสินค้าที่เลือก
function openModelSerialModal(groupKey, options = {}) {
    if (!groupKey) return;
    const modal = ensureModelSerialDetailModalDOM();
    if (!modal) return;

    currentDetailModalGroupKey = groupKey;
    currentModalQuickFilter = options.quickFilter || 'ALL';
    wmsModalSearchQuery = options.searchQuery || '';
    wmsModalSpecificDocFilter = options.specificDoc || '';
    wmsModalSortOrder = options.sortOrder || 'LATEST';
    wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;

    renderModelSerialModalBody(groupKey);

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.classList.add('wms-modal-open');

    setTimeout(() => {
        const searchBox = document.getElementById('wmsModalSerialSearchInput');
        if (searchBox && !options.skipFocus) {
            searchBox.focus();
        }
    }, 60);
}

// ปิดหน้าต่างรายละเอียดซีเรียลรายรุ่น
function closeModelSerialModal() {
    const modal = document.getElementById('modelSerialDetailModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    currentDetailModalGroupKey = null;
    wmsModalSearchQuery = '';
    wmsModalSpecificDocFilter = '';
    wmsLastModalFilteredItems = [];
    document.body.classList.remove('wms-modal-open');
}

// ดึงรายการสินค้าทั้งหมดที่อยู่ในกลุ่มรุ่นปัจจุบัน (อัปเดตสดตาม globalInventoryData เสมอ)
function getItemsForModelGroupKey(groupKey) {
    if (!groupKey) return { sku: '-', name: 'ไม่ระบุรุ่นสินค้า', items: [] };

    const sepIdx = groupKey.indexOf('::');
    const targetSku = sepIdx !== -1 ? groupKey.slice(0, sepIdx) : groupKey;
    const targetName = sepIdx !== -1 ? groupKey.slice(sepIdx + 2) : '';

    const matchedItems = [];
    for (let i = 0; i < globalInventoryData.length; i++) {
        const it = globalInventoryData[i];
        if (!it || isSnInTombstone(it.sn)) continue;
        const itemSku = String(it.category || 'UNSPECIFIED').trim();
        const itemName = String(it.name || 'ไม่ระบุชื่อรุ่นสินค้า').trim();
        if (itemSku === targetSku && (!targetName || itemName === targetName)) {
            matchedItems.push(it);
        }
    }

    return {
        sku: targetSku,
        name: targetName || (matchedItems[0] && matchedItems[0].name) || 'ไม่ระบุชื่อรุ่นสินค้า',
        items: matchedItems
    };
}

// ประมวลผลตัวกรองและการเรียงลำดับภายในหน้าต่าง Modal รายรุ่น
function computeFilteredModalItems(allModelItems) {
    const queryLower = String(wmsModalSearchQuery || '').trim().toLowerCase();
    const tokens = queryLower ? queryLower.split(/\s+/).filter(Boolean) : [];
    const docTagFilter = String(wmsModalSpecificDocFilter || '').trim();

    const result = [];
    for (let i = 0; i < allModelItems.length; i++) {
        const it = allModelItems[i];
        const locUpper = String(it.location || 'DOCK').toUpperCase().trim();
        const hasInv = Boolean(it.inv_no);
        const hasPo = Boolean(it.po_no);

        // 1. ตัวกรอง Quick Filter (สถานะพิกัด / เอกสาร)
        if (currentModalQuickFilter === 'RACK') {
            if (locUpper === 'DOCK' || locUpper === 'OFFICE' || locUpper === 'PENDING') continue;
        } else if (currentModalQuickFilter === 'DOCK') {
            if (locUpper !== 'DOCK') continue;
        } else if (currentModalQuickFilter === 'OFFICE') {
            if (locUpper !== 'OFFICE') continue;
        } else if (currentModalQuickFilter === 'HAS_INV') {
            if (!hasInv) continue;
        } else if (currentModalQuickFilter === 'HAS_PO') {
            if (!hasPo) continue;
        } else if (currentModalQuickFilter === 'NO_DOC') {
            if (hasInv || hasPo) continue;
        }

        // 2. ตัวกรองเฉพาะเลข INV หรือ PO เมื่อคลิกชิปเอกสารด้านบน
        if (docTagFilter) {
            if (docTagFilter.startsWith('INV:')) {
                const targetInv = docTagFilter.slice(4);
                if (String(it.inv_no || '').trim() !== targetInv) continue;
            } else if (docTagFilter.startsWith('PO:')) {
                const targetPo = docTagFilter.slice(3);
                if (String(it.po_no || '').trim() !== targetPo) continue;
            }
        }

        // 3. ค้นหาหลายคำภายในรุ่น (S/N, INV, PO, พิกัด, ผู้รับเข้า)
        if (tokens.length > 0) {
            const idxStr = it._searchIndex || `${it.sn}|${it.inv_no}|${it.po_no}|${it.location}|${it.received_by}`.toLowerCase();
            let ok = true;
            for (let t = 0; t < tokens.length; t++) {
                if (!idxStr.includes(tokens[t])) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;
        }

        result.push(it);
    }

    if (wmsModalSortOrder === 'SN_ASC') {
        result.sort((a, b) => String(a.sn || '').localeCompare(String(b.sn || '')));
    } else if (wmsModalSortOrder === 'SN_DESC') {
        result.sort((a, b) => String(b.sn || '').localeCompare(String(a.sn || '')));
    } else if (wmsModalSortOrder === 'LOC_ASC') {
        result.sort((a, b) => String(a.location || '').localeCompare(String(b.location || '')));
    } else if (wmsModalSortOrder === 'INV_ASC') {
        result.sort((a, b) => String(a.inv_no || 'ZZZ').localeCompare(String(b.inv_no || 'ZZZ')));
    } else if (wmsModalSortOrder === 'OLDEST') {
        result.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    }

    wmsLastModalFilteredItems = result;
    return result;
}

// วาดเนื้อหาทั้งหมดของ Modal รายละเอียดซีเรียลรายรุ่น (รองรับการอัปเดตเรียลไทม์)
function renderModelSerialModalBody(groupKey = currentDetailModalGroupKey) {
    if (!groupKey) return;
    const modal = ensureModelSerialDetailModalDOM();
    if (!modal) return;

    const { sku, name, items: allModelItems } = getItemsForModelGroupKey(groupKey);
    const filteredItems = computeFilteredModalItems(allModelItems);

    // คำนวณสถิติรวมของรุ่นนี้
    let rackCount = 0;
    let dockCount = 0;
    let officeCount = 0;
    let withInvCount = 0;
    let withPoCount = 0;
    let noDocCount = 0;
    let selectedInModelCount = 0;

    for (let i = 0; i < allModelItems.length; i++) {
        const it = allModelItems[i];
        const loc = String(it.location || 'DOCK').toUpperCase().trim();
        if (loc === 'DOCK') dockCount++;
        else if (loc === 'OFFICE') officeCount++;
        else rackCount++;

        if (it.inv_no) withInvCount++;
        if (it.po_no) withPoCount++;
        if (!it.inv_no && !it.po_no) noDocCount++;
        if (selectedItemSnSet.has(it.sn)) selectedInModelCount++;
    }

    const docSummary = extractGroupInvPoSummary(allModelItems);

    // สร้างแถบชิปเอกสาร INV และ PO ของรุ่นนี้ (คลิกเพื่อกรองเฉพาะเอกสารนั้นได้ทันที)
    const docChipsHtml = [];
    docSummary.invList.forEach(inv => {
        const token = `INV:${inv}`;
        const isActive = wmsModalSpecificDocFilter === token;
        const jsToken = token.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const jsInv = inv.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        docChipsHtml.push(`
            <div class="wms-modal-doc-chip wms-modal-doc-chip--inv ${isActive ? 'is-active' : ''}">
                <button type="button" class="wms-modal-doc-chip__filter" onclick="toggleModalSpecificDocFilter('${jsToken}')" title="คลิกเพื่อกรองเฉพาะใบกำกับภาษี ${escapeHTML(inv)}">
                    <span class="wms-doc-pill__tag">INV</span>
                    <span class="mono">${escapeHTML(inv)}</span>
                </button>
                <button type="button" class="wms-modal-doc-chip__copy" onclick="copyTextToClipboard('${jsInv}', 'เลขที่ใบกำกับภาษี (INV)')" title="คัดลอกเลข INV">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </div>
        `);
    });

    docSummary.poList.forEach(po => {
        const token = `PO:${po}`;
        const isActive = wmsModalSpecificDocFilter === token;
        const jsToken = token.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const jsPo = po.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        docChipsHtml.push(`
            <div class="wms-modal-doc-chip wms-modal-doc-chip--po ${isActive ? 'is-active' : ''}">
                <button type="button" class="wms-modal-doc-chip__filter" onclick="toggleModalSpecificDocFilter('${jsToken}')" title="คลิกเพื่อกรองเฉพาะใบสั่งซื้อ ${escapeHTML(po)}">
                    <span class="wms-doc-pill__tag">PO</span>
                    <span class="mono">${escapeHTML(po)}</span>
                </button>
                <button type="button" class="wms-modal-doc-chip__copy" onclick="copyTextToClipboard('${jsPo}', 'เลขที่ใบสั่งซื้อ (PO)')" title="คัดลอกเลข PO">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </div>
        `);
    });

    const isAllFilteredSelected = filteredItems.length > 0 && filteredItems.every(it => selectedItemSnSet.has(it.sn));

    modal.innerHTML = `
        <div class="wms-modal-card wms-modal-card--xl" role="dialog" aria-modal="true" aria-labelledby="wmsSerialModalTitle">
            <div class="wms-modal-header">
                <div class="wms-modal-title-wrap">
                    <div class="wms-modal-info-icon"><i class="fa-solid fa-barcode"></i></div>
                    <div>
                        <div class="wms-serial-modal-kicker">
                            <span class="wms-sku-badge mono">${escapeHTML(sku)}</span>
                            <span class="wms-live-pill is-online is-compact"><span class="wms-live-dot"></span> ซิงก์เรียลไทม์</span>
                        </div>
                        <h3 id="wmsSerialModalTitle" class="wms-modal-title">${escapeHTML(name)}</h3>
                        <p class="wms-modal-subtitle">
                            คงเหลือทั้งหมด <strong class="mono">${allModelItems.length.toLocaleString()}</strong> เครื่อง
                            · ชั้นวาง <strong class="mono">${rackCount.toLocaleString()}</strong>
                            · DOCK <strong class="mono">${dockCount.toLocaleString()}</strong>
                            · OFFICE <strong class="mono">${officeCount.toLocaleString()}</strong>
                            · เอกสาร <strong class="mono">${docSummary.invCount} INV / ${docSummary.poCount} PO</strong>
                        </p>
                    </div>
                </div>
                <button type="button" class="wms-modal-close-btn" onclick="closeModelSerialModal()" aria-label="ปิดหน้าต่าง">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            ${docChipsHtml.length > 0 ? `
                <div class="wms-modal-doc-ribbon">
                    <span class="wms-modal-doc-ribbon__label"><i class="fa-solid fa-file-invoice"></i> เลขเอกสาร INV / PO ในรุ่นนี้:</span>
                    <div class="wms-modal-doc-ribbon__list">
                        ${docChipsHtml.join('')}
                        ${wmsModalSpecificDocFilter ? `<button type="button" class="wms-chip-clear-btn" onclick="toggleModalSpecificDocFilter('')"><i class="fa-solid fa-filter-circle-xmark"></i> ล้างตัวกรองเอกสาร</button>` : ''}
                    </div>
                </div>
            ` : ''}

            <div class="wms-modal-toolbar">
                <div class="wms-modal-filter-pills">
                    <button type="button" class="wms-filter-pill ${currentModalQuickFilter === 'ALL' ? 'is-active' : ''}" onclick="setModalQuickFilter('ALL')">
                        ทั้งหมด (${allModelItems.length})
                    </button>
                    <button type="button" class="wms-filter-pill ${currentModalQuickFilter === 'RACK' ? 'is-active' : ''}" onclick="setModalQuickFilter('RACK')">
                        ชั้นวาง (${rackCount})
                    </button>
                    <button type="button" class="wms-filter-pill ${currentModalQuickFilter === 'DOCK' ? 'is-active' : ''}" onclick="setModalQuickFilter('DOCK')">
                        DOCK (${dockCount})
                    </button>
                    <button type="button" class="wms-filter-pill ${currentModalQuickFilter === 'HAS_INV' ? 'is-active' : ''}" onclick="setModalQuickFilter('HAS_INV')">
                        มี INV (${withInvCount})
                    </button>
                    <button type="button" class="wms-filter-pill ${currentModalQuickFilter === 'HAS_PO' ? 'is-active' : ''}" onclick="setModalQuickFilter('HAS_PO')">
                        มี PO (${withPoCount})
                    </button>
                    ${noDocCount > 0 ? `
                        <button type="button" class="wms-filter-pill ${currentModalQuickFilter === 'NO_DOC' ? 'is-active' : ''}" onclick="setModalQuickFilter('NO_DOC')">
                            ยังไม่ระบุ INV/PO (${noDocCount})
                        </button>
                    ` : ''}
                </div>

                <div class="wms-modal-search-row">
                    <div class="wms-modal-search-box">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input type="text" id="wmsModalSerialSearchInput" value="${escapeHTML(wmsModalSearchQuery)}"
                               oninput="handleModalSerialSearchInput(this.value)"
                               placeholder="ค้นหา S/N, เลข INV, เลข PO, พิกัด หรือชื่อผู้รับเข้า...">
                        ${wmsModalSearchQuery ? `<button type="button" class="wms-search-clear-icon" onclick="handleModalSerialSearchInput('')" title="ล้างคำค้นหา"><i class="fa-solid fa-xmark"></i></button>` : ''}
                    </div>

                    <select class="wms-stock-mini-select" onchange="handleModalSortOrderChange(this.value)" title="เรียงลำดับรายการ">
                        <option value="LATEST" ${wmsModalSortOrder === 'LATEST' ? 'selected' : ''}>เรียง: รับเข้าล่าสุด</option>
                        <option value="SN_ASC" ${wmsModalSortOrder === 'SN_ASC' ? 'selected' : ''}>เรียง: S/N (A → Z)</option>
                        <option value="LOC_ASC" ${wmsModalSortOrder === 'LOC_ASC' ? 'selected' : ''}>เรียง: พิกัดจัดเก็บ</option>
                        <option value="INV_ASC" ${wmsModalSortOrder === 'INV_ASC' ? 'selected' : ''}>เรียง: เลขที่ INV</option>
                        <option value="OLDEST" ${wmsModalSortOrder === 'OLDEST' ? 'selected' : ''}>เรียง: รับเข้าเก่าสุด</option>
                    </select>

                    <button type="button" class="wms-btn wms-btn--secondary wms-btn--sm" onclick="copyAllFilteredModalSerials()" title="คัดลอก Serial Number ทั้งหมดที่แสดง">
                        <i class="fa-regular fa-copy"></i> คัดลอก S/N (${filteredItems.length})
                    </button>

                    <button type="button" class="wms-btn wms-btn--secondary wms-btn--sm" onclick="exportModelSerialsToCSV()" title="ส่งออกรายการรุ่นนี้เป็นไฟล์ CSV พร้อม INV/PO">
                        <i class="fa-solid fa-file-csv"></i> CSV
                    </button>
                </div>
            </div>

            ${selectedInModelCount > 0 ? `
                <div class="wms-modal-selection-bar">
                    <span>เลือกแล้วในรุ่นนี้ <strong class="mono">${selectedInModelCount.toLocaleString()}</strong> เครื่อง</span>
                    <div class="wms-modal-selection-bar__btns">
                        <button type="button" class="wms-btn wms-btn--primary wms-btn--xs" onclick="openQuickRelocateModal('BATCH')">
                            <i class="fa-solid fa-dolly"></i> ย้ายพิกัดที่เลือก
                        </button>
                        <button type="button" class="wms-btn wms-btn--danger wms-btn--xs" onclick="triggerDeleteItemAction('BATCH')">
                            <i class="fa-solid fa-trash-can"></i> ลบที่เลือก
                        </button>
                        <button type="button" class="wms-btn wms-btn--secondary wms-btn--xs" onclick="clearModalModelSelections()">
                            ล้างการเลือก
                        </button>
                    </div>
                </div>
            ` : ''}

            <div class="wms-modal-table-scroll">
                <table class="wms-serial-detail-table">
                    <thead>
                        <tr>
                            <th style="width:40px; text-align:center;">
                                <input type="checkbox" ${isAllFilteredSelected ? 'checked' : ''} onchange="toggleSelectAllModalItems(this.checked)" title="เลือกทั้งหมดในรายการนี้">
                            </th>
                            <th style="width:50px; text-align:center;">#</th>
                            <th style="min-width:170px;">Serial Number (S/N)</th>
                            <th style="min-width:145px;">เลขที่ใบกำกับภาษี (INV)</th>
                            <th style="min-width:140px;">เลขที่ใบสั่งซื้อ (PO)</th>
                            <th style="width:85px; text-align:right;">มิเตอร์</th>
                            <th style="width:125px;">พิกัดจัดเก็บ</th>
                            <th style="width:155px;">ผู้รับเข้า / เวลา</th>
                            <th style="width:110px; text-align:center;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody id="wmsModalSerialTableBody">
                        ${buildModalSerialTableRowsHTML(filteredItems)}
                    </tbody>
                </table>
            </div>

            <div class="wms-modal-footer wms-modal-footer--between">
                <div class="wms-modal-footer-note">
                    แสดงผล <strong class="mono">${Math.min(filteredItems.length, wmsModalTableRenderLimit).toLocaleString()}</strong> จาก <strong class="mono">${filteredItems.length.toLocaleString()}</strong> รายการที่ตรงเงื่อนไข
                </div>
                <button type="button" class="wms-btn wms-btn--secondary" onclick="closeModelSerialModal()">
                    ปิดหน้าต่าง
                </button>
            </div>
        </div>
    `;
}

function buildModalSerialTableRowsHTML(filteredItems) {
    if (!Array.isArray(filteredItems) || filteredItems.length === 0) {
        return `
            <tr>
                <td colspan="9" class="wms-table-empty-cell">
                    <div class="wms-empty-state">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <div class="wms-empty-state__title">ไม่พบ Serial Number ที่ตรงกับตัวกรองในรุ่นนี้</div>
                        <div class="wms-empty-state__sub">ลองล้างคำค้นหาหรือเปลี่ยนตัวกรองเอกสาร INV / PO ด้านบน</div>
                    </div>
                </td>
            </tr>
        `;
    }

    const renderLimit = Math.min(filteredItems.length, wmsModalTableRenderLimit);
    const rows = [];

    for (let i = 0; i < renderLimit; i++) {
        const it = filteredItems[i];
        const snStr = String(it.sn || '');
        const jsSafeSn = snStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const isChecked = selectedItemSnSet.has(snStr);

        const invCell = it.inv_no
            ? renderInvPoBadgesHTML(it.inv_no, '', true)
            : `<span class="wms-doc-empty-badge">-</span>`;
        const poCell = it.po_no
            ? renderInvPoBadgesHTML('', it.po_no, true)
            : `<span class="wms-doc-empty-badge">-</span>`;

        const pendingBadge = it._pending
            ? `<span class="wms-sync-pending-tag"><i class="fa-solid fa-cloud-arrow-up"></i> รอซิงก์</span>`
            : '';

        const meterVal = Number(it.meter || 0);

        rows.push(`
            <tr class="wms-stock-row ${isChecked ? 'is-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelectSingleModalItem('${jsSafeSn}', this.checked)">
                </td>
                <td style="text-align:center;" class="mono wms-text-muted">${(i + 1).toLocaleString()}</td>
                <td>
                    <div class="wms-sn-cell">
                        <button type="button" class="wms-sn-copy-btn mono" onclick="copyTextToClipboard('${jsSafeSn}', 'Serial Number')" title="คลิกเพื่อคัดลอก S/N">
                            ${escapeHTML(snStr)}
                        </button>
                        ${pendingBadge}
                    </div>
                </td>
                <td>${invCell}</td>
                <td>${poCell}</td>
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
                        <button type="button" class="wms-icon-btn wms-icon-btn--relocate" onclick="openQuickRelocateModal('SINGLE', '${jsSafeSn}')" title="ย้ายพิกัดเครื่องนี้">
                            <i class="fa-solid fa-dolly"></i>
                        </button>
                        <button type="button" class="wms-icon-btn wms-icon-btn--delete" onclick="triggerDeleteItemAction('SINGLE', '${jsSafeSn}', '${escapeHTML(it.id || '')}')" title="ลบซีเรียลนี้">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `);
    }

    if (filteredItems.length > renderLimit) {
        const remaining = filteredItems.length - renderLimit;
        rows.push(`
            <tr class="wms-load-more-row">
                <td colspan="9" style="text-align:center; padding:12px;">
                    <button type="button" class="wms-load-more-btn" onclick="loadMoreModalSerialRows()">
                        <i class="fa-solid fa-angles-down"></i> แสดงเพิ่มอีก ${Math.min(WMS_TABLE_RENDER_BATCH_SIZE, remaining).toLocaleString()} รายการ (เหลืออีก ${remaining.toLocaleString()} รายการ)
                    </button>
                </td>
            </tr>
        `);
    }

    return rows.join('');
}

function loadMoreModalSerialRows() {
    wmsModalTableRenderLimit += WMS_TABLE_RENDER_BATCH_SIZE;
    renderModelSerialModalBody(currentDetailModalGroupKey);
}

// =========================================================================
// --- MODAL FILTER, SORT, SELECTION & EXPORT HANDLERS ---
// =========================================================================
function setModalQuickFilter(filterKey) {
    currentModalQuickFilter = filterKey || 'ALL';
    wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    renderModelSerialModalBody(currentDetailModalGroupKey);
}

function toggleModalSpecificDocFilter(docToken) {
    if (wmsModalSpecificDocFilter === docToken) {
        wmsModalSpecificDocFilter = '';
    } else {
        wmsModalSpecificDocFilter = docToken || '';
    }
    wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    renderModelSerialModalBody(currentDetailModalGroupKey);
}

function handleModalSerialSearchInput(val) {
    wmsModalSearchQuery = val || '';
    wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    renderModelSerialModalBody(currentDetailModalGroupKey);
    const inp = document.getElementById('wmsModalSerialSearchInput');
    if (inp) {
        inp.focus();
        const len = inp.value.length;
        inp.setSelectionRange(len, len);
    }
}

function handleModalSortOrderChange(sortVal) {
    wmsModalSortOrder = sortVal || 'LATEST';
    renderModelSerialModalBody(currentDetailModalGroupKey);
}

function toggleSelectSingleModalItem(sn, isChecked) {
    if (!sn) return;
    if (isChecked) {
        selectedItemSnSet.add(sn);
    } else {
        selectedItemSnSet.delete(sn);
    }
    renderModelSerialModalBody(currentDetailModalGroupKey);
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
}

function toggleSelectAllModalItems(isChecked) {
    for (let i = 0; i < wmsLastModalFilteredItems.length; i++) {
        const sn = wmsLastModalFilteredItems[i].sn;
        if (!sn) continue;
        if (isChecked) {
            selectedItemSnSet.add(sn);
        } else {
            selectedItemSnSet.delete(sn);
        }
    }
    renderModelSerialModalBody(currentDetailModalGroupKey);
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
}

function clearModalModelSelections() {
    if (!currentDetailModalGroupKey) return;
    const { items } = getItemsForModelGroupKey(currentDetailModalGroupKey);
    items.forEach(it => selectedItemSnSet.delete(it.sn));
    renderModelSerialModalBody(currentDetailModalGroupKey);
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
}

function copyAllFilteredModalSerials() {
    if (!wmsLastModalFilteredItems || wmsLastModalFilteredItems.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่มีรายการ S/N สำหรับคัดลอก');
        return;
    }
    const snText = wmsLastModalFilteredItems.map(it => it.sn).filter(Boolean).join('\n');
    copyTextToClipboard(snText, `รายการ S/N จำนวน ${wmsLastModalFilteredItems.length} เครื่อง`);
}

function exportModelSerialsToCSV() {
    if (!wmsLastModalFilteredItems || wmsLastModalFilteredItems.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่มีรายการในรุ่นนี้สำหรับส่งออก CSV');
        return;
    }

    const { sku, name } = getItemsForModelGroupKey(currentDetailModalGroupKey);
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

    const escapeCsv = (val) => {
        const str = val === null || val === undefined ? '' : String(val);
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const lines = [headers.map(escapeCsv).join(',')];
    for (let i = 0; i < wmsLastModalFilteredItems.length; i++) {
        const it = wmsLastModalFilteredItems[i];
        lines.push([
            i + 1,
            it.category || sku,
            it.name || name,
            it.sn || '',
            it.inv_no || '',
            it.po_no || '',
            it.meter || 0,
            it.location || '',
            it.received_by || '',
            it.created_at || ''
        ].map(escapeCsv).join(','));
    }

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeSku = String(sku || 'MODEL').replace(/[^A-Za-z0-9\-_]/g, '_');
    a.href = url;
    a.download = `WMS_Serials_${safeSku}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') {
        showToast(`📥 ส่งออกรายการซีเรียลรุ่น ${sku} (${wmsLastModalFilteredItems.length} เครื่อง) เรียบร้อยแล้ว`);
    }
}

// รองรับการกดปุ่ม ESC เพื่อปิดหน้าต่าง Modal ได้สะดวก
if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const deleteModal = document.getElementById('wmsUnifiedStockDeleteModal');
            if (deleteModal && deleteModal.style.display === 'flex') {
                if (typeof closeUnifiedBulkDeleteModal === 'function') closeUnifiedBulkDeleteModal();
                return;
            }
            const relocateModal = document.getElementById('wmsQuickRelocateModal');
            if (relocateModal && relocateModal.style.display === 'flex') {
                if (typeof closeQuickRelocateModal === 'function') closeQuickRelocateModal();
                return;
            }
            const serialModal = document.getElementById('modelSerialDetailModal');
            if (serialModal && serialModal.style.display === 'flex') {
                closeModelSerialModal();
            }
        }
    });
}

// Global Exports
window.openModelSerialModal = openModelSerialModal;
window.closeModelSerialModal = closeModelSerialModal;
window.renderModelSerialModalBody = renderModelSerialModalBody;
window.loadMoreModalSerialRows = loadMoreModalSerialRows;
window.setModalQuickFilter = setModalQuickFilter;
window.toggleModalSpecificDocFilter = toggleModalSpecificDocFilter;
window.handleModalSerialSearchInput = handleModalSerialSearchInput;
window.handleModalSortOrderChange = handleModalSortOrderChange;
window.toggleSelectSingleModalItem = toggleSelectSingleModalItem;
window.toggleSelectAllModalItems = toggleSelectAllModalItems;
window.clearModalModelSelections = clearModalModelSelections;
window.copyAllFilteredModalSerials = copyAllFilteredModalSerials;
window.exportModelSerialsToCSV = exportModelSerialsToCSV;
window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.serialModalLoaded = true;