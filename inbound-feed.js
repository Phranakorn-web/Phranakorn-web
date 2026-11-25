// =========================================================================
// --- MODULE 3.6: INBOUND LIVE FEED, DOC SEARCH & 1-CLICK DOC REUSE ---
// --- Renders Directly into #liveInboundFeedContainer (Zero Item Loss) ---
// --- Real-time DB Sync Badges, Orphan Queue Recovery & 1-Click Undo ---
// =========================================================================

var RECENT_INBOUND_CACHE_KEY = 'WMS_RECENT_INBOUND_CACHE_V2';
var INBOUND_DOC_UNDO_STACK_KEY = 'WMS_INBOUND_DOC_UNDO_STACK_V1';
var FEED_RENDER_PAGE_SIZE = 50;
var MAX_DOC_UNDO_HISTORY = 30;

var currentFeedDisplayLimit = FEED_RENDER_PAGE_SIZE;
var currentFeedFilterMode = 'all'; // 'all' | 'has_doc' | 'unsynced'
var isFetchingInboundFromDb = false;
var inboundDocUndoStack = [];
var isUndoBannerDismissed = false;

// =========================================================================
// 0. DOC BIND / REUSE UNDO STACK PERSISTENCE (1-CLICK REVERT ENGINE)
// =========================================================================

function saveInboundDocUndoStack() {
    try {
        localStorage.setItem(
            INBOUND_DOC_UNDO_STACK_KEY,
            JSON.stringify((Array.isArray(inboundDocUndoStack) ? inboundDocUndoStack : []).slice(0, MAX_DOC_UNDO_HISTORY))
        );
    } catch (e) {}
}

function loadInboundDocUndoStack() {
    try {
        const raw = localStorage.getItem(INBOUND_DOC_UNDO_STACK_KEY);
        if (!raw) return inboundDocUndoStack;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            inboundDocUndoStack = parsed.filter(entry => entry && entry.type).slice(0, MAX_DOC_UNDO_HISTORY);
        }
    } catch (e) {}
    return inboundDocUndoStack;
}

