/* ══ GLOBAL STATE ══ */
let strats = { bcs: [], cc: [], collar: [], conversion: [] };
let cdSec = 60, cdInt = null, _cmType = null;

/* ══ THEME MANAGEMENT ══ */
function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
}
function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme');
    const target = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    if(document.getElementById('cm-overlay').style.display === 'flex') updateCalc(); 
}
initTheme();

/* ══ UTILS & FORMATTERS ══ */
function showAlert(m) { const el = document.getElementById('alrt'); if(el){ el.textContent = '⚠ ' + m; el.style.display = 'block'; } }
function hideAlert() { const el = document.getElementById('alrt'); if(el) el.style.display = 'none'; }
function esc(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const fN = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US');
const f2 = n => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(2);
const fVol = v => {
    if (!v) return '<span style="color:var(--dim);font-size:10px">—</span>';
    if (v >= 1e9) return '<span class="tg">' + (v / 1e9).toFixed(1) + 'B</span>';
    if (v >= 1e6) return '<span class="ty">' + (v / 1e6).toFixed(1) + 'M</span>';
    return (v / 1e3).toFixed(0) + 'K';
};

function renderMiniBar(val, maxVal, isGoodPositive) {
    if (val == null || isNaN(val)) return '<span class="tn">—</span>';
    let pct = Math.min(100, (Math.abs(val) / maxVal) * 100);
    let isPositive = val >= 0;
    let colorClass = (isGoodPositive && isPositive) || (!isGoodPositive && !isPositive) ? 'tg' : 'tr';
    let barColor = (isGoodPositive && isPositive) || (!isGoodPositive && !isPositive) ? 'var(--secondary)' : 'var(--error)';
    
    return `
    <div class="mini-bar-container">
        <div class="mini-bar-text"><span class="${colorClass}">${val > 0 ? '+' : ''}${f2(val)}%</span></div>
        <div class="mini-bar-track">
            <div class="mini-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
        </div>
    </div>`;
}

function timeAgo(ts) {
    const sec = Math.round(Date.now() / 1000 - ts);
    if (sec < 10) return "همین الان";
    if (sec < 60) return sec + " ثانیه پیش";
    if (sec < 3600) return Math.floor(sec / 60) + " دقیقه پیش";
    return Math.floor(sec / 3600) + " ساعت پیش";
}

function hideLoader() {
    const loader = document.getElementById('loader-overlay');
    if (loader) { 
        loader.style.opacity = '0'; 
        setTimeout(() => loader.remove(), 400); 
    }
}

/* ══ LAYOUT & TABS ══ */
function updateLayout() {
    const bar = document.getElementById('calc-bar'), hdr = document.getElementById('dash-hdr');
    const h = bar ? bar.offsetHeight : 0;
    document.documentElement.style.setProperty('--cbh', h + 'px');
    if (hdr) hdr.style.top = h + 'px';
}
window.addEventListener('resize', updateLayout);

function switchTab(tab) {
    document.querySelectorAll('.htab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.page-content').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
}

function toggleGFP(id) {
    const body = document.getElementById('gfp-' + id + '-body'), arr = document.getElementById('gfp-' + id + '-arrow');
    if(body && arr) {
        const isColl = body.classList.toggle('collapsed');
        arr.textContent = isColl ? '▼' : '▲';
    }
}

/* ══ LIVE DATA LOADER ══ */
function setBtnLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) btn.classList.add('loading');
    else btn.classList.remove('loading');
}

async function forceUpdateData() {
    try {
        setBtnLoading('btn-force', true);
        updateLiveStatus(-1, 'در حال پردازش در سرور بورس...');
        clearInterval(cdInt);
        const r = await fetch('api/force_update.php');
        const res = await r.json().catch(() => ({}));
        if (!r.ok || !res.ok) throw new Error(res.message || 'خطا در اجرای سرور');
        await loadLiveData(true);
        startCD();
    } catch (e) {
        updateLiveStatus(-1, 'خطا: ' + e.message);
        setTimeout(() => { loadLiveData(false); startCD(); }, 4000);
    } finally {
        setBtnLoading('btn-force', false);
        hideLoader();
    }
}

