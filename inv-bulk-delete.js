// =========================================================================
// --- MODULE 2D + 2E: HIGH-SCALE CHUNKED BULK DELETE & SMART BATCH RELOCATE ---
// --- FILE: inv-bulk-delete.js (v26.7 MODULAR ARCHITECTURE - FULL) ---
// --- CSS LINKED VIA: inv-stock.css (SECTION 5) ---
// =========================================================================

function printSelectedBarcodesFromModal() {
    const scopedItems = getScopedSelectedItems();
    if (scopedItems.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด', true);
        } else {
            alert('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด');
        }
        return;
    }
    triggerPrintBarcodeAction('MULTI');
}

function printAllGroupBarcodesFromModal() {
    if (!currentDetailModalGroupKey) return;
    triggerPrintBarcodeAction('GROUP', currentDetailModalGroupKey);
}

function printAllFilteredBarcodesFromInventory() {
    if (!currentFilteredItems || currentFilteredItems.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ ไม่พบรายการสินค้าในหน้าเช็คสต็อกสำหรับพิมพ์บาร์โค้ด', true);
        } else {
            alert('⚠️ ไม่พบรายการสินค้าในหน้าเช็คสต็อกสำหรับพิมพ์บาร์โค้ด');
        }
        return;
    }
    triggerPrintBarcodeAction('ALL_FILTERED');
}

function relocateSelectedFromModal() {
    const scopedItems = resolveBatchRelocateTargetItems();
    if (scopedItems.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อย้ายพิกัด', true);
        } else {
            alert('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อย้ายพิกัด');
        }
        return;
    }
    openUnifiedBatchRelocateModal(scopedItems);
}

function relocateSelectedItemsFromInventory() {
    const scopedItems = resolveBatchRelocateTargetItems();
    if (scopedItems.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อย้ายพิกัด', true);
        } else {
            alert('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อย้ายพิกัด');
        }
        return;
    }
    openUnifiedBatchRelocateModal(scopedItems);
}

function deleteSelectedFromModal() {
    const scopedItems = getScopedSelectedItems();
    if (scopedItems.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อลบ', true);
        } else {
            alert('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อลบ');
        }
        return;
    }
    openUnifiedBulkDeleteModal({
        mode: 'BATCH',
        title: `ลบรายการที่เลือก (${scopedItems.length.toLocaleString()} S/N)`,
        items: scopedItems
    });
}

function deleteAllGroupFromModal() {
    if (!currentDetailModalGroupKey) return;
    deleteGroupItemsFromInventory(currentDetailModalGroupKey);
}

function deleteGroupItemsFromInventory(groupKey) {
    const grp = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!grp || !grp.items || grp.items.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบรายการซีเรียลในรุ่นนี้', true);
        return;
    }
    openUnifiedBulkDeleteModal({
        mode: 'GROUP',
        groupKey: groupKey,
        title: `ลบสินค้าทั้งรุ่น: ${grp.category} (${grp.name})`,
        items: grp.items
    });
}

function deleteSelectedItemsFromInventory() {
    const scopedItems = getScopedSelectedItems();
    if (scopedItems.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อลบ', true);
        } else {
            alert('⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อลบ');
        }
        return;
    }
    openUnifiedBulkDeleteModal({
        mode: 'BATCH',
        title: `ลบรายการที่เลือก (${scopedItems.length.toLocaleString()} S/N)`,
        items: scopedItems
    });
}

function deleteAllFilteredItemsFromInventory() {
    if (!currentFilteredItems || currentFilteredItems.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ ไม่พบรายการสินค้าในหน้าเช็คสต็อกสำหรับลบ', true);
        } else {
            alert('⚠️ ไม่พบรายการสินค้าในหน้าเช็คสต็อกสำหรับลบ');
        }
        return;
    }
    openUnifiedBulkDeleteModal({
        mode: 'ALL_FILTERED',
        title: 'ลบรายการทั้งหมดที่กำลังกรองแสดงผลอยู่',
        items: currentFilteredItems
    });
}

function openPasteBulkDeleteModal() {
    openUnifiedBulkDeleteModal({
        mode: 'PASTE',
        title: 'ลบสินค้าแบบวางรายการ S/N จำนวนมาก',
        items: []
    });
}

// =========================================================================
// --- HIGH-SCALE CHUNKED BULK DELETE MODAL & EXECUTION ENGINE ---
// =========================================================================
let wmsPendingBulkDeleteContext = null;

function ensureUnifiedBulkDeleteModalExists() {
    if (typeof initWmsModalStackObserver === 'function') initWmsModalStackObserver();
    let modal = document.getElementById('wmsUnifiedBulkDeleteModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsUnifiedBulkDeleteModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(15,23,42,0.68); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:16px; z-index:100600;';
        modal.addEventListener('click', (e) => {
            if (e.target === modal && !wmsIsBulkDeleting) {
                closeUnifiedBulkDeleteModal();
            }
        });
        modal.innerHTML = `
            <div style="background:var(--bg-surface, #ffffff); color:var(--text-main, #0f172a); width:100%; max-width:620px; border-radius:16px; border:1px solid var(--border-color, #e2e8f0); box-shadow:0 24px 60px rgba(0,0,0,0.28); overflow:hidden; display:flex; flex-direction:column; max-height:90vh;">
                <div style="padding:18px 22px; background:linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-bottom:1px solid #fecaca; display:flex; align-items:center; justify-content:space-between; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:42px; height:42px; border-radius:12px; background:#dc2626; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:1.15rem; flex-shrink:0;">
                            <i class="fa-solid fa-trash-can"></i>
                        </div>
                        <div>
                            <h3 id="wmsBulkDelTitle" style="margin:0; font-size:1.08rem; font-weight:800; color:#991b1b;">ยืนยันการลบรายการออกจากสต็อก</h3>
                            <div id="wmsBulkDelRoleHint" style="font-size:0.8rem; color:#b91c1c; margin-top:2px;">ระบบแบ่งลบทีละ 200 รายการอัตโนมัติ ป้องกันฐานข้อมูลค้างและอัปเดตเรียลไทม์ 100%</div>
                        </div>
                    </div>
                    <button type="button" onclick="closeUnifiedBulkDeleteModal()" style="background:rgba(255,255,255,0.8); border:1px solid #fca5a5; color:#991b1b; width:34px; height:34px; border-radius:8px; cursor:pointer; font-size:1rem;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div style="padding:20px 22px; overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
                    <div id="wmsBulkDelSummaryBox" style="padding:14px 16px; border-radius:12px; background:var(--bg-subtle, #f8fafc); border:1px solid var(--border-color, #e2e8f0); display:flex; flex-direction:column; gap:8px;"></div>

                    <div id="wmsBulkDelPasteSection" style="display:none; flex-direction:column; gap:8px;">
                        <label for="wmsBulkDelPasteTextarea" style="font-size:0.86rem; font-weight:700; color:var(--text-main);">
                            <i class="fa-solid fa-barcode" style="color:#dc2626;"></i> วางรายการ S/N ที่ต้องการลบ (คั่นด้วยการขึ้นบรรทัดใหม่, เว้นวรรค หรือเครื่องหมายจุลภาค):
                        </label>
                        <textarea id="wmsBulkDelPasteTextarea" rows="7" oninput="recalculatePastedBulkDeleteTargets()" placeholder="ตัวอย่าง:\nSN-20260001\nSN-20260002\nSN-20260003\n(วางได้ 6,500 - 50,000+ บรรทัดพร้อมกัน)" style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--border-strong, #cbd5e1); font-family:monospace; font-size:0.86rem; background:var(--bg-surface, #ffffff); color:var(--text-main, #0f172a); resize:vertical;"></textarea>
                        <div id="wmsBulkDelPasteMatchStat" style="font-size:0.82rem; font-weight:600; color:var(--text-sub);"></div>
                    </div>

                    <div id="wmsBulkDelReasonWrap" style="display:flex; flex-direction:column; gap:6px;">
                        <label for="wmsBulkDelReasonInput" style="font-size:0.84rem; font-weight:700; color:var(--text-main);">หมายเหตุ / สาเหตุการลบ (บันทึกประวัติตรวจสอบ):</label>
                        <input type="text" id="wmsBulkDelReasonInput" placeholder="เช่น ตัดสต็อกสินค้าส่งออกล็อตใหญ่ / ล้างข้อมูลทดสอบ / S/N ซ้ำ" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border-strong, #cbd5e1); font-size:0.88rem; background:var(--bg-surface, #ffffff); color:var(--text-main, #0f172a);">
                    </div>

                    <div style="padding:10px 14px; border-radius:10px; background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:0.82rem; line-height:1.5;">
                        <i class="fa-solid fa-shield-halved"></i> <strong>ระบบอัปเดตเรียลไทม์และป้องกันข้อมูลดีดกลับ:</strong> รายการที่ลบจะหายออกจากตารางหน้าเว็บไซต์ แคชในเครื่อง และฐานข้อมูล Supabase ทันทีโดยไม่ต้องกดรีเฟรช
                    </div>
                </div>

                <div style="padding:14px 22px; background:var(--bg-subtle, #f8fafc); border-top:1px solid var(--border-color, #e2e8f0); display:flex; align-items:center; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="closeUnifiedBulkDeleteModal()" style="font-weight:600; padding:8px 16px;">
                        ยกเลิก
                    </button>
                    <button type="button" id="wmsBulkDelConfirmBtn" class="btn btn-danger" onclick="confirmAndRunUnifiedBulkDelete()" style="font-weight:700; padding:8px 20px; box-shadow:0 4px 12px rgba(220,38,38,0.28);">
                        <i class="fa-solid fa-trash-can"></i> ยืนยันการลบถาวร
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
}

function closeUnifiedBulkDeleteModal() {
    if (wmsIsBulkDeleting) return;
    const modal = document.getElementById('wmsUnifiedBulkDeleteModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active', 'show', 'open', 'is-open');
    }
    wmsPendingBulkDeleteContext = null;
    if (typeof syncStockDetailParentState === 'function') syncStockDetailParentState();
}

function recalculatePastedBulkDeleteTargets() {
    const textarea = document.getElementById('wmsBulkDelPasteTextarea');
    const statEl = document.getElementById('wmsBulkDelPasteMatchStat');
    const confirmBtn = document.getElementById('wmsBulkDelConfirmBtn');
    const summaryBox = document.getElementById('wmsBulkDelSummaryBox');
    if (!textarea || !wmsPendingBulkDeleteContext) return;

    const rawTokens = textarea.value
        .split(/[\r\n,;\t\s]+/)
        .map(s => s.trim())
        .filter(Boolean);

    const uniqueInputSnUpper = new Set(rawTokens.map(normalizeSnKey));
    const matchedItems = [];
    const unmatchedSns = [];

    const invMap = new Map();
    for (let i = 0; i < globalInventoryData.length; i++) {
        const item = globalInventoryData[i];
        if (!isSnInTombstone(item.sn)) {
            invMap.set(normalizeSnKey(item.sn), item);
        }
    }

    uniqueInputSnUpper.forEach(snUpper => {
        if (invMap.has(snUpper)) {
            matchedItems.push(invMap.get(snUpper));
        } else {
            unmatchedSns.push(snUpper);
        }
    });

    wmsPendingBulkDeleteContext.items = matchedItems;
    wmsPendingBulkDeleteContext.extraRawSns = unmatchedSns;

    const totalBatches = Math.max(1, Math.ceil(matchedItems.length / 200));
    if (statEl) {
        statEl.innerHTML = `พบในสต็อกปัจจุบัน <strong style="color:#dc2626;">${matchedItems.length.toLocaleString()}</strong> S/N · ไม่พบในสต็อก ${unmatchedSns.length.toLocaleString()} S/N (จะแบ่งลบ ${totalBatches.toLocaleString()} ชุด)`;
    }

    if (summaryBox) {
        summaryBox.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700; color:var(--text-sub);">จำนวน S/N ที่ตรงกับสต็อกในคลัง:</span>
                <span class="mono font-bold" style="font-size:1.15rem; color:#dc2626;">${matchedItems.length.toLocaleString()} รายการ</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.84rem; color:var(--text-muted);">
                <span>จำนวนรอบการส่งคำสั่งลบเข้าฐานข้อมูล (200 S/N ต่อรอบ):</span>
                <span class="mono font-bold">${totalBatches.toLocaleString()} รอบ</span>
            </div>
        `;
    }

    if (confirmBtn) {
        const isAdmin = isCurrentUserAdmin();
        confirmBtn.disabled = matchedItems.length === 0;
        confirmBtn.innerHTML = isAdmin
            ? `<i class="fa-solid fa-trash-can"></i> ยืนยันลบถาวร (${matchedItems.length.toLocaleString()} S/N)`
            : `<i class="fa-solid fa-paper-plane"></i> ส่งคำขออนุมัติลบ (${matchedItems.length.toLocaleString()} S/N)`;
    }
}

