// =========================================================================
// --- MODULE 3.5: HIGH-SPEED SCAN QUEUE, OFFLINE-FIRST FIFO & REALTIME ---
// --- 0ms Scan Queue, LocalStorage Persistent FIFO Sync & Supabase Realtime ---
// =========================================================================

// ⚡ HIGH-SPEED SCAN ENGINE
function triggerScanInputFlash(status = 'success') {
    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        snInput.classList.remove('scan-flash-success', 'scan-flash-error');
        void snInput.offsetWidth;
        snInput.classList.add(status === 'success' ? 'scan-flash-success' : 'scan-flash-error');

        setTimeout(() => {
            snInput.classList.remove('scan-flash-success', 'scan-flash-error');
        }, 280);
    }

    playAudioFeedback(status);
}

function recordScanSpeedMetrics() {
    scanSpeedCounter++;
    if (!scanSpeedTimer) {
        scanSpeedTimer = setTimeout(() => {
            const badge = document.getElementById('fastScanSpeedMeterBadge');
            if (badge) {
                badge.textContent = `⚡ ${scanSpeedCounter} ชิ้น/วินาที`;
                badge.style.display = 'inline-block';
            }
            scanSpeedCounter = 0;
            scanSpeedTimer = null;
        }, 1000);
    }
}

// =========================================================================
// 🌐 OFFLINE-FIRST PERSISTENT FIFO QUEUE & NETWORK SYNC HUD ENGINE
// =========================================================================

function loadPersistentDbQueue() {
    try {
        const raw = localStorage.getItem(PERSISTENT_DB_QUEUE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                persistentDbSyncQueue = parsed;
                // คืนค่าล็อก SN และพิกัดที่รอส่งขึ้น DB เพื่อป้องกันซ้ำแม้รีเฟรชหน้าเว็บขณะออฟไลน์
                persistentDbSyncQueue.forEach(entry => {
                    if (entry && entry.payload) {
                        if (entry.payload.sn) pendingFastSnSet.add(String(entry.payload.sn).trim().toUpperCase());
                        if (entry.payload.location) addOccupiedLocToSet(pendingFastLocationSet, entry.payload.location);
                    }
                });
            }
        }
    } catch (e) {
        persistentDbSyncQueue = [];
    }
}

function savePersistentDbQueue() {
    try {
        localStorage.setItem(PERSISTENT_DB_QUEUE_KEY, JSON.stringify(persistentDbSyncQueue));
    } catch (e) {}
}

function enqueuePersistentDbSync(rawPayload, feedItem) {
    dbSyncSequenceCounter++;
    const txId = `tx_${dbSyncSequenceCounter}_${Math.random().toString(36).slice(2, 7)}`;
    if (feedItem) {
        feedItem._txId = txId;
    }
    persistentDbSyncQueue.push({
        txId,
        seq: dbSyncSequenceCounter,
        payload: rawPayload,
        enqueuedAt: new Date().toISOString(),
        retries: 0
    });
    savePersistentDbQueue();
    updateInboundNetworkSyncHUD();
}

function ensureInboundNetworkSyncHUD() {
    let hud = document.getElementById('inboundNetworkSyncHud');
    if (hud) return hud;

    const feedContainer = document.getElementById('liveInboundFeedContainer');
    const snInput = document.getElementById('inboundSn');
    const anchorParent = (feedContainer && feedContainer.parentElement) || (snInput && snInput.closest('form, .card, .section-card'));

    if (!anchorParent) return null;

    hud = document.createElement('div');
    hud.id = 'inboundNetworkSyncHud';
    hud.className = 'wms-network-sync-hud';

    if (feedContainer && feedContainer.parentElement === anchorParent) {
        anchorParent.insertBefore(hud, feedContainer);
    } else {
        anchorParent.appendChild(hud);
    }
    return hud;
}

