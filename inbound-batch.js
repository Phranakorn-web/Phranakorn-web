// =========================================================================
// --- MODULE 3.3: HIGH-SPEED BATCH S/N GENERATOR & DOC REF BINDER ---
// --- Single Quick Random S/N + 10 to 1,000+ Auto S/N Creation ---
// =========================================================================

const BATCH_SN_CHUNK_SIZE = 200;
const MAX_BATCH_SN_LIMIT = 2000;

function buildDefaultSnPrefixFromSku(skuStr) {
    const cleanSku = String(skuStr || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${cleanSku || 'SN'}${yy}${mm}${dd}`;
}

// ปุ่ม "สุ่ม" ในช่อง S/N ของ index.html
function generateAutoSN() {
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

    const ctx = typeof getSelectedInboundFormContext === 'function'
        ? getSelectedInboundFormContext()
        : { sku: '' };

    const prefix = buildDefaultSnPrefixFromSku(ctx.sku);
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    const seqPart = String((Date.now() % 10000)).padStart(4, '0');
    snInput.value = `${prefix}-${seqPart}${randomPart}`;
    snInput.focus();
    snInput.select();
}

function ensureBatchSnGeneratorBar() {
    if (document.getElementById('wmsBatchSnGeneratorBar')) {
        updateBatchSnBarDocContextHint();
        return document.getElementById('wmsBatchSnGeneratorBar');
    }

    const snInput = document.getElementById('inboundSn');
    if (!snInput) return null;

    const snRowGrid = snInput.closest('.form-grid') || snInput.parentElement;
    if (!snRowGrid || !snRowGrid.parentElement) return null;

    const bar = document.createElement('div');
    bar.id = 'wmsBatchSnGeneratorBar';
    bar.className = 'wms-batch-sn-bar';
    bar.innerHTML = `
        <div class="wms-batch-sn-bar-header">
            <div style="display:flex; align-items:center; gap:9px; min-width:0; flex:1 1 240px;">
                <span class="wms-batch-icon-pill"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
                <div style="min-width:0;">
                    <div style="font-size:0.82rem; font-weight:800; color:var(--text-main);">
                        สุ่มสร้าง S/N อัตโนมัติชุดใหญ่ (10 – 1,000+ รายการ)
                    </div>
                    <div id="wmsBatchDocContextHint" style="font-size:0.72rem; color:var(--text-sub); margin-top:2px;">
                        ผูกเลขที่ใบกำกับภาษีและ PO เข้ากับทุก S/N อัตโนมัติ
                    </div>
                </div>
            </div>
            <div id="wmsBatchProgressBadge" style="display:none; align-items:center; gap:6px; padding:3px 10px; border-radius:99px; background:var(--primary-light); color:var(--primary-text); font-size:0.72rem; font-weight:800;">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span id="wmsBatchProgressText">กำลังสร้าง...</span>
            </div>
        </div>

        <div class="wms-batch-sn-btn-row">
            <button type="button" class="btn-batch-sn-preset" onclick="runBatchGenerateInboundSn(10)">
                <i class="fa-solid fa-bolt"></i> +10 รายการ
            </button>
            <button type="button" class="btn-batch-sn-preset" onclick="runBatchGenerateInboundSn(50)">
                <i class="fa-solid fa-layer-group"></i> +50 รายการ
            </button>
            <button type="button" class="btn-batch-sn-preset highlight" onclick="runBatchGenerateInboundSn(100)">
                <i class="fa-solid fa-fire"></i> +100 รายการ
            </button>
            <button type="button" class="btn-batch-sn-preset custom" onclick="openCustomBatchSnModal()">
                <i class="fa-solid fa-sliders"></i> กำหนดเอง
            </button>
        </div>
    `;

    if (snRowGrid.nextSibling) {
        snRowGrid.parentElement.insertBefore(bar, snRowGrid.nextSibling);
    } else {
        snRowGrid.parentElement.appendChild(bar);
    }

    updateBatchSnBarDocContextHint();
    return bar;
}

function updateBatchSnBarDocContextHint() {
    const hintEl = document.getElementById('wmsBatchDocContextHint');
    if (!hintEl) return;

    const docs = typeof getActiveInboundDocRefs === 'function'
        ? getActiveInboundDocRefs()
        : { taxInvoice: '', poNumber: '', hasAnyDoc: false };

    if (docs.hasAnyDoc) {
        const parts = [];
        if (docs.taxInvoice) parts.push(`<strong class="mono" style="color:var(--primary-text);">INV: ${escapeHTML(docs.taxInvoice)}</strong>`);
        if (docs.poNumber) parts.push(`<strong class="mono" style="color:var(--purple-text);">PO: ${escapeHTML(docs.poNumber)}</strong>`);
        hintEl.innerHTML = `ผูกเอกสารทุกชิ้นในชุด: ${parts.join(' • ')}`;
    } else {
        hintEl.innerHTML = `ระบุเลขที่ใบกำกับภาษี / PO ด้านบนก่อนกดสุ่ม เพื่อผูกเอกสารเข้ากับ S/N ทั้งชุด`;
    }
}

function openCustomBatchSnModal() {
    if (isBatchGenerating) {
        showToast('⏳ ระบบกำลังสร้างชุด S/N อยู่ กรุณารอสักครู่...', true, 2000);
        return;
    }

    const ctx = typeof getSelectedInboundFormContext === 'function'
        ? getSelectedInboundFormContext()
        : { sku: '', name: '', aisle: 'DOCK', taxInvoice: '', poNumber: '' };

    if (!ctx.sku && !ctx.name) {
        if (typeof playAudioFeedback === 'function') playAudioFeedback('error');
        showToast('⚠️ กรุณาค้นหาหรือกรอกรหัสสินค้า (SKU / ชื่อรุ่น) ก่อนสุ่มสร้าง S/N', true, 2600);
        const skuField = document.getElementById('skuSearchInput') || document.getElementById('inboundCategory');
        if (skuField) skuField.focus();
        return;
    }

    let modal = document.getElementById('wmsCustomBatchSnModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsCustomBatchSnModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeCustomBatchSnModal();
        });
        document.body.appendChild(modal);
    }

    const suggestedPrefix = buildDefaultSnPrefixFromSku(ctx.sku);

    modal.innerHTML = `
        <div class="card" style="width:450px; max-width:94vw; padding:1.4rem;">
            <div class="card-header">
                <div class="card-title"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--primary);"></i> กำหนดจำนวนสร้าง S/N ชุดใหญ่</div>
                <button type="button" class="btn btn-sm btn-secondary" onclick="closeCustomBatchSnModal()">&times;</button>
            </div>

            <div style="background:var(--primary-light); border:1px solid var(--primary-border); border-radius:10px; padding:9px 12px; margin-bottom:12px; font-size:0.8rem;">
                <div>สินค้า: <strong class="mono">${escapeHTML(ctx.sku)}</strong> — ${escapeHTML(ctx.name)}</div>
                <div style="margin-top:3px;">ใบกำกับฯ: <strong class="mono">${escapeHTML(ctx.taxInvoice || '-')}</strong> • PO: <strong class="mono">${escapeHTML(ctx.poNumber || '-')}</strong></div>
            </div>

            <div class="form-group">
                <label for="customBatchQtyInput">จำนวน S/N ที่ต้องการสร้าง (1 – ${MAX_BATCH_SN_LIMIT.toLocaleString()} รายการ)</label>
                <input type="number" id="customBatchQtyInput" class="form-control mono font-bold" min="1" max="${MAX_BATCH_SN_LIMIT}" value="25">
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                    ${[5, 20, 100, 250, 500, 1000].map(q => `
                        <button type="button" class="wms-mini-tool-btn" onclick="document.getElementById('customBatchQtyInput').value=${q}">+${q}</button>
                    `).join('')}
                </div>
            </div>

            <div class="form-group">
                <label for="customBatchPrefixInput">คำนำหน้า Serial Number (Prefix)</label>
                <input type="text" id="customBatchPrefixInput" class="form-control mono font-bold" value="${escapeHTML(suggestedPrefix)}" maxlength="24">
            </div>

            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:1rem;">
                <button type="button" class="btn btn-secondary" onclick="closeCustomBatchSnModal()">ยกเลิก</button>
                <button type="button" class="btn btn-primary" onclick="confirmCustomBatchSnModal()">
                    <i class="fa-solid fa-bolt"></i> สร้าง S/N ทันที
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    const qtyInput = document.getElementById('customBatchQtyInput');
    if (qtyInput) setTimeout(() => { qtyInput.focus(); qtyInput.select(); }, 40);
}