function openUnifiedBulkDeleteModal(config) {
    const modal = ensureUnifiedBulkDeleteModalExists();
    const isAdmin = isCurrentUserAdmin();

    let targetItems = [];
    if (config.mode === 'SINGLE') {
        const snTarget = normalizeSnKey(config.sn);
        const found = globalInventoryData.find(i => normalizeSnKey(i.sn) === snTarget || (config.id && String(i.id) === String(config.id)));
        if (found) {
            targetItems = [found];
        } else if (config.sn) {
            targetItems = [{ id: config.id || null, sn: config.sn, category: '-', name: '-', location: '-' }];
        }
    } else if (config.mode === 'BATCH') {
        targetItems = Array.isArray(config.items) ? config.items.filter(i => !isSnInTombstone(i.sn)) : getScopedSelectedItems();
    } else if (config.mode === 'GROUP' || config.mode === 'ALL_FILTERED') {
        targetItems = (config.items || []).filter(i => !isSnInTombstone(i.sn));
    } else if (config.mode === 'PASTE') {
        targetItems = [];
    }

    if (config.mode !== 'PASTE' && targetItems.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบรายการสินค้าที่ต้องการลบ', true);
        return;
    }

    wmsPendingBulkDeleteContext = {
        mode: config.mode,
        title: config.title || 'ยืนยันการลบรายการออกจากสต็อก',
        items: targetItems,
        extraRawSns: []
    };

    const titleEl = document.getElementById('wmsBulkDelTitle');
    const roleHintEl = document.getElementById('wmsBulkDelRoleHint');
    const summaryBox = document.getElementById('wmsBulkDelSummaryBox');
    const pasteSection = document.getElementById('wmsBulkDelPasteSection');
    const pasteTextarea = document.getElementById('wmsBulkDelPasteTextarea');
    const reasonInput = document.getElementById('wmsBulkDelReasonInput');
    const confirmBtn = document.getElementById('wmsBulkDelConfirmBtn');

    if (titleEl) titleEl.textContent = wmsPendingBulkDeleteContext.title;
    if (roleHintEl) {
        roleHintEl.textContent = isAdmin
            ? 'สิทธิ์ผู้ดูแลระบบ (Admin): ลบออกจากฐานข้อมูลและอัปเดตหน้าเว็บทันที'
            : 'สิทธิ์ผู้ใช้งานทั่วไป: ระบบจะส่งคำขออนุมัติการลบไปยังผู้ดูแลระบบ';
    }

    if (reasonInput) reasonInput.value = '';

    if (config.mode === 'PASTE') {
        if (pasteSection) pasteSection.style.display = 'flex';
        if (pasteTextarea) pasteTextarea.value = '';
        recalculatePastedBulkDeleteTargets();
    } else {
        if (pasteSection) pasteSection.style.display = 'none';
        const totalBatches = Math.max(1, Math.ceil(targetItems.length / 200));
        const uniqueSkus = new Set(targetItems.map(i => i.category || 'N/A'));
        const previewSns = targetItems.slice(0, 6).map(i => i.sn).join(', ') + (targetItems.length > 6 ? ` ... (+อีก ${(targetItems.length - 6).toLocaleString()} รายการ)` : '');

        if (summaryBox) {
            summaryBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; color:var(--text-sub);">จำนวนซีเรียลที่จะลบทั้งหมด:</span>
                    <span class="mono font-bold" style="font-size:1.2rem; color:#dc2626;">${targetItems.length.toLocaleString()} S/N</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.84rem; color:var(--text-muted);">
                    <span>จำนวนรุ่นสินค้าที่เกี่ยวข้อง / รอบการลบ DB:</span>
                    <span class="mono font-bold">${uniqueSkus.size.toLocaleString()} รุ่น · ${totalBatches.toLocaleString()} ชุด (200 S/N/ชุด)</span>
                </div>
                <div style="font-size:0.78rem; color:var(--text-sub); background:var(--bg-surface, #ffffff); padding:8px 10px; border-radius:8px; border:1px dashed var(--border-strong, #cbd5e1); font-family:monospace; word-break:break-all;">
                    ตัวอย่าง S/N: ${escapeHTML(previewSns)}
                </div>
            `;
        }

        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = isAdmin
                ? `<i class="fa-solid fa-trash-can"></i> ยืนยันลบถาวร (${targetItems.length.toLocaleString()} S/N)`
                : `<i class="fa-solid fa-paper-plane"></i> ส่งคำขออนุมัติลบ (${targetItems.length.toLocaleString()} S/N)`;
        }
    }

    modal.style.display = 'flex';
    modal.classList.add('active', 'show', 'is-open');
    if (typeof elevateTopModal === 'function' && typeof WMS_ACTION_MODAL_GROUPS !== 'undefined') {
        elevateTopModal(WMS_ACTION_MODAL_GROUPS.delete, 'delete');
    }
}

async function confirmAndRunUnifiedBulkDelete() {
    if (!wmsPendingBulkDeleteContext || wmsIsBulkDeleting) return;
    const itemsToDelete = wmsPendingBulkDeleteContext.items || [];
    if (itemsToDelete.length === 0) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่มีรายการ S/N ที่จะลบ', true);
        return;
    }

    const reasonInput = document.getElementById('wmsBulkDelReasonInput');
    const reasonText = reasonInput ? reasonInput.value.trim() : '';
    const isAdmin = isCurrentUserAdmin();

    const modal = document.getElementById('wmsUnifiedBulkDeleteModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active', 'show', 'open', 'is-open');
    }
    if (typeof syncStockDetailParentState === 'function') syncStockDetailParentState();

    if (!isAdmin) {
        await submitBulkDeleteApprovalRequest(itemsToDelete, reasonText);
        return;
    }

    await executeChunkedWarehouseDelete(itemsToDelete, reasonText);
}

async function submitBulkDeleteApprovalRequest(itemsToDelete, reasonText = '') {
    const client = getSupabaseClient();
    const requesterName = getCurrentReceiverName();
    const totalCount = itemsToDelete.length;

    if (typeof showDbLoadingPopup === 'function') {
        showDbLoadingPopup(
            'กำลังส่งคำขออนุมัติการลบรายการ...',
            `กำลังจัดเตรียมคำขอลบจำนวน ${totalCount.toLocaleString()} S/N ส่งให้ผู้ดูแลระบบ`,
            20,
            { iconClass: 'fa-solid fa-paper-plane wms-db-center-icon', lockClose: true }
        );
    }

    try {
        if (client && navigator.onLine) {
            const CHUNK_SIZE = 200;
            const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);
            for (let c = 0; c < totalChunks; c++) {
                const slice = itemsToDelete.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
                const payload = slice.map(item => ({
                    request_type: 'DELETE',
                    sn: item.sn,
                    category: item.category || '',
                    name: item.name || '',
                    location: item.location || '',
                    requested_by: requesterName,
                    reason: reasonText || 'ขอลบรายการจากหน้าเช็คสต็อก',
                    status: 'PENDING',
                    created_at: new Date().toISOString()
                }));

                await client.from('approval_requests').insert(payload);
                const pct = Math.min(95, Math.round(((c + 1) / totalChunks) * 90));
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        'กำลังส่งคำขออนุมัติการลบรายการ...',
                        `ส่งชุดที่ ${c + 1}/${totalChunks} เรียบร้อยแล้ว`,
                        pct,
                        `ส่งคำขอแล้ว ${Math.min(totalCount, (c + 1) * CHUNK_SIZE).toLocaleString()} / ${totalCount.toLocaleString()} S/N`
                    );
                }
            }
        }

        if (typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'ส่งคำขออนุมัติการลบเรียบร้อยแล้ว!',
                `รายการจำนวน ${totalCount.toLocaleString()} S/N ถูกส่งไปยังส่วนอนุมัติคำขอของ Admin แล้ว`,
                100,
                'รอผู้ดูแลระบบอนุมัติ',
                'success'
            );
            setTimeout(() => {
                if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
            }, 1200);
        }
        if (typeof showToast === 'function') {
            showToast(`📩 ส่งคำขออนุมัติลบ ${totalCount.toLocaleString()} S/N ให้ผู้ดูแลระบบเรียบร้อยแล้ว`);
        }
    } catch (err) {
        if (typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'เกิดข้อผิดพลาดในการส่งคำขออนุมัติ',
                'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
                100,
                'ส่งคำขอไม่สำเร็จ',
                'error'
            );
            setTimeout(() => {
                if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
            }, 1500);
        }
    }
}

async function executeChunkedWarehouseDelete(itemsToDelete, reasonText = '') {
    if (wmsIsBulkDeleting) return;
    wmsIsBulkDeleting = true;

    const totalCount = itemsToDelete.length;
    const snList = itemsToDelete.map(i => i.sn).filter(Boolean);
    const targetSnSetUpper = new Set(snList.map(normalizeSnKey));

    registerDeletedSnTombstones(snList);
    purgeDeletedItemsFromAllLocalStores(targetSnSetUpper);
    rebuildOccupiedSet();
    if (typeof filterInventoryData === 'function') filterInventoryData(true);
    updateKPIs();

    const CHUNK_SIZE = 200;
    const totalChunks = Math.ceil(itemsToDelete.length / CHUNK_SIZE);
    let processedCount = 0;
    let failedChunks = 0;

    if (typeof showDbLoadingPopup === 'function') {
        showDbLoadingPopup(
            `กำลังลบข้อมูลออกจากฐานข้อมูล (${totalCount.toLocaleString()} S/N)...`,
            `แบ่งลบอัตโนมัติทั้งหมด ${totalChunks.toLocaleString()} ชุด ชุดละ ${CHUNK_SIZE} รายการ กรุณาอย่าปิดหน้าต่างนี้`,
            5,
            {
                iconClass: 'fa-solid fa-trash-can wms-db-center-icon',
                badgeHtml: `<span class="wms-db-dot" style="background:#ef4444;"></span> กำลังลบข้อมูลชุดใหญ่แบบแบ่งล็อต`,
                counterText: `0 / ${totalCount.toLocaleString()} รายการ`,
                lockClose: true
            }
        );
    }

    const client = getSupabaseClient();

    try {
        if (client && navigator.onLine) {
            for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
                const start = chunkIdx * CHUNK_SIZE;
                const chunkItems = itemsToDelete.slice(start, start + CHUNK_SIZE);

                const chunkIds = chunkItems
                    .map(i => i.id)
                    .filter(id => id !== null && id !== undefined && id !== '' && !String(id).startsWith('offline_') && !String(id).startsWith('temp_'));

                const chunkSns = chunkItems
                    .map(i => i.sn)
                    .filter(sn => sn !== null && sn !== undefined && String(sn).trim() !== '');

                let chunkSuccess = false;
                let attempt = 0;

                while (!chunkSuccess && attempt < 3) {
                    attempt++;
                    try {
                        if (chunkIds.length > 0) {
                            const { error: idErr } = await client
                                .from('warehouse_items')
                                .delete()
                                .in('id', chunkIds);
                            if (idErr) throw idErr;
                        }

                        if (chunkSns.length > 0) {
                            const { error: snErr } = await client
                                .from('warehouse_items')
                                .delete()
                                .in('sn', chunkSns);
                            if (snErr) throw snErr;
                        }

                        chunkSuccess = true;
                    } catch (chunkErr) {
                        if (attempt < 3) {
                            await new Promise(res => setTimeout(res, 350 * attempt));
                        } else {
                            const subSize = 25;
                            let subAllOk = true;
                            for (let s = 0; s < chunkSns.length; s += subSize) {
                                const subSns = chunkSns.slice(s, s + subSize);
                                const { error: subErr } = await client
                                    .from('warehouse_items')
                                    .delete()
                                    .in('sn', subSns);
                                if (subErr) subAllOk = false;
                            }
                            if (subAllOk) chunkSuccess = true;
                            else failedChunks++;
                        }
                    }
                }

                processedCount += chunkItems.length;
                const percent = Math.min(96, Math.round((processedCount / totalCount) * 95));
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        `กำลังลบข้อมูลออกจากฐานข้อมูล (${totalCount.toLocaleString()} S/N)...`,
                        `ประมวลผลชุดที่ ${(chunkIdx + 1).toLocaleString()} จาก ${totalChunks.toLocaleString()} ชุด`,
                        percent,
                        `ลบแล้ว ${processedCount.toLocaleString()} / ${totalCount.toLocaleString()} รายการ`
                    );
                }

                await new Promise(res => setTimeout(res, 20));
            }

            try {
                const actor = getCurrentReceiverName();
                await client.from('inventory_logs').insert([{
                    action: 'BULK_DELETE',
                    details: `ลบสินค้าออกจากคลังจำนวน ${totalCount.toLocaleString()} S/N${reasonText ? ` (${reasonText})` : ''}`,
                    performed_by: actor,
                    created_at: new Date().toISOString()
                }]);
            } catch (logIgnore) {}
        }

        registerDeletedSnTombstones(snList);
        purgeDeletedItemsFromAllLocalStores(targetSnSetUpper);
        try {
            localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(globalInventoryData));
        } catch (e) {}

        wmsIsBulkDeleting = false;
        wmsPendingBulkDeleteContext = null;

        rebuildOccupiedSet();
        if (typeof filterInventoryData === 'function') filterInventoryData(true);
        updateKPIs();

        window.dispatchEvent(new CustomEvent('wms_inventory_updated', {
            detail: { count: globalInventoryData.length, deletedCount: totalCount }
        }));

        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        if (typeof loadRecentInboundFeedFromDB === 'function') await loadRecentInboundFeedFromDB();

        if (failedChunks === 0) {
            if (typeof updateDbLoadingPopup === 'function') {
                updateDbLoadingPopup(
                    `ลบข้อมูลสำเร็จครบทั้ง ${totalCount.toLocaleString()} รายการ!`,
                    'ลบออกจากฐานข้อมูลและอัปเดตหน้าเช็คสต็อกเรียบร้อยแล้ว (ไม่ดีดกลับ 100%)',
                    100,
                    `เสร็จสมบูรณ์ ${totalCount.toLocaleString()} / ${totalCount.toLocaleString()} S/N`,
                    'success'
                );
                setTimeout(() => {
                    if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
                }, 900);
            }
            if (typeof showToast === 'function') {
                showToast(`🗑️ ลบข้อมูลออกจากคลังสำเร็จ ${totalCount.toLocaleString()} รายการเรียบร้อยแล้ว`);
            }
        } else {
            if (typeof updateDbLoadingPopup === 'function') {
                updateDbLoadingPopup(
                    'ลบข้อมูลเกือบครบทั้งหมด (มีบางชุดเชื่อมต่อขัดข้อง)',
                    `ลบสำเร็จ ${(totalCount - (failedChunks * CHUNK_SIZE)).toLocaleString()} รายการ กรุณากดรีเฟรชเพื่อตรวจสอบอีกครั้ง`,
                    100,
                    `เสร็จสิ้นพร้อมแจ้งเตือน (${failedChunks} ชุดไม่สมบูรณ์)`,
                    'error'
                );
                setTimeout(() => {
                    if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
                }, 1800);
            }
        }
    } catch (err) {
        wmsIsBulkDeleting = false;
        wmsPendingBulkDeleteContext = null;
        if (typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'เกิดข้อผิดพลาดระหว่างการลบข้อมูล',
                'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
                100,
                'การลบหยุดชะงัก',
                'error'
            );
            setTimeout(() => {
                if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
            }, 1600);
        }
    }
}

// =========================================================================
// --- SMART BATCH RELOCATE ENGINE (DB AISLE_CONFIGS + ORDERED POPOVER) ---
// =========================================================================
const WMS_USER_RELOCATE_PRESETS_KEY = 'WMS_USER_CUSTOM_RELOCATE_PRESETS_V1';

let wmsBatchRelocateState = {
    items: [],
    mode: 'CONTINUOUS', // 'CONTINUOUS' | 'QUOTA'
    row: '',
    formatTemplate: 'STANDARD_DASH',
    userOverrodeFormat: false,
    startLevel: 1,
    endLevel: 1,
    startLock: 1,
    endLock: 1,
    startSlot: 1,
    endSlot: 10,
    lockQuotas: {},
    statusFilter: 'ALL',
    showAllPreviewRows: false,
    slotPreviewList: [],
    assignments: [],
    unassignedCount: 0,
    isExecuting: false,
    rowSchemas: {},
    orderedRowList: [],
    lastAppliedRowKey: '',
    rowPickerZoneFilter: 'ALL' // 'ALL' | 'main' | 'auxiliary'
};

function loadUserCustomRelocatePresets() {
    try {
        const raw = localStorage.getItem(WMS_USER_RELOCATE_PRESETS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveUserCustomRelocatePresets(list) {
    try {
        localStorage.setItem(WMS_USER_RELOCATE_PRESETS_KEY, JSON.stringify(list || []));
    } catch (e) {}
}

function renderUserCustomRelocatePresets() {
    const container = document.getElementById('wmsBrUserPresetsRow');
    if (!container) return;

    const presets = loadUserCustomRelocatePresets();
    if (presets.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = presets.map((p, idx) => `
        <span class="wms-br-user-preset-chip">
            <button type="button" class="chip-apply" onclick="applyUserCustomRelocatePreset(${idx})" title="คลิกเพื่อใช้ค่าพิกัดนี้">
                <i class="fa-solid fa-bookmark"></i> ${escapeHTML(p.label)}
            </button>
            <button type="button" class="chip-del" onclick="deleteUserCustomRelocatePreset(${idx})" title="ลบพิกัดด่วนนี้">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </span>
    `).join('');
}

function saveCurrentConfigAsUserPreset() {
    const row = getEffectiveBatchRelocateRow();
    if (!row) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณากำหนดชื่อแถวก่อนบันทึกเป็นพิกัดด่วน', true);
        }
        const customInput = document.getElementById('wmsBrCustomRowInput');
        if (customInput) customInput.focus();
        return;
    }

    const startLevel = Math.max(1, parseInt(document.getElementById('wmsBrStartLevel')?.value || '1', 10));
    const endLevel = Math.max(startLevel, parseInt(document.getElementById('wmsBrEndLevel')?.value || String(startLevel), 10));
    const startLock = Math.max(1, parseInt(document.getElementById('wmsBrStartLock')?.value || '1', 10));
    const endLock = Math.max(startLock, parseInt(document.getElementById('wmsBrEndLock')?.value || String(startLock), 10));
    const startSlot = Math.max(1, parseInt(document.getElementById('wmsBrStartSlot')?.value || '1', 10));
    const endSlot = Math.max(startSlot, parseInt(document.getElementById('wmsBrEndSlot')?.value || '10', 10));
    const formatTemplate = document.getElementById('wmsBrFormatSelect')?.value || 'STANDARD_DASH';

    const label = `${row} (ชั้น ${startLevel}-${endLevel}, ล็อก ${startLock}-${endLock}, ช่อง ${startSlot}-${endSlot})`;
    const presets = loadUserCustomRelocatePresets();
    presets.push({
        label,
        row,
        formatTemplate,
        mode: wmsBatchRelocateState.mode,
        startLevel,
        endLevel,
        startLock,
        endLock,
        startSlot,
        endSlot
    });
    saveUserCustomRelocatePresets(presets);
    renderUserCustomRelocatePresets();

    if (typeof showToast === 'function') {
        showToast(`📌 บันทึก "${label}" เรียบร้อยแล้ว`);
    }
}

function applyUserCustomRelocatePreset(index) {
    const presets = loadUserCustomRelocatePresets();
    const p = presets[index];
    if (!p) return;

    const customInput = document.getElementById('wmsBrCustomRowInput');
    const formatSelect = document.getElementById('wmsBrFormatSelect');
    if (customInput) customInput.value = p.row || '';
    if (formatSelect && p.formatTemplate) {
        formatSelect.value = p.formatTemplate;
        wmsBatchRelocateState.userOverrodeFormat = true;
    }

    wmsBatchRelocateState.lastAppliedRowKey = String(p.row || '').trim().toUpperCase();
    applyRowSchemaToFilterControls(p.row || '', false);

    const startLvl = document.getElementById('wmsBrStartLevel');
    const endLvl = document.getElementById('wmsBrEndLevel');
    const startLock = document.getElementById('wmsBrStartLock');
    const endLock = document.getElementById('wmsBrEndLock');
    const startSlot = document.getElementById('wmsBrStartSlot');
    const endSlot = document.getElementById('wmsBrEndSlot');

    if (startLvl && p.startLevel) startLvl.value = String(p.startLevel);
    if (endLvl && p.endLevel) endLvl.value = String(p.endLevel);
    if (startLock && p.startLock) startLock.value = String(p.startLock);
    if (endLock && p.endLock) endLock.value = String(p.endLock);
    if (startSlot && p.startSlot) startSlot.value = String(p.startSlot);
    if (endSlot && p.endSlot) endSlot.value = String(p.endSlot);

    switchBatchRelocateMode(p.mode || 'CONTINUOUS', true);
    recalculateBatchRelocatePlan();
}

function deleteUserCustomRelocatePreset(index) {
    const presets = loadUserCustomRelocatePresets();
    if (index < 0 || index >= presets.length) return;
    presets.splice(index, 1);
    saveUserCustomRelocatePresets(presets);
    renderUserCustomRelocatePresets();
    if (typeof showToast === 'function') {
        showToast('🗑️ ลบพิกัดด่วนที่เลือกเรียบร้อยแล้ว');
    }
}

function resolveBatchRelocateTargetItems(explicitItems = null) {
    if (Array.isArray(explicitItems) && explicitItems.length > 0) {
        return explicitItems.filter(i => i && (typeof isSnInTombstone !== 'function' || !isSnInTombstone(i.sn)));
    }

    if (typeof getScopedSelectedItems === 'function') {
        const scoped = getScopedSelectedItems();
        if (Array.isArray(scoped) && scoped.length > 0) {
            return scoped.filter(i => i && (typeof isSnInTombstone !== 'function' || !isSnInTombstone(i.sn)));
        }
    }

    const invList = Array.isArray(globalInventoryData) ? globalInventoryData : [];
    const invBySn = new Map();
    for (let i = 0; i < invList.length; i++) {
        const item = invList[i];
        if (!item || (typeof isSnInTombstone === 'function' && isSnInTombstone(item.sn))) continue;
        const key = typeof normalizeSnKey === 'function'
            ? normalizeSnKey(item.sn)
            : String(item.sn || '').trim().toUpperCase();
        invBySn.set(key, item);
    }

    const candidateSnSet = new Set();
    const possibleSets = [
        window.selectedInventorySns,
        window.selectedSerialNumbers,
        window.selectedSns,
        window.wmsSelectedSns,
        window.checkedSerialSet
    ];
    possibleSets.forEach(s => {
        if (s instanceof Set) {
            s.forEach(v => candidateSnSet.add(String(v).trim().toUpperCase()));
        } else if (Array.isArray(s)) {
            s.forEach(v => candidateSnSet.add(String(v).trim().toUpperCase()));
        }
    });

    if (candidateSnSet.size === 0) {
        const checkedInputs = document.querySelectorAll('input[type="checkbox"]:checked');
        checkedInputs.forEach(cb => {
            const rawSn = cb.getAttribute('data-sn') || cb.dataset?.sn || cb.value;
            if (rawSn && rawSn !== 'on' && rawSn !== 'all' && invBySn.has(String(rawSn).trim().toUpperCase())) {
                candidateSnSet.add(String(rawSn).trim().toUpperCase());
            }
        });
    }

    const resolved = [];
    candidateSnSet.forEach(snUpper => {
        if (invBySn.has(snUpper)) {
            resolved.push(invBySn.get(snUpper));
        }
    });
    return resolved;
}

function normalizeBatchCoordKey(raw) {
    if (!raw) return '';
    return String(raw)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/([A-Zก-๙]+)0+(\d+)/g, '$1$2');
}

function formatUsesLocks(formatTemplate) {
    return formatTemplate !== 'NO_LOCK_DASH' && formatTemplate !== 'THAI_NO_LOCK';
}

function formatBatchSlotCoordinate({ row, lock, level, slot, formatTemplate, includeLock }) {
    const cleanRow = String(row || '').trim();
    const lockNum = Math.max(1, parseInt(lock, 10) || 1);
    const levelNum = Math.max(1, parseInt(level, 10) || 1);
    const slotNum = Math.max(1, parseInt(slot, 10) || 1);
    const slotPadded = String(slotNum).padStart(2, '0');
    const useLock = typeof includeLock === 'boolean' ? includeLock : formatUsesLocks(formatTemplate);

    if (formatTemplate === 'THAI_FULL') {
        if (useLock) {
            return `${cleanRow}-ล็อก${lockNum}-ชั้น${levelNum}-ช่อง${slotPadded}`;
        }
        return `${cleanRow}-ชั้น${levelNum}-ช่อง${slotPadded}`;
    }

    if (formatTemplate === 'THAI_NO_LOCK') {
        return `${cleanRow}-ชั้น${levelNum}-ช่อง${slotPadded}`;
    }

    if (formatTemplate === 'NO_LOCK_DASH' || !useLock) {
        return `${cleanRow}-F${levelNum}-S${slotPadded}`;
    }

    return `${cleanRow}-L${lockNum}-F${levelNum}-S${slotPadded}`;
}

// =========================================================================
// --- DATABASE & SETTINGS-DB.JS AISLE CONFIG RESOLVER (EXACT ORDER 100%) ---
// =========================================================================
function buildWarehouseRowSchemaRegistry() {
    const schemaByRowUpper = {};
    const orderedRows = [];

    const registerOrderedSchema = (schemaObj) => {
        if (!schemaObj || !schemaObj.row) return;
        const upper = schemaObj.row.toUpperCase();
        if (!schemaByRowUpper[upper]) {
            schemaByRowUpper[upper] = schemaObj;
            orderedRows.push(schemaObj);
        } else {
            const existing = schemaByRowUpper[upper];
            // คงลำดับเดิมไว้ แต่อัปเดตค่าจาก settings-db เป็นหลัก
            if (schemaObj.source === 'SETTINGS_DB') {
                Object.assign(existing, schemaObj);
            }
        }
    };

    // 1. ดึงจากตั้งค่าพิกัดคลังสินค้าโดยตรง (window.masterAisles + window.aisleConfigs ใน settings-db.js)
    // โครงสร้างใน settings-db.js: bays = ล็อก, shelves = ชั้น, slots = ช่อง
    let masterAislesList = Array.isArray(window.masterAisles) ? window.masterAisles.slice() : [];
    let aisleConfigsMap = (window.aisleConfigs && typeof window.aisleConfigs === 'object') ? { ...window.aisleConfigs } : {};

    // สำรองอ่านจาก localStorage ('WMS_AISLE_CONFIGS') ทันทีเผื่อเปิดหน้าเช็คสต็อกก่อนเข้าหน้าตั้งค่า
    if (masterAislesList.length === 0) {
        try {
            const rawLocal = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (rawLocal) {
                let parsed = JSON.parse(rawLocal);
                if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                if (parsed && Array.isArray(parsed.aisles)) {
                    masterAislesList = parsed.aisles;
                    aisleConfigsMap = parsed.configs || {};
                    window.masterAisles = masterAislesList;
                    window.aisleConfigs = aisleConfigsMap;
                }
            }
        } catch (e) {}
    }

    masterAislesList.forEach((rawAisle, orderIdx) => {
        const aisleName = String(rawAisle || '').trim();
        if (!aisleName) return;

        const cfg = aisleConfigsMap[aisleName] || aisleConfigsMap[aisleName.toUpperCase()] || {};
        // ใน settings-db.js: bays = ล็อก, shelves = ชั้น, slots = ช่อง
        const rawBays = parseInt(cfg.bays ?? cfg.locks ?? '1', 10);
        const rawShelves = parseInt(cfg.shelves ?? cfg.levels ?? cfg.floors ?? '1', 10);
        const rawSlots = parseInt(cfg.slots ?? cfg.max_slot ?? '10', 10);

        const numLocks = Math.max(0, isNaN(rawBays) ? 1 : rawBays);
        const numLevels = Math.max(1, isNaN(rawShelves) ? 1 : rawShelves);
        const maxSlot = Math.max(1, isNaN(rawSlots) ? 10 : rawSlots);

        const levelsArr = Array.from({ length: numLevels }, (_, i) => i + 1);
        const locksArr = numLocks > 0 ? Array.from({ length: numLocks }, (_, i) => i + 1) : [];

        const zoneTypeRaw = String(cfg.zone_type || cfg.zoneType || '').toLowerCase();
        const zoneType = (zoneTypeRaw === 'main' || zoneTypeRaw === 'auxiliary')
            ? zoneTypeRaw
            : ((/^[A-D]$/i.test(aisleName) || cfg.is_locked) ? 'main' : 'auxiliary');

        const formatTemplate = numLocks > 0 ? 'STANDARD_DASH' : 'NO_LOCK_DASH';

        registerOrderedSchema({
            row: aisleName,
            rowUpper: aisleName.toUpperCase(),
            orderIndex: orderIdx,
            source: 'SETTINGS_DB',
            zoneType,
            isLocked: Boolean(cfg.is_locked),
            levels: levelsArr,
            locks: locksArr,
            maxSlot,
            perLockMaxSlots: {},
            hasLocks: numLocks > 0,
            formatTemplate
        });
    });

    // 2. วิเคราะห์พิกัดที่มีอยู่จริงในสต็อก (globalInventoryData) เผื่อมีแถวพิเศษที่ไม่ได้อยู่ใน masterAisles หรือตรวจจับรูปแบบรหัส
    const invRowStats = {};
    const invList = Array.isArray(globalInventoryData) ? globalInventoryData : [];
    for (let i = 0; i < invList.length; i++) {
        const item = invList[i];
        if (!item || (typeof isSnInTombstone === 'function' && isSnInTombstone(item.sn))) continue;
        const loc = String(item.location || '').trim();
        if (!loc || loc === '-' || loc === 'รอจัดเก็บ') continue;

        const parts = loc.split('-');
        const rowName = parts[0].trim();
        if (!rowName || rowName.length > 30) continue;
        const rowUpper = rowName.toUpperCase();

        if (!invRowStats[rowUpper]) {
            invRowStats[rowUpper] = {
                row: rowName,
                rowUpper,
                levelsSet: new Set(),
                locksSet: new Set(),
                maxSlot: 0,
                perLockMaxSlots: {},
                hasThai: false,
                hasLockToken: false,
                hasNoLockToken: false
            };
        }

        const st = invRowStats[rowUpper];
        if (loc.includes('ชั้น') || loc.includes('ช่อง')) st.hasThai = true;

        const lockMatch = loc.match(/(?:^|-)(?:L|ล็อก)\s*(\d+)(?=-|$)/i);
        const levelMatch = loc.match(/(?:^|-)(?:F|ชั้น)\s*(\d+)(?=-|$)/i);
        const slotMatch = loc.match(/(?:^|-)(?:S|ช่อง)\s*(\d+)(?=-|$)/i);

        let lckNum = null;
        if (lockMatch) {
            lckNum = parseInt(lockMatch[1], 10);
            if (lckNum > 0) {
                st.locksSet.add(lckNum);
                st.hasLockToken = true;
            }
        } else if (levelMatch) {
            st.hasNoLockToken = true;
        }

        if (levelMatch) {
            const lvlNum = parseInt(levelMatch[1], 10);
            if (lvlNum > 0) st.levelsSet.add(lvlNum);
        }

        if (slotMatch) {
            const sltNum = parseInt(slotMatch[1], 10);
            if (sltNum > 0) {
                st.maxSlot = Math.max(st.maxSlot, sltNum);
                if (lckNum && lckNum > 0) {
                    st.perLockMaxSlots[lckNum] = Math.max(st.perLockMaxSlots[lckNum] || 0, sltNum);
                }
            }
        }
    }

    Object.values(invRowStats).forEach(st => {
        let detectedFmt = 'STANDARD_DASH';
        if (st.hasThai) {
            detectedFmt = st.hasLockToken ? 'THAI_FULL' : 'THAI_NO_LOCK';
        } else if (st.hasNoLockToken && !st.hasLockToken) {
            detectedFmt = 'NO_LOCK_DASH';
        }

        const existing = schemaByRowUpper[st.rowUpper];
        if (existing) {
            // รักษาจำนวนชั้น ล็อก และช่องตามที่ผู้ใช้ตั้งค่าไว้ใน settings-db.js 100%
            // ปรับเฉพาะรูปแบบรหัสให้ตรงกับของจริงในคลัง (เช่น ภาษาไทย หรือไม่มีล็อก)
            if (st.hasThai) {
                existing.formatTemplate = st.hasLockToken ? 'THAI_FULL' : 'THAI_NO_LOCK';
            } else if (st.hasNoLockToken && !st.hasLockToken && existing.locks.length <= 1) {
                existing.formatTemplate = 'NO_LOCK_DASH';
                existing.hasLocks = false;
            }
        } else {
            const invLevels = st.levelsSet.size > 0
                ? Array.from(st.levelsSet).sort((a, b) => a - b)
                : [1];
            const invLocks = st.locksSet.size > 0
                ? Array.from(st.locksSet).sort((a, b) => a - b)
                : (st.hasLockToken ? [1] : []);
            const invMaxSlot = st.maxSlot > 0 ? st.maxSlot : 10;

            registerOrderedSchema({
                row: st.row,
                rowUpper: st.rowUpper,
                orderIndex: orderedRows.length,
                source: 'INVENTORY_DATA',
                zoneType: 'auxiliary',
                isLocked: false,
                levels: invLevels,
                locks: invLocks,
                maxSlot: invMaxSlot,
                perLockMaxSlots: st.perLockMaxSlots,
                hasLocks: invLocks.length > 0 && formatUsesLocks(detectedFmt),
                formatTemplate: detectedFmt
            });
        }
    });

    wmsBatchRelocateState.rowSchemas = schemaByRowUpper;
    wmsBatchRelocateState.orderedRowList = orderedRows;
    return schemaByRowUpper;
}

async function syncWarehouseRowSchemasFromDB() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!client || !navigator.onLine) return;

    try {
        // ดึงข้อมูลจากตาราง system_settings ที่ key = 'aisle_configs' เหมือน settings-db.js ทุกประการ
        const { data: aisleData, error: aisleErr } = await client
            .from('system_settings')
            .select('*')
            .eq('key', 'aisle_configs')
            .maybeSingle();

        if (!aisleErr && aisleData && aisleData.value) {
            let val = aisleData.value;
            if (typeof val === 'string') {
                try { val = JSON.parse(val); } catch (e) {}
            }
            if (val && typeof val === 'object') {
                if (Array.isArray(val.aisles) && val.aisles.length > 0) {
                    window.masterAisles = val.aisles;
                    window.aisleConfigs = val.configs || {};
                    try {
                        localStorage.setItem('WMS_AISLE_CONFIGS', JSON.stringify(val));
                    } catch (e) {}
                }
            }
        }
    } catch (ignore) {}

    buildWarehouseRowSchemaRegistry();
    renderBatchRelocateRowPickerPopover();

    const currentRow = getEffectiveBatchRelocateRow();
    if (currentRow) {
        applyRowSchemaToFilterControls(currentRow, true);
        recalculateBatchRelocatePlan();
    }
}

function getSchemaForRow(rowInput) {
    const clean = String(rowInput || '').trim();
    if (!clean) return null;
    const schemas = wmsBatchRelocateState.rowSchemas || {};
    return schemas[clean.toUpperCase()] || null;
}

// =========================================================================
// --- ORDERED ROW PICKER POPOVER (NO MESSY BROWSER DATALIST) ---
// =========================================================================
function toggleBatchRelocateRowPicker(forceState = null) {
    const popover = document.getElementById('wmsBrRowPickerPopover');
    if (!popover) return;

    const isCurrentlyOpen = popover.classList.contains('is-open');
    const nextOpen = typeof forceState === 'boolean' ? forceState : !isCurrentlyOpen;

    if (nextOpen) {
        buildWarehouseRowSchemaRegistry();
        renderBatchRelocateRowPickerPopover();
        popover.classList.add('is-open');
    } else {
        popover.classList.remove('is-open');
    }
}

function setBatchRelocateRowPickerZoneFilter(zoneFilter, btnEl) {
    wmsBatchRelocateState.rowPickerZoneFilter = zoneFilter;
    const tabs = document.querySelectorAll('#wmsBrRowPickerPopover .wms-br-rp-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderBatchRelocateRowPickerPopover();
}

function selectBatchRelocateRowFromPicker(rowName) {
    const customInput = document.getElementById('wmsBrCustomRowInput');
    if (customInput) {
        customInput.value = rowName;
    }
    toggleBatchRelocateRowPicker(false);
    wmsBatchRelocateState.lastAppliedRowKey = String(rowName || '').trim().toUpperCase();
    wmsBatchRelocateState.userOverrodeFormat = false;
    applyRowSchemaToFilterControls(rowName, false);
    recalculateBatchRelocatePlan();
}

function renderBatchRelocateRowPickerPopover() {
    const listContainer = document.getElementById('wmsBrRowPickerList');
    const countLabel = document.getElementById('wmsBrRowPickerCount');
    if (!listContainer) return;

    const orderedList = Array.isArray(wmsBatchRelocateState.orderedRowList)
        ? wmsBatchRelocateState.orderedRowList
        : [];
    const zoneFilter = wmsBatchRelocateState.rowPickerZoneFilter || 'ALL';
    const currentInput = getEffectiveBatchRelocateRow().toUpperCase();

    // คำนวณจำนวนสินค้าที่วางอยู่ในแต่ละแถวปัจจุบันเพื่อให้เห็นช่องว่างคงเหลือ
    const occupiedPerRow = {};
    const invList = Array.isArray(globalInventoryData) ? globalInventoryData : [];
    for (let i = 0; i < invList.length; i++) {
        const item = invList[i];
        if (!item || (typeof isSnInTombstone === 'function' && isSnInTombstone(item.sn))) continue;
        const loc = String(item.location || '').trim();
        if (!loc || loc === '-' || loc === 'รอจัดเก็บ') continue;
        const rKey = loc.split('-')[0].trim().toUpperCase();
        occupiedPerRow[rKey] = (occupiedPerRow[rKey] || 0) + 1;
    }

    let filtered = orderedList.slice();
    if (zoneFilter === 'main') {
        filtered = filtered.filter(sc => sc.zoneType === 'main');
    } else if (zoneFilter === 'auxiliary') {
        filtered = filtered.filter(sc => sc.zoneType !== 'main');
    }

    if (countLabel) {
        countLabel.textContent = `เรียงตามลำดับโครงสร้างคลัง (${filtered.length} แถว)`;
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="wms-br-rp-empty">
                <i class="fa-solid fa-folder-open"></i> ไม่พบแถวจัดเก็บในหมวดหมู่นี้ (สามารถพิมพ์ชื่อแถวใหม่ในช่องด้านบนได้ทันที)
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map((sc) => {
        const seqNum = (sc.orderIndex ?? 0) + 1;
        const isSelected = currentInput && sc.rowUpper === currentInput;
        const totalLocks = sc.hasLocks && sc.locks.length > 0 ? sc.locks.length : 1;
        const totalLevels = sc.levels.length;
        const slotsPerLock = sc.maxSlot;
        const totalCapacity = totalLocks * totalLevels * slotsPerLock;
        const usedCount = occupiedPerRow[sc.rowUpper] || 0;
        const freeEst = Math.max(0, totalCapacity - usedCount);

        const zoneBadgeHtml = sc.zoneType === 'main'
            ? `<span class="wms-br-rp-zone main">โครงสร้างหลัก</span>`
            : `<span class="wms-br-rp-zone aux">เพิ่มเติม</span>`;

        const lockSpec = sc.hasLocks && sc.locks.length > 0
            ? `${sc.locks.length} ล็อก`
            : 'ไม่มีล็อก';
        const levelSpec = sc.levels.length === 1
            ? '1 ชั้น'
            : `${sc.levels.length} ชั้น`;
        const slotSpec = `${sc.maxSlot} ช่อง/ล็อก`;

        return `
            <button type="button" class="wms-br-rp-item ${isSelected ? 'is-selected' : ''}" onclick="selectBatchRelocateRowFromPicker('${escapeHTML(sc.row)}')">
                <div class="rp-item-left">
                    <span class="rp-seq">#${seqNum}</span>
                    <span class="rp-code mono">${escapeHTML(sc.row)}</span>
                    ${zoneBadgeHtml}
                    ${sc.isLocked ? '<i class="fa-solid fa-lock rp-lock-icon" title="โครงสร้างหลักถูกล็อก"></i>' : ''}
                </div>
                <div class="rp-item-right">
                    <span class="rp-spec">${lockSpec} · ${levelSpec} · ${slotSpec}</span>
                    <span class="rp-cap ${freeEst > 0 ? 'has-space' : 'full'}">ว่าง ~${freeEst.toLocaleString()}/${totalCapacity.toLocaleString()}</span>
                </div>
            </button>
        `;
    }).join('');
}

function detectWarehouseLayoutFromData() {
    const schemas = buildWarehouseRowSchemaRegistry();
    const rowList = Object.values(schemas);

    let detectedFormat = 'STANDARD_DASH';
    let maxLock = 10;
    let maxLevel = 1;
    let maxSlot = 10;

    if (rowList.length > 0) {
        detectedFormat = rowList[0].formatTemplate || 'STANDARD_DASH';
        rowList.forEach(sc => {
            if (sc.locks && sc.locks.length > 0) {
                maxLock = Math.max(maxLock, Math.max(...sc.locks));
            }
            if (sc.levels && sc.levels.length > 0) {
                maxLevel = Math.max(maxLevel, Math.max(...sc.levels));
            }
            if (sc.maxSlot > 0) {
                maxSlot = Math.max(maxSlot, sc.maxSlot);
            }
        });
    }

    return {
        rows: rowList.map(r => r.row),
        formatTemplate: detectedFormat,
        maxLock: Math.min(100, Math.max(1, maxLock)),
        maxLevel: Math.min(50, Math.max(1, maxLevel)),
        maxSlot: Math.min(5000, Math.max(1, maxSlot))
    };
}

function applyRowSchemaToFilterControls(rowName, preserveUserSelection = false) {
    const schema = getSchemaForRow(rowName);
    const formatSelect = document.getElementById('wmsBrFormatSelect');
    const startLevelEl = document.getElementById('wmsBrStartLevel');
    const endLevelEl = document.getElementById('wmsBrEndLevel');
    const startLockEl = document.getElementById('wmsBrStartLock');
    const endLockEl = document.getElementById('wmsBrEndLock');
    const startSlotEl = document.getElementById('wmsBrStartSlot');
    const endSlotEl = document.getElementById('wmsBrEndSlot');
    const levelHintEl = document.getElementById('wmsBrLevelCapHint');
    const lockHintEl = document.getElementById('wmsBrLockCapHint');
    const slotHintEl = document.getElementById('wmsBrSlotCapHint');

    const prevStartLvl = startLevelEl ? parseInt(startLevelEl.value || '1', 10) : 1;
    const prevEndLvl = endLevelEl ? parseInt(endLevelEl.value || '1', 10) : 1;
    const prevStartLck = startLockEl ? parseInt(startLockEl.value || '1', 10) : 1;
    const prevEndLck = endLockEl ? parseInt(endLockEl.value || '1', 10) : 1;
    const prevEndSlot = endSlotEl ? parseInt(endSlotEl.value || '10', 10) : 10;

    let effectiveFormat = formatSelect ? formatSelect.value : 'STANDARD_DASH';

    if (schema) {
        if (!wmsBatchRelocateState.userOverrodeFormat && formatSelect && schema.formatTemplate) {
            formatSelect.value = schema.formatTemplate;
            effectiveFormat = schema.formatTemplate;
        }

        // 1. สร้างตัวเลือก "ชั้น" ตามจำนวนชั้น (shelves) ที่ผู้ใช้ตั้งค่าไว้ในฐานข้อมูลจริงเท่านั้น
        const validLevels = schema.levels && schema.levels.length > 0 ? schema.levels : [1];
        const lvlHtml = validLevels.map(l => `<option value="${l}">ชั้นที่ ${l}</option>`).join('');

        if (startLevelEl) {
            startLevelEl.innerHTML = lvlHtml;
            const targetStartLvl = (preserveUserSelection && validLevels.includes(prevStartLvl))
                ? prevStartLvl
                : validLevels[0];
            startLevelEl.value = String(targetStartLvl);
        }
        if (endLevelEl) {
            endLevelEl.innerHTML = lvlHtml;
            const targetEndLvl = (preserveUserSelection && validLevels.includes(prevEndLvl))
                ? Math.max(parseInt(startLevelEl?.value || '1', 10), prevEndLvl)
                : validLevels[validLevels.length - 1];
            endLevelEl.value = String(targetEndLvl);
        }
        if (levelHintEl) {
            levelHintEl.textContent = validLevels.length === 1
                ? `(มี 1 ชั้น)`
                : `(1-${validLevels[validLevels.length - 1]})`;
        }

        // 2. สร้างตัวเลือก "ล็อก" ตามจำนวนล็อก (bays) ที่ผู้ใช้ตั้งค่าไว้ในฐานข้อมูลจริง
        const validLocks = schema.locks && schema.locks.length > 0 ? schema.locks : [1];
        const lockHtml = validLocks.map(k => `<option value="${k}">ล็อกที่ ${k}</option>`).join('');

        if (startLockEl) {
            startLockEl.innerHTML = lockHtml;
            const targetStartLck = (preserveUserSelection && validLocks.includes(prevStartLck))
                ? prevStartLck
                : validLocks[0];
            startLockEl.value = String(targetStartLck);
        }
        if (endLockEl) {
            endLockEl.innerHTML = lockHtml;
            const targetEndLck = (preserveUserSelection && validLocks.includes(prevEndLck))
                ? Math.max(parseInt(startLockEl?.value || '1', 10), prevEndLck)
                : validLocks[validLocks.length - 1];
            endLockEl.value = String(targetEndLck);
        }
        if (lockHintEl) {
            lockHintEl.textContent = schema.hasLocks && formatUsesLocks(effectiveFormat)
                ? `(1-${validLocks[validLocks.length - 1]})`
                : '(ไม่มีล็อก)';
        }

        // 3. ตั้งค่าจำนวน "ช่อง" (slots) สูงสุดตามฐานข้อมูลตั้งค่าของแถวนี้
        const dbMaxSlot = Math.max(1, schema.maxSlot || 10);
        if (startSlotEl) {
            startSlotEl.max = String(dbMaxSlot);
            if (parseInt(startSlotEl.value || '1', 10) > dbMaxSlot) startSlotEl.value = '1';
        }
        if (endSlotEl) {
            endSlotEl.max = String(dbMaxSlot);
            if (!preserveUserSelection || prevEndSlot > dbMaxSlot || prevEndSlot <= 0) {
                endSlotEl.value = String(dbMaxSlot);
            }
        }
        if (slotHintEl) {
            slotHintEl.textContent = `(สูงสุด ${dbMaxSlot})`;
        }

        // 4. อัปเดตโควต้าล็อกให้ตรงกับล็อกที่มีอยู่จริงในฐานข้อมูลของแถวนี้
        const nextQuotas = {};
        const itemsCount = wmsBatchRelocateState.items.length;
        const perLockDefault = Math.ceil(itemsCount / Math.max(1, validLocks.length));
        validLocks.forEach(k => {
            const existing = wmsBatchRelocateState.lockQuotas[k];
            if (preserveUserSelection && existing) {
                nextQuotas[k] = existing;
            } else {
                nextQuotas[k] = { enabled: true, quota: perLockDefault };
            }
        });
        wmsBatchRelocateState.lockQuotas = nextQuotas;
    } else {
        // กรณีเป็นชื่อแถวใหม่ที่ยังไม่มีในฐานข้อมูล -> เปิดให้กำหนดได้อิสระ
        let openLvlHtml = '';
        for (let l = 1; l <= 10; l++) openLvlHtml += `<option value="${l}">ชั้นที่ ${l}</option>`;
        if (startLevelEl) {
            startLevelEl.innerHTML = openLvlHtml;
            startLevelEl.value = String(Math.min(10, Math.max(1, prevStartLvl)));
        }
        if (endLevelEl) {
            endLevelEl.innerHTML = openLvlHtml;
            endLevelEl.value = String(Math.min(10, Math.max(1, prevEndLvl)));
        }
        if (levelHintEl) levelHintEl.textContent = '(อิสระ)';

        let openLockHtml = '';
        for (let k = 1; k <= 20; k++) openLockHtml += `<option value="${k}">ล็อกที่ ${k}</option>`;
        if (startLockEl) {
            startLockEl.innerHTML = openLockHtml;
            startLockEl.value = String(Math.min(20, Math.max(1, prevStartLck)));
        }
        if (endLockEl) {
            endLockEl.innerHTML = openLockHtml;
            endLockEl.value = String(Math.min(20, Math.max(1, prevEndLck)));
        }
        if (lockHintEl) lockHintEl.textContent = formatUsesLocks(effectiveFormat) ? '(อิสระ)' : '(ไม่มีล็อก)';

        if (startSlotEl) startSlotEl.removeAttribute('max');
        if (endSlotEl) endSlotEl.removeAttribute('max');
        if (slotHintEl) slotHintEl.textContent = '';

        if (Object.keys(wmsBatchRelocateState.lockQuotas).length === 0) {
            for (let k = 1; k <= 10; k++) {
                wmsBatchRelocateState.lockQuotas[k] = {
                    enabled: k <= 3,
                    quota: k <= 3 ? Math.ceil(wmsBatchRelocateState.items.length / 3) : 0
                };
            }
        }
    }

    syncCoordinateFormatControlsUI(rowName, schema);
}

function syncCoordinateFormatControlsUI(rowName, schema) {
    const formatSelect = document.getElementById('wmsBrFormatSelect');
    const formatTemplate = formatSelect ? formatSelect.value : 'STANDARD_DASH';
    const hasLocks = formatUsesLocks(formatTemplate);

    const startLockWrap = document.getElementById('wmsBrStartLockWrap');
    const endLockWrap = document.getElementById('wmsBrEndLockWrap');
    const tabQuota = document.getElementById('wmsBrTabQuota');

    if (startLockWrap) {
        startLockWrap.classList.toggle('is-disabled', !hasLocks || wmsBatchRelocateState.mode === 'QUOTA');
    }
    if (endLockWrap) {
        endLockWrap.classList.toggle('is-disabled', !hasLocks || wmsBatchRelocateState.mode === 'QUOTA');
    }
    if (tabQuota) {
        tabQuota.style.opacity = hasLocks ? '1' : '0.5';
        tabQuota.style.pointerEvents = hasLocks ? 'auto' : 'none';
        if (!hasLocks && wmsBatchRelocateState.mode === 'QUOTA') {
            switchBatchRelocateMode('CONTINUOUS', true);
        }
    }

    const schemaBanner = document.getElementById('wmsBrSchemaBanner');
    if (!schemaBanner) return;

    const cleanRow = String(rowName || '').trim();
    const sampleRow = cleanRow || 'ROW';
    const sampleStartLvl = document.getElementById('wmsBrStartLevel')?.value || '1';
    const sampleStartLck = document.getElementById('wmsBrStartLock')?.value || '1';
    const sampleStartSlt = document.getElementById('wmsBrStartSlot')?.value || '1';
    const sampleCoord = formatBatchSlotCoordinate({
        row: sampleRow,
        lock: sampleStartLck,
        level: sampleStartLvl,
        slot: sampleStartSlt,
        formatTemplate,
        includeLock: hasLocks
    });

    if (!cleanRow) {
        schemaBanner.className = 'wms-br-schema-banner is-unregistered';
        schemaBanner.innerHTML = `
            <span><i class="fa-solid fa-database"></i> คลิกช่องด้านบนหรือปุ่ม <strong>"เลือกแถวตามลำดับ"</strong> เพื่อเลือกจากโครงสร้างคลังจริง</span>
            <span class="wms-br-format-sample">ตัวอย่างรูปแบบ: ${escapeHTML(sampleCoord)}</span>
        `;
        return;
    }

    if (schema) {
        const lvlText = schema.levels.length === 1
            ? `1 ชั้น (ชั้น ${schema.levels[0]})`
            : `${schema.levels.length} ชั้น (ชั้น ${schema.levels[0]}-${schema.levels[schema.levels.length - 1]})`;
        const lockText = schema.hasLocks && schema.locks.length > 0
            ? ` · ${schema.locks.length} ล็อก (ล็อก ${schema.locks[0]}-${schema.locks[schema.locks.length - 1]})`
            : ' · ไม่มีล็อก';
        const slotText = ` · ${schema.maxSlot} ช่อง/ล็อก`;
        const zoneLabel = schema.zoneType === 'main' ? 'โครงสร้างหลัก' : 'โครงสร้างเพิ่มเติม';

        schemaBanner.className = 'wms-br-schema-banner';
        schemaBanner.innerHTML = `
            <span><i class="fa-solid fa-circle-check"></i> <strong>แถว "${escapeHTML(schema.row)}" [${zoneLabel}]:</strong> ${lvlText}${lockText}${slotText}</span>
            <span class="wms-br-format-sample">รหัสพิกัด: ${escapeHTML(sampleCoord)}</span>
        `;
    } else {
        schemaBanner.className = 'wms-br-schema-banner is-unregistered';
        schemaBanner.innerHTML = `
            <span><i class="fa-solid fa-circle-info"></i> แถวใหม่ <strong>"${escapeHTML(cleanRow)}"</strong> (ยังไม่อยู่ในตารางตั้งค่าพิกัด — กำหนดชั้น/ล็อก/ช่องได้อิสระ)</span>
            <span class="wms-br-format-sample">รหัสพิกัด: ${escapeHTML(sampleCoord)}</span>
        `;
    }
}

function buildOccupiedSlotLookupMap(movingSnSetUpper) {
    const occupiedMap = new Map();
    const invList = Array.isArray(globalInventoryData) ? globalInventoryData : [];

    for (let i = 0; i < invList.length; i++) {
        const item = invList[i];
        if (!item || (typeof isSnInTombstone === 'function' && isSnInTombstone(item.sn))) continue;

        const snUpper = typeof normalizeSnKey === 'function'
            ? normalizeSnKey(item.sn)
            : String(item.sn || '').trim().toUpperCase();

        if (movingSnSetUpper && movingSnSetUpper.has(snUpper)) continue;

        const rawLoc = String(item.location || '').trim();
        if (!rawLoc || rawLoc === '-' || rawLoc === 'รอจัดเก็บ') continue;

        const normKey = normalizeBatchCoordKey(rawLoc);
        if (normKey) {
            if (!occupiedMap.has(normKey)) {
                occupiedMap.set(normKey, {
                    sn: item.sn,
                    count: 1,
                    category: item.category || '',
                    name: item.name || '',
                    rawLocation: rawLoc
                });
            } else {
                const existing = occupiedMap.get(normKey);
                existing.count += 1;
                existing.sn = `${existing.sn} (+${existing.count - 1})`;
            }
        }
    }
    return occupiedMap;
}

function ensureUnifiedBatchRelocateModalExists() {
    if (typeof initWmsModalStackObserver === 'function') initWmsModalStackObserver();
    let modal = document.getElementById('wmsUnifiedBatchRelocateModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsUnifiedBatchRelocateModal';
        modal.className = 'modal-overlay wms-batch-relocate-overlay';
        modal.addEventListener('click', (e) => {
            if (e.target === modal && !wmsBatchRelocateState.isExecuting) {
                closeUnifiedBatchRelocateModal();
            }
        });

        modal.innerHTML = `
            <div class="wms-br-dialog">
                <div class="wms-br-header">
                    <div class="wms-br-header-left">
                        <div class="wms-br-icon-badge">
                            <i class="fa-solid fa-dolly"></i>
                        </div>
                        <div>
                            <h3 id="wmsBrModalTitle" class="wms-br-title">ย้ายพิกัดรายการที่เลือก (Smart Batch Relocate)</h3>
                            <div id="wmsBrRoleHint" class="wms-br-subtitle">อ้างอิงโครงสร้างชั้น ล็อก และช่องจริงจากฐานข้อมูล คำนวณช่องว่างอัตโนมัติและป้องกันพิกัดซ้ำ 100%</div>
                        </div>
                    </div>
                    <button type="button" class="wms-br-close-btn" onclick="closeUnifiedBatchRelocateModal()" title="ปิดหน้าต่าง">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="wms-br-body" id="wmsBrScrollableBody">
                    <!-- KPI Strip -->
                    <div class="wms-br-kpi-strip" id="wmsBrKpiStrip"></div>

                    <!-- Step 1: Destination Row Selector with Ordered Popover -->
                    <div class="wms-br-user-zone-card">
                        <div class="wms-br-user-zone-top">
                            <div class="wms-br-user-zone-title">
                                <span class="wms-br-step-badge">1</span>
                                <span>กำหนดชื่อแถวปลายทาง (เลือกตามลำดับโครงสร้างคลัง หรือพิมพ์ชื่อแถวเอง):</span>
                            </div>
                            <button type="button" class="wms-br-chip-btn" onclick="saveCurrentConfigAsUserPreset()">
                                <i class="fa-solid fa-bookmark"></i> บันทึกพิกัดด่วนของฉัน
                            </button>
                        </div>

                        <div class="wms-br-row-selector-anchor" id="wmsBrRowSelectorAnchor">
                            <div class="wms-br-custom-row-box">
                                <div class="wms-br-row-input-group">
                                    <i class="fa-solid fa-warehouse input-prefix-icon"></i>
                                    <input type="text" id="wmsBrCustomRowInput" autocomplete="off" placeholder="คลิกเพื่อเลือกแถวตามลำดับ หรือพิมพ์ชื่อแถว เช่น A, B, DOCK, OFFICE..." onfocus="toggleBatchRelocateRowPicker(true)" oninput="onBatchRelocateRowInput()">
                                    <button type="button" class="wms-br-picker-toggle-btn" onclick="toggleBatchRelocateRowPicker()" title="เปิดรายการแถวตามลำดับโครงสร้าง">
                                        <i class="fa-solid fa-list-ol"></i> เลือกแถวตามลำดับ <i class="fa-solid fa-chevron-down"></i>
                                    </button>
                                </div>
                                <button type="button" class="wms-br-chip-btn" onclick="clearBatchRelocateCustomRow()" title="ล้างชื่อแถว">
                                    <i class="fa-solid fa-eraser"></i> ล้างค่า
                                </button>
                            </div>

                            <!-- Beautiful Ordered Row Selection Popover -->
                            <div id="wmsBrRowPickerPopover" class="wms-br-row-picker-popover">
                                <div class="wms-br-rp-header">
                                    <div class="wms-br-rp-tabs">
                                        <button type="button" class="wms-br-rp-tab active" onclick="setBatchRelocateRowPickerZoneFilter('ALL', this)">ทั้งหมด</button>
                                        <button type="button" class="wms-br-rp-tab" onclick="setBatchRelocateRowPickerZoneFilter('main', this)">🔵 โครงสร้างหลัก</button>
                                        <button type="button" class="wms-br-rp-tab" onclick="setBatchRelocateRowPickerZoneFilter('auxiliary', this)">🟡 โครงสร้างเพิ่มเติม</button>
                                    </div>
                                    <div class="wms-br-rp-meta">
                                        <span id="wmsBrRowPickerCount">เรียงตามลำดับโครงสร้างคลัง</span>
                                        <button type="button" class="wms-br-rp-close" onclick="toggleBatchRelocateRowPicker(false)" title="ปิดรายการ">
                                            <i class="fa-solid fa-xmark"></i>
                                        </button>
                                    </div>
                                </div>
                                <div id="wmsBrRowPickerList" class="wms-br-rp-list"></div>
                            </div>
                        </div>

                        <!-- Live Database Row Schema & Coordinate Sample Banner -->
                        <div id="wmsBrSchemaBanner" class="wms-br-schema-banner is-unregistered"></div>
                        <!-- User-created presets render here only if user saves any -->
                        <div id="wmsBrUserPresetsRow" class="wms-br-user-presets-row" style="display:none;"></div>
                    </div>

                    <!-- Step 2: Mode Switcher -->
                    <div class="wms-br-mode-tabs">
                        <button type="button" id="wmsBrTabContinuous" class="wms-br-mode-tab active" onclick="switchBatchRelocateMode('CONTINUOUS')">
                            <i class="fa-solid fa-forward-fast"></i>
                            <div>
                                <div class="tab-main">โหมด 1: รันคิวต่อเนื่องตามลำดับล็อก / ชั้นอัตโนมัติ</div>
                                <div class="tab-sub">เริ่มจากชั้น ล็อก และช่องที่กำหนด รันคิวต่อเนื่องจนครบจำนวน S/N (ข้ามช่องที่มีของอัตโนมัติ)</div>
                            </div>
                        </button>
                        <button type="button" id="wmsBrTabQuota" class="wms-br-mode-tab" onclick="switchBatchRelocateMode('QUOTA')">
                            <i class="fa-solid fa-layer-group"></i>
                            <div>
                                <div class="tab-main">โหมด 2: เลือกล็อกและกำหนดจำนวนเข้าแต่ละล็อก</div>
                                <div class="tab-sub">ระบุจำนวนซีเรียลที่จะจัดเก็บเข้าแต่ละล็อกที่มีอยู่จริงในแถวนั้นแยกกันได้อิสระ</div>
                            </div>
                        </button>
                    </div>

                    <!-- Step 3: Coordinate Filter & Target Selector -->
                    <div class="wms-br-control-card">
                        <div class="wms-br-card-heading">
                            <span><span class="wms-br-step-badge">2</span> คัดกรองพิกัดปลายทาง (อ้างอิงชั้น · ล็อก · ช่อง จากฐานข้อมูลตั้งค่า)</span>
                            <div class="wms-br-quick-presets">
                                <button type="button" class="wms-br-chip-btn" onclick="autoExpandSlotRangeToFitItems()">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> ขยายช่วงช่องให้ครบอัตโนมัติ
                                </button>
                            </div>
                        </div>

                        <div class="wms-br-filter-grid">
                            <div class="wms-br-field">
                                <label for="wmsBrFormatSelect">รูปแบบรหัสพิกัด:</label>
                                <select id="wmsBrFormatSelect" onchange="onBatchRelocateFormatChange()">
                                    <option value="STANDARD_DASH">มีล็อก (เช่น ROW-L1-F1-S01)</option>
                                    <option value="NO_LOCK_DASH">ไม่มีล็อก (เช่น ROW-F1-S01)</option>
                                    <option value="THAI_FULL">ภาษาไทยมีล็อก (เช่น ROW-ล็อก1-ชั้น1-ช่อง01)</option>
                                    <option value="THAI_NO_LOCK">ภาษาไทยไม่มีล็อก (เช่น ROW-ชั้น1-ช่อง01)</option>
                                </select>
                            </div>

                            <div class="wms-br-field">
                                <label for="wmsBrStartLevel">
                                    <span>เริ่มจากชั้นที่:</span>
                                    <span id="wmsBrLevelCapHint" class="field-cap-hint"></span>
                                </label>
                                <select id="wmsBrStartLevel" onchange="onBatchRelocateFilterChange()"></select>
                            </div>

                            <div class="wms-br-field">
                                <label for="wmsBrEndLevel">รันต่อเนื่องถึงชั้นที่:</label>
                                <select id="wmsBrEndLevel" onchange="onBatchRelocateFilterChange()"></select>
                            </div>

                            <div class="wms-br-field" id="wmsBrStartLockWrap">
                                <label for="wmsBrStartLock">
                                    <span>เริ่มจากล็อกที่:</span>
                                    <span id="wmsBrLockCapHint" class="field-cap-hint"></span>
                                </label>
                                <select id="wmsBrStartLock" onchange="onBatchRelocateFilterChange()"></select>
                            </div>

                            <div class="wms-br-field" id="wmsBrEndLockWrap">
                                <label for="wmsBrEndLock">รันถึงล็อกที่:</label>
                                <select id="wmsBrEndLock" onchange="onBatchRelocateFilterChange()"></select>
                            </div>

                            <div class="wms-br-field">
                                <label for="wmsBrStartSlot">เริ่มเข้าช่องที่:</label>
                                <input type="number" id="wmsBrStartSlot" min="1" max="5000" value="1" oninput="onBatchRelocateFilterChange()">
                            </div>

                            <div class="wms-br-field">
                                <label for="wmsBrEndSlot">
                                    <span>สิ้นสุดช่องที่:</span>
                                    <span id="wmsBrSlotCapHint" class="field-cap-hint"></span>
                                </label>
                                <input type="number" id="wmsBrEndSlot" min="1" max="5000" value="10" oninput="onBatchRelocateFilterChange()">
                            </div>
                        </div>

                        <!-- Mode 2: Per-Lock Quota Allocation Panel -->
                        <div id="wmsBrQuotaPanel" class="wms-br-quota-panel" style="display:none;">
                            <div class="wms-br-quota-header">
                                <span><i class="fa-solid fa-sliders"></i> ติ๊กเลือกล็อกและระบุจำนวนซีเรียลที่จะเข้าแต่ละล็อก (อ้างอิงตามจำนวนช่องจริงของแถว):</span>
                                <button type="button" class="wms-br-chip-btn primary" onclick="autoDistributeQuotasAcrossSelectedLocks()">
                                    <i class="fa-solid fa-scale-balanced"></i> กระจายตามช่องว่างที่มีอยู่อัตโนมัติ
                                </button>
                            </div>
                            <div id="wmsBrQuotaLockGrid" class="wms-br-quota-lock-grid"></div>
                        </div>
                    </div>

                    <!-- Real-time Status & Collision Alert Banner -->
                    <div id="wmsBrStatusAlert" class="wms-br-alert-box"></div>

                    <!-- Real-Time Slot Status Inspector & Assignment Preview -->
                    <div class="wms-br-preview-card">
                        <div class="wms-br-preview-header">
                            <div class="wms-br-preview-title">
                                <span class="wms-br-step-badge">3</span> ตรวจสอบสถานะช่อง & คิวรันต่อเนื่องล่วงหน้า (ไม่ซ้ำพิกัด 100%)
                            </div>
                            <div class="wms-br-status-pills">
                                <button type="button" class="wms-br-pill active" data-filter="ALL" onclick="setBatchRelocateSlotFilter('ALL', this)">ทั้งหมด</button>
                                <button type="button" class="wms-br-pill assigned" data-filter="ASSIGNED" onclick="setBatchRelocateSlotFilter('ASSIGNED', this)">เข้าได้ / จองย้ายเข้า</button>
                                <button type="button" class="wms-br-pill occupied" data-filter="OCCUPIED" onclick="setBatchRelocateSlotFilter('OCCUPIED', this)">มีซีเรียลอยู่แล้ว</button>
                                <button type="button" class="wms-br-pill free" data-filter="FREE" onclick="setBatchRelocateSlotFilter('FREE', this)">ช่องว่างสำรอง</button>
                            </div>
                        </div>
                        <div id="wmsBrSlotPreviewTableWrap" class="wms-br-preview-table-wrap"></div>
                    </div>

                    <!-- Reason Input -->
                    <div class="wms-br-reason-box">
                        <label for="wmsBrReasonInput">หมายเหตุการย้ายพิกัด (บันทึกประวัติตรวจสอบคลัง):</label>
                        <input type="text" id="wmsBrReasonInput" placeholder="เช่น ย้ายสต็อกเข้าโซนใหม่ / จัดเรียงชั้นและล็อก">
                    </div>
                </div>

                <div class="wms-br-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeUnifiedBatchRelocateModal()" style="font-weight:600; padding:9px 18px;">
                        ยกเลิก
                    </button>
                    <button type="button" id="wmsBrConfirmBtn" class="btn btn-primary" onclick="confirmAndExecuteBatchRelocate()" style="font-weight:700; padding:9px 22px;">
                        <i class="fa-solid fa-check-double"></i> ยืนยันการย้ายพิกัด
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // ปิดป๊อปอัปเลือกแถวอัตโนมัติเมื่อคลิกพื้นที่อื่นในโมดอล
        modal.addEventListener('click', (e) => {
            if (!e.target.closest('#wmsBrRowSelectorAnchor')) {
                toggleBatchRelocateRowPicker(false);
            }
        });
    }
    return modal;
}

function openUnifiedBatchRelocateModal(preselectedItems = null) {
    const items = resolveBatchRelocateTargetItems(preselectedItems);
    if (!items || items.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณาติ๊กเลือกรายการซีเรียลอย่างน้อย 1 รายการก่อนกดย้ายพิกัด', true);
        } else {
            alert('⚠️ กรุณาติ๊กเลือกรายการซีเรียลอย่างน้อย 1 รายการก่อนกดย้ายพิกัด');
        }
        return;
    }

    const modal = ensureUnifiedBatchRelocateModalExists();
    const layout = detectWarehouseLayoutFromData();

    wmsBatchRelocateState.items = items.slice();
    wmsBatchRelocateState.mode = 'CONTINUOUS';
    wmsBatchRelocateState.formatTemplate = layout.formatTemplate;
    wmsBatchRelocateState.userOverrodeFormat = false;
    wmsBatchRelocateState.statusFilter = 'ALL';
    wmsBatchRelocateState.showAllPreviewRows = false;
    wmsBatchRelocateState.isExecuting = false;
    wmsBatchRelocateState.lastAppliedRowKey = '';
    wmsBatchRelocateState.rowPickerZoneFilter = 'ALL';

    renderBatchRelocateRowPickerPopover();

    const customRowInput = document.getElementById('wmsBrCustomRowInput');
    if (customRowInput) {
        customRowInput.value = '';
    }
    renderUserCustomRelocatePresets();

    const formatSelect = document.getElementById('wmsBrFormatSelect');
    if (formatSelect) formatSelect.value = layout.formatTemplate;

    const startSlotEl = document.getElementById('wmsBrStartSlot');
    const endSlotEl = document.getElementById('wmsBrEndSlot');
    if (startSlotEl) startSlotEl.value = '1';
    if (endSlotEl) endSlotEl.value = String(layout.maxSlot || 10);

    applyRowSchemaToFilterControls('', false);

    const isAdmin = typeof isCurrentUserAdmin === 'function' ? isCurrentUserAdmin() : true;
    const titleEl = document.getElementById('wmsBrModalTitle');
    const roleHintEl = document.getElementById('wmsBrRoleHint');
    if (titleEl) {
        titleEl.textContent = `ย้ายพิกัดรายการที่เลือก (${items.length.toLocaleString()} S/N)`;
    }
    if (roleHintEl) {
        roleHintEl.textContent = isAdmin
            ? 'สิทธิ์ผู้ดูแลระบบ (Admin): ย้ายพิกัดและอัปเดตฐานข้อมูลเรียลไทม์ทันที (อ้างอิงโครงสร้างแถวจริง 100%)'
            : 'สิทธิ์ผู้ใช้งานทั่วไป: คำนวณช่องว่างล่วงหน้าและส่งคำขออนุมัติย้ายไปยัง Admin';
    }

    const reasonInput = document.getElementById('wmsBrReasonInput');
    if (reasonInput) reasonInput.value = '';

    switchBatchRelocateMode('CONTINUOUS', true);
    recalculateBatchRelocatePlan();

    modal.style.display = 'flex';
    modal.classList.add('active', 'show', 'is-open');

    const scrollBody = document.getElementById('wmsBrScrollableBody');
    if (scrollBody) scrollBody.scrollTop = 0;

    if (typeof elevateTopModal === 'function' && typeof WMS_ACTION_MODAL_GROUPS !== 'undefined') {
        elevateTopModal(WMS_ACTION_MODAL_GROUPS.relocate, 'relocate');
    }

    // เปิดรายการเลือกแถวตามลำดับให้ผู้ใช้เลือกง่ายทันที
    toggleBatchRelocateRowPicker(true);

    // ซิงค์โครงสร้างตั้งค่าพิกัดล่าสุดจาก Supabase ในพื้นหลัง
    syncWarehouseRowSchemasFromDB();
}

