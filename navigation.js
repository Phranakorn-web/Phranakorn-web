// =========================================================================
// --- MODULE: NAVIGATION & ROUTER ENGINE (ROLE-BASED ACCESS CONTROL) ---
// =========================================================================

/**
 * 🎯 แผนผังไอคอน ชื่อเมนูหลัก คำอธิบายย่อย ชื่อไฟล์ และ Category ID
 * สำหรับแสดงบน Top Navbar, URL Bar, Title Bar และซิงค์กับ Sidebar V2.5 Style
 */
const PAGE_TITLE_MAP = {
    'view-dashboard': { 
        title: 'แดชบอร์ดหน้าแรก & ภาพรวมคลังสินค้า', 
        subtitle: 'WMS Enterprise Executive Dashboard & Seasonal Theme',
        icon: 'fa-house-laptop',
        catId: 'cat-warehouse',
        linkId: 'm-dashboard-link',
        fileName: 'dashboard-db.js'
    },
    'view-inventory': { 
        title: 'เช็คสต็อกคลังสินค้าทั้งหมด', 
        subtitle: 'WMS Enterprise Operational View',
        icon: 'fa-boxes-stacked',
        catId: 'cat-warehouse',
        linkId: 'm-inventory-link',
        fileName: 'inventory.php'
    },
    'view-inbound': { 
        title: 'รับสินค้าเข้าคลัง (Fast Inbound Engine)', 
        subtitle: 'บันทึกรับสินค้าและซิงค์ข้อมูลลง DB Realtime',
        icon: 'fa-arrow-down-to-bracket',
        catId: 'cat-warehouse',
        linkId: 'm-inbound-link',
        fileName: 'inbound.php'
    },
    'view-outbound': { 
        title: 'เบิกจ่ายสินค้าออกจากคลัง (Outbound Work Order)', 
        subtitle: 'จัดการใบสั่งจ่ายและบันทึกการตัดสต็อก',
        icon: 'fa-truck-arrow-right',
        catId: 'cat-warehouse',
        linkId: 'm-outbound-link',
        fileName: 'outbound.php'
    },
    'view-locations': { 
        title: 'ผังตำแหน่งจัดเก็บในคลัง (Warehouse Structure Layout)', 
        subtitle: 'ตรวจสอบผังแร็คและช่องจัดเก็บ Realtime',
        icon: 'fa-map-location-dot',
        catId: 'cat-warehouse',
        linkId: 'm-locations-link',
        fileName: 'locations.php'
    },
    'view-approvals': { 
        title: 'ศูนย์อนุมัติรายการ (Approval Center)', 
        subtitle: 'พิจารณาคำขอลบ เบิกจ่าย หรือย้ายพิกัด (Admin Only)',
        icon: 'fa-clipboard-check',
        catId: 'cat-warehouse',
        linkId: 'm-approvals-link',
        fileName: 'approvals.php'
    },
    'view-activities': { 
        title: 'ประวัติการใช้งานและกิจกรรมผู้ใช้ (User Activity Logs)', 
        subtitle: 'ตรวจสอบประวัติการทำรายการและการเข้าถึงระบบทั้งหมด',
        icon: 'fa-clock-rotate-left',
        catId: 'cat-other',
        linkId: 'm-activities-link',
        fileName: 'activities.php'
    },
    'view-settings': { 
        title: 'ตั้งค่าพิกัดคลังสินค้าและระบบ (System Configurations)', 
        subtitle: 'จัดการโครงสร้างคลัง ตรวจสอบ DB และกำหนดสิทธิ์ผู้ใช้งาน',
        icon: 'fa-gears',
        catId: 'cat-other',
        linkId: 'm-settings-link',
        fileName: 'settings.php'
    }
};

// เก็บสถานะ View ล่าสุดที่ถูกเลือกไว้ในหน่วยความจำเพื่อป้องกันสคริปต์อื่นเขียนทับ
let CURRENT_LOCKED_VIEW = null;

/**
 * ตรวจสอบว่าผู้ใช้อยู่บนหน้าล็อกอินหรือยังไม่ผ่านการยืนยันตัวตนหรือไม่
 * (ป้องกันไม่ให้ Navigation ยิงคำสั่งโหลดข้อมูลหน้าเมนูไปกระตุ้นป๊อปอัปซิงค์ฐานข้อมูลบดบังหน้าล็อกอิน)
 */
function isNavigationAwaitingAuth() {
    try {
        if (document.documentElement) {
            if (
                document.documentElement.classList.contains('wms-login-active') ||
                document.documentElement.classList.contains('wms-unverified-session')
            ) {
                return true;
            }
        }
        if (document.body) {
            if (
                document.body.classList.contains('wms-login-active') ||
                document.body.classList.contains('wms-unverified-session')
            ) {
                return true;
            }
        }
        if (sessionStorage.getItem('WMS_FORCE_RELOGIN_REQUIRED') === 'true') {
            return true;
        }
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            const computed = window.getComputedStyle(loginOverlay);
            if (computed.display !== 'none' && computed.visibility !== 'hidden' && computed.opacity !== '0') {
                return true;
            }
        }
        const newTabModal = document.getElementById('newTabSessionModal');
        if (newTabModal && newTabModal.style.display !== 'none') {
            return true;
        }
        const isTabVerified = sessionStorage.getItem('WMS_TAB_SESSION_VERIFIED') === 'true';
        if (!window.currentUser && !isTabVerified) {
            return true;
        }
    } catch (e) {}
    return false;
}

