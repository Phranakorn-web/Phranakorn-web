// =========================================================================
// --- MODULE 2C: SERIAL DETAIL MODAL, DB LOADING POPUP & Z-INDEX STACK ---
// --- FILE: inv-serial-modal.js (v25.0 MODULAR ARCHITECTURE) ---
// =========================================================================

let wmsCurrentTopModalZIndex = 100400;
let wmsModalObserverInitialized = false;

const WMS_ACTION_MODAL_GROUPS = {
    print: [
        'printBarcodeModal', 'barcodePrintModal', 'printModal', 'modalPrintBarcode',
        'singlePrintModal', 'multiPrintModal', 'labelPrintModal', 'barcodeModal'
    ],
    edit: [
        'editItemModal', 'editModal', 'modalEditItem', 'editStockModal', 'updateItemModal'
    ],
    relocate: [
        'wmsUnifiedBatchRelocateModal', 'relocateModal', 'relocateItemModal', 'modalRelocateItem',
        'batchRelocateModal', 'moveItemModal', 'transferLocationModal'
    ],
    delete: [
        'wmsUnifiedBulkDeleteModal', 'deleteConfirmModal', 'deleteModal', 'modalDeleteConfirm',
        'confirmDeleteModal', 'batchDeleteModal'
    ]
};

function isSecondaryModalVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === 'stockDetailModal' || el.id === 'wmsDbLoadingModal' || el.id === 'wmsBpGlobalLoadingModal' || el.id === 'loginOverlay') return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
}

function closeSecondaryActionModals(exceptGroup = null) {
    Object.keys(WMS_ACTION_MODAL_GROUPS).forEach(groupKey => {
        if (exceptGroup && groupKey === exceptGroup) return;
        WMS_ACTION_MODAL_GROUPS[groupKey].forEach(id => {
            const el = document.getElementById(id);
            if (el && isSecondaryModalVisible(el)) {
                el.style.display = 'none';
                el.classList.remove('active', 'show', 'open', 'is-open');
            }
        });
    });
}

function syncStockDetailParentState() {
    const parentModal = document.getElementById('stockDetailModal');
    if (!parentModal) return;

    const allKnownActionIds = Object.values(WMS_ACTION_MODAL_GROUPS).flat();
    const hasVisibleChild = allKnownActionIds.some(id => isSecondaryModalVisible(document.getElementById(id))) ||
        Array.from(document.querySelectorAll('.modal-overlay')).some(el => isSecondaryModalVisible(el));

    if (hasVisibleChild && parentModal.style.display !== 'none') {
        parentModal.classList.add('has-child-modal');
    } else {
        parentModal.classList.remove('has-child-modal');
    }
}

function elevateTopModal(modalIds, actionType = null) {
    const ids = Array.isArray(modalIds) ? modalIds : [modalIds];
    if (actionType) {
        closeSecondaryActionModals(actionType);
    }

    const applyElevation = () => {
        wmsCurrentTopModalZIndex += 2;
        const targetZ = String(wmsCurrentTopModalZIndex);

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.setProperty('z-index', targetZ, 'important');
                el.style.position = 'fixed';
                el.classList.add('wms-elevated-modal');
            }
        });

        document.querySelectorAll('.modal-overlay, [id*="Modal"], [id*="modal"]').forEach(el => {
            if (isSecondaryModalVisible(el)) {
                const currentZ = parseInt(window.getComputedStyle(el).zIndex || '0', 10);
                if (currentZ < wmsCurrentTopModalZIndex) {
                    el.style.setProperty('z-index', targetZ, 'important');
                    el.style.position = 'fixed';
                    el.classList.add('wms-elevated-modal');
                }
            }
        });

        syncStockDetailParentState();
    };

    applyElevation();
    requestAnimationFrame(applyElevation);
}