function closeUnifiedBatchRelocateModal() {
    if (wmsBatchRelocateState.isExecuting) return;
    toggleBatchRelocateRowPicker(false);
    const modal = document.getElementById('wmsUnifiedBatchRelocateModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active', 'show', 'open', 'is-open');
    }
    if (typeof syncStockDetailParentState === 'function') syncStockDetailParentState();
}

function clearBatchRelocateCustomRow() {
    const customInput = document.getElementById('wmsBrCustomRowInput');
    if (customInput) {
        customInput.value = '';
        customInput.focus();
    }
    wmsBatchRelocateState.userOverrodeFormat = false;
    wmsBatchRelocateState.lastAppliedRowKey = '';
    applyRowSchemaToFilterControls('', false);
    renderBatchRelocateRowPickerPopover();
    toggleBatchRelocateRowPicker(true);
    recalculateBatchRelocatePlan();
}

function onBatchRelocateRowInput() {
    const rowName = getEffectiveBatchRelocateRow();
    const rowKey = rowName.toUpperCase();

    if (rowKey !== wmsBatchRelocateState.lastAppliedRowKey) {
        wmsBatchRelocateState.lastAppliedRowKey = rowKey;
        wmsBatchRelocateState.userOverrodeFormat = false;
        applyRowSchemaToFilterControls(rowName, false);
    }
    renderBatchRelocateRowPickerPopover();
    recalculateBatchRelocatePlan();
}

