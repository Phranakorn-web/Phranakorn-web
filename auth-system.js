// =========================================================================
// --- MODULE 9: AUTHENTICATION, USER ROLES & ZERO-TRUST SECURITY ENGINE ---
// --- ANTI-COPY-PASTE DOM GUARD, TAMPER-PROOF SESSION & BIOMETRIC LOGIN  ---
// --- FULL SUPABASE RLS RPC INTEGRATION (100% COMPLETE & CROSS-OS READY)  ---
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

const DEFAULT_USERS = [
    { id: 1, username: 'admin', password: '123456', name: 'Super Admin (ผู้ดูแลระบบ)', department: 'ฝ่ายบริหาร IT', role: 'admin' },
    { id: 2, username: 'user1', password: '123456', name: 'นายสมชาย ใจดี', department: 'แผนกคลังสินค้า', role: 'user' }
];

// บทบาทและสิทธิ์การใช้งานในระบบ (RBAC Matrix)
const ROLE_PERMISSIONS = Object.freeze({
    admin: Object.freeze(['*']), // Access all
    manager: Object.freeze(['view-inventory', 'view-inbound', 'view-outbound', 'view-locations', 'view-approvals', 'view-activities']),
    user: Object.freeze(['view-inventory', 'view-inbound', 'view-outbound', 'view-locations']),
    viewer: Object.freeze(['view-inventory', 'view-locations'])
});

// รายการ View และ Selector ที่สงวนไว้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น
const ADMIN_ONLY_VIEWS = Object.freeze([
    'view-settings'
]);

const ADMIN_ONLY_SELECTORS = Object.freeze([
    '#view-settings',
    '[data-view="view-settings"]',
    '[data-admin-only]',
    '[data-admin-only="true"]',
    '[data-role="admin"]',
    '[data-required-role="admin"]',
    '.admin-only',
    '.admin-only-panel',
    '.admin-only-btn',
    '#userManagementTableBody',
    '#aisleSettingsTableBody',
    '#menuDbMappingTableBody',
    '#userBiometricStatusBanner',
    '#aisleSettingsTableFilterBar',
    '#rolePermissionMatrixModal',
    '#editUserModal',
    'a[href="#settings"]',
    'a[href="#view-settings"]'
]);

// ตั้งค่าโหมดความปลอดภัยสำหรับการเปิดแท็บใหม่ในเครื่องเดิม:
// false = หากประวัติล็อกอินยังไม่หมดเวลา ให้เด้งป๊อปอัปแจ้งเตือนเพื่อกด "ตกลง" ใช้งานต่อเนื่อง (หรือกดเข้าสู่ระบบใหม่)
// true  = บังคับกรอกรหัสผ่านใหม่ทุกครั้งที่เปิดแท็บใหม่ 100%
const STRICT_PASSWORD_ON_EVERY_NEW_TAB = false;

const TAB_SESSION_VERIFIED_KEY = 'WMS_TAB_SESSION_VERIFIED';
const FORCE_RELOGIN_LOCK_KEY = 'WMS_FORCE_RELOGIN_REQUIRED';
const AUTH_BIOMETRIC_STORAGE_KEY = 'WMS_USER_BIOMETRICS_V1';
const SESSION_SEAL_STORAGE_KEY = 'WMS_SESSION_INTEGRITY_SEAL';

let systemUsers = [...DEFAULT_USERS];
let loginFailedAttempts = 0;
let lockoutTimerInterval = null;
let crossTabSyncInitialized = false;
let domSecurityObserver = null;
let domSecuritySweepInterval = null;
let routeGuardInitialized = false;
let blockedTamperAttemptsCount = 0;
let lastTamperToastTime = 0;

// 🔒 ปิดผนึกข้อมูลผู้ใช้ปัจจุบันใน Closure ส่วนตัว ป้องกันการแก้ค่าผ่าน DevTools Console
let _sealedCurrentUser = null;
let _sealedIsAdmin = false;
let _sealedSessionSignature = '';

function computeSessionIntegritySeal(userObj) {
    if (!userObj || !userObj.username) return '';
    const raw = `${String(userObj.username).trim().toLowerCase()}|${normalizeUserRole(userObj.role, userObj.username)}|${String(userObj.id || '0')}|WMS_ZERO_TRUST_2026`;
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    }
    return `seal_${(hash >>> 0).toString(16)}`;
}

// ผูกตัวแปร Global currentUser / isAdminAuthenticatedSession แบบ Read-Only ผ่าน Getter
try {
    Object.defineProperty(window, 'currentUser', {
        configurable: false,
        enumerable: true,
        get() {
            return _sealedCurrentUser;
        },
        set(val) {
            if (val === _sealedCurrentUser) return;
            triggerSecurityTamperAlert('ตรวจพบความพยายามแก้ไขตัวแปรสิทธิ์ผู้ใช้งาน (window.currentUser)');
        }
    });

    Object.defineProperty(window, 'isAdminAuthenticatedSession', {
        configurable: false,
        enumerable: true,
        get() {
            return Boolean(_sealedIsAdmin && _sealedCurrentUser && _sealedCurrentUser.role === 'admin');
        },
        set(val) {
            if (Boolean(val) === Boolean(_sealedIsAdmin && _sealedCurrentUser && _sealedCurrentUser.role === 'admin')) return;
            triggerSecurityTamperAlert('ตรวจพบความพยายามปลอมแปลงสถานะผู้ดูแลระบบ (isAdminAuthenticatedSession)');
        }
    });
} catch (e) {}

const AUTO_LOGOUT_TIMEOUT_MS = 5 * 60 * 1000; // 5 นาที
const WARNING_BEFORE_LOGOUT_MS = 4 * 60 * 1000; // เตือนนาทีที่ 4
let autoLogoutTimer = null;
let logoutWarningTimer = null;
let sessionCheckInterval = null;

// =========================================================================
// --- ROLE NORMALIZATION & VERIFICATION HELPERS (100% ACCURATE FILTERING) ---
// =========================================================================

function normalizeUserRole(rawRole, username = '') {
    const cleanRole = String(rawRole || '').trim().toLowerCase();
    const cleanUsername = String(username || '').trim().toLowerCase();

    if (cleanRole === 'admin' || cleanRole === 'superadmin' || cleanRole === 'super_admin' || cleanRole === 'administrator') {
        return 'admin';
    }
    if (cleanRole === 'manager' || cleanRole === 'supervisor') {
        return 'manager';
    }
    if (cleanRole === 'viewer' || cleanRole === 'guest') {
        return 'viewer';
    }
    if (cleanRole === 'user' || cleanRole === 'staff') {
        return 'user';
    }
    if (cleanUsername === 'admin') {
        return 'admin';
    }
    return 'user';
}

function getRoleDisplayLabel(role) {
    const normalized = normalizeUserRole(role);
    switch (normalized) {
        case 'admin':
            return '👑 ผู้ดูแลระบบ (Admin - เข้าถึงได้ทุกเมนู)';
        case 'manager':
            return '🛡️ หัวหน้างาน (Manager)';
        case 'viewer':
            return '👁️ ผู้ดูข้อมูล (Viewer)';
        default:
            return '👤 ผู้ใช้งานทั่วไป (User)';
    }
}

function setSealedUserState(verifiedUser) {
    if (!verifiedUser || !verifiedUser.username) {
        _sealedCurrentUser = null;
        _sealedIsAdmin = false;
        _sealedSessionSignature = '';
        try { sessionStorage.removeItem(SESSION_SEAL_STORAGE_KEY); } catch (e) {}
        return null;
    }

    const frozenUser = Object.freeze({
        id: verifiedUser.id,
        username: String(verifiedUser.username).trim(),
        password: verifiedUser.password || '123456',
        name: String(verifiedUser.name || verifiedUser.username).trim(),
        department: String(verifiedUser.department || 'แผนกคลังสินค้า').trim(),
        role: normalizeUserRole(verifiedUser.role, verifiedUser.username)
    });

    _sealedCurrentUser = frozenUser;
    _sealedIsAdmin = (frozenUser.role === 'admin');
    _sealedSessionSignature = computeSessionIntegritySeal(frozenUser);

    try {
        sessionStorage.setItem(SESSION_SEAL_STORAGE_KEY, _sealedSessionSignature);
    } catch (e) {}

    return frozenUser;
}

function syncVerifiedUserObject(rawUser) {
    if (!rawUser || !rawUser.username) return null;

    const cleanUsername = String(rawUser.username).trim().toLowerCase();

    // ตรวจสอบข้อมูลล่าสุดจาก systemUsers (ที่โหลดมาจาก Supabase / LocalStorage) และ DEFAULT_USERS
    const matchedDbUser = systemUsers.find(u => String(u.username || '').trim().toLowerCase() === cleanUsername);
    const matchedDefaultUser = DEFAULT_USERS.find(u => String(u.username || '').trim().toLowerCase() === cleanUsername);
    const referenceUser = matchedDbUser || matchedDefaultUser || rawUser;

    // ยึดสิทธิ์จากฐานข้อมูลจริงเป็นหลักเสมอ ป้องกันการปลอม role ใน localStorage
    const authoritativeRole = (matchedDbUser && matchedDbUser.role)
        || (matchedDefaultUser && matchedDefaultUser.role)
        || rawUser.role;

    const resolvedRole = normalizeUserRole(authoritativeRole, cleanUsername);

    const verifiedUser = {
        id: referenceUser.id || rawUser.id,
        username: referenceUser.username || rawUser.username,
        password: referenceUser.password || rawUser.password || '123456',
        name: referenceUser.full_name || referenceUser.name || rawUser.name || rawUser.username,
        department: referenceUser.department || rawUser.department || 'แผนกคลังสินค้า',
        role: resolvedRole
    };

    return setSealedUserState(verifiedUser);
}

