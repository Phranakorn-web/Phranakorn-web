// =========================================================================
// --- MODULE 3.5: INBOUND REAL-TIME SYNC, FIFO QUEUE & SUPABASE ENGINE ---
// --- 0ms Scan Capture, Duplicate Guard, Tax Inv & PO, Batch DB Writer ---
// --- 100% Real-time DB Confirmation & Exact Aisle Coordinate Lock ---
// =========================================================================

const BATCH_SYNC_CHUNK_SIZE = 50;
const DB_REQUEST_TIMEOUT_MS = 12000;
const DB_FLUSH_WATCHDOG_MS = 15000;
const MAX_ITEM_RETRY_ATTEMPTS = 8;

// Safe global state initialization (ป้องกัน ReferenceError ไม่ว่าไฟล์ JS ใดจะโหลดก่อน/หลัง)
var PERSISTENT_DB_QUEUE_KEY = (typeof PERSISTENT_DB_QUEUE_KEY !== 'undefined')
    ? PERSISTENT_DB_QUEUE_KEY
    : 'WMS_INBOUND_PERSISTENT_DB_QUEUE_V2';

var persistentDbSyncQueue = (typeof persistentDbSyncQueue !== 'undefined' && Array.isArray(persistentDbSyncQueue))
    ? persistentDbSyncQueue
    : (typeof window !== 'undefined' && Array.isArray(window.persistentDbSyncQueue) ? window.persistentDbSyncQueue : []);

var pendingFastSnSet = (typeof pendingFastSnSet !== 'undefined' && pendingFastSnSet instanceof Set)
    ? pendingFastSnSet
    : (typeof window !== 'undefined' && window.pendingFastSnSet instanceof Set ? window.pendingFastSnSet : new Set());

var pendingFastLocationSet = (typeof pendingFastLocationSet !== 'undefined' && pendingFastLocationSet instanceof Set)
    ? pendingFastLocationSet
    : (typeof window !== 'undefined' && window.pendingFastLocationSet instanceof Set ? window.pendingFastLocationSet : new Set());

var isFlushingDbQueue = Boolean(typeof isFlushingDbQueue !== 'undefined' ? isFlushingDbQueue : false);
var dbFlushStartedAt = 0;
var dbSyncSequenceCounter = Number(typeof dbSyncSequenceCounter !== 'undefined' ? dbSyncSequenceCounter : 0) || 0;
var sessionScannedSuccessCount = Number(typeof sessionScannedSuccessCount !== 'undefined' ? sessionScannedSuccessCount : 0) || 0;
var sessionDbConfirmedCount = Number(typeof sessionDbConfirmedCount !== 'undefined' ? sessionDbConfirmedCount : 0) || 0;
var persistentQueueSaveTimer = typeof persistentQueueSaveTimer !== 'undefined' ? persistentQueueSaveTimer : null;
var recentFeedSaveTimer = typeof recentFeedSaveTimer !== 'undefined' ? recentFeedSaveTimer : null;
var networkMonitorTimer = typeof networkMonitorTimer !== 'undefined' ? networkMonitorTimer : null;
var batchCoalesceTimer = null;
var sbClientWarmupTimer = null;
var scanSpeedCounter = Number(typeof scanSpeedCounter !== 'undefined' ? scanSpeedCounter : 0) || 0;
var scanSpeedTimer = typeof scanSpeedTimer !== 'undefined' ? scanSpeedTimer : null;
var activeDocTargetScanField = typeof activeDocTargetScanField !== 'undefined' ? activeDocTargetScanField : null;
var isInboundDocRefLocked = Boolean(typeof isInboundDocRefLocked !== 'undefined' ? isInboundDocRefLocked : true);
var currentInboundTaxInvoice = typeof currentInboundTaxInvoice !== 'undefined' ? currentInboundTaxInvoice : '';
var currentInboundPoNumber = typeof currentInboundPoNumber !== 'undefined' ? currentInboundPoNumber : '';

let supabaseSupportsDocRefColumns = true;
let supabaseSupportsSkuColumn = true;
let supabaseSupportsSelectAfterInsert = true;
const unsupportedWarehouseColumns = new Set();
let lastDbSyncErrorMessage = '';
let lastDbSyncSuccessAt = '';

if (typeof window !== 'undefined') {
    window.persistentDbSyncQueue = persistentDbSyncQueue;
    window.pendingFastSnSet = pendingFastSnSet;
    window.pendingFastLocationSet = pendingFastLocationSet;
}

// =========================================================================
// 1. SUPABASE CLIENT RESOLVER (SUPPORTS ALL GLOBAL CLIENT NAMES & AUTO-INIT)
// =========================================================================

function isValidSupabaseClientInstance(candidate) {
    return Boolean(
        candidate &&
        (typeof candidate === 'object' || typeof candidate === 'function') &&
        typeof candidate.from === 'function'
    );
}

function getActiveSupabaseClient() {
    if (typeof window !== 'undefined') {
        const directCandidates = [
            window.supabaseClient,
            window._supabase,
            window.db,
            window.supabase,
            window.sbClient,
            window.wmsSupabase,
            window.client
        ];
        for (let i = 0; i < directCandidates.length; i++) {
            if (isValidSupabaseClientInstance(directCandidates[i])) {
                return directCandidates[i];
            }
        }
    }

    try {
        if (typeof supabaseClient !== 'undefined' && isValidSupabaseClientInstance(supabaseClient)) return supabaseClient;
    } catch (e) {}
    try {
        if (typeof _supabase !== 'undefined' && isValidSupabaseClientInstance(_supabase)) return _supabase;
    } catch (e) {}
    try {
        if (typeof db !== 'undefined' && isValidSupabaseClientInstance(db)) return db;
    } catch (e) {}
    try {
        if (typeof supabase !== 'undefined' && isValidSupabaseClientInstance(supabase)) return supabase;
    } catch (e) {}

    // Fallback: สร้าง Client อัตโนมัติหากมี SDK window.supabase.createClient และค่า URL/Key ในระบบ
    if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
        const url = window.SUPABASE_URL ||
                    window.supabaseUrl ||
                    (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) ||
                    localStorage.getItem('SUPABASE_URL') ||
                    localStorage.getItem('supabase_url') ||
                    '';
        const key = window.SUPABASE_KEY ||
                    window.SUPABASE_ANON_KEY ||
                    window.supabaseKey ||
                    (window.APP_CONFIG && (window.APP_CONFIG.SUPABASE_KEY || window.APP_CONFIG.SUPABASE_ANON_KEY)) ||
                    localStorage.getItem('SUPABASE_KEY') ||
                    localStorage.getItem('SUPABASE_ANON_KEY') ||
                    localStorage.getItem('supabase_key') ||
                    '';

        if (url && key && /^https?:\/\//i.test(url)) {
            try {
                const created = window.supabase.createClient(url, key);
                if (isValidSupabaseClientInstance(created)) {
                    window.supabaseClient = created;
                    return created;
                }
            } catch (e) {}
        }
    }

    return null;
}

