// =========================================================================
// --- MODULE 8: WAREHOUSE SETTINGS & MENU DB MAPPING ENGINE (UPDATED v2026) ---
// --- HIGH-PERFORMANCE REALTIME STRUCTURE ZONE TYPE & CATEGORY FILTER ENGINE ---
// --- USER PERMISSIONS TABLE ALIGNMENT, DIRECT ACTIVITY LINK & BIOMETRICS ---
// --- ZERO-POPUP OVERLAP ACTIVITY FILTERING & CROSS-OS FAST RENDER ENGINE   ---
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
    scheduleUserTableRender();
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
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('ALL')" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                    🌐 แสดงทั้งหมด (${window.masterAisles.length})
                </button>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'MAIN' ? 'btn-primary' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('MAIN')" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                    🔵 โครงสร้างหลัก
                </button>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'AUXILIARY' ? 'btn-warning' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('AUXILIARY')" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                    🟡 โครงสร้างเพิ่มเติม
                </button>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'LOCKED' ? 'btn-danger' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('LOCKED')" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
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

// =========================================================================
// --- MODULE 8B: USER ACCOUNTS, PERMISSIONS ALIGNMENT, ACTIVITY LINK & ---
// --- HARDWARE FINGERPRINT / BIOMETRIC ENGINE (WEBAUTHN PLATFORM AUTH)  ---
// =========================================================================

const BIOMETRIC_STORAGE_KEY = 'WMS_USER_BIOMETRICS_V1';
let isDeviceBiometricSupported = null;
let userTableSearchFilter = '';
let userTableRoleFilter = 'ALL'; // 'ALL', 'admin', 'manager', 'user', 'viewer', 'BIOMETRIC'
let userTableDeptFilter = 'ALL';
let userTableRenderRafId = null;

// จัดตารางเวลาการวาดตารางผู้ใช้แบบ Debounced AnimationFrame เพื่อลดการโหลดซ้ำซ้อนและเปิดหน้าเว็บได้รวดเร็ว
function scheduleUserTableRender() {
    if (userTableRenderRafId) {
        cancelAnimationFrame(userTableRenderRafId);
    }
    userTableRenderRafId = requestAnimationFrame(() => {
        userTableRenderRafId = null;
        renderUserManagementTableEnhanced();
    });
}

// ตรวจสอบความพร้อมของตัวสแกนลายนิ้วมือบนอุปกรณ์ปัจจุบัน (Windows Hello / Touch ID / Android Biometric)
async function checkDeviceBiometricSupport() {
    try {
        if (!window.PublicKeyCredential || !navigator.credentials) {
            isDeviceBiometricSupported = false;
            return false;
        }
        if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            isDeviceBiometricSupported = Boolean(available);
            return isDeviceBiometricSupported;
        }
        isDeviceBiometricSupported = true;
        return true;
    } catch (e) {
        isDeviceBiometricSupported = false;
        return false;
    }
}

function getAllBiometricRecords() {
    try {
        const raw = localStorage.getItem(BIOMETRIC_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function saveAllBiometricRecords(records) {
    try {
        localStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(records || {}));
    } catch (e) {}
}

function getUserBiometricRecord(username) {
    const key = String(username || '').trim().toLowerCase();
    if (!key) return null;
    const all = getAllBiometricRecords();
    return all[key] || null;
}

function hasRegisteredFingerprint(username) {
    const rec = getUserBiometricRecord(username);
    return Boolean(rec && rec.credentialId);
}

function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(base64url) {
    const base64 = String(base64url).replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function detectDevicePlatformLabel() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Touch ID / Face ID';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS Touch ID';
    if (/Android/i.test(ua)) return 'Android Fingerprint';
    if (/Windows/i.test(ua)) return 'Windows Hello Fingerprint';
    return 'Platform Biometric Sensor';
}

// 🔐 ลงทะเบียนสแกนลายนิ้วมือสำหรับ User (WebAuthn Platform Authenticator)
async function enrollUserFingerprint(username) {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return false;

    const usersList = typeof systemUsers !== 'undefined' ? systemUsers : (window.systemUsers || []);
    const targetUser = usersList.find(u => String(u.username || '').trim().toLowerCase() === cleanUsername.toLowerCase());
    const displayName = targetUser ? (targetUser.name || targetUser.full_name || cleanUsername) : cleanUsername;

    const supported = await checkDeviceBiometricSupport();
    if (!supported) {
        alert(
            "⚠️ อุปกรณ์หรือการเชื่อมต่อปัจจุบันไม่รองรับตัวสแกนลายนิ้วมือโดยตรง\n\n" +
            "ข้อกำหนดของเบราว์เซอร์:\n" +
            "1. เครื่องต้องมีตัวสแกนลายนิ้วมือ (Windows Hello / Touch ID / Android)\n" +
            "2. ต้องเปิดเว็บไซต์ผ่าน HTTPS หรือ localhost เท่านั้น"
        );
        return false;
    }

    try {
        if (typeof showToast === 'function') {
            showToast(`👆 กรุณาวางนิ้วบนตัวสแกนลายนิ้วมือเพื่อลงทะเบียนให้ ${cleanUsername}...`);
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const userIdBytes = new TextEncoder().encode(`wms-user-${cleanUsername.toLowerCase()}`);

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: {
                    name: 'WMS Warehouse Security System'
                },
                user: {
                    id: userIdBytes,
                    name: cleanUsername,
                    displayName: displayName
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },   // ES256
                    { type: 'public-key', alg: -257 }  // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'preferred'
                },
                timeout: 60000,
                attestation: 'none'
            }
        });

        if (!credential || !credential.rawId) {
            throw new Error('ไม่ได้รับข้อมูลยืนยันจากตัวสแกนลายนิ้วมือ');
        }

        const credentialId = bufferToBase64Url(credential.rawId);
        const deviceLabel = detectDevicePlatformLabel();
        const enrolledAt = new Date().toISOString();

        const allRecords = getAllBiometricRecords();
        allRecords[cleanUsername.toLowerCase()] = {
            username: cleanUsername,
            credentialId: credentialId,
            device: deviceLabel,
            enrolledAt: enrolledAt
        };
        saveAllBiometricRecords(allRecords);

        // ซิงก์สถานะลายนิ้วมือไปยังฐานข้อมูล Supabase (ถ้ามีคอลัมน์รองรับ)
        try {
            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
            if (client && navigator.onLine) {
                await client
                    .from('profiles')
                    .update({ fingerprint_id: credentialId })
                    .ilike('username', cleanUsername);
            }
        } catch (dbErr) {
            // ข้ามอย่างปลอดภัยหากตาราง profiles ยังไม่ได้เพิ่มคอลัมน์ fingerprint_id
        }

        if (typeof logUserActivity === 'function') {
            await logUserActivity('AUTH_BIOMETRIC', `ลงทะเบียนสแกนลายนิ้วมือสำเร็จ (${deviceLabel}) ให้ผู้ใช้ ${cleanUsername}`, cleanUsername);
        }

        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') {
            showToast(`✅ ลงทะเบียนลายนิ้วมือสำหรับ "${cleanUsername}" สำเร็จ 100%`);
        }

        renderUserManagementTableEnhanced();
        return true;
    } catch (err) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (err && err.name === 'NotAllowedError') {
            alert("❌ ยกเลิกการสแกนลายนิ้วมือ หรือหมดเวลาเชื่อมต่อกับตัวสแกน");
        } else if (err && err.name === 'SecurityError') {
            alert("⚠️ เบราว์เซอร์บล็อกตัวสแกนลายนิ้วมือ เนื่องจากไม่ได้ใช้งานผ่าน HTTPS หรือ localhost");
        } else {
            alert(`❌ ไม่สามารถลงทะเบียนลายนิ้วมือได้: ${err && err.message ? err.message : 'เกิดข้อผิดพลาด'}`);
        }
        return false;
    }
}