function closeCustomBatchSnModal() {
    const modal = document.getElementById('wmsCustomBatchSnModal');
    if (modal) modal.style.display = 'none';
    if (typeof ensureSnInputFocus === 'function') ensureSnInputFocus(true);
}

function confirmCustomBatchSnModal() {
    const qty = parseInt(document.getElementById('customBatchQtyInput')?.value || '0', 10);
    const prefix = String(document.getElementById('customBatchPrefixInput')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!qty || qty < 1 || qty > MAX_BATCH_SN_LIMIT) {
        showToast(`⚠️ กรุณาระบุจำนวนระหว่าง 1 ถึง ${MAX_BATCH_SN_LIMIT.toLocaleString()} รายการ`, true, 2400);
        return;
    }
    closeCustomBatchSnModal();
    runBatchGenerateInboundSn(qty, prefix);
}

function collectBatchTargetLocations(aisleCode, countNeeded) {
    const isDock = String(aisleCode || 'DOCK').trim().toUpperCase() === 'DOCK';
    if (isDock) {
        return Array.from({ length: countNeeded }, () => 'DOCK');
    }

    const occSet = typeof rebuildOccupiedLocationsSet === 'function'
        ? rebuildOccupiedLocationsSet(true)
        : new Set();

    const baySel = document.getElementById('inboundBaySelect');
    const shelfSel = document.getElementById('inboundShelfSelect');
    const slotSel = document.getElementById('inboundSlotSelect');

    const getVals = (sel, def) => {
        if (sel && sel.options && sel.options.length > 0) {
            return Array.from(sel.options).map(o => o.value).filter(Boolean);
        }
        return Array.from({ length: def }, (_, i) => String(i + 1).padStart(2, '0'));
    };

    const bays = getVals(baySel, 10);
    const shelves = getVals(shelfSel, 5);
    const slots = getVals(slotSel, 10);

    const allCoords = [];
    for (let b = 0; b < bays.length; b++) {
        for (let sh = 0; sh < shelves.length; sh++) {
            for (let sl = 0; sl < slots.length; sl++) {
                allCoords.push(`${aisleCode}-${bays[b]}-${shelves[sh]}-${slots[sl]}`);
            }
        }
    }

    const curCoord = `${aisleCode}-${baySel?.value || bays[0]}-${shelfSel?.value || shelves[0]}-${slotSel?.value || slots[0]}`;
    let startIdx = allCoords.indexOf(curCoord);
    if (startIdx < 0) startIdx = 0;

    const freeList = [];
    for (let offset = 0; offset < allCoords.length; offset++) {
        const candidate = allCoords[(startIdx + offset) % allCoords.length];
        if (!occSet.has(candidate.replace(/\s+/g, '').toUpperCase())) {
            freeList.push(candidate);
            if (freeList.length >= countNeeded) break;
        }
    }
    return freeList;
}

