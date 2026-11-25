// =========================================================================
// --- MODULE 3.7: INBOUND MASTER ORCHESTRATOR & SKU SEARCH ENGINE ---
// --- Connects #skuSearchInput, #skuSuggestionsBox, #inboundForm & All Modules ---
// --- 100% Safe Post-Load Protection, Auto Queue Flush & Cross-OS Ready ---
// =========================================================================

var WMS_MASTER_SKU_CACHE_KEY = 'WMS_MASTER_SKU_CATALOG_V2';
var WMS_RECENT_USED_SKUS_KEY = 'WMS_RECENT_USED_SKUS_V1';
var WMS_INBOUND_SESSION_STATS_KEY = 'WMS_INBOUND_SESSION_STATS_V1';
var WMS_MAX_RECENT_SKUS = 15;
var WMS_MAX_SESSION_SN_HISTORY = 5000;

var masterSkuCatalogList = [];
var recentUsedSkuCodes = [];
var currentFilteredSkuSuggestions = [];
var activeSkuSuggestionIndex = -1;
var isInboundMasterInitialized = false;

// สถิติการสแกนรับเข้าในเซสชันปัจจุบัน (รองรับการบันทึกถาวรใน localStorage)
var inboundSessionStats = {
    startedAt: new Date().toISOString(),
    scannedCount: 0,
    duplicateWarningCount: 0,
    lastScannedSn: '',
    lastScannedSku: '',
    sessionSnSet: new Set()
};

