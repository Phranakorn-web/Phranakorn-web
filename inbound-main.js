// =========================================================================
// --- MODULE 3.7: INBOUND MAIN CONTROLLER & GLOBAL EXPORTS ---
// --- Universal Scanner Gun Listener, Event Bindings & Window Registry ---
// =========================================================================

// 🔫 ตัวจัดการปืนสแกนบาร์โค้ดทุกประเภท (Enter, NumpadEnter, Tab, Paste, IME Composition และ Rapid Burst Keystroke)
// 🛡️ ป้องกัน SN ถูกตัดครึ่งหนึ่ง 100% บน Windows, macOS, iOS และ Android
function attachUniversalScannerGunListener(snInput) {
    if (!snInput || snInput.dataset.universalScannerBound === 'true') return;
    snInput.dataset.universalScannerBound = 'true';

    let lastKeyTime = 0;
    let burstKeyCount = 0;
    let burstAutoSubmitTimer = null;
    let isComposingIme = false;
    let lastSubmittedRawSnapshot = '';
    let lastSubmittedTimestamp = 0;

    // ระยะเวลารอเมื่อหยุดรับตัวอักษร (สำหรับปืนสแกนที่ไม่ได้ตั้งค่าส่ง Enter ต่อท้าย)
    // ตั้งไว้ที่ 160ms เพื่อรองรับปืนไร้สาย 2.4GHz / Bluetooth / มือถือ ไม่ให้ตัด SN กลางคัน
    const SCANNER_IDLE_COMMIT_MS = 160;
    const INTER_KEY_MAX_GAP_MS = 110;

    const cancelBurstTimer = () => {
        if (burstAutoSubmitTimer) {
            clearTimeout(burstAutoSubmitTimer);
            burstAutoSubmitTimer = null;
        }
    };

    const commitScannerBufferSafely = (evt = null) => {
        cancelBurstTimer();
        const currentRaw = (snInput.value || '').trim();
        if (!currentRaw) {
            burstKeyCount = 0;
            return;
        }

        // ป้องกันการยิง Event ซ้ำซ้อนภายใน 35ms (เช่น keydown Enter ตามด้วย input/keyup ในบางเบราว์เซอร์)
        const now = Date.now();
        if (currentRaw === lastSubmittedRawSnapshot && (now - lastSubmittedTimestamp) < 35) {
            return;
        }

        // ปลดล็อก fastScanLock อัตโนมัติหากไม่มีคิวทำงานค้างอยู่ (ป้องกันยิง S/N ใหม่ไม่ได้หลังสลับหน้า)
        if (typeof fastScanLock !== 'undefined' && fastScanLock &&
            typeof isProcessingScanQueue !== 'undefined' && !isProcessingScanQueue &&
            Array.isArray(scanProcessingQueue) && scanProcessingQueue.length === 0) {
            fastScanLock = false;
        }

        // ล้าง Tombstone ของ S/N นี้เมื่อผู้ใช้ตั้งใจยิงรับเข้าใหม่
        if (typeof clearDeletedSnTombstone === 'function') {
            clearDeletedSnTombstone(currentRaw);
        }

        lastSubmittedRawSnapshot = currentRaw;
        lastSubmittedTimestamp = now;
        burstKeyCount = 0;
        isComposingIme = false;
        handleInboundSubmit(evt);
    };

    const scheduleIdleCommitIfBurst = () => {
        cancelBurstTimer();
        if (!isComposingIme && burstKeyCount >= 4 && (snInput.value || '').trim().length >= 4) {
            burstAutoSubmitTimer = setTimeout(() => {
                // ตรวจสอบอีกครั้งว่าไม่มีตัวอักษรใหม่กำลังวิ่งเข้ามาใน 110ms ล่าสุด
                if ((Date.now() - lastKeyTime) >= INTER_KEY_MAX_GAP_MS) {
                    commitScannerBufferSafely();
                } else {
                    scheduleIdleCommitIfBurst();
                }
            }, SCANNER_IDLE_COMMIT_MS);
        }
    };

    snInput.addEventListener('compositionstart', () => {
        isComposingIme = true;
        cancelBurstTimer();
    });

    snInput.addEventListener('compositionend', () => {
        isComposingIme = false;
        lastKeyTime = Date.now();
        scheduleIdleCommitIfBurst();
    });

    snInput.addEventListener('keydown', function (e) {
        // ปลดล็อกเสียงบนเบราว์เซอร์ตั้งแต่การกดปุ่มแรก
        getSharedWmsAudioContext();

        if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            // ให้เวลา 0ms ทันทีเมื่อมีอักขระครบแล้ว แต่หากยังมีอักขระค้างใน queue ของ event loop ให้ microtask เก็บครบก่อน
            Promise.resolve().then(() => {
                commitScannerBufferSafely(e);
            });
            return;
        }

        const now = Date.now();
        if (e.key && (e.key.length === 1 || e.key === 'Process' || e.key === 'Unidentified')) {
            if (now - lastKeyTime <= INTER_KEY_MAX_GAP_MS) {
                burstKeyCount++;
            } else {
                burstKeyCount = 1;
            }
            lastKeyTime = now;
        }
    });

    snInput.addEventListener('input', function () {
        lastKeyTime = Date.now();
        // รองรับกรณีมือถือ Android / iOS บางรุ่นที่ไม่ส่ง keydown ปกติแต่ยิง input รวดเดียว
        if ((snInput.value || '').includes('\n') || (snInput.value || '').includes('\r')) {
            commitScannerBufferSafely();
            return;
        }
        scheduleIdleCommitIfBurst();
    });

    snInput.addEventListener('paste', function () {
        cancelBurstTimer();
        burstKeyCount = 0;
        setTimeout(() => {
            if (snInput.value && snInput.value.trim().length > 0) {
                commitScannerBufferSafely();
            }
        }, 15);
    });

    snInput.addEventListener('blur', () => {
        // หากมีค่าค้างจากการสแกนที่เพิ่งหลุดโฟกัส ให้เก็บเข้าคิวก่อนคืนโฟกัส
        if (burstKeyCount >= 4 && (snInput.value || '').trim().length >= 4) {
            commitScannerBufferSafely();
        }
        setTimeout(() => ensureSnInputFocus(false), 60);
    });
}

