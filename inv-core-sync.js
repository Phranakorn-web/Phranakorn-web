// =========================================================================
// --- MODULE 2A: INVENTORY CORE, DATABASE SYNC, TOMBSTONE SHIELD & REALTIME ---
// --- FILE: inv-core-sync.js (v25.0 MODULAR ARCHITECTURE) ---
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

// ตรวจสอบและลิงก์ไฟล์ inv-stock.css อัตโนมัติหากยังไม่ได้ใส่ในหน้า HTML
function ensureWmsInvDbStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('wmsInvStockStylesheet')) return;
    const existingLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .find(l => (l.getAttribute('href') || '').includes('inv-stock.css'));
    if (existingLink) {
        existingLink.id = 'wmsInvStockStylesheet';
        return;
    }
    const link = document.createElement('link');
    link.id = 'wmsInvStockStylesheet';
    link.rel = 'stylesheet';
    link.href = 'inv-stock.css';
    document.head.appendChild(link);
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

// Helper: ตรวจสอบสิทธิ์ผู้ดูแลระบบ (Admin) สำหรับการลบตรง vs ส่งคำขออนุมัติ
function isCurrentUserAdmin() {
    let userObj = null;
    if (typeof currentUser !== 'undefined' && currentUser) {
        userObj = currentUser;
    } else {
        try {
            const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
            if (savedUserStr) userObj = JSON.parse(savedUserStr);
        } catch (e) {}
    }
    if (!userObj) return true;
    const role = String(userObj.role || userObj.user_role || userObj.level || '').toLowerCase().trim();
    if (userObj.is_admin === true || userObj.isAdmin === true) return true;
    if (role === 'admin' || role === 'superadmin' || role === 'administrator' || role === 'ผู้ดูแลระบบ') return true;
    return false;
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
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
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
// --- ZERO-BOUNCE TOMBSTONE SHIELD (ป้องกันข้อมูลที่ลบแล้วดีดกลับมา) ---
// =========================================================================
const WMS_TOMBSTONE_STORAGE_KEY = 'WMS_DELETED_SN_TOMBSTONES';
const WMS_TOMBSTONE_TTL_MS = 10 * 60 * 1000;
const wmsDeletedSnTombstones = new Map();
let wmsIsBulkDeleting = false;

function normalizeSnKey(sn) {
    return String(sn || '').trim().toUpperCase();
}

function hydrateDeletedSnTombstones() {
    const now = Date.now();
    try {
        const raw = localStorage.getItem(WMS_TOMBSTONE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            Object.keys(parsed).forEach(snKey => {
                const exp = Number(parsed[snKey] || 0);
                if (exp > now) {
                    wmsDeletedSnTombstones.set(snKey, exp);
                }
            });
        }
    } catch (e) {}
}

function persistDeletedSnTombstones() {
    const now = Date.now();
    const cleanObj = {};
    wmsDeletedSnTombstones.forEach((exp, snKey) => {
        if (exp > now) {
            cleanObj[snKey] = exp;
        } else {
            wmsDeletedSnTombstones.delete(snKey);
        }
    });
    try {
        localStorage.setItem(WMS_TOMBSTONE_STORAGE_KEY, JSON.stringify(cleanObj));
    } catch (e) {}
}

function registerDeletedSnTombstones(snList) {
    if (!Array.isArray(snList) || snList.length === 0) return;
    const expireAt = Date.now() + WMS_TOMBSTONE_TTL_MS;
    for (let i = 0; i < snList.length; i++) {
        const key = normalizeSnKey(snList[i]);
        if (key) {
            wmsDeletedSnTombstones.set(key, expireAt);
        }
    }
    persistDeletedSnTombstones();
}

function isSnInTombstone(sn) {
    const key = normalizeSnKey(sn);
    if (!key) return false;
    const exp = wmsDeletedSnTombstones.get(key);
    if (!exp) return false;
    if (Date.now() > exp) {
        wmsDeletedSnTombstones.delete(key);
        return false;
    }
    return true;
}

// ล้างรายการที่ถูกลบออกจากหน่วยความจำ แคช LocalStorage และคิวออฟไลน์ทันที
function purgeDeletedItemsFromAllLocalStores(targetSnSetUpper) {
    if (!targetSnSetUpper || targetSnSetUpper.size === 0) return;

    globalInventoryData = globalInventoryData.filter(item => !targetSnSetUpper.has(normalizeSnKey(item.sn)));
    currentFilteredItems = currentFilteredItems.filter(item => !targetSnSetUpper.has(normalizeSnKey(item.sn)));

    Array.from(selectedItemSnSet).forEach(sn => {
        if (targetSnSetUpper.has(normalizeSnKey(sn))) {
            selectedItemSnSet.delete(sn);
        }
    });

    try {
        const cachedRaw = localStorage.getItem('WMS_LOCAL_INVENTORY_CACHE');
        if (cachedRaw) {
            const cachedArr = JSON.parse(cachedRaw);
            if (Array.isArray(cachedArr)) {
                const cleanedCache = cachedArr.filter(item => !targetSnSetUpper.has(normalizeSnKey(item.sn)));
                localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(cleanedCache));
            }
        }
    } catch (e) {}

    try {
        if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
            for (let i = offlineInboundQueue.length - 1; i >= 0; i--) {
                if (targetSnSetUpper.has(normalizeSnKey(offlineInboundQueue[i].sn))) {
                    offlineInboundQueue.splice(i, 1);
                }
            }
        }
        ['WMS_OFFLINE_INBOUND_QUEUE', 'offlineInboundQueue', 'wms_offline_queue'].forEach(storageKey => {
            const qRaw = localStorage.getItem(storageKey);
            if (qRaw) {
                const qArr = JSON.parse(qRaw);
                if (Array.isArray(qArr)) {
                    const cleanedQ = qArr.filter(item => !targetSnSetUpper.has(normalizeSnKey(item.sn)));
                    localStorage.setItem(storageKey, JSON.stringify(cleanedQ));
                }
            }
        });
    } catch (e) {}
}