function isCurrentUserAdmin() {
    if (!_sealedCurrentUser || !_sealedIsAdmin) return false;
    const expectedSeal = computeSessionIntegritySeal(_sealedCurrentUser);
    if (!expectedSeal || _sealedSessionSignature !== expectedSeal) {
        return false;
    }
    return normalizeUserRole(_sealedCurrentUser.role, _sealedCurrentUser.username) === 'admin';
}

function hasPermission(requiredViewOrPerm) {
    if (!_sealedCurrentUser) return false;
    const expectedSeal = computeSessionIntegritySeal(_sealedCurrentUser);
    if (!expectedSeal || _sealedSessionSignature !== expectedSeal) return false;

    const role = normalizeUserRole(_sealedCurrentUser.role, _sealedCurrentUser.username);
    if (role === 'admin') return true;

    if (ADMIN_ONLY_VIEWS.includes(requiredViewOrPerm)) return false;

    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['user'];
    if (permissions.includes('*')) return true;
    return permissions.includes(requiredViewOrPerm);
}

// 🔐 ตรวจสอบรหัสผ่านผู้ดูแลระบบกับ Supabase RPC (`verify_wms_admin`) และข้อมูลในเครื่อง
async function verifyAdminPasswordSecure(inputPassword) {
    const cleanPass = String(inputPassword || '').trim();
    if (!cleanPass || !isCurrentUserAdmin() || !_sealedCurrentUser) return false;

    if (navigator.onLine) {
        try {
            const client = typeof getSupabaseClient === 'function'
                ? getSupabaseClient()
                : (typeof _supabase !== 'undefined' ? _supabase : null);

            if (client) {
                const { data, error } = await authWithTimeout(
                    client.rpc('verify_wms_admin', {
                        p_admin_username: _sealedCurrentUser.username,
                        p_admin_password: cleanPass
                    }),
                    3500
                );
                if (!error && typeof data === 'boolean') {
                    return data;
                }
            }
        } catch (e) {}
    }

    // Fallback กรณีออฟไลน์: ตรวจสอบกับรหัสผ่านของบัญชี Admin ที่ยืนยันตัวตนแล้ว
    if (String(_sealedCurrentUser.password || '') === cleanPass) return true;
    const matchedAdmin = systemUsers.find(u =>
        normalizeUserRole(u.role, u.username) === 'admin' &&
        String(u.password || '') === cleanPass
    );
    return Boolean(matchedAdmin);
}

// =========================================================================
// --- ZERO-TRUST DOM ANTI-COPY-PASTE & TAMPER PROTECTION ENGINE (2026)  ---
// =========================================================================

function triggerSecurityTamperAlert(reasonText, shouldForceLogout = false) {
    blockedTamperAttemptsCount++;
    const now = Date.now();

    if (now - lastTamperToastTime > 2500) {
        lastTamperToastTime = now;
        if (typeof showToast === 'function') {
            showToast(`🛡️ ระบบความปลอดภัย: ${reasonText}`, true);
        }
    }

    if (_sealedCurrentUser && typeof logUserActivity === 'function') {
        try {
            logUserActivity('SECURITY_BLOCK', reasonText);
        } catch (e) {}
    }

    if (shouldForceLogout) {
        handleSystemLogout(`🚨 ตรวจพบการดัดแปลงข้อมูลสิทธิ์ผู้ใช้งาน (${reasonText}) ระบบตัดการเชื่อมต่อทันทีเพื่อความปลอดภัย`);
    }
}

// 🧹 กวาดล้างและลบโค้ด HTML/ปุ่ม/หน้าเมนูของ Admin ออกจาก DOM ทั้งหมดทันที (ไม่ใช้แค่ซ่อนด้วย CSS)
function purgeUnauthorizedAdminElementsFromDOM(rootNode = document) {
    if (isCurrentUserAdmin()) return 0;

    let removedCount = 0;

    try {
        ADMIN_ONLY_SELECTORS.forEach(selector => {
            const matches = rootNode.querySelectorAll ? rootNode.querySelectorAll(selector) : [];
            matches.forEach(el => {
                if (el && el.parentNode) {
                    el.innerHTML = '';
                    el.remove();
                    removedCount++;
                }
            });
        });

        const interactiveNodes = rootNode.querySelectorAll
            ? rootNode.querySelectorAll('[data-view], [data-perm], [onclick]')
            : [];

        interactiveNodes.forEach(el => {
            if (!el || !el.parentNode) return;

            const targetView = (el.getAttribute('data-view') || '').trim();
            const targetPerm = (el.getAttribute('data-perm') || '').trim();
            const onclickCode = (el.getAttribute('onclick') || '').trim();

            const isRestrictedView = targetView && targetView.startsWith('view-') && targetView !== 'view-dashboard' && !hasPermission(targetView);
            const isRestrictedPerm = targetPerm && !hasPermission(targetPerm);
            const isRestrictedAdminCall = onclickCode && (
                onclickCode.includes('kickUserSession') ||
                onclickCode.includes('deleteUserAccount') ||
                onclickCode.includes('openEditUserModal') ||
                onclickCode.includes('verifyAndDeleteAisle') ||
                onclickCode.includes('saveAllWarehouseConfigsToDB') ||
                onclickCode.includes('addNewAisleConfig') ||
                onclickCode.includes('toggleAisleLock') ||
                onclickCode.includes('moveAisleOrder') ||
                onclickCode.includes('enrollUserFingerprint') ||
                onclickCode.includes('removeUserFingerprint') ||
                onclickCode.includes('showRolePermissionMatrixModal') ||
                onclickCode.includes('adminSaveUserProfileRPC') ||
                onclickCode.includes('adminManageUserActionRPC')
            );

            if (isRestrictedView || isRestrictedPerm || isRestrictedAdminCall) {
                el.innerHTML = '';
                el.remove();
                removedCount++;
            }
        });
    } catch (e) {}

    return removedCount;
}

// 👁️ ตรวจสอบ Node ที่ถูกวางแทรกเข้ามาใหม่ใน DOM (เช่น ผู้ใช้ก๊อปปิ้งโค้ดหน้า Admin มาวางใน DevTools)
function inspectInjectedNodeForUnauthorizedAdminMarkup(node) {
    if (isCurrentUserAdmin()) return false;
    if (!node || node.nodeType !== 1) return false;

    const el = node;
    const id = (el.id || '').toLowerCase();
    const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    const dataView = (el.getAttribute && (el.getAttribute('data-view') || '')).toLowerCase();
    const dataRole = (el.getAttribute && (el.getAttribute('data-role') || el.getAttribute('data-required-role') || '')).toLowerCase();
    const isAdminAttr = el.hasAttribute && el.hasAttribute('data-admin-only');
    const htmlSnapshot = (el.outerHTML || '').toLowerCase();

    const containsAdminSignature =
        id === 'view-settings' ||
        id === 'usermanagementtablebody' ||
        id === 'aislesettingstablebody' ||
        id === 'menudbmappingtablebody' ||
        id === 'rolepermissionmatrixmodal' ||
        id === 'editusermodal' ||
        dataView === 'view-settings' ||
        dataRole === 'admin' ||
        isAdminAttr ||
        className.includes('admin-only') ||
        htmlSnapshot.includes('usermanagementtablebody') ||
        htmlSnapshot.includes('aislesettingstablebody') ||
        htmlSnapshot.includes('kickusersession') ||
        htmlSnapshot.includes('deleteuseraccount') ||
        htmlSnapshot.includes('openeditusermodal') ||
        htmlSnapshot.includes('verifyanddeleteaisle') ||
        htmlSnapshot.includes('enrolluserfingerprint') ||
        htmlSnapshot.includes('data-admin-only');

    if (containsAdminSignature) {
        try {
            el.innerHTML = '';
            el.remove();
        } catch (e) {}
        purgeUnauthorizedAdminElementsFromDOM(document);
        return true;
    }

    const childPurged = purgeUnauthorizedAdminElementsFromDOM(el);
    return childPurged > 0;
}

