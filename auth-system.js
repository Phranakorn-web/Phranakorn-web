// =========================================================================
// --- MODULE 9: AUTHENTICATION, USER ROLES & SECURITY ENGINE (UPDATED 100%) ---
// --- WITH HARDWARE FINGERPRINT / BIOMETRIC LOGIN & INSTANT TAB RELOGIN ---
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
const ROLE_PERMISSIONS = {
    admin: ['*'], // Access all
    manager: ['view-inventory', 'view-inbound', 'view-outbound', 'view-locations', 'view-approvals', 'view-activities'],
    user: ['view-inventory', 'view-inbound', 'view-outbound', 'view-locations'],
    viewer: ['view-inventory', 'view-locations']
};

// ตั้งค่าโหมดความปลอดภัยสำหรับการเปิดแท็บใหม่ในเครื่องเดิม:
// false = หากประวัติล็อกอินยังไม่หมดเวลา ให้เด้งป๊อปอัปแจ้งเตือนเพื่อกด "ตกลง" ใช้งานต่อเนื่อง (หรือกดเข้าสู่ระบบใหม่)
// true  = บังคับกรอกรหัสผ่านใหม่ทุกครั้งที่เปิดแท็บใหม่ 100%
const STRICT_PASSWORD_ON_EVERY_NEW_TAB = false;

const TAB_SESSION_VERIFIED_KEY = 'WMS_TAB_SESSION_VERIFIED';
const FORCE_RELOGIN_LOCK_KEY = 'WMS_FORCE_RELOGIN_REQUIRED';
const AUTH_BIOMETRIC_STORAGE_KEY = 'WMS_USER_BIOMETRICS_V1';

let systemUsers = [...DEFAULT_USERS];
let currentUser = null;
let isAdminAuthenticatedSession = true; 
let loginFailedAttempts = 0;
let lockoutTimerInterval = null;
let crossTabSyncInitialized = false;

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

function syncVerifiedUserObject(rawUser) {
    if (!rawUser || !rawUser.username) return null;

    const cleanUsername = String(rawUser.username).trim().toLowerCase();

    // ตรวจสอบข้อมูลล่าสุดจาก systemUsers (ที่โหลดมาจาก Supabase / LocalStorage) และ DEFAULT_USERS
    const matchedDbUser = systemUsers.find(u => String(u.username || '').trim().toLowerCase() === cleanUsername);
    const matchedDefaultUser = DEFAULT_USERS.find(u => String(u.username || '').trim().toLowerCase() === cleanUsername);
    const referenceUser = matchedDbUser || matchedDefaultUser || rawUser;

    const resolvedRole = normalizeUserRole(
        (matchedDbUser && matchedDbUser.role) || rawUser.role || (matchedDefaultUser && matchedDefaultUser.role),
        cleanUsername
    );

    const verifiedUser = {
        id: referenceUser.id || rawUser.id,
        username: referenceUser.username || rawUser.username,
        password: referenceUser.password || rawUser.password || '123456',
        name: referenceUser.full_name || referenceUser.name || rawUser.name || rawUser.username,
        department: referenceUser.department || rawUser.department || 'แผนกคลังสินค้า',
        role: resolvedRole
    };

    currentUser = verifiedUser;
    isAdminAuthenticatedSession = (resolvedRole === 'admin');

    // ซิงก์ค่าไปยัง window object เพื่อให้ไฟล์ JS อื่น (navigation.js / app-main.js) อ่านสิทธิ์ได้แม่นยำ 100%
    window.currentUser = verifiedUser;
    window.isAdminAuthenticatedSession = isAdminAuthenticatedSession;

    return verifiedUser;
}

function isCurrentUserAdmin() {
    if (!currentUser) return false;
    return normalizeUserRole(currentUser.role, currentUser.username) === 'admin';
}

function refreshRoleDependentUI() {
    if (typeof renderSidebarMenu === 'function') {
        renderSidebarMenu();
    }
    if (typeof renderUserManagementTableEnhanced === 'function') {
        renderUserManagementTableEnhanced();
    } else if (typeof renderUserManagementTable === 'function') {
        renderUserManagementTable();
    }
    // ป้องกันกรณี navigation.js โหลดตามหลังเสี้ยววินาที ทำให้เมนู Admin ถูกซ่อนตอนเปิดแท็บใหม่
    setTimeout(() => {
        if (currentUser && typeof renderSidebarMenu === 'function') {
            renderSidebarMenu();
        }
    }, 120);
}