hydrateDeletedSnTombstones();

// =========================================================================
// --- SHARED INVENTORY STATE ---
// =========================================================================
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) return _supabase;
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_CLIENT) return window.ENV.SUPABASE_CLIENT;
    if (typeof window !== 'undefined' && window._supabase) return window._supabase;
    return null;
}

let globalInventoryData = [];
let globalMasterProducts = [];
let occupiedLocationsSet = new Set();
let selectedItemSnSet = new Set();
let currentFilteredItems = [];
let currentInventoryGroups = [];
let inventoryViewMode = 'grouped';
let currentDetailModalGroupKey = null;
let currentModalQuickFilter = 'ALL';
let wmsIsDatabaseLoading = false;
let wmsFilterDebounceTimer = null;

const WMS_TABLE_RENDER_BATCH_SIZE = 250;
let wmsMainTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
let wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
let wmsLastModalFilteredItems = [];

// =========================================================================
// --- REALTIME INVENTORY SYNC ENGINE ---
// =========================================================================
let wmsRealtimeChannel = null;
let wmsRealtimeRefreshTimer = null;
let wmsRealtimeConnected = false;

function scheduleRealtimeUiRefresh(delayMs = 90) {
    if (wmsRealtimeRefreshTimer) clearTimeout(wmsRealtimeRefreshTimer);
    wmsRealtimeRefreshTimer = setTimeout(() => {
        wmsRealtimeRefreshTimer = null;

        try {
            localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(globalInventoryData));
        } catch (e) {}

        rebuildOccupiedSet();
        if (typeof filterInventoryData === 'function') filterInventoryData(true);
        updateKPIs();

        window.dispatchEvent(new CustomEvent('wms_inventory_updated', {
            detail: { count: globalInventoryData.length, realtime: true }
        }));

        if (typeof refreshLocationVisualizerIfActive === 'function') {
            refreshLocationVisualizerIfActive();
        }
        if (typeof loadRecentInboundFeedFromDB === 'function') {
            loadRecentInboundFeedFromDB();
        }
    }, delayMs);
}