function withPromiseTimeout(promise, timeoutMs = DB_REQUEST_TIMEOUT_MS, timeoutMsg = 'การเชื่อมต่อฐานข้อมูลใช้เวลานานเกินกำหนด (Timeout)') {
    let timerId = null;
    const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
            const err = new Error(timeoutMsg);
            err.code = 'ETIMEDOUT';
            reject(err);
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timerId) clearTimeout(timerId);
    });
}

// =========================================================================
// 2. DUPLICATE S/N GUARD & FORM CONTEXT EXTRACTOR (MATCHES index.html)
// =========================================================================

function isSnAlreadyInSystem(cleanSn) {
    const snUpper = String(cleanSn || '').trim().toUpperCase();
    if (!snUpper) return false;

    if (pendingFastSnSet.has(snUpper)) return true;

    if (Array.isArray(persistentDbSyncQueue)) {
        for (let i = 0; i < persistentDbSyncQueue.length; i++) {
            if (String(persistentDbSyncQueue[i]?.payload?.sn || '').trim().toUpperCase() === snUpper) return true;
        }
    }

    const deletedStatuses = new Set(['DELETED', 'OUT', 'DISPATCHED', 'CANCELLED', 'VOID', 'REMOVED']);
    const localList = (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList))
        ? recentInboundList
        : (typeof window !== 'undefined' && Array.isArray(window.recentInboundList) ? window.recentInboundList : []);

    for (let i = 0; i < localList.length; i++) {
        const r = localList[i];
        if (!r || !r.sn) continue;
        if (String(r.sn).trim().toUpperCase() === snUpper) {
            const st = String(r.status || '').trim().toUpperCase();
            if (!r.is_deleted && !deletedStatuses.has(st)) return true;
        }
    }

    const globalList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData) ? window.globalInventoryData : []);

    for (let i = 0; i < globalList.length; i++) {
        const g = globalList[i];
        if (!g || !g.sn) continue;
        if (String(g.sn).trim().toUpperCase() === snUpper) {
            const st = String(g.status || '').trim().toUpperCase();
            if (!g.is_deleted && !deletedStatuses.has(st)) return true;
        }
    }

    return false;
}

function getSelectedInboundFormContext() {
    // ใน index.html: #inboundCategory คือช่อง "รหัสสินค้า / SKU" และ #inboundName คือ "ชื่อรุ่น / รายละเอียดสินค้า"
    const catSkuEl = document.getElementById('inboundCategory');
    const skuAltEl = document.getElementById('inboundSku');
    const searchEl = document.getElementById('skuSearchInput');
    const nameEl = document.getElementById('inboundName');
    const meterEl = document.getElementById('inboundMeter');
    const locEl = document.getElementById('inboundLocation');
    const aisleEl = document.getElementById('inboundAisleSelect');
    const bayEl = document.getElementById('inboundBaySelect');
    const shelfEl = document.getElementById('inboundShelfSelect');
    const slotEl = document.getElementById('inboundSlotSelect');

    let sku = '';
    if (catSkuEl && catSkuEl.value.trim()) {
        sku = catSkuEl.value.trim();
    } else if (skuAltEl && skuAltEl.value.trim()) {
        sku = skuAltEl.value.trim();
    } else if (searchEl && searchEl.value.trim()) {
        sku = searchEl.value.trim();
    }

    let name = nameEl ? String(nameEl.value || '').trim() : '';

    if (sku && !name && sku.includes(' - ')) {
        const parts = sku.split(' - ');
        sku = parts[0].trim();
        name = parts.slice(1).join(' - ').trim();
    }

    const meterRaw = meterEl ? String(meterEl.value || '').trim() : '0';
    const meter = meterRaw !== '' && !isNaN(Number(meterRaw)) ? Number(meterRaw) : 0;

    // อ่านแถวและพิกัดสดจาก Dropdown ของผู้ใช้โดยตรง (ป้องกันค่าค้างใน #inboundLocation)
    const rawAisle = aisleEl ? String(aisleEl.value || 'DOCK').trim() : 'DOCK';
    const aisle = typeof normalizeAisleCode === 'function'
        ? normalizeAisleCode(rawAisle)
        : rawAisle.replace(/^แถว\s*/i, '').trim() || 'DOCK';

    let location = '';
    if (typeof getResolvedInboundLocation === 'function') {
        location = getResolvedInboundLocation();
    } else if (aisle.toUpperCase() === 'DOCK') {
        location = 'DOCK';
    } else if (aisleEl) {
        const bay = (bayEl && bayEl.value) ? String(bayEl.value).trim().padStart(2, '0') : '01';
        const shelf = (shelfEl && shelfEl.value) ? String(shelfEl.value).trim().padStart(2, '0') : '01';
        const slot = (slotEl && slotEl.value) ? String(slotEl.value).trim().padStart(2, '0') : '01';
        location = `${aisle}-${bay}-${shelf}-${slot}`;
        if (locEl) locEl.value = location;
    } else {
        location = locEl && locEl.value ? String(locEl.value).trim() : 'DOCK';
    }

    const docRefs = typeof getActiveInboundDocRefs === 'function'
        ? getActiveInboundDocRefs()
        : { taxInvoice: currentInboundTaxInvoice || '', poNumber: currentInboundPoNumber || '' };

    return {
        sku,
        name: name || sku,
        category: sku,
        meter,
        aisle,
        location: location || 'DOCK',
        taxInvoice: docRefs.taxInvoice || '',
        poNumber: docRefs.poNumber || '',
        recordedBy: typeof getCurrentUserFullName === 'function' ? getCurrentUserFullName() : 'admin'
    };
}

