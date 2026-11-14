// =========================================================================
// --- MODULE 3.4: MOBILE CAMERA BARCODE / QR SCANNER ENGINE ---
// --- Android & iOS High-Speed Continuous Scan, Torch & Camera Switch ---
// =========================================================================

// 🟢 📹 ระบบกล้องสแกน SN ผ่านโทรศัพท์มือถือ (Android & iOS) และอุปกรณ์ทุกชนิด (เปิดทันที + ยิงต่อเนื่อง 100%)
function initMobileCameraScannerModal() {
    let modal = document.getElementById('cameraScannerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cameraScannerModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="card camera-scanner-card" style="max-width: 500px; width: 95%; max-height: 92dvh; text-align: center; padding: 16px; border-radius: 22px; background: var(--bg-surface, #ffffff); border: 1px solid var(--border-color, #e2e8f0); box-shadow: 0 24px 50px -10px rgba(0,0,0,0.35); overflow-y: auto; backdrop-filter: blur(12px);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px;">
                    <h3 style="font-size: 1.02rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 7px; margin: 0;">
                        <i class="fa-solid fa-camera" style="color: var(--primary, #0284c7);"></i> สแกนบาร์โค้ด / QR
                    </h3>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button type="button" onclick="toggleCameraScanMode()" id="btnCameraContinuousMode" title="สลับโหมดยิงต่อเนื่อง" style="background: #dcfce7; border: 1px solid #86efac; border-radius: 99px; padding: 5px 10px; color: #15803d; cursor: pointer; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; gap: 4px; min-height: 34px;">
                            <i class="fa-solid fa-repeat"></i> <span id="cameraModeText">ยิงต่อเนื่อง</span>
                        </button>
                        <button type="button" onclick="toggleCameraTorch()" title="เปิด/ปิด ไฟฉาย" id="btnCameraTorchToggle" style="background: var(--bg-subtle, #f1f5f9); border: 1px solid var(--border-strong, #cbd5e1); border-radius: 50%; width: 36px; height: 36px; color: var(--text-main, #0f172a); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.92rem;">
                            <i class="fa-solid fa-bolt"></i>
                        </button>
                        <button type="button" onclick="switchCameraFacingMode()" title="สลับกล้องหน้า/หลัง" style="background: var(--primary-light, #e0f2fe); border: 1px solid var(--primary-border, #bae6fd); border-radius: 50%; width: 36px; height: 36px; color: var(--primary-text, #0284c7); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.92rem;">
                            <i class="fa-solid fa-camera-rotate"></i>
                        </button>
                        <button type="button" onclick="closeCameraScanner()" style="background: #f1f5f9; border: none; border-radius: 50%; width: 36px; height: 36px; font-size: 1.35rem; color: var(--text-muted, #64748b); cursor: pointer; line-height: 1; display: flex; align-items: center; justify-content: center;">&times;</button>
                    </div>
                </div>

                <div id="cameraViewfinderBox" style="position: relative; width: 100%; height: clamp(230px, 44dvh, 330px); background: #090d16; border-radius: 16px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(56, 189, 248, 0.35);">
                    <div id="html5QrCodeReader" style="width: 100%; height: 100%;"></div>
                    <video id="cameraScannerVideo" autoplay playsinline webkit-playsinline muted style="width: 100%; height: 100%; object-fit: cover; display: none;"></video>

                    <div id="cameraScannerFlashOverlay" style="position:absolute; inset:0; background:rgba(16,185,129,0.35); opacity:0; pointer-events:none; transition:opacity 0.18s ease;"></div>

                    <div class="camera-scanner-frame" style="pointer-events:none;">
                        <div class="camera-scanner-laser"></div>
                    </div>

                    <div id="cameraLiveLastScanHud" style="display:none; position:absolute; top:10px; left:10px; right:10px; background:rgba(6, 78, 59, 0.92); color:#ecfdf5; padding:7px 12px; border-radius:12px; font-size:0.78rem; font-weight:700; backdrop-filter:blur(8px); border:1px solid #34d399; justify-content:space-between; align-items:center; gap:8px; z-index:10;">
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><i class="fa-solid fa-circle-check" style="color:#34d399;"></i> ล่าสุด: <span id="cameraLastScanCodeText" class="mono">-</span></span>
                        <span id="cameraSessionBadge" style="background:#10b981; color:#022c22; padding:2px 8px; border-radius:99px; font-size:0.72rem; flex-shrink:0;">0 ชิ้น</span>
                    </div>

                    <div style="position: absolute; bottom: 10px; background: rgba(15, 23, 42, 0.86); color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 0.74rem; backdrop-filter: blur(10px); pointer-events: none; border: 1px solid rgba(255,255,255,0.16); display: flex; align-items: center; gap: 6px; max-width: 92%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 4px 12px rgba(0,0,0,0.28); z-index:10;">
                        <i class="fa-solid fa-expand" style="color: #38bdf8;"></i> <span id="cameraScannerStatusText">เล็งบาร์โค้ด / QR ได้ทุกประเภท อ่านอัตโนมัติทันที</span>
                    </div>
                </div>

                <div class="camera-controls-grid" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; width: 100%;">
                    <button type="button" class="btn btn-secondary" style="flex: 1 1 calc(33.333% - 6px); min-width: 95px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 700;" onclick="closeCameraScanner()">
                        <i class="fa-solid fa-xmark"></i> ปิดกล้อง
                    </button>
                    <button type="button" class="btn btn-secondary" style="flex: 1 1 calc(33.333% - 6px); min-width: 105px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 700;" onclick="switchCameraFacingMode()">
                        <i class="fa-solid fa-camera-rotate"></i> กล้อง (<span id="cameraFacingLabel">หลัง</span>)
                    </button>
                    <button type="button" class="btn btn-primary" style="flex: 1 1 calc(33.333% - 6px); min-width: 105px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 700;" onclick="simulateCameraScanSuccess()">
                        <i class="fa-solid fa-bolt"></i> สแกนจำลอง
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

function toggleCameraScanMode() {
    isContinuousCameraScanMode = !isContinuousCameraScanMode;
    const btn = document.getElementById('btnCameraContinuousMode');
    const txt = document.getElementById('cameraModeText');
    if (btn && txt) {
        if (isContinuousCameraScanMode) {
            btn.style.background = '#dcfce7';
            btn.style.borderColor = '#86efac';
            btn.style.color = '#15803d';
            txt.textContent = 'ยิงต่อเนื่อง';
        } else {
            btn.style.background = '#f1f5f9';
            btn.style.borderColor = '#cbd5e1';
            btn.style.color = '#475569';
            txt.textContent = 'ยิง 1 ครั้ง';
        }
    }
}

function triggerMobileCameraScan() {
    openCameraScanner();
}

function openCameraScanner() {
    // ปลดล็อกเสียงทันทีที่ผู้ใช้แตะเปิดกล้อง (สำคัญมากสำหรับ iOS Safari / Android Chrome)
    getSharedWmsAudioContext();

    initMobileCameraScannerModal();
    const modal = document.getElementById('cameraScannerModal');
    if (!modal) return;

    // เด้งเปิดหน้าต่างกล้องขึ้นมาทันที 0ms
    modal.style.display = 'flex';
    isCameraScannerActive = true;
    cameraSessionScanCount = 0;
    lastCameraScannedCode = '';
    lastCameraScannedTime = 0;

    const hud = document.getElementById('cameraLiveLastScanHud');
    if (hud) hud.style.display = 'none';

    const statusText = document.getElementById('cameraScannerStatusText');
    if (statusText) statusText.textContent = 'กำลังเชื่อมต่อกล้องความเร็วสูง...';

    // เริ่มสตรีมกล้องในเฟรมถัดไปทันทีเพื่อไม่ให้บล็อก UI
    requestAnimationFrame(() => {
        startCameraWithCurrentFacingMode();
    });
}

function getAllSupportedHtml5QrcodeFormats() {
    if (typeof Html5QrcodeSupportedFormats === 'undefined') return undefined;
    const F = Html5QrcodeSupportedFormats;
    return [
        F.QR_CODE,
        F.CODE_128,
        F.CODE_39,
        F.CODE_93,
        F.CODABAR,
        F.EAN_13,
        F.EAN_8,
        F.ITF,
        F.UPC_A,
        F.UPC_E,
        F.DATA_MATRIX,
        F.AZTEC,
        F.PDF_417
    ].filter(v => v !== undefined);
}

async function startCameraWithCurrentFacingMode() {
    const facingLabel = document.getElementById('cameraFacingLabel');
    if (facingLabel) {
        facingLabel.textContent = currentCameraFacingMode === 'user' ? 'หน้า' : 'หลัง';
    }

    const statusText = document.getElementById('cameraScannerStatusText');

    // หยุดสตรีมเดิมก่อนเริ่มใหม่เสมอ (ป้องกันกล้องค้างบน iOS Safari)
    await stopActiveCameraStreamsOnly();

    if (!isCameraScannerActive) return;

    if (typeof Html5Qrcode !== 'undefined') {
        const qrCodeContainer = document.getElementById('html5QrCodeReader');
        if (qrCodeContainer) {
            qrCodeContainer.style.display = 'block';
            const videoElem = document.getElementById('cameraScannerVideo');
            if (videoElem) videoElem.style.display = 'none';

            const formatsToSupport = getAllSupportedHtml5QrcodeFormats();
            html5QrCodeScanner = formatsToSupport
                ? new Html5Qrcode('html5QrCodeReader', { formatsToSupport, verbose: false })
                : new Html5Qrcode('html5QrCodeReader', { verbose: false });

            const config = {
                fps: 30,
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const w = Math.min(Math.floor(viewfinderWidth * 0.84), 340);
                    const h = Math.min(Math.floor(viewfinderHeight * 0.65), 220);
                    return { width: Math.max(180, w), height: Math.max(130, h) };
                },
                videoConstraints: {
                    facingMode: { ideal: currentCameraFacingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                }
            };

            try {
                await html5QrCodeScanner.start(
                    { facingMode: currentCameraFacingMode },
                    config,
                    (decodedText) => {
                        if (decodedText && decodedText.trim()) {
                            onCameraBarcodeDetected(decodedText.trim());
                        }
                    },
                    () => {}
                );

                if (statusText) statusText.textContent = 'พร้อมสแกน! เล็งบาร์โค้ดหรือ QR ทุกประเภทในกรอบ';

                // เสริมความเร็วด้วย Native BarcodeDetector ควบคู่กับ Html5Qrcode บนวิดีโอภายใน
                const innerVideo = qrCodeContainer.querySelector('video');
                if (innerVideo) {
                    innerVideo.setAttribute('playsinline', 'true');
                    innerVideo.setAttribute('webkit-playsinline', 'true');
                    innerVideo.muted = true;
                    tryEnableContinuousAutoFocus(innerVideo.srcObject);
                    startContinuousBarcodeDetection(innerVideo);
                }
                return;
            } catch (err) {
                console.warn('Html5Qrcode start fallback to native getUserMedia:', err);
            }
        }
    }

    startFallbackMediaScanner();
}

function tryEnableContinuousAutoFocus(stream) {
    if (!stream || typeof stream.getVideoTracks !== 'function') return;
    const track = stream.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') return;
    try {
        const caps = track.getCapabilities();
        if (caps && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
    } catch (e) {}
}

async function stopActiveCameraStreamsOnly() {
    if (cameraScanInterval) {
        clearInterval(cameraScanInterval);
        cameraScanInterval = null;
    }

    if (html5QrCodeScanner) {
        try {
            if (html5QrCodeScanner.isScanning) {
                await html5QrCodeScanner.stop();
            }
            html5QrCodeScanner.clear();
        } catch (e) {}
        html5QrCodeScanner = null;
    }

    if (activeCameraStream) {
        try {
            activeCameraStream.getTracks().forEach(track => track.stop());
        } catch (e) {}
        activeCameraStream = null;
    }
}

async function switchCameraFacingMode() {
    currentCameraFacingMode = (currentCameraFacingMode === 'environment') ? 'user' : 'environment';
    isTorchOn = false;
    const btn = document.getElementById('btnCameraTorchToggle');
    if (btn) btn.style.background = 'var(--bg-subtle, #f1f5f9)';

    if (isCameraScannerActive) {
        await startCameraWithCurrentFacingMode();
    }
}

async function toggleCameraTorch() {
    isTorchOn = !isTorchOn;
    const btn = document.getElementById('btnCameraTorchToggle');

    if (html5QrCodeScanner && isCameraScannerActive) {
        try {
            await html5QrCodeScanner.applyVideoConstraints({
                advanced: [{ torch: isTorchOn }]
            });
            if (btn) btn.style.background = isTorchOn ? '#f59e0b' : 'var(--bg-subtle, #f1f5f9)';
            return;
        } catch (e) {}
    }

    const activeVideo = document.querySelector('#html5QrCodeReader video') || document.getElementById('cameraScannerVideo');
    const stream = activeCameraStream || (activeVideo && activeVideo.srcObject);
    if (stream && typeof stream.getVideoTracks === 'function') {
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === 'function') {
            try {
                await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
                if (btn) btn.style.background = isTorchOn ? '#f59e0b' : 'var(--bg-subtle, #f1f5f9)';
                return;
            } catch (e) {}
        }
    }
    isTorchOn = false;
    showToast('⚠️ อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดไฟฉาย', true);
}

async function startFallbackMediaScanner() {
    const video = document.getElementById('cameraScannerVideo');
    const qrContainer = document.getElementById('html5QrCodeReader');
    const statusText = document.getElementById('cameraScannerStatusText');
    if (qrContainer) qrContainer.style.display = 'none';
    if (!video) return;

    video.style.display = 'block';
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('⚠️ เบราว์เซอร์ไม่รองรับการเปิดกล้อง (ต้องใช้งานผ่าน HTTPS)', true);
        closeCameraScanner();
        return;
    }

    const constraintCandidates = [
        {
            video: {
                facingMode: { ideal: currentCameraFacingMode },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        },
        {
            video: { facingMode: currentCameraFacingMode },
            audio: false
        },
        {
            video: true,
            audio: false
        }
    ];

    let stream = null;
    for (const constraints of constraintCandidates) {
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
        } catch (err) {}
    }

    if (!stream) {
        showToast('⚠️ ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตสิทธิ์การใช้กล้องในเบราว์เซอร์', true);
        closeCameraScanner();
        ensureSnInputFocus(true);
        return;
    }

    if (!isCameraScannerActive) {
        stream.getTracks().forEach(t => t.stop());
        return;
    }

    activeCameraStream = stream;
    video.srcObject = stream;
    tryEnableContinuousAutoFocus(stream);

    try {
        await video.play();
    } catch (e) {}

    if (statusText) statusText.textContent = 'พร้อมสแกน! เล็งบาร์โค้ดหรือ QR ทุกประเภทในกรอบ';
    startContinuousBarcodeDetection(video);
}

async function startContinuousBarcodeDetection(videoElement) {
    if (cameraScanInterval) clearInterval(cameraScanInterval);

    let barcodeDetector = null;
    if ('BarcodeDetector' in window) {
        try {
            let formats = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'upc_a', 'upc_e', 'codabar', 'itf', 'aztec', 'pdf417'];
            if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
                const supported = await window.BarcodeDetector.getSupportedFormats();
                if (Array.isArray(supported) && supported.length > 0) {
                    formats = supported;
                }
            }
            barcodeDetector = new window.BarcodeDetector({ formats });
        } catch (e) {
            try { barcodeDetector = new window.BarcodeDetector(); } catch (err) {}
        }
    }

    if (!barcodeDetector) return;

    cameraScanInterval = setInterval(async () => {
        if (!isCameraScannerActive || !videoElement || videoElement.readyState < 2) return;

        try {
            const barcodes = await barcodeDetector.detect(videoElement);
            if (barcodes && barcodes.length > 0) {
                const detectedVal = barcodes[0].rawValue || barcodes[0].rawValueText;
                if (detectedVal && detectedVal.trim()) {
                    onCameraBarcodeDetected(detectedVal.trim());
                }
            }
        } catch (e) {}
    }, 90);
}

