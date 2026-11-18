// =========================================================================
// --- MODULE 2D + 2E: MAIN COORDINATOR, AUTO-LOADER & ACTION GUARD      ---
// --- FILE: inv-bulk-delete.js (v28.2 MODULAR ARCHITECTURE - FULL)       ---
// --- SUB-MODULES:                                                      ---
// ---   1. inv-approval-link.js       (Approval Sync, Notifier & Audio) ---
// ---   2. inv-bulk-delete-core.js    (Chunked Delete & Delete Request) ---
// ---   3. inv-bulk-delete-relocate.js(Batch Relocate & Move Request)   ---
// =========================================================================

(function bootstrapModularInventorySubFiles() {
    window.WMSStockModules = window.WMSStockModules || {};

    let basePath = '';
    try {
        const currentSrc = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
        if (currentSrc && currentSrc.includes('/')) {
            basePath = currentSrc.substring(0, currentSrc.lastIndexOf('/') + 1);
        }
    } catch (e) {}

    const subFiles = [
        { flag: 'approvalLinkLoaded', file: 'inv-approval-link.js' },
        { flag: 'bulkDeleteLoaded', file: 'inv-bulk-delete-core.js' },
        { flag: 'bulkRelocateLoaded', file: 'inv-bulk-delete-relocate.js' }
    ];

    subFiles.forEach(entry => {
        if (window.WMSStockModules[entry.flag]) return;
        const alreadyInDom = Array.from(document.querySelectorAll('script[src]')).some(s =>
            (s.getAttribute('src') || '').includes(entry.file)
        );
        if (alreadyInDom) return;

        const scriptEl = document.createElement('script');
        scriptEl.src = `${basePath}${entry.file}?v=28.2`;
        scriptEl.async = false; // รักษาลำดับการทำงานที่ถูกต้อง 100%
        document.head.appendChild(scriptEl);
    });
})();

// =========================================================================
// --- UNIFIED ACTION TRIGGERS (PRINT / EDIT / RELOCATE / DELETE)        ---
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
    const isAdmin = typeof isWmsAdminStrict === 'function' ? isWmsAdminStrict() : false;

    // หากเป็น User ทั่วไป บังคับส่งคำขออนุมัติย้ายพิกัดเข้าศูนย์อนุมัติเสมอ
    if (!isAdmin) {
        const snUpper = typeof normalizeSnKey === 'function'
            ? normalizeSnKey(sn)
            : String(sn || '').trim().toUpperCase();
        const found = Array.isArray(globalInventoryData)
            ? globalInventoryData.find(i => (typeof normalizeSnKey === 'function' ? normalizeSnKey(i.sn) : String(i.sn || '').trim().toUpperCase()) === snUpper || (id && String(i.id) === String(id)))
            : null;
        const targetItem = found || { id: id || null, sn: sn, name: name || '-', category: '-', location: location || '-' };
        if (typeof openUnifiedBatchRelocateModal === 'function') {
            openUnifiedBatchRelocateModal([targetItem]);
        } else if (typeof window.submitLocationTransferWithRoleGuard === 'function') {
            const newLoc = window.prompt(`ระบุพิกัดปลายทางใหม่สำหรับ S/N: ${sn}`);
            if (newLoc && newLoc.trim()) {
                window.submitLocationTransferWithRoleGuard([sn], newLoc.trim(), {
                    name: targetItem.name,
                    category: targetItem.category,
                    source_location: targetItem.location
                });
            }
        }
        return;
    }

    if (typeof requestRelocateModal === 'function') {
        requestRelocateModal(id, sn, name, location);
    } else if (typeof window.requestRelocateModal === 'function') {
        window.requestRelocateModal(id, sn, name, location);
    } else if (typeof openUnifiedBatchRelocateModal === 'function') {
        const snUpper = typeof normalizeSnKey === 'function'
            ? normalizeSnKey(sn)
            : String(sn || '').trim().toUpperCase();
        const found = Array.isArray(globalInventoryData)
            ? globalInventoryData.find(i => (typeof normalizeSnKey === 'function' ? normalizeSnKey(i.sn) : String(i.sn || '').trim().toUpperCase()) === snUpper)
            : null;
        openUnifiedBatchRelocateModal([found || { id: id || null, sn: sn, name: name || '-', category: '-', location: location || '-' }]);
    }

    if (typeof elevateTopModal === 'function' && typeof WMS_ACTION_MODAL_GROUPS !== 'undefined') {
        elevateTopModal(WMS_ACTION_MODAL_GROUPS.relocate, 'relocate');
    }
}