function safeEscapeInboundHtml(str) {
    if (typeof escapeHTML === 'function') {
        return escapeHTML(str);
    }
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function encodeSkuParam(val) {
    return encodeURIComponent(String(val ?? '')).replace(/'/g, '%27');
}

function highlightMatchedTokens(text, tokens = []) {
    const raw = String(text ?? '');
    if (!raw || !Array.isArray(tokens) || tokens.length === 0) {
        return safeEscapeInboundHtml(raw);
    }

    const escapedRegexTokens = tokens
        .filter(Boolean)
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .sort((a, b) => b.length - a.length);

    if (escapedRegexTokens.length === 0) {
        return safeEscapeInboundHtml(raw);
    }

    const regex = new RegExp(`(${escapedRegexTokens.join('|')})`, 'gi');
    const parts = raw.split(regex);

    return parts.map(part => {
        if (!part) return '';
        const isMatch = tokens.some(t => part.toLowerCase() === t.toLowerCase());
        const safePart = safeEscapeInboundHtml(part);
        return isMatch
            ? `<mark style="background:rgba(37,99,235,0.16); color:inherit; padding:0 2px; border-radius:3px; font-weight:700;">${safePart}</mark>`
            : safePart;
    }).join('');
}

// =========================================================================
// 0. SESSION STATS PERSISTENCE (LOCALSTORAGE)
// =========================================================================

function saveInboundSessionStatsToCache() {
    try {
        const snArray = Array.from(inboundSessionStats.sessionSnSet);
        const trimmedSnArray = snArray.length > WMS_MAX_SESSION_SN_HISTORY
            ? snArray.slice(snArray.length - WMS_MAX_SESSION_SN_HISTORY)
            : snArray;

        const payload = {
            startedAt: inboundSessionStats.startedAt || new Date().toISOString(),
            scannedCount: Number(inboundSessionStats.scannedCount) || 0,
            duplicateWarningCount: Number(inboundSessionStats.duplicateWarningCount) || 0,
            lastScannedSn: String(inboundSessionStats.lastScannedSn || ''),
            lastScannedSku: String(inboundSessionStats.lastScannedSku || ''),
            sessionSnList: trimmedSnArray,
            updatedAt: new Date().toISOString()
        };

        localStorage.setItem(WMS_INBOUND_SESSION_STATS_KEY, JSON.stringify(payload));
    } catch (e) {}
}

function loadInboundSessionStatsFromCache() {
    try {
        const raw = localStorage.getItem(WMS_INBOUND_SESSION_STATS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;

        if (typeof parsed.startedAt === 'string' && parsed.startedAt.trim()) {
            inboundSessionStats.startedAt = parsed.startedAt;
        }
        inboundSessionStats.scannedCount = Math.max(0, Number(parsed.scannedCount) || 0);
        inboundSessionStats.duplicateWarningCount = Math.max(0, Number(parsed.duplicateWarningCount) || 0);
        inboundSessionStats.lastScannedSn = String(parsed.lastScannedSn || '');
        inboundSessionStats.lastScannedSku = String(parsed.lastScannedSku || '');

        const restoredList = Array.isArray(parsed.sessionSnList)
            ? parsed.sessionSnList.map(s => String(s || '').trim().toUpperCase()).filter(Boolean)
            : [];
        inboundSessionStats.sessionSnSet = new Set(restoredList);

        if (inboundSessionStats.scannedCount < inboundSessionStats.sessionSnSet.size) {
            inboundSessionStats.scannedCount = inboundSessionStats.sessionSnSet.size;
        }
    } catch (e) {}
}

// =========================================================================
// 1. MASTER PRODUCTS / SKU LOADER (SUPABASE products + warehouse_items + CACHE)
// =========================================================================

function loadRecentUsedSkusFromCache() {
    try {
        const raw = localStorage.getItem(WMS_RECENT_USED_SKUS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            recentUsedSkuCodes = parsed
                .map(s => String(s || '').trim().toUpperCase())
                .filter(Boolean)
                .slice(0, WMS_MAX_RECENT_SKUS);
        }
    } catch (e) {}
    return recentUsedSkuCodes;
}

function recordRecentUsedSku(sku) {
    const cleanSku = String(sku || '').trim();
    if (!cleanSku) return;
    const upper = cleanSku.toUpperCase();
    recentUsedSkuCodes = [
        upper,
        ...recentUsedSkuCodes.filter(code => code !== upper)
    ].slice(0, WMS_MAX_RECENT_SKUS);

    try {
        localStorage.setItem(WMS_RECENT_USED_SKUS_KEY, JSON.stringify(recentUsedSkuCodes));
    } catch (e) {}
}

function loadMasterSkuCatalogFromCache() {
    try {
        const raw = localStorage.getItem(WMS_MASTER_SKU_CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            masterSkuCatalogList = parsed;
        }
    } catch (e) {}
    return masterSkuCatalogList;
}

function saveMasterSkuCatalogToCache() {
    try {
        localStorage.setItem(WMS_MASTER_SKU_CACHE_KEY, JSON.stringify(masterSkuCatalogList.slice(0, 2000)));
    } catch (e) {}
}

function normalizeProductRowToSkuItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const sku = String(
        raw.sku ||
        raw.product_code ||
        raw.code ||
        raw.item_code ||
        raw.category ||
        ''
    ).trim();

    if (!sku || sku === 'UNSPECIFIED' || sku === 'ทั่วไป') return null;

    const name = String(
        raw.name ||
        raw.model ||
        raw.model_name ||
        raw.product_name ||
        raw.description ||
        sku
    ).trim();

    const unit = String(raw.unit || raw.uom || '').trim();
    const brand = String(raw.brand || raw.manufacturer || '').trim();
    const rawMeter = raw.default_meter ?? raw.standard_meter ?? raw.meter ?? raw.length ?? '';
    const defaultMeter = rawMeter !== '' && rawMeter !== null && !Number.isNaN(Number(rawMeter)) && Number(rawMeter) > 0
        ? String(Number(rawMeter))
        : '';

    const item = { sku, name: name || sku };
    if (unit) item.unit = unit;
    if (brand) item.brand = brand;
    if (defaultMeter) item.defaultMeter = defaultMeter;

    return item;
}

function mergeIntoMasterSkuCatalog(rawList = []) {
    if (!Array.isArray(rawList) || rawList.length === 0) return;

    const mapBySku = new Map();
    masterSkuCatalogList.forEach(item => {
        if (item && item.sku) {
            mapBySku.set(item.sku.toUpperCase(), item);
        }
    });

    let changed = false;
    for (let i = 0; i < rawList.length; i++) {
        const norm = normalizeProductRowToSkuItem(rawList[i]);
        if (!norm) continue;
        const key = norm.sku.toUpperCase();
        const existing = mapBySku.get(key);
        if (!existing) {
            mapBySku.set(key, norm);
            changed = true;
        } else {
            if (norm.name !== norm.sku && existing.name === existing.sku) {
                existing.name = norm.name;
                changed = true;
            }
            if (norm.unit && !existing.unit) {
                existing.unit = norm.unit;
                changed = true;
            }
            if (norm.brand && !existing.brand) {
                existing.brand = norm.brand;
                changed = true;
            }
            if (norm.defaultMeter && !existing.defaultMeter) {
                existing.defaultMeter = norm.defaultMeter;
                changed = true;
            }
        }
    }

    if (changed) {
        masterSkuCatalogList = Array.from(mapBySku.values()).sort((a, b) => a.sku.localeCompare(b.sku));
        if (typeof window !== 'undefined') window.masterSkuCatalogList = masterSkuCatalogList;
        saveMasterSkuCatalogToCache();
    }

    updateMasterProductsStatBanner();
}

function harvestInMemoryProductSources() {
    if (typeof window === 'undefined') return;
    const candidates = [
        window.masterProducts,
        window.productsList,
        window.allProducts,
        window.masterSkuList,
        window.globalSkuData,
        window.globalInventoryData,
        typeof recentInboundList !== 'undefined' ? recentInboundList : null
    ];
    candidates.forEach(arr => {
        if (Array.isArray(arr) && arr.length > 0) {
            mergeIntoMasterSkuCatalog(arr);
        }
    });
}

async function fetchMasterSkuCatalogFromSupabase() {
    harvestInMemoryProductSources();
    updateMasterProductsStatBanner();

    const sb = typeof getActiveSupabaseClient === 'function' ? getActiveSupabaseClient() : null;
    if (!sb || !navigator.onLine) return;

    // 1. ดึงจากตาราง products (ใช้ select('*') เพื่อรองรับทุกชื่อคอลัมน์ใน Supabase)
    try {
        const { data, error } = await sb
            .from('products')
            .select('*')
            .limit(2000);

        if (!error && Array.isArray(data) && data.length > 0) {
            mergeIntoMasterSkuCatalog(data);
        }
    } catch (e) {}

    // 2. เสริมรายการ SKU ล่าสุดจากตาราง warehouse_items
    try {
        const { data: invData, error: invErr } = await sb
            .from('warehouse_items')
            .select('category, name, sku')
            .order('created_at', { ascending: false })
            .limit(500);

        if (!invErr && Array.isArray(invData) && invData.length > 0) {
            mergeIntoMasterSkuCatalog(invData);
        }
    } catch (e) {}

    updateMasterProductsStatBanner();
}

async function refreshMasterSkuCatalogNow(showFeedback = true) {
    if (showFeedback && typeof showToast === 'function') {
        showToast('🔄 กำลังอัปเดตรายการสินค้า Master (SKU) ล่าสุด...', false, 1500);
    }
    await fetchMasterSkuCatalogFromSupabase();
    if (showFeedback && typeof showToast === 'function') {
        showToast(`✅ อัปเดตสินค้า Master สำเร็จ (${masterSkuCatalogList.length.toLocaleString()} รุ่น)`, false, 2000);
    }
    return masterSkuCatalogList.length;
}

function updateMasterProductsStatBanner() {
    const statEl = document.getElementById('inboundMasterProductsStatText');
    if (!statEl) return;

    const count = masterSkuCatalogList.length;
    if (count > 0) {
        statEl.innerHTML = `
            <span style="color:var(--success-text);"><i class="fa-solid fa-circle-check"></i> พร้อมค้นหาสินค้า Master ทั้งหมด <strong class="mono">${count.toLocaleString()}</strong> รุ่น (SKU)</span>
            <span style="font-size:0.78rem; font-weight:500; color:var(--text-sub); margin-left:6px;">• พิมพ์รหัส SKU, ชื่อรุ่น หรือยิงบาร์โค้ด SKU ด้านล่างได้ทันที (Alt+K)</span>
        `;
    } else {
        statEl.innerHTML = `
            <span style="color:var(--primary-text);"><i class="fa-solid fa-keyboard"></i> พิมพ์ค้นหารหัส SKU หรือกรอกรหัสสินค้าและชื่อรุ่นใหม่ได้ทันที (Alt+K)</span>
        `;
    }
}

// =========================================================================
// 2. SKU SEARCH INPUT (#skuSearchInput) & SUGGESTIONS BOX (#skuSuggestionsBox)
// =========================================================================

function ensureSkuSearchClearButton() {
    const searchEl = document.getElementById('skuSearchInput');
    if (!searchEl || !searchEl.parentElement) return;

    const parent = searchEl.parentElement;
    if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }

    let clearBtn = document.getElementById('wmsSkuSearchClearBtn');
    if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.id = 'wmsSkuSearchClearBtn';
        clearBtn.title = 'ล้างคำค้นหาสินค้า';
        clearBtn.setAttribute('aria-label', 'ล้างคำค้นหาสินค้า');
        clearBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        clearBtn.style.cssText = [
            'position:absolute',
            'right:10px',
            'top:50%',
            'transform:translateY(-50%)',
            'width:24px',
            'height:24px',
            'border:none',
            'border-radius:50%',
            'background:var(--bg-muted, rgba(148,163,184,0.22))',
            'color:var(--text-sub, #64748b)',
            'cursor:pointer',
            'display:none',
            'align-items:center',
            'justify-content:center',
            'font-size:0.78rem',
            'z-index:5'
        ].join(';');

        clearBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            clearSkuSearchSelection();
        });

        parent.appendChild(clearBtn);
    }

    clearBtn.style.display = searchEl.value && searchEl.value.trim().length > 0 ? 'inline-flex' : 'none';
}

