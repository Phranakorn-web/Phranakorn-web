// =========================================================================
// --- MODULE 4: OUTBOUND WORK ORDER & DELIVERY NOTE ENGINE (REALTIME 100%) ---
// =========================================================================

let outboundCartList = [];
let recentOutboundOrdersList = [];
let isOutboundLocationVisible = false; // 🟢 ซ่อนพิกัดเดิมไว้ก่อนเป็นค่าเริ่มต้น (Default Hidden)

// 🟢 สลับการแสดง/ซ่อน พิกัดเดิมในใบส่งสินค้า PDF และตาราง
function toggleOutboundLocationVisibility() {
    isOutboundLocationVisible = !isOutboundLocationVisible;
    
    const btnIcon = document.getElementById('outboundLocVisIcon');
    const btnText = document.getElementById('outboundLocVisText');
    
    if (btnIcon && btnText) {
        if (isOutboundLocationVisible) {
            btnIcon.className = 'fa-solid fa-eye';
            btnText.textContent = 'แสดงพิกัดเดิม: เปิด';
            if (typeof showToast === 'function') showToast("👁️ เปิดการแสดงพิกัดจัดเก็บเดิมบนใบส่งสินค้า PDF แล้ว");
        } else {
            btnIcon.className = 'fa-solid fa-eye-slash';
            btnText.textContent = 'แสดงพิกัดเดิม: ปิด (ซ่อน)';
            if (typeof showToast === 'function') showToast("🙈 ซ่อนพิกัดจัดเก็บเดิมบนใบส่งสินค้าเรียบร้อยแล้ว");
        }
    }

    renderOutboundCartTable();
}

function handleAddOutboundToCart(e) {
    if (e) e.preventDefault();
    const snInput = document.getElementById('outboundSn');
    if (!snInput) return;

    const rawSn = snInput.value || '';
    const cleanSn = rawSn.replace(/[\r\n\t]/g, '').trim();

    if (!cleanSn) return;

    const snUpper = cleanSn.toUpperCase();

    // 1. ตรวจสอบว่า S/N มีอยู่ในตะกร้าจ่ายออกอยู่แล้วหรือไม่
    if (outboundCartList.some(i => String(i.sn).toUpperCase() === snUpper)) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`⚠️ S/N: ${cleanSn} เพิ่มในรายการเบิกจ่ายแล้ว`, true);
        snInput.select();
        return;
    }

    // 2. ค้นหาข้อมูลสินค้าในสต็อก
    let inventoryItem = null;
    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        inventoryItem = globalInventoryData.find(i => i && String(i.sn).toUpperCase() === snUpper && i.status !== 'OUT' && !i.is_deleted);
    }

    if (!inventoryItem) {
        if (typeof playErrorSound === 'function') playErrorSound();
        if (typeof showToast === 'function') showToast(`❌ ไม่พบ S/N: ${cleanSn} ในสต็อกคลังสินค้า หรือถูกจ่ายออกไปแล้ว`, true);
        snInput.select();
        return;
    }

    outboundCartList.push({
        id: inventoryItem.id,
        sn: inventoryItem.sn,
        category: inventoryItem.category || 'N/A',
        name: inventoryItem.name || '-',
        meter: inventoryItem.meter || 0,
        location: inventoryItem.location || 'DOCK'
    });

    snInput.value = '';
    snInput.focus();

    if (typeof playSuccessSound === 'function') playSuccessSound();
    renderOutboundCartTable();
}

function removeOutboundCartItem(sn) {
    const targetSnUpper = String(sn).toUpperCase();
    outboundCartList = outboundCartList.filter(i => String(i.sn).toUpperCase() !== targetSnUpper);
    renderOutboundCartTable();
}