// 🔍 ทดสอบ/ยืนยันตัวตนด้วยลายนิ้วมือสำหรับ User
async function verifyUserFingerprint(username) {
    const cleanUsername = String(username || '').trim();
    const record = getUserBiometricRecord(cleanUsername);

    if (!record || !record.credentialId) {
        alert(`⚠️ บัญชี "${cleanUsername}" ยังไม่ได้ลงทะเบียนลายนิ้วมือในเครื่องนี้`);
        return false;
    }

    const supported = await checkDeviceBiometricSupport();
    if (!supported) {
        alert("⚠️ อุปกรณ์นี้ไม่รองรับการสแกนลายนิ้วมือ");
        return false;
    }

    try {
        if (typeof showToast === 'function') {
            showToast(`👆 กรุณาสแกนลายนิ้วมือเพื่อยืนยันสิทธิ์ของ ${cleanUsername}...`);
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                allowCredentials: [
                    {
                        id: base64UrlToBuffer(record.credentialId),
                        type: 'public-key',
                        transports: ['internal']
                    }
                ],
                userVerification: 'required',
                timeout: 60000
            }
        });

        if (assertion && assertion.rawId) {
            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') {
                showToast(`✅ ยืนยันลายนิ้วมือของ "${cleanUsername}" ถูกต้อง 100%`);
            }
            if (typeof logUserActivity === 'function') {
                await logUserActivity('AUTH_BIOMETRIC', `ยืนยันตัวตนด้วยลายนิ้วมือสำเร็จ (${cleanUsername})`, cleanUsername);
            }
            return true;
        }
        return false;
    } catch (err) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (err && err.name === 'NotAllowedError') {
            alert("❌ ยกเลิกการสแกนลายนิ้วมือ หรือลายนิ้วมือไม่ตรงกัน");
        } else {
            alert(`❌ ยืนยันลายนิ้วมือไม่สำเร็จ: ${err && err.message ? err.message : 'เกิดข้อผิดพลาด'}`);
        }
        return false;
    }
}

// 🗑️ ลบข้อมูลการลงทะเบียนลายนิ้วมือของ User
async function removeUserFingerprint(username) {
    const cleanUsername = String(username || '').trim();
    if (!confirm(`คุณต้องการลบข้อมูลลายนิ้วมือที่ลงทะเบียนไว้ของ "${cleanUsername}" ใช่หรือไม่?`)) return;

    const allRecords = getAllBiometricRecords();
    delete allRecords[cleanUsername.toLowerCase()];
    saveAllBiometricRecords(allRecords);

    try {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (client && navigator.onLine) {
            await client
                .from('profiles')
                .update({ fingerprint_id: null })
                .ilike('username', cleanUsername);
        }
    } catch (e) {}

    if (typeof showToast === 'function') {
        showToast(`🗑️ ลบข้อมูลลายนิ้วมือของ "${cleanUsername}" เรียบร้อยแล้ว`);
    }
    renderUserManagementTableEnhanced();
}

// =========================================================================
// --- DIRECT NAVIGATION TO ACTIVITY HISTORY (ZERO POPUP OVERLAP 100%)    ---
// =========================================================================

let activeActivityHistoryFilterState = {
    username: '',
    fullName: '',
    onlyLoginLogs: false
};

// ปิดป๊อปอัป/โมดอลทั้งหมดที่อาจเปิดอยู่ เพื่อป้องกันการแสดงผลซ้อนทับกัน 100%
function dismissAllOverlappingPopups() {
    const knownPopupIds = [
        'rolePermissionMatrixModal',
        'userLogsModal',
        'inspectUserLogsModal',
        'editUserModal',
        'newTabSessionModal',
        'sessionWarningModal'
    ];
    knownPopupIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            if (id === 'rolePermissionMatrixModal') el.remove();
        }
    });

    document.querySelectorAll('.modal, .modal-backdrop, [role="dialog"]').forEach(el => {
        if (el.id !== 'loginOverlay') {
            el.classList.remove('show', 'active', 'open');
            el.style.display = 'none';
        }
    });
}