function clearSkuSearchSelection() {
    const searchEl = document.getElementById('skuSearchInput');
    const catSkuEl = document.getElementById('inboundCategory');
    const nameEl = document.getElementById('inboundName');
    const box = document.getElementById('skuSuggestionsBox');

    if (searchEl) searchEl.value = '';
    if (catSkuEl) catSkuEl.value = '';
    if (nameEl) nameEl.value = '';
    if (box) box.style.display = 'none';

    ensureSkuSearchClearButton();
    if (typeof updateBatchSnBarDocContextHint === 'function') updateBatchSnBarDocContextHint();
    if (searchEl) {
        searchEl.focus();
        onSkuSearchInput('');
    }
}

function findExactSkuCatalogItem(rawSku) {
    const target = String(rawSku || '').trim().toUpperCase();
    if (!target) return null;
    return masterSkuCatalogList.find(item => item && item.sku && item.sku.toUpperCase() === target) || null;
}

function scoreAndFilterSkuCatalog(rawQuery) {
    const q = String(rawQuery || '').trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const recentIndexMap = new Map();
    recentUsedSkuCodes.forEach((code, idx) => recentIndexMap.set(code, idx));

    const scored = [];
    for (let i = 0; i < masterSkuCatalogList.length; i++) {
        const item = masterSkuCatalogList[i];
        if (!item || !item.sku) continue;

        const skuLower = item.sku.toLowerCase();
        const nameLower = (item.name || '').toLowerCase();
        const brandLower = (item.brand || '').toLowerCase();
        const combined = `${skuLower} ${nameLower} ${brandLower}`;

        if (tokens.length > 0) {
            const matchesAllTokens = tokens.every(tok => combined.includes(tok));
            if (!matchesAllTokens) continue;
        }

        let score = 0;
        if (q) {
            if (skuLower === q) score += 1000;
            else if (skuLower.startsWith(q)) score += 600;
            else if (skuLower.includes(q)) score += 350;
            else if (nameLower.startsWith(q)) score += 250;
            else if (nameLower.includes(q)) score += 150;
            else score += 80;
        }

        const recentRank = recentIndexMap.get(item.sku.toUpperCase());
        if (recentRank !== undefined) {
            score += (100 - recentRank);
        }

        scored.push({
            item,
            score,
            isRecent: recentRank !== undefined
        });
    }

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.sku.localeCompare(b.item.sku);
    });

    return {
        totalMatched: scored.length,
        tokens,
        results: scored.slice(0, 35)
    };
}