function onBatchRelocateFormatChange() {
    wmsBatchRelocateState.userOverrodeFormat = true;
    const rowName = getEffectiveBatchRelocateRow();
    applyRowSchemaToFilterControls(rowName, true);
    recalculateBatchRelocatePlan();
}

function switchBatchRelocateMode(mode, skipRecalc = false) {
    const formatSelect = document.getElementById('wmsBrFormatSelect');
    const formatTemplate = formatSelect ? formatSelect.value : 'STANDARD_DASH';
    const hasLocks = formatUsesLocks(formatTemplate);

    wmsBatchRelocateState.mode = (mode === 'QUOTA' && hasLocks) ? 'QUOTA' : 'CONTINUOUS';

    const tabCont = document.getElementById('wmsBrTabContinuous');
    const tabQuota = document.getElementById('wmsBrTabQuota');
    const quotaPanel = document.getElementById('wmsBrQuotaPanel');
    const startLockWrap = document.getElementById('wmsBrStartLockWrap');
    const endLockWrap = document.getElementById('wmsBrEndLockWrap');

    if (tabCont) tabCont.classList.toggle('active', wmsBatchRelocateState.mode === 'CONTINUOUS');
    if (tabQuota) tabQuota.classList.toggle('active', wmsBatchRelocateState.mode === 'QUOTA');
    if (quotaPanel) quotaPanel.style.display = wmsBatchRelocateState.mode === 'QUOTA' ? 'flex' : 'none';

    if (startLockWrap) {
        startLockWrap.classList.toggle('is-disabled', !hasLocks || wmsBatchRelocateState.mode === 'QUOTA');
    }
    if (endLockWrap) {
        endLockWrap.classList.toggle('is-disabled', !hasLocks || wmsBatchRelocateState.mode === 'QUOTA');
    }

    if (!skipRecalc) {
        recalculateBatchRelocatePlan();
    }
}

