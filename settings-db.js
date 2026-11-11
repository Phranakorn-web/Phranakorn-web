// =========================================================================
// --- MODULE 8: WAREHOUSE SETTINGS & MENU DB MAPPING ENGINE (UPDATED v2026) ---
// --- HIGH-PERFORMANCE REALTIME STRUCTURE ZONE TYPE & CATEGORY FILTER ENGINE ---
// =========================================================================

if (typeof escapeHTML !== 'function') {
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

window.masterAisles = window.masterAisles || [];
window.aisleConfigs = window.aisleConfigs || {};

let isConfigsLoadedFromDB = false;

// ตัวแปรควบคุมการคัดกรองหมวดหมู่ในตารางตั้งค่า (Category & Search Filter State)
let aisleTableZoneFilter = 'ALL'; // 'ALL', 'MAIN', 'AUXILIARY', 'LOCKED'
let aisleTableSearchQuery = '';

let menuDbMappingData = [
    { menuId: 'view-inventory', menuTitle: 'เช็คสต็อกสินค้า', dbTable: 'warehouse_items / products', status: 'Active (Realtime)', desc: 'อ่าน/ค้นหา สต็อกทั้งหมด และค้นหารหัสสินค้า Master' },
    { menuId: 'view-inbound', menuTitle: 'รับสินค้าเข้าคลัง (Fast)', dbTable: 'warehouse_items', status: 'Active (Realtime Insert)', desc: 'เพิ่มรายการ S/N สินค้าเข้าฐานข้อมูลโดยตรง' },
    { menuId: 'view-outbound', menuTitle: 'จ่ายสินค้าออกจากคลัง', dbTable: 'outbound_orders / warehouse_items', status: 'Active (Realtime Sync)', desc: 'ตัดจ่าย S/N ออกจากคลัง และสร้างใบสั่งจ่าย' },
    { menuId: 'view-locations', menuTitle: 'ผังตำแหน่งคลังสินค้า', dbTable: 'warehouse_items / system_settings', status: 'Active (Drill-Down)', desc: 'แสดงตำแหน่งจัดเก็บจริงตามโครงสร้างแถวและล็อก' },
    { menuId: 'view-approvals', menuTitle: 'ศูนย์อนุมัติคำขอ', dbTable: 'approval_requests', status: 'Active (Realtime Approvals)', desc: 'จัดการอนุมัติ/ปฏิเสธคำขอลบและจ่ายสินค้าจาก User' },
    { menuId: 'view-activities', menuTitle: 'ดูประวัติการใช้งาน', dbTable: 'user_activities', status: 'Active (Realtime Logging)', desc: 'เก็บบันทึกและแสดงผลประวัติกิจกรรมผู้ใช้งานทั้งหมด' },
    { menuId: 'view-settings', menuTitle: 'ตั้งค่าพิกัดคลังสินค้า', dbTable: 'system_settings / profiles', status: 'Active (System Config)', desc: 'บันทึกโครงสร้างคลัง จัดการสิทธิ์ผู้ใช้ และตรวจสอบ DB Connection' }
];

// Helper: ดึงประเภทโซนของแถวจัดเก็บ (Main vs Auxiliary)
function getAisleZoneTypeConfig(aisle) {
    const k = String(aisle || '').trim();
    const cfg = window.aisleConfigs[k];
    if (cfg && (cfg.zone_type || cfg.zoneType)) {
        const z = String(cfg.zone_type || cfg.zoneType).toLowerCase();
        if (z === 'main' || z === 'auxiliary') return z;
    }
    // ค่าเริ่มต้นกรณีไม่ได้ระบุ: แถว A-D หรือแถวที่ถูกล็อก = main, อื่นๆ = auxiliary
    if (/^[A-D]$/i.test(k) || (cfg && cfg.is_locked)) return 'main';
    return 'auxiliary';
}

async function saveAllWarehouseConfigsToDB() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    
    const aislePayload = {
        key: 'aisle_configs',
        value: { 
            aisles: window.masterAisles, 
            configs: window.aisleConfigs 
        },
        updated_at: new Date().toISOString()
    };

    const mappingPayload = {
        key: 'menu_db_mapping',
        value: menuDbMappingData,
        updated_at: new Date().toISOString()
    };

    try {
        localStorage.setItem('WMS_AISLE_CONFIGS', JSON.stringify(aislePayload.value));
        localStorage.setItem('WMS_MENU_MAPPING', JSON.stringify(mappingPayload.value));
    } catch(err) {}

    if (!client) {
        if (typeof showToast === 'function') showToast("💾 บันทึกในเครื่องแล้ว (รอการเชื่อมต่อ DB)", "warning");
        return false;
    }

    try {
        let { error: err1 } = await client.from('system_settings').upsert(aislePayload, { onConflict: 'key' });
        
        if (err1 && err1.message && err1.message.includes('updated_at')) {
            const fallbackAislePayload = { key: 'aisle_configs', value: aislePayload.value };
            const fallbackMappingPayload = { key: 'menu_db_mapping', value: mappingPayload.value };
            
            const resA = await client.from('system_settings').upsert(fallbackAislePayload, { onConflict: 'key' });
            const resB = await client.from('system_settings').upsert(fallbackMappingPayload, { onConflict: 'key' });
            
            if (resA.error) throw resA.error;
            if (resB.error) throw resB.error;
        } else {
            if (err1) throw err1;
            const { error: err2 } = await client.from('system_settings').upsert(mappingPayload, { onConflict: 'key' });
            if (err2) throw err2;
        }

        if (typeof showToast === 'function') {
            showToast("⚡ บันทึกลำดับแถวและพิกัดลง DB เรียบร้อย 100%");
        }
        return true;
    } catch (e) {
        if (typeof showToast === 'function') {
            showToast("❌ บันทึกลง DB ล้มเหลว", "error");
        }
        return false;
    }
}