/**
 * ตรวจสอบว่าเป็นการกดรีเฟรชหน้าเว็บ (Reload) หรือไม่
 */
function isNavigationPageReload() {
    try {
        if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
            const entries = performance.getEntriesByType('navigation');
            if (entries && entries.length > 0 && entries[0].type === 'reload') {
                return true;
            }
        }
        if (typeof performance !== 'undefined' && performance.navigation && performance.navigation.type === 1) {
            return true;
        }
    } catch (e) {}
    return false;
}

/**
 * แปลงชื่อไฟล์ Slug หรือ View ID ให้อยู่ในรูปแบบมาตรฐานของ PAGE_TITLE_MAP
 */
function normalizeNavigationViewKey(rawVal) {
    if (!rawVal || typeof rawVal !== 'string') return null;
    const cleaned = rawVal.replace(/^#/, '').split('?')[0].trim().toLowerCase();
    if (!cleaned || cleaned === 'view-login' || cleaned === 'auth-system' || cleaned === 'auth-system.js') {
        return null;
    }

    if (Object.prototype.hasOwnProperty.call(PAGE_TITLE_MAP, cleaned)) {
        return cleaned;
    }

    const foundByFile = Object.keys(PAGE_TITLE_MAP).find(
        key => (PAGE_TITLE_MAP[key].fileName || '').toLowerCase() === cleaned
    );
    if (foundByFile) return foundByFile;

    const shortSlugMap = {
        'dashboard-db': 'view-dashboard',
        'inv-db': 'view-inventory',
        'inv-db.js': 'view-inventory',
        'inbound-db': 'view-inbound',
        'inbound-db.js': 'view-inbound',
        'outbound-db': 'view-outbound',
        'outbound-db.js': 'view-outbound',
        'locations-db': 'view-locations',
        'locations-db.js': 'view-locations',
        'approvals-db': 'view-approvals',
        'approvals-db.js': 'view-approvals',
        'activities-db': 'view-activities',
        'activities-db.js': 'view-activities',
        'settings-db': 'view-settings',
        'settings-db.js': 'view-settings'
    };

    return shortSlugMap[cleaned] || null;
}

/**
 * บันทึกสถานะหน้าเมนูปัจจุบันลงใน Session และ LocalStorage เพื่อให้คงหน้าเดิมเมื่อกดรีเฟรช
 */
function saveNavigationActiveState(targetView) {
    if (!targetView || targetView === 'view-login') return;
    try {
        sessionStorage.setItem('WMS_SESSION_STARTED', '1');
        sessionStorage.setItem('WMS_SESSION_ACTIVE_VIEW', targetView);
        localStorage.setItem('WMS_LAST_ACTIVE_VIEW', targetView);
        localStorage.setItem('WMS_ACTIVE_VIEW_ID', targetView);
    } catch (e) {
        console.warn('[WMS Navigation] Unable to save to storage:', e);
    }
}

/**
 * แปลงชื่อไฟล์หรือ Hash กลับเป็น View ID ที่ถูกต้อง:
 * - เข้าเว็บไซต์ครั้งแรก (Session ใหม่ และไม่มีพารามิเตอร์หน้าอื่นใน URL) -> แสดงหน้าแดชบอร์ดหน้าแรก (view-dashboard) เป็นหลัก
 * - กดรีเฟรช (Reload) หรือใช้งานเมนูอื่น ๆ -> คงอยู่หน้าเมนูเดิมตามโครงสร้างเดิม
 */
function resolveViewFromUrlOrStorage() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const pageParam = (urlParams.get('page') || urlParams.get('file') || '').trim().toLowerCase();
        const rawHash = (window.location.hash || '').replace(/^#/, '').split('?')[0].trim().toLowerCase();
        const pathFile = window.location.pathname.split('/').pop().toLowerCase();

        // 1. ตรวจสอบจาก Hash ก่อน (รองรับทั้ง #view-inbound, #inbound.php และ #dashboard-db.js)
        const matchedHashView = normalizeNavigationViewKey(rawHash);
        if (matchedHashView) {
            saveNavigationActiveState(matchedHashView);
            return matchedHashView;
        }

        // 2. ตรวจสอบจาก Query Parameter (?page=inbound.php หรือ ?page=dashboard-db.js)
        const matchedQueryView = normalizeNavigationViewKey(pageParam);
        if (matchedQueryView) {
            saveNavigationActiveState(matchedQueryView);
            return matchedQueryView;
        }

        // 3. ตรวจสอบจากชื่อไฟล์ท้าย Path (กรณีเปิดผ่าน Virtual Route)
        const matchedPathView = normalizeNavigationViewKey(pathFile);
        if (matchedPathView) {
            saveNavigationActiveState(matchedPathView);
            return matchedPathView;
        }

        // 4. แยกแยะระหว่าง "เข้าเว็บไซต์ครั้งแรก" กับ "กดรีเฟรช / ใช้งานอยู่ในเมนูอื่น"
        const isReload = isNavigationPageReload();
        const sessionStarted = sessionStorage.getItem('WMS_SESSION_STARTED') === '1';

        if (!sessionStarted && !isReload) {
            saveNavigationActiveState('view-dashboard');
            return 'view-dashboard';
        }

        sessionStorage.setItem('WMS_SESSION_STARTED', '1');

        // 5. ตรวจสอบจาก SessionStorage ของแท็บปัจจุบัน (กรณีรีเฟรชหน้าเดิม)
        const sessionSavedView = normalizeNavigationViewKey(sessionStorage.getItem('WMS_SESSION_ACTIVE_VIEW'));
        if (sessionSavedView) {
            return sessionSavedView;
        }

        // 6. ตรวจสอบจาก LocalStorage (กรณีรีเฟรชหรือเปิดต่อจากสถานะล่าสุด)
        const savedView = normalizeNavigationViewKey(
            localStorage.getItem('WMS_LAST_ACTIVE_VIEW') || localStorage.getItem('WMS_ACTIVE_VIEW_ID')
        );
        if (savedView) {
            sessionStorage.setItem('WMS_SESSION_ACTIVE_VIEW', savedView);
            return savedView;
        }
    } catch (e) {
        console.warn('[WMS Navigation] Error resolving active view:', e);
    }
    return 'view-dashboard';
}

