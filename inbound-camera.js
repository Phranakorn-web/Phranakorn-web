// =========================================================================
// --- MODULE 3.4: MOBILE CAMERA BARCODE / QR SCANNER ENGINE ---
// --- Android, iOS & MacBook High-Speed Scan, Hardware Keys & Instant Stop ---
// =========================================================================

const CAMERA_TRIGGER_PREFS_STORAGE_KEY = 'WMS_CAMERA_TRIGGER_PREFS_V1';

let cameraSessionGenerationId = 0;
const cameraSessionScannedSet = new Set();
let isBindingCustomCameraKey = false;
let cameraHardwareKeyListenerAttached = false;
let lastDuplicateNoticeTime = 0;
let lastPrecheckToastTime = 0;
let reusableBarcodeDetectorInstance = null;
let isCameraTestMode = false;
let isProcessingCameraFrameDetection = false;

let cameraTriggerPrefs = {
    volumeDown: true,
    volumeUp: true,
    macbookKeys: true,
    customKeyCode: '',
    customKeyLabel: '',
    triggerOnlyMode: false
};

function loadCameraTriggerPrefs() {
    try {
        const raw = localStorage.getItem(CAMERA_TRIGGER_PREFS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                cameraTriggerPrefs = {
                    ...cameraTriggerPrefs,
                    ...parsed
                };
            }
        }
    } catch (e) {}
}

function saveCameraTriggerPrefs() {
    try {
        localStorage.setItem(CAMERA_TRIGGER_PREFS_STORAGE_KEY, JSON.stringify(cameraTriggerPrefs));
    } catch (e) {}
}

