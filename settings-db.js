// =========================================================================
// --- MODULE 8: WAREHOUSE SETTINGS & MENU DB MAPPING ENGINE (UPDATED v2026) ---
// --- SELF-HEALING VIEW BOOTSTRAPPER (PREVENTS BLANK PAGE 100%)          ---
// --- INITIAL LOAD & #SETTINGS-DB HASH ROUTE AUTO-ACTIVATION GUARD      ---
// --- MODERN SEGMENTED UX/UI, LIVE KPI CAPACITY, BACKUP/RESTORE & SYNC   ---
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
let activeSettingsSectionTab = 'ALL'; // 'ALL', 'AISLES', 'USERS', 'DB_MAPPING'
let lastWarehouseConfigSyncTime = null;
let isWarehouseSettingsModuleInitialized = false;
let isWarehouseSettingsRealtimeSubscribed = false;

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

// ฝัง CSS เฉพาะส่วนของหน้าตั้งค่าพิกัดคลังสินค้า เพื่อให้แสดงผลสวยงามครบถ้วนทุกเบราว์เซอร์และธีม
function injectWarehouseSettingsStyles() {
    if (document.getElementById('wmsSettingsEmbeddedStyles')) return;
    const style = document.createElement('style');
    style.id = 'wmsSettingsEmbeddedStyles';
    style.textContent = `
        #view-settings.active {
            display: flex !important;
            flex-direction: column;
            gap: 1.25rem;
            width: 100%;
        }
        .wms-set-top-shell {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            width: 100%;
        }
        .wms-set-hero {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
            flex-wrap: wrap;
            padding: 1.25rem 1.4rem;
            border-radius: 16px;
            background: linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(124, 58, 237, 0.06) 100%);
            border: 1px solid var(--border-color, #e2e8f0);
        }
        .wms-set-hero-left {
            flex: 1 1 420px;
            min-width: 260px;
        }
        .wms-set-hero-badge-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 0.55rem;
        }
        .wms-set-pill-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.74rem;
            font-weight: 800;
            letter-spacing: 0.03em;
            color: var(--primary-text, #1d4ed8);
            background: var(--primary-light, #dbeafe);
            border: 1px solid var(--primary-border, #93c5fd);
            padding: 3px 10px;
            border-radius: 999px;
        }
        .wms-set-conn-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 3px 10px;
            border-radius: 999px;
        }
        .wms-set-conn-pill.is-online {
            color: #15803d;
            background: #dcfce7;
            border: 1px solid #86efac;
        }
        .wms-set-conn-pill.is-offline {
            color: #b45309;
            background: #fef3c7;
            border: 1px solid #fcd34d;
        }
        .wms-set-conn-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
        }
        .wms-set-hero-title {
            margin: 0 0 0.35rem 0;
            font-size: 1.18rem;
            font-weight: 800;
            color: var(--text-main, #0f172a);
        }
        .wms-set-hero-desc {
            margin: 0;
            font-size: 0.86rem;
            color: var(--text-sub, #475569);
            line-height: 1.5;
        }
        .wms-set-hero-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .wms-set-hero-btn {
            border-radius: 9px;
            font-weight: 700;
            white-space: nowrap;
        }
        .wms-set-kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 0.9rem;
            width: 100%;
        }
        .wms-set-kpi-card {
            display: flex;
            align-items: center;
            gap: 0.9rem;
            padding: 1rem 1.1rem;
            border-radius: 14px;
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
        }
        .wms-set-kpi-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.15rem;
            flex-shrink: 0;
        }
        .wms-set-kpi-card.is-primary .wms-set-kpi-icon { background: #dbeafe; color: #1d4ed8; }
        .wms-set-kpi-card.is-success .wms-set-kpi-icon { background: #dcfce7; color: #15803d; }
        .wms-set-kpi-card.is-purple .wms-set-kpi-icon { background: #f3e8ff; color: #7e22ce; }
        .wms-set-kpi-card.is-amber .wms-set-kpi-icon { background: #fef3c7; color: #b45309; }
        .wms-set-kpi-label {
            font-size: 0.78rem;
            font-weight: 700;
            color: var(--text-sub, #64748b);
        }
        .wms-set-kpi-value {
            font-size: 1.18rem;
            font-weight: 800;
            color: var(--text-main, #0f172a);
            margin: 2px 0;
        }
        .wms-set-kpi-sub {
            font-size: 0.76rem;
            color: var(--text-muted, #64748b);
        }
        .wms-set-tabs-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            padding: 0.55rem;
            border-radius: 12px;
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
        }
        .wms-set-tab-btn {
            border: 1px solid transparent;
            background: transparent;
            color: var(--text-sub, #475569);
            font-size: 0.85rem;
            font-weight: 700;
            padding: 7px 14px;
            border-radius: 9px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
        }
        .wms-set-tab-btn:hover {
            background: var(--bg-subtle, #f1f5f9);
            color: var(--text-main, #0f172a);
        }
        .wms-set-tab-btn.active {
            background: var(--primary, #2563eb);
            color: #ffffff;
            box-shadow: 0 2px 6px rgba(37, 99, 235, 0.28);
        }
        .wms-set-card {
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 16px;
            padding: 1.25rem;
            box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
        }
        .wms-set-step-badge {
            display: inline-block;
            font-size: 0.72rem;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 6px;
            background: var(--primary-light, #dbeafe);
            color: var(--primary-text, #1d4ed8);
            margin-right: 6px;
        }
        .wms-set-step-badge.is-purple {
            background: #f3e8ff;
            color: #7e22ce;
        }
        .wms-set-step-badge.is-success {
            background: #dcfce7;
            color: #15803d;
        }
        .wms-set-card-subtitle {
            font-size: 0.83rem;
            color: var(--text-sub, #64748b);
            margin-top: 4px;
        }
        .wms-set-add-aisle-panel {
            background: var(--bg-subtle, #f8fafc);
            border: 1px dashed var(--border-strong, #cbd5e1);
            border-radius: 12px;
            padding: 0.95rem 1rem;
            margin-bottom: 1rem;
        }
        .wms-set-add-aisle-title {
            font-size: 0.85rem;
            font-weight: 800;
            color: var(--text-main, #0f172a);
            margin-bottom: 0.65rem;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .wms-set-add-aisle-grid {
            display: grid;
            grid-template-columns: minmax(150px, 1.4fr) minmax(185px, 1.4fr) repeat(3, minmax(84px, 0.7fr)) minmax(155px, 1fr);
            gap: 10px;
            align-items: end;
        }
        .wms-set-add-aisle-submit {
            display: flex;
            flex-direction: column;
            gap: 4px;
            align-items: stretch;
        }
        .wms-set-calc-pill {
            text-align: center;
            font-size: 0.76rem;
            font-weight: 700;
            color: var(--primary-text, #1d4ed8);
            background: var(--primary-light, #dbeafe);
            border-radius: 6px;
            padding: 2px 6px;
        }
        .wms-set-aisle-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 44px;
            padding: 4px 10px;
            border-radius: 8px;
            font-weight: 800;
            font-size: 0.88rem;
            background: var(--primary-light, #eff6ff);
            color: var(--primary-text, #1d4ed8);
            border: 1px solid var(--primary-border, #bfdbfe);
        }
        @media (max-width: 960px) {
            .wms-set-add-aisle-grid {
                grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            }
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

// Helper: ตรวจสอบว่าผู้ใช้กำลังเปิดหน้าตั้งค่าพิกัดคลังสินค้าอยู่หรือไม่ (รองรับทั้ง Hash, Class และเมนูด้านซ้าย)
function isWarehouseSettingsViewCurrentlyActive() {
    const hash = String(window.location.hash || '').toLowerCase();
    if (hash.includes('settings')) return true;

    const viewSettings = document.getElementById('view-settings');
    if (viewSettings && viewSettings.classList.contains('active')) return true;

    const activeNav = document.querySelector(
        '.nav-item.active[data-view*="settings"], ' +
        '.nav-item.active[data-target*="settings"], ' +
        '.nav-item.active[href*="settings"], ' +
        '.nav-item.active[onclick*="settings"], ' +
        '.sidebar .active[data-view*="settings"], ' +
        '.sidebar .active[href*="settings"], ' +
        '.sidebar .active[onclick*="settings"]'
    );
    if (activeNav) return true;

    const globalView = String(window.currentActiveView || window.activeViewId || '').toLowerCase();
    if (globalView.includes('settings')) return true;

    return false;
}

// Helper: บังคับเปิดแสดงผลกล่อง #view-settings อย่างปลอดภัยเมื่อผู้ใช้อยู่ในหน้าตั้งค่า
function activateWarehouseSettingsContainer(viewSettings) {
    if (!viewSettings) return;
    if (!isWarehouseSettingsViewCurrentlyActive()) return;

    // ซ่อนหน้า view อื่นที่อาจค้างอยู่โดยบังเอิญเมื่อเปิดตรงเข้ามาที่ #settings-db
    document.querySelectorAll('.view-section').forEach(sec => {
        if (sec.id && sec.id !== 'view-settings') {
            sec.classList.remove('active');
            sec.style.display = 'none';
        }
    });

    viewSettings.classList.add('active');
    viewSettings.style.display = 'flex';
    viewSettings.style.flexDirection = 'column';
}

// Helper: เติมโครงสร้างแถวเริ่มต้นหากยังไม่มีข้อมูล (ป้องกันหน้าตารางว่างเปล่า 100%)
function ensureDefaultWarehouseAislesPopulated() {
    if (!Array.isArray(window.masterAisles) || window.masterAisles.length === 0) {
        const defaultAisles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DOCK', 'OFFICE', 'PENDING'];
        window.masterAisles = [...defaultAisles];
        window.aisleConfigs = window.aisleConfigs || {};
        defaultAisles.forEach(aisle => {
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

    window.masterAisles.forEach(a => {
        if (!window.aisleConfigs[a]) {
            window.aisleConfigs[a] = {
                bays: 10,
                shelves: 1,
                slots: 10,
                is_locked: false,
                zone_type: getAisleZoneTypeConfig(a)
            };
        } else if (!window.aisleConfigs[a].zone_type) {
            window.aisleConfigs[a].zone_type = getAisleZoneTypeConfig(a);
        }
    });
}

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

// =========================================================================
// --- SELF-HEALING MODERN UX/UI BUILDER FOR #view-settings              ---
// --- รับประกันว่าหน้าตั้งค่าพิกัดคลังสินค้าจะไม่ขึ้นหน้าว่างเปล่าเด็ดขาด     ---
// =========================================================================

function bootstrapWarehouseSettingsView(forceRebuild = false) {
    injectWarehouseSettingsStyles();

    let viewSettings = document.getElementById('view-settings');

    // ค้นหาคอนเทนเนอร์หลักของหน้าเว็บ (ใช้ parent ของ .view-section อื่นก่อนเพื่อให้วางตำแหน่งตรงจุด 100%)
    const siblingView = document.querySelector('.view-section:not(#view-settings)');
    const contentArea = (siblingView && siblingView.parentElement)
        || document.querySelector('.content-area')
        || document.querySelector('.main-content')
        || document.querySelector('#mainContent')
        || document.querySelector('main')
        || document.body;

    // หากไม่พบ <section id="view-settings"> ในหน้าเว็บ ให้สร้างให้อัตโนมัติภายในคอนเทนเนอร์หลัก
    if (!viewSettings) {
        viewSettings = document.createElement('section');
        viewSettings.id = 'view-settings';
        viewSettings.className = 'view-section';
        if (contentArea) {
            contentArea.appendChild(viewSettings);
        }
    } else if (siblingView && siblingView.parentElement && viewSettings.parentElement !== siblingView.parentElement) {
        // กรณี #view-settings หลุดไปอยู่นอกคอนเทนเนอร์ของ .view-section อื่น ให้ย้ายกลับมาอยู่รวมกัน
        siblingView.parentElement.appendChild(viewSettings);
    }

    // ตรวจสอบว่ามีตารางและคอนเทนเนอร์หลักครบถ้วนหรือไม่ (หากหายไปหรือหน้าว่างเปล่า ให้สร้าง UI ใหม่ทั้งหมดทันที)
    const hasAisleBody = Boolean(document.getElementById('aisleSettingsTableBody'));
    const hasMenuBody = Boolean(document.getElementById('menuDbMappingTableBody'));
    const hasUserBody = Boolean(document.getElementById('userManagementTableBody'));
    const isMissingCoreDOM = !hasAisleBody || !hasMenuBody || !hasUserBody || viewSettings.innerHTML.trim() === '';

    if (forceRebuild || isMissingCoreDOM) {
        viewSettings.innerHTML = buildWarehouseSettingsModernHTML();
    } else if (!document.getElementById('wmsSettingsHeroShell')) {
        // กรณี HTML เดิมมีตารางอยู่แล้ว แต่ยังไม่มีแถบ Hero, KPI และแท็บแบ่งหมวดหมู่ ให้เสริมครอบด้านบนโดยไม่ลบของเดิม
        const existingCards = Array.from(viewSettings.children);
        const topShell = document.createElement('div');
        topShell.id = 'wmsSettingsHeroShell';
        topShell.className = 'wms-set-top-shell';
        topShell.innerHTML = buildWarehouseSettingsHeaderAndTabsHTML();
        viewSettings.insertBefore(topShell, viewSettings.firstChild);

        // ติดป้ายกำกับหมวดหมู่ให้การ์ดเดิมเพื่อรองรับการกดสลับแท็บ
        existingCards.forEach(card => {
            if (card.querySelector('#aisleSettingsTableBody')) {
                card.setAttribute('data-settings-section', 'AISLES');
            } else if (card.querySelector('#userManagementTableBody')) {
                card.setAttribute('data-settings-section', 'USERS');
            } else if (card.querySelector('#menuDbMappingTableBody')) {
                card.setAttribute('data-settings-section', 'DB_MAPPING');
            }
        });
    }

    // หากผู้ใช้อยู่ในหน้าตั้งค่า (เปิดหน้าเว็บครั้งแรกที่ #settings-db หรือคลิกเมนูตั้งค่า) บังคับให้แสดงผลทันที
    activateWarehouseSettingsContainer(viewSettings);

    applySettingsSectionTabVisibility();
    updateWarehouseSettingsKPIs();
}

function buildWarehouseSettingsHeaderAndTabsHTML() {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return `
        <!-- 1. MODERN HERO BANNER -->
        <div class="settings-hero-banner wms-set-hero">
            <div class="wms-set-hero-left">
                <div class="wms-set-hero-badge-row">
                    <span class="wms-set-pill-badge">
                        <i class="fa-solid fa-sliders"></i> WAREHOUSE ARCHITECTURE & ACCESS CONTROL
                    </span>
                    <span id="wmsSettingsConnBadge" class="wms-set-conn-pill ${isOnline ? 'is-online' : 'is-offline'}">
                        <span class="wms-set-conn-dot"></span>
                        ${isOnline ? 'เชื่อมต่อฐานข้อมูลออนไลน์' : 'โหมดออฟไลน์ (บันทึกในเครื่อง)'}
                    </span>
                </div>
                <h2 class="wms-set-hero-title">
                    ⚙️ ตั้งค่าพิกัดคลังสินค้า โครงสร้างแถว และสิทธิ์ผู้ใช้งาน
                </h2>
                <p class="wms-set-hero-desc">
                    บริหารจัดการโครงสร้างแถวจัดเก็บ (Row / Bay / Shelf / Slot) ตรวจสอบความจุพิกัดแบบเรียลไทม์ กำหนดสิทธิ์การเข้าถึงโมดูล และการยืนยันตัวตนด้วยลายนิ้วมือ
                </p>
            </div>
            <div class="wms-set-hero-actions">
                <button type="button" class="btn btn-sm btn-secondary wms-set-hero-btn" onclick="syncAllWarehouseSettingsNow()" title="ซิงก์ข้อมูลล่าสุดจากฐานข้อมูล">
                    <i class="fa-solid fa-rotate"></i> ซิงก์ข้อมูลล่าสุด
                </button>
                <button type="button" class="btn btn-sm btn-success wms-set-hero-btn" onclick="saveAllWarehouseConfigsToDB()" title="บันทึกการตั้งค่าทั้งหมดลงฐานข้อมูล">
                    <i class="fa-solid fa-cloud-arrow-up"></i> บันทึกทั้งหมด
                </button>
                <button type="button" class="btn btn-sm btn-secondary wms-set-hero-btn" onclick="exportWarehouseConfigsJSON()" title="ส่งออกไฟล์สำรองโครงสร้างคลัง (.json)">
                    <i class="fa-solid fa-download"></i> สำรองข้อมูล
                </button>
                <button type="button" class="btn btn-sm btn-secondary wms-set-hero-btn" onclick="triggerImportWarehouseConfigs()" title="นำเข้าไฟล์โครงสร้างคลัง (.json)">
                    <i class="fa-solid fa-upload"></i> นำเข้า
                </button>
                <input type="file" id="wmsImportConfigFileInput" accept=".json,application/json" style="display:none;" onchange="handleImportWarehouseConfigsFile(event)">
            </div>
        </div>

        <!-- 2. LIVE KPI SUMMARY CARDS -->
        <div class="wms-set-kpi-grid" id="wmsSettingsKpiGrid">
            <div class="wms-set-kpi-card is-primary">
                <div class="wms-set-kpi-icon"><i class="fa-solid fa-layer-group"></i></div>
                <div class="wms-set-kpi-info">
                    <div class="wms-set-kpi-label">แถวจัดเก็บทั้งหมด (Aisles)</div>
                    <div class="wms-set-kpi-value mono" id="kpiTotalAislesValue">0 แถว</div>
                    <div class="wms-set-kpi-sub" id="kpiAisleZoneBreakdown">หลัก 0 • เพิ่มเติม 0</div>
                </div>
            </div>

            <div class="wms-set-kpi-card is-success">
                <div class="wms-set-kpi-icon"><i class="fa-solid fa-cubes"></i></div>
                <div class="wms-set-kpi-info">
                    <div class="wms-set-kpi-label">ความจุพิกัดรวม (Total Slots)</div>
                    <div class="wms-set-kpi-value mono" id="kpiTotalSlotsValue">0 พิกัด</div>
                    <div class="wms-set-kpi-sub" id="kpiOccupancySummary">ใช้งานแล้ว 0 เครื่อง (0%)</div>
                </div>
            </div>

            <div class="wms-set-kpi-card is-purple">
                <div class="wms-set-kpi-icon"><i class="fa-solid fa-users-gear"></i></div>
                <div class="wms-set-kpi-info">
                    <div class="wms-set-kpi-label">บัญชีผู้ใช้งานระบบ</div>
                    <div class="wms-set-kpi-value mono" id="kpiTotalUsersValue">0 บัญชี</div>
                    <div class="wms-set-kpi-sub" id="kpiBiometricUsersSub">ลงทะเบียนลายนิ้วมือ 0 บัญชี</div>
                </div>
            </div>

            <div class="wms-set-kpi-card is-amber">
                <div class="wms-set-kpi-icon"><i class="fa-solid fa-shield-halved"></i></div>
                <div class="wms-set-kpi-info">
                    <div class="wms-set-kpi-label">แถวโครงสร้างที่ล็อกป้องกัน</div>
                    <div class="wms-set-kpi-value mono" id="kpiLockedAislesValue">0 แถว</div>
                    <div class="wms-set-kpi-sub" id="kpiLastSyncTimeSub">อัปเดตล่าสุด: พร้อมใช้งาน</div>
                </div>
            </div>
        </div>

        <!-- 3. SEGMENTED SECTION NAVIGATION TABS -->
        <div class="wms-set-tabs-bar" role="tablist" aria-label="หมวดหมู่การตั้งค่าระบบ">
            <button type="button" class="wms-set-tab-btn ${activeSettingsSectionTab === 'ALL' ? 'active' : ''}" data-tab="ALL" onclick="switchSettingsSectionTab('ALL')">
                <i class="fa-solid fa-border-all"></i> แสดงทุกส่วน (All)
            </button>
            <button type="button" class="wms-set-tab-btn ${activeSettingsSectionTab === 'AISLES' ? 'active' : ''}" data-tab="AISLES" onclick="switchSettingsSectionTab('AISLES')">
                <i class="fa-solid fa-warehouse"></i> 1. โครงสร้างแถวและพิกัดคลัง
            </button>
            <button type="button" class="wms-set-tab-btn ${activeSettingsSectionTab === 'USERS' ? 'active' : ''}" data-tab="USERS" onclick="switchSettingsSectionTab('USERS')">
                <i class="fa-solid fa-user-shield"></i> 2. บัญชีผู้ใช้และสิทธิ์เข้าถึง
            </button>
            <button type="button" class="wms-set-tab-btn ${activeSettingsSectionTab === 'DB_MAPPING' ? 'active' : ''}" data-tab="DB_MAPPING" onclick="switchSettingsSectionTab('DB_MAPPING')">
                <i class="fa-solid fa-database"></i> 3. ตารางเชื่อมต่อฐานข้อมูล
            </button>
        </div>
    `;
}

function buildWarehouseSettingsModernHTML() {
    return `
        <div id="wmsSettingsHeroShell" class="wms-set-top-shell">
            ${buildWarehouseSettingsHeaderAndTabsHTML()}
        </div>

        <!-- =============================================================== -->
        <!-- PART 1: WAREHOUSE AISLE & COORDINATE STRUCTURE CONFIGURATION    -->
        <!-- =============================================================== -->
        <div class="settings-section-card wms-set-card" data-settings-section="AISLES">
            <div class="card-header">
                <div>
                    <div class="card-title">
                        <span class="wms-set-step-badge">ส่วนที่ 1</span>
                        <i class="fa-solid fa-warehouse" style="color:var(--primary);"></i>
                        โครงสร้างแถวจัดเก็บและพิกัดคลังสินค้า (Warehouse Rows & Slots)
                    </div>
                    <div class="wms-set-card-subtitle">
                        กำหนดชื่อแถว ประเภทโครงสร้าง (หลัก / เพิ่มเติม) จำนวนล็อก (Bays) ชั้น (Shelves) และช่องย่อย (Slots) ระบบคำนวณพิกัดอัตโนมัติทันที
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="resetDefaultWarehouseAisles()" title="กู้คืนแถวมาตรฐาน A-G, DOCK, OFFICE, PENDING">
                        <i class="fa-solid fa-clock-rotate-left"></i> กู้คืนแถวมาตรฐาน
                    </button>
                </div>
            </div>

            <!-- แถบเพิ่มแถวจัดเก็บใหม่พร้อมตัวคำนวณความจุล่วงหน้า -->
            <div class="wms-set-add-aisle-panel">
                <div class="wms-set-add-aisle-title">
                    <i class="fa-solid fa-circle-plus" style="color:var(--success);"></i> เพิ่มแถวจัดเก็บใหม่เข้าระบบ
                </div>
                <div class="wms-set-add-aisle-grid">
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="newAisleInput">ชื่อแถว / โซน (Row Name)</label>
                        <input type="text" id="newAisleInput" class="form-control mono font-bold" placeholder="เช่น H, RACK-01, ZONE-B" onkeydown="if(event.key==='Enter'){event.preventDefault();addNewAisleConfig();}">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="newAisleZoneTypeSelect">ประเภทโครงสร้าง</label>
                        <select id="newAisleZoneTypeSelect" class="form-select font-bold">
                            <option value="main">🔵 โครงสร้างหลัก (Main)</option>
                            <option value="auxiliary" selected>🟡 โครงสร้างเพิ่มเติม (Auxiliary)</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="newAisleBaysInput">ล็อก (Bays)</label>
                        <input type="number" id="newAisleBaysInput" class="form-control mono" min="1" max="500" value="10" oninput="updateNewAislePreviewCalc()" style="text-align:center;">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="newAisleShelvesInput">ชั้น (Shelves)</label>
                        <input type="number" id="newAisleShelvesInput" class="form-control mono" min="1" max="50" value="1" oninput="updateNewAislePreviewCalc()" style="text-align:center;">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="newAisleSlotsInput">ช่อง (Slots)</label>
                        <input type="number" id="newAisleSlotsInput" class="form-control mono" min="1" max="500" value="10" oninput="updateNewAislePreviewCalc()" style="text-align:center;">
                    </div>
                    <div class="wms-set-add-aisle-submit">
                        <span id="newAisleCalcPreview" class="wms-set-calc-pill mono">
                            = 100 พิกัด
                        </span>
                        <button type="button" class="btn btn-primary" onclick="addNewAisleConfig()" style="width:100%;">
                            <i class="fa-solid fa-plus"></i> เพิ่มแถวใหม่
                        </button>
                    </div>
                </div>
            </div>

            <!-- ตารางตั้งค่าแถวจัดเก็บ -->
            <div class="table-responsive">
                <table class="modern-table">
                    <thead>
                        <tr>
                            <th style="text-align:center; width:54px;">#</th>
                            <th style="text-align:left; min-width:130px;">ชื่อแถว / โซน</th>
                            <th style="text-align:center; min-width:210px;">ประเภทโครงสร้าง</th>
                            <th style="text-align:center; width:92px;">ล็อก (Bays)</th>
                            <th style="text-align:center; width:92px;">ชั้น (Shelves)</th>
                            <th style="text-align:center; width:92px;">ช่อง (Slots)</th>
                            <th style="text-align:center; min-width:125px;">ความจุรวม</th>
                            <th style="text-align:center; min-width:115px;">สินค้าในแถว</th>
                            <th style="text-align:center; width:96px;">จัดลำดับ</th>
                            <th style="text-align:center; width:112px;">ล็อกโครงสร้าง</th>
                            <th style="text-align:center; width:88px;">ลบ</th>
                        </tr>
                    </thead>
                    <tbody id="aisleSettingsTableBody"></tbody>
                </table>
            </div>
        </div>

        <!-- =============================================================== -->
        <!-- PART 2: USER ACCOUNTS, ROLE PERMISSIONS & BIOMETRIC SECURITY    -->
        <!-- =============================================================== -->
        <div class="settings-section-card wms-set-card" data-settings-section="USERS">
            <div class="card-header">
                <div>
                    <div class="card-title">
                        <span class="wms-set-step-badge is-purple">ส่วนที่ 2</span>
                        <i class="fa-solid fa-users-gear" style="color:var(--purple);"></i>
                        จัดการบัญชีผู้ใช้งาน ระดับสิทธิ์ และสแกนลายนิ้วมือ (User & Security)
                    </div>
                    <div class="wms-set-card-subtitle">
                        กำหนดสิทธิ์การเข้าถึงเมนูและไฟล์โมดูล ลงทะเบียนลายนิ้วมือ (WebAuthn) และตรวจสอบประวัติการใช้งานรายบุคคล
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <button type="button" class="btn btn-sm btn-primary" onclick="openQuickAddUserModal()" style="border-radius:8px; font-weight:700;">
                        <i class="fa-solid fa-user-plus"></i> เพิ่มบัญชีผู้ใช้ใหม่
                    </button>
                </div>
            </div>

            <div class="table-responsive">
                <table class="modern-table">
                    <thead>
                        <tr>
                            <th style="text-align:center; width:52px;">#</th>
                            <th style="text-align:center; width:136px;">Username</th>
                            <th style="text-align:left; min-width:185px;">ชื่อ-นามสกุล</th>
                            <th style="text-align:center; width:145px;">แผนก</th>
                            <th style="text-align:center; width:150px;">ไฟล์</th>
                            <th style="text-align:center; width:115px;">ระดับสิทธิ์</th>
                            <th style="text-align:center; width:175px;">ลายนิ้วมือ</th>
                            <th style="text-align:center; width:125px;">ดูประวัติ</th>
                            <th style="text-align:center; width:240px;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody id="userManagementTableBody"></tbody>
                </table>
            </div>
        </div>

        <!-- =============================================================== -->
        <!-- PART 3: SYSTEM MENU & SUPABASE DATABASE MAPPING                 -->
        <!-- =============================================================== -->
        <div class="settings-section-card wms-set-card" data-settings-section="DB_MAPPING">
            <div class="card-header">
                <div>
                    <div class="card-title">
                        <span class="wms-set-step-badge is-success">ส่วนที่ 3</span>
                        <i class="fa-solid fa-database" style="color:var(--success);"></i>
                        โครงสร้างการเชื่อมต่อเมนูกับฐานข้อมูล (Menu & Supabase DB Mapping)
                    </div>
                    <div class="wms-set-card-subtitle">
                        ตรวจสอบความพร้อมของแต่ละโมดูลและการซิงก์ข้อมูลแบบ Realtime ระหว่างหน้าเว็บไซต์และตารางฐานข้อมูล Supabase
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="testDatabaseConnectionLive()" style="border-radius:8px; font-weight:700;">
                        <i class="fa-solid fa-plug-circle-check" style="color:var(--success);"></i> ทดสอบเชื่อมต่อ DB
                    </button>
                </div>
            </div>

            <div class="table-responsive">
                <table class="modern-table">
                    <thead>
                        <tr>
                            <th style="text-align:center; width:54px;">#</th>
                            <th style="text-align:left; min-width:180px;">ชื่อเมนู / โมดูล</th>
                            <th style="text-align:left; min-width:220px;">ตารางฐานข้อมูล (Supabase Table)</th>
                            <th style="text-align:left; min-width:170px;">สถานะการทำงาน</th>
                            <th style="text-align:left; min-width:260px;">รายละเอียดการเชื่อมต่อ</th>
                        </tr>
                    </thead>
                    <tbody id="menuDbMappingTableBody"></tbody>
                </table>
            </div>
        </div>
    `;
}

// สลับการแสดงผลแท็บหมวดหมู่ในหน้าตั้งค่า (ทั้งหมด / โครงสร้างแถว / ผู้ใช้ / DB Mapping)
function switchSettingsSectionTab(tabKey) {
    activeSettingsSectionTab = tabKey || 'ALL';

    document.querySelectorAll('.wms-set-tab-btn').forEach(btn => {
        const isTarget = btn.getAttribute('data-tab') === activeSettingsSectionTab;
        btn.classList.toggle('active', isTarget);
    });

    applySettingsSectionTabVisibility();
}

function applySettingsSectionTabVisibility() {
    const viewSettings = document.getElementById('view-settings');
    if (!viewSettings) return;

    const sections = viewSettings.querySelectorAll('[data-settings-section]');
    sections.forEach(sec => {
        const secType = sec.getAttribute('data-settings-section');
        if (activeSettingsSectionTab === 'ALL' || secType === activeSettingsSectionTab) {
            sec.style.display = '';
        } else {
            sec.style.display = 'none';
        }
    });
}

// คำนวณตัวอย่างพิกัดล่วงหน้าในแถบเพิ่มแถวใหม่
function updateNewAislePreviewCalc() {
    const baysEl = document.getElementById('newAisleBaysInput');
    const shelvesEl = document.getElementById('newAisleShelvesInput');
    const slotsEl = document.getElementById('newAisleSlotsInput');
    const previewEl = document.getElementById('newAisleCalcPreview');
    if (!previewEl) return;

    const b = Math.max(1, parseInt(baysEl?.value, 10) || 10);
    const s = Math.max(1, parseInt(shelvesEl?.value, 10) || 1);
    const sl = Math.max(1, parseInt(slotsEl?.value, 10) || 10);
    const total = b * s * sl;

    previewEl.textContent = `= ${total.toLocaleString()} พิกัด`;
}

// อัปเดตการ์ด KPI สรุปภาพรวมการตั้งค่าคลังสินค้าแบบเรียลไทม์
function updateWarehouseSettingsKPIs() {
    ensureDefaultWarehouseAislesPopulated();

    const aisles = window.masterAisles || [];
    let mainCount = 0;
    let auxCount = 0;
    let lockedCount = 0;
    let totalCapacitySlots = 0;

    aisles.forEach(a => {
        const cfg = window.aisleConfigs[a] || { bays: 10, shelves: 1, slots: 10, is_locked: false };
        const zType = getAisleZoneTypeConfig(a);
        if (zType === 'main') mainCount++;
        else auxCount++;
        if (cfg.is_locked) lockedCount++;

        const cap = (parseInt(cfg.bays, 10) || 1) * (parseInt(cfg.shelves, 10) || 1) * (parseInt(cfg.slots, 10) || 1);
        totalCapacitySlots += cap;
    });

    const invData = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : (Array.isArray(window.globalInventoryData) ? window.globalInventoryData : []);
    const totalStoredItems = invData.length;
    const occupancyPct = totalCapacitySlots > 0 ? Math.min(100, Math.round((totalStoredItems / totalCapacitySlots) * 100)) : 0;

    const usersList = typeof systemUsers !== 'undefined' ? systemUsers : (window.systemUsers || []);
    const bioCount = usersList.filter(u => hasRegisteredFingerprint(u.username)).length;

    const elTotalAisles = document.getElementById('kpiTotalAislesValue');
    const elAisleBreakdown = document.getElementById('kpiAisleZoneBreakdown');
    const elTotalSlots = document.getElementById('kpiTotalSlotsValue');
    const elOccupancy = document.getElementById('kpiOccupancySummary');
    const elTotalUsers = document.getElementById('kpiTotalUsersValue');
    const elBioSub = document.getElementById('kpiBiometricUsersSub');
    const elLocked = document.getElementById('kpiLockedAislesValue');
    const elLastSync = document.getElementById('kpiLastSyncTimeSub');
    const elConnBadge = document.getElementById('wmsSettingsConnBadge');

    if (elTotalAisles) elTotalAisles.textContent = `${aisles.length.toLocaleString()} แถว`;
    if (elAisleBreakdown) elAisleBreakdown.textContent = `หลัก ${mainCount} แถว • เพิ่มเติม ${auxCount} แถว`;
    if (elTotalSlots) elTotalSlots.textContent = `${totalCapacitySlots.toLocaleString()} พิกัด`;
    if (elOccupancy) elOccupancy.textContent = `ใช้งานแล้ว ${totalStoredItems.toLocaleString()} เครื่อง (${occupancyPct}%)`;
    if (elTotalUsers) elTotalUsers.textContent = `${usersList.length.toLocaleString()} บัญชี`;
    if (elBioSub) elBioSub.textContent = `ลงทะเบียนลายนิ้วมือ ${bioCount} บัญชี`;
    if (elLocked) elLocked.textContent = `${lockedCount.toLocaleString()} แถว`;

    if (elLastSync) {
        if (lastWarehouseConfigSyncTime) {
            elLastSync.textContent = `ซิงก์ล่าสุด: ${lastWarehouseConfigSyncTime}`;
        } else {
            elLastSync.textContent = `สถานะ: ข้อมูลพร้อมใช้งาน 100%`;
        }
    }

    if (elConnBadge) {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        const online = navigator.onLine && Boolean(client);
        elConnBadge.className = `wms-set-conn-pill ${online ? 'is-online' : 'is-offline'}`;
        elConnBadge.innerHTML = `<span class="wms-set-conn-dot"></span> ${online ? 'เชื่อมต่อฐานข้อมูลออนไลน์' : 'โหมดออฟไลน์ (บันทึกในเครื่อง)'}`;
    }
}

async function saveAllWarehouseConfigsToDB() {
    ensureDefaultWarehouseAislesPopulated();
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

    lastWarehouseConfigSyncTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    updateWarehouseSettingsKPIs();

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
            showToast("❌ บันทึกลง DB ล้มเหลว (บันทึกในเครื่องเรียบร้อย)", "error");
        }
        return false;
    }
}

async function loadWarehouseConfigsFromDB(retryCount = 0) {
    ensureDefaultWarehouseAislesPopulated();

    try {
        let dbAisles = [];
        let dbConfigs = {};
        let loadedSuccess = false;

        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;

        if (!client && retryCount < 12) {
            setTimeout(() => loadWarehouseConfigsFromDB(retryCount + 1), 350);
        } else if (client && !isWarehouseSettingsRealtimeSubscribed) {
            initWarehouseSettingsRealtime();
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
                if (Array.isArray(mapVal) && mapVal.length > 0) menuDbMappingData = mapVal;
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
            lastWarehouseConfigSyncTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }

        ensureDefaultWarehouseAislesPopulated();

        if (window.masterAisles.length > 0 && (!window.currentSelectedAisle || !window.masterAisles.includes(window.currentSelectedAisle))) {
            window.currentSelectedAisle = window.masterAisles[0];
        }
    } catch(e) {
        ensureDefaultWarehouseAislesPopulated();
    }

    bootstrapWarehouseSettingsView(false);
    renderAisleSettingsTable();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    renderMenuDatabaseMappingTable();
    scheduleUserTableRender();
    updateWarehouseSettingsKPIs();
}

async function syncAllWarehouseSettingsNow() {
    bootstrapWarehouseSettingsView(false);
    await loadWarehouseConfigsFromDB(0);
    if (typeof loadUsersFromDB === 'function') {
        await loadUsersFromDB();
    }
    renderAisleSettingsTable();
    renderMenuDatabaseMappingTable();
    scheduleUserTableRender();
    updateWarehouseSettingsKPIs();
    if (typeof showToast === 'function') {
        showToast("🔄 ซิงก์ข้อมูลการตั้งค่าพิกัดคลังและสิทธิ์ผู้ใช้ล่าสุดแล้ว");
    }
}

async function testDatabaseConnectionLive() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!client) {
        alert("❌ ยังไม่พบการเชื่อมต่อ Supabase Client ในขณะนี้ (ตรวจสอบอินเทอร์เน็ตหรือค่าการเชื่อมต่อ)");
        return;
    }
    try {
        const start = performance.now();
        const { error } = await client.from('system_settings').select('key').limit(1);
        const ms = Math.round(performance.now() - start);
        if (error) throw error;
        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') {
            showToast(`✅ เชื่อมต่อ Supabase สำเร็จ! ความเร็วตอบสนอง ${ms} ms`);
        }
        updateWarehouseSettingsKPIs();
    } catch (err) {
        if (typeof playErrorSound === 'function') playErrorSound();
        alert(`⚠️ ทดสอบการเชื่อมต่อฐานข้อมูลไม่สำเร็จ: ${err && err.message ? err.message : 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้'}`);
    }
}