async function loadWarehouseConfigsFromDB(retryCount = 0) {
    try {
        let dbAisles = [];
        let dbConfigs = {};
        let loadedSuccess = false;

        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;

        if (!client && retryCount < 5) {
            setTimeout(() => loadWarehouseConfigsFromDB(retryCount + 1), 300);
            return;
        }

        if (client) {
            const { data: aisleData, error: aisleErr } = await client
                .from('system_settings')
                .select('*')
                .eq('key', 'aisle_configs')
                .maybeSingle();

            if (!aisleErr && aisleData && aisleData.value) {
                let val = aisleData.value;
                if (typeof val === 'string') {
                    try { val = JSON.parse(val); } catch(e) {}
                }
                if (val && typeof val === 'object') {
                    dbAisles = Array.isArray(val.aisles) ? val.aisles : [];
                    dbConfigs = val.configs || {};
                    if (dbAisles.length > 0) loadedSuccess = true;
                }
            }

            const { data: mapData, error: mapErr } = await client
                .from('system_settings')
                .select('*')
                .eq('key', 'menu_db_mapping')
                .maybeSingle();

            if (!mapErr && mapData && mapData.value) {
                let mapVal = mapData.value;
                if (typeof mapVal === 'string') {
                    try { mapVal = JSON.parse(mapVal); } catch(e) {}
                }
                if (Array.isArray(mapVal)) menuDbMappingData = mapVal;
            }
        }

        if (!loadedSuccess || dbAisles.length === 0) {
            const local = localStorage.getItem('WMS_AISLE_CONFIGS');
            if (local) {
                try {
                    let parsed = JSON.parse(local);
                    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                    dbAisles = parsed.aisles || [];
                    dbConfigs = parsed.configs || {};
                    if (dbAisles.length > 0) loadedSuccess = true;
                } catch(err) {}
            }
        }

        if (loadedSuccess && dbAisles.length > 0) {
            window.masterAisles = dbAisles;
            window.aisleConfigs = dbConfigs;
            isConfigsLoadedFromDB = true;
        } else if (!isConfigsLoadedFromDB) {
            const defaultAisles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DOCK', 'OFFICE', 'PENDING'];
            window.masterAisles = defaultAisles;
            window.masterAisles.forEach(aisle => {
                const isMainDefault = ['A', 'B', 'C', 'D'].includes(aisle);
                window.aisleConfigs[aisle] = window.aisleConfigs[aisle] || { 
                    bays: 10, 
                    shelves: 1, 
                    slots: 10, 
                    zone_type: isMainDefault ? 'main' : 'auxiliary',
                    is_locked: ['A', 'B', 'C', 'D', 'DOCK'].includes(aisle) 
                };
            });
        }

        // ตรวจสอบและเติมโครงสร้าง zone_type กรณีข้อมูลเก่าที่ยังไม่มี
        window.masterAisles.forEach(a => {
            if (!window.aisleConfigs[a]) {
                window.aisleConfigs[a] = { bays: 10, shelves: 1, slots: 10, is_locked: false, zone_type: getAisleZoneTypeConfig(a) };
            } else if (!window.aisleConfigs[a].zone_type) {
                window.aisleConfigs[a].zone_type = getAisleZoneTypeConfig(a);
            }
        });

        if (window.masterAisles.length > 0 && (!window.currentSelectedAisle || !window.masterAisles.includes(window.currentSelectedAisle))) {
            window.currentSelectedAisle = window.masterAisles[0];
        }
    } catch(e) {}

    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    renderMenuDatabaseMappingTable();
}