// 🔄 ซิงก์สถานะหน้ารับสินค้าเข้าคลังทันทีหลังกลับจากหน้าเช็กสต็อก หรือหลังมีการลบ S/N
async function syncInboundAfterStockDeletion(forceReloadDb = true) {
    if (typeof fastScanLock !== 'undefined' &&
        (typeof isProcessingScanQueue === 'undefined' || !isProcessingScanQueue) &&
        (!Array.isArray(scanProcessingQueue) || scanProcessingQueue.length === 0)) {
        fastScanLock = false;
    }

    if (typeof reconcileRecentInboundWithInventory === 'function') {
        reconcileRecentInboundWithInventory();
    }

    if (forceReloadDb && typeof loadRecentInboundFeedFromDB === 'function') {
        await loadRecentInboundFeedFromDB();
    }

    if (typeof autoRefreshInboundDatabaseAndLocations === 'function') {
        await autoRefreshInboundDatabaseAndLocations();
    }

    ensureSnInputFocus(true);
}

// 📡 ดักจับการลบ/แก้ไขข้อมูล warehouse_items แบบ Real-time โดยตรงจาก Supabase & BroadcastChannel
function initDirectWarehouseDeletionRealtimeSync() {
    if (typeof window !== 'undefined') {
        if (window.__WMS_DIRECT_INBOUND_DELETE_SYNC_BOUND__) return;
        window.__WMS_DIRECT_INBOUND_DELETE_SYNC_BOUND__ = true;
    }

    // 1. Supabase Realtime สำหรับการลบ (DELETE) หรืออัปเดตสถานะเป็นลบ/เบิกออก (UPDATE)
    if (typeof _supabase !== 'undefined' && _supabase && typeof _supabase.channel === 'function') {
        try {
            const deletedStatuses = new Set(['DELETED', 'OUT', 'DISPATCHED', 'CANCELLED', 'VOID', 'REMOVED']);
            _supabase
                .channel('wms_inbound_realtime_deletions_v1')
                .on(
                    'postgres_changes',
                    { event: 'DELETE', schema: 'public', table: 'warehouse_items' },
                    async (payload) => {
                        const oldRow = (payload && payload.old) ? payload.old : {};
                        purgeDispatchedOrDeletedItemFromMemory(oldRow.sn, oldRow.id, oldRow.location);
                        await loadRecentInboundFeedFromDB();
                    }
                )
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'warehouse_items' },
                    async (payload) => {
                        const newRow = (payload && payload.new) ? payload.new : {};
                        const oldRow = (payload && payload.old) ? payload.old : {};
                        const stUpper = String(newRow.status || '').trim().toUpperCase();
                        if (newRow.is_deleted === true || deletedStatuses.has(stUpper)) {
                            purgeDispatchedOrDeletedItemFromMemory(
                                newRow.sn || oldRow.sn,
                                newRow.id || oldRow.id,
                                newRow.location || oldRow.location
                            );
                            await loadRecentInboundFeedFromDB();
                        }
                    }
                )
                .subscribe();
        } catch (err) {
            console.warn('Direct Supabase deletion sync warning:', err);
        }
    }

    // 2. BroadcastChannel สำหรับการซิงก์ระหว่างแท็บหรือหน้าต่างย่อย
    if (typeof BroadcastChannel !== 'undefined') {
        const channelNames = ['wms_realtime_sync_channel', 'wms_inventory_sync', 'wms_stock_channel'];
        channelNames.forEach(chName => {
            try {
                const bc = new BroadcastChannel(chName);
                bc.onmessage = async (event) => {
                    const msg = event && event.data ? event.data : null;
                    if (!msg) return;
                    const actUpper = String(msg.action || msg.type || msg.status || '').toUpperCase();
                    const isDeleteMsg = (actUpper.includes('DELETE') && !actUpper.includes('REQUEST') && !actUpper.includes('PENDING')) ||
                                        actUpper.includes('DISPATCH') ||
                                        actUpper.includes('OUTBOUND') ||
                                        actUpper.includes('REMOVE');
                    if (isDeleteMsg) {
                        purgeDispatchedOrDeletedItemFromMemory(
                            msg.sn || msg.sns || msg.items || msg.item?.sn,
                            msg.id || msg.ids || msg.item?.id,
                            msg.location || msg.loc || msg.item?.location
                        );
                        await loadRecentInboundFeedFromDB();
                    } else if (actUpper.includes('SYNC') || actUpper.includes('REFRESH') || actUpper.includes('UPDATE')) {
                        await syncInboundAfterStockDeletion(true);
                    }
                };
            } catch (e) {}
        });
    }
}