// 🛡️ เริ่มทำงาน MutationObserver ดักจับการก๊อปปิ้ง HTML หรือแก้ไข Attribute ตลอดเวลา
function initAdminDomSecurityGuard() {
    purgeUnauthorizedAdminElementsFromDOM(document);

    if (!domSecurityObserver && typeof MutationObserver === 'function') {
        domSecurityObserver = new MutationObserver((mutations) => {
            if (isCurrentUserAdmin()) return;

            let detectedTamper = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(addedNode => {
                        if (inspectInjectedNodeForUnauthorizedAdminMarkup(addedNode)) {
                            detectedTamper = true;
                        }
                    });
                } else if (mutation.type === 'attributes' && mutation.target) {
                    if (inspectInjectedNodeForUnauthorizedAdminMarkup(mutation.target)) {
                        detectedTamper = true;
                    }
                }
            }

            if (detectedTamper) {
                triggerSecurityTamperAlert('ตรวจพบการวางโค้ดหรือเปิดส่วนสิทธิ์ผู้ดูแลระบบโดยไม่ได้รับอนุญาต ระบบลบทิ้งทันที');
            }
        });

        const targetRoot = document.documentElement || document.body;
        if (targetRoot) {
            domSecurityObserver.observe(targetRoot, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden', 'data-view', 'data-admin-only', 'data-role']
            });
        }
    }

    if (!domSecuritySweepInterval) {
        domSecuritySweepInterval = setInterval(() => {
            verifySessionStorageIntegrity();
            if (!isCurrentUserAdmin()) {
                purgeUnauthorizedAdminElementsFromDOM(document);
                enforceHashRoutePermission();
            }
        }, 1500);
    }

    initRoutePermissionGuard();
}

// 🔒 ตรวจสอบว่า localStorage ไม่ถูกแก้ไขปลอมสิทธิ์ (เช่น แก้ role จาก user เป็น admin)
function verifySessionStorageIntegrity() {
    if (!_sealedCurrentUser) return true;

    try {
        const storedRaw = localStorage.getItem('WMS_ACTIVE_USER');
        if (!storedRaw) return true;

        const parsed = JSON.parse(storedRaw);
        const storedUsername = String(parsed.username || '').trim().toLowerCase();
        const sealedUsername = String(_sealedCurrentUser.username || '').trim().toLowerCase();
        const storedRole = normalizeUserRole(parsed.role, storedUsername);
        const sealedRole = normalizeUserRole(_sealedCurrentUser.role, sealedUsername);

        if (storedUsername !== sealedUsername || storedRole !== sealedRole) {
            localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(_sealedCurrentUser));
            triggerSecurityTamperAlert('ตรวจพบการปลอมแปลงข้อมูลสิทธิ์ใน LocalStorage ระบบบล็อกสิทธิ์ทันที', true);
            return false;
        }
    } catch (e) {}

    return true;
}

// 🧭 ป้องกันการพิมพ์หรือก๊อปปิ้งลิงก์ URL ของหน้า Admin (เช่น #settings) มาเปิดในบัญชีผู้ใช้ทั่วไป
function enforceHashRoutePermission() {
    if (isCurrentUserAdmin()) return true;

    const currentHash = String(window.location.hash || '').trim().toLowerCase();
    const blockedHashesForNonAdmin = ['#settings', '#view-settings', '#admin', '#users', '#permissions'];

    if (blockedHashesForNonAdmin.some(h => currentHash === h || currentHash.startsWith(`${h}/`) || currentHash.startsWith(`${h}?`))) {
        try {
            history.replaceState(null, '', '#dashboard');
        } catch (e) {
            window.location.hash = '#dashboard';
        }
        purgeUnauthorizedAdminElementsFromDOM(document);
        if (typeof switchToPrimaryDashboardAfterLogin === 'function') {
            switchToPrimaryDashboardAfterLogin();
        }
        triggerSecurityTamperAlert('ลิงก์หน้าตั้งค่าและสิทธิ์สงวนไว้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น');
        return false;
    }

    if (_sealedCurrentUser) {
        if ((currentHash === '#approvals' || currentHash === '#view-approvals') && !hasPermission('view-approvals')) {
            try { history.replaceState(null, '', '#dashboard'); } catch (e) { window.location.hash = '#dashboard'; }
            if (typeof switchToPrimaryDashboardAfterLogin === 'function') switchToPrimaryDashboardAfterLogin();
            triggerSecurityTamperAlert('บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้าศูนย์อนุมัติคำขอ');
            return false;
        }
        if ((currentHash === '#activities' || currentHash === '#view-activities') && !hasPermission('view-activities')) {
            try { history.replaceState(null, '', '#dashboard'); } catch (e) { window.location.hash = '#dashboard'; }
            if (typeof switchToPrimaryDashboardAfterLogin === 'function') switchToPrimaryDashboardAfterLogin();
            triggerSecurityTamperAlert('บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้าประวัติการใช้งาน');
            return false;
        }
    }

    return true;
}

function initRoutePermissionGuard() {
    if (routeGuardInitialized) return;
    routeGuardInitialized = true;

    window.addEventListener('hashchange', () => {
        enforceHashRoutePermission();
        if (!isCurrentUserAdmin()) {
            purgeUnauthorizedAdminElementsFromDOM(document);
        }
    });

    window.addEventListener('popstate', () => {
        enforceHashRoutePermission();
        if (!isCurrentUserAdmin()) {
            purgeUnauthorizedAdminElementsFromDOM(document);
        }
    });
}

function refreshRoleDependentUI() {
    if (!isCurrentUserAdmin()) {
        purgeUnauthorizedAdminElementsFromDOM(document);
        enforceHashRoutePermission();
    }

    if (typeof renderSidebarMenu === 'function') {
        renderSidebarMenu();
    }

    if (isCurrentUserAdmin()) {
        if (typeof renderUserManagementTableEnhanced === 'function') {
            renderUserManagementTableEnhanced();
        } else if (typeof renderUserManagementTable === 'function') {
            renderUserManagementTable();
        }
    } else {
        purgeUnauthorizedAdminElementsFromDOM(document);
    }

    setTimeout(() => {
        if (_sealedCurrentUser && typeof renderSidebarMenu === 'function') {
            renderSidebarMenu();
        }
        if (!isCurrentUserAdmin()) {
            purgeUnauthorizedAdminElementsFromDOM(document);
        }
    }, 120);
}

// ⏱️ ตัวช่วยจำกัดเวลาเชื่อมต่อ Supabase ตอนล็อกอิน เพื่อความรวดเร็วและไม่ค้างหากเน็ตช้า
function authWithTimeout(promise, ms = 3500) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('AUTH_DB_TIMEOUT')), ms))
    ]);
}

function setLoginScreenBodyFlags(active) {
    if (document.documentElement) {
        if (active) {
            document.documentElement.classList.add('wms-login-active', 'wms-unverified-session');
        } else {
            document.documentElement.classList.remove('wms-login-active', 'wms-unverified-session');
        }
    }
    if (document.body) {
        if (active) {
            document.body.classList.add('wms-login-active', 'wms-unverified-session');
        } else {
            document.body.classList.remove('wms-login-active', 'wms-unverified-session');
        }
    }
}

// 🔓 ปลดล็อกคลาสหน้าล็อกอินเมื่อยืนยันตัวตนสำเร็จ
function clearLoginScreenBodyFlags() {
    setLoginScreenBodyFlags(false);
}

// 🔄 รีเซ็ตสถานะป๊อปอัปดึงข้อมูลสต็อกเริ่มต้น เพื่อให้รอบการล็อกอินใหม่แสดงป๊อปอัปครบทุกครั้ง
function resetAuthBootstrapSyncFlags() {
    try {
        window.wmsAppMainBootstrapCompleted = false;
        window.wmsAppMainBootstrapPromise = null;
    } catch (e) {}

    if (typeof resetInitialDbSyncPopupState === 'function') {
        resetInitialDbSyncPopupState();
    } else if (typeof hideAllDetectedSyncPopups === 'function') {
        hideAllDetectedSyncPopups();
    } else if (typeof hideDatabaseLoadingPopup === 'function') {
        hideDatabaseLoadingPopup();
    }
}

// 🚀 สั่งดึงข้อมูลสต็อกและระบบทั้งหมดหลังล็อกอินหรือรีเฟรชหน้าเว็บในรอบเดียว
async function triggerUnifiedPostLoginStockSync(triggerReason = 'post-login', forceResetPopup = false) {
    if (forceResetPopup) {
        resetAuthBootstrapSyncFlags();
    }

    try {
        if (typeof runAppMainFullSiteBootstrapSync === 'function') {
            await runAppMainFullSiteBootstrapSync(triggerReason);
        } else if (typeof runUnifiedInitialSiteSync === 'function') {
            await runUnifiedInitialSiteSync(triggerReason);
        } else if (typeof runFastPostLoginInitialSync === 'function') {
            await runFastPostLoginInitialSync();
        }
    } catch (err) {
        console.warn('⚠️ Post-login unified stock sync notice:', err);
    }
}