// ฟังก์ชันตรงตาม attribute oninput="onSkuSearchInput(this.value)" ใน index.html
function onSkuSearchInput(rawQuery) {
    harvestInMemoryProductSources();
    ensureSkuSearchClearButton();

    const box = document.getElementById('skuSuggestionsBox');
    if (!box) return;

    const rawTrimmed = String(rawQuery || '').trim();
    const q = rawTrimmed.toLowerCase();

    // ซิงก์ค่าที่พิมพ์ลงช่องรหัสสินค้า (#inboundCategory) อัตโนมัติกรณีกรอกรหัสใหม่
    const catSkuEl = document.getElementById('inboundCategory');
    if (catSkuEl && rawQuery !== undefined) {
        catSkuEl.value = rawTrimmed;
    }

    const { totalMatched, tokens, results } = scoreAndFilterSkuCatalog(rawTrimmed);
    currentFilteredSkuSuggestions = results.map(r => r.item);
    activeSkuSuggestionIndex = results.length > 0 ? 0 : -1;

    if (results.length === 0) {
        if (!q) {
            box.style.display = 'none';
            return;
        }
        box.innerHTML = `
            <div class="suggestion-item" onmousedown="applySelectedSkuItem('${encodeSkuParam(rawTrimmed)}', '${encodeSkuParam(rawTrimmed)}')">
                <span><i class="fa-solid fa-plus-circle" style="color:var(--primary);"></i> ใช้รหัสสินค้าใหม่: <strong class="mono">${safeEscapeInboundHtml(rawTrimmed)}</strong></span>
                <span style="font-size:0.74rem; color:var(--primary-text); font-weight:700;">คลิกหรือกด Enter</span>
            </div>
        `;
        box.style.display = 'block';
        return;
    }

    const rowsHtml = results.map(({ item, isRecent }, idx) => {
        const isActive = idx === activeSkuSuggestionIndex;
        const metaBadges = [];
        if (isRecent) {
            metaBadges.push(`<span style="font-size:0.67rem; font-weight:700; padding:1px 6px; border-radius:999px; background:rgba(16,185,129,0.14); color:var(--success-text, #059669);">ใช้ล่าสุด</span>`);
        }
        if (item.defaultMeter) {
            metaBadges.push(`<span class="mono" style="font-size:0.68rem; padding:1px 6px; border-radius:4px; background:rgba(59,130,246,0.12); color:var(--primary-text);">${safeEscapeInboundHtml(item.defaultMeter)}m</span>`);
        }
        if (item.unit) {
            metaBadges.push(`<span style="font-size:0.68rem; color:var(--text-muted);">${safeEscapeInboundHtml(item.unit)}</span>`);
        }

        return `
            <div class="suggestion-item"
                 data-sku-row="${idx}"
                 style="${isActive ? 'background:var(--primary-light); color:var(--primary-text);' : ''}"
                 onmousedown="applySelectedSkuItem('${encodeSkuParam(item.sku)}', '${encodeSkuParam(item.name)}')">
                <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span class="mono font-bold" style="font-size:0.86rem; color:var(--primary-text);">${highlightMatchedTokens(item.sku, tokens)}</span>
                        ${metaBadges.join('')}
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${highlightMatchedTokens(item.name, tokens)}</div>
                </div>
                <span style="font-size:0.72rem; color:var(--text-muted); margin-left:8px; flex-shrink:0;">เลือก <i class="fa-solid fa-level-down-alt" style="transform:rotate(90deg);"></i></span>
            </div>
        `;
    }).join('');

    const footerHtml = `
        <div style="padding:6px 12px; font-size:0.71rem; color:var(--text-muted); background:var(--bg-subtle, rgba(148,163,184,0.08)); border-top:1px solid var(--border-color, rgba(148,163,184,0.2)); display:flex; justify-content:space-between; align-items:center;">
            <span>พบ <strong>${totalMatched.toLocaleString()}</strong> รุ่น${totalMatched > results.length ? ` (แสดง ${results.length} รายการแรก)` : ''}</span>
            <span>↑↓ เลือก • Enter ยืนยัน • Esc ปิด</span>
        </div>
    `;

    box.innerHTML = rowsHtml + footerHtml;
    box.style.display = 'block';
}

function applySelectedSkuItem(encodedSku, encodedName) {
    const sku = decodeURIComponent(encodedSku || '').trim();
    const catalogItem = findExactSkuCatalogItem(sku);
    const name = decodeURIComponent(encodedName || '').trim() || (catalogItem ? catalogItem.name : sku) || sku;

    const searchEl = document.getElementById('skuSearchInput');
    const catSkuEl = document.getElementById('inboundCategory');
    const nameEl = document.getElementById('inboundName');
    const meterEl = document.getElementById('inboundMeter');
    const box = document.getElementById('skuSuggestionsBox');

    if (searchEl) searchEl.value = sku;
    if (catSkuEl) catSkuEl.value = sku;
    if (nameEl) nameEl.value = name;
    if (box) box.style.display = 'none';

    // เติมความยาว/เมตรมาตรฐานอัตโนมัติหากสินค้าระบุไว้และช่องความยาวยังว่างอยู่
    if (meterEl && catalogItem && catalogItem.defaultMeter && !String(meterEl.value || '').trim()) {
        meterEl.value = catalogItem.defaultMeter;
    }

    recordRecentUsedSku(sku);
    ensureSkuSearchClearButton();

    if (typeof updateBatchSnBarDocContextHint === 'function') updateBatchSnBarDocContextHint();
    showToast(`✅ เลือกสินค้า ${sku} (${name}) พร้อมยิง S/N ทันที`, false, 1800);

    if (typeof ensureSnInputFocus === 'function') {
        setTimeout(() => ensureSnInputFocus(true), 40);
    }
}

