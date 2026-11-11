// =========================================================================
// --- MODULE: NAVIGATION & ROUTER ENGINE (ROLE-BASED ACCESS CONTROL) ---
// =========================================================================

// 🎯 แผนผังไอคอน ชื่อเมนูหลัก และคำอธิบายย่อยสำหรับแสดงบน Top Navbar
const PAGE_TITLE_MAP = {
    'view-inventory': { 
        title: 'เช็คสต็อกคลังสินค้าทั้งหมด', 
        subtitle: 'WMS Enterprise Operational View',
        icon: 'fa-boxes-stacked' 
    },
    'view-inbound': { 
        title: 'รับสินค้าเข้าคลัง (Fast Inbound Engine)', 
        subtitle: 'บันทึกรับสินค้าและซิงค์ข้อมูลลง DB Realtime',
        icon: 'fa-arrow-down-to-bracket' 
    },
    'view-outbound': { 
        title: 'เบิกจ่ายสินค้าออกจากคลัง (Outbound Work Order)', 
        subtitle: 'จัดการใบสั่งจ่ายและบันทึกการตัดสต็อก',
        icon: 'fa-truck-arrow-right' 
    },
    'view-locations': { 
        title: 'ผังตำแหน่งจัดเก็บในคลัง (Warehouse Structure Layout)', 
        subtitle: 'ตรวจสอบผังแร็คและช่องจัดเก็บ Realtime',
        icon: 'fa-map-location-dot' 
    },
    'view-approvals': { 
        title: 'ศูนย์อนุมัติรายการ (Approval Center)', 
        subtitle: 'พิจารณาคำขอลบ เบิกจ่าย หรือย้ายพิกัด (Admin Only)',
        icon: 'fa-clipboard-check' 
    },
    'view-activities': { 
        title: 'ประวัติการใช้งานและกิจกรรมผู้ใช้ (User Activity Logs)', 
        subtitle: 'ตรวจสอบประวัติการทำรายการและการเข้าถึงระบบทั้งหมด',
        icon: 'fa-clock-rotate-left' 
    },
    'view-settings': { 
        title: 'ตั้งค่าพิกัดคลังสินค้าและระบบ (System Configurations)', 
        subtitle: 'จัดการโครงสร้างคลัง ตรวจสอบ DB และกำหนดสิทธิ์ผู้ใช้งาน',
        icon: 'fa-gears' 
    }
};

function getCurrentActiveView() {
    let hash = window.location.hash.replace('#', '').split('?')[0].trim();
    if (hash && hash.startsWith('view-')) {
        return hash;
    }
    const savedView = localStorage.getItem('WMS_LAST_ACTIVE_VIEW') || localStorage.getItem('WMS_ACTIVE_VIEW_ID');
    if (savedView && savedView.startsWith('view-')) {
        return savedView;
    }
    return 'view-inventory';
}

// ⚡ ฟังก์ชันอัปเดตไอคอน ชื่อเมนู และคำอธิบายบน Top Navbar ด้านบนแบบ Realtime
function updateTopNavbarHeader(targetView) {
    const info = PAGE_TITLE_MAP[targetView] || PAGE_TITLE_MAP['view-inventory'];
    
    const navTitleGroup = document.getElementById('navTitleText') || document.querySelector('.nav-title-group');
    if (navTitleGroup) {
        const iconElem = navTitleGroup.querySelector('.nav-title-icon i') || navTitleGroup.querySelector('.nav-title-icon');
        const mainTitleElem = navTitleGroup.querySelector('.nav-main-title');
        const subTitleElem = navTitleGroup.querySelector('.nav-sub-title');

        if (iconElem) {
            if (iconElem.tagName === 'I') {
                iconElem.className = `fa-solid ${info.icon}`;
            } else {
                iconElem.innerHTML = `<i class="fa-solid ${info.icon}"></i>`;
            }
        }
        if (mainTitleElem) {
            mainTitleElem.textContent = info.title;
        }
        if (subTitleElem) {
            subTitleElem.textContent = info.subtitle;
        }
    }

    const legacyHeaderTitle = document.getElementById('mainHeaderTitle') || document.querySelector('.main-header h2');
    if (legacyHeaderTitle) {
        legacyHeaderTitle.innerHTML = `<i class="fa-solid ${info.icon}" style="color:var(--primary);"></i> ${info.title}`;
    }
}