// =========================================================================
// 3. 0ms INSTANT SCAN CAPTURE & QUEUE PROCESSOR
// =========================================================================

function recordScanVelocity() {
    scanSpeedCounter++;
    if (!scanSpeedTimer) {
        scanSpeedTimer = setTimeout(() => {
            scanSpeedCounter = 0;
            scanSpeedTimer = null;
        }, 1000);
    }
    return scanSpeedCounter;
}

function triggerSnInputFlash(type = 'success') {
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;
    snInput.classList.remove('scan-flash-success', 'scan-flash-error');
    void snInput.offsetWidth;
    snInput.classList.add(type === 'success' ? 'scan-flash-success' : 'scan-flash-error');
    setTimeout(() => snInput.classList.remove('scan-flash-success', 'scan-flash-error'), 240);
}

function safeFocusSnInput(selectText = true) {
    if (typeof ensureSnInputFocus === 'function') {
        ensureSnInputFocus(selectText);
        return;
    }
    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        snInput.focus();
        if (selectText && typeof snInput.select === 'function') snInput.select();
    }
}

function safeRenderScanBoxStatus(status, sn = '', location = '', queueLen = 0, speed = 0) {
    if (typeof renderInstantScanBoxStatus === 'function') {
        renderInstantScanBoxStatus(status, sn, location, queueLen, speed);
    }
}

function scheduleCoalescedDbFlush(delayMs = 5) {
    if (persistentDbSyncQueue.length >= BATCH_SYNC_CHUNK_SIZE) {
        if (batchCoalesceTimer) {
            clearTimeout(batchCoalesceTimer);
            batchCoalesceTimer = null;
        }
        flushPersistentDbSyncQueue(false);
        return;
    }

    if (batchCoalesceTimer) clearTimeout(batchCoalesceTimer);
    batchCoalesceTimer = setTimeout(() => {
        batchCoalesceTimer = null;
        flushPersistentDbSyncQueue(false);
    }, delayMs);
}

function enqueueScanInput(rawSnValue, options = {}) {
    const rawStr = String(rawSnValue || '').replace(/[\r\n\t]+/g, ' ').trim();
    if (!rawStr) return false;

    // กรณีกำลังสแกนบาร์โค้ดเข้าช่องเอกสาร (ใบกำกับภาษี หรือ PO)
    if (activeDocTargetScanField) {
        const cleanDocVal = rawStr.replace(/\s+/g, '');
        if (activeDocTargetScanField === 'tax_invoice') {
            const taxInput = document.getElementById('inboundTaxInvoice');
            if (taxInput) taxInput.value = cleanDocVal;
            if (typeof onInboundDocRefInputChange === 'function') onInboundDocRefInputChange();
            activeDocTargetScanField = 'po_number';
            const poInput = document.getElementById('inboundPoNumber');
            if (poInput) { poInput.focus(); poInput.select(); }
            if (typeof playAudioFeedback === 'function') playAudioFeedback('success');
            if (typeof showToast === 'function') {
                showToast(`🧾 บันทึกเลขที่ใบกำกับภาษี: ${cleanDocVal} (พร้อมสแกนเลข PO ถัดไป)`, false, 2200);
            }
            return true;
        } else if (activeDocTargetScanField === 'po_number') {
            const poInput = document.getElementById('inboundPoNumber');
            if (poInput) poInput.value = cleanDocVal;
            if (typeof onInboundDocRefInputChange === 'function') onInboundDocRefInputChange();
            activeDocTargetScanField = null;
            if (typeof playAudioFeedback === 'function') playAudioFeedback('success');
            if (typeof showToast === 'function') {
                showToast(`📋 บันทึกเลข PO: ${cleanDocVal} (พร้อมยิงสแกน S/N ทันที)`, false, 2200);
            }
            safeFocusSnInput(true);
            return true;
        }
    }

    // กรณีวางหรือสแกน S/N หลายรายการพร้อมกัน
    const tokens = rawStr.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
    if (tokens.length > 1 && !options.singleTokenOnly) {
        let count = 0;
        tokens.forEach(t => { if (processSingleFastScanItem(t, options)) count++; });
        return count > 0;
    }

    return processSingleFastScanItem(tokens[0] || rawStr, options);
}

