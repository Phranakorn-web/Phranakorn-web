// =========================================================================
// --- MODULE 3.6: LIVE INBOUND FEED, SKU SEARCH & DELETE APPROVAL FLOW ---
// --- Recent Feed Render, Cache/DB Loader, SKU Autocomplete & Stock Link ---
// =========================================================================

// 🗑️ กดปุ่มลบจากประวัติการรับเข้าล่าสุด -> ลิงก์ไปยังหน้าเช็กสต็อกสินค้า (#inv-db) พร้อมเปิดยืนยันคำขอลบตามโครงสร้างปกติ
async function deleteInboundItem(sn, id = '', location = '') {
    if (!sn && !id) return;
    navigateToStockCheckAndConfirmDelete(sn, id, location);
}

function navigateToStockCheckAndConfirmDelete(sn, id = '', location = '') {
    const cleanSn = String(sn || '').trim();
    const cleanId = String(id || '').trim();
    const cleanLoc = String(location || '').trim();

    // 1. ตรวจสอบให้แน่ใจว่ามีรายการนี้อยู่ใน globalInventoryData เพื่อให้หน้าเช็กสต็อกค้นหาพบทันที
    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        const existsInGlobal = globalInventoryData.some(item =>
            item && ((cleanId && String(item.id) === cleanId) || (cleanSn && String(item.sn).trim().toUpperCase() === cleanSn.toUpperCase()))
        );
        if (!existsInGlobal && Array.isArray(recentInboundList)) {
            const foundInFeed = recentInboundList.find(r =>
                r && ((cleanId && String(r.id) === cleanId) || (cleanSn && String(r.sn).trim().toUpperCase() === cleanSn.toUpperCase()))
            );
            if (foundInFeed) {
                globalInventoryData.unshift({
                    id: foundInFeed.id || undefined,
                    sn: foundInFeed.sn,
                    category: foundInFeed.category || 'N/A',
                    name: foundInFeed.name || '-',
                    meter: foundInFeed.meter || 0,
                    location: foundInFeed.location || cleanLoc || 'DOCK',
                    qty: 1,
                    status: 'IN_STOCK',
                    received_by: foundInFeed.received_by || getCurrentUserFullName(),
                    created_at: foundInFeed.created_at || new Date().toISOString()
                });
            }
        }
    }

    // บันทึกเป้าหมายที่รอเปิด Modal ยืนยันการลบสำหรับหน้าเช็กสต็อก
    if (typeof window !== 'undefined') {
        window.__WMS_PENDING_STOCK_DELETE__ = {
            sn: cleanSn,
            id: cleanId,
            location: cleanLoc,
            requestedAt: Date.now()
        };
    }

    showToast(`🔗 กำลังไปที่หน้าเช็กสต็อกสินค้า เพื่อยืนยันคำขอลบ S/N: ${cleanSn}`, false, 2600);

    // 2. สลับหน้าไปยังหน้าเช็กสต็อกสินค้า (#inv-db)
    const navFns = ['switchTab', 'navigateTo', 'showSection', 'openTab', 'showPage', 'loadPage'];
    let navigated = false;
    for (const fnName of navFns) {
        if (typeof window !== 'undefined' && typeof window[fnName] === 'function') {
            try {
                window[fnName]('inv-db');
                navigated = true;
                break;
            } catch (e) {}
        }
    }

    if (!navigated) {
        const navSelectors = [
            '[data-tab="inv-db"]',
            '[data-target="inv-db"]',
            '[data-section="inv-db"]',
            '[data-page="inv-db"]',
            'a[href="#inv-db"]',
            '#nav-inv-db',
            '#menu-inv-db'
        ];
        for (const sel of navSelectors) {
            const navEl = document.querySelector(sel);
            if (navEl) {
                navEl.click();
                navigated = true;
                break;
            }
        }
    }

    // อัปเดต URL Hash เป็น #inv-db ตามมาตรฐานการนำทางของระบบ
    try {
        if (window.location.hash !== '#inv-db') {
            window.location.hash = '#inv-db';
        }
    } catch (e) {}

    // 3. กรอก S/N ลงในช่องค้นหาของหน้าเช็กสต็อกสินค้าเพื่อให้แสดงรายการที่ต้องการลบชัดเจน
    const applySearchAndOpenConfirm = (attempt = 0) => {
        const invSection = document.getElementById('inv-db') ||
                           document.getElementById('invDbSection') ||
                           document.getElementById('inventorySection') ||
                           document.getElementById('tab-inv-db') ||
                           document;

        const searchSelectors = [
            '#invSearchInput',
            '#stockSearchInput',
            '#inventorySearchInput',
            '#invDbSearchInput',
            '#searchInventoryInput',
            'input[placeholder*="ค้นหา" i]'
        ];

        for (const sel of searchSelectors) {
            const searchInput = invSection.querySelector(sel) || document.querySelector(sel);
            if (searchInput && searchInput.id !== 'recentFeedSearchInput' && searchInput.id !== 'skuSearchInput') {
                searchInput.value = cleanSn;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }

        if (typeof window.filterInventoryTable === 'function') {
            try { window.filterInventoryTable(); } catch (e) {}
        } else if (typeof window.renderInventoryTable === 'function') {
            try { window.renderInventoryTable(); } catch (e) {}
        }

        // กระจาย Event ให้โมดูล inv-db.js รับทราบหากมีตัวรับคำขอลบโดยตรง
        document.dispatchEvent(new CustomEvent('wms:openStockDeleteConfirmation', {
            detail: { sn: cleanSn, id: cleanId, location: cleanLoc }
        }));

        // 4. ค้นหาฟังก์ชันหรือปุ่มลบมาตรฐานของหน้าเช็กสต็อกเพื่อเปิด Pop-up ยืนยันคำขอลบตามโครงสร้างปกติ
        const directModalFunctions = [
            'openDeleteRequestModal',
            'openDeleteConfirmModal',
            'requestDeleteInventoryItem',
            'confirmDeleteInventoryItem',
            'openDeleteModal',
            'promptDeleteInventoryItem',
            'deleteInventoryItem'
        ];

        for (const fnName of directModalFunctions) {
            if (typeof window !== 'undefined' && typeof window[fnName] === 'function') {
                try {
                    window[fnName](cleanId || cleanSn, cleanSn, cleanLoc);
                    window.__WMS_PENDING_STOCK_DELETE__ = null;
                    return;
                } catch (e) {}
            }
        }

        // ค้นหาแถวของ S/N นี้ในตารางหน้าเช็กสต็อก แล้วกดปุ่มลบของแถวนั้นโดยตรง
        const rows = invSection.querySelectorAll('tr, .inventory-card, .stock-row, [data-sn]');
        for (const row of rows) {
            const rowSn = (row.getAttribute('data-sn') || '').trim().toUpperCase();
            const rowText = (row.textContent || '').toUpperCase();
            if ((cleanSn && (rowSn === cleanSn.toUpperCase() || rowText.includes(cleanSn.toUpperCase())))) {
                const delBtn = row.querySelector(
                    '.btn-delete, .btn-danger, [data-action="delete"], [onclick*="delete" i], [onclick*="Delete"], [title*="ลบ"]'
                );
                if (delBtn) {
                    delBtn.click();
                    window.__WMS_PENDING_STOCK_DELETE__ = null;
                    return;
                }
            }
        }

        if (attempt < 4) {
            setTimeout(() => applySearchAndOpenConfirm(attempt + 1), 160);
        } else if (window.__WMS_PENDING_STOCK_DELETE__) {
            // กรณีหน้าเช็กสต็อกยังไม่ได้โหลดตาราง หรือเปิดใช้งานแบบ Standalone ให้เปิดหน้าต่างยืนยันคำขอลบมาตรฐานเข้าคิวอนุมัติทันที
            window.__WMS_PENDING_STOCK_DELETE__ = null;
            openFallbackStockDeleteApprovalModal(cleanSn, cleanId, cleanLoc);
        }
    };

    setTimeout(() => applySearchAndOpenConfirm(0), 150);
}

