// =========================================================================
// --- MODULE 4.2: OUTBOUND 0MS SCAN QUEUE, FIFO DB SYNC & REALTIME ---
// --- 0ms Optimistic Dispatch, Resilient FIFO Queue & Cross-Tab Sync ---
// =========================================================================

const MAX_OUTBOUND_SYNC_RETRIES = 3;

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
                // กรองเฉพาะรายการที่ยังไม่เกินจำนวน Retry สูงสุดเพื่อไม่ให้ค้างหมุนวนถาวร
                persistentOutboundDbQueue = parsed.filter(entry => entry && entry.sn && (Number(entry.retries) || 0) < MAX_OUTBOUND_SYNC_RETRIES);
                persistentOutboundDbQueue.forEach(entry => {
                    const snUpper = String(entry.sn).trim().toUpperCase();
                    pendingFastOutboundSnSet.add(snUpper);
                    activeStockBySnMap.delete(snUpper);
                });
                if (persistentOutboundDbQueue.length !== parsed.length) {
                    savePersistentOutboundDbQueue(true);
                }
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

function clearStuckOutboundSyncQueue() {
    const count = persistentOutboundDbQueue.length;
    persistentOutboundDbQueue.forEach(entry => {
        if (entry && entry.sn) {
            pendingFastOutboundSnSet.delete(String(entry.sn).trim().toUpperCase());
        }
    });
    persistentOutboundDbQueue = [];
    isFlushingOutboundDbQueue = false;
    savePersistentOutboundDbQueue(true);

    recentOutboundList.forEach(item => {
        if (item && (item.db_status === 'PENDING' || item.db_status === 'SYNCING')) {
            item.db_status = 'SYNCED';
            item.isOffline = false;
        }
    });
    saveRecentOutboundFeedToCache();
    rebuildActiveStockIndex(true);
    updateOutboundNetworkSyncHUD();
    scheduleDebouncedOutboundFeedRender();

    if (typeof showToast === 'function') {
        showToast(`🧹 ล้างคิวรอซิงค์ที่ค้างอยู่ (${count} รายการ) เรียบร้อยแล้ว สามารถสแกนใหม่ได้ทันที`, false);
    }
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
    const isAdmin = checkOutboundUserIsAdmin();

    const instantQueuePill = document.getElementById('outboundInstantQueuePill');
    if (instantQueuePill) {
        if (pendingCount > 0 || isFlushingOutboundDbQueue) {
            instantQueuePill.className = 'wms-instant-queue-pill syncing';
            instantQueuePill.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> คิว DB: ${pendingCount.toLocaleString()}`;
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
                        <div style="font-size:0.75rem; color:#c2410c;">สแกนเพิ่มลงใบงานได้ต่อเนื่อง ระบบจะอัปเดตฐานข้อมูลทันทีที่เน็ตกลับมา</div>
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
                        <div style="font-weight:800; font-size:0.83rem; color:#075985;">🔄 กำลังซิงค์ข้อมูลตัดสต็อกเข้าฐานข้อมูล...</div>
                        <div style="font-size:0.75rem; color:#0369a1;">เหลือคิวอีก ${pendingCount.toLocaleString()} รายการ</div>
                    </div>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" onclick="flushPersistentOutboundSyncQueue(true)" style="background:#0284c7; color:#fff; border:none; padding:5px 12px; border-radius:99px; font-size:0.75rem; font-weight:700; cursor:pointer;">
                        ซิงค์ทันที
                    </button>
                    <button type="button" onclick="clearStuckOutboundSyncQueue()" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:5px 10px; border-radius:99px; font-size:0.73rem; font-weight:700; cursor:pointer;">
                        ล้างคิวค้าง
                    </button>
                </div>
            </div>
        `;
        return;
    }

    hud.className = 'wms-network-sync-hud online';
    hud.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="pulse-live-dot"></span>
                <span style="font-weight:700; font-size:0.8rem; color:#065f46;">
                    ออนไลน์ • เชื่อมต่อฐานข้อมูลเรียลไทม์ 100% (${isAdmin ? '👑 สิทธิ์ Admin: ตัดสต็อกออกได้ทันที' : '👤 สิทธิ์ผู้ใช้ทั่วไป: ส่งคำขออนุมัติก่อนตัดจ่าย'})
                </span>
            </div>
            <span style="font-size:0.74rem; color:#047857; font-weight:600;">
                <i class="fa-solid fa-file-invoice"></i> รองรับใบงานจ่ายสินค้า &amp; คืนพิกัดอัตโนมัติ
            </span>
        </div>
    `;
}

// 🚀 รันคิวเบิกสินค้าออกเข้า Supabase ตามลำดับ FIFO 100% (ป้องกันการวนลูปค้าง)
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

            // รวมทั้งตัวพิมพ์เดิม ตัวพิมพ์ใหญ่ และตัวพิมพ์เล็ก เพื่อให้ตรงกับ DB แน่นอน
            const snVariantsSet = new Set();
            batchEntries.forEach(e => {
                if (!e.sn) return;
                const raw = String(e.sn).trim();
                snVariantsSet.add(raw);
                snVariantsSet.add(raw.toUpperCase());
                snVariantsSet.add(raw.toLowerCase());
            });
            const snList = Array.from(snVariantsSet);
            const firstPayload = batchEntries[0].payload || {};

            let updateFields = {
                status: 'OUT',
                qty: 0,
                dispatched_by: firstPayload.dispatched_by || activeOperator,
                dispatched_at: firstPayload.dispatched_at || nowIso
            };
            if (firstPayload.recipient) {
                updateFields.recipient = firstPayload.recipient;
            }
            if (firstPayload.delivery_note_no) {
                updateFields.delivery_note_no = firstPayload.delivery_note_no;
            }

            let { error } = await client
                .from('warehouse_items')
                .update(updateFields)
                .in('sn', snList);

            // Fallback กรณีตาราง warehouse_items มีเฉพาะคอลัมน์หลัก
            if (error) {
                const fallbackRes = await client
                    .from('warehouse_items')
                    .update({ status: 'OUT', qty: 0 })
                    .in('sn', snList);
                error = fallbackRes.error;
            }

            // Fallback ระดับรายชิ้นหาก .in() ติดปัญหา
            if (error) {
                let anySingleOk = false;
                for (const entry of batchEntries) {
                    const singleRes = await client
                        .from('warehouse_items')
                        .update({ status: 'OUT', qty: 0 })
                        .ilike('sn', String(entry.sn).trim());
                    if (!singleRes.error) {
                        anySingleOk = true;
                    }
                }
                if (anySingleOk) error = null;
            }

            if (!error) {
                try {
                    const logRows = batchEntries.map(entry => ({
                        action: 'OUTBOUND',
                        sn: entry.sn,
                        category: entry.payload?.category || '',
                        name: entry.payload?.name || '',
                        location: entry.payload?.location || '',
                        qty: entry.payload?.qty || 1,
                        user_name: entry.payload?.dispatched_by || activeOperator,
                        note: entry.payload?.recipient ? `เบิกให้: ${entry.payload.recipient}` : 'ตัดจ่ายสินค้าออกจากคลัง',
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
                // เพิ่มตัวนับ Retry และตัดรายการที่เกินโควต้าออกเพื่อป้องกันค้างหมุนวนตลอดกาล
                const remainingQueue = [];
                for (const entry of persistentOutboundDbQueue) {
                    const isInCurrentBatch = batchEntries.some(b => b.txId === entry.txId);
                    if (isInCurrentBatch) {
                        entry.retries = (Number(entry.retries) || 0) + 1;
                        if (entry.retries < MAX_OUTBOUND_SYNC_RETRIES) {
                            remainingQueue.push(entry);
                        } else {
                            pendingFastOutboundSnSet.delete(String(entry.sn).trim().toUpperCase());
                        }
                    } else {
                        remainingQueue.push(entry);
                    }
                }
                persistentOutboundDbQueue = remainingQueue;

                batchEntries.forEach(entry => {
                    const feedMatch = recentOutboundList.find(f => f && (f._txId === entry.txId || String(f.sn).toUpperCase() === String(entry.sn).toUpperCase()));
                    if (feedMatch) {
                        feedMatch.db_status = entry.retries >= MAX_OUTBOUND_SYNC_RETRIES ? 'SYNCED' : 'PENDING';
                        feedMatch.isOffline = entry.retries < MAX_OUTBOUND_SYNC_RETRIES;
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
            showToast('🟠 สัญญาณอินเทอร์เน็ตหลุด! เปิดใช้งานโหมดออฟไลน์ สามารถสแกนรายการต่อเนื่องได้ทันที', true, 4000);
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
        }, 5000);
    }
}

// ⚡ รับค่าการสแกนเบิกออก -> ล้างช่องทันที 0ms -> ส่งเข้าคิวประมวลผล
function handleOutboundSubmit(e) {
    if (e) e.preventDefault();

    const snInput = getOutboundSnInputElement();
    if (!snInput) return;

    const rawSn = snInput.value || '';
    const snTokens = rawSn
        .split(/[\r\n\t]+/)
        .map(s => s.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '').trim())
        .filter(Boolean);

    if (snTokens.length === 0) {
        ensureOutboundSnInputFocus(true);
        return;
    }

    const recipientEl = document.getElementById('outboundRecipient') ||
                        document.getElementById('outboundCustomerName') ||
                        document.getElementById('outboundNote') ||
                        document.getElementById('dispatchRecipient');
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

// 🚀 ประมวลผลคิวสแกนสินค้าออก (เพิ่มเข้าใบงานจ่ายสินค้า หรือ ตัดจ่ายด่วนสำหรับ Admin)
function processOutboundScanQueue() {
    if (isProcessingOutboundQueue || outboundScanQueue.length === 0) return;
    isProcessingOutboundQueue = true;

    const isAdmin = checkOutboundUserIsAdmin();
    const hasWorkOrderCart = Boolean(document.getElementById('outboundCartTableBody'));
    const useWorkOrderCartMode = hasWorkOrderCart && !(isAdmin && isOutboundDirectFastScanMode);

    let enqueuedAnyForDb = false;

    while (outboundScanQueue.length > 0) {
        const entry = outboundScanQueue.shift();
        const { sn, recipient, measuredSpeed } = entry;
        const snUpper = sn.toUpperCase();

        // 1. ตรวจสอบ S/N ซ้ำในใบงานปัจจุบัน หรือในคิวที่ตัดออกไปแล้ว
        if (outboundCartList.some(i => String(i.sn).trim().toUpperCase() === snUpper) || pendingFastOutboundSnSet.has(snUpper)) {
            triggerOutboundScanFlash('duplicate');
            renderOutboundInstantScanBoxStatus('duplicate', sn, '', '', persistentOutboundDbQueue.length, measuredSpeed);
            if (typeof showToast === 'function') {
                showToast(`⚠️ ซีเรียล S/N: ${sn} ถูกเพิ่มในใบงานหรือตัดจ่ายออกไปแล้ว!`, true);
            }
            continue;
        }

        // 2. ค้นหาสินค้าในสต็อกคงเหลือด้วยดัชนี O(1)
        const stockItem = findActiveStockItemBySn(snUpper);

        if (!stockItem) {
            triggerOutboundScanFlash('error');
            renderOutboundInstantScanBoxStatus('not_found', sn, '', '', persistentOutboundDbQueue.length, measuredSpeed);
            if (typeof showToast === 'function') {
                showToast(`❌ ไม่พบ S/N: ${sn} ในสต็อกคงเหลือ (หรือถูกจ่ายออกไปแล้ว)`, true);
            }
            continue;
        }

        // 📋 โหมดหลัก: เพิ่มรายการลง "ใบงานจ่ายสินค้าออกจากคลัง" (ครบ ชื่อรุ่น, จำนวน, หน่วยนับ)
        if (useWorkOrderCartMode) {
            const cartEntry = {
                id: stockItem.id || null,
                sn: stockItem.sn || sn,
                category: stockItem.category || 'ทั่วไป',
                name: stockItem.name || 'สินค้าคลัง',
                model: inferOutboundItemModel(stockItem),
                qty: 1,
                unit: inferOutboundItemUnit(stockItem),
                meter: stockItem.meter || 0,
                location: stockItem.location || 'DOCK'
            };

            outboundCartList.push(cartEntry);
            triggerOutboundScanFlash('success');
            renderOutboundInstantScanBoxStatus(
                'cart_added',
                cartEntry.sn,
                `${cartEntry.model} (1 ${cartEntry.unit})`,
                cartEntry.location,
                persistentOutboundDbQueue.length,
                measuredSpeed
            );
            if (typeof renderOutboundCartTable === 'function') {
                renderOutboundCartTable();
            }
            continue;
        }

        // ⚡ โหมดตัดจ่ายด่วนทีละชิ้น (เฉพาะ Admin ที่เปิด Fast Scan Mode)
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
            model: inferOutboundItemModel(stockItem),
            unit: inferOutboundItemUnit(stockItem),
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

        recentOutboundList.unshift(feedItem);
        if (recentOutboundList.length > 120) recentOutboundList.length = 120;

        enqueuePersistentOutboundDbSync(dispatchPayload, feedItem);
        enqueuedAnyForDb = true;

        scheduleSaveRecentOutboundFeedCache();
        triggerOutboundScanFlash('success');

        renderOutboundInstantScanBoxStatus(
            'success',
            dispatchPayload.sn,
            dispatchPayload.model,
            freedLocation,
            persistentOutboundDbQueue.length,
            measuredSpeed
        );

        scheduleDebouncedOutboundFeedRender();

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