function autoExpandSlotRangeToFitItems() {
    const needed = wmsBatchRelocateState.items.length;
    if (needed === 0) return;

    const row = getEffectiveBatchRelocateRow();
    if (!row) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณากำหนดชื่อแถวปลายทางก่อนขยายช่วงช่อง', true);
        }
        toggleBatchRelocateRowPicker(true);
        return;
    }

    const schema = getSchemaForRow(row);
    const maxAllowedSlot = schema ? Math.max(1, schema.maxSlot) : 500;

    const startSlotEl = document.getElementById('wmsBrStartSlot');
    const endSlotEl = document.getElementById('wmsBrEndSlot');
    const endLevelEl = document.getElementById('wmsBrEndLevel');
    const endLockEl = document.getElementById('wmsBrEndLock');

    const startSlot = Math.max(1, parseInt(startSlotEl ? startSlotEl.value : '1', 10) || 1);
    let currentEndSlot = Math.max(startSlot, parseInt(endSlotEl ? endSlotEl.value : '1', 10) || 1);

    for (let guard = 0; guard < 30; guard++) {
        recalculateBatchRelocatePlan();
        if (wmsBatchRelocateState.unassignedCount === 0) break;

        if (currentEndSlot < maxAllowedSlot) {
            currentEndSlot = Math.min(maxAllowedSlot, currentEndSlot + Math.max(25, wmsBatchRelocateState.unassignedCount));
            if (endSlotEl) endSlotEl.value = String(currentEndSlot);
        } else if (endLevelEl && endLevelEl.selectedIndex < endLevelEl.options.length - 1) {
            endLevelEl.selectedIndex += 1;
        } else if (endLockEl && !document.getElementById('wmsBrEndLockWrap')?.classList.contains('is-disabled') && endLockEl.selectedIndex < endLockEl.options.length - 1) {
            endLockEl.selectedIndex += 1;
        } else {
            break;
        }
    }

    recalculateBatchRelocatePlan();
    if (wmsBatchRelocateState.unassignedCount === 0) {
        if (typeof showToast === 'function') {
            showToast('✨ ขยายช่วงช่องตามโครงสร้างจริงของแถวให้เพียงพอกับจำนวน S/N เรียบร้อยแล้ว');
        }
    } else if (typeof showToast === 'function') {
        showToast(`⚠️ ขยายจนเต็มความจุสูงสุดของแถว "${row}" แล้ว (เข้าได้สูงสุด ${wmsBatchRelocateState.assignments.length.toLocaleString()} S/N)`, true);
    }
}