// 🟢 หน้าต่างยืนยันคำขอลบรายการออกจากคลัง (โครงสร้างมาตรฐานส่งเข้าคิวอนุมัติ)
function openFallbackStockDeleteApprovalModal(sn, id = '', location = '') {
    let modal = document.getElementById('wmsStandardDeleteRequestModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wmsStandardDeleteRequestModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.style.zIndex = '99999';
        document.body.appendChild(modal);
    }

    const activeUser = getCurrentUserFullName();
    const safeSn = escapeHTML(sn);
    const safeId = escapeHTML(id);
    const safeLoc = escapeHTML(location || '-');

    modal.innerHTML = `
        <div class="card" style="max-width: 440px; width: 92%; border-radius: 20px; padding: 24px; background: var(--bg-surface, #ffffff); border: 1px solid var(--border-color, #e2e8f0); box-shadow: 0 24px 48px rgba(15, 23, 42, 0.28); text-align: left;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px;">
                <h3 style="font-size: 1.08rem; font-weight: 800; color: #dc2626; display: flex; align-items: center; gap: 8px; margin: 0;">
                    <i class="fa-solid fa-trash-can"></i> ยืนยันส่งคำขอลบรายการออกจากคลัง
                </h3>
                <button type="button" onclick="closeFallbackStockDeleteApprovalModal()" style="background:none; border:none; font-size:1.4rem; color:var(--text-muted, #64748b); cursor:pointer;">&times;</button>
            </div>

            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; font-size: 0.84rem; color: #7f1d1d;">
                <div style="margin-bottom: 4px;"><strong>หมายเลขซีเรียล (S/N):</strong> <span class="mono" style="font-weight:800;">${safeSn}</span></div>
                <div style="margin-bottom: 4px;"><strong>พิกัดจัดเก็บปัจจุบัน:</strong> <span class="mono">${safeLoc}</span></div>
                <div><strong>ผู้ยื่นคำขอ:</strong> ${escapeHTML(activeUser)}</div>
            </div>

            <div class="form-group" style="margin-bottom: 16px;">
                <label for="wmsDeleteRequestReasonInput" style="display:block; font-size:0.82rem; font-weight:700; color:var(--text-main, #0f172a); margin-bottom:6px;">
                    เหตุผลการขอลบรายการ (ส่งเข้าคิวอนุมัติ):
                </label>
                <input type="text" id="wmsDeleteRequestReasonInput" class="form-control" value="ขอลบรายการรับเข้าผิดพลาด / ยกเลิกรายการ" placeholder="ระบุเหตุผลการลบ..." style="width:100%; border-radius:10px; font-size:0.85rem;" />
            </div>

            <div style="display: flex; gap: 10px;">
                <button type="button" class="btn btn-secondary" onclick="closeFallbackStockDeleteApprovalModal()" style="flex: 1; border-radius: 10px; font-weight: 700;">ยกเลิก</button>
                <button type="button" class="btn btn-danger" onclick="submitFallbackStockDeleteApproval('${safeSn}', '${safeId}', '${safeLoc}')" style="flex: 2; border-radius: 10px; font-weight: 700; background: #dc2626; color: #fff; border: none;">
                    <i class="fa-solid fa-paper-plane"></i> ยืนยันส่งคำขอลบ (รออนุมัติ)
                </button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeFallbackStockDeleteApprovalModal() {
    const modal = document.getElementById('wmsStandardDeleteRequestModal');
    if (modal) modal.style.display = 'none';
}

async function submitFallbackStockDeleteApproval(sn, id = '', location = '') {
    const reasonInput = document.getElementById('wmsDeleteRequestReasonInput');
    const reason = (reasonInput ? reasonInput.value.trim() : '') || 'ขอลบรายการรับเข้าผิดพลาด';
    const requester = getCurrentUserFullName();
    const nowISO = new Date().toISOString();

    closeFallbackStockDeleteApprovalModal();

    const matchedItem = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
        ? globalInventoryData.find(i => i && ((id && String(i.id) === String(id)) || (sn && String(i.sn).toUpperCase() === String(sn).toUpperCase())))
        : null;

    const requestPayload = {
        request_type: 'DELETE',
        type: 'DELETE',
        status: 'PENDING',
        item_id: matchedItem?.id || id || null,
        sn: sn,
        category: matchedItem?.category || 'N/A',
        name: matchedItem?.name || '-',
        location: matchedItem?.location || location || '-',
        reason: reason,
        requested_by: requester,
        created_at: nowISO
    };

    if (navigator.onLine && typeof _supabase !== 'undefined' && _supabase) {
        try {
            // บันทึกคำขอลงตารางคำขออนุมัติตามโครงสร้างปกติ
            const { error: reqErr } = await _supabase.from('approval_requests').insert([requestPayload]);
            if (reqErr) {
                // กรณีชื่อตารางเป็น delete_requests หรือ inventory_requests ให้ลองบันทึกสำรอง
                await _supabase.from('inventory_requests').insert([requestPayload]).catch(() => {});
            }
            if (matchedItem && matchedItem.id) {
                await _supabase.from('warehouse_items').update({ status: 'PENDING_DELETE' }).eq('id', matchedItem.id);
            } else if (sn) {
                await _supabase.from('warehouse_items').update({ status: 'PENDING_DELETE' }).eq('sn', sn);
            }
        } catch (err) {
            console.warn('Delete approval request sync warning:', err);
        }
    }

    if (matchedItem) {
        matchedItem.status = 'PENDING_DELETE';
    }

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            channel.postMessage({ action: 'DELETE_REQUESTED', sn, id, location, request: requestPayload });
        }
    } catch (e) {}

    document.dispatchEvent(new CustomEvent('inventoryDataChanged', { detail: { action: 'DELETE_REQUESTED', sn, id, location } }));
    document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: { action: 'DELETE_REQUESTED', sn, id, location } }));

    if (typeof window.renderInventoryTable === 'function') {
        try { window.renderInventoryTable(); } catch (e) {}
    }

    showToast(`✅ ส่งคำขอลบ S/N: ${sn} เข้าสู่ระบบอนุมัติเรียบร้อยแล้ว`, false, 3500);
}

function scheduleDebouncedFeedRender() {
    if (isFeedRenderScheduled) return;
    isFeedRenderScheduled = true;
    requestAnimationFrame(() => {
        renderLiveInboundFeed();
        isFeedRenderScheduled = false;
        ensureSnInputFocus();
    });
}

function loadRecentInboundFeedFromCache() {
    try {
        const cached = localStorage.getItem('WMS_RECENT_INBOUND_CACHE');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                recentInboundList = parsed;
                renderLiveInboundFeed();
            }
        }
    } catch (e) {}
}

function saveRecentInboundFeedToCache() {
    try {
        localStorage.setItem('WMS_RECENT_INBOUND_CACHE', JSON.stringify(recentInboundList.slice(0, 100)));
    } catch (e) {}
}

async function loadRecentInboundFeedFromDB() {
    if (!navigator.onLine || typeof _supabase === 'undefined' || !_supabase) return;
    try {
        const { data, error } = await _supabase
            .from('warehouse_items')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            // คงรายการที่ยังรอส่งในคิวออฟไลน์ไว้ด้านบนสุดเสมอ
            const pendingMap = new Map();
            persistentDbSyncQueue.forEach(q => {
                if (q && q.payload && q.payload.sn) {
                    pendingMap.set(String(q.payload.sn).toUpperCase(), q);
                }
            });

            const pendingLocalItems = recentInboundList.filter(item => item && pendingMap.has(String(item.sn).toUpperCase()));

            const dbItems = data
                .filter(item => item && !pendingMap.has(String(item.sn).toUpperCase()))
                .map(item => {
                    let rName = item.received_by || item.receiver || item.created_by;
                    if (!rName || rName === 'nakorn.c' || rName === 'Nakorn C' || rName === 'ไม่ระบุผู้บันทึก') {
                        rName = getCurrentUserFullName();
                    }
                    return {
                        id: item.id,
                        sn: item.sn,
                        category: item.category || 'N/A',
                        name: item.name || '-',
                        meter: item.meter || 0,
                        location: item.location || 'DOCK',
                        received_by: escapeHTML(rName),
                        time: item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-',
                        created_at: item.created_at,
                        isOffline: false,
                        db_status: 'SYNCED'
                    };
                });

            recentInboundList = pendingLocalItems.concat(dbItems).slice(0, 100);
            saveRecentInboundFeedToCache();
            scheduleDebouncedFeedRender();
        }
    } catch (e) {}
}

function updateMasterDbCountBadge() {
    const badgeElem = document.getElementById('masterDbCountBadge') || document.getElementById('sidebarDbStatusBox');
    if (!badgeElem) return;

    const masterList = typeof globalMasterProducts !== 'undefined' ? globalMasterProducts : [];
    const inventoryList = typeof globalInventoryData !== 'undefined' ? globalInventoryData : [];

    const totalMasterCount = masterList.length;
    const totalInventoryCount = inventoryList.length;

    const uniqueModelNames = new Set();
    masterList.concat(inventoryList).forEach(item => {
        if (!item) return;
        const modelName = (item.name || item.description || item.model || '').trim();
        if (modelName) uniqueModelNames.add(modelName.toLowerCase());
    });
    const totalModelCount = uniqueModelNames.size;

    const isOnline = navigator.onLine;
    const statusDotClass = isOnline ? 'pulse-live-dot' : 'net-dot offline';
    const statusText = isOnline ? 'เชื่อมต่อ DB สำเร็จ' : 'โหมดออฟไลน์ (เก็บคิว)';

    badgeElem.innerHTML = `
        <div class="db-status-container-2line">
            <div class="db-status-line line-1">
                <span class="db-online-tag"><span class="${statusDotClass}"></span> ${statusText}</span>
                <span class="db-stat-item"><i class="fa-solid fa-database"></i> Master <strong>${totalMasterCount.toLocaleString()}</strong> SKU</span>
            </div>
            <div class="db-status-line line-2">
                <span class="db-stat-item"><i class="fa-solid fa-boxes-stacked"></i> ในสต็อก <strong>${totalInventoryCount.toLocaleString()}</strong> ชิ้น</span>
                <span class="db-stat-item"><i class="fa-solid fa-tags"></i> ใน DB <strong>${totalModelCount.toLocaleString()}</strong> รุ่น</span>
            </div>
        </div>
    `;

    const inboundKpiElem = document.getElementById('inboundTotalCountKpi') || document.getElementById('inboundStockBadge');
    if (inboundKpiElem) inboundKpiElem.textContent = `${totalInventoryCount.toLocaleString()} ชิ้น`;

    if (typeof updateKPIs === 'function') {
        try { updateKPIs(); } catch (e) {}
    }
}

function onSkuSearchInput(val) {
    const box = document.getElementById('skuSuggestionsBox');
    if (!box) return;

    const masterList = (typeof globalMasterProducts !== 'undefined' ? globalMasterProducts : [])
        .concat(typeof globalInventoryData !== 'undefined' ? globalInventoryData : []);

    const uniqueModelNames = new Set();
    masterList.forEach(item => {
        if (!item) return;
        const modelName = (item.name || item.description || item.model || '').trim();
        if (modelName) uniqueModelNames.add(modelName.toLowerCase());
    });
    const totalModelCount = uniqueModelNames.size;

    if (!val.trim()) {
        box.style.display = 'none';
        return;
    }

    const query = val.toLowerCase().trim();
    const skuMap = new Map();

    for (let i = 0; i < masterList.length; i++) {
        const item = masterList[i];
        if (!item) continue;
        const skuKey = (item.sku || item.category || item.code || '').trim();
        const nameVal = (item.name || item.description || item.model || '').trim();

        if (skuKey && !skuMap.has(skuKey.toLowerCase())) {
            if (skuKey.toLowerCase().includes(query) || nameVal.toLowerCase().includes(query)) {
                skuMap.set(skuKey.toLowerCase(), { sku: skuKey, name: nameVal });
            }
        }
        if (skuMap.size >= 100) break;
    }

    const uniqueResults = Array.from(skuMap.values());

    let headerHtml = `
        <div style="padding:10px 14px; background:var(--bg-subtle, #f8fafc); border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-sub, #64748b);">
            <span><i class="fa-solid fa-magnifying-glass"></i> ผลการค้นหา (${uniqueResults.length})</span>
            <span style="background:var(--primary-light, #e0f2fe); color:var(--primary-text, #0284c7); padding:2px 10px; border-radius:12px; font-weight:600; font-size:0.75rem;">
                <i class="fa-solid fa-tags"></i> มี ${totalModelCount.toLocaleString()} ชื่อรุ่นใน DB
            </span>
        </div>
    `;

    if (uniqueResults.length === 0) {
        box.innerHTML = headerHtml + `<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:0.82rem;">ไม่พบสินค้าในฐานข้อมูล (${masterList.length.toLocaleString()} รายการ)</div>`;
        box.style.display = 'block';
        return;
    }

    let html = headerHtml;
    uniqueResults.forEach(item => {
        const itemSku = escapeHTML(item.sku);
        const itemName = escapeHTML(item.name || 'ไม่ระบุชื่อรุ่น');
        html += `
            <div class="suggestion-item" style="padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border-color, #f1f5f9); display:flex; justify-content:space-between; align-items:center; transition:background 0.15s ease;" onclick="selectSkuSuggestion('${itemSku}', '${itemName}')">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                    <span class="mono font-bold" style="color:var(--primary-text, #0284c7); font-size:0.88rem; flex-shrink:0;">${itemSku}</span>
                    <span style="color:var(--text-muted, #94a3b8); font-size:0.82rem;">—</span>
                    <span style="color:var(--text-main, #0f172a); font-size:0.85rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
                        <i class="fa-solid fa-box-archive" style="font-size:0.75rem; color:var(--primary, #0284c7); margin-right:4px;"></i> ${itemName}
                    </span>
                </div>
                <span style="font-size:0.75rem; color:var(--text-sub, #64748b); flex-shrink:0; background:var(--bg-body, #f8fafc); padding:2px 8px; border-radius:6px; border:1px solid var(--border-color, #e2e8f0); font-weight:600;">
                    <i class="fa-solid fa-tag" style="color:var(--primary, #0284c7);"></i> ชื่อรุ่น
                </span>
            </div>
        `;
    });
    box.innerHTML = html;
    box.style.display = 'block';
}