function processSingleFastScanItem(rawSnInput, options = {}) {
    const cleanSn = String(rawSnInput || '').replace(/[\r\n\t]+/g, '').trim();
    if (!cleanSn) return false;

    const snInput = document.getElementById('inboundSn');
    if (snInput && !options.preserveInput) {
        snInput.value = '';
    }

    const ctx = getSelectedInboundFormContext();

    // 1. ตรวจสอบรหัสสินค้า / SKU และชื่อรุ่น
    if (!ctx.sku && !ctx.name) {
        if (typeof playAudioFeedback === 'function') playAudioFeedback('error');
        triggerSnInputFlash('error');
        safeRenderScanBoxStatus('error', '⚠️ กรุณาค้นหาหรือกรอกรหัสสินค้า (SKU / ชื่อรุ่น) ก่อนยิง S/N');
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณาระบุรหัสสินค้า (SKU) หรือชื่อรุ่นก่อนยิงสแกน S/N', true, 2600);
        }
        const skuField = document.getElementById('skuSearchInput') || document.getElementById('inboundCategory');
        if (skuField) skuField.focus();
        return false;
    }

    // 2. ตรวจสอบ S/N ซ้ำแบบ 0ms
    if (isSnAlreadyInSystem(cleanSn)) {
        if (typeof playAudioFeedback === 'function') playAudioFeedback('duplicate');
        triggerSnInputFlash('error');
        safeRenderScanBoxStatus('duplicate', cleanSn);
        if (typeof showToast === 'function') {
            showToast(`⛔ ข้ามรายการซ้ำ: S/N "${cleanSn}" มีอยู่ในระบบแล้ว`, true, 2400);
        }
        safeFocusSnInput(true);
        return false;
    }

    // 3. ตรวจสอบและจองพิกัดจัดเก็บ (ตรงตามแถวที่ผู้ใช้เลือกเท่านั้น)
    let assignedLocation = ctx.location || 'DOCK';
    if (typeof isCoordOccupied === 'function' && isCoordOccupied(assignedLocation)) {
        if (typeof forceSyncAndSelectAvailableLocation === 'function') {
            assignedLocation = forceSyncAndSelectAvailableLocation(true);
        }
        if (typeof isCoordOccupied === 'function' && isCoordOccupied(assignedLocation)) {
            if (typeof playAudioFeedback === 'function') playAudioFeedback('occupied');
            triggerSnInputFlash('error');
            safeRenderScanBoxStatus('occupied', cleanSn, assignedLocation);
            if (typeof showToast === 'function') {
                showToast(`⚠️ แถวจัดเก็บ ${ctx.aisle} เต็มทุกช่องแล้ว กรุณาเลือกแถวใหม่`, true, 3000);
            }
            safeFocusSnInput(true);
            return false;
        }
    }

    // 4. จองในหน่วยความจำ 0ms
    pendingFastSnSet.add(cleanSn.toUpperCase());
    if (typeof addOccupiedLocToSet === 'function') {
        addOccupiedLocToSet(pendingFastLocationSet, assignedLocation);
    }

    const nowISO = new Date().toISOString();
    const tempClientId = `TMP_${Date.now()}_${++dbSyncSequenceCounter}`;

    const newInboundRecord = {
        id: tempClientId,
        sku: ctx.sku,
        category: ctx.sku,
        name: ctx.name || ctx.sku,
        sn: cleanSn,
        meter: ctx.meter,
        location: assignedLocation,
        status: 'IN_STOCK',
        recorded_by: ctx.recordedBy,
        tax_invoice_no: ctx.taxInvoice || '',
        po_number: ctx.poNumber || '',
        created_at: nowISO,
        db_status: 'QUEUED',
        db_error: '',
        isOffline: !navigator.onLine
    };

    // 5. เพิ่มขึ้นด้านบนสุดของประวัติรับเข้าล่าสุดทันที 0ms
    if (typeof recentInboundList === 'undefined' || !Array.isArray(recentInboundList)) {
        recentInboundList = (typeof window !== 'undefined' && Array.isArray(window.recentInboundList))
            ? window.recentInboundList
            : [];
    }
    recentInboundList.unshift(newInboundRecord);
    if (typeof window !== 'undefined') window.recentInboundList = recentInboundList;

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        globalInventoryData.unshift(newInboundRecord);
    }

    // อัปเดตสถิติเอกสาร
    if ((ctx.taxInvoice || ctx.poNumber) && typeof recordInboundDocUsage === 'function') {
        recordInboundDocUsage(ctx.taxInvoice, ctx.poNumber, 1);
    }

    if (!isInboundDocRefLocked && (ctx.taxInvoice || ctx.poNumber) && typeof setInboundDocRefs === 'function') {
        setInboundDocRefs('', '', false);
    }

    // 6. เลื่อนพิกัดช่องว่างถัดไปภายในแถวเดิมอัตโนมัติ (ถ้าไม่ใช่ DOCK)
    if (typeof forceSyncAndSelectAvailableLocation === 'function') {
        forceSyncAndSelectAvailableLocation(true);
    }

    // 7. ส่งเข้าคิวซิงก์ฐานข้อมูล Supabase ทันที
    persistentDbSyncQueue.push({
        queueId: tempClientId,
        enqueuedAt: nowISO,
        retryCount: 0,
        lastError: '',
        payload: newInboundRecord
    });
    savePersistentDbQueueImmediate();
    updateInboundNetworkSyncHUD();

    // 8. เสียง แสง และอัปเดตหน้าจอทันที
    sessionScannedSuccessCount++;
    const speed = recordScanVelocity();
    if (!options.silentAudio && typeof playAudioFeedback === 'function') playAudioFeedback('success');
    triggerSnInputFlash('success');
    safeRenderScanBoxStatus('success', cleanSn, assignedLocation, persistentDbSyncQueue.length, speed);

    scheduleNonBlockingRecentFeedSave();
    if (typeof scheduleDebouncedFeedRender === 'function') {
        scheduleDebouncedFeedRender();
    } else if (typeof renderLiveInboundFeed === 'function') {
        renderLiveInboundFeed();
    }

    // เรียกซิงก์เข้า Supabase ทันทีแบบ Real-time Coalesced Batch (5ms)
    scheduleCoalescedDbFlush(5);
    safeFocusSnInput(true);
    return true;
}

// =========================================================================
// 4. PERSISTENT OFFLINE-FIRST QUEUE & SUPABASE BATCH WRITER
// =========================================================================

function loadPersistentDbQueue() {
    try {
        const raw = localStorage.getItem(PERSISTENT_DB_QUEUE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            persistentDbSyncQueue.length = 0;
            parsed.forEach(e => {
                if (e && e.payload && e.payload.sn) {
                    persistentDbSyncQueue.push(e);
                    pendingFastSnSet.add(String(e.payload.sn).trim().toUpperCase());
                    if (typeof addOccupiedLocToSet === 'function') {
                        addOccupiedLocToSet(pendingFastLocationSet, e.payload.location);
                    }
                }
            });
        }
    } catch (e) {
        persistentDbSyncQueue.length = 0;
    }
}

function savePersistentDbQueue() {
    if (persistentQueueSaveTimer) clearTimeout(persistentQueueSaveTimer);
    persistentQueueSaveTimer = setTimeout(() => {
        try { localStorage.setItem(PERSISTENT_DB_QUEUE_KEY, JSON.stringify(persistentDbSyncQueue)); } catch (e) {}
    }, 50);
}

function savePersistentDbQueueImmediate() {
    if (persistentQueueSaveTimer) {
        clearTimeout(persistentQueueSaveTimer);
        persistentQueueSaveTimer = null;
    }
    try { localStorage.setItem(PERSISTENT_DB_QUEUE_KEY, JSON.stringify(persistentDbSyncQueue)); } catch (e) {}
}

function scheduleNonBlockingRecentFeedSave() {
    if (recentFeedSaveTimer) clearTimeout(recentFeedSaveTimer);
    recentFeedSaveTimer = setTimeout(() => {
        if (typeof saveRecentInboundFeedToCache === 'function') {
            saveRecentInboundFeedToCache();
        }
    }, 100);
}