function initWmsModalStackObserver() {
    ensureWmsInvDbStyles();
    if (wmsModalObserverInitialized || typeof MutationObserver === 'undefined' || !document.body) return;
    wmsModalObserverInitialized = true;

    let syncScheduled = false;
    let wasRelocateOrEditOpen = false;

    const scheduleSync = () => {
        if (syncScheduled) return;
        syncScheduled = true;
        requestAnimationFrame(() => {
            syncScheduled = false;
            syncStockDetailParentState();

            const relocateOrEditIds = [...WMS_ACTION_MODAL_GROUPS.relocate, ...WMS_ACTION_MODAL_GROUPS.edit];
            const isAnyOpenNow = relocateOrEditIds.some(id => isSecondaryModalVisible(document.getElementById(id)));
            if (wasRelocateOrEditOpen && !isAnyOpenNow && !wmsIsBulkDeleting) {
                loadDataFromDatabase({ silent: true });
            }
            wasRelocateOrEditOpen = isAnyOpenNow;
        });
    };

    const observer = new MutationObserver((mutations) => {
        for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            if (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class')) {
                const target = m.target;
                if (target && target.id !== 'stockDetailModal' && target.id !== 'wmsDbLoadingModal' && target.id !== 'wmsBpGlobalLoadingModal') {
                    if (isSecondaryModalVisible(target) && (target.classList.contains('modal-overlay') || /modal/i.test(target.id || ''))) {
                        const z = parseInt(window.getComputedStyle(target).zIndex || '0', 10);
                        if (z <= 10050) {
                            wmsCurrentTopModalZIndex += 2;
                            target.style.setProperty('z-index', String(wmsCurrentTopModalZIndex), 'important');
                            target.style.position = 'fixed';
                            target.classList.add('wms-elevated-modal');
                        }
                    }
                }
                scheduleSync();
            } else if (m.type === 'childList') {
                scheduleSync();
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });

    document.addEventListener('keydown', handleModalEscapeKey);
    initWmsRealtimeSync();
}

function handleModalEscapeKey(e) {
    if (e.key !== 'Escape') return;
    if (wmsIsBulkDeleting) return;

    const elevatedModals = Array.from(document.querySelectorAll('.wms-elevated-modal, .modal-overlay'))
        .filter(el => isSecondaryModalVisible(el))
        .sort((a, b) => (parseInt(window.getComputedStyle(b).zIndex || '0', 10) - parseInt(window.getComputedStyle(a).zIndex || '0', 10)));

    if (elevatedModals.length > 0) {
        const topEl = elevatedModals[0];
        if (topEl.id === 'wmsUnifiedBulkDeleteModal' && typeof closeUnifiedBulkDeleteModal === 'function') {
            closeUnifiedBulkDeleteModal();
            syncStockDetailParentState();
            return;
        }
        if (topEl.id === 'wmsUnifiedBatchRelocateModal' && typeof closeUnifiedBatchRelocateModal === 'function') {
            closeUnifiedBatchRelocateModal();
            syncStockDetailParentState();
            return;
        }
        if (topEl.id === 'printBarcodeModal' && typeof closePrintBarcodeModal === 'function') {
            closePrintBarcodeModal();
            syncStockDetailParentState();
            return;
        }
        const closeBtn = topEl.querySelector('[data-dismiss="modal"], .modal-close, button[onclick*="close"], button[onclick*="Close"]');
        if (closeBtn && typeof closeBtn.click === 'function') {
            closeBtn.click();
        } else {
            topEl.style.display = 'none';
            topEl.classList.remove('active', 'show', 'open', 'is-open');
        }
        syncStockDetailParentState();
        return;
    }

    const stockModal = document.getElementById('stockDetailModal');
    if (stockModal && stockModal.style.display !== 'none') {
        closeStockDetailModal();
    }
}

// =========================================================================
// --- DATABASE LOADING & BULK DELETE PROGRESS POPUP ENGINE ---
// =========================================================================
let wmsDbLoadingHideTimer = null;
let wmsDbLoadingDismissedByUser = false;

function ensureDbLoadingPopupExists() {
    ensureWmsInvDbStyles();
    let popup = document.getElementById('wmsDbLoadingModal');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'wmsDbLoadingModal';
        popup.className = 'wms-db-loading-overlay';
        popup.setAttribute('role', 'status');
        popup.setAttribute('aria-live', 'polite');
        popup.style.display = 'none';
        popup.style.zIndex = '100999';
        popup.innerHTML = `
            <div class="wms-db-loading-card">
                <div class="wms-db-loading-icon-wrap" id="wmsDbLoadingIconWrap">
                    <div class="wms-db-spinner-ring"></div>
                    <i class="fa-solid fa-database wms-db-center-icon" id="wmsDbLoadingCenterIcon"></i>
                </div>
                <div class="wms-db-loading-badge" id="wmsDbLoadingStageBadge">
                    <span class="wms-db-dot"></span> กำลังซิงค์ฐานข้อมูลออนไลน์
                </div>
                <h3 class="wms-db-loading-title" id="wmsDbLoadingTitle">กำลังโหลดข้อมูลสต็อกสินค้า...</h3>
                <p class="wms-db-loading-subtitle" id="wmsDbLoadingSubtitle">กรุณารอสักครู่ ระบบกำลังดึงข้อมูลล่าสุดจากฐานข้อมูลคลังสินค้า</p>
                
                <div class="wms-db-progress-container">
                    <div class="wms-db-progress-bar" id="wmsDbLoadingProgressBar" style="width: 18%;"></div>
                </div>
                <div class="wms-db-loading-meta">
                    <span id="wmsDbLoadingCounterText">กำลังเชื่อมต่อเซิร์ฟเวอร์...</span>
                    <span class="mono font-bold" id="wmsDbLoadingPercentText">18%</span>
                </div>

                <div class="wms-db-loading-actions" id="wmsDbLoadingActionsWrap">
                    <button type="button" class="btn btn-sm btn-secondary wms-db-bg-btn" onclick="hideDbLoadingPopup(true)">
                        <i class="fa-solid fa-eye-slash"></i> ซ่อนหน้าต่าง (ทำงานต่อเบื้องหลัง)
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
    }
    return popup;
}

function showDbLoadingPopup(title = 'กำลังโหลดข้อมูลสต็อกสินค้า...', subtitle = 'กรุณารอสักครู่ ระบบกำลังเชื่อมต่อฐานข้อมูลคลังสินค้า', percent = 15, options = {}) {
    if (wmsDbLoadingHideTimer) {
        clearTimeout(wmsDbLoadingHideTimer);
        wmsDbLoadingHideTimer = null;
    }
    wmsDbLoadingDismissedByUser = false;

    const popup = ensureDbLoadingPopupExists();
    popup.style.setProperty('z-index', '100999', 'important');

    const iconWrap = document.getElementById('wmsDbLoadingIconWrap');
    const centerIcon = document.getElementById('wmsDbLoadingCenterIcon');
    const stageBadge = document.getElementById('wmsDbLoadingStageBadge');
    const titleEl = document.getElementById('wmsDbLoadingTitle');
    const subEl = document.getElementById('wmsDbLoadingSubtitle');
    const barEl = document.getElementById('wmsDbLoadingProgressBar');
    const pctEl = document.getElementById('wmsDbLoadingPercentText');
    const counterEl = document.getElementById('wmsDbLoadingCounterText');
    const actionsWrap = document.getElementById('wmsDbLoadingActionsWrap');

    if (iconWrap) iconWrap.classList.remove('is-success', 'is-error');
    if (centerIcon) centerIcon.className = options.iconClass || 'fa-solid fa-database wms-db-center-icon';
    if (stageBadge) {
        stageBadge.innerHTML = options.badgeHtml || `<span class="wms-db-dot"></span> ${navigator.onLine ? 'กำลังซิงค์ฐานข้อมูลออนไลน์' : 'โหมดออฟไลน์ (กำลังโหลดแคชในเครื่อง)'}`;
    }
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (barEl) barEl.style.width = `${Math.min(100, Math.max(2, percent))}%`;
    if (pctEl) pctEl.textContent = `${Math.min(100, Math.max(2, Math.round(percent)))}%`;
    if (counterEl) counterEl.textContent = options.counterText || 'กำลังเตรียมข้อมูล...';
    if (actionsWrap) {
        actionsWrap.style.display = options.lockClose ? 'none' : 'flex';
    }

    popup.style.display = 'flex';
    requestAnimationFrame(() => {
        popup.classList.add('is-visible');
    });
}

function updateDbLoadingPopup(title, subtitle, percent = null, counterText = null, state = 'loading') {
    if (wmsDbLoadingDismissedByUser) return;
    const popup = document.getElementById('wmsDbLoadingModal');
    if (!popup || popup.style.display === 'none') return;

    const iconWrap = document.getElementById('wmsDbLoadingIconWrap');
    const centerIcon = document.getElementById('wmsDbLoadingCenterIcon');
    const titleEl = document.getElementById('wmsDbLoadingTitle');
    const subEl = document.getElementById('wmsDbLoadingSubtitle');
    const barEl = document.getElementById('wmsDbLoadingProgressBar');
    const pctEl = document.getElementById('wmsDbLoadingPercentText');
    const counterEl = document.getElementById('wmsDbLoadingCounterText');

    if (title && titleEl) titleEl.textContent = title;
    if (subtitle && subEl) subEl.textContent = subtitle;
    if (counterText !== null && counterEl) counterEl.textContent = counterText;

    if (percent !== null) {
        const clamped = Math.min(100, Math.max(0, Math.round(percent)));
        if (barEl) barEl.style.width = `${clamped}%`;
        if (pctEl) pctEl.textContent = `${clamped}%`;
    }

    if (state === 'success') {
        if (iconWrap) {
            iconWrap.classList.remove('is-error');
            iconWrap.classList.add('is-success');
        }
        if (centerIcon) centerIcon.className = 'fa-solid fa-circle-check wms-db-center-icon';
    } else if (state === 'error') {
        if (iconWrap) {
            iconWrap.classList.remove('is-success');
            iconWrap.classList.add('is-error');
        }
        if (centerIcon) centerIcon.className = 'fa-solid fa-triangle-exclamation wms-db-center-icon';
    }
}

function hideDbLoadingPopup(dismissedByUser = false) {
    if (dismissedByUser) {
        wmsDbLoadingDismissedByUser = true;
    }
    const popup = document.getElementById('wmsDbLoadingModal');
    if (!popup) return;

    popup.classList.remove('is-visible');
    if (wmsDbLoadingHideTimer) clearTimeout(wmsDbLoadingHideTimer);
    wmsDbLoadingHideTimer = setTimeout(() => {
        popup.style.display = 'none';
        wmsDbLoadingHideTimer = null;
    }, 240);
}

// =========================================================================
// --- SERIAL DETAIL MODAL (BY PRODUCT MODEL) ---
// =========================================================================
function ensureStockDetailModalExists() {
    initWmsModalStackObserver();

    let modal = document.getElementById('stockDetailModal');
    if (modal && modal.dataset.wmsUnifiedVersion !== '25.0') {
        modal.remove();
        modal = null;
    }

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stockDetailModal';
        modal.dataset.wmsUnifiedVersion = '25.0';
        modal.className = 'wms-sd-overlay';
        modal.style.display = 'none';

        modal.addEventListener('click', (e) => {
            if (e.target === modal && !modal.classList.contains('has-child-modal')) {
                closeStockDetailModal();
            }
        });

        modal.innerHTML = `
            <div class="wms-sd-dialog">
                <div class="wms-sd-header">
                    <div class="wms-sd-header-top">
                        <div class="wms-sd-title-block">
                            <div class="wms-sd-icon-badge">
                                <i class="fa-solid fa-boxes-stacked"></i>
                            </div>
                            <div class="wms-sd-title-texts">
                                <h3 id="stockDetailModalTitle" class="wms-sd-title">รายละเอียดซีเรียลสินค้า</h3>
                                <div class="wms-sd-hint">คัดกรองตามแถว/ล็อก ติ๊กเลือกซีเรียลที่ต้องการ แล้วกดพิมพ์ ย้ายพิกัด หรือลบได้ทันที</div>
                            </div>
                        </div>
                        <div class="wms-sd-header-actions">
                            <button type="button" class="btn btn-sm btn-secondary wms-sd-util-btn" onclick="copyAllModalSerials()" title="คัดลอกหมายเลขซีเรียลทั้งหมดในรุ่นนี้">
                                <i class="fa-solid fa-copy"></i> <span>คัดลอก S/N ทั้งหมด</span>
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary wms-sd-util-btn" onclick="exportModalSerialsCSV()" title="ส่งออกรายการซีเรียลรุ่นนี้เป็นไฟล์ CSV">
                                <i class="fa-solid fa-file-csv" style="color:var(--success);"></i> <span>Export CSV</span>
                            </button>
                            <button type="button" class="wms-sd-close-btn" onclick="closeStockDetailModal()" title="ปิดหน้าต่าง (ESC)" aria-label="ปิดหน้าต่าง">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>

                    <div id="stockDetailModalSubtitle" class="wms-sd-stats-bar"></div>
                </div>

                <div class="wms-sd-toolbar">
                    <div class="wms-sd-toolbar-main">
                        <div class="wms-sd-filter-group">
                            <div class="wms-sd-search-box">
                                <i class="fa-solid fa-magnifying-glass wms-sd-search-icon"></i>
                                <input type="text" id="stockDetailModalSearch" class="wms-sd-search-input" placeholder="ค้นหา S/N, ผู้รับ, พิกัด หรือ มิเตอร์ ในรุ่นนี้..." oninput="filterStockDetailModalItems()">
                                <button type="button" id="stockDetailModalSearchClear" class="wms-sd-search-clear" onclick="clearStockDetailModalSearch()" title="ล้างคำค้นหา" style="display:none;">
                                    <i class="fa-solid fa-circle-xmark"></i>
                                </button>
                            </div>

                            <div class="wms-sd-loc-select-wrap">
                                <i class="fa-solid fa-layer-group" style="color:var(--primary);"></i>
                                <select id="stockDetailModalLocationFilter" class="wms-sd-loc-select" onchange="filterStockDetailModalItems()">
                                    <option value="ALL">📍 แสดงทุกแถว/ล็อกที่เก็บอยู่จริง</option>
                                </select>
                            </div>

                            <span id="stockDetailFilterCountBadge" class="wms-sd-filter-badge" style="display:none;"></span>
                        </div>

                        <div class="wms-sd-bulk-actions">
                            <button type="button" class="btn btn-sm btn-primary wms-action-btn-print wms-sd-bulk-btn" onclick="printSelectedBarcodesFromModal()">
                                <i class="fa-solid fa-barcode"></i> พิมพ์ที่เลือก
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary wms-action-btn-print wms-sd-bulk-btn" onclick="printAllGroupBarcodesFromModal()" title="พิมพ์บาร์โค้ดทุก S/N ในรุ่นนี้ทั้งหมด">
                                <i class="fa-solid fa-print"></i> พิมพ์ทั้งรุ่น
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary wms-action-btn-relocate wms-sd-bulk-btn" onclick="relocateSelectedFromModal()">
                                <i class="fa-solid fa-right-left"></i> ย้ายพิกัดที่เลือก
                            </button>
                            <button type="button" id="wmsModalDeleteSelectedBtn" class="btn btn-sm btn-danger wms-action-btn-delete wms-sd-bulk-btn" onclick="deleteSelectedFromModal()">
                                <i class="fa-solid fa-trash-can"></i> ลบรายการที่เลือก (<span id="wmsModalDeleteBtnCount">0</span>)
                            </button>
                        </div>
                    </div>

                    <div class="wms-modal-quick-pills" id="stockDetailQuickPills">
                        <button type="button" class="wms-pill-btn active" data-pill="ALL" onclick="setModalQuickFilter('ALL')">
                            <i class="fa-solid fa-list"></i> ทั้งหมด
                        </button>
                        <button type="button" class="wms-pill-btn" data-pill="SELECTED" onclick="setModalQuickFilter('SELECTED')">
                            <i class="fa-solid fa-square-check"></i> เฉพาะรายการที่ติ๊กเลือก (<span id="pillSelectedCount">0</span>)
                        </button>
                        <button type="button" class="wms-pill-btn" data-pill="PENDING" onclick="setModalQuickFilter('PENDING')">
                            <i class="fa-solid fa-cloud-arrow-up"></i> รอบันทึกขึ้น DB (<span id="pillPendingCount">0</span>)
                        </button>
                    </div>
                </div>

                <div class="wms-sd-body">
                    <div class="wms-sd-table-wrap">
                        <table class="wms-sd-table">
                            <colgroup>
                                <col style="width: 44px;">
                                <col style="width: 60px;">
                                <col style="min-width: 115px;">
                                <col style="min-width: 150px;">
                                <col style="min-width: 100px;">
                                <col style="min-width: 165px;">
                                <col style="min-width: 190px;">
                                <col style="width: 72px;">
                                <col style="min-width: 145px;">
                                <col style="min-width: 150px;">
                                <col style="width: 86px;">
                                <col style="width: 86px;">
                                <col style="width: 86px;">
                                <col style="width: 82px;">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th class="col-center"><input type="checkbox" id="modalSelectAllCb" onchange="toggleModalSelectAllItems(this.checked)"></th>
                                    <th class="col-center">ลำดับ</th>
                                    <th class="col-left">รหัสสินค้า (SKU)</th>
                                    <th class="col-left">ชื่อรุ่น / สินค้า</th>
                                    <th class="col-center">เลขมิเตอร์</th>
                                    <th class="col-left">หมายเลขซีเรียล (S/N)</th>
                                    <th class="col-left">พิกัดจัดเก็บ</th>
                                    <th class="col-center">จำนวน</th>
                                    <th class="col-left">ผู้รับสินค้าเข้า</th>
                                    <th class="col-center">วันที่รับเข้า</th>
                                    <th class="col-center">พิมพ์</th>
                                    <th class="col-center">แก้ไข</th>
                                    <th class="col-center">ย้าย</th>
                                    <th class="col-center">ลบ</th>
                                </tr>
                            </thead>
                            <tbody id="stockDetailModalTbody"></tbody>
                        </table>
                    </div>
                </div>

                <div class="wms-sd-footer">
                    <div class="wms-sd-footer-left">
                        <span id="stockDetailModalFooterBadge" class="mono font-bold wms-sd-footer-counter"></span>
                        <span class="wms-sd-esc-hint"><kbd>ESC</kbd> ปิดหน้าต่าง</span>
                    </div>
                    <button type="button" class="btn btn-secondary wms-sd-footer-close" onclick="closeStockDetailModal()">
                        <i class="fa-solid fa-xmark"></i> ปิดหน้าต่าง
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function buildStockDetailStatsBarHTML(grp) {
    if (!grp) return '';
    const scopedPool = Array.isArray(wmsLastModalFilteredItems) && wmsLastModalFilteredItems.length > 0 ? wmsLastModalFilteredItems : grp.items;
    const selectedInModalScope = scopedPool.filter(i => selectedItemSnSet.has(i.sn)).length;
    return `
        <span class="wms-sd-stat-chip is-success">
            <i class="fa-solid fa-cubes"></i> ยอดคงเหลือรวม: <strong class="mono">${grp.totalQty.toLocaleString()}</strong> เครื่อง
        </span>
        <span class="wms-sd-stat-chip is-primary">
            <i class="fa-solid fa-barcode"></i> จำนวนซีเรียล: <strong class="mono">${grp.items.length.toLocaleString()}</strong> S/N
        </span>
        <span class="wms-sd-stat-chip is-purple">
            <i class="fa-solid fa-location-dot"></i> กระจายจัดเก็บ: <strong class="mono">${grp.locations.length.toLocaleString()}</strong> พิกัด
        </span>
        <span class="wms-sd-stat-chip is-amber" id="wmsSdHeaderSelectedChip">
            <i class="fa-solid fa-square-check"></i> เลือกไว้: <strong class="mono" id="wmsSdHeaderSelectedNum">${selectedInModalScope.toLocaleString()}</strong> รายการ
        </span>
    `;
}

function openStockDetailModal(groupKey) {
    currentDetailModalGroupKey = groupKey;
    currentModalQuickFilter = 'ALL';
    wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    ensureStockDetailModalExists();

    const grp = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!grp) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบข้อมูลสินค้ากลุ่มนี้', true);
        return;
    }

    const groupSnSet = new Set(grp.items.map(i => i.sn));
    Array.from(selectedItemSnSet).forEach(sn => {
        if (!groupSnSet.has(sn)) {
            selectedItemSnSet.delete(sn);
        }
    });

    const titleElem = document.getElementById('stockDetailModalTitle');
    const subtitleElem = document.getElementById('stockDetailModalSubtitle');
    const searchInput = document.getElementById('stockDetailModalSearch');
    const searchClearBtn = document.getElementById('stockDetailModalSearchClear');
    const locSelect = document.getElementById('stockDetailModalLocationFilter');

    if (titleElem) {
        titleElem.innerHTML = `
            <span>รหัสสินค้า:</span>
            <span class="mono wms-sd-sku-tag">${escapeHTML(grp.category)}</span>
            <span class="wms-sd-title-sep">|</span>
            <span class="wms-product-name-2line" style="display:inline-block; vertical-align:middle;" title="${escapeHTML(grp.name)}">รุ่น: ${escapeHTML(grp.name)}</span>
        `;
    }

    if (locSelect) {
        const aisleBayMap = new Map();
        grp.items.forEach(item => {
            const abKey = extractAisleBayKey(item.location);
            aisleBayMap.set(abKey, (aisleBayMap.get(abKey) || 0) + 1);
        });

        const sortedAisleBayKeys = Array.from(aisleBayMap.keys()).sort();
        let locOptions = `<option value="ALL">📍 แสดงทุกแถว/ล็อกที่เก็บอยู่จริง (${sortedAisleBayKeys.length} พิกัด)</option>`;

        sortedAisleBayKeys.forEach(abKey => {
            const count = aisleBayMap.get(abKey);
            const labelText = formatAisleBayLabel(abKey);
            locOptions += `<option value="${escapeHTML(abKey)}">📍 ${escapeHTML(labelText)} (${count.toLocaleString()} เครื่อง)</option>`;
        });

        locSelect.innerHTML = locOptions;
        locSelect.value = 'ALL';
    }

    if (searchInput) searchInput.value = '';
    if (searchClearBtn) searchClearBtn.style.display = 'none';

    wmsLastModalFilteredItems = grp.items;
    if (subtitleElem) {
        subtitleElem.innerHTML = buildStockDetailStatsBarHTML(grp);
    }
    updateModalQuickPillUI(grp);
    renderStockDetailModalBody(grp.items);

    const modal = document.getElementById('stockDetailModal');
    if (modal) {
        modal.style.zIndex = '10050';
        modal.style.display = 'flex';
        modal.classList.remove('has-child-modal');
        requestAnimationFrame(() => {
            modal.classList.add('is-open');
        });
    }
}

