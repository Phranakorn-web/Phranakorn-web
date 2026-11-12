// =========================================================================
// --- MODULE 2: INVENTORY CHECK & MASTER PRODUCTS DATABASE ENGINE (v23.4 UNIFIED MODAL, EXACT COLUMN ALIGNMENT & INSTANT BARCODE LOADING POPUP) ---
// =========================================================================

if (typeof escapeHTML !== 'function') {
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Helper: สกัดรหัสแถวและล็อก (Aisle & Bay) จากพิกัดจัดเก็บเต็ม (เช่น A-01-1-01 -> A-01)
function extractAisleBayKey(locStr) {
    if (!locStr) return 'DOCK';
    const upper = String(locStr).toUpperCase().trim();
    const parts = upper.split('-');
    if (parts.length >= 2) {
        return `${parts[0]}-${parts[1]}`;
    }
    return upper;
}

// Helper: แปลงรหัสแถวและล็อกเป็นข้อความภาษาไทยสวยงาม
function formatAisleBayLabel(abKey) {
    if (!abKey) return 'DOCK';
    const parts = abKey.split('-');
    if (parts.length === 2) {
        return `แถว ${parts[0]} / ล็อก ${parts[1]}`;
    }
    if (abKey === 'DOCK') return 'ลาน DOCK';
    if (abKey === 'OFFICE') return 'ออฟฟิศ (OFFICE)';
    if (abKey === 'PENDING') return 'รอรับเข้า (PENDING)';
    return abKey;
}

// Helper: ดึงชื่อผู้ใช้งานปัจจุบันที่กำลังทำรายการล็อกอินอยู่ในระบบ
function getCurrentReceiverName() {
    if (typeof currentUser !== 'undefined' && currentUser) {
        return currentUser.name || currentUser.full_name || currentUser.username || 'ผู้ดูแลระบบ';
    }
    try {
        const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
        if (savedUserStr) {
            const parsed = JSON.parse(savedUserStr);
            return parsed.name || parsed.full_name || parsed.username || 'ผู้ดูแลระบบ';
        }
    } catch (e) {}
    return 'ไม่ระบุชื่อ';
}

// Helper: Quick Copy Text to Clipboard
function copyTextToClipboard(text, label = 'ข้อความ') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') {
                showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
            }
        }).catch(() => {});
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            if (typeof showToast === 'function') {
                showToast(`📋 คัดลอก ${label} (${text}) เรียบร้อยแล้ว`);
            }
        } catch (err) {}
        document.body.removeChild(textArea);
    }
}

// =========================================================================
// --- UNIFIED NON-OVERLAPPING MODAL STACK & Z-INDEX ENGINE ---
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
        'relocateModal', 'relocateItemModal', 'modalRelocateItem', 'batchRelocateModal',
        'moveItemModal', 'transferLocationModal'
    ],
    delete: [
        'deleteConfirmModal', 'deleteModal', 'modalDeleteConfirm', 'confirmDeleteModal',
        'batchDeleteModal'
    ]
};

function isSecondaryModalVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === 'stockDetailModal' || el.id === 'wmsDbLoadingModal' || el.id === 'wmsBpGlobalLoadingModal' || el.id === 'loginOverlay') return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
}

// ปิดป๊อปอัปคำสั่งย่อยตัวอื่นที่เปิดค้างอยู่ เพื่อป้องกันการซ้อนทับกันเองระหว่าง พิมพ์/แก้ไข/ย้าย/ลบ
function closeSecondaryActionModals(exceptGroup = null) {
    Object.keys(WMS_ACTION_MODAL_GROUPS).forEach(groupKey => {
        if (exceptGroup && groupKey === exceptGroup) return;
        WMS_ACTION_MODAL_GROUPS[groupKey].forEach(id => {
            const el = document.getElementById(id);
            if (el && isSecondaryModalVisible(el)) {
                el.style.display = 'none';
                el.classList.remove('active', 'show', 'open');
            }
        });
    });
}

// Sync สถานะการหรี่แสงหน้าต่างดูซีเรียลเมื่อมีป๊อปอัปคำสั่งย่อยเด้งขึ้นมาด้านบน
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

// ดันป๊อปอัปคำสั่งย่อย (พิมพ์, แก้ไข, ย้าย, ลบ) ขึ้นมาชั้นบนสุดเสมอ
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