async function loadLiveData(manual = false) {
    try {
        if(manual) {
            setBtnLoading('btn-refresh', true);
            updateLiveStatus(-1, 'در حال دریافت اطلاعات...');
        }
        
        const r = await fetch('api/options.php?t=' + Date.now());
        if (r.status === 304 && !manual) return;
        
        if (r.status === 503) {
            updateLiveStatus(-1, 'دیتابیس در حال ساخت است...');
            if (!manual) forceUpdateData();
            return;
        }
        if (!r.ok) {
            throw new Error('خطای ارتباطی ' + r.status);
        }

        const payload = await r.json();
        
        if (!payload.data || Array.isArray(payload.data) || !payload.data.bcs) {
            updateLiveStatus(-1, 'ساختار داده سرور قدیمی است. تریگر خودکار...');
            if (!manual) forceUpdateData();
            return;
        }

        strats = {
            bcs: payload.data.bcs || [],
            cc: payload.data.cc || [],
            collar: payload.data.collar || [],
            conversion: payload.data.conversion || []
        };

        updateGenericFilters(strats.bcs, 'fu', 'fe'); render();
        updateGenericFilters(strats.cc, 'cc-fu', 'cc-fe'); renderCC();
        updateGenericFilters(strats.collar, 'col-fu', 'col-fe'); renderCollar();
        updateGenericFilters(strats.conversion, 'cv-fu', 'cv-fe'); renderConversion();

        window.lastUpdateTs = payload.meta.updated_ts || Math.floor(Date.now() / 1000);
        updateLiveStatus(Math.round(Date.now() / 1000 - window.lastUpdateTs), '');
        
        const lupd = document.getElementById('lupd');
        if(lupd) lupd.textContent = payload.meta.updated_at || '—';

        if (payload.meta.stale || Math.round(Date.now() / 1000 - window.lastUpdateTs) > 300) showAlert('⚠ داده‌ها قدیمی هستند. Collector متوقف شده است.');
        else hideAlert();

    } catch (e) {
        updateLiveStatus(-1, 'خطای دریافت: ' + e.message);
    } finally {
        hideLoader();
        if(manual) setBtnLoading('btn-refresh', false);
    }
}

function updateLiveStatus(ageSec, msg) {
    const el = document.getElementById('live-status'), ta = document.getElementById('time-ago');
    if (ta && window.lastUpdateTs) ta.textContent = timeAgo(window.lastUpdateTs);

    if (!el) return;
    if (msg) { el.innerHTML = msg; el.style.color = 'var(--error)'; return; }
    if (ageSec < 90) { el.innerHTML = '● متصل به TSETMC'; el.style.color = 'var(--secondary)'; }
    else { el.innerHTML = '⚠ داده قدیمی'; el.style.color = 'var(--tertiary)'; }
}

function manRefresh() { cdSec = 60; updateCircle(100); loadLiveData(true); }

function updateGenericFilters(d, idU, idE) {
    if (!d || !Array.isArray(d)) return;
    const und = [...new Set(d.map(s => s.underlying))].sort(), exp = [...new Set(d.map(s => s.expiry))].sort();
    const setOptions = (id, arr) => {
        const el = document.getElementById(id); if(!el) return;
        const cur = el.value; el.innerHTML = '<option value="">همه</option>' + arr.map(v => `<option value="${esc(v)}"${v===cur?' selected':''}>${esc(v)}</option>`).join('');
    };
    setOptions(idU, und); setOptions(idE, exp);
}

