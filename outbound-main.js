// =========================================================================
// --- MODULE 4.3: OUTBOUND UNIVERSAL SCANNER, CAMERA & FEED CONTROLLER ---
// --- Single-Source Scanner Listener, Mobile Camera, Undo & Work Orders ---
// =========================================================================

// 🔫 ตัวจัดการปืนสแกนบาร์โค้ดทุกประเภทสำหรับหน้าเบิกสินค้าออก (จุดเดียว ไม่ชนกัน)
function attachUniversalOutboundScannerListener(snInput) {
    if (!snInput || snInput.dataset.universalOutboundScannerBound === 'true') return;
    snInput.dataset.universalOutboundScannerBound = 'true';

    let lastKeyTime = 0;
    let burstKeyCount = 0;
    let burstAutoSubmitTimer = null;
    let isComposingIme = false;

    const cancelBurstTimer = () => {
        if (burstAutoSubmitTimer) {
            clearTimeout(burstAutoSubmitTimer);
            burstAutoSubmitTimer = null;
        }
    };

    snInput.addEventListener('compositionstart', () => {
        isComposingIme = true;
        cancelBurstTimer();
    });

    snInput.addEventListener('compositionend', () => {
        isComposingIme = false;
        if (burstKeyCount >= 3 && snInput.value.trim().length >= 3) {
            cancelBurstTimer();
            burstAutoSubmitTimer = setTimeout(() => {
                burstKeyCount = 0;
                if (snInput.value.trim().length >= 3) {
                    handleOutboundSubmit();
                }
            }, 60);
        }
    });

    snInput.addEventListener('keydown', function (e) {
        getOutboundSharedAudioContext();

        if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopImmediatePropagation();
            cancelBurstTimer();
            burstKeyCount = 0;
            isComposingIme = false;
            handleOutboundSubmit(e);
            return;
        }

        const now = Date.now();
        if (e.key && (e.key.length === 1 || e.key === 'Process')) {
            if (now - lastKeyTime < 75) {
                burstKeyCount++;
            } else {
                burstKeyCount = 1;
            }
            lastKeyTime = now;
        }
    }, true);

    snInput.addEventListener('input', function () {
        cancelBurstTimer();
        if (!isComposingIme && burstKeyCount >= 3 && snInput.value.trim().length >= 3) {
            burstAutoSubmitTimer = setTimeout(() => {
                burstKeyCount = 0;
                if (snInput.value.trim().length >= 3) {
                    handleOutboundSubmit();
                }
            }, 65);
        }
    });

    snInput.addEventListener('paste', function () {
        cancelBurstTimer();
        burstKeyCount = 0;
        setTimeout(() => {
            if (snInput.value && snInput.value.trim().length > 0) {
                handleOutboundSubmit();
            }
        }, 15);
    });

    snInput.addEventListener('blur', () => setTimeout(() => ensureOutboundSnInputFocus(false), 60));
}

// 📹 เชื่อมต่อกล้องสแกนบาร์โค้ดมือถือสำหรับหน้าเบิกสินค้าออก
function openOutboundCameraScanner() {
    const snInput = getOutboundSnInputElement();
    if (snInput) {
        ensureOutboundSnInputFocus(true);
    }

    if (typeof window !== 'undefined' && typeof window.openCameraScanner === 'function') {
        window.openCameraScanner((scannedCode) => {
            if (scannedCode && snInput) {
                snInput.value = String(scannedCode).trim();
                handleOutboundSubmit();
            }
        });
        return;
    }

    if (typeof showToast === 'function') {
        showToast('📷 กรุณาใช้กล้องสแกนบาร์โค้ดหรือยิงปืนสแกนเข้าช่อง S/N ได้ทันที', false);
    }
}

// 💾 Cache & Feed Rendering (Debounced via requestAnimationFrame)
function loadRecentOutboundFeedFromCache() {
    try {
        const raw = localStorage.getItem(RECENT_OUTBOUND_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                recentOutboundList = parsed;
            }
        }
    } catch (e) {
        recentOutboundList = [];
    }
}

function saveRecentOutboundFeedToCache() {
    try {
        localStorage.setItem(RECENT_OUTBOUND_CACHE_KEY, JSON.stringify(recentOutboundList.slice(0, 120)));
    } catch (e) {}
}

function scheduleSaveRecentOutboundFeedCache() {
    if (outboundFeedSaveTimer) return;
    outboundFeedSaveTimer = setTimeout(() => {
        outboundFeedSaveTimer = null;
        saveRecentOutboundFeedToCache();
    }, 180);
}

