// =========================================================================
// --- MODULE 3.2: WAREHOUSE LOCATION & REAL-TIME AUTO-SLOT ENGINE ---
// --- Compatible with index.html Dropdowns, DOCK & Dynamic Aisle Configs ---
// --- 100% Exact Aisle/Bay/Shelf/Slot Sync (Fixes Aisle A -> D Mismatch) ---
// =========================================================================

var occupiedLocationsSet = (typeof window !== 'undefined' && window.occupiedLocationsSet instanceof Set)
    ? window.occupiedLocationsSet
    : new Set();

if (typeof window !== 'undefined') {
    window.occupiedLocationsSet = occupiedLocationsSet;
}

const DEFAULT_WAREHOUSE_RACK_SPEC = {
    aisles: ['DOCK', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    bayCount: 10,
    shelfCount: 5,
    slotCount: 10
};

function normalizeCoordKey(locStr) {
    return String(locStr || '').replace(/\s+/g, '').trim().toUpperCase();
}

function normalizeAisleCode(aisleRaw) {
    const cleaned = String(aisleRaw || '').trim();
    if (!cleaned) return 'DOCK';
    // รองรับกรณี option value มีคำว่า "แถว " นำหน้า เช่น "แถว A" -> "A"
    const stripped = cleaned.replace(/^แถว\s*/i, '').trim();
    return stripped || cleaned;
}

function removeOccupiedLocFromSet(targetSet, locStr) {
    if (!(targetSet instanceof Set) || !locStr) return;
    const rawUpper = String(locStr).trim().toUpperCase();
    const compactUpper = normalizeCoordKey(locStr);
    targetSet.delete(rawUpper);
    targetSet.delete(compactUpper);
}

function addOccupiedLocToSet(targetSet, locStr) {
    if (!(targetSet instanceof Set) || !locStr) return;
    const rawUpper = String(locStr).trim().toUpperCase();
    const compactUpper = normalizeCoordKey(locStr);
    // DOCK สามารถรับพักสินค้าได้หลายเครื่องพร้อมกัน ไม่ล็อกเต็ม
    if (compactUpper === 'DOCK' || compactUpper.startsWith('DOCK-')) return;
    if (rawUpper) targetSet.add(rawUpper);
    if (compactUpper) targetSet.add(compactUpper);
}

function invalidateOccupiedLocationsCache() {
    cachedOccupiedSet = null;
}

function rebuildOccupiedLocationsSet(forceRebuild = false) {
    if (!forceRebuild && cachedOccupiedSet instanceof Set) {
        return cachedOccupiedSet;
    }

    occupiedLocationsSet.clear();

    if (typeof pendingFastLocationSet !== 'undefined' && pendingFastLocationSet instanceof Set) {
        pendingFastLocationSet.forEach(loc => addOccupiedLocToSet(occupiedLocationsSet, loc));
    }

    if (typeof persistentDbSyncQueue !== 'undefined' && Array.isArray(persistentDbSyncQueue)) {
        for (let i = 0; i < persistentDbSyncQueue.length; i++) {
            const loc = persistentDbSyncQueue[i]?.payload?.location;
            if (loc) addOccupiedLocToSet(occupiedLocationsSet, loc);
        }
    }

    const deletedStatuses = new Set(['DELETED', 'OUT', 'DISPATCHED', 'CANCELLED', 'VOID', 'REMOVED']);
    const ingestItems = (list) => {
        if (!Array.isArray(list)) return;
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item || !item.location) continue;
            const st = String(item.status || '').trim().toUpperCase();
            if (item.is_deleted === true || deletedStatuses.has(st)) continue;
            addOccupiedLocToSet(occupiedLocationsSet, item.location);
        }
    };

    if (typeof recentInboundList !== 'undefined') ingestItems(recentInboundList);
    if (typeof globalInventoryData !== 'undefined') ingestItems(globalInventoryData);
    if (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData)) {
        ingestItems(window.globalInventoryData);
    }

    cachedOccupiedSet = new Set(occupiedLocationsSet);
    return occupiedLocationsSet;
}