// ติดตั้ง Observer ตรวจจับการเปิด/ปิดป๊อปอัปอัตโนมัติ (ทำงานครั้งเดียวไม่ซ้ำซ้อน)
function initWmsModalStackObserver() {
    if (wmsModalObserverInitialized || typeof MutationObserver === 'undefined' || !document.body) return;
    wmsModalObserverInitialized = true;

    let syncScheduled = false;
    const scheduleSync = () => {
        if (syncScheduled) return;
        syncScheduled = true;
        requestAnimationFrame(() => {
            syncScheduled = false;
            syncStockDetailParentState();
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
}

function handleModalEscapeKey(e) {
    if (e.key !== 'Escape') return;

    const elevatedModals = Array.from(document.querySelectorAll('.wms-elevated-modal, .modal-overlay'))
        .filter(el => isSecondaryModalVisible(el))
        .sort((a, b) => (parseInt(window.getComputedStyle(b).zIndex || '0', 10) - parseInt(window.getComputedStyle(a).zIndex || '0', 10)));

    if (elevatedModals.length > 0) {
        const topEl = elevatedModals[0];
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
            topEl.classList.remove('active', 'show', 'open');
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
// --- DATABASE LOADING POPUP NOTIFICATION ENGINE ---
// =========================================================================
let wmsDbLoadingHideTimer = null;
let wmsDbLoadingDismissedByUser = false;

function ensureDbLoadingPopupExists() {
    let popup = document.getElementById('wmsDbLoadingModal');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'wmsDbLoadingModal';
        popup.className = 'wms-db-loading-overlay';
        popup.setAttribute('role', 'status');
        popup.setAttribute('aria-live', 'polite');
        popup.style.display = 'none';
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

                <div class="wms-db-loading-actions">
                    <button type="button" class="btn btn-sm btn-secondary wms-db-bg-btn" onclick="hideDbLoadingPopup(true)">
                        <i class="fa-solid fa-eye-slash"></i> ซ่อนหน้าต่าง (โหลดต่อเบื้องหลัง)
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
    }
    return popup;
}

function showDbLoadingPopup(title = 'กำลังโหลดข้อมูลสต็อกสินค้า...', subtitle = 'กรุณารอสักครู่ ระบบกำลังเชื่อมต่อฐานข้อมูลคลังสินค้า', percent = 15) {
    if (wmsDbLoadingHideTimer) {
        clearTimeout(wmsDbLoadingHideTimer);
        wmsDbLoadingHideTimer = null;
    }
    wmsDbLoadingDismissedByUser = false;

    const popup = ensureDbLoadingPopupExists();
    const iconWrap = document.getElementById('wmsDbLoadingIconWrap');
    const centerIcon = document.getElementById('wmsDbLoadingCenterIcon');
    const stageBadge = document.getElementById('wmsDbLoadingStageBadge');
    const titleEl = document.getElementById('wmsDbLoadingTitle');
    const subEl = document.getElementById('wmsDbLoadingSubtitle');
    const barEl = document.getElementById('wmsDbLoadingProgressBar');
    const pctEl = document.getElementById('wmsDbLoadingPercentText');
    const counterEl = document.getElementById('wmsDbLoadingCounterText');

    if (iconWrap) iconWrap.classList.remove('is-success', 'is-error');
    if (centerIcon) centerIcon.className = 'fa-solid fa-database wms-db-center-icon';
    if (stageBadge) {
        stageBadge.innerHTML = `<span class="wms-db-dot"></span> ${navigator.onLine ? 'กำลังซิงค์ฐานข้อมูลออนไลน์' : 'โหมดออฟไลน์ (กำลังโหลดแคชในเครื่อง)'}`;
    }
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (barEl) barEl.style.width = `${Math.min(100, Math.max(5, percent))}%`;
    if (pctEl) pctEl.textContent = `${Math.min(100, Math.max(5, Math.round(percent)))}%`;
    if (counterEl) counterEl.textContent = 'กำลังเตรียมข้อมูล...';

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

// Secure Dynamic Supabase Instance Getter
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) {
        return _supabase;
    }
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_CLIENT) {
        return window.ENV.SUPABASE_CLIENT;
    }
    return null;
}

let globalInventoryData = [];
let globalMasterProducts = [];
let occupiedLocationsSet = new Set();
let selectedItemSnSet = new Set();
let currentFilteredItems = [];
let currentInventoryGroups = [];
let inventoryViewMode = 'grouped'; // 'grouped' (Default) | 'detailed'
let currentDetailModalGroupKey = null;
let currentModalQuickFilter = 'ALL'; // 'ALL' | 'SELECTED' | 'PENDING'
let wmsIsDatabaseLoading = false;
let wmsFilterDebounceTimer = null;

// 🟢 1. ดึงรายการสินค้าทั้งหมดในคลัง (ดึงครบ 100% วนลูปจนกว่าจะหมด พร้อมอัปเดตสถานะบน Popup)
async function fetchAllWarehouseItems() {
    if (!navigator.onLine) {
        updateDbLoadingPopup(
            'กำลังโหลดข้อมูลสต็อกจากหน่วยความจำสำรอง...',
            'ตรวจพบการเชื่อมต่อออฟไลน์ กำลังดึงข้อมูลล่าสุดที่บันทึกไว้ในเครื่อง',
            55,
            'โหมดออฟไลน์ (Offline Cache)'
        );
        const cached = localStorage.getItem('WMS_LOCAL_INVENTORY_CACHE');
        return cached ? JSON.parse(cached) : [];
    }

    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;
    let retryCount = 0;
    let batchNumber = 1;

    const client = getSupabaseClient();

    while (hasMore) {
        try {
            if (!client) break;

            const estimatedProgress = Math.min(68, 18 + (batchNumber * 12));
            updateDbLoadingPopup(
                'กำลังดึงข้อมูลสต็อกสินค้าจากฐานข้อมูล...',
                `กำลังดาวน์โหลดข้อมูลชุดที่ ${batchNumber} กรุณารอสักครู่...`,
                estimatedProgress,
                `ดึงข้อมูลแล้ว ${allData.length.toLocaleString()} รายการ`
            );

            const { data, error } = await client
                .from('warehouse_items')
                .select('*')
                .order('created_at', { ascending: false })
                .range(from, from + step - 1);

            if (error) {
                retryCount++;
                if (retryCount > 3) throw error;
                updateDbLoadingPopup(
                    'กำลังเชื่อมต่อฐานข้อมูลอีกครั้ง...',
                    `การตอบสนองล่าช้า กำลังลองใหม่ครั้งที่ ${retryCount}/3`,
                    estimatedProgress,
                    `ดึงข้อมูลแล้ว ${allData.length.toLocaleString()} รายการ`
                );
                await new Promise(res => setTimeout(res, 500));
                continue;
            }

            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += step;
                batchNumber++;
                updateDbLoadingPopup(
                    'กำลังดึงข้อมูลสต็อกสินค้าจากฐานข้อมูล...',
                    'กำลังรวบรวมรายการซีเรียลและพิกัดจัดเก็บทั้งหมด...',
                    Math.min(70, 20 + (batchNumber * 12)),
                    `ดึงข้อมูลแล้ว ${allData.length.toLocaleString()} รายการ`
                );
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        } catch (e) {
            hasMore = false;
        }
    }
    
    try { 
        localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(allData)); 
    } catch (e) {}

    if (typeof updateDBConnectionStatus === 'function') {
        updateDBConnectionStatus(true, `(สต็อกในคลัง: ${allData.length.toLocaleString()} รายการ)`);
    }
    return allData;
}

// 🟢 2. ดึงสินค้า Master SKU ทั้งหมดจากฐานข้อมูล Supabase (ไม่จำกัดจำนวน)
async function loadMasterProductsFromDB() {
    const statElem = document.getElementById('inboundMasterProductsStatText');
    if (statElem && globalMasterProducts.length === 0) {
        statElem.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูลสินค้า Master ทั้งหมดจากฐานข้อมูล DB...`;
    }

    try {
        if (!navigator.onLine) {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
            }
            updateMasterProductsStatUI();
            return;
        }

        const client = getSupabaseClient();
        if (!client) {
            updateMasterProductsStatUI();
            return;
        }

        let allProducts = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
            let response = await client
                .from('products')
                .select('*')
                .order('id', { ascending: true })
                .range(from, from + step - 1);

            if (response.error) {
                response = await client
                    .from('products')
                    .select('*')
                    .order('sku', { ascending: true })
                    .range(from, from + step - 1);
            }

            if (response.error) break;

            const data = response.data;
            if (data && data.length > 0) {
                allProducts = allProducts.concat(data);
                from += step;
                if (data.length < step) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        if (allProducts.length > 0) {
            globalMasterProducts = allProducts;
            try {
                localStorage.setItem('WMS_MASTER_PRODUCTS_CACHE', JSON.stringify(allProducts));
            } catch (quotaErr) {}
        } else {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
            }
        }

        updateMasterProductsStatUI();
    } catch(e) {
        const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
        if (cachedMaster) {
            try { globalMasterProducts = JSON.parse(cachedMaster); } catch(err) {}
        }
        updateMasterProductsStatUI();
    }
}

// 🟢 3. อัปเดตข้อความสถานะจำนวน Master SKU
function updateMasterProductsStatUI() {
    const statElem = document.getElementById('inboundMasterProductsStatText');
    if (statElem) {
        const count = globalMasterProducts.length;
        if (count > 0) {
            statElem.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--success);"></i> เชื่อมต่อ DB สมบูรณ์ · ดึงข้อมูลสินค้า Master ในระบบแล้ว <strong class="mono" style="color:var(--primary-text); font-size:1.1rem; background:var(--bg-surface); padding:2px 8px; border-radius:6px; border:1px solid var(--border-strong);">${count.toLocaleString()}</strong> รายการ (ครบถ้วน 100%)`;
        } else {
            statElem.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);"></i> ไม่พบข้อมูลสินค้า Master ในระบบ`;
        }
    }
}