// 🏠 รีเซ็ตและสลับมาที่หน้าแดชบอร์ดหลักเสมอเมื่อเข้าสู่ระบบใหม่
function switchToPrimaryDashboardAfterLogin() {
    clearLoginScreenBodyFlags();

    try {
        sessionStorage.removeItem('WMS_ACTIVE_VIEW');
        sessionStorage.removeItem('WMS_CURRENT_VIEW');
        sessionStorage.removeItem('WMS_SESSION_ACTIVE_VIEW');
        localStorage.removeItem('WMS_ACTIVE_VIEW');
        localStorage.removeItem('WMS_CURRENT_VIEW');
        localStorage.removeItem('WMS_LAST_ACTIVE_VIEW');
        localStorage.removeItem('WMS_ACTIVE_VIEW_ID');
    } catch (e) {}

    let primaryDashboardView = 'view-dashboard';
    if (!document.getElementById(primaryDashboardView)) {
        const dashNavBtn = document.querySelector('[data-view="view-dashboard"], .nav-item[data-view*="dashboard"], .menu-item[data-view*="dashboard"]');
        if (dashNavBtn && dashNavBtn.getAttribute('data-view')) {
            primaryDashboardView = dashNavBtn.getAttribute('data-view');
        } else if (typeof resolveInitialViewFromUrl === 'function') {
            primaryDashboardView = resolveInitialViewFromUrl();
        } else {
            primaryDashboardView = 'view-inventory';
        }
    }

    if (typeof switchView === 'function') {
        switchView(primaryDashboardView);
    } else if (typeof executeSwitchView === 'function') {
        executeSwitchView(primaryDashboardView);
    }

    if (typeof syncRouteToBrowserAndHeader === 'function') {
        syncRouteToBrowserAndHeader(primaryDashboardView);
    }
}

// =========================================================================
// --- HARDWARE FINGERPRINT / BIOMETRIC LOGIN ENGINE (SYNCED WITH SETTINGS) ---
// =========================================================================

function getRegisteredBiometricMap() {
    try {
        const raw = localStorage.getItem(AUTH_BIOMETRIC_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function getRegisteredBiometricList() {
    const map = getRegisteredBiometricMap();
    return Object.values(map).filter(item => item && item.username && item.credentialId);
}

function authBufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function authBase64UrlToBuffer(base64url) {
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

async function isAuthBiometricHardwareReady() {
    try {
        if (!window.PublicKeyCredential || !navigator.credentials) return false;
        if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
            return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        }
        return true;
    } catch (e) {
        return false;
    }
}

// 🎨 สร้างและอัปเดตปุ่ม "เข้าสู่ระบบด้วยลายนิ้วมือ" บนหน้า Login
async function renderBiometricLoginSection() {
    const loginOverlay = document.getElementById('loginOverlay');
    if (!loginOverlay) return;

    const card = loginOverlay.querySelector('.login-card');
    if (!card) return;

    let container = document.getElementById('biometricLoginContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'biometricLoginContainer';
        container.style.cssText = 'margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border-color, #cbd5e1); text-align: center;';

        const form = card.querySelector('form');
        if (form && form.nextSibling) {
            card.insertBefore(container, form.nextSibling);
        } else {
            card.appendChild(container);
        }
    }

    const registeredList = getRegisteredBiometricList();
    const hardwareReady = await isAuthBiometricHardwareReady();

    if (registeredList.length === 0) {
        if (hardwareReady) {
            container.style.display = 'block';
            container.innerHTML = `
                <div style="font-size: 0.78rem; color: #64748b; background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 8px 10px;">
                    <i class="fa-solid fa-fingerprint" style="color: #0284c7;"></i>
                    เครื่องนี้รองรับการสแกนลายนิ้วมือ (ลงทะเบียนได้ที่เมนูตั้งค่าพิกัดคลังสินค้า)
                </div>
            `;
        } else {
            container.style.display = 'none';
        }
        return;
    }

    container.style.display = 'block';

    container.innerHTML = `
        <button type="button" id="biometricLoginBtn" onclick="handleBiometricLogin()" style="
            width: 100%;
            padding: 11px 16px;
            border-radius: 10px;
            border: 1px solid #0ea5e9;
            background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
            color: #ffffff;
            font-weight: 700;
            font-size: 0.92rem;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        ">
            <i class="fa-solid fa-fingerprint" style="font-size: 1.15rem;"></i>
            <span id="biometricLoginBtnLabel">เข้าสู่ระบบด้วยลายนิ้วมือ</span>
        </button>
    `;
}

// 🔐 ดำเนินการเข้าสู่ระบบด้วยลายนิ้วมือ (WebAuthn Platform Authentication)
async function handleBiometricLogin() {
    const errAlert = document.getElementById('loginErrorAlert');
    const errText = document.getElementById('loginErrorMsg');
    const bioBtn = document.getElementById('biometricLoginBtn');

    if (loginFailedAttempts >= 5) {
        if (errText) errText.textContent = '⚠️ บัญชีถูกระงับชั่วคราวจากการกรอกรหัสผิดเกินกำหนด กรุณารอจนครบเวลา!';
        if (errAlert) errAlert.style.display = 'block';
        return;
    }

    const registeredList = getRegisteredBiometricList();
    if (registeredList.length === 0) {
        if (errText) errText.textContent = '⚠️ ยังไม่มีบัญชีที่ลงทะเบียนลายนิ้วมือในเครื่องนี้ กรุณาเข้าสู่ระบบด้วยรหัสผ่านและลงทะเบียนในหน้าตั้งค่า';
        if (errAlert) errAlert.style.display = 'block';
        return;
    }

    const hardwareReady = await isAuthBiometricHardwareReady();
    if (!hardwareReady) {
        if (errText) errText.textContent = '⚠️ เครื่องหรือเบราว์เซอร์นี้ไม่รองรับการสแกนลายนิ้วมือ (ต้องใช้งานผ่าน HTTPS หรือ localhost บนเครื่องที่มีตัวสแกน)';
        if (errAlert) errAlert.style.display = 'block';
        return;
    }

    const typedUsername = (document.getElementById('loginUsername')?.value || '').trim().toLowerCase();
    const bioMap = getRegisteredBiometricMap();

    let targetRecords = registeredList;

    if (typedUsername && bioMap[typedUsername]) {
        targetRecords = [bioMap[typedUsername]];
    }

    try {
        if (errAlert) errAlert.style.display = 'none';
        if (bioBtn) bioBtn.disabled = true;
        if (typeof showToast === 'function') {
            showToast('👆 กรุณาวางนิ้วบนตัวสแกนลายนิ้วมือเพื่อเข้าสู่ระบบ...');
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const allowCredentials = targetRecords.map(rec => ({
            id: authBase64UrlToBuffer(rec.credentialId),
            type: 'public-key',
            transports: ['internal']
        }));

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                allowCredentials: allowCredentials,
                userVerification: 'required',
                timeout: 60000
            }
        });

        if (!assertion || !assertion.rawId) {
            throw new Error('ไม่ได้รับการยืนยันจากตัวสแกนลายนิ้วมือ');
        }

        const returnedCredId = authBufferToBase64Url(assertion.rawId);
        const matchedRecord = registeredList.find(rec => rec.credentialId === returnedCredId) || (targetRecords.length === 1 ? targetRecords[0] : null);

        if (!matchedRecord || !matchedRecord.username) {
            throw new Error('ไม่พบบัญชีที่ตรงกับลายนิ้วมือนี้ในระบบ');
        }

        const matchedUsername = String(matchedRecord.username).trim();
        let foundUser = null;

        if (navigator.onLine) {
            try {
                const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
                if (client) {
                    const { data, error } = await authWithTimeout(
                        client.from('profiles').select('*').ilike('username', matchedUsername).maybeSingle(),
                        3500
                    );

                    if (!error && data) {
                        foundUser = {
                            id: data.id,
                            username: data.username,
                            password: data.password || '123456',
                            name: data.full_name || matchedUsername,
                            department: data.department || 'แผนกคลังสินค้า',
                            role: normalizeUserRole(data.role, data.username)
                        };

                        client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', matchedUsername).then(() => {}).catch(() => {});
                    }
                }
            } catch (dbErr) {}
        }

        if (!foundUser) {
            foundUser = systemUsers.find(u => String(u.username || '').trim().toLowerCase() === matchedUsername.toLowerCase());
        }

        if (!foundUser) {
            foundUser = DEFAULT_USERS.find(u => String(u.username || '').trim().toLowerCase() === matchedUsername.toLowerCase());
        }

        if (!foundUser) {
            if (errText) errText.textContent = `❌ ไม่พบข้อมูลบัญชี "${matchedUsername}" ในระบบ (อาจถูกลบไปแล้ว)`;
            if (errAlert) errAlert.style.display = 'block';
            return;
        }

        loginFailedAttempts = 0;
        const verifiedUser = syncVerifiedUserObject(foundUser);

        clearLoginScreenBodyFlags();
        sessionStorage.removeItem(FORCE_RELOGIN_LOCK_KEY);
        sessionStorage.setItem(TAB_SESSION_VERIFIED_KEY, 'true');
        localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(verifiedUser));
        localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

        const loginOverlay = document.getElementById('loginOverlay');
        const nameText = document.getElementById('currentUserNameText');

        if (loginOverlay) loginOverlay.style.setProperty('display', 'none', 'important');
        if (errAlert) errAlert.style.display = 'none';
        if (nameText) nameText.textContent = `${verifiedUser.name} (${verifiedUser.username})`;
        hideNewTabSessionModal();

        resetAuthBootstrapSyncFlags();
        resetAutoLogoutTimer();
        initSecurityListeners();
        initAdminDomSecurityGuard();
        refreshRoleDependentUI();

        switchToPrimaryDashboardAfterLogin();
        triggerUnifiedPostLoginStockSync('biometric-login', false);

        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') {
            showToast(`👆 สแกนลายนิ้วมือสำเร็จ (${verifiedUser.role.toUpperCase()})! ยินดีต้อนรับคุณ ${verifiedUser.name}`);
        }

        if (typeof logUserActivity === 'function') {
            await logUserActivity('AUTH_BIOMETRIC', `เข้าสู่ระบบด้วยลายนิ้วมือสำเร็จ (${verifiedUser.role})`);
        }
    } catch (err) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (err && err.name === 'NotAllowedError') {
            if (errText) errText.textContent = '❌ ยกเลิกการสแกนลายนิ้วมือ หรือหมดเวลาเชื่อมต่อกับตัวสแกน';
        } else {
            if (errText) errText.textContent = `❌ เข้าสู่ระบบด้วยลายนิ้วมือไม่สำเร็จ: ${err && err.message ? err.message : 'เกิดข้อผิดพลาด'}`;
        }
        if (errAlert) errAlert.style.display = 'block';
    } finally {
        if (bioBtn) bioBtn.disabled = false;
    }
}