function initWarehouseSettingsRealtime() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!client) return;

    try {
        client
            .channel('public_system_settings_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, (payload) => {
                if (payload.new && payload.new.key === 'aisle_configs') {
                    let val = payload.new.value;
                    if (typeof val === 'string') {
                        try { val = JSON.parse(val); } catch(e) {}
                    }
                    if (val && Array.isArray(val.aisles)) {
                        window.masterAisles = val.aisles;
                        window.aisleConfigs = val.configs || {};
                        renderAisleSettingsTable();
                        if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
                        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
                    }
                } else if (payload.new && payload.new.key === 'menu_db_mapping') {
                    let mapVal = payload.new.value;
                    if (typeof mapVal === 'string') {
                        try { mapVal = JSON.parse(mapVal); } catch(e) {}
                    }
                    if (Array.isArray(mapVal)) {
                        menuDbMappingData = mapVal;
                        renderMenuDatabaseMappingTable();
                    }
                }
            })
            .subscribe();
    } catch (e) {}
}

async function moveAisleOrder(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= window.masterAisles.length) return;

    const temp = window.masterAisles[index];
    window.masterAisles[index] = window.masterAisles[targetIndex];
    window.masterAisles[targetIndex] = temp;

    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();

    await saveAllWarehouseConfigsToDB();
}

async function toggleAisleLock(aisle) {
    if (!window.aisleConfigs[aisle]) {
        window.aisleConfigs[aisle] = { bays: 10, shelves: 1, slots: 10, zone_type: getAisleZoneTypeConfig(aisle), is_locked: false };
    }
    window.aisleConfigs[aisle].is_locked = !window.aisleConfigs[aisle].is_locked;

    renderAisleSettingsTable();
    await saveAllWarehouseConfigsToDB();
}

// 🟢 อัปเดตพารามิเตอร์แถวจัดเก็บ รองรับทั้งตัวเลข (bays, shelves, slots) และข้อความ (zone_type)
async function updateAisleParam(aisle, key, val) {
    if (!window.aisleConfigs[aisle]) {
        window.aisleConfigs[aisle] = { bays: 10, shelves: 1, slots: 10, zone_type: getAisleZoneTypeConfig(aisle), is_locked: false };
    }

    if (key === 'zone_type' || key === 'zoneType') {
        window.aisleConfigs[aisle].zone_type = String(val).toLowerCase();
    } else {
        window.aisleConfigs[aisle][key] = parseInt(val, 10) || 1;
    }

    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    await saveAllWarehouseConfigsToDB();
}

