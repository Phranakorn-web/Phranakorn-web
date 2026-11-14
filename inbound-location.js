// =========================================================================
// --- MODULE 3.2: WAREHOUSE LOCATION & CAPACITY ENGINE ---
// --- Coordinate Parser, Auto-Slot Finder, Strict Dropdowns & HUD ---
// =========================================================================

// 🟢 ดึงและแยกองค์ประกอบพิกัดจัดเก็บอย่างถูกต้องแม่นยำ 100%
function parseLocComponentsInternal(locStr) {
    if (!locStr) return null;
    let raw = String(locStr).trim().toUpperCase();
    raw = raw.replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    const specialList = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
    if (specialList.includes(raw)) {
        return { isSpecial: true, code: raw };
    }

    let codeOnly = raw.replace(/แถว|ล็อก|ชั้น|ช่อง|BAY|SHELF|SLOT|•|📍/gi, ' ').trim();
    let parts = codeOnly.split(/[\-\/_ \t]+/).filter(Boolean);

    if (parts.length >= 4) {
        const aisleName = parts[0].trim().toUpperCase();
        const bayNum = parseInt(parts[1], 10);
        const shelfNum = parseInt(parts[2], 10);
        const slotRaw = parts[3].trim().toUpperCase();

        if (aisleName && !isNaN(bayNum) && !isNaN(shelfNum)) {
            const cfg = getAisleConfig(aisleName);
            const maxShelves = cfg ? (cfg.shelves || 10) : 10;
            const validShelf = (shelfNum > maxShelves && maxShelves > 0) ? Math.min(shelfNum, maxShelves) : shelfNum;
            const slotVal = slotRaw === 'FULL' ? 'FULL' : String(parseInt(slotRaw, 10) || 1).padStart(2, '0');

            return {
                isSpecial: false,
                aisle: aisleName,
                bay: String(bayNum).padStart(2, '0'),
                shelf: String(validShelf).padStart(2, '0'),
                slot: slotVal
            };
        }
    }

    const thaiMatch = raw.match(/แถว\s*([A-Z0-9]+)\s*ล็อก\s*(\d+)\s*ชั้น\s*(\d+)\s*ช่อง\s*(\d+|FULL)/i) ||
                      raw.match(/แถว\s*([A-Z0-9]+)(?:.*?ล็อก\s*(\d+))(?:.*?ชั้น\s*(\d+))(?:.*?ช่อง\s*(\d+|FULL))/i);
    if (thaiMatch && thaiMatch[1]) {
        const aisleName = thaiMatch[1].trim().toUpperCase();
        const bayNum = parseInt(thaiMatch[2], 10) || 1;
        const shelfNum = parseInt(thaiMatch[3], 10) || 1;
        const cfg = getAisleConfig(aisleName);
        const maxShelves = cfg ? (cfg.shelves || 10) : 10;
        const validShelf = (shelfNum > maxShelves && maxShelves > 0) ? Math.min(shelfNum, maxShelves) : shelfNum;
        const slotVal = thaiMatch[4] === 'FULL' ? 'FULL' : String(parseInt(thaiMatch[4], 10) || 1).padStart(2, '0');

        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(bayNum).padStart(2, '0'),
            shelf: String(validShelf).padStart(2, '0'),
            slot: slotVal
        };
    }

    if (parts.length === 3) {
        const aisleName = parts[0].trim().toUpperCase();
        const bayNum = parseInt(parts[1], 10) || 1;
        const shelfNum = parseInt(parts[2], 10) || 1;
        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(bayNum).padStart(2, '0'),
            shelf: String(shelfNum).padStart(2, '0'),
            slot: '01'
        };
    }

    let p = null;
    if (typeof window !== 'undefined' && typeof window.parseLocationComponents === 'function') {
        p = window.parseLocationComponents(raw);
    } else if (typeof parseLocationComponents === 'function') {
        p = parseLocationComponents(raw);
    }

    if (p && p.aisle && p.bay) {
        const aisleName = String(p.aisle).trim().toUpperCase();
        const cfg = getAisleConfig(aisleName);
        const maxShelves = cfg ? (cfg.shelves || 10) : 10;
        const rawShelf = parseInt(p.shelf, 10) || 1;
        const validShelf = (rawShelf > maxShelves && maxShelves > 0) ? Math.min(rawShelf, maxShelves) : rawShelf;

        return {
            isSpecial: false,
            aisle: aisleName,
            bay: String(parseInt(p.bay, 10) || 1).padStart(2, '0'),
            shelf: String(validShelf).padStart(2, '0'),
            slot: String(parseInt(p.slot, 10) || 1).padStart(2, '0')
        };
    }

    return null;
}

function addOccupiedLocToSet(targetSet, loc) {
    if (!loc || !(targetSet instanceof Set)) return;
    const rawUpper = String(loc).trim().toUpperCase();
    if (!rawUpper) return;

    targetSet.add(rawUpper);
    const normKey = getNormalizedLocKey(rawUpper);
    if (normKey) targetSet.add(normKey);

    const p = parseLocComponentsInternal(rawUpper);
    if (p && !p.isSpecial) {
        const standardKey = `${p.aisle}-${p.bay}-${p.shelf}-${p.slot}`;
        targetSet.add(standardKey);
        targetSet.add(formatLocationSpaced(standardKey));
        targetSet.add(`${p.aisle}-${parseInt(p.bay, 10)}-${parseInt(p.shelf, 10)}-${parseInt(p.slot, 10)}`);
    }
}