function getCurrentActiveView() {
    return resolveViewFromUrlOrStorage();
}

/**
 * 🔗 อัปเดตแถบ URL ของเบราว์เซอร์ให้แสดงชื่อไฟล์ของเมนูนั้นๆ อย่างชัดเจนและปลอดภัย
 * (ใช้ Query String + Hash เพื่อไม่ให้เกิด Error 404 บนทุก Server เมื่อผู้ใช้กด Refresh)
 */
function syncBrowserUrlWithFileName(targetView) {
    if (isNavigationAwaitingAuth()) return;

    const info = PAGE_TITLE_MAP[targetView] || PAGE_TITLE_MAP['view-dashboard'] || PAGE_TITLE_MAP['view-inventory'];
    const fileName = info.fileName;

    try {
        // คงค่า Base Path เดิมไว้ (เช่น /index.html หรือ /wms/) เพื่อความปลอดภัยในการ Refresh 100%
        const basePath = window.location.pathname;
        const url = new URL(window.location.href);
        url.searchParams.set('page', fileName);
        url.hash = fileName;

        const finalUrl = `${basePath}?page=${encodeURIComponent(fileName)}#${encodeURIComponent(fileName)}`;
        if (window.location.href !== url.href) {
            window.history.replaceState({ view: targetView, file: fileName }, info.title, finalUrl);
        }

        // อัปเดต Title ของแท็บเบราว์เซอร์ให้แสดงชื่อเมนูและชื่อไฟล์
        document.title = `${info.title} [${fileName}] - WMS Enterprise`;
    } catch (e) {
        // Fallback กรณีรันผ่าน file:// protocol บนเครื่อง Local
        try {
            window.location.hash = fileName;
            document.title = `${info.title} [${fileName}] - WMS Enterprise`;
        } catch (err) {}
    }
}

/**
 * ⚡ ฟังก์ชันอัปเดตไอคอน ชื่อเมนู คำอธิบายย่อย และชื่อไฟล์อ้างอิงบน Top Navbar ด้านบนแบบ Realtime
 */
function updateTopNavbarHeader(targetView) {
    const info = PAGE_TITLE_MAP[targetView] || PAGE_TITLE_MAP['view-dashboard'] || PAGE_TITLE_MAP['view-inventory'];
    const fileName = info.fileName || `${targetView}.php`;
    
    // 1. อัปเดตส่วนหัวหลัก Top Navbar (#navTitleText)
    const navTitleGroup = document.getElementById('navTitleText') || document.querySelector('.nav-title-group');
    if (navTitleGroup) {
        const iconContainer = navTitleGroup.querySelector('.nav-title-icon');
        if (iconContainer) {
            iconContainer.innerHTML = `<i class="fa-solid ${info.icon}"></i>`;
        }

        const mainTitleElem = navTitleGroup.querySelector('.nav-main-title');
        if (mainTitleElem) {
            mainTitleElem.textContent = info.title;
        }

        let fileBadgeElem = document.getElementById('navFileNameBadge');
        if (!fileBadgeElem && mainTitleElem && mainTitleElem.parentElement) {
            fileBadgeElem = document.createElement('span');
            fileBadgeElem.id = 'navFileNameBadge';
            fileBadgeElem.className = 'file-name-badge mono';
            mainTitleElem.parentElement.appendChild(fileBadgeElem);
        }
        if (fileBadgeElem) {
            fileBadgeElem.innerHTML = `<i class="fa-regular fa-file-code" style="margin-right:4px;"></i>${escapeHtml(fileName)}`;
        }

        const subTitleElem = navTitleGroup.querySelector('.nav-sub-title');
        if (subTitleElem) {
            subTitleElem.textContent = info.subtitle;
        }
    }

    // 2. อัปเดต Header สำรอง (ถ้ามี)
    const legacyHeaderTitle = document.getElementById('mainHeaderTitle') || document.querySelector('.main-header h2');
    if (legacyHeaderTitle) {
        legacyHeaderTitle.innerHTML = `<i class="fa-solid ${info.icon}" style="color:var(--primary);"></i> ${escapeHtml(info.title)} <span class="file-name-badge mono">${escapeHtml(fileName)}</span>`;
    }

    // 3. อัปเดตแถบแสดงชื่อไฟล์ตรงกลาง Navbar (ถ้ามี)
    const navCurrentFileDisplay = document.getElementById('navCurrentFileDisplay');
    if (navCurrentFileDisplay) {
        navCurrentFileDisplay.textContent = fileName;
    }
}

