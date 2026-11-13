// =========================================================================
// --- MODULE 7: USER ACTIVITIES LOGS DATABASE ENGINE (PRO EDITION) ---
// =========================================================================

// 1. Safe Escape HTML Helper (ป้องกันช่องโหว่ XSS 100%)
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

// 2. Secure Dynamic Supabase Instance Getter (ไม่เปิดเผย Key/URL ในโค้ด)
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) {
        return _supabase;
    }
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_CLIENT) {
        return window.ENV.SUPABASE_CLIENT;
    }
    return null;
}

// 3. การตั้งค่าระบบและค่าคงที่หลัก
const ACTIVITY_CONFIG = {
    DEFAULT_PAGE_SIZE: 25,
    PAGE_SIZE_OPTIONS: [10, 25, 50, 100, 200, 500, 'ALL'],
    CACHE_KEY: 'wms_user_activity_logs_cache_v2',
    PREFS_KEY: 'wms_user_activity_logs_prefs_v2',
    MAX_CACHE_ITEMS: 600,
    DB_FETCH_LIMIT: 1000,
    FETCH_COOLDOWN_MS: 2500,
    SEARCH_DEBOUNCE_MS: 140,
    ACTION_META: {
        INBOUND:  { label: 'รับเข้า (INBOUND)',   badge: 'inbound',  icon: '📥' },
        OUTBOUND: { label: 'จ่ายออก (OUTBOUND)',  badge: 'outbound', icon: '📤' },
        RELOCATE: { label: 'ย้ายจุด (RELOCATE)',  badge: 'relocate', icon: '🔄' },
        UPDATE:   { label: 'แก้ไข (UPDATE)',      badge: 'update',   icon: '✏️' },
        DELETE:   { label: 'ลบข้อมูล (DELETE)',   badge: 'delete',   icon: '🗑️' },
        AUTH:     { label: 'เข้าสู่ระบบ (AUTH)',   badge: 'auth',     icon: '🔐' },
        SYSTEM:   { label: 'ระบบ (SYSTEM)',       badge: 'nav',      icon: '⚙️' }
    }
};

// 4. ตัวแปรสถานะส่วนกลาง (คงชื่อตัวแปรเดิมไว้ครบถ้วน 100%)
let globalActivityLogs = [];
let currentInspectedUserLogs = [];
let currentInspectedUser = null;

let filteredActivityLogs = [];
let isFetchingActivityLogs = false;
let lastActivityFetchTime = 0;
let lastRenderedSignature = '';
let activitySearchTimer = null;

let activityFilterState = {
    search: '',
    user: 'ALL',
    type: 'ALL',
    role: 'ALL',
    datePreset: 'ALL',
    dateFrom: '',
    dateTo: '',
    onlyWithSn: false,
    sortBy: 'created_at',
    sortDir: 'desc',
    page: 1,
    pageSize: ACTIVITY_CONFIG.DEFAULT_PAGE_SIZE // ค่าเริ่มต้น 25 รายการ
};

// =========================================================================
// --- 5. HELPER UTILITIES (STORAGE, DATE, HIGHLIGHT, CLIPBOARD, TOAST) ---
// =========================================================================

function safeActivityStorageGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function safeActivityStorageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // กรณีพื้นที่เต็มหรือ Safari Private Mode ให้ข้ามอย่างปลอดภัย
    }
}

function hydrateActivityLogsFromCache() {
    if (globalActivityLogs.length > 0) return;
    const cached = safeActivityStorageGet(ACTIVITY_CONFIG.CACHE_KEY, []);
    if (Array.isArray(cached) && cached.length > 0) {
        globalActivityLogs = cached;
    }
    const savedPrefs = safeActivityStorageGet(ACTIVITY_CONFIG.PREFS_KEY, null);
    if (savedPrefs && typeof savedPrefs === 'object') {
        if (savedPrefs.pageSize === 'ALL' || (Number.isInteger(savedPrefs.pageSize) && savedPrefs.pageSize > 0)) {
            activityFilterState.pageSize = savedPrefs.pageSize;
        }
    }
}

function saveActivityLogsToCache(logs) {
    if (!Array.isArray(logs)) return;
    const trimmed = logs.slice(0, ACTIVITY_CONFIG.MAX_CACHE_ITEMS);
    safeActivityStorageSet(ACTIVITY_CONFIG.CACHE_KEY, trimmed);
}

function saveActivityUserPrefs() {
    safeActivityStorageSet(ACTIVITY_CONFIG.PREFS_KEY, {
        pageSize: activityFilterState.pageSize
    });
}

function parseSafeDate(dateInput) {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
}

function formatThaiDateTime(dateInput) {
    const d = parseSafeDate(dateInput);
    if (!d) return '-';
    try {
        return d.toLocaleString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch (e) {
        return d.toLocaleString('th-TH');
    }
}

function formatRelativeTimeTH(dateInput) {
    const d = parseSafeDate(dateInput);
    if (!d) return '';
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 0) return 'เมื่อสักครู่';
    if (diffSec < 60) return 'เมื่อสักครู่';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} ชม.ที่แล้ว`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return 'เมื่อวาน';
    if (diffDay < 30) return `${diffDay} วันที่แล้ว`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth} เดือนที่แล้ว`;
    return `${Math.floor(diffMonth / 12)} ปีที่แล้ว`;
}

// ไฮไลต์คำค้นหาแบบปลอดภัย 100% ป้องกัน XSS
function highlightMatchSafe(rawText, searchQuery) {
    const text = rawText === null || rawText === undefined ? '' : String(rawText);
    if (!text) return '-';
    const query = (searchQuery || '').trim();
    if (!query) return escapeHTML(text);

    const tokens = query
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (tokens.length === 0) return escapeHTML(text);

    const regex = new RegExp(`(${tokens.join('|')})`, 'gi');
    const parts = text.split(regex);
    const lowerTokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    return parts.map(part => {
        if (lowerTokens.includes(part.toLowerCase())) {
            return `<mark class="act-highlight">${escapeHTML(part)}</mark>`;
        }
        return escapeHTML(part);
    }).join('');
}

function copyTextSafe(text) {
    if (!text || text === '-') return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showActivityToast(`คัดลอก "${text}" เรียบร้อยแล้ว`);
        }).catch(() => {
            fallbackCopyText(text);
        });
    } else {
        fallbackCopyText(text);
    }
}

function fallbackCopyText(text) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.setAttribute('readonly', '');
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showActivityToast(`คัดลอก "${text}" เรียบร้อยแล้ว`);
    } catch (e) {
        // ข้ามหากอุปกรณ์บล็อกการคัดลอก
    }
}