function triggerDeleteItemAction(mode, sn, id) {
    if (mode === 'BATCH') {
        const scopedItems = typeof getScopedSelectedItems === 'function' ? getScopedSelectedItems() : [];
        if (typeof openUnifiedBulkDeleteModal === 'function') {
            openUnifiedBulkDeleteModal({
                mode: 'BATCH',
                title: `ลบรายการที่เลือก (${scopedItems.length.toLocaleString()} S/N)`,
                items: scopedItems
            });
        } else if (typeof window.submitDeleteWithRoleGuard === 'function' && scopedItems.length > 0) {
            window.submitDeleteWithRoleGuard(scopedItems.map(i => i.sn), 'ลบรายการที่เลือก');
        }
        return;
    }
    if (typeof openUnifiedBulkDeleteModal === 'function') {
        openUnifiedBulkDeleteModal({
            mode: 'SINGLE',
            sn: sn,
            id: id,
            title: `ลบซีเรียลสินค้า: ${sn}`
        });
    } else if (typeof window.submitDeleteWithRoleGuard === 'function' && sn) {
        window.submitDeleteWithRoleGuard([sn], `ลบซีเรียลสินค้า: ${sn}`);
    }
}

window.requestDeleteModal = function (mode = 'SINGLE', sn = null, id = null) {
    triggerDeleteItemAction(mode, sn, id);
};

function triggerBatchRelocateAction(preselectedItems = null) {
    if (typeof openUnifiedBatchRelocateModal === 'function') {
        openUnifiedBatchRelocateModal(preselectedItems);
    }
    if (typeof elevateTopModal === 'function' && typeof WMS_ACTION_MODAL_GROUPS !== 'undefined') {
        elevateTopModal(WMS_ACTION_MODAL_GROUPS.relocate, 'relocate');
    }
}

// =========================================================================
// --- POST-LOAD OVERRIDE & CLICK CAPTURE GUARD (ENSURES ALL BUTTONS WORK) ---
// =========================================================================
function bindSmartBatchRelocateHooks() {
    if (typeof openUnifiedBatchRelocateModal === 'function') {
        window.requestBatchRelocateModal = openUnifiedBatchRelocateModal;
        window.openBatchRelocateModal = openUnifiedBatchRelocateModal;
        window.openUnifiedBatchRelocateModal = openUnifiedBatchRelocateModal;
    }
    if (typeof relocateSelectedFromModal === 'function') {
        window.relocateSelectedFromModal = relocateSelectedFromModal;
    }
    if (typeof relocateSelectedItemsFromInventory === 'function') {
        window.relocateSelectedItemsFromInventory = relocateSelectedItemsFromInventory;
        window.relocateSelectedFromInventory = relocateSelectedItemsFromInventory;
        window.batchRelocateSelected = relocateSelectedItemsFromInventory;
    }
    window.triggerBatchRelocateAction = triggerBatchRelocateAction;
}

bindSmartBatchRelocateHooks();
if (typeof initWmsApprovalRealTimeSync === 'function') {
    initWmsApprovalRealTimeSync();
}
if (typeof window.refreshApprovalsUI === 'function') {
    window.refreshApprovalsUI();
}

document.addEventListener('DOMContentLoaded', () => {
    bindSmartBatchRelocateHooks();
    if (typeof initWmsApprovalRealTimeSync === 'function') {
        initWmsApprovalRealTimeSync();
    }
    if (typeof window.refreshApprovalsUI === 'function') {
        window.refreshApprovalsUI();
    }
});

window.addEventListener('load', () => {
    bindSmartBatchRelocateHooks();
    if (typeof initWmsApprovalRealTimeSync === 'function') {
        initWmsApprovalRealTimeSync();
    }
    if (typeof window.refreshApprovalsUI === 'function') {
        window.refreshApprovalsUI();
    }
    setTimeout(bindSmartBatchRelocateHooks, 350);
});

document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, a, [role="button"]');
    if (!btn) return;
    if (
        btn.closest('#wmsUnifiedBatchRelocateModal') ||
        btn.closest('#wmsBuiltInApprovalCenterModal') ||
        btn.closest('#wmsAdminActionPopupHost') ||
        btn.closest('#wmsApprovalDetailModal') ||
        btn.closest('#wmsApprovalsModernControls') ||
        btn.closest('#view-approvals')
    ) return;

    const onclickAttr = (btn.getAttribute('onclick') || '').trim();
    const btnText = (btn.textContent || '').replace(/\s+/g, ' ').trim();
    const isAdmin = typeof isWmsAdminStrict === 'function' ? isWmsAdminStrict() : false;

    // ป้องกันปุ่มย้ายพิกัดรายตัวเก่าข้ามขั้นตอนการส่งคำขอของ User ทั่วไป
    if (!isAdmin && onclickAttr.includes('requestRelocateModal(')) {
        const match = onclickAttr.match(/requestRelocateModal\(\s*(['"`]?)([^'"`,)]*)\1\s*,\s*(['"`])([^'"`]+)\3/);
        if (match) {
            e.preventDefault();
            e.stopImmediatePropagation();
            triggerRelocateAction(match[2] || null, match[4], '', '');
            return;
        }
    }

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
        if (typeof openUnifiedBatchRelocateModal === 'function') {
            openUnifiedBatchRelocateModal();
        }
    }
}, true);

// Global Coordinator Exports
window.triggerPrintBarcodeAction = triggerPrintBarcodeAction;
window.triggerEditItemAction = triggerEditItemAction;
window.triggerRelocateAction = triggerRelocateAction;
window.triggerDeleteItemAction = triggerDeleteItemAction;
window.triggerBatchRelocateAction = triggerBatchRelocateAction;
window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.coordinatorLoaded = true;