function bindSkuSearchInputEvents() {
    const searchEl = document.getElementById('skuSearchInput');
    if (!searchEl || searchEl.dataset.wmsSkuBound === 'true') return;
    searchEl.dataset.wmsSkuBound = 'true';

    ensureSkuSearchClearButton();

    searchEl.addEventListener('focus', () => {
        onSkuSearchInput(searchEl.value);
    });

    searchEl.addEventListener('keydown', (e) => {
        const box = document.getElementById('skuSuggestionsBox');
        const isOpen = box && box.style.display === 'block';

        if (e.key === 'ArrowDown' && isOpen && currentFilteredSkuSuggestions.length > 0) {
            e.preventDefault();
            activeSkuSuggestionIndex = (activeSkuSuggestionIndex + 1) % currentFilteredSkuSuggestions.length;
            highlightActiveSkuSuggestion();
        } else if (e.key === 'ArrowUp' && isOpen && currentFilteredSkuSuggestions.length > 0) {
            e.preventDefault();
            activeSkuSuggestionIndex = (activeSkuSuggestionIndex - 1 + currentFilteredSkuSuggestions.length) % currentFilteredSkuSuggestions.length;
            highlightActiveSkuSuggestion();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const val = searchEl.value.trim();
            // กรณียิงบาร์โค้ด SKU ตรงเป๊ะ ให้จับคู่ชื่อรุ่นจาก Master Catalog อัตโนมัติทันที
            const exactCatalogMatch = findExactSkuCatalogItem(val);
            if (exactCatalogMatch) {
                applySelectedSkuItem(encodeSkuParam(exactCatalogMatch.sku), encodeSkuParam(exactCatalogMatch.name));
            } else if (isOpen && activeSkuSuggestionIndex >= 0 && currentFilteredSkuSuggestions[activeSkuSuggestionIndex]) {
                const chosen = currentFilteredSkuSuggestions[activeSkuSuggestionIndex];
                applySelectedSkuItem(encodeSkuParam(chosen.sku), encodeSkuParam(chosen.name));
            } else if (val) {
                applySelectedSkuItem(encodeSkuParam(val), encodeSkuParam(val));
            }
        } else if (e.key === 'Escape') {
            if (box) box.style.display = 'none';
        }
    });

    searchEl.addEventListener('blur', () => {
        setTimeout(() => {
            const box = document.getElementById('skuSuggestionsBox');
            if (box) box.style.display = 'none';
        }, 180);
    });
}

function highlightActiveSkuSuggestion() {
    const box = document.getElementById('skuSuggestionsBox');
    if (!box) return;
    const rows = box.querySelectorAll('[data-sku-row]');
    rows.forEach((row, idx) => {
        if (idx === activeSkuSuggestionIndex) {
            row.style.background = 'var(--primary-light)';
            row.style.color = 'var(--primary-text)';
            row.scrollIntoView({ block: 'nearest' });
        } else {
            row.style.background = '';
            row.style.color = '';
        }
    });
}

// =========================================================================
// 3. REAL-TIME SESSION STATS HUD & FORM SUBMIT (handleInboundSubmit)
// =========================================================================

function formatSessionStartTime(isoStr) {
    try {
        const d = new Date(isoStr || Date.now());
        return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '--:--';
    }
}

function copyLastScannedSnToClipboard() {
    const summary = getInboundSessionSummary();
    if (!summary.lastScannedSn) {
        if (typeof showToast === 'function') {
            showToast('ℹ️ ยังไม่มีรายการ S/N ล่าสุดให้คัดลอก', false, 1600);
        }
        return;
    }

    if (typeof copyToClipboard === 'function') {
        copyToClipboard(summary.lastScannedSn);
        if (typeof showToast === 'function') {
            showToast(`📋 คัดลอก S/N "${summary.lastScannedSn}" แล้ว`, false, 1600);
        }
    } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(summary.lastScannedSn).then(() => {
            if (typeof showToast === 'function') {
                showToast(`📋 คัดลอก S/N "${summary.lastScannedSn}" แล้ว`, false, 1600);
            }
        }).catch(() => {});
    }
}

