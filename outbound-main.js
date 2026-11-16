// =========================================================================
// --- MODULE 4.3: OUTBOUND UNIVERSAL SCANNER, CAMERA & FEED CONTROLLER ---
// --- All Scanner Guns, Mobile Camera Bridge, Undo & Global Exports ---
// =========================================================================

// 🔫 ตัวจัดการปืนสแกนบาร์โค้ดทุกประเภทสำหรับหน้าเบิกสินค้าออก
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
            }, 55);
        }
    });

    snInput.addEventListener('keydown', function (e) {
        getOutboundSharedAudioContext();

        if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Tab') {
            e.preventDefault();
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
    });

    snInput.addEventListener('input', function () {
        cancelBurstTimer();
        if (!isComposingIme && burstKeyCount >= 3 && snInput.value.trim().length >= 3) {
            burstAutoSubmitTimer = setTimeout(() => {
                burstKeyCount = 0;
                if (snInput.value.trim().length >= 3) {
                    handleOutboundSubmit();
                }
            }, 55);
        }
    });

    snInput.addEventListener('paste', function () {
        cancelBurstTimer();
        burstKeyCount = 0;
        setTimeout(() => {
            if (snInput.value && snInput.value.trim().length > 0) {
                handleOutboundSubmit();
            }
        }, 10);
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

    const feedIdx = recentOutboundList.findIndex(f => f && String(f.sn).toUpperCase() === snUpper);
    const targetItem = feedIdx !== -1 ? recentOutboundList[feedIdx] : null;
    if (!targetItem) return;

    // 1. ลบออกจากคิวรอส่ง DB (ถ้ายังไม่ถูกยิงขึ้น DB)
    const beforeQueueLen = persistentOutboundDbQueue.length;
    persistentOutboundDbQueue = persistentOutboundDbQueue.filter(q => String(q.sn).toUpperCase() !== snUpper);
    const wasStillInQueue = persistentOutboundDbQueue.length !== beforeQueueLen;
    if (wasStillInQueue) {
        savePersistentOutboundDbQueue(true);
    }

    // 2. คืนสถานะในหน่วยความจำทันที 0ms
    pendingFastOutboundSnSet.delete(snUpper);
    recentOutboundList.splice(feedIdx, 1);
    saveRecentOutboundFeedToCache();

    const restoredObj = {
        id: targetItem.itemId || null,
        sn: targetItem.sn,
        category: targetItem.category || 'ทั่วไป',
        name: targetItem.name || 'สินค้าคลัง',
        meter: targetItem.meter || 0,
        location: targetItem.location || 'DOCK',
        qty: 1,
        status: 'IN_STOCK'
    };

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        const gIdx = globalInventoryData.findIndex(g => g && String(g.sn).toUpperCase() === snUpper);
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

    // 3. หากเคยอัปเดตลง Supabase ไปแล้ว ให้สั่งคืนสถานะ IN_STOCK ใน DB ด้วย
    if (!wasStillInQueue && navigator.onLine) {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
        if (client) {
            try {
                await client
                    .from('warehouse_items')
                    .update({ status: 'IN_STOCK', qty: 1 })
                    .eq('sn', targetItem.sn);
            } catch (e) {}
        }
    }

    if (typeof showToast === 'function') {
        showToast(`↩️ ยกเลิกการเบิกออกและคืน S/N: ${targetItem.sn} กลับเข้าสต็อกแล้ว`, false);
    }

    document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: { ...restoredObj, action: 'RESTORE_STOCK', _localOptimistic: true } }));
}

function renderLiveOutboundFeed() {
    const container = document.getElementById('liveOutboundFeedContainer') || document.getElementById('recentOutboundList');
    if (!container) return;

    const filtered = outboundSearchQuery
        ? recentOutboundList.filter(item =>
            String(item.sn || '').toLowerCase().includes(outboundSearchQuery) ||
            String(item.name || '').toLowerCase().includes(outboundSearchQuery) ||
            String(item.location || '').toLowerCase().includes(outboundSearchQuery) ||
            String(item.recipient || '').toLowerCase().includes(outboundSearchQuery)
        )
        : recentOutboundList;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:24px 16px; color:var(--text-muted, #64748b); background:var(--bg-subtle, #f8fafc); border:1px dashed var(--border-color, #cbd5e1); border-radius:14px;">
                <i class="fa-solid fa-box-open" style="font-size:1.6rem; opacity:0.5; margin-bottom:6px; display:block;"></i>
                <div style="font-weight:700; font-size:0.85rem;">ยังไม่มีรายการสแกนเบิกสินค้าออกในรอบนี้</div>
                <div style="font-size:0.75rem; margin-top:2px;">ยิงบาร์โค้ด S/N เพื่อตัดสต็อกและคืนพิกัดจัดเก็บอัตโนมัติ</div>
            </div>
        `;
        return;
    }

    // แสดงสูงสุด 60 การ์ดล่าสุดเพื่อให้ DOM ลื่นไหล 60fps แม้สแกนต่อเนื่อง 1,000+ ชิ้น
    const visibleSlice = filtered.slice(0, 60);

    const cardsHtml = visibleSlice.map(item => {
        const safeSn = escapeOutboundHTML(item.sn);
        const safeName = escapeOutboundHTML(item.name || '-');
        const safeCat = escapeOutboundHTML(item.category || '-');
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
                    ${safeName} <span style="font-weight:500; color:#64748b;">(${safeCat})</span>
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

    container.innerHTML = `<div class="outbound-feed-grid">${cardsHtml}</div>`;
}

function initOutboundEventListeners() {
    injectOutboundModernStyles();
    loadPersistentOutboundDbQueue();
    loadRecentOutboundFeedFromCache();
    rebuildActiveStockIndex(true);

    const snInput = getOutboundSnInputElement();
    if (snInput) {
        attachUniversalOutboundScannerListener(snInput);
    }

    ensureOutboundInstantScanBoxIndicator();
    ensureOutboundNetworkSyncHUD();
    updateOutboundNetworkSyncHUD();
    initOutboundNetworkStatusListeners();
    initOutboundRealtimeListeners();
    scheduleDebouncedOutboundFeedRender();

    // เชื่อมปุ่มบันทึกเบิกออก / ปุ่มเปิดกล้องสแกนในหน้าเบิกสินค้าออก
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
    window.rebuildActiveStockIndex = rebuildActiveStockIndex;
    window.findActiveStockItemBySn = findActiveStockItemBySn;
    window.markStockItemDispatchedInMemory = markStockItemDispatchedInMemory;
    window.ensureOutboundSnInputFocus = ensureOutboundSnInputFocus;
    window.ensureOutboundInstantScanBoxIndicator = ensureOutboundInstantScanBoxIndicator;
    window.renderOutboundInstantScanBoxStatus = renderOutboundInstantScanBoxStatus;
    window.handleOutboundSubmit = handleOutboundSubmit;
    window.processOutboundScanQueue = processOutboundScanQueue;
    window.flushPersistentOutboundSyncQueue = flushPersistentOutboundSyncQueue;
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