/* ══ RENDERERS ══ */
function render() {
    const fU = document.getElementById('fu').value, fE = document.getElementById('fe').value, fS = document.getElementById('fs').value;
    const fV = (parseFloat(document.getElementById('fvol').value) || 0) * 1e9, gS = parseFloat(document.getElementById('gf-safety').value), gW = parseFloat(document.getElementById('gf-worst').value), gR = parseFloat(document.getElementById('gf-ret').value), gSt = document.getElementById('gf-status').value;

    let list = strats.bcs.filter(s => (!fU || s.underlying === fU) && (!fE || s.expiry === fE) && s.v1 >= fV && s.v2 >= fV);
    list.forEach(s => {
        const st = s.k1 < s.uprice * .97 ? 'ITM' : s.k1 <= s.uprice * 1.03 ? 'ATM' : 'OTM';
        s._gold = !(!isNaN(gS) && s.safetyMargin < gS || !isNaN(gW) && s.retWorst < gW || !isNaN(gR) && s.returnPct < gR || gSt && st !== gSt);
    });
    
    document.getElementById('bcs-st').textContent = list.length;
    document.getElementById('bcs-su').textContent = new Set(list.map(s => s.underlying)).size;
    document.getElementById('bcs-se').textContent = new Set(list.map(s => s.expiry)).size;
    
    const goldCount = list.filter(s => s._gold).length;
    document.getElementById('bcs-gold').textContent = goldCount;

    let totalRet = 0; list.forEach(s => totalRet += s.returnPct);
    const avgRetEl = document.getElementById('bcs-avg-ret');
    if(avgRetEl) avgRetEl.textContent = list.length ? (totalRet / list.length).toFixed(1) + '%' : '0%';

    if (fS === 'gold') list.sort((a, b) => (b._gold?1:0)-(a._gold?1:0) || (b.safetyMargin||-999)-(a.safetyMargin||-999));
    else if (fS === 'profit') list.sort((a, b) => (b.safetyMargin||-999)-(a.safetyMargin||-999));
    else if (fS === 'ret') list.sort((a, b) => b.returnPct - a.returnPct);
    else if (fS === 'loss') list.sort((a, b) => a.maxLoss - b.maxLoss);
    else if (fS === 'debit') list.sort((a, b) => a.netDebit - b.netDebit);
    else if (fS === 'atm') list.sort((a, b) => Math.abs(a.safetyMargin||999) - Math.abs(b.safetyMargin||999));
    else if (fS === 'days') list.sort((a, b) => a.days - b.days);
    
    document.getElementById('tb').innerHTML = list.map((s, i) => {
        const st = s.k1 < s.uprice * .97 ? '<span class="badge badge-teal">ITM</span>' : s.k1 <= s.uprice * 1.03 ? '<span class="badge badge-amber">ATM</span>' : '<span class="badge badge-rose">OTM</span>';
        const bcsD = encodeURIComponent(JSON.stringify({ t: 'bcs', u: s.underlying, S: s.uprice, k1: s.k1, k2: s.k2, p1: s.p1, p2: s.p2, exp: s.expiry, days: s.days }));
        return `<tr class="${s._gold ? 'is-gold' : ''}">
            <td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${bcsD}')">🧮</button></td>
            <td style="color:var(--dim);font-size:10px">${i + 1}</td>
            <td class="tu sticky-col">${esc(s.underlying)}${s._gold?'⭐':''}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(s.expiry)}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${s.days}</td>
            <td><span class="tn" style="color:var(--muted)">${fN(s.uprice)}</span></td>
            <td class="tn tg"><span style="display:block;font-size:9px;color:var(--dim);font-weight:400">${esc(s.sym1)}</span>${fN(s.k1)}</td>
            <td class="tn tr"><span style="display:block;font-size:9px;color:var(--dim);font-weight:400">${esc(s.sym2)}</span>${fN(s.k2)}</td>
            <td class="tn">${fN(s.p1)}</td><td class="tn">${fN(s.p2)}</td>
            <td class="tn">${fN(s.breakeven)}</td>
            <td>${renderMiniBar(s.safetyMargin, 30, true)}</td>
            <td>${renderMiniBar(s.returnPct, 100, true)}</td>
            <td>${st}</td><td class="tn">${(s.v1/1e9).toFixed(1)}B</td><td class="tn">${(s.v2/1e9).toFixed(1)}B</td>
        </tr>`;
    }).join('');
}

