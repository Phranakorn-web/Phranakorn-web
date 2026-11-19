// =========================================================================
// --- MODULE 4: OUTBOUND WORK ORDER & DELIVERY NOTE ENGINE (REALTIME 100%) ---
// --- Company Header, Logo Upload, PO/Requisition Ref, Model/Qty/Unit,  ---
// --- Interactive Signature Pad, Supabase Persistence & A4 Work Order   ---
// =========================================================================

let outboundDispatcherSignatureDataUrl = '';
let outboundReceiverSignatureDataUrl = '';

// 🟢 สลับการแสดง/ซ่อน พิกัดเดิมในใบงานจ่ายสินค้า PDF และตาราง
function toggleOutboundLocationVisibility() {
    isOutboundLocationVisible = !isOutboundLocationVisible;

    const btnIcon = document.getElementById('outboundLocVisIcon');
    const btnText = document.getElementById('outboundLocVisText');

    if (btnIcon && btnText) {
        if (isOutboundLocationVisible) {
            btnIcon.className = 'fa-solid fa-eye';
            btnText.textContent = 'แสดงพิกัดเดิม: เปิด';
            if (typeof showToast === 'function') showToast('👁️ เปิดการแสดงพิกัดจัดเก็บเดิมบนใบงานจ่ายสินค้าแล้ว');
        } else {
            btnIcon.className = 'fa-solid fa-eye-slash';
            btnText.textContent = 'แสดงพิกัดเดิม: ปิด (ซ่อน)';
            if (typeof showToast === 'function') showToast('🙈 ซ่อนพิกัดจัดเก็บเดิมบนใบงานจ่ายสินค้าเรียบร้อยแล้ว');
        }
    }

    renderOutboundCartTable();
}

// ⚡ สลับโหมดสแกน (เพิ่มลงใบงาน vs ยิงตัดจ่ายด่วนสำหรับ Admin)
function toggleOutboundDirectFastScanMode() {
    if (!checkOutboundUserIsAdmin()) {
        if (typeof showToast === 'function') {
            showToast('🔒 โหมดยิงตัดจ่ายด่วนสงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น', true);
        }
        return;
    }
    isOutboundDirectFastScanMode = !isOutboundDirectFastScanMode;
    const toggleBtn = document.getElementById('btnToggleOutboundFastScan');
    if (toggleBtn) {
        toggleBtn.innerHTML = isOutboundDirectFastScanMode
            ? '<i class="fa-solid fa-bolt"></i> โหมดสแกน: ตัดจ่ายด่วนทันที (Admin)'
            : '<i class="fa-solid fa-file-invoice"></i> โหมดสแกน: เพิ่มลงใบงานจ่ายสินค้า';
        toggleBtn.style.background = isOutboundDirectFastScanMode ? '#fef3c7' : '#eff6ff';
        toggleBtn.style.color = isOutboundDirectFastScanMode ? '#92400e' : '#1d4ed8';
    }
    if (typeof showToast === 'function') {
        showToast(
            isOutboundDirectFastScanMode
                ? '⚡ เปิดโหมดสแกนตัดจ่ายด่วนทีละชิ้นแล้ว (ตัดสต็อกทันทีเมื่อยิงบาร์โค้ด)'
                : '📋 สลับกลับสู่โหมดเพิ่มรายการเข้าใบงานจ่ายสินค้าออกจากคลังแล้ว'
        );
    }
}

// ➕ เพิ่ม S/N เข้าตะกร้าใบงานจ่ายสินค้า
function handleAddOutboundToCart(e) {
    if (e) e.preventDefault();
    const snInput = getOutboundSnInputElement();
    if (!snInput) return;

    const rawSn = snInput.value || '';
    const cleanSn = rawSn.replace(/[\r\n\t\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '').trim();

    if (!cleanSn) return;

    const snUpper = cleanSn.toUpperCase();

    if (outboundCartList.some(i => String(i.sn).trim().toUpperCase() === snUpper)) {
        triggerOutboundScanFlash('duplicate');
        renderOutboundInstantScanBoxStatus('duplicate', cleanSn, '', '', persistentOutboundDbQueue.length, 0);
        if (typeof showToast === 'function') showToast(`⚠️ S/N: ${cleanSn} เพิ่มในใบงานจ่ายสินค้าแล้ว`, true);
        snInput.value = '';
        ensureOutboundSnInputFocus(true);
        return;
    }

    const inventoryItem = findActiveStockItemBySn(snUpper);

    if (!inventoryItem) {
        triggerOutboundScanFlash('not_found');
        renderOutboundInstantScanBoxStatus('not_found', cleanSn, '', '', persistentOutboundDbQueue.length, 0);
        if (typeof showToast === 'function') showToast(`❌ ไม่พบ S/N: ${cleanSn} ในสต็อกคลังสินค้า หรือถูกจ่ายออกไปแล้ว`, true);
        snInput.value = '';
        ensureOutboundSnInputFocus(true);
        return;
    }

    const modelName = inferOutboundItemModel(inventoryItem);
    const unitName = inferOutboundItemUnit(inventoryItem);

    outboundCartList.push({
        id: inventoryItem.id || null,
        sn: inventoryItem.sn || cleanSn,
        category: inventoryItem.category || 'ทั่วไป',
        name: inventoryItem.name || modelName,
        model: modelName,
        qty: 1,
        unit: unitName,
        meter: inventoryItem.meter || 0,
        location: inventoryItem.location || 'DOCK'
    });

    snInput.value = '';
    ensureOutboundSnInputFocus(true);

    triggerOutboundScanFlash('success');
    renderOutboundInstantScanBoxStatus(
        'cart_added',
        inventoryItem.sn || cleanSn,
        `${modelName} (1 ${unitName})`,
        inventoryItem.location || 'DOCK',
        persistentOutboundDbQueue.length,
        0
    );
    renderOutboundCartTable();
}

// ✏️ อัปเดตชื่อรุ่น / จำนวน / หน่วยนับ ของแต่ละรายการในใบงานจ่ายสินค้า
function updateOutboundCartItemField(sn, field, value) {
    const targetSnUpper = String(sn || '').trim().toUpperCase();
    const item = outboundCartList.find(i => String(i.sn).trim().toUpperCase() === targetSnUpper);
    if (!item) return;

    if (field === 'qty') {
        const parsed = parseInt(value, 10);
        item.qty = (!isNaN(parsed) && parsed > 0) ? parsed : 1;
    } else if (field === 'model') {
        item.model = String(value || '').trim() || item.name || '-';
        item.name = item.model;
    } else if (field === 'unit') {
        item.unit = String(value || '').trim() || 'ชิ้น';
    }

    updateOutboundCartSummaryBadges();
}

function removeOutboundCartItem(sn) {
    const targetSnUpper = String(sn || '').trim().toUpperCase();
    outboundCartList = outboundCartList.filter(i => String(i.sn).trim().toUpperCase() !== targetSnUpper);
    renderOutboundCartTable();
}

function updateOutboundCartSummaryBadges() {
    const countBadge = document.getElementById('outboundCartCountBadge');
    const totalQtyEl = document.getElementById('outboundCartTotalQtyText');
    const totalQty = outboundCartList.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 1), 0);

    if (countBadge) {
        countBadge.textContent = `${outboundCartList.length.toLocaleString()} รายการ (${totalQty.toLocaleString()} หน่วย)`;
    }
    if (totalQtyEl) {
        totalQtyEl.textContent = `รวมทั้งสิ้น ${outboundCartList.length.toLocaleString()} รายการ · จำนวนสุทธิ ${totalQty.toLocaleString()} หน่วย`;
    }
}