async function runBatchGenerateInboundSn(requestedCount = 10, customPrefix = '') {
    if (isBatchGenerating) return false;

    const count = Math.max(1, Math.min(MAX_BATCH_SN_LIMIT, parseInt(requestedCount, 10) || 10));
    const ctx = typeof getSelectedInboundFormContext === 'function'
        ? getSelectedInboundFormContext()
        : { sku: '', name: '', aisle: 'DOCK', meter: '0', taxInvoice: '', poNumber: '', recordedBy: 'admin' };

    if (!ctx.sku && !ctx.name) {
        if (typeof playAudioFeedback === 'function') playAudioFeedback('error');
        showToast('⚠️ กรุณาค้นหาหรือกรอกรหัสสินค้า (SKU / ชื่อรุ่น) ก่อนสุ่มสร้าง S/N', true, 2600);
        const skuField = document.getElementById('skuSearchInput') || document.getElementById('inboundCategory');
        if (skuField) skuField.focus();
        return false;
    }

    const aisleCode = ctx.aisle || 'DOCK';
    const targetLocations = collectBatchTargetLocations(aisleCode, count);

    if (targetLocations.length < count) {
        if (typeof playAudioFeedback === 'function') playAudioFeedback('occupied');
        showToast(`⚠️ แถว ${aisleCode} เหลือช่องว่างเพียง ${targetLocations.length.toLocaleString()} ช่อง (ไม่พอสำหรับ ${count.toLocaleString()} ชิ้น)`, true, 3200);
        return false;
    }

    isBatchGenerating = true;
    const progressBadge = document.getElementById('wmsBatchProgressBadge');
    const progressText = document.getElementById('wmsBatchProgressText');
    if (progressBadge) progressBadge.style.display = 'inline-flex';

    const existingSnSet = new Set(pendingFastSnSet);
    (Array.isArray(recentInboundList) ? recentInboundList : []).forEach(r => {
        if (r?.sn) existingSnSet.add(String(r.sn).trim().toUpperCase());
    });

    const basePrefix = customPrefix || buildDefaultSnPrefixFromSku(ctx.sku);
    const createdRecords = [];
    const baseMs = Date.now();
    let seq = 1;

    try {
        for (let start = 0; start < count; start += BATCH_SN_CHUNK_SIZE) {
            const end = Math.min(count, start + BATCH_SN_CHUNK_SIZE);
            for (let i = start; i < end; i++) {
                let sn = '';
                while (true) {
                    const salt = batchSnMonotonicSeed > 0 ? `-${batchSnMonotonicSeed}` : '';
                    sn = `${basePrefix}${salt}-${String(seq).padStart(4, '0')}`;
                    seq++;
                    const up = sn.toUpperCase();
                    if (!existingSnSet.has(up)) {
                        existingSnSet.add(up);
                        break;
                    }
                    if (seq > count + 50000) {
                        batchSnMonotonicSeed++;
                        seq = 1;
                    }
                }

                const loc = targetLocations[i];
                pendingFastSnSet.add(sn.toUpperCase());
                if (typeof addOccupiedLocToSet === 'function') {
                    addOccupiedLocToSet(pendingFastLocationSet, loc);
                }

                const iso = new Date(baseMs + i).toISOString();
                const tempId = `TMP_B_${baseMs}_${i}_${++dbSyncSequenceCounter}`;

                const rec = {
                    id: tempId,
                    sku: ctx.sku,
                    category: ctx.sku,
                    name: ctx.name || ctx.sku,
                    sn,
                    meter: ctx.meter,
                    location: loc,
                    status: 'IN_STOCK',
                    recorded_by: ctx.recordedBy,
                    tax_invoice_no: ctx.taxInvoice || '',
                    po_number: ctx.poNumber || '',
                    created_at: iso,
                    db_status: 'QUEUED',
                    isOffline: !navigator.onLine
                };

                createdRecords.push(rec);
                persistentDbSyncQueue.push({
                    queueId: tempId,
                    enqueuedAt: iso,
                    retryCount: 0,
                    payload: rec
                });
            }

            if (progressText) progressText.textContent = `กำลังสร้าง ${end.toLocaleString()} / ${count.toLocaleString()}...`;
            if (end < count) await new Promise(r => requestAnimationFrame(r));
        }

        const reversed = createdRecords.slice().reverse();
        recentInboundList.unshift(...reversed);
        if (typeof window !== 'undefined') window.recentInboundList = recentInboundList;

        if ((ctx.taxInvoice || ctx.poNumber) && typeof recordInboundDocUsage === 'function') {
            recordInboundDocUsage(ctx.taxInvoice, ctx.poNumber, createdRecords.length);
        }

        if (!isInboundDocRefLocked && (ctx.taxInvoice || ctx.poNumber) && typeof setInboundDocRefs === 'function') {
            setInboundDocRefs('', '', false);
        }

        if (typeof forceSyncAndSelectAvailableLocation === 'function') {
            forceSyncAndSelectAvailableLocation(true);
        }

        sessionScannedSuccessCount += createdRecords.length;
        if (typeof playAudioFeedback === 'function') playAudioFeedback('success');

        renderInstantScanBoxStatus('success', `${createdRecords.length.toLocaleString()} รายการ`, targetLocations[targetLocations.length - 1], persistentDbSyncQueue.length, 0);

        if (typeof savePersistentDbQueue === 'function') savePersistentDbQueue();
        if (typeof scheduleNonBlockingRecentFeedSave === 'function') scheduleNonBlockingRecentFeedSave();
        if (typeof updateInboundNetworkSyncHUD === 'function') updateInboundNetworkSyncHUD();
        if (typeof renderLiveInboundFeed === 'function') renderLiveInboundFeed();

        if (typeof flushPersistentDbSyncQueue === 'function') {
            setTimeout(() => flushPersistentDbSyncQueue(false), 30);
        }

        showToast(`✅ สร้างและบันทึกสำเร็จ ${createdRecords.length.toLocaleString()} รายการ กำลังซิงก์เข้า Supabase!`, false, 3000);
        return true;
    } finally {
        isBatchGenerating = false;
        if (progressBadge) progressBadge.style.display = 'none';
        if (typeof ensureSnInputFocus === 'function') ensureSnInputFocus(true);
    }
}