function pushInboundDocUndoAction(actionObj) {
    if (!actionObj || !actionObj.type) return;
    if (!Array.isArray(inboundDocUndoStack)) inboundDocUndoStack = [];
    inboundDocUndoStack.unshift({
        ...actionObj,
        id: `UNDO_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString()
    });
    if (inboundDocUndoStack.length > MAX_DOC_UNDO_HISTORY) {
        inboundDocUndoStack.length = MAX_DOC_UNDO_HISTORY;
    }
    isUndoBannerDismissed = false;
    saveInboundDocUndoStack();
    renderInboundDocUndoBanner();
}

function dismissInboundDocUndoBanner() {
    isUndoBannerDismissed = true;
    const banner = document.getElementById('wmsInboundDocUndoBanner');
    if (banner) banner.style.display = 'none';
}

function showUndoableFeedToast(plainTextMessage, duration = 4800) {
    if (typeof showToast === 'function') {
        showToast(plainTextMessage, false, duration);
    }
    const toastEl = document.getElementById('toastAlert');
    const msgEl = document.getElementById('toastMessage');
    if (!toastEl || !msgEl) return;

    // เสริมปุ่มกดย้อนกลับในแถบ Toast โดยยังคงข้อความเดิมครบถ้วน
    msgEl.innerHTML = `
        <span style="display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>${escapeHTML(plainTextMessage)}</span>
            <button type="button"
                    onclick="undoLastInboundDocAction()"
                    style="background:#ffffff; color:#0f172a; border:none; border-radius:6px; padding:3px 9px; font-size:0.75rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(0,0,0,0.2);">
                <i class="fa-solid fa-rotate-left"></i> ย้อนกลับ / คืนค่าเดิม
            </button>
        </span>
    `;
}

function renderInboundDocUndoBanner() {
    const banner = document.getElementById('wmsInboundDocUndoBanner');
    if (!banner) return;

    if (!Array.isArray(inboundDocUndoStack) || inboundDocUndoStack.length === 0 || isUndoBannerDismissed) {
        banner.style.display = 'none';
        return;
    }

    const latest = inboundDocUndoStack[0];
    let descHtml = '';

    if (latest.type === 'REUSE_FORM_DOC') {
        const prevSummary = [
            latest.prevTaxInvoice ? `INV: ${escapeHTML(latest.prevTaxInvoice)}` : '',
            latest.prevPoNumber ? `PO: ${escapeHTML(latest.prevPoNumber)}` : ''
        ].filter(Boolean).join(' • ') || 'ค่าว่าง (ไม่ระบุเอกสาร)';
        descHtml = `เพิ่งดึงเอกสารมาใช้งานต่อ — กดย้อนกลับเพื่อคืนค่าเดิม (<strong>${prevSummary}</strong>)`;
    } else if (latest.type === 'ATTACH_ITEM_DOC' || latest.type === 'DETACH_ITEM_DOC') {
        const snSafe = escapeHTML(latest.sn || '');
        const prevSummary = [
            latest.prevTaxInvoice ? `INV: ${escapeHTML(latest.prevTaxInvoice)}` : '',
            latest.prevPoNumber ? `PO: ${escapeHTML(latest.prevPoNumber)}` : ''
        ].filter(Boolean).join(' • ') || 'ไม่มีเอกสารผูกอยู่';
        const actionLabel = latest.type === 'DETACH_ITEM_DOC' ? 'เพิ่งปลดเอกสารออกจาก' : 'เพิ่งผูกเอกสารเข้ากับ';
        descHtml = `${actionLabel} S/N <strong class="mono">${snSafe}</strong> — คืนค่าเดิมเป็น (<strong>${prevSummary}</strong>)`;
    } else {
        descHtml = `มีการแก้ไขข้อมูลเอกสารล่าสุด สามารถกดย้อนกลับเพื่อคืนค่าเดิมได้ทันที`;
    }

    banner.style.display = 'flex';
    banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:7px; min-width:0; flex:1; font-size:0.74rem; color:var(--warning-text, #92400e); line-height:1.35;">
            <i class="fa-solid fa-clock-rotate-left" style="flex-shrink:0;"></i>
            <span style="word-break:break-word;">${descHtml}</span>
        </div>
        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
            <button type="button"
                    onclick="undoLastInboundDocAction()"
                    style="background:var(--warning, #f59e0b); color:#ffffff; border:none; border-radius:7px; padding:4px 10px; font-size:0.73rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
                <i class="fa-solid fa-rotate-left"></i> คืนค่าเดิม${inboundDocUndoStack.length > 1 ? ` (${inboundDocUndoStack.length})` : ''}
            </button>
            <button type="button"
                    onclick="dismissInboundDocUndoBanner()"
                    title="ซ่อนแถบแจ้งเตือนนี้"
                    style="background:transparent; border:none; color:var(--warning-text, #92400e); cursor:pointer; padding:2px 5px; font-size:0.85rem;">&times;</button>
        </div>
    `;
}

// =========================================================================
// 1. LOCAL CACHE & ORPHAN QUEUE RECOVERY
// =========================================================================

function saveRecentInboundFeedToCache() {
    try {
        if (!Array.isArray(recentInboundList)) return;
        localStorage.setItem(RECENT_INBOUND_CACHE_KEY, JSON.stringify(recentInboundList.slice(0, 1000)));
    } catch (e) {
        try {
            localStorage.setItem(RECENT_INBOUND_CACHE_KEY, JSON.stringify(recentInboundList.slice(0, 250)));
        } catch (err) {}
    }
}

function reconcileOrphanedQueuedFeedItems() {
    if (!Array.isArray(recentInboundList) || recentInboundList.length === 0) return;
    if (typeof persistentDbSyncQueue === 'undefined' || !Array.isArray(persistentDbSyncQueue)) return;

    const queuedSnSet = new Set(
        persistentDbSyncQueue
            .map(entry => String(entry?.payload?.sn || '').trim().toUpperCase())
            .filter(Boolean)
    );

    let reEnqueuedCount = 0;
    for (let i = recentInboundList.length - 1; i >= 0; i--) {
        const item = recentInboundList[i];
        if (!item || !item.sn) continue;
        const snUpper = String(item.sn).trim().toUpperCase();
        const st = String(item.db_status || 'SYNCED').toUpperCase();

        // หากรายการยังไม่ได้ซิงก์เข้า DB และไม่ได้อยู่ในคิว FIFO ให้นำกลับเข้าคิวอัตโนมัติ (ป้องกันข้อมูลสูญหาย)
        if ((st !== 'SYNCED' || item.isOffline) && !queuedSnSet.has(snUpper)) {
            queuedSnSet.add(snUpper);
            if (typeof pendingFastSnSet !== 'undefined' && pendingFastSnSet instanceof Set) {
                pendingFastSnSet.add(snUpper);
            }
            persistentDbSyncQueue.push({
                queueId: item.id || `RECOVER_${Date.now()}_${i}`,
                enqueuedAt: item.created_at || new Date().toISOString(),
                retryCount: 0,
                lastError: '',
                payload: item
            });
            reEnqueuedCount++;
        }
    }

    if (reEnqueuedCount > 0) {
        if (typeof savePersistentDbQueueImmediate === 'function') {
            savePersistentDbQueueImmediate();
        }
        if (typeof flushPersistentDbSyncQueue === 'function' && navigator.onLine) {
            setTimeout(() => flushPersistentDbSyncQueue(false), 120);
        }
    }
}

function loadRecentInboundFeedFromCache() {
    loadInboundDocUndoStack();
    try {
        const raw = localStorage.getItem(RECENT_INBOUND_CACHE_KEY) || localStorage.getItem('WMS_RECENT_INBOUND_CACHE');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            recentInboundList = parsed.filter(item => item && item.sn);
            if (typeof window !== 'undefined') window.recentInboundList = recentInboundList;
            reconcileOrphanedQueuedFeedItems();
        }
    } catch (e) {}
    return recentInboundList;
}

function getInboundFeedHostElement() {
    // ตรงกับ ID ใน index.html (#liveInboundFeedContainer)
    return document.getElementById('liveInboundFeedContainer') ||
           document.getElementById('recentInboundFeed') ||
           document.getElementById('liveInboundFeedList');
}

function formatInboundTimestamp(isoString) {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return String(isoString);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
    } catch (e) {
        return String(isoString);
    }
}

function getItemTaxInvoice(item) {
    if (!item) return '';
    return String(item.tax_invoice_no || item.taxInvoice || '').trim();
}

function getItemPoNumber(item) {
    if (!item) return '';
    return String(item.po_number || item.poNumber || '').trim();
}