function removeOccupiedLocFromSet(targetSet, loc) {
    if (!loc || !(targetSet instanceof Set)) return;
    const rawUpper = String(loc).trim().toUpperCase();
    if (!rawUpper) return;

    targetSet.delete(rawUpper);
    const normKey = getNormalizedLocKey(rawUpper);
    if (normKey) targetSet.delete(normKey);

    const p = parseLocComponentsInternal(rawUpper);
    if (p && !p.isSpecial) {
        const standardKey = `${p.aisle}-${p.bay}-${p.shelf}-${p.slot}`;
        targetSet.delete(standardKey);
        targetSet.delete(formatLocationSpaced(standardKey));
        targetSet.delete(`${p.aisle}-${parseInt(p.bay, 10)}-${parseInt(p.shelf, 10)}-${parseInt(p.slot, 10)}`);
    }
}

function getAisleConfig(aisleName) {
    const key = String(aisleName || '').trim().toUpperCase();
    if (!key || key === 'SELECT' || key === 'NONE' || key.includes('โปรดเลือก')) {
        return { bays: 0, shelves: 0, slots: 0 };
    }

    const findInObj = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj[key]) return obj[key];
        const foundKey = Object.keys(obj).find(k => String(k).trim().toUpperCase() === key);
        return foundKey ? obj[foundKey] : null;
    };

    const findInArray = (arr) => {
        if (!Array.isArray(arr)) return null;
        return arr.find(item => {
            if (!item) return false;
            const name = typeof item === 'object' ? (item.name || item.aisle || item.key || item.code || item.title || '') : String(item);
            return String(name).trim().toUpperCase() === key;
        });
    };

    let cfg = findInObj(typeof window !== 'undefined' && window.aisleConfigs) ||
              findInObj(typeof aisleConfigs !== 'undefined' ? aisleConfigs : null) ||
              findInObj(typeof window !== 'undefined' && window.masterWarehouseConfigs) ||
              findInObj(typeof masterWarehouseConfigs !== 'undefined' ? masterWarehouseConfigs : null);

    if (!cfg) {
        const itemInMaster = findInArray(typeof window !== 'undefined' && window.masterAisles) ||
                             findInArray(typeof masterAisles !== 'undefined' ? masterAisles : null);
        if (itemInMaster && typeof itemInMaster === 'object') cfg = itemInMaster;
    }

    if (!cfg && typeof localStorage !== 'undefined') {
        try {
            const localCfg = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (localCfg) cfg = findInObj(JSON.parse(localCfg));

            if (!cfg) {
                const localMaster = localStorage.getItem('WMS_MASTER_AISLES');
                if (localMaster) {
                    const parsedMaster = JSON.parse(localMaster);
                    const found = findInArray(parsedMaster) || findInObj(parsedMaster);
                    if (found && typeof found === 'object') cfg = found;
                }
            }
        } catch (e) {}
    }

    if (cfg) {
        const bays = parseInt(cfg.bays || cfg.bay || cfg.baysCount || cfg.totalBays || cfg.bayCount, 10);
        const shelves = parseInt(cfg.shelves || cfg.shelf || cfg.shelvesCount || cfg.totalShelves || cfg.shelfCount, 10);
        const slots = parseInt(cfg.slots || cfg.slot || cfg.slotsCount || cfg.totalSlots || cfg.slotCount, 10);
        return {
            bays: (!isNaN(bays) && bays >= 0) ? bays : 10,
            shelves: (!isNaN(shelves) && shelves >= 0) ? shelves : 3,
            slots: (!isNaN(slots) && slots >= 0) ? slots : 10
        };
    }
    return { bays: 10, shelves: 3, slots: 10 };
}

function getNormalizedLocKey(locStr) {
    if (!locStr) return '';
    let clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) return clean;

    const parsed = parseLocComponentsInternal(clean);
    if (parsed) {
        if (parsed.isSpecial) return parsed.code;
        return `${parsed.aisle}-${parsed.bay}-${parsed.shelf}-${parsed.slot}`;
    }
    return clean;
}

function normalizeLocationStandard(locStr) {
    return getNormalizedLocKey(locStr);
}

function formatLocationSpaced(locStr) {
    if (!locStr || locStr.includes('โปรดเลือก')) return '-';
    const clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();
    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return clean;
    }

    const p = parseLocComponentsInternal(clean);
    if (p && !p.isSpecial) {
        const isFull = clean.endsWith('-FULL') || clean.includes('FULL');
        const slotStr = isFull ? 'FULL' : p.slot;
        return `แถว ${p.aisle} • ล็อก ${p.bay} • ชั้น ${p.shelf} • ช่อง ${slotStr}`;
    }

    return clean.replace(/[\-_]/g, ' • ');
}

function formatLocationCode(locStr) {
    return formatLocationSpaced(locStr);
}