function scheduleDebouncedOutboundFeedRender() {
    if (isOutboundFeedRenderScheduled) return;
    isOutboundFeedRenderScheduled = true;
    requestAnimationFrame(() => {
        isOutboundFeedRenderScheduled = false;
        renderLiveOutboundFeed();
    });
}

function onRecentOutboundSearch(query) {
    outboundSearchQuery = String(query || '').trim().toLowerCase();
    scheduleDebouncedOutboundFeedRender();
}

function clearRecentOutboundFeedView() {
    recentOutboundList = [];
    saveRecentOutboundFeedToCache();
    scheduleDebouncedOutboundFeedRender();
}

// ↩️ ยกเลิกการเบิกออก (คืนสินค้ากลับเข้าสต็อกในพิกัดเดิม)
async function undoOptimisticOutboundItem(sn) {
    const snUpper = String(sn || '').trim().toUpperCase();
    if (!snUpper) return;

    const feedIdx = recentOutboundList.findIndex(f => f && String(f.sn).trim().toUpperCase() === snUpper);
    const targetItem = feedIdx !== -1 ? recentOutboundList[feedIdx] : null;
    if (!targetItem) return;

    const beforeQueueLen = persistentOutboundDbQueue.length;
    persistentOutboundDbQueue = persistentOutboundDbQueue.filter(q => String(q.sn).trim().toUpperCase() !== snUpper);
    const wasStillInQueue = persistentOutboundDbQueue.length !== beforeQueueLen;
    if (wasStillInQueue) {
        savePersistentOutboundDbQueue(true);
    }

    pendingFastOutboundSnSet.delete(snUpper);
    recentOutboundList.splice(feedIdx, 1);
    saveRecentOutboundFeedToCache();

    const restoredObj = {
        id: targetItem.itemId || null,
        sn: targetItem.sn,
        category: targetItem.category || 'ทั่วไป',
        name: targetItem.name || 'สินค้าคลัง',
        model: targetItem.model || targetItem.name || 'สินค้าคลัง',
        unit: targetItem.unit || 'ชิ้น',
        meter: targetItem.meter || 0,
        location: targetItem.location || 'DOCK',
        qty: 1,
        status: 'IN_STOCK'
    };

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        const gIdx = globalInventoryData.findIndex(g => g && String(g.sn).trim().toUpperCase() === snUpper);
        if (gIdx !== -1) {
            globalInventoryData[gIdx].status = 'IN_STOCK';
            globalInventoryData[gIdx].qty = 1;
        } else {
            globalInventoryData.unshift(restoredObj);
        }
    }
    activeStockBySnMap.set(snUpper, restoredObj);

    scheduleDebouncedOutboundFeedRender();
    updateOutboundNetworkSyncHUD();

    if (navigator.onLine) {
        const client = typeof resolveWmsSupabaseClient === 'function'
            ? resolveWmsSupabaseClient()
            : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null));
        if (client) {
            try {
                await client
                    .from('warehouse_items')
                    .update({ status: 'IN_STOCK', qty: 1 })
                    .ilike('sn', String(targetItem.sn).trim());
            } catch (e) {}
        }
    }

    if (typeof showToast === 'function') {
        showToast(`↩️ ยกเลิกการเบิกออกและคืน S/N: ${targetItem.sn} กลับเข้าสต็อกแล้ว`, false);
    }

    document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: { ...restoredObj, action: 'RESTORE_STOCK', _localOptimistic: true } }));
}

