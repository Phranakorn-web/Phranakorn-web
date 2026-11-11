// =========================================================================
// --- MODULE: UTILITIES, NOTIFICATION & VOICE AUDIO ENGINE ---
// =========================================================================

// 1. Safe HTML Sanitizer
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 2. Format Location Display Code
function formatLocationCode(loc) {
    if (!loc) return 'DOCK';
    const clean = String(loc).trim().toUpperCase();
    if (clean === 'DOCK' || clean === 'OFFICE' || clean === 'PENDING') return clean;
    return clean;
}

// 3. Web Audio API Synthesizer ( sound effects without external MP3 files)
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playSuccessSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
}

function playErrorSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        osc.frequency.exponentialRampToValueAtTime(130.81, ctx.currentTime + 0.25); // C3
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
    } catch(e) {}
}

// 4. Speech Synthesis Engine (AI Voice)
let isVoiceAlertEnabled = true;

function speakThaiText(text) {
    if (!isVoiceAlertEnabled || !('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'th-TH';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    } catch(e) {}
}

function toggleVoiceAudioAlert() {
    isVoiceAlertEnabled = !isVoiceAlertEnabled;
    const btn = document.getElementById('voiceToggleBtn');
    if (btn) {
        if (isVoiceAlertEnabled) {
            btn.innerHTML = `<i class="fa-solid fa-volume-high" style="color:var(--success);"></i> AI Voice On`;
            showToast("🔊 เปิดการแจ้งเตือนด้วยเสียง AI แล้ว");
            speakThaiText("เปิดระบบแจ้งเตือนเสียงเรียบร้อยค่ะ");
        } else {
            btn.innerHTML = `<i class="fa-solid fa-volume-xmark" style="color:var(--danger);"></i> AI Voice Off`;
            showToast("🔇 ปิดการแจ้งเตือนด้วยเสียง AI แล้ว");
        }
    }
}

// 5. Toast Alert Notification
let toastTimer = null;

function showToast(message, isError = false) {
    const toast = document.getElementById('toastAlert');
    const msgElem = document.getElementById('toastMessage');
    if (!toast || !msgElem) return;

    msgElem.innerHTML = message;
    toast.className = `toast show ${isError ? 'error' : 'success'}`;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.className = 'toast';
    }, 3200);
}

// 6. Copy Text to Clipboard
async function copyTextToClipboard(text, label = 'ข้อความ') {
    try {
        await navigator.clipboard.writeText(text);
        playSuccessSound();
        showToast(`คัดลอก ${label} เรียบร้อย: ${text}`);
    } catch (err) {
        showToast(`❌ ไม่สามารถคัดลอกได้: ${err.message}`, true);
    }
}

// Global Export 100%
window.escapeHTML = escapeHTML;
window.formatLocationCode = formatLocationCode;
window.playSuccessSound = playSuccessSound;
window.playErrorSound = playErrorSound;
window.speakThaiText = speakThaiText;
window.toggleVoiceAudioAlert = toggleVoiceAudioAlert;
window.showToast = showToast;
window.copyTextToClipboard = copyTextToClipboard;