function isCoordOccupied(coordStr) {
    const key = normalizeCoordKey(coordStr);
    if (!key || key === 'DOCK' || key.startsWith('DOCK-')) return false;
    const occSet = rebuildOccupiedLocationsSet(false);
    return occSet.has(key);
}

function getLocationSelectElements() {
    return {
        aisleSel: document.getElementById('inboundAisleSelect'),
        baySel: document.getElementById('inboundBaySelect'),
        shelfSel: document.getElementById('inboundShelfSelect'),
        slotSel: document.getElementById('inboundSlotSelect'),
        locPreview: document.getElementById('inboundLocationPreview'),
        locInput: document.getElementById('inboundLocation'),
        bayBadge: document.getElementById('bayInboundCountBadge')
    };
}

function getConfiguredAisleSpec(aisleCode) {
    const codeUpper = normalizeAisleCode(aisleCode).toUpperCase();
    let spec = {
        bays: DEFAULT_WAREHOUSE_RACK_SPEC.bayCount,
        shelves: DEFAULT_WAREHOUSE_RACK_SPEC.shelfCount,
        slots: DEFAULT_WAREHOUSE_RACK_SPEC.slotCount
    };

    const configSources = [
        typeof window !== 'undefined' ? window.warehouseConfigs : null,
        typeof window !== 'undefined' ? window.aisleConfigs : null
    ];

    try {
        const stored = localStorage.getItem('WMS_WAREHOUSE_CONFIGS') || localStorage.getItem('warehouseConfigs');
        if (stored) configSources.push(JSON.parse(stored));
    } catch (e) {}

    for (const src of configSources) {
        if (!Array.isArray(src)) continue;
        const found = src.find(c => normalizeAisleCode(c.aisle || c.aisle_name || c.name || '').toUpperCase() === codeUpper);
        if (found) {
            spec.bays = Math.max(1, Number(found.bays || found.bay_count || found.bayCount || spec.bays));
            spec.shelves = Math.max(1, Number(found.shelves || found.shelf_count || found.shelfCount || spec.shelves));
            spec.slots = Math.max(1, Number(found.slots || found.slot_count || found.slotCount || spec.slots));
            break;
        }
    }

    return spec;
}

function fillNumericDropdown(selectEl, count, prefixText = '') {
    if (!selectEl) return;
    const prevVal = selectEl.value;
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= count; i++) {
        const val = String(i).padStart(2, '0');
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = prefixText ? `${prefixText} ${val}` : val;
        frag.appendChild(opt);
    }
    selectEl.innerHTML = '';
    selectEl.appendChild(frag);
    if (prevVal && Array.from(selectEl.options).some(o => o.value === prevVal)) {
        selectEl.value = prevVal;
    } else if (selectEl.options.length > 0) {
        selectEl.selectedIndex = 0;
    }
}

// =========================================================================
// AUTHORITATIVE LIVE LOCATION RESOLVER (SOURCE OF TRUTH FROM UI DROPDOWNS)
// =========================================================================

function getResolvedInboundLocation() {
    const { aisleSel, baySel, shelfSel, slotSel, locPreview, locInput } = getLocationSelectElements();

    if (!aisleSel) {
        const fallback = locInput && locInput.value ? String(locInput.value).trim() : 'DOCK';
        return fallback || 'DOCK';
    }

    const rawAisle = String(aisleSel.value || 'DOCK').trim();
    const aisleCode = normalizeAisleCode(rawAisle);
    const isDock = aisleCode.toUpperCase() === 'DOCK';

    let finalCoord = 'DOCK';
    if (!isDock) {
        const bay = (baySel && baySel.value) ? String(baySel.value).trim().padStart(2, '0') : '01';
        const shelf = (shelfSel && shelfSel.value) ? String(shelfSel.value).trim().padStart(2, '0') : '01';
        const slot = (slotSel && slotSel.value) ? String(slotSel.value).trim().padStart(2, '0') : '01';
        finalCoord = `${aisleCode}-${bay}-${shelf}-${slot}`;
    }

    // บังคับซิงก์ช่อง #inboundLocation และ #inboundLocationPreview ให้ตรงกับแถวที่เลือก 100%
    if (locInput && locInput.value !== finalCoord) {
        locInput.value = finalCoord;
    }
    if (locPreview && locPreview.textContent !== finalCoord) {
        locPreview.textContent = finalCoord;
    }

    return finalCoord;
}