// 📋 แสดงผลรวมทั้งประวัติใบงานจ่ายสินค้าออกจากคลัง (Work Orders) และรายการ S/N ล่าสุด
function renderLiveOutboundFeed() {
    const container = document.getElementById('liveOutboundFeedContainer') || document.getElementById('recentOutboundList');
    if (!container) return;

    let ordersSectionHtml = '';
    if (Array.isArray(recentOutboundOrdersList) && recentOutboundOrdersList.length > 0) {
        const filteredOrders = outboundSearchQuery
            ? recentOutboundOrdersList.filter(o =>
                String(o.do_number || '').toLowerCase().includes(outboundSearchQuery) ||
                String(o.ref_doc_no || '').toLowerCase().includes(outboundSearchQuery) ||
                String(o.ref_project || '').toLowerCase().includes(outboundSearchQuery) ||
                String(o.customer_name || '').toLowerCase().includes(outboundSearchQuery) ||
                String(o.dispatcher || '').toLowerCase().includes(outboundSearchQuery) ||
                (Array.isArray(o.items) && o.items.some(i => String(i.sn || '').toLowerCase().includes(outboundSearchQuery) || String(i.model || i.name || '').toLowerCase().includes(outboundSearchQuery)))
            )
            : recentOutboundOrdersList;

        if (filteredOrders.length > 0) {
            const orderCards = filteredOrders.slice(0, 20).map((order) => {
                const realIdx = recentOutboundOrdersList.indexOf(order);
                const doNo = escapeOutboundHTML(order.do_number || 'DO-UNKNOWN');
                const refDocNo = order.ref_doc_no ? escapeOutboundHTML(order.ref_doc_no) : '';
                const customer = escapeOutboundHTML(order.customer_name || 'ลูกค้าทั่วไป / หน่วยงานภายใน');
                const dispatcher = escapeOutboundHTML(order.dispatcher || 'เจ้าหน้าที่คลังสินค้า');
                const receiver = escapeOutboundHTML(order.receiver || '-');
                const itemCount = order.total_items || (Array.isArray(order.items) ? order.items.length : 0);
                const totalQty = order.total_qty || (Array.isArray(order.items) ? order.items.reduce((s, x) => s + (parseInt(x.qty, 10) || 1), 0) : itemCount);
                const timeStr = order.created_at ? new Date(order.created_at).toLocaleString('th-TH') : '-';

                let itemsPreviewHtml = '';
                if (Array.isArray(order.items)) {
                    itemsPreviewHtml = order.items.slice(0, 3).map(i => `
                        <div style="display:flex; justify-content:space-between; gap:8px; font-size:0.75rem; border-bottom:1px dashed var(--border-color, #e2e8f0); padding:3px 0;">
                            <span class="mono font-bold" style="color:var(--primary-text, #1d4ed8);">${escapeOutboundHTML(i.sn)}</span>
                            <span style="color:var(--text-sub, #475569);">${escapeOutboundHTML(i.model || i.name)} · <strong>${parseInt(i.qty, 10) || 1} ${escapeOutboundHTML(i.unit || 'ชิ้น')}</strong></span>
                        </div>
                    `).join('');
                    if (order.items.length > 3) {
                        itemsPreviewHtml += `<div style="font-size:0.72rem; color:var(--text-muted, #64748b); text-align:center; margin-top:2px;">... และอีก ${order.items.length - 3} รายการ</div>`;
                    }
                }

                return `
                    <div class="outbound-feed-card" style="border-left:4px solid #2563eb;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span class="mono font-bold" style="font-size:0.95rem; color:#1d4ed8;"><i class="fa-solid fa-file-invoice"></i> ${doNo}</span>
                            <span class="outbound-status-pill synced">${itemCount} รายการ (${totalQty} หน่วย)</span>
                        </div>
                        ${refDocNo ? `
                        <div style="font-size:0.76rem; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; display:inline-block; width:fit-content;">
                            <i class="fa-solid fa-file-contract"></i> อ้างอิงใบเบิก/PO: <span class="mono">${refDocNo}</span>
                        </div>` : ''}
                        <div style="font-size:0.82rem; font-weight:700; color:var(--text-main, #0f172a);">
                            <i class="fa-solid fa-building" style="color:#64748b;"></i> ปลายทาง: ${customer}
                        </div>
                        <div style="background:var(--bg-subtle, #f8fafc); padding:6px 10px; border-radius:8px;">
                            ${itemsPreviewHtml}
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; font-size:0.73rem; color:var(--text-muted, #64748b); border-top:1px solid var(--border-color, #e2e8f0); padding-top:6px;">
                            <span>จ่าย: <strong>${dispatcher}</strong> | รับ: <strong>${receiver}</strong> • ${timeStr}</span>
                            <button type="button" onclick="openSavedOutboundOrderByIndex(${realIdx})" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:4px 10px; border-radius:7px; font-size:0.74rem; font-weight:700; cursor:pointer;">
                                <i class="fa-solid fa-print"></i> เปิดใบงานจ่ายสินค้า
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            ordersSectionHtml = `
                <div style="margin-bottom:14px;">
                    <div style="font-size:0.84rem; font-weight:800; color:var(--text-main, #0f172a); margin-bottom:8px;">
                        <i class="fa-solid fa-folder-open" style="color:#2563eb;"></i> ประวัติใบงานจ่ายสินค้าออกจากคลังล่าสุด
                    </div>
                    <div class="outbound-feed-grid">${orderCards}</div>
                </div>
            `;
        }
    }

    const filteredItems = outboundSearchQuery
        ? recentOutboundList.filter(item =>
            String(item.sn || '').toLowerCase().includes(outboundSearchQuery) ||
            String(item.model || item.name || '').toLowerCase().includes(outboundSearchQuery) ||
            String(item.location || '').toLowerCase().includes(outboundSearchQuery) ||
            String(item.recipient || '').toLowerCase().includes(outboundSearchQuery)
        )
        : recentOutboundList;

    if (!ordersSectionHtml && filteredItems.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:24px 16px; color:var(--text-muted, #64748b); background:var(--bg-subtle, #f8fafc); border:1px dashed var(--border-color, #cbd5e1); border-radius:14px;">
                <i class="fa-solid fa-box-open" style="font-size:1.6rem; opacity:0.5; margin-bottom:6px; display:block;"></i>
                <div style="font-weight:700; font-size:0.85rem;">ยังไม่มีประวัติการจ่ายสินค้าและออกใบงานในรอบนี้</div>
                <div style="font-size:0.75rem; margin-top:2px;">ยิงบาร์โค้ด S/N เพื่อเพิ่มลงใบงานจ่ายสินค้าและตัดสต็อกอัตโนมัติ</div>
            </div>
        `;
        return;
    }

    let itemsSectionHtml = '';
    if (filteredItems.length > 0) {
        const visibleSlice = filteredItems.slice(0, 60);
        const cardsHtml = visibleSlice.map(item => {
            const safeSn = escapeOutboundHTML(item.sn);
            const safeModel = escapeOutboundHTML(item.model || item.name || '-');
            const safeCat = escapeOutboundHTML(item.category || '-');
            const safeQty = parseInt(item.qty, 10) || 1;
            const safeUnit = escapeOutboundHTML(item.unit || 'ชิ้น');
            const safeLoc = escapeOutboundHTML(formatOutboundLocationText(item.location));
            const safeRecipient = item.recipient ? escapeOutboundHTML(item.recipient) : '';
            const safeOperator = escapeOutboundHTML(item.dispatched_by || 'เจ้าหน้าที่คลังสินค้า');
            const safeTime = escapeOutboundHTML(item.time || '');

            let statusBadge = `<span class="outbound-status-pill synced"><i class="fa-solid fa-circle-check"></i> ตัดสต็อก DB แล้ว</span>`;
            if (item.db_status === 'SYNCING') {
                statusBadge = `<span class="outbound-status-pill syncing"><i class="fa-solid fa-arrows-rotate fa-spin"></i> กำลังรันคิว DB</span>`;
            } else if (item.db_status === 'PENDING' || item.isOffline) {
                statusBadge = `<span class="outbound-status-pill pending"><i class="fa-solid fa-clock"></i> รอเน็ตซิงค์</span>`;
            }

            return `
                <div class="outbound-feed-card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div class="full-sn-text" style="font-size:0.92rem; color:#0f172a;">${safeSn}</div>
                        ${statusBadge}
                    </div>
                    <div style="font-size:0.8rem; font-weight:700; color:#334155;">
                        ${safeModel} <span style="font-weight:600; color:#0369a1;">(${safeQty} ${safeUnit})</span> <span style="font-weight:500; color:#64748b;">[${safeCat}]</span>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; font-size:0.74rem; color:#475569;">
                        <span style="background:#f1f5f9; padding:2px 8px; border-radius:6px; font-weight:700;">🔓 คืนพิกัด: ${safeLoc}</span>
                        ${safeRecipient ? `<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:6px; font-weight:700;">👤 ผู้รับ: ${safeRecipient}</span>` : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #e2e8f0; padding-top:6px; margin-top:2px; font-size:0.72rem; color:#64748b;">
                        <span>โดย ${safeOperator} • ${safeTime}</span>
                        <button type="button" onclick="undoOptimisticOutboundItem('${safeSn}')" class="btn-card-action" style="padding:3px 8px; min-height:26px; font-size:0.71rem;">
                            <i class="fa-solid fa-rotate-left"></i> คืนสต็อก
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        itemsSectionHtml = `
            <div>
                <div style="font-size:0.84rem; font-weight:800; color:var(--text-main, #0f172a); margin-bottom:8px;">
                    <i class="fa-solid fa-barcode" style="color:#059669;"></i> รายการ S/N ที่ตัดจ่ายออกจากคลังล่าสุด
                </div>
                <div class="outbound-feed-grid">${cardsHtml}</div>
            </div>
        `;
    }

    container.innerHTML = ordersSectionHtml + itemsSectionHtml;
}

function initOutboundEventListeners() {
    injectOutboundModernStyles();
    loadOutboundCompanyProfile();
    loadPersistentOutboundDbQueue();
    loadRecentOutboundFeedFromCache();
    rebuildActiveStockIndex(true);

    const snInput = getOutboundSnInputElement();
    if (snInput) {
        attachUniversalOutboundScannerListener(snInput);
    }

    if (typeof renderOutboundCartTable === 'function') {
        renderOutboundCartTable();
    }

    ensureOutboundInstantScanBoxIndicator();
    ensureOutboundNetworkSyncHUD();
    updateOutboundNetworkSyncHUD();
    initOutboundNetworkStatusListeners();
    initOutboundRealtimeListeners();

    if (typeof initOutboundOrderRealtimeListener === 'function') {
        initOutboundOrderRealtimeListener();
    }
    if (typeof loadRecentOutboundFeedFromDB === 'function') {
        loadRecentOutboundFeedFromDB();
    } else {
        scheduleDebouncedOutboundFeedRender();
    }

    const outboundForm = document.getElementById('outboundForm') || (snInput && snInput.closest('form'));
    if (outboundForm && outboundForm.dataset.outboundFormBound !== 'true') {
        outboundForm.dataset.outboundFormBound = 'true';
        outboundForm.addEventListener('submit', handleOutboundSubmit);
    }

    const submitOutboundBtn = document.getElementById('btnOutboundSubmit') || document.getElementById('submitOutboundBtn');
    if (submitOutboundBtn && submitOutboundBtn.dataset.outboundBtnBound !== 'true') {
        submitOutboundBtn.dataset.outboundBtnBound = 'true';
        submitOutboundBtn.addEventListener('click', handleOutboundSubmit);
    }

    const confirmDispatchBtn = document.getElementById('btnConfirmOutbound') || document.getElementById('confirmOutboundBtn');
    if (confirmDispatchBtn && confirmDispatchBtn.dataset.outboundConfirmBound !== 'true') {
        confirmDispatchBtn.dataset.outboundConfirmBound = 'true';
        confirmDispatchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof requestOutboundApproval === 'function') {
                requestOutboundApproval();
            }
        });
    }

    const outboundCamBtn = document.getElementById('btnOutboundCameraScan') || document.getElementById('outboundCameraBtn');
    if (outboundCamBtn && outboundCamBtn.dataset.outboundCamBound !== 'true') {
        outboundCamBtn.dataset.outboundCamBound = 'true';
        outboundCamBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openOutboundCameraScanner();
        });
    }

    if (navigator.onLine && persistentOutboundDbQueue.length > 0) {
        flushPersistentOutboundSyncQueue();
    }
}