function showActivityToast(message) {
    let toast = document.getElementById('activityLogsToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'activityLogsToast';
        toast.className = 'act-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2200);
}

// =========================================================================
// --- 6. CORE DATABASE LOGGING & LOADING (FAST + OPTIMISTIC + OFFLINE) ---
// =========================================================================

async function logUserActivity(actionType, description, targetSn = null) {
    if (typeof currentUser === 'undefined' || !currentUser) return;

    const payload = {
        username: currentUser.username,
        full_name: currentUser.name || currentUser.username,
        role: currentUser.role || 'user',
        action_type: actionType,
        description: description,
        target_sn: targetSn,
        created_at: new Date().toISOString()
    };

    // อัปเดตแคชในเครื่องทันที (Optimistic UI) เพื่อความรวดเร็ว 0ms เวลากดสลับหน้า
    hydrateActivityLogsFromCache();
    globalActivityLogs.unshift(payload);
    if (globalActivityLogs.length > ACTIVITY_CONFIG.DB_FETCH_LIMIT) {
        globalActivityLogs.length = ACTIVITY_CONFIG.DB_FETCH_LIMIT;
    }
    saveActivityLogsToCache(globalActivityLogs);

    // หากตารางกำลังเปิดอยู่ ให้รีเฟรชการแสดงผลทันที
    if (document.getElementById('activityLogsTableBody')) {
        populateActivityFilterOptions(globalActivityLogs);
        filterActivityLogs(false);
    }

    if (navigator.onLine) {
        try {
            const client = getSupabaseClient();
            if (client) {
                const { error } = await client.from('user_activities').insert([payload]);
                if (!error) return;
            }
        } catch (e) {
            // จัดการข้อผิดพลาดอย่างปลอดภัย ไม่เปิดเผยโครงสร้างฐานข้อมูล
        }
    }

    // กรณีออฟไลน์หรือส่งไม่สำเร็จ ให้เก็บลงคิวออฟไลน์
    if (typeof offlineActivityQueue !== 'undefined' && Array.isArray(offlineActivityQueue)) {
        offlineActivityQueue.push(payload);
    }
    if (typeof persistQueue === 'function') {
        persistQueue();
    }
}

async function syncOfflineActivityQueue() {
    if (!navigator.onLine) return;
    if (typeof offlineActivityQueue === 'undefined' || !Array.isArray(offlineActivityQueue) || offlineActivityQueue.length === 0) {
        return;
    }
    try {
        const client = getSupabaseClient();
        if (!client) return;
        const batch = [...offlineActivityQueue];
        const { error } = await client.from('user_activities').insert(batch);
        if (!error) {
            offlineActivityQueue.length = 0;
            if (typeof persistQueue === 'function') persistQueue();
        }
    } catch (e) {
        // ข้ามและรอซิงก์รอบถัดไป
    }
}

async function loadUserActivityLogsFromDB(forceRefresh = false) {
    ensureActivityLogsEnhancedUI();
    hydrateActivityLogsFromCache();

    const tbody = document.getElementById('activityLogsTableBody');

    // 1. แสดงข้อมูลจากแคชทันที (0ms) เพื่อให้หน้าเว็บตอบสนองทันใจ 100%
    if (globalActivityLogs.length > 0) {
        populateActivityFilterOptions(globalActivityLogs);
        filterActivityLogs(false);
    } else if (tbody && tbody.children.length === 0) {
        renderActivitySkeletonRows(tbody);
    }

    // ป้องกันการเรียกซ้ำถี่เกินไปหากเพิ่งโหลดเสร็จ
    const now = Date.now();
    if (!forceRefresh && (now - lastActivityFetchTime) < ACTIVITY_CONFIG.FETCH_COOLDOWN_MS && globalActivityLogs.length > 0) {
        updateActivitySyncStatus('ข้อมูลล่าสุดแล้ว');
        return;
    }

    if (!navigator.onLine) {
        updateActivitySyncStatus('โหมดออฟไลน์ (แสดงข้อมูลจากแคช)');
        if (globalActivityLogs.length === 0 && tbody) {
            renderActivityLogsTable([]);
        }
        return;
    }

    if (isFetchingActivityLogs) return;
    isFetchingActivityLogs = true;
    setActivityRefreshLoading(true);

    try {
        const client = getSupabaseClient();
        if (!client) return;

        await syncOfflineActivityQueue();

        const { data, error } = await client
            .from('user_activities')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(ACTIVITY_CONFIG.DB_FETCH_LIMIT);

        if (!error && Array.isArray(data)) {
            lastActivityFetchTime = Date.now();
            globalActivityLogs = data;
            saveActivityLogsToCache(data);
            populateActivityFilterOptions(globalActivityLogs);
            filterActivityLogs(false);

            const timeLabel = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            updateActivitySyncStatus(`อัปเดตล่าสุด ${timeLabel}`);
        }
    } catch (e) {
        // ซ่อนรายละเอียด Exception ภายในระบบเพื่อความปลอดภัย
        updateActivitySyncStatus('แสดงข้อมูลจากแคช');
    } finally {
        isFetchingActivityLogs = false;
        setActivityRefreshLoading(false);
    }
}

function renderActivitySkeletonRows(tbody) {
    if (!tbody) return;
    let rows = '';
    for (let i = 0; i < 6; i++) {
        rows += `
            <tr class="act-skeleton-row">
                <td><div class="act-skel" style="width:24px;margin:auto;"></div></td>
                <td><div class="act-skel" style="width:110px;"></div></td>
                <td><div class="act-skel" style="width:130px;"></div></td>
                <td><div class="act-skel" style="width:82px;"></div></td>
                <td><div class="act-skel" style="width:85%;"></div></td>
                <td><div class="act-skel" style="width:95px;"></div></td>
            </tr>
        `;
    }
    tbody.innerHTML = rows;
}

function setActivityRefreshLoading(isLoading) {
    const btn = document.getElementById('actRefreshBtn');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle('is-spinning', isLoading);
}

function updateActivitySyncStatus(text) {
    const el = document.getElementById('actSyncStatusText');
    if (el) el.textContent = text;
}

// =========================================================================
// --- 7. DYNAMIC DROPDOWNS & MULTI-DIMENSIONAL FILTER ENGINE ---
// =========================================================================

function populateActivityFilterOptions(logs) {
    if (!Array.isArray(logs)) return;

    // 7.1 อัปเดตรายชื่อผู้ใช้งาน (#logUserSelect)
    const userSelect = document.getElementById('logUserSelect');
    if (userSelect) {
        const currentVal = userSelect.value || activityFilterState.user || 'ALL';
        const userMap = new Map();

        logs.forEach(log => {
            if (!log.username) return;
            const existing = userMap.get(log.username);
            if (existing) {
                existing.count += 1;
                if (!existing.fullName && log.full_name) existing.fullName = log.full_name;
            } else {
                userMap.set(log.username, {
                    username: log.username,
                    fullName: log.full_name || log.username,
                    count: 1
                });
            }
        });

        const sortedUsers = Array.from(userMap.values()).sort((a, b) =>
            a.fullName.localeCompare(b.fullName, 'th')
        );

        let userHtml = `<option value="ALL">👤 ผู้ใช้งานทั้งหมด (${sortedUsers.length} คน)</option>`;
        sortedUsers.forEach(u => {
            const label = u.fullName !== u.username
                ? `${u.fullName} (@${u.username}) [${u.count}]`
                : `${u.username} [${u.count}]`;
            userHtml += `<option value="${escapeHTML(u.username)}">${escapeHTML(label)}</option>`;
        });

        userSelect.innerHTML = userHtml;
        if (Array.from(userSelect.options).some(opt => opt.value === currentVal)) {
            userSelect.value = currentVal;
        } else {
            userSelect.value = 'ALL';
            activityFilterState.user = 'ALL';
        }
    }

    // 7.2 อัปเดตประเภทกิจกรรม (#logTypeSelect)
    const typeSelect = document.getElementById('logTypeSelect');
    if (typeSelect) {
        const currentType = typeSelect.value || activityFilterState.type || 'ALL';
        const typeCounts = new Map();

        // ใส่ประเภทมาตรฐานไว้ก่อนเพื่อให้เลือกได้เสมอ
        Object.keys(ACTIVITY_CONFIG.ACTION_META).forEach(k => typeCounts.set(k, 0));
        logs.forEach(log => {
            if (!log.action_type) return;
            const key = String(log.action_type).toUpperCase();
            typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
        });

        let typeHtml = `<option value="ALL">🏷️ ประเภทกิจกรรมทั้งหมด (${logs.length})</option>`;
        typeCounts.forEach((count, key) => {
            if (count > 0 || ACTIVITY_CONFIG.ACTION_META[key]) {
                const meta = ACTIVITY_CONFIG.ACTION_META[key];
                const label = meta ? `${meta.icon} ${meta.label}` : `📌 ${key}`;
                typeHtml += `<option value="${escapeHTML(key)}">${escapeHTML(label)} (${count})</option>`;
            }
        });

        typeSelect.innerHTML = typeHtml;
        if (Array.from(typeSelect.options).some(opt => opt.value === currentType)) {
            typeSelect.value = currentType;
        }
    }

    // 7.3 อัปเดตตัวกรองบทบาทผู้ใช้ (#logRoleSelect)
    const roleSelect = document.getElementById('logRoleSelect');
    if (roleSelect) {
        const currentRole = roleSelect.value || activityFilterState.role || 'ALL';
        const roles = new Set();
        logs.forEach(log => {
            if (log.role) roles.add(String(log.role).toLowerCase());
        });

        let roleHtml = `<option value="ALL">🛡️ ทุกบทบาท (Role)</option>`;
        Array.from(roles).sort().forEach(r => {
            roleHtml += `<option value="${escapeHTML(r)}">บทบาท: ${escapeHTML(r.toUpperCase())}</option>`;
        });

        roleSelect.innerHTML = roleHtml;
        if (Array.from(roleSelect.options).some(opt => opt.value === currentRole)) {
            roleSelect.value = currentRole;
        }
    }
}

function applyActivityDatePreset(preset) {
    activityFilterState.datePreset = preset;
    const now = new Date();
    const toISODateLocal = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    let fromStr = '';
    let toStr = '';

    if (preset === 'TODAY') {
        fromStr = toISODateLocal(now);
        toStr = toISODateLocal(now);
    } else if (preset === 'YESTERDAY') {
        const yest = new Date(now);
        yest.setDate(now.getDate() - 1);
        fromStr = toISODateLocal(yest);
        toStr = toISODateLocal(yest);
    } else if (preset === '7D') {
        const d7 = new Date(now);
        d7.setDate(now.getDate() - 6);
        fromStr = toISODateLocal(d7);
        toStr = toISODateLocal(now);
    } else if (preset === '30D') {
        const d30 = new Date(now);
        d30.setDate(now.getDate() - 29);
        fromStr = toISODateLocal(d30);
        toStr = toISODateLocal(now);
    } else if (preset === 'THIS_MONTH') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        fromStr = toISODateLocal(firstDay);
        toStr = toISODateLocal(now);
    }

    activityFilterState.dateFrom = fromStr;
    activityFilterState.dateTo = toStr;

    const fromInput = document.getElementById('logDateFrom');
    const toInput = document.getElementById('logDateTo');
    if (fromInput) fromInput.value = fromStr;
    if (toInput) toInput.value = toStr;

    syncQuickPillActiveStates();
    filterActivityLogs(true);
}