function hasPermission(requiredViewOrPerm) {
    if (!currentUser) return false;
    const role = normalizeUserRole(currentUser.role, currentUser.username);
    if (role === 'admin') return true;

    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['user'];
    if (permissions.includes('*')) return true;
    return permissions.includes(requiredViewOrPerm);
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

// 🎨 สร้างและอัปเดตปุ่ม "เข้าสู่ระบบด้วยลายนิ้วมือ" บนหน้า Login (สะอาด ปลอดภัย ไม่แสดงรายชื่อบัญชีที่ลงทะเบียน)
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

    // ตรวจสอบว่าผู้ใช้พิมพ์ระบุบัญชีในช่อง Username หรือไม่ หากไม่ได้พิมพ์ให้ตรวจจับอัตโนมัติจากลายนิ้วมือที่สแกน
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

        // ดึงข้อมูลบัญชีล่าสุดจาก Supabase (ถ้าออนไลน์) พร้อมจำกัดเวลารอเพื่อความรวดเร็ว
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

        // ยืนยันตัวตนสำเร็จ: ตั้งค่า Session และสิทธิ์ 100%
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

        resetAutoLogoutTimer();
        initSecurityListeners();
        refreshRoleDependentUI();

        // สลับมาที่หน้าแดชบอร์ดเป็นหน้าหลักแรกสุดทุกครั้งหลังล็อกอินสำเร็จ
        switchToPrimaryDashboardAfterLogin();

        // ซิงค์ฐานข้อมูลออนไลน์หลังจากเข้าสู่ระบบสำเร็จ
        if (typeof runFastPostLoginInitialSync === 'function') {
            runFastPostLoginInitialSync();
        }

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
    if (!currentUser) return;
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

// 🚪 ฟังก์ชันดีดออกจากเซสชันเดิมทันทีเมื่อกดปุ่ม "เข้าสู่ระบบใหม่ (กรอกรหัสผ่าน / สแกนลายนิ้วมือ)" บนหน้าเปิดแท็บใหม่
function handleForceReloginFromNewTabModal() {
    // 1. ปิดและลบ Modal แจ้งเตือนเปิดแท็บใหม่ออกจากหน้าจอทันที
    hideNewTabSessionModal();
    hideLogoutWarningModal();

    // 2. ล้างประวัติเซสชันที่ค้างอยู่ทั้งหมด เพื่อให้ระบบดีดออกไปหน้าล็อกอิน 100%
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    clearTimeout(autoLogoutTimer);
    clearTimeout(logoutWarningTimer);

    if (typeof resetInitialDbSyncPopupState === 'function') {
        resetInitialDbSyncPopupState();
    }

    sessionStorage.removeItem(TAB_SESSION_VERIFIED_KEY);
    sessionStorage.setItem(FORCE_RELOGIN_LOCK_KEY, 'true');
    localStorage.removeItem('WMS_ACTIVE_USER');
    localStorage.removeItem('WMS_LAST_ACTIVE_TIME');

    currentUser = null;
    window.currentUser = null;
    isAdminAuthenticatedSession = false;
    window.isAdminAuthenticatedSession = false;

    // 3. บังคับแสดงหน้าจอ Login (ช่องกรอกรหัสผ่าน + ปุ่มสแกนลายนิ้วมือ) ขึ้นมาทันที
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

            // ยืนยันแท็บปัจจุบันแล้ว และรีเฟรชสิทธิ์จากฐานข้อมูลล่าสุด (ซิงค์เบื้องหลังโดยไม่เด้งป๊อปอัปซ้ำ)
            clearLoginScreenBodyFlags();
            sessionStorage.removeItem(FORCE_RELOGIN_LOCK_KEY);
            sessionStorage.setItem(TAB_SESSION_VERIFIED_KEY, 'true');
            const reVerifiedUser = syncVerifiedUserObject(verifiedUser);
            localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(reVerifiedUser));

            hideNewTabSessionModal();

            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.setProperty('display', 'none', 'important');

            const nameElem = document.getElementById('currentUserNameText');
            if (nameElem) nameElem.textContent = `${reVerifiedUser.name} (${reVerifiedUser.username})`;

            resetAutoLogoutTimer();
            initSecurityListeners();
            refreshRoleDependentUI();

            if (typeof executeSwitchView === 'function') {
                const targetView = typeof resolveInitialViewFromUrl === 'function' ? resolveInitialViewFromUrl() : 'view-dashboard';
                executeSwitchView(targetView);
            }

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
    if (!currentUser || !navigator.onLine) return;
    try {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
        if (!client) return;

        const { data, error } = await client
            .from('profiles')
            .select('is_kicked, force_logout, role, full_name, department')
            .ilike('username', currentUser.username)
            .maybeSingle();

        if (!error && data) {
            if (data.is_kicked || data.force_logout) {
                await client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', currentUser.username);
                handleSystemLogout("⚠️ คุณถูกผู้ดูแลระบบ (Admin) สั่งให้ออกจากระบบทันที");
                return;
            }

            // อัปเดตสิทธิ์อัตโนมัติหากมีการเปลี่ยน Role ในฐานข้อมูลระหว่างใช้งาน
            if (data.role) {
                const latestRole = normalizeUserRole(data.role, currentUser.username);
                if (latestRole !== currentUser.role) {
                    const updatedUser = syncVerifiedUserObject({
                        ...currentUser,
                        role: latestRole,
                        name: data.full_name || currentUser.name,
                        department: data.department || currentUser.department
                    });
                    localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(updatedUser));
                    refreshRoleDependentUI();
                }
            }
        }
    } catch(e) {}
}

