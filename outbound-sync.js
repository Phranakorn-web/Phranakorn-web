// =========================================================================
// --- MODULE 4.2: OUTBOUND 0MS SCAN QUEUE, FIFO DB SYNC & REALTIME ---
// --- 0ms Optimistic Dispatch, Persistent FIFO Queue & Cross-Tab Sync ---
// =========================================================================

function triggerOutboundScanFlash(status = 'success') {
    const snInput = getOutboundSnInputElement();
    if (snInput) {
        snInput.classList.remove('scan-flash-success', 'scan-flash-error');
        void snInput.offsetWidth;
        snInput.classList.add(status === 'success' ? 'scan-flash-success' : 'scan-flash-error');
        setTimeout(() => {
            snInput.classList.remove('scan-flash-success', 'scan-flash-error');
        }, 240);
    }
    playOutboundAudioFeedback(status);
}

function recordOutboundScanSpeedMetrics() {
    outboundScanSpeedCounter++;
    if (!outboundScanSpeedTimer) {
        outboundScanSpeedTimer = setTimeout(() => {
            latestOutboundMeasuredRate = outboundScanSpeedCounter;
            outboundScanSpeedCounter = 0;
            outboundScanSpeedTimer = null;
        }, 1000);
    }
    return Math.max(latestOutboundMeasuredRate, outboundScanSpeedCounter);
}

// =========================================================================
// 🌐 OFFLINE-FIRST PERSISTENT FIFO QUEUE & NETWORK SYNC HUD
// =========================================================================

function loadPersistentOutboundDbQueue() {
    try {
        const raw = localStorage.getItem(PERSISTENT_OUTBOUND_QUEUE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                persistentOutboundDbQueue = parsed;
                persistentOutboundDbQueue.forEach(entry => {
                    if (entry && entry.sn) {
                        const snUpper = String(entry.sn).trim().toUpperCase();
                        pendingFastOutboundSnSet.add(snUpper);
                        activeStockBySnMap.delete(snUpper);
                    }
                });
            }
        }
    } catch (e) {
        persistentOutboundDbQueue = [];
    }
}

function savePersistentOutboundDbQueue(immediate = false) {
    const writeNow = () => {
        try {
            localStorage.setItem(PERSISTENT_OUTBOUND_QUEUE_KEY, JSON.stringify(persistentOutboundDbQueue));
        } catch (e) {}
    };

    if (immediate) {
        if (outboundQueueSaveTimer) {
            clearTimeout(outboundQueueSaveTimer);
            outboundQueueSaveTimer = null;
        }
        writeNow();
        return;
    }

    if (outboundQueueSaveTimer) return;
    outboundQueueSaveTimer = setTimeout(() => {
        outboundQueueSaveTimer = null;
        writeNow();
    }, 150);
}

function enqueuePersistentOutboundDbSync(dispatchPayload, feedItem) {
    outboundSyncSequenceCounter++;
    const txId = `out_tx_${outboundSyncSequenceCounter}_${Math.random().toString(36).slice(2, 7)}`;
    if (feedItem) {
        feedItem._txId = txId;
    }
    persistentOutboundDbQueue.push({
        txId,
        seq: outboundSyncSequenceCounter,
        sn: dispatchPayload.sn,
        itemId: dispatchPayload.itemId || null,
        payload: dispatchPayload,
        enqueuedAt: new Date().toISOString(),
        retries: 0
    });
    savePersistentOutboundDbQueue(false);
    updateOutboundNetworkSyncHUD();
}

function ensureOutboundNetworkSyncHUD() {
    let hud = document.getElementById('outboundNetworkSyncHud');
    if (hud) return hud;

    const feedContainer = document.getElementById('liveOutboundFeedContainer') || document.getElementById('recentOutboundList');
    const snInput = getOutboundSnInputElement();
    const anchorParent = (feedContainer && feedContainer.parentElement) || (snInput && snInput.closest('form, .card, .section-card'));

    if (!anchorParent) return null;

    hud = document.createElement('div');
    hud.id = 'outboundNetworkSyncHud';
    hud.className = 'wms-network-sync-hud';

    if (feedContainer && feedContainer.parentElement === anchorParent) {
        anchorParent.insertBefore(hud, feedContainer);
    } else {
        anchorParent.appendChild(hud);
    }
    return hud;
}