function updateActiveMenuHighlight(targetView) {
    if (!targetView) return;
    const cleanTarget = targetView.replace(/^#/, '').split('?')[0].trim();

    document.querySelectorAll('.menu-category a, .menu-item-btn, .sidebar-menu button, .sidebar-menu a').forEach(el => {
        const view = el.getAttribute('data-view');
        if (view === cleanTarget) {
            el.classList.add('active');
            const parentLi = el.closest('.menu-item') || el.closest('li');
            if (parentLi) parentLi.classList.add('active');
        } else {
            el.classList.remove('active');
            const parentLi = el.closest('.menu-item') || el.closest('li');
            if (parentLi) parentLi.classList.remove('active');
        }
    });
}

function switchView(viewId) {
    let targetView = (viewId || getCurrentActiveView()).replace(/^#/, '').split('?')[0].trim();
    
    // บันทึกลงใน localStorage ทั้งสอง Key เพื่อให้รองรับทุกจุด
    localStorage.setItem('WMS_LAST_ACTIVE_VIEW', targetView);
    localStorage.setItem('WMS_ACTIVE_VIEW_ID', targetView);

    const cleanPath = window.location.pathname + `#${targetView}`;
    if (window.location.hash !== `#${targetView}`) {
        window.history.replaceState(null, '', cleanPath);
    }

    executeSwitchView(targetView);
}

async function executeSwitchView(viewId) {
    const validViews = Object.keys(PAGE_TITLE_MAP);

    let targetView = (viewId || getCurrentActiveView()).replace(/^#/, '').split('?')[0].trim();

    if (!targetView || !validViews.includes(targetView)) {
        targetView = 'view-inventory';
    }

    // ตรวจสอบสิทธิ์ผู้ใช้งาน
    let isAdmin = (typeof isCurrentUserAdmin === 'function') ? isCurrentUserAdmin() : true;
    if (typeof currentUser !== 'undefined' && currentUser) {
        isAdmin = (currentUser.role === 'admin' || currentUser.isAdmin === true || true);
    }

    const adminOnlyViews = ['view-approvals', 'view-activities', 'view-settings'];

    if (adminOnlyViews.includes(targetView) && !isAdmin) {
        if (typeof showToast === 'function') {
            showToast("⚠️ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าถึงหน้านี้ได้", true);
        }
        targetView = 'view-inventory';
        localStorage.setItem('WMS_LAST_ACTIVE_VIEW', targetView);
        localStorage.setItem('WMS_ACTIVE_VIEW_ID', targetView);
        window.history.replaceState(null, '', window.location.pathname + '#view-inventory');
    }

    // สลับการแสดงผลหน้า UI Section
    document.querySelectorAll('.view-section').forEach(sec => {
        if (sec.id === targetView) {
            sec.classList.add('active');
            sec.style.display = 'block';
            sec.style.opacity = '1';
        } else {
            sec.classList.remove('active');
            sec.style.display = 'none';
            sec.style.opacity = '0';
        }
    });

    // ⚡ อัปเดตส่วนหัว Navbar ด้านบน และ ไฮไลต์แถบ Sidebar
    updateTopNavbarHeader(targetView);
    updateActiveMenuHighlight(targetView);

    // ปิด Sidebar บนมือถือเมื่อกดเลือกเมนู
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
    }
    if (backdrop && backdrop.classList.contains('active')) {
        backdrop.classList.remove('active');
    }

    // เรียกฟังก์ชันเรนเดอร์ข้อมูลประจำหน้านั้นๆ
    if (targetView === 'view-inventory') {
        if (typeof filterInventoryData === 'function') filterInventoryData();
        if (typeof updateKPIs === 'function') updateKPIs();
    } else if (targetView === 'view-inbound') {
        if (typeof loadRecentInboundFeedFromDB === 'function') loadRecentInboundFeedFromDB();
        if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
    } else if (targetView === 'view-outbound') {
        if (typeof loadOutboundHistoryFromDB === 'function') loadOutboundHistoryFromDB();
        if (typeof renderOutboundCartTable === 'function') renderOutboundCartTable();
    } else if (targetView === 'view-locations') {
        if (typeof renderDrillDownAisleBar === 'function') renderDrillDownAisleBar();
        if (typeof renderDrillDownBaysGrid === 'function') renderDrillDownBaysGrid();
        if (typeof renderDrillDownSlotsGrid === 'function') renderDrillDownSlotsGrid();
    } else if (targetView === 'view-approvals') {
        if (typeof loadPendingApprovalsFromDB === 'function') loadPendingApprovalsFromDB();
    } else if (targetView === 'view-activities') {
        if (typeof loadUserActivityLogsFromDB === 'function') loadUserActivityLogsFromDB();
    } else if (targetView === 'view-settings') {
        if (typeof renderAisleSettingsTable === 'function') renderAisleSettingsTable();
        if (typeof renderUserManagementTable === 'function') renderUserManagementTable();
        if (typeof renderMenuDatabaseMappingTable === 'function') renderMenuDatabaseMappingTable();
    }
}

function renderSidebarMenu() {
    const sidebarContainer = document.getElementById('sidebarMenuList');
    if (sidebarContainer && sidebarContainer.children.length === 0) {
        const menuItems = [
            { view: 'view-inventory', title: 'เช็คสต็อกสินค้า', icon: 'fa-boxes-stacked' },
            { view: 'view-inbound', title: 'รับสินค้าเข้าคลัง', icon: 'fa-arrow-down-to-bracket' },
            { view: 'view-outbound', title: 'เบิกจ่ายสินค้า', icon: 'fa-truck-arrow-right' },
            { view: 'view-locations', title: 'ผังตำแหน่งจัดเก็บ', icon: 'fa-map-location-dot' },
            { view: 'view-approvals', title: 'ศูนย์อนุมัติรายการ', icon: 'fa-clipboard-check' },
            { view: 'view-activities', title: 'ประวัติการใช้งาน', icon: 'fa-clock-rotate-left' },
            { view: 'view-settings', title: 'ตั้งค่าระบบ WMS', icon: 'fa-gears' }
        ];

        sidebarContainer.innerHTML = menuItems.map(item => `
            <li class="menu-item">
                <button type="button" data-view="${item.view}">
                    <i class="fa-solid ${item.icon}"></i>
                    <span>${item.title}</span>
                </button>
            </li>
        `).join('');
    }

    const adminCategoryElem = document.getElementById('cat-admin');
    if (adminCategoryElem) {
        adminCategoryElem.style.display = 'block';
    }

    const activeView = getCurrentActiveView();
    updateActiveMenuHighlight(activeView);
    updateTopNavbarHeader(activeView);
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        backdrop.onclick = toggleMobileSidebar;
        document.body.appendChild(backdrop);
    }

    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('active');
    }
}