function initCrossTabSecuritySync() {
    if (crossTabSyncInitialized) return;
    crossTabSyncInitialized = true;

    // ตรวจจับการออกจากระบบจากแท็บอื่นแบบเรียลไทม์
    window.addEventListener('storage', (event) => {
        if (event.key === 'WMS_ACTIVE_USER' && !event.newValue && (currentUser || document.getElementById('newTabSessionModal'))) {
            sessionStorage.removeItem(TAB_SESSION_VERIFIED_KEY);
            hideNewTabSessionModal();
            hideLogoutWarningModal();
            currentUser = null;
            window.currentUser = null;
            forceShowLoginOverlay();
        }
        // อัปเดตปุ่มสแกนลายนิ้วมือทันทีหากมีการลงทะเบียน/ลบลายนิ้วมือจากแท็บอื่น
        if (event.key === AUTH_BIOMETRIC_STORAGE_KEY) {
            renderBiometricLoginSection();
        }
    });

    // ตรวจสอบเวลาหมดอายุทันทีเมื่อสลับกลับมาที่แท็บนี้
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && currentUser) {
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

    if (typeof renderUserManagementTableEnhanced === 'function') {
        renderUserManagementTableEnhanced();
    } else {
        renderUserManagementTable();
    }
    populateLogUserDropdown();
}

async function initAuthSystem() {
    // ล็อกสถานะยังไม่ยืนยันตัวตนตั้งแต่เริ่มต้น เพื่อป้องกันป๊อปอัปซิงค์ฐานข้อมูลเด้งบดบังหน้าจอระหว่างโหลด
    setLoginScreenBodyFlags(true);
    if (typeof hideAllDetectedSyncPopups === 'function') {
        hideAllDetectedSyncPopups();
    } else if (typeof hideDatabaseLoadingPopup === 'function') {
        hideDatabaseLoadingPopup();
    }

    initCrossTabSecuritySync();

    // ตรวจสอบเซสชันที่มีอยู่ในเครื่องก่อน เพื่อแสดงหน้าล็อกอินทันทีโดยไม่ต้องรอโหลด Supabase
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

            // ตรวจสอบและอัปเดตสิทธิ์ (Admin / User) จากฐานข้อมูลล่าสุด 100%
            const verifiedUser = syncVerifiedUserObject(parsedSavedUser);
            if (!verifiedUser) {
                forceShowLoginOverlay();
                return;
            }

            localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(verifiedUser));

            // กรณีเปิดแท็บใหม่ (sessionStorage ของแท็บใหม่ยังไม่มีค่า TAB_SESSION_VERIFIED_KEY)
            if (!isTabAlreadyVerified) {
                if (STRICT_PASSWORD_ON_EVERY_NEW_TAB) {
                    forceShowLoginOverlay();
                    return;
                }

                // ซ่อนป๊อปอัปซิงค์ฐานข้อมูลระหว่างเปิดหน้าต่างยืนยันแท็บใหม่ (ให้ซิงค์ในเบื้องหลังเท่านั้น)
                if (typeof hideAllDetectedSyncPopups === 'function') {
                    hideAllDetectedSyncPopups();
                } else if (typeof hideDatabaseLoadingPopup === 'function') {
                    hideDatabaseLoadingPopup();
                }

                // ซ่อนหน้าล็อกอินหลักชั่วคราว และแสดงป๊อปอัปแจ้งเตือนให้กด "ตกลง" เพื่อใช้งานต่อเนื่อง หรือกด "เข้าสู่ระบบใหม่"
                const loginOverlay = document.getElementById('loginOverlay');
                if (loginOverlay) loginOverlay.style.setProperty('display', 'none', 'important');

                const nameElem = document.getElementById('currentUserNameText');
                if (nameElem) nameElem.textContent = `${verifiedUser.name} (${verifiedUser.username})`;

                refreshRoleDependentUI();
                showNewTabSessionModal(verifiedUser, AUTO_LOGOUT_TIMEOUT_MS - elapsed);
                return;
            }

            // กรณีรีเฟรชหน้าเว็บในแท็บเดิมที่ยืนยันตัวตนแล้ว
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
            if (typeof showToast === 'function') showToast(`👋 ยินดีต้อนรับกลับ คุณ ${verifiedUser.name}`);
            return;
        }
    }

    // กรณีเข้าครั้งแรก / เปิดเบราว์เซอร์อื่น / ประวัติการล็อกอินหมดเวลา -> บังคับใส่รหัสผ่านหรือสแกนลายนิ้วมือที่ลงทะเบียนไว้
    forceShowLoginOverlay();
}