function renderInboundSessionStatsHud() {
    if (typeof document === 'undefined') return;

    const inboundForm = document.getElementById('inboundForm');
    const snInput = document.getElementById('inboundSn');
    const anchorTarget = inboundForm || (snInput ? snInput.closest('form, .card, .panel, div') : null);
    if (!anchorTarget || !anchorTarget.parentElement) return;

    let hudEl = document.getElementById('wmsInboundSessionStatsHud');
    if (!hudEl) {
        hudEl = document.createElement('div');
        hudEl.id = 'wmsInboundSessionStatsHud';
        hudEl.style.cssText = [
            'display:flex',
            'flex-wrap:wrap',
            'align-items:center',
            'justify-content:space-between',
            'gap:10px',
            'padding:10px 14px',
            'margin-bottom:12px',
            'border-radius:10px',
            'background:var(--bg-subtle, rgba(59,130,246,0.06))',
            'border:1px solid var(--border-color, rgba(148,163,184,0.28))'
        ].join(';');
        anchorTarget.parentElement.insertBefore(hudEl, anchorTarget);
    }

    const summary = getInboundSessionSummary();
    const startTimeLabel = formatSessionStartTime(summary.startedAt);
    const hasLastSn = Boolean(summary.lastScannedSn);
    const lastSnDisplay = hasLastSn ? safeEscapeInboundHtml(summary.lastScannedSn) : 'ยังไม่มีรายการสแกน';
    const lastSkuBadge = summary.lastScannedSku
        ? `<span class="mono" style="font-size:0.72rem; padding:1px 6px; border-radius:4px; background:rgba(59,130,246,0.12); color:var(--primary-text);">${safeEscapeInboundHtml(summary.lastScannedSku)}</span>`
        : '';

    const dupBadge = summary.duplicateWarningCount > 0
        ? `<span style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:999px; background:rgba(239,68,68,0.14); color:#dc2626;" title="จำนวนครั้งที่ยิง S/N ซ้ำในรอบนี้"><i class="fa-solid fa-triangle-exclamation"></i> ซ้ำในรอบ ${summary.duplicateWarningCount}</span>`
        : '';

    hudEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; background:rgba(16,185,129,0.14); color:var(--success-text, #059669); font-size:0.9rem;">
                    <i class="fa-solid fa-barcode"></i>
                </span>
                <div>
                    <div style="font-size:0.71rem; color:var(--text-muted); font-weight:600; line-height:1.1; display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                        <span>สแกนแล้วในรอบนี้ <span style="opacity:0.8;">(เริ่ม ${startTimeLabel})</span></span>
                        <span title="บันทึกสถิติลงเครื่องอัตโนมัติ ป้องกันข้อมูลหายเมื่อรีเฟรชหน้าเว็บ" style="font-size:0.65rem; padding:1px 5px; border-radius:4px; background:rgba(16,185,129,0.12); color:var(--success-text, #059669);">
                            <i class="fa-solid fa-floppy-disk"></i> บันทึกอัตโนมัติ
                        </span>
                    </div>
                    <div style="display:flex; align-items:baseline; gap:6px;">
                        <strong class="mono" style="font-size:1.18rem; color:var(--success-text, #059669);">${summary.scannedCount.toLocaleString()}</strong>
                        <span style="font-size:0.76rem; color:var(--text-sub);">ชิ้น</span>
                        ${dupBadge}
                    </div>
                </div>
            </div>

            <div style="width:1px; height:28px; background:var(--border-color, rgba(148,163,184,0.28));"></div>

            <div style="min-width:0; flex:1;">
                <div style="font-size:0.71rem; color:var(--text-muted); font-weight:600; line-height:1.1; display:flex; align-items:center; gap:6px;">
                    <span>S/N ล่าสุด</span>
                    ${lastSkuBadge}
                </div>
                <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                    <span class="mono" style="font-size:0.88rem; font-weight:700; color:${hasLastSn ? 'var(--text-main)' : 'var(--text-muted)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px;">
                        ${lastSnDisplay}
                    </span>
                    ${hasLastSn ? `
                        <button type="button"
                                onclick="copyLastScannedSnToClipboard()"
                                title="คัดลอก S/N ล่าสุด"
                                style="border:none; background:transparent; color:var(--primary-text); cursor:pointer; padding:2px 5px; font-size:0.76rem;">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>

        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <button type="button"
                    onclick="resetInboundSessionStats(true)"
                    title="รีเซ็ตตัวนับสถิติรอบการสแกนนี้"
                    style="padding:5px 10px; font-size:0.74rem; font-weight:600; border-radius:6px; border:1px solid var(--border-color, rgba(148,163,184,0.35)); background:var(--bg-card, #ffffff); color:var(--text-sub); cursor:pointer; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-rotate-left"></i> รีเซ็ตตัวนับ
            </button>
        </div>
    `;
}

function inspectAndTrackSnScan(rawSnInput) {
    const tokens = String(rawSnInput || '')
        .split(/[\r\n\t,;]+/)
        .map(s => s.trim())
        .filter(Boolean);

    if (tokens.length === 0) return;

    const currentSku = String(
        (document.getElementById('inboundCategory')?.value) ||
        (document.getElementById('skuSearchInput')?.value) ||
        ''
    ).trim();

    let duplicateDetected = null;
    for (let i = 0; i < tokens.length; i++) {
        const snUpper = tokens[i].toUpperCase();
        if (inboundSessionStats.sessionSnSet.has(snUpper)) {
            duplicateDetected = tokens[i];
        } else {
            inboundSessionStats.sessionSnSet.add(snUpper);
            inboundSessionStats.scannedCount += 1;
        }
        inboundSessionStats.lastScannedSn = tokens[i];
    }

    if (currentSku) {
        inboundSessionStats.lastScannedSku = currentSku;
        recordRecentUsedSku(currentSku);
    }

    if (duplicateDetected) {
        inboundSessionStats.duplicateWarningCount += 1;
    }

    saveInboundSessionStatsToCache();
    renderInboundSessionStatsHud();

    if (duplicateDetected && typeof showToast === 'function') {
        showToast(`⚠️ แจ้งเตือน: S/N "${duplicateDetected}" เพิ่งถูกสแกนไปแล้วในรอบนี้`, true, 2400);
    }
}

function getInboundSessionSummary() {
    return {
        startedAt: inboundSessionStats.startedAt,
        scannedCount: inboundSessionStats.scannedCount,
        uniqueSnCount: inboundSessionStats.sessionSnSet.size,
        duplicateWarningCount: inboundSessionStats.duplicateWarningCount,
        lastScannedSn: inboundSessionStats.lastScannedSn,
        lastScannedSku: inboundSessionStats.lastScannedSku
    };
}

function resetInboundSessionStats(showFeedback = false) {
    inboundSessionStats.startedAt = new Date().toISOString();
    inboundSessionStats.scannedCount = 0;
    inboundSessionStats.duplicateWarningCount = 0;
    inboundSessionStats.lastScannedSn = '';
    inboundSessionStats.lastScannedSku = '';
    inboundSessionStats.sessionSnSet.clear();

    saveInboundSessionStatsToCache();
    renderInboundSessionStatsHud();

    if (showFeedback && typeof showToast === 'function') {
        showToast('🔄 รีเซ็ตตัวนับสถิติการสแกนรับเข้าเรียบร้อยแล้ว', false, 1800);
    }
}

// ฟังก์ชันตรงตาม attribute onsubmit="handleInboundSubmit(event)" ใน index.html
function handleInboundSubmit(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        event.stopPropagation();
    }

    const snInput = document.getElementById('inboundSn');
    const rawSn = snInput ? snInput.value : '';
    if (!rawSn || !rawSn.trim()) {
        showToast('⚠️ กรุณายิงสแกนหรือกรอกหมายเลขซีเรียล (S/N) ก่อนบันทึก', true, 2200);
        if (typeof ensureSnInputFocus === 'function') ensureSnInputFocus(true);
        return false;
    }

    inspectAndTrackSnScan(rawSn);

    if (typeof enqueueScanInput === 'function') {
        enqueueScanInput(rawSn);
    }
    return false;
}

function bindInboundSnScannerEvents() {
    const snInput = document.getElementById('inboundSn');
    if (!snInput || snInput.dataset.wmsSnBound === 'true') return;
    snInput.dataset.wmsSnBound = 'true';

    snInput.removeAttribute('maxlength');
    snInput.setAttribute('autocomplete', 'off');

    snInput.addEventListener('pointerdown', () => {
        if (typeof getSharedWmsAudioContext === 'function') getSharedWmsAudioContext();
    });

    snInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'NumpadEnter') {
            e.preventDefault();
            e.stopPropagation();
            const val = snInput.value;
            if (val && val.trim() !== '' && typeof enqueueScanInput === 'function') {
                inspectAndTrackSnScan(val);
                enqueueScanInput(val);
            }
        }
    });

    snInput.addEventListener('paste', () => {
        setTimeout(() => {
            const val = snInput.value;
            if (val && /[\r\n\t,;]/.test(val) && typeof enqueueScanInput === 'function') {
                inspectAndTrackSnScan(val);
                enqueueScanInput(val);
            }
        }, 10);
    });

    const meterInput = document.getElementById('inboundMeter');
    if (meterInput && meterInput.dataset.wmsMeterBound !== 'true') {
        meterInput.dataset.wmsMeterBound = 'true';
        meterInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                e.preventDefault();
                if (typeof ensureSnInputFocus === 'function') ensureSnInputFocus(true);
            }
        });
    }
}