// คัดกรองแถวในหน้าดูประวัติการใช้งานด้วย Username หรือ ชื่อ-นามสกุล โดยตรง (ไม่เปิดป๊อปอัป)
function applyActivityHistoryUserFilter(username, fullName = '', onlyLoginLogs = false) {
    const cleanUsername = String(username || '').trim();
    const cleanFullName = String(fullName || '').trim();

    activeActivityHistoryFilterState = {
        username: cleanUsername,
        fullName: cleanFullName,
        onlyLoginLogs: Boolean(onlyLoginLogs)
    };

    const activitySection = document.getElementById('view-activities');
    if (!activitySection) return;

    // 1. ตั้งค่า Dropdown ผู้ใช้งาน (#logUserSelect) ให้ตรงกับ Username หรือ ชื่อ-นามสกุล
    const select = document.getElementById('logUserSelect') || activitySection.querySelector('select');
    if (select && cleanUsername) {
        let matchedOpt = Array.from(select.options).find(opt =>
            opt.value.trim().toLowerCase() === cleanUsername.toLowerCase() ||
            (cleanFullName && opt.textContent.toLowerCase().includes(cleanFullName.toLowerCase()))
        );

        if (!matchedOpt) {
            matchedOpt = document.createElement('option');
            matchedOpt.value = cleanUsername;
            matchedOpt.textContent = cleanFullName && cleanFullName !== '-'
                ? `${cleanFullName} (${cleanUsername})`
                : cleanUsername;
            select.appendChild(matchedOpt);
        }

        select.value = matchedOpt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 2. ตั้งค่าตัวกรองหมวดหมู่กิจกรรม (ถ้ามี) ให้รองรับการดูประวัติเข้าสู่ระบบ (Login) หรือทั้งหมด
    const actionSelect = document.getElementById('logActionSelect') || document.getElementById('logCategorySelect');
    if (actionSelect) {
        if (onlyLoginLogs) {
            const authOpt = Array.from(actionSelect.options).find(o => o.value.toUpperCase().includes('AUTH'));
            if (authOpt) {
                actionSelect.value = authOpt.value;
                actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else if (actionSelect.querySelector('option[value="ALL"]')) {
            actionSelect.value = 'ALL';
            actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // 3. เรียกฟังก์ชันกรองของหน้าประวัติการใช้งาน (เรียกเฉพาะฟังก์ชันที่แสดงในหน้าหลัก ห้ามเรียก inspectUserLogs ที่เปิดป๊อปอัป)
    if (typeof filterUserActivityLogs === 'function') {
        filterUserActivityLogs();
    } else if (typeof filterActivityLogs === 'function') {
        filterActivityLogs();
    } else if (typeof renderUserActivities === 'function') {
        renderUserActivities();
    } else if (typeof loadUserActivitiesFromDB === 'function') {
        loadUserActivitiesFromDB();
    }

    // 4. สร้างแถบควบคุมการคัดกรองแบบฝังในหน้า (Inline Banner) ด้านบนตารางประวัติ — ไม่เด้งป๊อปอัปทับซ้อน
    const tableWrapper = activitySection.querySelector('.table-responsive') || activitySection.querySelector('table')?.parentElement;
    if (tableWrapper && tableWrapper.parentElement) {
        let banner = document.getElementById('activityHistoryInlineFilterBanner');
        if (!cleanUsername && !cleanFullName) {
            if (banner) banner.remove();
        } else {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'activityHistoryInlineFilterBanner';
                banner.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:0.85rem; padding:0.75rem 1rem; border-radius:12px; background:var(--primary-light, #eff6ff); border:1px solid var(--primary-border, #bfdbfe);';
                tableWrapper.parentElement.insertBefore(banner, tableWrapper);
            }

            const displayLabel = cleanFullName && cleanFullName !== '-' && cleanFullName.toLowerCase() !== cleanUsername.toLowerCase()
                ? `${escapeHTML(cleanFullName)} (${escapeHTML(cleanUsername)})`
                : escapeHTML(cleanUsername || cleanFullName);

            banner.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="display:inline-flex; align-items:center; gap:6px; font-size:0.86rem; font-weight:700; color:var(--primary-text, #1d4ed8);">
                        <i class="fa-solid fa-user-check"></i> กำลังคัดกรองประวัติของ: <u>${displayLabel}</u>
                    </span>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm ${!onlyLoginLogs ? 'btn-primary' : 'btn-secondary'}" onclick="applyActivityHistoryUserFilter('${escapeHTML(cleanUsername)}', '${escapeHTML(cleanFullName)}', false)" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                        📋 กิจกรรมทั้งหมด
                    </button>
                    <button type="button" class="btn btn-sm ${onlyLoginLogs ? 'btn-primary' : 'btn-secondary'}" onclick="applyActivityHistoryUserFilter('${escapeHTML(cleanUsername)}', '${escapeHTML(cleanFullName)}', true)" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                        🔐 เฉพาะประวัติเข้า-ออกระบบ (Login)
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="clearActivityHistoryUserFilter()" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                        <i class="fa-solid fa-xmark"></i> ดูประวัติทุกคน
                    </button>
                </div>
            `;
        }
    }

    // 5. กรองแถวตารางในหน้า view-activities รองรับทั้ง Username และ ชื่อ-นามสกุล ทันที
    const applyRowFilterPass = () => {
        const tbody = document.getElementById('activityLogsTableBody')
            || document.getElementById('userActivitiesTableBody')
            || activitySection.querySelector('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length === 0) return;

        const uNeedle = cleanUsername.toLowerCase();
        const nNeedle = (cleanFullName && cleanFullName !== '-') ? cleanFullName.toLowerCase() : '';

        rows.forEach(tr => {
            if (tr.querySelector('td[colspan]')) return;
            const rowText = (tr.textContent || '').toLowerCase();

            const matchesUser = (!uNeedle && !nNeedle)
                || (uNeedle && rowText.includes(uNeedle))
                || (nNeedle && rowText.includes(nNeedle));

            const matchesLogin = !onlyLoginLogs
                || rowText.includes('auth')
                || rowText.includes('login')
                || rowText.includes('logout')
                || rowText.includes('เข้าสู่ระบบ')
                || rowText.includes('ออกจากระบบ')
                || rowText.includes('ลายนิ้วมือ')
                || rowText.includes('biometric');

            tr.style.display = (matchesUser && matchesLogin) ? '' : 'none';
        });
    };

    applyRowFilterPass();
    setTimeout(applyRowFilterPass, 180);
    setTimeout(applyRowFilterPass, 450);
}

function clearActivityHistoryUserFilter() {
    activeActivityHistoryFilterState = { username: '', fullName: '', onlyLoginLogs: false };

    const banner = document.getElementById('activityHistoryInlineFilterBanner');
    if (banner) banner.remove();

    const activitySection = document.getElementById('view-activities');
    const select = document.getElementById('logUserSelect') || (activitySection && activitySection.querySelector('select'));
    if (select && select.querySelector('option[value="ALL"]')) {
        select.value = 'ALL';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const actionSelect = document.getElementById('logActionSelect') || document.getElementById('logCategorySelect');
    if (actionSelect && actionSelect.querySelector('option[value="ALL"]')) {
        actionSelect.value = 'ALL';
        actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (typeof filterUserActivityLogs === 'function') {
        filterUserActivityLogs();
    } else if (typeof filterActivityLogs === 'function') {
        filterActivityLogs();
    } else if (typeof renderUserActivities === 'function') {
        renderUserActivities();
    } else if (typeof loadUserActivitiesFromDB === 'function') {
        loadUserActivitiesFromDB();
    }

    if (activitySection) {
        const tbody = document.getElementById('activityLogsTableBody')
            || document.getElementById('userActivitiesTableBody')
            || activitySection.querySelector('tbody');
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(tr => {
                tr.style.display = '';
            });
        }
    }
}

// 🔗 ลิงก์ไปยังหน้าเมนูประวัติการใช้งาน (view-activities) และคัดกรองชื่อผู้ใช้ / ชื่อ-นามสกุล ทันทีโดยไม่เด้งป๊อปอัป
function navigateToUserActivityHistory(username, fullName = '') {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return;

    const usersList = typeof systemUsers !== 'undefined' ? systemUsers : (window.systemUsers || []);
    const matchedUser = usersList.find(u => String(u.username || '').trim().toLowerCase() === cleanUsername.toLowerCase());
    const resolvedFullName = String(fullName || (matchedUser && (matchedUser.name || matchedUser.full_name)) || '').trim();

    // 1. ปิดป๊อปอัป/โมดอลทั้งหมดก่อนเปลี่ยนหน้า เพื่อป้องกันการทับซ้อน 100%
    dismissAllOverlappingPopups();

    // 2. สลับไปยังเมนู "ดูประวัติการใช้งาน" (view-activities)
    if (typeof executeSwitchView === 'function') {
        executeSwitchView('view-activities');
    } else if (typeof switchView === 'function') {
        switchView('view-activities');
    } else {
        document.querySelectorAll('.view-section, [id^="view-"]').forEach(sec => {
            if (sec.id && sec.id.startsWith('view-')) {
                sec.style.display = (sec.id === 'view-activities') ? 'block' : 'none';
            }
        });
        if (typeof syncRouteToBrowserAndHeader === 'function') {
            syncRouteToBrowserAndHeader('view-activities');
        } else {
            window.location.hash = '#activities';
        }
    }

    // 3. คัดกรองข้อมูลของ User / ชื่อ-นามสกุล ในหน้าดูประวัติการใช้งานทันทีโดยไม่เด้งป๊อปอัป
    requestAnimationFrame(() => {
        dismissAllOverlappingPopups();
        applyActivityHistoryUserFilter(cleanUsername, resolvedFullName, false);

        try {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            window.scrollTo(0, 0);
        }

        if (typeof showToast === 'function') {
            const label = resolvedFullName && resolvedFullName !== '-'
                ? `${resolvedFullName} (${cleanUsername})`
                : cleanUsername;
            showToast(`📜 คัดกรองประวัติการใช้งานของ: ${label}`);
        }
    });
}

// 🗂️ แสดงรายชื่อไฟล์โมดูลที่แต่ละระดับสิทธิ์เข้าถึงได้ (สำหรับคอลัมน์ "ไฟล์")
function getRoleAccessibleFilesSummary(role) {
    const r = String(role || 'user').trim().toLowerCase();
    if (r === 'admin') {
        return {
            badge: 'ทุกไฟล์ (9 โมดูล)',
            filesList: 'dashboard-db.js, inv-db.js, inbound-db.js, outbound-db.js, locations-db.js, approvals-db.js, activities-db.js, settings-db.js, barcode-print.js',
            color: '#1d4ed8',
            bg: '#dbeafe',
            border: '#93c5fd'
        };
    }
    if (r === 'manager') {
        return {
            badge: '6 ไฟล์หลัก',
            filesList: 'inv-db.js, inbound-db.js, outbound-db.js, locations-db.js, approvals-db.js, activities-db.js',
            color: '#0f766e',
            bg: '#ccfbf1',
            border: '#5eead4'
        };
    }
    if (r === 'viewer') {
        return {
            badge: '2 ไฟล์ดูข้อมูล',
            filesList: 'inv-db.js, locations-db.js',
            color: '#475569',
            bg: '#f1f5f9',
            border: '#cbd5e1'
        };
    }
    return {
        badge: '4 ไฟล์ปฏิบัติการ',
        filesList: 'inv-db.js, inbound-db.js, outbound-db.js, locations-db.js',
        color: '#0369a1',
        bg: '#e0f2fe',
        border: '#7dd3fc'
    };
}

function getRoleStyleBadgeMeta(role) {
    const r = String(role || 'user').trim().toLowerCase();
    if (r === 'admin') {
        return { label: 'admin', icon: '👑', bg: '#fef3c7', color: '#92400e', border: '#f59e0b' };
    }
    if (r === 'manager') {
        return { label: 'manager', icon: '🛡️', bg: '#ccfbf1', color: '#115e59', border: '#2dd4bf' };
    }
    if (r === 'viewer') {
        return { label: 'viewer', icon: '👁️', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
    }
    return { label: 'user', icon: '👤', bg: '#e0f2fe', color: '#075985', border: '#38bdf8' };
}

// 📋 แสดงหน้าต่างสรุปตารางสิทธิ์การเข้าถึงเมนูและไฟล์ของแต่ละระดับสิทธิ์
function showRolePermissionMatrixModal() {
    let modal = document.getElementById('rolePermissionMatrixModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'rolePermissionMatrixModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.72); display: flex; align-items: center;
        justify-content: center; z-index: 99995; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); padding: 16px;
    `;

    modal.innerHTML = `
        <div style="background: var(--card-bg, #ffffff); border-radius: 16px; padding: 22px; max-width: 720px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4); border: 1px solid var(--border-color, #e2e8f0);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color, #e2e8f0);">
                <h3 style="margin: 0; font-size: 1.08rem; font-weight: 700; color: var(--text-color, #0f172a);">
                    🛡️ ตารางสรุประดับสิทธิ์การเข้าถึงเมนูและไฟล์โมดูล
                </h3>
                <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('rolePermissionMatrixModal')?.remove()" style="touch-action:manipulation;">
                    <i class="fa-solid fa-xmark"></i> ปิด
                </button>
            </div>
            <div class="table-responsive" style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="background: var(--bg-subtle, #f8fafc);">
                            <th style="text-align: center; padding: 10px; border-bottom: 1px solid #e2e8f0;">ระดับสิทธิ์</th>
                            <th style="text-align: left; padding: 10px; border-bottom: 1px solid #e2e8f0;">เมนูที่เข้าถึงได้</th>
                            <th style="text-align: left; padding: 10px; border-bottom: 1px solid #e2e8f0;">ไฟล์ระบบที่รับรอง</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="text-align: center; padding: 10px; border-bottom: 1px solid #f1f5f9;"><strong>👑 admin</strong></td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">เข้าถึงได้ทุกเมนูในระบบ 100% รวมถึงตั้งค่าคลังและจัดการผู้ใช้</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.78rem; color: #1d4ed8;">ทุกไฟล์ (9 โมดูลหลัก)</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; padding: 10px; border-bottom: 1px solid #f1f5f9;"><strong>🛡️ manager</strong></td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">เช็คสต็อก, รับเข้า, จ่ายออก, ผังคลัง, ศูนย์อนุมัติ, ดูประวัติ</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.78rem; color: #0f766e;">inv-db, inbound-db, outbound-db, locations-db, approvals-db, activities-db</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; padding: 10px; border-bottom: 1px solid #f1f5f9;"><strong>👤 user</strong></td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">เช็คสต็อก, รับสินค้าเข้า, จ่ายสินค้าออก, ผังตำแหน่งคลัง</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.78rem; color: #0369a1;">inv-db, inbound-db, outbound-db, locations-db</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; padding: 10px;"><strong>👁️ viewer</strong></td>
                            <td style="padding: 10px;">เช็คสต็อกสินค้า และดูผังตำแหน่งคลังสินค้าเท่านั้น</td>
                            <td style="padding: 10px; font-size: 0.78rem; color: #475569;">inv-db, locations-db</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
}

// 📐 ซิงก์หัวตาราง (<thead>) ให้ตรงกับคอลัมน์ข้อมูลทั้ง 9 คอลัมน์ 100%
function syncUserManagementTableHeader(tbody) {
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table) return;

    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    const wrapper = table.closest('.table-responsive') || table.parentElement;
    if (wrapper) {
        wrapper.style.overflowX = 'auto';
        wrapper.style.webkitOverflowScrolling = 'touch';
    }

    let thead = table.querySelector('thead');
    if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, tbody);
    }

    thead.innerHTML = `
        <tr>
            <th style="text-align:center; width:52px; min-width:52px; white-space:nowrap;">#</th>
            <th style="text-align:center; width:136px; min-width:136px; white-space:nowrap;">Username</th>
            <th style="text-align:left; min-width:185px; white-space:nowrap;">ชื่อ-นามสกุล</th>
            <th style="text-align:center; width:145px; min-width:145px; white-space:nowrap;">แผนก</th>
            <th style="text-align:center; width:150px; min-width:150px; white-space:nowrap;">ไฟล์</th>
            <th style="text-align:center; width:115px; min-width:115px; white-space:nowrap;">ระดับสิทธิ์</th>
            <th style="text-align:center; width:175px; min-width:175px; white-space:nowrap;">ลายนิ้วมือ</th>
            <th style="text-align:center; width:125px; min-width:125px; white-space:nowrap;">ดูประวัติ</th>
            <th style="text-align:center; width:240px; min-width:240px; white-space:nowrap;">จัดการ</th>
        </tr>
    `;
}

function setUserManagementRoleFilter(roleFilter) {
    userTableRoleFilter = roleFilter;
    renderUserManagementTableEnhanced();
}

function setUserManagementDeptFilter(deptFilter) {
    userTableDeptFilter = deptFilter;
    renderUserManagementTableEnhanced();
}

function onUserManagementSearchFilter(val) {
    userTableSearchFilter = val;
    renderUserManagementTableEnhanced();
}

function resetUserManagementFilters() {
    userTableSearchFilter = '';
    userTableRoleFilter = 'ALL';
    userTableDeptFilter = 'ALL';
    renderUserManagementTableEnhanced();
}

async function refreshUserManagementFromDB() {
    if (typeof loadUsersFromDB === 'function') {
        await loadUsersFromDB();
    }
    await renderUserManagementTableEnhanced();
    if (typeof showToast === 'function') {
        showToast('🔄 อัปเดตรายชื่อผู้ใช้และสิทธิ์ล่าสุดเรียบร้อยแล้ว');
    }
}

// 🎨 แสดงผลตารางบัญชีผู้ใช้และกำหนดสิทธิ์ จัดคอลัมน์ตรงหัวตาราง 100% + ลายนิ้วมือ + ลิงก์ดูประวัติ (ไม่เด้งป๊อปอัปทับซ้อน)
async function renderUserManagementTableEnhanced() {
    const tbody = document.getElementById('userManagementTableBody');
    if (!tbody) return;

    syncUserManagementTableHeader(tbody);

    if (isDeviceBiometricSupported === null) {
        await checkDeviceBiometricSupport();
    }

    const usersList = typeof systemUsers !== 'undefined' ? systemUsers : (window.systemUsers || []);
    const activeUser = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (window.currentUser || null);

    // คำนวณสถิติสำหรับปุ่มคัดกรองระดับสิทธิ์
    const roleCounts = {
        ALL: usersList.length,
        admin: 0,
        manager: 0,
        user: 0,
        viewer: 0,
        BIOMETRIC: 0
    };
    const deptSet = new Set();

    usersList.forEach(u => {
        const r = typeof normalizeUserRole === 'function'
            ? normalizeUserRole(u.role, u.username)
            : String(u.role || 'user').trim().toLowerCase();
        if (roleCounts[r] !== undefined) roleCounts[r]++;
        if (hasRegisteredFingerprint(u.username)) roleCounts.BIOMETRIC++;
        const dept = String(u.department || '').trim();
        if (dept) deptSet.add(dept);
    });

    // แสดงแถบสถานะตัวสแกนลายนิ้วมือและแถบคัดกรองหมวดหมู่ด้านบนตาราง
    const tableWrapper = tbody.closest('.table-responsive') || tbody.closest('table')?.parentElement;
    if (tableWrapper && tableWrapper.parentElement) {
        let bioBar = document.getElementById('userBiometricStatusBanner');
        if (!bioBar) {
            bioBar = document.createElement('div');
            bioBar.id = 'userBiometricStatusBanner';
            bioBar.style.cssText = 'display:flex; flex-direction:column; gap:10px; margin-bottom:0.85rem; padding:0.75rem 1rem; border-radius:12px; background:var(--bg-subtle, #f8fafc); border:1px solid var(--border-color, #e2e8f0);';
            tableWrapper.parentElement.insertBefore(bioBar, tableWrapper);
        }

        const deviceLabel = detectDevicePlatformLabel();
        const bioStatusHtml = isDeviceBiometricSupported
            ? `<span style="display:inline-flex; align-items:center; gap:6px; font-size:0.82rem; font-weight:700; color:#15803d; background:#dcfce7; border:1px solid #86efac; padding:4px 11px; border-radius:999px;">
                   <i class="fa-solid fa-fingerprint"></i> เครื่องนี้รองรับการสแกนลายนิ้วมือ (${escapeHTML(deviceLabel)})
               </span>`
            : `<span style="display:inline-flex; align-items:center; gap:6px; font-size:0.82rem; font-weight:600; color:#b45309; background:#fef3c7; border:1px solid #fcd34d; padding:4px 11px; border-radius:999px;">
                   <i class="fa-solid fa-circle-info"></i> เครื่อง/เบราว์เซอร์นี้ยังไม่เปิดใช้ตัวสแกนลายนิ้วมือ (ต้องใช้ผ่าน HTTPS/localhost บนเครื่องที่มีเซนเซอร์)
               </span>`;

        const deptOptionsHtml = Array.from(deptSet).map(d =>
            `<option value="${escapeHTML(d)}" ${userTableDeptFilter === d ? 'selected' : ''}>🏢 ${escapeHTML(d)}</option>`
        ).join('');

        bioBar.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    ${bioStatusHtml}
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="showRolePermissionMatrixModal()" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                        <i class="fa-solid fa-shield-halved" style="color:var(--primary);"></i> ตารางสิทธิ์แต่ละระดับ
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="refreshUserManagementFromDB()" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                        <i class="fa-solid fa-rotate"></i> ซิงก์ล่าสุด
                    </button>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding-top:8px; border-top:1px dashed var(--border-color, #cbd5e1);">
                <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
                    <span style="font-size:0.81rem; font-weight:700; color:var(--text-sub); margin-right:2px;">
                        <i class="fa-solid fa-filter" style="color:var(--primary);"></i> คัดกรองสิทธิ์:
                    </span>
                    <button type="button" class="btn btn-sm ${userTableRoleFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}" onclick="setUserManagementRoleFilter('ALL')" style="border-radius:8px; font-weight:700; padding:3px 9px; touch-action:manipulation;">
                        🌐 ทั้งหมด (${roleCounts.ALL})
                    </button>
                    <button type="button" class="btn btn-sm ${userTableRoleFilter === 'admin' ? 'btn-warning' : 'btn-secondary'}" onclick="setUserManagementRoleFilter('admin')" style="border-radius:8px; font-weight:700; padding:3px 9px; touch-action:manipulation;">
                        👑 Admin (${roleCounts.admin})
                    </button>
                    <button type="button" class="btn btn-sm ${userTableRoleFilter === 'manager' ? 'btn-primary' : 'btn-secondary'}" onclick="setUserManagementRoleFilter('manager')" style="border-radius:8px; font-weight:700; padding:3px 9px; touch-action:manipulation;">
                        🛡️ Manager (${roleCounts.manager})
                    </button>
                    <button type="button" class="btn btn-sm ${userTableRoleFilter === 'user' ? 'btn-primary' : 'btn-secondary'}" onclick="setUserManagementRoleFilter('user')" style="border-radius:8px; font-weight:700; padding:3px 9px; touch-action:manipulation;">
                        👤 User (${roleCounts.user})
                    </button>
                    <button type="button" class="btn btn-sm ${userTableRoleFilter === 'viewer' ? 'btn-primary' : 'btn-secondary'}" onclick="setUserManagementRoleFilter('viewer')" style="border-radius:8px; font-weight:700; padding:3px 9px; touch-action:manipulation;">
                        👁️ Viewer (${roleCounts.viewer})
                    </button>
                    <button type="button" class="btn btn-sm ${userTableRoleFilter === 'BIOMETRIC' ? 'btn-primary' : 'btn-secondary'}" onclick="setUserManagementRoleFilter('BIOMETRIC')" style="border-radius:8px; font-weight:700; padding:3px 9px; touch-action:manipulation;">
                        👆 มีลายนิ้วมือ (${roleCounts.BIOMETRIC})
                    </button>
                </div>

                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <select class="form-select" onchange="setUserManagementDeptFilter(this.value)" style="padding:4px 10px; font-size:0.82rem; border-radius:8px; min-width:155px;">
                        <option value="ALL" ${userTableDeptFilter === 'ALL' ? 'selected' : ''}>🏢 ทุกแผนก (${deptSet.size})</option>
                        ${deptOptionsHtml}
                    </select>
                    <input type="text" class="form-control" placeholder="🔍 ค้นหา Username / ชื่อ / ไฟล์..." value="${escapeHTML(userTableSearchFilter)}" oninput="onUserManagementSearchFilter(this.value)" style="padding:4px 10px; font-size:0.82rem; border-radius:8px; width:215px;">
                </div>
            </div>
        `;
    }

    let filteredUsers = [...usersList];

    if (userTableRoleFilter !== 'ALL') {
        if (userTableRoleFilter === 'BIOMETRIC') {
            filteredUsers = filteredUsers.filter(u => hasRegisteredFingerprint(u.username));
        } else {
            filteredUsers = filteredUsers.filter(u => {
                const r = typeof normalizeUserRole === 'function'
                    ? normalizeUserRole(u.role, u.username)
                    : String(u.role || 'user').trim().toLowerCase();
                return r === userTableRoleFilter;
            });
        }
    }

    if (userTableDeptFilter !== 'ALL') {
        filteredUsers = filteredUsers.filter(u => String(u.department || '').trim() === userTableDeptFilter);
    }

    if (userTableSearchFilter.trim() !== '') {
        const q = userTableSearchFilter.toLowerCase().trim();
        filteredUsers = filteredUsers.filter(u => {
            const r = typeof normalizeUserRole === 'function'
                ? normalizeUserRole(u.role, u.username)
                : String(u.role || 'user').trim().toLowerCase();
            const fInfo = getRoleAccessibleFilesSummary(r);
            return (
                String(u.username || '').toLowerCase().includes(q) ||
                String(u.name || u.full_name || '').toLowerCase().includes(q) ||
                String(u.department || '').toLowerCase().includes(q) ||
                r.includes(q) ||
                fInfo.filesList.toLowerCase().includes(q)
            );
        });
    }

    const fragment = document.createDocumentFragment();

    if (filteredUsers.length === 0) {
        const emptyTr = document.createElement('tr');
        emptyTr.innerHTML = `
            <td colspan="9" style="text-align:center; padding:26px; color:var(--text-muted);">
                <div style="margin-bottom:8px;">ไม่พบข้อมูลบัญชีผู้ใช้ที่ตรงกับเงื่อนไขการคัดกรอง</div>
                <button type="button" class="btn btn-sm btn-secondary" onclick="resetUserManagementFilters()" style="border-radius:8px; touch-action:manipulation;">
                    🔄 ล้างตัวกรองทั้งหมด
                </button>
            </td>
        `;
        tbody.innerHTML = '';
        tbody.appendChild(emptyTr);
        return;
    }

    filteredUsers.forEach((u, idx) => {
        const rawUsername = String(u.username || '').trim();
        const lowerUsername = rawUsername.toLowerCase();
        const isSelf = activeUser && String(activeUser.username || '').trim().toLowerCase() === lowerUsername;
        const isAdminMain = lowerUsername === 'admin';
        const roleNormalized = typeof normalizeUserRole === 'function'
            ? normalizeUserRole(u.role, rawUsername)
            : String(u.role || 'user').trim().toLowerCase();

        const fileInfo = getRoleAccessibleFilesSummary(roleNormalized);
        const roleBadge = getRoleStyleBadgeMeta(roleNormalized);
        const bioRecord = getUserBiometricRecord(rawUsername);
        const hasBio = Boolean(bioRecord && bioRecord.credentialId);

        const rawFullName = String(u.name || u.full_name || '-').trim();
        const safeId = escapeHTML(u.id);
        const safeUsername = escapeHTML(rawUsername);
        const safeFullName = escapeHTML(rawFullName);
        const safeDept = escapeHTML(u.department || '-');

        // คอลัมน์ลายนิ้วมือ (จัดขนาดปุ่มเท่ากันทุกแถว)
        const fingerprintCellHtml = hasBio
            ? `
                <div style="display:inline-grid; grid-template-columns: 112px 30px; gap:4px; align-items:center; justify-content:center;">
                    <button type="button" class="btn btn-sm" onclick="verifyUserFingerprint('${safeUsername}')" title="ลงทะเบียนแล้ว (${escapeHTML(bioRecord.device || 'Biometric')}) - คลิกเพื่อสแกนทดสอบ" style="width:100%; background:#dcfce7; color:#15803d; border:1px solid #86efac; font-weight:700; padding:4px 8px; border-radius:7px; white-space:nowrap; justify-content:center; touch-action:manipulation;">
                        <i class="fa-solid fa-fingerprint"></i> สแกนทดสอบ
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="removeUserFingerprint('${safeUsername}')" title="ลบลายนิ้วมือที่ลงทะเบียนไว้" style="width:100%; padding:4px 0; border-radius:7px; justify-content:center; touch-action:manipulation;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `
            : `
                <div style="display:inline-grid; grid-template-columns: 146px; align-items:center; justify-content:center;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="enrollUserFingerprint('${safeUsername}')" title="คลิกเพื่อสแกนลงทะเบียนลายนิ้วมือสำหรับบัญชีนี้" style="width:100%; font-weight:600; padding:4px 10px; border-radius:7px; white-space:nowrap; justify-content:center; touch-action:manipulation;">
                        <i class="fa-solid fa-fingerprint" style="color:var(--primary);"></i> ลงทะเบียน
                    </button>
                </div>
            `;

        // คอลัมน์จัดการ (ใช้ CSS Grid 2 ช่องคงที่: ช่องซ้าย 76px สำหรับปุ่ม "แก้ไข" ตรงกันทุกแถว | ช่องขวา 148px สำหรับ "เตะออก + ลบ" หรือป้าย "แอดมินหลัก / ใช้งานอยู่")
        let rightActionSlotHtml = '';
        if (!isAdminMain && !isSelf) {
            rightActionSlotHtml = `
                <div style="display:grid; grid-template-columns: 84px 60px; gap:4px; align-items:center;">
                    <button type="button" class="btn btn-sm btn-warning" onclick="kickUserSession('${safeUsername}')" title="เตะผู้ใช้คนนี้ออกจากระบบทันที" style="width:100%; background:#f59e0b; color:#fff; border:none; padding:4px 6px; border-radius:7px; white-space:nowrap; justify-content:center; touch-action:manipulation;">
                        <i class="fa-solid fa-right-from-bracket"></i> เตะออก
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="deleteUserAccount('${safeId}')" title="ลบบัญชี" style="width:100%; padding:4px 6px; border-radius:7px; white-space:nowrap; justify-content:center; touch-action:manipulation;">
                        <i class="fa-solid fa-trash"></i> ลบ
                    </button>
                </div>
            `;
        } else if (isAdminMain && isSelf) {
            rightActionSlotHtml = `
                <span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; width:100%; font-size:0.74rem; font-weight:700; color:#92400e; background:#fef3c7; border:1px solid #fcd34d; padding:4px 6px; border-radius:7px; white-space:nowrap;">
                    👑 แอดมินหลัก • ใช้งานอยู่
                </span>
            `;
        } else if (isAdminMain) {
            rightActionSlotHtml = `
                <span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; width:100%; font-size:0.75rem; font-weight:700; color:#92400e; background:#fef3c7; border:1px solid #fcd34d; padding:4px 8px; border-radius:7px; white-space:nowrap;">
                    👑 แอดมินหลัก
                </span>
            `;
        } else {
            rightActionSlotHtml = `
                <span style="display:inline-flex; align-items:center; justify-content:center; gap:5px; width:100%; font-size:0.75rem; font-weight:700; color:#15803d; background:#dcfce7; border:1px solid #86efac; padding:4px 8px; border-radius:7px; white-space:nowrap;">
                    🟢 ใช้งานอยู่
                </span>
            `;
        }

        const tr = document.createElement('tr');
        if (isSelf) {
            tr.style.background = 'rgba(37, 99, 235, 0.04)';
        }

        tr.innerHTML = `
            <td style="text-align:center; vertical-align:middle;" class="mono">${idx + 1}</td>
            <td style="text-align:center; vertical-align:middle;">
                <code class="mono font-bold" style="color:var(--primary-text); background:var(--primary-light, #eff6ff); border:1px solid var(--primary-border, #bfdbfe); padding:3px 10px; border-radius:7px; display:inline-block; min-width:96px; text-align:center;">${safeUsername}</code>
            </td>
            <td style="text-align:left; vertical-align:middle; font-weight:600;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span>${safeFullName}</span>
                </div>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <span style="display:inline-block; font-size:0.82rem; color:var(--text-sub); background:var(--bg-subtle, #f8fafc); border:1px solid var(--border-color, #e2e8f0); padding:3px 10px; border-radius:7px; white-space:nowrap;">
                    ${safeDept}
                </span>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <span title="${escapeHTML(fileInfo.filesList)}" style="display:inline-flex; align-items:center; justify-content:center; gap:5px; min-width:128px; font-size:0.76rem; font-weight:700; padding:4px 10px; border-radius:999px; color:${fileInfo.color}; background:${fileInfo.bg}; border:1px solid ${fileInfo.border}; cursor:help; white-space:nowrap;">
                    <i class="fa-solid fa-file-code"></i> ${escapeHTML(fileInfo.badge)}
                </span>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; min-width:86px; font-size:0.78rem; font-weight:700; padding:3px 10px; border-radius:999px; background:${roleBadge.bg}; color:${roleBadge.color}; border:1px solid ${roleBadge.border}; white-space:nowrap;">
                    ${roleBadge.icon} ${escapeHTML(roleBadge.label)}
                </span>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                ${fingerprintCellHtml}
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <button type="button" class="btn btn-sm btn-primary" onclick="navigateToUserActivityHistory('${safeUsername}', '${safeFullName}')" title="เปิดหน้าเมนูประวัติการใช้งานและคัดกรองของ ${safeFullName} (${safeUsername})" style="min-width:98px; justify-content:center; padding:4px 10px; border-radius:7px; white-space:nowrap; touch-action:manipulation;">
                    <i class="fa-solid fa-clock-rotate-left"></i> ดูประวัติ
                </button>
            </td>
            <td style="text-align:center; vertical-align:middle;">
                <div style="display:inline-grid; grid-template-columns: 76px 148px; gap:6px; align-items:center; justify-content:center;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="openEditUserModal('${safeId}')" title="แก้ไขข้อมูลบัญชี" style="width:100%; justify-content:center; padding:4px 8px; border-radius:7px; font-weight:600; white-space:nowrap; touch-action:manipulation;">
                        <i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> แก้ไข
                    </button>
                    ${rightActionSlotHtml}
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

// เชื่อมฟังก์ชัน renderUserManagementTable ให้ชี้มายังเวอร์ชันที่จัดคอลัมน์ตรง 100% เสมอ
window.renderUserManagementTable = scheduleUserTableRender;
window.renderUserManagementTableEnhanced = renderUserManagementTableEnhanced;
window.scheduleUserTableRender = scheduleUserTableRender;
window.navigateToUserActivityHistory = navigateToUserActivityHistory;
window.applyActivityHistoryUserFilter = applyActivityHistoryUserFilter;
window.clearActivityHistoryUserFilter = clearActivityHistoryUserFilter;
window.dismissAllOverlappingPopups = dismissAllOverlappingPopups;
window.enrollUserFingerprint = enrollUserFingerprint;
window.verifyUserFingerprint = verifyUserFingerprint;
window.removeUserFingerprint = removeUserFingerprint;
window.hasRegisteredFingerprint = hasRegisteredFingerprint;
window.checkDeviceBiometricSupport = checkDeviceBiometricSupport;
window.setUserManagementRoleFilter = setUserManagementRoleFilter;
window.setUserManagementDeptFilter = setUserManagementDeptFilter;
window.onUserManagementSearchFilter = onUserManagementSearchFilter;
window.resetUserManagementFilters = resetUserManagementFilters;
window.refreshUserManagementFromDB = refreshUserManagementFromDB;
window.showRolePermissionMatrixModal = showRolePermissionMatrixModal;

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
    window.renderUserManagementTable = scheduleUserTableRender;
    loadWarehouseConfigsFromDB();
    initWarehouseSettingsRealtime();
    scheduleUserTableRender();
});