async function addNewAisleConfig() {
    const input = document.getElementById('newAisleInput');
    if (!input) return;

    const aisleName = input.value.trim().toUpperCase();
    if (!aisleName || window.masterAisles.includes(aisleName)) return;

    const zoneTypeSelect = document.getElementById('newAisleZoneTypeSelect');
    const selectedZoneType = zoneTypeSelect ? zoneTypeSelect.value : 'auxiliary';

    window.masterAisles.push(aisleName);
    window.aisleConfigs[aisleName] = { 
        bays: 10, 
        shelves: 1, 
        slots: 10, 
        zone_type: selectedZoneType, 
        is_locked: false 
    };
    input.value = '';

    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    await saveAllWarehouseConfigsToDB();
}

// 🟢 ยืนยันและลบแถวพร้อมตรวจสอบสิทธิ์ผู้ดูแลระบบ
async function verifyAndDeleteAisle(aisle) {
    const cfg = window.aisleConfigs[aisle];
    if (cfg && cfg.is_locked) {
        alert(`⚠️ แถว ${escapeHTML(aisle)} ถูกล็อกไว้เป็นโครงสร้างหลัก ไม่สามารถลบได้ กรุณาปลดล็อกก่อน`);
        return;
    }

    const pinCode = prompt(`🔐 ยืนยันสิทธิ์: กรุณากรอกรหัสผ่านผู้ดูแลระบบ (Admin Password) เพื่อลบแถว "${escapeHTML(aisle)}":`);
    if (pinCode === null) return;

    const isValidAdmin = typeof verifyAdminPasswordSecure === 'function' ? await verifyAdminPasswordSecure(pinCode) : false;

    if (!isValidAdmin) {
        if (typeof playErrorSound === 'function') playErrorSound();
        alert("❌ รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง! ยกเลิกการลบแถว");
        return;
    }

    if (confirm(`คุณแน่ใจอย่างยิ่งใช่หรือไม่ว่าต้องการลบแถว ${aisle} ออกจากระบบ?`)) {
        window.masterAisles = window.masterAisles.filter(a => a !== aisle);
        delete window.aisleConfigs[aisle];
        renderAisleSettingsTable();
        if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        await saveAllWarehouseConfigsToDB();
        if (typeof playSuccessSound === 'function') playSuccessSound();
    }
}

// 🎯 ฟังก์ชั่นสลับการแสดงผลตัวกรองหมวดหมู่ในตารางตั้งค่า
function setAisleSettingsCategoryFilter(filterType) {
    aisleTableZoneFilter = filterType;
    renderAisleSettingsTable();
}

function onAisleSettingsSearchInput(val) {
    aisleTableSearchQuery = val;
    renderAisleSettingsTable();
}