function formatLocationBadgeHTML(locStr) {
    if (!locStr || locStr === 'SELECT' || locStr === '' || locStr.includes('โปรดเลือก')) {
        return `<span class="loc-badge-container compact unselected"><span class="loc-segment">⚠️ โปรดเลือกแถวจัดเก็บ</span></span>`;
    }

    const clean = String(locStr).trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(clean)) {
        return `<span class="loc-badge-container compact special"><span class="loc-segment loc-aisle">📍 โซนพิเศษ: ${escapeHTML(clean)}</span></span>`;
    }

    const p = parseLocComponentsInternal(clean);
    if (p && !p.isSpecial) {
        const isFull = clean.endsWith('-FULL') || clean.includes('FULL');
        const slotStr = isFull ? 'FULL' : p.slot;

        return `
            <span class="loc-badge-container compact ${isFull ? 'full-slot' : ''}" title="${escapeHTML(clean)}">
                <span class="loc-segment loc-aisle"><i class="fa-solid fa-layer-group" style="font-size:0.7rem; margin-right:3px;"></i> แถว ${escapeHTML(p.aisle)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-bay">ล็อก ${escapeHTML(p.bay)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-shelf">ชั้น ${escapeHTML(p.shelf)}</span>
                <span class="loc-divider">•</span>
                <span class="loc-segment loc-slot ${isFull ? 'full' : ''}">ช่อง ${escapeHTML(slotStr)}</span>
            </span>
        `.trim();
    }

    return `<span class="loc-badge-container compact"><span class="loc-segment">📍 ${escapeHTML(clean)}</span></span>`;
}

function getOccupyingSnDetails(locStr) {
    if (!locStr) return null;
    const targetKey = getNormalizedLocKey(locStr);
    const searchTarget = String(locStr).trim().toUpperCase();

    const checkList = (list) => {
        if (!Array.isArray(list)) return null;
        for (const item of list) {
            if (!item) continue;
            const isOut = item.status === 'OUT' || item.status === 'DISPATCHED' || item.status === 'ISSUED' || item.status === 'RELEASED' || item.is_deleted || Number(item.qty) <= 0;
            if (isOut) continue;

            if (item.location) {
                const itemRaw = String(item.location).trim().toUpperCase();
                const itemKey = getNormalizedLocKey(item.location);
                if (itemRaw === searchTarget || (itemKey && targetKey && itemKey === targetKey)) {
                    return item;
                }
            }
        }
        return null;
    };

    let found = checkList(typeof globalInventoryData !== 'undefined' ? globalInventoryData : null);
    if (!found) found = checkList(typeof offlineInboundQueue !== 'undefined' ? offlineInboundQueue : null);
    if (!found) found = checkList(typeof recentInboundList !== 'undefined' ? recentInboundList : null);
    if (!found && Array.isArray(persistentDbSyncQueue)) {
        found = checkList(persistentDbSyncQueue.map(q => q && q.payload));
    }

    return found;
}

function getAllOccupiedLocationsSet() {
    if (cachedOccupiedSet) {
        pendingFastLocationSet.forEach(loc => addOccupiedLocToSet(cachedOccupiedSet, loc));
        if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
            occupiedLocationsSet.forEach(loc => addOccupiedLocToSet(cachedOccupiedSet, loc));
        }
        return cachedOccupiedSet;
    }

    const occupied = new Set();
    const isItemOccupying = (item) => {
        if (!item) return false;
        const statusUpper = String(item.status || '').toUpperCase();
        if (statusUpper === 'OUT' || statusUpper === 'DISPATCHED' || statusUpper === 'ISSUED' || statusUpper === 'RELEASED' || item.is_deleted || Number(item.qty) <= 0) {
            return false;
        }
        return true;
    };

    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        for (let i = 0; i < globalInventoryData.length; i++) {
            const item = globalInventoryData[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof offlineInboundQueue !== 'undefined' && Array.isArray(offlineInboundQueue)) {
        for (let i = 0; i < offlineInboundQueue.length; i++) {
            const item = offlineInboundQueue[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (Array.isArray(persistentDbSyncQueue)) {
        for (let i = 0; i < persistentDbSyncQueue.length; i++) {
            const item = persistentDbSyncQueue[i] && persistentDbSyncQueue[i].payload;
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList)) {
        for (let i = 0; i < recentInboundList.length; i++) {
            const item = recentInboundList[i];
            if (isItemOccupying(item) && item.location) addOccupiedLocToSet(occupied, item.location);
        }
    }
    if (typeof occupiedLocationsSet !== 'undefined' && occupiedLocationsSet instanceof Set) {
        occupiedLocationsSet.forEach(loc => addOccupiedLocToSet(occupied, loc));
    }

    pendingFastLocationSet.forEach(loc => addOccupiedLocToSet(occupied, loc));

    cachedOccupiedSet = occupied;
    return cachedOccupiedSet;
}

function calculateNextAvailableSlotInShelf(aisleName, bayName, shelfName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    const bayNum = parseInt(bayName, 10) || 1;
    const shelfNum = parseInt(shelfName, 10) || 1;
    const pad2 = (num) => String(num).padStart(2, '0');
    const bayStr = pad2(bayNum);
    const shelfStr = pad2(shelfNum);

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก') || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return { isFull: false, location: aisle, bay: '00', shelf: '00', slot: '00', freeSlots: 0, occupiedCount: 0, shelfCapacity: 0 };
    }

    const cfg = getAisleConfig(aisle);
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const occupied = getAllOccupiedLocationsSet();

    let shelfOccupiedCount = 0;
    let targetSlot = 0;
    let foundAvailable = false;

    for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
        const slStr = pad2(sl);
        const candNorm = `${aisle}-${bayStr}-${shelfStr}-${slStr}`;

        const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

        if (isOccupied) {
            shelfOccupiedCount++;
        } else if (!foundAvailable) {
            targetSlot = sl;
            foundAvailable = true;
        }
    }

    const freeSlots = Math.max(0, totalSlotsPerShelf - shelfOccupiedCount);

    if (!foundAvailable || freeSlots === 0) {
        return {
            isFull: true,
            location: `${aisle}-${bayStr}-${shelfStr}-FULL`,
            bay: bayStr,
            shelf: shelfStr,
            slot: '00',
            shelfCapacity: totalSlotsPerShelf,
            occupiedCount: shelfOccupiedCount,
            freeSlots: 0
        };
    }

    return {
        isFull: false,
        location: `${aisle}-${bayStr}-${shelfStr}-${pad2(targetSlot)}`,
        bay: bayStr,
        shelf: shelfStr,
        slot: pad2(targetSlot),
        shelfCapacity: totalSlotsPerShelf,
        occupiedCount: shelfOccupiedCount,
        freeSlots: freeSlots
    };
}

function calculateNextAvailableSlotInBayStrictAisle(aisleName, bayName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    const bayNum = parseInt(bayName, 10) || 1;
    const pad2 = (num) => String(num).padStart(2, '0');
    const bayStr = pad2(bayNum);

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก') || ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return { isFull: false, location: aisle, bay: '00', shelf: '00', slot: '00', bayCapacity: 0, freeSlots: 0, occupiedCount: 0 };
    }

    const cfg = getAisleConfig(aisle);
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const bayCapacity = totalShelves * totalSlotsPerShelf;
    const occupied = getAllOccupiedLocationsSet();

    let bayOccupiedCount = 0;
    let targetShelf = 0;
    let targetSlot = 0;
    let foundAvailable = false;

    for (let s = 1; s <= totalShelves; s++) {
        for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
            const slStr = pad2(sl);
            const sStr = pad2(s);
            const candNorm = `${aisle}-${bayStr}-${sStr}-${slStr}`;

            const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

            if (isOccupied) {
                bayOccupiedCount++;
            } else if (!foundAvailable) {
                targetShelf = s;
                targetSlot = sl;
                foundAvailable = true;
            }
        }
    }

    const freeSlots = Math.max(0, bayCapacity - bayOccupiedCount);

    if (!foundAvailable || freeSlots === 0) {
        return {
            isFull: true,
            location: `${aisle}-${bayStr}-FULL`,
            bay: bayStr,
            shelf: '00',
            slot: '00',
            bayCapacity: bayCapacity,
            occupiedCount: bayOccupiedCount,
            freeSlots: 0
        };
    }

    return {
        isFull: false,
        location: `${aisle}-${bayStr}-${pad2(targetShelf)}-${pad2(targetSlot)}`,
        bay: bayStr,
        shelf: pad2(targetShelf),
        slot: pad2(targetSlot),
        bayCapacity: bayCapacity,
        occupiedCount: bayOccupiedCount,
        freeSlots: freeSlots
    };
}

