// =========================================================================
// --- MODULE 1: SUPABASE CONFIGURATION & REALTIME CONNECTION ENGINE ---
// =========================================================================

const SUPABASE_CONFIG = {
    url: window.WMS_ENV?.SUPABASE_URL || 'https://eusuehaqgwkcgowsgyco.supabase.co',
    key: window.WMS_ENV?.SUPABASE_KEY || 'sb_publishable_ww-mPdyom_i6S4XhfAFj9Q_vFBpTuaE'
};

const _supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'wms-master-app' } }
});

const QUEUE_KEY = 'WMS_OFFLINE_INBOUND_QUEUE';
const ACT_QUEUE_KEY = 'WMS_OFFLINE_ACTIVITY_QUEUE';

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
let offlineInboundQueue = readJSON(QUEUE_KEY);
let offlineActivityQueue = readJSON(ACT_QUEUE_KEY);
let isOfflineMode = !navigator.onLine;
let isSyncing = false;
let lastSyncError = '';
let syncFailNotified = false;
let reloadTimer = null;

// =========================================================================
// --- DATABASE LOADING POPUP & INVENTORY TABLE LOADER OVERLAY ---
// =========================================================================
function ensureDbLoadingStylesAndPopup() {
    if (!document.getElementById('wmsDbLoaderStyles')) {
        const style = document.createElement('style');
        style.id = 'wmsDbLoaderStyles';
        style.textContent = `
            #wmsDbFloatingPopup {
                position: fixed;
                inset: 0;
                z-index: 99998;
                background: rgba(15, 23, 42, 0.55);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                display: none;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                transition: opacity 0.25s ease;
            }
            .wms-db-popup-box {
                background: var(--card-bg, #ffffff);
                color: var(--text-main, #0f172a);
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 18px;
                padding: 2rem 1.75rem;
                width: 100%;
                max-width: 390px;
                text-align: center;
                box-shadow: 0 20px 45px rgba(0, 0, 0, 0.28);
                position: relative;
                overflow: hidden;
            }
            .wms-db-popup-box::before {
                content: "";
                position: absolute;
                top: 0; left: 0; right: 0;
                height: 4px;
                background: linear-gradient(90deg, #0284c7, #10b981, #0284c7);
                background-size: 200% 100%;
                animation: wmsDbBarMove 1.4s linear infinite;
            }
            @keyframes wmsDbBarMove {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
            .wms-db-icon-ring {
                width: 68px;
                height: 68px;
                margin: 0 auto 1rem;
                border-radius: 50%;
                background: var(--primary-light, #e0f2fe);
                color: var(--primary, #0284c7);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.75rem;
                position: relative;
                box-shadow: 0 6px 18px rgba(2, 132, 199, 0.22);
            }
            .wms-db-icon-ring::after {
                content: "";
                position: absolute;
                inset: -5px;
                border-radius: 50%;
                border: 3px solid transparent;
                border-top-color: #0284c7;
                border-right-color: #10b981;
                animation: wmsDbSpin 0.95s linear infinite;
            }
            @keyframes wmsDbSpin {
                to { transform: rotate(360deg); }
            }
            .wms-table-loading-card {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 3.25rem 1.5rem;
                gap: 0.65rem;
                color: var(--text-main, #0f172a);
            }
            .wms-table-loading-badge {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 6px 14px;
                border-radius: 999px;
                font-size: 0.82rem;
                font-weight: 700;
                background: var(--primary-light, #e0f2fe);
                color: var(--primary-text, #0369a1);
                border: 1px solid var(--primary-border, #bae6fd);
            }
        `;
        document.head.appendChild(style);
    }

    if (!document.getElementById('wmsDbFloatingPopup') && document.body) {
        const popup = document.createElement('div');
        popup.id = 'wmsDbFloatingPopup';
        popup.innerHTML = `
            <div class="wms-db-popup-box">
                <div class="wms-db-icon-ring">
                    <i class="fa-solid fa-database fa-beat-fade"></i>
                </div>
                <div id="wmsDbPopupTitle" style="font-size:1.1rem; font-weight:800; margin-bottom:6px;">
                    กำลังโหลดฐานข้อมูล...
                </div>
                <div id="wmsDbPopupSubtitle" style="font-size:0.85rem; color:var(--text-muted, #64748b); margin-bottom:14px;">
                    กรุณารอสักครู่ ระบบกำลังดึงข้อมูลสต็อกสินค้าล่าสุด
                </div>
                <div class="wms-table-loading-badge mono">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span id="wmsDbPopupTarget">supabase/warehouse_items/inv-db.js</span>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
    }
}

function showDatabaseLoadingPopup(title = 'กำลังโหลดฐานข้อมูล...', subtitle = 'กรุณารอสักครู่ ระบบกำลังดึงข้อมูลจาก Supabase', targetFile = 'supabase/warehouse_items/inv-db.js') {
    ensureDbLoadingStylesAndPopup();

    // 1. แสดงป๊อปอัปตรงกลางหน้าจอ
    const popup = document.getElementById('wmsDbFloatingPopup');
    const titleEl = document.getElementById('wmsDbPopupTitle');
    const subEl = document.getElementById('wmsDbPopupSubtitle');
    const targetEl = document.getElementById('wmsDbPopupTarget');

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (targetEl) targetEl.textContent = targetFile;
    if (popup) popup.style.display = 'flex';

    // 2. แสดงไอคอนและสถานะโหลดในตารางหน้าเช็คสต็อกสินค้าทันที (ป้องกันหน้าตารางว่างเปล่า)
    const invTbody = document.getElementById('inventoryTableBody');
    if (invTbody) {
        invTbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center; background:var(--card-bg, #ffffff);">
                    <div class="wms-table-loading-card">
                        <div class="wms-db-icon-ring" style="width:56px; height:56px; font-size:1.4rem; margin-bottom:0.4rem;">
                            <i class="fa-solid fa-database"></i>
                        </div>
                        <div style="font-size:1.05rem; font-weight:800;">${typeof escapeHTML === 'function' ? escapeHTML(title) : title}</div>
                        <div style="font-size:0.85rem; color:var(--text-muted, #64748b);">${typeof escapeHTML === 'function' ? escapeHTML(subtitle) : subtitle}</div>
                        <div class="wms-table-loading-badge mono" style="margin-top:4px;">
                            <i class="fa-solid fa-rotate fa-spin"></i> กำลังซิงค์ข้อมูลเรียลไทม์...
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }
}

function hideDatabaseLoadingPopup() {
    const popup = document.getElementById('wmsDbFloatingPopup');
    if (popup) {
        popup.style.display = 'none';
    }
}

function persistQueue() {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineInboundQueue));
        localStorage.setItem(ACT_QUEUE_KEY, JSON.stringify(offlineActivityQueue));
        return true;
    } catch (e) { return false; }
}

function clearOfflineInboundQueue() {
    if (offlineInboundQueue.length === 0) {
        showToast("ℹ️ ไม่พบรายการค้างบันทึกในคิว");
        return;
    }

    if (confirm(`คุณต้องการลบ/ยกเลิกรายการรอบันทึกทั้งหมดจำนวน ${offlineInboundQueue.length} รายการออกใช่หรือไม่?`)) {
        const pendingSns = new Set(offlineInboundQueue.map(i => String(i.sn).toLowerCase()));
        
        offlineInboundQueue = [];
        persistQueue();

        globalInventoryData = globalInventoryData.filter(i => !i._pending && !pendingSns.has(String(i.sn).toLowerCase()));
        recentInboundList = recentInboundList.filter(i => !i.isOffline);

        rebuildOccupiedSet();
        filterInventoryData();
        updateKPIs();
        renderLiveInboundFeed();
        updateOnlineOfflineUI(navigator.onLine);

        playSuccessSound();
        showToast("🗑️ ลบรายการรอบันทึกค้างทั้งหมดเรียบร้อยแล้ว");
    }
}

function removePendingItemBySn(sn) {
    const targetSn = String(sn).trim().toLowerCase();
    
    offlineInboundQueue = offlineInboundQueue.filter(i => String(i.sn).trim().toLowerCase() !== targetSn);
    persistQueue();

    globalInventoryData = globalInventoryData.filter(i => String(i.sn).trim().toLowerCase() !== targetSn || !i._pending);
    recentInboundList = recentInboundList.filter(i => String(i.sn).trim().toLowerCase() !== targetSn || !i.isOffline);

    rebuildOccupiedSet();
    filterInventoryData();
    updateKPIs();
    renderLiveInboundFeed();
    updateOnlineOfflineUI(navigator.onLine);

    playSuccessSound();
    showToast(`🗑️ ยกเลิก S/N: ${sn} จากคิวรอบันทึกเรียบร้อยแล้ว`);
}

function isPendingSn(sn) {
    const k = String(sn || '').toLowerCase();
    return offlineInboundQueue.some(p => String(p.sn).toLowerCase() === k);
}

function guardPendingSn(sn) {
    if (isPendingSn(sn)) { 
        playErrorSound(); 
        showToast(`⏳ S/N ${escapeHTML(sn)} ยังรอบันทึกเข้า DB กรุณารอซิงค์เสร็จก่อน`, true); 
        return true; 
    }
    return false;
}

function requireOnline(msg) {
    if (!navigator.onLine) { 
        playErrorSound(); 
        showToast(`📴 ${msg || 'ทำรายการนี้ต้องเชื่อมต่ออินเทอร์เน็ต'}`, true); 
        return false; 
    }
    return true;
}

function sanitizeForDb(item) {
    return {
        category: String(item.category || 'N/A').trim(),
        name: String(item.name || '-').trim(),
        sn: String(item.sn).trim(),
        meter: parseInt(item.meter) || 0,
        location: String(item.location || 'DOCK').trim(),
        qty: parseInt(item.qty) || 1,
        created_at: item.created_at || new Date().toISOString()
    };
}

function initOfflineSyncEngine() {
    ensureDbLoadingStylesAndPopup();
    updateOnlineOfflineUI(navigator.onLine);
    window.addEventListener('online', () => {
        updateOnlineOfflineUI(true);
        showToast('🌐 อินเทอร์เน็ตกลับมาแล้ว กำลังบันทึกข้อมูลเข้า DB...');
        syncOfflineQueueToDatabase();
    });
    window.addEventListener('offline', () => {
        updateOnlineOfflineUI(false);
        showToast('📴 ออฟไลน์: ข้อมูลจะถูกเก็บไว้ในเครื่องและซิงค์เมื่อเชื่อมเน็ต', true);
    });
    window.addEventListener('beforeunload', (e) => {
        if (offlineInboundQueue.length) { e.preventDefault(); e.returnValue = ''; }
    });
    
    setInterval(() => {
        if (offlineInboundQueue.length || offlineActivityQueue.length) syncOfflineQueueToDatabase();
    }, 8000);
}

function updateOnlineOfflineUI(isOnline) {
    isOfflineMode = !isOnline;
    const n = offlineInboundQueue.length;
    const banner = document.getElementById('offlineNoticeBanner');
    const badge = document.getElementById('offlineQueueBadge');
    const msg = document.getElementById('offlineBannerMsg');
    const dbStatusText = document.getElementById('dbStatusText');
    const hdr = document.getElementById('liveInboundHeaderBadge');

    if (badge) badge.textContent = n.toLocaleString();
    if (banner) {
        banner.style.display = (!isOnline || n > 0) ? 'flex' : 'none';
        banner.className = 'offline-banner ' + (!isOnline ? 'is-offline' : 'is-syncing');
        if (msg) {
            msg.textContent = !isOnline
                ? `โหมดออฟไลน์ — ยังรับสินค้าต่อได้ปกติ (รอบันทึกเข้า DB ${n} รายการ)`
                : isSyncing ? `กำลังบันทึก ${n} รายการเข้าฐานข้อมูล...`
                : `มี ${n} รายการรอบันทึกเข้า DB${lastSyncError ? ' — เชื่อมต่อไม่สำเร็จ จะลองใหม่อัตโนมัติ' : ''}`;
        }
    }
    if (hdr) {
        if (!isOnline) { hdr.className = 'status-badge warning'; hdr.innerHTML = `<i class="fa-solid fa-wifi"></i> ออฟไลน์ · รอซิงค์ ${n}`; }
        else if (n > 0) { hdr.className = 'status-badge warning'; hdr.innerHTML = `<i class="fa-solid fa-rotate ${isSyncing ? 'fa-spin' : ''}"></i> รอบันทึก ${n}`; }
        else { hdr.className = 'status-badge'; hdr.innerHTML = `<span class="pulse-dot"></span> บันทึก DB ครบแล้ว`; }
    }
    if (dbStatusText && (!isOnline || n > 0)) {
        dbStatusText.textContent = !isOnline ? `🟠 ออฟไลน์ (รอซิงค์ ${n})` : `🟡 รอบันทึก ${n} รายการ`;
        dbStatusText.style.color = 'var(--warning, #f59e0b)';
    }
}

async function syncOfflineQueueToDatabase() {
    if (isSyncing || !navigator.onLine) return;
    if (!offlineInboundQueue.length && !offlineActivityQueue.length) return;

    isSyncing = true; lastSyncError = '';
    updateOnlineOfflineUI(true);

    const doneInboundSns = new Set();
    let saved = 0, dup = 0;
    const batch = [...offlineInboundQueue];

    try {
        for (const rawItem of batch) {
            const snKey = String(rawItem.sn).trim().toLowerCase();

            const { data: existing } = await _supabase
                .from('warehouse_items')
                .select('sn')
                .eq('sn', rawItem.sn)
                .maybeSingle();

            if (existing) {
                dup++;
                doneInboundSns.add(snKey);
                continue;
            }

            const cleanPayload = sanitizeForDb(rawItem);
            const { error } = await _supabase.from('warehouse_items').insert([cleanPayload]);

            if (!error) {
                saved++;
                doneInboundSns.add(snKey);
            } else if (error.code === '23505') {
                dup++;
                doneInboundSns.add(snKey);
            } else {
                console.error(`Failed to sync SN ${rawItem.sn}:`, error);
                lastSyncError = error.message;
            }
        }

        if (offlineActivityQueue.length) {
            const acts = [...offlineActivityQueue];
            const { error } = await _supabase.from('user_activities').insert(acts);
            if (!error) offlineActivityQueue = offlineActivityQueue.filter(a => !acts.includes(a));
        }
    } catch (e) {
        lastSyncError = (e && e.message) || 'sync error';
    }

    offlineInboundQueue = offlineInboundQueue.filter(p => !doneInboundSns.has(String(p.sn).trim().toLowerCase()));
    persistQueue();

    globalInventoryData.forEach(item => {
        if (doneInboundSns.has(String(item.sn).trim().toLowerCase())) {
            delete item._pending;
        }
    });

    isSyncing = false;
    renderLiveInboundFeed();
    updateOnlineOfflineUI(navigator.onLine);

    if (saved + dup > 0) {
        syncFailNotified = false;
        playSuccessSound();
        showToast(`✅ บันทึกเข้าฐานข้อมูลสำเร็จ ${saved} รายการ${dup ? ` (ข้าม S/N ที่มีใน DB แล้ว ${dup})` : ''}`);
        logUserActivity('OFFLINE_SYNC', `ซิงค์รายการรับเข้า ${saved} รายการเข้า DB`);
        if (offlineInboundQueue.length === 0) {
            updateDBConnectionStatus(true, '(ซิงค์ครบ 100%)');
            await loadDataFromDatabase();
        }
    }
}

function updateDBConnectionStatus(isConnected, message = "") {
    const statusElem = document.getElementById('dbStatusText');
    const badgeElem = document.getElementById('dbStatusBadge');
    const nowStr = new Date().toLocaleTimeString('th-TH');

    if (!navigator.onLine) {
        if (statusElem) {
            statusElem.textContent = `📴 ออฟไลน์ (Offline Mode)`;
            statusElem.style.color = 'var(--warning, #f59e0b)';
        }
        if (badgeElem) badgeElem.className = 'status-badge warning';
        return;
    }

    const statusMessage = isConnected 
        ? `🟢 Supabase Connected - ${nowStr} ${message}`
        : `🔴 DB Disconnected - ${nowStr} ${message}`;

    if (statusElem) {
        statusElem.textContent = statusMessage;
        statusElem.style.color = isConnected ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)';
    }

    if (badgeElem) {
        badgeElem.className = isConnected ? 'status-badge' : 'status-badge warning';
    }
}

async function testDatabaseConnectionRealtime() {
    const btn = document.getElementById('testDbConnBtn');
    if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังทดสอบ...`;

    showDatabaseLoadingPopup('กำลังทดสอบเชื่อมต่อฐานข้อมูล...', 'กำลังตรวจสอบความเร็วในการตอบสนอง (Latency)', 'supabase/system_configs/db-config.js');
    const startTime = performance.now();
    try {
        const { data, error } = await _supabase.from('warehouse_items').select('id').limit(1);
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);

        if (!error) {
            if (typeof playSuccessSound === 'function') playSuccessSound();
            if (typeof showToast === 'function') showToast(`⚡ เชื่อมต่อ Supabase สำเร็จ! (Latency: ${latency} ms)`);
            updateDBConnectionStatus(true, `(Ping: ${latency}ms)`);
            if (btn) btn.innerHTML = `<i class="fa-solid fa-plug-circle-check"></i> ทดสอบการเชื่อมต่อ Realtime 100%`;
            return true;
        } else {
            throw error;
        }
    } catch (err) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`❌ การเชื่อมต่อขัดข้อง: ${err.message}`, true);
        updateDBConnectionStatus(false, `(${err.message})`);
        if (btn) btn.innerHTML = `<i class="fa-solid fa-plug-circle-xmark"></i> ทดสอบเชื่อมต่ออีกครั้ง`;
        return false;
    } finally {
        hideDatabaseLoadingPopup();
    }
}

window.showDatabaseLoadingPopup = showDatabaseLoadingPopup;
window.hideDatabaseLoadingPopup = hideDatabaseLoadingPopup;