function onBatchRelocateFilterChange() {
    const rowName = getEffectiveBatchRelocateRow();
    const schema = getSchemaForRow(rowName);

    if (schema) {
        const startSlotEl = document.getElementById('wmsBrStartSlot');
        const endSlotEl = document.getElementById('wmsBrEndSlot');
        const dbMaxSlot = Math.max(1, schema.maxSlot);
        if (startSlotEl && parseInt(startSlotEl.value || '1', 10) > dbMaxSlot) {
            startSlotEl.value = String(dbMaxSlot);
        }
        if (endSlotEl && parseInt(endSlotEl.value || '1', 10) > dbMaxSlot) {
            endSlotEl.value = String(dbMaxSlot);
        }
    }

    syncCoordinateFormatControlsUI(rowName, schema);
    recalculateBatchRelocatePlan();
}

function setBatchRelocateSlotFilter(filterType, btnEl) {
    wmsBatchRelocateState.statusFilter = filterType;
    const pills = document.querySelectorAll('#wmsUnifiedBatchRelocateModal .wms-br-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderBatchRelocatePreviewTable();
}

function toggleBatchRelocatePreviewLimit() {
    wmsBatchRelocateState.showAllPreviewRows = !wmsBatchRelocateState.showAllPreviewRows;
    renderBatchRelocatePreviewTable();
}

function toggleBatchRelocateLockQuota(lockNum, checked) {
    if (!wmsBatchRelocateState.lockQuotas[lockNum]) {
        wmsBatchRelocateState.lockQuotas[lockNum] = { enabled: checked, quota: 0 };
    } else {
        wmsBatchRelocateState.lockQuotas[lockNum].enabled = checked;
    }
    recalculateBatchRelocatePlan();
}

function updateBatchRelocateLockQuotaValue(lockNum, rawVal) {
    const val = Math.max(0, parseInt(rawVal, 10) || 0);
    if (!wmsBatchRelocateState.lockQuotas[lockNum]) {
        wmsBatchRelocateState.lockQuotas[lockNum] = { enabled: val > 0, quota: val };
    } else {
        wmsBatchRelocateState.lockQuotas[lockNum].quota = val;
        if (val > 0) wmsBatchRelocateState.lockQuotas[lockNum].enabled = true;
    }
    recalculateBatchRelocatePlan();
}

function autoDistributeQuotasAcrossSelectedLocks() {
    const row = getEffectiveBatchRelocateRow();
    if (!row) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณากำหนดชื่อแถวปลายทางก่อนกระจายโควต้า', true);
        }
        return;
    }

    const schema = getSchemaForRow(row);
    let remaining = wmsBatchRelocateState.items.length;
    const lockKeys = Object.keys(wmsBatchRelocateState.lockQuotas)
        .map(Number)
        .sort((a, b) => a - b);

    const occupiedMap = buildOccupiedSlotLookupMap(
        new Set(wmsBatchRelocateState.items.map(i => (typeof normalizeSnKey === 'function' ? normalizeSnKey(i.sn) : String(i.sn || '').trim().toUpperCase())))
    );

    const formatTemplate = document.getElementById('wmsBrFormatSelect')?.value || 'STANDARD_DASH';
    const includeLock = formatUsesLocks(formatTemplate);
    const startLvl = Math.max(1, parseInt(document.getElementById('wmsBrStartLevel')?.value || '1', 10));
    const endLvl = Math.max(startLvl, parseInt(document.getElementById('wmsBrEndLevel')?.value || String(startLvl), 10));
    const startSlot = Math.max(1, parseInt(document.getElementById('wmsBrStartSlot')?.value || '1', 10));
    const userEndSlot = Math.max(startSlot, parseInt(document.getElementById('wmsBrEndSlot')?.value || '10', 10));

    const validLevels = schema && schema.levels.length > 0
        ? schema.levels.filter(l => l >= startLvl && l <= endLvl)
        : Array.from({ length: endLvl - startLvl + 1 }, (_, idx) => startLvl + idx);

    lockKeys.forEach(k => {
        const entry = wmsBatchRelocateState.lockQuotas[k];
        if (!entry || !entry.enabled || remaining <= 0) {
            if (entry) entry.quota = 0;
            return;
        }
        const lockCap = schema?.perLockMaxSlots?.[k] || schema?.maxSlot || userEndSlot;
        const effectiveEndSlot = Math.min(userEndSlot, lockCap);

        let freeInLock = 0;
        for (let li = 0; li < validLevels.length; li++) {
            const lvl = validLevels[li];
            for (let s = startSlot; s <= effectiveEndSlot; s++) {
                const coord = formatBatchSlotCoordinate({ row, lock: k, level: lvl, slot: s, formatTemplate, includeLock });
                if (!occupiedMap.has(normalizeBatchCoordKey(coord))) {
                    freeInLock++;
                }
            }
        }
        const assignCount = Math.min(remaining, freeInLock);
        entry.quota = assignCount;
        remaining -= assignCount;
    });

    recalculateBatchRelocatePlan();
}

function getEffectiveBatchRelocateRow() {
    const customInput = document.getElementById('wmsBrCustomRowInput');
    return customInput ? customInput.value.trim() : '';
}

function recalculateBatchRelocatePlan() {
    const items = wmsBatchRelocateState.items || [];
    const totalToMove = items.length;
    if (totalToMove === 0) return;

    const rawRowInput = getEffectiveBatchRelocateRow();
    const schema = getSchemaForRow(rawRowInput);
    const row = schema ? schema.row : rawRowInput;
    wmsBatchRelocateState.row = row;

    const formatTemplate = document.getElementById('wmsBrFormatSelect')?.value || 'STANDARD_DASH';
    const includeLock = formatUsesLocks(formatTemplate);

    const startLevel = Math.max(1, parseInt(document.getElementById('wmsBrStartLevel')?.value || '1', 10));
    const endLevel = Math.max(startLevel, parseInt(document.getElementById('wmsBrEndLevel')?.value || String(startLevel), 10));
    const startLock = Math.max(1, parseInt(document.getElementById('wmsBrStartLock')?.value || '1', 10));
    const endLock = Math.max(startLock, parseInt(document.getElementById('wmsBrEndLock')?.value || String(startLock), 10));
    const startSlot = Math.max(1, parseInt(document.getElementById('wmsBrStartSlot')?.value || '1', 10));
    const userEndSlot = Math.max(startSlot, parseInt(document.getElementById('wmsBrEndSlot')?.value || '10', 10));

    if (!row) {
        wmsBatchRelocateState.assignments = [];
        wmsBatchRelocateState.slotPreviewList = [];
        wmsBatchRelocateState.unassignedCount = totalToMove;
        renderBatchRelocateKpis(totalToMove, 0, 0, 0);
        if (wmsBatchRelocateState.mode === 'QUOTA') {
            const grid = document.getElementById('wmsBrQuotaLockGrid');
            if (grid) {
                grid.innerHTML = '<div class="wms-br-empty-preview">กรุณากำหนดชื่อแถวด้านบนก่อน เพื่อคำนวณจำนวนช่องว่างในแต่ละล็อก</div>';
            }
        }
        const alertBox = document.getElementById('wmsBrStatusAlert');
        if (alertBox) {
            alertBox.className = 'wms-br-alert-box warn';
            alertBox.innerHTML = `<i class="fa-solid fa-hand-pointer"></i> <strong>กรุณาเลือกแถวปลายทางตามลำดับโครงสร้าง หรือพิมพ์ชื่อแถวในขั้นตอนที่ 1</strong> ระบบจะดึงชั้น ล็อก และช่องจริงของแถวนั้นจากฐานข้อมูลมาคำนวณทันที`;
        }
        renderBatchRelocatePreviewTable();
        updateBatchRelocateConfirmButton();
        return;
    }

    const effectiveLevels = (schema && schema.levels && schema.levels.length > 0)
        ? schema.levels.filter(l => l >= startLevel && l <= endLevel)
        : Array.from({ length: endLevel - startLevel + 1 }, (_, i) => startLevel + i);

    const effectiveLocks = !includeLock
        ? [1]
        : ((schema && schema.locks && schema.locks.length > 0)
            ? schema.locks.filter(k => k >= startLock && k <= endLock)
            : Array.from({ length: endLock - startLock + 1 }, (_, i) => startLock + i));

    const movingSnSetUpper = new Set(
        items.map(i => (typeof normalizeSnKey === 'function' ? normalizeSnKey(i.sn) : String(i.sn || '').trim().toUpperCase()))
    );
    const occupiedMap = buildOccupiedSlotLookupMap(movingSnSetUpper);

    const assignedNormCoordSet = new Set();
    const assignments = [];
    const previewList = [];
    let itemCursor = 0;
    let totalOccupiedInScope = 0;
    let totalFreeInScope = 0;

    if (wmsBatchRelocateState.mode === 'CONTINUOUS') {
        for (let li = 0; li < effectiveLevels.length; li++) {
            const lvl = effectiveLevels[li];
            for (let ki = 0; ki < effectiveLocks.length; ki++) {
                const lck = effectiveLocks[ki];
                const lockMaxSlot = schema?.perLockMaxSlots?.[lck] || schema?.maxSlot || userEndSlot;
                const effectiveEndSlot = Math.min(userEndSlot, lockMaxSlot);

                for (let slt = startSlot; slt <= effectiveEndSlot; slt++) {
                    const coord = formatBatchSlotCoordinate({
                        row,
                        lock: lck,
                        level: lvl,
                        slot: slt,
                        formatTemplate,
                        includeLock
                    });
                    const normKey = normalizeBatchCoordKey(coord);

                    if (occupiedMap.has(normKey)) {
                        totalOccupiedInScope++;
                        previewList.push({
                            status: 'OCCUPIED',
                            coord,
                            row,
                            lock: lck,
                            level: lvl,
                            slot: slt,
                            occupant: occupiedMap.get(normKey),
                            assignedItem: null
                        });
                    } else if (!assignedNormCoordSet.has(normKey)) {
                        totalFreeInScope++;
                        if (itemCursor < totalToMove) {
                            const targetItem = items[itemCursor++];
                            assignedNormCoordSet.add(normKey);
                            assignments.push({
                                item: targetItem,
                                oldLocation: targetItem.location || '-',
                                newLocation: coord,
                                row,
                                lock: lck,
                                level: lvl,
                                slot: slt
                            });
                            previewList.push({
                                status: 'ASSIGNED',
                                coord,
                                row,
                                lock: lck,
                                level: lvl,
                                slot: slt,
                                occupant: null,
                                assignedItem: targetItem
                            });
                        } else {
                            previewList.push({
                                status: 'FREE',
                                coord,
                                row,
                                lock: lck,
                                level: lvl,
                                slot: slt,
                                occupant: null,
                                assignedItem: null
                            });
                        }
                    }
                }
            }
        }
    } else {
        const lockKeys = Object.keys(wmsBatchRelocateState.lockQuotas)
            .map(Number)
            .sort((a, b) => a - b);

        for (let idx = 0; idx < lockKeys.length; idx++) {
            const lck = lockKeys[idx];
            const qConfig = wmsBatchRelocateState.lockQuotas[lck];
            if (!qConfig || !qConfig.enabled) continue;

            let lockAssignedCount = 0;
            const lockQuotaLimit = Math.max(0, parseInt(qConfig.quota, 10) || 0);
            const lockMaxSlot = schema?.perLockMaxSlots?.[lck] || schema?.maxSlot || userEndSlot;
            const effectiveEndSlot = Math.min(userEndSlot, lockMaxSlot);

            for (let li = 0; li < effectiveLevels.length; li++) {
                const lvl = effectiveLevels[li];
                for (let slt = startSlot; slt <= effectiveEndSlot; slt++) {
                    const coord = formatBatchSlotCoordinate({
                        row,
                        lock: lck,
                        level: lvl,
                        slot: slt,
                        formatTemplate,
                        includeLock: true
                    });
                    const normKey = normalizeBatchCoordKey(coord);

                    if (occupiedMap.has(normKey)) {
                        totalOccupiedInScope++;
                        previewList.push({
                            status: 'OCCUPIED',
                            coord,
                            row,
                            lock: lck,
                            level: lvl,
                            slot: slt,
                            occupant: occupiedMap.get(normKey),
                            assignedItem: null
                        });
                    } else if (!assignedNormCoordSet.has(normKey)) {
                        totalFreeInScope++;
                        if (lockAssignedCount < lockQuotaLimit && itemCursor < totalToMove) {
                            const targetItem = items[itemCursor++];
                            lockAssignedCount++;
                            assignedNormCoordSet.add(normKey);
                            assignments.push({
                                item: targetItem,
                                oldLocation: targetItem.location || '-',
                                newLocation: coord,
                                row,
                                lock: lck,
                                level: lvl,
                                slot: slt
                            });
                            previewList.push({
                                status: 'ASSIGNED',
                                coord,
                                row,
                                lock: lck,
                                level: lvl,
                                slot: slt,
                                occupant: null,
                                assignedItem: targetItem
                            });
                        } else {
                            previewList.push({
                                status: 'FREE',
                                coord,
                                row,
                                lock: lck,
                                level: lvl,
                                slot: slt,
                                occupant: null,
                                assignedItem: null
                            });
                        }
                    }
                }
            }
        }
    }

    wmsBatchRelocateState.assignments = assignments;
    wmsBatchRelocateState.slotPreviewList = previewList;
    wmsBatchRelocateState.unassignedCount = Math.max(0, totalToMove - assignments.length);

    renderBatchRelocateKpis(totalToMove, assignments.length, totalOccupiedInScope, totalFreeInScope);
    if (wmsBatchRelocateState.mode === 'QUOTA') {
        renderBatchRelocateQuotaLockGrid(row, effectiveLevels, startSlot, userEndSlot, schema, formatTemplate, occupiedMap);
    }
    renderBatchRelocateAlertBanner(totalToMove, assignments.length, totalOccupiedInScope, totalFreeInScope);
    renderBatchRelocatePreviewTable();
    updateBatchRelocateConfirmButton();
}