function calculateAisleCapacityAndNextSlot(aisleName) {
    const aisle = (aisleName || '').trim().toUpperCase();
    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก')) {
        return { location: 'โปรดเลือกแถวจัดเก็บ', bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0, isFull: true };
    }

    const specialLocations = ['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'];
    if (specialLocations.includes(aisle)) {
        return { location: aisle, bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0, isFull: false };
    }

    const cfg = getAisleConfig(aisle);

    const totalBays = parseInt(cfg.bays || cfg.bay, 10) || 10;
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;
    const totalSlotsPerShelf = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const totalCapacity = totalBays * totalShelves * totalSlotsPerShelf;

    const occupied = getAllOccupiedLocationsSet();

    let aisleOccupiedCount = 0;
    for (let b = 1; b <= totalBays; b++) {
        for (let s = 1; s <= totalShelves; s++) {
            for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
                const bStr = String(b).padStart(2, '0');
                const sStr = String(s).padStart(2, '0');
                const slStr = String(sl).padStart(2, '0');
                const candNorm = `${aisle}-${bStr}-${sStr}-${slStr}`;
                if (occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm))) {
                    aisleOccupiedCount++;
                }
            }
        }
    }

    const freeSlots = Math.max(0, totalCapacity - aisleOccupiedCount);
    const pad2 = (num) => String(num).padStart(2, '0');

    let nextLocation = `${aisle}-FULL`;
    let targetBay = 0, targetShelf = 0, targetSlot = 0;
    let found = false;

    for (let b = 1; b <= totalBays; b++) {
        for (let s = 1; s <= totalShelves; s++) {
            for (let sl = 1; sl <= totalSlotsPerShelf; sl++) {
                const bStr = pad2(b);
                const sStr = pad2(s);
                const slStr = pad2(sl);
                const candNorm = `${aisle}-${bStr}-${sStr}-${slStr}`;

                if (!occupied.has(candNorm) && !occupied.has(getNormalizedLocKey(candNorm)) && !occupied.has(formatLocationSpaced(candNorm))) {
                    nextLocation = candNorm;
                    targetBay = b;
                    targetShelf = s;
                    targetSlot = sl;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (found) break;
    }

    return {
        location: nextLocation,
        bay: targetBay,
        shelf: targetShelf,
        slot: targetSlot,
        totalSlots: totalCapacity,
        occupiedCount: aisleOccupiedCount,
        freeSlots: freeSlots,
        baysConfigured: totalBays,
        shelvesConfigured: totalShelves,
        slotsConfigured: totalSlotsPerShelf,
        isFull: !found
    };
}

function populateInboundSlotDropdown(aisle, bay, shelf) {
    const slotSelect = document.getElementById('inboundSlotSelect');
    if (!slotSelect) return '01';

    if (!aisle || aisle === 'SELECT' || aisle.includes('โปรดเลือก')) {
        slotSelect.innerHTML = `<option value="" selected>-- โปรดเลือกแถวก่อน --</option>`;
        slotSelect.disabled = true;
        return '';
    }

    const cfg = getAisleConfig(aisle);
    const totalSlots = parseInt(cfg.slots || cfg.slot, 10) || 10;
    const occupied = getAllOccupiedLocationsSet();
    const pad2 = (n) => String(n).padStart(2, '0');

    let slotHtml = '';
    let autoSelectedSlot = '';

    const bayStr = pad2(bay);
    const shelfNum = parseInt(shelf, 10) || 1;
    const shelfStr = pad2(shelfNum);

    for (let sl = 1; sl <= totalSlots; sl++) {
        const slStr = pad2(sl);
        const candNorm = `${aisle}-${bayStr}-${shelfStr}-${slStr}`;

        const isOccupied = occupied.has(candNorm) || occupied.has(getNormalizedLocKey(candNorm)) || occupied.has(formatLocationSpaced(candNorm));

        if (isOccupied) {
            const item = getOccupyingSnDetails(candNorm);
            const snLabel = item && item.sn ? ` - SN: ${item.sn}` : '';
            slotHtml += `<option value="${slStr}" disabled style="color:#ef4444; background:#fef2f2;">🔴 ช่อง ${slStr} (ไม่ว่าง${snLabel})</option>`;
        } else {
            if (!autoSelectedSlot) {
                autoSelectedSlot = slStr;
            }
            slotHtml += `<option value="${slStr}">🟢 ช่อง ${slStr} (ว่าง)</option>`;
        }
    }

    slotSelect.innerHTML = slotHtml;

    if (autoSelectedSlot) {
        slotSelect.value = autoSelectedSlot;
    } else if (slotSelect.options.length > 0) {
        slotSelect.value = slotSelect.options[0].value;
    }

    return autoSelectedSlot;
}

// 🟢 🎯 บังคับค่าเริ่มต้นของ "แถวจัดเก็บ" ให้เว้นว่าง / แสดง "-- โปรดเลือกแถวจัดเก็บ --" เป็นหลักเสมอ
function populateInboundAisleDropdown(preserveUserChoice = false) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (!aisleSelect) return;

    const prevVal = preserveUserChoice && userHasSelectedAisle ? (aisleSelect.value || '').trim().toUpperCase() : '';

    let aislesList = [];
    if (typeof window !== 'undefined' && Array.isArray(window.masterAisles) && window.masterAisles.length > 0) {
        aislesList = window.masterAisles.map(a => typeof a === 'object' ? (a.name || a.aisle || a.key || a.code || a) : a);
    } else if (typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem('WMS_MASTER_AISLES');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) aislesList = parsed.map(a => typeof a === 'object' ? (a.name || a.aisle || a.key || a.code || a) : a);
            }
        } catch (e) {}
    }

    if (aislesList.length === 0) {
        aislesList = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    }

    const cleanAisles = [];
    const seen = new Set();
    aislesList.forEach(a => {
        const str = String(a || '').trim().toUpperCase();
        if (str && str !== 'DOCK' && str !== 'SELECT' && str !== 'NONE' && !str.includes('โปรดเลือก') && !seen.has(str)) {
            seen.add(str);
            cleanAisles.push(str);
        }
    });

    // 🟢 ใส่ "-- โปรดเลือกแถวจัดเก็บ --" (value="") เป็นตัวเลือกหลักและค่าเริ่มต้นเสมอ (ไม่เลือกแถวในคลังอัตโนมัติ)
    let html = `<option value="" ${!prevVal ? 'selected' : ''}>-- โปรดเลือกแถวจัดเก็บ --</option>`;
    html += `<option value="DOCK" ${prevVal === 'DOCK' ? 'selected' : ''}>📍 โซนลาน DOCK (รับฝากชั่วคราว)</option>`;

    cleanAisles.forEach(cleanA => {
        html += `<option value="${escapeHTML(cleanA)}" ${prevVal === cleanA ? 'selected' : ''}>แถว ${escapeHTML(cleanA)}</option>`;
    });

    aisleSelect.innerHTML = html;
    aisleSelect.value = prevVal || '';
}