function selectSkuSuggestion(sku, name) {
    const categoryElem = document.getElementById('inboundCategory');
    const nameElem = document.getElementById('inboundName');
    const searchElem = document.getElementById('skuSearchInput');
    const box = document.getElementById('skuSuggestionsBox');

    if (categoryElem) categoryElem.value = sku;
    if (nameElem) nameElem.value = name;
    if (searchElem) searchElem.value = `${sku} - ${name}`;
    if (box) box.style.display = 'none';

    ensureSnInputFocus(true);
}

function onRecentFeedSearch(queryText) {
    recentFeedSearchQuery = (queryText || '').toLowerCase().trim();
    renderLiveInboundFeed();
}

function triggerReprintStickerFromFeed(sn, name = '', category = '', location = '') {
    if (!sn) return;

    if (typeof window.openPrintBarcodeModal === 'function') {
        window.openPrintBarcodeModal('SINGLE', sn);
        return;
    }
    if (typeof window.printSingleBarcode === 'function') {
        window.printSingleBarcode(sn);
        return;
    }
    copyToClipboard(sn);
}

// 🟢 Render รายการสแกนรับเข้าพร้อมแสดงสถานะการบันทึกเข้า DB บน UI การ์ดแบบทันสมัย
function renderLiveInboundFeed() {
    const container = document.getElementById('liveInboundFeedContainer');
    if (!container) return;

    ensureInboundNetworkSyncHUD();
    updateInboundNetworkSyncHUD();
    updateMasterDbCountBadge();

    let filteredList = recentInboundList;
    if (recentFeedSearchQuery) {
        filteredList = recentInboundList.filter(item => {
            if (!item) return false;
            const snMatch = String(item.sn || '').toLowerCase().includes(recentFeedSearchQuery);
            const nameMatch = String(item.name || '').toLowerCase().includes(recentFeedSearchQuery);
            const catMatch = String(item.category || '').toLowerCase().includes(recentFeedSearchQuery);
            const locMatch = String(item.location || '').toLowerCase().includes(recentFeedSearchQuery);
            const receiverMatch = String(item.received_by || item.receiver || '').toLowerCase().includes(recentFeedSearchQuery);
            return snMatch || nameMatch || catMatch || locMatch || receiverMatch;
        });
    }

    if (recentInboundList.length === 0) {
        container.innerHTML = `
            <div style="padding:32px 20px; text-align:center; color:var(--text-muted, #94a3b8); font-size:0.88rem; background:var(--bg-surface, #ffffff); border-radius:16px; border:1px solid var(--border-color, #e2e8f0); box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                <i class="fa-solid fa-box-open" style="font-size:2.5rem; margin-bottom:10px; opacity:0.35; color:var(--primary, #0284c7);"></i><br/>
                ยังไม่มีรายการรับเข้าในเซสชันนี้
            </div>`;
        return;
    }

    const countElem = document.getElementById('recentInboundCountBadge');
    if (countElem) countElem.textContent = `${recentInboundList.length} รายการ`;

    const currentActiveUserName = getCurrentUserFullName();

    let html = `
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="pulse-live-dot"></span>
                    <span style="font-size:0.9rem; font-weight:700; color:var(--text-main, #0f172a);">
                        ประวัติการรับเข้าล่าสุด Realtime (${filteredList.length}/${recentInboundList.length})
                    </span>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="clearRecentInboundFeedView()" style="font-size:0.75rem; padding:4px 10px; border-radius:8px;" title="ล้างหน้าจอแสดงผล">
                    <i class="fa-solid fa-eraser"></i> เคลียร์
                </button>
            </div>
            <div style="position:relative; width:100%;">
                <input type="text"
                       id="recentFeedSearchInput"
                       oninput="onRecentFeedSearch(this.value)"
                       value="${escapeHTML(recentFeedSearchQuery)}"
                       placeholder="🔍 ค้นหาในประวัติ (S/N, SKU, พิกัด, ผู้รับ)..."
                       style="width:100%; padding:8px 14px 8px 34px; font-size:0.82rem; border-radius:10px; border:1px solid var(--border-color, #cbd5e1); background:var(--bg-subtle, #f8fafc); color:var(--text-main, #0f172a); outline:none; transition:all 0.2s ease;" />
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:0.8rem; color:var(--text-muted, #94a3b8);"></i>
            </div>
        </div>
        <div class="inbound-feed-scroll-wrapper" style="max-height: calc(100vh - 330px); overflow-y: auto; padding-right: 6px; margin-right: -4px;">
            <div class="inbound-feed-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap:12px;">
    `;

    if (filteredList.length === 0) {
        html += `
            <div style="grid-column: 1 / -1; padding:24px; text-align:center; color:var(--text-muted, #94a3b8); font-size:0.84rem; background:var(--bg-surface, #ffffff); border-radius:12px; border:1px dashed var(--border-color, #cbd5e1);">
                ไม่พบรายการประวัติที่ตรงกับ "${escapeHTML(recentFeedSearchQuery)}"
            </div>
        `;
    } else {
        filteredList.forEach(item => {
            const locBadgeHTML = formatLocationBadgeHTML(item.location);

            let displayReceiver = item.received_by || item.receiver || item.created_by;
            if (!displayReceiver || displayReceiver === 'nakorn.c' || displayReceiver === 'Nakorn C' || displayReceiver === 'ไม่ระบุผู้บันทึก') {
                displayReceiver = currentActiveUserName;
            }

            const receiverName = escapeHTML(displayReceiver);
            const itemSn = escapeHTML(item.sn);
            const itemId = escapeHTML(item.id || '');
            const itemCategory = escapeHTML(item.category);
            const itemName = escapeHTML(item.name);
            const itemTime = escapeHTML(item.time || (item.created_at ? new Date(item.created_at).toLocaleTimeString('th-TH') : '-'));

            let dbStatusBadgeHTML = '';
            if (item.db_status === 'SYNCED' || (!item.isOffline && !item._pending && item.db_status !== 'PENDING' && item.db_status !== 'SYNCING')) {
                dbStatusBadgeHTML = `<span class="badge-action inbound" style="background:linear-gradient(135deg, #ecfdf5, #d1fae5); color:#047857; border:1px solid #a7f3d0; padding:3px 9px; border-radius:12px; font-weight:700; font-size:0.72rem; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-circle-check"></i> บันทึกเข้า DB สำเร็จ</span>`;
            } else if (item.db_status === 'SYNCING') {
                dbStatusBadgeHTML = `<span class="badge-action warning" style="background:linear-gradient(135deg, #eff6ff, #dbeafe); color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 9px; border-radius:12px; font-weight:700; font-size:0.72rem; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกเข้า DB</span>`;
            } else {
                dbStatusBadgeHTML = `<span class="badge-action warning" style="background:linear-gradient(135deg, #fffbeb, #fef3c7); color:#b45309; border:1px solid #fde68a; padding:3px 9px; border-radius:12px; font-weight:700; font-size:0.72rem; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-cloud-arrow-up fa-bounce"></i> รอบันทึกเข้า DB (ออฟไลน์)</span>`;
            }

            html += `
                <div class="feed-item modern-feed-card animate-feed-entry">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%; gap:6px;">
                        <div style="display:flex; flex-direction:column; width:100%;">
                            <span style="font-size:0.68rem; color:var(--text-muted, #94a3b8); font-weight:700; text-transform:uppercase;">ซีเรียล S/N:</span>
                            <span class="full-sn-text" style="font-size:0.92rem;">
                                ${itemSn}
                            </span>
                        </div>
                        <div class="feed-card-actions" style="flex-shrink:0;">
                            <button type="button" class="btn-card-action" onclick="copyToClipboard('${itemSn}');" title="คัดลอก S/N">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                            <button type="button" class="btn-card-action" onclick="triggerReprintStickerFromFeed('${itemSn}', '${itemName}', '${itemCategory}', '${item.location}')" title="ดีดไปที่ศูนย์พิมพ์บาร์โค้ด">
                                <i class="fa-solid fa-print"></i> พิมพ์
                            </button>
                            <button type="button" class="btn-card-action btn-card-delete" onclick="deleteInboundItem('${itemSn}', '${itemId}', '${item.location}')" title="ไปที่หน้าเช็กสต็อกเพื่อส่งคำขอลบรายการนี้" style="color:#ef4444; border-color:#fca5a5; background:#fef2f2;">
                                <i class="fa-solid fa-trash-can"></i> ลบ
                            </button>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1px; margin-bottom:2px;">
                        ${dbStatusBadgeHTML}
                    </div>

                    <div style="display:flex; flex-direction:column; gap:4px; background:var(--bg-subtle, #f8fafc); padding:8px 12px; border-radius:10px; border:1px solid var(--border-color, #e2e8f0);">
                        <span style="font-size:0.68rem; color:var(--text-muted, #64748b); font-weight:700;">📍 พิกัดจัดเก็บ (1 คอลัมน์):</span>
                        <div style="width:100%;">
                            ${locBadgeHTML}
                        </div>
                    </div>

                    <div style="font-size:0.82rem; color:var(--text-sub, #475569); line-height:1.3; word-break:break-word;" title="[${itemCategory}] ${itemName}">
                        <strong style="color:var(--primary-text, #0284c7);">[${itemCategory}]</strong> ${itemName}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.73rem; color:var(--text-muted, #94a3b8); border-top:1px dashed var(--border-color, #e2e8f0); padding-top:6px; margin-top:2px;">
                        <span style="font-weight:600; color:var(--text-main, #0f172a);"><i class="fa-solid fa-user-check" style="color:var(--success, #10b981);"></i> ${receiverName}</span>
                        <span><i class="fa-regular fa-clock"></i> ${itemTime} น.</span>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function clearRecentInboundFeedView() {
    recentInboundList = [];
    saveRecentInboundFeedToCache();
    renderLiveInboundFeed();
    ensureSnInputFocus();
}