// =========================================================================
// --- MODULE 3.7: INBOUND MAIN CONTROLLER & GLOBAL EXPORTS ---
// --- Universal Scanner Gun Listener, Event Bindings & Window Registry ---
// =========================================================================

// 🔫 ตัวจัดการปืนสแกนบาร์โค้ดทุกประเภท (Enter, Tab, Paste, และ Rapid Burst Keystroke)
function attachUniversalScannerGunListener(snInput) {
    if (!snInput || snInput.dataset.universalScannerBound === 'true') return;
    snInput.dataset.universalScannerBound = 'true';

    let lastKeyTime = 0;
    let burstKeyCount = 0;
    let burstAutoSubmitTimer = null;

    snInput.addEventListener('keydown', function (e) {
        // ปลดล็อกเสียงบนเบราว์เซอร์ตั้งแต่การกดปุ่มแรก
        getSharedWmsAudioContext();

        if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Tab') {
            e.preventDefault();
            if (burstAutoSubmitTimer) {
                clearTimeout(burstAutoSubmitTimer);
                burstAutoSubmitTimer = null;
            }
            burstKeyCount = 0;
            handleInboundSubmit(e);
            return;
        }

        const now = Date.now();
        if (e.key && e.key.length === 1) {
            if (now - lastKeyTime < 45) {
                burstKeyCount++;
            } else {
                burstKeyCount = 1;
            }
            lastKeyTime = now;
        }
    });

    snInput.addEventListener('input', function () {
        if (burstAutoSubmitTimer) {
            clearTimeout(burstAutoSubmitTimer);
            burstAutoSubmitTimer = null;
        }
        // หากตรวจพบการยิงรหัสความเร็วสูงจากปืนสแกน (4 ตัวขึ้นไปติดกัน <45ms) ที่ไม่ได้ส่ง Enter ต่อท้าย ให้บันทึกอัตโนมัติทันที
        if (burstKeyCount >= 4 && snInput.value.trim().length >= 4) {
            burstAutoSubmitTimer = setTimeout(() => {
                burstKeyCount = 0;
                if (snInput.value.trim().length >= 4) {
                    handleInboundSubmit();
                }
            }, 85);
        }
    });

    snInput.addEventListener('paste', function () {
        setTimeout(() => {
            if (snInput.value && snInput.value.trim().length > 0) {
                handleInboundSubmit();
            }
        }, 15);
    });

    snInput.addEventListener('blur', () => setTimeout(() => ensureSnInputFocus(false), 60));
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

    // แทรกแถบสุ่ม S/N จำนวนมากด้านใต้ช่องหมายเลขซีเรียลและเลขมิเตอร์
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
        'stockUpdated', 'outboundCompleted'
    ];

    realtimeEvents.forEach(evtName => {
        document.addEventListener(evtName, async function (e) {
            if (e && e.detail) {
                const detail = e.detail;
                if (detail.action === 'SYNC_COMPLETE') return;
                const targetSn = detail.sn || detail.serialNumber || detail.SN;
                const targetId = detail.id;
                const targetLoc = detail.location || detail.loc;

                const statusUpper = String(detail.status || detail.action || '').toUpperCase();
                const isRemoval = (evtName.toLowerCase().includes('delete') && !statusUpper.includes('REQUEST')) ||
                                  evtName.toLowerCase().includes('dispatch') ||
                                  evtName.toLowerCase().includes('outbound') ||
                                  (statusUpper.includes('DELETE') && !statusUpper.includes('REQUEST') && !statusUpper.includes('PENDING')) ||
                                  statusUpper.includes('OUT') ||
                                  statusUpper.includes('DISPATCH') ||
                                  statusUpper.includes('ISSUE') ||
                                  detail.is_deleted;

                if (isRemoval) {
                    purgeDispatchedOrDeletedItemFromMemory(targetSn, targetId, targetLoc);
                }
            }
            await autoRefreshInboundDatabaseAndLocations();
        }, true);
    });

    window.addEventListener('storage', async function (e) {
        if (e.key === 'WMS_AISLE_CONFIGS' || e.key === 'WMS_INVENTORY_DATA' || e.key === 'WMS_LAST_MUTATION' || e.key === 'WMS_MASTER_AISLES' || e.key === 'WMS_DELETED_ITEM' || e.key === 'WMS_DISPATCHED_ITEM') {
            if ((e.key === 'WMS_DELETED_ITEM' || e.key === 'WMS_DISPATCHED_ITEM') && e.newValue) {
                try {
                    const itemObj = JSON.parse(e.newValue);
                    purgeDispatchedOrDeletedItemFromMemory(itemObj.sn, itemObj.id, itemObj.location);
                } catch (err) {}
            }
            await autoRefreshInboundDatabaseAndLocations();
        }
    });

    initMasterProductsRealtime();
    initWarehouseItemsRealtime();
    initCrossTabBroadcastListener();
    ensureSnInputFocus();
}

if (typeof window !== 'undefined') {
    window.recentInboundList = recentInboundList;
    window.ensureSnInputFocus = ensureSnInputFocus;
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
    window.purgeDispatchedOrDeletedItemFromMemory = purgeDispatchedOrDeletedItemFromMemory;
    window.purgeDeletedSnFromMemory = purgeDeletedSnFromMemory;
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