function renderCC() {
    const fU = document.getElementById('cc-fu').value, fE = document.getElementById('cc-fe').value, fSt = document.getElementById('cc-fst').value, fS = document.getElementById('cc-fs').value;
    const gfM = parseFloat(document.getElementById('ccgf-monthly').value), gfS = parseFloat(document.getElementById('ccgf-safety').value), gfSt = document.getElementById('ccgf-status').value;
    
    let list = strats.cc.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE) && (!fSt || o.status === fSt));
    list.forEach(o => o._gold = !(!isNaN(gfM) && o.mpct < gfM || !isNaN(gfS) && o.spct < gfS || gfSt && o.status !== gfSt));
    
    document.getElementById('cc-st').textContent = list.length;
    document.getElementById('cc-sb').textContent = list.length ? Math.max(...list.map(o => o.mpct)).toFixed(1) + '%' : '—';
    document.getElementById('cc-sa').textContent = list.length ? Math.max(...list.map(o => o.spct)).toFixed(1) + '%' : '—';
    document.getElementById('cc-gold').textContent = list.filter(o => o._gold).length;

    if (fS === 'monthly') list.sort((a, b) => b.mpct - a.mpct);
    else if (fS === 'total') list.sort((a, b) => b.tpct - a.tpct);
    else if (fS === 'safety') list.sort((a, b) => b.spct - a.spct);
    else if (fS === 'volume') list.sort((a, b) => b.volume - a.volume);
    
    document.getElementById('cc-tb').innerHTML = list.map((o, i) => {
        const ccD = encodeURIComponent(JSON.stringify({ t: 'cc', sym: o.symRaw, u: o.underlying, S: o.uprice, K: o.strike, P: o.premium, days: o.days, exp: o.expiry }));
        return `<tr class="${o._gold ? 'is-gold' : ''}">
            <td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${ccD}')">🧮</button></td>
            <td style="color:var(--dim);font-size:10px">${i + 1}</td>
            <td class="tn" style="font-size:11px">${esc(o.symRaw)}${o._gold ? '⭐' : ''}</td>
            <td class="tu sticky-col">${esc(o.underlying)}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(o.expiry)}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${o.days}</td>
            <td class="tn" style="color:var(--muted)">${fN(o.uprice)}</td>
            <td class="tn tg">${fN(o.strike)}</td><td class="tn">${fN(o.premium)}</td>
            <td class="tn">${(o.volume/1e9).toFixed(1)}B</td>
            <td><span class="tn ${o.tpct >= 15 ? 'tg' : ''}">${f2(o.tpct)}%</span></td>
            <td>${renderMiniBar(o.mpct, 20, true)}</td>
            <td>${renderMiniBar(o.spct, 20, true)}</td>
            <td><span class="tn">${fN(o.strike)}</span></td>
            <td><span class="badge badge-${o.status==='ITM'?'teal':o.status==='ATM'?'amber':'rose'}">${o.status}</span></td>
        </tr>`;
    }).join('');
}

function renderCollar() {
    const fU = document.getElementById('col-fu').value, fE = document.getElementById('col-fe').value, fS = document.getElementById('col-fs').value;
    const gp = parseFloat(document.getElementById('col-gf-profit').value), gl = parseFloat(document.getElementById('col-gf-loss').value);
    
    let list = strats.collar.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    list.forEach(o => o._gold = !(!isNaN(gp) && o.profitPct < gp || !isNaN(gl) && o.lossPct < gl));
    
    document.getElementById('col-st').textContent = list.length;
    document.getElementById('col-sbp').textContent = list.length ? Math.max(...list.map(o => o.profitPct)).toFixed(1) + '%' : '—';
    document.getElementById('col-sbl').textContent = list.length ? Math.max(...list.map(o => o.lossPct)).toFixed(1) + '%' : '—';
    document.getElementById('col-gold').textContent = list.filter(o => o._gold).length;

    if (fS === 'gold') list.sort((a, b) => (b._gold?1:0)-(a._gold?1:0) || (b.profitPct - a.profitPct));
    else if (fS === 'profit') list.sort((a, b) => b.profitPct - a.profitPct);
    else if (fS === 'loss') list.sort((a, b) => a.lossPct - b.lossPct);
    else if (fS === 'net') list.sort((a, b) => b.netP - a.netP);
    
    document.getElementById('col-tb').innerHTML = list.map((o, i) => {
        const colD = encodeURIComponent(JSON.stringify({ t: 'collar', u: o.underlying, S: o.uprice, Kc: o.Kc, Kp: o.Kp, Pc: o.Pc, Pp: o.Pp, exp: o.expiry, days: o.days }));
        return `<tr class="${o._gold ? 'is-gold' : ''}">
            <td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${colD}')">🧮</button></td>
            <td style="color:var(--dim);font-size:10px">${i + 1}</td>
            <td class="tu sticky-col">${esc(o.underlying)}${o._gold?'⭐':''}</td>
            <td class="tn" style="font-size:10px">${esc(o.callSym)}</td>
            <td class="tn" style="font-size:10px">${esc(o.putSym)}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(o.expiry)}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${o.days}</td>
            <td class="tn" style="color:var(--muted)">${fN(o.uprice)}</td>
            <td class="tn">${fN(o.Kp)}</td><td class="tn tg">${fN(o.Kc)}</td>
            <td class="tn tr">${fN(o.Pp)}</td><td class="tn tg">${fN(o.Pc)}</td>
            <td class="tn ${o.netP >= 0 ? 'tg' : 'tr'}">${o.netP >= 0 ? '+' : ''}${fN(o.netP)}</td>
            <td>${renderMiniBar(o.profitPct, 30, true)}</td>
            <td>${renderMiniBar(o.lossPct, -20, false)}</td>
            <td class="tn">${fN(o.breakeven)}</td><td class="tn">${(o.callVol/1e9).toFixed(1)}B</td>
        </tr>`;
    }).join('');
}