function initInboundEventListeners() {
    injectModernScanUIStyles();
    initFrontendSecurityGuards();
    checkAndHideLoginOverlay();

    // โหลดคิวที่ค้างจากการสแกนออฟไลน์ก่อนหน้า (ถ้ามี)
    loadPersistentDbQueue();
    loadRecentInboundFeedFromCache();

    // 🟢 บังคับค่าเริ่มต้นของ แถวจัดเก็บ ให้เว้นว่าง / "-- โปรดเลือกแถวจัดเก็บ --" เสมอเมื่อเปิดหน้าเว็บ
    userHasSelectedAisle = false;
    populateInboundAisleDropdown(false);
    populateInboundLocationDropdownsStrict('', null, false);
    installAisleDropdownBlankGuard();

    // แทรกแถบสถานะการสแกนทันทีตรงใต้ช่อง S/N และแถบสุ่ม S/N จำนวนมาก
    ensureInstantScanBoxIndicator();
    injectBatchSnGeneratorBar();

    ensureInboundNetworkSyncHUD();
    updateInboundNetworkSyncHUD();
    initNetworkStatusListeners();

    loadRecentInboundFeedFromDB();

    // หากมีคิวค้างอยู่และออนไลน์ ให้ซิงค์เข้าฐานข้อมูลตามลำดับทันที
    if (navigator.onLine && persistentDbSyncQueue.length > 0) {
        flushPersistentDbSyncQueue();
    }

    document.addEventListener('biometricLoginSuccess', function (e) {
        const userName = (e && e.detail && e.detail.userName) ? e.detail.userName : getCurrentUserFullName();
        showBiometricSuccessToast(userName);
    });

    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        attachUniversalScannerGunListener(snInput);
    }

    // เชื่อมปุ่มและไอคอนกล้องสแกนบาร์โค้ดทุกจุดให้กดแล้วเด้งขึ้นมาทันที
    const cameraTriggerBtn = document.getElementById('btnOpenCameraController') || document.getElementById('cameraScanBtn');
    if (cameraTriggerBtn) {
        cameraTriggerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openCameraScanner();
        });
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#btnOpenCameraController, #cameraScanBtn, [data-action="open-camera-scanner"], .camera-scan-trigger');
        if (btn && btn !== cameraTriggerBtn) {
            e.preventDefault();
            openCameraScanner();
        }

        // เมื่อผู้ใช้กดปุ่มเมนูกลับมาที่หน้ารับสินค้าเข้าคลัง ให้รีเฟรชประวัติรับเข้าและคืนโฟกัสช่องยิง S/N ทันที
        const inboundNavBtn = e.target.closest('[data-tab="inbound"], [data-target="inbound"], [data-section="inbound"], [data-page="inbound"], a[href="#inbound"], #nav-inbound, #menu-inbound');
        if (inboundNavBtn) {
            setTimeout(() => {
                syncInboundAfterStockDeletion(true);
            }, 90);
        }
    });

    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (aisleSelect) {
        aisleSelect.addEventListener('change', function (e) {
            onInboundAisleChange(e.target.value);
        });
    }

    const baySelect = document.getElementById('inboundBaySelect');
    if (baySelect) {
        baySelect.addEventListener('change', function (e) {
            onInboundBayChange(e.target.value);
        });
    }

    const shelfSelect = document.getElementById('inboundShelfSelect');
    if (shelfSelect) {
        shelfSelect.addEventListener('change', function (e) {
            onInboundShelfChange(e.target.value);
        });
    }

    const slotSelect = document.getElementById('inboundSlotSelect');
    if (slotSelect) {
        slotSelect.addEventListener('change', function (e) {
            onInboundSlotChange(e.target.value);
        });
    }

    const realtimeEvents = [
        'inventoryUpdated', 'inventoryDeleted', 'inventoryDispatched',
        'inventoryDataChanged', 'wmsRealtimeSync', 'warehouseConfigUpdated',
        'locationLayoutChanged', 'itemDeleted', 'itemDispatched',
        'stockUpdated', 'outboundCompleted', 'stockItemDeleted', 'bulkInventoryDeleted'
    ];

    const handleRealtimeInventoryEvent = async function (e) {
        const evtName = (e && e.type) ? e.type : '';
        let shouldReloadRecentFeed = false;

        if (e && e.detail) {
            const detail = e.detail;
            // ข้ามการรีโหลดฐานข้อมูลซ้ำซ้อนสำหรับการสแกนแบบ 0ms Optimistic ในเครื่องเดียวกัน
            if (detail._localOptimistic || detail.action === 'SYNC_COMPLETE') return;

            const targetSn = detail.sn ||
                             detail.serialNumber ||
                             detail.SN ||
                             detail.sns ||
                             detail.serialNumbers ||
                             (detail.item && detail.item.sn) ||
                             (detail.record && detail.record.sn) ||
                             (detail.old && detail.old.sn) ||
                             (detail.deleted && detail.deleted.sn) ||
                             detail.deletedItems ||
                             detail.items;

            const targetId = detail.id ||
                             detail.ids ||
                             (detail.item && detail.item.id) ||
                             (detail.record && detail.record.id) ||
                             (detail.old && detail.old.id);

            const targetLoc = detail.location ||
                              detail.loc ||
                              (detail.item && detail.item.location) ||
                              (detail.old && detail.old.location);

            const statusUpper = String(detail.status || detail.action || detail.type || '').toUpperCase();
            const isRemoval = (evtName.toLowerCase().includes('delete') && !statusUpper.includes('REQUEST')) ||
                              evtName.toLowerCase().includes('dispatch') ||
                              evtName.toLowerCase().includes('outbound') ||
                              (statusUpper.includes('DELETE') && !statusUpper.includes('REQUEST') && !statusUpper.includes('PENDING')) ||
                              statusUpper.includes('OUT') ||
                              statusUpper.includes('DISPATCH') ||
                              statusUpper.includes('ISSUE') ||
                              statusUpper.includes('REMOVE') ||
                              detail.is_deleted === true;

            if (isRemoval) {
                shouldReloadRecentFeed = true;
                purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId, targetLoc);
            }
        }

        // เทียบรายการประวัติรับเข้าล่าสุดกับสต็อกปัจจุบันเสมอ เผื่อกรณี Event ลบไม่ได้แนบ S/N มาใน detail
        if (typeof reconcileRecentInboundWithInventory === 'function') {
            const reconciled = reconcileRecentInboundWithInventory();
            if (reconciled) shouldReloadRecentFeed = true;
        }

        if (shouldReloadRecentFeed || evtName.toLowerCase().includes('delete') || evtName.toLowerCase().includes('stock') || evtName.toLowerCase().includes('inventory')) {
            await loadRecentInboundFeedFromDB();
        }
        await autoRefreshInboundDatabaseAndLocations();
    };

    realtimeEvents.forEach(evtName => {
        document.addEventListener(evtName, handleRealtimeInventoryEvent, true);
        window.addEventListener(evtName, handleRealtimeInventoryEvent, true);
    });

    window.addEventListener('storage', async function (e) {
        if (e.key === 'WMS_AISLE_CONFIGS' ||
            e.key === 'WMS_INVENTORY_DATA' ||
            e.key === 'WMS_LAST_MUTATION' ||
            e.key === 'WMS_MASTER_AISLES' ||
            e.key === 'WMS_DELETED_ITEM' ||
            e.key === 'WMS_DISPATCHED_ITEM' ||
            e.key === 'WMS_RECENT_INBOUND_CACHE' ||
            e.key === 'WMS_RECENTLY_DELETED_SNS_V1') {
            if ((e.key === 'WMS_DELETED_ITEM' || e.key === 'WMS_DISPATCHED_ITEM') && e.newValue) {
                try {
                    const itemObj = JSON.parse(e.newValue);
                    purgeDispatchedOrDeletedItemFromMemory(
                        itemObj.sn || itemObj.sns || itemObj.items,
                        itemObj.id || itemObj.ids,
                        itemObj.location
                    );
                } catch (err) {}
            } else if (e.key === 'WMS_RECENT_INBOUND_CACHE') {
                loadRecentInboundFeedFromCache();
            } else if (e.key === 'WMS_RECENTLY_DELETED_SNS_V1') {
                if (typeof reconcileRecentInboundWithInventory === 'function') {
                    reconcileRecentInboundWithInventory();
                }
            }
            await loadRecentInboundFeedFromDB();
            await autoRefreshInboundDatabaseAndLocations();
        }
    });

    // ซิงก์ทันทีเมื่อสลับกลับมาที่แท็บ/หน้าต่าง หรือ Hash เปลี่ยนกลับมาที่หน้ารับสินค้า
    window.addEventListener('hashchange', () => {
        const h = (window.location.hash || '').toLowerCase();
        if (!h || h.includes('inbound')) {
            syncInboundAfterStockDeletion(true);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            syncInboundAfterStockDeletion(true);
        }
    });

    initMasterProductsRealtime();
    initWarehouseItemsRealtime();
    initCrossTabBroadcastListener();
    initDirectWarehouseDeletionRealtimeSync();
    ensureSnInputFocus();
}

