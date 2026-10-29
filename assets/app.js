/* ══ GLOBAL STATE ══ */
let strats = { bcs: [], bps: [], cc: [], collar: [], conversion: [], mrp: [], long_box: [], strangle: [], condor: [], lst: [], std: [] };
let allOptionsRows = [];
let cdSec = 60, cdInt = null, _cmType = null;
window.lastUpdateTs = null;
let currentChartData = null;

/* ══ THEME MANAGEMENT ══ */
function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeToggleBtn(saved);
}
function toggleTheme() {
    const root = document.documentElement;
    const target = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    updateThemeToggleBtn(target);
    if(document.getElementById('cm-overlay').style.display === 'flex') updateCalc(); 
}
function updateThemeToggleBtn(theme) {
    const btn = document.getElementById('theme-toggle');
    if(btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
initTheme();

/* ══ UTILITIES ══ */
function toFaDigit(str) {
    if (str == null) return '';
    const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(str).replace(/[0-9]/g, w => faDigits[+w]);
}
function toEnDigit(str) {
    if (str == null) return '';
    const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const arDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    let res = String(str);
    for (let i = 0; i < 10; i++) res = res.replace(new RegExp(faDigits[i], 'g'), i).replace(new RegExp(arDigits[i], 'g'), i);
    return res;
}
function handleNumericInput(el) {
    const start = el.selectionStart;
    const rawEn = toEnDigit(el.value).replace(/[^0-9.-]/g, '');
    el.value = toFaDigit(rawEn);
    try { el.setSelectionRange(start, start); } catch (_) {}
}
const parseVal = id => { const el = document.getElementById(id); return el ? parseFloat(toEnDigit(el.value)) || 0 : 0; };
function showAlert(m) { const el = document.getElementById('alrt'); if(el){ el.textContent = '⚠ ' + m; el.style.display = 'block'; } }
function hideAlert() { const el = document.getElementById('alrt'); if(el) el.style.display = 'none'; }
function esc(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const fN = n => (n == null || isNaN(n)) ? '—' : toFaDigit(Math.round(n).toLocaleString('en-US'));
const f2 = n => (n == null || isNaN(n)) ? '—' : toFaDigit(Number(n).toFixed(2));
const fVol = v => {
    if (!v) return '<span style="color:var(--dim);font-size:11px">—</span>';
    if (v >= 1e9) return '<span class="tg tn">' + toFaDigit((v / 1e9).toFixed(1)) + 'B</span>';
    if (v >= 1e6) return '<span class="ty tn">' + toFaDigit((v / 1e6).toFixed(1)) + 'M</span>';
    return '<span class="tn">' + toFaDigit((v / 1e3).toFixed(0)) + 'K</span>';
};
function renderMiniBar(val, maxVal, isGoodPositive) {
    if (val == null || isNaN(val)) return '<span class="tn">—</span>';
    let pct = Math.min(100, (Math.abs(val) / maxVal) * 100);
    let isPositive = val >= 0;
    let colorClass = (isGoodPositive && isPositive) || (!isGoodPositive && !isPositive) ? 'tg' : 'tr';
    let barColor = (isGoodPositive && isPositive) || (!isGoodPositive && !isPositive) ? 'var(--secondary)' : 'var(--error)';
    return `<div class="mini-bar-container"><div class="mini-bar-text"><span class="${colorClass}">${val > 0 ? '+' : ''}${f2(val)}%</span></div><div class="mini-bar-track"><div class="mini-bar-fill" style="width: ${pct}%; background: ${barColor};"></div></div></div>`;
}
function toJalaliDateTime(dateStr) {
    if (!dateStr) return '—';
    try {
        let d = (typeof dateStr === 'string' && !dateStr.includes('T') && !dateStr.includes('Z')) ? new Date(dateStr.replace(' ', 'T') + '+03:30') : new Date(dateStr);
        if (isNaN(d.getTime())) return toFaDigit(dateStr);
        const formatter = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        return toFaDigit(formatter.format(d).replace(/,/g, ''));
    } catch (e) { return toFaDigit(dateStr); }
}
function isMarketHours() {
    const d = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Tehran"}));
    const day = d.getDay(); 
    if (day === 4 || day === 5) return false;
    const mins = d.getHours() * 60 + d.getMinutes();
    return mins >= (9 * 60) && mins <= (12 * 60 + 30);
}
function timeAgo(ts) {
    const sec = Math.round(Date.now() / 1000 - ts);
    if (sec < 10) return "همین الان";
    if (sec < 60) return toFaDigit(sec) + " ثانیه پیش";
    if (sec < 3600) return toFaDigit(Math.floor(sec / 60)) + " دقیقه پیش";
    return toFaDigit(Math.floor(sec / 3600)) + " ساعت پیش";
}
function hideLoader() { const loader = document.getElementById('loader-overlay'); if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 350); } }
function switchTab(tab) {
    document.querySelectorAll('.htab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.page-content').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
}
function toggleGFP(id) { const body = document.getElementById('gfp-' + id + '-body'), arr = document.getElementById('gfp-' + id + '-arrow'); if(body && arr) arr.textContent = body.classList.toggle('collapsed') ? '▼' : '▲'; }
function toggleLocalCalc(id) { const body = document.getElementById(id + '-body'), arr = document.getElementById(id + '-arr'); if(body && arr) arr.textContent = body.classList.toggle('collapsed') ? '▼' : '▲'; }
function setBtnLoading(btnId, isLoading) { const btn = document.getElementById(btnId); if (!btn) return; if (isLoading) btn.classList.add('loading'); else btn.classList.remove('loading'); }

/* ══ فیلترهای دوطرفه وابسته ══ */
function syncCascadingFilters(data, idU, idE) {
    const elU = document.getElementById(idU), elE = document.getElementById(idE);
    if (!elU || !elE || !data) return;
    const curU = elU.value, curE = elE.value;
    const validUnds = [...new Set(data.filter(s => !curE || (s.expiry || s['تاریخ اعمال']) === curE).map(s => s.underlying || s.underlying))].sort();
    const validExps = [...new Set(data.filter(s => !curU || (s.underlying || s.underlying) === curU).map(s => s.expiry || s['تاریخ اعمال']))].sort();
    elU.innerHTML = '<option value="">همه</option>' + validUnds.map(u => `<option value="${esc(u)}"${u === curU ? ' selected' : ''}>${esc(u)}</option>`).join('');
    elE.innerHTML = '<option value="">همه</option>' + validExps.map(e => `<option value="${esc(e)}"${e === curE ? ' selected' : ''}>${toFaDigit(esc(e))}</option>`).join('');
}

function extractUnderlying(sym) {
    const umap = {'هرم':'اهرم','خود':'خودرو','سپا':'خساپا','ستا':'شستا','شنا':'شپنا','ملت':'وبملت','ملی':'فملی','صاد':'وبصادر','جار':'وتجارت'};
    let b = (sym || '').replace(/^[ضطح]/, '').replace(/[0-9۰-۹]+$/, '').trim();
    return umap[b] || b;
}

/* ══ BLACK-SCHOLES ══ */
function cndf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = (x < 0) ? -1 : 1; x = Math.abs(x) / Math.sqrt(2.0);
    const t = 1.0 / (1.0 + p * x);
    const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * erf);
}
function npdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
function bsCalc(isCall, S, K, T, r, sigma) {
    if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return { price: 0, delta: isCall ? 1 : -1 };
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    let price = isCall ? (S * cndf(d1) - K * Math.exp(-r * T) * cndf(d2)) : (K * Math.exp(-r * T) * cndf(-d2) - S * cndf(-d1));
    return { price: Math.max(0, price), delta: isCall ? cndf(d1) : cndf(d1) - 1 };
}
function bsCalc(isCall, S, K, T, r, sigma) {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return isCall ? (S * cndf(d1) - K * Math.exp(-r * T) * cndf(d2)) : (K * Math.exp(-r * T) * cndf(-d2) - S * cndf(-d1));
}

function findIV(isCall, S, K, T, r, marketPrice) {
    if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return null;
    let intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    if (marketPrice < intrinsic) return null;

    let sigma = 0.4;
    for (let i = 0; i < 35; i++) {
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const p = bsCalc(isCall, S, K, T, r, sigma);
        const diff = p - marketPrice;
        if (Math.abs(diff) < 0.1) return sigma * 100;
        const vega = S * Math.sqrt(T) * npdf(d1);
        if (vega < 1e-6) break;
        sigma -= diff / vega;
        if (sigma <= 0.001) sigma = 0.001;
        if (sigma > 5.0) return null;
    }

    // Bisection Fallback
    let low = 0.001, high = 5.0;
    for (let i = 0; i < 50; i++) {
        let mid = (low + high) / 2;
        let p = bsCalc(isCall, S, K, T, r, mid);
        if (Math.abs(p - marketPrice) < 0.1) return mid * 100;
        if (p < marketPrice) low = mid;
        else high = mid;
    }
    return null;
}