function buildSupabaseInsertRow(payload, withDocCols = true, withSkuCol = true) {
    const cleanSku = String(payload.sku || payload.category || 'UNSPECIFIED').trim() || 'UNSPECIFIED';
    const cleanName = String(payload.name || cleanSku || 'สินค้าไม่ระบุรุ่น').trim() || 'สินค้าไม่ระบุรุ่น';
    const cleanSn = String(payload.sn || '').trim();
    const numericMeter = Number(payload.meter);

    const row = {
        category: cleanSku,
        name: cleanName,
        sn: cleanSn,
        meter: Number.isFinite(numericMeter) ? numericMeter : 0,
        location: String(payload.location || 'DOCK').trim() || 'DOCK',
        status: 'IN_STOCK',
        recorded_by: String(payload.recorded_by || 'admin').trim() || 'admin',
        created_at: payload.created_at || new Date().toISOString()
    };

    if (withSkuCol) {
        row.sku = cleanSku;
    }
    if (withDocCols) {
        row.tax_invoice_no = payload.tax_invoice_no || null;
        row.po_number = payload.po_number || null;
    }

    // ตัดคอลัมน์ที่ตรวจพบว่าไม่มีในตาราง Supabase ออกอัตโนมัติ
    unsupportedWarehouseColumns.forEach(colName => {
        delete row[colName];
    });

    return row;
}

function extractMissingColumnFromSupabaseError(error) {
    if (!error) return null;
    const fullText = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
    // รองรับทั้งรูปแบบ PostgREST: "Could not find the 'xyz' column" และ PostgreSQL: column "xyz" of relation ... does not exist
    const pgrstMatch = fullText.match(/Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i);
    if (pgrstMatch && pgrstMatch[1]) return pgrstMatch[1];

    const pgMatch = fullText.match(/column\s+['"]?([a-zA-Z0-9_]+)['"]?\s+(?:of relation\s+['"]?[a-zA-Z0-9_]+['"]?\s+)?does not exist/i);
    if (pgMatch && pgMatch[1]) return pgMatch[1];

    return null;
}

function isDuplicateKeySupabaseError(error) {
    if (!error) return false;
    const code = String(error.code || '');
    const status = Number(error.status || 0);
    const msg = String(error.message || error.details || '').toLowerCase();
    return code === '23505' || status === 409 || msg.includes('duplicate key') || msg.includes('already exists') || msg.includes('unique constraint');
}

function isSelectRlsPermissionError(error) {
    if (!error) return false;
    const code = String(error.code || '');
    const msg = String(error.message || error.details || '').toLowerCase();
    return code === '42501' || msg.includes('row-level security') || msg.includes('permission denied');
}

async function executeInsertWithFallback(sb, rows) {
    if (supabaseSupportsSelectAfterInsert) {
        const resWithSelect = await withPromiseTimeout(
            sb.from('warehouse_items').insert(rows).select()
        );
        if (!resWithSelect.error) {
            return { data: resWithSelect.data || [], error: null };
        }
        // หากติดสิทธิ์ RLS ตอน SELECT หลัง INSERT ให้สลับไปใช้ INSERT ตรงทันที
        if (isSelectRlsPermissionError(resWithSelect.error)) {
            supabaseSupportsSelectAfterInsert = false;
            const resInsertOnly = await withPromiseTimeout(
                sb.from('warehouse_items').insert(rows)
            );
            return { data: resInsertOnly.data || [], error: resInsertOnly.error };
        }
        return resWithSelect;
    }

    const resInsertOnly = await withPromiseTimeout(
        sb.from('warehouse_items').insert(rows)
    );
    return { data: resInsertOnly.data || [], error: resInsertOnly.error };
}

async function writeBatchToSupabase(batchEntries) {
    const sb = getActiveSupabaseClient();
    if (!sb) {
        const err = new Error('กำลังรอการเชื่อมต่อ Supabase Client');
        err.code = 'NO_SUPABASE_CLIENT';
        throw err;
    }

    let attemptSchemaAdaptations = 0;
    let data = [];
    let error = null;

    while (attemptSchemaAdaptations < 6) {
        const rows = batchEntries.map(e =>
            buildSupabaseInsertRow(e.payload, supabaseSupportsDocRefColumns, supabaseSupportsSkuColumn)
        );

        const execRes = await executeInsertWithFallback(sb, rows);
        data = execRes.data;
        error = execRes.error;

        if (!error) break;

        // ตรวจสอบว่าติด Error ไม่มีคอลัมน์ในตารางหรือไม่ แล้วปรับโครงสร้างอัตโนมัติ
        const missingCol = extractMissingColumnFromSupabaseError(error);
        const msgLower = String(error.message || error.details || '').toLowerCase();
        const isSchemaErr = Boolean(missingCol) ||
            error.code === 'PGRST204' ||
            error.code === '42703' ||
            msgLower.includes('tax_invoice_no') ||
            msgLower.includes('po_number') ||
            msgLower.includes('sku');

        if (isSchemaErr) {
            if (missingCol && missingCol !== 'sn') {
                unsupportedWarehouseColumns.add(missingCol);
            }
            if (msgLower.includes('tax_invoice_no') || msgLower.includes('po_number')) {
                supabaseSupportsDocRefColumns = false;
            }
            if (msgLower.includes('sku')) {
                supabaseSupportsSkuColumn = false;
            }
            attemptSchemaAdaptations++;
            continue;
        }

        break;
    }

    if (error) {
        // กรณีข้อมูลซ้ำในฐานข้อมูล (Unique S/N Violation 23505 / HTTP 409)
        if (isDuplicateKeySupabaseError(error)) {
            if (batchEntries.length === 1) {
                return [{ sn: batchEntries[0].payload.sn, _alreadyExistedInDb: true }];
            }
            // หากส่งเป็นชุดแล้วมีบางตัวซ้ำ ให้แยกส่งทีละตัวเพื่อเก็บตัวที่ไม่ซ้ำให้ครบ 100%
            const results = [];
            for (const single of batchEntries) {
                try {
                    const res = await writeBatchToSupabase([single]);
                    if (Array.isArray(res)) results.push(...res);
                } catch (errSingle) {
                    if (isDuplicateKeySupabaseError(errSingle)) {
                        results.push({ sn: single.payload.sn, _alreadyExistedInDb: true });
                    } else {
                        throw errSingle;
                    }
                }
            }
            return results;
        }

        // หากเป็น Error เฉพาะแถวในชุดที่มีหลายรายการ ให้แยกส่งรายตัวเพื่อไม่ให้ 1 แถวขวางทั้งชุด
        if (batchEntries.length > 1 && error.code !== 'ETIMEDOUT' && error.code !== 'NO_SUPABASE_CLIENT') {
            const isolatedResults = [];
            for (const single of batchEntries) {
                const singleRes = await writeBatchToSupabase([single]);
                if (Array.isArray(singleRes)) isolatedResults.push(...singleRes);
            }
            return isolatedResults;
        }

        throw error;
    }

    // บันทึกประวัติลง user_activities แบบ Non-blocking
    try {
        const first = batchEntries[0].payload;
        const docInfo = [
            first.tax_invoice_no ? `INV: ${first.tax_invoice_no}` : '',
            first.po_number ? `PO: ${first.po_number}` : ''
        ].filter(Boolean).join(' | ');

        sb.from('user_activities').insert([{
            user_name: first.recorded_by || 'admin',
            action: 'INBOUND',
            details: batchEntries.length === 1
                ? `รับเข้า S/N: ${first.sn} (${first.sku}) พิกัด ${first.location}${docInfo ? ` [${docInfo}]` : ''}`
                : `รับเข้าชุด ${batchEntries.length} รายการ (${first.sku}) พิกัด ${first.location}${docInfo ? ` [${docInfo}]` : ''}`,
            created_at: new Date().toISOString()
        }]).then(() => {}).catch(() => {});
    } catch (e) {}

    return Array.isArray(data) && data.length > 0
        ? data
        : batchEntries.map(e => ({ sn: e.payload.sn }));
}

function markRecentInboundItemsSynced(syncedMap) {
    const listsToUpdate = [];
    if (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList)) {
        listsToUpdate.push(recentInboundList);
    }
    if (typeof window !== 'undefined' && Array.isArray(window.recentInboundList) && window.recentInboundList !== recentInboundList) {
        listsToUpdate.push(window.recentInboundList);
    }

    listsToUpdate.forEach(list => {
        list.forEach(item => {
            if (!item?.sn) return;
            const up = String(item.sn).trim().toUpperCase();
            if (syncedMap.has(up)) {
                const row = syncedMap.get(up);
                if (row && row.id !== undefined && row.id !== null) item.id = row.id;
                item.db_status = 'SYNCED';
                item.db_error = '';
                item.isOffline = false;
                pendingFastSnSet.delete(up);
            }
        });
    });
}

function markRecentInboundItemsError(failedSnSet, errorMessage) {
    const listsToUpdate = [];
    if (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList)) {
        listsToUpdate.push(recentInboundList);
    }
    if (typeof window !== 'undefined' && Array.isArray(window.recentInboundList) && window.recentInboundList !== recentInboundList) {
        listsToUpdate.push(window.recentInboundList);
    }

    listsToUpdate.forEach(list => {
        list.forEach(item => {
            if (!item?.sn) return;
            const up = String(item.sn).trim().toUpperCase();
            if (failedSnSet.has(up) && String(item.db_status || '').toUpperCase() !== 'SYNCED') {
                item.db_status = 'ERROR';
                item.db_error = errorMessage || 'ซิงก์ไม่สำเร็จ';
            }
        });
    });
}