function bindInboundLocationSelectListeners() {
    const { aisleSel, baySel, shelfSel, slotSel } = getLocationSelectElements();

    if (aisleSel && aisleSel.dataset.wmsLocBound !== 'true') {
        aisleSel.dataset.wmsLocBound = 'true';
        aisleSel.addEventListener('change', () => {
            handleAisleDropdownChanged();
        });
    }

    [baySel, shelfSel, slotSel].forEach(sel => {
        if (sel && sel.dataset.wmsSubLocBound !== 'true') {
            sel.dataset.wmsSubLocBound = 'true';
            sel.addEventListener('change', () => {
                userHasSelectedAisle = true;
                updateInboundLocationPreview();
            });
        }
    });
}

function initializeInboundLocationDropdowns() {
    const { aisleSel, baySel, shelfSel, slotSel } = getLocationSelectElements();
    if (!aisleSel) return;

    bindInboundLocationSelectListeners();

    const preservedAisleVal = userHasSelectedAisle ? String(aisleSel.value || '').trim() : '';

    // ดึงรายชื่อแถวจาก Settings / DB หากมี หรือใช้ค่าเริ่มต้น (รวม DOCK)
    let configuredAisles = [...DEFAULT_WAREHOUSE_RACK_SPEC.aisles];
    const configSources = [
        typeof window !== 'undefined' ? window.warehouseConfigs : null,
        typeof window !== 'undefined' ? window.aisleConfigs : null
    ];
    try {
        const stored = localStorage.getItem('WMS_WAREHOUSE_CONFIGS') || localStorage.getItem('warehouseConfigs');
        if (stored) configSources.push(JSON.parse(stored));
    } catch (e) {}

    for (const src of configSources) {
        if (Array.isArray(src) && src.length > 0) {
            const extracted = src
                .map(c => normalizeAisleCode(c.aisle || c.aisle_name || c.name || ''))
                .filter(Boolean);
            if (extracted.length > 0) {
                configuredAisles = extracted.includes('DOCK') ? extracted : ['DOCK', ...extracted];
                break;
            }
        }
    }

    const existingOptions = Array.from(aisleSel.options || []).map(o => String(o.value || '').trim()).filter(Boolean);
    if (existingOptions.length === 0) {
        const frag = document.createDocumentFragment();
        configuredAisles.forEach(code => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = code === 'DOCK' ? 'DOCK (จุดพักรับสินค้า)' : `แถว ${code}`;
            frag.appendChild(opt);
        });
        aisleSel.innerHTML = '';
        aisleSel.appendChild(frag);
    }

    if (preservedAisleVal && Array.from(aisleSel.options).some(o => o.value === preservedAisleVal)) {
        aisleSel.value = preservedAisleVal;
    } else if (!aisleSel.value && aisleSel.options.length > 0) {
        aisleSel.value = aisleSel.options[0].value || 'DOCK';
    }

    const activeAisle = normalizeAisleCode(aisleSel.value || 'DOCK');
    const isDock = activeAisle.toUpperCase() === 'DOCK';

    if (baySel) baySel.disabled = isDock;
    if (shelfSel) shelfSel.disabled = isDock;
    if (slotSel) slotSel.disabled = isDock;

    const spec = getConfiguredAisleSpec(activeAisle);
    if (baySel && baySel.options.length === 0) fillNumericDropdown(baySel, spec.bays, 'ล็อก');
    if (shelfSel && shelfSel.options.length === 0) fillNumericDropdown(shelfSel, spec.shelves, 'ชั้น');
    if (slotSel && slotSel.options.length === 0) fillNumericDropdown(slotSel, spec.slots, 'ช่อง');

    updateInboundLocationPreview();
    ensureLocationCapacityHUD();
    updateLocationCapacityHUD();
}