// 🟢 ป้องกันไม่ให้สคริปต์ภายนอกบังคับเปลี่ยนค่าเริ่มต้นของ #inboundAisleSelect
function installAisleDropdownBlankGuard() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (!aisleSelect || aisleDropdownObserver) return;

    aisleDropdownObserver = new MutationObserver(() => {
        const firstOpt = aisleSelect.options[0];
        const hasPlaceholder = firstOpt && firstOpt.value === '' && firstOpt.text.includes('โปรดเลือก');

        if (!hasPlaceholder) {
            const placeholderOpt = document.createElement('option');
            placeholderOpt.value = '';
            placeholderOpt.textContent = '-- โปรดเลือกแถวจัดเก็บ --';
            aisleSelect.insertBefore(placeholderOpt, aisleSelect.firstChild);
        }

        if (!userHasSelectedAisle && aisleSelect.value !== '') {
            aisleSelect.value = '';
            populateInboundLocationDropdownsStrict('');
        }
    });

    aisleDropdownObserver.observe(aisleSelect, { childList: true });
}

// 🟢 🎯 คำนวณอัปเดตพิกัดแบบ Strict โดยหากยังไม่ได้เลือกแถว จะเว้นว่างและปิดล็อกตัวเลือกอื่น ๆ
function populateInboundLocationDropdownsStrict(aisleName, keepBay = null, autoSelectFirstAvailable = false) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    if (!aisleSelect) return;

    if (aisleSelect.options.length <= 1 || !aisleSelect.options[0] || aisleSelect.options[0].value !== '') {
        populateInboundAisleDropdown(true);
    }

    let aisle = (aisleName !== undefined && aisleName !== null) ? aisleName : (userHasSelectedAisle ? aisleSelect.value : '');
    aisle = String(aisle || '').trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    if (!baySelect || !shelfSelect || !slotSelect) return;

    // 🟢 บังคับให้เว้นว่างหากยังไม่ได้เลือกแถวจัดเก็บ
    if (!aisle || aisle === 'SELECT' || aisle === '' || aisle.includes('โปรดเลือก')) {
        aisleSelect.value = '';
        baySelect.innerHTML = `<option value="" selected>-- โปรดเลือกแถวก่อน --</option>`;
        shelfSelect.innerHTML = `<option value="" selected>-- โปรดเลือกแถวก่อน --</option>`;
        slotSelect.innerHTML = `<option value="" selected>-- โปรดเลือกแถวก่อน --</option>`;
        baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = true;
        updateInboundLocationPreviewFromDropdowns();
        return;
    }

    aisleSelect.value = aisle;

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        baySelect.innerHTML = `<option value="00">00 (โซนพิเศษ)</option>`;
        shelfSelect.innerHTML = `<option value="00">00 (โซนพิเศษ)</option>`;
        slotSelect.innerHTML = `<option value="00">00 (โซนพิเศษ)</option>`;
        baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = true;
        updateInboundLocationPreviewFromDropdowns();
        ensureSnInputFocus();
        return;
    }

    baySelect.disabled = shelfSelect.disabled = slotSelect.disabled = false;

    const cfg = getAisleConfig(aisle);
    const totalBays = parseInt(cfg.bays || cfg.bay, 10) || 10;
    const totalShelves = parseInt(cfg.shelves || cfg.shelf, 10) || 3;

    let bayHtml = '';
    for (let b = 1; b <= totalBays; b++) {
        const bStr = String(b).padStart(2, '0');
        bayHtml += `<option value="${bStr}">ล็อก ${bStr}</option>`;
    }
    baySelect.innerHTML = bayHtml;

    let shelfHtml = '';
    for (let s = 1; s <= totalShelves; s++) {
        const sStr = String(s).padStart(2, '0');
        shelfHtml += `<option value="${sStr}">ชั้น ${sStr}</option>`;
    }
    shelfSelect.innerHTML = shelfHtml;

    const aisleDetails = calculateAisleCapacityAndNextSlot(aisle);

    let targetBayStr = '01';

    if ((autoSelectFirstAvailable || keepBay === null || keepBay === undefined || keepBay === '') && !aisleDetails.isFull && aisleDetails.bay > 0) {
        targetBayStr = String(aisleDetails.bay).padStart(2, '0');
    } else {
        targetBayStr = keepBay || baySelect.value || '01';
    }

    let targetBayNum = parseInt(targetBayStr, 10) || 1;
    if (targetBayNum > totalBays) targetBayNum = 1;

    targetBayStr = String(targetBayNum).padStart(2, '0');
    let resBay = calculateNextAvailableSlotInBayStrictAisle(aisle, targetBayStr);

    if (resBay.isFull) {
        for (let bOffset = 1; bOffset < totalBays; bOffset++) {
            let testBayNum = ((targetBayNum - 1 + bOffset) % totalBays) + 1;
            let testBayStr = String(testBayNum).padStart(2, '0');
            let testRes = calculateNextAvailableSlotInBayStrictAisle(aisle, testBayStr);

            if (!testRes.isFull) {
                targetBayStr = testBayStr;
                resBay = testRes;
                break;
            }
        }
    }

    baySelect.value = targetBayStr;

    if (!resBay.isFull) {
        shelfSelect.value = resBay.shelf;
        populateInboundSlotDropdown(aisle, targetBayStr, resBay.shelf);
    } else {
        populateInboundSlotDropdown(aisle, targetBayStr, shelfSelect.value || '01');
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function onInboundBayChange(bayValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

    const currentBay = bayValue || (baySelect ? baySelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    const res = calculateNextAvailableSlotInBayStrictAisle(currentAisle, currentBay);

    if (res.isFull) {
        populateInboundSlotDropdown(currentAisle, currentBay, shelfSelect ? shelfSelect.value : '01');
    } else {
        if (shelfSelect) shelfSelect.value = res.shelf;
        populateInboundSlotDropdown(currentAisle, currentBay, res.shelf);
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function onInboundShelfChange(shelfValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

    const currentBay = baySelect ? baySelect.value : '01';
    const currentShelf = shelfValue || (shelfSelect ? shelfSelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    populateInboundSlotDropdown(currentAisle, currentBay, currentShelf);
    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function onInboundSlotChange(slotValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) return;

    const currentBay = baySelect ? baySelect.value : '01';
    const currentShelf = shelfSelect ? shelfSelect.value : '01';
    const currentSlot = slotValue || (slotSelect ? slotSelect.value : '01');

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(currentAisle)) return;

    const formattedLoc = `${currentAisle}-${currentBay}-${currentShelf}-${currentSlot}`;
    const occupied = getAllOccupiedLocationsSet();

    if (occupied.has(formattedLoc) || occupied.has(getNormalizedLocKey(formattedLoc))) {
        const autoSlot = populateInboundSlotDropdown(currentAisle, currentBay, currentShelf);
        if (slotSelect) slotSelect.value = autoSlot;
    }

    updateInboundLocationPreviewFromDropdowns();
    ensureSnInputFocus();
}

function getSelectedLocationFromDropdowns() {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');
    const slotSelect = document.getElementById('inboundSlotSelect');

    const aisle = (aisleSelect ? aisleSelect.value : '').trim().toUpperCase().replace(/^ร้านล็อก|^ร้าน/gi, '').trim();

    if (!aisle || aisle.includes('โปรดเลือก')) return '';

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        return aisle;
    }

    const pad2 = (val) => String(parseInt(val, 10) || 1).padStart(2, '0');
    const bay = pad2(baySelect ? baySelect.value : '01');
    const shelf = pad2(shelfSelect ? shelfSelect.value : '01');
    const slot = pad2(slotSelect ? slotSelect.value : '01');

    return `${aisle}-${bay}-${shelf}-${slot}`;
}

function updateInboundLocationPreviewFromDropdowns() {
    const previewElem = document.getElementById('inboundLocationPreview');
    const hiddenLocInput = document.getElementById('inboundLocation');

    const dbLocKey = getSelectedLocationFromDropdowns();

    if (previewElem) {
        previewElem.innerHTML = formatLocationBadgeHTML(dbLocKey);
        previewElem.classList.remove('pulse-highlight');
        void previewElem.offsetWidth;
        previewElem.classList.add('pulse-highlight');
    }

    if (hiddenLocInput) hiddenLocInput.value = dbLocKey;

    const aisleSelect = document.getElementById('inboundAisleSelect');
    const aisle = aisleSelect ? aisleSelect.value : '';

    if (!aisle || aisle.includes('โปรดเลือก')) {
        renderAisleSlotBreakdownUI({ location: 'โปรดเลือกแถวจัดเก็บ', bay: 0, shelf: 0, slot: 0, totalSlots: 0, occupiedCount: 0, freeSlots: 0 });
        updateBatchSnBarAisleCapacityHint(null);
        return;
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(aisle)) {
        const specialDet = calculateAisleCapacityAndNextSlot(aisle);
        renderAisleSlotBreakdownUI(specialDet);
        updateBatchSnBarAisleCapacityHint(specialDet);
        return;
    }

    const baySelect = document.getElementById('inboundBaySelect');
    const shelfSelect = document.getElementById('inboundShelfSelect');

    const bay = baySelect ? baySelect.value : '01';
    const shelf = shelfSelect ? shelfSelect.value : '01';

    const details = calculateAisleCapacityAndNextSlot(aisle);
    details.bay = parseInt(bay, 10);
    details.shelf = parseInt(shelf, 10);
    details.location = dbLocKey;

    renderAisleSlotBreakdownUI(details);
    updateBatchSnBarAisleCapacityHint(details);
}

function onInboundAisleChange(aisleValue) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const currentAisle = aisleValue !== undefined ? aisleValue : (aisleSelect ? aisleSelect.value : '');

    if (!currentAisle || currentAisle.includes('โปรดเลือก')) {
        userHasSelectedAisle = false;
        populateInboundLocationDropdownsStrict('');
        updateInboundLocationPreviewFromDropdowns();
        return '';
    }

    userHasSelectedAisle = true;
    populateInboundLocationDropdownsStrict(currentAisle, null, true);
    const hiddenLoc = document.getElementById('inboundLocation');
    return hiddenLoc ? hiddenLoc.value : currentAisle;
}

function renderAisleSlotBreakdownUI(details) {
    let infoContainer = document.getElementById('inboundAisleSlotDetailBox');

    if (!infoContainer) {
        const previewElem = document.getElementById('inboundLocationPreview');
        if (previewElem && previewElem.parentElement) {
            infoContainer = document.createElement('div');
            infoContainer.id = 'inboundAisleSlotDetailBox';
            infoContainer.className = 'glass-hud-box';
            previewElem.parentElement.appendChild(infoContainer);
        } else {
            return;
        }
    }

    if (!details.location || details.location.includes('โปรดเลือก')) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--warning, #d97706); font-weight:600; padding:12px; background:rgba(254, 243, 199, 0.6); border-radius:12px; border:1px solid #fde68a; backdrop-filter:blur(6px);">
                ⚠️ โปรดเลือกแถวจัดเก็บจากรายการด้านบนก่อนทำการสแกน
            </div>
        `;
        return;
    }

    if (['DOCK', 'OFFICE', 'PENDING', 'FOOD', 'FREEZER', 'COLD', 'DRY', 'RAW'].includes(details.location)) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--primary-text, #0284c7); font-weight:600; padding:10px; background:rgba(224, 242, 254, 0.7); border-radius:12px; border:1px solid var(--primary-border, #bae6fd); backdrop-filter:blur(6px);">
                📍 พิกัดพิเศษ: <strong>${details.location}</strong> (รับเข้าโซนส่วนกลาง)
            </div>
        `;
        return;
    }

    if (details.location.endsWith('-FULL') || details.location.includes('FULL')) {
        infoContainer.innerHTML = `
            <div style="text-align:center; color:var(--danger, #ef4444); font-weight:700; padding:12px; background:rgba(254, 226, 226, 0.7); border-radius:12px; border:1px solid #fca5a5; backdrop-filter:blur(6px);">
                ⚠️ ล็อก/แถวนี้เต็มแล้ว! (ใช้ไป ${details.occupiedCount}/${details.totalSlots} ช่อง จากทั้งหมด ${details.baysConfigured} ล็อก)
            </div>
        `;
        return;
    }

    const usedPercent = details.totalSlots > 0 ? Math.round((details.occupiedCount / details.totalSlots) * 100) : 0;
    const progressColor = usedPercent > 85 ? '#ef4444' : (usedPercent > 60 ? '#f59e0b' : '#10b981');

    infoContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border-color, #e2e8f0);">
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="pulse-live-dot"></span>
                <span style="font-weight:700; color:var(--text-main, #0f172a); font-size:0.83rem;">สถานะจัดเก็บ Realtime 100%</span>
            </div>
            <button type="button" onclick="triggerAutoFindNextSlot()" style="background:none; border:none; color:var(--primary-text, #0284c7); font-size:0.75rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; transition:opacity 0.2s ease;">
                <i class="fa-solid fa-rotate-right"></i> รีเฟรชพิกัด
            </button>
        </div>

        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; text-align:center; margin-bottom:12px;">
            <div style="background:var(--primary-light, #e0f2fe); padding:8px 6px; border-radius:10px; border:1px solid var(--primary-border, #bae6fd);">
                <span style="font-size:0.7rem; color:var(--text-sub, #475569); display:block; margin-bottom:2px;">ล็อกที่เลือก</span>
                <strong style="font-size:1rem; color:var(--primary-text, #0284c7);" class="mono">ล็อก ${String(details.bay).padStart(2, '0')}</strong>
            </div>
            <div style="background:var(--primary-light, #e0f2fe); padding:8px 6px; border-radius:10px; border:1px solid var(--primary-border, #bae6fd);">
                <span style="font-size:0.7rem; color:var(--text-sub, #475569); display:block; margin-bottom:2px;">ชั้นที่เลือก</span>
                <strong style="font-size:1rem; color:var(--primary-text, #0284c7);" class="mono">ชั้น ${String(details.shelf).padStart(2, '0')}</strong>
            </div>
            <div style="background:rgba(220, 252, 231, 0.8); padding:8px 6px; border-radius:10px; border:1px solid rgba(16,185,129,0.3);">
                <span style="font-size:0.7rem; color:#15803d; display:block; margin-bottom:2px;">ช่องว่าง Auto</span>
                <strong style="font-size:1rem; color:#10b981;" class="mono">ช่อง ${String(details.slot).padStart(2, '0')}</strong>
            </div>
        </div>

        <div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-sub, #64748b); margin-bottom:4px;">
                <span>อัตราความจุแถวนี้:</span>
                <strong style="color:${progressColor}">${usedPercent}% (${details.occupiedCount}/${details.totalSlots})</strong>
            </div>
            <div style="width:100%; height:8px; background:var(--bg-subtle, #e2e8f0); border-radius:99px; overflow:hidden;">
                <div style="width:${usedPercent}%; height:100%; background:${progressColor}; transition:width 0.4s ease-in-out; border-radius:99px;"></div>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-sub, #64748b); border-top:1px dashed var(--border-color, #cbd5e1); padding-top:10px; margin-top:6px;">
            <span>🟢 ช่องว่างคงเหลือ: <strong style="color:var(--success, #10b981);" class="mono">${details.freeSlots}</strong> / ${details.totalSlots} ช่อง</span>
            <button type="button" class="btn btn-sm" onclick="triggerAutoFindNextSlot()" style="font-size:0.72rem; padding:4px 12px; background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); border:1px solid var(--primary-border, #bae6fd); border-radius:8px; cursor:pointer; font-weight:600; transition:all 0.2s ease;">
                ⚡ หาช่องว่างถัดไป
            </button>
        </div>
    `;
}

function triggerAutoFindNextSlot() {
    invalidateOccupiedLocationsCache();
    forceSyncAndSelectAvailableLocation(true);
}

function forceSyncAndSelectAvailableLocation(autoSelectFirstAvailable = true) {
    const aisleSelect = document.getElementById('inboundAisleSelect');
    const baySelect = document.getElementById('inboundBaySelect');

    if (!userHasSelectedAisle) {
        populateInboundLocationDropdownsStrict('', null, false);
        return;
    }

    const currentAisle = aisleSelect ? aisleSelect.value : '';
    if (!currentAisle || currentAisle.includes('โปรดเลือก')) {
        populateInboundLocationDropdownsStrict('', null, autoSelectFirstAvailable);
        return;
    }

    const currentBay = baySelect ? baySelect.value : '01';
    populateInboundLocationDropdownsStrict(currentAisle, autoSelectFirstAvailable ? null : currentBay, autoSelectFirstAvailable);
}

function autoSelectNextAvailableSlotAfterInbound() {
    forceSyncAndSelectAvailableLocation(true);
}