// 🟢 📹 ระบบกล้องสแกน SN ผ่านโทรศัพท์มือถือ (Android & iOS) และคอมพิวเตอร์ MacBook (เปิดทันที + หยุดทันที + ปุ่มลัดฮาร์ดแวร์)
function initMobileCameraScannerModal() {
    loadCameraTriggerPrefs();

    let modal = document.getElementById('cameraScannerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cameraScannerModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="card camera-scanner-card" style="max-width: 520px; width: 95%; max-height: 94dvh; text-align: center; padding: 16px; border-radius: 22px; background: var(--bg-surface, #ffffff); border: 1px solid var(--border-color, #e2e8f0); box-shadow: 0 24px 50px -10px rgba(0,0,0,0.35); overflow-y: auto; backdrop-filter: blur(12px);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; flex-wrap: wrap;">
                    <h3 style="font-size: 1.02rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 7px; margin: 0;">
                        <i class="fa-solid fa-camera" style="color: var(--primary, #0284c7);"></i> สแกนบาร์โค้ด / QR
                    </h3>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button type="button" onclick="toggleCameraTestMode()" title="เปิด/ปิด โหมดทดสอบสแกนซ้ำ (ไม่บันทึกลง DB จริง)" id="btnCameraTestModeToggle" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 99px; padding: 5px 10px; color: #475569; cursor: pointer; font-size: 0.72rem; font-weight: 800; display: flex; align-items: center; gap: 4px; min-height: 34px;">
                            <i class="fa-solid fa-flask"></i> <span id="cameraTestModeLabel">โหมดทดสอบ: ปิด</span>
                        </button>
                        <button type="button" onclick="toggleCameraTorch()" title="เปิด/ปิด ไฟฉาย" id="btnCameraTorchToggle" style="background: var(--bg-subtle, #f1f5f9); border: 1px solid var(--border-strong, #cbd5e1); border-radius: 50%; width: 36px; height: 36px; color: var(--text-main, #0f172a); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.92rem;">
                            <i class="fa-solid fa-bolt"></i>
                        </button>
                        <button type="button" onclick="switchCameraFacingMode()" title="สลับกล้องหน้า/หลัง" style="background: var(--primary-light, #e0f2fe); border: 1px solid var(--primary-border, #bae6fd); border-radius: 50%; width: 36px; height: 36px; color: var(--primary-text, #0284c7); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.92rem;">
                            <i class="fa-solid fa-camera-rotate"></i>
                        </button>
                        <button type="button" onclick="closeCameraScanner()" title="ปิดกล้องทันที" style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 50%; width: 36px; height: 36px; font-size: 1.35rem; color: #dc2626; cursor: pointer; line-height: 1; display: flex; align-items: center; justify-content: center;">&times;</button>
                    </div>
                </div>

                <!-- แถบเลือกโหมดการยิงสแกน: ยิงต่อเนื่อง vs ยิง 1 ครั้ง -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; background: var(--bg-subtle, #f1f5f9); padding: 4px; border-radius: 12px; border: 1px solid var(--border-color, #e2e8f0);">
                    <button type="button" id="btnModeContinuousScan" onclick="setCameraScanMode(true)" style="border: none; border-radius: 9px; padding: 7px 10px; font-size: 0.78rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.18s ease;">
                        <i class="fa-solid fa-repeat"></i> ยิงต่อเนื่อง (ไม่ซ้ำ SN)
                    </button>
                    <button type="button" id="btnModeSingleScan" onclick="setCameraScanMode(false)" style="border: none; border-radius: 9px; padding: 7px 10px; font-size: 0.78rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.18s ease;">
                        <i class="fa-solid fa-crosshairs"></i> ยิง 1 ครั้ง (แล้วปิดกล้อง)
                    </button>
                </div>

                <div id="cameraViewfinderBox" style="position: relative; width: 100%; height: clamp(220px, 40dvh, 310px); background: #090d16; border-radius: 16px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(56, 189, 248, 0.35); transition: border-color 0.18s ease;">
                    <div id="html5QrCodeReader" style="width: 100%; height: 100%;"></div>
                    <video id="cameraScannerVideo" autoplay playsinline webkit-playsinline muted style="width: 100%; height: 100%; object-fit: cover; display: none;"></video>

                    <div id="cameraScannerFlashOverlay" style="position:absolute; inset:0; background:rgba(16,185,129,0.38); opacity:0; pointer-events:none; transition:opacity 0.16s ease; z-index:8;"></div>

                    <div class="camera-scanner-frame" style="pointer-events:none;">
                        <div class="camera-scanner-laser"></div>
                    </div>

                    <div id="cameraLiveLastScanHud" style="display:none; position:absolute; top:10px; left:10px; right:10px; background:rgba(6, 78, 59, 0.92); color:#ecfdf5; padding:7px 12px; border-radius:12px; font-size:0.78rem; font-weight:700; backdrop-filter:blur(8px); border:1px solid #34d399; justify-content:space-between; align-items:center; gap:8px; z-index:10;">
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><i class="fa-solid fa-circle-check" style="color:#34d399;"></i> ล่าสุด: <span id="cameraLastScanCodeText" class="mono">-</span></span>
                        <span id="cameraSessionBadge" style="background:#10b981; color:#022c22; padding:2px 8px; border-radius:99px; font-size:0.72rem; flex-shrink:0;">0 ชิ้น</span>
                    </div>

                    <div id="cameraDuplicateSkipHud" style="display:none; position:absolute; top:48px; left:10px; right:10px; background:rgba(120, 53, 15, 0.94); color:#fef3c7; padding:5px 10px; border-radius:10px; font-size:0.72rem; font-weight:700; backdrop-filter:blur(8px); border:1px solid #fbbf24; align-items:center; justify-content:space-between; gap:6px; z-index:10;">
                        <span style="display:flex; align-items:center; gap:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            <i class="fa-solid fa-shield-halved" style="color:#fbbf24; flex-shrink:0;"></i>
                            <span id="cameraDuplicateSkipText" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">ข้าม SN ซ้ำ (ตรวจจับเฉพาะครั้งเดียว)</span>
                        </span>
                        <button type="button" onclick="resetCameraSessionDuplicateGuard()" style="background:#fbbf24; color:#451a03; border:none; border-radius:6px; padding:2px 7px; font-size:0.68rem; font-weight:800; cursor:pointer; flex-shrink:0;">
                            รีเซ็ตกันซ้ำ
                        </button>
                    </div>

                    <div style="position: absolute; bottom: 10px; background: rgba(15, 23, 42, 0.88); color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 0.74rem; backdrop-filter: blur(10px); pointer-events: none; border: 1px solid rgba(255,255,255,0.16); display: flex; align-items: center; gap: 6px; max-width: 92%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 4px 12px rgba(0,0,0,0.28); z-index:10;">
                        <i class="fa-solid fa-expand" style="color: #38bdf8;"></i> <span id="cameraScannerStatusText">เล็งบาร์โค้ด / QR ได้ทุกประเภท อ่านอัตโนมัติทันที</span>
                    </div>
                </div>

                <!-- แถบสถานะรายการกันซ้ำในรอบกล้องปัจจุบัน + ปุ่มรีเซ็ตล้างรายการกันซ้ำเฉพาะเซสชันนี้ -->
                <div style="margin-top: 10px; padding: 8px 12px; border-radius: 12px; background: #fffbeb; border: 1px solid #fde68a; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #92400e; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-shield-halved" style="color: #d97706;"></i>
                        <span>กันซ้ำรอบนี้: <strong id="cameraSessionGuardCountText" class="mono">0</strong> รายการ</span>
                    </div>
                    <button type="button" id="btnResetCameraSessionGuard" onclick="resetCameraSessionDuplicateGuard()" title="ล้างประวัติกัน S/N ซ้ำเฉพาะรอบสแกนกล้องปัจจุบัน" style="background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; border-radius: 8px; padding: 5px 10px; font-size: 0.73rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.15s ease;">
                        <i class="fa-solid fa-rotate-left"></i> รีเซ็ตกันซ้ำรอบนี้
                    </button>
                </div>

                <!-- แผงควบคุมปุ่มฮาร์ดแวร์เพิ่มเติม (ปุ่มลดเสียง / เพิ่มเสียง / ปุ่มบน MacBook / ปุ่มกำหนดเอง) -->
                <div id="cameraHardwareTriggerPanel" style="margin-top: 8px; padding: 10px 12px; border-radius: 14px; background: var(--bg-subtle, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap;">
                        <span style="font-size: 0.76rem; font-weight: 800; color: var(--text-main, #0f172a); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-keyboard" style="color: var(--primary, #0284c7);"></i> ปุ่มกดสแกน (มือถือ & MacBook)
                        </span>
                        <button type="button" id="btnToggleTriggerOnlyMode" onclick="toggleCameraTriggerOnlyMode()" style="font-size: 0.7rem; font-weight: 700; padding: 3px 9px; border-radius: 99px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; cursor: pointer;">
                            โหมด: อัตโนมัติ + ปุ่มกด
                        </button>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        <button type="button" id="btnTriggerOptVolDown" onclick="toggleCameraTriggerOption('volumeDown')" style="flex: 1 1 auto; font-size: 0.72rem; font-weight: 700; padding: 6px 9px; border-radius: 8px; border: 1px solid #cbd5e1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
                            <i class="fa-solid fa-volume-low"></i> ลดเสียง (Vol -)
                        </button>
                        <button type="button" id="btnTriggerOptVolUp" onclick="toggleCameraTriggerOption('volumeUp')" style="flex: 1 1 auto; font-size: 0.72rem; font-weight: 700; padding: 6px 9px; border-radius: 8px; border: 1px solid #cbd5e1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
                            <i class="fa-solid fa-volume-high"></i> เพิ่มเสียง (Vol +)
                        </button>
                        <button type="button" id="btnTriggerOptMacbook" onclick="toggleCameraTriggerOption('macbookKeys')" style="flex: 1 1 auto; font-size: 0.72rem; font-weight: 700; padding: 6px 9px; border-radius: 8px; border: 1px solid #cbd5e1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
                            <i class="fa-solid fa-laptop"></i> MacBook (Space/Enter)
                        </button>
                        <button type="button" id="btnTriggerOptCustomKey" onclick="startBindCustomCameraTriggerKey()" style="flex: 1 1 auto; font-size: 0.72rem; font-weight: 700; padding: 6px 9px; border-radius: 8px; border: 1px dashed #94a3b8; background: #ffffff; color: #475569; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
                            <i class="fa-solid fa-plus"></i> <span id="customTriggerKeyText">ตั้งปุ่มเอง</span>
                        </button>
                    </div>
                </div>

                <div class="camera-controls-grid" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; width: 100%;">
                    <button type="button" class="btn btn-danger" style="flex: 1 1 calc(32% - 6px); min-width: 92px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 800; background: #ef4444; color: #ffffff; border: none;" onclick="closeCameraScanner()">
                        <i class="fa-solid fa-power-off"></i> ปิดกล้อง
                    </button>
                    <button type="button" class="btn btn-primary" style="flex: 1 1 calc(36% - 6px); min-width: 112px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 800;" onclick="triggerManualCameraShutterScan('on-screen-button')">
                        <i class="fa-solid fa-camera"></i> กดยิงสแกน
                    </button>
                    <button type="button" class="btn btn-secondary" style="flex: 1 1 calc(32% - 6px); min-width: 100px; min-height: 42px; padding: 8px 10px; font-size: 0.82rem; border-radius: 10px; font-weight: 700;" onclick="switchCameraFacingMode()">
                        <i class="fa-solid fa-camera-rotate"></i> กล้อง (<span id="cameraFacingLabel">หลัง</span>)
                    </button>
                </div>
            </div>
        `;

        // ปิดกล้องทันทีเมื่อแตะพื้นที่ว่างด้านนอกกรอบ
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCameraScanner();
            }
        });

        document.body.appendChild(modal);
    }

    syncCameraScanModeUI();
    syncCameraTestModeUI();
    syncCameraTriggerPrefsUI();
    updateCameraSessionGuardCounterUI();
}

function updateCameraSessionGuardCounterUI() {
    const countEl = document.getElementById('cameraSessionGuardCountText');
    if (countEl) {
        countEl.textContent = String(cameraSessionScannedSet.size);
    }
}

// 🔄 รีเซ็ตล้างรายการกัน S/N ซ้ำเฉพาะเซสชันกล้องรอบปัจจุบัน (ใช้เมื่อต้องการสแกนทดสอบบาร์โค้ดเดิมซ้ำ)
function resetCameraSessionDuplicateGuard() {
    const clearedCount = cameraSessionScannedSet.size;
    cameraSessionScannedSet.clear();
    cameraSessionScanCount = 0;
    lastCameraScannedCode = '';
    lastCameraScannedTime = 0;
    lastDuplicateNoticeTime = 0;

    updateCameraSessionGuardCounterUI();

    const dupHud = document.getElementById('cameraDuplicateSkipHud');
    if (dupHud) dupHud.style.display = 'none';

    const badge = document.getElementById('cameraSessionBadge');
    if (badge) badge.textContent = '0 ชิ้น';

    const statusText = document.getElementById('cameraScannerStatusText');
    if (statusText) {
        statusText.textContent = isCameraTestMode
            ? '🧪 รีเซ็ตกันซ้ำรอบนี้แล้ว! พร้อมสแกนทดสอบบาร์โค้ดเดิมซ้ำได้ทันที'
            : '🔄 ล้างรายการกันซ้ำรอบนี้แล้ว พร้อมสแกนบาร์โค้ดใหม่';
    }

    showToast(
        isCameraTestMode
            ? `🧪 รีเซ็ตกันซ้ำรอบนี้เรียบร้อย (${clearedCount} รายการ) — สแกนทดสอบบาร์โค้ดเดิมซ้ำได้ทันที`
            : `🔄 ล้างรายการกันซ้ำเฉพาะรอบกล้องปัจจุบันเรียบร้อย (${clearedCount} รายการ)`,
        false,
        2400
    );
}

function syncCameraTestModeUI() {
    const btn = document.getElementById('btnCameraTestModeToggle');
    const lbl = document.getElementById('cameraTestModeLabel');
    if (btn && lbl) {
        if (isCameraTestMode) {
            btn.style.background = '#fef3c7';
            btn.style.borderColor = '#f59e0b';
            btn.style.color = '#92400e';
            lbl.textContent = 'โหมดทดสอบ: เปิด';
        } else {
            btn.style.background = '#f1f5f9';
            btn.style.borderColor = '#cbd5e1';
            btn.style.color = '#475569';
            lbl.textContent = 'โหมดทดสอบ: ปิด';
        }
    }
}

function toggleCameraTestMode() {
    isCameraTestMode = !isCameraTestMode;
    syncCameraTestModeUI();

    if (isCameraTestMode) {
        // ล้างรายการกันซ้ำรอบกล้องปัจจุบันอัตโนมัติเมื่อเข้าโหมดทดสอบเพื่อให้เริ่มทดสอบได้ทันที
        cameraSessionScannedSet.clear();
        cameraSessionScanCount = 0;
        lastCameraScannedCode = '';
        lastCameraScannedTime = 0;
        updateCameraSessionGuardCounterUI();

        const dupHud = document.getElementById('cameraDuplicateSkipHud');
        if (dupHud) dupHud.style.display = 'none';

        const statusText = document.getElementById('cameraScannerStatusText');
        if (statusText) {
            statusText.textContent = '🧪 โหมดทดสอบ: สแกนบาร์โค้ดทดสอบได้ (ไม่บันทึกลง DB จริง)';
        }
        showToast('🧪 เปิดโหมดทดสอบแล้ว (ไม่บันทึกลงคลังจริง และกด "รีเซ็ตกันซ้ำรอบนี้" เพื่อยิงซ้ำได้ตลอด)', false, 3200);
    } else {
        const statusText = document.getElementById('cameraScannerStatusText');
        if (statusText) {
            statusText.textContent = 'พร้อมสแกนรับเข้าคลังจริง! เล็งบาร์โค้ดหรือ QR ในกรอบ';
        }
        showToast('✅ กลับสู่โหมดสแกนรับเข้าคลังจริงเรียบร้อย', false, 2200);
    }
}

function syncCameraScanModeUI() {
    const btnContinuous = document.getElementById('btnModeContinuousScan');
    const btnSingle = document.getElementById('btnModeSingleScan');
    if (btnContinuous && btnSingle) {
        if (isContinuousCameraScanMode) {
            btnContinuous.style.background = '#16a34a';
            btnContinuous.style.color = '#ffffff';
            btnContinuous.style.boxShadow = '0 2px 8px rgba(22, 163, 74, 0.28)';

            btnSingle.style.background = 'transparent';
            btnSingle.style.color = 'var(--text-sub, #475569)';
            btnSingle.style.boxShadow = 'none';
        } else {
            btnSingle.style.background = '#0284c7';
            btnSingle.style.color = '#ffffff';
            btnSingle.style.boxShadow = '0 2px 8px rgba(2, 132, 199, 0.28)';

            btnContinuous.style.background = 'transparent';
            btnContinuous.style.color = 'var(--text-sub, #475569)';
            btnContinuous.style.boxShadow = 'none';
        }
    }
}

function setCameraScanMode(continuousFlag) {
    isContinuousCameraScanMode = Boolean(continuousFlag);
    syncCameraScanModeUI();
    const statusText = document.getElementById('cameraScannerStatusText');
    if (statusText) {
        statusText.textContent = isContinuousCameraScanMode
            ? 'โหมดยิงต่อเนื่อง: สแกนเก็บทุก S/N ที่ไม่ซ้ำอัตโนมัติ'
            : 'โหมดยิง 1 ครั้ง: สแกนได้ 1 รายการที่ไม่ซ้ำแล้วปิดกล้องทันที';
    }
}

function toggleCameraScanMode() {
    setCameraScanMode(!isContinuousCameraScanMode);
}

function syncCameraTriggerPrefsUI() {
    const applyPillStyle = (el, active) => {
        if (!el) return;
        if (active) {
            el.style.background = '#e0f2fe';
            el.style.borderColor = '#38bdf8';
            el.style.color = '#0369a1';
        } else {
            el.style.background = '#ffffff';
            el.style.borderColor = '#cbd5e1';
            el.style.color = '#64748b';
        }
    };

    applyPillStyle(document.getElementById('btnTriggerOptVolDown'), cameraTriggerPrefs.volumeDown);
    applyPillStyle(document.getElementById('btnTriggerOptVolUp'), cameraTriggerPrefs.volumeUp);
    applyPillStyle(document.getElementById('btnTriggerOptMacbook'), cameraTriggerPrefs.macbookKeys);

    const customBtn = document.getElementById('btnTriggerOptCustomKey');
    const customTxt = document.getElementById('customTriggerKeyText');
    if (customBtn && customTxt) {
        if (isBindingCustomCameraKey) {
            customBtn.style.background = '#fef3c7';
            customBtn.style.borderColor = '#f59e0b';
            customBtn.style.color = '#b45309';
            customTxt.textContent = 'กดปุ่มที่ต้องการ...';
        } else if (cameraTriggerPrefs.customKeyCode) {
            customBtn.style.background = '#dcfce7';
            customBtn.style.borderColor = '#4ade80';
            customBtn.style.color = '#15803d';
            customTxt.textContent = `ปุ่ม: ${cameraTriggerPrefs.customKeyLabel || cameraTriggerPrefs.customKeyCode}`;
        } else {
            customBtn.style.background = '#ffffff';
            customBtn.style.borderColor = '#94a3b8';
            customBtn.style.color = '#475569';
            customTxt.textContent = 'ตั้งปุ่มเอง';
        }
    }

    const modeBtn = document.getElementById('btnToggleTriggerOnlyMode');
    if (modeBtn) {
        if (cameraTriggerPrefs.triggerOnlyMode) {
            modeBtn.style.background = '#fef3c7';
            modeBtn.style.borderColor = '#f59e0b';
            modeBtn.style.color = '#92400e';
            modeBtn.textContent = 'โหมด: เฉพาะตอนกดปุ่มเท่านั้น';
        } else {
            modeBtn.style.background = '#ecfdf5';
            modeBtn.style.borderColor = '#6ee7b7';
            modeBtn.style.color = '#065f46';
            modeBtn.textContent = 'โหมด: อัตโนมัติ + ปุ่มกด';
        }
    }
}

function toggleCameraTriggerOption(optionKey) {
    if (Object.prototype.hasOwnProperty.call(cameraTriggerPrefs, optionKey)) {
        cameraTriggerPrefs[optionKey] = !cameraTriggerPrefs[optionKey];
        saveCameraTriggerPrefs();
        syncCameraTriggerPrefsUI();
    }
}

function toggleCameraTriggerOnlyMode() {
    cameraTriggerPrefs.triggerOnlyMode = !cameraTriggerPrefs.triggerOnlyMode;
    saveCameraTriggerPrefs();
    syncCameraTriggerPrefsUI();

    const statusText = document.getElementById('cameraScannerStatusText');
    if (statusText) {
        statusText.textContent = cameraTriggerPrefs.triggerOnlyMode
            ? 'เล็งบาร์โค้ดแล้วกดปุ่มลดเสียง / เพิ่มเสียง / ปุ่ม MacBook เพื่อยิง'
            : 'พร้อมสแกน! อ่านอัตโนมัติหรือกดปุ่มฮาร์ดแวร์เพื่อยิงทันที';
    }
}

function startBindCustomCameraTriggerKey() {
    if (isBindingCustomCameraKey) {
        // กดซ้ำเพื่อล้างปุ่มกำหนดเอง
        isBindingCustomCameraKey = false;
        cameraTriggerPrefs.customKeyCode = '';
        cameraTriggerPrefs.customKeyLabel = '';
        saveCameraTriggerPrefs();
        syncCameraTriggerPrefsUI();
        return;
    }
    isBindingCustomCameraKey = true;
    syncCameraTriggerPrefsUI();
    showToast('⌨️ กดปุ่มใดก็ได้บนคีย์บอร์ด MacBook หรือรีโมตเพื่อตั้งเป็นปุ่มยิงสแกน', false, 2800);
}

function formatReadableTriggerKeyLabel(e) {
    if (e.code === 'Space' || e.key === ' ') return 'Space';
    if (e.key === 'Enter' || e.code === 'NumpadEnter') return 'Enter';
    if (e.key === 'VolumeDown' || e.code === 'AudioVolumeDown') return 'Vol -';
    if (e.key === 'VolumeUp' || e.code === 'AudioVolumeUp') return 'Vol +';
    if (e.key && e.key.length === 1) return e.key.toUpperCase();
    return e.code || e.key || 'Key';
}

function isCameraHardwareTriggerKeyEvent(e) {
    const key = e.key || '';
    const code = e.code || '';
    const keyCode = e.keyCode || e.which || 0;

    // 1. ปุ่มลดเสียงโทรศัพท์ / รีโมต (Android / iOS / Bluetooth)
    const isVolDown = (
        key === 'VolumeDown' ||
        key === 'AudioVolumeDown' ||
        code === 'AudioVolumeDown' ||
        keyCode === 25
    );
    if (isVolDown && cameraTriggerPrefs.volumeDown) return true;

    // 2. ปุ่มเพิ่มเสียงโทรศัพท์ / รีโมต (Android / iOS / Bluetooth)
    const isVolUp = (
        key === 'VolumeUp' ||
        key === 'AudioVolumeUp' ||
        code === 'AudioVolumeUp' ||
        keyCode === 24
    );
    if (isVolUp && cameraTriggerPrefs.volumeUp) return true;

    // 3. ปุ่มบนคอมพิวเตอร์ MacBook / คีย์บอร์ด (Space / Enter / NumpadEnter)
    const isMacBookStandardKey = (
        code === 'Space' ||
        key === ' ' ||
        key === 'Enter' ||
        code === 'Enter' ||
        code === 'NumpadEnter'
    );
    if (isMacBookStandardKey && cameraTriggerPrefs.macbookKeys) return true;

    // 4. ปุ่มกำหนดเองที่ผู้ใช้เลือกไว้
    if (cameraTriggerPrefs.customKeyCode && (code === cameraTriggerPrefs.customKeyCode || key === cameraTriggerPrefs.customKeyCode)) {
        return true;
    }

    return false;
}

function handleCameraHardwareKeyDown(e) {
    if (!isCameraScannerActive) return;

    // โหมดกำลังตั้งค่าปุ่มลัดใหม่จากคีย์บอร์ด MacBook / รีโมต
    if (isBindingCustomCameraKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
            isBindingCustomCameraKey = false;
            syncCameraTriggerPrefsUI();
            return;
        }
        cameraTriggerPrefs.customKeyCode = e.code || e.key;
        cameraTriggerPrefs.customKeyLabel = formatReadableTriggerKeyLabel(e);
        isBindingCustomCameraKey = false;
        saveCameraTriggerPrefs();
        syncCameraTriggerPrefsUI();
        showToast(`✅ ตั้งปุ่ม "${cameraTriggerPrefs.customKeyLabel}" เป็นปุ่มยิงสแกนเรียบร้อย`, false, 2400);
        return;
    }

    // กด Escape เพื่อปิดกล้องทันที
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeCameraScanner();
        return;
    }

    if (e.repeat) return;

    const activeTag = document.activeElement && document.activeElement.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

    if (isCameraHardwareTriggerKeyEvent(e)) {
        e.preventDefault();
        e.stopPropagation();
        triggerManualCameraShutterScan(formatReadableTriggerKeyLabel(e));
    }
}

function handleCameraVisibilityAutoStop() {
    if (document.hidden && isCameraScannerActive) {
        closeCameraScanner();
    }
}

function attachCameraHardwareControls() {
    if (!cameraHardwareKeyListenerAttached) {
        window.addEventListener('keydown', handleCameraHardwareKeyDown, { capture: true, passive: false });
        document.addEventListener('visibilitychange', handleCameraVisibilityAutoStop);
        window.addEventListener('pagehide', closeCameraScanner);
        cameraHardwareKeyListenerAttached = true;
    }

    // รองรับปุ่ม Media / Headset / Bluetooth Shutter บน iOS, Android และ MacBook
    try {
        if ('mediaSession' in navigator && typeof navigator.mediaSession.setActionHandler === 'function') {
            const mediaTrigger = () => {
                if (isCameraScannerActive) {
                    triggerManualCameraShutterScan('Media/Shutter');
                }
            };
            navigator.mediaSession.setActionHandler('play', mediaTrigger);
            navigator.mediaSession.setActionHandler('pause', mediaTrigger);
            navigator.mediaSession.setActionHandler('nexttrack', mediaTrigger);
            navigator.mediaSession.setActionHandler('previoustrack', mediaTrigger);
        }
    } catch (e) {}
}

function detachCameraHardwareControls() {
    if (cameraHardwareKeyListenerAttached) {
        window.removeEventListener('keydown', handleCameraHardwareKeyDown, { capture: true });
        document.removeEventListener('visibilitychange', handleCameraVisibilityAutoStop);
        window.removeEventListener('pagehide', closeCameraScanner);
        cameraHardwareKeyListenerAttached = false;
    }

    try {
        if ('mediaSession' in navigator && typeof navigator.mediaSession.setActionHandler === 'function') {
            navigator.mediaSession.setActionHandler('play', null);
            navigator.mediaSession.setActionHandler('pause', null);
            navigator.mediaSession.setActionHandler('nexttrack', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
        }
    } catch (e) {}
}

// 📸 สั่งยิงสแกนทันทีเมื่อกดปุ่มลดเสียง / เพิ่มเสียง / ปุ่ม MacBook / ปุ่มชัตเตอร์
async function triggerManualCameraShutterScan(triggerSource = 'button') {
    if (!isCameraScannerActive) return;

    const viewfinderBox = document.getElementById('cameraViewfinderBox');
    const statusText = document.getElementById('cameraScannerStatusText');

    if (viewfinderBox) {
        viewfinderBox.style.borderColor = '#38bdf8';
        setTimeout(() => {
            if (viewfinderBox && isCameraScannerActive) {
                viewfinderBox.style.borderColor = 'rgba(56, 189, 248, 0.35)';
            }
        }, 220);
    }

    if (statusText) {
        statusText.textContent = `📸 กำลังจับภาพสแกน (${triggerSource})...`;
    }

    const activeVideo = document.querySelector('#html5QrCodeReader video') || document.getElementById('cameraScannerVideo');
    if (!activeVideo || activeVideo.readyState < 2) {
        if (statusText) statusText.textContent = '⏳ กล้องกำลังเตรียมภาพ โปรดลองกดอีกครั้ง';
        return;
    }

    // 1. ลองอ่านทันทีผ่าน Native BarcodeDetector
    const detector = await getOrCreateBarcodeDetector();
    if (detector) {
        try {
            const barcodes = await detector.detect(activeVideo);
            if (barcodes && barcodes.length > 0) {
                const val = barcodes[0].rawValue || barcodes[0].rawValueText;
                if (val && val.trim()) {
                    onCameraBarcodeDetected(val.trim(), { fromManualTrigger: true });
                    return;
                }
            }
        } catch (e) {}
    }

    // 2. สำรองสำหรับ iOS Safari / MacBook Safari: จับภาพจากเฟรมวิดีโอลง Canvas แล้วถอดรหัสผ่าน Html5Qrcode
    if (html5QrCodeScanner && typeof html5QrCodeScanner.scanFile === 'function') {
        try {
            const vw = activeVideo.videoWidth || 640;
            const vh = activeVideo.videoHeight || 480;
            const canvas = document.createElement('canvas');
            canvas.width = vw;
            canvas.height = vh;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(activeVideo, 0, 0, vw, vh);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
                if (blob && isCameraScannerActive) {
                    const file = new File([blob], 'shutter_frame.jpg', { type: 'image/jpeg' });
                    const decodedText = await html5QrCodeScanner.scanFile(file, false);
                    if (decodedText && decodedText.trim()) {
                        onCameraBarcodeDetected(decodedText.trim(), { fromManualTrigger: true });
                        return;
                    }
                }
            }
        } catch (e) {}
    }

    if (statusText && isCameraScannerActive) {
        statusText.textContent = 'ไม่พบบาร์โค้ดในกรอบ ลองขยับให้ชัดแล้วกดยิงอีกครั้ง';
    }
}

function triggerMobileCameraScan() {
    openCameraScanner();
}

function openCameraScanner() {
    // ปลดล็อกเสียงทันทีที่ผู้ใช้แตะเปิดกล้อง (สำคัญมากสำหรับ iOS Safari / Android Chrome / MacBook Safari)
    getSharedWmsAudioContext();

    initMobileCameraScannerModal();
    const modal = document.getElementById('cameraScannerModal');
    if (!modal) return;

    cameraSessionGenerationId++;
    isCameraScannerActive = true;
    isBindingCustomCameraKey = false;
    isProcessingCameraFrameDetection = false;
    cameraSessionScanCount = 0;
    cameraSessionScannedSet.clear();
    lastCameraScannedCode = '';
    lastCameraScannedTime = 0;

    // เด้งเปิดหน้าต่างกล้องขึ้นมาทันที 0ms
    modal.style.display = 'flex';
    syncCameraScanModeUI();
    syncCameraTestModeUI();
    syncCameraTriggerPrefsUI();
    updateCameraSessionGuardCounterUI();
    attachCameraHardwareControls();

    const hud = document.getElementById('cameraLiveLastScanHud');
    if (hud) hud.style.display = 'none';

    const dupHud = document.getElementById('cameraDuplicateSkipHud');
    if (dupHud) dupHud.style.display = 'none';

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
    const myGenId = cameraSessionGenerationId;

    const facingLabel = document.getElementById('cameraFacingLabel');
    if (facingLabel) {
        facingLabel.textContent = currentCameraFacingMode === 'user' ? 'หน้า' : 'หลัง';
    }

    const statusText = document.getElementById('cameraScannerStatusText');

    // หยุดสตรีมเดิมก่อนเริ่มใหม่เสมอ (ป้องกันกล้องค้างบน iOS Safari และ MacBook)
    await stopActiveCameraStreamsOnly();

    if (!isCameraScannerActive || myGenId !== cameraSessionGenerationId) {
        forceKillAllCameraHardwareStreams();
        return;
    }

    if (typeof Html5Qrcode !== 'undefined') {
        const qrCodeContainer = document.getElementById('html5QrCodeReader');
        if (qrCodeContainer) {
            qrCodeContainer.style.display = 'block';
            const videoElem = document.getElementById('cameraScannerVideo');
            if (videoElem) videoElem.style.display = 'none';

            const formatsToSupport = getAllSupportedHtml5QrcodeFormats();
            const scannerInstance = formatsToSupport
                ? new Html5Qrcode('html5QrCodeReader', { formatsToSupport, verbose: false })
                : new Html5Qrcode('html5QrCodeReader', { verbose: false });

            html5QrCodeScanner = scannerInstance;

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
                await scannerInstance.start(
                    { facingMode: currentCameraFacingMode },
                    config,
                    (decodedText) => {
                        if (!isCameraScannerActive || myGenId !== cameraSessionGenerationId) return;
                        if (decodedText && decodedText.trim()) {
                            onCameraBarcodeDetected(decodedText.trim(), { fromManualTrigger: false });
                        }
                    },
                    () => {}
                );

                // หากผู้ใช้กดปิดกล้องไปแล้วระหว่างรอ start() ให้หยุดและปิดกล้องทันที 100%
                if (!isCameraScannerActive || myGenId !== cameraSessionGenerationId) {
                    try {
                        if (scannerInstance.isScanning) await scannerInstance.stop();
                        scannerInstance.clear();
                    } catch (e) {}
                    forceKillAllCameraHardwareStreams();
                    return;
                }

                if (statusText) {
                    statusText.textContent = isCameraTestMode
                        ? '🧪 โหมดทดสอบ: เล็งบาร์โค้ดทดสอบได้ (ไม่บันทึกลง DB จริง)'
                        : (cameraTriggerPrefs.triggerOnlyMode
                            ? 'เล็งบาร์โค้ดแล้วกดปุ่มลดเสียง / เพิ่มเสียง / ปุ่ม MacBook เพื่อยิง'
                            : 'พร้อมสแกน! เล็งบาร์โค้ดหรือกดปุ่มลดเสียง / เพิ่มเสียง / MacBook');
                }

                // เสริมความเร็วด้วย Native BarcodeDetector ควบคู่กับ Html5Qrcode บนวิดีโอภายใน
                const innerVideo = qrCodeContainer.querySelector('video');
                if (innerVideo) {
                    innerVideo.setAttribute('playsinline', 'true');
                    innerVideo.setAttribute('webkit-playsinline', 'true');
                    innerVideo.muted = true;
                    if (innerVideo.srcObject) {
                        activeCameraStream = innerVideo.srcObject;
                    }
                    tryEnableContinuousAutoFocus(innerVideo.srcObject);
                    startContinuousBarcodeDetection(innerVideo);
                }
                return;
            } catch (err) {
                console.warn('Html5Qrcode start fallback to native getUserMedia:', err);
                if (!isCameraScannerActive || myGenId !== cameraSessionGenerationId) {
                    forceKillAllCameraHardwareStreams();
                    return;
                }
            }
        }
    }

    startFallbackMediaScanner(myGenId);
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

// 🛑 ปิดฮาร์ดแวร์กล้องทุก Track ทันทีแบบ Synchronous 0ms (แก้ปัญหาไฟกล้องค้างบน MacBook / iOS / Android)
function forceKillAllCameraHardwareStreams() {
    if (cameraScanInterval) {
        clearInterval(cameraScanInterval);
        cameraScanInterval = null;
    }

    if (activeCameraStream) {
        try {
            activeCameraStream.getTracks().forEach(track => {
                try {
                    track.enabled = false;
                    track.stop();
                } catch (e) {}
            });
        } catch (e) {}
        activeCameraStream = null;
    }

    const videos = document.querySelectorAll('#cameraScannerModal video, #html5QrCodeReader video, #cameraScannerVideo');
    videos.forEach(video => {
        try {
            const stream = video.srcObject;
            if (stream && typeof stream.getTracks === 'function') {
                stream.getTracks().forEach(track => {
                    try {
                        track.enabled = false;
                        track.stop();
                    } catch (e) {}
                });
            }
            video.pause();
            video.srcObject = null;
            video.removeAttribute('src');
            video.load();
        } catch (e) {}
    });
}

async function stopActiveCameraStreamsOnly() {
    forceKillAllCameraHardwareStreams();

    const scannerToStop = html5QrCodeScanner;
    html5QrCodeScanner = null;

    if (scannerToStop) {
        try {
            if (scannerToStop.isScanning) {
                await scannerToStop.stop();
            }
        } catch (e) {}
        try {
            scannerToStop.clear();
        } catch (e) {}
    }

    const qrCodeContainer = document.getElementById('html5QrCodeReader');
    if (qrCodeContainer) {
        qrCodeContainer.innerHTML = '';
    }

    // ย้ำปิด Track อีกครั้งหลัง clear() เพื่อความมั่นใจ 100%
    forceKillAllCameraHardwareStreams();
}

async function switchCameraFacingMode() {
    currentCameraFacingMode = (currentCameraFacingMode === 'environment') ? 'user' : 'environment';
    isTorchOn = false;
    const btn = document.getElementById('btnCameraTorchToggle');
    if (btn) btn.style.background = 'var(--bg-subtle, #f1f5f9)';

    if (isCameraScannerActive) {
        cameraSessionGenerationId++;
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

async function startFallbackMediaScanner(expectedGenId = cameraSessionGenerationId) {
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
        if (!isCameraScannerActive || expectedGenId !== cameraSessionGenerationId) return;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
        } catch (err) {}
    }

    if (!stream) {
        if (isCameraScannerActive && expectedGenId === cameraSessionGenerationId) {
            showToast('⚠️ ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตสิทธิ์การใช้กล้องในเบราว์เซอร์', true);
            closeCameraScanner();
            ensureSnInputFocus(true);
        }
        return;
    }

    // หากปิดกล้องไปแล้วระหว่างรอ getUserMedia ให้สั่งหยุดสตรีมที่ได้มาทันที
    if (!isCameraScannerActive || expectedGenId !== cameraSessionGenerationId) {
        stream.getTracks().forEach(t => {
            try { t.enabled = false; t.stop(); } catch (e) {}
        });
        return;
    }

    activeCameraStream = stream;
    video.srcObject = stream;
    tryEnableContinuousAutoFocus(stream);

    try {
        await video.play();
    } catch (e) {}

    if (statusText) {
        statusText.textContent = isCameraTestMode
            ? '🧪 โหมดทดสอบ: เล็งบาร์โค้ดทดสอบได้ (ไม่บันทึกลง DB จริง)'
            : (cameraTriggerPrefs.triggerOnlyMode
                ? 'เล็งบาร์โค้ดแล้วกดปุ่มลดเสียง / เพิ่มเสียง / ปุ่ม MacBook เพื่อยิง'
                : 'พร้อมสแกน! เล็งบาร์โค้ดหรือกดปุ่มลดเสียง / เพิ่มเสียง / MacBook');
    }
    startContinuousBarcodeDetection(video);
}

async function getOrCreateBarcodeDetector() {
    if (reusableBarcodeDetectorInstance) return reusableBarcodeDetectorInstance;
    if (!('BarcodeDetector' in window)) return null;

    try {
        let formats = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'data_matrix', 'upc_a', 'upc_e', 'codabar', 'itf', 'aztec', 'pdf417'];
        if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
            const supported = await window.BarcodeDetector.getSupportedFormats();
            if (Array.isArray(supported) && supported.length > 0) {
                formats = supported;
            }
        }
        reusableBarcodeDetectorInstance = new window.BarcodeDetector({ formats });
    } catch (e) {
        try {
            reusableBarcodeDetectorInstance = new window.BarcodeDetector();
        } catch (err) {
            reusableBarcodeDetectorInstance = null;
        }
    }
    return reusableBarcodeDetectorInstance;
}

async function startContinuousBarcodeDetection(videoElement) {
    if (cameraScanInterval) {
        clearInterval(cameraScanInterval);
        cameraScanInterval = null;
    }

    const barcodeDetector = await getOrCreateBarcodeDetector();
    if (!barcodeDetector) return;

    cameraScanInterval = setInterval(async () => {
        if (!isCameraScannerActive || !videoElement || videoElement.readyState < 2) return;
        // หากผู้ใช้เลือกโหมด "เฉพาะตอนกดปุ่มเท่านั้น" ให้ข้ามการตรวจจับอัตโนมัติ
        if (cameraTriggerPrefs.triggerOnlyMode) return;
        if (isProcessingCameraFrameDetection) return;

        isProcessingCameraFrameDetection = true;
        try {
            const barcodes = await barcodeDetector.detect(videoElement);
            if (barcodes && barcodes.length > 0) {
                const detectedVal = barcodes[0].rawValue || barcodes[0].rawValueText;
                if (detectedVal && detectedVal.trim()) {
                    onCameraBarcodeDetected(detectedVal.trim(), { fromManualTrigger: false });
                }
            }
        } catch (e) {
        } finally {
            isProcessingCameraFrameDetection = false;
        }
    }, 90);
}

// 🔒 ตรวจสอบว่า S/N นี้ซ้ำในรอบสแกนนี้หรือมีอยู่ในระบบคลังสินค้าแล้วหรือไม่ (หากซ้ำจะไม่ตรวจจับซ้ำ)
function isSerialNumberAlreadyCapturedOrInStock(cleanCode) {
    const codeUpper = String(cleanCode || '').trim().toUpperCase();
    if (!codeUpper) return true;

    // 1. ตรวจจับไปแล้วในเซสชันกล้องรอบนี้ -> ไม่ตรวจจับซ้ำเด็ดขาด (จนกว่าจะกดปุ่ม "รีเซ็ตกันซ้ำรอบนี้")
    if (cameraSessionScannedSet.has(codeUpper)) {
        return true;
    }

    // หากอยู่ในโหมดทดสอบ ให้เช็กซ้ำเฉพาะเซสชันกล้องรอบนี้เท่านั้น (อนุญาตให้สแกนทดสอบบาร์โค้ดเดิมที่อยู่ในสต็อกได้)
    if (isCameraTestMode) {
        return false;
    }

    // 2. อยู่ในหน่วยความจำคิว Fast-Scan ปัจจุบัน
    if (typeof pendingFastSnSet !== 'undefined' && pendingFastSnSet instanceof Set && pendingFastSnSet.has(codeUpper)) {
        return true;
    }

    // 3. มีอยู่ในรายการรับเข้าล่าสุด
    if (typeof recentInboundList !== 'undefined' && Array.isArray(recentInboundList)) {
        if (recentInboundList.some(r => r && String(r.sn || '').trim().toUpperCase() === codeUpper)) {
            return true;
        }
    }

    // 4. มีอยู่ในคิวรอซิงค์ DB
    if (typeof persistentDbSyncQueue !== 'undefined' && Array.isArray(persistentDbSyncQueue)) {
        if (persistentDbSyncQueue.some(q => q && q.payload && String(q.payload.sn || '').trim().toUpperCase() === codeUpper)) {
            return true;
        }
    }

    // 5. มีอยู่ในสต็อกสินค้าคงคลังปัจจุบัน
    if (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData)) {
        const existsInStock = globalInventoryData.some(item => {
            if (!item) return false;
            const statusUpper = String(item.status || '').toUpperCase();
            const isOut = statusUpper === 'OUT' || statusUpper === 'DISPATCHED' || statusUpper === 'ISSUED' || statusUpper === 'RELEASED' || item.is_deleted;
            return !isOut && String(item.sn || '').trim().toUpperCase() === codeUpper;
        });
        if (existsInStock) return true;
    }

    return false;
}

function showCameraDuplicateSkippedNotice(cleanCode) {
    const now = Date.now();
    if (now - lastDuplicateNoticeTime < 750) return;
    lastDuplicateNoticeTime = now;

    const dupHud = document.getElementById('cameraDuplicateSkipHud');
    const dupText = document.getElementById('cameraDuplicateSkipText');
    if (dupHud && dupText) {
        dupText.textContent = `ข้าม SN ซ้ำ: ${cleanCode} (ตรวจจับแล้ว 1 ครั้ง)`;
        dupHud.style.display = 'flex';
        clearTimeout(dupHud._hideTimer);
        dupHud._hideTimer = setTimeout(() => {
            if (dupHud) dupHud.style.display = 'none';
        }, 2400);
    }
}

function validateInboundPrerequisitesForCamera() {
    // ในโหมดทดสอบสามารถยิงทดสอบอ่านบาร์โค้ดได้ทันทีโดยไม่ต้องกรอก SKU/แถวก่อน
    if (isCameraTestMode) return true;

    const category = (document.getElementById('inboundCategory')?.value || '').trim();
    const name = (document.getElementById('inboundName')?.value || '').trim();
    if (!category || !name) {
        const now = Date.now();
        if (now - lastPrecheckToastTime > 2000) {
            lastPrecheckToastTime = now;
            playAudioFeedback('error');
            showToast('⚠️ กรุณาระบุหมวดหมู่ SKU และชื่อรุ่นสินค้าก่อนสแกนรับเข้า', true);
        }
        return false;
    }

    if (typeof getSelectedLocationFromDropdowns === 'function') {
        const loc = getSelectedLocationFromDropdowns();
        if (!loc || loc.includes('โปรดเลือก') || loc === '') {
            const now = Date.now();
            if (now - lastPrecheckToastTime > 2000) {
                lastPrecheckToastTime = now;
                playAudioFeedback('error');
                showToast('⚠️ กรุณาเลือกแถวจัดเก็บคลังสินค้าก่อนสแกนรับเข้า!', true);
            }
            return false;
        }
    }

    return true;
}

function onCameraBarcodeDetected(scannedCode, options = {}) {
    if (!isCameraScannerActive) return;

    // หากเปิดโหมด "เฉพาะตอนกดปุ่มเท่านั้น" ให้รับเฉพาะคำสั่งที่มาจากการกดปุ่มเท่านั้น
    if (cameraTriggerPrefs.triggerOnlyMode && !options.fromManualTrigger) {
        return;
    }

    // กรองเฉพาะอักขระควบคุมที่มองไม่เห็น โดยรักษาความยาวและอักขระจริงของ SN ครบถ้วน 100%
    const cleanCode = String(scannedCode || '').replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '').trim();
    if (!cleanCode) return;

    const codeUpper = cleanCode.toUpperCase();

    // 🛑 หาก S/N ซ้ำกัน ไม่ต้องตรวจจับ (ตรวจจับเฉพาะครั้งเดียวเท่านั้น จนกว่าจะกดรีเซ็ตกันซ้ำรอบนี้)
    if (isSerialNumberAlreadyCapturedOrInStock(cleanCode)) {
        showCameraDuplicateSkippedNotice(cleanCode);
        return;
    }

    // ตรวจสอบความพร้อมของข้อมูล SKU และแถวจัดเก็บก่อนบันทึก
    if (!validateInboundPrerequisitesForCamera()) {
        return;
    }

    // ล็อก S/N นี้ทันทีใน 0ms เพื่อไม่ให้ตรวจจับซ้ำอีกจากเฟรมถัดไป
    cameraSessionScannedSet.add(codeUpper);
    updateCameraSessionGuardCounterUI();
    lastCameraScannedCode = codeUpper;
    lastCameraScannedTime = Date.now();

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

    if (isCameraTestMode) {
        // โหมดทดสอบ: แสดงผลและเสียงตอบรับทันทีโดยไม่บันทึกลงคลังจริง
        playAudioFeedback('success');
        cameraSessionScanCount++;

        if (isContinuousCameraScanMode) {
            const hud = document.getElementById('cameraLiveLastScanHud');
            const lastTxt = document.getElementById('cameraLastScanCodeText');
            const badge = document.getElementById('cameraSessionBadge');
            if (hud && lastTxt && badge) {
                hud.style.display = 'flex';
                lastTxt.textContent = `[ทดสอบ] ${cleanCode}`;
                badge.textContent = `${cameraSessionScanCount} ชิ้น`;
            }
            const statusText = document.getElementById('cameraScannerStatusText');
            if (statusText) {
                statusText.textContent = `🧪 อ่านทดสอบสำเร็จ: ${cleanCode} (กด "รีเซ็ตกันซ้ำรอบนี้" เพื่อยิงซ้ำ)`;
            }
        } else {
            closeCameraScanner();
            showToast(`🧪 ทดสอบสแกน 1 ครั้งสำเร็จ: ${cleanCode} (ไม่ได้บันทึกลง DB จริง)`, false, 2800);
        }
        return;
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
        // โหมดยิง 1 ครั้ง: ปิดและหยุดการทำงานของกล้องทันที แล้วบันทึกรายการ
        closeCameraScanner();
        handleInboundSubmit();
    }
}

function closeCameraScanner() {
    cameraSessionGenerationId++;
    isCameraScannerActive = false;
    isTorchOn = false;
    isBindingCustomCameraKey = false;
    isProcessingCameraFrameDetection = false;

    detachCameraHardwareControls();

    // 1. สั่งหยุดฮาร์ดแวร์กล้องทุก Track ทันทีแบบ Synchronous 0ms
    forceKillAllCameraHardwareStreams();

    // 2. เคลียร์ไลบรารี Html5Qrcode และ DOM ภายใน
    stopActiveCameraStreamsOnly();

    const torchBtn = document.getElementById('btnCameraTorchToggle');
    if (torchBtn) torchBtn.style.background = 'var(--bg-subtle, #f1f5f9)';

    const modal = document.getElementById('cameraScannerModal');
    if (modal) modal.style.display = 'none';

    ensureSnInputFocus(true);
}

function simulateCameraScanSuccess() {
    const sampleSn = 'SN-' + Math.floor(100000 + Math.random() * 900000);
    onCameraBarcodeDetected(sampleSn, { fromManualTrigger: true });
}

if (typeof window !== 'undefined') {
    window.setCameraScanMode = setCameraScanMode;
    window.toggleCameraTestMode = toggleCameraTestMode;
    window.resetCameraSessionDuplicateGuard = resetCameraSessionDuplicateGuard;
    window.toggleCameraTriggerOption = toggleCameraTriggerOption;
    window.toggleCameraTriggerOnlyMode = toggleCameraTriggerOnlyMode;
    window.startBindCustomCameraTriggerKey = startBindCustomCameraTriggerKey;
    window.triggerManualCameraShutterScan = triggerManualCameraShutterScan;
}