function renderConversion() {
    const fU = document.getElementById('cv-fu').value, fE = document.getElementById('cv-fe').value, fS = document.getElementById('cv-fs').value;
    let list = strats.conversion.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    
    document.getElementById('cv-st').textContent = list.length;
    document.getElementById('cv-sbr').textContent = list.length ? Math.max(...list.map(o => o.annualPct)).toFixed(1) + '%' : '—';
    document.getElementById('cv-su').textContent = new Set(list.map(o => o.underlying)).size;

    if (fS === 'annual') list.sort((a, b) => b.annualPct - a.annualPct);
    else if (fS === 'ret') list.sort((a, b) => b.retPct - a.retPct);
    
    document.getElementById('cv-tb').innerHTML = list.map((o, i) => {
        const cvD = encodeURIComponent(JSON.stringify({ t: 'conversion', u: o.underlying, S: o.uprice, K: o.strike, Pc: o.Pc, Pp: o.Pp, days: o.days, exp: o.expiry }));
        return `<tr>
            <td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${cvD}')">🧮</button></td>
            <td style="color:var(--dim);font-size:10px">${i + 1}</td>
            <td class="tu sticky-col">${esc(o.underlying)}</td>
            <td class="tn" style="font-size:10px">${esc(o.callSym)}</td>
            <td class="tn" style="font-size:10px">${esc(o.putSym)}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(o.expiry)}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${o.days}</td>
            <td class="tn" style="color:var(--muted);text-align:center">${fN(o.uprice)}</td>
            <td class="tn tg" style="text-align:center">${fN(o.strike)}</td>
            <td class="tn" style="text-align:center">${fN(o.netCost)}</td>
            <td><span class="tn tg" style="font-size:13px;font-weight:700">${f2(o.monthlyPct)}%</span></td>
            <td><span class="tn tg" style="font-size:13px;font-weight:700">${f2(o.retPct)}%</span> <span style="font-size:9px;color:var(--dim)">(${f2(o.annualPct)}% سالانه)</span></td>
        </tr>`;
    }).join('');
}

/* ══ CALC DRAWER & DYNAMIC SVG CHART ══ */
function closeCalc() { document.getElementById('cm-overlay').style.display = 'none'; document.body.style.overflow = ''; }