function renderBatchRelocateKpis(totalToMove, assignedCount, occupiedCount, freeCount) {
    const kpiStrip = document.getElementById('wmsBrKpiStrip');
    if (!kpiStrip) return;

    const remainingAfterMove = Math.max(0, freeCount - assignedCount);
    kpiStrip.innerHTML = `
        <div class="wms-br-kpi-item">
            <span class="kpi-label">S/N ที่เลือกย้ายทั้งหมด</span>
            <span class="kpi-val primary">${totalToMove.toLocaleString()}</span>
        </div>
        <div class="wms-br-kpi-item">
            <span class="kpi-label">เข้าได้ / จับคู่สำเร็จ (ไม่ซ้ำ 100%)</span>
            <span class="kpi-val success">${assignedCount.toLocaleString()}</span>
        </div>
        <div class="wms-br-kpi-item">
            <span class="kpi-label">ช่องมีซีเรียลอยู่แล้ว (ข้ามอัตโนมัติ)</span>
            <span class="kpi-val danger">${occupiedCount.toLocaleString()}</span>
        </div>
        <div class="wms-br-kpi-item">
            <span class="kpi-label">ช่องว่างในขอบเขต / เหลือสำรอง</span>
            <span class="kpi-val">${freeCount.toLocaleString()} / ${remainingAfterMove.toLocaleString()}</span>
        </div>
    `;
}

function renderBatchRelocateQuotaLockGrid(row, effectiveLevels, startSlot, userEndSlot, schema, formatTemplate, occupiedMap) {
    const grid = document.getElementById('wmsBrQuotaLockGrid');
    if (!grid) return;

    const lockKeys = Object.keys(wmsBatchRelocateState.lockQuotas)
        .map(Number)
        .sort((a, b) => a - b);

    grid.innerHTML = lockKeys.map(lck => {
        const cfg = wmsBatchRelocateState.lockQuotas[lck] || { enabled: false, quota: 0 };
        const lockMaxSlot = schema?.perLockMaxSlots?.[lck] || schema?.maxSlot || userEndSlot;
        const effectiveEndSlot = Math.min(userEndSlot, lockMaxSlot);
        let freeSlots = 0;
        let occupiedSlots = 0;

        for (let li = 0; li < effectiveLevels.length; li++) {
            const lvl = effectiveLevels[li];
            for (let s = startSlot; s <= effectiveEndSlot; s++) {
                const coord = formatBatchSlotCoordinate({
                    row,
                    lock: lck,
                    level: lvl,
                    slot: s,
                    formatTemplate,
                    includeLock: true
                });
                if (occupiedMap.has(normalizeBatchCoordKey(coord))) occupiedSlots++;
                else freeSlots++;
            }
        }

        const isOver = cfg.enabled && cfg.quota > freeSlots;
        return `
            <div class="wms-br-lock-card ${cfg.enabled ? 'is-enabled' : ''} ${isOver ? 'is-warning' : ''}">
                <label class="wms-br-lock-top">
                    <input type="checkbox" ${cfg.enabled ? 'checked' : ''} onchange="toggleBatchRelocateLockQuota(${lck}, this.checked)">
                    <strong>ล็อกที่ ${lck}</strong>
                    <span class="wms-br-lock-stat">ว่าง ${freeSlots} / เต็ม ${occupiedSlots}</span>
                </label>
                <div class="wms-br-lock-input-row">
                    <span>เข้าล็อกนี้:</span>
                    <input type="number" min="0" max="${freeSlots}" value="${cfg.quota}" ${!cfg.enabled ? 'disabled' : ''} oninput="updateBatchRelocateLockQuotaValue(${lck}, this.value)">
                    <button type="button" class="wms-br-mini-fill" ${!cfg.enabled ? 'disabled' : ''} onclick="updateBatchRelocateLockQuotaValue(${lck}, ${freeSlots})">เต็มช่องว่าง</button>
                </div>
                ${isOver ? `<div class="wms-br-lock-warn">⚠️ ช่องว่างไม่พอ (เข้าได้สูงสุด ${freeSlots} ตัว)</div>` : ''}
            </div>
        `;
    }).join('');
}

function renderBatchRelocateAlertBanner(totalToMove, assignedCount, occupiedCount, freeCount) {
    const alertBox = document.getElementById('wmsBrStatusAlert');
    if (!alertBox) return;

    if (assignedCount < totalToMove) {
        const shortage = totalToMove - assignedCount;
        alertBox.className = 'wms-br-alert-box warn';
        alertBox.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div>
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <strong>ช่องว่างในขอบเขตที่เลือกยังไม่พอ!</strong> เข้าได้ <strong>${assignedCount.toLocaleString()}</strong> S/N · ยังขาดอีก <strong>${shortage.toLocaleString()}</strong> S/N (พบช่องที่มีซีเรียลอยู่แล้ว ${occupiedCount.toLocaleString()} ช่อง)
                </div>
                <button type="button" class="wms-br-chip-btn primary" onclick="autoExpandSlotRangeToFitItems()">
                    <i class="fa-solid fa-expand"></i> ขยายช่วงช่องอัตโนมัติให้ครบ ${totalToMove.toLocaleString()} S/N
                </button>
            </div>
        `;
    } else {
        const firstCoord = wmsBatchRelocateState.assignments[0]?.newLocation || '-';
        const lastCoord = wmsBatchRelocateState.assignments[assignedCount - 1]?.newLocation || '-';
        alertBox.className = 'wms-br-alert-box ok';
        alertBox.innerHTML = `
            <i class="fa-solid fa-circle-check"></i>
            <strong>พร้อมย้ายครบทั้ง ${totalToMove.toLocaleString()} S/N (พิกัดไม่ซ้ำกัน 100%):</strong>
            รันตั้งแต่พิกัด <span class="mono font-bold">${escapeHTML(firstCoord)}</span> ถึง <span class="mono font-bold">${escapeHTML(lastCoord)}</span>
            ${occupiedCount > 0 ? `(ข้ามช่องที่มีซีเรียลเดิมอยู่แล้ว ${occupiedCount.toLocaleString()} ช่องให้อัตโนมัติ)` : '(ช่องว่างต่อเนื่องทั้งหมด)'}
        `;
    }
}

function renderBatchRelocatePreviewTable() {
    const wrap = document.getElementById('wmsBrSlotPreviewTableWrap');
    if (!wrap) return;

    if (!wmsBatchRelocateState.row) {
        wrap.innerHTML = `<div class="wms-br-empty-preview">กรุณาเลือกหรือกำหนดชื่อแถวปลายทางในขั้นตอนที่ 1 เพื่อแสดงตารางคิวพิกัด</div>`;
        return;
    }

    const filter = wmsBatchRelocateState.statusFilter;
    const filteredList = wmsBatchRelocateState.slotPreviewList.filter(slotObj => {
        if (filter === 'ALL') return true;
        return slotObj.status === filter;
    });

    if (filteredList.length === 0) {
        wrap.innerHTML = `<div class="wms-br-empty-preview">ไม่พบข้อมูลช่องในตัวกรองสถานะนี้</div>`;
        return;
    }

    const defaultLimit = 500;
    const isShowingAll = wmsBatchRelocateState.showAllPreviewRows || filteredList.length <= defaultLimit;
    const sliced = isShowingAll ? filteredList : filteredList.slice(0, defaultLimit);

    const rowsHtml = sliced.map((slotObj, idx) => {
        if (slotObj.status === 'OCCUPIED') {
            return `
                <tr class="row-occupied">
                    <td class="mono" style="color:var(--text-muted);">${idx + 1}</td>
                    <td class="mono font-bold">${escapeHTML(slotObj.coord)}</td>
                    <td><span class="wms-br-badge occupied"><i class="fa-solid fa-lock"></i> มีซีเรียลอยู่แล้ว (ข้าม)</span></td>
                    <td class="mono">${escapeHTML(slotObj.occupant?.sn || '-')}</td>
                    <td>${escapeHTML(slotObj.occupant?.name || slotObj.occupant?.category || 'สินค้าในคลัง')}</td>
                </tr>
            `;
        }
        if (slotObj.status === 'ASSIGNED') {
            return `
                <tr class="row-assigned">
                    <td class="mono" style="color:var(--text-muted);">${idx + 1}</td>
                    <td class="mono font-bold">${escapeHTML(slotObj.coord)}</td>
                    <td><span class="wms-br-badge assigned"><i class="fa-solid fa-circle-check"></i> เข้าได้ (จองย้ายเข้า)</span></td>
                    <td class="mono font-bold" style="color:#0284c7;">${escapeHTML(slotObj.assignedItem?.sn || '-')}</td>
                    <td>ย้ายจากเดิม: <span class="mono">${escapeHTML(slotObj.assignedItem?.location || '-')}</span></td>
                </tr>
            `;
        }
        return `
            <tr class="row-free">
                <td class="mono" style="color:var(--text-muted);">${idx + 1}</td>
                <td class="mono">${escapeHTML(slotObj.coord)}</td>
                <td><span class="wms-br-badge free"><i class="fa-regular fa-square"></i> ว่าง (สำรอง)</span></td>
                <td class="mono" style="color:var(--text-muted);">-</td>
                <td style="color:var(--text-muted);">พร้อมใช้งาน</td>
            </tr>
        `;
    }).join('');

    const footerBarHtml = filteredList.length > defaultLimit
        ? `<div class="wms-br-more-hint">
               <span>กำลังแสดง ${sliced.length.toLocaleString()} จากทั้งหมด ${filteredList.length.toLocaleString()} ช่อง</span>
               <button type="button" class="wms-br-chip-btn" onclick="toggleBatchRelocatePreviewLimit()">
                   ${isShowingAll ? 'ย่อแสดง 500 รายการแรก' : `แสดงทั้งหมด ${filteredList.length.toLocaleString()} รายการ`}
               </button>
           </div>`
        : '';

    wrap.innerHTML = `
        <table class="wms-br-table">
            <thead>
                <tr>
                    <th style="width:7%;">#</th>
                    <th style="width:24%;">พิกัดปลายทาง</th>
                    <th style="width:23%;">สถานะช่อง</th>
                    <th style="width:23%;">หมายเลข S/N</th>
                    <th style="width:23%;">รายละเอียด / พิกัดเดิม</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
        ${footerBarHtml}
    `;
}

function updateBatchRelocateConfirmButton() {
    const btn = document.getElementById('wmsBrConfirmBtn');
    if (!btn) return;

    const total = wmsBatchRelocateState.items.length;
    const assigned = wmsBatchRelocateState.assignments.length;
    const isAdmin = typeof isCurrentUserAdmin === 'function' ? isCurrentUserAdmin() : true;

    btn.disabled = !wmsBatchRelocateState.row || assigned === 0 || assigned < total;
    if (!wmsBatchRelocateState.row) {
        btn.innerHTML = `<i class="fa-solid fa-hand-pointer"></i> กรุณาเลือกแถวปลายทางก่อน`;
    } else if (assigned < total) {
        btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ช่องว่างไม่พอ (${assigned.toLocaleString()} / ${total.toLocaleString()} S/N)`;
    } else {
        btn.innerHTML = isAdmin
            ? `<i class="fa-solid fa-dolly"></i> ยืนยันย้ายพิกัดทันที (${assigned.toLocaleString()} S/N)`
            : `<i class="fa-solid fa-paper-plane"></i> ส่งคำขออนุมัติย้าย (${assigned.toLocaleString()} S/N)`;
    }
}

async function confirmAndExecuteBatchRelocate() {
    if (wmsBatchRelocateState.isExecuting) return;

    recalculateBatchRelocatePlan();
    const total = wmsBatchRelocateState.items.length;
    const assignments = wmsBatchRelocateState.assignments;

    if (!wmsBatchRelocateState.row) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณากำหนดชื่อแถวปลายทางก่อนยืนยัน', true);
        }
        return;
    }

    if (assignments.length === 0 || assignments.length < total) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณาขยายช่วงช่องว่างให้ครบตามจำนวน S/N ก่อนยืนยันการย้าย', true);
        }
        return;
    }

    const verifyUniqueSet = new Set();
    for (let i = 0; i < assignments.length; i++) {
        const key = normalizeBatchCoordKey(assignments[i].newLocation);
        if (verifyUniqueSet.has(key)) {
            if (typeof showToast === 'function') {
                showToast(`❌ ตรวจพบพิกัดซ้ำซ้อนที่ ${assignments[i].newLocation} ระบบระงับการบันทึกเพื่อความปลอดภัย`, true);
            }
            return;
        }
        verifyUniqueSet.add(key);
    }

    const reasonInput = document.getElementById('wmsBrReasonInput');
    const reasonText = reasonInput ? reasonInput.value.trim() : '';
    const isAdmin = typeof isCurrentUserAdmin === 'function' ? isCurrentUserAdmin() : true;

    const modal = document.getElementById('wmsUnifiedBatchRelocateModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active', 'show', 'open', 'is-open');
    }
    if (typeof syncStockDetailParentState === 'function') syncStockDetailParentState();

    if (!isAdmin) {
        await submitBatchRelocateApprovalRequests(assignments, reasonText);
        return;
    }

    await executeChunkedBatchRelocate(assignments, reasonText);
}

async function submitBatchRelocateApprovalRequests(assignments, reasonText = '') {
    wmsBatchRelocateState.isExecuting = true;
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    const requesterName = typeof getCurrentReceiverName === 'function' ? getCurrentReceiverName() : 'User';
    const totalCount = assignments.length;

    if (typeof showDbLoadingPopup === 'function') {
        showDbLoadingPopup(
            'กำลังส่งคำขออนุมัติย้ายพิกัด...',
            `จัดเตรียมคำขอย้ายพิกัดแบบไม่ซ้ำจำนวน ${totalCount.toLocaleString()} S/N ส่งให้ผู้ดูแลระบบ`,
            20,
            { iconClass: 'fa-solid fa-paper-plane wms-db-center-icon', lockClose: true }
        );
    }

    try {
        if (client && navigator.onLine) {
            const CHUNK_SIZE = 200;
            const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);
            for (let c = 0; c < totalChunks; c++) {
                const slice = assignments.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
                const payload = slice.map(entry => ({
                    request_type: 'RELOCATE',
                    sn: entry.item.sn,
                    category: entry.item.category || '',
                    name: entry.item.name || '',
                    location: entry.oldLocation,
                    target_location: entry.newLocation,
                    requested_by: requesterName,
                    reason: reasonText || `ขอย้ายพิกัดกลุ่มไปยัง ${entry.newLocation}`,
                    status: 'PENDING',
                    created_at: new Date().toISOString()
                }));

                const { error } = await client.from('approval_requests').insert(payload);
                if (error) throw error;

                const pct = Math.min(95, Math.round(((c + 1) / totalChunks) * 90));
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        'กำลังส่งคำขออนุมัติย้ายพิกัด...',
                        `ส่งชุดที่ ${c + 1}/${totalChunks} เรียบร้อยแล้ว`,
                        pct,
                        `ส่งคำขอแล้ว ${Math.min(totalCount, (c + 1) * CHUNK_SIZE).toLocaleString()} / ${totalCount.toLocaleString()} S/N`
                    );
                }
            }
        }

        wmsBatchRelocateState.isExecuting = false;
        if (typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'ส่งคำขออนุมัติย้ายพิกัดสำเร็จ!',
                `ส่งคำขอย้ายจำนวน ${totalCount.toLocaleString()} S/N ไปยังส่วนอนุมัติคำขอของ Admin แล้ว`,
                100,
                'รอผู้ดูแลระบบอนุมัติ',
                'success'
            );
            setTimeout(() => {
                if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
            }, 1200);
        }
        if (typeof showToast === 'function') {
            showToast(`📩 ส่งคำขออนุมัติย้าย ${totalCount.toLocaleString()} S/N เรียบร้อยแล้ว`);
        }
    } catch (err) {
        wmsBatchRelocateState.isExecuting = false;
        if (typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'เกิดข้อผิดพลาดในการส่งคำขออนุมัติ',
                'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
                100,
                'ส่งคำขอไม่สำเร็จ',
                'error'
            );
            setTimeout(() => {
                if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
            }, 1500);
        }
    }
}