// 🟢 แสดงผลตารางตั้งค่าแถวจัดเก็บ ปรับแต่งคอลัมน์ประเภทโซนให้แสดงผลข้อความเต็มสวยงาม ไม่โดนตัดทอน
function renderAisleSettingsTable() {
    const tbody = document.getElementById('aisleSettingsTableBody');
    if (!tbody) return;

    // ตรวจสอบหรือสร้างแถบเครื่องมือกรองหมวดหมู่ด้านบนตาราง
    let filterContainer = document.getElementById('aisleSettingsTableFilterBar');
    if (!filterContainer && tbody.parentElement && tbody.parentElement.parentElement) {
        const tableResponsive = tbody.parentElement.parentElement;
        filterContainer = document.createElement('div');
        filterContainer.id = 'aisleSettingsTableFilterBar';
        filterContainer.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:0.8rem; background:var(--bg-subtle); padding:0.7rem 1rem; border-radius:var(--radius-md); border:1px solid var(--border-color);';
        tableResponsive.parentElement.insertBefore(filterContainer, tableResponsive);
    }

    if (filterContainer) {
        filterContainer.innerHTML = `
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <span style="font-size:0.84rem; font-weight:700; color:var(--text-sub); margin-right:4px;">
                    <i class="fa-solid fa-filter" style="color:var(--primary);"></i> คัดกรองหมวดหมู่:
                </span>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('ALL')" style="border-radius:8px; font-weight:700;">
                    🌐 แสดงทั้งหมด (${window.masterAisles.length})
                </button>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'MAIN' ? 'btn-primary' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('MAIN')" style="border-radius:8px; font-weight:700;">
                    🔵 โครงสร้างหลัก
                </button>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'AUXILIARY' ? 'btn-warning' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('AUXILIARY')" style="border-radius:8px; font-weight:700;">
                    🟡 โครงสร้างเพิ่มเติม
                </button>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'LOCKED' ? 'btn-danger' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('LOCKED')" style="border-radius:8px; font-weight:700;">
                    🔒 แถวที่ล็อกไว้
                </button>
            </div>
            <div style="position:relative; width:220px;">
                <input type="text" class="form-control" placeholder="🔍 ค้นหาชื่อแถว..." value="${escapeHTML(aisleTableSearchQuery)}" oninput="onAisleSettingsSearchInput(this.value)" style="padding:4px 10px; font-size:0.84rem; border-radius:8px;">
            </div>
        `;
    }

    tbody.innerHTML = '';

    const invData = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) ? globalInventoryData : [];

    // กรองแถวตามหมวดหมู่และคำค้นหา
    let filteredAisles = window.masterAisles.map((aisle, originalIdx) => ({ aisle, originalIdx }));

    if (aisleTableZoneFilter === 'MAIN') {
        filteredAisles = filteredAisles.filter(item => getAisleZoneTypeConfig(item.aisle) === 'main');
    } else if (aisleTableZoneFilter === 'AUXILIARY') {
        filteredAisles = filteredAisles.filter(item => getAisleZoneTypeConfig(item.aisle) === 'auxiliary');
    } else if (aisleTableZoneFilter === 'LOCKED') {
        filteredAisles = filteredAisles.filter(item => Boolean(window.aisleConfigs[item.aisle]?.is_locked));
    }

    if (aisleTableSearchQuery.trim() !== '') {
        const q = aisleTableSearchQuery.toLowerCase().trim();
        filteredAisles = filteredAisles.filter(item => item.aisle.toLowerCase().includes(q));
    }

    if (filteredAisles.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center; padding:24px; color:var(--text-muted);">
                    <i class="fa-solid fa-folder-open" style="font-size:1.5rem; margin-bottom:6px; display:block;"></i>
                    ไม่พบข้อมูลแถวจัดเก็บตรงกับหมวดหมู่หรือคำค้นหานี้
                </td>
            </tr>
        `;
        return;
    }

    filteredAisles.forEach(({ aisle, originalIdx }, displaySeq) => {
        const cfg = window.aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10, is_locked: false };
        const zoneType = getAisleZoneTypeConfig(aisle);
        const count = invData.filter(i => (i.location || '').toUpperCase().startsWith(`${aisle}-`) || (i.location || '').toUpperCase() === aisle).length;
        const isLocked = Boolean(cfg.is_locked);
        const safeAisle = escapeHTML(aisle);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center; font-weight:700;" class="mono">${displaySeq + 1}</td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong class="mono" style="font-size:1.05rem; color:var(--primary-text);">${safeAisle}</strong>
                    ${isLocked ? '<span class="badge-action inbound" style="font-size:0.72rem; padding:2px 8px;"><i class="fa-solid fa-lock"></i> ล็อก</span>' : ''}
                </div>
            </td>
            <!-- 🟢 เลือกประเภทโครงสร้าง (ความกว้าง min-width: 205px ป้องกันตัวอักษรตกขอบ/ตัดทอน 100%) -->
            <td style="text-align:center; min-width:205px;">
                <select class="form-select font-bold" style="width:100%; min-width:200px; font-size:0.83rem; padding:5px 8px; border-radius:8px; text-align:left;" onchange="updateAisleParam('${safeAisle}', 'zone_type', this.value)">
                    <option value="main" ${zoneType === 'main' ? 'selected' : ''}>🔵 โครงสร้างหลัก (Main)</option>
                    <option value="auxiliary" ${zoneType === 'auxiliary' ? 'selected' : ''}>🟡 โครงสร้างเพิ่มเติม (Auxiliary)</option>
                </select>
            </td>
            <td style="text-align:center;"><input type="number" class="form-control mono" style="width:65px; text-align:center; display:inline-block;" value="${cfg.bays}" onchange="updateAisleParam('${safeAisle}', 'bays', this.value)"></td>
            <td style="text-align:center;"><input type="number" class="form-control mono" style="width:65px; text-align:center; display:inline-block;" value="${cfg.shelves}" onchange="updateAisleParam('${safeAisle}', 'shelves', this.value)"></td>
            <td style="text-align:center;"><input type="number" class="form-control mono" style="width:65px; text-align:center; display:inline-block;" value="${cfg.slots}" onchange="updateAisleParam('${safeAisle}', 'slots', this.value)"></td>
            <td style="text-align:center;" class="mono font-bold">${count} เครื่อง</td>
            <td style="text-align:center;">
                <div style="display:flex; justify-content:center; gap:4px;">
                    <button class="btn btn-sm btn-secondary" onclick="moveAisleOrder(${originalIdx}, -1)" ${originalIdx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="เลื่อนตำแหน่งขึ้น">
                        <i class="fa-solid fa-arrow-up"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="moveAisleOrder(${originalIdx}, 1)" ${originalIdx === window.masterAisles.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="เลื่อนตำแหน่งลง">
                        <i class="fa-solid fa-arrow-down"></i>
                    </button>
                </div>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm ${isLocked ? 'btn-secondary' : 'btn-primary'}" onclick="toggleAisleLock('${safeAisle}')">
                    <i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i> ${isLocked ? 'ปลดล็อก' : 'ล็อก'}
                </button>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-danger" onclick="verifyAndDeleteAisle('${safeAisle}')" ${isLocked ? 'disabled style="opacity:0.4; cursor:not-allowed;" title="โครงสร้างถูกล็อกไว้"' : ''}>
                    <i class="fa-solid fa-trash"></i> ลบ
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderMenuDatabaseMappingTable() {
    const tbody = document.getElementById('menuDbMappingTableBody');
    if (!tbody) return;

    let html = '';
    menuDbMappingData.forEach((item, idx) => {
        const safeTitle = escapeHTML(item.menuTitle);
        const safeTable = escapeHTML(item.dbTable);
        const safeStatus = escapeHTML(item.status);
        const safeDesc = escapeHTML(item.desc);

        html += `
            <tr>
                <td style="text-align:center;" class="mono">${idx + 1}</td>
                <td><strong>${safeTitle}</strong></td>
                <td><code class="mono font-bold" style="color:var(--primary-text);">${safeTable}</code></td>
                <td><span class="badge-action inbound"><i class="fa-solid fa-circle-dot"></i> ${safeStatus}</span></td>
                <td style="font-size:0.84rem; color:var(--text-sub);">${safeDesc}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.saveAllWarehouseConfigsToDB = saveAllWarehouseConfigsToDB;
window.loadWarehouseConfigsFromDB = loadWarehouseConfigsFromDB;
window.moveAisleOrder = moveAisleOrder;
window.toggleAisleLock = toggleAisleLock;
window.addNewAisleConfig = addNewAisleConfig;
window.verifyAndDeleteAisle = verifyAndDeleteAisle;
window.updateAisleParam = updateAisleParam;
window.setAisleSettingsCategoryFilter = setAisleSettingsCategoryFilter;
window.onAisleSettingsSearchInput = onAisleSettingsSearchInput;

document.addEventListener('DOMContentLoaded', () => {
    loadWarehouseConfigsFromDB();
    initWarehouseSettingsRealtime();
});