function handleAisleDropdownChanged() {
    const { aisleSel, baySel, shelfSel, slotSel } = getLocationSelectElements();
    if (!aisleSel) return;

    userHasSelectedAisle = true;
    const chosenAisle = normalizeAisleCode(aisleSel.value || 'DOCK');
    const isDock = chosenAisle.toUpperCase() === 'DOCK';

    if (baySel) baySel.disabled = isDock;
    if (shelfSel) shelfSel.disabled = isDock;
    if (slotSel) slotSel.disabled = isDock;

    if (!isDock) {
        const spec = getConfiguredAisleSpec(chosenAisle);
        fillNumericDropdown(baySel, spec.bays, 'ล็อก');
        fillNumericDropdown(shelfSel, spec.shelves, 'ชั้น');
        fillNumericDropdown(slotSel, spec.slots, 'ช่อง');
        // เริ่มค้นหาช่องว่างแรกของแถวที่ผู้ใช้เพิ่งเลือก (เช่น แถว A -> A-01-01-01)
        if (baySel && baySel.options.length > 0) baySel.selectedIndex = 0;
        if (shelfSel && shelfSel.options.length > 0) shelfSel.selectedIndex = 0;
        if (slotSel && slotSel.options.length > 0) slotSel.selectedIndex = 0;
        autoSelectAvailableSlot();
    } else {
        updateInboundLocationPreview();
    }
}

// ฟังก์ชันตรงตาม attribute onchange ใน index.html (รองรับทั้งเปลี่ยนแถว และเปลี่ยนล็อก/ชั้น/ช่อง)
function onInboundAisleOrBayChange(eventOrEl) {
    const targetEl = eventOrEl && eventOrEl.target ? eventOrEl.target : eventOrEl;
    const targetId = targetEl && targetEl.id ? targetEl.id : '';

    if (targetId === 'inboundBaySelect' || targetId === 'inboundShelfSelect' || targetId === 'inboundSlotSelect') {
        userHasSelectedAisle = true;
        updateInboundLocationPreview();
        return;
    }

    handleAisleDropdownChanged();
}

function selectInboundAisleExplicitly(aisleCode) {
    const { aisleSel } = getLocationSelectElements();
    if (!aisleSel) return;
    const target = normalizeAisleCode(aisleCode);
    const matchedOpt = Array.from(aisleSel.options).find(
        o => normalizeAisleCode(o.value).toUpperCase() === target.toUpperCase()
    );
    if (matchedOpt) {
        aisleSel.value = matchedOpt.value;
        handleAisleDropdownChanged();
    }
}

function autoSelectAvailableSlot() {
    forceSyncAndSelectAvailableLocation(false);
}

function updateInboundLocationPreview() {
    const { aisleSel, bayBadge } = getLocationSelectElements();
    if (!aisleSel) return 'DOCK';

    const finalCoord = getResolvedInboundLocation();
    const aisle = normalizeAisleCode(aisleSel.value || 'DOCK');

    // อัปเดตจำนวนที่รับแล้วในแถว/ช่องนี้ (#bayInboundCountBadge)
    if (bayBadge) {
        const occSet = rebuildOccupiedLocationsSet(false);
        const prefix = aisle.toUpperCase() === 'DOCK' ? 'DOCK' : `${aisle}-`;
        let countInScope = 0;
        if (aisle.toUpperCase() === 'DOCK') {
            (Array.isArray(recentInboundList) ? recentInboundList : []).forEach(r => {
                if (String(r?.location || '').toUpperCase().startsWith('DOCK')) countInScope++;
            });
            bayBadge.textContent = `รับพักที่ DOCK แล้ว: ${countInScope.toLocaleString()} เครื่อง`;
        } else {
            occSet.forEach(k => {
                if (k.startsWith(prefix.toUpperCase())) countInScope++;
            });
            bayBadge.textContent = `รับแล้วในแถว ${aisle}: ${countInScope.toLocaleString()} เครื่อง`;
        }
    }

    updateLocationCapacityHUD();
    return finalCoord;
}