function ensureInboundFeedToolbar() {
    const feedHost = getInboundFeedHostElement();
    if (!feedHost || !feedHost.parentElement) return null;

    let toolbar = document.getElementById('wmsInboundFeedToolbar');
    if (toolbar) {
        renderInboundDocUndoBanner();
        return toolbar;
    }

    toolbar = document.createElement('div');
    toolbar.id = 'wmsInboundFeedToolbar';
    toolbar.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 10px;
        padding: 10px;
        background: var(--bg-subtle);
        border: 1px solid var(--border-color);
        border-radius: 12px;
    `;

    toolbar.innerHTML = `
        <div id="wmsInboundDocUndoBanner" style="display:none; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border-radius:9px; background:var(--warning-light, #fef3c7); border:1.5px solid var(--warning-border, #f59e0b);"></div>

        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
            <span id="wmsFeedFilteredCountPill" class="badge-location mono" style="font-size:0.74rem;">0 รายการ</span>
            <button type="button" id="btnRefreshInboundFeedDb" class="wms-mini-tool-btn" onclick="fetchLatestInboundFromSupabase(false)">
                <i class="fa-solid fa-cloud-arrow-down"></i> ดึงข้อมูล DB ล่าสุด
            </button>
        </div>

        <div style="position:relative; display:flex; align-items:center;">
            <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:10px; color:var(--text-muted); font-size:0.8rem; pointer-events:none;"></i>
            <input type="text"
                   id="recentFeedSearchInput"
                   class="form-control"
                   style="padding-left:30px; padding-right:28px; font-size:0.8rem; height:34px; min-height:34px;"
                   placeholder="ค้นหา S/N, ใบกำกับภาษี, เลข PO, SKU, รุ่น, พิกัด..."
                   value="${escapeHTML(recentFeedSearchQuery || '')}"
                   oninput="onRecentFeedSearchInput(this.value)"
                   autocomplete="off">
            <button type="button"
                    id="btnClearRecentFeedSearch"
                    onclick="clearRecentFeedSearch()"
                    style="position:absolute; right:7px; background:none; border:none; color:var(--text-muted); cursor:pointer; display:${recentFeedSearchQuery ? 'inline-block' : 'none'};">&times;</button>
        </div>

        <div style="display:flex; gap:5px; flex-wrap:wrap;">
            <button type="button" class="btn btn-sm btn-primary" data-feed-filter="all" onclick="setRecentFeedFilterMode('all')">ทั้งหมด</button>
            <button type="button" class="btn btn-sm btn-secondary" data-feed-filter="has_doc" onclick="setRecentFeedFilterMode('has_doc')">มีใบกำกับฯ / PO</button>
            <button type="button" class="btn btn-sm btn-secondary" data-feed-filter="unsynced" onclick="setRecentFeedFilterMode('unsynced')">รอซิงก์ DB</button>
        </div>
    `;

    feedHost.parentElement.insertBefore(toolbar, feedHost);
    renderInboundDocUndoBanner();
    return toolbar;
}

function onRecentFeedSearchInput(val) {
    recentFeedSearchQuery = String(val || '');
    currentFeedDisplayLimit = FEED_RENDER_PAGE_SIZE;
    const clearBtn = document.getElementById('btnClearRecentFeedSearch');
    if (clearBtn) clearBtn.style.display = recentFeedSearchQuery.trim() ? 'inline-block' : 'none';
    renderLiveInboundFeed();
}

function clearRecentFeedSearch() {
    recentFeedSearchQuery = '';
    currentFeedDisplayLimit = FEED_RENDER_PAGE_SIZE;
    const inp = document.getElementById('recentFeedSearchInput');
    if (inp) { inp.value = ''; inp.focus(); }
    const clearBtn = document.getElementById('btnClearRecentFeedSearch');
    if (clearBtn) clearBtn.style.display = 'none';
    renderLiveInboundFeed();
}

function setRecentFeedFilterMode(mode) {
    currentFeedFilterMode = mode || 'all';
    currentFeedDisplayLimit = FEED_RENDER_PAGE_SIZE;

    document.querySelectorAll('[data-feed-filter]').forEach(btn => {
        const isAct = btn.getAttribute('data-feed-filter') === currentFeedFilterMode;
        btn.className = `btn btn-sm ${isAct ? 'btn-primary' : 'btn-secondary'}`;
    });

    renderLiveInboundFeed();
}

function expandFeedDisplayLimit(loadAll = false) {
    if (loadAll) {
        currentFeedDisplayLimit = Math.max(recentInboundList.length, 2000);
    } else {
        currentFeedDisplayLimit += FEED_RENDER_PAGE_SIZE;
    }
    renderLiveInboundFeed();
}

function scheduleDebouncedFeedRender() {
    if (isFeedRenderScheduled) return;
    isFeedRenderScheduled = true;
    requestAnimationFrame(() => {
        isFeedRenderScheduled = false;
        renderLiveInboundFeed();
    });
}

function renderLiveInboundFeed() {
    ensureInboundFeedToolbar();
    const feedHost = getInboundFeedHostElement();
    if (!feedHost) return;

    const allItems = Array.isArray(recentInboundList) ? recentInboundList : [];
    const q = String(recentFeedSearchQuery || '').trim().toLowerCase();

    const filteredItems = allItems.filter(item => {
        if (!item || !item.sn) return false;
        const taxInv = getItemTaxInvoice(item);
        const poNo = getItemPoNumber(item);

        if (currentFeedFilterMode === 'has_doc' && !taxInv && !poNo) return false;
        if (currentFeedFilterMode === 'unsynced') {
            const st = String(item.db_status || 'SYNCED').toUpperCase();
            if (st === 'SYNCED' && !item.isOffline) return false;
        }

        if (!q) return true;
        const text = [
            item.sn,
            item.sku,
            item.category,
            item.name,
            item.location,
            item.recorded_by,
            taxInv,
            poNo
        ].filter(Boolean).join(' ').toLowerCase();
        return text.includes(q);
    });

    const countPill = document.getElementById('wmsFeedFilteredCountPill');
    if (countPill) {
        countPill.textContent = filteredItems.length === allItems.length
            ? `${allItems.length.toLocaleString()} รายการ`
            : `พบ ${filteredItems.length.toLocaleString()} / ${allItems.length.toLocaleString()} รายการ`;
    }

    const headerBadge = document.getElementById('recentInboundCountBadge');
    if (headerBadge) {
        const pendingCnt = Array.isArray(persistentDbSyncQueue) ? persistentDbSyncQueue.length : 0;
        headerBadge.innerHTML = pendingCnt > 0
            ? `<span class="pulse-dot" style="background:var(--warning);"></span> รอซิงก์ DB ${pendingCnt} รายการ`
            : `<span class="pulse-dot"></span> แสดง ${allItems.length.toLocaleString()} รายการ`;
    }

    if (filteredItems.length === 0) {
        const msg = (q || currentFeedFilterMode !== 'all')
            ? `ไม่พบรายการที่ค้นหา "${escapeHTML(recentFeedSearchQuery)}"`
            : 'ยังไม่มีรายการรับเข้าใหม่ — เริ่มค้นหา SKU และยิงสแกน S/N ด้านซ้ายได้เลย';
        feedHost.innerHTML = `
            <div style="text-align:center; padding:24px 12px; color:var(--text-muted); font-size:0.84rem; border:1px dashed var(--border-strong); border-radius:12px;">
                <i class="fa-solid fa-box-open" style="font-size:1.6rem; opacity:0.5; margin-bottom:6px; display:block;"></i>
                ${msg}
            </div>
        `;
        return;
    }

    const visibleItems = filteredItems.slice(0, currentFeedDisplayLimit);
    const activeDocs = typeof getActiveInboundDocRefs === 'function'
        ? getActiveInboundDocRefs()
        : { taxInvoice: '', poNumber: '', hasAnyDoc: false };

    const chunks = [`<div style="display:flex; flex-direction:column; gap:9px;">`];

    for (let i = 0; i < visibleItems.length; i++) {
        const item = visibleItems[i];
        const sn = String(item.sn || '').trim();
        const sku = String(item.sku || item.category || 'UNSPECIFIED').trim();
        const name = String(item.name || sku).trim();
        const location = String(item.location || 'DOCK').trim();
        const meterVal = item.meter !== undefined && item.meter !== null ? String(item.meter).trim() : '0';
        const recordedBy = String(item.recorded_by || 'admin').trim();
        const timeStr = formatInboundTimestamp(item.created_at);
        const taxInv = getItemTaxInvoice(item);
        const poNo = getItemPoNumber(item);
        const itemIdStr = item.id !== undefined && item.id !== null ? String(item.id) : '';
        const hasPrevSnapshot = Boolean(item._prevDocSnapshot && typeof item._prevDocSnapshot === 'object');

        const dbStatusUpper = String(item.db_status || 'SYNCED').toUpperCase();
        const isSynced = dbStatusUpper === 'SYNCED' && !item.isOffline;
        const isSyncError = dbStatusUpper === 'ERROR';

        let cardStateClass = '';
        let syncBadge = '';
        if (isSynced) {
            syncBadge = `<span style="font-size:0.68rem; font-weight:800; padding:2px 7px; border-radius:99px; background:var(--success-light); color:var(--success-text); border:1px solid var(--success-border);"><i class="fa-solid fa-circle-check"></i> เข้า DB</span>`;
        } else if (isSyncError) {
            cardStateClass = 'is-sync-error';
            const errTitle = escapeHTML(item.db_error || 'ซิงก์ไม่สำเร็จ คลิกเพื่อลองใหม่');
            syncBadge = `<button type="button" onclick="retryFailedInboundItemsNow()" title="${errTitle}" style="cursor:pointer; font-size:0.68rem; font-weight:800; padding:2px 7px; border-radius:99px; background:var(--danger-light); color:var(--danger-text, #dc2626); border:1px solid var(--danger-border);"><i class="fa-solid fa-rotate-right"></i> ลองซิงก์ใหม่</button>`;
        } else {
            cardStateClass = 'is-syncing';
            syncBadge = `<span style="font-size:0.68rem; font-weight:800; padding:2px 7px; border-radius:99px; background:var(--primary-light); color:var(--primary-text); border:1px solid var(--primary-border);"><i class="fa-solid fa-arrows-rotate fa-spin"></i> กำลังซิงก์</span>`;
        }

        const encSn = encodeURIComponent(sn);
        const encId = encodeURIComponent(itemIdStr);
        const encTax = encodeURIComponent(taxInv);
        const encPo = encodeURIComponent(poNo);

        let docBlock = '';
        if (taxInv || poNo) {
            const revertBtnHtml = hasPrevSnapshot
                ? `<button type="button" class="wms-mini-tool-btn" style="background:var(--warning-light, #fef3c7); border-color:var(--warning-border, #f59e0b); color:var(--warning-text, #92400e);" onclick="revertFeedItemDocRef('${encSn}')" title="ย้อนกลับคืนค่าเอกสารเดิมของรายการนี้">
                       <i class="fa-solid fa-rotate-left"></i> คืนค่าเดิม
                   </button>`
                : '';

            docBlock = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; padding:6px 8px; border-radius:8px; background:var(--primary-light); border:1px solid var(--primary-border);">
                    <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:0.71rem; font-weight:800;">
                        ${taxInv ? `<span style="color:var(--primary-text);"><i class="fa-solid fa-receipt"></i> INV: <span class="mono">${escapeHTML(taxInv)}</span></span>` : ''}
                        ${poNo ? `<span style="color:var(--purple-text);"><i class="fa-solid fa-file-contract"></i> PO: <span class="mono">${escapeHTML(poNo)}</span></span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                        ${revertBtnHtml}
                        <button type="button" class="wms-mini-tool-btn" onclick="detachDocRefFromFeedItem('${encSn}')" title="ปลด/ล้างเลขเอกสารที่ผูกกับ S/N นี้">
                            <i class="fa-solid fa-link-slash"></i> ปลดเอกสาร
                        </button>
                        <button type="button" class="wms-mini-tool-btn" onclick="reuseDocRefFromFeedCard('${encTax}', '${encPo}')" title="ดึงเลขใบกำกับภาษีและ PO นี้ไปใช้ยิง S/N ต่อ">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> ใช้ต่อ
                        </button>
                    </div>
                </div>
            `;
        } else {
            const revertEmptyBtnHtml = hasPrevSnapshot
                ? `<button type="button" class="wms-mini-tool-btn" style="background:var(--warning-light, #fef3c7); border-color:var(--warning-border, #f59e0b); color:var(--warning-text, #92400e);" onclick="revertFeedItemDocRef('${encSn}')" title="ย้อนกลับคืนค่าเอกสารเดิมของรายการนี้">
                       <i class="fa-solid fa-rotate-left"></i> คืนค่าเดิม
                   </button>`
                : '';

            if (activeDocs.hasAnyDoc || hasPrevSnapshot) {
                docBlock = `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; padding:5px 8px; border-radius:8px; background:var(--bg-subtle); border:1px dashed var(--border-strong); font-size:0.71rem;">
                        <span style="color:var(--text-muted);">ยังไม่ระบุเลขเอกสาร</span>
                        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                            ${revertEmptyBtnHtml}
                            ${activeDocs.hasAnyDoc ? `
                                <button type="button" class="wms-mini-tool-btn" onclick="attachCurrentDocRefToFeedItem('${encSn}')">
                                    <i class="fa-solid fa-link"></i> ผูกเอกสารปัจจุบัน
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
        }

        chunks.push(`
            <div class="modern-feed-card ${cardStateClass}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
                    <div style="min-width:0; flex:1;">
                        <span class="mono" style="font-size:0.72rem; font-weight:800; color:var(--primary-text); background:var(--primary-light); padding:1px 6px; border-radius:5px;">${escapeHTML(sku)}</span>
                        <div style="font-size:0.82rem; font-weight:700; color:var(--text-main); margin-top:2px; word-break:break-word;">${escapeHTML(name)}</div>
                    </div>
                    ${syncBadge}
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:6px 9px; border-radius:8px; background:var(--bg-subtle); border:1px solid var(--border-color);">
                    <div style="min-width:0;">
                        <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700;">SERIAL NUMBER (S/N)</div>
                        <div class="full-sn-text" style="font-size:0.88rem;">${escapeHTML(sn)}</div>
                    </div>
                    <button type="button" class="btn-card-action" onclick="copySnFromFeed('${encSn}')" title="คัดลอก S/N">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                </div>

                ${docBlock}

                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; font-size:0.73rem;">
                    <span class="badge-location mono"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(location)}</span>
                    ${meterVal && meterVal !== '0' ? `<span class="mono" style="color:var(--warning-text); font-weight:700;"><i class="fa-solid fa-gauge"></i> ${Number(meterVal).toLocaleString()}</span>` : ''}
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap; padding-top:6px; border-top:1px solid var(--border-color);">
                    <div style="font-size:0.7rem; color:var(--text-muted);">
                        <span><i class="fa-regular fa-clock"></i> ${escapeHTML(timeStr)}</span> • <span>${escapeHTML(recordedBy)}</span>
                    </div>
                    <div class="feed-card-actions">
                        <button type="button" class="btn-card-action" onclick="printSingleInboundBarcode('${encSn}')" title="พิมพ์สติ๊กเกอร์บาร์โค้ด">
                            <i class="fa-solid fa-print"></i>
                        </button>
                        <button type="button" class="btn-card-action btn-card-delete" onclick="deleteRecentInboundItem('${encSn}', '${encId}')" title="ลบรายการนี้">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            </div>
        `);
    }

    chunks.push(`</div>`);

    if (filteredItems.length > visibleItems.length) {
        const rem = filteredItems.length - visibleItems.length;
        chunks.push(`
            <div style="margin-top:10px; display:flex; gap:6px; justify-content:center;">
                <button type="button" class="btn btn-sm btn-secondary" onclick="expandFeedDisplayLimit(false)">
                    ดูเพิ่มอีก ${Math.min(FEED_RENDER_PAGE_SIZE, rem)} (เหลือ ${rem})
                </button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="expandFeedDisplayLimit(true)">
                    ทั้งหมด (${filteredItems.length})
                </button>
            </div>
        `);
    }

    feedHost.innerHTML = chunks.join('');
}

// =========================================================================
// 2. DOCUMENT REUSE, ATTACH, DETACH & 1-CLICK REVERT HANDLERS
// =========================================================================

function updateFeedItemDocRefsEverywhere(sn, newTaxInvoice, newPoNumber, prevSnapshot = undefined) {
    const up = String(sn || '').trim().toUpperCase();
    if (!up) return;

    const cleanTax = String(newTaxInvoice || '').trim();
    const cleanPo = String(newPoNumber || '').trim();

    const applyToList = (list) => {
        if (!Array.isArray(list)) return;
        list.forEach(r => {
            if (r && String(r.sn || '').trim().toUpperCase() === up) {
                r.tax_invoice_no = cleanTax;
                r.po_number = cleanPo;
                if (prevSnapshot !== undefined) {
                    if (prevSnapshot === null) {
                        delete r._prevDocSnapshot;
                    } else {
                        r._prevDocSnapshot = prevSnapshot;
                    }
                }
            }
        });
    };

    applyToList(recentInboundList);
    if (typeof window !== 'undefined' && Array.isArray(window.recentInboundList) && window.recentInboundList !== recentInboundList) {
        applyToList(window.recentInboundList);
    }
    if (typeof window !== 'undefined' && Array.isArray(window.globalInventoryData)) {
        applyToList(window.globalInventoryData);
    }

    // อัปเดตคิวรอซิงก์หากรายการยังอยู่ในคิว FIFO
    if (typeof persistentDbSyncQueue !== 'undefined' && Array.isArray(persistentDbSyncQueue)) {
        let queueUpdated = false;
        persistentDbSyncQueue.forEach(entry => {
            if (entry?.payload && String(entry.payload.sn || '').trim().toUpperCase() === up) {
                entry.payload.tax_invoice_no = cleanTax;
                entry.payload.po_number = cleanPo;
                queueUpdated = true;
            }
        });
        if (queueUpdated && typeof savePersistentDbQueueImmediate === 'function') {
            savePersistentDbQueueImmediate();
        }
    }
}

async function syncItemDocRefUpdateToSupabase(sn, taxInvoice, poNumber) {
    const sb = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
    if (!sb || !navigator.onLine || !sn) return;
    try {
        await sb.from('warehouse_items')
            .update({
                tax_invoice_no: String(taxInvoice || '').trim() || null,
                po_number: String(poNumber || '').trim() || null
            })
            .eq('sn', sn);
    } catch (e) {}
}

function reuseDocRefFromFeedCard(encodedTax, encodedPo) {
    const taxInv = decodeURIComponent(encodedTax || '');
    const poNo = decodeURIComponent(encodedPo || '');

    // บันทึกค่าเอกสารเดิมก่อนเปลี่ยน เพื่อรองรับการกดย้อนกลับทันทีหากกดผิด
    const prevRefs = typeof getActiveInboundDocRefs === 'function'
        ? getActiveInboundDocRefs()
        : { taxInvoice: '', poNumber: '' };
    const prevLocked = typeof isInboundDocRefLocked === 'boolean' ? isInboundDocRefLocked : true;

    pushInboundDocUndoAction({
        type: 'REUSE_FORM_DOC',
        prevTaxInvoice: prevRefs.taxInvoice || '',
        prevPoNumber: prevRefs.poNumber || '',
        prevLocked,
        newTaxInvoice: taxInv,
        newPoNumber: poNo
    });

    if (typeof setInboundDocRefs === 'function') setInboundDocRefs(taxInv, poNo, true);
    showUndoableFeedToast(`📌 ดึงเอกสาร INV: ${taxInv || '-'} | PO: ${poNo || '-'} มาใช้งานต่อแล้ว`, 5000);
    if (typeof ensureSnInputFocus === 'function') ensureSnInputFocus(true);
}

async function attachCurrentDocRefToFeedItem(encodedSn) {
    const sn = decodeURIComponent(encodedSn || '');
    if (!sn) return;
    const activeDocs = typeof getActiveInboundDocRefs === 'function' ? getActiveInboundDocRefs() : { hasAnyDoc: false };
    if (!activeDocs.hasAnyDoc) return;

    const up = sn.toUpperCase();
    const existingItem = (Array.isArray(recentInboundList) ? recentInboundList : [])
        .find(r => r && String(r.sn || '').trim().toUpperCase() === up);

    const prevTaxInvoice = existingItem ? getItemTaxInvoice(existingItem) : '';
    const prevPoNumber = existingItem ? getItemPoNumber(existingItem) : '';

    // บันทึกค่าเดิมก่อนผูกเอกสาร เพื่อรองรับปุ่มย้อนกลับ / คืนค่าเดิม
    pushInboundDocUndoAction({
        type: 'ATTACH_ITEM_DOC',
        sn,
        prevTaxInvoice,
        prevPoNumber,
        newTaxInvoice: activeDocs.taxInvoice,
        newPoNumber: activeDocs.poNumber
    });

    updateFeedItemDocRefsEverywhere(
        sn,
        activeDocs.taxInvoice,
        activeDocs.poNumber,
        { tax_invoice_no: prevTaxInvoice, po_number: prevPoNumber }
    );

    saveRecentInboundFeedToCache();
    renderLiveInboundFeed();

    await syncItemDocRefUpdateToSupabase(sn, activeDocs.taxInvoice, activeDocs.poNumber);
    showUndoableFeedToast(`🔗 ผูกเอกสารกับ S/N ${sn} เรียบร้อยแล้ว`, 5000);
}

async function detachDocRefFromFeedItem(encodedSn) {
    const sn = decodeURIComponent(encodedSn || '');
    if (!sn) return;

    const up = sn.toUpperCase();
    const existingItem = (Array.isArray(recentInboundList) ? recentInboundList : [])
        .find(r => r && String(r.sn || '').trim().toUpperCase() === up);

    const prevTaxInvoice = existingItem ? getItemTaxInvoice(existingItem) : '';
    const prevPoNumber = existingItem ? getItemPoNumber(existingItem) : '';
    if (!prevTaxInvoice && !prevPoNumber) return;

    pushInboundDocUndoAction({
        type: 'DETACH_ITEM_DOC',
        sn,
        prevTaxInvoice,
        prevPoNumber,
        newTaxInvoice: '',
        newPoNumber: ''
    });

    updateFeedItemDocRefsEverywhere(
        sn,
        '',
        '',
        { tax_invoice_no: prevTaxInvoice, po_number: prevPoNumber }
    );

    saveRecentInboundFeedToCache();
    renderLiveInboundFeed();

    await syncItemDocRefUpdateToSupabase(sn, '', '');
    showUndoableFeedToast(`🔓 ปลดเอกสารออกจาก S/N ${sn} เรียบร้อยแล้ว`, 5000);
}

async function revertFeedItemDocRef(encodedSn) {
    const sn = decodeURIComponent(encodedSn || '');
    if (!sn) return;

    const up = sn.toUpperCase();
    const existingItem = (Array.isArray(recentInboundList) ? recentInboundList : [])
        .find(r => r && String(r.sn || '').trim().toUpperCase() === up);

    if (!existingItem || !existingItem._prevDocSnapshot) {
        if (typeof showToast === 'function') {
            showToast('ℹ️ รายการนี้อยู่ในค่าเดิมอยู่แล้ว', false, 1800);
        }
        return;
    }

    const prevTax = String(existingItem._prevDocSnapshot.tax_invoice_no || '').trim();
    const prevPo = String(existingItem._prevDocSnapshot.po_number || '').trim();

    // นำรายการนี้ออกจาก Undo Stack หากตรงกัน
    if (Array.isArray(inboundDocUndoStack)) {
        inboundDocUndoStack = inboundDocUndoStack.filter(
            entry => !(entry && (entry.type === 'ATTACH_ITEM_DOC' || entry.type === 'DETACH_ITEM_DOC') && String(entry.sn || '').trim().toUpperCase() === up)
        );
        saveInboundDocUndoStack();
    }

    updateFeedItemDocRefsEverywhere(sn, prevTax, prevPo, null);
    saveRecentInboundFeedToCache();
    renderLiveInboundFeed();
    renderInboundDocUndoBanner();

    await syncItemDocRefUpdateToSupabase(sn, prevTax, prevPo);

    if (typeof playAudioFeedback === 'function') playAudioFeedback('success');
    if (typeof showToast === 'function') {
        const label = (prevTax || prevPo)
            ? `INV: ${prevTax || '-'} | PO: ${prevPo || '-'}`
            : 'ไม่มีเอกสาร';
        showToast(`↩️ คืนค่าเดิมให้ S/N ${sn} (${label}) เรียบร้อยแล้ว`, false, 2400);
    }
}

async function undoLastInboundDocAction() {
    if (!Array.isArray(inboundDocUndoStack) || inboundDocUndoStack.length === 0) {
        if (typeof showToast === 'function') {
            showToast('ℹ️ ไม่มีรายการแก้ไขเอกสารล่าสุดให้ย้อนกลับ', false, 1800);
        }
        return false;
    }

    const latest = inboundDocUndoStack.shift();
    saveInboundDocUndoStack();
    renderInboundDocUndoBanner();

    if (latest.type === 'REUSE_FORM_DOC') {
        if (typeof setInboundDocRefs === 'function') {
            setInboundDocRefs(
                latest.prevTaxInvoice || '',
                latest.prevPoNumber || '',
                typeof latest.prevLocked === 'boolean' ? latest.prevLocked : true
            );
        }
        if (typeof playAudioFeedback === 'function') playAudioFeedback('success');
        if (typeof showToast === 'function') {
            showToast(
                `↩️ คืนค่าเอกสารด้านบนเป็น INV: ${latest.prevTaxInvoice || '-'} | PO: ${latest.prevPoNumber || '-'} แล้ว`,
                false,
                2400
            );
        }
        if (typeof ensureSnInputFocus === 'function') ensureSnInputFocus(true);
        return true;
    }

    if ((latest.type === 'ATTACH_ITEM_DOC' || latest.type === 'DETACH_ITEM_DOC') && latest.sn) {
        const prevTax = String(latest.prevTaxInvoice || '').trim();
        const prevPo = String(latest.prevPoNumber || '').trim();

        updateFeedItemDocRefsEverywhere(latest.sn, prevTax, prevPo, null);
        saveRecentInboundFeedToCache();
        renderLiveInboundFeed();

        await syncItemDocRefUpdateToSupabase(latest.sn, prevTax, prevPo);

        if (typeof playAudioFeedback === 'function') playAudioFeedback('success');
        if (typeof showToast === 'function') {
            const label = (prevTax || prevPo)
                ? `INV: ${prevTax || '-'} | PO: ${prevPo || '-'}`
                : 'ไม่ระบุเอกสาร';
            showToast(`↩️ ย้อนกลับคืนค่าเดิมให้ S/N ${latest.sn} (${label}) เรียบร้อยแล้ว`, false, 2400);
        }
        return true;
    }

    return false;
}

// =========================================================================
// 3. COPY, PRINT, DELETE & SUPABASE FETCH
// =========================================================================

function copySnFromFeed(encodedSn) {
    const sn = decodeURIComponent(encodedSn || '');
    if (!sn) return;
    if (typeof copyToClipboard === 'function') copyToClipboard(sn);
    showToast(`📋 คัดลอก S/N: ${sn} แล้ว`, false, 1600);
}

function printSingleInboundBarcode(encodedSn) {
    const sn = decodeURIComponent(encodedSn || '');
    if (!sn) return;
    if (typeof window !== 'undefined' && typeof window.openPrintBarcodeModal === 'function') {
        window.openPrintBarcodeModal('SINGLE', sn);
        return;
    }
    showToast(`🖨️ เตรียมพิมพ์บาร์โค้ด S/N: ${sn}`, false, 2000);
}

async function deleteRecentInboundItem(encodedSn, encodedId = '') {
    const sn = decodeURIComponent(encodedSn || '');
    const itemId = decodeURIComponent(encodedId || '');
    if (!sn && !itemId) return;

    if (typeof removeInboundItemFromLocalStateOnly === 'function') {
        removeInboundItemFromLocalStateOnly(sn, itemId);
    }

    showToast(`🗑️ ลบรายการ S/N: ${sn} ออกจากระบบเรียบร้อยแล้ว`, false, 2000);

    const sb = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
    if (sb && navigator.onLine) {
        try {
            if (itemId && !itemId.startsWith('TMP_') && !itemId.startsWith('RECOVER_')) {
                await sb.from('warehouse_items').delete().eq('id', itemId);
            } else if (sn) {
                await sb.from('warehouse_items').delete().eq('sn', sn);
            }
        } catch (e) {}
    }
}

async function fetchLatestInboundFromSupabase(silent = false) {
    if (isFetchingInboundFromDb) return;
    const sb = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
    if (!sb || !navigator.onLine) {
        renderLiveInboundFeed();
        return;
    }

    isFetchingInboundFromDb = true;
    const btn = document.getElementById('btnRefreshInboundFeedDb');
    if (btn) btn.disabled = true;

    try {
        const { data, error } = await sb
            .from('warehouse_items')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

        if (error) throw error;

        if (Array.isArray(data)) {
            const deletedStatuses = new Set(['DELETED', 'OUT', 'DISPATCHED', 'CANCELLED', 'VOID', 'REMOVED']);
            const localMap = new Map();

            // รักษารายการในเครื่องที่มีอยู่เดิมไว้ครบถ้วน ไม่ให้หาย
            (Array.isArray(recentInboundList) ? recentInboundList : []).forEach(item => {
                if (item && item.sn) {
                    localMap.set(String(item.sn).trim().toUpperCase(), item);
                }
            });

            // สร้างชุดข้อมูลล่าสุดจาก Supabase
            const dbRowMap = new Map();
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (!row || !row.sn) continue;
                const up = String(row.sn).trim().toUpperCase();
                const rowStatus = String(row.status || '').trim().toUpperCase();
                if (row.is_deleted === true || deletedStatuses.has(rowStatus)) continue;
                dbRowMap.set(up, row);
            }

            const merged = [];
            const seen = new Set();

            // 1. คิวที่กำลังรอซิงก์อยู่บนสุด (แต่หากพบว่าเข้า DB แล้วให้ปรับเป็น SYNCED และเอาออกจากคิวทันที)
            localMap.forEach((val, key) => {
                const st = String(val.db_status || 'SYNCED').toUpperCase();
                if (st !== 'SYNCED' || val.isOffline) {
                    if (dbRowMap.has(key)) {
                        const dbRow = dbRowMap.get(key);
                        seen.add(key);
                        const mergedSyncedItem = {
                            ...dbRow,
                            sku: dbRow.sku || dbRow.category || val.sku || 'UNSPECIFIED',
                            category: dbRow.category || dbRow.sku || val.category || 'UNSPECIFIED',
                            tax_invoice_no: dbRow.tax_invoice_no || val.tax_invoice_no || '',
                            po_number: dbRow.po_number || val.po_number || '',
                            db_status: 'SYNCED',
                            db_error: '',
                            isOffline: false
                        };
                        if (val._prevDocSnapshot) mergedSyncedItem._prevDocSnapshot = val._prevDocSnapshot;
                        merged.push(mergedSyncedItem);

                        // ลบออกจากคิวรอซิงก์หากอยู่ใน DB แล้ว
                        if (Array.isArray(persistentDbSyncQueue)) {
                            for (let qIdx = persistentDbSyncQueue.length - 1; qIdx >= 0; qIdx--) {
                                if (String(persistentDbSyncQueue[qIdx]?.payload?.sn || '').trim().toUpperCase() === key) {
                                    persistentDbSyncQueue.splice(qIdx, 1);
                                }
                            }
                            if (typeof savePersistentDbQueueImmediate === 'function') savePersistentDbQueueImmediate();
                        }
                        if (typeof pendingFastSnSet !== 'undefined' && pendingFastSnSet instanceof Set) {
                            pendingFastSnSet.delete(key);
                        }
                    } else {
                        seen.add(key);
                        merged.push(val);
                    }
                }
            });

            // 2. ข้อมูลล่าสุดจาก Supabase
            dbRowMap.forEach((row, up) => {
                if (seen.has(up)) return;
                seen.add(up);
                const prevLocal = localMap.get(up);
                const mergedRow = {
                    ...row,
                    sku: row.sku || row.category || 'UNSPECIFIED',
                    category: row.category || row.sku || 'UNSPECIFIED',
                    tax_invoice_no: row.tax_invoice_no || '',
                    po_number: row.po_number || '',
                    db_status: 'SYNCED',
                    db_error: '',
                    isOffline: false
                };
                if (prevLocal && prevLocal._prevDocSnapshot) {
                    mergedRow._prevDocSnapshot = prevLocal._prevDocSnapshot;
                }
                merged.push(mergedRow);
            });

            // 3. รายการอื่นๆ ที่เคยแคชไว้ในเครื่องและยังไม่ซ้ำ
            localMap.forEach((val, key) => {
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(val);
                }
            });

            recentInboundList = merged.slice(0, 1500);
            if (typeof window !== 'undefined') window.recentInboundList = recentInboundList;

            saveRecentInboundFeedToCache();
            if (typeof invalidateOccupiedLocationsCache === 'function') invalidateOccupiedLocationsCache();
            if (typeof updateInboundNetworkSyncHUD === 'function') updateInboundNetworkSyncHUD();
            renderLiveInboundFeed();

            if (!silent) {
                showToast(`✅ ดึงประวัติรับเข้าล่าสุดสำเร็จ (${recentInboundList.length.toLocaleString()} รายการ)`, false, 2000);
            }
        }
    } catch (err) {
        if (!silent) {
            showToast(`⚠️ ไม่สามารถดึงข้อมูลล่าสุดได้: ${err?.message || 'ตรวจสอบการเชื่อมต่อ'}`, true, 2400);
        }
    } finally {
        isFetchingInboundFromDb = false;
        if (btn) btn.disabled = false;
    }
}

if (typeof window !== 'undefined') {
    window.saveRecentInboundFeedToCache = saveRecentInboundFeedToCache;
    window.loadRecentInboundFeedFromCache = loadRecentInboundFeedFromCache;
    window.reconcileOrphanedQueuedFeedItems = reconcileOrphanedQueuedFeedItems;
    window.onRecentFeedSearchInput = onRecentFeedSearchInput;
    window.clearRecentFeedSearch = clearRecentFeedSearch;
    window.setRecentFeedFilterMode = setRecentFeedFilterMode;
    window.expandFeedDisplayLimit = expandFeedDisplayLimit;
    window.scheduleDebouncedFeedRender = scheduleDebouncedFeedRender;
    window.renderLiveInboundFeed = renderLiveInboundFeed;
    window.reuseDocRefFromFeedCard = reuseDocRefFromFeedCard;
    window.attachCurrentDocRefToFeedItem = attachCurrentDocRefToFeedItem;
    window.detachDocRefFromFeedItem = detachDocRefFromFeedItem;
    window.revertFeedItemDocRef = revertFeedItemDocRef;
    window.undoLastInboundDocAction = undoLastInboundDocAction;
    window.dismissInboundDocUndoBanner = dismissInboundDocUndoBanner;
    window.renderInboundDocUndoBanner = renderInboundDocUndoBanner;
    window.copySnFromFeed = copySnFromFeed;
    window.printSingleInboundBarcode = printSingleInboundBarcode;
    window.deleteRecentInboundItem = deleteRecentInboundItem;
    window.fetchLatestInboundFromSupabase = fetchLatestInboundFromSupabase;
}