function clearStockDetailModalSearch() {
    const searchInput = document.getElementById('stockDetailModalSearch');
    const searchClearBtn = document.getElementById('stockDetailModalSearchClear');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    if (searchClearBtn) searchClearBtn.style.display = 'none';
    filterStockDetailModalItems();
}

function updateModalQuickPillUI(grp) {
    const scopedPool = Array.isArray(wmsLastModalFilteredItems) ? wmsLastModalFilteredItems : (grp ? grp.items : []);
    const selectedInScope = scopedPool.filter(i => selectedItemSnSet.has(i.sn)).length;
    const pendingInGroup = grp ? grp.items.filter(i => i._pending).length : 0;

    const selSpan = document.getElementById('pillSelectedCount');
    const penSpan = document.getElementById('pillPendingCount');
    const headerSelNum = document.getElementById('wmsSdHeaderSelectedNum');
    const modalDelBtnCount = document.getElementById('wmsModalDeleteBtnCount');
    const modalDelBtn = document.getElementById('wmsModalDeleteSelectedBtn');

    if (selSpan) selSpan.textContent = selectedInScope.toLocaleString();
    if (penSpan) penSpan.textContent = pendingInGroup.toLocaleString();
    if (headerSelNum) headerSelNum.textContent = selectedInScope.toLocaleString();
    if (modalDelBtnCount) modalDelBtnCount.textContent = selectedInScope.toLocaleString();
    if (modalDelBtn) {
        modalDelBtn.disabled = (selectedInScope === 0);
        modalDelBtn.style.opacity = (selectedInScope === 0) ? '0.5' : '1';
    }

    document.querySelectorAll('#stockDetailQuickPills .wms-pill-btn').forEach(btn => {
        const pillMode = btn.getAttribute('data-pill');
        if (pillMode === currentModalQuickFilter) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function setModalQuickFilter(mode) {
    currentModalQuickFilter = mode || 'ALL';
    wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    filterStockDetailModalItems();
}

function loadMoreModalSerialRows(showAll = false) {
    if (showAll) {
        wmsModalTableRenderLimit = wmsLastModalFilteredItems.length;
    } else {
        wmsModalTableRenderLimit += WMS_TABLE_RENDER_BATCH_SIZE;
    }
    renderStockDetailModalBody(wmsLastModalFilteredItems);
}

function renderStockDetailModalBody(items) {
    const tbody = document.getElementById('stockDetailModalTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    wmsLastModalFilteredItems = items || [];

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="col-center" style="padding:32px 16px; color:var(--text-muted); font-size:0.92rem;">ไม่พบรายการซีเรียลสินค้าตรงตามเงื่อนไข</td></tr>`;
        const footerBadge = document.getElementById('stockDetailModalFooterBadge');
        if (footerBadge) {
            footerBadge.textContent = `แสดงผล 0 ซีเรียล | เลือกแล้ว 0 รายการ`;
        }
        return;
    }

    let allChecked = items.length > 0;
    for (let i = 0; i < items.length; i++) {
        if (!selectedItemSnSet.has(items[i].sn)) {
            allChecked = false;
            break;
        }
    }

    const visibleSlice = items.slice(0, wmsModalTableRenderLimit);
    const frag = document.createDocumentFragment();

    visibleSlice.forEach((item, index) => {
        const isChecked = selectedItemSnSet.has(item.sn);
        const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
        const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;
        const receiverDisplay = item.received_by || item.created_by || item.received_by_name || 'ไม่ระบุ';

        const tr = document.createElement('tr');
        if (isChecked) tr.classList.add('is-selected');
        tr.innerHTML = `
            <td class="col-center"><input type="checkbox" class="item-checkbox-modal" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
            <td class="col-center mono font-bold">${index + 1}</td>
            <td class="col-left"><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(item.category || 'N/A')}</code></td>
            <td class="col-left"><div class="text-multiline-truncate wms-product-name-2line" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
            <td class="col-center"><span class="mono font-bold" style="color:var(--warning); font-size:0.9rem;"><i class="fa-solid fa-gauge"></i> ${Number(meterValue).toLocaleString()}</span></td>
            <td class="col-left">
                <div style="display:inline-flex; align-items:center; gap:6px;">
                    <code class="mono font-bold" style="font-size:0.9rem;">${escapeHTML(item.sn)}</code>
                    <button type="button" class="btn btn-sm btn-secondary" style="padding:2px 6px; font-size:0.72rem; border-radius:5px; min-height:24px;" onclick="copyTextToClipboard('${escapeHTML(item.sn)}', 'S/N')" title="คัดลอก S/N"><i class="fa-solid fa-copy"></i></button>
                </div>
                ${item._pending ? ' <span class="badge-action delete" style="font-size:0.68rem; margin-left:4px;"><i class="fa-solid fa-clock"></i> รอบันทึก DB</span>' : ''}
            </td>
            <td class="col-left">
                <span class="badge-location mono" style="display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:6px; font-size:0.78rem; font-weight:700; background:linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(59,130,246,0.12) 100%); border:1px solid rgba(37,99,235,0.22); color:var(--primary, #2563eb);">
                    <i class="fa-solid fa-location-dot" style="color:#2563eb;"></i> ${escapeHTML(formatLoc)}
                </span>
            </td>
            <td class="col-center mono font-bold">${item.qty ?? 1}</td>
            <td class="col-left">
                <span style="font-size:0.84rem; font-weight:600; color:var(--primary-text, #0f172a); display:inline-flex; align-items:center; gap:5px; background:var(--bg-subtle, #f8fafc); padding:3px 8px; border-radius:6px; border:1px solid var(--border-color, #e2e8f0);">
                    <i class="fa-solid fa-user-check" style="color:var(--success, #10b981); font-size:0.75rem;"></i> ${escapeHTML(receiverDisplay)}
                </span>
            </td>
            <td class="col-center" style="font-size:0.78rem; color:var(--text-muted);">${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}</td>
            <td class="col-center">
                <button type="button" class="btn btn-sm btn-primary wms-action-btn-print" onclick="triggerPrintBarcodeAction('SINGLE', '${escapeHTML(item.sn)}')" title="พิมพ์บาร์โค้ดรายการนี้"><i class="fa-solid fa-barcode"></i> พิมพ์</button>
            </td>
            <td class="col-center">
                <button type="button" class="btn btn-sm btn-secondary wms-action-btn-edit" onclick="triggerEditItemAction('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}')" title="แก้ไขข้อมูลสินค้า"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
            </td>
            <td class="col-center">
                <button type="button" class="btn btn-sm btn-secondary wms-action-btn-relocate" onclick="triggerRelocateAction('${escapeHTML(String(item.id))}', '${escapeHTML(item.sn)}', '${escapeHTML(item.name)}', '${escapeHTML(item.location)}')" title="ย้ายพิกัดจัดเก็บ"><i class="fa-solid fa-right-left"></i> ย้าย</button>
            </td>
            <td class="col-center">
                <button type="button" class="btn btn-sm btn-danger wms-action-btn-delete" onclick="triggerDeleteItemAction('SINGLE', '${escapeHTML(item.sn)}', '${escapeHTML(String(item.id))}')" title="ลบรายการนี้ออกจากสต็อก"><i class="fa-solid fa-trash"></i> ลบ</button>
            </td>
        `;
        frag.appendChild(tr);
    });

    if (items.length > visibleSlice.length) {
        const remaining = items.length - visibleSlice.length;
        const loadMoreTr = document.createElement('tr');
        loadMoreTr.innerHTML = `
            <td colspan="14" class="col-center" style="padding:14px; background:var(--bg-subtle, #f8fafc);">
                <div style="display:inline-flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:10px;">
                    <span style="font-size:0.84rem; color:var(--text-sub); font-weight:600;">
                        แสดงผล ${visibleSlice.length.toLocaleString()} จาก ${items.length.toLocaleString()} ซีเรียล (การกดติ๊กเลือกด้านบนจะเลือกครบทั้ง ${items.length.toLocaleString()} S/N ทันที)
                    </span>
                    <button type="button" class="btn btn-sm btn-primary" onclick="loadMoreModalSerialRows(false)" style="font-weight:600;">
                        <i class="fa-solid fa-angles-down"></i> โหลดเพิ่มอีก ${Math.min(WMS_TABLE_RENDER_BATCH_SIZE, remaining).toLocaleString()} แถว
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="loadMoreModalSerialRows(true)" style="font-weight:600;">
                        แสดงทั้งหมด (${items.length.toLocaleString()} แถว)
                    </button>
                </div>
            </td>
        `;
        frag.appendChild(loadMoreTr);
    }

    tbody.appendChild(frag);

    const selectAllCb = document.getElementById('modalSelectAllCb');
    if (selectAllCb) selectAllCb.checked = allChecked;

    const scopedSelCount = items.filter(i => selectedItemSnSet.has(i.sn)).length;
    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge) {
        footerBadge.textContent = `แสดงผล ${visibleSlice.length.toLocaleString()} / ${items.length.toLocaleString()} ซีเรียล | เลือกแล้ว ${scopedSelCount.toLocaleString()} รายการ`;
    }
}

function filterStockDetailModalItems(preserveLimit = false) {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    if (!preserveLimit) {
        wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
    }

    const searchEl = document.getElementById('stockDetailModalSearch');
    const searchClearBtn = document.getElementById('stockDetailModalSearchClear');
    const rawQuery = searchEl ? searchEl.value : '';
    const query = rawQuery.trim().toLowerCase();
    if (searchClearBtn) {
        searchClearBtn.style.display = rawQuery.length > 0 ? 'inline-flex' : 'none';
    }

    const selectedAisleBay = (document.getElementById('stockDetailModalLocationFilter')?.value || 'ALL').toUpperCase();
    const badge = document.getElementById('stockDetailFilterCountBadge');

    const baseFiltered = grp.items.filter(item => {
        if (isSnInTombstone(item.sn)) return false;

        const matchText = !query ||
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            (item.received_by && item.received_by.toLowerCase().includes(query)) ||
            (item.meter && String(item.meter).toLowerCase().includes(query));

        let matchAisleBay = true;
        if (selectedAisleBay !== 'ALL') {
            const itemAisleBay = extractAisleBayKey(item.location);
            matchAisleBay = (itemAisleBay === selectedAisleBay);
        }

        return matchText && matchAisleBay;
    });

    const baseFilteredSnSet = new Set(baseFiltered.map(i => i.sn));
    Array.from(selectedItemSnSet).forEach(sn => {
        if (!baseFilteredSnSet.has(sn)) {
            selectedItemSnSet.delete(sn);
        }
    });

    const filtered = baseFiltered.filter(item => {
        if (currentModalQuickFilter === 'SELECTED') {
            return selectedItemSnSet.has(item.sn);
        } else if (currentModalQuickFilter === 'PENDING') {
            return Boolean(item._pending);
        }
        return true;
    });

    wmsLastModalFilteredItems = filtered;
    updateModalQuickPillUI(grp);
    if (typeof updateSelectedCountUI === 'function') updateSelectedCountUI();

    if (badge) {
        if (query || selectedAisleBay !== 'ALL' || currentModalQuickFilter !== 'ALL') {
            badge.textContent = `พบ ${filtered.length.toLocaleString()} / ${grp.items.length.toLocaleString()} รายการ`;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    renderStockDetailModalBody(filtered);
}

function closeStockDetailModal() {
    closeSecondaryActionModals(null);
    const modal = document.getElementById('stockDetailModal');
    if (modal) {
        modal.classList.remove('is-open', 'has-child-modal');
        modal.style.display = 'none';
    }
    currentDetailModalGroupKey = null;
    currentModalQuickFilter = 'ALL';
    wmsLastModalFilteredItems = [];
    if (typeof renderInventoryTable === 'function') {
        renderInventoryTable(currentFilteredItems);
    }
}

function toggleModalSelectAllItems(checked) {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    const targetList = Array.isArray(wmsLastModalFilteredItems) ? wmsLastModalFilteredItems : grp.items;

    for (let i = 0; i < targetList.length; i++) {
        const sn = targetList[i].sn;
        if (checked) selectedItemSnSet.add(sn);
        else selectedItemSnSet.delete(sn);
    }

    filterStockDetailModalItems(true);
    if (typeof updateSelectedCountUI === 'function') updateSelectedCountUI();
}

function copyAllModalSerials() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp || grp.items.length === 0) return;

    const targetList = Array.isArray(wmsLastModalFilteredItems) && wmsLastModalFilteredItems.length > 0 ? wmsLastModalFilteredItems : grp.items;
    const snList = targetList.map(i => i.sn).filter(Boolean).join('\n');
    copyTextToClipboard(snList, `รายการ S/N ทั้งหมด ${targetList.length.toLocaleString()} รายการ`);
}

function exportModalSerialsCSV() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp || grp.items.length === 0) return;

    const targetList = Array.isArray(wmsLastModalFilteredItems) && wmsLastModalFilteredItems.length > 0 ? wmsLastModalFilteredItems : grp.items;
    const headers = ['ลำดับ', 'รหัสสินค้า (SKU)', 'ชื่อรุ่น', 'หมายเลขซีเรียล (S/N)', 'เลขมิเตอร์', 'พิกัดจัดเก็บ', 'จำนวน', 'ผู้รับสินค้าเข้า', 'วันที่รับเข้า'];
    const rows = targetList.map((item, idx) => [
        idx + 1,
        `"${String(item.category || '').replace(/"/g, '""')}"`,
        `"${String(item.name || '').replace(/"/g, '""')}"`,
        `"${String(item.sn || '').replace(/"/g, '""')}"`,
        item.meter ?? 0,
        `"${String(item.location || '').replace(/"/g, '""')}"`,
        item.qty ?? 1,
        `"${String(item.received_by || 'ไม่ระบุ').replace(/"/g, '""')}"`,
        `"${item.created_at ? new Date(item.created_at).toLocaleString('th-TH') : '-'}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeSku = String(grp.category || 'STOCK').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.href = url;
    link.download = `WMS_Serials_${safeSku}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') {
        showToast(`📥 ส่งออกไฟล์ CSV รุ่น ${grp.category} (${targetList.length.toLocaleString()} รายการ) เรียบร้อยแล้ว`);
    }
}