function scheduleSupabaseWarmupRetry() {
    if (sbClientWarmupTimer) return;
    let attempts = 0;
    sbClientWarmupTimer = setInterval(() => {
        attempts++;
        if (persistentDbSyncQueue.length === 0 || attempts > 30) {
            clearInterval(sbClientWarmupTimer);
            sbClientWarmupTimer = null;
            return;
        }
        const sb = getActiveSupabaseClient();
        if (sb && navigator.onLine) {
            clearInterval(sbClientWarmupTimer);
            sbClientWarmupTimer = null;
            flushPersistentDbSyncQueue(true);
        }
    }, 350);
}

async function flushPersistentDbSyncQueue(forceImmediate = false) {
    // ปลดล็อก Watchdog อัตโนมัติหากคิวค้างเกิน 15 วินาที
    if (isFlushingDbQueue) {
        if (dbFlushStartedAt > 0 && (Date.now() - dbFlushStartedAt) > DB_FLUSH_WATCHDOG_MS) {
            isFlushingDbQueue = false;
            dbFlushStartedAt = 0;
        } else {
            return;
        }
    }

    if (!Array.isArray(persistentDbSyncQueue) || persistentDbSyncQueue.length === 0) {
        lastDbSyncErrorMessage = '';
        updateInboundNetworkSyncHUD();
        return;
    }

    if (!navigator.onLine && !forceImmediate) {
        updateInboundNetworkSyncHUD();
        return;
    }

    const sb = getActiveSupabaseClient();
    if (!sb) {
        lastDbSyncErrorMessage = 'กำลังเชื่อมต่อ Supabase Client...';
        updateInboundNetworkSyncHUD();
        scheduleSupabaseWarmupRetry();
        return;
    }

    isFlushingDbQueue = true;
    dbFlushStartedAt = Date.now();
    if (forceImmediate) {
        lastDbSyncErrorMessage = '';
    }
    updateInboundNetworkSyncHUD();

    try {
        while (persistentDbSyncQueue.length > 0) {
            if (!navigator.onLine && !forceImmediate) break;

            const batch = persistentDbSyncQueue.slice(0, BATCH_SYNC_CHUNK_SIZE);
            try {
                const inserted = await writeBatchToSupabase(batch);
                const syncedMap = new Map();
                let duplicateResolvedCount = 0;

                batch.forEach(e => {
                    const key = String(e.payload.sn).trim().toUpperCase();
                    syncedMap.set(key, null);
                    pendingFastSnSet.delete(key);
                });

                if (Array.isArray(inserted)) {
                    inserted.forEach(r => {
                        if (r?.sn) {
                            syncedMap.set(String(r.sn).trim().toUpperCase(), r);
                            if (r._alreadyExistedInDb) duplicateResolvedCount++;
                        }
                    });
                }

                persistentDbSyncQueue.splice(0, batch.length);
                sessionDbConfirmedCount += batch.length;
                lastDbSyncErrorMessage = '';
                lastDbSyncSuccessAt = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                savePersistentDbQueueImmediate();

                markRecentInboundItemsSynced(syncedMap);
                scheduleNonBlockingRecentFeedSave();
                updateInboundNetworkSyncHUD();

                if (duplicateResolvedCount > 0 && typeof showToast === 'function') {
                    showToast(`ℹ️ ซิงก์สำเร็จ (พบ S/N ที่มีอยู่แล้วในฐานข้อมูล ${duplicateResolvedCount} รายการ)`, false, 2200);
                }

                if (persistentDbSyncQueue.length === 0) {
                    safeRenderScanBoxStatus('synced');
                }
                if (typeof scheduleDebouncedFeedRender === 'function') {
                    scheduleDebouncedFeedRender();
                } else if (typeof renderLiveInboundFeed === 'function') {
                    renderLiveInboundFeed();
                }
            } catch (err) {
                const errText = err?.message || err?.details || 'การเชื่อมต่อฐานข้อมูลขัดข้อง';
                lastDbSyncErrorMessage = errText;

                const failedSnSet = new Set();
                batch.forEach(entry => {
                    entry.retryCount = (Number(entry.retryCount) || 0) + 1;
                    entry.lastError = errText;
                    if (entry?.payload?.sn) {
                        failedSnSet.add(String(entry.payload.sn).trim().toUpperCase());
                    }
                });

                markRecentInboundItemsError(failedSnSet, errText);
                savePersistentDbQueueImmediate();
                updateInboundNetworkSyncHUD();

                if (typeof scheduleDebouncedFeedRender === 'function') {
                    scheduleDebouncedFeedRender();
                } else if (typeof renderLiveInboundFeed === 'function') {
                    renderLiveInboundFeed();
                }
                break;
            }
        }
    } finally {
        isFlushingDbQueue = false;
        dbFlushStartedAt = 0;
        updateInboundNetworkSyncHUD();
    }
}