function syncQuickPillActiveStates() {
    document.querySelectorAll('[data-act-type-pill]').forEach(btn => {
        const val = btn.getAttribute('data-act-type-pill');
        btn.classList.toggle('active', val === activityFilterState.type);
    });
    document.querySelectorAll('[data-act-date-pill]').forEach(btn => {
        const val = btn.getAttribute('data-act-date-pill');
        btn.classList.toggle('active', val === activityFilterState.datePreset);
    });
}

function filterActivityLogs(resetPage = true) {
    // อ่านค่าล่าสุดจาก DOM หากมีการเปลี่ยนแปลง
    const searchInput = document.getElementById('logSearchInput');
    const userSelect = document.getElementById('logUserSelect');
    const typeSelect = document.getElementById('logTypeSelect');
    const roleSelect = document.getElementById('logRoleSelect');
    const dateFromInput = document.getElementById('logDateFrom');
    const dateToInput = document.getElementById('logDateTo');
    const snOnlyCheckbox = document.getElementById('logSnOnlyCheckbox');

    if (searchInput) activityFilterState.search = searchInput.value.trim().toLowerCase();
    if (userSelect) activityFilterState.user = userSelect.value || 'ALL';
    if (typeSelect) activityFilterState.type = typeSelect.value || 'ALL';
    if (roleSelect) activityFilterState.role = roleSelect.value || 'ALL';
    if (dateFromInput) activityFilterState.dateFrom = dateFromInput.value || '';
    if (dateToInput) activityFilterState.dateTo = dateToInput.value || '';
    if (snOnlyCheckbox) activityFilterState.onlyWithSn = !!snOnlyCheckbox.checked;

    if (resetPage) {
        activityFilterState.page = 1;
    }

    const searchTokens = activityFilterState.search
        ? activityFilterState.search.split(/\s+/).filter(Boolean)
        : [];

    const fromTime = activityFilterState.dateFrom
        ? new Date(`${activityFilterState.dateFrom}T00:00:00`).getTime()
        : null;
    const toTime = activityFilterState.dateTo
        ? new Date(`${activityFilterState.dateTo}T23:59:59.999`).getTime()
        : null;

    // กรองข้อมูลทั้งหมดตามเงื่อนไขที่เลือก
    const filtered = globalActivityLogs.filter(log => {
        // 1. กรองตามผู้ใช้งาน
        if (activityFilterState.user !== 'ALL' && log.username !== activityFilterState.user) {
            return false;
        }

        // 2. กรองตามประเภทกิจกรรม
        const logType = log.action_type ? String(log.action_type).toUpperCase() : '';
        if (activityFilterState.type !== 'ALL' && logType !== activityFilterState.type) {
            return false;
        }

        // 3. กรองตามบทบาทผู้ใช้
        const logRole = log.role ? String(log.role).toLowerCase() : '';
        if (activityFilterState.role !== 'ALL' && logRole !== activityFilterState.role) {
            return false;
        }

        // 4. กรองเฉพาะรายการที่มี S/N
        if (activityFilterState.onlyWithSn && (!log.target_sn || String(log.target_sn).trim() === '')) {
            return false;
        }

        // 5. กรองตามช่วงวันที่
        if (fromTime !== null || toTime !== null) {
            const logDate = parseSafeDate(log.created_at);
            if (!logDate) return false;
            const t = logDate.getTime();
            if (fromTime !== null && t < fromTime) return false;
            if (toTime !== null && t > toTime) return false;
        }

        // 6. ค้นหาหลายคำพร้อมกัน (Multi-Keyword Search)
        if (searchTokens.length > 0) {
            const haystack = [
                log.username,
                log.full_name,
                log.role,
                log.action_type,
                log.description,
                log.target_sn,
                formatThaiDateTime(log.created_at)
            ].filter(Boolean).join(' ').toLowerCase();

            const allMatch = searchTokens.every(token => haystack.includes(token));
            if (!allMatch) return false;
        }

        return true;
    });

    // เรียงลำดับข้อมูล (Sorting)
    const { sortBy, sortDir } = activityFilterState;
    const dirMultiplier = sortDir === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
        if (sortBy === 'created_at') {
            const tA = parseSafeDate(a.created_at)?.getTime() || 0;
            const tB = parseSafeDate(b.created_at)?.getTime() || 0;
            return (tA - tB) * dirMultiplier;
        }
        const valA = String(a[sortBy] || '').toLowerCase();
        const valB = String(b[sortBy] || '').toLowerCase();
        return valA.localeCompare(valB, 'th') * dirMultiplier;
    });

    filteredActivityLogs = filtered;
    syncQuickPillActiveStates();
    updateActiveFilterIndicator();
    renderActivityKPIs(filteredActivityLogs, globalActivityLogs);
    renderActivityLogsTable(filteredActivityLogs);
}

function updateActiveFilterIndicator() {
    const resetBtn = document.getElementById('actResetFiltersBtn');
    if (!resetBtn) return;

    const hasActiveFilter =
        activityFilterState.search !== '' ||
        activityFilterState.user !== 'ALL' ||
        activityFilterState.type !== 'ALL' ||
        activityFilterState.role !== 'ALL' ||
        activityFilterState.dateFrom !== '' ||
        activityFilterState.dateTo !== '' ||
        activityFilterState.onlyWithSn;

    resetBtn.classList.toggle('has-filters', hasActiveFilter);
}

function resetAllActivityFilters() {
    activityFilterState.search = '';
    activityFilterState.user = 'ALL';
    activityFilterState.type = 'ALL';
    activityFilterState.role = 'ALL';
    activityFilterState.datePreset = 'ALL';
    activityFilterState.dateFrom = '';
    activityFilterState.dateTo = '';
    activityFilterState.onlyWithSn = false;
    activityFilterState.sortBy = 'created_at';
    activityFilterState.sortDir = 'desc';
    activityFilterState.page = 1;

    const searchInput = document.getElementById('logSearchInput');
    const userSelect = document.getElementById('logUserSelect');
    const typeSelect = document.getElementById('logTypeSelect');
    const roleSelect = document.getElementById('logRoleSelect');
    const dateFromInput = document.getElementById('logDateFrom');
    const dateToInput = document.getElementById('logDateTo');
    const snOnlyCheckbox = document.getElementById('logSnOnlyCheckbox');
    const sortSelect = document.getElementById('logSortSelect');

    if (searchInput) searchInput.value = '';
    if (userSelect) userSelect.value = 'ALL';
    if (typeSelect) typeSelect.value = 'ALL';
    if (roleSelect) roleSelect.value = 'ALL';
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput) dateToInput.value = '';
    if (snOnlyCheckbox) snOnlyCheckbox.checked = false;
    if (sortSelect) sortSelect.value = 'created_at:desc';

    filterActivityLogs(true);
    showActivityToast('รีเซ็ตตัวกรองทั้งหมดเรียบร้อยแล้ว');
}

