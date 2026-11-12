// =========================================================================
// --- MODULE: DEDICATED HIGH-PERFORMANCE BARCODE & STICKER PRINT STUDIO ---
// --- FILE: barcode-print.js (v2026.5 FULLSCREEN LINKED TAB & PDF STUDIO) ---
// --- SUPPORTS 1 TO 10,000+ SERIALS WITH ZERO ABOUT:BLANK WHITE SCREEN ---
// =========================================================================

(function () {
    'use strict';

    // ป้องกันการโหลดซ้ำ
    if (window.WMSBarcodeStudioLoaded) return;
    window.WMSBarcodeStudioLoaded = true;

    // ---------------------------------------------------------------------
    // 1. STATE & CONFIGURATION
    // ---------------------------------------------------------------------
    const BARCODE_PRESETS = {
        'A4': {
            id: 'A4',
            label: 'กระดาษ A4 มาตรฐาน (24 ดวง/หน้า : 3×8)',
            type: 'a4',
            cols: 3,
            rows: 8,
            perPage: 24,
            widthMm: 210,
            heightMm: 297,
            bcWidth: 1.25,
            bcHeight: 28,
            bcFontSize: 10
        },
        'A4-30': {
            id: 'A4-30',
            label: 'กระดาษ A4 สติกเกอร์กลาง (30 ดวง/หน้า : 3×10)',
            type: 'a4',
            cols: 3,
            rows: 10,
            perPage: 30,
            widthMm: 210,
            heightMm: 297,
            bcWidth: 1.15,
            bcHeight: 22,
            bcFontSize: 9
        },
        'A4-40': {
            id: 'A4-40',
            label: 'กระดาษ A4 สติกเกอร์เล็ก (40 ดวง/หน้า : 4×10)',
            type: 'a4',
            cols: 4,
            rows: 10,
            perPage: 40,
            widthMm: 210,
            heightMm: 297,
            bcWidth: 1.0,
            bcHeight: 20,
            bcFontSize: 8
        },
        '50x30': {
            id: '50x30',
            label: 'Thermal 50 × 30 mm (มาตรฐานคลังสินค้า)',
            type: 'thermal',
            perPage: 20, // จำนวนต่อหน้าในหน้าต่าง Preview
            widthMm: 50,
            heightMm: 30,
            bcWidth: 1.35,
            bcHeight: 32,
            bcFontSize: 11
        },
        '40x30': {
            id: '40x30',
            label: 'Thermal 40 × 30 mm (ดวงเล็ก)',
            type: 'thermal',
            perPage: 24,
            widthMm: 40,
            heightMm: 30,
            bcWidth: 1.15,
            bcHeight: 26,
            bcFontSize: 10
        },
        '60x40': {
            id: '60x40',
            label: 'Thermal 60 × 40 mm (ขนาดกลาง)',
            type: 'thermal',
            perPage: 16,
            widthMm: 60,
            heightMm: 40,
            bcWidth: 1.55,
            bcHeight: 40,
            bcFontSize: 12
        },
        '100x75': {
            id: '100x75',
            label: 'Thermal 100 × 75 mm (ปะกล่องใหญ่)',
            type: 'thermal',
            perPage: 8,
            widthMm: 100,
            heightMm: 75,
            bcWidth: 2.1,
            bcHeight: 62,
            bcFontSize: 15
        },
        '100x150': {
            id: '100x150',
            label: 'Thermal 100 × 150 mm (4×6 นิ้ว ใบปะหน้า)',
            type: 'thermal',
            perPage: 4,
            widthMm: 100,
            heightMm: 150,
            bcWidth: 2.4,
            bcHeight: 96,
            bcFontSize: 17
        },
        'CUSTOM': {
            id: 'CUSTOM',
            label: 'กำหนดขนาด กว้าง × สูง (mm) เอง',
            type: 'thermal',
            perPage: 16,
            widthMm: 50,
            heightMm: 30,
            bcWidth: 1.35,
            bcHeight: 32,
            bcFontSize: 11
        }
    };

    const studioState = {
        rawItems: [],          // รายการสินค้าต้นฉบับที่ส่งเข้ามาพิมพ์
        filteredItems: [],     // รายการหลังกรองคำค้นหาในหน้าพิมพ์
        expandedLabels: [],    // รายการที่ขยายตามจำนวนสำเนา (Copies)
        sizeKey: 'A4',
        customWidthMm: 50,
        customHeightMm: 30,
        copiesPerSn: 1,
        showName: true,
        showSku: true,
        showLocation: true,
        showMeter: false,
        showBorder: true,
        searchQuery: '',
        currentPage: 1,
        totalPages: 1,
        pageRangeMode: 'ALL',  // 'ALL' | 'RANGE'
        pageFrom: 1,
        pageTo: 1,
        zoomPercent: 100,      // ระดับการซูมพรีวิว (50 - 150)
        isStudioFullscreen: false,
        isSpooling: false,
        cancelSpoolRequested: false,
        barcodeDataCache: new Map(), // Cache ภาพบาร์โค้ดระดับ S/N ลดการคำนวณซ้ำ
        linkedTabWindow: null,       // อ้างอิงหน้าต่างแท็บพิมพ์แยกที่เปิดอยู่
        realtimeSyncTimer: null,     // Debounce timer สำหรับซิงค์เรียลไทม์
        realtimeChannel: null        // BroadcastChannel สำหรับสื่อสารข้ามแท็บ
    };

    // ซิงค์ตัวแปร Global เดิมเพื่อความเข้ากันได้ 100%
    window.currentPrintBarcodeList = window.currentPrintBarcodeList || [];

    // ---------------------------------------------------------------------
    // 2. SAFE HELPERS
    // ---------------------------------------------------------------------
    function safeEscape(str) {
        if (typeof window.escapeHTML === 'function') return window.escapeHTML(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function safeFormatLoc(loc) {
        if (typeof window.formatLocationCode === 'function') return window.formatLocationCode(loc);
        return loc ? String(loc).toUpperCase() : 'DOCK';
    }

    function notifyUser(msg, isError = false) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, isError);
        } else {
            alert(msg);
        }
    }

    function getActivePreset() {
        const base = BARCODE_PRESETS[studioState.sizeKey] || BARCODE_PRESETS['A4'];
        if (studioState.sizeKey === 'CUSTOM') {
            const w = Math.max(20, Math.min(300, Number(studioState.customWidthMm) || 50));
            const h = Math.max(15, Math.min(400, Number(studioState.customHeightMm) || 30));
            const scale = Math.min(2.6, Math.max(0.9, w / 42));
            return {
                ...base,
                widthMm: w,
                heightMm: h,
                bcWidth: Number((1.2 * scale).toFixed(2)),
                bcHeight: Math.round(Math.min(110, Math.max(20, h * 0.45 * 2.4))),
                bcFontSize: Math.round(Math.min(18, Math.max(8, 9 * scale)))
            };
        }
        return base;
    }

    // ---------------------------------------------------------------------
    // 3. ULTRA-FAST VECTOR SVG BARCODE GENERATOR (20X FASTER THAN PNG)
    // ---------------------------------------------------------------------
    let sharedOffscreenSvg = null;
    let sharedXmlSerializer = null;

    function getBarcodeImageDataUrl(snText, preset) {
        const cleanSn = String(snText || 'NO-SN').trim();
        const cacheKey = `${cleanSn}|${preset.bcWidth}|${preset.bcHeight}|${preset.bcFontSize}`;

        if (studioState.barcodeDataCache.has(cacheKey)) {
            return studioState.barcodeDataCache.get(cacheKey);
        }

        // รองรับ Cache สูงสุด 25,000 รายการ (Vector SVG กิน RAM น้อยมาก)
        if (studioState.barcodeDataCache.size > 25000) {
            const firstKey = studioState.barcodeDataCache.keys().next().value;
            studioState.barcodeDataCache.delete(firstKey);
        }

        let dataUrl = '';
        if (typeof window.JsBarcode === 'function') {
            try {
                if (!sharedOffscreenSvg) {
                    sharedOffscreenSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                }
                if (!sharedXmlSerializer && typeof XMLSerializer !== 'undefined') {
                    sharedXmlSerializer = new XMLSerializer();
                }

                window.JsBarcode(sharedOffscreenSvg, cleanSn, {
                    format: 'CODE128',
                    width: preset.bcWidth,
                    height: preset.bcHeight,
                    displayValue: true,
                    fontSize: preset.bcFontSize,
                    font: 'monospace',
                    fontOptions: 'bold',
                    textMargin: 2,
                    margin: 2,
                    background: '#ffffff',
                    lineColor: '#000000'
                });

                const svgString = sharedXmlSerializer
                    ? sharedXmlSerializer.serializeToString(sharedOffscreenSvg)
                    : sharedOffscreenSvg.outerHTML;

                dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
            } catch (err) {
                dataUrl = generateFallbackSvgDataUrl(cleanSn, preset);
            }
        } else {
            dataUrl = generateFallbackSvgDataUrl(cleanSn, preset);
        }

        studioState.barcodeDataCache.set(cacheKey, dataUrl);
        return dataUrl;
    }

    // Pure-JS Fallback SVG กรณีไม่มีอินเทอร์เน็ตหรือ JsBarcode ไม่โหลด
    function generateFallbackSvgDataUrl(text, preset) {
        const h = preset.bcHeight || 30;
        const fs = preset.bcFontSize || 10;
        let bars = '';
        let x = 6;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            const w1 = (code % 2 === 0) ? 2 : 1;
            const w2 = ((code >> 1) % 2 === 0) ? 1 : 2;
            bars += `<rect x="${x}" y="2" width="${w1}" height="${h}" fill="#000"/>`;
            x += w1 + 1;
            bars += `<rect x="${x}" y="2" width="${w2}" height="${h}" fill="#000"/>`;
            x += w2 + 2;
        }
        const totalW = Math.max(90, x + 6);
        const totalH = h + fs + 8;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
            <rect width="100%" height="100%" fill="#ffffff"/>
            ${bars}
            <text x="${totalW / 2}" y="${h + fs + 3}" font-family="monospace" font-size="${fs}" font-weight="bold" text-anchor="middle" fill="#000">${safeEscape(text)}</text>
        </svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // ---------------------------------------------------------------------
    // 4. SCOPED MODERN UX/UI STYLES INJECTION
    // ---------------------------------------------------------------------
    function injectBarcodeStudioStyles() {
        if (document.getElementById('wmsBarcodeStudioStyles')) return;
        const style = document.createElement('style');
        style.id = 'wmsBarcodeStudioStyles';
        style.textContent = `
            /* Global Floating Barcode Loading Popup */
            .wms-bp-global-loading {
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                height: 100dvh !important;
                background: rgba(15, 23, 42, 0.72) !important;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 100800 !important;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
                opacity: 0;
                transition: opacity 0.18s ease;
            }
            .wms-bp-global-loading.is-visible {
                opacity: 1;
            }
            .wms-bp-global-card {
                background: var(--bg-surface, #ffffff);
                color: var(--text-main, #0f172a);
                border: 1px solid var(--border-strong, #cbd5e1);
                border-radius: 20px;
                width: 100%;
                max-width: 440px;
                padding: 28px 24px 22px 24px;
                text-align: center;
                box-shadow: 0 25px 60px -12px rgba(15, 23, 42, 0.48);
                position: relative;
                overflow: hidden;
                transform: translate3d(0, 8px, 0) scale(0.97);
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .wms-bp-global-loading.is-visible .wms-bp-global-card {
                transform: translate3d(0, 0, 0) scale(1);
            }
            .wms-bp-global-card::before {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0;
                height: 4px;
                background: linear-gradient(90deg, #2563eb 0%, #6366f1 50%, #10b981 100%);
            }
            .wms-bp-global-icon-ring {
                width: 68px;
                height: 68px;
                margin: 0 auto 14px auto;
                border-radius: 50%;
                background: var(--primary-light, #eff6ff);
                border: 1px solid var(--primary-border, #bfdbfe);
                color: var(--primary, #2563eb);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.7rem;
                position: relative;
            }
            .wms-bp-global-icon-ring::after {
                content: '';
                position: absolute;
                inset: -4px;
                border-radius: 50%;
                border: 3px solid transparent;
                border-top-color: #2563eb;
                border-right-color: #6366f1;
                animation: wmsBpSpinRing 0.85s linear infinite;
            }
            .wms-bp-global-icon-ring.is-done {
                background: var(--success-light, #ecfdf5);
                border-color: var(--success-border, #a7f3d0);
                color: var(--success, #059669);
            }
            .wms-bp-global-icon-ring.is-done::after {
                animation: none;
                border-color: transparent;
            }
            @keyframes wmsBpSpinRing {
                to { transform: rotate(360deg); }
            }
            .wms-bp-global-pill {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                padding: 4px 12px;
                border-radius: 999px;
                background: var(--bg-subtle, #f8fafc);
                border: 1px solid var(--border-color, #e2e8f0);
                color: var(--text-sub, #334155);
                font-size: 0.76rem;
                font-weight: 700;
                margin-bottom: 10px;
            }
            .wms-bp-global-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #2563eb;
                animation: wmsBpPulseDot 1.4s infinite;
            }
            @keyframes wmsBpPulseDot {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.5; transform: scale(1.3); }
            }

            /* Studio Modal Overlay */
            #printBarcodeModal.wms-bp-overlay {
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                height: 100dvh !important;
                background: rgba(15, 23, 42, 0.78) !important;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 100350 !important;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 12px;
                box-sizing: border-box;
                transition: padding 0.2s ease;
            }
            #printBarcodeModal.wms-bp-overlay.is-fullscreen {
                padding: 0 !important;
            }
            .wms-bp-dialog {
                width: min(1440px, 100%);
                height: min(93vh, 940px);
                height: min(93dvh, 940px);
                background: var(--bg-surface, #ffffff);
                color: var(--text-main, #0f172a);
                border: 1px solid var(--border-strong, #cbd5e1);
                border-radius: 18px;
                box-shadow: 0 25px 60px -12px rgba(15, 23, 42, 0.45);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                position: relative;
                transition: width 0.2s ease, height 0.2s ease, border-radius 0.2s ease;
            }
            #printBarcodeModal.wms-bp-overlay.is-fullscreen .wms-bp-dialog {
                width: 100vw !important;
                height: 100vh !important;
                height: 100dvh !important;
                max-width: none !important;
                max-height: none !important;
                border-radius: 0 !important;
                border: none !important;
            }
            .wms-bp-dialog::before {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0;
                height: 3px;
                background: linear-gradient(90deg, #2563eb 0%, #6366f1 50%, #10b981 100%);
                z-index: 5;
            }
            .wms-bp-header {
                padding: 14px 20px;
                background: var(--bg-subtle, #f8fafc);
                border-bottom: 1px solid var(--border-color, #e2e8f0);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
                flex-shrink: 0;
            }
            .wms-bp-header-left {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .wms-bp-icon {
                width: 42px;
                height: 42px;
                border-radius: 12px;
                background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.2rem;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
                flex-shrink: 0;
            }
            .wms-bp-title {
                font-size: 1.1rem;
                font-weight: 800;
                margin: 0;
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .wms-bp-subtitle {
                font-size: 0.78rem;
                color: var(--text-muted, #64748b);
            }
            .wms-bp-badges {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .wms-bp-stat-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 5px 12px;
                border-radius: 999px;
                font-size: 0.8rem;
                font-weight: 700;
                background: var(--primary-light, #eff6ff);
                border: 1px solid var(--primary-border, #bfdbfe);
                color: var(--primary-text, #1d4ed8);
            }
            .wms-bp-stat-pill.is-green {
                background: var(--success-light, #ecfdf5);
                border-color: var(--success-border, #a7f3d0);
                color: var(--success-text, #047857);
            }
            .wms-bp-stat-pill.is-live {
                background: #eef2ff;
                border-color: #c7d2fe;
                color: #4338ca;
            }
            .wms-bp-close-btn {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border: 1px solid var(--border-strong, #cbd5e1);
                background: var(--bg-surface, #ffffff);
                color: var(--text-sub, #334155);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 1rem;
                transition: all 0.18s ease;
            }
            .wms-bp-close-btn:hover {
                background: var(--danger-light, #fef2f2);
                color: var(--danger, #dc2626);
                border-color: var(--danger-border, #fecaca);
                transform: rotate(90deg);
            }
            .wms-bp-expand-btn {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border: 1px solid var(--border-strong, #cbd5e1);
                background: var(--bg-surface, #ffffff);
                color: var(--text-sub, #334155);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 0.95rem;
                transition: all 0.18s ease;
            }
            .wms-bp-expand-btn:hover {
                background: var(--primary-light, #eff6ff);
                color: var(--primary, #2563eb);
                border-color: var(--primary-border, #bfdbfe);
            }

            /* 2-Column Studio Body */
            .wms-bp-body {
                flex: 1 1 auto;
                min-height: 0;
                display: grid;
                grid-template-columns: 340px 1fr;
                overflow: hidden;
            }
            .wms-bp-sidebar {
                background: var(--bg-surface, #ffffff);
                border-right: 1px solid var(--border-color, #e2e8f0);
                padding: 16px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .wms-bp-section {
                background: var(--bg-subtle, #f8fafc);
                border: 1px solid var(--border-color, #e2e8f0);
                border-radius: 12px;
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .wms-bp-section-title {
                font-size: 0.82rem;
                font-weight: 800;
                color: var(--text-main, #0f172a);
                display: flex;
                align-items: center;
                gap: 6px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            .wms-bp-toggle-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }
            .wms-bp-check-label {
                display: flex;
                align-items: center;
                gap: 7px;
                font-size: 0.8rem;
                font-weight: 600;
                color: var(--text-sub, #334155);
                background: var(--bg-surface, #ffffff);
                border: 1px solid var(--border-color, #e2e8f0);
                padding: 6px 9px;
                border-radius: 8px;
                cursor: pointer;
                user-select: none;
            }
            .wms-bp-check-label:hover {
                border-color: var(--primary, #2563eb);
            }
            .wms-bp-check-label input {
                accent-color: var(--primary, #2563eb);
                width: 15px;
                height: 15px;
            }

            /* Right Preview Canvas */
            .wms-bp-workspace {
                background: #e2e8f0;
                display: flex;
                flex-direction: column;
                min-height: 0;
                overflow: hidden;
            }
            html[data-theme="dark"] .wms-bp-workspace {
                background: #0b1120;
            }
            .wms-bp-pager-bar {
                padding: 10px 18px;
                background: var(--bg-surface, #ffffff);
                border-bottom: 1px solid var(--border-color, #e2e8f0);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                flex-wrap: wrap;
                flex-shrink: 0;
            }
            .wms-bp-pager-controls {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }
            .wms-bp-page-input {
                width: 64px;
                height: 32px;
                text-align: center;
                border: 1px solid var(--border-strong, #cbd5e1);
                border-radius: 7px;
                background: var(--bg-subtle, #f8fafc);
                color: var(--text-main, #0f172a);
                font-family: 'JetBrains Mono', monospace;
                font-weight: 700;
                font-size: 0.85rem;
            }
            .wms-bp-preview-scroll {
                flex: 1 1 auto;
                overflow: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 14px;
            }
            .wms-bp-zoom-stage {
                transform-origin: top center;
                transition: transform 0.14s ease-out;
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 100%;
            }

            /* Realistic Paper & Sticker Cards */
            .wms-bp-a4-sheet {
                width: 210mm;
                min-height: 297mm;
                background: #ffffff;
                color: #000000;
                padding: 5mm;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
                border-radius: 4px;
                display: grid;
                gap: 2.5mm 3mm;
                box-sizing: border-box;
                flex-shrink: 0;
            }
            .wms-bp-thermal-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 14px;
                justify-content: center;
                align-items: flex-start;
                width: 100%;
                max-width: 1020px;
            }
            .wms-bp-sticker {
                background: #ffffff;
                color: #000000;
                border-radius: 4px;
                padding: 2.2mm 2.8mm;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                text-align: center;
                overflow: hidden;
                position: relative;
                box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
            }
            .wms-bp-sticker.has-border {
                border: 1px solid #1e293b;
            }
            .wms-bp-sticker.no-border {
                border: 1px dashed #cbd5e1;
            }
            .wms-bp-st-name {
                font-weight: 800;
                font-size: 0.72rem;
                line-height: 1.15;
                color: #000000;
                width: 100%;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                word-break: break-word;
            }
            .wms-bp-st-barcode {
                flex: 1 1 auto;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                min-height: 0;
                padding: 1px 0;
            }
            .wms-bp-st-barcode img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                display: block;
            }
            .wms-bp-st-meta {
                width: 100%;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 4px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.62rem;
                font-weight: 700;
                color: #000000;
                border-top: 1px solid #e2e8f0;
                padding-top: 2px;
            }
            .wms-bp-st-meta span {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            /* Footer Action Bar */
            .wms-bp-footer {
                padding: 12px 20px;
                background: var(--bg-subtle, #f8fafc);
                border-top: 1px solid var(--border-color, #e2e8f0);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
                flex-shrink: 0;
            }

            /* Fullscreen Modern PDF Viewer Popup */
            .wms-bp-pdf-popup {
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                height: 100dvh !important;
                background: #0f172a !important;
                z-index: 100650 !important;
                display: none;
                flex-direction: column;
                overflow: hidden;
            }
            .wms-bp-pdf-bar {
                padding: 12px 20px;
                background: linear-gradient(90deg, #0f172a 0%, #1e293b 100%);
                color: #ffffff;
                border-bottom: 1px solid #334155;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
                flex-shrink: 0;
            }
            .wms-bp-pdf-body {
                flex: 1 1 auto;
                min-height: 0;
                background: #334155;
                position: relative;
                display: flex;
                flex-direction: column;
            }
            .wms-bp-pdf-frame {
                width: 100%;
                height: 100%;
                border: 0;
                background: #e2e8f0;
                flex: 1 1 auto;
            }

            /* Print Spooler Progress Overlay */
            .wms-bp-spool-overlay {
                position: absolute;
                inset: 0;
                background: rgba(15, 23, 42, 0.84);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 50;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .wms-bp-spool-card {
                background: var(--bg-surface, #ffffff);
                color: var(--text-main, #0f172a);
                border: 1px solid var(--border-strong, #cbd5e1);
                border-radius: 20px;
                padding: 28px 24px 22px 24px;
                width: 100%;
                max-width: 450px;
                text-align: center;
                box-shadow: 0 25px 55px rgba(0, 0, 0, 0.45);
                position: relative;
                overflow: hidden;
            }
            .wms-bp-spool-card::before {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0;
                height: 4px;
                background: linear-gradient(90deg, #2563eb 0%, #6366f1 50%, #10b981 100%);
            }
            .wms-bp-progress-track {
                width: 100%;
                height: 10px;
                background: var(--bg-subtle-accent, #e2e8f0);
                border-radius: 999px;
                overflow: hidden;
                margin: 14px 0 8px 0;
            }
            .wms-bp-progress-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #2563eb 0%, #6366f1 55%, #10b981 100%);
                transition: width 0.12s ease-out;
            }

            @media (max-width: 960px) {
                .wms-bp-body {
                    grid-template-columns: 1fr;
                    grid-template-rows: auto 1fr;
                }
                .wms-bp-sidebar {
                    max-height: 36vh;
                    border-right: none;
                    border-bottom: 1px solid var(--border-color, #e2e8f0);
                }
                .wms-bp-a4-sheet {
                    transform: scale(0.72);
                    transform-origin: top center;
                    margin-bottom: -75mm;
                }
            }

            @media (max-width: 600px) {
                #printBarcodeModal.wms-bp-overlay {
                    padding: 0 !important;
                }
                .wms-bp-dialog {
                    width: 100vw !important;
                    height: 100vh !important;
                    height: 100dvh !important;
                    border-radius: 0 !important;
                }
                .wms-bp-header {
                    padding: 10px 14px;
                }
                .wms-bp-footer {
                    padding: 10px 14px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------------------
    // 4.5 GLOBAL FLOATING LOADING POPUP FOR BARCODE OPERATIONS
    // ---------------------------------------------------------------------
    let globalLoadingHideTimer = null;

    function ensureGlobalBarcodeLoadingPopup() {
        injectBarcodeStudioStyles();
        let popup = document.getElementById('wmsBpGlobalLoadingModal');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'wmsBpGlobalLoadingModal';
            popup.className = 'wms-bp-global-loading';
            popup.setAttribute('role', 'status');
            popup.setAttribute('aria-live', 'polite');
            popup.innerHTML = `
                <div class="wms-bp-global-card">
                    <div class="wms-bp-global-icon-ring" id="wmsBpGlobalIconRing">
                        <i class="fa-solid fa-barcode" id="wmsBpGlobalIcon"></i>
                    </div>
                    <div class="wms-bp-global-pill" id="wmsBpGlobalBadge">
                        <span class="wms-bp-global-dot"></span> ระบบพิมพ์บาร์โค้ดความเร็วสูง
                    </div>
                    <h4 style="margin:0 0 6px 0; font-size:1.12rem; font-weight:800;" id="wmsBpGlobalTitle">กำลังเตรียมข้อมูลบาร์โค้ด...</h4>
                    <p style="margin:0 0 14px 0; font-size:0.84rem; color:var(--text-muted); line-height:1.45;" id="wmsBpGlobalSubtitle">กรุณารอสักครู่ ระบบกำลังจัดเรียงรายการสติกเกอร์</p>
                    <div class="wms-bp-progress-track">
                        <div class="wms-bp-progress-fill" id="wmsBpGlobalProgressBar" style="width: 20%;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:700; color:var(--text-sub); margin-bottom:14px;">
                        <span id="wmsBpGlobalCounter">กำลังเตรียมรายการ...</span>
                        <span class="mono" id="wmsBpGlobalPct">20%</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-danger" id="wmsBpGlobalCancelBtn" style="display:none;" onclick="WMSBarcodeStudio.cancelSpooling()">
                        <i class="fa-solid fa-stop"></i> ยกเลิกการทำงาน
                    </button>
                </div>
            `;
            document.body.appendChild(popup);
        }
        return popup;
    }

    function showGlobalBarcodeLoadingPopup(title, subtitle, percent = 20, counterText = 'กำลังเตรียมข้อมูล...', showCancel = false) {
        if (globalLoadingHideTimer) {
            clearTimeout(globalLoadingHideTimer);
            globalLoadingHideTimer = null;
        }
        const popup = ensureGlobalBarcodeLoadingPopup();
        const ring = document.getElementById('wmsBpGlobalIconRing');
        const icon = document.getElementById('wmsBpGlobalIcon');
        const titleEl = document.getElementById('wmsBpGlobalTitle');
        const subEl = document.getElementById('wmsBpGlobalSubtitle');
        const barEl = document.getElementById('wmsBpGlobalProgressBar');
        const cntEl = document.getElementById('wmsBpGlobalCounter');
        const pctEl = document.getElementById('wmsBpGlobalPct');
        const cancelBtn = document.getElementById('wmsBpGlobalCancelBtn');

        if (ring) ring.classList.remove('is-done');
        if (icon) icon.className = 'fa-solid fa-barcode';
        if (titleEl && title) titleEl.textContent = title;
        if (subEl && subtitle) subEl.textContent = subtitle;
        if (cntEl && counterText) cntEl.textContent = counterText;
        if (cancelBtn) cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';

        const clamped = Math.min(100, Math.max(5, Math.round(percent)));
        if (barEl) barEl.style.width = `${clamped}%`;
        if (pctEl) pctEl.textContent = `${clamped}%`;

        popup.style.display = 'flex';
        requestAnimationFrame(() => {
            popup.classList.add('is-visible');
        });
    }

    function updateGlobalBarcodeLoadingPopup(title, subtitle, percent = null, counterText = null, isDone = false) {
        const popup = document.getElementById('wmsBpGlobalLoadingModal');
        if (!popup || popup.style.display === 'none') return;

        const ring = document.getElementById('wmsBpGlobalIconRing');
        const icon = document.getElementById('wmsBpGlobalIcon');
        const titleEl = document.getElementById('wmsBpGlobalTitle');
        const subEl = document.getElementById('wmsBpGlobalSubtitle');
        const barEl = document.getElementById('wmsBpGlobalProgressBar');
        const cntEl = document.getElementById('wmsBpGlobalCounter');
        const pctEl = document.getElementById('wmsBpGlobalPct');

        if (title && titleEl) titleEl.textContent = title;
        if (subtitle && subEl) subEl.textContent = subtitle;
        if (counterText !== null && cntEl) cntEl.textContent = counterText;

        if (percent !== null) {
            const clamped = Math.min(100, Math.max(0, Math.round(percent)));
            if (barEl) barEl.style.width = `${clamped}%`;
            if (pctEl) pctEl.textContent = `${clamped}%`;
        }

        if (isDone) {
            if (ring) ring.classList.add('is-done');
            if (icon) icon.className = 'fa-solid fa-circle-check';
        }
    }

    function hideGlobalBarcodeLoadingPopup(delayMs = 0) {
        const popup = document.getElementById('wmsBpGlobalLoadingModal');
        if (!popup) return;
        if (globalLoadingHideTimer) clearTimeout(globalLoadingHideTimer);

        const doHide = () => {
            popup.classList.remove('is-visible');
            globalLoadingHideTimer = setTimeout(() => {
                popup.style.display = 'none';
                globalLoadingHideTimer = null;
            }, 190);
        };

        if (delayMs > 0) {
            globalLoadingHideTimer = setTimeout(doHide, delayMs);
        } else {
            doHide();
        }
    }

    // ---------------------------------------------------------------------
    // 5. BUILD / UPGRADE BARCODE PRINT STUDIO MODAL DOM
    // ---------------------------------------------------------------------
    function ensureBarcodeStudioModal() {
        injectBarcodeStudioStyles();

        let modal = document.getElementById('printBarcodeModal');
        if (modal && modal.dataset.wmsStudioVersion !== '2026.5') {
            modal.remove();
            modal = null;
        }

        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'printBarcodeModal';
            modal.dataset.wmsStudioVersion = '2026.5';
            modal.className = 'wms-bp-overlay modal-overlay';
            modal.style.display = 'none';

            const presetOptionsHtml = Object.values(BARCODE_PRESETS)
                .map(p => `<option value="${p.id}">${safeEscape(p.label)}</option>`)
                .join('');

            modal.innerHTML = `
                <div class="wms-bp-dialog" role="dialog" aria-modal="true" aria-labelledby="wmsBpModalTitle">
                    <!-- Header -->
                    <div class="wms-bp-header">
                        <div class="wms-bp-header-left">
                            <div class="wms-bp-icon"><i class="fa-solid fa-barcode"></i></div>
                            <div>
                                <h3 class="wms-bp-title" id="wmsBpModalTitle">
                                    <span>ศูนย์พิมพ์บาร์โค้ดและสติกเกอร์ (Barcode Print Studio)</span>
                                </h3>
                                <div class="wms-bp-subtitle">รองรับการพิมพ์หลักพัน–หลักหมื่น S/N แบบ Vector SVG ความเร็วสูง เต็มหน้าจอทุกอุปกรณ์</div>
                            </div>
                        </div>

                        <div class="wms-bp-badges">
                            <span class="wms-bp-stat-pill is-live" id="wmsBpLiveTabBadge" style="display:none;">
                                <i class="fa-solid fa-link"></i> ซิงก์แท็บพิมพ์แยกเรียลไทม์
                            </span>
                            <span class="wms-bp-stat-pill" id="printPreviewCountBadge">
                                <i class="fa-solid fa-layer-group"></i> 0 S/N
                            </span>
                            <span class="wms-bp-stat-pill is-green" id="wmsBpTotalStickersBadge">
                                <i class="fa-solid fa-tags"></i> รวม 0 ดวง (1 หน้า)
                            </span>
                            <button type="button" class="wms-bp-expand-btn" id="wmsBpFullscreenBtn" onclick="WMSBarcodeStudio.toggleStudioFullscreen()" title="ขยาย/ย่อเต็มหน้าจอ">
                                <i class="fa-solid fa-expand" id="wmsBpFullscreenIcon"></i>
                            </button>
                            <button type="button" class="wms-bp-close-btn" onclick="closePrintBarcodeModal()" title="ปิดหน้าต่าง (ESC)">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Main 2-Pane Studio -->
                    <div class="wms-bp-body">
                        <!-- Left Controls -->
                        <div class="wms-bp-sidebar">
                            <!-- 1. Paper & Sticker Size -->
                            <div class="wms-bp-section">
                                <div class="wms-bp-section-title">
                                    <i class="fa-solid fa-ruler-combined" style="color:var(--primary);"></i> 1. ขนาดกระดาษ / สติกเกอร์
                                </div>
                                <select id="thermalSizeSelect" class="form-select" onchange="WMSBarcodeStudio.onSettingChange()">
                                    ${presetOptionsHtml}
                                </select>
                                <div id="wmsBpCustomSizeBox" style="display:none; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px;">
                                    <div>
                                        <label style="font-size:0.75rem; font-weight:700;">กว้าง (mm)</label>
                                        <input type="number" id="wmsBpCustomW" class="form-control" value="50" min="20" max="300" onchange="WMSBarcodeStudio.onSettingChange()">
                                    </div>
                                    <div>
                                        <label style="font-size:0.75rem; font-weight:700;">สูง (mm)</label>
                                        <input type="number" id="wmsBpCustomH" class="form-control" value="30" min="15" max="400" onchange="WMSBarcodeStudio.onSettingChange()">
                                    </div>
                                </div>
                            </div>

                            <!-- 2. Copies & Label Fields -->
                            <div class="wms-bp-section">
                                <div class="wms-bp-section-title">
                                    <i class="fa-solid fa-sliders" style="color:var(--success);"></i> 2. รูปแบบข้อมูลบนสติกเกอร์
                                </div>
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                                    <label style="font-size:0.8rem; font-weight:700;">จำนวนสำเนาต่อ 1 S/N:</label>
                                    <input type="number" id="wmsBpCopiesInput" class="form-control" value="1" min="1" max="100" style="width:84px; text-align:center; font-weight:700;" onchange="WMSBarcodeStudio.onSettingChange()">
                                </div>
                                <div class="wms-bp-toggle-grid">
                                    <label class="wms-bp-check-label">
                                        <input type="checkbox" id="wmsBpOptName" checked onchange="WMSBarcodeStudio.onSettingChange()">
                                        <span>ชื่อสินค้า/รุ่น</span>
                                    </label>
                                    <label class="wms-bp-check-label">
                                        <input type="checkbox" id="wmsBpOptSku" checked onchange="WMSBarcodeStudio.onSettingChange()">
                                        <span>รหัส SKU</span>
                                    </label>
                                    <label class="wms-bp-check-label">
                                        <input type="checkbox" id="wmsBpOptLoc" checked onchange="WMSBarcodeStudio.onSettingChange()">
                                        <span>พิกัดจัดเก็บ</span>
                                    </label>
                                    <label class="wms-bp-check-label">
                                        <input type="checkbox" id="wmsBpOptMeter" onchange="WMSBarcodeStudio.onSettingChange()">
                                        <span>เลขมิเตอร์</span>
                                    </label>
                                    <label class="wms-bp-check-label" style="grid-column: span 2;">
                                        <input type="checkbox" id="wmsBpOptBorder" checked onchange="WMSBarcodeStudio.onSettingChange()">
                                        <span>แสดงเส้นกรอบตัดสติกเกอร์</span>
                                    </label>
                                </div>
                            </div>

                            <!-- 3. Queue Filter & Batch Load -->
                            <div class="wms-bp-section">
                                <div class="wms-bp-section-title">
                                    <i class="fa-solid fa-filter" style="color:var(--warning);"></i> 3. จัดการคิว S/N ที่ต้องการพิมพ์
                                </div>
                                <input type="text" id="wmsBpQueueSearch" class="form-control" placeholder="ค้นหา S/N, SKU, พิกัด ในคิวพิมพ์..." oninput="WMSBarcodeStudio.onQueueSearch(this.value)">
                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    <button type="button" class="btn btn-sm btn-secondary" style="flex:1;" onclick="WMSBarcodeStudio.loadAllFilteredFromInventory()" title="ดึงรายการทั้งหมดที่กรองอยู่ในหน้าเช็คสต็อกมาพิมพ์">
                                        <i class="fa-solid fa-boxes-stacked"></i> ดึงทั้งหมดในหน้าสต็อก
                                    </button>
                                </div>
                            </div>

                            <!-- 4. Page Range Print (For 1,000 - 10,000+ SNs) -->
                            <div class="wms-bp-section">
                                <div class="wms-bp-section-title">
                                    <i class="fa-solid fa-copy" style="color:var(--purple, #7c3aed);"></i> 4. ช่วงหน้าที่ต้องการสั่งพิมพ์
                                </div>
                                <select id="wmsBpPageRangeMode" class="form-select" onchange="WMSBarcodeStudio.onPageRangeModeChange(this.value)">
                                    <option value="ALL">พิมพ์ทุกหน้าทั้งหมด (All Pages)</option>
                                    <option value="RANGE">กำหนดช่วงหน้าเอง (เช่น 1 ถึง 50)</option>
                                </select>
                                <div id="wmsBpPageRangeInputs" style="display:none; grid-template-columns:1fr auto 1fr; align-items:center; gap:6px;">
                                    <input type="number" id="wmsBpPageFrom" class="form-control" value="1" min="1" style="text-align:center;" onchange="WMSBarcodeStudio.scheduleRealtimeTabSync()">
                                    <span style="font-weight:700;">ถึง</span>
                                    <input type="number" id="wmsBpPageTo" class="form-control" value="1" min="1" style="text-align:center;" onchange="WMSBarcodeStudio.scheduleRealtimeTabSync()">
                                </div>
                            </div>
                        </div>

                        <!-- Right Live Paginated Preview -->
                        <div class="wms-bp-workspace">
                            <div class="wms-bp-pager-bar">
                                <div style="display:flex; align-items:center; gap:8px; font-size:0.84rem; font-weight:700;">
                                    <i class="fa-solid fa-file-lines" style="color:var(--primary);"></i>
                                    <span id="wmsBpPageStatusText">ตัวอย่างหน้าที่ 1 / 1</span>
                                </div>

                                <div class="wms-bp-pager-controls">
                                    <button type="button" class="btn btn-sm btn-secondary" onclick="WMSBarcodeStudio.adjustZoom(-15)" title="ย่อขนาดพรีวิว">
                                        <i class="fa-solid fa-magnifying-glass-minus"></i>
                                    </button>
                                    <span class="mono font-bold" id="wmsBpZoomLabel" style="font-size:0.8rem; min-width:44px; text-align:center;">100%</span>
                                    <button type="button" class="btn btn-sm btn-secondary" onclick="WMSBarcodeStudio.adjustZoom(15)" title="ขยายขนาดพรีวิว">
                                        <i class="fa-solid fa-magnifying-glass-plus"></i>
                                    </button>
                                    <span style="width:1px; height:18px; background:var(--border-color); margin:0 2px;"></span>
                                    <button type="button" class="btn btn-sm btn-secondary" id="wmsBpFirstPageBtn" onclick="WMSBarcodeStudio.goToPage(1)" title="หน้าแรก">
                                        <i class="fa-solid fa-angles-left"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-secondary" id="wmsBpPrevPageBtn" onclick="WMSBarcodeStudio.goToPage(WMSBarcodeStudio.getCurrentPage() - 1)" title="หน้าก่อนหน้า">
                                        <i class="fa-solid fa-chevron-left"></i> ก่อนหน้า
                                    </button>
                                    <input type="number" id="wmsBpPageJumpInput" class="wms-bp-page-input" value="1" min="1" onchange="WMSBarcodeStudio.goToPage(this.value)">
                                    <span class="mono font-bold" id="wmsBpTotalPagesSpan" style="font-size:0.84rem;">/ 1</span>
                                    <button type="button" class="btn btn-sm btn-secondary" id="wmsBpNextPageBtn" onclick="WMSBarcodeStudio.goToPage(WMSBarcodeStudio.getCurrentPage() + 1)" title="หน้าถัดไป">
                                        ถัดไป <i class="fa-solid fa-chevron-right"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-secondary" id="wmsBpLastPageBtn" onclick="WMSBarcodeStudio.goToPage(WMSBarcodeStudio.getTotalPages())" title="หน้าสุดท้าย">
                                        <i class="fa-solid fa-angles-right"></i>
                                    </button>
                                </div>
                            </div>

                            <div class="wms-bp-preview-scroll" id="barcodePreviewArea"></div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="wms-bp-footer">
                        <div style="font-size:0.8rem; color:var(--text-muted); display:flex; align-items:center; gap:8px;">
                            <i class="fa-solid fa-bolt" style="color:var(--warning);"></i>
                            <span>เปิดเต็มหน้าจอและบันทึก PDF ได้ทันทีโดยไม่ค้างหน้าว่าง</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                            <button type="button" class="btn btn-secondary" onclick="closePrintBarcodeModal()">
                                <i class="fa-solid fa-xmark"></i> ปิดหน้าต่าง
                            </button>
                            <button type="button" class="btn btn-secondary" onclick="WMSBarcodeStudio.openFullscreenPdfPopup()" title="เปิดหน้าต่างป๊อปอัปเอกสาร PDF เต็มหน้าจอ">
                                <i class="fa-solid fa-file-pdf" style="color:#dc2626;"></i> ป๊อปอัป PDF เต็มหน้าจอ
                            </button>
                            <button type="button" class="btn btn-secondary" onclick="triggerPDFPrintPreview(true)" title="เปิดพรีวิวเอกสารในแท็บใหม่แบบเต็มหน้าจอและซิงก์เรียลไทม์">
                                <i class="fa-solid fa-up-right-from-square"></i> เปิดแท็บพิมพ์แยก
                            </button>
                            <button type="button" class="btn btn-primary" style="padding:9px 22px; font-size:0.95rem;" onclick="triggerPDFPrintPreview(false)">
                                <i class="fa-solid fa-print"></i> สั่งพิมพ์สติกเกอร์ / บันทึก PDF
                            </button>
                        </div>
                    </div>

                    <!-- Spooler Progress Overlay (For 1,000 - 10,000+ SNs) -->
                    <div class="wms-bp-spool-overlay" id="wmsBpSpoolOverlay">
                        <div class="wms-bp-spool-card">
                            <div class="wms-bp-global-icon-ring" style="margin-bottom:12px;">
                                <i class="fa-solid fa-print"></i>
                            </div>
                            <div class="wms-bp-global-pill">
                                <span class="wms-bp-global-dot"></span> กำลังจัดเตรียมเอกสาร PDF / เครื่องพิมพ์
                            </div>
                            <h4 style="margin:0 0 6px 0; font-size:1.12rem; font-weight:800;" id="wmsBpSpoolTitle">กำลังสร้างไฟล์พิมพ์บาร์โค้ด...</h4>
                            <p style="margin:0; font-size:0.83rem; color:var(--text-muted); line-height:1.45;" id="wmsBpSpoolSubtitle">กรุณารอสักครู่ ระบบกำลังสร้างบาร์โค้ด Vector ความละเอียดสูง</p>
                            <div class="wms-bp-progress-track">
                                <div class="wms-bp-progress-fill" id="wmsBpSpoolProgressBar"></div>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:700; margin-bottom:16px;">
                                <span id="wmsBpSpoolCountText">0 / 0 ดวง</span>
                                <span class="mono" id="wmsBpSpoolPctText">0%</span>
                            </div>
                            <button type="button" class="btn btn-sm btn-danger" onclick="WMSBarcodeStudio.cancelSpooling()">
                                <i class="fa-solid fa-stop"></i> ยกเลิกการสร้างเอกสาร
                            </button>
                        </div>
                    </div>
                </div>
            `;

            modal.addEventListener('click', (e) => {
                if (e.target === modal && !studioState.isSpooling) {
                    closePrintBarcodeModal();
                }
            });

            document.body.appendChild(modal);
        }

        return modal;
    }

    // ---------------------------------------------------------------------
    // 5.5 FULLSCREEN MODERN PDF POPUP MODAL
    // ---------------------------------------------------------------------
    function ensureFullscreenPdfPopupModal() {
        injectBarcodeStudioStyles();
        let pdfPopup = document.getElementById('wmsBpFullscreenPdfPopup');
        if (!pdfPopup) {
            pdfPopup = document.createElement('div');
            pdfPopup.id = 'wmsBpFullscreenPdfPopup';
            pdfPopup.className = 'wms-bp-pdf-popup';
            pdfPopup.innerHTML = `
                <div class="wms-bp-pdf-bar">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <span style="width:34px; height:34px; border-radius:9px; background:#ef4444; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:1rem;">
                            <i class="fa-solid fa-file-pdf"></i>
                        </span>
                        <div>
                            <div style="font-weight:800; font-size:0.98rem;" id="wmsBpPdfPopupTitle">เอกสารบาร์โค้ดพร้อมพิมพ์ PDF</div>
                            <div style="font-size:0.75rem; color:#94a3b8;" id="wmsBpPdfPopupSub">รองรับทุกขนาดหน้าจอ • สั่งพิมพ์หรือบันทึก PDF ได้ทันที</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="WMSBarcodeStudio.printInsidePdfPopup()">
                            <i class="fa-solid fa-print"></i> สั่งพิมพ์ / บันทึก PDF
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="triggerPDFPrintPreview(true)">
                            <i class="fa-solid fa-up-right-from-square"></i> เปิดแท็บแยกเต็มจอ
                        </button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="WMSBarcodeStudio.closeFullscreenPdfPopup()">
                            <i class="fa-solid fa-xmark"></i> ปิดหน้าต่าง PDF
                        </button>
                    </div>
                </div>
                <div class="wms-bp-pdf-body">
                    <iframe id="wmsBpPdfPopupFrame" class="wms-bp-pdf-frame" title="Barcode PDF Fullscreen Preview"></iframe>
                </div>
            `;
            document.body.appendChild(pdfPopup);
        }
        return pdfPopup;
    }

    // ---------------------------------------------------------------------
    // 6. DATA EXPANSION & PAGINATION CALCULATION
    // ---------------------------------------------------------------------
    function rebuildPrintQueue() {
        const q = studioState.searchQuery.trim().toLowerCase();
        if (!q) {
            studioState.filteredItems = studioState.rawItems.slice();
        } else {
            studioState.filteredItems = studioState.rawItems.filter(item =>
                (item.sn && String(item.sn).toLowerCase().includes(q)) ||
                (item.category && String(item.category).toLowerCase().includes(q)) ||
                (item.name && String(item.name).toLowerCase().includes(q)) ||
                (item.location && String(item.location).toLowerCase().includes(q))
            );
        }

        const copies = Math.max(1, Math.min(100, Number(studioState.copiesPerSn) || 1));
        const expanded = [];
        for (let i = 0; i < studioState.filteredItems.length; i++) {
            const item = studioState.filteredItems[i];
            for (let c = 0; c < copies; c++) {
                expanded.push(item);
            }
        }
        studioState.expandedLabels = expanded;

        const preset = getActivePreset();
        const perPage = Math.max(1, preset.perPage);
        studioState.totalPages = Math.max(1, Math.ceil(expanded.length / perPage));
        if (studioState.currentPage > studioState.totalPages) {
            studioState.currentPage = studioState.totalPages;
        }
        if (studioState.currentPage < 1) {
            studioState.currentPage = 1;
        }

        // อัปเดต Badge ด้านบนและช่องช่วงหน้า
        const countBadge = document.getElementById('printPreviewCountBadge');
        if (countBadge) {
            countBadge.innerHTML = `<i class="fa-solid fa-barcode"></i> ${studioState.filteredItems.length.toLocaleString()} S/N`;
        }
        const totalStickersBadge = document.getElementById('wmsBpTotalStickersBadge');
        if (totalStickersBadge) {
            totalStickersBadge.innerHTML = `<i class="fa-solid fa-tags"></i> รวม ${expanded.length.toLocaleString()} ดวง (${studioState.totalPages.toLocaleString()} หน้า)`;
        }

        const pageToInput = document.getElementById('wmsBpPageTo');
        if (pageToInput) {
            pageToInput.max = String(studioState.totalPages);
            if (studioState.pageRangeMode === 'ALL' || Number(pageToInput.value) > studioState.totalPages) {
                pageToInput.value = String(studioState.totalPages);
            }
        }
    }

    // ---------------------------------------------------------------------
    // 7. STICKER CARD HTML BUILDER
    // ---------------------------------------------------------------------
    function buildStickerCardHtml(item, preset, inlineStyle = '') {
        const barcodeSrc = getBarcodeImageDataUrl(item.sn, preset);
        const borderClass = studioState.showBorder ? 'has-border' : 'no-border';
        const nameText = safeEscape(item.name || item.category || '-');
        const skuText = safeEscape(item.category || 'N/A');
        const locText = safeEscape(safeFormatLoc(item.location));
        const meterVal = item.meter !== undefined && item.meter !== null ? Number(item.meter).toLocaleString() : '0';

        const topHtml = studioState.showName
            ? `<div class="wms-bp-st-name" title="${nameText}">${nameText}</div>`
            : '';

        let bottomParts = [];
        if (studioState.showSku) bottomParts.push(`<span>SKU: ${skuText}</span>`);
        if (studioState.showMeter) bottomParts.push(`<span>M: ${meterVal}</span>`);
        if (studioState.showLocation) bottomParts.push(`<span>📍 ${locText}</span>`);

        const bottomHtml = bottomParts.length > 0
            ? `<div class="wms-bp-st-meta">${bottomParts.join('')}</div>`
            : '';

        return `
            <div class="wms-bp-sticker ${borderClass}" style="${inlineStyle}">
                ${topHtml}
                <div class="wms-bp-st-barcode">
                    <img src="${barcodeSrc}" alt="${safeEscape(item.sn)}">
                </div>
                ${bottomHtml}
            </div>
        `;
    }

    // ---------------------------------------------------------------------
    // 8. FAST PAGINATED PREVIEW RENDERER (RENDERS ONLY 1 PAGE AT A TIME)
    // ---------------------------------------------------------------------
    function renderCurrentPreviewPage() {
        const container = document.getElementById('barcodePreviewArea');
        if (!container) return;

        const preset = getActivePreset();
        const perPage = preset.perPage;
        const pageIdx = studioState.currentPage - 1;
        const start = pageIdx * perPage;
        const pageItems = studioState.expandedLabels.slice(start, start + perPage);

        // อัปเดตแถบตัวเลขหน้า
        const statusText = document.getElementById('wmsBpPageStatusText');
        if (statusText) {
            statusText.textContent = `ตัวอย่างหน้าที่ ${studioState.currentPage.toLocaleString()} / ${studioState.totalPages.toLocaleString()} (แสดง ${pageItems.length} ดวงในหน้านี้)`;
        }
        const jumpInput = document.getElementById('wmsBpPageJumpInput');
        if (jumpInput) {
            jumpInput.value = String(studioState.currentPage);
            jumpInput.max = String(studioState.totalPages);
        }
        const totalSpan = document.getElementById('wmsBpTotalPagesSpan');
        if (totalSpan) {
            totalSpan.textContent = `/ ${studioState.totalPages.toLocaleString()}`;
        }
        const zoomLabel = document.getElementById('wmsBpZoomLabel');
        if (zoomLabel) {
            zoomLabel.textContent = `${studioState.zoomPercent}%`;
        }

        const firstBtn = document.getElementById('wmsBpFirstPageBtn');
        const prevBtn = document.getElementById('wmsBpPrevPageBtn');
        const nextBtn = document.getElementById('wmsBpNextPageBtn');
        const lastBtn = document.getElementById('wmsBpLastPageBtn');
        if (firstBtn) firstBtn.disabled = studioState.currentPage <= 1;
        if (prevBtn) prevBtn.disabled = studioState.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = studioState.currentPage >= studioState.totalPages;
        if (lastBtn) lastBtn.disabled = studioState.currentPage >= studioState.totalPages;

        if (pageItems.length === 0) {
            container.innerHTML = `
                <div style="background:var(--bg-surface); padding:40px 24px; border-radius:14px; text-align:center; color:var(--text-muted); border:1px solid var(--border-color); margin-top:20px;">
                    <i class="fa-solid fa-box-open" style="font-size:2.2rem; margin-bottom:10px; display:block;"></i>
                    <div style="font-weight:700; font-size:1rem;">ไม่พบรายการบาร์โค้ดสำหรับแสดงผล</div>
                    <div style="font-size:0.82rem; margin-top:4px;">ลองล้างคำค้นหา หรือกด "ดึงทั้งหมดในหน้าสต็อก"</div>
                </div>
            `;
            return;
        }

        const scaleVal = (studioState.zoomPercent / 100).toFixed(2);
        const zoomStyle = studioState.zoomPercent !== 100
            ? `transform: scale(${scaleVal}); transform-origin: top center;`
            : '';

        if (preset.type === 'a4') {
            const cardsHtml = pageItems
                .map(item => buildStickerCardHtml(item, preset, 'width:100%; height:100%; margin:0;'))
                .join('');

            container.innerHTML = `
                <div class="wms-bp-zoom-stage" style="${zoomStyle}">
                    <div class="wms-bp-a4-sheet" style="grid-template-columns: repeat(${preset.cols}, 1fr); grid-template-rows: repeat(${preset.rows}, 1fr);">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        } else {
            const wMm = preset.widthMm;
            const hMm = preset.heightMm;
            const cardsHtml = pageItems
                .map(item => buildStickerCardHtml(item, preset, `width:${wMm}mm; height:${hMm}mm; flex-shrink:0;`))
                .join('');

            container.innerHTML = `
                <div class="wms-bp-zoom-stage" style="${zoomStyle}">
                    <div class="wms-bp-thermal-grid">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }
    }

    // ---------------------------------------------------------------------
    // 9. INSTANT NON-BLOCKING PRINT & FULLSCREEN REALTIME LINKED TAB ENGINE
    // ---------------------------------------------------------------------
    function waitForImagesReady(targetDoc, maxWaitMs = 500) {
        if (!targetDoc) return Promise.resolve();
        const imgs = Array.from(targetDoc.querySelectorAll('img'));
        if (imgs.length === 0) return Promise.resolve();

        const decodePromises = imgs.map(img => {
            if (typeof img.decode === 'function') {
                return img.decode().catch(() => {});
            }
            if (img.complete) return Promise.resolve();
            return new Promise(res => {
                img.onload = res;
                img.onerror = res;
            });
        });

        return Promise.race([
            Promise.all(decodePromises),
            new Promise(res => setTimeout(res, maxWaitMs))
        ]);
    }

    function getOrCreateHiddenPrintIframe() {
        let iframe = document.getElementById('wmsBpHiddenPrintFrame');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'wmsBpHiddenPrintFrame';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:1px; height:1px; border:0; opacity:0; pointer-events:none; z-index:-1;';
            document.body.appendChild(iframe);
        }
        return iframe;
    }

    function isLinkedTabAlive() {
        try {
            return Boolean(studioState.linkedTabWindow && !studioState.linkedTabWindow.closed);
        } catch (e) {
            return false;
        }
    }

    function updateLinkedTabStatusBadge() {
        const badge = document.getElementById('wmsBpLiveTabBadge');
        if (!badge) return;
        badge.style.display = isLinkedTabAlive() ? 'inline-flex' : 'none';
    }

    function initRealtimeChannel() {
        if (studioState.realtimeChannel || typeof BroadcastChannel === 'undefined') return;
        try {
            studioState.realtimeChannel = new BroadcastChannel('WMS_BARCODE_STUDIO_LINK');
            studioState.realtimeChannel.onmessage = (event) => {
                const msg = event && event.data;
                if (!msg || typeof msg !== 'object') return;
                if (msg.type === 'REQUEST_REBUILD') {
                    syncLinkedPrintTab(false);
                } else if (msg.type === 'TAB_CLOSED') {
                    studioState.linkedTabWindow = null;
                    updateLinkedTabStatusBadge();
                }
            };
        } catch (e) {}
    }

    function buildDynamicPrintPageStyles(preset) {
        const borderCss = studioState.showBorder
            ? 'border: 1px solid #000000;'
            : 'border: none;';

        let pageCss = '';
        if (preset.type === 'a4') {
            pageCss = `
                @page { size: A4 portrait; margin: 0; }
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    width: 210mm !important;
                }
                .print-a4-sheet {
                    width: 210mm !important;
                    height: 296.5mm !important;
                    max-height: 296.5mm !important;
                    padding: 5mm !important;
                    margin: 0 auto !important;
                    box-sizing: border-box !important;
                    display: grid !important;
                    grid-template-columns: repeat(${preset.cols}, 1fr) !important;
                    grid-template-rows: repeat(${preset.rows}, 1fr) !important;
                    gap: 2.5mm 3mm !important;
                    page-break-after: always !important;
                    break-after: page !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    overflow: hidden !important;
                    background: #ffffff !important;
                }
                .print-a4-sheet:last-child {
                    page-break-after: auto !important;
                    break-after: auto !important;
                }
            `;
        } else {
            const wMm = preset.widthMm;
            const hMm = preset.heightMm;
            pageCss = `
                @page { size: ${wMm}mm ${hMm}mm; margin: 0; }
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                }
                .wms-bp-sticker {
                    width: ${wMm}mm !important;
                    height: ${hMm}mm !important;
                    margin: 0 auto !important;
                    page-break-after: always !important;
                    break-after: page !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                .wms-bp-sticker:last-child {
                    page-break-after: auto !important;
                    break-after: auto !important;
                }
            `;
        }

        return `
            ${pageCss}
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { font-family: 'Prompt', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            @media print {
                .no-print { display: none !important; }
                #wmsLinkedSheetViewport { transform: none !important; width: 100% !important; padding: 0 !important; }
            }
            @media screen {
                html, body { background: #1e293b !important; width: 100% !important; min-height: 100vh !important; overflow-x: auto !important; }
                #wmsLinkedSheetViewport {
                    width: 100%;
                    min-height: calc(100vh - 60px);
                    padding: 16px 12px 36px 12px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    transform-origin: top center;
                    transition: transform 0.14s ease-out;
                }
                .print-a4-sheet { margin: 12px auto !important; box-shadow: 0 12px 32px rgba(0,0,0,0.35); border-radius: 3px; }
                .wms-bp-sticker { margin: 10px auto !important; box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
            }
            .wms-bp-sticker {
                background: #ffffff !important;
                color: #000000 !important;
                ${borderCss}
                border-radius: 2px;
                padding: 2mm 2.5mm;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                text-align: center;
                overflow: hidden;
            }
            .wms-bp-st-name {
                font-weight: 800;
                font-size: 0.7rem;
                line-height: 1.15;
                color: #000000;
                width: 100%;
                max-height: 2.3em;
                overflow: hidden;
            }
            .wms-bp-st-barcode {
                flex: 1 1 auto;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                min-height: 0;
            }
            .wms-bp-st-barcode img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            }
            .wms-bp-st-meta {
                width: 100%;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 4px;
                font-family: 'JetBrains Mono', Consolas, monospace;
                font-size: 0.6rem;
                font-weight: 700;
                color: #000000;
                border-top: 1px solid #cbd5e1;
                padding-top: 1.5px;
            }
            .wms-bp-st-meta span {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        `;
    }

    function bootstrapLinkedTabShell(targetWin, preset, totalCount, isEmbeddedPopup = false) {
        if (!targetWin) return;
        const closeBtnHtml = isEmbeddedPopup ? '' : `
            <button type="button" onclick="window.close()" style="background:#334155; color:#fff; border:1px solid #475569; padding:8px 14px; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.86rem;">
                ✕ ปิดแท็บนี้
            </button>
        `;
        const fullscreenBtnHtml = isEmbeddedPopup ? '' : `
            <button type="button" id="wmsTabFsBtn" onclick="window.toggleTabFullscreen()" style="background:#1e293b; color:#e2e8f0; border:1px solid #475569; padding:8px 13px; border-radius:8px; font-weight:600; cursor:pointer; font-size:0.86rem;">
                ⛶ เต็มหน้าจอ
            </button>
        `;

        const shellHtml = `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0">
    <title>พิมพ์บาร์โค้ดสติกเกอร์ (${totalCount.toLocaleString()} ดวง) - WMS Enterprise</title>
    <style id="wmsLinkedDynamicStyle">${buildDynamicPrintPageStyles(preset)}</style>
    <style>
        .wms-tab-bar {
            position: sticky;
            top: 0;
            z-index: 9999;
            background: #0f172a;
            color: #ffffff;
            padding: 10px 18px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            border-bottom: 1px solid #334155;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.35);
        }
        .wms-tab-status-pill {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 4px 11px;
            border-radius: 999px;
            font-size: 0.76rem;
            font-weight: 700;
            background: rgba(16, 185, 129, 0.16);
            border: 1px solid rgba(16, 185, 129, 0.45);
            color: #6ee7b7;
        }
        .wms-tab-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 8px #10b981;
        }
        .wms-tab-controls {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }
        .wms-tab-zoom-btn {
            background: #1e293b;
            color: #f8fafc;
            border: 1px solid #475569;
            padding: 6px 11px;
            border-radius: 7px;
            font-weight: 700;
            cursor: pointer;
            font-size: 0.84rem;
        }
        .wms-tab-zoom-btn:hover {
            background: #334155;
        }
        .wms-tab-loader {
            width: min(480px, calc(100vw - 32px));
            margin: 40px auto;
            background: #ffffff;
            color: #0f172a;
            border-radius: 16px;
            padding: 26px 24px;
            text-align: center;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.25);
            border: 1px solid #cbd5e1;
        }
        .wms-tab-track {
            width: 100%;
            height: 9px;
            background: #e2e8f0;
            border-radius: 999px;
            overflow: hidden;
            margin: 14px 0 8px 0;
        }
        .wms-tab-fill {
            height: 100%;
            width: 12%;
            background: linear-gradient(90deg, #2563eb 0%, #6366f1 55%, #10b981 100%);
            transition: width 0.12s ease-out;
        }
        @media (max-width: 640px) {
            .wms-tab-bar { padding: 8px 12px; }
            #wmsTabHeaderTitle { font-size: 0.85rem !important; }
        }
    </style>
</head>
<body>
    <div class="no-print wms-tab-bar">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span style="font-weight:800; font-size:0.95rem;" id="wmsTabHeaderTitle">
                🖨️ เอกสารบาร์โค้ดพร้อมพิมพ์ (${totalCount.toLocaleString()} ดวง)
            </span>
            <span class="wms-tab-status-pill" id="wmsTabSyncBadge">
                <span class="wms-tab-dot"></span> เชื่อมต่อเรียลไทม์แล้ว
            </span>
        </div>
        <div class="wms-tab-controls">
            <button type="button" class="wms-tab-zoom-btn" onclick="window.adjustTabZoom(-15)" title="ย่อ">−</button>
            <span id="wmsTabZoomText" style="font-family:monospace; font-size:0.82rem; font-weight:700; min-width:42px; text-align:center;">100%</span>
            <button type="button" class="wms-tab-zoom-btn" onclick="window.adjustTabZoom(15)" title="ขยาย">+</button>
            <button type="button" class="wms-tab-zoom-btn" onclick="window.fitTabToScreen()" title="พอดีหน้าจอ">พอดีจอ</button>
            ${fullscreenBtnHtml}
            <button type="button" onclick="window.print()" style="background:#2563eb; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:0.88rem; box-shadow:0 2px 10px rgba(37,99,235,0.4);">
                🖨️ สั่งพิมพ์ / บันทึก PDF
            </button>
            ${closeBtnHtml}
        </div>
    </div>

    <div class="no-print wms-tab-loader" id="wmsTabLoadingCard">
        <div style="font-size:1.05rem; font-weight:800; margin-bottom:4px;" id="wmsTabLoadTitle">กำลังซิงก์ข้อมูลสติกเกอร์บาร์โค้ด...</div>
        <div style="font-size:0.82rem; color:#64748b;" id="wmsTabLoadSub">กำลังจัดเรียงเอกสารความเร็วสูง (0 / ${totalCount.toLocaleString()} ดวง)</div>
        <div class="wms-tab-track">
            <div class="wms-tab-fill" id="wmsTabLoadBar"></div>
        </div>
        <div style="font-size:0.78rem; font-weight:700; color:#334155;" id="wmsTabLoadPct">12%</div>
    </div>

    <div id="wmsLinkedSheetViewport">
        <div id="wmsLinkedSheetRoot" style="width:100%;"></div>
    </div>

    <script>
        (function() {
            var currentZoom = 100;
            window.applyTabZoom = function(pct) {
                currentZoom = Math.max(40, Math.min(180, Math.round(pct)));
                var vp = document.getElementById('wmsLinkedSheetViewport');
                var lbl = document.getElementById('wmsTabZoomText');
                if (vp) {
                    vp.style.transform = currentZoom === 100 ? 'none' : 'scale(' + (currentZoom / 100).toFixed(2) + ')';
                }
                if (lbl) lbl.textContent = currentZoom + '%';
            };
            window.adjustTabZoom = function(delta) {
                window.applyTabZoom(currentZoom + delta);
            };
            window.fitTabToScreen = function() {
                var vw = window.innerWidth || document.documentElement.clientWidth || 1024;
                if (vw < 840) {
                    var autoPct = Math.max(45, Math.min(100, Math.floor((vw - 24) / 8.1)));
                    window.applyTabZoom(autoPct);
                } else {
                    window.applyTabZoom(100);
                }
            };
            window.toggleTabFullscreen = function() {
                if (!document.fullscreenElement) {
                    if (document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(function(){});
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().catch(function(){});
                    }
                }
            };
            window.addEventListener('resize', function() {
                if ((window.innerWidth || 1024) < 840) {
                    window.fitTabToScreen();
                }
            });
            setTimeout(window.fitTabToScreen, 40);

            var ch = null;
            try {
                if (typeof BroadcastChannel !== 'undefined') {
                    ch = new BroadcastChannel('WMS_BARCODE_STUDIO_LINK');
                }
            } catch (e) {}

            window.addEventListener('beforeunload', function() {
                if (ch) {
                    try { ch.postMessage({ type: 'TAB_CLOSED' }); } catch (e) {}
                }
            });
        })();
    <\/script>
</body>
</html>`;

        targetWin.document.open();
        targetWin.document.write(shellHtml);
        targetWin.document.close();
    }

    function getActiveRangeSlice() {
        const preset = getActivePreset();
        const perPage = preset.perPage;
        let startPage = 1;
        let endPage = studioState.totalPages;

        if (studioState.pageRangeMode === 'RANGE') {
            const pFrom = Number(document.getElementById('wmsBpPageFrom')?.value) || 1;
            const pTo = Number(document.getElementById('wmsBpPageTo')?.value) || studioState.totalPages;
            startPage = Math.max(1, Math.min(studioState.totalPages, Math.min(pFrom, pTo)));
            endPage = Math.max(startPage, Math.min(studioState.totalPages, Math.max(pFrom, pTo)));
        }

        const startIdx = (startPage - 1) * perPage;
        const endIdx = Math.min(studioState.expandedLabels.length, endPage * perPage);
        return {
            preset,
            perPage,
            startPage,
            endPage,
            itemsToPrint: studioState.expandedLabels.slice(startIdx, endIdx)
        };
    }

    async function streamStickersIntoTargetWindow(targetWin, isEmbeddedPopup = false, autoTriggerPrint = false) {
        if (!targetWin) return;
        let doc = null;
        try {
            doc = targetWin.document;
        } catch (e) {
            return;
        }
        if (!doc) return;

        const { preset, perPage, startPage, endPage, itemsToPrint } = getActiveRangeSlice();
        const totalCount = itemsToPrint.length;

        if (!doc.getElementById('wmsLinkedSheetRoot')) {
            bootstrapLinkedTabShell(targetWin, preset, totalCount, isEmbeddedPopup);
        }

        const styleEl = doc.getElementById('wmsLinkedDynamicStyle');
        if (styleEl) {
            styleEl.textContent = buildDynamicPrintPageStyles(preset);
        }
        doc.title = `พิมพ์บาร์โค้ดสติกเกอร์ (${totalCount.toLocaleString()} ดวง) - WMS Enterprise`;

        const headerTitle = doc.getElementById('wmsTabHeaderTitle');
        if (headerTitle) {
            headerTitle.textContent = `🖨️ เอกสารบาร์โค้ดพร้อมพิมพ์ (${totalCount.toLocaleString()} ดวง • หน้า ${startPage}-${endPage})`;
        }

        const syncBadge = doc.getElementById('wmsTabSyncBadge');
        if (syncBadge) {
            syncBadge.innerHTML = `<span class="wms-tab-dot"></span> กำลังอัปเดตเรียลไทม์...`;
        }

        const loaderCard = doc.getElementById('wmsTabLoadingCard');
        const loadTitle = doc.getElementById('wmsTabLoadTitle');
        const loadSub = doc.getElementById('wmsTabLoadSub');
        const loadBar = doc.getElementById('wmsTabLoadBar');
        const loadPct = doc.getElementById('wmsTabLoadPct');
        const rootEl = doc.getElementById('wmsLinkedSheetRoot');

        if (totalCount === 0) {
            if (loaderCard) loaderCard.style.display = 'none';
            if (rootEl) {
                rootEl.innerHTML = `<div class="wms-tab-loader">ไม่พบรายการสติกเกอร์ตามเงื่อนไขที่เลือก</div>`;
            }
            if (syncBadge) {
                syncBadge.innerHTML = `<span class="wms-tab-dot"></span> ซิงก์เรียลไทม์แล้ว (0 รายการ)`;
            }
            return;
        }

        if (loaderCard) loaderCard.style.display = 'block';
        if (loadTitle) loadTitle.textContent = 'กำลังจัดเตรียมเอกสารบาร์โค้ดความเร็วสูง...';
        if (loadSub) loadSub.textContent = `กำลังจัดเรียงสติกเกอร์ 0 / ${totalCount.toLocaleString()} ดวง`;
        if (loadBar) loadBar.style.width = '12%';
        if (loadPct) loadPct.textContent = '12%';

        // ล้างของเก่าและสตรีมก้อน HTML เข้า DOM ทีละชุดเพื่อไม่ให้กิน RAM และไม่ค้างแม้ 10,000+ ดวง
        if (rootEl) rootEl.innerHTML = '';

        const CHUNK_ITEMS = preset.type === 'a4' ? (perPage * 5) : 150;
        let frameStart = performance.now();

        for (let offset = 0; offset < totalCount; offset += CHUNK_ITEMS) {
            try {
                if (targetWin.closed) return;
            } catch (e) {
                return;
            }

            const sliceEnd = Math.min(totalCount, offset + CHUNK_ITEMS);
            const chunkParts = [];

            if (preset.type === 'a4') {
                let sheetCards = [];
                for (let i = offset; i < sliceEnd; i++) {
                    sheetCards.push(buildStickerCardHtml(itemsToPrint[i], preset, 'width:100%; height:100%; margin:0;'));
                    if (sheetCards.length === perPage || i === sliceEnd - 1) {
                        chunkParts.push(`<div class="print-a4-sheet">${sheetCards.join('')}</div>`);
                        sheetCards = [];
                    }
                }
            } else {
                const wMm = preset.widthMm;
                const hMm = preset.heightMm;
                for (let i = offset; i < sliceEnd; i++) {
                    chunkParts.push(buildStickerCardHtml(itemsToPrint[i], preset, `width:${wMm}mm; height:${hMm}mm;`));
                }
            }

            if (rootEl && chunkParts.length > 0) {
                rootEl.insertAdjacentHTML('beforeend', chunkParts.join(''));
            }

            if ((performance.now() - frameStart) >= 14) {
                const pct = Math.min(96, Math.round((sliceEnd / totalCount) * 86) + 10);
                if (loadSub) loadSub.textContent = `กำลังจัดเรียงสติกเกอร์ ${sliceEnd.toLocaleString()} / ${totalCount.toLocaleString()} ดวง`;
                if (loadBar) loadBar.style.width = `${pct}%`;
                if (loadPct) loadPct.textContent = `${pct}%`;
                await new Promise(resolve => requestAnimationFrame(resolve));
                frameStart = performance.now();
            }
        }

        if (loaderCard) loaderCard.style.display = 'none';
        if (syncBadge) {
            const nowStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            syncBadge.innerHTML = `<span class="wms-tab-dot"></span> ครบถ้วน ${totalCount.toLocaleString()} ดวง (${nowStr})`;
        }

        await waitForImagesReady(doc, 450);

        if (autoTriggerPrint) {
            try {
                targetWin.focus();
                targetWin.print();
            } catch (e) {}
        }
    }

    async function syncLinkedPrintTab(autoTriggerPrint = false) {
        if (!isLinkedTabAlive()) {
            updateLinkedTabStatusBadge();
            return;
        }
        await streamStickersIntoTargetWindow(studioState.linkedTabWindow, false, autoTriggerPrint);
    }

    function scheduleRealtimeTabSync() {
        updateLinkedTabStatusBadge();
        if (studioState.realtimeSyncTimer) {
            clearTimeout(studioState.realtimeSyncTimer);
        }
        studioState.realtimeSyncTimer = setTimeout(() => {
            studioState.realtimeSyncTimer = null;
            if (isLinkedTabAlive()) {
                syncLinkedPrintTab(false);
            }
            const pdfPopup = document.getElementById('wmsBpFullscreenPdfPopup');
            const pdfFrame = document.getElementById('wmsBpPdfPopupFrame');
            if (pdfPopup && pdfPopup.style.display === 'flex' && pdfFrame && pdfFrame.contentWindow) {
                streamStickersIntoTargetWindow(pdfFrame.contentWindow, true, false);
            }
        }, 120);
    }

    async function executeHighSpeedPrintSpooler(openInNewTab = false) {
        if (studioState.isSpooling) return;

        const { preset, perPage, startPage, endPage, itemsToPrint } = getActiveRangeSlice();

        if (itemsToPrint.length === 0) {
            notifyUser('⚠️ ไม่พบรายการสติกเกอร์ในช่วงหน้าที่เลือก', true);
            return;
        }

        // กรณีผู้ใช้กด "เปิดแท็บพิมพ์แยก":
        // 1. เปิด/โฟกัสแท็บใหม่แบบเต็มหน้าจอและฉีด UI โครงสร้างทันทีใน 0ms เพื่อไม่ให้ขึ้นหน้าจอขาว (about:blank)
        // 2. เชื่อมต่อช่องทางซิงก์เรียลไทม์กับหน้าศูนย์การพิมพ์หลัก
        if (openInNewTab) {
            initRealtimeChannel();
            let targetWin = isLinkedTabAlive() ? studioState.linkedTabWindow : null;
            if (!targetWin) {
                const availW = (window.screen && window.screen.availWidth) ? window.screen.availWidth : window.innerWidth;
                const availH = (window.screen && window.screen.availHeight) ? window.screen.availHeight : window.innerHeight;
                const features = `noopener=no,width=${availW},height=${availH},left=0,top=0,resizable=yes,scrollbars=yes`;
                targetWin = window.open('', 'WMS_BARCODE_REALTIME_PRINT_TAB', features);
            }
            if (!targetWin) {
                notifyUser('⚠️ เบราว์เซอร์บล็อกการเปิดแท็บใหม่ ระบบเปิดหน้าต่าง PDF เต็มหน้าจอให้แทนทันที');
                WMSBarcodeStudio.openFullscreenPdfPopup();
                return;
            } else {
                try {
                    targetWin.moveTo(0, 0);
                    if (window.screen && window.screen.availWidth && window.screen.availHeight) {
                        targetWin.resizeTo(window.screen.availWidth, window.screen.availHeight);
                    }
                } catch (e) {}

                studioState.linkedTabWindow = targetWin;
                updateLinkedTabStatusBadge();
                bootstrapLinkedTabShell(targetWin, preset, itemsToPrint.length, false);
                try { targetWin.focus(); } catch (e) {}

                await syncLinkedPrintTab(false);

                if (typeof window.logUserActivity === 'function') {
                    window.logUserActivity('PRINT_BARCODE_TAB', `เปิดแท็บพิมพ์แยกเต็มหน้าจอจำนวน ${itemsToPrint.length.toLocaleString()} ดวง (รูปแบบ: ${preset.id})`);
                }
                return;
            }
        }

        studioState.isSpooling = true;
        studioState.cancelSpoolRequested = false;

        const totalCount = itemsToPrint.length;
        const spoolOverlay = document.getElementById('wmsBpSpoolOverlay');
        const spoolTitle = document.getElementById('wmsBpSpoolTitle');
        const spoolSub = document.getElementById('wmsBpSpoolSubtitle');
        const spoolBar = document.getElementById('wmsBpSpoolProgressBar');
        const spoolCount = document.getElementById('wmsBpSpoolCountText');
        const spoolPct = document.getElementById('wmsBpSpoolPctText');

        if (spoolOverlay) spoolOverlay.style.display = 'flex';
        if (spoolTitle) spoolTitle.textContent = 'กำลังจัดเตรียมเอกสารพิมพ์ / บันทึก PDF...';
        if (spoolSub) spoolSub.textContent = `กำลังสร้างบาร์โค้ดหน้าที่ ${startPage} ถึง ${endPage} (รวม ${totalCount.toLocaleString()} ดวง)`;
        if (spoolBar) spoolBar.style.width = '10%';
        if (spoolCount) spoolCount.textContent = `0 / ${totalCount.toLocaleString()} ดวง`;
        if (spoolPct) spoolPct.textContent = '10%';

        showGlobalBarcodeLoadingPopup(
            'กำลังจัดเตรียมเอกสารพิมพ์ / บันทึก PDF...',
            `กำลังสร้างสติกเกอร์หน้าที่ ${startPage} ถึง ${endPage} (รวม ${totalCount.toLocaleString()} ดวง)`,
            10,
            `0 / ${totalCount.toLocaleString()} ดวง`,
            true
        );

        // ให้เบราว์เซอร์วาดป๊อปอัปแจ้งเตือนบนหน้าเว็บหลักก่อนเริ่มสร้างบาร์โค้ด
        await new Promise(resolve => requestAnimationFrame(resolve));

        const htmlChunks = [];
        let frameStartTime = performance.now();
        const FRAME_BUDGET_MS = 14;

        if (preset.type === 'a4') {
            let currentSheetCards = [];
            for (let i = 0; i < totalCount; i++) {
                if (studioState.cancelSpoolRequested) break;

                currentSheetCards.push(buildStickerCardHtml(itemsToPrint[i], preset, 'width:100%; height:100%; margin:0;'));

                if (currentSheetCards.length === perPage || i === totalCount - 1) {
                    htmlChunks.push(`<div class="print-a4-sheet">${currentSheetCards.join('')}</div>`);
                    currentSheetCards = [];
                }

                if ((i + 1) % 80 === 0 && (performance.now() - frameStartTime) >= FRAME_BUDGET_MS) {
                    const pct = Math.min(94, Math.round(((i + 1) / totalCount) * 90) + 5);
                    if (spoolBar) spoolBar.style.width = `${pct}%`;
                    if (spoolCount) spoolCount.textContent = `${(i + 1).toLocaleString()} / ${totalCount.toLocaleString()} ดวง`;
                    if (spoolPct) spoolPct.textContent = `${pct}%`;
                    updateGlobalBarcodeLoadingPopup(null, null, pct, `${(i + 1).toLocaleString()} / ${totalCount.toLocaleString()} ดวง`, false);
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    frameStartTime = performance.now();
                }
            }
        } else {
            const wMm = preset.widthMm;
            const hMm = preset.heightMm;
            for (let i = 0; i < totalCount; i++) {
                if (studioState.cancelSpoolRequested) break;

                htmlChunks.push(buildStickerCardHtml(itemsToPrint[i], preset, `width:${wMm}mm; height:${hMm}mm;`));

                if ((i + 1) % 80 === 0 && (performance.now() - frameStartTime) >= FRAME_BUDGET_MS) {
                    const pct = Math.min(94, Math.round(((i + 1) / totalCount) * 90) + 5);
                    if (spoolBar) spoolBar.style.width = `${pct}%`;
                    if (spoolCount) spoolCount.textContent = `${(i + 1).toLocaleString()} / ${totalCount.toLocaleString()} ดวง`;
                    if (spoolPct) spoolPct.textContent = `${pct}%`;
                    updateGlobalBarcodeLoadingPopup(null, null, pct, `${(i + 1).toLocaleString()} / ${totalCount.toLocaleString()} ดวง`, false);
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    frameStartTime = performance.now();
                }
            }
        }

        if (studioState.cancelSpoolRequested) {
            if (spoolOverlay) spoolOverlay.style.display = 'none';
            studioState.isSpooling = false;
            hideGlobalBarcodeLoadingPopup(0);
            notifyUser('🛑 ยกเลิกการสั่งพิมพ์แล้ว');
            return;
        }

        if (spoolBar) spoolBar.style.width = '100%';
        if (spoolCount) spoolCount.textContent = `${totalCount.toLocaleString()} / ${totalCount.toLocaleString()} ดวง`;
        if (spoolPct) spoolPct.textContent = '100%';
        updateGlobalBarcodeLoadingPopup(
            'พร้อมพิมพ์แล้ว! กำลังเปิดหน้าต่างพิมพ์...',
            `จัดเตรียมสติกเกอร์ครบ ${totalCount.toLocaleString()} ดวงเรียบร้อย`,
            100,
            'กำลังเปิดหน้าต่างพิมพ์ PDF...',
            true
        );

        const fullPrintHtml = `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <title>พิมพ์บาร์โค้ดสติกเกอร์ (${totalCount.toLocaleString()} ดวง) - WMS Enterprise</title>
    <style>
        ${buildDynamicPrintPageStyles(preset)}
    </style>
</head>
<body>
    ${htmlChunks.join('')}
</body>
</html>`;

        try {
            // พิมพ์ผ่าน Hidden Iframe โดยตรง (เปิดหน้าต่างพิมพ์ / บันทึก PDF ทันที ไม่ค้างหน้า about:blank)
            const iframe = getOrCreateHiddenPrintIframe();
            const iframeDoc = iframe.contentWindow ? iframe.contentWindow.document : iframe.contentDocument;

            iframeDoc.open();
            iframeDoc.write(fullPrintHtml);
            iframeDoc.close();

            await waitForImagesReady(iframeDoc, 600);

            if (spoolOverlay) spoolOverlay.style.display = 'none';
            studioState.isSpooling = false;
            hideGlobalBarcodeLoadingPopup(0);

            if (iframe.contentWindow) {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            }
        } catch (err) {
            if (spoolOverlay) spoolOverlay.style.display = 'none';
            studioState.isSpooling = false;
            hideGlobalBarcodeLoadingPopup(0);
            notifyUser('⚠️ เกิดข้อผิดพลาดในการเปิดหน้าต่างพิมพ์ กรุณาลองใหม่อีกครั้ง', true);
        }

        if (typeof window.logUserActivity === 'function') {
            window.logUserActivity('PRINT_BARCODE', `พิมพ์สติกเกอร์บาร์โค้ดจำนวน ${totalCount.toLocaleString()} ดวง (รูปแบบ: ${preset.id})`);
        }
    }

    // ---------------------------------------------------------------------
    // 10. PUBLIC STUDIO API & LEGACY COMPATIBILITY HOOKS
    // ---------------------------------------------------------------------
    const WMSBarcodeStudio = {
        showLoadingPopup: showGlobalBarcodeLoadingPopup,
        updateLoadingPopup: updateGlobalBarcodeLoadingPopup,
        hideLoadingPopup: hideGlobalBarcodeLoadingPopup,
        scheduleRealtimeTabSync: scheduleRealtimeTabSync,

        toggleStudioFullscreen() {
            const modal = document.getElementById('printBarcodeModal');
            const icon = document.getElementById('wmsBpFullscreenIcon');
            if (!modal) return;
            studioState.isStudioFullscreen = !studioState.isStudioFullscreen;
            modal.classList.toggle('is-fullscreen', studioState.isStudioFullscreen);
            if (icon) {
                icon.className = studioState.isStudioFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
            }
        },

        adjustZoom(delta) {
            studioState.zoomPercent = Math.max(50, Math.min(150, studioState.zoomPercent + Number(delta || 0)));
            renderCurrentPreviewPage();
        },

        async openFullscreenPdfPopup() {
            const { preset, startPage, endPage, itemsToPrint } = getActiveRangeSlice();
            if (itemsToPrint.length === 0) {
                notifyUser('⚠️ ไม่พบรายการสติกเกอร์ในช่วงหน้าที่เลือก', true);
                return;
            }

            const pdfPopup = ensureFullscreenPdfPopupModal();
            const titleEl = document.getElementById('wmsBpPdfPopupTitle');
            const subEl = document.getElementById('wmsBpPdfPopupSub');
            const frame = document.getElementById('wmsBpPdfPopupFrame');

            if (titleEl) {
                titleEl.textContent = `เอกสารบาร์โค้ดพร้อมพิมพ์ PDF (${itemsToPrint.length.toLocaleString()} ดวง)`;
            }
            if (subEl) {
                subEl.textContent = `ขนาด: ${preset.label} • หน้าที่ ${startPage} ถึง ${endPage}`;
            }

            pdfPopup.style.display = 'flex';
            if (frame && frame.contentWindow) {
                bootstrapLinkedTabShell(frame.contentWindow, preset, itemsToPrint.length, true);
                await streamStickersIntoTargetWindow(frame.contentWindow, true, false);
            }
        },

        printInsidePdfPopup() {
            const frame = document.getElementById('wmsBpPdfPopupFrame');
            if (frame && frame.contentWindow) {
                try {
                    frame.contentWindow.focus();
                    frame.contentWindow.print();
                } catch (e) {
                    triggerPDFPrintPreview(false);
                }
            }
        },

        closeFullscreenPdfPopup() {
            const pdfPopup = document.getElementById('wmsBpFullscreenPdfPopup');
            if (pdfPopup) {
                pdfPopup.style.display = 'none';
            }
        },

        openWithItems(itemsList = []) {
            const list = Array.isArray(itemsList) ? itemsList.slice() : [];
            const isLargeBatch = list.length >= 250;

            if (isLargeBatch) {
                showGlobalBarcodeLoadingPopup(
                    'กำลังเปิดศูนย์พิมพ์บาร์โค้ดและสติกเกอร์...',
                    `กำลังจัดเตรียมรายการสินค้าทั้งหมด ${list.length.toLocaleString()} S/N`,
                    35,
                    `เตรียมคิวพิมพ์ ${list.length.toLocaleString()} รายการ`,
                    false
                );
            }

            const finalizeOpen = () => {
                ensureBarcodeStudioModal();
                initRealtimeChannel();

                studioState.rawItems = list;
                window.currentPrintBarcodeList = studioState.rawItems;
                studioState.searchQuery = '';
                studioState.currentPage = 1;
                studioState.pageRangeMode = 'ALL';

                const searchInput = document.getElementById('wmsBpQueueSearch');
                if (searchInput) searchInput.value = '';

                const rangeModeSelect = document.getElementById('wmsBpPageRangeMode');
                if (rangeModeSelect) rangeModeSelect.value = 'ALL';

                const rangeInputs = document.getElementById('wmsBpPageRangeInputs');
                if (rangeInputs) rangeInputs.style.display = 'none';

                this.syncControlsToState();
                rebuildPrintQueue();
                renderCurrentPreviewPage();
                scheduleRealtimeTabSync();

                const modal = document.getElementById('printBarcodeModal');
                if (modal) {
                    modal.style.display = 'flex';
                    if (typeof window.elevateTopModal === 'function') {
                        window.elevateTopModal(['printBarcodeModal'], 'print');
                    }
                }

                if (isLargeBatch) {
                    updateGlobalBarcodeLoadingPopup(
                        'พร้อมพิมพ์บาร์โค้ดแล้ว!',
                        `จัดเตรียมทั้งหมด ${list.length.toLocaleString()} S/N (${studioState.totalPages.toLocaleString()} หน้า) เรียบร้อย`,
                        100,
                        'โหลดหน้าต่างพิมพ์สำเร็จ 100%',
                        true
                    );
                    hideGlobalBarcodeLoadingPopup(220);
                } else {
                    hideGlobalBarcodeLoadingPopup(0);
                }
            };

            if (isLargeBatch) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(finalizeOpen);
                });
            } else {
                finalizeOpen();
            }
        },

        syncControlsToState() {
            const sizeEl = document.getElementById('thermalSizeSelect');
            if (sizeEl) studioState.sizeKey = sizeEl.value || 'A4';

            const customBox = document.getElementById('wmsBpCustomSizeBox');
            if (customBox) {
                customBox.style.display = studioState.sizeKey === 'CUSTOM' ? 'grid' : 'none';
            }

            const cwEl = document.getElementById('wmsBpCustomW');
            const chEl = document.getElementById('wmsBpCustomH');
            if (cwEl) studioState.customWidthMm = Number(cwEl.value) || 50;
            if (chEl) studioState.customHeightMm = Number(chEl.value) || 30;

            const copiesEl = document.getElementById('wmsBpCopiesInput');
            if (copiesEl) studioState.copiesPerSn = Math.max(1, Math.min(100, Number(copiesEl.value) || 1));

            const optName = document.getElementById('wmsBpOptName');
            const optSku = document.getElementById('wmsBpOptSku');
            const optLoc = document.getElementById('wmsBpOptLoc');
            const optMeter = document.getElementById('wmsBpOptMeter');
            const optBorder = document.getElementById('wmsBpOptBorder');

            if (optName) studioState.showName = optName.checked;
            if (optSku) studioState.showSku = optSku.checked;
            if (optLoc) studioState.showLocation = optLoc.checked;
            if (optMeter) studioState.showMeter = optMeter.checked;
            if (optBorder) studioState.showBorder = optBorder.checked;
        },

        onSettingChange() {
            this.syncControlsToState();
            rebuildPrintQueue();
            renderCurrentPreviewPage();
            scheduleRealtimeTabSync();
        },

        onQueueSearch(val) {
            studioState.searchQuery = String(val || '');
            studioState.currentPage = 1;
            rebuildPrintQueue();
            renderCurrentPreviewPage();
            scheduleRealtimeTabSync();
        },

        loadAllFilteredFromInventory() {
            const sourceList = (typeof currentFilteredItems !== 'undefined' && Array.isArray(currentFilteredItems) && currentFilteredItems.length > 0)
                ? currentFilteredItems
                : (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData) ? globalInventoryData : []);

            if (sourceList.length === 0) {
                notifyUser('⚠️ ไม่พบรายการสินค้าในหน้าเช็คสต็อก', true);
                return;
            }

            showGlobalBarcodeLoadingPopup(
                'กำลังดึงรายการทั้งหมดเข้าคิวพิมพ์...',
                `กำลังรวมรายการจากหน้าเช็คสต็อก ${sourceList.length.toLocaleString()} S/N`,
                45,
                `กำลังจัดเรียง ${sourceList.length.toLocaleString()} รายการ`,
                false
            );

            requestAnimationFrame(() => {
                studioState.rawItems = sourceList.slice();
                window.currentPrintBarcodeList = studioState.rawItems;
                studioState.currentPage = 1;
                rebuildPrintQueue();
                renderCurrentPreviewPage();
                scheduleRealtimeTabSync();
                hideGlobalBarcodeLoadingPopup(160);
                notifyUser(`✅ ดึงรายการทั้งหมด ${sourceList.length.toLocaleString()} S/N เข้าคิวพิมพ์แล้ว`);
            });
        },

        onPageRangeModeChange(mode) {
            studioState.pageRangeMode = mode || 'ALL';
            const rangeInputs = document.getElementById('wmsBpPageRangeInputs');
            if (rangeInputs) {
                rangeInputs.style.display = studioState.pageRangeMode === 'RANGE' ? 'grid' : 'none';
            }
            const pageTo = document.getElementById('wmsBpPageTo');
            if (pageTo) pageTo.value = String(studioState.totalPages);
            scheduleRealtimeTabSync();
        },

        goToPage(pageNum) {
            const target = Math.max(1, Math.min(studioState.totalPages, Number(pageNum) || 1));
            studioState.currentPage = target;
            renderCurrentPreviewPage();
        },

        getCurrentPage() {
            return studioState.currentPage;
        },

        getTotalPages() {
            return studioState.totalPages;
        },

        cancelSpooling() {
            studioState.cancelSpoolRequested = true;
        }
    };

    // เชื่อมต่อกับฟังก์ชันเดิมทั้งระบบ (Backward Compatible 100%)
    window.openPrintBarcodeModal = function (mode, targetSn = null) {
        const allItems = (typeof globalInventoryData !== 'undefined' && Array.isArray(globalInventoryData))
            ? globalInventoryData
            : [];

        if (mode === 'ALL_FILTERED' || mode === 'GROUP' || mode === 'MULTI') {
            showGlobalBarcodeLoadingPopup(
                'กำลังเตรียมรายการบาร์โค้ด...',
                'กรุณารอสักครู่ ระบบกำลังรวบรวมข้อมูลซีเรียลสำหรับพิมพ์',
                20,
                'กำลังตรวจสอบรายการในสต็อก...',
                false
            );
        }

        const resolveAndOpen = () => {
            let itemsToLoad = [];

            if (mode === 'SINGLE') {
                const found = allItems.find(i => i.sn === targetSn);
                itemsToLoad = found ? [found] : [];
            } else if (mode === 'ALL_FILTERED') {
                itemsToLoad = (typeof currentFilteredItems !== 'undefined' && Array.isArray(currentFilteredItems))
                    ? currentFilteredItems
                    : allItems;
            } else if (mode === 'GROUP' && targetSn) {
                // targetSn ในโหมด GROUP คือ groupKey (category||name)
                itemsToLoad = allItems.filter(i => `${(i.category || 'N/A').trim()}||${(i.name || '-').trim()}` === targetSn);
            } else {
                // โหมด MULTI (รายการที่ติ๊กเลือกไว้)
                if (typeof selectedItemSnSet === 'undefined' || selectedItemSnSet.size === 0) {
                    hideGlobalBarcodeLoadingPopup(0);
                    notifyUser('⚠️ กรุณาเลือกรายการสติกเกอร์บาร์โค้ดที่ต้องการพิมพ์ในตาราง', true);
                    return;
                }
                itemsToLoad = allItems.filter(i => selectedItemSnSet.has(i.sn));
            }

            if (itemsToLoad.length === 0) {
                hideGlobalBarcodeLoadingPopup(0);
                notifyUser('⚠️ ไม่พบข้อมูลรายการสินค้าสำหรับพิมพ์บาร์โค้ด', true);
                return;
            }

            WMSBarcodeStudio.openWithItems(itemsToLoad);
        };

        if (mode === 'ALL_FILTERED' || mode === 'GROUP' || mode === 'MULTI') {
            requestAnimationFrame(resolveAndOpen);
        } else {
            resolveAndOpen();
        }
    };

    window.closePrintBarcodeModal = function () {
        if (studioState.isSpooling) {
            studioState.cancelSpoolRequested = true;
        }
        hideGlobalBarcodeLoadingPopup(0);
        WMSBarcodeStudio.closeFullscreenPdfPopup();
        const modal = document.getElementById('printBarcodeModal');
        if (modal) {
            modal.style.display = 'none';
        }
        if (typeof window.syncStockDetailParentState === 'function') {
            window.syncStockDetailParentState();
        }
    };

    window.updatePrintPreviewLayout = function () {
        WMSBarcodeStudio.onSettingChange();
    };

    window.triggerPDFPrintPreview = function (openInNewTab = false) {
        executeHighSpeedPrintSpooler(Boolean(openInNewTab));
    };

    window.WMSBarcodeStudio = WMSBarcodeStudio;
})();