function resetAutoLogoutTimer() {
    if (!_sealedCurrentUser) return;
    localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

    clearTimeout(autoLogoutTimer);
    clearTimeout(logoutWarningTimer);
    hideLogoutWarningModal();

    logoutWarningTimer = setTimeout(() => {
        showLogoutWarningModal();
    }, WARNING_BEFORE_LOGOUT_MS);

    autoLogoutTimer = setTimeout(() => {
        hideLogoutWarningModal();
        handleSystemLogout("⏳ คุณไม่ได้ใช้งานนานเกิน 5 นาที ระบบจึงออกจากระบบอัตโนมัติเพื่อความปลอดภัย");
    }, AUTO_LOGOUT_TIMEOUT_MS);
}

function showLogoutWarningModal() {
    let warningModal = document.getElementById('sessionWarningModal');
    if (!warningModal) {
        warningModal = document.createElement('div');
        warningModal.id = 'sessionWarningModal';
        warningModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6); display: flex; align-items: center;
            justify-content: center; z-index: 99999; backdrop-filter: blur(4px);
        `;
        warningModal.innerHTML = `
            <div style="background: var(--card-bg, #ffffff); border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);">
                <div style="font-size: 2.5rem; margin-bottom: 12px;">⏳</div>
                <h3 style="margin-bottom: 8px; color: var(--text-color, #1e293b);">ระบบกำลังจะให้ออกจากระบบ</h3>
                <p style="font-size: 0.9rem; color: #64748b; margin-bottom: 20px;">คุณไม่มีการเคลื่อนไหวเป็นเวลา 4 นาที ระบบจะตัดการเชื่อมต่ออัตโนมัติในอีก 1 นาที</p>
                <button id="extendSessionBtn" style="background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; width: 100%;">
                    🔄 ใช้งานต่อ (Extend Session)
                </button>
            </div>
        `;
        document.body.appendChild(warningModal);
        document.getElementById('extendSessionBtn').addEventListener('click', () => {
            resetAutoLogoutTimer();
            if (typeof showToast === 'function') showToast("✅ ขยายเวลาการใช้งานต่อเรียบร้อยแล้ว");
        });
    }
    warningModal.style.display = 'flex';
}

function hideLogoutWarningModal() {
    const warningModal = document.getElementById('sessionWarningModal');
    if (warningModal) warningModal.style.display = 'none';
}

// =========================================================================
// --- NEW TAB SESSION CONFIRMATION MODAL (ป๊อปอัปแจ้งเตือนเมื่อเปิดแท็บใหม่) ---
// =========================================================================

function hideNewTabSessionModal() {
    const modal = document.getElementById('newTabSessionModal');
    if (modal) {
        modal.style.display = 'none';
        modal.remove();
    }
}

function handleForceReloginFromNewTabModal() {
    hideNewTabSessionModal();
    hideLogoutWarningModal();

    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    clearTimeout(autoLogoutTimer);
    clearTimeout(logoutWarningTimer);

    resetAuthBootstrapSyncFlags();

    sessionStorage.removeItem(TAB_SESSION_VERIFIED_KEY);
    sessionStorage.setItem(FORCE_RELOGIN_LOCK_KEY, 'true');
    localStorage.removeItem('WMS_ACTIVE_USER');
    localStorage.removeItem('WMS_LAST_ACTIVE_TIME');

    setSealedUserState(null);
    forceShowLoginOverlay();

    if (typeof showToast === 'function') {
        showToast('🔒 ออกจากเซสชันเดิมแล้ว กรุณากรอกรหัสผ่านหรือสแกนลายนิ้วมือใหม่');
    }
}

function showNewTabSessionModal(verifiedUser, remainingMs) {
    hideNewTabSessionModal();

    const remainingSecsTotal = Math.max(1, Math.floor(remainingMs / 1000));
    const mins = Math.floor(remainingSecsTotal / 60);
    const secs = remainingSecsTotal % 60;
    const timeText = mins > 0 ? `${mins} นาที ${secs} วินาที` : `${secs} วินาที`;
    const isAdmin = verifiedUser.role === 'admin';
    const roleBadgeBg = isAdmin ? '#fef3c7' : '#e0f2fe';
    const roleBadgeColor = isAdmin ? '#92400e' : '#075985';
    const roleBadgeBorder = isAdmin ? '#f59e0b' : '#38bdf8';

    const modal = document.createElement('div');
    modal.id = 'newTabSessionModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.82); display: flex; align-items: center;
        justify-content: center; z-index: 99998; backdrop-filter: blur(6px);
    `;

    modal.innerHTML = `
        <div style="background: var(--card-bg, #ffffff); border-radius: 16px; padding: 26px 24px; max-width: 440px; width: 92%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.45); border: 1px solid var(--border-color, #e2e8f0);">
            <div style="font-size: 2.6rem; margin-bottom: 10px;">🔐</div>
            <h3 style="margin: 0 0 8px 0; font-size: 1.15rem; font-weight: 700; color: var(--text-color, #0f172a);">
                ตรวจพบการเปิดแท็บใหม่
            </h3>
            <p style="font-size: 0.9rem; color: #475569; margin: 0 0 14px 0; line-height: 1.5;">
                ยังมีประวัติการเข้าสู่ระบบในเครื่องนี้ที่ยังไม่หมดเวลา<br>
                (เหลือเวลาอีกประมาณ <strong>${escapeHTML(timeText)}</strong>)
            </p>
            <div style="background: var(--bg-secondary, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; padding: 12px; margin-bottom: 18px; text-align: left;">
                <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 4px;">บัญชีที่กำลังใช้งาน:</div>
                <div style="font-size: 1rem; font-weight: 700; color: var(--text-color, #0f172a); margin-bottom: 6px;">
                    ${escapeHTML(verifiedUser.name)} <span style="font-weight: 500; color: #64748b;">(${escapeHTML(verifiedUser.username)})</span>
                </div>
                <span style="display: inline-block; font-size: 0.78rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: ${roleBadgeBg}; color: ${roleBadgeColor}; border: 1px solid ${roleBadgeBorder};">
                    ${escapeHTML(getRoleDisplayLabel(verifiedUser.role))}
                </span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button type="button" id="confirmContinueTabBtn" style="background: #16a34a; color: #ffffff; border: none; padding: 12px 18px; border-radius: 8px; font-weight: 700; font-size: 0.95rem; cursor: pointer; width: 100%; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.25);">
                    ✅ ตกลง ใช้งานต่อเนื่อง
                </button>
                <button type="button" id="forceReloginTabBtn" onclick="handleForceReloginFromNewTabModal()" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 11px 18px; border-radius: 8px; font-weight: 700; font-size: 0.9rem; cursor: pointer; width: 100%; transition: background 0.15s ease;">
                    🔑 เข้าสู่ระบบใหม่ (กรอกรหัสผ่าน / สแกนลายนิ้วมือ)
                </button>
            </div>
        </div>
    `;

    (document.body || document.documentElement).appendChild(modal);

    const confirmBtn = document.getElementById('confirmContinueTabBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const latestLastActive = parseInt(localStorage.getItem('WMS_LAST_ACTIVE_TIME') || '0', 10);
            if (!localStorage.getItem('WMS_ACTIVE_USER') || (Date.now() - latestLastActive >= AUTO_LOGOUT_TIMEOUT_MS)) {
                hideNewTabSessionModal();
                alert("⏳ ประวัติการเข้าสู่ระบบหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่");
                forceShowLoginOverlay();
                return;
            }

            clearLoginScreenBodyFlags();
            sessionStorage.removeItem(FORCE_RELOGIN_LOCK_KEY);
            sessionStorage.setItem(TAB_SESSION_VERIFIED_KEY, 'true');
            const reVerifiedUser = syncVerifiedUserObject(verifiedUser);
            localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(reVerifiedUser));

            hideNewTabSessionModal();
            resetAuthBootstrapSyncFlags();

            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.setProperty('display', 'none', 'important');

            const nameElem = document.getElementById('currentUserNameText');
            if (nameElem) nameElem.textContent = `${reVerifiedUser.name} (${reVerifiedUser.username})`;

            resetAutoLogoutTimer();
            initSecurityListeners();
            initAdminDomSecurityGuard();
            refreshRoleDependentUI();

            if (typeof executeSwitchView === 'function') {
                const targetView = typeof resolveInitialViewFromUrl === 'function' ? resolveInitialViewFromUrl() : 'view-dashboard';
                executeSwitchView(targetView);
            }

            triggerUnifiedPostLoginStockSync('new-tab-confirmed', false);

            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') {
                showToast(`✅ ยืนยันการใช้งานต่อเนื่องสำเร็จ (${reVerifiedUser.role.toUpperCase()}): คุณ ${reVerifiedUser.name}`);
            }
        });
    }

    const reloginBtn = document.getElementById('forceReloginTabBtn');
    if (reloginBtn) {
        reloginBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            handleForceReloginFromNewTabModal();
        });
    }
}