function applyRealtimeInventoryMutation(actionType, payload) {
    if (!payload) return;
    const records = Array.isArray(payload) ? payload : [payload];
    if (records.length === 0) return;

    const upperAction = String(actionType || '').toUpperCase();

    if (upperAction === 'DELETE') {
        const snList = records.map(r => (typeof r === 'string' ? r : r.sn)).filter(Boolean);
        const snSetUpper = new Set(snList.map(normalizeSnKey));
        registerDeletedSnTombstones(snList);
        purgeDeletedItemsFromAllLocalStores(snSetUpper);
        scheduleRealtimeUiRefresh(20);
        return;
    }

    if (upperAction === 'RELOCATE' || upperAction === 'UPDATE') {
        const updateMap = new Map();
        records.forEach(r => {
            if (r && r.sn) {
                updateMap.set(normalizeSnKey(r.sn), r);
            }
        });

        for (let i = 0; i < globalInventoryData.length; i++) {
            const item = globalInventoryData[i];
            const key = normalizeSnKey(item.sn);
            if (updateMap.has(key)) {
                const patch = updateMap.get(key);
                globalInventoryData[i] = {
                    ...item,
                    ...patch,
                    location: patch.location !== undefined ? String(patch.location).toUpperCase() : item.location,
                    _pending: false
                };
            }
        }
        scheduleRealtimeUiRefresh(20);
        return;
    }

    if (upperAction === 'INSERT') {
        const existingSet = new Set(globalInventoryData.map(i => normalizeSnKey(i.sn)));
        for (let i = records.length - 1; i >= 0; i--) {
            const r = records[i];
            if (!r || !r.sn) continue;
            const snKey = normalizeSnKey(r.sn);
            if (isSnInTombstone(snKey)) continue;
            if (!existingSet.has(snKey)) {
                globalInventoryData.unshift({
                    ...r,
                    meter: r.meter !== undefined && r.meter !== null ? r.meter : 0,
                    received_by: r.received_by || r.created_by || r.received_by_name || getCurrentReceiverName(),
                    _pending: false
                });
                existingSet.add(snKey);
            }
        }
        scheduleRealtimeUiRefresh(20);
    }
}

function initWmsRealtimeSync() {
    const client = getSupabaseClient();
    if (!client || typeof client.channel !== 'function' || wmsRealtimeChannel) return;

    try {
        wmsRealtimeChannel = client
            .channel('wms-warehouse-items-live')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'warehouse_items' },
                (payload) => {
                    if (!payload) return;
                    const ev = payload.eventType;

                    if (ev === 'INSERT' && payload.new) {
                        const newRow = payload.new;
                        if (isSnInTombstone(newRow.sn)) return;
                        const idx = globalInventoryData.findIndex(i => normalizeSnKey(i.sn) === normalizeSnKey(newRow.sn));
                        if (idx === -1) {
                            globalInventoryData.unshift({
                                ...newRow,
                                meter: newRow.meter ?? 0,
                                received_by: newRow.received_by || newRow.created_by || newRow.received_by_name || 'ไม่ระบุ',
                                _pending: false
                            });
                        } else {
                            globalInventoryData[idx] = { ...globalInventoryData[idx], ...newRow, _pending: false };
                        }
                        scheduleRealtimeUiRefresh(90);
                    } else if (ev === 'UPDATE' && payload.new) {
                        const updatedRow = payload.new;
                        if (isSnInTombstone(updatedRow.sn)) return;
                        const idx = globalInventoryData.findIndex(i =>
                            (updatedRow.id && String(i.id) === String(updatedRow.id)) ||
                            normalizeSnKey(i.sn) === normalizeSnKey(updatedRow.sn)
                        );
                        if (idx !== -1) {
                            globalInventoryData[idx] = {
                                ...globalInventoryData[idx],
                                ...updatedRow,
                                _pending: false
                            };
                        } else {
                            globalInventoryData.unshift({
                                ...updatedRow,
                                meter: updatedRow.meter ?? 0,
                                received_by: updatedRow.received_by || updatedRow.created_by || updatedRow.received_by_name || 'ไม่ระบุ',
                                _pending: false
                            });
                        }
                        scheduleRealtimeUiRefresh(90);
                    } else if (ev === 'DELETE' && payload.old) {
                        const oldRow = payload.old;
                        if (oldRow.sn) {
                            const snUpper = normalizeSnKey(oldRow.sn);
                            registerDeletedSnTombstones([oldRow.sn]);
                            purgeDeletedItemsFromAllLocalStores(new Set([snUpper]));
                        } else if (oldRow.id !== undefined && oldRow.id !== null) {
                            const targetIdStr = String(oldRow.id);
                            const matched = globalInventoryData.filter(i => String(i.id) === targetIdStr);
                            const snUpperSet = new Set(matched.map(m => normalizeSnKey(m.sn)));
                            registerDeletedSnTombstones(matched.map(m => m.sn));
                            purgeDeletedItemsFromAllLocalStores(snUpperSet);
                            globalInventoryData = globalInventoryData.filter(i => String(i.id) !== targetIdStr);
                        }
                        scheduleRealtimeUiRefresh(90);
                    }
                }
            )
            .subscribe((status) => {
                wmsRealtimeConnected = (status === 'SUBSCRIBED');
                if (typeof ensureStockBulkActionToolbar === 'function') {
                    ensureStockBulkActionToolbar();
                }
            });
    } catch (e) {}
}