function retryFailedInboundItemsNow() {
    lastDbSyncErrorMessage = '';
    const listsToUpdate = [];
    if (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList)) listsToUpdate.push(recentInboundList);
    if (typeof window !== 'undefined' && Array.isArray(window.recentInboundList)) listsToUpdate.push(window.recentInboundList);

    listsToUpdate.forEach(list => {
        list.forEach(item => {
            if (item && String(item.db_status || '').toUpperCase() === 'ERROR') {
                item.db_status = 'QUEUED';
                item.db_error = '';
            }
        });
    });

    if (typeof renderLiveInboundFeed === 'function') renderLiveInboundFeed();
    flushPersistentDbSyncQueue(true);
}

// =========================================================================
// 5. QUEUE RECOVERY UTILITIES (EXPORT / CLEAR STUCK ITEMS)
// =========================================================================

function exportPendingSyncQueueJson() {
    if (!Array.isArray(persistentDbSyncQueue) || persistentDbSyncQueue.length === 0) {
        if (typeof showToast === 'function') showToast('ℹ️ ไม่มีรายการค้างซิงก์ในคิว', false, 1800);
        return;
    }

    try {
        const exportData = persistentDbSyncQueue.map(item => ({
            sn: item?.payload?.sn || '',
            sku: item?.payload?.sku || '',
            name: item?.payload?.name || '',
            meter: item?.payload?.meter ?? 0,
            location: item?.payload?.location || 'DOCK',
            tax_invoice_no: item?.payload?.tax_invoice_no || '',
            po_number: item?.payload?.po_number || '',
            recorded_by: item?.payload?.recorded_by || '',
            created_at: item?.payload?.created_at || '',
            lastError: item?.lastError || ''
        }));

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wms-pending-inbound-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {}
}

function clearStuckSyncQueueWithConfirm() {
    const count = Array.isArray(persistentDbSyncQueue) ? persistentDbSyncQueue.length : 0;
    if (count === 0) return;

    const ok = typeof window !== 'undefined'
        ? window.confirm(`ยืนยันล้างรายการที่ค้างอยู่ในคิวซิงก์จำนวน ${count} รายการหรือไม่?\n(แนะนำให้กด "สำรองไฟล์" ก่อนล้างหากข้อมูลยังไม่เข้าฐานข้อมูล)`)
        : true;

    if (!ok) return;

    persistentDbSyncQueue.forEach(e => {
        if (e?.payload?.sn) {
            pendingFastSnSet.delete(String(e.payload.sn).trim().toUpperCase());
        }
    });
    persistentDbSyncQueue.length = 0;
    lastDbSyncErrorMessage = '';
    isFlushingDbQueue = false;
    dbFlushStartedAt = 0;
    savePersistentDbQueueImmediate();
    updateInboundNetworkSyncHUD();

    if (typeof showToast === 'function') {
        showToast(`🗑️ ล้างคิวรอซิงก์ ${count} รายการเรียบร้อยแล้ว`, false, 2000);
    }
}

// =========================================================================
// 6. NETWORK & DATABASE SYNC STATUS HUD
// =========================================================================

function ensureInboundNetworkSyncHUDContainer() {
    let hud = document.getElementById('inboundNetworkSyncHud');
    if (hud) return hud;

    const feedContainer = document.getElementById('liveInboundFeedContainer') ||
                          document.getElementById('recentInboundFeed');
    if (!feedContainer || !feedContainer.parentElement) return null;

    hud = document.createElement('div');
    hud.id = 'inboundNetworkSyncHud';
    hud.className = 'wms-network-sync-hud';
    feedContainer.parentElement.insertBefore(hud, feedContainer);
    return hud;
}

function escapeSyncHudHtml(str) {
    if (typeof escapeHTML === 'function') return escapeHTML(str);
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function updateInboundNetworkSyncHUD() {
    const hud = ensureInboundNetworkSyncHUDContainer();
    if (!hud) return;

    const isOnline = navigator.onLine;
    const queueCount = Array.isArray(persistentDbSyncQueue) ? persistentDbSyncQueue.length : 0;
    const docRefs = typeof getActiveInboundDocRefs === 'function'
        ? getActiveInboundDocRefs()
        : { taxInvoice: currentInboundTaxInvoice || '', poNumber: currentInboundPoNumber || '', hasAnyDoc: Boolean(currentInboundTaxInvoice || currentInboundPoNumber) };
    const { taxInvoice, poNumber, hasAnyDoc } = docRefs;

    hud.classList.remove('offline', 'syncing');

    const docPill = hasAnyDoc
        ? `<span style="padding:2px 7px; border-radius:6px; background:var(--primary-light); color:var(--primary-text); font-size:0.71rem; font-weight:800;">
               ${taxInvoice ? `INV: ${escapeSyncHudHtml(taxInvoice)}` : ''} ${taxInvoice && poNumber ? '•' : ''} ${poNumber ? `PO: ${escapeSyncHudHtml(poNumber)}` : ''}
           </span>`
        : '';

    const confirmedPill = sessionDbConfirmedCount > 0
        ? `<span class="mono" style="padding:2px 7px; border-radius:999px; background:rgba(16,185,129,0.14); color:var(--success-text); font-size:0.7rem; font-weight:700;">บันทึกสำเร็จ ${sessionDbConfirmedCount.toLocaleString()}</span>`
        : '';

    if (!isOnline) {
        hud.classList.add('offline');
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; font-size:0.76rem; font-weight:700; color:var(--warning-text);">
                <span><span class="net-dot offline"></span> ออฟไลน์ — พักข้อมูลในเครื่องแล้ว ${queueCount.toLocaleString()} รายการ</span>
                <div style="display:flex; align-items:center; gap:6px;">
                    ${docPill}
                    ${queueCount > 0 ? `<button type="button" class="wms-mini-tool-btn" onclick="exportPendingSyncQueueJson()">สำรองไฟล์</button>` : ''}
                </div>
            </div>
        `;
    } else if (queueCount > 0 && lastDbSyncErrorMessage && !isFlushingDbQueue) {
        hud.classList.add('offline');
        hud.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:6px; width:100%;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; font-size:0.76rem; font-weight:700; color:var(--danger-text, #dc2626);">
                    <span><i class="fa-solid fa-circle-exclamation"></i> รอซิงก์ ${queueCount.toLocaleString()} รายการ — ${escapeSyncHudHtml(lastDbSyncErrorMessage)}</span>
                    <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                        <button type="button" class="wms-mini-tool-btn" onclick="retryFailedInboundItemsNow()">ลองซิงก์ใหม่</button>
                        <button type="button" class="wms-mini-tool-btn" onclick="exportPendingSyncQueueJson()">สำรองไฟล์</button>
                        <button type="button" class="wms-mini-tool-btn" onclick="clearStuckSyncQueueWithConfirm()">ล้างคิว</button>
                    </div>
                </div>
            </div>
        `;
    } else if (queueCount > 0 || isFlushingDbQueue) {
        hud.classList.add('syncing');
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; font-size:0.76rem; font-weight:700; color:var(--primary-text);">
                <span><i class="fa-solid fa-arrows-rotate fa-spin"></i> กำลังซิงก์เข้า Supabase (เหลือ ${queueCount.toLocaleString()})</span>
                <div style="display:flex; align-items:center; gap:6px;">
                    ${confirmedPill}
                    <button type="button" class="wms-mini-tool-btn" onclick="flushPersistentDbSyncQueue(true)">ซิงก์ทันที</button>
                </div>
            </div>
        `;
    } else {
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; font-size:0.76rem; font-weight:700; color:var(--success-text);">
                <span><span class="pulse-live-dot"></span> Supabase Realtime พร้อมใช้งาน 100%${lastDbSyncSuccessAt ? ` <span style="font-weight:500; opacity:0.8;">(ซิงก์ล่าสุด ${lastDbSyncSuccessAt})</span>` : ''}</span>
                <div style="display:flex; align-items:center; gap:6px;">
                    ${confirmedPill}
                    ${docPill}
                </div>
            </div>
        `;
    }
}

function initInboundSyncEngine() {
    loadPersistentDbQueue();
    updateInboundNetworkSyncHUD();

    if (typeof window !== 'undefined' && !window.__wmsInboundSyncListenersBound) {
        window.__wmsInboundSyncListenersBound = true;

        window.addEventListener('online', () => {
            lastDbSyncErrorMessage = '';
            updateInboundNetworkSyncHUD();
            flushPersistentDbSyncQueue(true);
        });

        window.addEventListener('offline', () => {
            updateInboundNetworkSyncHUD();
        });

        window.addEventListener('focus', () => {
            if (navigator.onLine && persistentDbSyncQueue.length > 0) {
                flushPersistentDbSyncQueue(false);
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && navigator.onLine && persistentDbSyncQueue.length > 0) {
                flushPersistentDbSyncQueue(false);
            }
        });

        window.addEventListener('beforeunload', () => {
            savePersistentDbQueueImmediate();
        });
    }

    if (networkMonitorTimer) clearInterval(networkMonitorTimer);
    networkMonitorTimer = setInterval(() => {
        if (navigator.onLine && persistentDbSyncQueue.length > 0) {
            flushPersistentDbSyncQueue(false);
        }
    }, 1500);

    // ทยอยตรวจสอบความพร้อมของ Supabase Client หลังโหลดหน้าเว็บ (100ms, 450ms, 1200ms)
    if (persistentDbSyncQueue.length > 0) {
        setTimeout(() => flushPersistentDbSyncQueue(false), 100);
        setTimeout(() => flushPersistentDbSyncQueue(false), 450);
        setTimeout(() => flushPersistentDbSyncQueue(false), 1200);
    }
}

if (typeof window !== 'undefined') {
    window.getActiveSupabaseClient = getActiveSupabaseClient;
    window.isSnAlreadyInSystem = isSnAlreadyInSystem;
    window.getSelectedInboundFormContext = getSelectedInboundFormContext;
    window.enqueueScanInput = enqueueScanInput;
    window.processSingleFastScanItem = processSingleFastScanItem;
    window.flushPersistentDbSyncQueue = flushPersistentDbSyncQueue;
    window.retryFailedInboundItemsNow = retryFailedInboundItemsNow;
    window.updateInboundNetworkSyncHUD = updateInboundNetworkSyncHUD;
    window.initInboundSyncEngine = initInboundSyncEngine;
    window.exportPendingSyncQueueJson = exportPendingSyncQueueJson;
    window.clearStuckSyncQueueWithConfirm = clearStuckSyncQueueWithConfirm;
}