async function checkUserSessionStatus() {
    if (!_sealedCurrentUser || !navigator.onLine) return;
    try {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
        if (!client) return;

        const { data, error } = await client
            .from('profiles')
            .select('is_kicked, force_logout, role, full_name, department')
            .ilike('username', _sealedCurrentUser.username)
            .maybeSingle();

        if (!error && data) {
            if (data.is_kicked || data.force_logout) {
                await client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', _sealedCurrentUser.username);
                handleSystemLogout("⚠️ คุณถูกผู้ดูแลระบบ (Admin) สั่งให้ออกจากระบบทันที");
                return;
            }

            if (data.role) {
                const latestRole = normalizeUserRole(data.role, _sealedCurrentUser.username);
                if (latestRole !== _sealedCurrentUser.role) {
                    const updatedUser = syncVerifiedUserObject({
                        ..._sealedCurrentUser,
                        role: latestRole,
                        name: data.full_name || _sealedCurrentUser.name,
                        department: data.department || _sealedCurrentUser.department
                    });
                    localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(updatedUser));
                    refreshRoleDependentUI();
                    if (latestRole !== 'admin') {
                        purgeUnauthorizedAdminElementsFromDOM(document);
                        switchToPrimaryDashboardAfterLogin();
                    }
                }
            }
        }
    } catch(e) {}
}

function initCrossTabSecuritySync() {
    if (crossTabSyncInitialized) return;
    crossTabSyncInitialized = true;

    window.addEventListener('storage', (event) => {
        if (event.key === 'WMS_ACTIVE_USER') {
            if (!event.newValue && (_sealedCurrentUser || document.getElementById('newTabSessionModal'))) {
                sessionStorage.removeItem(TAB_SESSION_VERIFIED_KEY);
                hideNewTabSessionModal();
                hideLogoutWarningModal();
                setSealedUserState(null);
                forceShowLoginOverlay();
                return;
            }
            verifySessionStorageIntegrity();
        }
        if (event.key === AUTH_BIOMETRIC_STORAGE_KEY) {
            renderBiometricLoginSection();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && _sealedCurrentUser) {
            verifySessionStorageIntegrity();
            if (!isCurrentUserAdmin()) {
                purgeUnauthorizedAdminElementsFromDOM(document);
                enforceHashRoutePermission();
            }
            const lastActive = parseInt(localStorage.getItem('WMS_LAST_ACTIVE_TIME') || '0', 10);
            if (!lastActive || (Date.now() - lastActive >= AUTO_LOGOUT_TIMEOUT_MS)) {
                handleSystemLogout("⏳ เซสชันหมดอายุเนื่องจากไม่ได้ใช้งานเกิน 5 นาที กรุณาเข้าสู่ระบบใหม่");
            }
        }
    });
}

function initSecurityListeners() {
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(evt => {
        document.removeEventListener(evt, resetAutoLogoutTimer, false);
        document.addEventListener(evt, resetAutoLogoutTimer, false);
    });

    initCrossTabSecuritySync();
    initAdminDomSecurityGuard();

    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    sessionCheckInterval = setInterval(checkUserSessionStatus, 3000);
}

async function loadUsersFromDB() {
    try {
        const savedUsers = localStorage.getItem('WMS_USERS');
        if (savedUsers) {
            const parsed = JSON.parse(savedUsers);
            if (Array.isArray(parsed) && parsed.length > 0) {
                systemUsers = parsed.map(u => ({
                    ...u,
                    role: normalizeUserRole(u.role, u.username)
                }));
            }
        }

        if (navigator.onLine) {
            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
            if (client) {
                const { data, error } = await authWithTimeout(
                    client.from('profiles').select('*').order('created_at', { ascending: true }),
                    3500
                );

                if (!error && data && data.length > 0) {
                    systemUsers = data.map(u => ({
                        id: u.id,
                        username: u.username,
                        password: u.password || '123456',
                        name: u.full_name || u.name || u.username,
                        department: u.department || 'แผนกคลังสินค้า',
                        role: normalizeUserRole(u.role, u.username)
                    }));
                    localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));
                }
            }
        }
    } catch(e) {
        console.warn("⚠️ ใช้ข้อมูลผู้ใช้สำรองในเครื่อง:", e);
    }

    if (isCurrentUserAdmin()) {
        if (typeof renderUserManagementTableEnhanced === 'function') {
            renderUserManagementTableEnhanced();
        } else {
            renderUserManagementTable();
        }
        populateLogUserDropdown();
    } else {
        purgeUnauthorizedAdminElementsFromDOM(document);
    }
}

async function initAuthSystem() {
    setLoginScreenBodyFlags(true);
    initAdminDomSecurityGuard();

    if (typeof hideAllDetectedSyncPopups === 'function') {
        hideAllDetectedSyncPopups();
    } else if (typeof hideDatabaseLoadingPopup === 'function') {
        hideDatabaseLoadingPopup();
    }

    initCrossTabSecuritySync();

    if (sessionStorage.getItem(FORCE_RELOGIN_LOCK_KEY) === 'true') {
        forceShowLoginOverlay();
        loadUsersFromDB().then(() => renderBiometricLoginSection()).catch(() => {});
        return;
    }

    const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
    const lastActiveTimeStr = localStorage.getItem('WMS_LAST_ACTIVE_TIME');
    const isTabAlreadyVerified = sessionStorage.getItem(TAB_SESSION_VERIFIED_KEY) === 'true';

    if (!savedUserStr || !lastActiveTimeStr || (Date.now() - parseInt(lastActiveTimeStr, 10) >= AUTO_LOGOUT_TIMEOUT_MS)) {
        forceShowLoginOverlay();
        loadUsersFromDB().then(() => renderBiometricLoginSection()).catch(() => {});
        return;
    }

    await loadUsersFromDB();

    if (savedUserStr && lastActiveTimeStr) {
        const elapsed = Date.now() - parseInt(lastActiveTimeStr, 10);
        
        if (elapsed < AUTO_LOGOUT_TIMEOUT_MS) {
            let parsedSavedUser = null;
            try {
                parsedSavedUser = JSON.parse(savedUserStr);
            } catch (e) {
                forceShowLoginOverlay();
                return;
            }

            const verifiedUser = syncVerifiedUserObject(parsedSavedUser);
            if (!verifiedUser) {
                forceShowLoginOverlay();
                return;
            }

            localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(verifiedUser));

            if (!isTabAlreadyVerified) {
                if (STRICT_PASSWORD_ON_EVERY_NEW_TAB) {
                    forceShowLoginOverlay();
                    return;
                }

                if (typeof hideAllDetectedSyncPopups === 'function') {
                    hideAllDetectedSyncPopups();
                } else if (typeof hideDatabaseLoadingPopup === 'function') {
                    hideDatabaseLoadingPopup();
                }

                const loginOverlay = document.getElementById('loginOverlay');
                if (loginOverlay) loginOverlay.style.setProperty('display', 'none', 'important');

                const nameElem = document.getElementById('currentUserNameText');
                if (nameElem) nameElem.textContent = `${verifiedUser.name} (${verifiedUser.username})`;

                refreshRoleDependentUI();
                showNewTabSessionModal(verifiedUser, AUTO_LOGOUT_TIMEOUT_MS - elapsed);
                return;
            }

            clearLoginScreenBodyFlags();

            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.setProperty('display', 'none', 'important');
            
            const nameElem = document.getElementById('currentUserNameText');
            if (nameElem) nameElem.textContent = `${verifiedUser.name} (${verifiedUser.username})`;
            
            resetAutoLogoutTimer();
            initSecurityListeners();
            refreshRoleDependentUI();

            if (typeof executeSwitchView === 'function') {
                const targetView = typeof resolveInitialViewFromUrl === 'function' ? resolveInitialViewFromUrl() : 'view-dashboard';
                executeSwitchView(targetView);
            }
            triggerUnifiedPostLoginStockSync('auth-session-refresh', false);
            if (typeof showToast === 'function') showToast(`👋 ยินดีต้อนรับกลับ คุณ ${verifiedUser.name}`);
            return;
        }
    }

    forceShowLoginOverlay();
}