// 📤 สำรองการตั้งค่าโครงสร้างคลังสินค้าเป็นไฟล์ JSON
function exportWarehouseConfigsJSON() {
    ensureDefaultWarehouseAislesPopulated();
    const payload = {
        exportedAt: new Date().toISOString(),
        system: 'WMS Enterprise Warehouse Coordinates Config',
        aisles: window.masterAisles,
        configs: window.aisleConfigs,
        menuMapping: menuDbMappingData
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `wms-warehouse-coordinates-${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') {
        showToast("📤 ดาวน์โหลดไฟล์สำรองโครงสร้างพิกัดคลัง (.json) เรียบร้อยแล้ว");
    }
}

function triggerImportWarehouseConfigs() {
    const fileInput = document.getElementById('wmsImportConfigFileInput');
    if (fileInput) {
        fileInput.value = '';
        fileInput.click();
    }
}

async function handleImportWarehouseConfigsFile(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.aisles) || parsed.aisles.length === 0 || typeof parsed.configs !== 'object') {
            alert("❌ รูปแบบไฟล์ JSON ไม่ถูกต้อง ไม่พบข้อมูลโครงสร้างแถวจัดเก็บ");
            return;
        }

        if (!confirm(`ยืนยันการนำเข้าโครงสร้างแถวจัดเก็บจำนวน ${parsed.aisles.length} แถวจากไฟล์ "${file.name}"?`)) {
            return;
        }

        window.masterAisles = parsed.aisles.map(a => String(a).trim().toUpperCase()).filter(Boolean);
        window.aisleConfigs = parsed.configs || {};
        if (Array.isArray(parsed.menuMapping) && parsed.menuMapping.length > 0) {
            menuDbMappingData = parsed.menuMapping;
        }

        ensureDefaultWarehouseAislesPopulated();
        renderAisleSettingsTable();
        renderMenuDatabaseMappingTable();
        updateWarehouseSettingsKPIs();
        if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
        if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
        await saveAllWarehouseConfigsToDB();

        if (typeof playSuccessSound === 'function') playSuccessSound();
    } catch (err) {
        if (typeof playErrorSound === 'function') playErrorSound();
        alert(`❌ ไม่สามารถอ่านไฟล์นำเข้าได้: ${err && err.message ? err.message : 'ไฟล์เสียหาย'}`);
    }
}

// 🔄 กู้คืนแถวจัดเก็บมาตรฐาน (A-G, DOCK, OFFICE, PENDING)
async function resetDefaultWarehouseAisles() {
    const pinCode = prompt("🔐 ยืนยันสิทธิ์ผู้ดูแลระบบ: กรอกรหัสผ่าน Admin เพื่อกู้คืนแถวจัดเก็บมาตรฐาน:");
    if (pinCode === null) return;

    const isValidAdmin = typeof verifyAdminPasswordSecure === 'function' ? await verifyAdminPasswordSecure(pinCode) : false;
    if (!isValidAdmin) {
        if (typeof playErrorSound === 'function') playErrorSound();
        alert("❌ รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง!");
        return;
    }

    const defaultAisles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DOCK', 'OFFICE', 'PENDING'];
    defaultAisles.forEach(aisle => {
        if (!window.masterAisles.includes(aisle)) {
            window.masterAisles.push(aisle);
        }
        const isMainDefault = ['A', 'B', 'C', 'D'].includes(aisle);
        window.aisleConfigs[aisle] = window.aisleConfigs[aisle] || {
            bays: 10,
            shelves: 1,
            slots: 10,
            zone_type: isMainDefault ? 'main' : 'auxiliary',
            is_locked: ['A', 'B', 'C', 'D', 'DOCK'].includes(aisle)
        };
    });

    renderAisleSettingsTable();
    updateWarehouseSettingsKPIs();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    await saveAllWarehouseConfigsToDB();
    if (typeof playSuccessSound === 'function') playSuccessSound();
}

function initWarehouseSettingsRealtime() {
    if (isWarehouseSettingsRealtimeSubscribed) return;
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
                    if (val && Array.isArray(val.aisles) && val.aisles.length > 0) {
                        window.masterAisles = val.aisles;
                        window.aisleConfigs = val.configs || {};
                        ensureDefaultWarehouseAislesPopulated();
                        renderAisleSettingsTable();
                        updateWarehouseSettingsKPIs();
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
        isWarehouseSettingsRealtimeSubscribed = true;
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
    updateWarehouseSettingsKPIs();
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
        const parsedNum = parseInt(val, 10);
        window.aisleConfigs[aisle][key] = Math.max(1, Math.min(999, isNaN(parsedNum) ? 1 : parsedNum));
    }

    renderAisleSettingsTable();
    updateWarehouseSettingsKPIs();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    await saveAllWarehouseConfigsToDB();
}

async function addNewAisleConfig() {
    const input = document.getElementById('newAisleInput');
    if (!input) return;

    const aisleName = input.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!aisleName) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณาระบุชื่อแถวจัดเก็บ (เช่น H, ZONE-1)", "warning");
        input.focus();
        return;
    }
    if (window.masterAisles.includes(aisleName)) {
        if (typeof showToast === 'function') showToast(`⚠️ แถว "${aisleName}" มีอยู่ในระบบแล้ว`, "warning");
        input.focus();
        return;
    }

    const zoneTypeSelect = document.getElementById('newAisleZoneTypeSelect');
    const selectedZoneType = zoneTypeSelect ? zoneTypeSelect.value : 'auxiliary';

    const baysInput = document.getElementById('newAisleBaysInput');
    const shelvesInput = document.getElementById('newAisleShelvesInput');
    const slotsInput = document.getElementById('newAisleSlotsInput');

    const baysVal = Math.max(1, Math.min(500, parseInt(baysInput?.value, 10) || 10));
    const shelvesVal = Math.max(1, Math.min(50, parseInt(shelvesInput?.value, 10) || 1));
    const slotsVal = Math.max(1, Math.min(500, parseInt(slotsInput?.value, 10) || 10));

    window.masterAisles.push(aisleName);
    window.aisleConfigs[aisleName] = { 
        bays: baysVal, 
        shelves: shelvesVal, 
        slots: slotsVal, 
        zone_type: selectedZoneType, 
        is_locked: false 
    };
    input.value = '';

    renderAisleSettingsTable();
    updateWarehouseSettingsKPIs();
    if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    if (typeof refreshLocationVisualizerIfActive === 'function') refreshLocationVisualizerIfActive();
    await saveAllWarehouseConfigsToDB();
    if (typeof playSuccessSound === 'function') playSuccessSound();
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
        updateWarehouseSettingsKPIs();
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

// 🟢 แสดงผลตารางตั้งค่าแถวจัดเก็บ ปรับแต่งคอลัมน์ประเภทโซนและความจุรวมให้ชัดเจน ไม่ตกขอบ
function renderAisleSettingsTable() {
    ensureDefaultWarehouseAislesPopulated();

    const tbody = document.getElementById('aisleSettingsTableBody');
    if (!tbody) return;

    const mainCount = window.masterAisles.filter(a => getAisleZoneTypeConfig(a) === 'main').length;
    const auxCount = window.masterAisles.filter(a => getAisleZoneTypeConfig(a) === 'auxiliary').length;
    const lockedCount = window.masterAisles.filter(a => Boolean(window.aisleConfigs[a]?.is_locked)).length;

    // ตรวจสอบหรือสร้างแถบเครื่องมือกรองหมวดหมู่ด้านบนตาราง
    let filterContainer = document.getElementById('aisleSettingsTableFilterBar');
    if (!filterContainer && tbody.parentElement && tbody.parentElement.parentElement) {
        const tableResponsive = tbody.parentElement.parentElement;
        filterContainer = document.createElement('div');
        filterContainer.id = 'aisleSettingsTableFilterBar';
        filterContainer.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:0.85rem; background:var(--bg-subtle); padding:0.75rem 1rem; border-radius:var(--radius-md); border:1px solid var(--border-color);';
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
                    🔵 โครงสร้างหลัก (${mainCount})
                </button>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'AUXILIARY' ? 'btn-warning' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('AUXILIARY')" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                    🟡 โครงสร้างเพิ่มเติม (${auxCount})
                </button>
                <button type="button" class="btn btn-sm ${aisleTableZoneFilter === 'LOCKED' ? 'btn-danger' : 'btn-secondary'}" onclick="setAisleSettingsCategoryFilter('LOCKED')" style="border-radius:8px; font-weight:700; touch-action:manipulation;">
                    🔒 แถวที่ล็อกไว้ (${lockedCount})
                </button>
            </div>
            <div style="position:relative; width:230px;">
                <input type="text" class="form-control" placeholder="🔍 ค้นหาชื่อแถว..." value="${escapeHTML(aisleTableSearchQuery)}" oninput="onAisleSettingsSearchInput(this.value)" style="padding:5px 11px; font-size:0.84rem; border-radius:8px;">
            </div>
        `;
    }

    tbody.innerHTML = '';

    const invData = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData
        : (Array.isArray(window.globalInventoryData) ? window.globalInventoryData : []);

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
                <td colspan="11" style="text-align:center; padding:26px; color:var(--text-muted);">
                    <i class="fa-solid fa-folder-open" style="font-size:1.6rem; margin-bottom:6px; display:block;"></i>
                    ไม่พบข้อมูลแถวจัดเก็บตรงกับหมวดหมู่หรือคำค้นหานี้
                </td>
            </tr>
        `;
        return;
    }

    filteredAisles.forEach(({ aisle, originalIdx }, displaySeq) => {
        const cfg = window.aisleConfigs[aisle] || { bays: 10, shelves: 1, slots: 10, is_locked: false };
        const zoneType = getAisleZoneTypeConfig(aisle);
        const totalRowSlots = (parseInt(cfg.bays, 10) || 1) * (parseInt(cfg.shelves, 10) || 1) * (parseInt(cfg.slots, 10) || 1);
        const count = invData.filter(i => (i.location || '').toUpperCase().startsWith(`${aisle}-`) || (i.location || '').toUpperCase() === aisle).length;
        const pct = totalRowSlots > 0 ? Math.min(100, Math.round((count / totalRowSlots) * 100)) : 0;
        const isLocked = Boolean(cfg.is_locked);
        const safeAisle = escapeHTML(aisle);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center; font-weight:700;" class="mono">${displaySeq + 1}</td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="wms-set-aisle-badge mono">${safeAisle}</span>
                    ${isLocked ? '<span class="badge-action inbound" style="font-size:0.72rem; padding:2px 8px; background:var(--warning-light); color:var(--warning-text); border:1px solid var(--warning-border);"><i class="fa-solid fa-lock"></i> ล็อก</span>' : ''}
                </div>
            </td>
            <!-- 🟢 เลือกประเภทโครงสร้าง (ความกว้าง min-width: 210px ป้องกันตัวอักษรตกขอบ/ตัดทอน 100%) -->
            <td style="text-align:center; min-width:210px;">
                <select class="form-select font-bold" style="width:100%; min-width:205px; font-size:0.83rem; padding:5px 8px; border-radius:8px; text-align:left;" onchange="updateAisleParam('${safeAisle}', 'zone_type', this.value)">
                    <option value="main" ${zoneType === 'main' ? 'selected' : ''}>🔵 โครงสร้างหลัก (Main)</option>
                    <option value="auxiliary" ${zoneType === 'auxiliary' ? 'selected' : ''}>🟡 โครงสร้างเพิ่มเติม (Auxiliary)</option>
                </select>
            </td>
            <td style="text-align:center;"><input type="number" min="1" max="999" class="form-control mono" style="width:70px; text-align:center; display:inline-block;" value="${cfg.bays}" onchange="updateAisleParam('${safeAisle}', 'bays', this.value)"></td>
            <td style="text-align:center;"><input type="number" min="1" max="99" class="form-control mono" style="width:70px; text-align:center; display:inline-block;" value="${cfg.shelves}" onchange="updateAisleParam('${safeAisle}', 'shelves', this.value)"></td>
            <td style="text-align:center;"><input type="number" min="1" max="999" class="form-control mono" style="width:70px; text-align:center; display:inline-block;" value="${cfg.slots}" onchange="updateAisleParam('${safeAisle}', 'slots', this.value)"></td>
            <td style="text-align:center;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                    <span class="mono font-bold" style="color:var(--primary-text); font-size:0.84rem;">${totalRowSlots.toLocaleString()} พิกัด</span>
                    <div style="width:84px; height:5px; background:var(--bg-subtle-accent); border-radius:99px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${pct >= 90 ? 'var(--danger)' : (pct >= 70 ? 'var(--warning)' : 'var(--success)')};"></div>
                    </div>
                </div>
            </td>
            <td style="text-align:center;" class="mono font-bold">${count.toLocaleString()} เครื่อง</td>
            <td style="text-align:center;">
                <div style="display:flex; justify-content:center; gap:4px;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="moveAisleOrder(${originalIdx}, -1)" ${originalIdx === 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="เลื่อนตำแหน่งขึ้น">
                        <i class="fa-solid fa-arrow-up"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="moveAisleOrder(${originalIdx}, 1)" ${originalIdx === window.masterAisles.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="เลื่อนตำแหน่งลง">
                        <i class="fa-solid fa-arrow-down"></i>
                    </button>
                </div>
            </td>
            <td style="text-align:center;">
                <button type="button" class="btn btn-sm ${isLocked ? 'btn-secondary' : 'btn-primary'}" onclick="toggleAisleLock('${safeAisle}')">
                    <i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i> ${isLocked ? 'ปลดล็อก' : 'ล็อก'}
                </button>
            </td>
            <td style="text-align:center;">
                <button type="button" class="btn btn-sm btn-danger" onclick="verifyAndDeleteAisle('${safeAisle}')" ${isLocked ? 'disabled style="opacity:0.4; cursor:not-allowed;" title="โครงสร้างถูกล็อกไว้"' : ''}>
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
                <td><code class="mono font-bold" style="color:var(--primary-text); background:var(--primary-light); padding:3px 8px; border-radius:6px;">${safeTable}</code></td>
                <td><span class="badge-action inbound" style="background:var(--success-light); color:var(--success-text); border:1px solid var(--success-border);"><i class="fa-solid fa-circle-dot"></i> ${safeStatus}</span></td>
                <td style="font-size:0.84rem; color:var(--text-sub);">${safeDesc}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// =========================================================================
// --- QUICK ADD USER ACCOUNT MODAL (BUILT-IN FALLBACK FOR ADMIN)         ---
// =========================================================================

function openQuickAddUserModal() {
    let modal = document.getElementById('wmsQuickAddUserModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'wmsQuickAddUserModal';
    modal.className = 'wms-elevated-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.72);
        display: flex; align-items: center; justify-content: center;
        z-index: 99996; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); padding: 16px;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-surface, #ffffff); border: 1px solid var(--border-strong, #cbd5e1); border-radius: 18px; padding: 24px; max-width: 480px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.42);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border-color, #e2e8f0);">
                <h3 style="margin:0; font-size:1.08rem; font-weight:800; color:var(--text-main);">
                    <i class="fa-solid fa-user-plus" style="color:var(--primary);"></i> เพิ่มบัญชีผู้ใช้งานใหม่
                </h3>
                <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('wmsQuickAddUserModal')?.remove()">
                    <i class="fa-solid fa-xmark"></i> ปิด
                </button>
            </div>
            <div class="form-group">
                <label>Username (สำหรับเข้าสู่ระบบ) *</label>
                <input type="text" id="quickNewUserUsername" class="form-control mono" placeholder="เช่น staff01">
            </div>
            <div class="form-group">
                <label>รหัสผ่าน (Password) *</label>
                <input type="password" id="quickNewUserPassword" class="form-control" placeholder="กำหนดรหัสผ่านอย่างน้อย 4 ตัวอักษร">
            </div>
            <div class="form-group">
                <label>ชื่อ-นามสกุล *</label>
                <input type="text" id="quickNewUserFullName" class="form-control" placeholder="เช่น สมชาย ใจดี">
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="form-group">
                    <label>แผนก (Department)</label>
                    <input type="text" id="quickNewUserDept" class="form-control" value="คลังสินค้า" placeholder="เช่น คลังสินค้า / IT">
                </div>
                <div class="form-group">
                    <label>ระดับสิทธิ์ (Role)</label>
                    <select id="quickNewUserRole" class="form-select font-bold">
                        <option value="user" selected>👤 user (ปฏิบัติการ)</option>
                        <option value="manager">🛡️ manager (หัวหน้างาน)</option>
                        <option value="viewer">👁️ viewer (ดูข้อมูลเท่านั้น)</option>
                        <option value="admin">👑 admin (ผู้ดูแลระบบสูงสุด)</option>
                    </select>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid var(--border-color);">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('wmsQuickAddUserModal')?.remove()">ยกเลิก</button>
                <button type="button" class="btn btn-primary" onclick="submitQuickAddUserForm()">
                    <i class="fa-solid fa-check"></i> บันทึกสร้างบัญชี
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('quickNewUserUsername')?.focus(), 50);
}

async function submitQuickAddUserForm() {
    const username = (document.getElementById('quickNewUserUsername')?.value || '').trim();
    const password = (document.getElementById('quickNewUserPassword')?.value || '').trim();
    const fullName = (document.getElementById('quickNewUserFullName')?.value || '').trim();
    const dept = (document.getElementById('quickNewUserDept')?.value || 'คลังสินค้า').trim();
    const role = (document.getElementById('quickNewUserRole')?.value || 'user').trim();

    if (!username || !password || !fullName) {
        alert("⚠️ กรุณากรอก Username, รหัสผ่าน และชื่อ-นามสกุล ให้ครบถ้วน");
        return;
    }

    const usersList = typeof systemUsers !== 'undefined' ? systemUsers : (window.systemUsers || []);
    if (usersList.some(u => String(u.username || '').trim().toLowerCase() === username.toLowerCase())) {
        alert(`⚠️ Username "${username}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`);
        return;
    }

    const newRecord = {
        id: 'usr-' + Date.now(),
        username: username,
        password: password,
        name: fullName,
        full_name: fullName,
        department: dept,
        role: role,
        created_at: new Date().toISOString()
    };

    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (client && navigator.onLine) {
        try {
            const { data, error } = await client.from('profiles').insert([{
                username: username,
                password: password,
                full_name: fullName,
                department: dept,
                role: role
            }]).select().maybeSingle();

            if (!error && data) {
                newRecord.id = data.id || newRecord.id;
            }
        } catch (err) {}
    }

    if (Array.isArray(window.systemUsers)) {
        window.systemUsers.push(newRecord);
    } else if (typeof systemUsers !== 'undefined' && Array.isArray(systemUsers)) {
        systemUsers.push(newRecord);
    } else {
        window.systemUsers = [newRecord];
    }

    document.getElementById('wmsQuickAddUserModal')?.remove();
    renderUserManagementTableEnhanced();
    updateWarehouseSettingsKPIs();

    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') {
        showToast(`✅ เพิ่มบัญชีผู้ใช้ "${username}" (${role}) เรียบร้อยแล้ว`);
    }
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
        updateWarehouseSettingsKPIs();
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
    updateWarehouseSettingsKPIs();
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
        'wmsQuickAddUserModal',
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
            if (id === 'rolePermissionMatrixModal' || id === 'wmsQuickAddUserModal') el.remove();
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
        <div style="background: var(--bg-surface, #ffffff); border-radius: 16px; padding: 22px; max-width: 720px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4); border: 1px solid var(--border-color, #e2e8f0);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color, #e2e8f0);">
                <h3 style="margin: 0; font-size: 1.08rem; font-weight: 700; color: var(--text-main, #0f172a);">
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
                            <th style="text-align: center; padding: 10px; border-bottom: 1px solid var(--border-color, #e2e8f0);">ระดับสิทธิ์</th>
                            <th style="text-align: left; padding: 10px; border-bottom: 1px solid var(--border-color, #e2e8f0);">เมนูที่เข้าถึงได้</th>
                            <th style="text-align: left; padding: 10px; border-bottom: 1px solid var(--border-color, #e2e8f0);">ไฟล์ระบบที่รับรอง</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="text-align: center; padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9);"><strong>👑 admin</strong></td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9);">เข้าถึงได้ทุกเมนูในระบบ 100% รวมถึงตั้งค่าคลังและจัดการผู้ใช้</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9); font-size: 0.78rem; color: var(--primary-text, #1d4ed8);">ทุกไฟล์ (9 โมดูลหลัก)</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9);"><strong>🛡️ manager</strong></td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9);">เช็คสต็อก, รับเข้า, จ่ายออก, ผังคลัง, ศูนย์อนุมัติ, ดูประวัติ</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9); font-size: 0.78rem; color: var(--success-text, #0f766e);">inv-db, inbound-db, outbound-db, locations-db, approvals-db, activities-db</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9);"><strong>👤 user</strong></td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9);">เช็คสต็อก, รับสินค้าเข้า, จ่ายสินค้าออก, ผังตำแหน่งคลัง</td>
                            <td style="padding: 10px; border-bottom: 1px solid var(--border-color, #f1f5f9); font-size: 0.78rem; color: var(--primary-text, #0369a1);">inv-db, inbound-db, outbound-db, locations-db</td>
                        </tr>
                        <tr>
                            <td style="text-align: center; padding: 10px;"><strong>👁️ viewer</strong></td>
                            <td style="padding: 10px;">เช็คสต็อกสินค้า และดูผังตำแหน่งคลังสินค้าเท่านั้น</td>
                            <td style="padding: 10px; font-size: 0.78rem; color: var(--text-muted, #475569);">inv-db, locations-db</td>
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
    updateWarehouseSettingsKPIs();
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
                    <button type="button" class="btn btn-sm btn-secondary" onclick="typeof openEditUserModal === 'function' ? openEditUserModal('${safeId}') : alert('กำลังโหลดโมดูลแก้ไขบัญชีผู้ใช้')" title="แก้ไขข้อมูลบัญชี" style="width:100%; justify-content:center; padding:4px 8px; border-radius:7px; font-weight:600; white-space:nowrap; touch-action:manipulation;">
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

window.bootstrapWarehouseSettingsView = bootstrapWarehouseSettingsView;
window.switchSettingsSectionTab = switchSettingsSectionTab;
window.updateWarehouseSettingsKPIs = updateWarehouseSettingsKPIs;
window.updateNewAislePreviewCalc = updateNewAislePreviewCalc;
window.syncAllWarehouseSettingsNow = syncAllWarehouseSettingsNow;
window.testDatabaseConnectionLive = testDatabaseConnectionLive;
window.exportWarehouseConfigsJSON = exportWarehouseConfigsJSON;
window.triggerImportWarehouseConfigs = triggerImportWarehouseConfigs;
window.handleImportWarehouseConfigsFile = handleImportWarehouseConfigsFile;
window.resetDefaultWarehouseAisles = resetDefaultWarehouseAisles;
window.openQuickAddUserModal = openQuickAddUserModal;
window.submitQuickAddUserForm = submitQuickAddUserForm;

window.saveAllWarehouseConfigsToDB = saveAllWarehouseConfigsToDB;
window.loadWarehouseConfigsFromDB = loadWarehouseConfigsFromDB;
window.moveAisleOrder = moveAisleOrder;
window.toggleAisleLock = toggleAisleLock;
window.addNewAisleConfig = addNewAisleConfig;
window.verifyAndDeleteAisle = verifyAndDeleteAisle;
window.updateAisleParam = updateAisleParam;
window.setAisleSettingsCategoryFilter = setAisleSettingsCategoryFilter;
window.onAisleSettingsSearchInput = onAisleSettingsSearchInput;
window.renderAisleSettingsTable = renderAisleSettingsTable;
window.renderMenuDatabaseMappingTable = renderMenuDatabaseMappingTable;

// เชื่อมเข้ากับฟังก์ชันสลับหน้าหลักของระบบ (switchView / executeSwitchView) เพื่อให้เปิดหน้าตั้งค่าได้ทันทีทุกครั้ง
function hookWarehouseSettingsIntoRouter() {
    ['switchView', 'executeSwitchView'].forEach(fnName => {
        const origFn = window[fnName];
        if (typeof origFn === 'function' && !origFn.__wmsSettingsWrapped) {
            const wrapped = function(targetView, ...rest) {
                const targetStr = String(targetView || '').toLowerCase();
                if (targetStr.includes('settings')) {
                    bootstrapWarehouseSettingsView(false);
                }
                const result = origFn.apply(this, [targetView, ...rest]);
                if (targetStr.includes('settings')) {
                    const vs = document.getElementById('view-settings');
                    if (vs) {
                        vs.classList.add('active');
                        vs.style.display = 'flex';
                        vs.style.flexDirection = 'column';
                    }
                    renderAisleSettingsTable();
                    renderMenuDatabaseMappingTable();
                    scheduleUserTableRender();
                    updateWarehouseSettingsKPIs();
                }
                return result;
            };
            wrapped.__wmsSettingsWrapped = true;
            window[fnName] = wrapped;
        }
    });
}

// ตรวจจับการเปิดหน้า #view-settings และ #settings-db อัตโนมัติ (แก้ปัญหาหน้าขาวเมื่อเข้าเว็บครั้งแรก 100%)
function initWarehouseSettingsActivationWatcher() {
    const refreshSettingsViewAll = () => {
        hookWarehouseSettingsIntoRouter();
        bootstrapWarehouseSettingsView(false);
        renderAisleSettingsTable();
        renderMenuDatabaseMappingTable();
        scheduleUserTableRender();
        updateWarehouseSettingsKPIs();
    };

    window.addEventListener('hashchange', () => {
        if (isWarehouseSettingsViewCurrentlyActive()) {
            refreshSettingsViewAll();
        }
    });

    window.addEventListener('popstate', () => {
        if (isWarehouseSettingsViewCurrentlyActive()) {
            refreshSettingsViewAll();
        }
    });

    window.addEventListener('online', () => {
        updateWarehouseSettingsKPIs();
        loadWarehouseConfigsFromDB(0);
    });

    window.addEventListener('offline', () => {
        updateWarehouseSettingsKPIs();
    });

    document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest
            ? e.target.closest('[data-view*="settings"], [data-target*="settings"], [href*="settings"], [onclick*="settings"]')
            : null;
        if (btn) {
            refreshSettingsViewAll();
            setTimeout(refreshSettingsViewAll, 20);
            setTimeout(refreshSettingsViewAll, 120);
        }
    });

    // ติดตามการเปลี่ยนแปลงใน DOM ทั้งหมด หาก #view-settings ถูกสร้าง/เปลี่ยนคลาส หรือเมนูตั้งค่าถูกเลือก
    if (typeof MutationObserver !== 'undefined' && document.body) {
        const bodyObs = new MutationObserver(() => {
            hookWarehouseSettingsIntoRouter();
            if (isWarehouseSettingsViewCurrentlyActive()) {
                const viewSettingsEl = document.getElementById('view-settings');
                if (!viewSettingsEl || !document.getElementById('aisleSettingsTableBody') || viewSettingsEl.style.display === 'none' || !viewSettingsEl.classList.contains('active')) {
                    bootstrapWarehouseSettingsView(false);
                    renderAisleSettingsTable();
                    renderMenuDatabaseMappingTable();
                    scheduleUserTableRender();
                    updateWarehouseSettingsKPIs();
                }
            }
        });
        bodyObs.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }
}