/* ══ FETCH & BOOT ══ */
function togglePriceBasis() {
    priceBasis = priceBasis === 'last' ? 'exec' : 'last';
    localStorage.setItem('priceBasis', priceBasis);
    updateUIStates();
    manRefresh();
}
function toggleFees() {
    useFees = !useFees;
    localStorage.setItem('useFees', useFees);
    updateUIStates();
    manRefresh();
}
function updateUIStates() {
    const btnP = document.getElementById('btn-price-basis');
    if(btnP) btnP.innerHTML = priceBasis === 'last' ? 'مبنا: آخرین' : 'مبنا: اجرایی';
    const btnF = document.getElementById('btn-fees');
    if(btnF) btnF.innerHTML = useFees ? 'کارمزد: فعال' : 'کارمزد: غیرفعال';
}
// For backward compat on existing page load script
function updatePriceBasisUI() { updateUIStates(); }
async function forceUpdateData() {
    try {
        setBtnLoading('btn-force', true); updateLiveStatus(-1, 'در حال تریگر سرور...'); clearInterval(cdInt);
        await fetch('api/force_update.php');
        await loadLiveData(true); startCD();
    } catch (e) {
        updateLiveStatus(-1, 'خطا'); setTimeout(() => { loadLiveData(false); startCD(); }, 4000);
    } finally { setBtnLoading('btn-force', false); hideLoader(); }
}
async function loadLiveData(manual = false) {
    try {
        if(manual) setBtnLoading('btn-refresh', true);
        const r = await fetch('api/options.php?t=' + Date.now());
        if (r.status === 304 && !manual) return;
        if (r.status === 503) { if (!manual) forceUpdateData(); return; }
        const payload = await r.json();
        if (!payload.data) return;

        allOptionsRows = payload.meta.raw_rows || [];
        strats = {
            bcs: payload.data.bcs || [], bps: payload.data.bps || [], cc: payload.data.cc || [],
            collar: payload.data.collar || [], conversion: payload.data.conversion || [],
            mrp: payload.data.mrp || [], long_box: payload.data.long_box || [],
            strangle: payload.data.strangle || [], condor: payload.data.condor || [],
            lst: payload.data.lst || [], std: payload.data.std || []
        };

        if (document.getElementById('fu')) render();
        if (document.getElementById('bps-fu')) renderBPS();
        if (document.getElementById('cc-fu')) renderCC();
        if (document.getElementById('col-fu')) renderCollar();
        if (document.getElementById('cv-fu')) renderConversion();
        if (document.getElementById('mrp-fu')) renderMrp();
        if (document.getElementById('lb-fu')) renderLongBox();
        if (document.getElementById('strangle-fu')) renderStrangle();
        if (document.getElementById('condor-fu')) renderCondor();
        if (document.getElementById('lst-fu')) renderLst();
        if (document.getElementById('std-fu')) renderStd();
        
        renderWatchlist();
        renderChain();
        renderScenarioScanner();
        renderTopPicks();

        window.lastUpdateTs = payload.meta.updated_ts || Math.floor(Date.now() / 1000);
        updateLiveStatus(Math.round(Date.now() / 1000 - window.lastUpdateTs), '');
        const lupd = document.getElementById('lupd');
        if(lupd) lupd.textContent = toJalaliDateTime(payload.meta.updated_at);
    } catch (e) { console.error(e); } 
    finally { hideLoader(); if(manual) setBtnLoading('btn-refresh', false); }
}

function updateLiveStatus(ageSec, msg) {
    const el = document.getElementById('live-status'), ta = document.getElementById('time-ago');
    if (ta && window.lastUpdateTs) ta.textContent = timeAgo(window.lastUpdateTs);
    if (!el) return;
    if (msg) el.innerHTML = msg;
    else if (!isMarketHours()) { el.innerHTML = '● بازار بسته است'; el.style.color = 'var(--muted)'; }
    else if (ageSec < 90) { el.innerHTML = '● متصل به TSETMC (زنده)'; el.style.color = 'var(--secondary)'; } 
    else { el.innerHTML = '⚠ داده قدیمی'; el.style.color = 'var(--tertiary)'; }
}
function manRefresh() { cdSec = 60; updateCircle(100); loadLiveData(true); }