// =========================================================================
// 4. GLOBAL EXPORTS & POST-APP-MAIN PROTECTION
// =========================================================================

function exposeInboundGlobalFunctions() {
    if (typeof window === 'undefined') return;
    window.handleInboundSubmit = handleInboundSubmit;
    window.onSkuSearchInput = onSkuSearchInput;
    window.applySelectedSkuItem = applySelectedSkuItem;
    window.clearSkuSearchSelection = clearSkuSearchSelection;
    window.refreshMasterSkuCatalogNow = refreshMasterSkuCatalogNow;
    window.getInboundSessionSummary = getInboundSessionSummary;
    window.resetInboundSessionStats = resetInboundSessionStats;
    window.renderInboundSessionStatsHud = renderInboundSessionStatsHud;
    window.copyLastScannedSnToClipboard = copyLastScannedSnToClipboard;
    window.saveInboundSessionStatsToCache = saveInboundSessionStatsToCache;
    window.loadInboundSessionStatsFromCache = loadInboundSessionStatsFromCache;

    if (typeof generateAutoSN === 'function') window.generateAutoSN = generateAutoSN;
    if (typeof onInboundAisleOrBayChange === 'function') window.onInboundAisleOrBayChange = onInboundAisleOrBayChange;
    if (typeof selectInboundAisleExplicitly === 'function') window.selectInboundAisleExplicitly = selectInboundAisleExplicitly;
    if (typeof autoSelectAvailableSlot === 'function') window.autoSelectAvailableSlot = autoSelectAvailableSlot;
    if (typeof updateInboundLocationPreview === 'function') window.updateInboundLocationPreview = updateInboundLocationPreview;
    if (typeof getResolvedInboundLocation === 'function') window.getResolvedInboundLocation = getResolvedInboundLocation;
    if (typeof openCameraScanner === 'function') window.openCameraScanner = openCameraScanner;
    if (typeof closeCameraScanner === 'function') window.closeCameraScanner = closeCameraScanner;
    if (typeof enqueueScanInput === 'function') window.enqueueScanInput = enqueueScanInput;
    if (typeof flushPersistentDbSyncQueue === 'function') window.flushPersistentDbSyncQueue = flushPersistentDbSyncQueue;
    if (typeof retryFailedInboundItemsNow === 'function') window.retryFailedInboundItemsNow = retryFailedInboundItemsNow;
    if (typeof runBatchGenerateInboundSn === 'function') window.runBatchGenerateInboundSn = runBatchGenerateInboundSn;
    if (typeof fetchLatestInboundFromSupabase === 'function') window.fetchLatestInboundFromSupabase = fetchLatestInboundFromSupabase;
}

function onInboundMenuActivated() {
    exposeInboundGlobalFunctions();

    // ลบเมนูเลือกด่วนออกจาก DOM หากมีหลงเหลืออยู่
    const staleQuickChipsBar = document.getElementById('wmsSkuQuickChipsBar');
    if (staleQuickChipsBar) {
        staleQuickChipsBar.remove();
    }

    if (typeof upgradeInboundEnterpriseUXUI === 'function') upgradeInboundEnterpriseUXUI();
    if (typeof initializeInboundLocationDropdowns === 'function') initializeInboundLocationDropdowns();
    if (typeof ensureInstantScanBoxIndicator === 'function') ensureInstantScanBoxIndicator();
    if (typeof ensureBatchSnGeneratorBar === 'function') ensureBatchSnGeneratorBar();

    harvestInMemoryProductSources();
    updateMasterProductsStatBanner();
    renderInboundSessionStatsHud();

    if (typeof updateInboundNetworkSyncHUD === 'function') updateInboundNetworkSyncHUD();
    if (typeof renderLiveInboundFeed === 'function') renderLiveInboundFeed();

    bindSkuSearchInputEvents();
    bindInboundSnScannerEvents();
}