function forceShowLoginOverlay() {
    currentUser = null;
    window.currentUser = null;
    isAdminAuthenticatedSession = false;
    window.isAdminAuthenticatedSession = false;

    setLoginScreenBodyFlags(true);

    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    clearTimeout(autoLogoutTimer);
    clearTimeout(logoutWarningTimer);
    hideLogoutWarningModal();
    hideNewTabSessionModal();

    if (typeof resetInitialDbSyncPopupState === 'function') {
        resetInitialDbSyncPopupState();
    } else if (typeof hideAllDetectedSyncPopups === 'function') {
        hideAllDetectedSyncPopups();
    } else if (typeof hideDatabaseLoadingPopup === 'function') {
        hideDatabaseLoadingPopup();
    }

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

    // แสดงปุ่มเข้าสู่ระบบด้วยลายนิ้วมือแบบสะอาด ไม่เปิดเผยชื่อบัญชีที่ลงทะเบียน
    renderBiometricLoginSection();

    // อัปเดตลิงก์ URL เป็น #auth-system และแสดงโฟลเดอร์ supabase/auth-profiles / auth-system.js บนหน้า Login
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
            
            // บันทึกสถานะยืนยันตัวตนของแท็บปัจจุบันและเวลาใช้งานล่าสุด
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

            resetAutoLogoutTimer();
            initSecurityListeners();
            refreshRoleDependentUI();

            // สลับมาที่หน้าแดชบอร์ดเป็นหน้าหลักแรกสุดทุกครั้งหลังล็อกอินสำเร็จ
            switchToPrimaryDashboardAfterLogin();

            // ซิงค์ฐานข้อมูลออนไลน์หลังจากเข้าสู่ระบบสำเร็จ
            if (typeof runFastPostLoginInitialSync === 'function') {
                runFastPostLoginInitialSync();
            }

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
        if (currentUser && typeof logUserActivity === 'function') {
            await logUserActivity('AUTH', `ออกจากระบบ ${reasonMsg ? '(Auto Timeout/Kicked)' : ''}`);
        }
        if (sessionCheckInterval) clearInterval(sessionCheckInterval);
        hideLogoutWarningModal();
        hideNewTabSessionModal();
        if (typeof resetInitialDbSyncPopupState === 'function') {
            resetInitialDbSyncPopupState();
        }
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
        currentUser = null;
        window.currentUser = null;
        isAdminAuthenticatedSession = false;
        window.isAdminAuthenticatedSession = false;
        clearTimeout(autoLogoutTimer);
        clearTimeout(logoutWarningTimer);
        if (reasonMsg) alert(reasonMsg);
        if (typeof syncRouteToBrowserAndHeader === 'function') {
            syncRouteToBrowserAndHeader('view-login');
        }
        location.reload();
    }
}

async function kickUserSession(targetUsername) {
    if (!isCurrentUserAdmin()) {
        alert("⚠️ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถใช้คำสั่งนี้ได้");
        return;
    }

    if (currentUser.username.toLowerCase() === targetUsername.toLowerCase()) {
        alert("⚠️ คุณไม่สามารถสั่งเตะบัญชีของตัวเองออกจากระบบได้");
        return;
    }

    if (confirm(`🚨 คุณแน่ใจหรือไม่ที่จะสั่งเตะผู้ใช้ "${targetUsername}" ออกจากระบบทันที?`)) {
        if (navigator.onLine) {
            try {
                const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
                if (client) {
                    await client.from('profiles').update({ is_kicked: true, force_logout: true }).ilike('username', targetUsername);
                }
            } catch(e) {}
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
    tbody.innerHTML = '';

    systemUsers.forEach((u, idx) => {
        const isSelf = currentUser && currentUser.username.toLowerCase() === String(u.username || '').toLowerCase();
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
    select.innerHTML = `<option value="ALL">👤 ผู้ใช้ทุกคน (All Users)</option>`;
    systemUsers.forEach(u => {
        select.innerHTML += `<option value="${escapeHTML(u.username)}">${escapeHTML(u.name || u.full_name)} (${escapeHTML(u.username)})</option>`;
    });
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

document.addEventListener('DOMContentLoaded', () => {
    renderBiometricLoginSection();
});