/**
 * ไฮไลท์เมนูที่ใช้งานอยู่พร้อมรองรับทั้งโครงสร้างแบบดั้งเดิม และ Sidebar Style V2.5
 */
function updateActiveMenuHighlight(targetView) {
    if (!targetView) return;
    const cleanTarget = targetView.replace(/^#/, '').split('?')[0].trim();

    document.querySelectorAll('.menu-category a, .menu-item-btn, .sidebar-menu button, .sidebar-menu a, .modern-sidebar-menu ul li a').forEach(el => {
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

    if (typeof markLastUsed === 'function') {
        const info = PAGE_TITLE_MAP[cleanTarget];
        if (info && info.linkId && info.catId) {
            markLastUsed(info.linkId, info.catId);
        }
    }
}

/**
 * สลับหน้า View ปัจจุบัน บันทึกลง Session/LocalStorage และอัปเดต URL + Header ทันที
 */
function switchView(viewId) {
    let rawInput = (viewId || getCurrentActiveView()).replace(/^#/, '').split('?')[0].trim();
    if (rawInput === 'view-login') return;
    
    // รองรับกรณีส่งชื่อไฟล์เข้ามาโดยตรง เช่น switchView('inbound.php') หรือ switchView('dashboard-db.js')
    let targetView = normalizeNavigationViewKey(rawInput) || rawInput;
    if (!Object.prototype.hasOwnProperty.call(PAGE_TITLE_MAP, targetView)) {
        const foundKey = Object.keys(PAGE_TITLE_MAP).find(
            k => PAGE_TITLE_MAP[k].fileName.toLowerCase() === rawInput.toLowerCase()
        );
        targetView = foundKey || 'view-dashboard';
    }

    CURRENT_LOCKED_VIEW = targetView;
    saveNavigationActiveState(targetView);

    if (!isNavigationAwaitingAuth()) {
        syncBrowserUrlWithFileName(targetView);
    }
    executeSwitchView(targetView);
}

/**
 * ดำเนินการ สลับ View, ตรวจสอบ Admin Access Control, สลับ UI Section และเรียก Async Render
 */
async function executeSwitchView(viewId) {
    // หากอยู่หน้าล็อกอินหรือยังไม่ยืนยันตัวตน ให้พักการเรนเดอร์ข้อมูลหน้าเมนูไว้ก่อน (ป้องกันป๊อปอัปซิงค์เด้งบดบังหน้าล็อกอิน)
    if (isNavigationAwaitingAuth()) {
        if (typeof hideAllDetectedSyncPopups === 'function') {
            hideAllDetectedSyncPopups();
        } else if (typeof hideDatabaseLoadingPopup === 'function') {
            hideDatabaseLoadingPopup();
        }
        return;
    }

    const validViews = Object.keys(PAGE_TITLE_MAP);
    let rawInput = (viewId || getCurrentActiveView()).replace(/^#/, '').split('?')[0].trim();

    let targetView = normalizeNavigationViewKey(rawInput) || rawInput;
    if (!validViews.includes(targetView)) {
        const foundKey = validViews.find(
            k => PAGE_TITLE_MAP[k].fileName.toLowerCase() === rawInput.toLowerCase()
        );
        targetView = foundKey || 'view-dashboard';
    }

    // 🔒 ตรวจสอบสิทธิ์ผู้ใช้งานแบบ Strict Security
    let isAdmin = false;
    try {
        if (typeof isCurrentUserAdmin === 'function') {
            isAdmin = Boolean(isCurrentUserAdmin());
        } else if (typeof currentUser !== 'undefined' && currentUser) {
            isAdmin = (currentUser.role === 'admin' || currentUser.isAdmin === true);
        } else {
            // กรณีโหลดหน้าครั้งแรกก่อน auth-system ทำงานเสร็จ ให้เช็ค sessionStorage/localStorage สำรอง
            const savedUserStr = sessionStorage.getItem('WMS_CURRENT_USER') || localStorage.getItem('WMS_CURRENT_USER');
            if (savedUserStr) {
                const parsed = JSON.parse(savedUserStr);
                isAdmin = (parsed.role === 'admin' || parsed.isAdmin === true);
            } else {
                isAdmin = true; // ปล่อยผ่านตอน Initial Render เพื่อให้ auth-system คุมอีกชั้น
            }
        }
    } catch (e) {
        console.error('[Security Engine] Role check error:', e);
        isAdmin = false;
    }

    const adminOnlyViews = ['view-approvals', 'view-activities', 'view-settings'];

    if (adminOnlyViews.includes(targetView) && !isAdmin) {
        if (typeof showToast === 'function') {
            showToast("⚠️ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าถึงหน้านี้ได้", true);
        }
        targetView = 'view-dashboard';
    }

    CURRENT_LOCKED_VIEW = targetView;
    saveNavigationActiveState(targetView);

    // ตรวจสอบให้แน่ใจว่า Section ของหน้าแดชบอร์ดถูกติดตั้งใน DOM แล้วหากกำลังเปิดหน้าแดชบอร์ด
    if (targetView === 'view-dashboard' && typeof ensureDashboardMenuAndViewMounted === 'function') {
        ensureDashboardMenuAndViewMounted();
    }

    // ซิงค์ URL และ Header บนสุดทุกครั้งที่มีการ Execute
    syncBrowserUrlWithFileName(targetView);
    updateTopNavbarHeader(targetView);
    updateActiveMenuHighlight(targetView);

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

    // ปิด Sidebar บนมือถือเมื่อกดเลือกเมนู
    const sidebar = document.getElementById('menu') || document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-backdrop');
    if (sidebar) {
        sidebar.classList.remove('mobile-open');
        sidebar.classList.remove('active-drawer');
    }
    if (backdrop) {
        backdrop.classList.remove('active');
        backdrop.classList.remove('active-drawer');
    }

    // เริ่มจับเวลาโหลดช้า (แสดงป๊อปอัปเฉพาะหน้าเช็คสต็อกที่มีรายการเยอะ หรือเมนูที่โหลดช้า พร้อมปุ่มซ่อนหน้าต่างโหลดต่อเบื้องหลัง)
    const currentItemCount = Array.isArray(window.globalInventoryData) ? window.globalInventoryData.length : 0;
    if (typeof startSmartSlowLoadPopup === 'function') {
        startSmartSlowLoadPopup(targetView, { itemCount: currentItemCount });
    }

    // เรียกฟังก์ชันเรนเดอร์ข้อมูลประจำหน้านั้นๆ ด้วย Safety Guard
    try {
        if (targetView === 'view-dashboard') {
            if (typeof syncDashboardHeaderMetadata === 'function') syncDashboardHeaderMetadata();
            if (typeof renderWarehouseDashboard === 'function') await renderWarehouseDashboard();
        } else if (targetView === 'view-inventory') {
            // เปิดโอกาสให้หน้าจอสลับเข้าหน้าเช็คสต็อกสินค้าก่อน 1 เฟรม เพื่อให้ป๊อปอัปแสดงอย่างนุ่มนวลหากรายการเยอะ
            await new Promise(resolve => setTimeout(resolve, 16));
            if (typeof filterInventoryData === 'function') await filterInventoryData();
            if (typeof updateKPIs === 'function') await updateKPIs();
        } else if (targetView === 'view-inbound') {
            if (typeof loadRecentInboundFeedFromDB === 'function') await loadRecentInboundFeedFromDB();
            if (typeof populateAisleDropdowns === 'function') populateAisleDropdowns();
        } else if (targetView === 'view-outbound') {
            if (typeof loadOutboundHistoryFromDB === 'function') await loadOutboundHistoryFromDB();
            if (typeof renderOutboundCartTable === 'function') renderOutboundCartTable();
        } else if (targetView === 'view-locations') {
            if (typeof renderDrillDownAisleBar === 'function') renderDrillDownAisleBar();
            if (typeof renderDrillDownBaysGrid === 'function') renderDrillDownBaysGrid();
            if (typeof renderDrillDownSlotsGrid === 'function') renderDrillDownSlotsGrid();
        } else if (targetView === 'view-approvals') {
            if (typeof loadPendingApprovalsFromDB === 'function') await loadPendingApprovalsFromDB();
        } else if (targetView === 'view-activities') {
            if (typeof loadUserActivityLogsFromDB === 'function') await loadUserActivityLogsFromDB();
        } else if (targetView === 'view-settings') {
            if (typeof renderAisleSettingsTable === 'function') renderAisleSettingsTable();
            if (typeof renderUserManagementTable === 'function') renderUserManagementTable();
            if (typeof renderMenuDatabaseMappingTable === 'function') renderMenuDatabaseMappingTable();
        }
    } catch (err) {
        console.error(`[WMS View Loader] Exception while rendering view "${targetView}":`, err);
    } finally {
        if (typeof finishSmartSlowLoadPopup === 'function') {
            finishSmartSlowLoadPopup();
        }
    }
}

/**
 * สร้างรายการเมนูใน Sidebar อัตโนมัติ พร้อมแสดงชื่อไฟล์กำกับแต่ละเมนู
 */
function renderSidebarMenu() {
    const sidebarContainer = document.getElementById('sidebarMenuList');
    if (sidebarContainer) {
        const menuItems = [
            { view: 'view-dashboard', title: 'แดชบอร์ดหน้าแรก', icon: 'fa-house-laptop', id: 'm-dashboard-link', cat: 'cat-warehouse', fileName: 'dashboard-db.js' },
            { view: 'view-inventory', title: 'เช็คสต็อกสินค้า', icon: 'fa-boxes-stacked', id: 'm-inventory-link', cat: 'cat-warehouse', fileName: 'inventory.php' },
            { view: 'view-inbound', title: 'รับสินค้าเข้าคลัง', icon: 'fa-arrow-down-to-bracket', id: 'm-inbound-link', cat: 'cat-warehouse', fileName: 'inbound.php' },
            { view: 'view-outbound', title: 'เบิกจ่ายสินค้า', icon: 'fa-truck-arrow-right', id: 'm-outbound-link', cat: 'cat-warehouse', fileName: 'outbound.php' },
            { view: 'view-locations', title: 'ผังตำแหน่งจัดเก็บ', icon: 'fa-map-location-dot', id: 'm-locations-link', cat: 'cat-warehouse', fileName: 'locations.php' },
            { view: 'view-approvals', title: 'ศูนย์อนุมัติรายการ', icon: 'fa-clipboard-check', id: 'm-approvals-link', cat: 'cat-warehouse', fileName: 'approvals.php' },
            { view: 'view-activities', title: 'ประวัติการใช้งาน', icon: 'fa-clock-rotate-left', id: 'm-activities-link', cat: 'cat-other', fileName: 'activities.php' },
            { view: 'view-settings', title: 'ตั้งค่าระบบ WMS', icon: 'fa-gears', id: 'm-settings-link', cat: 'cat-other', fileName: 'settings.php' }
        ];

        sidebarContainer.innerHTML = menuItems.map(item => `
            <li class="menu-item">
                <button type="button" id="${item.id}" data-id="${item.id}" data-view="${item.view}" data-file="${item.fileName}" onclick="switchView('${item.view}')">
                    <i class="fa-solid ${item.icon}"></i>
                    <span class="menu-text">${escapeHtml(item.title)}</span>
                    <span class="menu-file-badge mono">${escapeHtml(item.fileName)}</span>
                </button>
                <button type="button" class="fav-star-btn" onclick="toggleFavorite(event, '${item.id}')" title="ติดดาวเมนูโปรด"><i class="fa-regular fa-star"></i></button>
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

/**
 * 🛡️ ตัวเฝ้าสังเกต DOM (Header Guard Observer)
 * ป้องกันไม่ให้สคริปต์ภายนอก (เช่น app-main.js หรือ auth-system.js) เขียนทับหัวข้อด้านบนกลับเป็นค่าเริ่มต้น
 */
function setupTopNavbarGuard() {
    const navTitleGroup = document.getElementById('navTitleText');
    if (!navTitleGroup || typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(() => {
        if (isNavigationAwaitingAuth()) return;
        if (!CURRENT_LOCKED_VIEW) return;
        const expectedInfo = PAGE_TITLE_MAP[CURRENT_LOCKED_VIEW];
        if (!expectedInfo) return;

        const mainTitleElem = navTitleGroup.querySelector('.nav-main-title');
        if (mainTitleElem && mainTitleElem.textContent.trim() !== expectedInfo.title) {
            updateTopNavbarHeader(CURRENT_LOCKED_VIEW);
        }
    });

    observer.observe(navTitleGroup, { childList: true, subtree: true, characterData: true });
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('menu') || document.querySelector('.sidebar');
    let backdrop = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-backdrop');
    
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sidebarOverlay';
        backdrop.className = 'sidebar-backdrop sidebar-overlay';
        backdrop.onclick = toggleMobileSidebar;
        document.body.appendChild(backdrop);
    }

    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
        sidebar.classList.toggle('active-drawer');
        backdrop.classList.toggle('active');
        backdrop.classList.toggle('active-drawer');
    }
}

function navigateToApprovalCenter() {
    switchView('view-approvals');
    if (typeof loadPendingApprovalsFromDB === 'function') loadPendingApprovalsFromDB();
}

// =========================================================================
// 🌟 FEATURE SUITE (THEME CENTER, FAVORITES, SEARCH, ACCESSIBILITY)
// =========================================================================

function changeStouTheme(themeName) {
    const menu = document.getElementById('menu') || document.querySelector('.modern-sidebar-menu') || document.querySelector('.sidebar');
    const quickIcon = document.getElementById('quickDarkIcon');
    
    if (!menu) return;

    menu.setAttribute('data-sidebar-theme', themeName);

    const isDarkTheme = ['macos-dark', 'macos-dark-glass', 'dark-stou', 'polsci-red'].includes(themeName);
    if (quickIcon) {
        quickIcon.className = isDarkTheme ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.getAttribute('data-theme') === themeName) {
            btn.classList.add('active-theme');
        } else {
            btn.classList.remove('active-theme');
        }
    });

    try {
        localStorage.setItem('stou_selected_theme', themeName);
    } catch (e) {}
}

function syncSidebarThemeWithSite(siteMode) {
    if (siteMode === 'dark') {
        changeStouTheme('macos-dark-glass');
    } else {
        changeStouTheme('macos-glass');
    }
}

function toggleQuickDarkMode() {
    const menu = document.getElementById('menu') || document.querySelector('.sidebar');
    let currentTheme = 'macos-glass';
    try {
        currentTheme = (menu && menu.getAttribute('data-sidebar-theme')) || localStorage.getItem('stou_selected_theme') || 'macos-glass';
    } catch (e) {}

    if (['macos-dark', 'macos-dark-glass', 'dark-stou', 'polsci-red'].includes(currentTheme)) {
        changeStouTheme('macos-glass');
    } else {
        changeStouTheme('macos-dark-glass');
    }
}

function markLastUsed(linkId, catId) {
    try {
        localStorage.setItem('stou_last_used_link', linkId);
        localStorage.setItem('stou_last_used_cat', catId);
    } catch (e) {}
}

function applyLastUsedMarkerAndScroll() {
    try {
        const lastLinkId = localStorage.getItem('stou_last_used_link');
        const lastCatId = localStorage.getItem('stou_last_used_cat');
        const container = document.getElementById('sidebarScrollContainer');

        document.querySelectorAll('.last-used-tag').forEach(tag => tag.remove());
        document.querySelectorAll('.last-used-item').forEach(el => el.classList.remove('last-used-item'));

        if (lastLinkId) {
            const targetLink = document.getElementById(lastLinkId);
            if (targetLink) {
                targetLink.classList.add('last-used-item');
                
                const badge = document.createElement('span');
                badge.className = 'last-used-tag';
                badge.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> ล่าสุด';
                targetLink.appendChild(badge);

                if (lastCatId) {
                    const catElem = document.getElementById(lastCatId);
                    if (catElem) catElem.classList.remove('collapsed');
                }

                setTimeout(() => {
                    if (container) {
                        const containerRect = container.getBoundingClientRect();
                        const targetRect = targetLink.getBoundingClientRect();
                        const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
                        const containerHeight = container.clientHeight;
                        const targetHeight = targetLink.offsetHeight;
                        const centerScrollPosition = relativeTop - (containerHeight / 2) + (targetHeight / 2);

                        container.scrollTo({
                            top: centerScrollPosition,
                            behavior: 'smooth'
                        });
                    }
                }, 220);
            }
        }
    } catch (e) {
        console.warn('[WMS Navigation] Last used marker error:', e);
    }
}

function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem('stou_menu_favorites')) || [];
    } catch (e) { 
        return []; 
    }
}

function toggleFavorite(event, linkId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    let favs = getFavorites();
    if (favs.includes(linkId)) {
        favs = favs.filter(id => id !== linkId);
    } else {
        favs.push(linkId);
    }
    try {
        localStorage.setItem('stou_menu_favorites', JSON.stringify(favs));
    } catch (e) {}
    renderFavorites();
}

function renderFavorites() {
    const favs = getFavorites();
    const favCat = document.getElementById('cat-favorites');
    const favList = document.getElementById('favoritesList');
    const favCount = document.getElementById('favCountTag');

    document.querySelectorAll('.fav-star-btn').forEach(btn => {
        btn.classList.remove('is-fav');
        btn.innerHTML = '<i class="fa-regular fa-star"></i>';
    });

    if (!favList) return;
    favList.innerHTML = '';

    if (favs.length > 0) {
        if (favCat) favCat.style.display = 'block';
        if (favCount) favCount.innerText = favs.length;

        favs.forEach(id => {
            const sourceLink = document.getElementById(id);
            if (sourceLink) {
                const parentLi = sourceLink.parentElement;
                const starBtn = parentLi ? parentLi.querySelector('.fav-star-btn') : null;
                if (starBtn) {
                    starBtn.classList.add('is-fav');
                    starBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
                }

                const li = document.createElement('li');
                const clonedLink = sourceLink.cloneNode(true);
                clonedLink.removeAttribute('id');
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'fav-star-btn is-fav';
                removeBtn.title = 'ยกเลิกรายการโปรด';
                removeBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
                removeBtn.onclick = (e) => toggleFavorite(e, id);

                li.appendChild(clonedLink);
                li.appendChild(removeBtn);
                favList.appendChild(li);
            }
        });
    } else {
        if (favCat) favCat.style.display = 'none';
    }
}

function scrollToCat(catId) {
    const target = document.getElementById(catId);
    if (target) {
        target.classList.remove('collapsed');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function toggleSidebarCollapse() {
    const menu = document.getElementById('menu') || document.querySelector('.sidebar');
    if (!menu) return;
    menu.classList.toggle('collapsed-sidebar');
    const isCollapsed = menu.classList.contains('collapsed-sidebar');
    try {
        localStorage.setItem('sidebar_collapsed_state', isCollapsed ? 'true' : 'false');
    } catch (e) {}
}

function toggleCategory(element) {
    if (!element || !element.parentElement) return;
    element.parentElement.classList.toggle('collapsed');
    updateToggleAllBtnIcon();
}

let isAllCollapsed = true;

function toggleAllCategories() {
    const categories = document.querySelectorAll('.menu-category');
    isAllCollapsed = !isAllCollapsed;
    categories.forEach(cat => isAllCollapsed ? cat.classList.add('collapsed') : cat.classList.remove('collapsed'));
    updateToggleAllBtnIcon();
}

function updateToggleAllBtnIcon() {
    const btnIcon = document.querySelector('#toggleAllCategoriesBtn i');
    const anyExpanded = document.querySelector('.menu-category:not(.collapsed)');
    if (btnIcon) {
        btnIcon.className = anyExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
        isAllCollapsed = !anyExpanded;
    }
}

function filterSidebarMenu() {
    const input = document.getElementById('menuSearchInput');
    if (!input) return;
    
    const clearBtn = document.getElementById('clearSearchBtn');
    const filter = input.value.toLowerCase().trim();
    const categories = document.querySelectorAll('.menu-category');
    const countBadge = document.getElementById('menuSearchCount');
    let matchCount = 0;

    if (clearBtn) clearBtn.style.display = filter.length > 0 ? "block" : "none";

    categories.forEach(category => {
        const items = category.querySelectorAll('ul li');
        let hasVisibleItem = false;

        items.forEach(li => {
            const text = li.textContent || li.innerText;
            if (text.toLowerCase().indexOf(filter) > -1) {
                li.style.display = "";
                hasVisibleItem = true;
                matchCount++;
            } else {
                li.style.display = "none";
            }
        });

        if (filter !== "") {
            category.classList.remove('collapsed');
            category.style.display = hasVisibleItem ? "" : "none";
        } else {
            category.style.display = "";
            category.classList.add('collapsed');
        }
    });

    if (filter === "") applyLastUsedMarkerAndScroll();

    if (countBadge) {
        countBadge.innerText = matchCount;
        countBadge.style.display = filter !== "" ? "inline-block" : "none";
    }
    updateToggleAllBtnIcon();
}

function clearMenuSearch() {
    const input = document.getElementById('menuSearchInput');
    if (input) {
        input.value = "";
        filterSidebarMenu();
        input.focus();
    }
}

function scrollSidebarToTop() {
    const scrollContainer = document.querySelector('.sidebar-scroll-container') || document.querySelector('.sidebar');
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =========================================================================
// 🚀 INITIALIZATION & EVENT LISTENERS
// =========================================================================

function initNavigationEngine() {
    renderSidebarMenu();
    setupTopNavbarGuard();

    try {
        const siteMode = localStorage.getItem('site_theme_mode') || 'light';
        const savedTheme = localStorage.getItem('stou_selected_theme');

        if (savedTheme) {
            changeStouTheme(savedTheme);
        } else {
            syncSidebarThemeWithSite(siteMode);
        }

        const isCollapsed = localStorage.getItem('sidebar_collapsed_state') === 'true';
        const menu = document.getElementById('menu') || document.querySelector('.sidebar');
        if (isCollapsed && menu) {
            menu.classList.add('collapsed-sidebar');
        }
    } catch (e) {
        console.warn('[WMS Initialization] Theme/State restore warning:', e);
    }

    renderFavorites();
    applyLastUsedMarkerAndScroll();
    updateToggleAllBtnIcon();

    // จับเหตุการณ์คลิกทุกปุ่มเมนูด้วย Event Delegation (Capture Phase เพื่อทำงานก่อนสคริปต์อื่น)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#sidebarMenuList button, .sidebar button, .menu-item button, .menu-item-btn, .modern-sidebar-menu ul li a, [data-view]');
        if (btn) {
            const targetView = btn.getAttribute('data-view') || '';
            if (targetView) {
                e.preventDefault();
                switchView(targetView);
            }
        }
    }, true);

    window.addEventListener('popstate', () => {
        if (!isNavigationAwaitingAuth()) {
            executeSwitchView(getCurrentActiveView());
        }
    });

    window.addEventListener('hashchange', () => {
        if (!isNavigationAwaitingAuth()) {
            executeSwitchView(getCurrentActiveView());
        }
    });

    // หากล็อกอินผ่านแล้วให้เปิดหน้าเป้าหมายทันที หากอยู่หน้าล็อกอินให้รอจนกว่าจะล็อกอินสำเร็จ
    if (!isNavigationAwaitingAuth()) {
        const initialView = getCurrentActiveView();
        switchView(initialView);
    }
}

document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('menuSearchInput');
        if (searchInput) searchInput.focus();
    }
    if (e.key === 'Escape') {
        const searchInput = document.getElementById('menuSearchInput');
        if (document.activeElement === searchInput) {
            clearMenuSearch();
            searchInput.blur();
        }
    }
});

// Export Global Window Scope
window.PAGE_TITLE_MAP = PAGE_TITLE_MAP;
window.switchView = switchView;
window.executeSwitchView = executeSwitchView;
window.updateActiveMenuHighlight = updateActiveMenuHighlight;
window.updateTopNavbarHeader = updateTopNavbarHeader;
window.renderSidebarMenu = renderSidebarMenu;
window.toggleMobileSidebar = toggleMobileSidebar;
window.navigateToApprovalCenter = navigateToApprovalCenter;
window.getCurrentActiveView = getCurrentActiveView;
window.resolveViewFromUrlOrStorage = resolveViewFromUrlOrStorage;
window.syncBrowserUrlWithFileName = syncBrowserUrlWithFileName;
window.isNavigationAwaitingAuth = isNavigationAwaitingAuth;

window.changeStouTheme = changeStouTheme;
window.syncSidebarThemeWithSite = syncSidebarThemeWithSite;
window.toggleQuickDarkMode = toggleQuickDarkMode;
window.markLastUsed = markLastUsed;
window.applyLastUsedMarkerAndScroll = applyLastUsedMarkerAndScroll;
window.getFavorites = getFavorites;
window.toggleFavorite = toggleFavorite;
window.renderFavorites = renderFavorites;
window.scrollToCat = scrollToCat;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.toggleCategory = toggleCategory;
window.toggleAllCategories = toggleAllCategories;
window.toggleAllCategoriesBtnIcon = updateToggleAllBtnIcon;
window.updateToggleAllBtnIcon = updateToggleAllBtnIcon;
window.filterSidebarMenu = filterSidebarMenu;
window.clearMenuSearch = clearMenuSearch;
window.scrollSidebarToTop = scrollSidebarToTop;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigationEngine);
} else {
    initNavigationEngine();
}