// 🟢 4. โหลดข้อมูลทั้งหมดจากฐานข้อมูล พร้อมแสดง Pop-up แจ้งเตือนระหว่างโหลด
async function loadDataFromDatabase(options = {}) {
    const isSilent = options && options.silent === true;
    wmsIsDatabaseLoading = true;

    const tbody = document.getElementById('inventoryTableBody');
    if (tbody && globalInventoryData.length === 0) {
        const colSpan = inventoryViewMode === 'grouped' ? 8 : 14;
        tbody.innerHTML = `
            <tr>
                <td colspan="${colSpan}" style="text-align:center; padding:42px 16px; color:var(--text-muted);">
                    <div style="display:inline-flex; flex-direction:column; align-items:center; gap:10px;">
                        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.8rem; color:var(--primary);"></i>
                        <span style="font-weight:700; font-size:0.95rem; color:var(--text-main);">กำลังโหลดข้อมูลสต็อกสินค้าจากฐานข้อมูล...</span>
                        <span style="font-size:0.82rem;">กรุณารอสักครู่ ระบบกำลังซิงค์รายการทั้งหมด</span>
                    </div>
                </td>
            </tr>
        `;
    }

    if (!isSilent) {
        showDbLoadingPopup(
            'กำลังโหลดข้อมูลเช็คสต็อกสินค้า...',
            'กำลังเชื่อมต่อฐานข้อมูลคลังสินค้าและดึงรายการล่าสุด',
            15
        );
    }

    try {
        globalInventoryData = await fetchAllWarehouseItems();
        globalInventoryData.forEach(item => {
            if (item.meter === undefined || item.meter === null || item.meter === '') {
                item.meter = 0;
            }
            if (!item.received_by) {
                item.received_by = item.created_by || item.received_by_name || 'ไม่ระบุ';
            }
        });

        mergePendingIntoInventory();

        updateDbLoadingPopup(
            'กำลังซิงค์ฐานข้อมูลสินค้าหลัก (Master SKU)...',
            'ตรวจสอบรหัสสินค้า ชื่อรุ่น และรายละเอียดมาตรฐาน',
            78,
            `พบสต็อกในคลัง ${globalInventoryData.length.toLocaleString()} รายการ`
        );
        await loadMasterProductsFromDB();

        if (typeof loadWarehouseConfigsFromDB === 'function') {
            updateDbLoadingPopup(
                'กำลังโหลดโครงสร้างพิกัดและผังคลังสินค้า...',
                'ตรวจสอบแถวจัดเก็บ ล็อก และชั้นวางทั้งหมด',
                88,
                `สต็อก ${globalInventoryData.length.toLocaleString()} รายการ · Master ${globalMasterProducts.length.toLocaleString()} รุ่น`
            );
            await loadWarehouseConfigsFromDB();
        }

        updateDbLoadingPopup(
            'กำลังจัดเรียงตารางและคำนวณยอดคงเหลือ...',
            'กำลังจัดกลุ่มสินค้าตามรุ่นเพื่อให้แสดงผลได้รวดเร็ว',
            96,
            `พร้อมแสดงผล ${globalInventoryData.length.toLocaleString()} รายการ`
        );

        rebuildOccupiedSet();
        wmsIsDatabaseLoading = false;
        filterInventoryData();
        updateKPIs();

        window.dispatchEvent(new CustomEvent('wms_inventory_updated', { 
            detail: { count: globalInventoryData.length } 
        }));

        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        if (typeof loadRecentInboundFeedFromDB === 'function') await loadRecentInboundFeedFromDB();

        if (!isSilent) {
            updateDbLoadingPopup(
                'โหลดข้อมูลสต็อกสินค้าสำเร็จครบถ้วน!',
                `ซิงค์ข้อมูลเรียบร้อยทั้งหมด ${globalInventoryData.length.toLocaleString()} รายการ`,
                100,
                'เชื่อมต่อฐานข้อมูลสมบูรณ์ 100%',
                'success'
            );
            setTimeout(() => hideDbLoadingPopup(false), 360);
        }
    } catch (err) {
        wmsIsDatabaseLoading = false;
        if (typeof updateDBConnectionStatus === 'function') {
            updateDBConnectionStatus(false, "(Sync Failed)");
        }
        if (!isSilent) {
            updateDbLoadingPopup(
                'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้',
                'ระบบกำลังแสดงข้อมูลสำรองในเครื่อง (หากมี) กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
                100,
                'การเชื่อมต่อขัดข้อง',
                'error'
            );
            setTimeout(() => hideDbLoadingPopup(false), 1400);
        }
    }
}

