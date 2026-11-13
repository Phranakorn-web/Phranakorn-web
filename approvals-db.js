// =========================================================================
// --- MODULE 6: APPROVAL REQUESTS DATABASE & REALTIME ENGINE (FAST 25 & ROLE GUARD) ---
// =========================================================================

// Safe Escape HTML Helper Fallback (Secures against XSS vulnerabilities)
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

// Dynamic Environment Configuration (Prevents exposing hardcoded Supabase Secrets in client JS)
const WMS_SUPABASE_URL = (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_URL) ? window.ENV.SUPABASE_URL : '';
const WMS_SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.ENV && window.ENV.SUPABASE_ANON_KEY) ? window.ENV.SUPABASE_ANON_KEY : '';

let pendingApprovalsList = [];
let approvalStatusFilter = 'ALL';
let approvalTypeFilter = 'ALL';
let approvalRequesterFilter = 'ALL';
let approvalSearchQuery = '';
let approvalSortOrder = 'NEWEST'; // 'NEWEST' | 'OLDEST' | 'PENDING_FIRST'

// ค่าเริ่มต้น 25 รายการ เพื่อความรวดเร็วสูงสุดในการโหลดข้อมูล
let approvalDisplayLimit = (() => {
    try {
        const saved = sessionStorage.getItem('wms_approval_display_limit_v2');
        return saved ? (saved === 'ALL' ? 'ALL' : Number(saved) || 25) : 25;
    } catch (e) {
        return 25;
    }
})();

let selectedApprovalIds = new Set();
let lastApprovalsRenderSignature = '';
let isTTSMuted = (() => {
    try {
        return localStorage.getItem('wms_approval_tts_muted') === 'true';
    } catch (e) {
        return false;
    }
})();

let approvalPollingTimer = null;
let approvalRealtimeChannel = null;
let userTrackedRequestStatuses = {};
const LOCAL_APPROVALS_KEY = 'wms_local_pending_approvals_v2';

// 🟢 โหลดรายการเสียงของระบบล่วงหน้าสำหรับทุกเบราว์เซอร์
let availableTTSVoices = [];
function preloadTTSVoices() {
    if ('speechSynthesis' in window) {
        availableTTSVoices = window.speechSynthesis.getVoices();
    }
}
if ('speechSynthesis' in window) {
    preloadTTSVoices();
    window.speechSynthesis.onvoiceschanged = preloadTTSVoices;
}

// -------------------------------------------------------------------------
// 0. ตรวจสอบสถานะว่าผู้ใช้เข้าสู่ระบบสำเร็จแล้วหรือยัง (บล็อกแจ้งเตือนในหน้า Login 100%)
// -------------------------------------------------------------------------
function isUserLoggedIn() {
    const passwordInput = document.querySelector('input[type="password"]');
    if (passwordInput && passwordInput.offsetParent !== null) {
        return false;
    }

    const loginModal = document.getElementById('loginModal') || document.getElementById('loginView') || document.getElementById('loginSection') || document.getElementById('login-modal');
    if (loginModal && (loginModal.style.display !== 'none' && !loginModal.classList.contains('hidden'))) {
        return false;
    }

    const loginContainer = document.querySelector('.login-container') || document.querySelector('.login-box') || document.querySelector('#login-form');
    if (loginContainer && loginContainer.offsetParent !== null) {
        return false;
    }

    if (document.body.classList.contains('login-page') || document.body.classList.contains('is-logged-out')) {
        return false;
    }

    if (typeof currentUser !== 'undefined' && currentUser && (currentUser.id || currentUser.username || currentUser.email)) {
        return true;
    }

    try {
        const storedUser = localStorage.getItem('currentUser') || localStorage.getItem('user') || sessionStorage.getItem('currentUser') || sessionStorage.getItem('user');
        if (storedUser && storedUser !== '{}') {
            return true;
        }
    } catch(e) {}

    if (document.getElementById('app-content') || document.getElementById('sidebar') || document.querySelector('.main-content') || document.getElementById('view-approvals')) {
        return true;
    }

    return false;
}

// -------------------------------------------------------------------------
// 1. ระบบตรวจจับสิทธิ์ Admin / ผู้ควบคุมดูแลเว็บ (Dynamic Role Checking 100%)
// -------------------------------------------------------------------------
function getCurrentUserIdentity() {
    let userObj = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    if (!userObj) {
        try {
            userObj = JSON.parse(localStorage.getItem('currentUser') || localStorage.getItem('user') || sessionStorage.getItem('currentUser') || '{}');
        } catch (e) {
            userObj = {};
        }
    }
    const username = (userObj && (userObj.username || userObj.email || userObj.id)) ? String(userObj.username || userObj.email || userObj.id).trim() : 'user';
    const name = (userObj && (userObj.name || userObj.full_name || userObj.displayName || userObj.username)) ? String(userObj.name || userObj.full_name || userObj.displayName || userObj.username).trim() : 'User General';
    return { userObj: userObj || {}, username, name };
}

function isCurrentUserAdmin() {
    if (!isUserLoggedIn()) return false;

    const { userObj } = getCurrentUserIdentity();

    if (userObj && typeof userObj === 'object') {
        if (userObj.isAdmin === true || userObj.is_admin === true) return true;
        if (userObj.isAdmin === false || userObj.is_admin === false) {
            const explicitRole = String(userObj.role || userObj.user_role || '').toLowerCase().trim();
            if (explicitRole === 'user' || explicitRole === 'staff' || explicitRole === 'operator' || explicitRole === 'general') {
                return false;
            }
        }

        const roleStr = String(
            userObj.role || userObj.user_role || userObj.type || userObj.role_name || userObj.position || ''
        ).toLowerCase().trim();

        // ระบุสิทธิ์ User ทั่วไปอย่างชัดเจน -> ต้องขออนุมัติทุกครั้ง
        if (
            roleStr === 'user' ||
            roleStr === 'general' ||
            roleStr === 'staff' ||
            roleStr === 'operator' ||
            roleStr === 'employee' ||
            roleStr.includes('ทั่วไป')
        ) {
            return false;
        }

        // ระบุสิทธิ์ผู้ควบคุมดูแลเว็บหรือแอดมิน -> จัดการได้ทันทีไม่ต้องขออนุมัติ
        if (
            roleStr === 'admin' || 
            roleStr === 'superadmin' || 
            roleStr === 'administrator' || 
            roleStr === 'webmaster' ||
            roleStr === 'owner' ||
            roleStr.includes('admin') || 
            roleStr.includes('super') || 
            roleStr.includes('manager') || 
            roleStr.includes('webmaster') ||
            roleStr.includes('ผู้ดูแลระบบ') ||
            roleStr.includes('ผู้ควบคุมดูแล')
        ) {
            return true;
        }
    }

    try {
        const rawRole = String(
            localStorage.getItem('user_role') || 
            localStorage.getItem('role') || 
            sessionStorage.getItem('user_role') || 
            sessionStorage.getItem('role') || ''
        ).toLowerCase().trim();

        if (rawRole === 'user' || rawRole === 'staff' || rawRole === 'operator' || rawRole === 'general') {
            return false;
        }
        if (
            rawRole.includes('admin') || 
            rawRole.includes('super') || 
            rawRole.includes('manager') || 
            rawRole.includes('webmaster') ||
            rawRole.includes('ผู้ดูแล') ||
            rawRole.includes('ผู้ควบคุม')
        ) {
            return true;
        }
    } catch(e) {}

    // Fallback เฉพาะกรณีไม่มีข้อมูล role ใน session เลย และผู้ใช้เปิดหน้าศูนย์อนุมัติอยู่จริง
    const viewApprovalsEl = document.getElementById('view-approvals');
    if ((viewApprovalsEl && viewApprovalsEl.offsetParent !== null) || document.querySelector('.approval-center-header')) {
        return true;
    }

    return false;
}

// 🟢 เล่นเสียงแจ้งเตือนภาษาไทย (สแกนเพศเสียงแม่นยำ 100%: ชาย = ครับ / หญิง = ค่ะ)
function playTTSNotification(text) {
    if (!isUserLoggedIn() || isTTSMuted) return; // ⛔ บล็อกเสียงพูดถ้าอยู่ในหน้าล็อกอินหรือปิดเสียงไว้
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            const voices = window.speechSynthesis.getVoices();
            const thaiVoices = voices.filter(v => v.lang === 'th-TH' || v.lang.startsWith('th'));

            let selectedVoice = null;
            let isMale = false;

            if (thaiVoices.length > 0) {
                selectedVoice = thaiVoices.find(v => {
                    const nameLower = v.name.toLowerCase();
                    return (
                        nameLower.includes('premwadee') || 
                        nameLower.includes('narisa') || 
                        nameLower.includes('kanya') || 
                        nameLower.includes('achara') || 
                        nameLower.includes('female') || 
                        nameLower.includes('google ภาษาไทย') ||
                        nameLower.includes('online (natural)')
                    );
                });

                if (!selectedVoice) {
                    selectedVoice = thaiVoices[0];
                }

                const activeVoiceName = selectedVoice.name.toLowerCase();
                if (
                    activeVoiceName.includes('pattara') || 
                    activeVoiceName.includes('niwat') || 
                    activeVoiceName.includes('male') || 
                    activeVoiceName.includes('guy') || 
                    activeVoiceName.includes('david') || 
                    activeVoiceName.includes('ชาย') ||
                    selectedVoice.gender === 'male'
                ) {
                    isMale = true;
                }
            }

            let cleanText = String(text).replace(/(ค่ะ|ครับ|คะ)$/g, '').trim();

            if (isMale) {
                cleanText += " ครับ";
            } else {
                cleanText += " ค่ะ";
            }

            const utter = new SpeechSynthesisUtterance(cleanText);
            utter.lang = 'th-TH';

            if (selectedVoice) {
                utter.voice = selectedVoice;
            }

            utter.pitch = isMale ? 1.0 : 1.2;
            utter.rate = 1.05;

            window.speechSynthesis.speak(utter);
        }
    } catch(e) {
        // Safe Catch
    }
}

// 🟢 ระบบ Auto-Refresh หน้ารายการสินค้าอัตโนมัติเมื่อมีความเปลี่ยนแปลง
function triggerAutoUIRefresh() {
    if (!isUserLoggedIn()) return;
    try {
        if (typeof loadDataFromDatabase === 'function') loadDataFromDatabase();
        if (typeof fetchInventoryData === 'function') fetchInventoryData();
        if (typeof renderStockTable === 'function') renderStockTable();
        if (typeof refreshWarehouseUI === 'function') refreshWarehouseUI();
        if (typeof renderWarehouseMap === 'function') renderWarehouseMap();
        if (typeof loadOutboundHistory === 'function') loadOutboundHistory();
    } catch(e) {
        // Safe Catch
    }
}