function openCalc(jsonData) {
    const d = JSON.parse(decodeURIComponent(jsonData));
    _cmType = d.t;
    document.getElementById('cm-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    let title, subtitle, inputs;
    if (d.t === 'bcs') {
        title = 'Bull Call Spread'; subtitle = `${d.u} | سررسید: ${d.exp || ''} | ${d.days || 0} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال پایین K₁</label><input id="cm-k1" type="number" value="${d.k1 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال بالا K₂</label><input id="cm-k2" type="number" value="${d.k2 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم پایین P₁ (خرید)</label><input id="cm-p1" type="number" value="${d.p1 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم بالا P₂ (فروش)</label><input id="cm-p2" type="number" value="${d.p2 || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'cc') {
        title = 'Covered Call'; subtitle = `${d.sym || ''} | پایه: ${d.u || ''} | ${d.days || 0} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>قیمت اعمال (K)</label><input id="cm-K" type="number" value="${d.K || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم دریافتی (P)</label><input id="cm-P" type="number" value="${d.P || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" type="number" value="${d.days || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'collar') {
        title = 'Collar (حلقه محافظتی)'; subtitle = `${d.u || ''} | سررسید: ${d.exp || ''} | ${d.days || 0} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال کال (Kc)</label><input id="cm-Kc" type="number" value="${d.Kc || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال پوت (Kp)</label><input id="cm-Kp" type="number" value="${d.Kp || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم کال دریافتی (Pc)</label><input id="cm-Pc" type="number" value="${d.Pc || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم پوت پرداختی (Pp)</label><input id="cm-Pp" type="number" value="${d.Pp || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'conversion') {
        title = 'Conversion Arbitrage'; subtitle = `${d.u || ''} | سررسید: ${d.exp || ''} | ${d.days || 0} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>قیمت اعمال مشترک (K)</label><input id="cm-K" type="number" value="${d.K || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم کال دریافتی (Pc)</label><input id="cm-Pc" type="number" value="${d.Pc || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم پوت پرداختی (Pp)</label><input id="cm-Pp" type="number" value="${d.Pp || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" type="number" value="${d.days || 0}" oninput="updateCalc()"></div>`;
    }
    document.getElementById('cm-title').textContent = title;
    document.getElementById('cm-subtitle').textContent = subtitle;
    document.getElementById('cm-inputs').innerHTML = inputs;
    updateCalc();
}

function updateCalc() {
    const g = id => { const el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; };
    const fStr = n => (!isFinite(n) || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US');
    const fPct = n => (!isFinite(n) || isNaN(n)) ? '—' : n.toFixed(1) + '%';
    const res = document.getElementById('cm-results');
    if (!res) return;
    
    let html = '', S, bep;
    
    if (_cmType === 'bcs') {
        S = g('cm-S'); const k1 = g('cm-k1'), k2 = g('cm-k2'), p1 = g('cm-p1'), p2 = g('cm-p2');
        const nd = p1 - p2, mp = k2 - k1 - nd; bep = k1 + nd; 
        const sm = S > 0 ? (S - bep) / S * 100 : NaN, rr = nd > 0 ? mp / nd * 100 : NaN;
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه (Debit)</div><div class="cm-res-val" style="color:var(--tertiary)">${fStr(nd)}</div></div>
                <div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val">${fStr(mp)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val" style="color:var(--primary)">${fStr(bep)}</div></div>
                <div class="cm-res ${sm > 0 ? 'hi' : sm < -5 ? 'neg' : ''}"><div class="cm-res-lbl">حاشیه امنیت</div><div class="cm-res-val" style="color:${sm > 0 ? 'var(--secondary)' : 'var(--error)'}">${fPct(sm)}</div></div>`;
        drawPayoffChart('bcs', {S, K1: k1, K2: k2, maxP: mp, maxL: -nd, BE: bep});
    } else if (_cmType === 'cc') {
        S = g('cm-S'); const K = g('cm-K'), P = g('cm-P'), days = g('cm-days');
        const mp = K - S + P; bep = S - P; 
        const tpct = S > 0 ? mp / S * 100 : NaN, mpct = days > 0 ? tpct / days * 30 : NaN, spct = S > 0 ? P / S * 100 : NaN;
        html = `<div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val">${fStr(mp)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val" style="color:var(--primary)">${fStr(bep)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">سود ماهانه %</div><div class="cm-res-val">${fPct(mpct)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">درصد پرمیوم</div><div class="cm-res-val" style="color:var(--tertiary)">${fPct(spct)}</div></div>`;
        drawPayoffChart('cc', {S, K, maxP: mp, BE: bep});
    } else if (_cmType === 'collar') {
        S = g('cm-S'); const Kc = g('cm-Kc'), Kp = g('cm-Kp'), Pc = g('cm-Pc'), Pp = g('cm-Pp');
        const netP = Pc - Pp, mp = Kc - S + netP, ml = Kp - S + netP; bep = S - netP;
        const prot = S > 0 ? (S - Kp) / S * 100 : NaN, profPct = S > 0 ? mp / S * 100 : NaN;
        html = `<div class="cm-res"><div class="cm-res-lbl">خالص پرمیوم</div><div class="cm-res-val" style="color:${netP >= 0 ? 'var(--secondary)' : 'var(--error)'}">${netP >= 0 ? '+' : ''}${fStr(netP)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val">${fStr(mp)}</div></div>
                <div class="cm-res neg"><div class="cm-res-lbl">حداکثر ضرر</div><div class="cm-res-val">${fStr(ml)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val" style="color:var(--primary)">${fStr(bep)}</div></div>`;
        drawPayoffChart('collar', {S, Kc, Kp, maxP: mp, maxL: ml, BE: bep});
    } else if (_cmType === 'conversion') {
        S = g('cm-S'); const K = g('cm-K'), Pc = g('cm-Pc'), Pp = g('cm-Pp'), days = g('cm-days');
        const netCost = S + Pp - Pc, profit = K - netCost, retPct = netCost > 0 ? profit / netCost * 100 : NaN;
        const annualPct = (days > 0 && !isNaN(retPct)) ? retPct / days * 365 : NaN;
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه خالص</div><div class="cm-res-val" style="color:var(--tertiary)">${fStr(netCost)}</div></div>
                <div class="cm-res ${profit > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">سود قفل‌شده</div><div class="cm-res-val">${fStr(profit)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">بازده کل %</div><div class="cm-res-val">${fPct(retPct)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">بازده سالانه %</div><div class="cm-res-val">${fPct(annualPct)}</div></div>`;
        drawPayoffChart('conversion', {S, K, maxP: profit, BE: netCost});
    }
    res.innerHTML = html;
}

function drawPayoffChart(type, p) {
    const svg = document.getElementById('cm-chart');
    if (!svg) return;
    
    const root = document.documentElement;
    const isDark = root.getAttribute('data-theme') === 'dark';
    const cPrimary = isDark ? '#3f83f8' : '#1a56db';
    const cSecondary = isDark ? '#31c48d' : '#057a55';
    const cLine = isDark ? '#4b5563' : '#d1d5db';
    const cText = isDark ? '#9ca3af' : '#6b7280';

    const w = 400, h = 200, yZero = 120;
    let points = [];

    const scaleX = val => {
        let min, max;
        if(type==='bcs') { min = p.K1*0.8; max = p.K2*1.2; }
        else if(type==='cc') { min = p.K*0.6; max = p.K*1.4; }
        else if(type==='collar') { min = p.Kp*0.8; max = p.Kc*1.2; }
        else { min = p.K*0.8; max = p.K*1.2; }
        if(val <= min) return 20; if(val >= max) return w-20;
        return 20 + ((val - min) / (max - min)) * (w - 40);
    };
    const scaleY = val => {
        let maxExt = Math.max(Math.abs(p.maxP||0), Math.abs(p.maxL||0));
        if(maxExt === 0) maxExt = 1000;
        return yZero - (val / maxExt) * 80;
    };

    if (type === 'bcs') {
        points = [[20, p.maxL], [p.K1, p.maxL], [p.K2, p.maxP], [w-20, p.maxP]];
    } else if (type === 'cc') {
        points = [[20, p.maxL||-p.S], [p.K, p.maxP], [w-20, p.maxP]];
    } else if (type === 'collar') {
        points = [[20, p.maxL], [p.Kp, p.maxL], [p.Kc, p.maxP], [w-20, p.maxP]];
    } else if (type === 'conversion') {
        points = [[20, p.maxP], [w-20, p.maxP]];
    }

    let d = `M ${points[0][0]===20?20:scaleX(points[0][0])},${scaleY(points[0][1])}`;
    for(let i=1; i<points.length; i++) {
        d += ` L ${points[i][0]===w-20?w-20:scaleX(points[i][0])},${scaleY(points[i][1])}`;
    }

    const sX = scaleX(p.S);
    
    svg.innerHTML = `
        <line x1="20" y1="${yZero}" x2="${w-20}" y2="${yZero}" stroke="${cLine}" stroke-width="2"/>
        <text x="20" y="${yZero-5}" fill="${cText}" font-size="10" font-family="monospace">سود/زیان 0</text>
        <path d="${d}" fill="none" stroke="${cPrimary}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="${sX}" y1="20" x2="${sX}" y2="180" stroke="${cSecondary}" stroke-dasharray="4" stroke-width="2"/>
        <circle cx="${sX}" cy="${yZero}" r="4" fill="${cSecondary}"/>
        <text x="${sX}" y="15" fill="${cSecondary}" font-size="10" font-weight="bold" text-anchor="middle">قیمت فعلی</text>
    `;
}

/* ══ BOOT APP ══ */
function updateCircle(pct) {
    const circle = document.getElementById('timer-path');
    if(circle) circle.style.strokeDashoffset = 100 - pct;
}

function startCD() {
    clearInterval(cdInt); cdSec = 60;
    cdInt = setInterval(() => {
        cdSec--; 
        const el = document.getElementById('cd');
        if(el) el.textContent = cdSec;
        updateCircle((cdSec/60)*100);
        
        const ta = document.getElementById('time-ago');
        if(ta && window.lastUpdateTs) ta.textContent = timeAgo(window.lastUpdateTs);

        if (cdSec <= 0) { cdSec = 60; loadLiveData(false); }
    }, 1000);
}

document.addEventListener('DOMContentLoaded', () => { 
    updateLayout(); 
    document.getElementById('dash').style.display = 'block';
    loadLiveData(false); 
    startCD(); 
});