function mergePendingIntoInventory() {
    const have = new Set(globalInventoryData.map(i => String(i.sn).toLowerCase()));
    const activeReceiver = getCurrentReceiverName();

    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        offlineInboundQueue.forEach(p => {
            if (!have.has(String(p.sn).toLowerCase())) {
                globalInventoryData.unshift({
                    ...p,
                    received_by: p.received_by || activeReceiver,
                    _pending: true
                });
            }
        });
    }
}

function rebuildOccupiedSet() {
    occupiedLocationsSet.clear();
    globalInventoryData.forEach(i => {
        if(i.location && i.location.toUpperCase() !== 'DOCK' && i.location.toUpperCase() !== 'OFFICE' && i.location.toUpperCase() !== 'PENDING') {
            occupiedLocationsSet.add(i.location.toUpperCase());
        }
    });
}

function debouncedFilterInventoryData() {
    if (wmsFilterDebounceTimer) clearTimeout(wmsFilterDebounceTimer);
    wmsFilterDebounceTimer = setTimeout(() => {
        filterInventoryData();
    }, 110);
}

function filterInventoryData() {
    const searchInput = document.getElementById('searchInput');
    const aisleSelect = document.getElementById('filterAisleSelect');
    const baySelect = document.getElementById('filterBaySelect');
    const locSelect = document.getElementById('filterLocationSelect');

    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const aisleFilter = aisleSelect ? aisleSelect.value : 'ALL';
    const bayFilter = baySelect ? baySelect.value : 'ALL';
    const locFilter = locSelect ? locSelect.value : 'ALL';

    currentFilteredItems = globalInventoryData.filter(item => {
        const matchText = !query || 
            (item.sn && item.sn.toLowerCase().includes(query)) ||
            (item.category && item.category.toLowerCase().includes(query)) ||
            (item.name && item.name.toLowerCase().includes(query)) ||
            (item.location && item.location.toLowerCase().includes(query)) ||
            (item.received_by && item.received_by.toLowerCase().includes(query));

        let matchAisle = true;
        if(aisleFilter !== 'ALL') {
            if(aisleFilter === 'DOCK') matchAisle = (item.location || '').toUpperCase() === 'DOCK';
            else matchAisle = (item.location || '').toUpperCase().startsWith(`${aisleFilter}-`) || (item.location || '').toUpperCase() === aisleFilter;
        }

        let matchBay = true;
        if(bayFilter !== 'ALL' && aisleFilter !== 'ALL' && aisleFilter !== 'DOCK') {
            matchBay = (item.location || '').toUpperCase().startsWith(`${aisleFilter}-${bayFilter}-`);
        }

        let matchLoc = true;
        if(locFilter !== 'ALL') {
            matchLoc = (item.location || '').toUpperCase() === locFilter.toUpperCase();
        }

        return matchText && matchAisle && matchBay && matchLoc;
    });

    renderInventoryTable(currentFilteredItems);
    refreshStockDetailModalIfActive();
}

// 🟢 โครงสร้างจัดกลุ่มสินค้าสำหรับแสดงผลแบบรวดเร็วตามหมวดหมู่/รุ่น
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
            btn.title = "คลิกเพื่อสลับเป็นโหมดแสดงรายการซีเรียลทั้งหมด";
        } else {
            btn.innerHTML = `<i class="fa-solid fa-list-check" style="color:var(--warning);"></i> โหมดแสดงทุกซีเรียล`;
            btn.title = "คลิกเพื่อสลับเป็นโหมดจัดกลุ่มตามรุ่นเพื่อความรวดเร็ว";
        }
    }

    if (printAllBtn) {
        const filteredCount = currentFilteredItems.length;
        printAllBtn.innerHTML = `<i class="fa-solid fa-barcode"></i> พิมพ์บาร์โค้ดทั้งหมดที่แสดง (${filteredCount.toLocaleString()} S/N)`;
        printAllBtn.title = "เปิดศูนย์พิมพ์บาร์โค้ดสติกเกอร์สำหรับรายการที่แสดงอยู่ทั้งหมด (รองรับหลักพัน–หลักหมื่น S/N)";
    }
}

