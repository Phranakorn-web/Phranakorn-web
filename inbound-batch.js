// =========================================================================
// --- MODULE 3.3: BATCH SN GENERATOR & AUTO-ALLOCATION QUEUE ENGINE ---
// --- Single Auto-SN, 100/500/1000/Custom Batch Generator & Modal ---
// =========================================================================

// คงปุ่มสุ่มเดิมไว้สำหรับสุ่มทีละ 1 อัน (ใส่ในช่อง S/N ทันทีไม่ทับซ้อน)
function generateAutoSN() {
    const snInput = document.getElementById('inboundSn');
    if (!snInput) return;

    const existingSnSet = collectAllExistingSnSet();
    const prefix = 'SN-' + new Date().getFullYear();
    let candidate = '';

    for (let attempt = 0; attempt < 200; attempt++) {
        const rand = Math.floor(100000 + Math.random() * 900000);
        const testSn = `${prefix}-${rand}`;
        if (!existingSnSet.has(testSn.toUpperCase())) {
            candidate = testSn;
            break;
        }
    }

    if (!candidate) {
        batchSnMonotonicSeed++;
        candidate = `${prefix}-${Date.now().toString().slice(-6)}${String(batchSnMonotonicSeed % 100).padStart(2, '0')}`;
    }

    snInput.value = candidate;
    triggerScanInputFlash('success');
    ensureSnInputFocus(true);
}

function collectAllExistingSnSet() {
    const snSet = new Set();
    pendingFastSnSet.forEach(s => snSet.add(String(s).trim().toUpperCase()));

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        for (let i = 0; i < globalInventoryData.length; i++) {
            const item = globalInventoryData[i];
            if (item && item.sn) snSet.add(String(item.sn).trim().toUpperCase());
        }
    }
    if (Array.isArray(recentInboundList)) {
        for (let i = 0; i < recentInboundList.length; i++) {
            const item = recentInboundList[i];
            if (item && item.sn) snSet.add(String(item.sn).trim().toUpperCase());
        }
    }
    if (Array.isArray(persistentDbSyncQueue)) {
        for (let i = 0; i < persistentDbSyncQueue.length; i++) {
            const item = persistentDbSyncQueue[i] && persistentDbSyncQueue[i].payload;
            if (item && item.sn) snSet.add(String(item.sn).trim().toUpperCase());
        }
    }
    return snSet;
}

// 🟢 สร้างชุด S/N แบบไม่ซ้ำกัน 100% (รองรับตั้งแต่ 1 ถึง 10,000+ รายการ)
function generateUniqueBatchSnList(qty, customPrefix = '') {
    const existingSnSet = collectAllExistingSnSet();
    const yearStr = String(new Date().getFullYear());
    const cleanPrefix = (customPrefix || `SN-${yearStr}`).trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
    const results = [];

    let attempts = 0;
    const maxAttempts = qty * 25 + 5000;

    while (results.length < qty && attempts < maxAttempts) {
        attempts++;
        batchSnMonotonicSeed++;
        let candidate = '';
        if (attempts <= qty * 3) {
            const rand6 = Math.floor(100000 + Math.random() * 900000);
            candidate = `${cleanPrefix}-${rand6}`;
        } else {
            const timeTail = Date.now().toString(36).toUpperCase().slice(-4);
            const seqTail = String(batchSnMonotonicSeed).padStart(4, '0');
            const rand2 = Math.floor(10 + Math.random() * 90);
            candidate = `${cleanPrefix}-${timeTail}${seqTail}${rand2}`;
        }

        const upper = candidate.toUpperCase();
        if (!existingSnSet.has(upper)) {
            existingSnSet.add(upper);
            results.push(candidate);
        }
    }

    return results;
}