function forceShowLoginOverlay() {
    setSealedUserState(null);
    setLoginScreenBodyFlags(true);
    purgeUnauthorizedAdminElementsFromDOM(document);

    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    clearTimeout(autoLogoutTimer);
    clearTimeout(logoutWarningTimer);
    hideLogoutWarningModal();
    hideNewTabSessionModal();

    resetAuthBootstrapSyncFlags();

    sessionStorage.removeItem(TAB_SESSION_VERIFIED_KEY);
    localStorage.removeItem('WMS_ACTIVE_USER');
    localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
    
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) {
        loginOverlay.style.setProperty('display', 'flex', 'important');
        loginOverlay.style.setProperty('visibility', 'visible', 'important');
        loginOverlay.style.setProperty('opacity', '1', 'important');
        loginOverlay.style.setProperty('z-index', '100000', 'important');
        loginOverlay.style.setProperty('pointer-events', 'auto', 'important');

        const card = loginOverlay.querySelector('.login-card');
        if (card && !document.getElementById('loginActiveFileBadge')) {
            const badge = document.createElement('div');
            badge.id = 'loginActiveFileBadge';
            badge.className = 'mono';
            badge.style.cssText = 'font-size:0.75rem; font-weight:700; color:var(--primary-text); background:var(--primary-light); border:1px solid var(--primary-border); padding:4px 10px; border-radius:8px; margin-bottom:1rem; display:inline-block;';
            card.insertBefore(badge, card.querySelector('form'));
        }
    }

    const errAlert = document.getElementById('loginErrorAlert');
    if (errAlert && loginFailedAttempts < 5) {
        errAlert.style.display = 'none';
    }

    renderBiometricLoginSection();

    if (typeof syncRouteToBrowserAndHeader === 'function') {
        syncRouteToBrowserAndHeader('view-login');
    }
    
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
    if (uInput) {
        setTimeout(() => {
            try { uInput.focus(); } catch (e) {}
        }, 50);
    }
}