if (typeof window !== 'undefined') {
    window.recentOutboundList = recentOutboundList;
    window.outboundCartList = outboundCartList;
    window.recentOutboundOrdersList = recentOutboundOrdersList;
    window.checkOutboundUserIsAdmin = checkOutboundUserIsAdmin;
    window.inferOutboundItemModel = inferOutboundItemModel;
    window.inferOutboundItemUnit = inferOutboundItemUnit;
    window.rebuildActiveStockIndex = rebuildActiveStockIndex;
    window.findActiveStockItemBySn = findActiveStockItemBySn;
    window.markStockItemDispatchedInMemory = markStockItemDispatchedInMemory;
    window.ensureOutboundSnInputFocus = ensureOutboundSnInputFocus;
    window.ensureOutboundInstantScanBoxIndicator = ensureOutboundInstantScanBoxIndicator;
    window.renderOutboundInstantScanBoxStatus = renderOutboundInstantScanBoxStatus;
    window.handleOutboundSubmit = handleOutboundSubmit;
    window.processOutboundScanQueue = processOutboundScanQueue;
    window.flushPersistentOutboundSyncQueue = flushPersistentOutboundSyncQueue;
    window.clearStuckOutboundSyncQueue = clearStuckOutboundSyncQueue;
    window.updateOutboundNetworkSyncHUD = updateOutboundNetworkSyncHUD;
    window.openOutboundCameraScanner = openOutboundCameraScanner;
    window.undoOptimisticOutboundItem = undoOptimisticOutboundItem;
    window.onRecentOutboundSearch = onRecentOutboundSearch;
    window.clearRecentOutboundFeedView = clearRecentOutboundFeedView;
    window.renderLiveOutboundFeed = renderLiveOutboundFeed;
    window.initOutboundEventListeners = initOutboundEventListeners;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initOutboundEventListeners();
    });
} else {
    initOutboundEventListeners();
}