function updateOutboundNetworkSyncHUD() {
    const hud = ensureOutboundNetworkSyncHUD();
    const isOnline = navigator.onLine;
    const pendingCount = persistentOutboundDbQueue.length;

    const instantQueuePill = document.getElementById('outboundInstantQueuePill');
    if (instantQueuePill) {
        if (pendingCount > 0 || isFlushingOutboundDbQueue) {
            instantQueuePill.className = 'wms-instant-queue-pill syncing';
            instantQueuePill.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> รันคิวเข้า DB: ${pendingCount.toLocaleString()}`;
        } else {
            instantQueuePill.className = 'wms-instant-queue-pill synced';
            instantQueuePill.innerHTML = `<i class="fa-solid fa-check"></i> DB ครบตามคิว`;
        }
    }

    if (!hud) return;

    if (!isOnline) {
        hud.className = 'wms-network-sync-hud offline';
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:9px;">
                    <span class="net-dot offline"></span>
                    <div>
                        <div style="font-weight:800; font-size:0.83rem; color:#9a3412;">🟠 โหมดออฟไลน์ (ไม่มีสัญญาณอินเทอร์เน็ต)</div>
                        <div style="font-size:0.75rem; color:#c2410c;">สแกนเบิกออกต่อเนื่องได้ตามปกติ 100% ระบบจะจัดคิวอัปเดตฐานข้อมูลทันทีที่เน็ตกลับมา</div>
                    </div>
                </div>
                <div style="background:#ffedd5; border:1px solid #fdba74; color:#9a3412; padding:4px 12px; border-radius:99px; font-size:0.78rem; font-weight:800;">
                    <i class="fa-solid fa-layer-group"></i> คิวเบิกรอส่ง: <span class="mono">${pendingCount.toLocaleString()}</span> รายการ
                </div>
            </div>
        `;
        return;
    }

    if (pendingCount > 0 || isFlushingOutboundDbQueue) {
        hud.className = 'wms-network-sync-hud syncing';
        hud.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:9px;">
                    <i class="fa-solid fa-arrows-rotate fa-spin" style="color:#0284c7; font-size:1rem;"></i>
                    <div>
                        <div style="font-weight:800; font-size:0.83rem; color:#075985;">🔄 กำลังตัดสต็อกเข้าฐานข้อมูลตามลำดับคิว...</div>
                        <div style="font-size:0.75rem; color:#0369a1;">เรียงลำดับคิว FIFO อัตโนมัติ (เหลืออีก ${pendingCount.toLocaleString()} รายการ)</div>
                    </div>
                </div>
                <button type="button" onclick="flushPersistentOutboundSyncQueue(true)" style="background:#0284c7; color:#fff; border:none; padding:5px 12px; border-radius:99px; font-size:0.75rem; font-weight:700; cursor:pointer;">
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
                <span style="font-weight:700; font-size:0.8rem; color:#065f46;">ออนไลน์ • ระบบเบิกสินค้าออกเชื่อมต่อฐานข้อมูลเรียลไทม์ 100%</span>
            </div>
            <span style="font-size:0.74rem; color:#047857; font-weight:600;">
                <i class="fa-solid fa-bolt"></i> พร้อมรับสแกนเบิกออกความเร็วสูง & คืนพิกัดจัดเก็บอัตโนมัติ
            </span>
        </div>
    `;
}

// 🚀 รันคิวเบิกสินค้าออกเข้า Supabase ตามลำดับ FIFO 100% (ไม่บล็อกปืนสแกน)
async function flushPersistentOutboundSyncQueue(manualTrigger = false) {
    updateOutboundNetworkSyncHUD();

    if (isFlushingOutboundDbQueue || persistentOutboundDbQueue.length === 0) return;

    if (!navigator.onLine) {
        if (manualTrigger && typeof showToast === 'function') {
            showToast('🟠 ขณะนี้อยู่ในโหมดออฟไลน์ ระบบจะส่งคิวเบิกออกทันทีเมื่ออินเทอร์เน็ตกลับมา', true);
        }
        return;
    }

    const client = typeof resolveWmsSupabaseClient === 'function'
        ? resolveWmsSupabaseClient()
        : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null));
    if (!client) return;

    isFlushingOutboundDbQueue = true;
    updateOutboundNetworkSyncHUD();

    let totalSyncedInRun = 0;

    try {
        while (persistentOutboundDbQueue.length > 0 && navigator.onLine) {
            // ดึงตามลำดับ FIFO สูงสุด 50 รายการต่อรอบ
            const batchEntries = persistentOutboundDbQueue.slice(0, 50);
            const activeOperator = getOutboundOperatorName();
            const nowIso = new Date().toISOString();

            batchEntries.forEach(entry => {
                const feedMatch = recentOutboundList.find(f => f && (f._txId === entry.txId || String(f.sn).toUpperCase() === String(entry.sn).toUpperCase()));
                if (feedMatch && feedMatch.db_status !== 'SYNCED') {
                    feedMatch.db_status = 'SYNCING';
                    feedMatch.isOffline = false;
                }
            });
            scheduleDebouncedOutboundFeedRender();

            const snList = batchEntries.map(e => e.sn).filter(Boolean);
            const firstPayload = batchEntries[0].payload || {};

            // อัปเดตสถานะเป็น OUT และ qty = 0 ใน warehouse_items ตามลำดับคิว FIFO
            let updateFields = {
                status: 'OUT',
                qty: 0,
                dispatched_by: firstPayload.dispatched_by || activeOperator,
                dispatched_at: firstPayload.dispatched_at || nowIso
            };
            if (firstPayload.recipient) {
                updateFields.recipient = firstPayload.recipient;
            }

            let { error } = await client
                .from('warehouse_items')
                .update(updateFields)
                .in('sn', snList);

            // กรณีตาราง warehouse_items ไม่มีคอลัมน์เสริมบางตัว ให้ Fallback อัปเดตคอลัมน์หลักทันทีเพื่อไม่ให้คิวค้าง
            if (error && (String(error.code) === 'PGRST204' || String(error.code) === '42703' || String(error.message || '').includes('column'))) {
                const fallbackRes = await client
                    .from('warehouse_items')
                    .update({ status: 'OUT', qty: 0 })
                    .in('sn', snList);
                error = fallbackRes.error;
            }

            if (!error) {
                // บันทึกประวัติการใช้งาน/เบิกออกลงตาราง warehouse_logs แบบ Best-Effort (ไม่ขัดจังหวะคิวหลัก)
                try {
                    const logRows = batchEntries.map(entry => ({
                        action: 'OUTBOUND',
                        sn: entry.sn,
                        category: entry.payload?.category || '',
                        name: entry.payload?.name || '',
                        location: entry.payload?.location || '',
                        qty: 1,
                        user_name: entry.payload?.dispatched_by || activeOperator,
                        note: entry.payload?.recipient ? `เบิกให้: ${entry.payload.recipient}` : 'สแกนเบิกสินค้าออก',
                        created_at: entry.payload?.dispatched_at || nowIso
                    }));
                    client.from('warehouse_logs').insert(logRows).then(() => {}).catch(() => {});
                } catch (logErr) {}

                batchEntries.forEach(entry => {
                    const feedMatch = recentOutboundList.find(f => f && (f._txId === entry.txId || String(f.sn).toUpperCase() === String(entry.sn).toUpperCase()));
                    if (feedMatch) {
                        feedMatch.db_status = 'SYNCED';
                        feedMatch.isOffline = false;
                    }
                });

                persistentOutboundDbQueue.splice(0, batchEntries.length);
                savePersistentOutboundDbQueue(persistentOutboundDbQueue.length === 0);
                scheduleSaveRecentOutboundFeedCache();
                totalSyncedInRun += batchEntries.length;
                updateOutboundNetworkSyncHUD();
                scheduleDebouncedOutboundFeedRender();
            } else {
                // หากเน็ตหลุดระหว่างส่ง ให้คืนสถานะเป็น PENDING รอเน็ตกลับมา
                batchEntries.forEach(entry => {
                    const feedMatch = recentOutboundList.find(f => f && (f._txId === entry.txId || String(f.sn).toUpperCase() === String(entry.sn).toUpperCase()));
                    if (feedMatch) {
                        feedMatch.db_status = 'PENDING';
                        feedMatch.isOffline = true;
                    }
                });
                savePersistentOutboundDbQueue(true);
                saveRecentOutboundFeedToCache();
                scheduleDebouncedOutboundFeedRender();
                break;
            }
        }
    } catch (err) {
        console.error('Outbound FIFO queue sync error:', err);
        persistentOutboundDbQueue.forEach(entry => {
            const feedMatch = recentOutboundList.find(f => f && (f._txId === entry.txId || String(f.sn).toUpperCase() === String(entry.sn).toUpperCase()));
            if (feedMatch && feedMatch.db_status === 'SYNCING') {
                feedMatch.db_status = 'PENDING';
                feedMatch.isOffline = true;
            }
        });
        savePersistentOutboundDbQueue(true);
        saveRecentOutboundFeedToCache();
        scheduleDebouncedOutboundFeedRender();
    } finally {
        isFlushingOutboundDbQueue = false;
        updateOutboundNetworkSyncHUD();

        if (totalSyncedInRun > 0 && persistentOutboundDbQueue.length === 0) {
            renderOutboundInstantScanBoxStatus('synced', '', '', '', 0, latestOutboundMeasuredRate);
            document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: { action: 'OUTBOUND_SYNC_COMPLETE', count: totalSyncedInRun } }));
        }
    }
}

function initOutboundNetworkStatusListeners() {
    window.addEventListener('online', () => {
        updateOutboundNetworkSyncHUD();
        if (persistentOutboundDbQueue.length > 0) {
            if (typeof showToast === 'function') {
                showToast(`🌐 อินเทอร์เน็ตกลับมาแล้ว! กำลังตัดสต็อกตามคิว ${persistentOutboundDbQueue.length.toLocaleString()} รายการ...`, false, 3500);
            }
            flushPersistentOutboundSyncQueue();
        }
    });

    window.addEventListener('offline', () => {
        updateOutboundNetworkSyncHUD();
        if (typeof showToast === 'function') {
            showToast('🟠 สัญญาณอินเทอร์เน็ตหลุด! เปิดใช้งานโหมดออฟไลน์ สามารถยิงสแกนเบิกออกต่อเนื่องได้ทันที', true, 4000);
        }
    });

    const persistBeforeLeave = () => {
        savePersistentOutboundDbQueue(true);
        saveRecentOutboundFeedToCache();
    };
    window.addEventListener('pagehide', persistBeforeLeave);
    window.addEventListener('beforeunload', persistBeforeLeave);

    if (!outboundNetworkMonitorTimer) {
        outboundNetworkMonitorTimer = setInterval(() => {
            updateOutboundNetworkSyncHUD();
            if (navigator.onLine && persistentOutboundDbQueue.length > 0 && !isFlushingOutboundDbQueue) {
                flushPersistentOutboundSyncQueue();
            }
        }, 3000);
    }
}

// ⚡ รับค่าการสแกนเบิกออก -> ล้างช่องทันที 0ms -> ส่งเข้าคิวประมวลผล
function handleOutboundSubmit(e) {
    if (e) e.preventDefault();

    const snInput = getOutboundSnInputElement();
    if (!snInput) return;

    const rawSn = snInput.value || '';
    // รองรับปืนสแกนที่ยิงหลายบรรทัดหรือคั่นด้วย Tab ติดกันในเสี้ยววินาที
    const snTokens = rawSn
        .split(/[\r\n\t]+/)
        .map(s => s.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '').trim())
        .filter(Boolean);

    if (snTokens.length === 0) {
        ensureOutboundSnInputFocus(true);
        return;
    }

    const recipientEl = document.getElementById('outboundRecipient') || document.getElementById('outboundNote') || document.getElementById('dispatchRecipient');
    const recipient = recipientEl ? String(recipientEl.value || '').trim() : '';

    // ⚡ ล้างช่องกรอกทันทีใน 0ms และคืนโฟกัสให้พร้อมรับการยิงนัดถัดไปทันที
    snInput.value = '';
    ensureOutboundSnInputFocus(true);

    const nowBase = Date.now();
    snTokens.forEach((cleanSn, index) => {
        const measuredSpeed = recordOutboundScanSpeedMetrics();
        outboundScanQueue.push({
            sn: cleanSn,
            recipient,
            timestamp: nowBase + index,
            measuredSpeed
        });
    });

    if (!isProcessingOutboundQueue) {
        processOutboundScanQueue();
    }
}

// 🚀 ประมวลผลคิวเบิกสินค้าออกแบบ 0ms Optimistic UI-First (Admin) หรือส่งคำขอเข้าศูนย์อนุมัติ (User ทั่วไป)
function processOutboundScanQueue() {
    if (isProcessingOutboundQueue || outboundScanQueue.length === 0) return;
    isProcessingOutboundQueue = true;

    const isAdmin = typeof isWmsAdminStrict === 'function' ? isWmsAdminStrict() : false;
    let enqueuedAnyForDb = false;
    const userApprovalRecords = [];

    while (outboundScanQueue.length > 0) {
        const entry = outboundScanQueue.shift();
        const { sn, recipient, measuredSpeed } = entry;
        const snUpper = sn.toUpperCase();

        // 1. ตรวจสอบ S/N ซ้ำในคิวเบิกออกทันที (O(1))
        if (pendingFastOutboundSnSet.has(snUpper)) {
            triggerOutboundScanFlash('duplicate');
            renderOutboundInstantScanBoxStatus('duplicate', sn, '', '', persistentOutboundDbQueue.length, measuredSpeed);
            if (typeof showToast === 'function') {
                showToast(`⚠️ ซีเรียล S/N: ${sn} ถูกสแกนเบิกออกไปแล้ว!`, true);
            }
            continue;
        }

        // 2. ค้นหาสินค้าในสต็อกคงเหลือด้วยดัชนี O(1)
        const stockItem = findActiveStockItemBySn(snUpper);

        if (!stockItem) {
            triggerOutboundScanFlash('error');
            renderOutboundInstantScanBoxStatus('not_found', sn, '', '', persistentOutboundDbQueue.length, measuredSpeed);
            if (typeof showToast === 'function') {
                showToast(`❌ ไม่พบ S/N: ${sn} ในสต็อกคงเหลือ (หรือถูกเบิกออกไปแล้ว)`, true);
            }
            continue;
        }

        // 🔒 กรณี User ทั่วไป: ส่งเข้าศูนย์อนุมัติคำขอของ Admin (ยังไม่ตัดสต็อกจนกว่า Admin จะอนุมัติ)
        if (!isAdmin) {
            const operatorName = getOutboundOperatorName();
            const nowISO = new Date().toISOString();
            userApprovalRecords.push({
                request_type: 'OUTBOUND',
                batch_id: `OUT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                sn: stockItem.sn || sn,
                category: stockItem.category || 'ทั่วไป',
                name: stockItem.name || 'สินค้าคลัง',
                location: stockItem.location || 'DOCK',
                target_location: recipient || 'จ่ายออกนอกคลัง',
                requested_by: operatorName,
                reason: recipient ? `ขอเบิกออกให้: ${recipient}` : 'สแกนขอเบิกสินค้าออกนอกคลัง',
                created_at: nowISO
            });
            triggerOutboundScanFlash('success');
            continue;
        }

        // 3. 👑 สิทธิ์ Admin: ตัดสต็อกและคืนพิกัดในหน่วยความจำทันที 0ms
        const operatorName = getOutboundOperatorName();
        const nowISO = new Date().toISOString();
        const currentTimeStr = new Date().toLocaleTimeString('th-TH');

        const dispatchResult = markStockItemDispatchedInMemory(snUpper, {
            id: stockItem.id,
            dispatched_by: operatorName,
            dispatched_at: nowISO,
            recipient
        });

        const freedLocation = dispatchResult ? dispatchResult.freedLocation : (stockItem.location || '');
        const isOnlineNow = navigator.onLine;

        const dispatchPayload = {
            itemId: stockItem.id || null,
            sn: stockItem.sn || sn,
            category: stockItem.category || 'ทั่วไป',
            name: stockItem.name || 'สินค้าคลัง',
            meter: stockItem.meter || 0,
            location: freedLocation,
            recipient,
            status: 'OUT',
            qty: 0,
            dispatched_by: operatorName,
            dispatched_at: nowISO
        };

        const feedItem = {
            ...dispatchPayload,
            time: currentTimeStr,
            isOffline: !isOnlineNow,
            db_status: isOnlineNow ? 'SYNCING' : 'PENDING'
        };

        // 4. บันทึกขึ้นหน้าเว็บไซต์ทันที (Optimistic UI Commit)
        recentOutboundList.unshift(feedItem);
        if (recentOutboundList.length > 120) recentOutboundList.length = 120;

        // 5. เข้าคิวถาวรเรียงลำดับ FIFO เพื่อส่งเข้า Supabase
        enqueuePersistentOutboundDbSync(dispatchPayload, feedItem);
        enqueuedAnyForDb = true;

        scheduleSaveRecentOutboundFeedCache();
        triggerOutboundScanFlash('success');

        // 6. แสดงผลลัพธ์ทันทีตรงใต้ช่องสแกน S/N
        renderOutboundInstantScanBoxStatus(
            'success',
            dispatchPayload.sn,
            dispatchPayload.name,
            freedLocation,
            persistentOutboundDbQueue.length,
            measuredSpeed
        );

        scheduleDebouncedOutboundFeedRender();

        // 7. แจ้งเตือนหน้าเช็กสต็อก & หน้างานรับเข้าคลังแบบเรียลไทม์ 0ms
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel('wms_realtime_sync_channel');
                channel.postMessage({
                    action: 'DISPATCH',
                    sn: dispatchPayload.sn,
                    id: dispatchPayload.itemId,
                    location: freedLocation,
                    item: dispatchPayload,
                    _localOptimistic: true
                });
            }
        } catch (e) {}

        const eventDetail = {
            ...dispatchPayload,
            action: 'DISPATCH',
            _localOptimistic: true
        };
        document.dispatchEvent(new CustomEvent('inventoryDispatched', { detail: eventDetail }));
        document.dispatchEvent(new CustomEvent('outboundCompleted', { detail: eventDetail }));
        document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: eventDetail }));
        document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: eventDetail }));
    }

    isProcessingOutboundQueue = false;
    ensureOutboundSnInputFocus(true);

    // ส่งคำขออนุมัติจ่ายออกของ User ทั่วไปเข้าศูนย์อนุมัติคำขอของ Admin
    if (userApprovalRecords.length > 0) {
        (async () => {
            const client = typeof resolveWmsSupabaseClient === 'function'
                ? resolveWmsSupabaseClient()
                : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : null);

            if (typeof submitApprovalRequestsResilient === 'function') {
                await submitApprovalRequestsResilient(client, userApprovalRecords);
            } else if (client) {
                await client.from('approval_requests').insert(userApprovalRecords.map(r => ({
                    request_type: 'OUTBOUND',
                    batch_id: r.batch_id,
                    sn: r.sn,
                    category: r.category,
                    name: r.name,
                    location: r.location,
                    target_location: r.target_location,
                    requested_by: r.requested_by,
                    reason: r.reason,
                    status: 'PENDING',
                    created_at: r.created_at
                })));
            }

            const firstRec = userApprovalRecords[0];
            if (typeof broadcastNewApprovalRequestEvent === 'function') {
                broadcastNewApprovalRequestEvent({
                    request_type: 'OUTBOUND',
                    batch_id: firstRec.batch_id,
                    count: userApprovalRecords.length,
                    sn: firstRec.sn,
                    target_location: firstRec.target_location,
                    requested_by: firstRec.requested_by,
                    created_at: firstRec.created_at
                });
            }

            if (typeof showWmsCornerNotification === 'function') {
                showWmsCornerNotification({
                    variant: 'USER_SUBMIT',
                    title: 'ส่งคำขออนุมัติเรียบร้อย',
                    description: `ส่งคำขอจ่ายออก ${userApprovalRecords.length.toLocaleString()} S/N ไปยังศูนย์อนุมัติของ Admin แล้ว`,
                    durationMs: 3400,
                    playSound: true
                });
            }
        })();
    }

    // 8. รันคิวเข้าฐานข้อมูลต่อเนื่องตามลำดับ FIFO แบบไม่บล็อกการยิงนัดถัดไป
    if (enqueuedAnyForDb && navigator.onLine) {
        queueMicrotask(() => {
            flushPersistentOutboundSyncQueue();
        });
    }
}

function initOutboundRealtimeListeners() {
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.onmessage = (event) => {
                const data = event.data;
                if (!data) return;
                const actionUpper = String(data.action || '').toUpperCase();
                if (actionUpper === 'INBOUND' && data.item && data.item.sn) {
                    const snUpper = String(data.item.sn).trim().toUpperCase();
                    pendingFastOutboundSnSet.delete(snUpper);
                    activeStockBySnMap.set(snUpper, data.item);
                } else if ((actionUpper.includes('DISPATCH') || actionUpper.includes('OUT')) && data.sn) {
                    markStockItemDispatchedInMemory(data.sn, data.item || data);
                }
            };
        }
    } catch (e) {}

    document.addEventListener('inventoryDataChanged', (e) => {
        const detail = e && e.detail;
        if (detail && detail._localOptimistic) return;
        rebuildActiveStockIndex(true);
    });
}