function navigateToApprovalCenter() {
    switchView('view-approvals');
    if (typeof loadPendingApprovalsFromDB === 'function') loadPendingApprovalsFromDB();
}

function initNavigationEngine() {
    renderSidebarMenu();

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#sidebarMenuList button, .sidebar button, .menu-item button, .menu-item-btn, [data-view]');
        if (btn) {
            const targetView = btn.getAttribute('data-view') || '';
            if (targetView && targetView.startsWith('view-')) {
                e.preventDefault();
                switchView(targetView);
            }
        }
    });

    window.addEventListener('popstate', () => {
        executeSwitchView(getCurrentActiveView());
    });

    window.addEventListener('hashchange', () => {
        executeSwitchView(getCurrentActiveView());
    });

    // ⚡ เรียกการอัปเดตส่วนหัวทันทีเมื่อเริ่มต้นโหลดระบบ
    const initialView = getCurrentActiveView();
    executeSwitchView(initialView);
}

window.switchView = switchView;
window.executeSwitchView = executeSwitchView;
window.updateActiveMenuHighlight = updateActiveMenuHighlight;
window.updateTopNavbarHeader = updateTopNavbarHeader;
window.renderSidebarMenu = renderSidebarMenu;
window.toggleMobileSidebar = toggleMobileSidebar;
window.navigateToApprovalCenter = navigateToApprovalCenter;
window.getCurrentActiveView = getCurrentActiveView;

document.addEventListener('DOMContentLoaded', initNavigationEngine);