function getSelectOptionValues(selectEl) {
    if (!selectEl || !selectEl.options) return [];
    return Array.from(selectEl.options)
        .map(o => String(o.value || '').trim())
        .filter(Boolean);
}

function forceSyncAndSelectAvailableLocation(advanceFromCurrent = false) {
    const { aisleSel, baySel, shelfSel, slotSel } = getLocationSelectElements();
    if (!aisleSel) return 'DOCK';

    // อ่านแถวที่ผู้ใช้เลือกอยู่จริงเท่านั้น ห้ามเปลี่ยนแถวข้ามไปแถวอื่นโดยพลการ
    const aisle = normalizeAisleCode(aisleSel.value || 'DOCK');
    if (aisle.toUpperCase() === 'DOCK') {
        return updateInboundLocationPreview();
    }

    const occSet = rebuildOccupiedLocationsSet(true);
    const bays = getSelectOptionValues(baySel);
    const shelves = getSelectOptionValues(shelfSel);
    const slots = getSelectOptionValues(slotSel);

    if (bays.length === 0 || shelves.length === 0 || slots.length === 0) {
        return updateInboundLocationPreview();
    }

    const curBay = baySel?.value || bays[0];
    const curShelf = shelfSel?.value || shelves[0];
    const curSlot = slotSel?.value || slots[0];

    const coords = [];
    for (let b = 0; b < bays.length; b++) {
        for (let sh = 0; sh < shelves.length; sh++) {
            for (let sl = 0; sl < slots.length; sl++) {
                coords.push({
                    bay: bays[b],
                    shelf: shelves[sh],
                    slot: slots[sl],
                    code: `${aisle}-${bays[b]}-${shelves[sh]}-${slots[sl]}`
                });
            }
        }
    }

    const currentCode = `${aisle}-${curBay}-${curShelf}-${curSlot}`;
    let startIdx = coords.findIndex(c => c.code === currentCode);
    if (startIdx < 0) startIdx = 0;

    if (!advanceFromCurrent && !occSet.has(normalizeCoordKey(currentCode))) {
        return updateInboundLocationPreview();
    }

    const offsetStart = advanceFromCurrent ? 1 : 0;
    for (let step = offsetStart; step < coords.length + offsetStart; step++) {
        const candidate = coords[(startIdx + step) % coords.length];
        if (!occSet.has(normalizeCoordKey(candidate.code))) {
            if (baySel) baySel.value = candidate.bay;
            if (shelfSel) shelfSel.value = candidate.shelf;
            if (slotSel) slotSel.value = candidate.slot;
            return updateInboundLocationPreview();
        }
    }

    return updateInboundLocationPreview();
}

function jumpToNextFreeSlotManual() {
    const { aisleSel } = getLocationSelectElements();
    if (!aisleSel) return;
    if (normalizeAisleCode(aisleSel.value).toUpperCase() === 'DOCK') {
        showToast('ℹ️ จุดพัก DOCK สามารถรับเข้าได้ต่อเนื่องไม่จำกัดช่อง', false, 2000);
        return;
    }
    const nextCoord = forceSyncAndSelectAvailableLocation(true);
    showToast(`📍 เลื่อนไปพิกัดถัดไป: ${nextCoord}`, false, 1800);
    if (typeof ensureSnInputFocus === 'function') ensureSnInputFocus(true);
}