// เฝ้าซิงก์ข้อมูลผู้ใช้และสต็อกหลังเปิดหน้าเว็บครั้งแรก (กรณี auth-db / inv-db โหลดเสร็จตามหลัง settings-db.js)
function startWarehouseSettingsDataSyncWatcher() {
    let checks = 0;
    let lastUsersLen = -1;
    let lastInvLen = -1;

    const timer = setInterval(() => {
        checks++;
        const usersList = typeof systemUsers !== 'undefined' ? systemUsers : (window.systemUsers || []);
        const invList = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
            ? globalInventoryData
            : (Array.isArray(window.globalInventoryData) ? window.globalInventoryData : []);

        if (usersList.length !== lastUsersLen || invList.length !== lastInvLen) {
            lastUsersLen = usersList.length;
            lastInvLen = invList.length;
            if (document.getElementById('view-settings')) {
                renderAisleSettingsTable();
                scheduleUserTableRender();
                updateWarehouseSettingsKPIs();
            }
        }

        if (isWarehouseSettingsViewCurrentlyActive()) {
            bootstrapWarehouseSettingsView(false);
        }

        if (checks >= 25) {
            clearInterval(timer);
        }
    }, 400);
}

// ฟังก์ชันเริ่มต้นโมดูลตั้งค่าพิกัดคลังสินค้าอย่างปลอดภัย (รองรับทั้งก่อนและหลัง DOMContentLoaded)
function initWarehouseSettingsModuleSafe() {
    if (!document.body) return;

    window.renderUserManagementTable = scheduleUserTableRender;
    hookWarehouseSettingsIntoRouter();
    ensureDefaultWarehouseAislesPopulated();
    bootstrapWarehouseSettingsView(false);
    renderAisleSettingsTable();
    renderMenuDatabaseMappingTable();
    scheduleUserTableRender();
    updateWarehouseSettingsKPIs();

    if (!isWarehouseSettingsModuleInitialized) {
        isWarehouseSettingsModuleInitialized = true;
        loadWarehouseConfigsFromDB();
        initWarehouseSettingsRealtime();
        initWarehouseSettingsActivationWatcher();
        startWarehouseSettingsDataSyncWatcher();

        // ตรวจสอบซ้ำหลัง Router หลักของหน้าเว็บทำงานเสร็จในรอบแรก (ป้องกันหน้าว่างเปล่าเมื่อเข้า #settings-db ครั้งแรก)
        [50, 180, 450, 900].forEach(delay => {
            setTimeout(() => {
                hookWarehouseSettingsIntoRouter();
                if (isWarehouseSettingsViewCurrentlyActive()) {
                    bootstrapWarehouseSettingsView(false);
                    renderAisleSettingsTable();
                    renderMenuDatabaseMappingTable();
                    scheduleUserTableRender();
                    updateWarehouseSettingsKPIs();
                }
            }, delay);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWarehouseSettingsModuleSafe);
} else {
    initWarehouseSettingsModuleSafe();
}
window.addEventListener('load', initWarehouseSettingsModuleSafe);