// 🎨 สร้างส่วนข้อมูลหัวบริษัท โลโก้ เลขที่อ้างอิงใบเบิก/PO ตารางรายการ และช่องลายเซ็นผู้จ่าย/ผู้รับ
function ensureOutboundWorkOrderEnhancedUI() {
    const tbody = document.getElementById('outboundCartTableBody');
    if (!tbody) return;

    const profile = loadOutboundCompanyProfile();

    const table = tbody.closest('table');
    if (table && table.dataset.workOrderUpgraded !== 'true') {
        table.dataset.workOrderUpgraded = 'true';
        const thead = table.querySelector('thead');
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="width:46px; text-align:center;">ลำดับ</th>
                    <th style="width:120px;">หมวดหมู่</th>
                    <th>ชื่อรุ่น / รายการสินค้า</th>
                    <th style="width:165px;">Serial Number (S/N)</th>
                    <th style="width:78px; text-align:center;">จำนวน</th>
                    <th style="width:92px; text-align:center;">หน่วยนับ</th>
                    <th style="width:105px;">พิกัดเดิม</th>
                    <th style="width:52px; text-align:center;">ลบ</th>
                </tr>
            `;
        }
    }

    const tableResponsiveContainer = table ? (table.closest('.table-responsive') || table) : null;
    const tableWrapper = table ? (table.closest('.table-responsive, .card, .section-card') || table.parentElement) : null;
    if (!tableWrapper) return;

    // 1. แผงข้อมูลหัวบริษัท โลโก้ และเลขที่อ้างอิงใบเบิก / PO (แทรกเหนือตารางใบงาน)
    if (!document.getElementById('outboundWorkOrderHeaderConfigPanel')) {
        const existingTitleInput = document.getElementById('outboundCompanyTitle');
        if (existingTitleInput) {
            if (!existingTitleInput.value.trim()) {
                existingTitleInput.value = profile.company_title || 'คลังสินค้าหลัก (Main Warehouse)';
            }
            existingTitleInput.addEventListener('input', (e) => {
                saveOutboundCompanyProfile({ company_title: e.target.value.trim() || 'คลังสินค้าหลัก (Main Warehouse)' });
            });
        }

        const headerConfigPanel = document.createElement('div');
        headerConfigPanel.id = 'outboundWorkOrderHeaderConfigPanel';
        headerConfigPanel.className = 'outbound-header-config-box';
        headerConfigPanel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:10px; padding-bottom:6px; border-bottom:1px solid var(--border-color, #e2e8f0);">
                <span style="font-weight:800; font-size:0.84rem; color:#1e3a8a;">
                    <i class="fa-solid fa-building-shield"></i> ข้อมูลหัวเอกสารบริษัท โลโก้ &amp; เลขที่อ้างอิงใบเบิก / PO
                </span>
                <span style="font-size:0.72rem; color:#059669; font-weight:700;">
                    <i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูลบริษัทและโลโก้อัตโนมัติ
                </span>
            </div>

            <div class="outbound-header-config-grid">
                <div class="outbound-logo-dropzone">
                    <img id="outboundCompanyLogoPreviewImg" alt="โลโก้บริษัท" style="max-width:140px; max-height:54px; object-fit:contain; display:none;" />
                    <div id="outboundCompanyLogoPlaceholder" style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:#64748b; font-size:0.73rem;">
                        <i class="fa-regular fa-image" style="font-size:1.35rem; margin-bottom:3px; color:#94a3b8;"></i>
                        <span>ยังไม่มีโลโก้บริษัท</span>
                    </div>
                    <div style="display:flex; gap:5px; flex-wrap:wrap; justify-content:center;">
                        <label for="outboundCompanyLogoInput" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 9px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer; margin:0;">
                            <i class="fa-solid fa-upload"></i> อัปโหลดโลโก้
                        </label>
                        <button type="button" id="btnRemoveOutboundLogo" onclick="removeOutboundCompanyLogo()" style="display:none; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:3px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer;">
                            ลบ
                        </button>
                    </div>
                    <input type="file" id="outboundCompanyLogoInput" accept="image/*" style="display:none;" onchange="handleOutboundLogoUpload(event)" />
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:8px;">
                    ${!existingTitleInput ? `
                    <div>
                        <label class="outbound-wo-field-label" for="outboundCompanyTitle">ชื่อบริษัท / ชื่อคลังสินค้า</label>
                        <input type="text" id="outboundCompanyTitle" class="outbound-wo-input-inline" placeholder="ระบุชื่อบริษัท / หน่วยงาน" value="${escapeOutboundHTML(profile.company_title)}" />
                    </div>` : ''}

                    <div>
                        <label class="outbound-wo-field-label" for="outboundCompanyPhoneTax">เบอร์โทรศัพท์ / เลขประจำตัวผู้เสียภาษี</label>
                        <input type="text" id="outboundCompanyPhoneTax" class="outbound-wo-input-inline" placeholder="เช่น โทร. 02-xxx-xxxx | เลขผู้เสียภาษี 01055..." value="${escapeOutboundHTML(profile.company_phone_tax)}" />
                    </div>

                    <div style="grid-column:1 / -1;">
                        <label class="outbound-wo-field-label" for="outboundCompanyAddress">ที่อยู่บริษัท / ที่ตั้งคลังสินค้า</label>
                        <input type="text" id="outboundCompanyAddress" class="outbound-wo-input-inline" placeholder="ระบุที่อยู่บริษัท / สาขา เพื่อแสดงบนหัวใบงานจ่ายสินค้า" value="${escapeOutboundHTML(profile.company_address)}" />
                    </div>

                    <div>
                        <label class="outbound-wo-field-label" for="outboundRefDocNo" style="color:#b45309;">
                            <i class="fa-solid fa-file-contract"></i> เลขที่อ้างอิงใบเบิก / PO / PR
                        </label>
                        <input type="text" id="outboundRefDocNo" class="outbound-wo-input-inline mono" style="font-weight:700; border-color:#fcd34d; background:#fffbeb;" placeholder="เช่น PO-2026-0089 / REQ-0412" />
                    </div>

                    <div>
                        <label class="outbound-wo-field-label" for="outboundRefProject">แผนก / โครงการ / เลขที่ใบสั่งงาน (Job/Site)</label>
                        <input type="text" id="outboundRefProject" class="outbound-wo-input-inline" placeholder="เช่น ฝ่ายติดตั้งโครงข่าย / โครงการ A" />
                    </div>
                </div>
            </div>
        `;

        if (tableResponsiveContainer && tableResponsiveContainer.parentElement) {
            tableResponsiveContainer.parentElement.insertBefore(headerConfigPanel, tableResponsiveContainer);
        } else {
            tableWrapper.insertBefore(headerConfigPanel, tableWrapper.firstChild);
        }

        const titleInputEl = document.getElementById('outboundCompanyTitle');
        const addrInputEl = document.getElementById('outboundCompanyAddress');
        const phoneTaxInputEl = document.getElementById('outboundCompanyPhoneTax');

        if (titleInputEl && !existingTitleInput) {
            titleInputEl.addEventListener('input', (e) => {
                saveOutboundCompanyProfile({ company_title: e.target.value.trim() || 'คลังสินค้าหลัก (Main Warehouse)' });
            });
        }
        if (addrInputEl) {
            addrInputEl.addEventListener('input', (e) => {
                saveOutboundCompanyProfile({ company_address: e.target.value.trim() });
            });
        }
        if (phoneTaxInputEl) {
            phoneTaxInputEl.addEventListener('input', (e) => {
                saveOutboundCompanyProfile({ company_phone_tax: e.target.value.trim() });
            });
        }

        updateOutboundLogoPreviewUI();
    }

    // 2. เพิ่มแถบสรุปและช่องลายเซ็นผู้จ่าย / ผู้รับ ด้านล่างตารางใบงาน
    if (!document.getElementById('outboundWorkOrderFooterPanel')) {
        const isAdmin = checkOutboundUserIsAdmin();
        const activeUserName = getOutboundOperatorName();

        const footerPanel = document.createElement('div');
        footerPanel.id = 'outboundWorkOrderFooterPanel';
        footerPanel.style.marginTop = '12px';
        footerPanel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 14px; background:var(--bg-subtle, #f1f5f9); border-radius:10px; border:1px solid var(--border-color, #e2e8f0);">
                <div id="outboundCartTotalQtyText" style="font-weight:800; font-size:0.86rem; color:var(--text-main, #0f172a);">
                    รวมทั้งสิ้น 0 รายการ · จำนวนสุทธิ 0 หน่วย
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" onclick="openOutboundWorkOrderPreviewModal()" class="btn btn-sm" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:700; padding:6px 12px; border-radius:8px; cursor:pointer;">
                        <i class="fa-solid fa-file-lines"></i> ดูตัวอย่างใบงานจ่ายสินค้า / พิมพ์
                    </button>
                    ${isAdmin ? `
                    <button type="button" id="btnToggleOutboundFastScan" onclick="toggleOutboundDirectFastScanMode()" class="btn btn-sm" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:700; padding:6px 12px; border-radius:8px; cursor:pointer;">
                        <i class="fa-solid fa-file-invoice"></i> โหมดสแกน: เพิ่มลงใบงานจ่ายสินค้า
                    </button>` : ''}
                </div>
            </div>

            <div class="outbound-signature-box-grid">
                <div class="outbound-sig-card">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:800; font-size:0.82rem; color:#0f172a;"><i class="fa-solid fa-signature" style="color:#2563eb;"></i> ลายเซ็นผู้จ่ายสินค้า (Dispatcher)</span>
                        <button type="button" onclick="clearOutboundSignatureCanvas('dispatcher')" style="background:none; border:none; color:#ef4444; font-size:0.74rem; font-weight:700; cursor:pointer;">ล้างลายเซ็น</button>
                    </div>
                    <canvas id="outboundDispatcherSigCanvas" class="outbound-sig-canvas" width="320" height="76"></canvas>
                    <input type="text" id="outboundDispatcher" class="outbound-wo-input-inline" placeholder="ระบุชื่อ-นามสกุล ผู้จ่ายสินค้า" value="${escapeOutboundHTML(activeUserName)}" />
                </div>

                <div class="outbound-sig-card">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:800; font-size:0.82rem; color:#0f172a;"><i class="fa-solid fa-signature" style="color:#059669;"></i> ลายเซ็นผู้รับสินค้า (Receiver)</span>
                        <button type="button" onclick="clearOutboundSignatureCanvas('receiver')" style="background:none; border:none; color:#ef4444; font-size:0.74rem; font-weight:700; cursor:pointer;">ล้างลายเซ็น</button>
                    </div>
                    <canvas id="outboundReceiverSigCanvas" class="outbound-sig-canvas" width="320" height="76"></canvas>
                    <input type="text" id="outboundReceiver" class="outbound-wo-input-inline" placeholder="ระบุชื่อ-นามสกุล ผู้รับสินค้า / ผู้เบิก" />
                </div>
            </div>
        `;

        tableWrapper.appendChild(footerPanel);
        initOutboundSignatureCanvas('outboundDispatcherSigCanvas', 'dispatcher');
        initOutboundSignatureCanvas('outboundReceiverSigCanvas', 'receiver');
    }

    // ปรับข้อความปุ่มยืนยันให้ตรงตามสิทธิ์ Admin หรือ User ทั่วไป
    const confirmBtns = document.querySelectorAll(
        '#btnConfirmOutbound, #btnRequestOutboundApproval, [onclick*="requestOutboundApproval"], [onclick*="confirmOutboundDispatch"]'
    );
    const isAdmin = checkOutboundUserIsAdmin();
    confirmBtns.forEach(btn => {
        if (isAdmin) {
            btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> ยืนยันตัดจ่ายสินค้าออกจากคลัง &amp; ออกใบงาน`;
        } else {
            btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> ส่งคำขออนุมัติจ่ายสินค้าออกจากคลัง`;
        }
    });
}

// ✍️ ระบบวาดลายเซ็นบนหน้าจอ (รองรับทั้งเมาส์และหน้าจอสัมผัส)
function initOutboundSignatureCanvas(canvasId, roleKey) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || canvas.dataset.sigBound === 'true') return;
    canvas.dataset.sigBound = 'true';

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let drawing = false;

    const getPos = (evt) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
        const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const startDraw = (evt) => {
        drawing = true;
        const pos = getPos(evt);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const moveDraw = (evt) => {
        if (!drawing) return;
        if (evt.cancelable) evt.preventDefault();
        const pos = getPos(evt);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const endDraw = () => {
        if (!drawing) return;
        drawing = false;
        const dataUrl = canvas.toDataURL('image/png');
        if (roleKey === 'dispatcher') {
            outboundDispatcherSignatureDataUrl = dataUrl;
        } else {
            outboundReceiverSignatureDataUrl = dataUrl;
        }
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', endDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: true });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', endDraw);
}

function clearOutboundSignatureCanvas(roleKey) {
    const canvasId = roleKey === 'dispatcher' ? 'outboundDispatcherSigCanvas' : 'outboundReceiverSigCanvas';
    const canvas = document.getElementById(canvasId);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (roleKey === 'dispatcher') {
        outboundDispatcherSignatureDataUrl = '';
    } else {
        outboundReceiverSignatureDataUrl = '';
    }
}

function renderOutboundCartTable() {
    ensureOutboundWorkOrderEnhancedUI();

    const tbody = document.getElementById('outboundCartTableBody');
    if (!tbody) return;

    updateOutboundCartSummaryBadges();

    if (outboundCartList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:18px; color:var(--text-muted);">ยังไม่มีรายการ ยิงสแกน S/N เพื่อเพิ่มเข้าใบงานจ่ายสินค้าออกจากคลัง</td></tr>`;
        return;
    }

    let html = '';
    outboundCartList.forEach((item, index) => {
        const itemSn = escapeOutboundHTML(item.sn);
        const itemCategory = escapeOutboundHTML(item.category || 'ทั่วไป');
        const itemModel = escapeOutboundHTML(item.model || item.name || '-');
        const itemQty = parseInt(item.qty, 10) || 1;
        const itemUnit = escapeOutboundHTML(item.unit || 'ชิ้น');
        const itemLoc = escapeOutboundHTML(formatOutboundLocationText(item.location || 'DOCK'));

        const locDisplayHtml = isOutboundLocationVisible
            ? `<span class="badge-location mono" style="font-size:0.78rem;">${itemLoc}</span>`
            : `<span style="color:var(--text-muted); font-size:0.75rem; font-style:italic;">[ซ่อนพิกัด]</span>`;

        html += `
            <tr>
                <td style="text-align:center; font-weight:700;">${index + 1}</td>
                <td class="mono font-bold" style="color:var(--primary-text);">${itemCategory}</td>
                <td>
                    <input type="text" class="outbound-wo-input-inline" value="${itemModel}" onchange="updateOutboundCartItemField('${itemSn}', 'model', this.value)" title="แก้ไขชื่อรุ่น / รายการสินค้า" />
                </td>
                <td class="mono font-bold">${itemSn}</td>
                <td style="text-align:center;">
                    <input type="number" min="1" class="outbound-wo-input-inline" style="text-align:center; font-weight:700;" value="${itemQty}" onchange="updateOutboundCartItemField('${itemSn}', 'qty', this.value)" />
                </td>
                <td style="text-align:center;">
                    <input type="text" class="outbound-wo-input-inline" style="text-align:center;" value="${itemUnit}" onchange="updateOutboundCartItemField('${itemSn}', 'unit', this.value)" list="outboundUnitOptionsList" />
                </td>
                <td class="outbound-loc-col">${locDisplayHtml}</td>
                <td style="text-align:center;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeOutboundCartItem('${itemSn}')" style="padding:3px 7px;" title="ลบรายการนี้">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    if (!document.getElementById('outboundUnitOptionsList')) {
        const datalist = document.createElement('datalist');
        datalist.id = 'outboundUnitOptionsList';
        datalist.innerHTML = `
            <option value="ชิ้น"></option>
            <option value="เครื่อง"></option>
            <option value="ตัว"></option>
            <option value="ชุด"></option>
            <option value="ม้วน"></option>
            <option value="กล่อง"></option>
            <option value="เมตร"></option>
        `;
        document.body.appendChild(datalist);
    }

    tbody.innerHTML = html;
}

// 📋 รวบรวมข้อมูลหัวบริษัท โลโก้ เลขที่อ้างอิงใบเบิก/PO ลายเซ็น และรายการในใบงานจ่ายสินค้าปัจจุบัน
function buildCurrentOutboundWorkOrderPayload(customDoNo = null) {
    const profile = loadOutboundCompanyProfile();

    const companyTitle = (document.getElementById('outboundCompanyTitle')?.value || '').trim() ||
                         profile.company_title ||
                         'คลังสินค้าหลัก (Main Warehouse)';
    const companyAddress = (document.getElementById('outboundCompanyAddress')?.value || '').trim() ||
                           profile.company_address || '';
    const companyPhoneTax = (document.getElementById('outboundCompanyPhoneTax')?.value || '').trim() ||
                            profile.company_phone_tax || '';
    const companyLogo = profile.logo_data_url || '';

    const refDocNo = (document.getElementById('outboundRefDocNo')?.value || '').trim();
    const refProject = (document.getElementById('outboundRefProject')?.value || '').trim();

    const customerName = (document.getElementById('outboundCustomerName')?.value || '').trim() ||
                         (document.getElementById('outboundRecipient')?.value || '').trim();
    const customerAddress = (document.getElementById('outboundCustomerAddress')?.value || '').trim();
    const contactPerson = (document.getElementById('outboundContactPerson')?.value || '').trim();
    const salesperson = (document.getElementById('outboundSalesperson')?.value || '').trim();
    const activeUserName = getOutboundOperatorName();
    const dispatcher = (document.getElementById('outboundDispatcher')?.value || '').trim() || activeUserName;
    const receiver = (document.getElementById('outboundReceiver')?.value || '').trim();
    const destinationNotes = (document.getElementById('outboundDestination')?.value || '').trim() ||
                             (document.getElementById('outboundNote')?.value || '').trim();

    const now = new Date();
    const doNo = customDoNo || (
        'DO-' +
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        '-' +
        Math.floor(1000 + Math.random() * 9000)
    );

    const normalizedItems = outboundCartList.map((item, idx) => ({
        no: idx + 1,
        id: item.id || null,
        sn: item.sn,
        category: item.category || 'ทั่วไป',
        name: item.model || item.name || '-',
        model: item.model || item.name || '-',
        qty: parseInt(item.qty, 10) || 1,
        unit: item.unit || 'ชิ้น',
        meter: item.meter || 0,
        location: item.location || 'DOCK'
    }));

    const totalQty = normalizedItems.reduce((sum, i) => sum + (parseInt(i.qty, 10) || 1), 0);

    return {
        do_number: doNo,
        ref_doc_no: refDocNo,
        ref_project: refProject,
        company_title: companyTitle,
        company_address: companyAddress,
        company_phone_tax: companyPhoneTax,
        company_logo: companyLogo,
        customer_name: customerName,
        customer_address: customerAddress,
        contact_person: contactPerson,
        salesperson: salesperson,
        dispatcher: dispatcher,
        receiver: receiver,
        dispatcher_signature: outboundDispatcherSignatureDataUrl || '',
        receiver_signature: outboundReceiverSignatureDataUrl || '',
        destination_notes: destinationNotes,
        show_original_location: isOutboundLocationVisible,
        items: normalizedItems,
        total_items: normalizedItems.length,
        total_qty: totalQty,
        created_at: now.toISOString()
    };
}

// 🟢 ยืนยันตัดจ่ายสินค้าออกจากคลัง (Admin -> ตัดจ่ายทันที 100% / User ทั่วไป -> ส่งคำขออนุมัติ Admin)
async function requestOutboundApproval() {
    if (outboundCartList.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณายิงสแกนเพิ่มสินค้าเข้าใบงานจ่ายสินค้าก่อนทำการยืนยัน', true);
        }
        ensureOutboundSnInputFocus(true);
        return;
    }

    const outboundPayload = buildCurrentOutboundWorkOrderPayload();
    const doNo = outboundPayload.do_number;
    const nowISO = outboundPayload.created_at;
    const activeUserName = getOutboundOperatorName();

    const client = typeof resolveWmsSupabaseClient === 'function'
        ? resolveWmsSupabaseClient()
        : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null));

    const isAdmin = checkOutboundUserIsAdmin();

    // =========================================================================
    // 🔒 กรณี User ทั่วไป: ส่งคำขออนุมัติจ่ายออกเข้าศูนย์อนุมัติ Admin (ยังไม่ตัดสต็อก)
    // =========================================================================
    if (!isAdmin) {
        const itemsToSubmit = outboundPayload.items.slice();
        let allowedItems = itemsToSubmit;
        let skippedPendingCount = 0;

        if (typeof filterOutAlreadyPendingRequestSns === 'function') {
            try {
                const res = await filterOutAlreadyPendingRequestSns(client, itemsToSubmit, 'OUTBOUND');
                allowedItems = res.allowedItems;
                skippedPendingCount = res.skippedPendingCount;
            } catch (filterErr) {}
        }

        if (allowedItems.length === 0) {
            if (typeof showWmsCornerNotification === 'function') {
                showWmsCornerNotification({
                    variant: 'WARN',
                    title: 'รายการนี้อยู่ระหว่างรออนุมัติแล้ว',
                    description: `ทั้ง ${skippedPendingCount.toLocaleString()} S/N ถูกส่งไปยังศูนย์อนุมัติก่อนหน้านี้แล้ว`,
                    durationMs: 3600,
                    playSound: true
                });
            } else if (typeof showToast === 'function') {
                showToast(`⚠️ รายการทั้งหมด (${skippedPendingCount} S/N) อยู่ระหว่างรออนุมัติแล้ว`, true);
            }
            return;
        }

        const refTag = outboundPayload.ref_doc_no ? ` [อ้างอิง PO/ใบเบิก: ${outboundPayload.ref_doc_no}]` : '';
        const reasonSummary = `ใบงานจ่ายสินค้า ${doNo}${refTag}${outboundPayload.customer_name ? ` · ผู้รับ/ปลายทาง: ${outboundPayload.customer_name}` : ''}${outboundPayload.destination_notes ? ` (${outboundPayload.destination_notes})` : ''}`;

        if (typeof showDbLoadingPopup === 'function') {
            showDbLoadingPopup(
                'กำลังส่งคำขออนุมัติจ่ายออก...',
                `กำลังส่งรายการเบิกจ่ายจำนวน ${allowedItems.length.toLocaleString()} S/N ให้ผู้ดูแลระบบ (Admin)`,
                25,
                { iconClass: 'fa-solid fa-paper-plane wms-db-center-icon', lockClose: true }
            );
        }

        try {
            const normalizedRecords = allowedItems.map(item => ({
                request_type: 'OUTBOUND',
                batch_id: doNo,
                sn: item.sn,
                category: item.category || '',
                name: `${item.model || item.name || ''} (${item.qty} ${item.unit})`,
                location: item.location || 'DOCK',
                target_location: outboundPayload.customer_name || 'จ่ายออกนอกคลัง',
                requested_by: outboundPayload.dispatcher,
                reason: reasonSummary,
                created_at: nowISO,
                outbound_order_payload: {
                    ...outboundPayload,
                    items: allowedItems,
                    total_items: allowedItems.length
                }
            }));

            if (typeof submitApprovalRequestsResilient === 'function') {
                await submitApprovalRequestsResilient(
                    client,
                    normalizedRecords,
                    (chunkNum, totalChunks, sentItems, allItems) => {
                        const pct = Math.min(95, Math.round((chunkNum / totalChunks) * 90));
                        if (typeof updateDbLoadingPopup === 'function') {
                            updateDbLoadingPopup(
                                'กำลังส่งคำขออนุมัติจ่ายออก...',
                                `ส่งชุดที่ ${chunkNum}/${totalChunks} เรียบร้อยแล้ว`,
                                pct,
                                `ส่งคำขอแล้ว ${sentItems.toLocaleString()} / ${allItems.toLocaleString()} S/N`
                            );
                        }
                    }
                );
            } else if (client) {
                const { error: insertErr } = await client.from('approval_requests').insert(normalizedRecords.map(r => ({
                    request_type: 'OUTBOUND',
                    batch_id: r.batch_id,
                    sn: r.sn,
                    category: r.category,
                    name: r.name,
                    location: r.location,
                    target_location: r.target_location,
                    requested_by: r.requested_by,
                    reason: r.reason,
                    status: 'PENDING',
                    created_at: r.created_at
                })));
                if (insertErr) throw insertErr;
            }

            if (client) {
                try {
                    await client.from('inventory_logs').insert([{
                        action: 'REQUEST_OUTBOUND',
                        details: `ส่งคำขออนุมัติจ่ายสินค้า ${doNo}${refTag} จำนวน ${allowedItems.length.toLocaleString()} S/N${outboundPayload.customer_name ? ` (${outboundPayload.customer_name})` : ''}`,
                        performed_by: outboundPayload.dispatcher,
                        created_at: nowISO
                    }]);
                } catch (logIgnore) {}
            }

            if (typeof hideDbLoadingPopup === 'function') {
                hideDbLoadingPopup(false);
            }

            if (typeof broadcastNewApprovalRequestEvent === 'function') {
                broadcastNewApprovalRequestEvent({
                    request_type: 'OUTBOUND',
                    batch_id: doNo,
                    count: allowedItems.length,
                    sn: allowedItems[0]?.sn || '',
                    target_location: outboundPayload.customer_name || 'จ่ายออกนอกคลัง',
                    requested_by: outboundPayload.dispatcher,
                    created_at: nowISO
                });
            }

            const descText = skippedPendingCount > 0
                ? `ส่งคำขอจ่ายออก ${allowedItems.length.toLocaleString()} S/N แล้ว (ข้ามรายการที่รออนุมัติอยู่ ${skippedPendingCount.toLocaleString()} รายการ)`
                : `ส่งคำขอจ่ายออก ${allowedItems.length.toLocaleString()} S/N (${doNo}) ไปยังศูนย์อนุมัติของ Admin แล้ว`;

            if (typeof showWmsCornerNotification === 'function') {
                showWmsCornerNotification({
                    variant: 'USER_SUBMIT',
                    title: 'ส่งคำขออนุมัติเรียบร้อย',
                    description: descText,
                    durationMs: 3600,
                    playSound: true
                });
            } else if (typeof showToast === 'function') {
                showToast(`📨 ${descText}`);
            }

            outboundCartList = [];
            renderOutboundCartTable();
        } catch (err) {
            if (typeof hideDbLoadingPopup === 'function') {
                hideDbLoadingPopup(false);
            }
            if (typeof showWmsCornerNotification === 'function') {
                showWmsCornerNotification({
                    variant: 'WARN',
                    title: 'ส่งคำขออนุมัติไม่สำเร็จ',
                    description: err?.message ? `สาเหตุ: ${err.message}` : 'ไม่สามารถบันทึกคำขอได้ กรุณาลองใหม่อีกครั้ง',
                    durationMs: 4200,
                    playSound: true
                });
            } else if (typeof showToast === 'function') {
                showToast(`❌ ส่งคำขออนุมัติไม่สำเร็จ: ${err?.message || 'กรุณาลองใหม่'}`, true);
            }
        }
        return;
    }

    // =========================================================================
    // 👑 กรณีสิทธิ์ Admin: ตัดจ่ายสินค้าออกจากคลังได้ทันที 100% ไม่ต้องผ่านคำขออนุมัติ
    // =========================================================================
    const itemsToDispatch = outboundPayload.items.slice();
    const snVariantsSet = new Set();

    for (const item of itemsToDispatch) {
        const rawSn = String(item.sn || '').trim();
        snVariantsSet.add(rawSn);
        snVariantsSet.add(rawSn.toUpperCase());
        snVariantsSet.add(rawSn.toLowerCase());

        markStockItemDispatchedInMemory(rawSn, {
            id: item.id,
            dispatched_by: outboundPayload.dispatcher || activeUserName,
            dispatched_at: nowISO,
            recipient: outboundPayload.receiver || outboundPayload.customer_name,
            delivery_note_no: doNo
        });

        const dispatchPayload = {
            itemId: item.id || null,
            sn: rawSn,
            category: item.category || 'ทั่วไป',
            name: item.model || item.name || 'สินค้าคลัง',
            model: item.model || item.name || 'สินค้าคลัง',
            qty: item.qty || 1,
            unit: item.unit || 'ชิ้น',
            meter: item.meter || 0,
            location: item.location || 'DOCK',
            recipient: outboundPayload.receiver || outboundPayload.customer_name || '',
            delivery_note_no: doNo,
            ref_doc_no: outboundPayload.ref_doc_no || '',
            status: 'OUT',
            dispatched_by: outboundPayload.dispatcher || activeUserName,
            dispatched_at: nowISO
        };

        const feedItem = {
            ...dispatchPayload,
            time: new Date().toLocaleTimeString('th-TH'),
            isOffline: !navigator.onLine,
            db_status: navigator.onLine ? 'SYNCING' : 'PENDING'
        };

        recentOutboundList.unshift(feedItem);
        enqueuePersistentOutboundDbSync(dispatchPayload, feedItem);
    }

    if (recentOutboundList.length > 120) recentOutboundList.length = 120;
    scheduleSaveRecentOutboundFeedCache();

    // 2. ยิงอัปเดตตัดสต็อกลง Supabase ทันที
    if (client && navigator.onLine) {
        try {
            const snList = Array.from(snVariantsSet);
            let { error: updateErr } = await client
                .from('warehouse_items')
                .update({
                    status: 'OUT',
                    qty: 0,
                    dispatched_at: nowISO,
                    dispatched_by: outboundPayload.dispatcher || activeUserName,
                    delivery_note_no: doNo
                })
                .in('sn', snList);

            if (updateErr) {
                await client
                    .from('warehouse_items')
                    .update({ status: 'OUT', qty: 0 })
                    .in('sn', snList);
            }

            const dispatchedUpperSet = new Set(itemsToDispatch.map(i => String(i.sn).trim().toUpperCase()));
            persistentOutboundDbQueue = persistentOutboundDbQueue.filter(
                q => !dispatchedUpperSet.has(String(q.sn).trim().toUpperCase())
            );
            savePersistentOutboundDbQueue(true);

            recentOutboundList.forEach(f => {
                if (f && dispatchedUpperSet.has(String(f.sn).trim().toUpperCase())) {
                    f.db_status = 'SYNCED';
                    f.isOffline = false;
                }
            });
            saveRecentOutboundFeedToCache();
        } catch (dbErr) {
            console.warn('⚠️ อัปเดต warehouse_items แบบทันทีติดปัญหา ระบบจะรันคิว FIFO ต่อให้อัตโนมัติ:', dbErr);
            if (typeof flushPersistentOutboundSyncQueue === 'function') {
                flushPersistentOutboundSyncQueue();
            }
        }

        // 3. บันทึกใบงานจ่ายสินค้าลงตาราง outbound_orders ใน Supabase DB (ครบทั้งโลโก้และลายเซ็นผู้จ่าย/ผู้รับ)
        try {
            const combinedNotes = [
                outboundPayload.ref_doc_no ? `อ้างอิงใบเบิก/PO: ${outboundPayload.ref_doc_no}` : '',
                outboundPayload.ref_project ? `โครงการ/แผนก: ${outboundPayload.ref_project}` : '',
                outboundPayload.destination_notes || ''
            ].filter(Boolean).join(' | ');

            const fullDbOrderRecord = {
                do_number: outboundPayload.do_number,
                ref_doc_no: outboundPayload.ref_doc_no || null,
                ref_project: outboundPayload.ref_project || null,
                company_title: outboundPayload.company_title,
                company_address: outboundPayload.company_address || null,
                company_phone_tax: outboundPayload.company_phone_tax || null,
                company_logo: outboundPayload.company_logo || null,
                customer_name: outboundPayload.customer_name || null,
                customer_address: outboundPayload.customer_address || null,
                contact_person: outboundPayload.contact_person || null,
                salesperson: outboundPayload.salesperson || null,
                dispatcher: outboundPayload.dispatcher || null,
                receiver: outboundPayload.receiver || null,
                dispatcher_signature: outboundPayload.dispatcher_signature || null,
                receiver_signature: outboundPayload.receiver_signature || null,
                destination_notes: combinedNotes || null,
                show_original_location: Boolean(outboundPayload.show_original_location),
                items: outboundPayload.items,
                total_items: outboundPayload.total_items,
                total_qty: outboundPayload.total_qty,
                created_at: outboundPayload.created_at
            };

            let { error: orderErr } = await client.from('outbound_orders').insert([fullDbOrderRecord]);

            // Fallback กรณีฐานข้อมูลบางตัวมีเฉพาะคอลัมน์พื้นฐาน
            if (orderErr && (String(orderErr.code) === 'PGRST204' || String(orderErr.code) === '42703' || String(orderErr.message || '').includes('column'))) {
                const baseDbOrderRecord = {
                    do_number: outboundPayload.do_number,
                    company_title: outboundPayload.company_title,
                    customer_name: outboundPayload.customer_name,
                    customer_address: outboundPayload.customer_address,
                    contact_person: outboundPayload.contact_person,
                    salesperson: outboundPayload.salesperson,
                    dispatcher: outboundPayload.dispatcher,
                    receiver: outboundPayload.receiver,
                    destination_notes: combinedNotes,
                    show_original_location: Boolean(outboundPayload.show_original_location),
                    items: outboundPayload.items,
                    total_items: outboundPayload.total_items,
                    created_at: outboundPayload.created_at
                };
                await client.from('outbound_orders').insert([baseDbOrderRecord]);
            }
        } catch (e) {
            console.warn('⚠️ บันทึกใบงานลง Supabase outbound_orders ไม่สำเร็จ:', e);
        }
    }

    // 4. บันทึกเข้าประวัติ Local Cache ของใบงานจ่ายสินค้า
    recentOutboundOrdersList.unshift(outboundPayload);
    if (recentOutboundOrdersList.length > 60) recentOutboundOrdersList.length = 60;
    try {
        localStorage.setItem(RECENT_OUTBOUND_ORDERS_KEY, JSON.stringify(recentOutboundOrdersList));
    } catch (e) {}

    // 5. แจ้งเตือนหน้าเช็กสต็อก & หน้างานรับเข้าคลังแบบเรียลไทม์ 0ms
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('wms_realtime_sync_channel');
            itemsToDispatch.forEach(item => {
                channel.postMessage({
                    action: 'DISPATCH',
                    sn: item.sn,
                    id: item.id,
                    location: item.location,
                    item: item,
                    _localOptimistic: true
                });
            });
        }
    } catch (e) {}

    document.dispatchEvent(new CustomEvent('inventoryDispatched', {
        detail: { action: 'DISPATCH_BATCH', do_number: doNo, items: itemsToDispatch, _localOptimistic: true }
    }));
    document.dispatchEvent(new CustomEvent('outboundCompleted', {
        detail: { action: 'OUTBOUND_ORDER_COMPLETED', order: outboundPayload, _localOptimistic: true }
    }));
    document.dispatchEvent(new CustomEvent('inventoryDataChanged', {
        detail: { action: 'DISPATCH_BATCH', do_number: doNo, items: itemsToDispatch, _localOptimistic: true }
    }));

    if (typeof playSuccessSound === 'function') playSuccessSound();
    else playOutboundAudioFeedback('success');

    if (typeof showToast === 'function') {
        showToast(`🎉 Admin ตัดจ่ายสินค้าออกจากคลังและออกใบงานเลขที่ ${doNo} สำเร็จ!`);
    }

    if (typeof logUserActivity === 'function') {
        logUserActivity('OUTBOUND', `ตัดจ่ายสินค้าออกจากคลัง ใบงาน ${doNo} จำนวน ${itemsToDispatch.length} รายการ`, doNo);
    }

    outboundCartList = [];
    clearOutboundSignatureCanvas('dispatcher');
    clearOutboundSignatureCanvas('receiver');
    renderOutboundCartTable();
    updateOutboundNetworkSyncHUD();
    renderLiveOutboundFeed();

    openOutboundWorkOrderModal(outboundPayload);
}

// 📄 เปิดหน้าต่างดูตัวอย่างใบงานจ่ายสินค้าปัจจุบัน (ก่อนกดยืนยันตัดจ่าย)
function openOutboundWorkOrderPreviewModal() {
    if (outboundCartList.length === 0) {
        if (typeof showToast === 'function') {
            showToast('⚠️ กรุณายิงสแกนเพิ่มรายการสินค้าอย่างน้อย 1 รายการก่อนดูใบงาน', true);
        }
        return;
    }
    const previewOrder = buildCurrentOutboundWorkOrderPayload('DO-PREVIEW');
    openOutboundWorkOrderModal(previewOrder, true);
}

// 📄 เปิด Modal แสดงใบงานจ่ายสินค้าออกจากคลังพร้อมโลโก้ หัวบริษัท เลขที่อ้างอิง PO ชื่อรุ่น จำนวน หน่วยนับ และช่องลายเซ็น
function openOutboundWorkOrderModal(orderData, isPreview = false) {
    if (!orderData) return;

    const existingModal = document.getElementById('outboundWorkOrderModalBackdrop');
    if (existingModal) existingModal.remove();

    const savedProfile = loadOutboundCompanyProfile();
    const companyTitle = orderData.company_title || savedProfile.company_title || 'คลังสินค้าหลัก (Main Warehouse)';
    const companyAddress = orderData.company_address || savedProfile.company_address || '';
    const companyPhoneTax = orderData.company_phone_tax || savedProfile.company_phone_tax || '';
    const companyLogo = orderData.company_logo || savedProfile.logo_data_url || '';

    const showLoc = Boolean(orderData.show_original_location);
    const items = Array.isArray(orderData.items) ? orderData.items : [];
    const totalQty = items.reduce((sum, i) => sum + (parseInt(i.qty, 10) || 1), 0);
    const dateFormatted = orderData.created_at
        ? new Date(orderData.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
        : new Date().toLocaleString('th-TH');

    const rowsHtml = items.map((item, idx) => {
        const modelName = escapeOutboundHTML(item.model || item.name || '-');
        const sn = escapeOutboundHTML(item.sn || '-');
        const cat = escapeOutboundHTML(item.category || '-');
        const qty = parseInt(item.qty, 10) || 1;
        const unit = escapeOutboundHTML(item.unit || 'ชิ้น');
        const loc = escapeOutboundHTML(formatOutboundLocationText(item.location || '-'));

        return `
            <tr>
                <td style="border:1px solid #cbd5e1; padding:7px 8px; text-align:center;">${idx + 1}</td>
                <td style="border:1px solid #cbd5e1; padding:7px 8px;">${cat}</td>
                <td style="border:1px solid #cbd5e1; padding:7px 8px; font-weight:600;">${modelName}</td>
                <td style="border:1px solid #cbd5e1; padding:7px 8px; font-family:monospace; font-weight:700;">${sn}</td>
                <td style="border:1px solid #cbd5e1; padding:7px 8px; text-align:center; font-weight:700;">${qty.toLocaleString()}</td>
                <td style="border:1px solid #cbd5e1; padding:7px 8px; text-align:center;">${unit}</td>
                ${showLoc ? `<td style="border:1px solid #cbd5e1; padding:7px 8px; text-align:center; font-family:monospace;">${loc}</td>` : ''}
            </tr>
        `;
    }).join('');

    const dispatcherSigImg = orderData.dispatcher_signature
        ? `<img src="${orderData.dispatcher_signature}" alt="ลายเซ็นผู้จ่าย" style="max-height:54px; margin:0 auto; display:block;" />`
        : `<div style="height:46px;"></div>`;

    const receiverSigImg = orderData.receiver_signature
        ? `<img src="${orderData.receiver_signature}" alt="ลายเซ็นผู้รับ" style="max-height:54px; margin:0 auto; display:block;" />`
        : `<div style="height:46px;"></div>`;

    const logoBlockHtml = companyLogo
        ? `<div style="flex-shrink:0; display:flex; align-items:center; justify-content:center; padding:4px; border:1px solid #e2e8f0; border-radius:8px; background:#ffffff;">
               <img src="${companyLogo}" alt="โลโก้บริษัท" style="max-width:150px; max-height:66px; object-fit:contain; display:block;" />
           </div>`
        : '';

    const sheetHtml = `
        <div id="printableOutboundWorkOrderArea" style="font-family:'Sarabun', sans-serif; color:#0f172a; line-height:1.45;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:12px; margin-bottom:14px; gap:14px; flex-wrap:wrap;">
                <div style="display:flex; align-items:flex-start; gap:12px; flex:1; min-width:260px;">
                    ${logoBlockHtml}
                    <div>
                        <div style="font-size:1.15rem; font-weight:800; color:#0f172a;">${escapeOutboundHTML(companyTitle)}</div>
                        ${companyAddress ? `<div style="font-size:0.8rem; color:#334155; margin-top:2px;">${escapeOutboundHTML(companyAddress)}</div>` : ''}
                        ${companyPhoneTax ? `<div style="font-size:0.78rem; color:#475569; margin-top:1px;">${escapeOutboundHTML(companyPhoneTax)}</div>` : ''}
                        <div style="font-size:1.22rem; font-weight:900; color:#1e3a8a; margin-top:6px;">ใบงานจ่ายสินค้าออกจากคลัง (OUTBOUND WORK ORDER)</div>
                    </div>
                </div>

                <div style="text-align:right; background:#f8fafc; border:1px solid #cbd5e1; padding:9px 14px; border-radius:8px; min-width:215px;">
                    <div style="font-size:0.78rem; color:#475569;">เลขที่ใบงานจ่ายสินค้า (DO No.)</div>
                    <div style="font-family:monospace; font-size:1.05rem; font-weight:800; color:#0f172a;">${escapeOutboundHTML(orderData.do_number)}</div>
                    <div style="margin-top:5px; padding-top:5px; border-top:1px dashed #cbd5e1;">
                        <div style="font-size:0.76rem; color:#475569;">เลขที่อ้างอิงใบเบิก / PO:</div>
                        <div style="font-family:monospace; font-size:0.92rem; font-weight:800; color:#b45309;">${escapeOutboundHTML(orderData.ref_doc_no || '-')}</div>
                    </div>
                    <div style="font-size:0.77rem; color:#475569; margin-top:4px;">วันที่/เวลา: ${escapeOutboundHTML(dateFormatted)}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(255px, 1fr)); gap:9px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:14px; font-size:0.85rem;">
                <div><strong>หน่วยงาน / ลูกค้าปลายทาง:</strong> ${escapeOutboundHTML(orderData.customer_name || '-')}</div>
                <div><strong>แผนก / โครงการ / หน้างาน:</strong> ${escapeOutboundHTML(orderData.ref_project || '-')}</div>
                <div><strong>ผู้ติดต่อ / เบอร์โทรผู้รับ:</strong> ${escapeOutboundHTML(orderData.contact_person || '-')}</div>
                <div><strong>ผู้ขอเบิก / พนักงานขาย:</strong> ${escapeOutboundHTML(orderData.salesperson || '-')}</div>
                <div style="grid-column:1 / -1;"><strong>ที่อยู่ / สถานที่ส่งมอบ:</strong> ${escapeOutboundHTML(orderData.customer_address || '-')}</div>
                <div style="grid-column:1 / -1;"><strong>หมายเหตุ / รายละเอียดเพิ่มเติม:</strong> ${escapeOutboundHTML(orderData.destination_notes || '-')}</div>
            </div>

            <table style="width:100%; border-collapse:collapse; font-size:0.84rem; margin-bottom:14px;">
                <thead>
                    <tr style="background:#e2e8f0; color:#0f172a;">
                        <th style="border:1px solid #94a3b8; padding:8px; width:48px; text-align:center;">ลำดับ</th>
                        <th style="border:1px solid #94a3b8; padding:8px; width:115px;">หมวดหมู่</th>
                        <th style="border:1px solid #94a3b8; padding:8px;">ชื่อรุ่น / รายการสินค้า</th>
                        <th style="border:1px solid #94a3b8; padding:8px; width:165px;">Serial Number (S/N)</th>
                        <th style="border:1px solid #94a3b8; padding:8px; width:75px; text-align:center;">จำนวน</th>
                        <th style="border:1px solid #94a3b8; padding:8px; width:85px; text-align:center;">หน่วยนับ</th>
                        ${showLoc ? `<th style="border:1px solid #94a3b8; padding:8px; width:95px; text-align:center;">พิกัดเดิม</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr style="background:#f1f5f9; font-weight:800;">
                        <td colspan="4" style="border:1px solid #94a3b8; padding:8px; text-align:right;">รวมรายการทั้งหมด ${items.length.toLocaleString()} รายการ · จำนวนสุทธิ:</td>
                        <td style="border:1px solid #94a3b8; padding:8px; text-align:center; font-size:0.95rem;">${totalQty.toLocaleString()}</td>
                        <td style="border:1px solid #94a3b8; padding:8px; text-align:center;">หน่วย</td>
                        ${showLoc ? `<td style="border:1px solid #94a3b8; padding:8px;"></td>` : ''}
                    </tr>
                </tfoot>
            </table>

            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; margin-top:24px; text-align:center; font-size:0.84rem;">
                <div style="border:1px solid #cbd5e1; border-radius:10px; padding:12px;">
                    <div style="font-weight:800; margin-bottom:4px;">ผู้จ่ายสินค้า (Dispatcher)</div>
                    ${dispatcherSigImg}
                    <div style="border-bottom:1px dotted #475569; margin:4px 16px;"></div>
                    <div style="margin-top:6px;">( ${escapeOutboundHTML(orderData.dispatcher || '........................................')} )</div>
                    <div style="font-size:0.76rem; color:#64748b; margin-top:3px;">เจ้าหน้าที่คลังสินค้า</div>
                    <div style="font-size:0.76rem; color:#64748b;">วันที่: ${escapeOutboundHTML(new Date(orderData.created_at || Date.now()).toLocaleDateString('th-TH'))}</div>
                </div>

                <div style="border:1px solid #cbd5e1; border-radius:10px; padding:12px;">
                    <div style="font-weight:800; margin-bottom:4px;">ผู้ตรวจสอบ / ผู้อนุมัติ</div>
                    <div style="height:46px;"></div>
                    <div style="border-bottom:1px dotted #475569; margin:4px 16px;"></div>
                    <div style="margin-top:6px;">( ........................................ )</div>
                    <div style="font-size:0.76rem; color:#64748b; margin-top:3px;">หัวหน้าคลัง / ผู้มีอำนาจอนุมัติ</div>
                    <div style="font-size:0.76rem; color:#64748b;">วันที่: ____/____/______</div>
                </div>

                <div style="border:1px solid #cbd5e1; border-radius:10px; padding:12px;">
                    <div style="font-weight:800; margin-bottom:4px;">ผู้รับสินค้า (Receiver)</div>
                    ${receiverSigImg}
                    <div style="border-bottom:1px dotted #475569; margin:4px 16px;"></div>
                    <div style="margin-top:6px;">( ${escapeOutboundHTML(orderData.receiver || '........................................')} )</div>
                    <div style="font-size:0.76rem; color:#64748b; margin-top:3px;">ผู้รับมอบสินค้าครบถ้วนถูกต้อง</div>
                    <div style="font-size:0.76rem; color:#64748b;">วันที่: ${escapeOutboundHTML(new Date(orderData.created_at || Date.now()).toLocaleDateString('th-TH'))}</div>
                </div>
            </div>
        </div>
    `;

    const backdrop = document.createElement('div');
    backdrop.id = 'outboundWorkOrderModalBackdrop';
    backdrop.className = 'outbound-modal-backdrop';
    backdrop.innerHTML = `
        <div class="outbound-modal-sheet">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #e2e8f0; flex-wrap:wrap;">
                <span style="font-weight:800; font-size:0.95rem; color:#1e3a8a;">
                    <i class="fa-solid fa-file-invoice"></i> ${isPreview ? 'ตัวอย่างใบงานจ่ายสินค้าออกจากคลัง (ยังไม่ตัดสต็อก)' : 'ใบงานจ่ายสินค้าออกจากคลังฉบับสมบูรณ์'}
                </span>
                <div style="display:flex; gap:8px;">
                    <button type="button" onclick="printOutboundWorkOrderSheet()" style="background:#2563eb; color:#ffffff; border:none; padding:8px 16px; border-radius:8px; font-weight:700; cursor:pointer;">
                        <i class="fa-solid fa-print"></i> พิมพ์ใบงาน / บันทึก PDF
                    </button>
                    <button type="button" onclick="closeOutboundWorkOrderModal()" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:8px 14px; border-radius:8px; font-weight:700; cursor:pointer;">
                        ปิดหน้าต่าง
                    </button>
                </div>
            </div>
            ${sheetHtml}
        </div>
    `;

    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeOutboundWorkOrderModal();
    });

    document.body.appendChild(backdrop);
}

function closeOutboundWorkOrderModal() {
    const modal = document.getElementById('outboundWorkOrderModalBackdrop');
    if (modal) modal.remove();
    ensureOutboundSnInputFocus(true);
}

function printOutboundWorkOrderSheet() {
    const printArea = document.getElementById('printableOutboundWorkOrderArea');
    if (!printArea) return;

    const printWin = window.open('', '_blank', 'width=960,height=800');
    if (!printWin) {
        window.print();
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="UTF-8" />
            <title>ใบงานจ่ายสินค้าออกจากคลัง</title>
            <style>
                @page { size: A4 portrait; margin: 14mm; }
                body { font-family: 'Sarabun', 'Tahoma', sans-serif; margin: 0; padding: 0; color: #0f172a; }
            </style>
        </head>
        <body>
            ${printArea.innerHTML}
            <script>
                window.onload = function() {
                    window.focus();
                    window.print();
                };
            <\/script>
        </body>
        </html>
    `);
    printWin.document.close();
}

function openSavedOutboundOrderByIndex(idx) {
    const order = recentOutboundOrdersList[idx];
    if (order) {
        openOutboundWorkOrderModal(order, false);
    }
}

async function loadRecentOutboundFeedFromDB() {
    const client = typeof resolveWmsSupabaseClient === 'function'
        ? resolveWmsSupabaseClient()
        : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null));

    let localCacheMap = new Map();
    try {
        const savedLocal = localStorage.getItem(RECENT_OUTBOUND_ORDERS_KEY);
        if (savedLocal) {
            const parsed = JSON.parse(savedLocal);
            if (Array.isArray(parsed)) {
                recentOutboundOrdersList = parsed;
                parsed.forEach(item => {
                    if (item && item.do_number) {
                        localCacheMap.set(item.do_number, item);
                    }
                });
            }
        }
    } catch (e) {}

    if (client && navigator.onLine) {
        try {
            const { data, error } = await client
                .from('outbound_orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && Array.isArray(data) && data.length > 0) {
                const dbDoSet = new Set();
                const mergedFromDb = data.map(row => {
                    if (row.do_number) dbDoSet.add(row.do_number);
                    const cached = row.do_number ? localCacheMap.get(row.do_number) : null;
                    return {
                        ...cached,
                        ...row,
                        company_logo: row.company_logo || (cached && cached.company_logo) || '',
                        dispatcher_signature: row.dispatcher_signature || (cached && cached.dispatcher_signature) || '',
                        receiver_signature: row.receiver_signature || (cached && cached.receiver_signature) || ''
                    };
                });

                // รักษารายการที่สร้างในเครื่องนี้แต่ยังไม่ถูกซิงค์ขึ้น DB (หากมี)
                const localOnlyOrders = recentOutboundOrdersList.filter(o => o && o.do_number && !dbDoSet.has(o.do_number));
                recentOutboundOrdersList = [...localOnlyOrders, ...mergedFromDb].slice(0, 60);
                localStorage.setItem(RECENT_OUTBOUND_ORDERS_KEY, JSON.stringify(recentOutboundOrdersList));
            }
        } catch (e) {}
    }

    renderLiveOutboundFeed();
}

function initOutboundOrderRealtimeListener() {
    const client = typeof resolveWmsSupabaseClient === 'function'
        ? resolveWmsSupabaseClient()
        : (typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof _supabase !== 'undefined' ? _supabase : null));
    if (!client) return;

    try {
        client
            .channel('public_outbound_orders_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'outbound_orders' }, (payload) => {
                if (payload.new) {
                    const exists = recentOutboundOrdersList.some(o => o.do_number === payload.new.do_number);
                    if (!exists) {
                        recentOutboundOrdersList.unshift(payload.new);
                        try {
                            localStorage.setItem(RECENT_OUTBOUND_ORDERS_KEY, JSON.stringify(recentOutboundOrdersList.slice(0, 60)));
                        } catch (e) {}
                        renderLiveOutboundFeed();
                    }
                }
            })
            .subscribe();
    } catch (e) {}
}

const confirmOutboundDispatch = requestOutboundApproval;
const submitOutboundDispatch = requestOutboundApproval;
const submitOutboundOrder = requestOutboundApproval;

if (typeof window !== 'undefined') {
    window.loadOutboundCompanyProfile = loadOutboundCompanyProfile;
    window.saveOutboundCompanyProfile = saveOutboundCompanyProfile;
    window.handleOutboundLogoUpload = handleOutboundLogoUpload;
    window.removeOutboundCompanyLogo = removeOutboundCompanyLogo;
    window.handleAddOutboundToCart = handleAddOutboundToCart;
    window.updateOutboundCartItemField = updateOutboundCartItemField;
    window.removeOutboundCartItem = removeOutboundCartItem;
    window.renderOutboundCartTable = renderOutboundCartTable;
    window.requestOutboundApproval = requestOutboundApproval;
    window.confirmOutboundDispatch = confirmOutboundDispatch;
    window.submitOutboundDispatch = submitOutboundDispatch;
    window.submitOutboundOrder = submitOutboundOrder;
    window.loadRecentOutboundFeedFromDB = loadRecentOutboundFeedFromDB;
    window.toggleOutboundLocationVisibility = toggleOutboundLocationVisibility;
    window.toggleOutboundDirectFastScanMode = toggleOutboundDirectFastScanMode;
    window.openOutboundWorkOrderPreviewModal = openOutboundWorkOrderPreviewModal;
    window.openOutboundWorkOrderModal = openOutboundWorkOrderModal;
    window.closeOutboundWorkOrderModal = closeOutboundWorkOrderModal;
    window.printOutboundWorkOrderSheet = printOutboundWorkOrderSheet;
    window.openSavedOutboundOrderByIndex = openSavedOutboundOrderByIndex;
    window.clearOutboundSignatureCanvas = clearOutboundSignatureCanvas;
    window.isOutboundLocationVisible = isOutboundLocationVisible;
}