// 🟢 จัดสรรคิวพิกัดว่างตามลำดับ ไม่ให้พิกัดซ้ำกัน 100%
function buildBatchAvailableLocationsQueue(aisleName, startBay, startShelf, startSlot, qty) {
    const aisle = String(aisleName || '').trim().toUpperCase();
    const specialZones = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];

    if (specialZones.includes(aisle)) {
        return {
            locations: new Array(qty).fill(aisle),
            placedInAisleCount: 0,
            overflowToDockCount: aisle === 'DOCK' ? qty : 0,
            isSpecialZone: true
        };
    }

    const cfg = getAisleConfig(aisle);
    const totalBays = parseInt(cfg.bays || cfg.bay, 10) || 10;
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;
    const totalSlots = parseInt(cfg.slots || cfg.slot, 10) || 10;

    // สำเนาพิกัดที่ไม่ว่างทั้งหมดในขณะนี้
    const occupiedSnapshot = new Set();
    getAllOccupiedLocationsSet().forEach(loc => occupiedSnapshot.add(loc));

    const pad2 = (n) => String(n).padStart(2, '0');
    const allocated = [];

    const bStart = Math.max(1, Math.min(totalBays, parseInt(startBay, 10) || 1));
    const sStart = Math.max(1, Math.min(totalShelves, parseInt(startShelf, 10) || 1));
    const slStart = Math.max(1, Math.min(totalSlots, parseInt(startSlot, 10) || 1));

    const tryClaimSlot = (b, s, sl) => {
        const candNorm = `${aisle}-${pad2(b)}-${pad2(s)}-${pad2(sl)}`;
        const normKey = getNormalizedLocKey(candNorm);
        if (!occupiedSnapshot.has(candNorm) && !occupiedSnapshot.has(normKey)) {
            addOccupiedLocToSet(occupiedSnapshot, candNorm);
            allocated.push(candNorm);
            return true;
        }
        return false;
    };

    // รอบที่ 1: เดินหน้าตั้งแต่พิกัดปัจจุบันที่ผู้ใช้เลือกไปจนจบแถว
    for (let b = bStart; b <= totalBays && allocated.length < qty; b++) {
        const sBegin = (b === bStart) ? sStart : 1;
        for (let s = sBegin; s <= totalShelves && allocated.length < qty; s++) {
            const slBegin = (b === bStart && s === sStart) ? slStart : 1;
            for (let sl = slBegin; sl <= totalSlots && allocated.length < qty; sl++) {
                tryClaimSlot(b, s, sl);
            }
        }
    }

    // รอบที่ 2: วนกลับไปเก็บช่องว่างก่อนหน้าในแถวเดียวกัน (หากมีช่องว่างหลงเหลือ)
    if (allocated.length < qty) {
        for (let b = 1; b <= totalBays && allocated.length < qty; b++) {
            for (let s = 1; s <= totalShelves && allocated.length < qty; s++) {
                for (let sl = 1; sl <= totalSlots && allocated.length < qty; sl++) {
                    tryClaimSlot(b, s, sl);
                }
            }
        }
    }

    const placedInAisleCount = allocated.length;
    const overflowToDockCount = Math.max(0, qty - placedInAisleCount);

    // หากช่องในแถวนี้เต็มครบทุกช่องแล้ว ส่วนที่เกินให้ส่งไปพักที่โซนลาน DOCK เพื่อไม่ให้พิกัดในชั้นวางซ้ำกัน
    for (let i = 0; i < overflowToDockCount; i++) {
        allocated.push('DOCK');
    }

    return {
        locations: allocated,
        placedInAisleCount,
        overflowToDockCount,
        isSpecialZone: false
    };
}

