// =========================================================================
// --- MODULE 2A: INVENTORY CORE, DATABASE SYNC, TOMBSTONE SHIELD & REALTIME ---
// --- FILE: inv-core-sync.js (v29.0 REALTIME INBOUND-STOCK & INV/PO INDEX)  ---
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
// --- INV / PO NORMALIZER & FAST SEARCH INDEXER (100% SYNC WITH INBOUND) ---
// =========================================================================
function resolveItemInvNo(item) {
    if (!item || typeof item !== 'object') return '';
    const direct = item.inv_no ??
        item.invoice_no ??
        item.tax_invoice_no ??
        item.tax_inv_no ??
        item.inv_number ??
        item.invoice_number ??
        item.invNo ??
        item.inv ??
        item.invoice ??
        '';
    const cleanDirect = String(direct ?? '').trim();
    if (cleanDirect && cleanDirect !== '-' && cleanDirect.toLowerCase() !== 'null' && cleanDirect.toLowerCase() !== 'undefined') {
        return cleanDirect;
    }

    const noteSource = String(item.notes ?? item.remark ?? item.remarks ?? item.details ?? '');
    if (noteSource) {
        const invMatch = noteSource.match(/(?:INV|INVOICE|ใบกำกับภาษี)\s*[:#=-]?\s*([A-Za-z0-9\-_/]+)/i);
        if (invMatch && invMatch[1]) return invMatch[1].trim();
    }
    return '';
}

function resolveItemPoNo(item) {
    if (!item || typeof item !== 'object') return '';
    const direct = item.po_no ??
        item.po_number ??
        item.purchase_order ??
        item.purchase_order_no ??
        item.poNo ??
        item.po ??
        item.ref_po ??
        '';
    const cleanDirect = String(direct ?? '').trim();
    if (cleanDirect && cleanDirect !== '-' && cleanDirect.toLowerCase() !== 'null' && cleanDirect.toLowerCase() !== 'undefined') {
        return cleanDirect;
    }

    const noteSource = String(item.notes ?? item.remark ?? item.remarks ?? item.details ?? '');
    if (noteSource) {
        const poMatch = noteSource.match(/(?:PO|PURCHASE\s*ORDER|ใบสั่งซื้อ)\s*[:#=-]?\s*([A-Za-z0-9\-_/]+)/i);
        if (poMatch && poMatch[1]) return poMatch[1].trim();
    }
    return '';
}

function buildItemFastSearchIndex(item) {
    const sku = item.category || '';
    const name = item.name || '';
    const sn = item.sn || '';
    const loc = item.location || '';
    const receiver = item.received_by || '';
    const inv = item.inv_no || '';
    const po = item.po_no || '';
    const meter = item.meter !== undefined && item.meter !== null ? String(item.meter) : '0';
    return `${sku}|${name}|${sn}|${loc}|${receiver}|${inv}|${po}|${meter}`.toLowerCase();
}

function normalizeInventoryItemFields(item) {
    if (!item || typeof item !== 'object') return item;
    if (item.meter === undefined || item.meter === null || item.meter === '') {
        item.meter = 0;
    }
    if (!item.received_by) {
        item.received_by = item.created_by || item.received_by_name || 'ไม่ระบุ';
    }
    const invVal = resolveItemInvNo(item);
    const poVal = resolveItemPoNo(item);
    if (invVal !== '') {
        item.inv_no = invVal;
        if (item.invoice_no === undefined) item.invoice_no = invVal;
    } else if (item.inv_no === undefined) {
        item.inv_no = '';
    }
    if (poVal !== '') {
        item.po_no = poVal;
        if (item.po_number === undefined) item.po_number = poVal;
    } else if (item.po_no === undefined) {
        item.po_no = '';
    }
    item._searchIndex = buildItemFastSearchIndex(item);
    return item;
}

// สรุปรายการเลข INV และ PO ที่ไม่ซ้ำกันสำหรับกลุ่มสินค้าหรือรายการที่กรอง (O(N) ความเร็วสูง)
function extractGroupInvPoSummary(items) {
    const invSet = new Set();
    const poSet = new Set();
    if (Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!it) continue;
            const inv = it.inv_no || resolveItemInvNo(it);
            const po = it.po_no || resolveItemPoNo(it);
            if (inv) invSet.add(inv);
            if (po) poSet.add(po);
        }
    }
    const invList = Array.from(invSet);
    const poList = Array.from(poSet);
    return {
        invList,
        poList,
        invCount: invList.length,
        poCount: poList.length,
        hasAnyDoc: invList.length > 0 || poList.length > 0
    };
}

// สถิติรวมเอกสาร INV และ PO ทั้งคลังหรือรายการที่กรอง
function getInventoryDocumentStats(itemsList = null) {
    const source = Array.isArray(itemsList) ? itemsList : globalInventoryData;
    const summary = extractGroupInvPoSummary(source);
    let itemsWithDoc = 0;
    for (let i = 0; i < source.length; i++) {
        const it = source[i];
        if (it && (it.inv_no || it.po_no)) itemsWithDoc++;
    }
    return {
        ...summary,
        itemsWithDoc
    };
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
        if (typeof persistentDbSyncQueue !== 'undefined' && Array.isArray(persistentDbSyncQueue)) {
            for (let i = persistentDbSyncQueue.length - 1; i >= 0; i--) {
                const pSn = persistentDbSyncQueue[i] && persistentDbSyncQueue[i].payload && persistentDbSyncQueue[i].payload.sn;
                if (targetSnSetUpper.has(normalizeSnKey(pSn))) {
                    persistentDbSyncQueue.splice(i, 1);
                }
            }
        }
        ['WMS_OFFLINE_INBOUND_QUEUE', 'WMS_PERSISTENT_DB_SYNC_QUEUE_V1', 'offlineInboundQueue', 'wms_offline_queue'].forEach(storageKey => {
            const qRaw = localStorage.getItem(storageKey);
            if (qRaw) {
                const qArr = JSON.parse(qRaw);
                if (Array.isArray(qArr)) {
                    const cleanedQ = qArr.filter(item => {
                        const snVal = item && (item.sn || (item.payload && item.payload.sn));
                        return !targetSnSetUpper.has(normalizeSnKey(snVal));
                    });
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

const WMS_TABLE_RENDER_BATCH_SIZE = 200;
let wmsMainTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
let wmsModalTableRenderLimit = WMS_TABLE_RENDER_BATCH_SIZE;
let wmsLastModalFilteredItems = [];

// =========================================================================
// --- REALTIME INVENTORY SYNC ENGINE (INBOUND <-> STOCK CHECK) ---
// =========================================================================
const WMS_INVENTORY_SYNC_CHANNEL_NAME = 'WMS_INVENTORY_REALTIME_SYNC_V1';
const WMS_PENDING_STOCK_DELETE_KEY = 'WMS_PENDING_STOCK_DELETE_REQUEST_V1';
const WMS_INBOUND_REALTIME_PING_KEY = 'WMS_INBOUND_REALTIME_PING_V1';
let wmsRealtimeChannel = null;
let wmsRealtimeRefreshTimer = null;
let wmsRealtimeConnected = false;
let wmsInventoryBroadcastChannel = null;
let wmsLastRealtimeSyncMeta = {
    ts: 0,
    label: '',
    count: 0
};

function broadcastWmsInventorySync(actionType, payload) {
    try {
        if (!wmsInventoryBroadcastChannel && typeof BroadcastChannel !== 'undefined') {
            wmsInventoryBroadcastChannel = new BroadcastChannel(WMS_INVENTORY_SYNC_CHANNEL_NAME);
        }
        if (wmsInventoryBroadcastChannel) {
            wmsInventoryBroadcastChannel.postMessage({
                type: 'WMS_INVENTORY_MUTATION',
                actionType: actionType,
                payload: payload,
                ts: Date.now()
            });
        }
    } catch (e) {}

    try {
        localStorage.setItem(WMS_INBOUND_REALTIME_PING_KEY, JSON.stringify({
            actionType: actionType,
            count: Array.isArray(payload) ? payload.length : 1,
            ts: Date.now(),
            nonce: Math.random().toString(36).slice(2, 7)
        }));
    } catch (e) {}
}

function updateRealtimeLiveBannerBadge(messageText = '') {
    const liveBadge = document.getElementById('wmsStockLiveSyncBadge');
    const liveText = document.getElementById('wmsStockLiveSyncText');
    if (liveText && messageText) {
        liveText.textContent = messageText;
    }
    if (liveBadge && messageText) {
        liveBadge.classList.add('is-pulse-flash');
        setTimeout(() => {
            liveBadge.classList.remove('is-pulse-flash');
        }, 1200);
    }
}

function scheduleRealtimeUiRefresh(delayMs = 70, syncLabel = '') {
    if (syncLabel) {
        const nowStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        wmsLastRealtimeSyncMeta = {
            ts: Date.now(),
            label: `${syncLabel} (${nowStr})`,
            count: globalInventoryData.length
        };
    }

    if (wmsRealtimeRefreshTimer) clearTimeout(wmsRealtimeRefreshTimer);
    wmsRealtimeRefreshTimer = setTimeout(() => {
        wmsRealtimeRefreshTimer = null;

        try {
            localStorage.setItem('WMS_LOCAL_INVENTORY_CACHE', JSON.stringify(globalInventoryData));
        } catch (e) {}

        rebuildOccupiedSet();
        if (typeof filterInventoryData === 'function') filterInventoryData(true);
        updateKPIs();

        if (wmsLastRealtimeSyncMeta.label) {
            updateRealtimeLiveBannerBadge(wmsLastRealtimeSyncMeta.label);
        }

        window.dispatchEvent(new CustomEvent('wms_inventory_updated', {
            detail: { count: globalInventoryData.length, realtime: true }
        }));
        document.dispatchEvent(new CustomEvent('inventoryDataChanged', {
            detail: { count: globalInventoryData.length, realtime: true }
        }));
        document.dispatchEvent(new CustomEvent('inventoryUpdated', {
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

function applyRealtimeInventoryMutation(actionType, payload, options = {}) {
    if (!payload) return;
    const records = Array.isArray(payload) ? payload : [payload];
    if (records.length === 0) return;

    const upperAction = String(actionType || '').toUpperCase();

    if (upperAction === 'DELETE') {
        const snList = records.map(r => (typeof r === 'string' ? r : r.sn)).filter(Boolean);
        const snSetUpper = new Set(snList.map(normalizeSnKey));
        registerDeletedSnTombstones(snList);
        purgeDeletedItemsFromAllLocalStores(snSetUpper);
        if (!options.fromBroadcast) {
            broadcastWmsInventorySync('DELETE', snList);
        }
        scheduleRealtimeUiRefresh(20, `ลบสต็อกเรียลไทม์ -${snList.length.toLocaleString()} รายการ`);
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
                globalInventoryData[i] = normalizeInventoryItemFields({
                    ...item,
                    ...patch,
                    location: patch.location !== undefined ? String(patch.location).toUpperCase() : item.location,
                    _pending: patch._pending !== undefined ? Boolean(patch._pending) : false
                });
            }
        }
        if (!options.fromBroadcast) {
            broadcastWmsInventorySync('UPDATE', records);
        }
        scheduleRealtimeUiRefresh(20, `อัปเดตพิกัด/ข้อมูลเรียลไทม์ ${records.length.toLocaleString()} รายการ`);
        return;
    }

    if (upperAction === 'INSERT' || upperAction === 'UPSERT') {
        const indexBySn = new Map();
        globalInventoryData.forEach((it, idx) => {
            indexBySn.set(normalizeSnKey(it.sn), idx);
        });

        let newlyAddedCount = 0;
        for (let i = records.length - 1; i >= 0; i--) {
            const r = records[i];
            if (!r || !r.sn) continue;
            const snKey = normalizeSnKey(r.sn);
            if (isSnInTombstone(snKey)) continue;

            const normalizedRow = normalizeInventoryItemFields({
                ...r,
                meter: r.meter !== undefined && r.meter !== null ? r.meter : 0,
                received_by: r.received_by || r.created_by || r.received_by_name || getCurrentReceiverName(),
                _pending: Boolean(r._pending)
            });

            if (indexBySn.has(snKey)) {
                const existingIdx = indexBySn.get(snKey);
                globalInventoryData[existingIdx] = normalizeInventoryItemFields({
                    ...globalInventoryData[existingIdx],
                    ...normalizedRow
                });
            } else {
                globalInventoryData.unshift(normalizedRow);
                indexBySn.set(snKey, 0);
                newlyAddedCount++;
            }
        }
        if (!options.fromBroadcast) {
            broadcastWmsInventorySync('INSERT', records);
        }
        const label = newlyAddedCount > 0
            ? `ซิงก์รับเข้าใหม่เรียลไทม์ +${newlyAddedCount.toLocaleString()} รายการ`
            : `อัปเดตข้อมูลสต็อกเรียลไทม์ ${records.length.toLocaleString()} รายการ`;
        scheduleRealtimeUiRefresh(20, label);
    }
}

// =========================================================================
// --- CROSS-VIEW LINK: INBOUND RECENT HISTORY -> STOCK CHECK DELETE POPUP ---
// =========================================================================
function switchToStockCheckMenuView() {
    const viewSelectors = [
        '[data-menu="inventory"]',
        '[data-page="inventory"]',
        '[data-tab="inventory"]',
        '[data-target="inventory"]',
        '[data-view="inventory"]',
        '[href="#inventory"]',
        '[href*="inventory"]',
        '#menuInventory',
        '#navInventory',
        '#tabInventory',
        '#btnMenuInventory'
    ];

    for (let i = 0; i < viewSelectors.length; i++) {
        const el = document.querySelector(viewSelectors[i]);
        if (el && typeof el.click === 'function') {
            el.click();
            return true;
        }
    }

    const navFns = ['switchView', 'showView', 'navigateTo', 'openMenu', 'switchTab'];
    for (let i = 0; i < navFns.length; i++) {
        if (typeof window[navFns[i]] === 'function') {
            try {
                window[navFns[i]]('inventory');
                return true;
            } catch (e) {}
        }
    }

    const candidates = document.querySelectorAll('nav a, nav button, aside a, aside button, .sidebar a, .sidebar button, .nav-item, .menu-item, [role="tab"]');
    for (let i = 0; i < candidates.length; i++) {
        const txt = (candidates[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (txt.includes('เช็กสต็อก') || txt.includes('เช็คสต็อก')) {
            candidates[i].click();
            return true;
        }
    }
    return false;
}

async function openStockCheckDeleteConfirmFromInbound(requestPayload) {
    if (!requestPayload) return;

    const rawItems = Array.isArray(requestPayload.items)
        ? requestPayload.items
        : (requestPayload.sn ? [requestPayload] : []);

    if (rawItems.length === 0) return;

    // 1. สลับหน้าจอไปยังหน้าเช็กสต็อกสินค้าทันที
    switchToStockCheckMenuView();

    // 2. เติมข้อมูลรายการให้ครบถ้วนจาก globalInventoryData หรือโหลดจาก DB หากยังไม่มี
    if (globalInventoryData.length === 0 && typeof loadDataFromDatabase === 'function') {
        await loadDataFromDatabase({ silent: true });
    }

    const invBySn = new Map();
    globalInventoryData.forEach(it => {
        invBySn.set(normalizeSnKey(it.sn), it);
    });

    const resolvedItems = rawItems.map(entry => {
        const snStr = typeof entry === 'string' ? entry : (entry.sn || '');
        const snUpper = normalizeSnKey(snStr);
        if (invBySn.has(snUpper)) {
            return invBySn.get(snUpper);
        }
        return normalizeInventoryItemFields({
            id: entry.id || null,
            sn: snStr,
            category: entry.category || entry.sku || '-',
            name: entry.name || '-',
            location: entry.location || 'DOCK',
            inv_no: resolveItemInvNo(entry),
            po_no: resolveItemPoNo(entry)
        });
    }).filter(it => it && it.sn);

    if (resolvedItems.length === 0) return;

    // 3. กรองและไฮไลต์ S/N เป้าหมายในหน้าเช็กสต็อกสินค้าเพื่อให้เห็นบริบทชัดเจน
    const mainSearch = document.getElementById('inventorySearchInput') || document.getElementById('stockSearchInput');
    if (mainSearch && resolvedItems.length === 1) {
        mainSearch.value = resolvedItems[0].sn;
        if (typeof filterInventoryData === 'function') filterInventoryData(true);
    }

    // 4. เปิดป๊อปอัปยืนยันการลบในหน้าเช็กสต็อกสินค้าทันที
    const titleText = requestPayload.title || (
        resolvedItems.length === 1
            ? `ลบซีเรียลสินค้าจากประวัติรับเข้า: ${resolvedItems[0].sn}`
            : `ลบรายการสินค้าจากประวัติรับเข้า (${resolvedItems.length.toLocaleString()} S/N)`
    );

    const openPopupWithRetry = (attempt = 0) => {
        if (typeof openUnifiedBulkDeleteModal === 'function') {
            openUnifiedBulkDeleteModal({
                mode: resolvedItems.length === 1 ? 'SINGLE' : 'BATCH',
                sn: resolvedItems[0].sn,
                id: resolvedItems[0].id,
                title: titleText,
                items: resolvedItems
            });
        } else if (typeof triggerDeleteItemAction === 'function') {
            if (resolvedItems.length === 1) {
                triggerDeleteItemAction('SINGLE', resolvedItems[0].sn, resolvedItems[0].id);
            } else {
                selectedItemSnSet.clear();
                resolvedItems.forEach(it => selectedItemSnSet.add(it.sn));
                triggerDeleteItemAction('BATCH');
            }
        } else if (attempt < 15) {
            setTimeout(() => openPopupWithRetry(attempt + 1), 120);
        }
    };

    setTimeout(() => openPopupWithRetry(0), 120);
}

function consumePendingInboundDeleteRedirect() {
    try {
        const raw = localStorage.getItem(WMS_PENDING_STOCK_DELETE_KEY);
        if (!raw) return;
        localStorage.removeItem(WMS_PENDING_STOCK_DELETE_KEY);
        const parsed = JSON.parse(raw);
        if (parsed && (Date.now() - (parsed.ts || 0)) < 5 * 60 * 1000) {
            openStockCheckDeleteConfirmFromInbound(parsed);
        }
    } catch (e) {}
}

function initWmsRealtimeSync() {
    if (!wmsInventoryBroadcastChannel && typeof BroadcastChannel !== 'undefined') {
        try {
            wmsInventoryBroadcastChannel = new BroadcastChannel(WMS_INVENTORY_SYNC_CHANNEL_NAME);
            wmsInventoryBroadcastChannel.onmessage = (event) => {
                const msg = event && event.data;
                if (!msg || typeof msg !== 'object') return;
                if (msg.type === 'WMS_INVENTORY_MUTATION') {
                    applyRealtimeInventoryMutation(msg.actionType, msg.payload, { fromBroadcast: true });
                } else if (msg.type === 'WMS_OPEN_STOCK_DELETE_CONFIRM') {
                    openStockCheckDeleteConfirmFromInbound(msg.payload);
                }
            };
        } catch (e) {}
    }

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
                        const normalized = normalizeInventoryItemFields({
                            ...newRow,
                            meter: newRow.meter ?? 0,
                            received_by: newRow.received_by || newRow.created_by || newRow.received_by_name || 'ไม่ระบุ',
                            _pending: false
                        });
                        if (idx === -1) {
                            globalInventoryData.unshift(normalized);
                            scheduleRealtimeUiRefresh(70, `รับสินค้าเข้าคลังเรียลไทม์ +1 (${newRow.sn})`);
                        } else {
                            globalInventoryData[idx] = normalizeInventoryItemFields({
                                ...globalInventoryData[idx],
                                ...normalized
                            });
                            scheduleRealtimeUiRefresh(70, `ซิงก์สถานะDBเรียลไทม์ (${newRow.sn})`);
                        }
                    } else if (ev === 'UPDATE' && payload.new) {
                        const updatedRow = payload.new;
                        if (isSnInTombstone(updatedRow.sn)) return;
                        const idx = globalInventoryData.findIndex(i =>
                            (updatedRow.id && String(i.id) === String(updatedRow.id)) ||
                            normalizeSnKey(i.sn) === normalizeSnKey(updatedRow.sn)
                        );
                        if (idx !== -1) {
                            globalInventoryData[idx] = normalizeInventoryItemFields({
                                ...globalInventoryData[idx],
                                ...updatedRow,
                                _pending: false
                            });
                        } else {
                            globalInventoryData.unshift(normalizeInventoryItemFields({
                                ...updatedRow,
                                meter: updatedRow.meter ?? 0,
                                received_by: updatedRow.received_by || updatedRow.created_by || updatedRow.received_by_name || 'ไม่ระบุ',
                                _pending: false
                            }));
                        }
                        scheduleRealtimeUiRefresh(70, `อัปเดตข้อมูลเรียลไทม์ (${updatedRow.sn})`);
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
                        scheduleRealtimeUiRefresh(70, 'ลบรายการออกจากสต็อกเรียลไทม์');
                    }
                }
            )
            .subscribe((status) => {
                wmsRealtimeConnected = (status === 'SUBSCRIBED');
                if (wmsRealtimeConnected) {
                    updateRealtimeLiveBannerBadge('เชื่อมต่อเรียลไทม์กับงานรับสินค้าเข้าคลังแล้ว');
                }
                if (typeof ensureStockBulkActionToolbar === 'function') {
                    ensureStockBulkActionToolbar();
                }
            });
    } catch (e) {}
}

// =========================================================================
// --- DATABASE FETCH & SYNC FUNCTIONS (100% PAGINATION - NO 1,000 CAP) ---
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
        return parsed
            .filter(item => !isSnInTombstone(item.sn))
            .map(normalizeInventoryItemFields);
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
                const validRows = data
                    .filter(row => !isSnInTombstone(row.sn))
                    .map(normalizeInventoryItemFields);
                allData = allData.concat(validRows);
                from += data.length;
                batchNumber++;
                retryCount = 0;
                if (typeof updateDbLoadingPopup === 'function') {
                    updateDbLoadingPopup(
                        'กำลังดึงข้อมูลสต็อกสินค้าจากฐานข้อมูล...',
                        'กำลังรวบรวมรายการซีเรียล เลข INV/PO และพิกัดจัดเก็บทั้งหมด...',
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
                try {
                    globalMasterProducts = JSON.parse(cachedMaster);
                    window.globalMasterProducts = globalMasterProducts;
                } catch (err) {}
            }
            updateMasterProductsStatUI();
            return globalMasterProducts;
        }

        const client = getSupabaseClient();
        if (!client) {
            updateMasterProductsStatUI();
            return globalMasterProducts;
        }

        let allProducts = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;
        let pageIdx = 1;
        let retryAttempt = 0;

        while (hasMore) {
            if (statElem) {
                statElem.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังดึงข้อมูลสินค้า Master ชุดที่ ${pageIdx} (ดึงแล้ว ${allProducts.length.toLocaleString()} รายการ)...`;
            }

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

            if (response.error) {
                response = await client
                    .from('products')
                    .select('*')
                    .range(from, from + step - 1);
            }

            if (response.error) {
                retryAttempt++;
                if (retryAttempt <= 2) {
                    await new Promise(res => setTimeout(res, 350 * retryAttempt));
                    continue;
                }
                break;
            }

            const data = response.data;
            if (Array.isArray(data) && data.length > 0) {
                allProducts = allProducts.concat(data);
                from += data.length;
                pageIdx++;
                retryAttempt = 0;
            } else {
                hasMore = false;
            }
        }

        if (allProducts.length > 0) {
            globalMasterProducts = allProducts;
            window.globalMasterProducts = globalMasterProducts;
            try {
                localStorage.setItem('WMS_MASTER_PRODUCTS_CACHE', JSON.stringify(allProducts));
            } catch (quotaErr) {}
        } else {
            const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
            if (cachedMaster) {
                try {
                    globalMasterProducts = JSON.parse(cachedMaster);
                    window.globalMasterProducts = globalMasterProducts;
                } catch (err) {}
            }
        }

        updateMasterProductsStatUI();

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wms_master_products_updated', {
                detail: { count: globalMasterProducts.length, products: globalMasterProducts }
            }));
        }

        return globalMasterProducts;
    } catch (e) {
        const cachedMaster = localStorage.getItem('WMS_MASTER_PRODUCTS_CACHE');
        if (cachedMaster) {
            try {
                globalMasterProducts = JSON.parse(cachedMaster);
                window.globalMasterProducts = globalMasterProducts;
            } catch (err) {}
        }
        updateMasterProductsStatUI();
        return globalMasterProducts;
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
        const colSpan = inventoryViewMode === 'grouped' ? 9 : 17;
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

        globalInventoryData = fetchedItems
            .filter(item => !isSnInTombstone(item.sn))
            .map(normalizeInventoryItemFields);

        mergePendingIntoInventory();

        if (!isSilent) {
            if (typeof updateDbLoadingPopup === 'function') {
                updateDbLoadingPopup(
                    'กำลังซิงค์ฐานข้อมูลสินค้าหลัก (Master SKU)...',
                    'ตรวจสอบรหัสสินค้า ชื่อรุ่น และรายละเอียดมาตรฐานครบทุกรายการ',
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

        consumePendingInboundDeleteRedirect();

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
    const indexBySn = new Map();
    globalInventoryData.forEach((it, idx) => {
        indexBySn.set(normalizeSnKey(it.sn), idx);
    });
    const activeReceiver = getCurrentReceiverName();

    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        offlineInboundQueue.forEach(p => {
            const snKey = normalizeSnKey(p.sn);
            if (snKey && !isSnInTombstone(snKey)) {
                if (!indexBySn.has(snKey)) {
                    globalInventoryData.unshift(normalizeInventoryItemFields({
                        ...p,
                        received_by: p.received_by || activeReceiver,
                        _pending: true
                    }));
                    indexBySn.set(snKey, 0);
                } else {
                    const idx = indexBySn.get(snKey);
                    globalInventoryData[idx] = normalizeInventoryItemFields({
                        ...globalInventoryData[idx],
                        ...p
                    });
                }
            }
        });
    }

    // ผสานคิวจากระบบ 0ms Fast-Scan (persistentDbSyncQueue) เพื่อให้รายการที่เพิ่งสแกนแสดงครบไม่ตกหล่น (รวมถึงเลข INV และ PO)
    if (typeof persistentDbSyncQueue !== 'undefined' && Array.isArray(persistentDbSyncQueue)) {
        for (let i = persistentDbSyncQueue.length - 1; i >= 0; i--) {
            const p = persistentDbSyncQueue[i] && persistentDbSyncQueue[i].payload;
            if (!p || !p.sn) continue;
            const snKey = normalizeSnKey(p.sn);
            if (snKey && !isSnInTombstone(snKey)) {
                if (!indexBySn.has(snKey)) {
                    globalInventoryData.unshift(normalizeInventoryItemFields({
                        ...p,
                        received_by: p.received_by || activeReceiver,
                        _pending: true
                    }));
                    indexBySn.set(snKey, 0);
                } else {
                    const idx = indexBySn.get(snKey);
                    globalInventoryData[idx] = normalizeInventoryItemFields({
                        ...globalInventoryData[idx],
                        ...p
                    });
                }
            }
        }
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

    const docStats = getInventoryDocumentStats(globalInventoryData);
    const kpiDocs = document.getElementById('kpiTotalDocuments');
    if (kpiDocs) {
        kpiDocs.textContent = `${docStats.invCount.toLocaleString()} INV / ${docStats.poCount.toLocaleString()} PO`;
    }
}

// ฟัง Event จากหน้าต่างอื่นและหน้ารับสินค้าเข้าคลังเพื่อซิงค์ข้อมูลเรียลไทม์ทันที
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (!e) return;
        if (e.key === 'WMS_LOCAL_INVENTORY_CACHE' && e.newValue && !wmsIsBulkDeleting) {
            try {
                const parsed = JSON.parse(e.newValue);
                if (Array.isArray(parsed)) {
                    globalInventoryData = parsed
                        .filter(item => !isSnInTombstone(item.sn))
                        .map(normalizeInventoryItemFields);
                    mergePendingIntoInventory();
                    rebuildOccupiedSet();
                    if (typeof filterInventoryData === 'function') filterInventoryData(true);
                    updateKPIs();
                    updateRealtimeLiveBannerBadge('ซิงก์ข้อมูลสต็อกข้ามแท็บเรียลไทม์แล้ว');
                }
            } catch (err) {}
        } else if (e.key === WMS_INBOUND_REALTIME_PING_KEY && e.newValue && !wmsIsBulkDeleting) {
            try {
                const ping = JSON.parse(e.newValue);
                if (ping && ping.actionType === 'INSERT') {
                    loadDataFromDatabase({ silent: true });
                }
            } catch (err) {}
        } else if (e.key === WMS_PENDING_STOCK_DELETE_KEY && e.newValue) {
            consumePendingInboundDeleteRedirect();
        }
    });

    // รับสัญญาณซิงก์เรียลไทม์จากหน้ารับสินค้าเข้าคลัง (Inbound) ทุกรูปแบบ
    ['wms_inbound_saved', 'wms_inbound_batch_saved', 'wms_inbound_record_added', 'inboundSaved', 'wms_stock_sync'].forEach(evtName => {
        window.addEventListener(evtName, (e) => {
            const detail = e && e.detail ? e.detail : null;
            const records = detail && (detail.items || detail.records || detail.data || (detail.sn ? [detail] : null));
            if (records) {
                applyRealtimeInventoryMutation('UPSERT', records, { fromBroadcast: false });
            } else {
                scheduleRealtimeUiRefresh(40, 'ซิงก์ข้อมูลจากงานรับสินค้าเข้าคลัง');
            }
        });
    });

    // รับคำสั่งกดลบจากประวัติรับเข้าล่าสุดในหน้ารับสินค้าเข้าคลัง -> เปิดหน้าเช็กสต็อกพร้อมป๊อปอัปยืนยันลบ
    window.addEventListener('wms_request_stock_delete', (e) => {
        if (e && e.detail) {
            openStockCheckDeleteConfirmFromInbound(e.detail);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(consumePendingInboundDeleteRedirect, 250);
        });
    } else {
        setTimeout(consumePendingInboundDeleteRedirect, 250);
    }
}

// Global Exports
window.selectedItemSnSet = selectedItemSnSet;
window.copyTextToClipboard = copyTextToClipboard;
window.isCurrentUserAdmin = isCurrentUserAdmin;
window.resolveItemInvNo = resolveItemInvNo;
window.resolveItemPoNo = resolveItemPoNo;
window.normalizeInventoryItemFields = normalizeInventoryItemFields;
window.extractGroupInvPoSummary = extractGroupInvPoSummary;
window.getInventoryDocumentStats = getInventoryDocumentStats;
window.registerDeletedSnTombstones = registerDeletedSnTombstones;
window.isSnInTombstone = isSnInTombstone;
window.broadcastWmsInventorySync = broadcastWmsInventorySync;
window.applyRealtimeInventoryMutation = applyRealtimeInventoryMutation;
window.openStockCheckDeleteConfirmFromInbound = openStockCheckDeleteConfirmFromInbound;
window.initWmsRealtimeSync = initWmsRealtimeSync;
window.loadMasterProductsFromDB = loadMasterProductsFromDB;
window.loadDataFromDatabase = loadDataFromDatabase;
window.WMSStockModules = window.WMSStockModules || {};
window.WMSStockModules.coreSyncLoaded = true;