function onCameraBarcodeDetected(scannedCode) {
    if (!isCameraScannerActive) return;
    const cleanCode = String(scannedCode || '').replace(/[\r\n\t\u200B-\u200D\uFEFF]/g, '').trim();
    if (!cleanCode) return;

    const now = Date.now();
    const codeUpper = cleanCode.toUpperCase();

    // ป้องกันการอ่านบาร์โค้ดเดิมซ้ำในเสี้ยววินาทีขณะถือกล้องค้างไว้
    if (codeUpper === lastCameraScannedCode && (now - lastCameraScannedTime) < 1500) {
        return;
    }
    if ((now - lastCameraScannedTime) < 300) {
        return;
    }

    lastCameraScannedCode = codeUpper;
    lastCameraScannedTime = now;

    const snInput = document.getElementById('inboundSn');
    if (snInput) {
        snInput.value = cleanCode;
    }

    // แสดงเอฟเฟกต์แฟลชสีเขียวในกรอบกล้องทันที
    const flashOverlay = document.getElementById('cameraScannerFlashOverlay');
    if (flashOverlay) {
        flashOverlay.style.opacity = '1';
        setTimeout(() => { flashOverlay.style.opacity = '0'; }, 160);
    }

    if (isContinuousCameraScanMode) {
        // โหมดยิงต่อเนื่อง: ส่งเข้าคิวรับเข้าคลังทันทีโดยไม่ต้องปิดกล้อง
        handleInboundSubmit();

        cameraSessionScanCount++;
        const hud = document.getElementById('cameraLiveLastScanHud');
        const lastTxt = document.getElementById('cameraLastScanCodeText');
        const badge = document.getElementById('cameraSessionBadge');
        if (hud && lastTxt && badge) {
            hud.style.display = 'flex';
            lastTxt.textContent = cleanCode;
            badge.textContent = `${cameraSessionScanCount} ชิ้น`;
        }
    } else {
        closeCameraScanner();
        handleInboundSubmit();
    }
}

function closeCameraScanner() {
    isCameraScannerActive = false;
    isTorchOn = false;
    stopActiveCameraStreamsOnly();

    const video = document.getElementById('cameraScannerVideo');
    if (video) video.srcObject = null;

    const modal = document.getElementById('cameraScannerModal');
    if (modal) modal.style.display = 'none';
    ensureSnInputFocus(true);
}

function simulateCameraScanSuccess() {
    const sampleSn = 'SN-' + Math.floor(100000 + Math.random() * 900000);
    onCameraBarcodeDetected(sampleSn);
}