if (typeof window !== 'undefined') {
    window.recentInboundList = recentInboundList;
    window.ensureSnInputFocus = ensureSnInputFocus;
    window.ensureInstantScanBoxIndicator = ensureInstantScanBoxIndicator;
    window.renderInstantScanBoxStatus = renderInstantScanBoxStatus;
    window.getCurrentUserFullName = getCurrentUserFullName;
    window.getAisleConfig = getAisleConfig;
    window.parseLocComponentsInternal = parseLocComponentsInternal;
    window.getNormalizedLocKey = getNormalizedLocKey;
    window.normalizeLocationStandard = normalizeLocationStandard;
    window.formatLocationSpaced = formatLocationSpaced;
    window.formatLocationCode = formatLocationCode;
    window.formatLocationBadgeHTML = formatLocationBadgeHTML;
    window.getOccupyingSnDetails = getOccupyingSnDetails;
    window.getAllOccupiedLocationsSet = getAllOccupiedLocationsSet;
    window.invalidateOccupiedLocationsCache = invalidateOccupiedLocationsCache;
    window.recordDeletedSnTombstone = recordDeletedSnTombstone;
    window.clearDeletedSnTombstone = clearDeletedSnTombstone;
    window.isSnRecentlyDeletedTombstone = isSnRecentlyDeletedTombstone;
    window.purgeDispatchedOrDeletedItemFromMemory = purgeDispatchedOrDeletedItemFromMemory;
    window.purgeDeletedSnFromMemory = purgeDeletedSnFromMemory;
    window.reconcileRecentInboundWithInventory = reconcileRecentInboundWithInventory;
    window.syncInboundAfterStockDeletion = syncInboundAfterStockDeletion;
    window.initDirectWarehouseDeletionRealtimeSync = initDirectWarehouseDeletionRealtimeSync;
    window.deleteInboundItem = deleteInboundItem;
    window.navigateToStockCheckAndConfirmDelete = navigateToStockCheckAndConfirmDelete;
    window.openFallbackStockDeleteApprovalModal = openFallbackStockDeleteApprovalModal;
    window.closeFallbackStockDeleteApprovalModal = closeFallbackStockDeleteApprovalModal;
    window.submitFallbackStockDeleteApproval = submitFallbackStockDeleteApproval;
    window.calculateNextAvailableSlotInShelf = calculateNextAvailableSlotInShelf;
    window.calculateNextAvailableSlotInBayStrictAisle = calculateNextAvailableSlotInBayStrictAisle;
    window.calculateAisleCapacityAndNextSlot = calculateAisleCapacityAndNextSlot;
    window.populateInboundSlotDropdown = populateInboundSlotDropdown;
    window.populateInboundAisleDropdown = populateInboundAisleDropdown;
    window.populateInboundLocationDropdownsStrict = populateInboundLocationDropdownsStrict;
    window.onInboundAisleChange = onInboundAisleChange;
    window.onInboundBayChange = onInboundBayChange;
    window.onInboundShelfChange = onInboundShelfChange;
    window.onInboundSlotChange = onInboundSlotChange;
    window.updateInboundLocationPreviewFromDropdowns = updateInboundLocationPreviewFromDropdowns;
    window.getSelectedLocationFromDropdowns = getSelectedLocationFromDropdowns;
    window.renderAisleSlotBreakdownUI = renderAisleSlotBreakdownUI;
    window.autoSelectNextAvailableSlotAfterInbound = autoSelectNextAvailableSlotAfterInbound;
    window.forceSyncAndSelectAvailableLocation = forceSyncAndSelectAvailableLocation;
    window.triggerAutoFindNextSlot = triggerAutoFindNextSlot;
    window.handleInboundSubmit = handleInboundSubmit;
    window.processScanProcessingQueue = processScanProcessingQueue;
    window.flushPersistentDbSyncQueue = flushPersistentDbSyncQueue;
    window.updateInboundNetworkSyncHUD = updateInboundNetworkSyncHUD;
    window.loadRecentInboundFeedFromCache = loadRecentInboundFeedFromCache;
    window.saveRecentInboundFeedToCache = saveRecentInboundFeedToCache;
    window.loadRecentInboundFeedFromDB = loadRecentInboundFeedFromDB;
    window.renderLiveInboundFeed = renderLiveInboundFeed;
    window.clearRecentInboundFeedView = clearRecentInboundFeedView;
    window.copyToClipboard = copyToClipboard;
    window.onSkuSearchInput = onSkuSearchInput;
    window.selectSkuSuggestion = selectSkuSuggestion;
    window.updateMasterDbCountBadge = updateMasterDbCountBadge;
    window.checkAndHideLoginOverlay = checkAndHideLoginOverlay;
    window.showToast = showToast;
    window.showToastPopup = showToastPopup;
    window.showBiometricSuccessToast = showBiometricSuccessToast;
    window.toggleMobileSidebar = toggleMobileSidebar;
    window.initMasterProductsRealtime = initMasterProductsRealtime;
    window.initWarehouseItemsRealtime = initWarehouseItemsRealtime;
    window.initCrossTabBroadcastListener = initCrossTabBroadcastListener;
    window.initInboundEventListeners = initInboundEventListeners;
    window.autoRefreshInboundDatabaseAndLocations = autoRefreshInboundDatabaseAndLocations;
    window.onRecentFeedSearch = onRecentFeedSearch;
    window.triggerReprintStickerFromFeed = triggerReprintStickerFromFeed;
    window.playAudioFeedback = playAudioFeedback;
    window.openCameraScanner = openCameraScanner;
    window.closeCameraScanner = closeCameraScanner;
    window.triggerMobileCameraScan = triggerMobileCameraScan;
    window.toggleCameraScanMode = toggleCameraScanMode;
    window.generateAutoSN = generateAutoSN;
    window.injectBatchSnGeneratorBar = injectBatchSnGeneratorBar;
    window.startBatchRandomInbound = startBatchRandomInbound;
    window.generateUniqueBatchSnList = generateUniqueBatchSnList;
    window.buildBatchAvailableLocationsQueue = buildBatchAvailableLocationsQueue;
    window.initRandomSnModal = initRandomSnModal;
    window.openRandomSnModal = openRandomSnModal;
    window.closeRandomSnModal = closeRandomSnModal;
    window.selectRandomQtyPreset = selectRandomQtyPreset;
    window.confirmBatchRandomInboundProcess = confirmBatchRandomInboundProcess;
    window.startCameraWithCurrentFacingMode = startCameraWithCurrentFacingMode;
    window.switchCameraFacingMode = switchCameraFacingMode;
    window.toggleCameraTorch = toggleCameraTorch;
    window.currentCameraFacingMode = currentCameraFacingMode;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initInboundEventListeners();
    });
} else {
    initInboundEventListeners();
}