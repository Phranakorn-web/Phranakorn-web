// =========================================================================
// --- MODULE 2 ENTRY BRIDGE: INVENTORY CHECK ORCHESTRATOR ---
// --- FILE: inv-db.js (AUTO-LINKS inv-stock.css & MODULAR inv-*.js) ---
// =========================================================================

(function () {
    'use strict';

    window.WMSStockModules = window.WMSStockModules || {};
    if (window.WMSStockModules.entryLoaded) return;
    window.WMSStockModules.entryLoaded = true;

    // 1. ตรวจสอบและแนบไฟล์ inv-stock.css เข้ากับหน้าเว็บทันที
    if (typeof document !== 'undefined' && !document.getElementById('wmsInvStockStylesheet')) {
        const hasCss = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .some(l => (l.getAttribute('href') || '').includes('inv-stock.css'));
        if (!hasCss) {
            const link = document.createElement('link');
            link.id = 'wmsInvStockStylesheet';
            link.rel = 'stylesheet';
            link.href = 'inv-stock.css';
            document.head.appendChild(link);
        }
    }

    // 2. รายการโมดูลย่อยของหน้าเช็คสต็อกเรียงตามลำดับการพึ่งพา (Directional Dependency)
    const ORDERED_MODULES = [
        { flag: 'coreSyncLoaded', src: 'inv-core-sync.js' },
        { flag: 'tableViewLoaded', src: 'inv-table-view.js' },
        { flag: 'serialModalLoaded', src: 'inv-serial-modal.js' },
        { flag: 'bulkDeleteLoaded', src: 'inv-bulk-delete.js' }
    ];

    function loadScriptSequentially(index) {
        if (index >= ORDERED_MODULES.length) {
            if (typeof initWmsModalStackObserver === 'function') initWmsModalStackObserver();
            if (typeof initWmsRealtimeSync === 'function') initWmsRealtimeSync();
            return;
        }

        const mod = ORDERED_MODULES[index];
        if (window.WMSStockModules[mod.flag]) {
            loadScriptSequentially(index + 1);
            return;
        }

        const existingScript = Array.from(document.querySelectorAll('script[src]'))
            .find(s => (s.getAttribute('src') || '').split('?')[0].endsWith(mod.src));

        if (existingScript) {
            if (existingScript.dataset.wmsLoaded === 'true' || existingScript.readyState === 'complete' || existingScript.readyState === 'loaded') {
                loadScriptSequentially(index + 1);
            } else {
                existingScript.addEventListener('load', () => {
                    existingScript.dataset.wmsLoaded = 'true';
                    loadScriptSequentially(index + 1);
                }, { once: true });
                existingScript.addEventListener('error', () => loadScriptSequentially(index + 1), { once: true });
            }
            return;
        }

        const script = document.createElement('script');
        script.src = mod.src;
        script.async = false;
        script.onload = () => {
            script.dataset.wmsLoaded = 'true';
            loadScriptSequentially(index + 1);
        };
        script.onerror = () => {
            console.error(`[WMS Inventory] ไม่สามารถโหลดโมดูล ${mod.src}`);
            loadScriptSequentially(index + 1);
        };
        document.head.appendChild(script);
    }

    if (typeof document !== 'undefined') {
        loadScriptSequentially(0);
    }
})();