async function executeChunkedBatchRelocate(assignments, reasonText = '') {
    wmsBatchRelocateState.isExecuting = true;
    const totalCount = assignments.length;
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    const nowIso = new Date().toISOString();
    let failedUpdates = 0;

    const updateBySnUpper = new Map();
    assignments.forEach(entry => {
        const snUpper = typeof normalizeSnKey === 'function'
            ? normalizeSnKey(entry.item.sn)
            : String(entry.item.sn || '').trim().toUpperCase();
        updateBySnUpper.set(snUpper, entry.newLocation);
    });

    // อัปเดตหน่วยความจำและ UI ทันทีแบบ Optimistic Realtime เพื่อให้หน้าเว็บตอบสนองทันใจ 100%
    if (Array.isArray(globalInventoryData)) {
        for (let i = 0; i < globalInventoryData.length; i++) {
            const item = globalInventoryData[i];
            const snUpper = typeof normalizeSnKey === 'function'
                ? normalizeSnKey(item.sn)
                : String(item.sn || '').trim().toUpperCase();
            if (updateBySnUpper.has(snUpper)) {
                item.location = updateBySnUpper.get(snUpper);
                item.updated_at = nowIso;
            }
        }
        try {
            localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(globalInventoryData));
        } catch (e) {}
    }

    if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();
    if (typeof filterInventoryData === 'function') filterInventoryData(true);
    if (typeof updateKPIs === 'function') updateKPIs();
    if (typeof renderStockDetailModalTable === 'function' && currentDetailModalGroupKey) {
        renderStockDetailModalTable();
    }

    if (typeof showDbLoadingPopup === 'function') {
        showDbLoadingPopup(
            `กำลังย้ายพิกัดสินค้า (${totalCount.toLocaleString()} S/N)...`,
            'กำลังอัปเดตพิกัดใหม่ลงฐานข้อมูลแบบรันคิวความเร็วสูง (ไม่ซ้ำพิกัด 100%)',
            10,
            {
                iconClass: 'fa-solid fa-dolly wms-db-center-icon',
                badgeHtml: '<span class="wms-db-dot" style="background:#0284c7;"></span> กำลังอัปเดตพิกัดคลังสินค้า',
                counterText: `0 / ${totalCount.toLocaleString()} รายการ`,
                lockClose: true
            }
        );
    }

    try {
        if (client && navigator.onLine) {
            const CHUNK_SIZE = 240;
            const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);
            let processed = 0;

            for (let c = 0; c < totalChunks; c++) {
                const slice = assignments.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
                const SUB_BATCH = 30;

                for (let s = 0; s < slice.length; s += SUB_BATCH) {
                    const miniBatch = slice.slice(s, s + SUB_BATCH);
                    await Promise.all(
                        miniBatch.map(async (entry) => {
                            const hasValidDbId = entry.item.id !== null &&
                                entry.item.id !== undefined &&
                                entry.item.id !== '' &&
                                !String(entry.item.id).startsWith('offline_') &&
                                !String(entry.item.id).startsWith('temp_');

                            let updatedOk = false;
                            for (let attempt = 1; attempt <= 3 && !updatedOk; attempt++) {
                                try {
                                    const query = client
                                        .from('warehouse_items')
                                        .update({ location: entry.newLocation, updated_at: nowIso });

                                    const { error } = hasValidDbId
                                        ? await query.eq('id', entry.item.id)
                                        : await query.eq('sn', entry.item.sn);

                                    if (error) throw error;
                                    updatedOk = true;
                                } catch (retryErr) {
                                    if (attempt < 3) {
                                        await new Promise(res => setTimeout(res, 220 * attempt));
                                    } else {
                                        failedUpdates++;
                                    }
                                }
                            }
                        })
                    );
                }

                processed += slice.length;
                const pct = Math.min(95, Math.round((processed / totalCount) * 90));
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        `กำลังย้ายพิกัดสินค้า (${totalCount.toLocaleString()} S/N)...`,
                        `อัปเดตชุดที่ ${c + 1} / ${totalChunks} เรียบร้อยแล้ว`,
                        pct,
                        `ย้ายแล้ว ${processed.toLocaleString()} / ${totalCount.toLocaleString()} รายการ`
                    );
                }
            }

            try {
                const actor = typeof getCurrentReceiverName === 'function' ? getCurrentReceiverName() : 'Admin';
                const firstLoc = assignments[0]?.newLocation || '';
                const lastLoc = assignments[assignments.length - 1]?.newLocation || '';
                await client.from('inventory_logs').insert([{
                    action: 'BATCH_RELOCATE',
                    details: `ย้ายพิกัดกลุ่มจำนวน ${totalCount.toLocaleString()} S/N ไปยัง ${firstLoc} - ${lastLoc}${reasonText ? ` (${reasonText})` : ''}`,
                    performed_by: actor,
                    created_at: nowIso
                }]);
            } catch (logIgnore) {}
        }

        wmsBatchRelocateState.isExecuting = false;

        if (typeof rebuildOccupiedSet === 'function') rebuildOccupiedSet();
        if (typeof filterInventoryData === 'function') filterInventoryData(true);
        if (typeof updateKPIs === 'function') updateKPIs();
        if (typeof renderStockDetailModalTable === 'function' && currentDetailModalGroupKey) {
            renderStockDetailModalTable();
        }
        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        if (typeof loadRecentInboundFeedFromDB === 'function') await loadRecentInboundFeedFromDB();

        window.dispatchEvent(new CustomEvent('wms_inventory_updated', {
            detail: { count: Array.isArray(globalInventoryData) ? globalInventoryData.length : 0, relocatedCount: totalCount }
        }));

        if (failedUpdates === 0) {
            if (typeof updateDbLoadingPopup === 'function') {
                updateDbLoadingPopup(
                    `ย้ายพิกัดสำเร็จครบทั้ง ${totalCount.toLocaleString()} รายการ!`,
                    `จัดเรียงเข้าพิกัด ${assignments[0]?.newLocation} ถึง ${assignments[assignments.length - 1]?.newLocation} เรียบร้อยแล้ว (ไม่ซ้ำพิกัด 100%)`,
                    100,
                    `เสร็จสมบูรณ์ ${totalCount.toLocaleString()} / ${totalCount.toLocaleString()} S/N`,
                    'success'
                );
                setTimeout(() => {
                    if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
                }, 900);
            }

            if (typeof showToast === 'function') {
                showToast(`✅ ย้ายพิกัดสำเร็จ ${totalCount.toLocaleString()} S/N เรียบร้อยแล้ว`);
            }
        } else {
            if (typeof updateDbLoadingPopup === 'function') {
                updateDbLoadingPopup(
                    'ย้ายพิกัดเสร็จสิ้น (มีบางรายการเชื่อมต่อขัดข้อง)',
                    `ย้ายสำเร็จ ${(totalCount - failedUpdates).toLocaleString()} / ${totalCount.toLocaleString()} รายการ กรุณาตรวจสอบอีกครั้ง`,
                    100,
                    `ไม่สำเร็จ ${failedUpdates.toLocaleString()} รายการ`,
                    'error'
                );
                setTimeout(() => {
                    if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
                }, 1800);
            }
        }
    } catch (err) {
        wmsBatchRelocateState.isExecuting = false;
        if (typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'เกิดข้อผิดพลาดระหว่างการย้ายพิกัด',
                'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
                100,
                'การย้ายพิกัดหยุดชะงัก',
                'error'
            );
            setTimeout(() => {
                if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
            }, 1600);
        }
    }
}

// =========================================================================
// --- UNIFIED ACTION TRIGGERS (PRINT / EDIT / RELOCATE / DELETE) ---
// =========================================================================
function triggerPrintBarcodeAction(mode = 'SINGLE', sn = null) {
    const isBatchPrint = (mode === 'ALL_FILTERED' || mode === 'GROUP' || mode === 'MULTI');
    if (isBatchPrint && typeof window.WMSBarcodeStudio !== 'undefined' && typeof window.WMSBarcodeStudio.showLoadingPopup === 'function') {
        const countHint = mode === 'ALL_FILTERED'
            ? currentFilteredItems.length
            : (mode === 'MULTI' ? getScopedSelectedItems().length : 0);
        window.WMSBarcodeStudio.showLoadingPopup(
            'กำลังเตรียมศูนย์พิมพ์บาร์โค้ดและสติกเกอร์...',
            countHint > 0 ? `กำลังจัดเรียงข้อมูลบาร์โค้ดจำนวน ${countHint.toLocaleString()} รายการ` : 'กรุณารอสักครู่ ระบบกำลังรวบรวมรายการ S/N',
            20,
            'กำลังโหลดรายการ...',
            false
        );
    }

    const executeOpen = () => {
        if (typeof openPrintBarcodeModal === 'function') {
            openPrintBarcodeModal(mode, sn);
        } else if (typeof window.openPrintBarcodeModal === 'function') {
            window.openPrintBarcodeModal(mode, sn);
        }
        if (typeof elevateTopModal === 'function' && typeof WMS_ACTION_MODAL_GROUPS !== 'undefined') {
            elevateTopModal(WMS_ACTION_MODAL_GROUPS.print, 'print');
        }
    };

    if (isBatchPrint) {
        requestAnimationFrame(executeOpen);
    } else {
        executeOpen();
    }
}

function triggerEditItemAction(id, sn) {
    if (typeof openEditItemModal === 'function') {
        openEditItemModal(id, sn);
    } else if (typeof window.openEditItemModal === 'function') {
        window.openEditItemModal(id, sn);
    }
    if (typeof elevateTopModal === 'function' && typeof WMS_ACTION_MODAL_GROUPS !== 'undefined') {
        elevateTopModal(WMS_ACTION_MODAL_GROUPS.edit, 'edit');
    }
}

function triggerRelocateAction(id, sn, name, location) {
    if (typeof requestRelocateModal === 'function') {
        requestRelocateModal(id, sn, name, location);
    } else if (typeof window.requestRelocateModal === 'function') {
        window.requestRelocateModal(id, sn, name, location);
    }
    if (typeof elevateTopModal === 'function' && typeof WMS_ACTION_MODAL_GROUPS !== 'undefined') {
        elevateTopModal(WMS_ACTION_MODAL_GROUPS.relocate, 'relocate');
    }
}

function triggerDeleteItemAction(mode, sn, id) {
    if (mode === 'BATCH') {
        const scopedItems = getScopedSelectedItems();
        openUnifiedBulkDeleteModal({
            mode: 'BATCH',
            title: `ลบรายการที่เลือก (${scopedItems.length.toLocaleString()} S/N)`,
            items: scopedItems
        });
        return;
    }
    openUnifiedBulkDeleteModal({
        mode: 'SINGLE',
        sn: sn,
        id: id,
        title: `ลบซีเรียลสินค้า: ${sn}`
    });
}

window.requestDeleteModal = function (mode = 'SINGLE', sn = null, id = null) {
    triggerDeleteItemAction(mode, sn, id);
};

function triggerBatchRelocateAction(preselectedItems = null) {
    openUnifiedBatchRelocateModal(preselectedItems);
    if (typeof elevateTopModal === 'function' && typeof WMS_ACTION_MODAL_GROUPS !== 'undefined') {
        elevateTopModal(WMS_ACTION_MODAL_GROUPS.relocate, 'relocate');
    }
}

// =========================================================================
// --- POST-LOAD OVERRIDE & CLICK CAPTURE GUARD (ENSURES BOTH BUTTONS WORK) ---
// =========================================================================
function bindSmartBatchRelocateHooks() {
    window.requestBatchRelocateModal = openUnifiedBatchRelocateModal;
    window.openBatchRelocateModal = openUnifiedBatchRelocateModal;
    window.openUnifiedBatchRelocateModal = openUnifiedBatchRelocateModal;
    window.relocateSelectedFromModal = relocateSelectedFromModal;
    window.relocateSelectedItemsFromInventory = relocateSelectedItemsFromInventory;
    window.relocateSelectedFromInventory = relocateSelectedItemsFromInventory;
    window.batchRelocateSelected = relocateSelectedItemsFromInventory;
    window.triggerBatchRelocateAction = triggerBatchRelocateAction;
}

bindSmartBatchRelocateHooks();
document.addEventListener('DOMContentLoaded', bindSmartBatchRelocateHooks);
window.addEventListener('load', () => {
    bindSmartBatchRelocateHooks();
    setTimeout(bindSmartBatchRelocateHooks, 300);
});

document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, a, [role="button"]');
    if (!btn) return;
    if (btn.closest('#wmsUnifiedBatchRelocateModal')) return;

    const onclickAttr = (btn.getAttribute('onclick') || '').trim();
    const btnText = (btn.textContent || '').replace(/\s+/g, ' ').trim();

    const isBatchRelocateHandler =
        onclickAttr.includes('requestBatchRelocateModal') ||
        onclickAttr.includes('openBatchRelocateModal') ||
        onclickAttr.includes('triggerBatchRelocateAction') ||
        onclickAttr.includes('relocateSelectedFromModal') ||
        onclickAttr.includes('relocateSelectedItemsFromInventory') ||
        onclickAttr.includes('batchRelocate');

    const isBatchRelocateLabel =
        btnText.includes('ย้ายรายการที่เลือก') ||
        btnText.includes('ย้ายพิกัดที่เลือก');

    if (isBatchRelocateHandler || isBatchRelocateLabel) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openUnifiedBatchRelocateModal();
    }
}, true);

// Global Exports
window.printSelectedBarcodesFromModal = printSelectedBarcodesFromModal;
window.printAllGroupBarcodesFromModal = printAllGroupBarcodesFromModal;
window.printAllFilteredBarcodesFromInventory = printAllFilteredBarcodesFromInventory;
window.relocateSelectedFromModal = relocateSelectedFromModal;
window.relocateSelectedItemsFromInventory = relocateSelectedItemsFromInventory;
window.deleteSelectedFromModal = deleteSelectedFromModal;
window.deleteAllGroupFromModal = deleteAllGroupFromModal;
window.deleteGroupItemsFromInventory = deleteGroupItemsFromInventory;
window.deleteSelectedItemsFromInventory = deleteSelectedItemsFromInventory;
window.deleteAllFilteredItemsFromInventory = deleteAllFilteredItemsFromInventory;
window.openPasteBulkDeleteModal = openPasteBulkDeleteModal;
window.closeUnifiedBulkDeleteModal = closeUnifiedBulkDeleteModal;
window.recalculatePastedBulkDeleteTargets = recalculatePastedBulkDeleteTargets;
window.confirmAndRunUnifiedBulkDelete = confirmAndRunUnifiedBulkDelete;
window.executeChunkedWarehouseDelete = executeChunkedWarehouseDelete;
window.triggerPrintBarcodeAction = triggerPrintBarcodeAction;
window.triggerEditItemAction = triggerEditItemAction;
window.triggerRelocateAction = triggerRelocateAction;
window.triggerDeleteItemAction = triggerDeleteItemAction;
window.triggerBatchRelocateAction = triggerBatchRelocateAction;
window.openUnifiedBatchRelocateModal = openUnifiedBatchRelocateModal;
window.closeUnifiedBatchRelocateModal = closeUnifiedBatchRelocateModal;
window.toggleBatchRelocateRowPicker = toggleBatchRelocateRowPicker;
window.setBatchRelocateRowPickerZoneFilter = setBatchRelocateRowPickerZoneFilter;
window.selectBatchRelocateRowFromPicker = selectBatchRelocateRowFromPicker;
window.clearBatchRelocateCustomRow = clearBatchRelocateCustomRow;
window.onBatchRelocateRowInput = onBatchRelocateRowInput;
window.onBatchRelocateFormatChange = onBatchRelocateFormatChange;
window.saveCurrentConfigAsUserPreset = saveCurrentConfigAsUserPreset;
window.applyUserCustomRelocatePreset = applyUserCustomRelocatePreset;
window.deleteUserCustomRelocatePreset = deleteUserCustomRelocatePreset;
window.switchBatchRelocateMode = switchBatchRelocateMode;
window.autoExpandSlotRangeToFitItems = autoExpandSlotRangeToFitItems;
window.onBatchRelocateFilterChange = onBatchRelocateFilterChange;
window.setBatchRelocateSlotFilter = setBatchRelocateSlotFilter;
window.toggleBatchRelocatePreviewLimit = toggleBatchRelocatePreviewLimit;
window.toggleBatchRelocateLockQuota = toggleBatchRelocateLockQuota;
window.updateBatchRelocateLockQuotaValue = updateBatchRelocateLockQuotaValue;
window.autoDistributeQuotasAcrossSelectedLocks = autoDistributeQuotasAcrossSelectedLocks;
window.recalculateBatchRelocatePlan = recalculateBatchRelocatePlan;
window.confirmAndExecuteBatchRelocate = confirmAndExecuteBatchRelocate;
window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.bulkDeleteLoaded = true;
window.WMSStockModules.bulkRelocateLoaded = true;