function quickFilterByUser(username) {
    if (!username) return;
    const userSelect = document.getElementById('logUserSelect');
    if (activityFilterState.user === username) {
        activityFilterState.user = 'ALL';
        if (userSelect) userSelect.value = 'ALL';
    } else {
        activityFilterState.user = username;
        if (userSelect) userSelect.value = username;
    }
    filterActivityLogs(true);
}

function quickFilterByAction(actionType) {
    const typeSelect = document.getElementById('logTypeSelect');
    if (activityFilterState.type === actionType && actionType !== 'ALL') {
        activityFilterState.type = 'ALL';
        if (typeSelect) typeSelect.value = 'ALL';
    } else {
        activityFilterState.type = actionType;
        if (typeSelect) typeSelect.value = actionType;
    }
    filterActivityLogs(true);
}

// =========================================================================
// --- 8. PAGINATION ENGINE (25 DEFAULT + 50 / 100 / CUSTOM / ALL) ---
// =========================================================================

function changeActivityPageSize(newSize) {
    if (newSize === 'ALL') {
        activityFilterState.pageSize = 'ALL';
    } else {
        const parsed = parseInt(newSize, 10);
        if (!isNaN(parsed) && parsed > 0) {
            activityFilterState.pageSize = Math.min(parsed, 5000);
        } else {
            activityFilterState.pageSize = ACTIVITY_CONFIG.DEFAULT_PAGE_SIZE;
        }
    }
    activityFilterState.page = 1;
    saveActivityUserPrefs();
    renderActivityLogsTable(filteredActivityLogs);
}

function goToActivityPage(targetPage) {
    const total = filteredActivityLogs.length;
    const pageSize = activityFilterState.pageSize === 'ALL' ? Math.max(total, 1) : activityFilterState.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, parseInt(targetPage, 10) || 1), totalPages);

    activityFilterState.page = safePage;
    renderActivityLogsTable(filteredActivityLogs);

    // เลื่อนกลับขึ้นบนสุดของตารางอย่างนุ่มนวล
    const toolbar = document.getElementById('activityLogsEnhancedToolbar');
    if (toolbar && typeof toolbar.scrollIntoView === 'function') {
        toolbar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function renderActivityPagination(totalFiltered, totalAll) {
    const container = document.getElementById('activityLogsPaginationBar');
    if (!container) return;

    const isAll = activityFilterState.pageSize === 'ALL';
    const pageSize = isAll ? Math.max(totalFiltered, 1) : activityFilterState.pageSize;
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalFiltered / pageSize));

    if (activityFilterState.page > totalPages) {
        activityFilterState.page = totalPages;
    }

    const startIdx = totalFiltered === 0 ? 0 : (activityFilterState.page - 1) * pageSize + 1;
    const endIdx = totalFiltered === 0 ? 0 : (isAll ? totalFiltered : Math.min(activityFilterState.page * pageSize, totalFiltered));

    // สร้างตัวเลือกจำนวนรายการต่อหน้า (25 เป็นค่าเริ่มต้น)
    const isPresetSize = ACTIVITY_CONFIG.PAGE_SIZE_OPTIONS.includes(activityFilterState.pageSize);
    let sizeOptionsHtml = ACTIVITY_CONFIG.PAGE_SIZE_OPTIONS.map(opt => {
        const selected = activityFilterState.pageSize === opt ? 'selected' : '';
        const label = opt === 'ALL' ? 'ทั้งหมด (ALL)' : `${opt} รายการ${opt === 25 ? ' (ค่าเริ่มต้น)' : ''}`;
        return `<option value="${opt}" ${selected}>${label}</option>`;
    }).join('');

    if (!isPresetSize) {
        sizeOptionsHtml += `<option value="${activityFilterState.pageSize}" selected>กำหนดเอง (${activityFilterState.pageSize} รายการ)</option>`;
    }

    // สร้างปุ่มเลขหน้าแบบอัจฉริยะ (Smart Ellipsis)
    let pageButtonsHtml = '';
    if (!isAll && totalPages > 1) {
        const cur = activityFilterState.page;
        const pages = new Set([1, totalPages, cur - 1, cur, cur + 1]);
        const sortedPages = Array.from(pages).filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);

        pageButtonsHtml += `<button type="button" class="act-page-btn" onclick="goToActivityPage(1)" ${cur === 1 ? 'disabled' : ''} title="หน้าแรก">«</button>`;
        pageButtonsHtml += `<button type="button" class="act-page-btn" onclick="goToActivityPage(${cur - 1})" ${cur === 1 ? 'disabled' : ''} title="ก่อนหน้า">‹</button>`;

        let prevPage = 0;
        sortedPages.forEach(p => {
            if (prevPage && p - prevPage > 1) {
                pageButtonsHtml += `<span class="act-page-ellipsis">…</span>`;
            }
            pageButtonsHtml += `<button type="button" class="act-page-btn ${p === cur ? 'active' : ''}" onclick="goToActivityPage(${p})">${p}</button>`;
            prevPage = p;
        });

        pageButtonsHtml += `<button type="button" class="act-page-btn" onclick="goToActivityPage(${cur + 1})" ${cur === totalPages ? 'disabled' : ''} title="ถัดไป">›</button>`;
        pageButtonsHtml += `<button type="button" class="act-page-btn" onclick="goToActivityPage(${totalPages})" ${cur === totalPages ? 'disabled' : ''} title="หน้าสุดท้าย">»</button>`;
    }

    container.innerHTML = `
        <div class="act-pag-info">
            <span>แสดงรายการที่ <strong>${startIdx.toLocaleString('th-TH')} - ${endIdx.toLocaleString('th-TH')}</strong> จากทั้งหมด <strong>${totalFiltered.toLocaleString('th-TH')}</strong> รายการ</span>
            ${totalFiltered < totalAll ? `<span class="act-pag-sub">(กรองจากทั้งหมด ${totalAll.toLocaleString('th-TH')} รายการ)</span>` : ''}
        </div>

        <div class="act-pag-controls">
            <label class="act-pag-size-wrap" title="เลือกจำนวนรายการที่แสดงต่อหน้าได้อย่างอิสระ">
                <span>แสดงต่อหน้า:</span>
                <select id="actPageSizeSelect" class="act-select act-select-sm" onchange="changeActivityPageSize(this.value)">
                    ${sizeOptionsHtml}
                </select>
            </label>

            <div class="act-custom-size-wrap" title="พิมพ์จำนวนรายการที่ต้องการแล้วกด Enter">
                <input type="number" id="actCustomPageSizeInput" class="act-input act-input-xs" min="1" max="5000"
                    placeholder="กำหนดเอง..."
                    onkeydown="if(event.key==='Enter'){ event.preventDefault(); changeActivityPageSize(this.value); }">
            </div>

            <div class="act-page-nav">
                ${pageButtonsHtml}
            </div>

            ${(!isAll && totalPages > 1) ? `
                <div class="act-jump-wrap">
                    <span>ไปหน้า</span>
                    <input type="number" class="act-input act-input-xs" min="1" max="${totalPages}" value="${activityFilterState.page}"
                        onchange="goToActivityPage(this.value)"
                        onkeydown="if(event.key==='Enter'){ event.preventDefault(); goToActivityPage(this.value); }">
                    <span>/ ${totalPages}</span>
                </div>
            ` : ''}
        </div>
    `;
}

// =========================================================================
// --- 9. KPI SUMMARY & TABLE RENDERING (FAST, RESPONSIVE, XSS-SAFE) ---
// =========================================================================