function toggleStockViewMode() {
    inventoryViewMode = (inventoryViewMode === 'grouped') ? 'detailed' : 'grouped';
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

// 🟢 แสดงผลตารางสต็อกสินค้าหลัก
function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    updateStockViewModeButtonUI();

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
            tr.style.cssText = "transition: background 0.15s ease;";
            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle;">
                    <input type="checkbox" class="group-checkbox" data-group-key="${escapeHTML(grp.groupKey)}" ${isGroupAllChecked ? 'checked' : ''} onchange="toggleGroupSelection('${escapeHTML(grp.groupKey)}', this.checked)">
                </td>
                <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${idx + 1}</td>
                <td style="text-align:left; vertical-align:middle;"><code class="mono font-bold" style="color:var(--primary-text); font-size:0.92rem; background:rgba(37,99,235,0.06); padding:3px 8px; border-radius:4px; border:1px solid rgba(37,99,235,0.15);">${escapeHTML(grp.category)}</code></td>
                <td style="text-align:left; vertical-align:middle;">
                    <div class="font-bold text-multiline-truncate" style="color:var(--text-main); font-size:0.92rem;" title="${escapeHTML(grp.name)}">${escapeHTML(grp.name)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;"><i class="fa-solid fa-barcode"></i> รวม ${grp.items.length} ซีเรียล</div>
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
                            <i class="fa-solid fa-eye"></i> ดูซีเรียล (${grp.items.length})
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary wms-action-btn-print" onclick="triggerPrintBarcodeAction('GROUP', '${escapeHTML(grp.groupKey)}')" title="พิมพ์บาร์โค้ดสติกเกอร์ทั้งหมดในรุ่นนี้ (${grp.items.length} S/N)" style="border-radius:6px; font-weight:600; padding:5px 10px;">
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

        if(items.length === 0) {
            const emptyMsg = wmsIsDatabaseLoading
                ? `<div style="display:inline-flex; align-items:center; gap:8px; color:var(--primary); font-weight:600;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูลสต็อกสินค้าจากฐานข้อมูล...</div>`
                : `ไม่พบข้อมูลสินค้าตรงตามเงื่อนไขค้นหา`;
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:32px; color:var(--text-muted); font-size:0.92rem;">${emptyMsg}</td></tr>`;
            return;
        }

        const frag = document.createDocumentFragment();
        let allVisibleChecked = items.length > 0;

        items.forEach((item, index) => {
            const isChecked = selectedItemSnSet.has(item.sn);
            if(!isChecked) allVisibleChecked = false;

            const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
            const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;
            const receiverDisplay = item.received_by || item.created_by || item.received_by_name || 'ไม่ระบุ';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle;"><input type="checkbox" class="item-checkbox" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
                <td style="text-align:center; font-weight:700; vertical-align:middle;" class="mono">${index + 1}</td>
                <td style="text-align:left; vertical-align:middle;"><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(item.category || 'N/A')}</code></td>
                <td style="text-align:left; vertical-align:middle;"><div class="text-multiline-truncate" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
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

        tbody.appendChild(frag);
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb) selectAllCb.checked = allVisibleChecked;
    }

    updateSelectedCountUI();
}

function toggleGroupSelection(groupKey, checked) {
    const group = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!group) return;

    group.items.forEach(item => {
        if (checked) selectedItemSnSet.add(item.sn);
        else selectedItemSnSet.delete(item.sn);
    });

    document.querySelectorAll('.item-checkbox-modal').forEach(cb => {
        const sn = cb.getAttribute('data-sn');
        if (group.items.some(i => i.sn === sn)) {
            cb.checked = checked;
            const tr = cb.closest('tr');
            if (tr) tr.classList.toggle('is-selected', checked);
        }
    });

    updateSelectedCountUI();
}