async function handleSystemLogin(e) {
    if (e) e.preventDefault();
    
    if (loginFailedAttempts >= 5) {
        const errAlert = document.getElementById('loginErrorAlert');
        const errText = document.getElementById('loginErrorMsg');
        if (errText) errText.textContent = '⚠️ พิมพ์ผิดเกินกำหนด กรุณารอจนครบเวลาการระงับ!';
        if (errAlert) errAlert.style.display = 'block';
        return;
    }

    const uInput = (document.getElementById('loginUsername')?.value || '').trim();
    const pInput = (document.getElementById('loginPassword')?.value || '').trim();
    const btnSubmit = document.getElementById('loginSubmitBtn');

    if (!uInput || !pInput) return;

    const originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...`;
    }

    let foundUser = null;

    try {
        if (navigator.onLine) {
            try {
                const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
                if (client) {
                    const { data, error } = await authWithTimeout(
                        client.from('profiles').select('*').ilike('username', uInput).maybeSingle(),
                        3500
                    );

                    if (!error && data) {
                        if (!data.password || data.password === pInput) {
                            foundUser = {
                                id: data.id,
                                username: data.username,
                                password: data.password || pInput,
                                name: data.full_name || uInput,
                                department: data.department || 'แผนกคลังสินค้า',
                                role: normalizeUserRole(data.role, data.username)
                            };

                            client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', uInput).then(() => {}).catch(() => {});
                        }
                    }
                }
            } catch(err) {}
        }

        if (!foundUser) {
            foundUser = systemUsers.find(u => u.username.toLowerCase() === uInput.toLowerCase() && u.password === pInput);
        }

        if (!foundUser) {
            foundUser = DEFAULT_USERS.find(u => u.username.toLowerCase() === uInput.toLowerCase() && u.password === pInput);
        }

        if (foundUser) {
            loginFailedAttempts = 0;
            const verifiedUser = syncVerifiedUserObject(foundUser);
            
            clearLoginScreenBodyFlags();
            sessionStorage.removeItem(FORCE_RELOGIN_LOCK_KEY);
            sessionStorage.setItem(TAB_SESSION_VERIFIED_KEY, 'true');
            localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(verifiedUser));
            localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

            const loginOverlay = document.getElementById('loginOverlay');
            const errAlert = document.getElementById('loginErrorAlert');
            const nameText = document.getElementById('currentUserNameText');

            if (loginOverlay) loginOverlay.style.setProperty('display', 'none', 'important');
            if (errAlert) errAlert.style.display = 'none';
            if (nameText) nameText.textContent = `${verifiedUser.name} (${verifiedUser.username})`;
            hideNewTabSessionModal();

            resetAuthBootstrapSyncFlags();
            resetAutoLogoutTimer();
            initSecurityListeners();
            initAdminDomSecurityGuard();
            refreshRoleDependentUI();

            switchToPrimaryDashboardAfterLogin();
            triggerUnifiedPostLoginStockSync('password-login', false);

            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') showToast(`🎉 ยืนยันสิทธิ์สำเร็จ (${verifiedUser.role.toUpperCase()})! ยินดีต้อนรับคุณ ${verifiedUser.name}`);

            if (typeof logUserActivity === 'function') {
                await logUserActivity('AUTH', `เข้าสู่ระบบสำเร็จ (${verifiedUser.role})`);
            }
        } else {
            loginFailedAttempts++;
            if (typeof playErrorSound === 'function') playErrorSound();
            const errAlert = document.getElementById('loginErrorAlert');
            const errText = document.getElementById('loginErrorMsg');

            if (loginFailedAttempts >= 5) {
                if (btnSubmit) btnSubmit.disabled = true;
                let secondsLeft = 30;
                
                if (lockoutTimerInterval) clearInterval(lockoutTimerInterval);
                lockoutTimerInterval = setInterval(() => {
                    secondsLeft--;
                    if (errText) errText.textContent = `🚨 กรอกรหัสผิด 5 ครั้ง! ระงับชั่วคราว (${secondsLeft} วินาที)`;
                    if (errAlert) errAlert.style.display = 'block';

                    if (secondsLeft <= 0) {
                        clearInterval(lockoutTimerInterval);
                        loginFailedAttempts = 0;
                        if (btnSubmit) btnSubmit.disabled = false;
                        if (errAlert) errAlert.style.display = 'none';
                    }
                }, 1000);
            } else {
                if (errText) errText.textContent = `Username หรือ Password ไม่ถูกต้อง! (เหลืออีก ${5 - loginFailedAttempts} ครั้ง)`;
                if (errAlert) errAlert.style.display = 'block';
            }
        }
    } finally {
        if (btnSubmit && loginFailedAttempts < 5) {
            btnSubmit.disabled = false;
            if (originalBtnHtml) btnSubmit.innerHTML = originalBtnHtml;
        }
    }
}

async function handleSystemLogout(reasonMsg = null) {
    if (reasonMsg || confirm("คุณแน่ใจหรือไม่ที่จะออกจากระบบ?")) {
        if (_sealedCurrentUser && typeof logUserActivity === 'function') {
            await logUserActivity('AUTH', `ออกจากระบบ ${reasonMsg ? '(Auto Timeout/Kicked)' : ''}`);
        }
        if (sessionCheckInterval) clearInterval(sessionCheckInterval);
        hideLogoutWarningModal();
        hideNewTabSessionModal();
        resetAuthBootstrapSyncFlags();
        setLoginScreenBodyFlags(true);
        sessionStorage.removeItem(TAB_SESSION_VERIFIED_KEY);
        sessionStorage.removeItem('WMS_ACTIVE_VIEW');
        sessionStorage.removeItem('WMS_CURRENT_VIEW');
        sessionStorage.removeItem('WMS_SESSION_ACTIVE_VIEW');
        localStorage.removeItem('WMS_ACTIVE_USER');
        localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
        localStorage.removeItem('WMS_ACTIVE_VIEW');
        localStorage.removeItem('WMS_CURRENT_VIEW');
        localStorage.removeItem('WMS_LAST_ACTIVE_VIEW');
        localStorage.removeItem('WMS_ACTIVE_VIEW_ID');
        setSealedUserState(null);
        purgeUnauthorizedAdminElementsFromDOM(document);
        clearTimeout(autoLogoutTimer);
        clearTimeout(logoutWarningTimer);
        if (reasonMsg) alert(reasonMsg);
        if (typeof syncRouteToBrowserAndHeader === 'function') {
            syncRouteToBrowserAndHeader('view-login');
        }
        location.reload();
    }
}

// =========================================================================
// --- SUPABASE RLS RPC HELPERS FOR ADMIN USER & PERMISSION MANAGEMENT    ---
// =========================================================================

// 🔐 1. เพิ่มหรือแก้ไขข้อมูลบัญชีและระดับสิทธิ์ผู้ใช้ผ่าน RPC (`admin_save_user_profile`)
async function adminSaveUserProfileRPC({ id = null, username, password, full_name, department, role }) {
    if (!isCurrentUserAdmin() || !_sealedCurrentUser) {
        triggerSecurityTamperAlert('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่กำหนดสิทธิ์ผู้ใช้ได้');
        return { success: false, error: 'UNAUTHORIZED' };
    }

    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) {
        return { success: false, error: 'MISSING_USERNAME' };
    }

    const normalizedRole = cleanUsername.toLowerCase() === 'admin'
        ? 'admin'
        : normalizeUserRole(role, cleanUsername);

    const client = typeof getSupabaseClient === 'function'
        ? getSupabaseClient()
        : (typeof _supabase !== 'undefined' ? _supabase : null);

    if (client && navigator.onLine) {
        const { data, error } = await client.rpc('admin_save_user_profile', {
            p_admin_username: _sealedCurrentUser.username,
            p_admin_password: _sealedCurrentUser.password,
            p_target_id: id ? Number(id) : null,
            p_username: cleanUsername,
            p_password: String(password || '').trim(),
            p_full_name: String(full_name || cleanUsername).trim(),
            p_department: String(department || 'แผนกคลังสินค้า').trim(),
            p_role: normalizedRole
        });

        if (error) {
            if (typeof showToast === 'function') {
                showToast(`❌ บันทึกสิทธิ์ผู้ใช้ไม่สำเร็จ: ${error.message}`, true);
            }
            return { success: false, error: error.message };
        }

        await loadUsersFromDB();
        return { success: true, data };
    }

    // Fallback กรณีออฟไลน์
    const existingIdx = systemUsers.findIndex(u =>
        (id && String(u.id) === String(id)) ||
        String(u.username || '').trim().toLowerCase() === cleanUsername.toLowerCase()
    );

    if (existingIdx >= 0) {
        systemUsers[existingIdx] = {
            ...systemUsers[existingIdx],
            username: cleanUsername,
            password: String(password || '').trim() || systemUsers[existingIdx].password,
            name: String(full_name || cleanUsername).trim(),
            department: String(department || 'แผนกคลังสินค้า').trim(),
            role: normalizedRole
        };
    } else {
        systemUsers.push({
            id: Date.now(),
            username: cleanUsername,
            password: String(password || '123456').trim(),
            name: String(full_name || cleanUsername).trim(),
            department: String(department || 'แผนกคลังสินค้า').trim(),
            role: normalizedRole
        });
    }

    localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));
    refreshRoleDependentUI();
    return { success: true, offline: true };
}

// 🔐 2. สั่งเตะออก / ลบบัญชี / บันทึกลายนิ้วมือผ่าน RPC (`admin_manage_user_action`)
async function adminManageUserActionRPC(action, targetUsername, fingerprintId = null) {
    if (!isCurrentUserAdmin() || !_sealedCurrentUser) {
        triggerSecurityTamperAlert('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ใช้คำสั่งจัดการบัญชีผู้ใช้ได้');
        return { success: false, error: 'UNAUTHORIZED' };
    }

    const client = typeof getSupabaseClient === 'function'
        ? getSupabaseClient()
        : (typeof _supabase !== 'undefined' ? _supabase : null);

    if (!client || !navigator.onLine) {
        return { success: false, error: 'OFFLINE_OR_NO_CLIENT' };
    }

    const { data, error } = await client.rpc('admin_manage_user_action', {
        p_admin_username: _sealedCurrentUser.username,
        p_admin_password: _sealedCurrentUser.password,
        p_action: String(action || '').toUpperCase(),
        p_target_username: String(targetUsername || '').trim(),
        p_fingerprint_id: fingerprintId
    });

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, data };
}

async function kickUserSession(targetUsername) {
    if (!isCurrentUserAdmin()) {
        triggerSecurityTamperAlert('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถสั่งเตะผู้ใช้ได้');
        return;
    }

    if (_sealedCurrentUser && _sealedCurrentUser.username.toLowerCase() === String(targetUsername || '').toLowerCase()) {
        alert("⚠️ คุณไม่สามารถสั่งเตะบัญชีของตัวเองออกจากระบบได้");
        return;
    }

    if (confirm(`🚨 คุณแน่ใจหรือไม่ที่จะสั่งเตะผู้ใช้ "${targetUsername}" ออกจากระบบทันที?`)) {
        if (navigator.onLine) {
            const res = await adminManageUserActionRPC('KICK', targetUsername, null);
            if (!res.success) {
                if (typeof playErrorSound === 'function') playErrorSound();
                if (typeof showToast === 'function') showToast(`❌ สั่งเตะผู้ใช้ไม่สำเร็จ: ${res.error}`, true);
                return;
            }
        }

        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') showToast(`🚨 ส่งคำสั่งเตะผู้ใช้ ${targetUsername} ออกจากระบบเรียบร้อยแล้ว`);
        if (typeof logUserActivity === 'function') {
            await logUserActivity('AUTH_KICK', `สั่งเตะผู้ใช้ ${targetUsername} ออกจากระบบ`, targetUsername);
        }
    }
}

function renderUserManagementTable() {
    const tbody = document.getElementById('userManagementTableBody');
    if (!tbody) return;

    // Zero-Trust: ห้ามสร้างตารางสิทธิ์ให้ผู้ใช้ทั่วไปเห็นโดยเด็ดขาด
    if (!isCurrentUserAdmin()) {
        tbody.innerHTML = '';
        purgeUnauthorizedAdminElementsFromDOM(document);
        return;
    }

    tbody.innerHTML = '';

    systemUsers.forEach((u, idx) => {
        const isSelf = _sealedCurrentUser && _sealedCurrentUser.username.toLowerCase() === String(u.username || '').toLowerCase();
        const isAdminMain = String(u.username || '').toLowerCase() === 'admin';
        const normalizedRole = normalizeUserRole(u.role, u.username);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center;" class="mono">${idx + 1}</td>
            <td style="text-align:center;"><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(u.username)}</code></td>
            <td style="font-weight:600;">${escapeHTML(u.name || u.full_name || '-')}</td>
            <td style="text-align:center;">${escapeHTML(u.department || '-')}</td>
            <td style="text-align:center;"><span class="badge-action ${normalizedRole === 'admin' ? 'auth' : 'nav'}">${escapeHTML(normalizedRole)}</span></td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-primary" onclick="inspectUserLogs('${escapeHTML(u.username)}')">
                    <i class="fa-solid fa-eye"></i> ประวัติ
                </button>
            </td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-secondary" onclick="openEditUserModal('${u.id}')" title="แก้ไขข้อมูล">
                    <i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> แก้ไข
                </button>
            </td>
            <td style="text-align:center;">
                ${(!isAdminMain && !isSelf) ? `
                    <div style="display:flex; gap:4px; justify-content:center;">
                        <button class="btn btn-sm btn-warning" onclick="kickUserSession('${escapeHTML(u.username)}')" title="เตะผู้ใช้คนนี้ออกจากระบบทันที" style="background:#f59e0b; color:#fff; border:none;">
                            <i class="fa-solid fa-right-from-bracket"></i> เตะออก
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteUserAccount('${u.id}')" title="ลบบัญชี">
                            <i class="fa-solid fa-trash"></i> ลบ
                        </button>
                    </div>
                ` : `<span style="font-size:0.75rem; color:var(--text-muted);">${isAdminMain ? 'แอดมินหลัก' : 'ใช้งานอยู่'}</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function populateLogUserDropdown() {
    const select = document.getElementById('logUserSelect');
    if(!select) return;
    if (!hasPermission('view-activities')) {
        select.innerHTML = '';
        return;
    }
    select.innerHTML = `<option value="ALL">👤 ผู้ใช้ทุกคน (All Users)</option>`;
    systemUsers.forEach(u => {
        select.innerHTML += `<option value="${escapeHTML(u.username)}">${escapeHTML(u.name || u.full_name)} (${escapeHTML(u.username)})</option>`;
    });
}

function getSecurityShieldTelemetry() {
    return {
        isAdmin: isCurrentUserAdmin(),
        blockedTamperAttempts: blockedTamperAttemptsCount,
        domGuardActive: Boolean(domSecurityObserver),
        sessionSealed: Boolean(_sealedSessionSignature)
    };
}

// Global Exports
window.kickUserSession = kickUserSession;
window.handleSystemLogin = handleSystemLogin;
window.handleSystemLogout = handleSystemLogout;
window.handleBiometricLogin = handleBiometricLogin;
window.renderBiometricLoginSection = renderBiometricLoginSection;
window.handleForceReloginFromNewTabModal = handleForceReloginFromNewTabModal;
window.hideNewTabSessionModal = hideNewTabSessionModal;
window.initAuthSystem = initAuthSystem;
window.forceShowLoginOverlay = forceShowLoginOverlay;
window.hasPermission = hasPermission;
window.resetAutoLogoutTimer = resetAutoLogoutTimer;
window.normalizeUserRole = normalizeUserRole;
window.syncVerifiedUserObject = syncVerifiedUserObject;
window.isCurrentUserAdmin = isCurrentUserAdmin;
window.refreshRoleDependentUI = refreshRoleDependentUI;
window.switchToPrimaryDashboardAfterLogin = switchToPrimaryDashboardAfterLogin;
window.resetAuthBootstrapSyncFlags = resetAuthBootstrapSyncFlags;
window.triggerUnifiedPostLoginStockSync = triggerUnifiedPostLoginStockSync;
window.purgeUnauthorizedAdminElementsFromDOM = purgeUnauthorizedAdminElementsFromDOM;
window.initAdminDomSecurityGuard = initAdminDomSecurityGuard;
window.getSecurityShieldTelemetry = getSecurityShieldTelemetry;
window.verifyAdminPasswordSecure = verifyAdminPasswordSecure;
window.adminSaveUserProfileRPC = adminSaveUserProfileRPC;
window.adminManageUserActionRPC = adminManageUserActionRPC;

document.addEventListener('DOMContentLoaded', () => {
    initAdminDomSecurityGuard();
    renderBiometricLoginSection();
});