// =========================================================================
// --- MODULE 2D: HIGH-SCALE CHUNKED BULK DELETE & DELETE APPROVAL SUBMIT  ---
// --- FILE: inv-bulk-delete-core.js (v28.0 - FULL MODULAR ARCHITECTURE)  ---
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
// --- HIGH-SCALE CHUNKED BULK DELETE MODAL & EXECUTION ENGINE           ---
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

                    <div id="wmsBulkDelSafetyNote" style="padding:10px 14px; border-radius:10px; background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:0.82rem; line-height:1.5;">
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
        statEl.innerHTML = `พบในสต็อกปัจจุบัน <strong style="color:#dc2626;">${matchedItems.length.toLocaleString()}</strong> S/N · ไม่พบในสต็อก ${unmatchedSns.length.toLocaleString()} S/N (แบ่งชุด ${totalBatches.toLocaleString()} ชุด)`;
    }

    if (summaryBox) {
        summaryBox.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700; color:var(--text-sub);">จำนวน S/N ที่ตรงกับสต็อกในคลัง:</span>
                <span class="mono font-bold" style="font-size:1.15rem; color:#dc2626;">${matchedItems.length.toLocaleString()} รายการ</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.84rem; color:var(--text-muted);">
                <span>จำนวนรอบการประมวลผล (200 S/N ต่อรอบ):</span>
                <span class="mono font-bold">${totalBatches.toLocaleString()} รอบ</span>
            </div>
        `;
    }

    if (confirmBtn) {
        const isAdmin = typeof isWmsAdminStrict === 'function' ? isWmsAdminStrict() : false;
        confirmBtn.disabled = matchedItems.length === 0;
        confirmBtn.innerHTML = isAdmin
            ? `<i class="fa-solid fa-trash-can"></i> ยืนยันลบถาวร (${matchedItems.length.toLocaleString()} S/N)`
            : `<i class="fa-solid fa-paper-plane"></i> ส่งคำขออนุมัติลบ (${matchedItems.length.toLocaleString()} S/N)`;
    }
}

function openUnifiedBulkDeleteModal(config) {
    const modal = ensureUnifiedBulkDeleteModalExists();
    const isAdmin = typeof isWmsAdminStrict === 'function' ? isWmsAdminStrict() : false;

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
    const safetyNoteEl = document.getElementById('wmsBulkDelSafetyNote');
    const summaryBox = document.getElementById('wmsBulkDelSummaryBox');
    const pasteSection = document.getElementById('wmsBulkDelPasteSection');
    const pasteTextarea = document.getElementById('wmsBulkDelPasteTextarea');
    const reasonInput = document.getElementById('wmsBulkDelReasonInput');
    const confirmBtn = document.getElementById('wmsBulkDelConfirmBtn');

    if (titleEl) titleEl.textContent = wmsPendingBulkDeleteContext.title;
    if (roleHintEl) {
        roleHintEl.textContent = isAdmin
            ? 'สิทธิ์ผู้ดูแลระบบ (Admin): ลบออกจากฐานข้อมูลและอัปเดตหน้าเว็บทันทีโดยไม่ต้องรออนุมัติ'
            : 'สิทธิ์ผู้ใช้งานทั่วไป: ระบบจะส่งคำขอไปยังเมนูศูนย์อนุมัติคำขอของ Admin ก่อนลบออกจากฐานข้อมูล';
    }
    if (safetyNoteEl) {
        safetyNoteEl.innerHTML = isAdmin
            ? `<i class="fa-solid fa-shield-halved"></i> <strong>สิทธิ์ Admin (ดำเนินการทันที):</strong> รายการที่ลบจะหายออกจากตารางหน้าเว็บไซต์ แคชในเครื่อง และฐานข้อมูล Supabase ทันที`
            : `<i class="fa-solid fa-lock"></i> <strong>ระบบความปลอดภัย 2 ชั้น (ส่งเข้าศูนย์อนุมัติคำขอ):</strong> รายการในสต็อกจะยังไม่ถูกลบจนกว่ารหัส <strong>Admin</strong> จะกดอนุมัติในหน้าเมนูศูนย์อนุมัติคำขอ`;
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
                    <span style="font-weight:700; color:var(--text-sub);">จำนวนซีเรียลที่จะ${isAdmin ? 'ลบ' : 'ส่งคำขอลบ'}ทั้งหมด:</span>
                    <span class="mono font-bold" style="font-size:1.2rem; color:#dc2626;">${targetItems.length.toLocaleString()} S/N</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.84rem; color:var(--text-muted);">
                    <span>จำนวนรุ่นสินค้าที่เกี่ยวข้อง / รอบการส่งข้อมูล:</span>
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
    const isAdmin = typeof isWmsAdminStrict === 'function' ? isWmsAdminStrict() : false;

    const modal = document.getElementById('wmsUnifiedBulkDeleteModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active', 'show', 'open', 'is-open');
    }
    if (typeof syncStockDetailParentState === 'function') syncStockDetailParentState();

    // User ทั่วไป -> ส่งคำขอลบเข้าศูนย์อนุมัติคำขอทุกครั้ง
    if (!isAdmin) {
        await submitBulkDeleteApprovalRequest(itemsToDelete, reasonText);
        return;
    }

    // Admin -> ลบในฐานข้อมูลทันทีโดยไม่ต้องรออนุมัติ
    await executeChunkedWarehouseDelete(itemsToDelete, reasonText);
}

async function submitBulkDeleteApprovalRequest(itemsToDelete, reasonText = '') {
    const client = typeof resolveWmsSupabaseClient === 'function'
        ? resolveWmsSupabaseClient()
        : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : null);

    const requesterName = typeof getCurrentReceiverName === 'function' ? getCurrentReceiverName() : 'ผู้ใช้งานทั่วไป';

    if (!client) {
        if (typeof showWmsCornerNotification === 'function') {
            showWmsCornerNotification({
                variant: 'WARN',
                title: 'ไม่พบการเชื่อมต่อฐานข้อมูล',
                description: 'กรุณารีเฟรชหน้าเว็บแล้วลองส่งคำขอใหม่อีกครั้ง',
                durationMs: 4000,
                playSound: true
            });
        }
        return;
    }

    // กรองรายการที่ส่งคำขอ PENDING ค้างอยู่แล้วออก
    let allowedItems = itemsToDelete;
    let skippedPendingCount = 0;
    if (typeof filterOutAlreadyPendingRequestSns === 'function') {
        const res = await filterOutAlreadyPendingRequestSns(client, itemsToDelete, 'DELETE');
        allowedItems = res.allowedItems;
        skippedPendingCount = res.skippedPendingCount;
    }

    if (allowedItems.length === 0) {
        if (typeof showWmsCornerNotification === 'function') {
            showWmsCornerNotification({
                variant: 'WARN',
                title: 'รายการนี้อยู่ระหว่างรออนุมัติแล้ว',
                description: `ทั้ง ${skippedPendingCount.toLocaleString()} S/N ถูกส่งไปยังศูนย์อนุมัติก่อนหน้านี้แล้ว`,
                durationMs: 3600,
                playSound: true
            });
        }
        return;
    }

    const totalCount = allowedItems.length;
    const batchId = `DEL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    if (typeof showDbLoadingPopup === 'function') {
        showDbLoadingPopup(
            'กำลังส่งคำขอไปยังศูนย์อนุมัติ...',
            `กำลังส่งคำขอลบจำนวน ${totalCount.toLocaleString()} S/N ให้ผู้ดูแลระบบ (Admin)`,
            20,
            { iconClass: 'fa-solid fa-paper-plane wms-db-center-icon', lockClose: true }
        );
    }

    try {
        const normalizedRecords = allowedItems.map(item => ({
            request_type: 'DELETE',
            batch_id: batchId,
            sn: item.sn,
            category: item.category || '',
            name: item.name || '',
            location: item.location || '',
            target_location: '',
            requested_by: requesterName,
            reason: reasonText || 'ขอลบรายการจากหน้าเช็คสต็อก',
            created_at: nowIso
        }));

        await submitApprovalRequestsResilient(
            client,
            normalizedRecords,
            (chunkNum, totalChunks, sentItems, allItems) => {
                const pct = Math.min(95, Math.round((chunkNum / totalChunks) * 90));
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        'กำลังส่งคำขอไปยังศูนย์อนุมัติ...',
                        `ส่งชุดที่ ${chunkNum}/${totalChunks} เรียบร้อยแล้ว`,
                        pct,
                        `ส่งคำขอแล้ว ${sentItems.toLocaleString()} / ${allItems.toLocaleString()} S/N`
                    );
                }
            }
        );

        try {
            await client.from('inventory_logs').insert([{
                action: 'REQUEST_DELETE',
                details: `ส่งคำขอลบสินค้าจำนวน ${totalCount.toLocaleString()} S/N เข้าศูนย์อนุมัติ${reasonText ? ` (${reasonText})` : ''}`,
                performed_by: requesterName,
                created_at: nowIso
            }]);
        } catch (logIgnore) {}

        if (typeof hideDbLoadingPopup === 'function') {
            hideDbLoadingPopup(false);
        }

        // ซิงค์แจ้งเตือนไปยังหน้าต่างของ Admin ทันที
        if (typeof broadcastNewApprovalRequestEvent === 'function') {
            broadcastNewApprovalRequestEvent({
                request_type: 'DELETE',
                batch_id: batchId,
                count: totalCount,
                sn: allowedItems[0]?.sn || '',
                requested_by: requesterName,
                created_at: nowIso
            });
        }

        // แสดงไอคอนแจ้งเตือนมุมขวาล่างขนาดกะทัดรัด + เสียงกระดิ่ง (ไม่มีเสียงคน/AI) แล้วหายไปเอง
        const descText = skippedPendingCount > 0
            ? `ส่งคำขอลบ ${totalCount.toLocaleString()} S/N แล้ว (ข้ามรายการที่รออนุมัติอยู่ ${skippedPendingCount.toLocaleString()} รายการ)`
            : `ส่งคำขอลบ ${totalCount.toLocaleString()} S/N ไปยังศูนย์อนุมัติของ Admin แล้ว`;

        if (typeof showWmsCornerNotification === 'function') {
            showWmsCornerNotification({
                variant: 'USER_SUBMIT',
                title: 'ส่งคำขออนุมัติเรียบร้อย',
                description: descText,
                durationMs: 3400,
                playSound: true
            });
        }
    } catch (err) {
        if (typeof hideDbLoadingPopup === 'function') {
            hideDbLoadingPopup(false);
        }
        const reasonMsg = err?.message ? ` (${err.message})` : '';
        if (typeof showWmsCornerNotification === 'function') {
            showWmsCornerNotification({
                variant: 'WARN',
                title: 'ส่งคำขออนุมัติไม่สำเร็จ',
                description: `ไม่สามารถบันทึกคำขอได้${reasonMsg} กรุณาลองใหม่อีกครั้ง`,
                durationMs: 4500,
                playSound: true
            });
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

    const client = typeof resolveWmsSupabaseClient === 'function'
        ? resolveWmsSupabaseClient()
        : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : null);

    try {
        if (client) {
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

// Global Exports for Delete Core Module
window.printSelectedBarcodesFromModal = printSelectedBarcodesFromModal;
window.printAllGroupBarcodesFromModal = printAllGroupBarcodesFromModal;
window.printAllFilteredBarcodesFromInventory = printAllFilteredBarcodesFromInventory;
window.deleteSelectedFromModal = deleteSelectedFromModal;
window.deleteAllGroupFromModal = deleteAllGroupFromModal;
window.deleteGroupItemsFromInventory = deleteGroupItemsFromInventory;
window.deleteSelectedItemsFromInventory = deleteSelectedItemsFromInventory;
window.deleteAllFilteredItemsFromInventory = deleteAllFilteredItemsFromInventory;
window.openPasteBulkDeleteModal = openPasteBulkDeleteModal;
window.closeUnifiedBulkDeleteModal = closeUnifiedBulkDeleteModal;
window.recalculatePastedBulkDeleteTargets = recalculatePastedBulkDeleteTargets;
window.confirmAndRunUnifiedBulkDelete = confirmAndRunUnifiedBulkDelete;
window.submitBulkDeleteApprovalRequest = submitBulkDeleteApprovalRequest;
window.executeChunkedWarehouseDelete = executeChunkedWarehouseDelete;

window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.bulkDeleteLoaded = true;