/* ══ RENDERERS ══ */
function render() {
    syncCascadingFilters(strats.bcs, 'fu', 'fe');
    const fU = document.getElementById('fu')?.value, fE = document.getElementById('fe')?.value, fS = document.getElementById('fs')?.value;
    const fV = (parseFloat(toEnDigit(document.getElementById('fvol')?.value)) || 0) * 1e9;
    let list = strats.bcs.filter(s => (!fU || s.underlying === fU) && (!fE || s.expiry === fE) && s.v1 >= fV && s.v2 >= fV);
    if (fS === 'profit') list.sort((a, b) => b.returnPct - a.returnPct);
    
    document.getElementById('tab-badge-bcs').textContent = toFaDigit(list.length);
    document.getElementById('bcs-st').textContent = toFaDigit(list.length);
    
    if (document.getElementById('tb')) document.getElementById('tb').innerHTML = list.map((s, i) => {
        const bcsD = encodeURIComponent(JSON.stringify({ t: 'bcs', u: s.underlying, S: s.uprice, k1: s.k1, k2: s.k2, p1: s.p1, p2: s.p2, exp: s.expiry, days: s.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${bcsD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(s.underlying)}</td><td class="persian-num" style="font-size:12.5px;color:var(--muted)">${toFaDigit(esc(s.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(s.days)}</td><td><span class="tn" style="color:var(--muted)">${fN(s.uprice)}</span></td><td class="tn tg"><span style="display:block;font-size:10.5px;color:var(--dim)">${esc(s.sym1)}</span>${fN(s.k1)}</td><td class="tn tr"><span style="display:block;font-size:10.5px;color:var(--dim)">${esc(s.sym2)}</span>${fN(s.k2)}</td><td class="tn">${fN(s.p1)}</td><td class="tn">${fN(s.p2)}</td><td class="tn">${fN(s.breakeven)}</td><td>${renderMiniBar(s.safetyMargin, 30, true)}</td><td><span class="ts">${f2(s.returnPct)}%</span></td><td>${fVol(s.v1)}</td><td>${fVol(s.v2)}</td></tr>`;
    }).join('');
}

function renderBPS() {
    syncCascadingFilters(strats.bps, 'bps-fu', 'bps-fe');
    const fU = document.getElementById('bps-fu')?.value, fE = document.getElementById('bps-fe')?.value;
    const fV = (parseFloat(toEnDigit(document.getElementById('bps-fvol')?.value)) || 0) * 1e9;
    let list = strats.bps.filter(s => (!fU || s.underlying === fU) && (!fE || s.expiry === fE) && s.v1 >= fV && s.v2 >= fV);
    document.getElementById('tab-badge-bps').textContent = toFaDigit(list.length);
    if (document.getElementById('bps-tb')) document.getElementById('bps-tb').innerHTML = list.map((s, i) => {
        const bpsD = encodeURIComponent(JSON.stringify({ t: 'bps', u: s.underlying, S: s.uprice, k1: s.k1, k2: s.k2, p1: s.p1, p2: s.p2, exp: s.expiry, days: s.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${bpsD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(s.underlying)}</td><td class="persian-num" style="font-size:12.5px;color:var(--muted)">${toFaDigit(esc(s.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(s.days)}</td><td><span class="tn" style="color:var(--muted)">${fN(s.uprice)}</span></td><td class="tn tr"><span style="display:block;font-size:10.5px;color:var(--dim)">${esc(s.sym1)}</span>${fN(s.k1)}</td><td class="tn tg"><span style="display:block;font-size:10.5px;color:var(--dim)">${esc(s.sym2)}</span>${fN(s.k2)}</td><td class="tn">${fN(s.p1)}</td><td class="tn">${fN(s.p2)}</td><td class="tn">${fN(s.breakeven)}</td><td>${renderMiniBar(s.safetyMargin, -30, false)}</td><td><span class="ts">${f2(s.returnPct)}%</span></td><td>${fVol(s.v1)}</td><td>${fVol(s.v2)}</td></tr>`;
    }).join('');
}

function renderCC() {
    syncCascadingFilters(strats.cc, 'cc-fu', 'cc-fe');
    const fU = document.getElementById('cc-fu')?.value, fE = document.getElementById('cc-fe')?.value, fSt = document.getElementById('cc-fst')?.value;
    let list = strats.cc.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE) && (!fSt || o.status === fSt));
    document.getElementById('tab-badge-cc').textContent = toFaDigit(list.length);
    if (document.getElementById('cc-tb')) document.getElementById('cc-tb').innerHTML = list.map((o, i) => {
        const ccD = encodeURIComponent(JSON.stringify({ t: 'cc', sym: o.symRaw, u: o.underlying, S: o.uprice, K: o.strike, P: o.premium, days: o.days, exp: o.expiry }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${ccD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="persian-num" style="font-size:12.5px">${esc(o.symRaw)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="font-size:12.5px;color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn">${fN(o.uprice)}</td><td class="tn tg">${fN(o.strike)}</td><td class="tn">${fN(o.premium)}</td><td>${fVol(o.volume)}</td><td><span class="tn ${o.tpct >= 15 ? 'tg' : ''}">${f2(o.tpct)}%</span></td><td>${renderMiniBar(o.mpct, 20, true)}</td><td>${renderMiniBar(o.spct, 20, true)}</td><td><span class="badge badge-${o.status==='ITM'?'teal':o.status==='ATM'?'amber':'rose'}">${o.status}</span></td></tr>`;
    }).join('');
}

function renderCollar() {
    syncCascadingFilters(strats.collar, 'col-fu', 'col-fe');
    const fU = document.getElementById('col-fu')?.value, fE = document.getElementById('col-fe')?.value;
    let list = strats.collar.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    document.getElementById('tab-badge-collar').textContent = toFaDigit(list.length);
    if (document.getElementById('col-tb')) document.getElementById('col-tb').innerHTML = list.map((o, i) => {
        const colD = encodeURIComponent(JSON.stringify({ t: 'collar', u: o.underlying, S: o.uprice, Kc: o.Kc, Kp: o.Kp, Pc: o.Pc, Pp: o.Pp, exp: o.expiry, days: o.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${colD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.callSym)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.putSym)}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn">${fN(o.uprice)}</td><td class="tn">${fN(o.Kp)}</td><td class="tn tg">${fN(o.Kc)}</td><td class="tn tr">${fN(o.Pp)}</td><td class="tn tg">${fN(o.Pc)}</td><td class="tn ${o.netP >= 0 ? 'tg' : 'tr'}">${fN(o.netP)}</td><td>${renderMiniBar(o.profitPct, 30, true)}</td><td>${renderMiniBar(o.lossPct, -20, false)}</td><td class="tn">${fN(o.breakeven)}</td><td>${fVol(o.callVol)}</td></tr>`;
    }).join('');
}

function renderConversion() {
    syncCascadingFilters(strats.conversion, 'cv-fu', 'cv-fe');
    const fU = document.getElementById('cv-fu')?.value, fE = document.getElementById('cv-fe')?.value;
    let list = strats.conversion.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    document.getElementById('tab-badge-conversion').textContent = toFaDigit(list.length);
    if (document.getElementById('cv-tb')) document.getElementById('cv-tb').innerHTML = list.map((o, i) => {
        const cvD = encodeURIComponent(JSON.stringify({ t: 'conversion', u: o.underlying, S: o.uprice, K: o.strike, Pc: o.Pc, Pp: o.Pp, days: o.days, exp: o.expiry }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${cvD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.callSym)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.putSym)}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn">${fN(o.uprice)}</td><td class="tn tg" style="text-align:center">${fN(o.strike)}</td><td class="tn" style="text-align:center">${fN(o.netCost)}</td><td><span class="tn tg" style="font-weight:700">${f2(o.monthlyPct)}%</span></td><td><span class="tn tg" style="font-weight:700">${f2(o.retPct)}%</span></td></tr>`;
    }).join('');
}

function renderLongBox() {
    syncCascadingFilters(strats.long_box, 'lb-fu', 'lb-fe');
    const fU = document.getElementById('lb-fu')?.value, fE = document.getElementById('lb-fe')?.value;
    const fV = (parseFloat(toEnDigit(document.getElementById('lb-fvol')?.value)) || 0) * 1e9;
    let list = strats.long_box.filter(o => {
        const matchU = !fU || o.underlying === fU;
        const matchE = !fE || o.expiry === fE;
        const matchV = fV === 0 || ((o.c1V ?? 0) >= fV && (o.c2V ?? 0) >= fV && (o.p1V ?? 0) >= fV && (o.p2V ?? 0) >= fV);
        return matchU && matchE && matchV;
    });
    document.getElementById('tab-badge-lb').textContent = toFaDigit(list.length);
    if (document.getElementById('lb-tb')) document.getElementById('lb-tb').innerHTML = list.map((o, i) => {
        const lbD = encodeURIComponent(JSON.stringify({ t: 'long_box', u: o.underlying, S: o.uprice, k1: o.k1, k2: o.k2, c1P: o.c1P ?? 0, c2P: o.c2P ?? 0, p1P: o.p1P ?? 0, p2P: o.p2P ?? 0, exp: o.expiry, days: o.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${lbD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn" style="text-align:center">${fN(o.uprice)}</td><td class="tn tg" style="text-align:center;"><span style="display:block;font-size:10px;color:var(--dim)">${esc(o.c1Sym)} (${fN(o.k1)})</span>${fN(o.c1P)}</td><td class="tn tr" style="text-align:center;"><span style="display:block;font-size:10px;color:var(--dim)">${esc(o.c2Sym)} (${fN(o.k2)})</span>${fN(o.c2P)}</td><td class="tn tr" style="text-align:center;"><span style="display:block;font-size:10px;color:var(--dim)">${esc(o.p1Sym)} (${fN(o.k1)})</span>${fN(o.p1P)}</td><td class="tn tg" style="text-align:center;"><span style="display:block;font-size:10px;color:var(--dim)">${esc(o.p2Sym)} (${fN(o.k2)})</span>${fN(o.p2P)}</td><td class="tn" style="text-align:center">${fN(o.cost)}</td><td class="tn" style="text-align:center">${fN(o.value)}</td><td class="tn tg" style="text-align:center">${fN(o.profit)}</td><td><span class="tn tg">${f2(o.returnPct)}%</span></td><td><span class="tn tg">${f2(o.annualPct)}%</span></td></tr>`;
    }).join('');
}

function renderMrp() {
    syncCascadingFilters(strats.mrp, 'mrp-fu', 'mrp-fe');
    const fU = document.getElementById('mrp-fu')?.value, fE = document.getElementById('mrp-fe')?.value;
    let list = strats.mrp.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    document.getElementById('tab-badge-mrp').textContent = toFaDigit(list.length);
    if (document.getElementById('mrp-tb')) document.getElementById('mrp-tb').innerHTML = list.map((o, i) => {
        const mrpD = encodeURIComponent(JSON.stringify({ t: 'mrp', u: o.underlying, S: o.uprice, K: o.strike, P: o.premium, exp: o.expiry, days: o.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${mrpD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="persian-num" style="font-size:12.5px">${esc(o.sym)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn">${fN(o.uprice)}</td><td class="tn tg">${fN(o.strike)}</td><td class="tn">${fN(o.premium)}</td><td class="tn">${fN(o.netCost)}</td><td class="tn tr">${fN(o.maxLoss)}</td><td>${renderMiniBar(o.lossPct, -20, false)}</td><td class="tn">${fN(o.breakeven)}</td><td>${fVol(o.volume)}</td></tr>`;
    }).join('');
}

function renderStrangle() {
    syncCascadingFilters(strats.strangle, 'strangle-fu', 'strangle-fe');
    const fU = document.getElementById('strangle-fu')?.value, fE = document.getElementById('strangle-fe')?.value;
    let list = strats.strangle.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    document.getElementById('tab-badge-strangle').textContent = toFaDigit(list.length);
    if (document.getElementById('strangle-tb')) document.getElementById('strangle-tb').innerHTML = list.map((o, i) => {
        const stD = encodeURIComponent(JSON.stringify({ t: 'strangle', u: o.underlying, S: o.uprice, k1: o.Kp, k2: o.Kc, p1: o.Pp, p2: o.Pc, exp: o.expiry, days: o.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${stD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.putSym)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.callSym)}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn">${fN(o.uprice)}</td><td class="tn">${fN(o.Kp)}</td><td class="tn">${fN(o.Kc)}</td><td class="tn tg">${fN(o.Pp)}</td><td class="tn tg">${fN(o.Pc)}</td><td class="tn tg">${fN(o.totalCredit)}</td><td class="tn">${fN(o.beLower)}</td><td class="tn">${fN(o.beUpper)}</td><td>${renderMiniBar(o.distLower, -30, false)}</td><td>${renderMiniBar(o.distUpper, -30, false)}</td></tr>`;
    }).join('');
}

function renderCondor() {
    syncCascadingFilters(strats.condor, 'condor-fu', 'condor-fe');
    const fU = document.getElementById('condor-fu')?.value, fE = document.getElementById('condor-fe')?.value;
    let list = strats.condor.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    document.getElementById('tab-badge-condor').textContent = toFaDigit(list.length);
    if (document.getElementById('condor-tb')) document.getElementById('condor-tb').innerHTML = list.map((o, i) => {
        const cdD = encodeURIComponent(JSON.stringify({ t: 'condor', u: o.underlying, S: o.uprice, k1: o.k1, k2: o.k2, k3: o.k3, k4: o.k4, exp: o.expiry, days: o.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${cdD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn">${fN(o.uprice)}</td><td class="tn">${fN(o.k1)}</td><td class="tn">${fN(o.k2)}</td><td class="tn">${fN(o.k3)}</td><td class="tn">${fN(o.k4)}</td><td class="tn">${fN(o.netCost)}</td><td class="tn tg">${fN(o.maxProfit)}</td><td class="tn">${fN(o.beLower)}</td><td class="tn">${fN(o.beUpper)}</td><td><span class="tn tg">${f2(o.retPct)}%</span></td></tr>`;
    }).join('');
}

function renderLst() {
    syncCascadingFilters(strats.lst, 'lst-fu', 'lst-fe');
    const fU = document.getElementById('lst-fu')?.value, fE = document.getElementById('lst-fe')?.value;
    let list = strats.lst.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    document.getElementById('tab-badge-lst').textContent = toFaDigit(list.length);
    if (document.getElementById('lst-tb')) document.getElementById('lst-tb').innerHTML = list.map((o, i) => {
        const lsD = encodeURIComponent(JSON.stringify({ t: 'lst', u: o.underlying, S: o.uprice, k1: o.Kp, k2: o.Kc, p1: o.Pp, p2: o.Pc, exp: o.expiry, days: o.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${lsD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.putSym)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.callSym)}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn">${fN(o.uprice)}</td><td class="tn">${fN(o.Kp)}</td><td class="tn">${fN(o.Kc)}</td><td class="tn tr">${fN(o.totalCost)}</td><td class="tn">${fN(o.beLower)}</td><td class="tn">${fN(o.beUpper)}</td><td>${renderMiniBar(o.moveDown, -30, false)}</td><td>${renderMiniBar(o.moveUp, 30, true)}</td></tr>`;
    }).join('');
}

function renderStd() {
    syncCascadingFilters(strats.std, 'std-fu', 'std-fe');
    const fU = document.getElementById('std-fu')?.value, fE = document.getElementById('std-fe')?.value;
    let list = strats.std.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    document.getElementById('tab-badge-std').textContent = toFaDigit(list.length);
    if (document.getElementById('std-tb')) document.getElementById('std-tb').innerHTML = list.map((o, i) => {
        const stD = encodeURIComponent(JSON.stringify({ t: 'std', u: o.underlying, S: o.uprice, k: o.strike, exp: o.expiry, days: o.days }));
        return `<tr><td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${stD}')">🧮</button></td><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td class="tu sticky-col">${esc(o.underlying)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.putSym)}</td><td class="persian-num" style="font-size:11.5px">${esc(o.callSym)}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(esc(o.expiry))}</td><td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td><td class="tn">${fN(o.uprice)}</td><td class="tn">${fN(o.strike)}</td><td class="tn tr">${fN(o.totalCost)}</td><td class="tn">${fN(o.beLower)}</td><td class="tn">${fN(o.beUpper)}</td><td><span class="tn">${f2(o.moveRequired)}%</span></td></tr>`;
    }).join('');
}

/* ══ WATCHLIST & CHAIN ══ */
function renderWatchlist() {
    if (!Array.isArray(allOptionsRows) || allOptionsRows.length === 0) return;
    syncCascadingFilters(allOptionsRows, 'watch-fu', 'watch-fe');
    const fSearch = (document.getElementById('watch-fsearch')?.value || '').trim();
    const fU = document.getElementById('watch-fu')?.value || '';
    const fType = document.getElementById('watch-ftype')?.value || '';
    const fE = document.getElementById('watch-fe')?.value || '';
    const fV = (parseFloat(toEnDigit(document.getElementById('watch-fvol')?.value)) || 0) * 1e9;
    const sigma = (parseFloat(toEnDigit(document.getElementById('watch-sigma')?.value)) || 40) / 100;
    const r = (parseFloat(toEnDigit(document.getElementById('watch-rf')?.value)) || 23) / 100;

    let callsCount = 0, putsCount = 0;
    const filtered = allOptionsRows.filter(row => {
        const sym = row['نماد'] || ''; const isCall = sym.startsWith('ض');
        if (isCall) callsCount++; else putsCount++;
        const und = row.underlying || row['نماد'], exp = row['تاریخ اعمال'] || '', vol = parseFloat(row['ارزش معاملات']) || 0;
        if (fSearch && !sym.includes(fSearch) && !und.includes(fSearch)) return false;
        if (fU && und !== fU) return false;
        if (fE && exp !== fE) return false;
        if (fType === 'call' && !isCall) return false;
        if (fType === 'put' && isCall) return false;
        if (fV > 0 && vol < fV) return false;
        return true;
    });

    if(document.getElementById('tab-badge-watch')) document.getElementById('tab-badge-watch').textContent = toFaDigit(filtered.length);
    if(document.getElementById('watch-tcnt')) document.getElementById('watch-tcnt').textContent = toFaDigit(filtered.length) + ' قرارداد';

    const wivMap = {};
    filtered.forEach(row => {
        const isCall = (row['نماد'] || '').startsWith('ض');
        const S = parseFloat(row['_base']) || 0, K = parseFloat(row['قیمت اعمال']) || 0;
        const T = Math.max(1, parseInt(row['_daysLeft']) || 1) / 365, P = parseFloat(row['آخرین قیمت']) || 0, vol = parseFloat(row['ارزش معاملات']) || 0;
        const key = `${row.underlying}|${row['تاریخ اعمال']}|${isCall ? 'C' : 'P'}`;
        const iv = findIV(isCall, S, K, T, r, P);
        if (iv && vol > 0) {
            if (!wivMap[key]) wivMap[key] = { sumIVxVol: 0, sumVol: 0 };
            wivMap[key].sumIVxVol += iv * vol; wivMap[key].sumVol += vol;
        }
    });

    const tbody = document.getElementById('watch-tb');
    if (!tbody) return;
    tbody.innerHTML = filtered.map((row, idx) => {
        const sym = row['نماد'] || '', isCall = row.side === 'call' || sym.startsWith('ض'), und = row.underlying || sym, exp = row['تاریخ اعمال'] || '';
        const S = parseFloat(row['_base']) || 0, K = parseFloat(row['قیمت اعمال']) || 0, T = Math.max(1, parseInt(row['_daysLeft']) || 1) / 365;
        const P = parseFloat(row['آخرین قیمت']) || 0, vol = parseFloat(row['ارزش معاملات']) || 0;
        const be = isCall ? (K + P) : (K - P);
        const bsHV = bsCalc(isCall, S, K, T, r, sigma), ivVal = findIV(isCall, S, K, T, r, P);
        const wivKey = `${und}|${exp}|${isCall ? 'C' : 'P'}`;
        const wiv = (wivMap[wivKey] && wivMap[wivKey].sumVol > 0) ? (wivMap[wivKey].sumIVxVol / wivMap[wivKey].sumVol) : null;
        const bsWIV = wiv ? bsCalc(isCall, S, K, T, r, wiv / 100) : null;
        const bubbleWIV = (bsWIV && bsWIV.price > 0) ? ((P - bsWIV.price) / bsWIV.price) * 100 : null;
        const status = isCall ? (K < S * 0.98 ? 'ITM' : K <= S * 1.02 ? 'ATM' : 'OTM') : (K > S * 1.02 ? 'ITM' : K >= S * 0.98 ? 'ATM' : 'OTM');
        return `<tr><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(idx + 1)}</td><td><span class="badge ${isCall ? 'badge-teal' : 'badge-rose'}">${isCall ? 'کال' : 'پوت'}</span></td><td class="tu sticky-col">${esc(und)}</td><td class="persian-num" style="font-size:12px">${esc(sym)}</td><td class="persian-num" style="color:var(--muted);font-size:12px">${toFaDigit(exp)}</td><td class="tn" style="text-align:center">${toFaDigit(row['_daysLeft'] || 0)}</td><td class="tn tg">${fN(K)}</td><td class="tn">${fN(S)}</td><td><span class="badge ${status === 'ITM' ? 'badge-teal' : status === 'ATM' ? 'badge-amber' : 'badge-rose'}">${status}</span></td><td class="tn tg font-bold">${fN(P)}</td><td class="tn" style="color:var(--primary)">${fN(be)}</td><td class="tn" style="color:var(--purple)">${fN(bsHV.price)}</td><td class="tn">${ivVal ? f2(ivVal) + '%' : '—'}</td><td class="tn" style="color:var(--secondary)">${wiv ? f2(wiv) + '%' : '—'}</td><td class="tn" style="color:var(--purple)">${bsWIV ? fN(bsWIV.price) : '—'}</td><td class="tn ${bubbleWIV >= 0 ? 'tr' : 'tg'}">${bubbleWIV != null ? (bubbleWIV > 0 ? '+' : '') + f2(bubbleWIV) + '%' : '—'}</td><td class="tn tg">${f2(bsHV.delta)}</td><td class="tn ty">${f2((P > 0 && S > 0) ? Math.abs(bsHV.delta) * (S / P) : 0)}x</td><td>${fVol(vol)}</td></tr>`;
    }).join('');
}

function renderChain() {
    if (!Array.isArray(allOptionsRows) || allOptionsRows.length === 0) return;
    syncCascadingFilters(allOptionsRows, 'chain-fu', 'chain-fe');
    const fU = document.getElementById('chain-fu')?.value || '', fE = document.getElementById('chain-fe')?.value || '';
    const targetPrice = parseFloat(toEnDigit(document.getElementById('chain-target')?.value)) || 0;
    let list = allOptionsRows.filter(r => (!fU || r.underlying === fU) && (!fE || r['تاریخ اعمال'] === fE));
    const strikesMap = {}; let currentS = 0;
    list.forEach(row => {
        const sym = row['نماد'] || '', isCall = sym.startsWith('ض'), K = parseFloat(row['قیمت اعمال']) || 0;
        currentS = parseFloat(row['_base']) || currentS;
        if (!strikesMap[K]) strikesMap[K] = { call: null, put: null };
        if (isCall) strikesMap[K].call = row; else strikesMap[K].put = row;
    });
    const sortedStrikes = Object.keys(strikesMap).map(Number).sort((a, b) => a - b);
    if(document.getElementById('tab-badge-chain')) document.getElementById('tab-badge-chain').textContent = toFaDigit(sortedStrikes.length);
    if(document.getElementById('chain-tcnt')) document.getElementById('chain-tcnt').textContent = toFaDigit(sortedStrikes.length) + ' ردیف اعمال';
    const tbody = document.getElementById('chain-tb');
    if (!tbody) return;
    tbody.innerHTML = sortedStrikes.map(K => {
        const c = strikesMap[K].call, p = strikesMap[K].put;
        let cSym = '—', cPrem = '—', cBe = '—', cDelta = '—', cWiv = '—', cTargetProfit = '—';
        if (c) {
            cSym = c['نماد']; const P = parseFloat(c['آخرین قیمت']) || 0, T = Math.max(1, parseInt(c['_daysLeft']) || 1) / 365;
            cPrem = fN(P); cBe = fN(K + P); cDelta = f2(bsCalc(true, currentS, K, T, 0.23, 0.4).delta);
            const iv = findIV(true, currentS, K, T, 0.23, P); cWiv = iv ? f2(iv) + '%' : '—';
            if (targetPrice > 0 && P > 0) { const ret = ((Math.max(0, targetPrice - K) - P) / P) * 100; cTargetProfit = `<span class="${ret >= 0 ? 'tg' : 'tr'}">${ret > 0 ? '+' : ''}${f2(ret)}%</span>`; }
        }
        let pSym = '—', pPrem = '—', pBe = '—', pDelta = '—', pWiv = '—', pTargetProfit = '—';
        if (p) {
            pSym = p['نماد']; const P = parseFloat(p['آخرین قیمت']) || 0, T = Math.max(1, parseInt(p['_daysLeft']) || 1) / 365;
            pPrem = fN(P); pBe = fN(K - P); pDelta = f2(bsCalc(false, currentS, K, T, 0.23, 0.4).delta);
            const iv = findIV(false, currentS, K, T, 0.23, P); pWiv = iv ? f2(iv) + '%' : '—';
            if (targetPrice > 0 && P > 0) { const ret = ((Math.max(0, K - targetPrice) - P) / P) * 100; pTargetProfit = `<span class="${ret >= 0 ? 'tg' : 'tr'}">${ret > 0 ? '+' : ''}${f2(ret)}%</span>`; }
        }
        return `<tr><td class="persian-num" style="font-size:11.5px">${esc(pSym)}</td><td class="tn font-bold">${pPrem}</td><td class="tn">${pBe}</td><td class="tn">${pWiv}</td><td class="tn">${pDelta}</td><td class="tn">${pTargetProfit}</td><td class="tn font-bold" style="background:var(--tertiary-bg);color:var(--tertiary);text-align:center;font-size:14px">${fN(K)}</td><td class="tn">${cTargetProfit}</td><td class="tn">${cDelta}</td><td class="tn">${cWiv}</td><td class="tn">${cBe}</td><td class="tn font-bold">${cPrem}</td><td class="persian-num" style="font-size:11.5px">${esc(cSym)}</td></tr>`;
    }).join('');
}

/* ══ SCENARIO SCANNER & TOP PICKS ══ */
function renderScenarioScanner() {
    const symFilter = document.getElementById('sc-symbol')?.value || '';
    const initialCapital = parseFloat(toEnDigit(document.getElementById('sc-capital')?.value)) || 100000000;
    const minVol = (parseFloat(toEnDigit(document.getElementById('sc-liquidity')?.value)) || 10) * 1e9;
    const tbody = document.getElementById('sc-tb');
    if (!tbody) return;

    let candidates = [];
    strats.cc.forEach(o => {
        if ((!symFilter || o.underlying === symFilter) && o.volume >= minVol && o.tpct > 0) {
            candidates.push({ type: 'Covered Call', u: o.underlying, exp: o.expiry, days: o.days, S: o.uprice, cost: o.uprice * 1000, profit: o.tpct, safety: o.spct, liquidity: o.volume, quality: 100, iv: findIV(true, o.uprice, o.strike, o.days/365, 0.23, o.premium) || 0, contract: `سهام + فروش کال ${o.strike}`, obj: o });
        }
    });
    strats.bcs.forEach(o => {
        if ((!symFilter || o.underlying === symFilter) && o.v1 >= minVol && o.v2 >= minVol && o.returnPct > 0) {
            candidates.push({ type: 'Bull Call Spread', u: o.underlying, exp: o.expiry, days: o.days, S: o.uprice, cost: o.netDebit * 1000, profit: o.returnPct, safety: o.safetyMargin, liquidity: Math.min(o.v1, o.v2), quality: o.exitQuality || 50, iv: findIV(true, o.uprice, o.k1, o.days/365, 0.23, o.p1) || 0, contract: `خرید کال ${o.k1} + فروش کال ${o.k2}`, obj: o });
        }
    });
    strats.collar.forEach(o => {
        if ((!symFilter || o.underlying === symFilter) && o.callVol >= minVol && o.putVol >= minVol && o.profitPct > 0) {
            candidates.push({ type: 'Collar', u: o.underlying, exp: o.expiry, days: o.days, S: o.uprice, cost: (o.uprice + o.Pp - o.Pc) * 1000, profit: o.profitPct, safety: Math.abs(o.lossPct), liquidity: Math.min(o.callVol, o.putVol), quality: 80, iv: findIV(true, o.uprice, o.Kc, o.days/365, 0.23, o.Pc) || 0, contract: `سهم + خرید پوت ${o.Kp} + فروش کال ${o.Kc}`, obj: o });
        }
    });

    let maxProfit = Math.max(...candidates.map(c => c.profit), 1), maxSafety = Math.max(...candidates.map(c => c.safety), 1), maxLiquidity = Math.max(...candidates.map(c => c.liquidity), 1);
    candidates.forEach(c => {
        c.score = Math.max(0, (c.profit / maxProfit) * 35) + Math.max(0, (c.safety / maxSafety) * 25) + Math.max(0, (c.liquidity / maxLiquidity) * 20) + Math.max(0, (c.quality / 100) * 20);
        c.rr = c.safety !== 0 ? (c.profit / c.safety) : c.profit;
    });

    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, 50);

    if(document.getElementById('sc-tcnt')) document.getElementById('sc-tcnt').textContent = toFaDigit(topCandidates.length) + ' مورد';
    if(document.getElementById('tab-badge-scanner')) document.getElementById('tab-badge-scanner').textContent = toFaDigit(topCandidates.length);

    if (topCandidates.length === 0) {
        tbody.innerHTML = '';
        if(document.getElementById('sc-emp')) document.getElementById('sc-emp').style.display = 'block';
        return;
    }
    if(document.getElementById('sc-emp')) document.getElementById('sc-emp').style.display = 'none';

    tbody.innerHTML = topCandidates.map((c, i) => {
        const qty = Math.floor(initialCapital / c.cost) || 1;
        return `<tr><td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td><td style="font-weight:700;color:var(--blue)">${c.type}</td><td class="tu">${esc(c.u)}</td><td class="persian-num" style="font-size:11px">${c.contract}</td><td class="persian-num" style="color:var(--muted)">${toFaDigit(c.exp)}</td><td class="tn" style="text-align:center">${toFaDigit(c.days)}</td><td class="tn">${fN(c.S)}</td><td class="tn">${fN(c.cost)}</td><td class="tn">${fN(qty)}</td><td>${renderMiniBar(c.safety, 40, true)}</td><td>${renderMiniBar(c.profit, 40, true)}</td><td class="tn">${f2(c.iv)}%</td><td class="tn">—</td><td class="tn">—</td><td class="tn">—</td><td class="tn">—</td><td class="tn">—</td><td>${fVol(c.liquidity)}</td><td><span class="tn ${c.quality > 80 ? 'tg' : 'ty'}">${f2(c.quality)}%</span></td><td class="tn">${f2(c.rr)}</td><td class="tn tg" style="font-size:14px;font-weight:800">${f2(c.score)}</td></tr>`;
    }).join('');

    if (topCandidates[0] && document.getElementById('sc-best-overall')) {
        document.getElementById('sc-best-overall').innerHTML = `<div style="font-weight:800">${topCandidates[0].type} (${esc(topCandidates[0].u)})</div><div style="font-size:12px;color:var(--dim);margin-top:4px">${topCandidates[0].contract}</div><div style="margin-top:8px;font-size:13px">سود: <b style="color:var(--secondary)">${f2(topCandidates[0].profit)}%</b> | ایمنی: <b style="color:var(--primary)">${f2(topCandidates[0].safety)}%</b> | امتیاز: <b style="color:var(--tertiary)">${f2(topCandidates[0].score)}</b></div>`;
    }
}

function renderTopPicks() {
    const minVol = (parseFloat(toEnDigit(document.getElementById('top-vmin')?.value)) || 10) * 1e9;
    
    // BCS
    const bcsSM = parseFloat(toEnDigit(document.getElementById('top-bcs-sm')?.value)) || 5, bcsP = parseFloat(toEnDigit(document.getElementById('top-bcs-profit')?.value)) || 10;
    let bcsList = strats.bcs.filter(s => s.v1 >= minVol && s.v2 >= minVol && s.safetyMargin >= bcsSM && s.returnPct >= bcsP);
    bcsList.sort((a, b) => b.returnPct - a.returnPct);
    const bcsContainer = document.getElementById('top-results-bcs');
    if (bcsContainer) {
        document.getElementById('top-cnt-bcs').textContent = toFaDigit(bcsList.length) + ' مورد';
        bcsContainer.innerHTML = bcsList.slice(0, 3).map(s => `<div style="background:var(--surface-low);border:1px solid var(--bd);padding:10px;border-radius:8px;margin-bottom:8px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><b style="color:var(--primary)">${esc(s.underlying)}</b><span class="persian-num" style="font-size:11px;color:var(--muted)">${toFaDigit(s.expiry)}</span></div><div class="persian-num" style="font-size:12px;margin-bottom:6px">خرید ${fN(s.k1)} / فروش ${fN(s.k2)}</div><div style="font-size:12px">سود: <b style="color:var(--secondary)">${f2(s.returnPct)}%</b> | ایمنی: <b>${f2(s.safetyMargin)}%</b></div></div>`).join('') || '<div style="padding:10px;text-align:center;color:var(--muted)">موردی یافت نشد</div>';
    }

    // CC
    const ccM = parseFloat(toEnDigit(document.getElementById('top-cc-monthly')?.value)) || 4, ccBE = parseFloat(toEnDigit(document.getElementById('top-cc-be')?.value)) || 10;
    let ccList = strats.cc.filter(s => s.volume >= minVol && s.mpct >= ccM && s.spct >= ccBE);
    ccList.sort((a, b) => b.mpct - a.mpct);
    const ccContainer = document.getElementById('top-results-cc');
    if (ccContainer) {
        document.getElementById('top-cnt-cc').textContent = toFaDigit(ccList.length) + ' مورد';
        ccContainer.innerHTML = ccList.slice(0, 3).map(s => `<div style="background:var(--surface-low);border:1px solid var(--bd);padding:10px;border-radius:8px;margin-bottom:8px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><b style="color:var(--primary)">${esc(s.underlying)}</b><span class="persian-num" style="font-size:11px;color:var(--muted)">${toFaDigit(s.expiry)}</span></div><div class="persian-num" style="font-size:12px;margin-bottom:6px">فروش کال ${fN(s.strike)}</div><div style="font-size:12px">سود ماهانه: <b style="color:var(--secondary)">${f2(s.mpct)}%</b> | حاشیه ایمنی: <b>${f2(s.spct)}%</b></div></div>`).join('') || '<div style="padding:10px;text-align:center;color:var(--muted)">موردی یافت نشد</div>';
    }
}
function resetScenarioScanner() {
    if(document.getElementById('sc-symbol')) document.getElementById('sc-symbol').value = '';
    if(document.getElementById('sc-capital')) document.getElementById('sc-capital').value = '100000000';
    if(document.getElementById('sc-liquidity')) document.getElementById('sc-liquidity').value = '10';
    renderScenarioScanner();
}

/* ══ محاسبه‌گر پاپ‌آپ ══ */
function closeCalc() { document.getElementById('cm-overlay').style.display = 'none'; document.body.style.overflow = ''; }
function openCalc(jsonData) {
    const d = JSON.parse(decodeURIComponent(jsonData)); _cmType = d.t;
    document.getElementById('cm-overlay').style.display = 'flex'; document.body.style.overflow = 'hidden';
    
    let title, subtitle = `${d.u || ''} | سررسید: ${toFaDigit(d.exp || '')} | ${toFaDigit(d.days || 0)} روز`, inputs;
    
    if (d.t === 'bcs' || d.t === 'bps') {
        title = d.t === 'bcs' ? 'Bull Call Spread' : 'Bear Put Spread'; 
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.S || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>اعمال پایین K₁</label><input id="cm-k1" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k1 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>اعمال بالا K₂</label><input id="cm-k2" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k2 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>پرمیوم پایین P₁</label><input id="cm-p1" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.p1 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>پرمیوم بالا P₂</label><input id="cm-p2" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.p2 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div>`;
    } else if (d.t === 'cc' || d.t === 'mrp') {
        title = d.t === 'cc' ? 'Covered Call' : 'Married Put'; 
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.S || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>قیمت اعمال (K)</label><input id="cm-K" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.K || d.k || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>پرمیوم (P)</label><input id="cm-P" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.P || d.p || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.days || 0)}" oninput="handleNumericInput(this); updateCalc()"></div>`;
    } else if (d.t === 'collar' || d.t === 'conversion') {
        title = d.t === 'collar' ? 'Collar' : 'Conversion'; 
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.S || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>اعمال کال (Kc)</label><input id="cm-Kc" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.Kc || d.K || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>اعمال پوت (Kp)</label><input id="cm-Kp" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.Kp || d.K || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>پرمیوم کال دریافتی (Pc)</label><input id="cm-Pc" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.Pc || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>پرمیوم پوت پرداختی (Pp)</label><input id="cm-Pp" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.Pp || 0)}" oninput="handleNumericInput(this); updateCalc()"></div>`;
    } else if (d.t === 'long_box') {
        title = 'Long Box Arbitrage'; 
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.S || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.days || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>اعمال پایین (K₁)</label><input id="cm-k1" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k1 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>اعمال بالا (K₂)</label><input id="cm-k2" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k2 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>خرید کال K₁ (پریمیوم C₁)</label><input id="cm-c1p" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.c1P || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>فروش کال K₂ (پریمیوم C₂)</label><input id="cm-c2p" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.c2P || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>فروش پوت K₁ (پریمیوم P₁)</label><input id="cm-p1p" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.p1P || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>خرید پوت K₂ (پریمیوم P₂)</label><input id="cm-p2p" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.p2P || 0)}" oninput="handleNumericInput(this); updateCalc()"></div>`;
    } else if (d.t === 'strangle' || d.t === 'lst') {
        title = d.t === 'strangle' ? 'Short Strangle' : 'Long Strangle'; 
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.S || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.days || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>اعمال پایین پوت (K₁)</label><input id="cm-k1" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k1 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>اعمال بالای کال (K₂)</label><input id="cm-k2" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k2 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>پرمیوم پوت پایین (P₁)</label><input id="cm-p1" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.p1 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>پرمیوم کال بالا (P₂)</label><input id="cm-p2" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.p2 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div>`;
    } else if (d.t === 'std') {
        title = 'Long Straddle';
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.S || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>قیمت اعمال (K)</label><input id="cm-K" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.days || 0)}" oninput="handleNumericInput(this); updateCalc()"></div>`;
    } else if (d.t === 'condor') {
        title = 'Long Call Condor';
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.S || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.days || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>K₁ (خرید کال)</label><input id="cm-k1" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k1 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>K₂ (فروش کال)</label><input id="cm-k2" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k2 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>K₃ (فروش کال)</label><input id="cm-k3" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k3 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div><div class="cm-field"><label>K₄ (خرید کال)</label><input id="cm-k4" class="persian-num" type="text" inputmode="numeric" value="${toFaDigit(d.k4 || 0)}" oninput="handleNumericInput(this); updateCalc()"></div>`;
    }
    document.getElementById('cm-title').textContent = title;
    document.getElementById('cm-subtitle').textContent = subtitle;
    document.getElementById('cm-inputs').innerHTML = inputs;
    updateCalc();
}
function updateCalc() {
    const res = document.getElementById('cm-results');
    if (!res) return;
    let html = '', S, bep;
    const days = parseVal('cm-days') || 1;
    let chartParams = {};

    if (_cmType === 'bcs') {
        S = parseVal('cm-S'); const k1 = parseVal('cm-k1'), k2 = parseVal('cm-k2'), p1 = parseVal('cm-p1'), p2 = parseVal('cm-p2');
        const nd = p1 - p2, mp = k2 - k1 - nd; bep = k1 + nd; 
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه خالص</div><div class="cm-res-val persian-num" style="color:var(--tertiary)">${fN(nd)}</div></div><div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val persian-num">${fN(mp)}</div></div><div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(bep)}</div></div>`;
        chartParams = {S, K1: k1, K2: k2, P1: p1, P2: p2, maxP: mp, maxL: -nd, BE: bep};
    } else if (_cmType === 'bps') {
        S = parseVal('cm-S'); const k1 = parseVal('cm-k1'), k2 = parseVal('cm-k2'), p1 = parseVal('cm-p1'), p2 = parseVal('cm-p2');
        const nd = p2 - p1, mp = k2 - k1 - nd; bep = k2 - nd; 
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه خالص</div><div class="cm-res-val persian-num" style="color:var(--tertiary)">${fN(nd)}</div></div><div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val persian-num">${fN(mp)}</div></div><div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(bep)}</div></div>`;
        chartParams = {S, K1: k1, K2: k2, P1: p1, P2: p2, maxP: mp, maxL: -nd, BE: bep};
    } else if (_cmType === 'cc' || _cmType === 'mrp') {
        S = parseVal('cm-S'); const K = parseVal('cm-K'), P = parseVal('cm-P');
        let mp, ml;
        if (_cmType === 'cc') {
            mp = K - S + P; bep = S - P;
            html = `<div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val persian-num">${fN(mp)}</div></div><div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(bep)}</div></div>`;
        } else {
            ml = K - S - P; bep = S + P;
            html = `<div class="cm-res neg"><div class="cm-res-lbl">حداکثر ضرر</div><div class="cm-res-val persian-num">${fN(ml)}</div></div><div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(bep)}</div></div>`;
        }
        chartParams = {S, K, P, BE: bep};
    } else if (_cmType === 'collar' || _cmType === 'conversion') {
        S = parseVal('cm-S'); const Kc = parseVal('cm-Kc'), Kp = parseVal('cm-Kp'), Pc = parseVal('cm-Pc'), Pp = parseVal('cm-Pp');
        const netP = Pc - Pp, mp = Kc - S + netP; bep = S - netP;
        html = `<div class="cm-res"><div class="cm-res-lbl">خالص پرمیوم</div><div class="cm-res-val persian-num" style="color:${netP >= 0 ? 'var(--secondary)' : 'var(--error)'}">${fN(netP)}</div></div><div class="cm-res hi"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val persian-num">${fN(mp)}</div></div><div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(bep)}</div></div>`;
        chartParams = {S, Kc, Kp, Pc, Pp, BE: bep};
    } else if (_cmType === 'strangle' || _cmType === 'lst') {
        S = parseVal('cm-S'); const k1 = parseVal('cm-k1'), k2 = parseVal('cm-k2'), p1 = parseVal('cm-p1'), p2 = parseVal('cm-p2');
        const cost = p1 + p2; let beU, beL;
        if (_cmType === 'strangle') {
            beU = k2 + cost; beL = k1 - cost;
            html = `<div class="cm-res hi"><div class="cm-res-lbl">حداکثر سود (دریافتی)</div><div class="cm-res-val persian-num">${fN(cost)}</div></div><div class="cm-res"><div class="cm-res-lbl">سر به سر پایین / بالا</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(beL)} / ${fN(beU)}</div></div>`;
        } else {
            beU = k2 + cost; beL = k1 - cost;
            html = `<div class="cm-res neg"><div class="cm-res-lbl">حداکثر ضرر (پرداختی)</div><div class="cm-res-val persian-num">${fN(cost)}</div></div><div class="cm-res"><div class="cm-res-lbl">سر به سر پایین / بالا</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(beL)} / ${fN(beU)}</div></div>`;
        }
        chartParams = {S, K1: k1, K2: k2, P1: p1, P2: p2, BE1: beL, BE2: beU};
    } else if (_cmType === 'long_box') {
        S = parseVal('cm-S'); const k1 = parseVal('cm-k1'), k2 = parseVal('cm-k2');
        const cost = (parseVal('cm-c1p') + parseVal('cm-p2p')) - (parseVal('cm-c2p') + parseVal('cm-p1p'));
        const value = k2 - k1;
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه ایجاد باکس</div><div class="cm-res-val persian-num" style="color:var(--tertiary)">${fN(cost)}</div></div><div class="cm-res"><div class="cm-res-lbl">ارزش تضمینی در سررسید</div><div class="cm-res-val persian-num">${fN(value)}</div></div>`;
        chartParams = {S, K1: k1, K2: k2, cost, profit: value - cost};
    } else if (_cmType === 'condor') {
        S = parseVal('cm-S'); const k1 = parseVal('cm-k1'), k2 = parseVal('cm-k2');
        html = `<div class="cm-res"><div class="cm-res-lbl">شبیه‌سازی نمودار</div><div class="cm-res-val persian-num">در آپدیت بعدی</div></div>`; chartParams = {S};
    } else if (_cmType === 'std') {
        S = parseVal('cm-S'); const K = parseVal('cm-K');
        html = `<div class="cm-res"><div class="cm-res-lbl">شبیه‌سازی نمودار</div><div class="cm-res-val persian-num">در آپدیت بعدی</div></div>`; chartParams = {S, K};
    }
    res.innerHTML = html; chartParams.days = days; drawPayoffChart(_cmType, chartParams);
}

function drawPayoffChart(type, p) {
    const svg = document.getElementById('cm-chart'); if (!svg) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const cGreen = '#22c55e', cRed = '#ef4444', cBlue = '#3b82f6', cGrid = isDark ? 'rgba(51, 65, 85, 0.6)' : '#e2e8f0', cZero = isDark ? '#ffffff' : '#0f172a', cText = isDark ? '#94a3b8' : '#64748b';
    const w = 620, h = 290, xPadLeft = 95, yPadTop = 35, chartW = 490, chartH = 205, bottomY = yPadTop + chartH;

    const basePrice = p.S || 1000;
    const pricePoints = []; for (let r = 0.5; r <= 1.5; r += 0.005) pricePoints.push(parseFloat((basePrice * r).toFixed(2)));
    
    const calculatePositionProfit = (price, strike, last, optType, ordType) => {
        if (optType === null) return price - last; 
        if (optType === 1 && ordType === 'LONG') return price <= strike ? -last : (price - last - strike);
        if (optType === 1 && ordType === 'SHORT') return price <= strike ? last : -(price - last - strike);
        if (optType === 2 && ordType === 'LONG') return price <= strike ? (-price - last + strike) : -last;
        if (optType === 2 && ordType === 'SHORT') return price <= strike ? -(-price - last + strike) : last;
        return 0;
    };

    const positions = []; let totalInvestment = 0;
    if (type === 'bcs') { positions.push({ strike: p.K1, last: p.P1, optType: 1, ordType: 'LONG' }, { strike: p.K2, last: p.P2, optType: 1, ordType: 'SHORT' }); totalInvestment = (p.P1 - p.P2) * 1000; } 
    else if (type === 'bps') { positions.push({ strike: p.K2, last: p.P2, optType: 2, ordType: 'LONG' }, { strike: p.K1, last: p.P1, optType: 2, ordType: 'SHORT' }); totalInvestment = (p.P2 - p.P1) * 1000; } 
    else if (type === 'cc') { positions.push({ strike: 0, last: p.S, optType: null, ordType: 'LONG' }, { strike: p.K, last: p.P, optType: 1, ordType: 'SHORT' }); totalInvestment = p.S * 1000; } 
    else if (type === 'mrp') { positions.push({ strike: 0, last: p.S, optType: null, ordType: 'LONG' }, { strike: p.K, last: p.P, optType: 2, ordType: 'LONG' }); totalInvestment = (p.S + p.P) * 1000; } 
    else if (type === 'collar') { positions.push({ strike: 0, last: p.S, optType: null, ordType: 'LONG' }, { strike: p.Kp, last: p.Pp, optType: 2, ordType: 'LONG' }, { strike: p.Kc, last: p.Pc, optType: 1, ordType: 'SHORT' }); totalInvestment = (p.S + p.Pp - p.Pc) * 1000; } 
    else if (type === 'conversion') { positions.push({ strike: 0, last: p.S, optType: null, ordType: 'LONG' }, { strike: p.K, last: p.Pp, optType: 2, ordType: 'LONG' }, { strike: p.K, last: p.Pc, optType: 1, ordType: 'SHORT' }); totalInvestment = (p.S + p.Pp - p.Pc) * 1000; } 
    else if (type === 'strangle') { positions.push({ strike: p.K2, last: p.P2, optType: 1, ordType: 'SHORT' }, { strike: p.K1, last: p.P1, optType: 2, ordType: 'SHORT' }); totalInvestment = 1000; } 
    else if (type === 'lst') { positions.push({ strike: p.K2, last: p.P2, optType: 1, ordType: 'LONG' }, { strike: p.K1, last: p.P1, optType: 2, ordType: 'LONG' }); totalInvestment = (p.P1 + p.P2) * 1000; } 
    else if (type === 'long_box') { totalInvestment = (p.cost || 1) * 1000; }

    const data = pricePoints.map(price => {
        let profit = (type === 'long_box') ? (p.profit || 0) * 1000 : positions.reduce((sum, pos) => sum + calculatePositionProfit(price, pos.strike, pos.last, pos.optType, pos.ordType) * 1000, 0);
        return { price, profit };
    });

    const breakEvenPoints = []; if(type !== 'long_box') { for (let i = 0; i < data.length - 1; i++) { if (data[i].profit * data[i + 1].profit <= 0 && data[i].profit !== data[i + 1].profit) { const slope = (data[i + 1].profit - data[i].profit) / (data[i + 1].price - data[i].price); if (slope !== 0) breakEvenPoints.push(data[i].price + (0 - data[i].profit) / slope); } } }
    if (breakEvenPoints.length === 0 && p.BE) breakEvenPoints.push(p.BE);

    let minProfit = Infinity, maxProfit = -Infinity; data.forEach(d => { if (d.profit < minProfit) minProfit = d.profit; if (d.profit > maxProfit) maxProfit = d.profit; });
    let yDomainMax = Math.max(Math.abs(minProfit), Math.abs(maxProfit)) * 1.25; if (yDomainMax === 0) yDomainMax = 1000;
    const yDomainMin = -yDomainMax, minDomainPrice = pricePoints[0], maxDomainPrice = pricePoints[pricePoints.length - 1];
    const scaleX = pr => xPadLeft + ((pr - minDomainPrice) / (maxDomainPrice - minDomainPrice)) * chartW, scaleY = pf => bottomY - ((pf - yDomainMin) / (yDomainMax - yDomainMin)) * chartH, zeroY = scaleY(0);

    let gridLines = '';
    for (let i = 0; i <= 6; i++) {
        const pf = yDomainMin + i * ((yDomainMax - yDomainMin) / 6), yPos = scaleY(pf);
        gridLines += `<line stroke="${cGrid}" stroke-dasharray="3 3" x1="${xPadLeft}" y1="${yPos}" x2="${xPadLeft + chartW}" y2="${yPos}"></line><text x="${xPadLeft - 10}" y="${yPos + 4}" fill="${cText}" font-size="11" font-weight="600" text-anchor="start" direction="ltr">${(pf < -1 ? '-' : '') + toFaDigit(Math.abs(Math.round(pf)).toLocaleString('en-US'))}</text>`;
    }

    let pathD = '', posPoly = `${scaleX(data[0].price)},${zeroY} `, negPoly = `${scaleX(data[0].price)},${zeroY} `;
    data.forEach((pt, idx) => { pathD += (idx === 0 ? `M ` : ` L `) + `${scaleX(pt.price)},${scaleY(pt.profit)}`; posPoly += `${scaleX(pt.price)},${pt.profit >= 0 ? scaleY(pt.profit) : zeroY} `; negPoly += `${scaleX(pt.price)},${pt.profit < 0 ? scaleY(pt.profit) : zeroY} `; });
    posPoly += `${scaleX(data[data.length - 1].price)},${zeroY}`; negPoly += `${scaleX(data[data.length - 1].price)},${zeroY}`;

    let beLinesHtml = ''; breakEvenPoints.forEach(be => { const beX = scaleX(be); if (beX >= xPadLeft && beX <= xPadLeft + chartW) beLinesHtml += `<line x1="${beX}" y1="${yPadTop}" x2="${beX}" y2="${bottomY}" stroke="${cRed}" stroke-dasharray="4 4" stroke-width="1.8"></line><text x="${beX}" y="${yPadTop - 12}" fill="${cRed}" font-size="12" font-weight="800" text-anchor="middle">سر به سر ${fN(be)}</text>`; });
    const spotX = p.S ? scaleX(p.S) : null; let spotLineHtml = ''; if (spotX && spotX >= xPadLeft && spotX <= xPadLeft + chartW) spotLineHtml = `<line x1="${spotX}" y1="${yPadTop}" x2="${spotX}" y2="${bottomY}" stroke="${cBlue}" stroke-dasharray="4 4" stroke-width="1.8"></line><text x="${spotX}" y="${bottomY - 10}" fill="${cBlue}" font-size="12" font-weight="800" text-anchor="middle">آخرین قیمت ${fN(p.S)}</text>`;

    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<defs><linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#23C00F" stop-opacity="0.75"/><stop offset="100%" stop-color="${isDark ? '#131b2e' : '#ffffff'}" stop-opacity="0.05"/></linearGradient><linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${isDark ? '#131b2e' : '#ffffff'}" stop-opacity="0.05"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0.75"/></linearGradient></defs><g>${gridLines}</g><line x1="${xPadLeft}" y1="${zeroY}" x2="${xPadLeft + chartW}" y2="${zeroY}" stroke="${cZero}" stroke-width="2"></line><polygon points="${posPoly}" fill="url(#positiveGradient)"></polygon><polygon points="${negPoly}" fill="url(#negativeGradient)"></polygon><path d="${pathD}" fill="none" stroke="${cGreen}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>${beLinesHtml}${spotLineHtml}<line id="cm-cursor-line" x1="0" y1="${yPadTop}" x2="0" y2="${bottomY}" stroke="var(--dim)" stroke-dasharray="3 3" stroke-width="1.2" opacity="0"></line><line x1="${xPadLeft}" y1="${bottomY}" x2="${xPadLeft + chartW}" y2="${bottomY}" stroke="${cGrid}" stroke-width="1.5"></line><text x="${xPadLeft}" y="${bottomY + 22}" fill="${cText}" font-size="11.5" font-weight="600" text-anchor="middle">${fN(minDomainPrice)}</text><text x="${xPadLeft + chartW * 0.5}" y="${bottomY + 22}" fill="${cText}" font-size="11.5" font-weight="600" text-anchor="middle">${fN((minDomainPrice + maxDomainPrice) / 2)}</text><text x="${xPadLeft + chartW}" y="${bottomY + 22}" fill="${cText}" font-size="11.5" font-weight="600" text-anchor="middle">${fN(maxDomainPrice)}</text>`;

    currentChartData = data.map(d => ({ ...d, sudeZiyan: totalInvestment !== 0 ? (d.profit / Math.abs(totalInvestment)) * 100 : 0, bahrehSalaneh: (totalInvestment !== 0 ? (d.profit / Math.abs(totalInvestment)) * 100 : 0) * (365 / Math.max(p.days || 1, 1)), sx: scaleX(d.price) }));
}

document.addEventListener('mousemove', function(e) {
    const svg = document.getElementById('cm-chart'), tt = document.getElementById('cm-tooltip'), overlay = document.getElementById('cm-overlay'), cursorLine = document.getElementById('cm-cursor-line');
    if (!svg || !tt || !overlay || overlay.style.display !== 'flex' || !currentChartData || currentChartData.length === 0) { if (tt) tt.classList.remove('visible'); if (cursorLine) cursorLine.style.opacity = '0'; return; }
    const rect = svg.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const mouseX = (e.clientX - rect.left) * (620 / rect.width);
        let closest = currentChartData[0], minDist = Math.abs(mouseX - closest.sx);
        for (let i = 1; i < currentChartData.length; i++) { let d = Math.abs(mouseX - currentChartData[i].sx); if (d < minDist) { minDist = d; closest = currentChartData[i]; } }
        if (cursorLine) { cursorLine.setAttribute('x1', closest.sx); cursorLine.setAttribute('x2', closest.sx); cursorLine.style.opacity = '0.85'; }
        const isP = closest.profit >= 0, clr = isP ? 'tt-green' : 'tt-red', sign = isP ? 'سود' : 'زیان';
        tt.innerHTML = `<div class="tt-row"><span class="tt-lbl">قیمت فرضی:</span><span class="tt-val persian-num">${fN(closest.price)}</span></div><div class="tt-row"><span class="tt-lbl">${sign} نقدی:</span><span class="tt-val persian-num ${clr}">${fN(Math.abs(closest.profit))}</span></div><div class="tt-row"><span class="tt-lbl">درصد ${sign}:</span><span class="tt-val persian-num ${clr}">%${f2(Math.abs(closest.sudeZiyan))}</span></div><div class="tt-row"><span class="tt-lbl">بهره سالانه:</span><span class="tt-val persian-num ${clr}">%${f2(Math.abs(closest.bahrehSalaneh))}</span></div>`;
        tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY + 16) + 'px'; tt.classList.add('visible');
    } else { tt.classList.remove('visible'); if (cursorLine) cursorLine.style.opacity = '0'; }
});

const originalCloseCalc = closeCalc; closeCalc = function() { const tt = document.getElementById('cm-tooltip'); const cursorLine = document.getElementById('cm-cursor-line'); if (tt) tt.classList.remove('visible'); if (cursorLine) cursorLine.style.opacity = '0'; originalCloseCalc(); };

function updateCircle(pct) { const circle = document.getElementById('timer-path'); if(circle) circle.style.strokeDashoffset = 100 - pct; }
function startCD() { clearInterval(cdInt); cdSec = 60; cdInt = setInterval(() => { cdSec--; const el = document.getElementById('cd'); if(el) el.textContent = toFaDigit(cdSec); updateCircle((cdSec/60)*100); const ta = document.getElementById('time-ago'); if(ta && window.lastUpdateTs) ta.textContent = timeAgo(window.lastUpdateTs); if (cdSec <= 0) { cdSec = 60; loadLiveData(false); } }, 1000); }

document.addEventListener('DOMContentLoaded', () => { 
    if(!document.getElementById('cm-tooltip')) { const tt = document.createElement('div'); tt.id = 'cm-tooltip'; tt.className = 'chart-tooltip'; document.body.appendChild(tt); }
    document.getElementById('dash').style.display = 'block';
    document.querySelectorAll('input[type="number"], input[type="text"].persian-num').forEach(input => { if (input.type === 'number') { input.type = 'text'; input.setAttribute('inputmode', 'numeric'); } if (input.value && /[0-9]/.test(input.value)) input.value = toFaDigit(input.value); input.removeEventListener('input', handleNumericInputEvent); input.addEventListener('input', handleNumericInputEvent); });
    loadLiveData(false); startCD(); 
});
function handleNumericInputEvent(e) { const input = e.target, start = input.selectionStart; input.value = toFaDigit(toEnDigit(input.value).replace(/[^0-9.-]/g, '')); try { input.setSelectionRange(start, start); } catch (_) {} }