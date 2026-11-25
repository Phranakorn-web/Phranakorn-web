// =========================================================================
// --- MODULE 3.4: ENTERPRISE CAMERA BARCODE & QR SCANNER ENGINE ---
// --- Continuous Scanning for Tax Invoice, PO Number & Serial Number (S/N) ---
// =========================================================================

const CAMERA_SAME_CODE_COOLDOWN_MS = 1600;
let cameraDetectRafId = null;
let nativeBarcodeDetectorInstance = null;
let cameraVideoTrackRef = null;

function ensureCameraScannerModal() {
    let modal = document.getElementById('wmsCameraScannerModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'wmsCameraScannerModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeCameraScanner();
    });

    modal.innerHTML = `
        <div class="card" style="width:520px; max-width:95vw; padding:1.2rem; display:flex; flex-direction:column; gap:10px;">
            <div class="card-header" style="margin-bottom:0;">
                <div class="card-title"><i class="fa-solid fa-camera" style="color:var(--primary);"></i> กล้องสแกนบาร์โค้ด & QR อัจฉริยะ</div>
                <button type="button" class="btn btn-sm btn-secondary" onclick="closeCameraScanner()">&times;</button>
            </div>

            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; background:var(--bg-subtle); padding:5px; border-radius:10px;">
                <button type="button" id="camTargetBtnTax" class="btn btn-sm btn-secondary" onclick="setCameraScanTargetField('tax_invoice')">
                    <i class="fa-solid fa-receipt"></i> 1. ใบกำกับฯ
                </button>
                <button type="button" id="camTargetBtnPo" class="btn btn-sm btn-secondary" onclick="setCameraScanTargetField('po_number')">
                    <i class="fa-solid fa-file-contract"></i> 2. เลข PO
                </button>
                <button type="button" id="camTargetBtnSn" class="btn btn-sm btn-primary" onclick="setCameraScanTargetField(null)">
                    <i class="fa-solid fa-barcode"></i> 3. สแกน S/N
                </button>
            </div>

            <div style="position:relative; width:100%; aspect-ratio:4/3; max-height:310px; background:#090d16; border-radius:12px; overflow:hidden; border:2px solid var(--border-strong);">
                <video id="wmsCameraVideoElement" style="width:100%; height:100%; object-fit:cover; display:block;" playsinline muted autoplay></video>
                <div id="wmsHtml5QrReaderBox" style="width:100%; height:100%; display:none;"></div>
                <div id="wmsCameraInitMessage" style="position:absolute; inset:0; background:rgba(9,13,22,0.88); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:16px; text-align:center; font-size:0.84rem;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem; color:#38bdf8;"></i>
                    <div>กำลังเปิดกล้องและเตรียมตรวจจับบาร์โค้ด...</div>
                </div>
            </div>

            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button type="button" id="btnCamToggleTorch" class="btn btn-sm btn-secondary" style="flex:1;" onclick="toggleCameraTorch()">
                    <i class="fa-solid fa-bolt"></i> ไฟฉาย: ปิด
                </button>
                <button type="button" class="btn btn-sm btn-secondary" style="flex:1;" onclick="switchCameraFacingMode()">
                    <i class="fa-solid fa-camera-rotate"></i> สลับกล้อง
                </button>
                <button type="button" id="btnCamToggleContinuous" class="btn btn-sm btn-success" style="flex:1;" onclick="toggleContinuousCameraScanMode()">
                    <i class="fa-solid fa-infinity"></i> สแกนต่อเนื่อง: เปิด
                </button>
            </div>

            <div style="background:var(--bg-subtle); border:1px solid var(--border-color); border-radius:10px; padding:8px 12px; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <span id="wmsCamStatusText" style="font-weight:700;">เล็งบาร์โค้ดให้อยู่ในกรอบกล้อง</span>
                <span id="wmsCamSessionCountBadge" class="badge-location mono">สแกนแล้ว 0</span>
            </div>

            <button type="button" class="btn btn-primary" style="width:100%;" onclick="closeCameraScanner()">
                <i class="fa-solid fa-check"></i> เสร็จสิ้น / ปิดกล้อง
            </button>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

function setCameraScanTargetField(fieldType) {
    activeDocTargetScanField = (fieldType === 'tax_invoice' || fieldType === 'po_number') ? fieldType : null;
    const btnTax = document.getElementById('camTargetBtnTax');
    const btnPo = document.getElementById('camTargetBtnPo');
    const btnSn = document.getElementById('camTargetBtnSn');
    if (btnTax && btnPo && btnSn) {
        btnTax.className = `btn btn-sm ${activeDocTargetScanField === 'tax_invoice' ? 'btn-primary' : 'btn-secondary'}`;
        btnPo.className = `btn btn-sm ${activeDocTargetScanField === 'po_number' ? 'btn-primary' : 'btn-secondary'}`;
        btnSn.className = `btn btn-sm ${!activeDocTargetScanField ? 'btn-success' : 'btn-secondary'}`;
    }
}

async function openCameraScanner(targetFieldOverride = undefined) {
    if (targetFieldOverride !== undefined) {
        activeDocTargetScanField = (targetFieldOverride === 'tax_invoice' || targetFieldOverride === 'po_number')
            ? targetFieldOverride
            : null;
    }

    if (typeof getSharedWmsAudioContext === 'function') getSharedWmsAudioContext();

    const modal = ensureCameraScannerModal();
    modal.style.display = 'flex';
    cameraSessionScanCount = 0;
    lastCameraScannedCode = '';
    lastCameraScannedTime = 0;
    setCameraScanTargetField(activeDocTargetScanField);

    await startCameraScannerStream();
}

async function closeCameraScanner() {
    isCameraScannerActive = false;
    isTorchOn = false;
    activeDocTargetScanField = null;

    if (cameraDetectRafId) {
        cancelAnimationFrame(cameraDetectRafId);
        cameraDetectRafId = null;
    }
    if (html5QrCodeScanner) {
        try { await html5QrCodeScanner.stop(); await html5QrCodeScanner.clear(); } catch (e) {}
        html5QrCodeScanner = null;
    }
    if (activeCameraStream) {
        try { activeCameraStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        activeCameraStream = null;
    }
    cameraVideoTrackRef = null;

    const modal = document.getElementById('wmsCameraScannerModal');
    if (modal) modal.style.display = 'none';
    if (typeof ensureSnInputFocus === 'function') setTimeout(() => ensureSnInputFocus(true), 80);
}

async function startCameraScannerStream() {
    if (cameraDetectRafId) { cancelAnimationFrame(cameraDetectRafId); cameraDetectRafId = null; }
    if (html5QrCodeScanner) { try { await html5QrCodeScanner.stop(); await html5QrCodeScanner.clear(); } catch (e) {} html5QrCodeScanner = null; }
    if (activeCameraStream) { try { activeCameraStream.getTracks().forEach(t => t.stop()); } catch (e) {} activeCameraStream = null; }

    const initMsgEl = document.getElementById('wmsCameraInitMessage');
    const videoEl = document.getElementById('wmsCameraVideoElement');
    const html5Box = document.getElementById('wmsHtml5QrReaderBox');

    if (initMsgEl) initMsgEl.style.display = 'flex';

    const hasNative = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    if (hasNative && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            if (!nativeBarcodeDetectorInstance) {
                nativeBarcodeDetectorInstance = new window.BarcodeDetector({
                    formats: ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'data_matrix']
                });
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: currentCameraFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            activeCameraStream = stream;
            isCameraScannerActive = true;
            cameraVideoTrackRef = stream.getVideoTracks()[0] || null;

            if (html5Box) html5Box.style.display = 'none';
            if (videoEl) {
                videoEl.style.display = 'block';
                videoEl.srcObject = stream;
                await videoEl.play();
            }
            if (initMsgEl) initMsgEl.style.display = 'none';

            const loop = async () => {
                if (!isCameraScannerActive) return;
                if (videoEl && videoEl.readyState >= videoEl.HAVE_ENOUGH_DATA) {
                    try {
                        const codes = await nativeBarcodeDetectorInstance.detect(videoEl);
                        if (codes && codes.length > 0 && codes[0].rawValue) {
                            handleDecodedCameraBarcode(codes[0].rawValue);
                        }
                    } catch (e) {}
                }
                if (isCameraScannerActive) cameraDetectRafId = requestAnimationFrame(loop);
            };
            cameraDetectRafId = requestAnimationFrame(loop);
            return;
        } catch (err) {}
    }

    if (typeof window !== 'undefined' && typeof window.Html5Qrcode === 'function' && html5Box) {
        try {
            if (videoEl) videoEl.style.display = 'none';
            html5Box.style.display = 'block';
            html5QrCodeScanner = new window.Html5Qrcode('wmsHtml5QrReaderBox');
            isCameraScannerActive = true;
            await html5QrCodeScanner.start(
                { facingMode: currentCameraFacingMode },
                { fps: 18, qrbox: { width: 250, height: 140 } },
                (text) => handleDecodedCameraBarcode(text),
                () => {}
            );
            if (initMsgEl) initMsgEl.style.display = 'none';
            return;
        } catch (err) {}
    }

    if (initMsgEl) {
        initMsgEl.innerHTML = `<i class="fa-solid fa-video-slash" style="font-size:1.6rem; color:#f87171;"></i><div>ไม่พบกล้องหรือเบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้กล้อง</div>`;
    }
}

function handleDecodedCameraBarcode(rawCode) {
    const clean = String(rawCode || '').replace(/[\r\n\t]+/g, '').trim();
    if (!clean) return;

    const now = Date.now();
    if (clean.toUpperCase() === lastCameraScannedCode && (now - lastCameraScannedTime) < CAMERA_SAME_CODE_COOLDOWN_MS) {
        return;
    }
    lastCameraScannedCode = clean.toUpperCase();
    lastCameraScannedTime = now;

    const prevTarget = activeDocTargetScanField;
    const ok = typeof enqueueScanInput === 'function' ? enqueueScanInput(clean, { singleTokenOnly: true }) : false;

    if (ok) {
        cameraSessionScanCount++;
        setCameraScanTargetField(activeDocTargetScanField);
        const countBadge = document.getElementById('wmsCamSessionCountBadge');
        if (countBadge) countBadge.textContent = `สแกนแล้ว ${cameraSessionScanCount}`;
        const statusEl = document.getElementById('wmsCamStatusText');
        if (statusEl) statusEl.textContent = `✅ รับค่า: ${clean}`;

        if (!isContinuousCameraScanMode && prevTarget === null) {
            setTimeout(() => closeCameraScanner(), 300);
        }
    }
}

async function toggleCameraTorch() {
    if (!cameraVideoTrackRef || typeof cameraVideoTrackRef.applyConstraints !== 'function') {
        showToast('⚠️ กล้องนี้ไม่รองรับการเปิดไฟฉาย', true, 1800);
        return;
    }
    try {
        isTorchOn = !isTorchOn;
        await cameraVideoTrackRef.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        const btn = document.getElementById('btnCamToggleTorch');
        if (btn) btn.innerHTML = `<i class="fa-solid fa-bolt"></i> ไฟฉาย: ${isTorchOn ? 'เปิด' : 'ปิด'}`;
    } catch (e) {
        isTorchOn = false;
    }
}

async function switchCameraFacingMode() {
    isTorchOn = false;
    currentCameraFacingMode = currentCameraFacingMode === 'environment' ? 'user' : 'environment';
    await startCameraScannerStream();
}

function toggleContinuousCameraScanMode() {
    isContinuousCameraScanMode = !isContinuousCameraScanMode;
    const btn = document.getElementById('btnCamToggleContinuous');
    if (btn) {
        btn.className = `btn btn-sm ${isContinuousCameraScanMode ? 'btn-success' : 'btn-secondary'}`;
        btn.innerHTML = `<i class="fa-solid fa-infinity"></i> ${isContinuousCameraScanMode ? 'สแกนต่อเนื่อง: เปิด' : 'สแกนทีละครั้ง'}`;
    }
}