function renderActivityKPIs(filteredLogs, allLogs) {
    const kpiContainer = document.getElementById('activityLogsKpiStrip');
    if (!kpiContainer) return;

    const todayStr = new Date().toDateString();
    let todayCount = 0;
    let inboundCount = 0;
    let outboundCount = 0;
    let deleteCount = 0;

    allLogs.forEach(log => {
        const d = parseSafeDate(log.created_at);
        if (d && d.toDateString() === todayStr) todayCount++;
        const act = String(log.action_type || '').toUpperCase();
        if (act === 'INBOUND') inboundCount++;
        else if (act === 'OUTBOUND') outboundCount++;
        else if (act === 'DELETE') deleteCount++;
    });

    kpiContainer.innerHTML = `
        <button type="button" class="act-kpi-card ${activityFilterState.type === 'ALL' && activityFilterState.datePreset === 'ALL' ? 'active' : ''}" onclick="resetAllActivityFilters()">
            <span class="act-kpi-label">ประวัติทั้งหมด</span>
            <strong class="act-kpi-value">${allLogs.length.toLocaleString('th-TH')}</strong>
        </button>
        <button type="button" class="act-kpi-card ${activityFilterState.datePreset === 'TODAY' ? 'active' : ''}" onclick="applyActivityDatePreset('${activityFilterState.datePreset === 'TODAY' ? 'ALL' : 'TODAY'}')">
            <span class="act-kpi-label">📅 วันนี้</span>
            <strong class="act-kpi-value">${todayCount.toLocaleString('th-TH')}</strong>
        </button>
        <button type="button" class="act-kpi-card kpi-inbound ${activityFilterState.type === 'INBOUND' ? 'active' : ''}" onclick="quickFilterByAction('INBOUND')">
            <span class="act-kpi-label">📥 รับเข้า (INBOUND)</span>
            <strong class="act-kpi-value">${inboundCount.toLocaleString('th-TH')}</strong>
        </button>
        <button type="button" class="act-kpi-card kpi-outbound ${activityFilterState.type === 'OUTBOUND' ? 'active' : ''}" onclick="quickFilterByAction('OUTBOUND')">
            <span class="act-kpi-label">📤 จ่ายออก (OUTBOUND)</span>
            <strong class="act-kpi-value">${outboundCount.toLocaleString('th-TH')}</strong>
        </button>
        <button type="button" class="act-kpi-card kpi-delete ${activityFilterState.type === 'DELETE' ? 'active' : ''}" onclick="quickFilterByAction('DELETE')">
            <span class="act-kpi-label">🗑️ ลบ (DELETE)</span>
            <strong class="act-kpi-value">${deleteCount.toLocaleString('th-TH')}</strong>
        </button>
    `;
}

