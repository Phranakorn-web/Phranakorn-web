// =========================================================================
// --- MODULE 9: AUTHENTICATION, USER ROLES & SECURITY ENGINE (UPDATED 100%) ---
// =========================================================================

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

let systemUsers = [...DEFAULT_USERS];
let currentUser = null;
let isAdminAuthenticatedSession = true; 
let loginFailedAttempts = 0;
let lockoutTimerInterval = null;

const AUTO_LOGOUT_TIMEOUT_MS = 5 * 60 * 1000; // 5 นาที
const WARNING_BEFORE_LOGOUT_MS = 4 * 60 * 1000; // เตือนนาทีที่ 4
let autoLogoutTimer = null;
let logoutWarningTimer = null;
let sessionCheckInterval = null;

function hasPermission(requiredViewOrPerm) {
    if (!currentUser) return false;
    const role = currentUser.role || 'user';
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['user'];
    if (permissions.includes('*')) return true;
    return permissions.includes(requiredViewOrPerm);
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

async function checkUserSessionStatus() {
    if (!currentUser || !navigator.onLine) return;
    try {
        const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
        if (!client) return;

        const { data, error } = await client
            .from('profiles')
            .select('is_kicked, force_logout')
            .ilike('username', currentUser.username)
            .maybeSingle();

        if (!error && data && (data.is_kicked || data.force_logout)) {
            await client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', currentUser.username);
            handleSystemLogout("⚠️ คุณถูกผู้ดูแลระบบ (Admin) สั่งให้ออกจากระบบทันที");
        }
    } catch(e) {}
}

function initSecurityListeners() {
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(evt => {
        document.addEventListener(evt, resetAutoLogoutTimer, false);
    });

    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    sessionCheckInterval = setInterval(checkUserSessionStatus, 3000);
}

async function loadUsersFromDB() {
    try {
        const savedUsers = localStorage.getItem('WMS_USERS');
        if (savedUsers) {
            systemUsers = JSON.parse(savedUsers);
        }

        if (navigator.onLine) {
            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
            if (client) {
                const { data, error } = await client
                    .from('profiles')
                    .select('*')
                    .order('created_at', { ascending: true });

                if (!error && data && data.length > 0) {
                    systemUsers = data.map(u => ({
                        id: u.id,
                        username: u.username,
                        password: u.password || '123456',
                        name: u.full_name || u.name || u.username,
                        department: u.department || 'แผนกคลังสินค้า',
                        role: u.role || 'user'
                    }));
                    localStorage.setItem('WMS_USERS', JSON.stringify(systemUsers));
                }
            }
        }
    } catch(e) {
        console.warn("⚠️ ใช้ข้อมูลผู้ใช้สำรองในเครื่อง:", e);
    }

    renderUserManagementTable();
    populateLogUserDropdown();
}

async function initAuthSystem() {
    await loadUsersFromDB();

    const savedUserStr = localStorage.getItem('WMS_ACTIVE_USER');
    const lastActiveTimeStr = localStorage.getItem('WMS_LAST_ACTIVE_TIME');

    if (savedUserStr && lastActiveTimeStr) {
        const elapsed = Date.now() - parseInt(lastActiveTimeStr, 10);
        
        if (elapsed < AUTO_LOGOUT_TIMEOUT_MS) {
            currentUser = JSON.parse(savedUserStr);
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
            
            const nameElem = document.getElementById('currentUserNameText');
            if (nameElem) nameElem.textContent = `${currentUser.name} (${currentUser.username})`;
            
            resetAutoLogoutTimer();
            initSecurityListeners();
            if (typeof renderSidebarMenu === 'function') renderSidebarMenu();
            if (typeof executeSwitchView === 'function') {
                const targetView = typeof resolveInitialViewFromUrl === 'function' ? resolveInitialViewFromUrl() : 'view-inventory';
                executeSwitchView(targetView);
            }
            if (typeof showToast === 'function') showToast(`👋 ยินดีต้อนรับกลับ คุณ ${currentUser.name}`);
            return;
        }
    }

    forceShowLoginOverlay();
}

function forceShowLoginOverlay() {
    currentUser = null;
    isAdminAuthenticatedSession = true;
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    hideLogoutWarningModal();
    localStorage.removeItem('WMS_ACTIVE_USER');
    localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
    
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) {
        loginOverlay.style.display = 'flex';
        const card = loginOverlay.querySelector('.login-card');
        if (card && !document.getElementById('loginActiveFileBadge')) {
            const badge = document.createElement('div');
            badge.id = 'loginActiveFileBadge';
            badge.className = 'mono';
            badge.style.cssText = 'font-size:0.75rem; font-weight:700; color:var(--primary-text); background:var(--primary-light); border:1px solid var(--primary-border); padding:4px 10px; border-radius:8px; margin-bottom:1rem; display:inline-block;';
            card.insertBefore(badge, card.querySelector('form'));
        }
    }

    // อัปเดตลิงก์ URL เป็น #auth-system และแสดงโฟลเดอร์ supabase/auth-profiles / auth-system.js บนหน้า Login
    if (typeof syncRouteToBrowserAndHeader === 'function') {
        syncRouteToBrowserAndHeader('view-login');
    }
    
    const uInput = document.getElementById('loginUsername');
    const pInput = document.getElementById('loginPassword');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
    if (uInput) uInput.focus();
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

    if (!uInput || !pInput) return;

    if (typeof showToast === 'function') showToast("⏳ กำลังตรวจสอบสิทธิ์...");

    let foundUser = null;

    if (navigator.onLine) {
        try {
            const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
            if (client) {
                const { data, error } = await client
                    .from('profiles')
                    .select('*')
                    .ilike('username', uInput)
                    .maybeSingle();

                if (!error && data) {
                    if (!data.password || data.password === pInput) {
                        foundUser = {
                            id: data.id,
                            username: data.username,
                            password: data.password || pInput,
                            name: data.full_name || uInput,
                            department: data.department || 'แผนกคลังสินค้า',
                            role: data.role || 'user'
                        };

                        await client.from('profiles').update({ is_kicked: false, force_logout: false }).ilike('username', uInput);
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
        currentUser = foundUser;
        isAdminAuthenticatedSession = true;
        
        localStorage.setItem('WMS_ACTIVE_USER', JSON.stringify(currentUser));
        localStorage.setItem('WMS_LAST_ACTIVE_TIME', Date.now().toString());

        const loginOverlay = document.getElementById('loginOverlay');
        const errAlert = document.getElementById('loginErrorAlert');
        const nameText = document.getElementById('currentUserNameText');

        if (loginOverlay) loginOverlay.style.display = 'none';
        if (errAlert) errAlert.style.display = 'none';
        if (nameText) nameText.textContent = `${currentUser.name} (${currentUser.username})`;

        resetAutoLogoutTimer();
        initSecurityListeners();
        if (typeof renderSidebarMenu === 'function') renderSidebarMenu();

        if (typeof executeSwitchView === 'function') {
            const targetView = typeof resolveInitialViewFromUrl === 'function' ? resolveInitialViewFromUrl() : 'view-inventory';
            executeSwitchView(targetView);
        }

        if (typeof playSuccessSound === 'function') playSuccessSound();
        if (typeof showToast === 'function') showToast(`🎉 ยืนยันสิทธิ์สำเร็จ! ยินดีต้อนรับคุณ ${currentUser.name}`);

        if (typeof logUserActivity === 'function') {
            await logUserActivity('AUTH', `เข้าสู่ระบบสำเร็จ (${currentUser.role})`);
        }
    } else {
        loginFailedAttempts++;
        if (typeof playErrorSound === 'function') playErrorSound();
        const btnSubmit = document.getElementById('loginSubmitBtn');
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
}

async function handleSystemLogout(reasonMsg = null) {
    if (reasonMsg || confirm("คุณแน่ใจหรือไม่ที่จะออกจากระบบ?")) {
        if (currentUser && typeof logUserActivity === 'function') {
            await logUserActivity('AUTH', `ออกจากระบบ ${reasonMsg ? '(Auto Timeout/Kicked)' : ''}`);
        }
        if (sessionCheckInterval) clearInterval(sessionCheckInterval);
        hideLogoutWarningModal();
        localStorage.removeItem('WMS_ACTIVE_USER');
        localStorage.removeItem('WMS_LAST_ACTIVE_TIME');
        currentUser = null;
        isAdminAuthenticatedSession = true;
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
    if (!currentUser || currentUser.role !== 'admin') {
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
        const isSelf = currentUser && currentUser.username === u.username;
        const isAdminMain = u.username === 'admin';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center;" class="mono">${idx + 1}</td>
            <td><code class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(u.username)}</code></td>
            <td style="font-weight:600;">${escapeHTML(u.name || u.full_name || '-')}</td>
            <td>${escapeHTML(u.department || '-')}</td>
            <td><span class="badge-action ${u.role === 'admin' ? 'auth' : 'nav'}">${escapeHTML(u.role)}</span></td>
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
window.initAuthSystem = initAuthSystem;
window.forceShowLoginOverlay = forceShowLoginOverlay;
window.hasPermission = hasPermission;
window.resetAutoLogoutTimer = resetAutoLogoutTimer;