function refreshStockDetailModalIfActive() {
    if (!currentDetailModalGroupKey) return;
    const modal = document.getElementById('stockDetailModal');
    if (!modal || modal.style.display === 'none') return;

    if (typeof buildInventoryGroups === 'function') {
        currentInventoryGroups = buildInventoryGroups(currentFilteredItems);
    }
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (grp) {
        const subtitleElem = document.getElementById('stockDetailModalSubtitle');
        if (subtitleElem) {
            subtitleElem.innerHTML = buildStockDetailStatsBarHTML(grp);
        }
        filterStockDetailModalItems(true);
    } else {
        closeStockDetailModal();
    }
}

// Global Exports
window.showDbLoadingPopup = showDbLoadingPopup;
window.updateDbLoadingPopup = updateDbLoadingPopup;
window.hideDbLoadingPopup = hideDbLoadingPopup;
window.loadMoreModalSerialRows = loadMoreModalSerialRows;
window.openStockDetailModal = openStockDetailModal;
window.closeStockDetailModal = closeStockDetailModal;
window.clearStockDetailModalSearch = clearStockDetailModalSearch;
window.filterStockDetailModalItems = filterStockDetailModalItems;
window.setModalQuickFilter = setModalQuickFilter;
window.toggleModalSelectAllItems = toggleModalSelectAllItems;
window.copyAllModalSerials = copyAllModalSerials;
window.exportModalSerialsCSV = exportModalSerialsCSV;
window.refreshStockDetailModalIfActive = refreshStockDetailModalIfActive;
window.renderStockDetailModalTable = refreshStockDetailModalIfActive;
window.closeSecondaryActionModals = closeSecondaryActionModals;
window.syncStockDetailParentState = syncStockDetailParentState;
window.elevateTopModal = elevateTopModal;
window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.serialModalLoaded = true;