function renderActivityLogsTable(logs) {
    ensureActivityLogsEnhancedUI();

    const tbody = document.getElementById('activityLogsTableBody');
    if (!tbody) return;

    const safeLogs = Array.isArray(logs) ? logs : [];
    const totalBadge = document.getElementById('logTotalBadge');
    if (totalBadge) {
        totalBadge.textContent = `${safeLogs.length.toLocaleString('th-TH')} ประวัติ`;
    }

    renderActivityPagination(safeLogs.length, globalActivityLogs.length);

    if (safeLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="act-empty-state">
                    <div class="act-empty-icon">🔍</div>
                    <div class="act-empty-title">ไม่พบประวัติการใช้งานที่ตรงกับเงื่อนไขการคัดกรอง</div>
                    <div class="act-empty-sub">ลองเปลี่ยนคำค้นหา ช่วงวันที่ หรือกดปุ่มล้างตัวกรองเพื่อดูรายการทั้งหมด</div>
                    <button type="button" class="act-btn act-btn-primary" style="margin-top:10px;" onclick="resetAllActivityFilters()">
                        🔄 ล้างตัวกรองทั้งหมด
                    </button>
                </td>
            </tr>
        `;
        return;
    }

    // คำนวณช่วงข้อมูลตาม Pagination (ค่าเริ่มต้น 25 รายการ)
    const isAll = activityFilterState.pageSize === 'ALL';
    const pageSize = isAll ? safeLogs.length : activityFilterState.pageSize;
    const totalPages = Math.max(1, Math.ceil(safeLogs.length / pageSize));
    if (activityFilterState.page > totalPages) {
        activityFilterState.page = totalPages;
    }

    const startIndex = isAll ? 0 : (activityFilterState.page - 1) * pageSize;
    const pageSlice = isAll ? safeLogs : safeLogs.slice(startIndex, startIndex + pageSize);
    const searchQuery = activityFilterState.search;

    let html = '';
    pageSlice.forEach((log, idx) => {
        const globalRowNumber = startIndex + idx + 1;
        const absoluteFilteredIndex = startIndex + idx;
        const actKey = String(log.action_type || 'SYSTEM').toUpperCase();
        const meta = ACTIVITY_CONFIG.ACTION_META[actKey] || { label: actKey, badge: 'nav', icon: '📌' };

        const safeFormattedDate = formatThaiDateTime(log.created_at);
        const relativeTime = formatRelativeTimeTH(log.created_at);
        const displayName = log.full_name || log.username || 'ไม่ระบุผู้ใช้';
        const username = log.username || '-';
        const roleBadge = log.role ? `<span class="act-role-pill">${escapeHTML(log.role)}</span>` : '';
        const hasSn = log.target_sn && String(log.target_sn).trim() !== '' && log.target_sn !== '-';

        html += `
            <tr class="act-log-row" onclick="openActivityDetailModal(${absoluteFilteredIndex})" title="คลิกเพื่อดูรายละเอียดรายการนี้">
                <td style="text-align:center;" class="mono act-col-num">${globalRowNumber}</td>
                <td class="act-col-time">
                    <div class="act-time-main">${escapeHTML(safeFormattedDate)}</div>
                    ${relativeTime ? `<div class="act-time-rel">${escapeHTML(relativeTime)}</div>` : ''}
                </td>
                <td class="act-col-user">
                    <div class="act-user-wrap" onclick="event.stopPropagation(); quickFilterByUser('${escapeHTML(username)}')" title="คลิกเพื่อกรองเฉพาะผู้ใช้นี้">
                        <strong class="mono act-user-name">${highlightMatchSafe(displayName, searchQuery)}</strong>
                        <div class="act-user-meta">
                            <span>@${highlightMatchSafe(username, searchQuery)}</span>
                            ${roleBadge}
                        </div>
                    </div>
                </td>
                <td class="act-col-type">
                    <span class="badge-action ${escapeHTML(meta.badge)}">
                        <span>${meta.icon}</span> ${escapeHTML(actKey)}
                    </span>
                </td>
                <td class="act-col-desc">
                    <div class="act-desc-text">${highlightMatchSafe(log.description || '-', searchQuery)}</div>
                </td>
                <td class="act-col-sn" onclick="event.stopPropagation();">
                    ${hasSn ? `
                        <div class="act-sn-box">
                            <code class="mono font-bold">${highlightMatchSafe(log.target_sn, searchQuery)}</code>
                            <button type="button" class="act-copy-btn" onclick="copyTextSafe('${escapeHTML(log.target_sn)}')" title="คัดลอก S/N">📋</button>
                        </div>
                    ` : '<span class="act-muted">-</span>'}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// =========================================================================
// --- 10. DETAIL MODAL & CSV EXPORT FEATURES ---
// =========================================================================

function openActivityDetailModal(filteredIndex) {
    const log = filteredActivityLogs[filteredIndex];
    if (!log) return;

    // อัปเดตตัวแปร global เดิมเพื่อรองรับการทำงานร่วมกับโมดูลตรวจสอบผู้ใช้
    currentInspectedUser = log.username || null;
    currentInspectedUserLogs = globalActivityLogs.filter(item => item.username === log.username);

    let modal = document.getElementById('activityLogDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'activityLogDetailModal';
        modal.className = 'act-modal-backdrop';
        modal.onclick = (e) => {
            if (e.target === modal) closeActivityDetailModal();
        };
        document.body.appendChild(modal);
    }

    const actKey = String(log.action_type || 'SYSTEM').toUpperCase();
    const meta = ACTIVITY_CONFIG.ACTION_META[actKey] || { label: actKey, badge: 'nav', icon: '📌' };
    const safeDate = formatThaiDateTime(log.created_at);
    const relTime = formatRelativeTimeTH(log.created_at);
    const hasSn = log.target_sn && String(log.target_sn).trim() !== '' && log.target_sn !== '-';

    modal.innerHTML = `
        <div class="act-modal-card" role="dialog" aria-modal="true" aria-labelledby="actModalTitle">
            <div class="act-modal-header">
                <h3 id="actModalTitle">📋 รายละเอียดประวัติการใช้งาน</h3>
                <button type="button" class="act-modal-close" onclick="closeActivityDetailModal()" aria-label="ปิดหน้าต่าง">✕</button>
            </div>
            <div class="act-modal-body">
                <div class="act-detail-grid">
                    <div class="act-detail-item">
                        <span class="act-detail-label">วันและเวลา</span>
                        <strong>${escapeHTML(safeDate)} <small style="color:var(--text-muted,#64748b);">(${escapeHTML(relTime)})</small></strong>
                    </div>
                    <div class="act-detail-item">
                        <span class="act-detail-label">ประเภทกิจกรรม</span>
                        <div><span class="badge-action ${escapeHTML(meta.badge)}">${meta.icon} ${escapeHTML(actKey)}</span></div>
                    </div>
                    <div class="act-detail-item">
                        <span class="act-detail-label">ผู้ดำเนินการ</span>
                        <strong>${escapeHTML(log.full_name || log.username)} (@${escapeHTML(log.username)})</strong>
                    </div>
                    <div class="act-detail-item">
                        <span class="act-detail-label">บทบาท (Role)</span>
                        <strong>${escapeHTML((log.role || 'user').toUpperCase())}</strong>
                    </div>
                    <div class="act-detail-item act-detail-full">
                        <span class="act-detail-label">หมายเลข S/N เป้าหมาย</span>
                        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                            <code class="mono font-bold" style="font-size:0.95rem;">${escapeHTML(log.target_sn || '-')}</code>
                            ${hasSn ? `<button type="button" class="act-btn act-btn-sm" onclick="copyTextSafe('${escapeHTML(log.target_sn)}')">📋 คัดลอก S/N</button>` : ''}
                        </div>
                    </div>
                    <div class="act-detail-item act-detail-full">
                        <span class="act-detail-label">รายละเอียดกิจกรรม</span>
                        <div class="act-detail-desc">${escapeHTML(log.description || '-')}</div>
                    </div>
                </div>
            </div>
            <div class="act-modal-footer">
                <button type="button" class="act-btn" onclick="closeActivityDetailModal(); quickFilterByUser('${escapeHTML(log.username)}');">
                    👤 ดูประวัติทั้งหมดของผู้ใช้นี้ (${currentInspectedUserLogs.length})
                </button>
                <button type="button" class="act-btn act-btn-primary" onclick="closeActivityDetailModal()">ปิดหน้าต่าง</button>
            </div>
        </div>
    `;

    modal.classList.add('open');
}

function closeActivityDetailModal() {
    const modal = document.getElementById('activityLogDetailModal');
    if (modal) modal.classList.remove('open');
}

function exportActivityLogsCSV() {
    const dataToExport = filteredActivityLogs.length > 0 ? filteredActivityLogs : globalActivityLogs;
    if (!dataToExport || dataToExport.length === 0) {
        showActivityToast('ไม่มีข้อมูลสำหรับส่งออก');
        return;
    }

    const headers = ['ลำดับ', 'วันเวลา', 'ชื่อ-นามสกุล', 'Username', 'บทบาท', 'ประเภทกิจกรรม', 'รายละเอียด', 'Target S/N'];
    const escapeCSV = (val) => {
        const str = val === null || val === undefined ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = dataToExport.map((log, index) => [
        index + 1,
        formatThaiDateTime(log.created_at),
        log.full_name || log.username || '',
        log.username || '',
        log.role || '',
        log.action_type || '',
        log.description || '',
        log.target_sn || ''
    ].map(escapeCSV).join(','));

    // เพิ่ม UTF-8 BOM (\uFEFF) เพื่อให้เปิดภาษาไทยใน Excel บน Windows/macOS ได้ถูกต้อง 100%
    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `user_activities_${dateStamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showActivityToast(`ส่งออกไฟล์ CSV (${dataToExport.length} รายการ) สำเร็จ`);
}

// =========================================================================
// --- 11. AUTO-INJECTED RESPONSIVE UI & CROSS-OS STYLES ---
// =========================================================================

function injectActivityLogsStyles() {
    if (document.getElementById('activity-logs-enhanced-styles')) return;

    const style = document.createElement('style');
    style.id = 'activity-logs-enhanced-styles';
    style.textContent = `
        /* KPI Strip */
        .act-kpi-strip {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
            gap: 10px;
            margin-bottom: 14px;
        }
        .act-kpi-card {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
            padding: 10px 14px;
            border-radius: 10px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: rgba(148, 163, 184, 0.06);
            color: inherit;
            cursor: pointer;
            text-align: left;
            transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
            font-family: inherit;
        }
        .act-kpi-card:hover {
            transform: translateY(-1px);
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.08);
        }
        .act-kpi-card.active {
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.14);
            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
        }
        .act-kpi-label {
            font-size: 0.76rem;
            opacity: 0.8;
            font-weight: 500;
        }
        .act-kpi-value {
            font-size: 1.25rem;
            font-weight: 700;
            line-height: 1.2;
        }

        /* Enhanced Toolbar */
        .act-enhanced-toolbar {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 12px 14px;
            margin-bottom: 12px;
            border-radius: 12px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: rgba(148, 163, 184, 0.05);
        }
        .act-toolbar-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
        }
        .act-pills-group {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
        }
        .act-pill {
            padding: 5px 11px;
            border-radius: 999px;
            border: 1px solid rgba(148, 163, 184, 0.3);
            background: transparent;
            color: inherit;
            font-size: 0.78rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            min-height: 30px;
            font-family: inherit;
        }
        .act-pill:hover {
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.08);
        }
        .act-pill.active {
            background: #2563eb;
            color: #ffffff;
            border-color: #2563eb;
            font-weight: 600;
        }
        .act-input, .act-select {
            padding: 6px 10px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.35);
            background: rgba(255, 255, 255, 0.04);
            color: inherit;
            font-size: 0.82rem;
            min-height: 36px;
            font-family: inherit;
            outline: none;
        }
        .act-input:focus, .act-select:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .act-select option {
            background: #1e293b;
            color: #f8fafc;
        }
        @media (prefers-color-scheme: light) {
            .act-select option {
                background: #ffffff;
                color: #0f172a;
            }
        }
        .act-select-sm { min-height: 32px; padding: 4px 8px; font-size: 0.8rem; }
        .act-input-xs { width: 88px; min-height: 32px; padding: 4px 8px; font-size: 0.8rem; }
        .act-date-group {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            font-size: 0.8rem;
        }
        .act-checkbox-label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.8rem;
            cursor: pointer;
            user-select: none;
            padding: 4px 8px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            min-height: 34px;
        }
        .act-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 6px 12px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.35);
            background: rgba(148, 163, 184, 0.1);
            color: inherit;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            min-height: 34px;
            transition: all 0.15s ease;
            font-family: inherit;
        }
        .act-btn:hover { background: rgba(148, 163, 184, 0.2); }
        .act-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .act-btn-primary {
            background: #2563eb;
            border-color: #2563eb;
            color: #ffffff;
        }
        .act-btn-primary:hover { background: #1d4ed8; }
        .act-btn-sm { min-height: 28px; padding: 3px 8px; font-size: 0.75rem; }
        #actResetFiltersBtn.has-filters {
            border-color: #ef4444;
            color: #ef4444;
            background: rgba(239, 68, 68, 0.1);
        }
        .is-spinning { opacity: 0.75; }
        .act-sync-status {
            margin-left: auto;
            font-size: 0.75rem;
            opacity: 0.75;
        }

        /* Table & Row Enhancements */
        .act-log-row {
            cursor: pointer;
            transition: background-color 0.12s ease;
        }
        .act-log-row:hover {
            background-color: rgba(59, 130, 246, 0.08) !important;
        }
        .act-time-main {
            font-size: 0.8rem;
            white-space: nowrap;
        }
        .act-time-rel {
            font-size: 0.71rem;
            opacity: 0.72;
            margin-top: 2px;
        }
        .act-user-wrap {
            display: inline-flex;
            flex-direction: column;
            cursor: pointer;
        }
        .act-user-wrap:hover .act-user-name {
            text-decoration: underline;
        }
        .act-user-meta {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 0.74rem;
            opacity: 0.78;
            margin-top: 2px;
        }
        .act-role-pill {
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 0.68rem;
            text-transform: uppercase;
            background: rgba(148, 163, 184, 0.2);
            font-weight: 600;
        }
        .act-desc-text {
            line-height: 1.45;
            word-break: break-word;
            min-width: 180px;
        }
        .act-sn-box {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }
        .act-copy-btn {
            border: 1px solid rgba(148, 163, 184, 0.3);
            background: rgba(148, 163, 184, 0.1);
            border-radius: 6px;
            padding: 2px 6px;
            cursor: pointer;
            font-size: 0.75rem;
            line-height: 1.2;
        }
        .act-copy-btn:hover {
            background: rgba(59, 130, 246, 0.2);
            border-color: #3b82f6;
        }
        .act-highlight {
            background: rgba(250, 204, 21, 0.42);
            color: inherit;
            padding: 0 2px;
            border-radius: 3px;
            font-weight: 600;
        }

        /* Pagination Bar */
        .act-pagination-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 14px;
            margin-top: 12px;
            border-radius: 12px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: rgba(148, 163, 184, 0.05);
            font-size: 0.82rem;
        }
        .act-pag-info {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
        }
        .act-pag-sub {
            opacity: 0.75;
            font-size: 0.78rem;
        }
        .act-pag-controls {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
        }
        .act-pag-size-wrap, .act-jump-wrap {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .act-page-nav {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            flex-wrap: wrap;
        }
        .act-page-btn {
            min-width: 32px;
            height: 32px;
            padding: 0 8px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.3);
            background: transparent;
            color: inherit;
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
            font-family: inherit;
        }
        .act-page-btn:hover:not(:disabled) {
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.12);
        }
        .act-page-btn.active {
            background: #2563eb;
            color: #ffffff;
            border-color: #2563eb;
        }
        .act-page-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .act-page-ellipsis {
            padding: 0 4px;
            opacity: 0.6;
        }

        /* Empty & Skeleton States */
        .act-empty-state {
            text-align: center;
            padding: 36px 16px !important;
        }
        .act-empty-icon { font-size: 2rem; margin-bottom: 6px; }
        .act-empty-title { font-weight: 700; font-size: 0.95rem; margin-bottom: 4px; }
        .act-empty-sub { font-size: 0.8rem; opacity: 0.75; }
        .act-skel {
            height: 14px;
            border-radius: 6px;
            background: linear-gradient(90deg, rgba(148,163,184,0.12) 25%, rgba(148,163,184,0.26) 50%, rgba(148,163,184,0.12) 75%);
            background-size: 200% 100%;
            animation: actShimmer 1.2s infinite linear;
        }
        @keyframes actShimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        /* Modal & Toast */
        .act-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(3px);
            display: none;
            align-items: center;
            justify-content: center;
            padding: 16px;
            z-index: 99999;
        }
        .act-modal-backdrop.open { display: flex; }
        .act-modal-card {
            width: 100%;
            max-width: 540px;
            border-radius: 14px;
            background: var(--card-bg, #1e293b);
            color: var(--text-color, #f8fafc);
            border: 1px solid rgba(148, 163, 184, 0.3);
            box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
            overflow: hidden;
        }
        @media (prefers-color-scheme: light) {
            .act-modal-card {
                background: var(--card-bg, #ffffff);
                color: var(--text-color, #0f172a);
            }
        }
        .act-modal-header, .act-modal-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 14px 18px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        }
        .act-modal-footer {
            border-bottom: none;
            border-top: 1px solid rgba(148, 163, 184, 0.2);
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .act-modal-header h3 { margin: 0; font-size: 1rem; }
        .act-modal-close {
            background: transparent;
            border: none;
            color: inherit;
            font-size: 1.1rem;
            cursor: pointer;
            padding: 4px 8px;
        }
        .act-modal-body { padding: 16px 18px; }
        .act-detail-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }
        .act-detail-full { grid-column: 1 / -1; }
        .act-detail-item {
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding: 10px 12px;
            border-radius: 8px;
            background: rgba(148, 163, 184, 0.08);
        }
        .act-detail-label { font-size: 0.74rem; opacity: 0.75; }
        .act-detail-desc {
            margin-top: 4px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .act-toast {
            position: fixed;
            bottom: 22px;
            right: 22px;
            background: #0f172a;
            color: #ffffff;
            border: 1px solid rgba(148, 163, 184, 0.35);
            padding: 10px 16px;
            border-radius: 10px;
            font-size: 0.84rem;
            font-weight: 500;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            opacity: 0;
            transform: translateY(12px);
            pointer-events: none;
            transition: all 0.2s ease;
            z-index: 100000;
        }
        .act-toast.show {
            opacity: 1;
            transform: translateY(0);
        }

        /* Responsive Mobile & Tablet Adjustments (iOS, Android, iPad) */
        @media (max-width: 768px) {
            .act-kpi-strip { grid-template-columns: repeat(2, 1fr); }
            .act-detail-grid { grid-template-columns: 1fr; }
            .act-pagination-bar { flex-direction: column; align-items: stretch; }
            .act-pag-controls { justify-content: space-between; }
            .act-sync-status { margin-left: 0; width: 100%; }
        }
    `;
    document.head.appendChild(style);
}

function ensureActivityLogsEnhancedUI() {
    injectActivityLogsStyles();

    const tbody = document.getElementById('activityLogsTableBody');
    if (!tbody) return;

    const tableEl = tbody.closest('table');
    const tableWrapper = tableEl ? (tableEl.parentElement || tableEl) : tbody.parentElement;

    // ทำให้ตารางเลื่อนซ้าย-ขวาได้ลื่นไหลบนมือถือทุก OS
    if (tableWrapper && tableWrapper !== tbody) {
        tableWrapper.style.overflowX = 'auto';
        tableWrapper.style.webkitOverflowScrolling = 'touch';
    }

    // 1. สร้าง KPI Summary Strip และแถบตัวกรองแบบครบวงจรหากยังไม่มีใน HTML
    if (!document.getElementById('activityLogsEnhancedToolbar') && tableWrapper && tableWrapper.parentElement) {
        const kpiDiv = document.createElement('div');
        kpiDiv.id = 'activityLogsKpiStrip';
        kpiDiv.className = 'act-kpi-strip';

        const toolbarDiv = document.createElement('div');
        toolbarDiv.id = 'activityLogsEnhancedToolbar';
        toolbarDiv.className = 'act-enhanced-toolbar';

        const hasExistingSearch = !!document.getElementById('logSearchInput');
        const hasExistingUser = !!document.getElementById('logUserSelect');
        const hasExistingType = !!document.getElementById('logTypeSelect');

        toolbarDiv.innerHTML = `
            ${(!hasExistingSearch || !hasExistingUser || !hasExistingType) ? `
                <div class="act-toolbar-row">
                    ${!hasExistingSearch ? `<input type="search" id="logSearchInput" class="act-input" style="flex:1;min-width:200px;" placeholder="🔍 ค้นหาชื่อผู้ใช้, รายละเอียด, S/N, วันเวลา...">` : ''}
                    ${!hasExistingUser ? `<select id="logUserSelect" class="act-select"><option value="ALL">👤 ผู้ใช้งานทั้งหมด</option></select>` : ''}
                    ${!hasExistingType ? `<select id="logTypeSelect" class="act-select"><option value="ALL">🏷️ ประเภททั้งหมด</option></select>` : ''}
                </div>
            ` : ''}

            <div class="act-toolbar-row">
                <div class="act-pills-group" aria-label="ตัวกรองประเภทกิจกรรมด่วน">
                    <button type="button" class="act-pill active" data-act-type-pill="ALL" onclick="quickFilterByAction('ALL')">ทั้งหมด</button>
                    <button type="button" class="act-pill" data-act-type-pill="INBOUND" onclick="quickFilterByAction('INBOUND')">📥 INBOUND</button>
                    <button type="button" class="act-pill" data-act-type-pill="OUTBOUND" onclick="quickFilterByAction('OUTBOUND')">📤 OUTBOUND</button>
                    <button type="button" class="act-pill" data-act-type-pill="RELOCATE" onclick="quickFilterByAction('RELOCATE')">🔄 RELOCATE</button>
                    <button type="button" class="act-pill" data-act-type-pill="UPDATE" onclick="quickFilterByAction('UPDATE')">✏️ UPDATE</button>
                    <button type="button" class="act-pill" data-act-type-pill="DELETE" onclick="quickFilterByAction('DELETE')">🗑️ DELETE</button>
                    <button type="button" class="act-pill" data-act-type-pill="AUTH" onclick="quickFilterByAction('AUTH')">🔐 AUTH</button>
                </div>
            </div>

            <div class="act-toolbar-row">
                <div class="act-pills-group" aria-label="ตัวกรองช่วงเวลาด่วน">
                    <button type="button" class="act-pill active" data-act-date-pill="ALL" onclick="applyActivityDatePreset('ALL')">ทุกช่วงเวลา</button>
                    <button type="button" class="act-pill" data-act-date-pill="TODAY" onclick="applyActivityDatePreset('TODAY')">วันนี้</button>
                    <button type="button" class="act-pill" data-act-date-pill="YESTERDAY" onclick="applyActivityDatePreset('YESTERDAY')">เมื่อวาน</button>
                    <button type="button" class="act-pill" data-act-date-pill="7D" onclick="applyActivityDatePreset('7D')">7 วันล่าสุด</button>
                    <button type="button" class="act-pill" data-act-date-pill="30D" onclick="applyActivityDatePreset('30D')">30 วันล่าสุด</button>
                    <button type="button" class="act-pill" data-act-date-pill="THIS_MONTH" onclick="applyActivityDatePreset('THIS_MONTH')">เดือนนี้</button>
                </div>

                <div class="act-date-group">
                    <span>ตั้งแต่:</span>
                    <input type="date" id="logDateFrom" class="act-input" aria-label="ตั้งแต่วันที่">
                    <span>ถึง:</span>
                    <input type="date" id="logDateTo" class="act-input" aria-label="ถึงวันที่">
                </div>
            </div>

            <div class="act-toolbar-row">
                <select id="logRoleSelect" class="act-select" aria-label="กรองตามบทบาทผู้ใช้">
                    <option value="ALL">🛡️ ทุกบทบาท (Role)</option>
                </select>

                <select id="logSortSelect" class="act-select" aria-label="เรียงลำดับข้อมูล">
                    <option value="created_at:desc">⏱️ เรียง: ล่าสุดก่อน</option>
                    <option value="created_at:asc">⏱️ เรียง: เก่าสุดก่อน</option>
                    <option value="full_name:asc">👤 เรียง: ชื่อผู้ใช้ (ก-ฮ / A-Z)</option>
                    <option value="action_type:asc">🏷️ เรียง: ประเภทกิจกรรม</option>
                </select>

                <label class="act-checkbox-label">
                    <input type="checkbox" id="logSnOnlyCheckbox">
                    <span>เฉพาะรายการที่มี S/N</span>
                </label>

                <button type="button" id="actResetFiltersBtn" class="act-btn" onclick="resetAllActivityFilters()" title="ล้างตัวกรองทั้งหมด">
                    🧹 ล้างตัวกรอง
                </button>

                <button type="button" id="actRefreshBtn" class="act-btn act-btn-primary" onclick="loadUserActivityLogsFromDB(true)" title="ดึงข้อมูลล่าสุดทันที">
                    🔄 รีเฟรช
                </button>

                <button type="button" class="act-btn" onclick="exportActivityLogsCSV()" title="ดาวน์โหลดไฟล์ CSV">
                    📥 Export CSV
                </button>

                <span id="actSyncStatusText" class="act-sync-status"></span>
            </div>
        `;

        tableWrapper.parentElement.insertBefore(kpiDiv, tableWrapper);
        tableWrapper.parentElement.insertBefore(toolbarDiv, tableWrapper);
    }

    // 2. สร้างแถบควบคุมการแบ่งหน้า (Pagination Bar) ด้านล่างตาราง
    if (!document.getElementById('activityLogsPaginationBar') && tableWrapper && tableWrapper.parentElement) {
        const pagDiv = document.createElement('div');
        pagDiv.id = 'activityLogsPaginationBar';
        pagDiv.className = 'act-pagination-bar';
        tableWrapper.parentElement.insertBefore(pagDiv, tableWrapper.nextSibling);
    }

    bindActivityFilterEvents();
}

function bindActivityFilterEvents() {
    const searchInput = document.getElementById('logSearchInput');
    if (searchInput && !searchInput.dataset.actBound) {
        searchInput.dataset.actBound = 'true';
        searchInput.addEventListener('input', () => {
            clearTimeout(activitySearchTimer);
            activitySearchTimer = setTimeout(() => {
                filterActivityLogs(true);
            }, ACTIVITY_CONFIG.SEARCH_DEBOUNCE_MS);
        });
    }

    ['logUserSelect', 'logTypeSelect', 'logRoleSelect', 'logSnOnlyCheckbox'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.actBound) {
            el.dataset.actBound = 'true';
            el.addEventListener('change', () => filterActivityLogs(true));
        }
    });

    ['logDateFrom', 'logDateTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.actBound) {
            el.dataset.actBound = 'true';
            el.addEventListener('change', () => {
                activityFilterState.datePreset = 'CUSTOM';
                filterActivityLogs(true);
            });
        }
    });

    const sortSelect = document.getElementById('logSortSelect');
    if (sortSelect && !sortSelect.dataset.actBound) {
        sortSelect.dataset.actBound = 'true';
        sortSelect.addEventListener('change', () => {
            const [field, dir] = sortSelect.value.split(':');
            activityFilterState.sortBy = field || 'created_at';
            activityFilterState.sortDir = dir || 'desc';
            filterActivityLogs(false);
        });
    }
}

// =========================================================================
// --- 12. INSTANT TAB-SWITCH DETECTOR & AUTO INITIALIZATION ---
// =========================================================================

function initActivityLogsEngine() {
    hydrateActivityLogsFromCache();
    ensureActivityLogsEnhancedUI();

    const tbody = document.getElementById('activityLogsTableBody');
    if (tbody) {
        if (globalActivityLogs.length > 0) {
            populateActivityFilterOptions(globalActivityLogs);
            filterActivityLogs(false);
        }
        // โหลดข้อมูลล่าสุดแบบเบื้องหลังทันที
        loadUserActivityLogsFromDB(false);
    } else {
        // เตรียมโหลดข้อมูลลงแคชล่วงหน้าตั้งแต่เปิดเว็บ เพื่อให้เวลากดสลับหน้าแสดงผลได้ทันที 100%
        setTimeout(() => {
            if (navigator.onLine && globalActivityLogs.length === 0) {
                loadUserActivityLogsFromDB(false);
            }
        }, 400);
    }

    // ตรวจจับการเปิดหน้าหรือการแสดงผลของตารางประวัติการใช้งานแบบอัตโนมัติ (0ms Instant Trigger)
    if (typeof MutationObserver !== 'undefined' && !window._activityLogsObserverInstalled) {
        window._activityLogsObserverInstalled = true;
        let lastVisibleState = false;

        const checkVisibilityAndRefresh = () => {
            const target = document.getElementById('activityLogsTableBody');
            if (!target) return;
            const isVisible = target.offsetParent !== null;
            if (isVisible && !lastVisibleState) {
                lastVisibleState = true;
                loadUserActivityLogsFromDB(false);
            } else if (!isVisible) {
                lastVisibleState = false;
            }
        };

        const observer = new MutationObserver(checkVisibilityAndRefresh);
        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden'],
                subtree: true
            });
        }
    }

    // ซิงก์คิวออฟไลน์และรีเฟรชอัตโนมัติเมื่ออินเทอร์เน็ตกลับมาเชื่อมต่อ
    if (!window._activityLogsOnlineListenerInstalled) {
        window._activityLogsOnlineListenerInstalled = true;
        window.addEventListener('online', () => {
            loadUserActivityLogsFromDB(true);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initActivityLogsEngine);
} else {
    initActivityLogsEngine();
}