// =========================================================================
// --- DATABASE FETCH & SYNC FUNCTIONS ---
// =========================================================================
async function fetchAllWarehouseItems() {
    if (!navigator.onLine) {
        if (typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'กำลังโหลดข้อมูลสต็อกจากหน่วยความจำสำรอง...',
                'ตรวจพบการเชื่อมต่อออฟไลน์ กำลังดึงข้อมูลล่าสุดที่บันทึกไว้ในเครื่อง',
                55,
                'โหมดออฟไลน์ (Offline Cache)'
            );
        }
        const cached = localStorage.getItem('WMS_LOCAL_INVENTORY_CACHE');
        const parsed = cached ? JSON.parse(cached) : [];
        return parsed.filter(item => !isSnInTombstone(item.sn));
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
            if (typeof updateDbLoadingPopup === 'function') {
                updateDbLoadingPopup(
                    'กำลังดึงข้อมูลสต็อกสินค้าจากฐานข้อมูล...',
                    `กำลังดาวน์โหลดข้อมูลชุดที่ ${batchNumber} กรุณารอสักครู่...`,
                    estimatedProgress,
                    `ดึงข้อมูลแล้ว ${allData.length.toLocaleString()} รายการ`
                );
            }

            const { data, error } = await client
                .from('warehouse_items')
                .select('*')
                .order('created_at', { ascending: false })
                .range(from, from + step - 1);

            if (error) {
                retryCount++;
                if (retryCount > 3) throw error;
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        'กำลังเชื่อมต่อฐานข้อมูลอีกครั้ง...',
                        `การตอบสนองล่าช้า กำลังลองใหม่ครั้งที่ ${retryCount}/3`,
                        estimatedProgress,
                        `ดึงข้อมูลแล้ว ${allData.length.toLocaleString()} รายการ`
                    );
                }
                await new Promise(res => setTimeout(res, 500));
                continue;
            }

            if (data && data.length > 0) {
                const validRows = data.filter(row => !isSnInTombstone(row.sn));
                allData = allData.concat(validRows);
                from += step;
                batchNumber++;
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        'กำลังดึงข้อมูลสต็อกสินค้าจากฐานข้อมูล...',
                        'กำลังรวบรวมรายการซีเรียลและพิกัดจัดเก็บทั้งหมด...',
                        Math.min(70, 20 + (batchNumber * 12)),
                        `ดึงข้อมูลแล้ว ${allData.length.toLocaleString()} รายการ`
                    );
                }
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