function ensureLocationCapacityHUD() {
    let hud = document.getElementById('wmsInboundLocationHud');
    if (hud) return hud;

    const locInput = document.getElementById('inboundLocation');
    const locPreview = document.getElementById('inboundLocationPreview');
    const anchorBox = (locInput ? locInput.parentElement : null) || (locPreview ? locPreview.parentElement : null);
    if (!anchorBox || !anchorBox.parentElement) return null;

    hud = document.createElement('div');
    hud.id = 'wmsInboundLocationHud';
    hud.style.cssText = `
        margin-top: 8px;
        padding: 7px 10px;
        border-radius: 9px;
        background: var(--bg-surface);
        border: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 0.75rem;
    `;
    anchorBox.parentElement.appendChild(hud);
    return hud;
}

function updateLocationCapacityHUD() {
    const hud = ensureLocationCapacityHUD();
    if (!hud) return;

    const { aisleSel, baySel, shelfSel, slotSel } = getLocationSelectElements();
    const aisle = aisleSel ? normalizeAisleCode(aisleSel.value || 'DOCK') : 'DOCK';
    const activeCoord = getResolvedInboundLocation();

    if (aisle.toUpperCase() === 'DOCK') {
        hud.innerHTML = `
            <span style="color:var(--primary-text); font-weight:700;">
                <i class="fa-solid fa-truck-ramp-box"></i> โหมดพักรับสินค้า DOCK (รองรับยิง S/N รัวต่อเนื่องไม่จำกัด)
            </span>
            <span style="color:var(--text-muted);">เปลี่ยนแถวด้านบนเพื่อจัดลงชั้นวางทันที</span>
        `;
        return;
    }

    const total = getSelectOptionValues(baySel).length * getSelectOptionValues(shelfSel).length * getSelectOptionValues(slotSel).length;
    const occSet = rebuildOccupiedLocationsSet(false);
    let used = 0;
    const prefix = `${aisle}-`.toUpperCase();
    occSet.forEach(k => { if (k.startsWith(prefix)) used++; });
    const free = Math.max(0, total - used);
    const isCurrentSlotOccupied = isCoordOccupied(activeCoord);

    hud.innerHTML = `
        <span style="font-weight:700; color:${isCurrentSlotOccupied ? 'var(--warning-text)' : 'var(--success-text)'};">
            <i class="fa-solid ${isCurrentSlotOccupied ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
            พิกัดปัจจุบัน <strong class="mono">${escapeHTML(activeCoord)}</strong>${isCurrentSlotOccupied ? ' (มีสินค้าแล้ว)' : ''} • แถว ${escapeHTML(aisle)} ว่าง <strong class="mono">${free.toLocaleString()}</strong>/${total.toLocaleString()} ช่อง
        </span>
        <button type="button" class="wms-mini-tool-btn" onclick="jumpToNextFreeSlotManual()">
            <i class="fa-solid fa-forward-step"></i> ช่องว่างถัดไป
        </button>
    `;
}

if (typeof window !== 'undefined') {
    window.normalizeCoordKey = normalizeCoordKey;
    window.normalizeAisleCode = normalizeAisleCode;
    window.removeOccupiedLocFromSet = removeOccupiedLocFromSet;
    window.addOccupiedLocToSet = addOccupiedLocToSet;
    window.invalidateOccupiedLocationsCache = invalidateOccupiedLocationsCache;
    window.rebuildOccupiedLocationsSet = rebuildOccupiedLocationsSet;
    window.isCoordOccupied = isCoordOccupied;
    window.getResolvedInboundLocation = getResolvedInboundLocation;
    window.bindInboundLocationSelectListeners = bindInboundLocationSelectListeners;
    window.initializeInboundLocationDropdowns = initializeInboundLocationDropdowns;
    window.onInboundAisleOrBayChange = onInboundAisleOrBayChange;
    window.selectInboundAisleExplicitly = selectInboundAisleExplicitly;
    window.autoSelectAvailableSlot = autoSelectAvailableSlot;
    window.updateInboundLocationPreview = updateInboundLocationPreview;
    window.forceSyncAndSelectAvailableLocation = forceSyncAndSelectAvailableLocation;
    window.jumpToNextFreeSlotManual = jumpToNextFreeSlotManual;
    window.updateLocationCapacityHUD = updateLocationCapacityHUD;
}