// =========================================================================
// --- SINGLE UNIFIED SERIAL DETAIL MODAL (ZERO DUPLICATES, EXACT COLUMN SYNC) ---
// =========================================================================
function ensureStockDetailModalExists() {
    initWmsModalStackObserver();

    let modal = document.getElementById('stockDetailModal');
    // ลบโครงสร้าง Modal เก่าที่ซ้ำซ้อนออก เพื่อให้เหลือโค้ดป๊อปอัปชุดเดียวที่สมบูรณ์ 100%
    if (modal && modal.dataset.wmsUnifiedVersion !== '23.4') {
        modal.remove();
        modal = null;
    }

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stockDetailModal';
        modal.dataset.wmsUnifiedVersion = '23.4';
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
                                <div class="wms-sd-hint">ตรวจสอบหมายเลขซีเรียล พิกัดจัดเก็บ และจัดการรายการแยกรายเครื่องได้ทันที</div>
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
                                <i class="fa-solid fa-barcode"></i> พิมพ์บาร์โค้ดที่เลือก
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary wms-action-btn-print wms-sd-bulk-btn" onclick="printAllGroupBarcodesFromModal()" title="พิมพ์บาร์โค้ดทุก S/N ในรุ่นนี้ทั้งหมด">
                                <i class="fa-solid fa-print"></i> พิมพ์ทั้งรุ่น
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary wms-action-btn-relocate wms-sd-bulk-btn" onclick="relocateSelectedFromModal()">
                                <i class="fa-solid fa-right-left"></i> ย้ายพิกัดที่เลือก
                            </button>
                            <button type="button" class="btn btn-sm btn-danger wms-action-btn-delete wms-sd-bulk-btn" onclick="deleteSelectedFromModal()">
                                <i class="fa-solid fa-trash"></i> ลบรายการที่เลือก
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
    const selectedInGroup = grp.items.filter(i => selectedItemSnSet.has(i.sn)).length;
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
            <i class="fa-solid fa-square-check"></i> เลือกไว้: <strong class="mono" id="wmsSdHeaderSelectedNum">${selectedInGroup.toLocaleString()}</strong> รายการ
        </span>
    `;
}

// 🟢 เปิด Modal รายละเอียดซีเรียล
function openStockDetailModal(groupKey) {
    currentDetailModalGroupKey = groupKey;
    currentModalQuickFilter = 'ALL';
    ensureStockDetailModalExists();

    const grp = currentInventoryGroups.find(g => g.groupKey === groupKey);
    if (!grp) {
        if (typeof showToast === 'function') showToast('⚠️ ไม่พบข้อมูลสินค้ากลุ่มนี้', true);
        return;
    }

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
            <span>รุ่น: ${escapeHTML(grp.name)}</span>
        `;
    }
    
    if (subtitleElem) {
        subtitleElem.innerHTML = buildStockDetailStatsBarHTML(grp);
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
            locOptions += `<option value="${escapeHTML(abKey)}">📍 ${escapeHTML(labelText)} (${count} เครื่อง)</option>`;
        });

        locSelect.innerHTML = locOptions;
        locSelect.value = 'ALL';
    }

    if (searchInput) searchInput.value = '';
    if (searchClearBtn) searchClearBtn.style.display = 'none';

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
    const selectedInGroup = grp ? grp.items.filter(i => selectedItemSnSet.has(i.sn)).length : 0;
    const pendingInGroup = grp ? grp.items.filter(i => i._pending).length : 0;

    const selSpan = document.getElementById('pillSelectedCount');
    const penSpan = document.getElementById('pillPendingCount');
    const headerSelNum = document.getElementById('wmsSdHeaderSelectedNum');
    if (selSpan) selSpan.textContent = selectedInGroup;
    if (penSpan) penSpan.textContent = pendingInGroup;
    if (headerSelNum) headerSelNum.textContent = selectedInGroup.toLocaleString();

    document.querySelectorAll('#stockDetailQuickPills .wms-pill-btn').forEach(btn => {
        const pillMode = btn.getAttribute('data-pill');
        if (pillMode === currentModalQuickFilter) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function setModalQuickFilter(mode) {
    currentModalQuickFilter = mode || 'ALL';
    filterStockDetailModalItems();
}

function renderStockDetailModalBody(items) {
    const tbody = document.getElementById('stockDetailModalTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="col-center" style="padding:32px 16px; color:var(--text-muted); font-size:0.92rem;">ไม่พบรายการซีเรียลสินค้าตรงตามเงื่อนไข</td></tr>`;
        const footerBadge = document.getElementById('stockDetailModalFooterBadge');
        if (footerBadge) {
            footerBadge.textContent = `แสดงผล 0 ซีเรียล | เลือกแล้ว ${selectedItemSnSet.size.toLocaleString()} รายการ`;
        }
        return;
    }

    let allChecked = items.length > 0;
    const frag = document.createDocumentFragment();

    items.forEach((item, index) => {
        const isChecked = selectedItemSnSet.has(item.sn);
        if (!isChecked) allChecked = false;

        const formatLoc = typeof formatLocationCode === 'function' ? formatLocationCode(item.location) : item.location;
        const meterValue = item.meter !== undefined && item.meter !== null ? item.meter : 0;
        const receiverDisplay = item.received_by || item.created_by || item.received_by_name || 'ไม่ระบุ';

        const tr = document.createElement('tr');
        if (isChecked) tr.classList.add('is-selected');
        tr.innerHTML = `
            <td class="col-center"><input type="checkbox" class="item-checkbox-modal" data-sn="${escapeHTML(item.sn)}" ${isChecked ? 'checked' : ''} onchange="toggleItemSelection('${escapeHTML(item.sn)}', this.checked)"></td>
            <td class="col-center mono font-bold">${index + 1}</td>
            <td class="col-left"><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(item.category || 'N/A')}</code></td>
            <td class="col-left"><div class="text-multiline-truncate" title="${escapeHTML(item.name || '-')}">${escapeHTML(item.name || '-')}</div></td>
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

    tbody.appendChild(frag);

    const selectAllCb = document.getElementById('modalSelectAllCb');
    if (selectAllCb) selectAllCb.checked = allChecked;

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge) {
        footerBadge.textContent = `แสดงผล ${items.length.toLocaleString()} ซีเรียล | เลือกแล้ว ${selectedItemSnSet.size.toLocaleString()} รายการ`;
    }
}

// 🟢 กรองซีเรียลใน Modal ตามคำค้นหา, พิกัดแถว/ล็อก และตัวกรองด่วน
function filterStockDetailModalItems() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    updateModalQuickPillUI(grp);

    const searchEl = document.getElementById('stockDetailModalSearch');
    const searchClearBtn = document.getElementById('stockDetailModalSearchClear');
    const rawQuery = searchEl ? searchEl.value : '';
    const query = rawQuery.trim().toLowerCase();
    if (searchClearBtn) {
        searchClearBtn.style.display = rawQuery.length > 0 ? 'inline-flex' : 'none';
    }

    const selectedAisleBay = (document.getElementById('stockDetailModalLocationFilter')?.value || 'ALL').toUpperCase();
    const badge = document.getElementById('stockDetailFilterCountBadge');

    const filtered = grp.items.filter(item => {
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

        let matchQuickPill = true;
        if (currentModalQuickFilter === 'SELECTED') {
            matchQuickPill = selectedItemSnSet.has(item.sn);
        } else if (currentModalQuickFilter === 'PENDING') {
            matchQuickPill = Boolean(item._pending);
        }

        return matchText && matchAisleBay && matchQuickPill;
    });

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
    renderInventoryTable(currentFilteredItems);
}

function toggleModalSelectAllItems(checked) {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp) return;

    grp.items.forEach(item => {
        if (checked) selectedItemSnSet.add(item.sn);
        else selectedItemSnSet.delete(item.sn);
    });

    filterStockDetailModalItems();
    updateSelectedCountUI();
}

// 🟢 คัดลอกหมายเลขซีเรียลทั้งหมดในรุ่นที่กำลังเปิดดูอยู่
function copyAllModalSerials() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp || grp.items.length === 0) return;

    const snList = grp.items.map(i => i.sn).filter(Boolean).join('\n');
    copyTextToClipboard(snList, `รายการ S/N ทั้งหมด ${grp.items.length} รายการ`);
}

// 🟢 ส่งออกรายการซีเรียลของรุ่นที่เปิดดูอยู่เป็นไฟล์ CSV (รองรับภาษาไทย Excel UTF-8 BOM)
function exportModalSerialsCSV() {
    if (!currentDetailModalGroupKey) return;
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (!grp || grp.items.length === 0) return;

    const headers = ['ลำดับ', 'รหัสสินค้า (SKU)', 'ชื่อรุ่น', 'หมายเลขซีเรียล (S/N)', 'เลขมิเตอร์', 'พิกัดจัดเก็บ', 'จำนวน', 'ผู้รับสินค้าเข้า', 'วันที่รับเข้า'];
    const rows = grp.items.map((item, idx) => [
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
        showToast(`📥 ส่งออกไฟล์ CSV รุ่น ${grp.category} (${grp.items.length} รายการ) เรียบร้อยแล้ว`);
    }
}

// 🟢 ปุ่มคำสั่งกลุ่มจาก Modal และหน้าเช็คสต็อก (พิมพ์ / ย้าย / ลบ)
function printSelectedBarcodesFromModal() {
    if (selectedItemSnSet.size === 0) {
        if (typeof showToast === 'function') {
            showToast("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด", true);
        } else {
            alert("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อพิมพ์บาร์โค้ด");
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
            showToast("⚠️ ไม่พบรายการสินค้าในหน้าเช็คสต็อกสำหรับพิมพ์บาร์โค้ด", true);
        } else {
            alert("⚠️ ไม่พบรายการสินค้าในหน้าเช็คสต็อกสำหรับพิมพ์บาร์โค้ด");
        }
        return;
    }
    triggerPrintBarcodeAction('ALL_FILTERED');
}

function relocateSelectedFromModal() {
    if (selectedItemSnSet.size === 0) {
        if (typeof showToast === 'function') {
            showToast("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อย้ายพิกัด", true);
        } else {
            alert("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อย้ายพิกัด");
        }
        return;
    }
    triggerBatchRelocateAction();
}

function deleteSelectedFromModal() {
    if (selectedItemSnSet.size === 0) {
        if (typeof showToast === 'function') {
            showToast("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อลบ", true);
        } else {
            alert("⚠️ กรุณาเลือกรายการซีเรียลอย่างน้อย 1 รายการเพื่อลบ");
        }
        return;
    }
    triggerDeleteItemAction('BATCH');
}

// 🟢 Unified Action Triggers (แสดงป๊อปอัปแจ้งเตือนทันทีเมื่อสั่งพิมพ์กลุ่ม/ทั้งหมด)
function triggerPrintBarcodeAction(mode = 'SINGLE', sn = null) {
    const isBatchPrint = (mode === 'ALL_FILTERED' || mode === 'GROUP' || mode === 'MULTI');
    if (isBatchPrint && typeof window.WMSBarcodeStudio !== 'undefined' && typeof window.WMSBarcodeStudio.showLoadingPopup === 'function') {
        const countHint = mode === 'ALL_FILTERED'
            ? currentFilteredItems.length
            : (mode === 'MULTI' ? selectedItemSnSet.size : 0);
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
        elevateTopModal(WMS_ACTION_MODAL_GROUPS.print, 'print');
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
    elevateTopModal(WMS_ACTION_MODAL_GROUPS.edit, 'edit');
}

function triggerRelocateAction(id, sn, name, location) {
    if (typeof requestRelocateModal === 'function') {
        requestRelocateModal(id, sn, name, location);
    } else if (typeof window.requestRelocateModal === 'function') {
        window.requestRelocateModal(id, sn, name, location);
    }
    elevateTopModal(WMS_ACTION_MODAL_GROUPS.relocate, 'relocate');
}

function triggerDeleteItemAction(mode, sn, id) {
    if (typeof requestDeleteModal === 'function') {
        requestDeleteModal(mode, sn, id);
    } else if (typeof window.requestDeleteModal === 'function') {
        window.requestDeleteModal(mode, sn, id);
    }
    elevateTopModal(WMS_ACTION_MODAL_GROUPS.delete, 'delete');
}

function triggerBatchRelocateAction() {
    if (typeof requestBatchRelocateModal === 'function') {
        requestBatchRelocateModal();
    } else if (typeof window.requestBatchRelocateModal === 'function') {
        window.requestBatchRelocateModal();
    }
    elevateTopModal(WMS_ACTION_MODAL_GROUPS.relocate, 'relocate');
}

function refreshStockDetailModalIfActive() {
    if (!currentDetailModalGroupKey) return;
    const modal = document.getElementById('stockDetailModal');
    if (!modal || modal.style.display === 'none') return;

    currentInventoryGroups = buildInventoryGroups(currentFilteredItems);
    const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
    if (grp) {
        const subtitleElem = document.getElementById('stockDetailModalSubtitle');
        if (subtitleElem) {
            subtitleElem.innerHTML = buildStockDetailStatsBarHTML(grp);
        }
        filterStockDetailModalItems();
    } else {
        closeStockDetailModal();
    }
}

function updateKPIs() {
    const kpiTotal = document.getElementById('kpiTotalItems');
    if (kpiTotal) kpiTotal.textContent = globalInventoryData.length.toLocaleString();

    const uniqueInventorySkus = new Set(globalInventoryData.map(i => i.category)).size;
    const totalMasterSkus = globalMasterProducts.length;

    const kpiModelElem = document.getElementById('kpiTotalModels');
    if (kpiModelElem) {
        if (totalMasterSkus > 0) {
            kpiModelElem.textContent = `${uniqueInventorySkus.toLocaleString()} / ${totalMasterSkus.toLocaleString()}`;
        } else {
            kpiModelElem.textContent = uniqueInventorySkus.toLocaleString();
        }
    }

    const dockItems = globalInventoryData.filter(i => (i.location || '').toUpperCase() === 'DOCK').length;
    const kpiDock = document.getElementById('kpiDockItems');
    if (kpiDock) kpiDock.textContent = dockItems.toLocaleString();
}

function toggleSelectAllVisibleItems(checked) {
    if (inventoryViewMode === 'grouped') {
        currentInventoryGroups.forEach(grp => {
            grp.items.forEach(item => {
                if (checked) selectedItemSnSet.add(item.sn);
                else selectedItemSnSet.delete(item.sn);
            });
        });
        document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = checked);
    } else {
        currentFilteredItems.forEach(item => {
            if (checked) selectedItemSnSet.add(item.sn);
            else selectedItemSnSet.delete(item.sn);
        });
        document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = checked);
    }

    updateSelectedCountUI();
}

function toggleItemSelection(sn, checked) {
    if(checked) selectedItemSnSet.add(sn);
    else selectedItemSnSet.delete(sn);

    document.querySelectorAll(`.item-checkbox-modal[data-sn="${escapeHTML(sn)}"]`).forEach(cb => {
        cb.checked = checked;
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('is-selected', checked);
    });
    document.querySelectorAll(`.item-checkbox[data-sn="${escapeHTML(sn)}"]`).forEach(cb => {
        cb.checked = checked;
        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('is-selected', checked);
    });

    if (currentDetailModalGroupKey) {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        if (grp) updateModalQuickPillUI(grp);
    }

    updateSelectedCountUI();
}

function updateSelectedCountUI() {
    const count = selectedItemSnSet.size;
    const selCount = document.getElementById('selectedCountSpan');
    const selRelocateCount = document.getElementById('selectedRelocateCountSpan');
    
    if (selCount) selCount.textContent = count;
    if (selRelocateCount) selRelocateCount.textContent = count;

    const footerBadge = document.getElementById('stockDetailModalFooterBadge');
    if (footerBadge && currentDetailModalGroupKey) {
        const grp = currentInventoryGroups.find(g => g.groupKey === currentDetailModalGroupKey);
        const totalInGroup = grp ? grp.items.length : 0;
        footerBadge.textContent = `แสดงผล ${totalInGroup.toLocaleString()} ซีเรียล | เลือกแล้ว ${count.toLocaleString()} รายการ`;
    }
}

// เริ่มต้นระบบ Observer ทันทีที่ DOM พร้อมใช้งาน
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWmsModalStackObserver);
    } else {
        initWmsModalStackObserver();
    }
}

// Global Exports
window.selectedItemSnSet = selectedItemSnSet;
window.copyTextToClipboard = copyTextToClipboard;
window.showDbLoadingPopup = showDbLoadingPopup;
window.updateDbLoadingPopup = updateDbLoadingPopup;
window.hideDbLoadingPopup = hideDbLoadingPopup;
window.debouncedFilterInventoryData = debouncedFilterInventoryData;
window.toggleStockViewMode = toggleStockViewMode;
window.toggleGroupSelection = toggleGroupSelection;
window.openStockDetailModal = openStockDetailModal;
window.closeStockDetailModal = closeStockDetailModal;
window.clearStockDetailModalSearch = clearStockDetailModalSearch;
window.filterStockDetailModalItems = filterStockDetailModalItems;
window.setModalQuickFilter = setModalQuickFilter;
window.toggleModalSelectAllItems = toggleModalSelectAllItems;
window.copyAllModalSerials = copyAllModalSerials;
window.exportModalSerialsCSV = exportModalSerialsCSV;
window.printSelectedBarcodesFromModal = printSelectedBarcodesFromModal;
window.printAllGroupBarcodesFromModal = printAllGroupBarcodesFromModal;
window.printAllFilteredBarcodesFromInventory = printAllFilteredBarcodesFromInventory;
window.relocateSelectedFromModal = relocateSelectedFromModal;
window.deleteSelectedFromModal = deleteSelectedFromModal;
window.triggerPrintBarcodeAction = triggerPrintBarcodeAction;
window.triggerEditItemAction = triggerEditItemAction;
window.triggerRelocateAction = triggerRelocateAction;
window.triggerDeleteItemAction = triggerDeleteItemAction;
window.triggerBatchRelocateAction = triggerBatchRelocateAction;
window.closeSecondaryActionModals = closeSecondaryActionModals;
window.syncStockDetailParentState = syncStockDetailParentState;
window.elevateTopModal = elevateTopModal;
window.loadDataFromDatabase = loadDataFromDatabase;