async function loadMasterProductsFromDB() {
    const statElem = document.getElementById('inboundMasterProductsStatText');
    if (statElem && globalMasterProducts.length === 0) {
        statElem.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูลสินค้า Master ทั้งหมดจากฐานข้อมูล DB...`;
    }

    try {
        if (!navigator.onLine) {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try { globalMasterProducts = JSON.parse(cachedMaster); } catch (err) {}
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
                try { globalMasterProducts = JSON.parse(cachedMaster); } catch (err) {}
            }
        }

        updateMasterProductsStatUI();
    } catch (e) {
        const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
        if (cachedMaster) {
            try { globalMasterProducts = JSON.parse(cachedMaster); } catch (err) {}
        }
        updateMasterProductsStatUI();
    }
}

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

async function loadDataFromDatabase(options = {}) {
    if (wmsIsBulkDeleting) return;

    ensureWmsInvDbStyles();
    initWmsRealtimeSync();
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

    if (!isSilent && typeof showDbLoadingPopup === 'function') {
        showDbLoadingPopup(
            'กำลังโหลดข้อมูลเช็คสต็อกสินค้า...',
            'กำลังเชื่อมต่อฐานข้อมูลคลังสินค้าและดึงรายการล่าสุด',
            15
        );
    }

    try {
        const fetchedItems = await fetchAllWarehouseItems();
        if (wmsIsBulkDeleting) {
            wmsIsDatabaseLoading = false;
            return;
        }

        globalInventoryData = fetchedItems.filter(item => !isSnInTombstone(item.sn));
        globalInventoryData.forEach(item => {
            if (item.meter === undefined || item.meter === null || item.meter === '') {
                item.meter = 0;
            }
            if (!item.received_by) {
                item.received_by = item.created_by || item.received_by_name || 'ไม่ระบุ';
            }
        });

        mergePendingIntoInventory();

        if (!isSilent) {
            if (typeof updateDbLoadingPopup === 'function') {
                updateDbLoadingPopup(
                    'กำลังซิงค์ฐานข้อมูลสินค้าหลัก (Master SKU)...',
                    'ตรวจสอบรหัสสินค้า ชื่อรุ่น และรายละเอียดมาตรฐาน',
                    78,
                    `พบสต็อกในคลัง ${globalInventoryData.length.toLocaleString()} รายการ`
                );
            }
            await loadMasterProductsFromDB();

            if (typeof loadWarehouseConfigsFromDB === 'function') {
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        'กำลังโหลดโครงสร้างพิกัดและผังคลังสินค้า...',
                        'ตรวจสอบแถวจัดเก็บ ล็อก และชั้นวางทั้งหมด',
                        88,
                        `สต็อก ${globalInventoryData.length.toLocaleString()} รายการ · Master ${globalMasterProducts.length.toLocaleString()} รุ่น`
                    );
                }
                await loadWarehouseConfigsFromDB();
            }

            if (typeof updateDbLoadingPopup === 'function') {
                updateDbLoadingPopup(
                    'กำลังจัดเรียงตารางและคำนวณยอดคงเหลือ...',
                    'กำลังจัดกลุ่มสินค้าตามรุ่นเพื่อให้แสดงผลได้รวดเร็ว',
                    96,
                    `พร้อมแสดงผล ${globalInventoryData.length.toLocaleString()} รายการ`
                );
            }
        }

        rebuildOccupiedSet();
        wmsIsDatabaseLoading = false;
        if (typeof filterInventoryData === 'function') filterInventoryData(isSilent);
        updateKPIs();

        window.dispatchEvent(new CustomEvent('wms_inventory_updated', {
            detail: { count: globalInventoryData.length }
        }));

        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        if (typeof loadRecentInboundFeedFromDB === 'function') await loadRecentInboundFeedFromDB();

        if (!isSilent && typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'โหลดข้อมูลสต็อกสินค้าสำเร็จครบถ้วน!',
                `ซิงค์ข้อมูลเรียบร้อยทั้งหมด ${globalInventoryData.length.toLocaleString()} รายการ`,
                100,
                'เชื่อมต่อฐานข้อมูลสมบูรณ์ 100%',
                'success'
            );
            setTimeout(() => {
                if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
            }, 360);
        }
    } catch (err) {
        wmsIsDatabaseLoading = false;
        if (typeof updateDBConnectionStatus === 'function') {
            updateDBConnectionStatus(false, '(Sync Failed)');
        }
        if (!isSilent && typeof updateDbLoadingPopup === 'function') {
            updateDbLoadingPopup(
                'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้',
                'ระบบกำลังแสดงข้อมูลสำรองในเครื่อง (หากมี) กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
                100,
                'การเชื่อมต่อขัดข้อง',
                'error'
            );
            setTimeout(() => {
                if (typeof hideDbLoadingPopup === 'function') hideDbLoadingPopup(false);
            }, 1400);
        }
    }
}

function mergePendingIntoInventory() {
    const have = new Set(globalInventoryData.map(i => normalizeSnKey(i.sn)));
    const activeReceiver = getCurrentReceiverName();

    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        offlineInboundQueue.forEach(p => {
            const snKey = normalizeSnKey(p.sn);
            if (snKey && !have.has(snKey) && !isSnInTombstone(snKey)) {
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
        if (i.location && i.location.toUpperCase() !== 'DOCK' && i.location.toUpperCase() !== 'OFFICE' && i.location.toUpperCase() !== 'PENDING') {
            occupiedLocationsSet.add(i.location.toUpperCase());
        }
    });
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

// ฟัง Event จากหน้าต่างอื่นเพื่อซิงค์ข้อมูลเรียลไทม์ทันที
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e && e.key === 'WMS_LOCAL_INVENTORY_CACHE' && e.newValue && !wmsIsBulkDeleting) {
            try {
                const parsed = JSON.parse(e.newValue);
                if (Array.isArray(parsed)) {
                    globalInventoryData = parsed.filter(item => !isSnInTombstone(item.sn));
                    rebuildOccupiedSet();
                    if (typeof filterInventoryData === 'function') filterInventoryData(true);
                    updateKPIs();
                }
            } catch (err) {}
        }
    });
}

// Global Exports
window.selectedItemSnSet = selectedItemSnSet;
window.copyTextToClipboard = copyTextToClipboard;
window.isCurrentUserAdmin = isCurrentUserAdmin;
window.registerDeletedSnTombstones = registerDeletedSnTombstones;
window.isSnInTombstone = isSnInTombstone;
window.applyRealtimeInventoryMutation = applyRealtimeInventoryMutation;
window.initWmsRealtimeSync = initWmsRealtimeSync;
window.loadDataFromDatabase = loadDataFromDatabase;
window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.coreSyncLoaded = true;