function initInboundMasterSystem() {
    exposeInboundGlobalFunctions();

    if (!isInboundMasterInitialized) {
        isInboundMasterInitialized = true;
        loadInboundSessionStatsFromCache();
        loadRecentUsedSkusFromCache();
        loadMasterSkuCatalogFromCache();
        if (typeof loadRecentInboundFeedFromCache === 'function') {
            loadRecentInboundFeedFromCache();
        }
    }

    onInboundMenuActivated();

    if (typeof initInboundSyncEngine === 'function') {
        initInboundSyncEngine();
    }
    if (typeof reconcileOrphanedQueuedFeedItems === 'function') {
        reconcileOrphanedQueuedFeedItems();
    }

    setTimeout(() => {
        exposeInboundGlobalFunctions();
        if (typeof bindInboundLocationSelectListeners === 'function') bindInboundLocationSelectListeners();
        if (typeof getResolvedInboundLocation === 'function') getResolvedInboundLocation();
        fetchMasterSkuCatalogFromSupabase();
        if (typeof fetchLatestInboundFromSupabase === 'function') {
            fetchLatestInboundFromSupabase(true);
        }
        if (typeof flushPersistentDbSyncQueue === 'function') {
            flushPersistentDbSyncQueue(false);
        }
    }, 250);

    // ตรวจสอบซ้ำอีกครั้งหลัง app-main.js โหลดเสร็จสมบูรณ์ เพื่อป้องกันการถูกเขียนทับฟังก์ชันหรือรีเซ็ตแถวที่เลือก
    setTimeout(() => {
        exposeInboundGlobalFunctions();
        if (typeof bindInboundLocationSelectListeners === 'function') bindInboundLocationSelectListeners();
        if (typeof getResolvedInboundLocation === 'function') getResolvedInboundLocation();
        harvestInMemoryProductSources();
        renderInboundSessionStatsHud();
        if (typeof renderLiveInboundFeed === 'function') renderLiveInboundFeed();
        if (typeof flushPersistentDbSyncQueue === 'function') {
            flushPersistentDbSyncQueue(false);
        }
    }, 900);

    setTimeout(() => {
        exposeInboundGlobalFunctions();
        if (typeof getResolvedInboundLocation === 'function') getResolvedInboundLocation();
        if (typeof flushPersistentDbSyncQueue === 'function') {
            flushPersistentDbSyncQueue(false);
        }
    }, 1800);

    // ซิงก์สถิติการสแกนข้ามแท็บอัตโนมัติผ่าน localStorage storage event
    if (typeof window !== 'undefined' && !window.__wmsInboundSessionStorageBound) {
        window.__wmsInboundSessionStorageBound = true;
        window.addEventListener('storage', (e) => {
            if (e && e.key === WMS_INBOUND_SESSION_STATS_KEY) {
                loadInboundSessionStatsFromCache();
                renderInboundSessionStatsHud();
            }
        });
    }

    // เตือนป้องกันการปิดแท็บระหว่างที่ยังมีรายการรอซิงก์เข้าฐานข้อมูล
    if (typeof window !== 'undefined' && !window.__wmsInboundUnloadGuardBound) {
        window.__wmsInboundUnloadGuardBound = true;
        window.addEventListener('beforeunload', (e) => {
            if (Array.isArray(persistentDbSyncQueue) && persistentDbSyncQueue.length > 0) {
                if (typeof savePersistentDbQueueImmediate === 'function') {
                    savePersistentDbQueueImmediate();
                }
                e.preventDefault();
                e.returnValue = 'ยังมีรายการรับสินค้ากำลังซิงก์เข้าฐานข้อมูล ยืนยันการออกจากหน้านี้หรือไม่?';
                return e.returnValue;
            }
        });
    }

    // คีย์ลัด:
    // Alt+1 (ใบกำกับภาษี), Alt+2 (PO), Alt+3 (S/N),
    // Alt+K (ค้นหา/เปลี่ยน SKU ด่วน), Alt+R (อัปเดต Master SKU ทันที)
    if (!document.body.dataset.wmsInboundShortcutBound) {
        document.body.dataset.wmsInboundShortcutBound = 'true';
        document.addEventListener('keydown', (e) => {
            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                const k = String(e.key || '').toLowerCase();
                if (k === '1' && typeof focusAndScanDocField === 'function') {
                    e.preventDefault();
                    focusAndScanDocField('tax_invoice');
                } else if (k === '2' && typeof focusAndScanDocField === 'function') {
                    e.preventDefault();
                    focusAndScanDocField('po_number');
                } else if (k === '3') {
                    e.preventDefault();
                    activeDocTargetScanField = null;
                    if (typeof ensureSnInputFocus === 'function') ensureSnInputFocus(true);
                } else if (k === 'k') {
                    e.preventDefault();
                    const searchEl = document.getElementById('skuSearchInput');
                    if (searchEl) {
                        searchEl.focus();
                        searchEl.select();
                        onSkuSearchInput(searchEl.value);
                    }
                } else if (k === 'r') {
                    e.preventDefault();
                    refreshMasterSkuCatalogNow(true);
                }
            }
        });
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInboundMasterSystem);
    } else {
        initInboundMasterSystem();
    }
}