// 🟢 ดึงหรือสร้าง Supabase Client 100% (Secure Instance Retrieval)
function getSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase && typeof _supabase.from === 'function') return _supabase;
    if (window._supabase && typeof window._supabase.from === 'function') return window._supabase;
    if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') return window.supabaseClient;

    try {
        const sbLib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
        if (sbLib && typeof sbLib.createClient === 'function' && WMS_SUPABASE_URL && WMS_SUPABASE_ANON_KEY) {
            window._supabase = sbLib.createClient(WMS_SUPABASE_URL, WMS_SUPABASE_ANON_KEY);
            return window._supabase;
        }
    } catch(e) {
        // Safe catch to protect credentials and connection errors
    }
    return null;
}

function getLocalApprovalsStore() {
    try {
        const stored = localStorage.getItem(LOCAL_APPROVALS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch(e) { return []; }
}

function saveLocalApprovalsStore(data) {
    try { localStorage.setItem(LOCAL_APPROVALS_KEY, JSON.stringify(data)); } catch(e) {}
}

// -------------------------------------------------------------------------
// 1.2 ตัวประมวลผลคำสั่งคลังสินค้า (เบิกออก / ย้ายพิกัด / ลบ / แก้ไข)
// ใช้ร่วมกันทั้งกรณี Admin ทำทันที และกรณี Admin กดอนุมัติคำขอของ User
// -------------------------------------------------------------------------
function normalizeActionType(rawType) {
    const t = String(rawType || 'OTHER').toUpperCase().trim();
    if (t === 'OUTBOUND' || t === 'WITHDRAW' || t === 'ISSUE' || t.includes('เบิก') || t.includes('จ่าย')) return 'DISPATCH';
    if (t === 'MOVE' || t === 'RELOCATE' || t.includes('ย้าย')) return 'TRANSFER';
    if (t === 'REMOVE' || t.includes('ลบ')) return 'DELETE';
    if (t === 'UPDATE' || t.includes('แก้ไข')) return 'EDIT';
    return t;
}

async function executeDirectWarehouseMutation(type, targetSns, payloadData = {}, actorName = 'admin') {
    const normalizedType = normalizeActionType(type);
    const cleanSns = Array.isArray(targetSns)
        ? targetSns.filter(s => s !== null && s !== undefined && String(s).trim() !== '').map(s => String(s).trim())
        : (targetSns ? [String(targetSns).trim()] : []);

    if (cleanSns.length === 0) return { success: false, message: 'ไม่พบหมายเลข S/N' };

    const client = getSupabaseClient();
    if (!client) return { success: false, message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' };

    try {
        if (normalizedType === 'DELETE' || normalizedType === 'DISPATCH') {
            // ลบรายการออกจากคลัง (ทั้งกรณีลบสต็อก และกรณีเบิกสินค้าออกจากคลัง)
            const { error } = await client.from('warehouse_items').delete().in('sn', cleanSns);
            if (error) return { success: false, message: error.message };

            // บันทึกประวัติธุรกรรมลงตารางประวัติหากระบบมีตาราง stock_history / transaction_logs (Safe Catch)
            try {
                const actionLabel = normalizedType === 'DISPATCH' ? 'เบิกสินค้าออกจากคลัง (DISPATCH)' : 'ลบรายการสินค้า (DELETE)';
                const historyRows = cleanSns.map(sn => ({
                    sn: sn,
                    action: normalizedType,
                    details: payloadData.description || payloadData.reason || actionLabel,
                    recipient: payloadData.recipient || payloadData.receiver || payloadData.destination || '-',
                    performed_by: actorName,
                    created_at: new Date().toISOString()
                }));
                await client.from('stock_history').insert(historyRows);
            } catch (histErr) {
                // Ignore if optional history table has different schema
            }
        } else if (normalizedType === 'TRANSFER') {
            const targetLocation = payloadData.target_location || payloadData.new_location || payloadData.location || payloadData.to_location;
            if (!targetLocation) {
                return { success: false, message: 'ไม่พบข้อมูลพิกัดปลายทางสำหรับการย้ายพิกัด' };
            }

            const updateFields = {
                location: String(targetLocation).trim(),
                updated_at: new Date().toISOString()
            };
            if (payloadData.row !== undefined) updateFields.row = payloadData.row;
            if (payloadData.zone !== undefined) updateFields.zone = payloadData.zone;

            const { error } = await client.from('warehouse_items').update(updateFields).in('sn', cleanSns);
            if (error) return { success: false, message: error.message };
        } else if (normalizedType === 'EDIT' && payloadData.updates && typeof payloadData.updates === 'object') {
            const safeUpdates = { ...payloadData.updates, updated_at: new Date().toISOString() };
            delete safeUpdates.id;
            delete safeUpdates.sn;
            const { error } = await client.from('warehouse_items').update(safeUpdates).in('sn', cleanSns);
            if (error) return { success: false, message: error.message };
        }

        return { success: true };
    } catch (e) {
        return { success: false, message: e.message || 'เกิดข้อผิดพลาดในการอัปเดตฐานข้อมูล' };
    }
}

// -------------------------------------------------------------------------
// 1.5 สร้างและอัปเกรด UX/UI สมัยใหม่สำหรับหน้าศูนย์อนุมัติอัตโนมัติ (Modern UI Engine)
// -------------------------------------------------------------------------
function getRequestTypeMeta(type) {
    const raw = normalizeActionType(type);
    const map = {
        'DELETE': { label: 'ลบรายการสต็อก', icon: 'fa-trash-can', bg: '#fee2e2', color: '#dc2626', border: '#fecaca' },
        'DISPATCH': { label: 'เบิกสินค้าออกจากคลัง', icon: 'fa-truck-ramp-box', bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
        'TRANSFER': { label: 'ย้ายพิกัดจัดเก็บ', icon: 'fa-right-left', bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' },
        'EDIT': { label: 'แก้ไขข้อมูลสินค้า', icon: 'fa-pen-to-square', bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe' },
        'RECEIVE': { label: 'รับสินค้าเข้าคลัง', icon: 'fa-boxes-packing', bg: '#d1fae5', color: '#059669', border: '#a7f3d0' }
    };
    return map[raw] || { label: raw, icon: 'fa-file-signature', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
}

function injectModernApprovalsStyles() {
    if (document.getElementById('wms-approvals-modern-styles')) return;
    const style = document.createElement('style');
    style.id = 'wms-approvals-modern-styles';
    style.textContent = `
        .wms-appr-shell {
            display: flex;
            flex-direction: column;
            gap: 14px;
            margin-bottom: 16px;
            font-family: 'Sarabun', 'Prompt', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .wms-appr-role-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
            padding: 11px 16px;
            border-radius: 12px;
            font-size: 0.84rem;
            font-weight: 700;
        }
        .wms-appr-role-banner.is-admin {
            background: linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%);
            border: 1px solid #a7f3d0;
            color: #065f46;
        }
        .wms-appr-role-banner.is-user {
            background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
            border: 1px solid #fde68a;
            color: #92400e;
        }
        .wms-appr-kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
        }
        @media (max-width: 900px) {
            .wms-appr-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 480px) {
            .wms-appr-kpi-grid { grid-template-columns: 1fr; }
        }
        .wms-appr-kpi-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
            position: relative;
            overflow: hidden;
        }
        .wms-appr-kpi-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
            border-color: #cbd5e1;
        }
        .wms-appr-kpi-card.active {
            border-width: 2px;
            box-shadow: 0 6px 16px rgba(37, 99, 235, 0.14);
        }
        .wms-appr-kpi-title {
            font-size: 0.82rem;
            font-weight: 600;
            color: #64748b;
            margin-bottom: 4px;
        }
        .wms-appr-kpi-value {
            font-size: 1.55rem;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.1;
        }
        .wms-appr-kpi-icon {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.15rem;
            flex-shrink: 0;
        }
        .wms-appr-toolbar {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 16px;
            box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .wms-appr-filter-row {
            display: grid;
            grid-template-columns: 2fr 1.2fr 1.3fr 1.1fr 1.1fr;
            gap: 10px;
            align-items: end;
        }
        @media (max-width: 1100px) {
            .wms-appr-filter-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 600px) {
            .wms-appr-filter-row { grid-template-columns: 1fr; }
        }
        .wms-appr-field label {
            display: block;
            font-size: 0.78rem;
            font-weight: 700;
            color: #475569;
            margin-bottom: 5px;
        }
        .wms-appr-input, .wms-appr-select {
            width: 100%;
            height: 38px;
            padding: 0 12px;
            border-radius: 10px;
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            color: #0f172a;
            font-size: 0.88rem;
            font-weight: 500;
            transition: all 0.15s ease;
            box-sizing: border-box;
        }
        .wms-appr-input:focus, .wms-appr-select:focus {
            outline: none;
            border-color: #2563eb;
            background: #ffffff;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
        }
        .wms-appr-meta-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding-top: 10px;
            border-top: 1px dashed #e2e8f0;
        }
        .wms-appr-limit-group {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
        }
        .wms-appr-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 34px;
            padding: 0 12px;
            border-radius: 9px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #334155;
            font-size: 0.82rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .wms-appr-btn:hover {
            background: #f1f5f9;
            border-color: #94a3b8;
        }
        .wms-appr-btn.primary {
            background: #2563eb;
            color: #ffffff;
            border-color: #2563eb;
        }
        .wms-appr-btn.primary:hover {
            background: #1d4ed8;
        }
        .wms-appr-btn.success {
            background: #10b981;
            color: #ffffff;
            border-color: #10b981;
        }
        .wms-appr-btn.success:hover {
            background: #059669;
        }
        .wms-appr-btn.danger {
            background: #ef4444;
            color: #ffffff;
            border-color: #ef4444;
        }
        .wms-appr-btn.danger:hover {
            background: #dc2626;
        }
        .wms-appr-btn.active-pill {
            background: #0f172a;
            color: #ffffff;
            border-color: #0f172a;
        }
        .wms-appr-live-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            display: inline-block;
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
            animation: wmsPulseLive 1.8s infinite;
        }
        @keyframes wmsPulseLive {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.65); }
            70% { box-shadow: 0 0 0 7px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .wms-appr-table-wrap {
            background: #ffffff;
            border-radius: 16px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
        .wms-appr-table-wrap table {
            width: 100%;
            border-collapse: collapse;
        }
        .wms-appr-table-wrap thead th {
            position: sticky;
            top: 0;
            z-index: 5;
            background: #f8fafc;
            color: #334155;
            font-weight: 800;
            font-size: 0.82rem;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            padding: 13px 12px;
            border-bottom: 2px solid #e2e8f0;
            white-space: nowrap;
        }
        .wms-appr-row {
            border-bottom: 1px solid #f1f5f9;
            transition: background-color 0.14s ease;
        }
        .wms-appr-row:hover {
            background-color: #f8fafc;
        }
        .wms-appr-row.is-pending {
            background-color: #fffbeb66;
        }
        .wms-appr-row.is-pending:hover {
            background-color: #fef3c755;
        }
        .wms-appr-desc-clamp {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            line-height: 1.45;
            max-height: 2.9em;
            font-size: 0.88rem;
            color: #1e293b;
        }
        .wms-appr-bulk-bar {
            display: none;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 12px;
            padding: 10px 14px;
        }
        .wms-appr-bulk-bar.visible {
            display: flex;
        }
        .wms-appr-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(3px);
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        }
        .wms-appr-modal-card {
            background: #ffffff;
            border-radius: 18px;
            width: 100%;
            max-width: 600px;
            max-height: 88vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 48px rgba(15, 23, 42, 0.25);
            overflow: hidden;
            animation: wmsModalPop 0.18s ease-out;
        }
        @keyframes wmsModalPop {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
}

function ensureModernApprovalsUI() {
    if (!isUserLoggedIn()) return;
    injectModernApprovalsStyles();

    const tbody = document.getElementById('approvalsTableBody')
        || document.getElementById('approvalTableBody')
        || document.querySelector('#view-approvals table tbody');
    if (!tbody) return;

    const table = tbody.closest('table');
    if (!table) return;

    if (!table.parentElement.classList.contains('wms-appr-table-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'wms-appr-table-wrap';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
    }

    const tableWrap = table.parentElement;
    if (document.getElementById('wmsApprovalsModernControls')) return;

    const isAdmin = isCurrentUserAdmin();
    const { name: displayName, username } = getCurrentUserIdentity();

    const shell = document.createElement('div');
    shell.id = 'wmsApprovalsModernControls';
    shell.className = 'wms-appr-shell';
    shell.innerHTML = `
        <!-- Role Policy Banner -->
        <div class="wms-appr-role-banner ${isAdmin ? 'is-admin' : 'is-user'}">
            <div>
                ${isAdmin
                    ? `<i class="fa-solid fa-shield-halved"></i> สิทธิ์ปัจจุบัน: <strong>ผู้ควบคุมดูแลเว็บ / แอดมิน (${escapeHTML(displayName)})</strong> — สามารถเบิกสินค้าออกจากคลัง, ย้ายพิกัด และลบรายการได้ทันทีโดยไม่ต้องขออนุมัติ`
                    : `<i class="fa-solid fa-user-lock"></i> สิทธิ์ปัจจุบัน: <strong>ผู้ใช้งานทั่วไป (${escapeHTML(displayName)})</strong> — การเบิกสินค้าออกจากคลัง, ย้ายพิกัด และลบรายการ จะส่งคำขออนุมัติไปยังแอดมินทุกครั้ง`
                }
            </div>
            ${!isAdmin ? `
                <button type="button" class="wms-appr-btn primary" onclick="filterApprovalsByRequester('${escapeHTML(username)}')">
                    <i class="fa-solid fa-user-clock"></i> ดูเฉพาะคำขอของฉัน
                </button>
            ` : ''}
        </div>

        <!-- KPI Summary Cards -->
        <div class="wms-appr-kpi-grid">
            <div class="wms-appr-kpi-card active" data-kpi-status="ALL" onclick="filterApprovalsByStatus('ALL')">
                <div>
                    <div class="wms-appr-kpi-title">คำขอทั้งหมดในระบบ</div>
                    <div class="wms-appr-kpi-value" id="wmsKpiTotalCount">0</div>
                </div>
                <div class="wms-appr-kpi-icon" style="background:#eff6ff; color:#2563eb;">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
            </div>
            <div class="wms-appr-kpi-card" data-kpi-status="PENDING" onclick="filterApprovalsByStatus('PENDING')">
                <div>
                    <div class="wms-appr-kpi-title">รออนุมัติ (Pending)</div>
                    <div class="wms-appr-kpi-value" id="wmsKpiPendingCount" style="color:#d97706;">0</div>
                </div>
                <div class="wms-appr-kpi-icon" style="background:#fef3c7; color:#d97706;">
                    <i class="fa-solid fa-hourglass-half"></i>
                </div>
            </div>
            <div class="wms-appr-kpi-card" data-kpi-status="APPROVED" onclick="filterApprovalsByStatus('APPROVED')">
                <div>
                    <div class="wms-appr-kpi-title">อนุมัติแล้ว (Approved)</div>
                    <div class="wms-appr-kpi-value" id="wmsKpiApprovedCount" style="color:#059669;">0</div>
                </div>
                <div class="wms-appr-kpi-icon" style="background:#d1fae5; color:#059669;">
                    <i class="fa-solid fa-circle-check"></i>
                </div>
            </div>
            <div class="wms-appr-kpi-card" data-kpi-status="REJECTED" onclick="filterApprovalsByStatus('REJECTED')">
                <div>
                    <div class="wms-appr-kpi-title">ปฏิเสธแล้ว (Rejected)</div>
                    <div class="wms-appr-kpi-value" id="wmsKpiRejectedCount" style="color:#dc2626;">0</div>
                </div>
                <div class="wms-appr-kpi-icon" style="background:#fee2e2; color:#dc2626;">
                    <i class="fa-solid fa-circle-xmark"></i>
                </div>
            </div>
        </div>

        <!-- Real-time Multi-Criteria Filter & Display Toolbar -->
        <div class="wms-appr-toolbar">
            <div class="wms-appr-filter-row">
                <div class="wms-appr-field">
                    <label for="wmsApprSearchInput"><i class="fa-solid fa-magnifying-glass"></i> ค้นหาด่วน (ผู้ขอ / S/N / พิกัด / รายละเอียด)</label>
                    <input type="text" id="wmsApprSearchInput" class="wms-appr-input" placeholder="พิมพ์ชื่อผู้ขอ, หมายเลข S/N, พิกัด หรือรายละเอียด..." oninput="handleApprovalSearchInput(this.value)">
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprTypeSelect"><i class="fa-solid fa-tags"></i> ประเภทคำขอ</label>
                    <select id="wmsApprTypeSelect" class="wms-appr-select" onchange="filterApprovalsByType(this.value)">
                        <option value="ALL">ทุกประเภทคำขอ (ทั้งหมด)</option>
                    </select>
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprRequesterSelect"><i class="fa-solid fa-user-check"></i> รายชื่อผู้ขออนุมัติ</label>
                    <select id="wmsApprRequesterSelect" class="wms-appr-select" onchange="filterApprovalsByRequester(this.value)">
                        <option value="ALL">ผู้ขออนุมัติทุกคน (ทั้งหมด)</option>
                    </select>
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprStatusSelect"><i class="fa-solid fa-filter"></i> สถานะคำขอ</label>
                    <select id="wmsApprStatusSelect" class="wms-appr-select" onchange="filterApprovalsByStatus(this.value)">
                        <option value="ALL">ทุกสถานะ</option>
                        <option value="PENDING">⏳ รออนุมัติ</option>
                        <option value="APPROVED">✅ อนุมัติแล้ว</option>
                        <option value="REJECTED">❌ ปฏิเสธ</option>
                    </select>
                </div>
                <div class="wms-appr-field">
                    <label for="wmsApprSortSelect"><i class="fa-solid fa-arrow-down-wide-short"></i> เรียงลำดับ</label>
                    <select id="wmsApprSortSelect" class="wms-appr-select" onchange="changeApprovalSortOrder(this.value)">
                        <option value="NEWEST">ล่าสุดขึ้นก่อน (ใหม่ -> เก่า)</option>
                        <option value="OLDEST">เก่าสุดขึ้นก่อน (เก่า -> ใหม่)</option>
                        <option value="PENDING_FIRST">รออนุมัติขึ้นก่อนเสมอ</option>
                    </select>
                </div>
            </div>

            <div class="wms-appr-meta-bar">
                <div class="wms-appr-limit-group">
                    <span style="font-size:0.82rem; font-weight:700; color:#475569;">
                        <span class="wms-appr-live-dot" style="margin-right:6px;"></span>
                        แสดงผล:
                    </span>
                    <select id="wmsApprLimitSelect" class="wms-appr-select" style="width:auto; height:34px; font-weight:700;" onchange="setApprovalDisplayLimit(this.value)">
                        <option value="25" selected>25 รายการ (ค่าเริ่มต้น)</option>
                        <option value="50">50 รายการ</option>
                        <option value="100">100 รายการ</option>
                        <option value="200">200 รายการ</option>
                        <option value="500">500 รายการ</option>
                        <option value="ALL">แสดงทั้งหมด (All)</option>
                    </select>
                    <button type="button" id="wmsApprShowAllBtn" class="wms-appr-btn" onclick="toggleShowAllApprovals()">
                        <i class="fa-solid fa-list-ul"></i> แสดงทุกรายการทั้งหมด
                    </button>
                    <span id="wmsApprCountSummary" style="font-size:0.82rem; color:#64748b; font-weight:600; margin-left:4px;">
                        กำลังโหลด...
                    </span>
                </div>

                <div class="wms-appr-limit-group">
                    <button type="button" id="wmsApprTTSBtn" class="wms-appr-btn" onclick="toggleApprovalTTSMute()" title="เปิด/ปิดเสียงอ่านแจ้งเตือน">
                        <i class="fa-solid ${isTTSMuted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i>
                        <span>${isTTSMuted ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}</span>
                    </button>
                    <button type="button" class="wms-appr-btn" onclick="exportFilteredApprovalsCSV()" title="ส่งออกรายการที่กรองเป็นไฟล์ CSV">
                        <i class="fa-solid fa-file-csv" style="color:#059669;"></i> ส่งออก CSV
                    </button>
                    <button type="button" class="wms-appr-btn" onclick="resetAllApprovalFilters()" title="ล้างตัวกรองทั้งหมด">
                        <i class="fa-solid fa-rotate-left"></i> ล้างตัวกรอง
                    </button>
                </div>
            </div>

            <!-- Bulk Action Bar (Admin Only when items selected) -->
            <div id="wmsApprBulkBar" class="wms-appr-bulk-bar">
                <div style="font-size:0.86rem; font-weight:700; color:#1e40af;">
                    <i class="fa-solid fa-check-double"></i> เลือกไว้แล้ว <span id="wmsApprSelectedCount">0</span> รายการ (เฉพาะรายการรออนุมัติ)
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="wms-appr-btn success" onclick="bulkApproveSelectedRequests()">
                        <i class="fa-solid fa-check"></i> อนุมัติที่เลือกทั้งหมด
                    </button>
                    <button type="button" class="wms-appr-btn danger" onclick="bulkRejectSelectedRequests()">
                        <i class="fa-solid fa-xmark"></i> ปฏิเสธที่เลือกทั้งหมด
                    </button>
                    <button type="button" class="wms-appr-btn" onclick="clearApprovalSelections()">
                        ยกเลิกการเลือก
                    </button>
                </div>
            </div>
        </div>
    `;

    tableWrap.parentNode.insertBefore(shell, tableWrap);
    syncApprovalFilterControlsUI();
}

function syncApprovalFilterControlsUI() {
    const statusSel = document.getElementById('wmsApprStatusSelect');
    if (statusSel && statusSel.value !== approvalStatusFilter) statusSel.value = approvalStatusFilter;

    const typeSel = document.getElementById('wmsApprTypeSelect');
    if (typeSel && typeSel.value !== approvalTypeFilter) typeSel.value = approvalTypeFilter;

    const reqSel = document.getElementById('wmsApprRequesterSelect');
    if (reqSel && reqSel.value !== approvalRequesterFilter) reqSel.value = approvalRequesterFilter;

    const sortSel = document.getElementById('wmsApprSortSelect');
    if (sortSel && sortSel.value !== approvalSortOrder) sortSel.value = approvalSortOrder;

    const limitSel = document.getElementById('wmsApprLimitSelect');
    const limitValStr = String(approvalDisplayLimit);
    if (limitSel && limitSel.value !== limitValStr) limitSel.value = limitValStr;

    const showAllBtn = document.getElementById('wmsApprShowAllBtn');
    if (showAllBtn) {
        if (approvalDisplayLimit === 'ALL') {
            showAllBtn.classList.add('active-pill');
            showAllBtn.innerHTML = `<i class="fa-solid fa-compress"></i> กลับไปแสดง 25 รายการ`;
        } else {
            showAllBtn.classList.remove('active-pill');
            showAllBtn.innerHTML = `<i class="fa-solid fa-list-ul"></i> แสดงทุกรายการทั้งหมด`;
        }
    }

    document.querySelectorAll('.wms-appr-kpi-card').forEach(card => {
        const kpiStatus = card.getAttribute('data-kpi-status');
        if (kpiStatus === approvalStatusFilter) {
            card.classList.add('active');
            card.style.borderColor = '#2563eb';
        } else {
            card.classList.remove('active');
            card.style.borderColor = '#e2e8f0';
        }
    });
}

function updateDynamicFilterDropdowns(allRecords) {
    // 1. Update Request Types Dropdown dynamically
    const typeSel = document.getElementById('wmsApprTypeSelect');
    if (typeSel) {
        const standardTypes = ['DISPATCH', 'TRANSFER', 'DELETE', 'EDIT', 'RECEIVE'];
        const foundTypes = new Set(standardTypes);
        (allRecords || []).forEach(r => {
            if (r && r.request_type) foundTypes.add(normalizeActionType(r.request_type));
        });

        const typeOptions = Array.from(foundTypes);
        const signature = typeOptions.join('|');
        if (typeSel.dataset.optionsSig !== signature) {
            typeSel.dataset.optionsSig = signature;
            let optHtml = `<option value="ALL">ทุกประเภทคำขอ (${typeOptions.length} ประเภท)</option>`;
            typeOptions.forEach(t => {
                const meta = getRequestTypeMeta(t);
                optHtml += `<option value="${escapeHTML(t)}">${escapeHTML(meta.label)} (${escapeHTML(t)})</option>`;
            });
            typeSel.innerHTML = optHtml;
            typeSel.value = foundTypes.has(approvalTypeFilter) ? approvalTypeFilter : 'ALL';
        }
    }

    // 2. Update Requesters Dropdown dynamically (Real-Time)
    const reqSel = document.getElementById('wmsApprRequesterSelect');
    if (reqSel) {
        const requesterMap = new Map();
        (allRecords || []).forEach(r => {
            if (!r) return;
            const uname = String(r.requester_username || '').trim();
            const dname = String(r.requester_name || uname || 'ไม่ระบุชื่อ').trim();
            const key = uname || dname;
            if (!key) return;

            if (!requesterMap.has(key)) {
                requesterMap.set(key, { key, name: dname, username: uname, count: 1 });
            } else {
                const existing = requesterMap.get(key);
                existing.count += 1;
                if (dname && dname !== uname) existing.name = dname;
            }
        });

        const sortedRequesters = Array.from(requesterMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'));
        const reqSig = sortedRequesters.map(u => `${u.key}:${u.name}:${u.count}`).join('|');
        if (reqSel.dataset.optionsSig !== reqSig) {
            reqSel.dataset.optionsSig = reqSig;
            let reqHtml = `<option value="ALL">ผู้ขออนุมัติทุกคน (${sortedRequesters.length} คน)</option>`;
            sortedRequesters.forEach(u => {
                const displayLabel = (u.username && u.name !== u.username)
                    ? `${u.name} (@${u.username}) [${u.count}]`
                    : `${u.name} [${u.count}]`;
                reqHtml += `<option value="${escapeHTML(u.key)}">${escapeHTML(displayLabel)}</option>`;
            });
            reqSel.innerHTML = reqHtml;
            reqSel.value = requesterMap.has(approvalRequesterFilter) ? approvalRequesterFilter : 'ALL';
        }
    }

    // 3. Update KPI Summary Counters
    const totalEl = document.getElementById('wmsKpiTotalCount');
    const pendingEl = document.getElementById('wmsKpiPendingCount');
    const approvedEl = document.getElementById('wmsKpiApprovedCount');
    const rejectedEl = document.getElementById('wmsKpiRejectedCount');

    if (totalEl || pendingEl || approvedEl || rejectedEl) {
        const list = allRecords || [];
        const totalCount = list.length;
        const pendingCount = list.filter(r => r.status === 'PENDING').length;
        const approvedCount = list.filter(r => r.status === 'APPROVED').length;
        const rejectedCount = list.filter(r => r.status === 'REJECTED').length;

        if (totalEl) totalEl.textContent = totalCount.toLocaleString('th-TH');
        if (pendingEl) pendingEl.textContent = pendingCount.toLocaleString('th-TH');
        if (approvedEl) approvedEl.textContent = approvedCount.toLocaleString('th-TH');
        if (rejectedEl) rejectedEl.textContent = rejectedCount.toLocaleString('th-TH');
    }
}

function getFilteredAndSortedApprovals(sourceList) {
    const list = Array.isArray(sourceList) ? sourceList : [];
    const q = String(approvalSearchQuery || '').trim().toLowerCase();

    const filtered = list.filter(item => {
        if (!item) return false;

        if (approvalStatusFilter !== 'ALL' && item.status !== approvalStatusFilter) {
            return false;
        }

        if (approvalTypeFilter !== 'ALL') {
            const itemType = normalizeActionType(item.request_type);
            if (itemType !== approvalTypeFilter) return false;
        }

        if (approvalRequesterFilter !== 'ALL') {
            const uname = String(item.requester_username || '').trim();
            const dname = String(item.requester_name || '').trim();
            if (uname !== approvalRequesterFilter && dname !== approvalRequesterFilter) {
                return false;
            }
        }

        if (q) {
            const targetSnsArr = Array.isArray(item.target_sns) ? item.target_sns : (item.target_sns ? [item.target_sns] : []);
            const targetLoc = item.payload && (item.payload.target_location || item.payload.new_location || item.payload.location) ? (item.payload.target_location || item.payload.new_location || item.payload.location) : '';
            const haystack = [
                item.requester_name,
                item.requester_username,
                item.request_type,
                item.description,
                item.approved_by,
                targetLoc,
                ...targetSnsArr
            ].filter(Boolean).join(' ').toLowerCase();

            if (!haystack.includes(q)) return false;
        }

        return true;
    });

    const sorted = [...filtered];
    if (approvalSortOrder === 'OLDEST') {
        sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    } else if (approvalSortOrder === 'PENDING_FIRST') {
        sorted.sort((a, b) => {
            const aPend = a.status === 'PENDING' ? 0 : 1;
            const bPend = b.status === 'PENDING' ? 0 : 1;
            if (aPend !== bPend) return aPend - bPend;
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
    } else {
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    return sorted;
}

// -------------------------------------------------------------------------
// 2. ระบบส่งคำขออนุมัติ / ดำเนินการตามสิทธิ์ (User ขอทุกครั้ง | Admin ทำได้ทันที)
// -------------------------------------------------------------------------
async function createPendingApprovalRequest(type, desc, targetSns, payloadData, options = {}) {
    const cleanTargetSns = Array.isArray(targetSns)
        ? targetSns.filter(s => s !== null && s !== undefined && String(s).trim() !== '').map(s => String(s).trim())
        : (targetSns ? [String(targetSns).trim()] : []);

    if (cleanTargetSns.length === 0) {
        if (typeof showToast === 'function') showToast("⚠ ไม่พบหมายเลข S/N ที่ต้องการดำเนินการ", true);
        return false;
    }

    const { username: usernameVal, name: nameVal } = getCurrentUserIdentity();
    const normalizedType = normalizeActionType(type || 'DELETE');
    const isAdmin = isCurrentUserAdmin();

    // ⚡ หากเป็นรหัสผู้ควบคุมดูแลเว็บหรือแอดมิน: ดำเนินการทันทีโดยไม่ต้องรออนุมัติ (ยกเว้นสั่ง forceApproval: true)
    if (isAdmin && !options.forceApproval) {
        const directRes = await executeDirectWarehouseMutation(normalizedType, cleanTargetSns, {
            ...(payloadData || {}),
            description: desc
        }, nameVal || usernameVal);

        if (!directRes.success) {
            if (typeof showToast === 'function') showToast(`❌ ดำเนินการไม่สำเร็จ: ${directRes.message || ''}`, true);
            return false;
        }

        const typeMeta = getRequestTypeMeta(normalizedType);
        playTTSNotification(`${typeMeta.label}เรียบร้อยแล้ว`);
        showFloatingNotificationAlert(
            `⚡ ${typeMeta.label}สำเร็จทันที!`,
            `รายการ: ${desc}\nจำนวน: ${cleanTargetSns.length} รายการ (ดำเนินการด้วยสิทธิ์ผู้ควบคุมดูแลระบบ)`,
            "success"
        );
        if (typeof showToast === 'function') showToast(`✅ ${typeMeta.label}สำเร็จทันที (${cleanTargetSns.length} รายการ)`);

        triggerAutoUIRefresh();
        return true;
    }

    // 🔒 หากเป็นรหัส User ทั่วไป: ต้องสร้างคำขออนุมัติ (PENDING) ทุกครั้ง
    const client = getSupabaseClient();
    if (!client) {
        if (typeof showToast === 'function') showToast("❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้", true);
        return false;
    }

    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const requestPayload = {
        id: reqId,
        requester_username: String(usernameVal),
        requester_name: String(nameVal),
        request_type: String(normalizedType),
        description: String(desc || 'ขอดำเนินการเกี่ยวกับสต็อกสินค้า'),
        target_sns: cleanTargetSns,
        payload: payloadData || {},
        status: 'PENDING',
        approved_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    let savedDbRecord = null;

    try {
        let { data, error } = await client
            .from('approval_requests')
            .insert([requestPayload])
            .select();

        if (error && (error.message.includes('uuid') || error.message.includes('integer') || error.code === '22P02')) {
            const autoIdPayload = { ...requestPayload };
            delete autoIdPayload.id;

            const retryResult = await client
                .from('approval_requests')
                .insert([autoIdPayload])
                .select();

            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            if (typeof showToast === 'function') showToast("❌ บันทึกคำขอไม่สำเร็จ", true);
            return false;
        }

        if (data && data.length > 0) {
            savedDbRecord = data[0];
        }
    } catch(e) {
        if (typeof showToast === 'function') showToast("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล", true);
        return false;
    }

    const activeRecord = savedDbRecord || requestPayload;

    const localList = getLocalApprovalsStore();
    localList.unshift(activeRecord);
    saveLocalApprovalsStore(localList);

    userTrackedRequestStatuses[activeRecord.id] = 'PENDING';

    playTTSNotification("ส่งคำขออนุมัติเรียบร้อยแล้ว");

    showFloatingNotificationAlert(
        "📤 ส่งคำขออนุมัติเรียบร้อยแล้ว!",
        `รายการ: ${desc}\nสถานะ: ส่งเรื่องไปยังศูนย์อนุมัติเรียบร้อยแล้ว อยู่ระหว่างรอผู้ดูแลระบบ (Admin) อนุมัติ`,
        "warning"
    );

    if (typeof showToast === 'function') showToast("✅ ส่งคำขออนุมัติเรียบร้อยแล้ว");

    await loadPendingApprovalsFromDB();
    return true;
}

// -------------------------------------------------------------------------
// 2.5 ฟังก์ชันกลางสำหรับงานเบิกสินค้าออกจากคลัง (DISPATCH) และงานย้ายพิกัด (TRANSFER)
// เรียกใช้ได้จากทุกหน้า (Outbound / Location Move / Stock Check)
// -------------------------------------------------------------------------
async function requestOrExecuteWarehouseAction(actionType, desc, targetSns, payloadData = {}) {
    return await createPendingApprovalRequest(actionType, desc, targetSns, payloadData, { forceApproval: false });
}

async function submitOutboundDispatchWithRoleGuard(targetSns, recipientOrNote = '', extraPayload = {}) {
    const cleanSns = Array.isArray(targetSns) ? targetSns : [targetSns];
    const desc = recipientOrNote
        ? `เบิกสินค้าออกจากคลัง (${cleanSns.length} รายการ) -> ${recipientOrNote}`
        : `เบิกสินค้าออกจากคลังจำนวน ${cleanSns.length} รายการ`;
    return await requestOrExecuteWarehouseAction('DISPATCH', desc, cleanSns, {
        recipient: recipientOrNote,
        ...extraPayload
    });
}

async function submitLocationTransferWithRoleGuard(targetSns, targetLocation, extraPayload = {}) {
    const cleanSns = Array.isArray(targetSns) ? targetSns : [targetSns];
    const desc = `ย้ายพิกัดจัดเก็บ (${cleanSns.length} รายการ) ไปยังพิกัด [${targetLocation}]`;
    return await requestOrExecuteWarehouseAction('TRANSFER', desc, cleanSns, {
        target_location: targetLocation,
        ...extraPayload
    });
}

// -------------------------------------------------------------------------
// 3. โหลดคำขออนุมัติจาก DB & แยกการแจ้งเตือน (บล็อกการแจ้งเตือนในหน้า Login)
// -------------------------------------------------------------------------
async function loadPendingApprovalsFromDB(forceRender = false) {
    let mergedData = [];
    let dbSuccess = false;

    const client = getSupabaseClient();
    // ดึงข้อมูลแบบรวดเร็ว: ค่าเริ่มต้น 25 รายการดึงชุดล่าสุด 250 แถวเพื่อความไวสูงสุด, หากเลือก ALL ดึงได้สูงสุด 2,500 แถว
    const fetchCeiling = approvalDisplayLimit === 'ALL' ? 2500 : Math.max(250, Number(approvalDisplayLimit) * 4);

    if (client) {
        try {
            const { data, error } = await client
                .from('approval_requests')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(fetchCeiling);

            if (!error && data) {
                mergedData = data;
                dbSuccess = true;
            }
        } catch(e) {
            // Safe Catch
        }
    }

    if (!dbSuccess) {
        mergedData = getLocalApprovalsStore();
    }

    if (mergedData) {
        const pendingCount = mergedData.filter(r => r.status === 'PENDING').length;
        const loggedIn = isUserLoggedIn();
        const isAdmin = isCurrentUserAdmin();

        // 🚨 บล็อกการแสดงผลแจ้งเตือนทุกชนิดในหน้า Login
        if (!loggedIn) {
            updateAdminApprovalBadgeUI(0);
            mergedData.forEach(req => {
                userTrackedRequestStatuses[req.id] = req.status;
            });
            pendingApprovalsList = mergedData;
            return;
        }

        // 🟢 ADMIN ONLY (หลังจากใส่รหัสผ่านล็อกอินสำเร็จแล้วเท่านั้น)
        if (isAdmin) {
            mergedData.forEach(req => {
                if (req.status === 'PENDING') {
                    if (!userTrackedRequestStatuses[req.id]) {
                        userTrackedRequestStatuses[req.id] = 'PENDING';
                        triggerAdminNotification(req, pendingCount);
                    }
                }
            });
            updateAdminApprovalBadgeUI(pendingCount);
        } else {
            updateAdminApprovalBadgeUI(0);

            // 🟢 USER ONLY (หลังจากใส่รหัสผ่านล็อกอินสำเร็จแล้วเท่านั้น)
            const { username: currentUname } = getCurrentUserIdentity();
            if (currentUname) {
                mergedData.forEach(req => {
                    if (req.requester_username === currentUname) {
                        const oldStatus = userTrackedRequestStatuses[req.id];
                        if (oldStatus === 'PENDING' && req.status === 'APPROVED') {
                            playTTSNotification("คำขอของคุณได้รับการอนุมัติแล้ว");
                            showFloatingNotificationAlert(
                                "🎉 คำขอได้รับการอนุมัติ!",
                                `คำขอ "${req.description}" ของคุณได้รับการอนุมัติเรียบร้อยแล้ว`,
                                "success"
                            );
                            triggerAutoUIRefresh();
                        } else if (oldStatus === 'PENDING' && req.status === 'REJECTED') {
                            playTTSNotification("คำขอของคุณไม่ผ่านการอนุมัติ");
                            showFloatingNotificationAlert(
                                "❌ คำขอถูกปฏิเสธ",
                                `คำขอ "${req.description}" ของคุณถูกปฏิเสธโดยผู้ดูแลระบบ`,
                                "danger"
                            );
                        }
                        userTrackedRequestStatuses[req.id] = req.status;
                    }
                });
            }
        }

        pendingApprovalsList = mergedData;
        ensureModernApprovalsUI();
        updateDynamicFilterDropdowns(mergedData);
        renderApprovalsTable(mergedData, forceRender);
    }
}

// -------------------------------------------------------------------------
// 4. Render ตารางรายการอนุมัติและประวัติทั้งหมด (Smart Diff 60fps Engine)
// -------------------------------------------------------------------------
function renderApprovalsTable(approvals, forceRender = false) {
    if (!isUserLoggedIn()) return;

    ensureModernApprovalsUI();

    const tbody = document.getElementById('approvalsTableBody') 
        || document.getElementById('approvalTableBody')
        || document.querySelector('#view-approvals table tbody');
        
    if (!tbody) return;

    const table = tbody.closest('table');
    const isAdmin = isCurrentUserAdmin();

    // Ensure checkbox header column exists for Admin bulk actions
    if (table && table.tHead && table.tHead.rows.length > 0) {
        const headerRow = table.tHead.rows[0];
        const hasSelectCol = headerRow.querySelector('.wms-appr-select-all-th');
        if (isAdmin && !hasSelectCol) {
            const th = document.createElement('th');
            th.className = 'wms-appr-select-all-th';
            th.style.cssText = 'width:40px; text-align:center;';
            th.innerHTML = `<input type="checkbox" id="wmsApprSelectAllCheckbox" title="เลือกรายการรออนุมัติทั้งหมดที่แสดง" onchange="toggleSelectAllVisiblePending(this.checked)" style="width:16px; height:16px; cursor:pointer;">`;
            headerRow.insertBefore(th, headerRow.firstChild);
        }
    }

    const colSpanCount = (table && table.tHead && table.tHead.rows[0])
        ? table.tHead.rows[0].cells.length
        : (isAdmin ? 8 : 7);

    const filteredList = getFilteredAndSortedApprovals(approvals);
    const totalFilteredCount = filteredList.length;

    const displayedList = (approvalDisplayLimit === 'ALL')
        ? filteredList
        : filteredList.slice(0, Number(approvalDisplayLimit) || 25);

    // Update counter text
    const countSummaryEl = document.getElementById('wmsApprCountSummary');
    if (countSummaryEl) {
        if (totalFilteredCount === 0) {
            countSummaryEl.textContent = `พบ 0 รายการ (จากทั้งหมด ${(approvals || []).length.toLocaleString('th-TH')} รายการ)`;
        } else {
            countSummaryEl.innerHTML = `กำลังแสดง <strong>${displayedList.length.toLocaleString('th-TH')}</strong> จาก <strong>${totalFilteredCount.toLocaleString('th-TH')}</strong> รายการ`
                + (totalFilteredCount !== (approvals || []).length ? ` (กรองจากทั้งหมด ${(approvals || []).length.toLocaleString('th-TH')} รายการ)` : '');
        }
    }

    // Prune stale selected IDs that are no longer PENDING
    const validPendingIds = new Set((approvals || []).filter(r => r.status === 'PENDING').map(r => String(r.id)));
    selectedApprovalIds.forEach(id => {
        if (!validPendingIds.has(String(id))) selectedApprovalIds.delete(id);
    });
    updateBulkActionBarUI(displayedList);

    // Compute lightweight signature to prevent unnecessary DOM re-renders every 1s
    const renderSig = [
        isAdmin ? '1' : '0',
        approvalStatusFilter,
        approvalTypeFilter,
        approvalRequesterFilter,
        approvalSearchQuery,
        approvalSortOrder,
        String(approvalDisplayLimit),
        Array.from(selectedApprovalIds).sort().join(','),
        displayedList.map(r => `${r.id}:${r.status}:${r.updated_at || ''}:${r.approved_by || ''}`).join('|')
    ].join('::');

    if (!forceRender && renderSig === lastApprovalsRenderSignature) {
        return;
    }
    lastApprovalsRenderSignature = renderSig;

    if (!displayedList || displayedList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${colSpanCount}" style="text-align:center; padding:36px 16px; color:#64748b;">
                    <div style="font-size:2rem; margin-bottom:8px;">📭</div>
                    <div style="font-weight:700; font-size:0.95rem; color:#334155;">ไม่พบรายการคำขอที่ตรงกับเงื่อนไข</div>
                    <div style="font-size:0.82rem; margin-top:4px;">ลองเปลี่ยนตัวกรองสถานะ ประเภทคำขอ หรือกด "ล้างตัวกรอง" เพื่อดูรายการทั้งหมด</div>
                </td>
            </tr>`;
        return;
    }

    let html = '';

    displayedList.forEach((item, idx) => {
        const itemIdStr = String(item.id);
        const isPending = item.status === 'PENDING';
        const isChecked = selectedApprovalIds.has(itemIdStr);

        let statusBadge = `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:3px 10px; border-radius:999px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:4px;">⏳ รออนุมัติ</span>`;
        if (item.status === 'APPROVED') {
            statusBadge = `<span style="background:#d1fae5; color:#047857; border:1px solid #a7f3d0; padding:3px 10px; border-radius:999px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:4px;">✅ อนุมัติแล้ว</span>`;
        } else if (item.status === 'REJECTED') {
            statusBadge = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:3px 10px; border-radius:999px; font-weight:700; font-size:0.78rem; display:inline-flex; align-items:center; gap:4px;">❌ ปฏิเสธ</span>`;
        }

        const typeMeta = getRequestTypeMeta(item.request_type);
        const typeBadge = `<span style="font-weight:700; color:${typeMeta.color}; background:${typeMeta.bg}; border:1px solid ${typeMeta.border}; padding:3px 8px; border-radius:6px; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid ${typeMeta.icon}"></i> ${escapeHTML(typeMeta.label)}</span>`;

        const formattedDate = item.created_at ? new Date(item.created_at).toLocaleString('th-TH', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        }) : '-';
        
        let snsFormattedHtml = '-';
        const targetSnsArr = Array.isArray(item.target_sns) ? item.target_sns : (item.target_sns ? [item.target_sns] : []);

        if (targetSnsArr.length > 0) {
            const visibleSns = targetSnsArr.slice(0, 4);
            const remainingCount = targetSnsArr.length - visibleSns.length;

            const snTags = visibleSns.map(sn => 
                `<code style="
                    background: #f1f5f9; 
                    color: #0f172a; 
                    padding: 2px 7px; 
                    border-radius: 5px; 
                    font-size: 0.76rem; 
                    font-weight: 700;
                    border: 1px solid #cbd5e1;
                    white-space: nowrap;
                    display: inline-block;
                ">${escapeHTML(String(sn))}</code>`
            ).join('');

            const moreBadge = remainingCount > 0
                ? `<button type="button" onclick="openApprovalDetailModal('${escapeHTML(itemIdStr)}')" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:5px; font-size:0.75rem; font-weight:700; cursor:pointer;">+${remainingCount} S/N (ดูทั้งหมด)</button>`
                : '';

            snsFormattedHtml = `
                <div style="display:flex; flex-wrap:wrap; gap:4px; max-width:240px; align-items:center;">
                    ${snTags}
                    ${moreBadge}
                </div>
            `;
        }

        const checkboxCell = isAdmin ? `
            <td style="text-align:center; padding:12px 8px;">
                ${isPending ? `<input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleApprovalSelection('${escapeHTML(itemIdStr)}', this.checked)" style="width:16px; height:16px; cursor:pointer;">` : `<span style="color:#cbd5e1;">•</span>`}
            </td>
        ` : '';

        const requesterKey = item.requester_username || item.requester_name || '';
        const targetLoc = item.payload && (item.payload.target_location || item.payload.new_location || item.payload.location);
        const recipientInfo = item.payload && (item.payload.recipient || item.payload.receiver);

        html += `
            <tr class="wms-appr-row ${isPending ? 'is-pending' : ''}">
                ${checkboxCell}
                <td style="text-align:center; padding:12px 10px; font-weight:700; color:#64748b;" class="mono">${idx + 1}</td>
                <td style="font-size:0.8rem; color:#475569; padding:12px 10px; white-space:nowrap;">
                    <i class="fa-regular fa-clock" style="color:#94a3b8; margin-right:4px;"></i>${escapeHTML(formattedDate)}
                </td>
                <td style="padding:12px 10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:30px; height:30px; border-radius:50%; background:#e2e8f0; color:#334155; font-weight:800; font-size:0.78rem; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            ${escapeHTML(String(item.requester_name || item.requester_username || 'U').charAt(0).toUpperCase())}
                        </div>
                        <div>
                            <a href="javascript:void(0)" onclick="filterApprovalsByRequester('${escapeHTML(requesterKey)}')" title="คลิกเพื่อกรองเฉพาะผู้ขอรายนี้" style="color:#0f172a; font-weight:700; text-decoration:none; font-size:0.88rem;">
                                ${escapeHTML(item.requester_name || '-')}
                            </a>
                            <div style="font-size:0.76rem; color:#64748b;">@${escapeHTML(item.requester_username || '-')}</div>
                        </div>
                    </div>
                </td>
                <td style="padding:12px 10px;">
                    <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-start;">
                        ${typeBadge}
                        ${statusBadge}
                    </div>
                </td>
                <td style="padding:12px 10px; max-width:270px; word-break:break-word;">
                    <div class="wms-appr-desc-clamp" title="${escapeHTML(item.description || '-')}">${escapeHTML(item.description || '-')}</div>
                    ${targetLoc ? `<div style="margin-top:4px; font-size:0.76rem; color:#0284c7; font-weight:700;"><i class="fa-solid fa-location-dot"></i> พิกัดปลายทาง: ${escapeHTML(String(targetLoc))}</div>` : ''}
                    ${recipientInfo ? `<div style="margin-top:4px; font-size:0.76rem; color:#d97706; font-weight:700;"><i class="fa-solid fa-user-tag"></i> ผู้เบิก/ปลายทาง: ${escapeHTML(String(recipientInfo))}</div>` : ''}
                </td>
                <td style="padding:12px 10px;">${snsFormattedHtml}</td>
                <td style="text-align:center; padding:12px 10px; white-space:nowrap;">
                    <div style="display:inline-flex; align-items:center; gap:5px; flex-wrap:wrap; justify-content:center;">
                        <button type="button" onclick="openApprovalDetailModal('${escapeHTML(itemIdStr)}')" title="ดูรายละเอียดและ S/N ทั้งหมด" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:6px 9px; border-radius:7px; cursor:pointer; font-weight:700; font-size:0.8rem;">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        ${(isPending && isAdmin) ? `
                            <button type="button" onclick="approveUserRequest('${escapeHTML(itemIdStr)}')" style="background:#10b981; color:#fff; border:none; padding:6px 11px; border-radius:7px; cursor:pointer; font-weight:700; font-size:0.8rem; box-shadow:0 2px 6px rgba(16,185,129,0.28);"><i class="fa-solid fa-check"></i> อนุมัติ</button>
                            <button type="button" onclick="rejectUserRequest('${escapeHTML(itemIdStr)}')" style="background:#ef4444; color:#fff; border:none; padding:6px 11px; border-radius:7px; cursor:pointer; font-weight:700; font-size:0.8rem; box-shadow:0 2px 6px rgba(239,68,68,0.25);"><i class="fa-solid fa-xmark"></i> ปฏิเสธ</button>
                        ` : `<span style="font-size:0.78rem; color:#64748b; font-weight:600;">${item.approved_by ? 'โดย ' + escapeHTML(item.approved_by) : '-'}</span>`}
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// -------------------------------------------------------------------------
// 4.5 หน้าต่าง Modal แสดงรายละเอียดคำขอ + S/N ทั้งหมด + คัดลอก S/N
// -------------------------------------------------------------------------
function openApprovalDetailModal(id) {
    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;

    const existing = document.getElementById('wmsApprovalDetailModal');
    if (existing) existing.remove();

    const targetSnsArr = Array.isArray(req.target_sns) ? req.target_sns : (req.target_sns ? [req.target_sns] : []);
    const typeMeta = getRequestTypeMeta(req.request_type);
    const isAdmin = isCurrentUserAdmin();
    const isPending = req.status === 'PENDING';
    const createdStr = req.created_at ? new Date(req.created_at).toLocaleString('th-TH') : '-';
    const updatedStr = req.updated_at ? new Date(req.updated_at).toLocaleString('th-TH') : '-';
    const targetLoc = req.payload && (req.payload.target_location || req.payload.new_location || req.payload.location);
    const recipientInfo = req.payload && (req.payload.recipient || req.payload.receiver);

    const modal = document.createElement('div');
    modal.id = 'wmsApprovalDetailModal';
    modal.className = 'wms-appr-modal-backdrop';
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    const snBadgesHtml = targetSnsArr.length > 0
        ? targetSnsArr.map((sn, i) => `
            <span style="background:#f8fafc; border:1px solid #cbd5e1; color:#0f172a; padding:4px 9px; border-radius:6px; font-family:monospace; font-size:0.82rem; font-weight:700;">
                <span style="color:#94a3b8; margin-right:4px;">${i + 1}.</span>${escapeHTML(String(sn))}
            </span>
        `).join('')
        : '<span style="color:#64748b;">ไม่มีรายการ S/N</span>';

    modal.innerHTML = `
        <div class="wms-appr-modal-card">
            <div style="padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; background:#f8fafc;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="background:${typeMeta.bg}; color:${typeMeta.color}; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1rem;">
                        <i class="fa-solid ${typeMeta.icon}"></i>
                    </span>
                    <div>
                        <div style="font-weight:800; font-size:1.02rem; color:#0f172a;">${escapeHTML(typeMeta.label)} (${escapeHTML(req.request_type || '-')})</div>
                        <div style="font-size:0.78rem; color:#64748b;">รหัสอ้างอิง: ${escapeHTML(String(req.id))}</div>
                    </div>
                </div>
                <button type="button" onclick="document.getElementById('wmsApprovalDetailModal').remove()" style="background:none; border:none; font-size:1.4rem; color:#64748b; cursor:pointer; line-height:1;">&times;</button>
            </div>

            <div style="padding:18px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
                <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; background:#f8fafc; padding:12px; border-radius:12px; border:1px solid #e2e8f0; font-size:0.85rem;">
                    <div><span style="color:#64748b;">ผู้ส่งคำขอ:</span> <strong>${escapeHTML(req.requester_name || '-')}</strong> (@${escapeHTML(req.requester_username || '-')})</div>
                    <div><span style="color:#64748b;">สถานะปัจจุบัน:</span> <strong>${escapeHTML(req.status || '-')}</strong></div>
                    <div><span style="color:#64748b;">เวลาส่งคำขอ:</span> <strong>${escapeHTML(createdStr)}</strong></div>
                    <div><span style="color:#64748b;">อัปเดตล่าสุด:</span> <strong>${escapeHTML(updatedStr)}</strong></div>
                    ${req.approved_by ? `<div style="grid-column:1/-1;"><span style="color:#64748b;">ดำเนินการโดย:</span> <strong>${escapeHTML(req.approved_by)}</strong></div>` : ''}
                    ${targetLoc ? `<div style="grid-column:1/-1;"><span style="color:#64748b;">พิกัดปลายทาง:</span> <strong style="color:#0284c7;">${escapeHTML(String(targetLoc))}</strong></div>` : ''}
                    ${recipientInfo ? `<div style="grid-column:1/-1;"><span style="color:#64748b;">ผู้เบิก / ปลายทางรับสินค้า:</span> <strong style="color:#d97706;">${escapeHTML(String(recipientInfo))}</strong></div>` : ''}
                </div>

                <div>
                    <div style="font-size:0.82rem; font-weight:700; color:#475569; margin-bottom:5px;">รายละเอียดการดำเนินการ:</div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:0.9rem; color:#0f172a; line-height:1.5;">
                        ${escapeHTML(req.description || '-')}
                    </div>
                </div>

                <div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                        <span style="font-size:0.82rem; font-weight:700; color:#475569;">รายการ Serial Numbers (${targetSnsArr.length} รายการ):</span>
                        ${targetSnsArr.length > 0 ? `<button type="button" class="wms-appr-btn" onclick="copyApprovalSerialNumbers('${escapeHTML(String(req.id))}')"><i class="fa-regular fa-copy"></i> คัดลอก S/N ทั้งหมด</button>` : ''}
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; max-height:200px; overflow-y:auto; padding:10px; border:1px solid #e2e8f0; border-radius:10px; background:#ffffff;">
                        ${snBadgesHtml}
                    </div>
                </div>
            </div>

            <div style="padding:14px 20px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                ${(isPending && isAdmin) ? `
                    <button type="button" class="wms-appr-btn success" onclick="approveUserRequest('${escapeHTML(String(req.id))}'); document.getElementById('wmsApprovalDetailModal').remove();">
                        <i class="fa-solid fa-check"></i> อนุมัติคำขอนี้
                    </button>
                    <button type="button" class="wms-appr-btn danger" onclick="rejectUserRequest('${escapeHTML(String(req.id))}'); document.getElementById('wmsApprovalDetailModal').remove();">
                        <i class="fa-solid fa-xmark"></i> ปฏิเสธคำขอนี้
                    </button>
                ` : ''}
                <button type="button" class="wms-appr-btn" onclick="document.getElementById('wmsApprovalDetailModal').remove()">ปิดหน้าต่าง</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function copyApprovalSerialNumbers(id) {
    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;
    const sns = Array.isArray(req.target_sns) ? req.target_sns.join('\n') : String(req.target_sns || '');
    if (!sns) return;
    try {
        navigator.clipboard.writeText(sns);
        if (typeof showToast === 'function') showToast(`📋 คัดลอก S/N ทั้งหมด ${req.target_sns.length} รายการแล้ว`);
    } catch (e) {
        // Fallback
    }
}

// -------------------------------------------------------------------------
// 5. Update Badge Count (เฉพาะ Admin)
// -------------------------------------------------------------------------
function updateAdminApprovalBadgeUI(count) {
    if (!isUserLoggedIn()) return;
    const badges = document.querySelectorAll('#sidebarApprovalBadge, .approval-pending-badge');
    badges.forEach(b => {
        if (count > 0 && isCurrentUserAdmin()) {
            b.style.display = 'inline-flex';
            b.textContent = count;
        } else {
            b.style.display = 'none';
        }
    });
}

// -------------------------------------------------------------------------
// 6. ป๊อปอัพเด้งแจ้งเตือนฝั่ง Admin มุมขวาล่าง (ไม่แสดงในหน้า Login)
// -------------------------------------------------------------------------
function triggerAdminNotification(record, count) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    playTTSNotification("มีคำขออนุมัติใหม่เข้ามา");

    showFloatingNotificationAlert(
        "🚨 มีคำขออนุมัติใหม่เข้ามา!",
        `ผู้ส่ง: ${record.requester_name || record.requester_username}\nรายการ: ${record.description}\n(รออนุมัติรวม ${count} รายการ)`,
        "warning",
        true
    );
}

function showFloatingNotificationAlert(title, message, type = 'info', isClickable = false) {
    if (!isUserLoggedIn()) return;

    let container = document.getElementById('globalFloatingNotificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'globalFloatingNotificationContainer';
        container.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 999999;
            display: flex; flex-direction: column; gap: 12px;
            max-width: 420px; width: calc(100vw - 48px); pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const card = document.createElement('div');
    let borderColor = '#2563eb';
    if (type === 'success') borderColor = '#10b981';
    if (type === 'warning') borderColor = '#f59e0b';
    if (type === 'danger') borderColor = '#ef4444';

    card.style.cssText = `
        background: #ffffff; border-left: 6px solid ${borderColor};
        border-radius: 12px; padding: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.25);
        color: #0f172a; pointer-events: auto; cursor: ${(isClickable && isCurrentUserAdmin()) ? 'pointer' : 'default'};
        transition: all 0.3s ease; position: relative; font-family: sans-serif;
    `;

    if (isClickable && isCurrentUserAdmin()) {
        card.onclick = (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            navigateToApprovalCenter();
            card.remove();
        };
    }

    card.innerHTML = `
        <div style="font-weight: 800; font-size: 1rem; margin-bottom: 4px; color: ${borderColor};">
            ${escapeHTML(title)}
        </div>
        <div style="font-size: 0.88rem; color: #334155; white-space: pre-line;">${escapeHTML(message)}</div>
        ${(isClickable && isCurrentUserAdmin()) ? `<div style="margin-top:8px; font-weight:800; font-size:0.8rem; color:${borderColor};">👉 คลิกที่นี่เพื่อเปิดศูนย์อนุมัติคำขอทันที</div>` : ''}
        <button onclick="this.parentElement.remove()" style="position:absolute; top:8px; right:12px; background:none; border:none; font-size:1.2rem; cursor:pointer;">&times;</button>
    `;

    container.appendChild(card);
    setTimeout(() => { if (card && card.parentElement) card.remove(); }, 12000);
}

// -------------------------------------------------------------------------
// 7. สลับ View ไปยังหน้าอนุมัติ (อัปเดต URL และส่วนหัวให้ตรง approvals-db.js)
// -------------------------------------------------------------------------
function navigateToApprovalCenter() {
    if (!isUserLoggedIn()) return;
    
    if (typeof switchView === 'function') {
        switchView('view-approvals');
    } else if (typeof executeSwitchView === 'function') {
        executeSwitchView('view-approvals');
    } else {
        document.querySelectorAll('.view-section, .page-section, section[id^="view-"]').forEach(s => s.style.display = 'none');
        const target = document.getElementById('view-approvals');
        if (target) target.style.display = 'block';
        if (typeof syncRouteToBrowserAndHeader === 'function') {
            syncRouteToBrowserAndHeader('view-approvals');
        }
    }
    loadPendingApprovalsFromDB(true);
}

// -------------------------------------------------------------------------
// 8. Realtime Engine (Fast Polling 1 วินาที + WebSocket Listener)
// -------------------------------------------------------------------------
function startApprovalRealtimeMonitor() {
    initApprovalRealtimeSubscription();
    if (approvalPollingTimer) clearInterval(approvalPollingTimer);

    loadPendingApprovalsFromDB(true);
    approvalPollingTimer = setInterval(() => loadPendingApprovalsFromDB(false), 1000);
}

function initApprovalRealtimeSubscription() {
    const client = getSupabaseClient();
    if (!client) {
        setTimeout(initApprovalRealtimeSubscription, 1000);
        return;
    }

    if (approvalRealtimeChannel) {
        try { client.removeChannel(approvalRealtimeChannel); } catch(e) {}
    }

    approvalRealtimeChannel = client
        .channel('public_approval_requests_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, () => {
            loadPendingApprovalsFromDB(true);
            triggerAutoUIRefresh();
        })
        .subscribe();
}

// -------------------------------------------------------------------------
// 9. Admin Actions (อนุมัติ / ปฏิเสธ แบบ Optimistic Realtime 100%)
// -------------------------------------------------------------------------
async function approveUserRequest(id, silent = false) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;

    const { username, name } = getCurrentUserIdentity();
    const adminUser = username || name || 'admin';

    // Optimistic UI update immediately (< 10ms response)
    req.status = 'APPROVED';
    req.approved_by = adminUser;
    req.updated_at = new Date().toISOString();
    selectedApprovalIds.delete(String(id));
    updateDynamicFilterDropdowns(pendingApprovalsList);
    renderApprovalsTable(pendingApprovalsList, true);

    const client = getSupabaseClient();

    if (client) {
        try {
            // ประมวลผลการเปลี่ยนแปลงในคลังสินค้าจริง (เบิกออก / ย้ายพิกัด / ลบ / แก้ไข)
            await executeDirectWarehouseMutation(req.request_type, req.target_sns, {
                ...(req.payload || {}),
                description: req.description
            }, adminUser);

            await client.from('approval_requests').update({
                status: 'APPROVED',
                approved_by: adminUser,
                updated_at: new Date().toISOString()
            }).eq('id', id);
        } catch(e) {
            // Safe Catch
        }
    }

    const localList = getLocalApprovalsStore();
    const found = localList.find(r => String(r.id) === String(id));
    if (found) { found.status = 'APPROVED'; found.approved_by = adminUser; saveLocalApprovalsStore(localList); }

    if (!silent) {
        if (typeof showToast === 'function') showToast("✅ อนุมัติคำขอเรียบร้อยแล้ว");
        triggerAutoUIRefresh();
        await loadPendingApprovalsFromDB(true);
    }
}

async function rejectUserRequest(id, silent = false) {
    if (!isUserLoggedIn() || !isCurrentUserAdmin()) return;

    const req = pendingApprovalsList.find(r => String(r.id) === String(id));
    if (!req) return;

    const { username, name } = getCurrentUserIdentity();
    const adminUser = username || name || 'admin';

    // Optimistic UI update immediately (< 10ms response)
    req.status = 'REJECTED';
    req.approved_by = adminUser;
    req.updated_at = new Date().toISOString();
    selectedApprovalIds.delete(String(id));
    updateDynamicFilterDropdowns(pendingApprovalsList);
    renderApprovalsTable(pendingApprovalsList, true);

    const client = getSupabaseClient();

    if (client) {
        try {
            await client.from('approval_requests').update({
                status: 'REJECTED',
                approved_by: adminUser,
                updated_at: new Date().toISOString()
            }).eq('id', id);
        } catch(e) {
            // Safe Catch
        }
    }

    const localList = getLocalApprovalsStore();
    const found = localList.find(r => String(r.id) === String(id));
    if (found) { found.status = 'REJECTED'; found.approved_by = adminUser; saveLocalApprovalsStore(localList); }

    if (!silent) {
        if (typeof showToast === 'function') showToast("⛔ ปฏิเสธคำขอเรียบร้อยแล้ว");
        triggerAutoUIRefresh();
        await loadPendingApprovalsFromDB(true);
    }
}

// -------------------------------------------------------------------------
// 9.5 Bulk Actions (อนุมัติ / ปฏิเสธ หลายรายการพร้อมกัน)
// -------------------------------------------------------------------------
function toggleApprovalSelection(id, checked) {
    const idStr = String(id);
    if (checked) {
        selectedApprovalIds.add(idStr);
    } else {
        selectedApprovalIds.delete(idStr);
    }
    updateBulkActionBarUI();
}

function toggleSelectAllVisiblePending(checked) {
    const filteredList = getFilteredAndSortedApprovals(pendingApprovalsList);
    const displayedList = (approvalDisplayLimit === 'ALL')
        ? filteredList
        : filteredList.slice(0, Number(approvalDisplayLimit) || 25);

    displayedList.forEach(item => {
        if (item.status === 'PENDING') {
            if (checked) selectedApprovalIds.add(String(item.id));
            else selectedApprovalIds.delete(String(item.id));
        }
    });
    renderApprovalsTable(pendingApprovalsList, true);
}

function clearApprovalSelections() {
    selectedApprovalIds.clear();
    renderApprovalsTable(pendingApprovalsList, true);
}

function updateBulkActionBarUI(displayedListOverride) {
    const bar = document.getElementById('wmsApprBulkBar');
    const countEl = document.getElementById('wmsApprSelectedCount');
    if (!bar || !countEl) return;

    if (selectedApprovalIds.size > 0 && isCurrentUserAdmin()) {
        bar.classList.add('visible');
        countEl.textContent = selectedApprovalIds.size;
    } else {
        bar.classList.remove('visible');
        countEl.textContent = '0';
    }

    const selectAllCb = document.getElementById('wmsApprSelectAllCheckbox');
    if (selectAllCb && Array.isArray(displayedListOverride)) {
        const visiblePending = displayedListOverride.filter(r => r.status === 'PENDING');
        selectAllCb.checked = visiblePending.length > 0 && visiblePending.every(r => selectedApprovalIds.has(String(r.id)));
    }
}

async function bulkApproveSelectedRequests() {
    if (!isUserLoggedIn() || !isCurrentUserAdmin() || selectedApprovalIds.size === 0) return;
    const ids = Array.from(selectedApprovalIds);
    for (const id of ids) {
        await approveUserRequest(id, true);
    }
    if (typeof showToast === 'function') showToast(`✅ อนุมัติคำขอพร้อมกัน ${ids.length} รายการเรียบร้อยแล้ว`);
    triggerAutoUIRefresh();
    await loadPendingApprovalsFromDB(true);
}

async function bulkRejectSelectedRequests() {
    if (!isUserLoggedIn() || !isCurrentUserAdmin() || selectedApprovalIds.size === 0) return;
    const ids = Array.from(selectedApprovalIds);
    for (const id of ids) {
        await rejectUserRequest(id, true);
    }
    if (typeof showToast === 'function') showToast(`⛔ ปฏิเสธคำขอพร้อมกัน ${ids.length} รายการเรียบร้อยแล้ว`);
    triggerAutoUIRefresh();
    await loadPendingApprovalsFromDB(true);
}

// -------------------------------------------------------------------------
// 10. ตัวกรองประวัติรายการคำขอแบบเรียลไทม์ & การตั้งค่าจำนวนแสดงผล (Default: 25)
// -------------------------------------------------------------------------
function filterApprovalsByStatus(status) {
    approvalStatusFilter = status || 'ALL';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function filterApprovalsByType(type) {
    approvalTypeFilter = type ? normalizeActionType(type) : 'ALL';
    if (type === 'ALL') approvalTypeFilter = 'ALL';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function filterApprovalsByRequester(requesterKey) {
    approvalRequesterFilter = requesterKey || 'ALL';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function handleApprovalSearchInput(query) {
    approvalSearchQuery = String(query || '');
    renderApprovalsTable(pendingApprovalsList, true);
}

function changeApprovalSortOrder(order) {
    approvalSortOrder = order || 'NEWEST';
    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function setApprovalDisplayLimit(limitVal) {
    const wasAll = approvalDisplayLimit === 'ALL';
    approvalDisplayLimit = (limitVal === 'ALL') ? 'ALL' : (Number(limitVal) || 25);
    try {
        sessionStorage.setItem('wms_approval_display_limit_v2', String(approvalDisplayLimit));
    } catch (e) {}

    syncApprovalFilterControlsUI();
    if (approvalDisplayLimit === 'ALL' && !wasAll) {
        loadPendingApprovalsFromDB(true);
    } else {
        renderApprovalsTable(pendingApprovalsList, true);
    }
}

function toggleShowAllApprovals() {
    if (approvalDisplayLimit === 'ALL') {
        setApprovalDisplayLimit(25);
    } else {
        setApprovalDisplayLimit('ALL');
    }
}

function resetAllApprovalFilters() {
    approvalStatusFilter = 'ALL';
    approvalTypeFilter = 'ALL';
    approvalRequesterFilter = 'ALL';
    approvalSearchQuery = '';
    approvalSortOrder = 'NEWEST';
    selectedApprovalIds.clear();

    const searchInput = document.getElementById('wmsApprSearchInput');
    if (searchInput) searchInput.value = '';

    syncApprovalFilterControlsUI();
    renderApprovalsTable(pendingApprovalsList, true);
}

function toggleApprovalTTSMute() {
    isTTSMuted = !isTTSMuted;
    try {
        localStorage.setItem('wms_approval_tts_muted', String(isTTSMuted));
    } catch (e) {}

    if (isTTSMuted && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    const btn = document.getElementById('wmsApprTTSBtn');
    if (btn) {
        btn.innerHTML = `<i class="fa-solid ${isTTSMuted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i><span>${isTTSMuted ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}</span>`;
    }
    if (typeof showToast === 'function') {
        showToast(isTTSMuted ? "🔇 ปิดเสียงพูดแจ้งเตือนแล้ว" : "🔊 เปิดเสียงพูดแจ้งเตือนแล้ว");
    }
}

function exportFilteredApprovalsCSV() {
    const rows = getFilteredAndSortedApprovals(pendingApprovalsList);
    if (!rows.length) {
        if (typeof showToast === 'function') showToast("⚠ ไม่มีข้อมูลสำหรับส่งออก CSV", true);
        return;
    }

    const headers = ['ลำดับ', 'วันที่เวลา', 'ผู้ขออนุมัติ', 'Username', 'ประเภทคำขอ', 'สถานะ', 'รายละเอียด', 'รายการ S/N', 'ดำเนินการโดย'];
    const csvLines = [headers.join(',')];

    rows.forEach((r, idx) => {
        const sns = Array.isArray(r.target_sns) ? r.target_sns.join(' | ') : String(r.target_sns || '');
        const line = [
            idx + 1,
            r.created_at ? new Date(r.created_at).toLocaleString('th-TH') : '-',
            r.requester_name || '-',
            r.requester_username || '-',
            r.request_type || '-',
            r.status || '-',
            r.description || '-',
            sns,
            r.approved_by || '-'
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvLines.push(line.join(','));
    });

    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WMS_Approvals_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Global Exports (Preserved 100% + Extended Role Guard & Filter Helpers)
window.isCurrentUserAdmin = isCurrentUserAdmin;
window.createPendingApprovalRequest = createPendingApprovalRequest;
window.requestOrExecuteWarehouseAction = requestOrExecuteWarehouseAction;
window.submitOutboundDispatchWithRoleGuard = submitOutboundDispatchWithRoleGuard;
window.submitLocationTransferWithRoleGuard = submitLocationTransferWithRoleGuard;
window.executeDirectWarehouseMutation = executeDirectWarehouseMutation;
window.refreshApprovalsUI = () => loadPendingApprovalsFromDB(true);
window.filterApprovalsByStatus = filterApprovalsByStatus;
window.filterApprovalsByType = filterApprovalsByType;
window.filterApprovalsByRequester = filterApprovalsByRequester;
window.handleApprovalSearchInput = handleApprovalSearchInput;
window.changeApprovalSortOrder = changeApprovalSortOrder;
window.setApprovalDisplayLimit = setApprovalDisplayLimit;
window.toggleShowAllApprovals = toggleShowAllApprovals;
window.resetAllApprovalFilters = resetAllApprovalFilters;
window.toggleApprovalTTSMute = toggleApprovalTTSMute;
window.exportFilteredApprovalsCSV = exportFilteredApprovalsCSV;
window.openApprovalDetailModal = openApprovalDetailModal;
window.copyApprovalSerialNumbers = copyApprovalSerialNumbers;
window.approveUserRequest = approveUserRequest;
window.rejectUserRequest = rejectUserRequest;
window.toggleApprovalSelection = toggleApprovalSelection;
window.toggleSelectAllVisiblePending = toggleSelectAllVisiblePending;
window.clearApprovalSelections = clearApprovalSelections;
window.bulkApproveSelectedRequests = bulkApproveSelectedRequests;
window.bulkRejectSelectedRequests = bulkRejectSelectedRequests;

// Auto Run Engine
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApprovalRealtimeMonitor);
} else {
    startApprovalRealtimeMonitor();
}