function renderOutboundCartTable() {
    const tbody = document.getElementById('outboundCartTableBody');
    const countBadge = document.getElementById('outboundCartCountBadge');
    if (!tbody) return;

    if (countBadge) countBadge.textContent = `${outboundCartList.length.toLocaleString()} รายการ`;

    if (outboundCartList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color:var(--text-muted);">ยังไม่มีรายการ ยิงสแกน S/N เพื่อเพิ่มเข้าใบส่งสินค้า</td></tr>`;
        return;
    }

    let html = '';
    outboundCartList.forEach((item, index) => {
        const itemSn = escapeHTML(item.sn);
        const itemCategory = escapeHTML(item.category || 'N/A');
        const itemName = escapeHTML(item.name || '-');
        const itemLoc = escapeHTML(item.location || 'DOCK');
        const itemMeter = parseInt(item.meter) || 0;

        const locDisplayHtml = isOutboundLocationVisible 
            ? `<span class="badge-location mono" style="font-size:0.78rem;">${itemLoc}</span>`
            : `<span style="color:var(--text-muted); font-size:0.75rem; font-style:italic;">[ซ่อนพิกัด]</span>`;

        html += `
            <tr>
                <td style="text-align:center; font-weight:700;">${index + 1}</td>
                <td class="mono font-bold" style="color:var(--primary-text);">${itemCategory}</td>
                <td>${itemName}</td>
                <td class="mono font-bold">${itemSn}</td>
                <td class="mono">${itemMeter}</td>
                <td class="outbound-loc-col">${locDisplayHtml}</td>
                <td style="text-align:center;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeOutboundCartItem('${itemSn}')" style="padding:2px 6px;" title="ลบรายการนี้">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// 🟢 ส่งคำขออนุมัติจ่ายออกและบันทึกเข้า Supabase Realtime DB 100%
async function requestOutboundApproval() {
    if (outboundCartList.length === 0) {
        if (typeof showToast === 'function') showToast("⚠️ กรุณายิงสแกนเพิ่มสินค้าเข้าใบส่งสินค้าก่อนทำการยืนยัน", true);
        return;
    }

    const companyTitle = (document.getElementById('outboundCompanyTitle')?.value || '').trim() || 'คลังสินค้าหลัก (Main Warehouse)';
    const customerName = (document.getElementById('outboundCustomerName')?.value || '').trim();
    const customerAddress = (document.getElementById('outboundCustomerAddress')?.value || '').trim();
    const contactPerson = (document.getElementById('outboundContactPerson')?.value || '').trim();
    const salesperson = (document.getElementById('outboundSalesperson')?.value || '').trim();
    const activeUserName = typeof getCurrentUserFullName === 'function' ? getCurrentUserFullName() : 'เจ้าหน้าที่จ่ายสินค้า';
    const dispatcher = (document.getElementById('outboundDispatcher')?.value || '').trim() || activeUserName;
    const receiver = (document.getElementById('outboundReceiver')?.value || '').trim();
    const destinationNotes = (document.getElementById('outboundDestination')?.value || '').trim();

    const doNo = 'DO-' + new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0') + String(new Date().getDate()).padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000);
    const nowISO = new Date().toISOString();

    const outboundPayload = {
        do_number: doNo,
        company_title: companyTitle,
        customer_name: customerName,
        customer_address: customerAddress,
        contact_person: contactPerson,
        salesperson: salesperson,
        dispatcher: dispatcher,
        receiver: receiver,
        destination_notes: destinationNotes,
        show_original_location: isOutboundLocationVisible,
        items: outboundCartList,
        total_items: outboundCartList.length,
        created_at: nowISO
    };

    // 1. ตัดจ่ายสินค้าในระบบหลักและลบพิกัดเดิมจากหน่วยความจำ
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    
    for (const item of outboundCartList) {
        if (client && navigator.onLine) {
            try {
                await client.from('warehouse_items').update({
                    status: 'OUT',
                    dispatched_at: nowISO,
                    dispatched_by: activeUserName,
                    delivery_note_no: doNo
                }).eq('sn', item.sn);
            } catch(e) {}
        }

        if (typeof purgeDispatchedOrDeletedItemFromMemory === 'function') {
            purgeDispatchedOrDeletedItemFromMemory(item.sn, item.id, item.location);
        }
    }

    // 2. บันทึกลงตาราง outbound_orders ใน Supabase DB
    if (client && navigator.onLine) {
        try {
            await client.from('outbound_orders').insert([outboundPayload]);
        } catch (e) {
            console.warn("⚠️ บันทึกตาราง outbound_orders ไม่สำเร็จ fallback ไปบันทึกประวัติ local:", e);
        }
    }

    // 3. บันทึกเข้าประวัติ Local Cache
    recentOutboundOrdersList.unshift(outboundPayload);
    try {
        localStorage.setItem('WMS_RECENT_OUTBOUND_ORDERS', JSON.stringify(recentOutboundOrdersList.slice(0, 50)));
    } catch(e) {}

    if (typeof playSuccessSound === 'function') playSuccessSound();
    if (typeof showToast === 'function') showToast(`🎉 บันทึกตัดจ่ายสินค้าและออกใบส่งสินค้าเลขที่ ${doNo} สำเร็จ!`);

    if (typeof logUserActivity === 'function') {
        logUserActivity('OUTBOUND', `จ่ายสินค้าออกจากคลัง ใบส่งสินค้า ${doNo} จำนวน ${outboundCartList.length} ชิ้น`, doNo);
    }

    outboundCartList = [];
    renderOutboundCartTable();
    renderLiveOutboundFeed();
}

async function loadRecentOutboundFeedFromDB() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    
    try {
        const savedLocal = localStorage.getItem('WMS_RECENT_OUTBOUND_ORDERS');
        if (savedLocal) recentOutboundOrdersList = JSON.parse(savedLocal);
    } catch(e) {}

    if (client && navigator.onLine) {
        try {
            const { data, error } = await client
                .from('outbound_orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && data && data.length > 0) {
                recentOutboundOrdersList = data;
                localStorage.setItem('WMS_RECENT_OUTBOUND_ORDERS', JSON.stringify(recentOutboundOrdersList));
            }
        } catch(e) {}
    }

    renderLiveOutboundFeed();
}

function renderLiveOutboundFeed() {
    const container = document.getElementById('liveOutboundFeedContainer');
    if (!container) return;

    if (recentOutboundOrdersList.length === 0) {
        container.innerHTML = `
            <div style="padding:32px 20px; text-align:center; color:var(--text-muted); font-size:0.88rem; background:var(--bg-surface); border-radius:16px; border:1px solid var(--border-color);">
                <i class="fa-solid fa-truck-ramp-box" style="font-size:2.5rem; margin-bottom:10px; opacity:0.35; color:var(--warning);"></i><br/>
                ยังไม่มีประวัติการจ่ายสินค้าและออกใบส่งสินค้า
            </div>
        `;
        return;
    }

    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    recentOutboundOrdersList.forEach((order) => {
        const doNo = escapeHTML(order.do_number || 'DO-UNKNOWN');
        const customer = escapeHTML(order.customer_name || 'ลูกค้าทั่วไป');
        const dispatcher = escapeHTML(order.dispatcher || 'เจ้าหน้าที่คลังสินค้า');
        const itemCount = order.total_items || (Array.isArray(order.items) ? order.items.length : 0);
        const timeStr = order.created_at ? new Date(order.created_at).toLocaleString('th-TH') : '-';

        let itemsPreviewHtml = '';
        if (Array.isArray(order.items)) {
            itemsPreviewHtml = order.items.slice(0, 3).map(i => `
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; border-bottom:1px dashed var(--border-color); padding:3px 0;">
                    <span class="mono font-bold" style="color:var(--primary-text);">${escapeHTML(i.sn)}</span>
                    <span style="color:var(--text-sub);">${escapeHTML(i.name || i.category)}</span>
                </div>
            `).join('');

            if (order.items.length > 3) {
                itemsPreviewHtml += `<div style="font-size:0.72rem; color:var(--text-muted); text-align:center; margin-top:2px;">... และอีก ${order.items.length - 3} รายการ</div>`;
            }
        }

        html += `
            <div class="card" style="padding:12px; margin-bottom:0; border:1px solid var(--border-color); border-radius:12px; background:var(--bg-surface);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span class="mono font-bold" style="font-size:0.95rem; color:var(--warning);"><i class="fa-solid fa-file-invoice"></i> ${doNo}</span>
                    <span class="badge-action outbound" style="font-size:0.72rem;">${itemCount} ชิ้น</span>
                </div>
                <div style="font-size:0.83rem; font-weight:600; color:var(--text-main); margin-bottom:4px;">
                    <i class="fa-solid fa-building" style="color:var(--text-muted); font-size:0.75rem;"></i> ปลายทาง: ${customer}
                </div>
                <div style="background:var(--bg-subtle); padding:6px 10px; border-radius:8px; margin-bottom:6px;">
                    ${itemsPreviewHtml}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.73rem; color:var(--text-muted); border-top:1px solid var(--border-color); padding-top:6px;">
                    <span><i class="fa-solid fa-user-check"></i> จ่ายโดย: ${dispatcher}</span>
                    <span><i class="fa-regular fa-clock"></i> ${timeStr}</span>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    container.innerHTML = html;
}

function initOutboundRealtimeListener() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null);
    if (!client) return;

    try {
        client
            .channel('public_outbound_orders_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'outbound_orders' }, (payload) => {
                if (payload.new) {
                    recentOutboundOrdersList.unshift(payload.new);
                    renderLiveOutboundFeed();
                }
            })
            .subscribe();
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', () => {
    renderOutboundCartTable();
    loadRecentOutboundFeedFromDB();
    initOutboundRealtimeListener();

    const outboundSnInput = document.getElementById('outboundSn');
    if (outboundSnInput) {
        outboundSnInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleAddOutboundToCart(e);
            }
        });
    }
});

window.handleAddOutboundToCart = handleAddOutboundToCart;
window.removeOutboundCartItem = removeOutboundCartItem;
window.renderOutboundCartTable = renderOutboundCartTable;
window.requestOutboundApproval = requestOutboundApproval;
window.loadRecentOutboundFeedFromDB = loadRecentOutboundFeedFromDB;
window.renderLiveOutboundFeed = renderLiveOutboundFeed;
window.toggleOutboundLocationVisibility = toggleOutboundLocationVisibility;
window.isOutboundLocationVisible = isOutboundLocationVisible;