// 🟢 แทรกแถบสุ่ม S/N จำนวนมาก (100 / 500 / 1,000 / กำหนดเอง) ไว้ด้านใต้ช่องซีเรียลและเลขมิเตอร์
function injectBatchSnGeneratorBar() {
    if (document.getElementById('wmsBatchSnGeneratorBar')) return;

    const snInput = document.getElementById('inboundSn');
    const meterInput = document.getElementById('inboundMeter');
    if (!snInput && !meterInput) return;

    const snGroup = snInput ? (snInput.closest('.form-group, .input-group-wrapper, .field-box') || snInput.parentElement) : null;
    const meterGroup = meterInput ? (meterInput.closest('.form-group, .input-group-wrapper, .field-box') || meterInput.parentElement) : null;

    let anchorElement = meterGroup || snGroup;
    if (snGroup && meterGroup && snGroup.parentElement === meterGroup.parentElement) {
        const parent = snGroup.parentElement;
        const parentClass = (parent.className || '').toLowerCase();
        if (parentClass.includes('row') || parentClass.includes('grid-2') || parentClass.includes('split') || parent.children.length <= 3) {
            anchorElement = parent;
        } else {
            const pos = snGroup.compareDocumentPosition(meterGroup);
            anchorElement = (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? meterGroup : snGroup;
        }
    }

    if (!anchorElement || !anchorElement.parentElement) return;

    const bar = document.createElement('div');
    bar.id = 'wmsBatchSnGeneratorBar';
    bar.className = 'wms-batch-sn-bar';
    bar.innerHTML = `
        <div class="wms-batch-sn-bar-header">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="wms-batch-icon-pill"><i class="fa-solid fa-layer-group"></i></span>
                <div>
                    <div style="font-size:0.84rem; font-weight:800; color:var(--text-main, #0f172a); line-height:1.25;">
                        สุ่มสร้าง S/N รับเข้าคลังเป็นชุด (รันตามคิว • ไม่ซ้ำพิกัด)
                    </div>
                    <div id="batchSnAisleCapacityHint" style="font-size:0.74rem; color:var(--text-sub, #64748b); margin-top:2px;">
                        เลือกแถวจัดเก็บแล้วกดจำนวนที่ต้องการเพื่อสุ่มและจัดลงช่องว่างอัตโนมัติ
                    </div>
                </div>
            </div>
            <span id="batchSnLiveStatusPill" style="display:none; font-size:0.74rem; font-weight:700; padding:4px 10px; border-radius:99px; background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd;">
                กำลังรันคิว...
            </span>
        </div>

        <div class="wms-batch-sn-btn-row">
            <button type="button" class="btn-batch-sn-preset" onclick="startBatchRandomInbound(100)" title="สุ่มสร้างและบันทึกรับเข้า 100 S/N ตามคิว">
                <i class="fa-solid fa-bolt"></i> สุ่ม 100 SN
            </button>
            <button type="button" class="btn-batch-sn-preset" onclick="startBatchRandomInbound(500)" title="สุ่มสร้างและบันทึกรับเข้า 500 S/N ตามคิว">
                <i class="fa-solid fa-bolt"></i> สุ่ม 500 SN
            </button>
            <button type="button" class="btn-batch-sn-preset highlight" onclick="startBatchRandomInbound(1000)" title="สุ่มสร้างและบันทึกรับเข้า 1,000 S/N ตามคิว">
                <i class="fa-solid fa-rocket"></i> สุ่ม 1,000 SN
            </button>
            <button type="button" class="btn-batch-sn-preset custom" onclick="openRandomSnModal()" title="กำหนดจำนวนและคำนำหน้า S/N เอง">
                <i class="fa-solid fa-sliders"></i> กำหนดเอง
            </button>
        </div>
    `;

    anchorElement.parentElement.insertBefore(bar, anchorElement.nextSibling);
    updateInboundLocationPreviewFromDropdowns();
}

function updateBatchSnBarAisleCapacityHint(details) {
    const hintEl = document.getElementById('batchSnAisleCapacityHint');
    if (!hintEl) return;

    if (!details || !details.location || details.location.includes('โปรดเลือก')) {
        hintEl.innerHTML = `<span style="color:#d97706; font-weight:600;">⚠️ กรุณาเลือกแถวจัดเก็บด้านบนก่อนกดสุ่มรับเข้าเป็นชุด</span>`;
        return;
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(details.location)) {
        hintEl.innerHTML = `📍 พร้อมสุ่มรับเข้าโซนพิเศษ <strong>${escapeHTML(details.location)}</strong> (รองรับไม่จำกัดจำนวน)`;
        return;
    }

    const aisleSelect = document.getElementById('inboundAisleSelect');
    const aisleName = aisleSelect ? aisleSelect.value : '';
    const freeCount = Number(details.freeSlots) || 0;
    const totalCount = Number(details.totalSlots) || 0;

    if (freeCount > 0) {
        hintEl.innerHTML = `🟢 แถว <strong>${escapeHTML(aisleName)}</strong> มีช่องว่างพร้อมจัดเก็บ <strong>${freeCount.toLocaleString()}</strong> / ${totalCount.toLocaleString()} ช่อง (เรียงช่องอัตโนมัติไม่ซ้ำพิกัด)`;
    } else {
        hintEl.innerHTML = `<span style="color:#ef4444; font-weight:600;">🔴 แถว ${escapeHTML(aisleName)} เต็มแล้ว หากกดสุ่มระบบจะส่งรายการไปพักที่ลาน DOCK อัตโนมัติ</span>`;
    }
}

// 🟢 🎲 ป๊อปอัปสุ่ม S/N กำหนดเอง (Random SN Batch Modal)
function initRandomSnModal() {
    let modal = document.getElementById('wmsRandomSnModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsRandomSnModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="card" style="max-width: 470px; width: 92%; border-radius: 20px; padding: 24px; background: var(--bg-surface, #ffffff); box-shadow: 0 20px 40px rgba(0,0,0,0.25); text-align: center;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px;">
                    <h3 style="font-size: 1.12rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 8px; margin: 0;">
                        <i class="fa-solid fa-dice" style="color: var(--primary, #0284c7);"></i> กำหนดจำนวนสุ่ม S/N รับเข้าคลัง
                    </h3>
                    <button type="button" onclick="closeRandomSnModal()" style="background: none; border: none; font-size: 1.4rem; color: var(--text-muted, #64748b); cursor: pointer; padding: 0 4px;">&times;</button>
                </div>

                <p style="font-size: 0.84rem; color: var(--text-sub, #475569); margin-bottom: 14px; text-align: left; line-height: 1.45;">
                    เลือกหรือระบุจำนวน S/N ที่ต้องการสุ่มรับเข้าสู่คลัง ระบบจะสร้างซีเรียลที่ไม่ซ้ำกัน จัดลงพิกัดว่างตามลำดับคิว และบันทึกลงฐานข้อมูลเรียลไทม์:
                </p>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px;">
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(50)" style="font-weight: 700; border-radius: 10px; padding: 9px;">50 SN</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(100)" style="font-weight: 700; border-radius: 10px; padding: 9px;">100 SN</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(250)" style="font-weight: 700; border-radius: 10px; padding: 9px;">250 SN</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(500)" style="font-weight: 700; border-radius: 10px; padding: 9px;">500 SN</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(1000)" style="font-weight: 700; border-radius: 10px; padding: 9px; color: var(--primary-text, #0284c7);">1,000 SN</button>
                    <button type="button" class="btn btn-secondary" onclick="selectRandomQtyPreset(2000)" style="font-weight: 700; border-radius: 10px; padding: 9px;">2,000 SN</button>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; text-align: left;">
                    <div class="form-group" style="margin:0;">
                        <label for="randomSnCustomInput" style="font-size: 0.8rem; font-weight: 700; display:block; margin-bottom:4px;">จำนวนที่ต้องการสุ่ม (ชิ้น):</label>
                        <input type="number" id="randomSnCustomInput" class="form-control" placeholder="เช่น 100, 500, 1000" min="1" max="10000" style="border-radius: 10px; font-weight: 700;" />
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label for="randomSnPrefixInput" style="font-size: 0.8rem; font-weight: 700; display:block; margin-bottom:4px;">คำนำหน้า S/N (Prefix):</label>
                        <input type="text" id="randomSnPrefixInput" class="form-control" value="SN-${new Date().getFullYear()}" placeholder="เช่น SN-2026" style="border-radius: 10px; font-weight: 700;" />
                    </div>
                </div>

                <div style="display: flex; gap: 10px;">
                    <button type="button" class="btn btn-secondary" onclick="closeRandomSnModal()" style="flex: 1; border-radius: 10px;">ยกเลิก</button>
                    <button type="button" class="btn btn-primary" onclick="confirmBatchRandomInboundProcess()" style="flex: 2; border-radius: 10px; font-weight: 700;">
                        <i class="fa-solid fa-bolt"></i> เริ่มสุ่มรับเข้าคลังตามคิว
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function openRandomSnModal() {
    initRandomSnModal();
    const modal = document.getElementById('wmsRandomSnModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('randomSnCustomInput');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

function closeRandomSnModal() {
    const modal = document.getElementById('wmsRandomSnModal');
    if (modal) modal.style.display = 'none';
    ensureSnInputFocus(true);
}

function selectRandomQtyPreset(qty) {
    const input = document.getElementById('randomSnCustomInput');
    if (input) input.value = qty;
    confirmBatchRandomInboundProcess();
}

// 🟢 🚀 ฟังก์ชันหลักในการสุ่มรับเข้าคลังเป็นชุด (100 / 500 / 1,000 / กำหนดเอง) รันตามคิว ไม่พิกัดซ้ำ
async function startBatchRandomInbound(presetQty, customPrefix = '') {
    if (isBatchGenerating) {
        showToast('⏳ ระบบกำลังรันคิวสุ่มรับเข้าชุดก่อนหน้าอยู่ โปรดรอสักครู่...', true);
        return;
    }

    const qty = Math.min(10000, Math.max(1, parseInt(presetQty, 10) || 1));

    if (qty === 1) {
        generateAutoSN();
        return;
    }

    const currentSelectedLoc = getSelectedLocationFromDropdowns();
    if (!currentSelectedLoc || currentSelectedLoc.includes('โปรดเลือก') || currentSelectedLoc === '') {
        triggerScanInputFlash('error');
        showToast('⚠️ กรุณาเลือกแถวจัดเก็บคลังสินค้าก่อนกดสุ่มรับเข้า!', true);
        const aisleSelect = document.getElementById('inboundAisleSelect');
        if (aisleSelect) aisleSelect.focus();
        return;
    }

    const categoryElem = document.getElementById('inboundCategory');
    const nameElem = document.getElementById('inboundName');
    const meterElem = document.getElementById('inboundMeter');

    let category = categoryElem ? categoryElem.value.trim() : '';
    let name = nameElem ? nameElem.value.trim() : '';
    const meterVal = meterElem ? (parseInt(meterElem.value, 10) || 0) : 0;

    if (!category || !name) {
        category = category || 'CABLE-FIBER';
        name = name || 'สายไฟเบอร์ออฟติก 1 Core (Batch Random SKU)';
        if (categoryElem && !categoryElem.value.trim()) categoryElem.value = category;
        if (nameElem && !nameElem.value.trim()) nameElem.value = name;
    }

    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    const selectedAisle = aisleSelect ? aisleSelect.value : currentSelectedLoc;
    const startBay = baySelect ? baySelect.value : '01';
    const startShelf = shelfSelect ? shelfSelect.value : '01';
    const startSlot = slotSelect ? slotSelect.value : '01';

    isBatchGenerating = true;

    const statusPill = document.getElementById('batchSnLiveStatusPill');
    const batchButtons = document.querySelectorAll('.btn-batch-sn-preset');
    batchButtons.forEach(b => { b.disabled = true; b.style.opacity = '0.65'; });
    if (statusPill) {
        statusPill.style.display = 'inline-block';
        statusPill.textContent = `⏳ กำลังเตรียมคิว ${qty.toLocaleString()} SN...`;
    }

    try {
        // 1. สร้าง S/N ที่ไม่ซ้ำกัน 100% ตามจำนวนที่กำหนด
        const uniqueSnList = generateUniqueBatchSnList(qty, customPrefix);
        const actualQty = uniqueSnList.length;

        // 2. จัดสรรคิวพิกัดว่างเรียงลำดับช่อง ไม่พิกัดซ้ำกัน 100%
        const allocationPlan = buildBatchAvailableLocationsQueue(
            selectedAisle,
            startBay,
            startShelf,
            startSlot,
            actualQty
        );

        const activeUser = getCurrentUserFullName();
        const isOnlineNow = navigator.onLine;
        const chunkSize = 200;

        for (let offset = 0; offset < actualQty; offset += chunkSize) {
            const endIdx = Math.min(actualQty, offset + chunkSize);
            const batchNowISO = new Date().toISOString();
            const batchTimeStr = new Date().toLocaleTimeString('th-TH');

            for (let i = offset; i < endIdx; i++) {
                const sn = uniqueSnList[i];
                const targetLoc = allocationPlan.locations[i] || 'DOCK';

                pendingFastSnSet.add(sn.toUpperCase());
                addOccupiedLocToSet(pendingFastLocationSet, targetLoc);

                const feedItem = {
                    sn,
                    category,
                    name,
                    meter: meterVal,
                    location: targetLoc,
                    received_by: activeUser,
                    time: batchTimeStr,
                    created_at: batchNowISO,
                    isOffline: !isOnlineNow,
                    db_status: isOnlineNow ? 'SYNCING' : 'PENDING'
                };

                const dbPayload = {
                    category,
                    name,
                    sn,
                    meter: meterVal,
                    location: targetLoc,
                    qty: 1,
                    status: 'IN_STOCK',
                    received_by: activeUser,
                    created_at: batchNowISO
                };

                recentInboundList.unshift(feedItem);

                if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
                    globalInventoryData.unshift(dbPayload);
                }

                enqueuePersistentDbSync(dbPayload, feedItem);
            }

            if (statusPill) {
                const pct = Math.round((endIdx / actualQty) * 100);
                statusPill.textContent = `⚡ จัดคิวแล้ว ${endIdx.toLocaleString()}/${actualQty.toLocaleString()} (${pct}%)`;
            }

            // คืนเฟรมให้เบราว์เซอร์ทำงานลื่นไหลไม่ค้างแม้สุ่ม 1,000+ รายการ
            if (endIdx < actualQty) {
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }

        if (recentInboundList.length > 100) recentInboundList.length = 100;
        invalidateOccupiedLocationsCache();
        saveRecentInboundFeedToCache();
        scheduleDebouncedFeedRender();
        playAudioFeedback('success');
        forceSyncAndSelectAvailableLocation(true);

        // เริ่มส่งคิวเข้า DB ตามลำดับ FIFO ทันที
        flushPersistentDbSyncQueue();

        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel('wms_realtime_sync_channel');
                channel.postMessage({ action: 'BATCH_INBOUND', count: actualQty });
            }
        } catch (e) {}

        document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: { action: 'BATCH', count: actualQty } }));
        document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: { action: 'BATCH', count: actualQty } }));

        if (!allocationPlan.isSpecialZone && allocationPlan.overflowToDockCount > 0) {
            showToast(
                `✅ สุ่มรับเข้า ${actualQty.toLocaleString()} รายการสำเร็จ (ลงแถว ${selectedAisle} จำนวน ${allocationPlan.placedInAisleCount.toLocaleString()} ช่อง และพักลาน DOCK ${allocationPlan.overflowToDockCount.toLocaleString()} ชิ้น เนื่องจากแถวเต็ม)`,
                false,
                4800
            );
        } else {
            showToast(
                `✅ สุ่มรับเข้าคลังเรียบร้อยแล้ว ${actualQty.toLocaleString()} รายการ (รันคิวพิกัดไม่ซ้ำ 100%)`,
                false,
                3800
            );
        }
    } finally {
        isBatchGenerating = false;
        batchButtons.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
        if (statusPill) {
            setTimeout(() => { statusPill.style.display = 'none'; }, 1200);
        }
        ensureSnInputFocus(true);
    }
}

async function confirmBatchRandomInboundProcess() {
    const input = document.getElementById('randomSnCustomInput');
    const prefixInput = document.getElementById('randomSnPrefixInput');
    let qty = parseInt(input ? input.value : 1, 10);
    const customPrefix = prefixInput ? prefixInput.value.trim() : '';

    if (isNaN(qty) || qty <= 0) {
        qty = 1;
    }

    closeRandomSnModal();
    await startBatchRandomInbound(qty, customPrefix);
}