function updateInboundNetworkSyncHUD() {
    const hud = ensureInboundNetworkSyncHUD();
    if (!hud) return;

    const isOnline = navigator.onLine;
    const pendingCount = persistentDbSyncQueue.length;

    if (!isOnline) {
        hud.className = 'wms-network-sync-hud offline';
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:9px;">
                    <span class="net-dot offline"></span>
                    <div>
                        <div style="font-weight:800; font-size:0.83rem; color:#9a3412;">🟠 โหมดออฟไลน์ (ไม่มีสัญญาณอินเทอร์เน็ต)</div>
                        <div style="font-size:0.75rem; color:#c2410c;">สแกนรับสินค้าต่อเนื่องได้ตามปกติ 100% ระบบจะจัดคิวส่งทันทีที่เน็ตกลับมา</div>
                    </div>
                </div>
                <div style="background:#ffedd5; border:1px solid #fdba74; color:#9a3412; padding:4px 12px; border-radius:99px; font-size:0.78rem; font-weight:800;">
                    <i class="fa-solid fa-layer-group"></i> คิวรอส่ง: <span class="mono">${pendingCount.toLocaleString()}</span> รายการ
                </div>
            </div>
        `;
        return;
    }

    if (pendingCount > 0 || isFlushingDbQueue) {
        hud.className = 'wms-network-sync-hud syncing';
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:9px;">
                    <i class="fa-solid fa-arrows-rotate fa-spin" style="color:#0284c7; font-size:1rem;"></i>
                    <div>
                        <div style="font-weight:800; font-size:0.83rem; color:#075985;">🔄 กำลังจัดลำดับคิวส่งเข้าฐานข้อมูลเรียลไทม์...</div>
                        <div style="font-size:0.75rem; color:#0369a1;">เรียงลำดับคิว FIFO อัตโนมัติ (เหลืออีก ${pendingCount.toLocaleString()} รายการ)</div>
                    </div>
                </div>
                <button type="button" onclick="flushPersistentDbSyncQueue(true)" style="background:#0284c7; color:#fff; border:none; padding:5px 12px; border-radius:99px; font-size:0.75rem; font-weight:700; cursor:pointer;">
                    ซิงค์ทันที
                </button>
            </div>
        `;
        return;
    }

    hud.className = 'wms-network-sync-hud online';
    hud.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="pulse-live-dot"></span>
                <span style="font-weight:700; font-size:0.8rem; color:#065f46;">ออนไลน์ • เชื่อมต่อฐานข้อมูลเรียลไทม์ 100%</span>
            </div>
            <span style="font-size:0.74rem; color:#047857; font-weight:600;">
                <i class="fa-solid fa-shield-check"></i> พร้อมรับสแกนต่อเนื่อง, สุ่มยกล็อต & โหมดออฟไลน์อัตโนมัติ
            </span>
        </div>
    `;
}

// 🚀 ส่งคิวที่ค้างอยู่ใน LocalStorage ขึ้น Supabase แบบเรียงลำดับ FIFO 100%
async function flushPersistentDbSyncQueue(manualTrigger = false) {
    updateInboundNetworkSyncHUD();

    if (isFlushingDbQueue || persistentDbSyncQueue.length === 0) return;

    if (!navigator.onLine) {
        if (manualTrigger) {
            showToast('🟠 ขณะนี้อยู่ในโหมดออฟไลน์ ระบบจะส่งคิวทันทีเมื่ออินเทอร์เน็ตกลับมา', true);
        }
        return;
    }

    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    isFlushingDbQueue = true;
    updateInboundNetworkSyncHUD();

    let totalSyncedInRun = 0;

    try {
        while (persistentDbSyncQueue.length > 0 && navigator.onLine) {
            // ดึงทีละชุดสูงสุด 50 รายการตามลำดับคิว FIFO เพื่อความรวดเร็วในการบันทึกยกล็อต
            const batchEntries = persistentDbSyncQueue.slice(0, 50);
            const activeUserFullName = getCurrentUserFullName() || 'เจ้าหน้าที่คลังสินค้า';

            const cleanBatch = batchEntries.map(entry => {
                let cleanData = typeof sanitizeForDb === 'function' ? sanitizeForDb({ ...entry.payload }) : { ...entry.payload };
                if (!cleanData.received_by) {
                    cleanData.received_by = activeUserFullName;
                }
                return cleanData;
            });

            // อัปเดตสถานะบนการ์ดเป็น SYNCING
            batchEntries.forEach(entry => {
                const feedMatch = recentInboundList.find(f => f && (f._txId === entry.txId || (f.sn && String(f.sn).toUpperCase() === String(entry.payload.sn).toUpperCase())));
                if (feedMatch && feedMatch.db_status !== 'SYNCED') {
                    feedMatch.db_status = 'SYNCING';
                    feedMatch.isOffline = false;
                }
            });
            scheduleDebouncedFeedRender();

            const { data, error } = await client.from('warehouse_items').insert(cleanBatch).select('*');

            if (!error) {
                // บันทึกสำเร็จทั้งชุด!
                batchEntries.forEach((entry, idx) => {
                    const insertedRow = Array.isArray(data) ? (data.find(d => d && String(d.sn).toUpperCase() === String(entry.payload.sn).toUpperCase()) || data[idx]) : null;
                    const feedMatch = recentInboundList.find(f => f && (f._txId === entry.txId || (f.sn && String(f.sn).toUpperCase() === String(entry.payload.sn).toUpperCase())));
                    if (feedMatch) {
                        if (insertedRow && insertedRow.id) feedMatch.id = insertedRow.id;
                        feedMatch.db_status = 'SYNCED';
                        feedMatch.isOffline = false;
                    }
                    if (insertedRow && typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                        const gIdx = globalInventoryData.findIndex(g => g && String(g.sn).toUpperCase() === String(entry.payload.sn).toUpperCase());
                        if (gIdx !== -1) {
                            globalInventoryData[gIdx] = { ...globalInventoryData[gIdx], ...insertedRow };
                        }
                    }
                });

                persistentDbSyncQueue.splice(0, batchEntries.length);
                savePersistentDbQueue();
                saveRecentInboundFeedToCache();
                totalSyncedInRun += batchEntries.length;
                updateInboundNetworkSyncHUD();
                scheduleDebouncedFeedRender();
            } else {
                // กรณีติด Error บางรายการในชุด (เช่น SN ซ้ำใน DB หรือ Network ขาดกะทันหัน) ให้แยกยิงทีละรายการในชุดนี้
                console.warn('Batch sync fallback to single-item FIFO:', error.message);
                let networkFailed = false;

                for (let i = 0; i < batchEntries.length; i++) {
                    if (!navigator.onLine) {
                        networkFailed = true;
                        break;
                    }
                    const singleEntry = batchEntries[i];
                    const singleClean = cleanBatch[i];

                    const singleRes = await client.from('warehouse_items').insert([singleClean]).select('*');
                    if (!singleRes.error) {
                        const insertedRow = singleRes.data && singleRes.data[0];
                        const feedMatch = recentInboundList.find(f => f && (f._txId === singleEntry.txId || (f.sn && String(f.sn).toUpperCase() === String(singleEntry.payload.sn).toUpperCase())));
                        if (feedMatch) {
                            if (insertedRow && insertedRow.id) feedMatch.id = insertedRow.id;
                            feedMatch.db_status = 'SYNCED';
                            feedMatch.isOffline = false;
                        }
                        persistentDbSyncQueue = persistentDbSyncQueue.filter(q => q.txId !== singleEntry.txId);
                        savePersistentDbQueue();
                        totalSyncedInRun++;
                    } else {
                        const errMsg = String(singleRes.error.message || '').toLowerCase();
                        const errCode = String(singleRes.error.code || '');
                        if (errCode === '23505' || errMsg.includes('duplicate') || errMsg.includes('unique')) {
                            // มีข้อมูลใน DB อยู่แล้ว -> ถือว่าซิงค์แล้วเพื่อไม่ให้ค้างคิว
                            const feedMatch = recentInboundList.find(f => f && (f._txId === singleEntry.txId || (f.sn && String(f.sn).toUpperCase() === String(singleEntry.payload.sn).toUpperCase())));
                            if (feedMatch) {
                                feedMatch.db_status = 'SYNCED';
                                feedMatch.isOffline = false;
                            }
                            persistentDbSyncQueue = persistentDbSyncQueue.filter(q => q.txId !== singleEntry.txId);
                            savePersistentDbQueue();
                        } else {
                            // เน็ตหลุดหรือเซิร์ฟเวอร์ไม่ตอบสนอง -> คืนสถานะเป็น PENDING รอเน็ตกลับมา
                            const feedMatch = recentInboundList.find(f => f && (f._txId === singleEntry.txId || (f.sn && String(f.sn).toUpperCase() === String(singleEntry.payload.sn).toUpperCase())));
                            if (feedMatch) {
                                feedMatch.db_status = 'PENDING';
                                feedMatch.isOffline = true;
                            }
                            networkFailed = true;
                            break;
                        }
                    }
                }

                saveRecentInboundFeedToCache();
                scheduleDebouncedFeedRender();
                updateInboundNetworkSyncHUD();

                if (networkFailed) break;
            }
        }
    } catch (err) {
        console.error('Flush DB queue exception:', err);
        persistentDbSyncQueue.forEach(entry => {
            const feedMatch = recentInboundList.find(f => f && (f._txId === entry.txId || (f.sn && String(f.sn).toUpperCase() === String(entry.payload.sn).toUpperCase())));
            if (feedMatch && feedMatch.db_status === 'SYNCING') {
                feedMatch.db_status = 'PENDING';
                feedMatch.isOffline = true;
            }
        });
        saveRecentInboundFeedToCache();
        scheduleDebouncedFeedRender();
    } finally {
        isFlushingDbQueue = false;
        invalidateOccupiedLocationsCache();
        updateInboundNetworkSyncHUD();
        updateMasterDbCountBadge();

        if (totalSyncedInRun > 0 && persistentDbSyncQueue.length === 0) {
            document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: { action: 'SYNC_COMPLETE', count: totalSyncedInRun } }));
            document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: { action: 'SYNC_COMPLETE', count: totalSyncedInRun } }));
        }
    }
}

function initNetworkStatusListeners() {
    window.addEventListener('online', () => {
        updateInboundNetworkSyncHUD();
        if (persistentDbSyncQueue.length > 0) {
            showToast(`🌐 อินเทอร์เน็ตกลับมาแล้ว! กำลังจัดลำดับคิวส่งเข้าคลัง ${persistentDbSyncQueue.length.toLocaleString()} รายการ...`, false, 3500);
            flushPersistentDbSyncQueue();
        } else {
            showToast('🟢 เชื่อมต่ออินเทอร์เน็ตเรียลไทม์เรียบร้อยแล้ว', false, 2200);
        }
    });

    window.addEventListener('offline', () => {
        updateInboundNetworkSyncHUD();
        showToast('🟠 สัญญาณอินเทอร์เน็ตหลุด! เปิดใช้งานโหมดออฟไลน์ สามารถยิงสแกนรับเข้าได้ต่อเนื่องทันที', true, 4000);
    });

    // ตัวตรวจสอบอัตโนมัติทุก 4 วินาที กรณีมือถือ Android/iOS สัญญาณกลับมาแล้วแต่ event online ยังไม่ทำงาน
    if (!networkMonitorTimer) {
        networkMonitorTimer = setInterval(() => {
            updateInboundNetworkSyncHUD();
            if (navigator.onLine && persistentDbSyncQueue.length > 0 && !isFlushingDbQueue) {
                flushPersistentDbSyncQueue();
            }
        }, 4000);
    }
}

async function handleInboundSubmit(e) {
    if (e) e.preventDefault();

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

    const rawSn = snInput.value || '';
    // รองรับกรณีปืนสแกนส่งรหัสติดกันหลายบรรทัดในเสี้ยววินาที
    const snTokens = rawSn
        .split(/[\r\n]+/)
        .map(s => s.replace(/[\t\u200B-\u200D\uFEFF]/g, '').trim())
        .filter(Boolean);

    if (snTokens.length === 0) {
        ensureSnInputFocus(true);
        return;
    }

    const category = (document.getElementById('inboundCategory')?.value || '').trim();
    const name = (document.getElementById('inboundName')?.value || '').trim();
    const meterVal = parseInt(document.getElementById('inboundMeter')?.value) || 0;

    if (!category || !name) {
        triggerScanInputFlash('error');
        showToast('⚠️ กรุณาระบุหมวดหมู่ SKU และชื่อรุ่นสินค้าก่อนทำการสแกนรับเข้า', true);
        snInput.select();
        return;
    }

    const currentSelectedLoc = getSelectedLocationFromDropdowns();

    if (!currentSelectedLoc || currentSelectedLoc.includes('โปรดเลือก') || currentSelectedLoc === '') {
        triggerScanInputFlash('error');
        showToast('⚠️ กรุณาเลือกแถวจัดเก็บคลังสินค้าก่อนทำการสแกนรับเข้า!', true);
        const aisleSelect = document.getElementById('inboundAisleSelect');
        if (aisleSelect) aisleSelect.focus();
        return;
    }

    // ล้างช่องกรอกทันทีเพื่อให้พร้อมรับการยิงนัดถัดไปใน 0ms
    snInput.value = '';
    ensureSnInputFocus(true);

    const nowBase = Date.now();
    snTokens.forEach((cleanSn, index) => {
        scanProcessingQueue.push({
            sn: cleanSn,
            category,
            name,
            meterVal,
            location: index === 0 ? currentSelectedLoc : null,
            timestamp: nowBase + index
        });
        recordScanSpeedMetrics();
    });

    if (!isProcessingScanQueue) {
        processScanProcessingQueue();
    }
}

// 🟢 🚀 ประมวลผลคิวสแกนสินค้าแบบต่อเนื่องความเร็วสูง 100%
async function processScanProcessingQueue() {
    if (isProcessingScanQueue || scanProcessingQueue.length === 0) return;
    isProcessingScanQueue = true;

    let enqueuedAnyForDb = false;

    while (scanProcessingQueue.length > 0) {
        const item = scanProcessingQueue.shift();
        const { sn, category, name, meterVal, location } = item;

        let dbLocation = location || getSelectedLocationFromDropdowns();
        const snUpper = sn.toUpperCase();

        const isDuplicateSn = pendingFastSnSet.has(snUpper) ||
                              (typeof globalInventoryData !== 'undefined' && globalInventoryData.some(i => i && String(i.sn).toUpperCase() === snUpper && i.status !== 'OUT' && !i.is_deleted)) ||
                              (typeof recentInboundList !== 'undefined' && recentInboundList.some(r => r && String(r.sn).toUpperCase() === snUpper));

        if (isDuplicateSn) {
            triggerScanInputFlash('duplicate');
            showToast(`⚠️ ซีเรียล S/N: ${sn} มีอยู่ในคลังสินค้าเรียบร้อยแล้ว ห้ามสแกนซ้ำเด็ดขาด!`, true);
            ensureSnInputFocus(true);
            continue;
        }

        const specialLocations = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
        const isSpecialZone = specialLocations.includes(dbLocation.toUpperCase());

        if (!isSpecialZone) {
            const occupiedSet = getAllOccupiedLocationsSet();
            const normLocKey = getNormalizedLocKey(dbLocation);
            const isLocOccupied = occupiedSet.has(dbLocation) || (normLocKey && occupiedSet.has(normLocKey));

            if (isLocOccupied) {
                const occupyingItem = getOccupyingSnDetails(dbLocation);
                const occupyingSn = occupyingItem ? occupyingItem.sn : 'ไม่ทราบ S/N';

                triggerScanInputFlash('occupied');
                showToast(`⚠️ พิกัด ${formatLocationSpaced(dbLocation)} มีสินค้า (S/N: ${occupyingSn}) จัดเก็บอยู่แล้ว`, true);

                forceSyncAndSelectAvailableLocation(true);
                ensureSnInputFocus(true);
                continue;
            }
        }

        // จอง S/N และพิกัดในหน่วยความจำทันที (0ms Synchronous Lock)
        pendingFastSnSet.add(snUpper);
        addOccupiedLocToSet(pendingFastLocationSet, dbLocation);

        const activeUserFullName = getCurrentUserFullName() || 'เจ้าหน้าที่คลังสินค้า';
        const nowISO = new Date().toISOString();
        const currentTimeStr = new Date().toLocaleTimeString('th-TH');

        const rawPayload = {
            category,
            name,
            sn,
            meter: meterVal,
            location: dbLocation,
            qty: 1,
            status: 'IN_STOCK',
            received_by: activeUserFullName,
            created_at: nowISO
        };

        const isOnlineNow = navigator.onLine;

        const feedItem = {
            sn,
            category,
            name,
            meter: meterVal,
            location: dbLocation,
            received_by: activeUserFullName,
            time: currentTimeStr,
            created_at: nowISO,
            isOffline: !isOnlineNow,
            db_status: isOnlineNow ? 'SYNCING' : 'PENDING'
        };

        recentInboundList.unshift(feedItem);
        if (recentInboundList.length > 100) recentInboundList.length = 100;

        if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
            globalInventoryData.unshift(rawPayload);
        }

        // ใส่เข้าคิวถาวร (Persistent FIFO Queue) เพื่อรองรับทั้งออนไลน์และออฟไลน์ 100%
        enqueuePersistentDbSync(rawPayload, feedItem);
        enqueuedAnyForDb = true;

        saveRecentInboundFeedToCache();
        forceSyncAndSelectAvailableLocation(true);
        triggerScanInputFlash('success');

        if (!isOnlineNow) {
            if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
                offlineInboundQueue.push(rawPayload);
                if (typeof persistQueue === 'function') persistQueue();
                if (typeof updateOnlineOfflineUI === 'function') updateOnlineOfflineUI(false);
            }
        }

        scheduleDebouncedFeedRender();

        // กระจายคำสั่งการรับเข้าใหม่ไปยังหน้าเช็กสต็อกสินค้า Realtime 100%
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel('wms_realtime_sync_channel');
                channel.postMessage({ action: 'INBOUND', item: rawPayload });
            }
        } catch (e) {}

        document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: rawPayload }));
        document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: rawPayload }));
    }

    isProcessingScanQueue = false;
    ensureSnInputFocus(true);

    // สั่งซิงค์คิว FIFO เข้าฐานข้อมูลทันทีหากออนไลน์
    if (enqueuedAnyForDb && navigator.onLine) {
        flushPersistentDbSyncQueue();
    }
}

function initMasterProductsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_products_changes_inbound')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
                if (typeof loadMasterProductsFromDB === 'function') {
                    await loadMasterProductsFromDB();
                    updateMasterDbCountBadge();
                }
            })
            .subscribe();
    } catch (e) {}
}

async function autoRefreshInboundDatabaseAndLocations() {
    invalidateOccupiedLocationsCache();

    if (typeof fetchInventoryData === 'function') {
        try { await fetchInventoryData(); } catch (e) {}
    } else if (typeof loadInventoryFromDB === 'function') {
        try { await loadInventoryFromDB(); } catch (e) {}
    }

    if (typeof loadRecentInboundFeedFromDB === 'function') {
        try { await loadRecentInboundFeedFromDB(); } catch (e) {}
    }

    // 🟢 คงค่าแถวจัดเก็บให้เว้นว่างไว้หากผู้ใช้ยังไม่เคยกดเลือกแถว
    populateInboundAisleDropdown(true);
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (userHasSelectedAisle && aisleSelect && aisleSelect.value && !aisleSelect.value.includes('โปรดเลือก')) {
        populateInboundLocationDropdownsStrict(aisleSelect.value, null, true);
    } else {
        populateInboundLocationDropdownsStrict('', null, false);
    }

    scheduleDebouncedFeedRender();
    ensureSnInputFocus();
}

function initWarehouseItemsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_warehouse_items_realtime_inbound_v80')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_items' }, async (payload) => {
                if (payload.eventType === 'DELETE') {
                    const oldObj = payload.old || {};
                    purgeDispatchedOrDeletedItemFromMemory(oldObj.sn, oldObj.id, oldObj.location);
                } else if (payload.eventType === 'UPDATE' && payload.new) {
                    const statusUpper = String(payload.new.status || '').toUpperCase();
                    const isOut = statusUpper === 'OUT' || statusUpper === 'DISPATCHED' || statusUpper === 'ISSUED' || statusUpper === 'RELEASED' || payload.new.is_deleted || Number(payload.new.qty) <= 0;

                    if (isOut) {
                        purgeDispatchedOrDeletedItemFromMemory(payload.new.sn, payload.new.id, payload.new.location);
                    } else {
                        if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                            const idx = globalInventoryData.findIndex(item => item && (item.id === payload.new.id || (payload.new.sn && String(item.sn).toUpperCase() === String(payload.new.sn).toUpperCase())));
                            if (idx !== -1) {
                                globalInventoryData[idx] = { ...globalInventoryData[idx], ...payload.new };
                            } else {
                                globalInventoryData.unshift(payload.new);
                            }
                        }
                    }
                } else if (payload.eventType === 'INSERT' && payload.new) {
                    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                        const exists = globalInventoryData.some(item => item && (item.id === payload.new.id || (payload.new.sn && String(item.sn).toUpperCase() === String(payload.new.sn).toUpperCase())));
                        if (!exists) {
                            globalInventoryData.unshift(payload.new);
                        }
                    }
                }

                saveRecentInboundFeedToCache();
                await autoRefreshInboundDatabaseAndLocations();

                document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: payload }));
                document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: payload }));
            })
            .subscribe();
    } catch (e) {}
}

function initCrossTabBroadcastListener() {
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.onmessage = async (event) => {
                const data = event.data;
                if (!data) return;

                const actionUpper = String(data.action || data.type || '').toUpperCase();
                if (actionUpper.includes('DELETE') && !actionUpper.includes('REQUEST')) {
                    purgeDispatchedOrDeletedItemFromMemory(data.sn, data.id, data.location);
                } else if (actionUpper.includes('DISPATCH') || actionUpper.includes('OUT') || actionUpper.includes('ISSUE') || actionUpper.includes('TRANSFER')) {
                    purgeDispatchedOrDeletedItemFromMemory(data.sn, data.id, data.location);
                }

                await autoRefreshInboundDatabaseAndLocations();
            };
        }
    } catch (e) {}
}