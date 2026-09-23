/* ══ GLOBAL STATE ══ */
let strats = { bcs: [], cc: [], collar: [], conversion: [] };
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

/* ══ تبدیل جامع ارقام به فارسی ══ */
function toFaDigit(str) {
    if (str == null) return '';
    const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(str).replace(/[0-9]/g, w => faDigits[+w]);
}

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
    return `
    <div class="mini-bar-container">
        <div class="mini-bar-text"><span class="${colorClass}">${val > 0 ? '+' : ''}${f2(val)}%</span></div>
        <div class="mini-bar-track"><div class="mini-bar-fill" style="width: ${pct}%; background: ${barColor};"></div></div>
    </div>`;
}

function toJalaliDateTime(dateStr) {
    if(!dateStr) return '—';
    try {
        const d = new Date(dateStr.replace(' ', 'T'));
        if(isNaN(d)) return dateStr;
        const formatter = new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
        return toFaDigit(formatter.format(d).replace(/,/g, ''));
    } catch(e) { return toFaDigit(dateStr); }
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

function hideLoader() {
    const loader = document.getElementById('loader-overlay');
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 350); }
}

function switchTab(tab) {
    document.querySelectorAll('.htab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.page-content').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
}

function toggleGFP(id) {
    const body = document.getElementById('gfp-' + id + '-body'), arr = document.getElementById('gfp-' + id + '-arrow');
    if(body && arr) arr.textContent = body.classList.toggle('collapsed') ? '▼' : '▲';
}

function toggleLocalCalc(id) {
    const body = document.getElementById(id + '-body'), arr = document.getElementById(id + '-arr');
    if(body && arr) arr.textContent = body.classList.toggle('collapsed') ? '▼' : '▲';
}

function setBtnLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) btn.classList.add('loading');
    else btn.classList.remove('loading');
}

/* ══ فیلترهای دوطرفه وابسته (Cascading Dual Filters) ══ */
function syncCascadingFilters(data, idU, idE) {
    const elU = document.getElementById(idU), elE = document.getElementById(idE);
    if (!elU || !elE || !data) return;
    const curU = elU.value, curE = elE.value;

    const validUnds = [...new Set(data.filter(s => !curE || s.expiry === curE).map(s => s.underlying))].sort();
    const validExps = [...new Set(data.filter(s => !curU || s.underlying === curU).map(s => s.expiry))].sort();

    elU.innerHTML = '<option value="">همه</option>' + validUnds.map(u => `<option value="${esc(u)}"${u === curU ? ' selected' : ''}>${esc(u)}</option>`).join('');
    elE.innerHTML = '<option value="">همه</option>' + validExps.map(e => `<option value="${esc(e)}"${e === curE ? ' selected' : ''}>${toFaDigit(esc(e))}</option>`).join('');
}

/* ══ FETCH LOGIC ══ */
async function forceUpdateData() {
    try {
        setBtnLoading('btn-force', true);
        updateLiveStatus(-1, 'در حال تریگر سرور...');
        clearInterval(cdInt);
        const r = await fetch('api/force_update.php');
        const res = await r.json().catch(() => ({}));
        if (!r.ok || !res.ok) throw new Error(res.message || 'خطا در اجرا');
        await loadLiveData(true);
        startCD();
    } catch (e) {
        updateLiveStatus(-1, 'خطا: ' + e.message);
        setTimeout(() => { loadLiveData(false); startCD(); }, 4000);
    } finally { setBtnLoading('btn-force', false); hideLoader(); }
}

async function loadLiveData(manual = false) {
    try {
        if(manual) { setBtnLoading('btn-refresh', true); updateLiveStatus(-1, 'در حال بروزرسانی...'); }
        
        const r = await fetch('api/options.php?t=' + Date.now());
        if (r.status === 304 && !manual) return;
        if (r.status === 503) { updateLiveStatus(-1, 'دیتابیس در حال ساخت است...'); if (!manual) forceUpdateData(); return; }
        if (!r.ok) throw new Error('خطای ' + r.status);

        const payload = await r.json();
        if (!payload.data || Array.isArray(payload.data) || !payload.data.bcs) {
            updateLiveStatus(-1, 'داده نامعتبر است. تریگر مجدد...');
            if (!manual) forceUpdateData();
            return;
        }

        strats = {
            bcs: payload.data.bcs || [],
            cc: payload.data.cc || [],
            collar: payload.data.collar || [],
            conversion: payload.data.conversion || []
        };

        syncCascadingFilters(strats.bcs, 'fu', 'fe'); render();
        syncCascadingFilters(strats.cc, 'cc-fu', 'cc-fe'); renderCC();
        syncCascadingFilters(strats.collar, 'col-fu', 'col-fe'); renderCollar();
        syncCascadingFilters(strats.conversion, 'cv-fu', 'cv-fe'); renderConversion();

        window.lastUpdateTs = payload.meta.updated_ts || Math.floor(Date.now() / 1000);
        updateLiveStatus(Math.round(Date.now() / 1000 - window.lastUpdateTs), '');
        
        const lupd = document.getElementById('lupd');
        if(lupd) lupd.textContent = toJalaliDateTime(payload.meta.updated_at);

        if (isMarketHours() && (payload.meta.stale || Math.round(Date.now()/1000 - window.lastUpdateTs) > 300)) showAlert('⚠ داده‌ها قدیمی هستند.');
        else hideAlert();

    } catch (e) { updateLiveStatus(-1, 'خطای ارتباط: ' + e.message); } 
    finally { hideLoader(); if(manual) setBtnLoading('btn-refresh', false); }
}

function updateLiveStatus(ageSec, msg) {
    const el = document.getElementById('live-status'), ta = document.getElementById('time-ago');
    if (ta && window.lastUpdateTs) ta.textContent = timeAgo(window.lastUpdateTs);
    if (!el) return;
    if (msg) { el.innerHTML = msg; el.style.color = 'var(--error)'; return; }
    if (!isMarketHours()) { el.innerHTML = '● بازار بسته است'; el.style.color = 'var(--muted)'; return; }
    if (ageSec < 90) { el.innerHTML = '● متصل به TSETMC (زنده)'; el.style.color = 'var(--secondary)'; } 
    else { el.innerHTML = '⚠ داده قدیمی (' + toFaDigit(Math.round(ageSec / 60)) + ' دقیقه)'; el.style.color = 'var(--tertiary)'; }
}

function manRefresh() { cdSec = 60; updateCircle(100); loadLiveData(true); }

/* ══ RENDERERS ══ */
function render() {
    syncCascadingFilters(strats.bcs, 'fu', 'fe');
    const fU = document.getElementById('fu').value, fE = document.getElementById('fe').value, fS = document.getElementById('fs').value;
    const fV = (parseFloat(document.getElementById('fvol').value) || 0) * 1e9, gS = parseFloat(document.getElementById('gf-safety').value), gW = parseFloat(document.getElementById('gf-worst').value), gR = parseFloat(document.getElementById('gf-ret').value), gSt = document.getElementById('gf-status').value;

    let list = strats.bcs.filter(s => (!fU || s.underlying === fU) && (!fE || s.expiry === fE) && s.v1 >= fV && s.v2 >= fV);
    list.forEach(s => {
        const st = s.k1 < s.uprice * .97 ? 'ITM' : s.k1 <= s.uprice * 1.03 ? 'ATM' : 'OTM';
        s._gold = !(!isNaN(gS) && s.safetyMargin < gS || !isNaN(gW) && s.retWorst < gW || !isNaN(gR) && s.returnPct < gR || gSt && st !== gSt);
    });
    
    document.getElementById('tab-badge-bcs').textContent = toFaDigit(list.length);
    document.getElementById('bcs-st').textContent = toFaDigit(list.length);
    document.getElementById('bcs-su').textContent = toFaDigit(new Set(list.map(s => s.underlying)).size);
    document.getElementById('bcs-se').textContent = toFaDigit(new Set(list.map(s => s.expiry)).size);
    document.getElementById('bcs-gold').textContent = toFaDigit(list.filter(s => s._gold).length);
    document.getElementById('tcnt').textContent = toFaDigit(list.length) + ' فرصت معاملاتی';

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
        return `<tr>
            <td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${bcsD}')">🧮</button></td>
            <td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td>
            <td class="tu sticky-col">${esc(s.underlying)} ${s._gold ? '⭐' : ''}</td>
            <td class="persian-num" style="font-size:12.5px;color:var(--muted)">${toFaDigit(esc(s.expiry))}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(s.days)}</td>
            <td><span class="tn" style="color:var(--muted)">${fN(s.uprice)}</span></td>
            <td class="tn tg"><span style="display:block;font-size:10.5px;color:var(--dim);font-weight:400">${esc(s.sym1)}</span>${fN(s.k1)}</td>
            <td class="tn tr"><span style="display:block;font-size:10.5px;color:var(--dim);font-weight:400">${esc(s.sym2)}</span>${fN(s.k2)}</td>
            <td class="tn">${fN(s.p1)}</td><td class="tn">${fN(s.p2)}</td>
            <td class="tn">${fN(s.breakeven)}</td>
            <td>${renderMiniBar(s.safetyMargin, 30, true)}</td>
            <td>${renderMiniBar(s.retWorst, 100, true)}</td>
            <td><span class="ts">${f2(s.returnPct)}%</span></td>
            <td>${s.retBest != null ? `<span class="ts">${f2(s.retBest)}%</span>` : '—'}</td>
            <td>${st}</td><td>${fVol(s.v1)}</td><td>${fVol(s.v2)}</td>
        </tr>`;
    }).join('');
}

function renderCC() {
    syncCascadingFilters(strats.cc, 'cc-fu', 'cc-fe');
    const fU = document.getElementById('cc-fu').value, fE = document.getElementById('cc-fe').value, fSt = document.getElementById('cc-fst').value, fS = document.getElementById('cc-fs').value;
    const gfM = parseFloat(document.getElementById('ccgf-monthly').value), gfS = parseFloat(document.getElementById('ccgf-safety').value), gfSt = document.getElementById('ccgf-status').value;
    
    let list = strats.cc.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE) && (!fSt || o.status === fSt));
    list.forEach(o => o._gold = !(!isNaN(gfM) && o.mpct < gfM || !isNaN(gfS) && o.spct < gfS || gfSt && o.status !== gfSt));
    
    document.getElementById('tab-badge-cc').textContent = toFaDigit(list.length);
    document.getElementById('cc-st').textContent = toFaDigit(list.length);
    document.getElementById('cc-sb').textContent = list.length ? f2(Math.max(...list.map(o => o.mpct))) + '%' : '—';
    document.getElementById('cc-sa').textContent = list.length ? f2(Math.max(...list.map(o => o.spct))) + '%' : '—';
    document.getElementById('cc-gold').textContent = toFaDigit(list.filter(o => o._gold).length);
    document.getElementById('cc-tcnt').textContent = toFaDigit(list.length) + ' فرصت';

    if (fS === 'monthly') list.sort((a, b) => b.mpct - a.mpct);
    else if (fS === 'total') list.sort((a, b) => b.tpct - a.tpct);
    else if (fS === 'safety') list.sort((a, b) => b.spct - a.spct);
    else if (fS === 'volume') list.sort((a, b) => b.volume - a.volume);
    
    document.getElementById('cc-tb').innerHTML = list.map((o, i) => {
        const ccD = encodeURIComponent(JSON.stringify({ t: 'cc', sym: o.symRaw, u: o.underlying, S: o.uprice, K: o.strike, P: o.premium, days: o.days, exp: o.expiry }));
        return `<tr>
            <td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${ccD}')">🧮</button></td>
            <td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td>
            <td class="persian-num" style="font-size:12.5px">${esc(o.symRaw)}</td>
            <td class="tu sticky-col">${esc(o.underlying)} ${o._gold ? '⭐' : ''}</td>
            <td class="persian-num" style="font-size:12.5px;color:var(--muted)">${toFaDigit(esc(o.expiry))}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td>
            <td class="tn" style="color:var(--muted)">${fN(o.uprice)}</td>
            <td class="tn tg">${fN(o.strike)}</td><td class="tn">${fN(o.premium)}</td>
            <td>${fVol(o.volume)}</td>
            <td><span class="tn ${o.tpct >= 15 ? 'tg' : ''}">${f2(o.tpct)}%</span></td>
            <td>${renderMiniBar(o.mpct, 20, true)}</td>
            <td>${renderMiniBar(o.spct, 20, true)}</td>
            <td><span class="tn">${fN(o.strike)}</span></td>
            <td><span class="badge badge-${o.status==='ITM'?'teal':o.status==='ATM'?'amber':'rose'}">${o.status}</span></td>
        </tr>`;
    }).join('');
}

function renderCollar() {
    syncCascadingFilters(strats.collar, 'col-fu', 'col-fe');
    const fU = document.getElementById('col-fu').value, fE = document.getElementById('col-fe').value, fS = document.getElementById('col-fs').value;
    const gp = parseFloat(document.getElementById('col-gf-profit').value), gl = parseFloat(document.getElementById('col-gf-loss').value);
    
    let list = strats.collar.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    list.forEach(o => o._gold = !(!isNaN(gp) && o.profitPct < gp || !isNaN(gl) && o.lossPct < gl));
    
    document.getElementById('tab-badge-collar').textContent = toFaDigit(list.length);
    document.getElementById('col-st').textContent = toFaDigit(list.length);
    document.getElementById('col-sbp').textContent = list.length ? f2(Math.max(...list.map(o => o.profitPct))) + '%' : '—';
    document.getElementById('col-sbl').textContent = list.length ? f2(Math.max(...list.map(o => o.lossPct))) + '%' : '—';
    document.getElementById('col-gold').textContent = toFaDigit(list.filter(o => o._gold).length);
    document.getElementById('col-tcnt').textContent = toFaDigit(list.length) + ' ترکیب';

    if (fS === 'gold') list.sort((a, b) => (b._gold?1:0)-(a._gold?1:0) || (b.profitPct - a.profitPct));
    else if (fS === 'profit') list.sort((a, b) => b.profitPct - a.profitPct);
    else if (fS === 'loss') list.sort((a, b) => b.lossPct - a.lossPct);
    else if (fS === 'net') list.sort((a, b) => b.netP - a.netP);
    
    document.getElementById('col-tb').innerHTML = list.map((o, i) => {
        const colD = encodeURIComponent(JSON.stringify({ t: 'collar', u: o.underlying, S: o.uprice, Kc: o.Kc, Kp: o.Kp, Pc: o.Pc, Pp: o.Pp, exp: o.expiry, days: o.days }));
        return `<tr>
            <td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${colD}')">🧮</button></td>
            <td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td>
            <td class="tu sticky-col">${esc(o.underlying)} ${o._gold ? '⭐' : ''}</td>
            <td class="persian-num" style="font-size:11.5px">${esc(o.callSym)}</td>
            <td class="persian-num" style="font-size:11.5px">${esc(o.putSym)}</td>
            <td class="persian-num" style="font-size:12.5px;color:var(--muted)">${toFaDigit(esc(o.expiry))}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td>
            <td class="tn" style="color:var(--muted)">${fN(o.uprice)}</td>
            <td class="tn">${fN(o.Kp)}</td><td class="tn tg">${fN(o.Kc)}</td>
            <td class="tn tr">${fN(o.Pp)}</td><td class="tn tg">${fN(o.Pc)}</td>
            <td class="tn ${o.netP >= 0 ? 'tg' : 'tr'}">${fN(o.netP)}</td>
            <td>${renderMiniBar(o.profitPct, 30, true)}</td>
            <td>${renderMiniBar(o.lossPct, -20, false)}</td>
            <td class="tn">${fN(o.breakeven)}</td><td>${fVol(o.callVol)}</td>
        </tr>`;
    }).join('');
}

function renderConversion() {
    syncCascadingFilters(strats.conversion, 'cv-fu', 'cv-fe');
    const fU = document.getElementById('cv-fu').value, fE = document.getElementById('cv-fe').value, fS = document.getElementById('cv-fs').value;
    let list = strats.conversion.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE));
    
    document.getElementById('tab-badge-conversion').textContent = toFaDigit(list.length);
    document.getElementById('cv-st').textContent = toFaDigit(list.length);
    document.getElementById('cv-sbr').textContent = list.length ? f2(Math.max(...list.map(o => o.annualPct))) + '%' : '—';
    document.getElementById('cv-su').textContent = toFaDigit(new Set(list.map(o => o.underlying)).size);
    document.getElementById('cv-tcnt').textContent = toFaDigit(list.length) + ' ترکیب';

    if (fS === 'annual') list.sort((a, b) => b.annualPct - a.annualPct);
    else if (fS === 'ret') list.sort((a, b) => b.retPct - a.retPct);
    
    document.getElementById('cv-tb').innerHTML = list.map((o, i) => {
        const cvD = encodeURIComponent(JSON.stringify({ t: 'conversion', u: o.underlying, S: o.uprice, K: o.strike, Pc: o.Pc, Pp: o.Pp, days: o.days, exp: o.expiry }));
        return `<tr>
            <td style="text-align:center;"><button class="calc-btn" onclick="openCalc('${cvD}')">🧮</button></td>
            <td class="persian-num" style="color:var(--dim);font-size:12px">${toFaDigit(i + 1)}</td>
            <td class="tu sticky-col">${esc(o.underlying)}</td>
            <td class="persian-num" style="font-size:11.5px">${esc(o.callSym)}</td>
            <td class="persian-num" style="font-size:11.5px">${esc(o.putSym)}</td>
            <td class="persian-num" style="font-size:12.5px;color:var(--muted)">${toFaDigit(esc(o.expiry))}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${toFaDigit(o.days)}</td>
            <td class="tn" style="color:var(--muted);text-align:center">${fN(o.uprice)}</td>
            <td class="tn tg" style="text-align:center">${fN(o.strike)}</td>
            <td class="tn" style="text-align:center">${fN(o.netCost)}</td>
            <td><span class="tn tg" style="font-size:13.5px;font-weight:700">${f2(o.monthlyPct)}%</span></td>
            <td><span class="tn tg" style="font-size:13.5px;font-weight:700">${f2(o.retPct)}%</span> <span class="persian-num" style="font-size:11px;color:var(--dim)">(${f2(o.annualPct)}% سالانه)</span></td>
        </tr>`;
    }).join('');
}

/* ══ محاسبه‌گر پاپ‌آپ ══ */
function closeCalc() { document.getElementById('cm-overlay').style.display = 'none'; document.body.style.overflow = ''; }

function openCalc(jsonData) {
    const d = JSON.parse(decodeURIComponent(jsonData));
    _cmType = d.t;
    document.getElementById('cm-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    let title, subtitle, inputs;
    if (d.t === 'bcs') {
        title = 'Bull Call Spread'; 
        subtitle = `${d.u} | سررسید: ${toFaDigit(d.exp || '')} | ${toFaDigit(d.days || 0)} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال پایین K₁</label><input id="cm-k1" class="persian-num" type="number" value="${d.k1 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال بالا K₂</label><input id="cm-k2" class="persian-num" type="number" value="${d.k2 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم پایین P₁</label><input id="cm-p1" class="persian-num" type="number" value="${d.p1 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم بالا P₂</label><input id="cm-p2" class="persian-num" type="number" value="${d.p2 || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'cc') {
        title = 'Covered Call'; 
        subtitle = `${d.sym || ''} | پایه: ${d.u || ''} | ${toFaDigit(d.days || 0)} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>قیمت اعمال (K)</label><input id="cm-K" class="persian-num" type="number" value="${d.K || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم دریافتی (P)</label><input id="cm-P" class="persian-num" type="number" value="${d.P || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" class="persian-num" type="number" value="${d.days || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'collar') {
        title = 'Collar (حلقه محافظتی)'; 
        subtitle = `${d.u || ''} | سررسید: ${toFaDigit(d.exp || '')} | ${toFaDigit(d.days || 0)} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال کال (Kc)</label><input id="cm-Kc" class="persian-num" type="number" value="${d.Kc || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال پوت (Kp)</label><input id="cm-Kp" class="persian-num" type="number" value="${d.Kp || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم کال دریافتی (Pc)</label><input id="cm-Pc" class="persian-num" type="number" value="${d.Pc || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم پوت پرداختی (Pp)</label><input id="cm-Pp" class="persian-num" type="number" value="${d.Pp || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'conversion') {
        title = 'Conversion Arbitrage'; 
        subtitle = `${d.u || ''} | سررسید: ${toFaDigit(d.exp || '')} | ${toFaDigit(d.days || 0)} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" class="persian-num" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>قیمت اعمال مشترک (K)</label><input id="cm-K" class="persian-num" type="number" value="${d.K || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم کال دریافتی (Pc)</label><input id="cm-Pc" class="persian-num" type="number" value="${d.Pc || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم پوت پرداختی (Pp)</label><input id="cm-Pp" class="persian-num" type="number" value="${d.Pp || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" class="persian-num" type="number" value="${d.days || 0}" oninput="updateCalc()"></div>`;
    }
    document.getElementById('cm-title').textContent = title;
    document.getElementById('cm-subtitle').textContent = subtitle;
    document.getElementById('cm-inputs').innerHTML = inputs;
    updateCalc();
}

function updateCalc() {
    const g = id => { const el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; };
    const res = document.getElementById('cm-results');
    if (!res) return;
    
    let html = '', S, bep;
    const days = g('cm-days') || 1;
    let chartParams = {};

    if (_cmType === 'bcs') {
        S = g('cm-S'); const k1 = g('cm-k1'), k2 = g('cm-k2'), p1 = g('cm-p1'), p2 = g('cm-p2');
        const nd = p1 - p2, mp = k2 - k1 - nd; bep = k1 + nd; 
        const sm = S > 0 ? (S - bep) / S * 100 : NaN;
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه خالص</div><div class="cm-res-val persian-num" style="color:var(--tertiary)">${fN(nd)}</div></div>
                <div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val persian-num">${fN(mp)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(bep)}</div></div>
                <div class="cm-res ${sm > 0 ? 'hi' : sm < -5 ? 'neg' : ''}"><div class="cm-res-lbl">حاشیه امنیت</div><div class="cm-res-val persian-num" style="color:${sm > 0 ? 'var(--secondary)' : 'var(--error)'}">${f2(sm)}%</div></div>`;
        chartParams = {S, K1: k1, K2: k2, P1: p1, P2: p2, maxP: mp, maxL: -nd, BE: bep};
    } else if (_cmType === 'cc') {
        S = g('cm-S'); const K = g('cm-K'), P = g('cm-P');
        const mp = K - S + P; bep = S - P; 
        const tpct = S > 0 ? mp / S * 100 : NaN, mpct = days > 0 ? tpct / days * 30 : NaN, spct = S > 0 ? P / S * 100 : NaN;
        html = `<div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val persian-num">${fN(mp)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(bep)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">سود ماهانه %</div><div class="cm-res-val persian-num">${f2(mpct)}%</div></div>
                <div class="cm-res"><div class="cm-res-lbl">درصد پرمیوم</div><div class="cm-res-val persian-num" style="color:var(--tertiary)">${f2(spct)}%</div></div>`;
        chartParams = {S, K, P, maxP: mp, BE: bep};
    } else if (_cmType === 'collar') {
        S = g('cm-S'); const Kc = g('cm-Kc'), Kp = g('cm-Kp'), Pc = g('cm-Pc'), Pp = g('cm-Pp');
        const netP = Pc - Pp, mp = Kc - S + netP, ml = Kp - S + netP; bep = S - netP;
        html = `<div class="cm-res"><div class="cm-res-lbl">خالص پرمیوم</div><div class="cm-res-val persian-num" style="color:${netP >= 0 ? 'var(--secondary)' : 'var(--error)'}">${fN(netP)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val persian-num">${fN(mp)}</div></div>
                <div class="cm-res neg"><div class="cm-res-lbl">حداکثر ضرر</div><div class="cm-res-val persian-num">${fN(ml)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val persian-num" style="color:var(--primary)">${fN(bep)}</div></div>`;
        chartParams = {S, Kc, Kp, Pc, Pp, maxP: mp, maxL: ml, BE: bep};
    } else if (_cmType === 'conversion') {
        S = g('cm-S'); const K = g('cm-K'), Pc = g('cm-Pc'), Pp = g('cm-Pp'), days = g('cm-days');
        const netCost = S + Pp - Pc, profit = K - netCost, retPct = netCost > 0 ? profit / netCost * 100 : NaN;
        const annualPct = (days > 0 && !isNaN(retPct)) ? retPct / days * 365 : NaN;
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه خالص</div><div class="cm-res-val persian-num" style="color:var(--tertiary)">${fN(netCost)}</div></div>
                <div class="cm-res ${profit > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">سود قفل‌شده</div><div class="cm-res-val persian-num">${fN(profit)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">بازده کل %</div><div class="cm-res-val persian-num">${f2(retPct)}%</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">بازده سالانه %</div><div class="cm-res-val persian-num">${f2(annualPct)}%</div></div>`;
        chartParams = {S, K, Pc, Pp, maxP: profit, BE: netCost};
    }
    
    res.innerHTML = html;
    chartParams.days = days;
    drawPayoffChart(_cmType, chartParams);
}

/* ══ موتور Recharts-Style بر اساس ساختار bR (فاقد هرگونه لوپ بی‌نهایت) ══ */
const vR = (basePrice, stepRatio = 0.005) => {
    let points = [];
    for (let r = 0.5; r <= 1.5; r += stepRatio) {
        points.push(parseFloat((basePrice * r).toFixed(2)));
    }
    return points;
};

function calculatePositionProfit(price, strike, last, optType, ordType) {
    if (optType === null) return price - last; 
    if (optType === 1 && ordType === 'LONG') return price <= strike ? -last : (price - last - strike);
    if (optType === 1 && ordType === 'SHORT') return price <= strike ? last : -(price - last - strike);
    if (optType === 2 && ordType === 'LONG') return price <= strike ? (-price - last + strike) : -last;
    if (optType === 2 && ordType === 'SHORT') return price <= strike ? -(-price - last + strike) : last;
    return 0;
}

const findBreakEvens = (data) => {
    if (!data || data.length === 0) return [];
    const breakEvens = [];
    for (let i = 0; i < data.length - 1; i++) {
        const cur = data[i];
        const nxt = data[i + 1];
        if (cur.profit * nxt.profit <= 0 && cur.profit !== nxt.profit) {
            const slope = (nxt.profit - cur.profit) / (nxt.price - cur.price);
            if (slope !== 0) {
                const zeroPrice = cur.price + (0 - cur.profit) / slope;
                breakEvens.push(zeroPrice);
            }
        }
    }
    return breakEvens;
};


function drawPayoffChart(type, p) {
    const svg = document.getElementById('cm-chart');
    if (!svg) return;
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const cGreen = '#22c55e', cRed = '#ef4444', cBlue = '#3b82f6';
    const cGrid = isDark ? 'rgba(51, 65, 85, 0.6)' : '#e2e8f0';
    const cZero = isDark ? '#ffffff' : '#0f172a';
    const cText = isDark ? '#94a3b8' : '#64748b';

    // تنظیم ابعاد استاندارد با حاشیه امن کافی
    const w = 620, h = 290;
    const xPadLeft = 95, yPadTop = 35, chartW = 490, chartH = 205;
    const bottomY = yPadTop + chartH;

    const basePrice = p.S || 1000;
    const positions = [];
    let totalInvestment = 0;

    if (type === 'bcs') {
        positions.push({ strike: p.K1, last: p.P1, optType: 1, ordType: 'LONG' });
        positions.push({ strike: p.K2, last: p.P2, optType: 1, ordType: 'SHORT' });
        totalInvestment = (p.P1 - p.P2) * 1000;
    } else if (type === 'cc') {
        positions.push({ strike: 0, last: p.S, optType: null, ordType: 'LONG' });
        positions.push({ strike: p.K, last: p.P, optType: 1, ordType: 'SHORT' });
        totalInvestment = p.S * 1000;
    } else if (type === 'collar') {
        positions.push({ strike: 0, last: p.S, optType: null, ordType: 'LONG' });
        positions.push({ strike: p.Kp, last: p.Pp, optType: 2, ordType: 'LONG' });
        positions.push({ strike: p.Kc, last: p.Pc, optType: 1, ordType: 'SHORT' });
        totalInvestment = (p.S + p.Pp - p.Pc) * 1000;
    } else if (type === 'conversion') {
        positions.push({ strike: 0, last: p.S, optType: null, ordType: 'LONG' });
        positions.push({ strike: p.K, last: p.Pp, optType: 2, ordType: 'LONG' });
        positions.push({ strike: p.K, last: p.Pc, optType: 1, ordType: 'SHORT' });
        totalInvestment = (p.S + p.Pp - p.Pc) * 1000;
    }

    const pricePoints = vR(basePrice, 0.005);
    const data = pricePoints.map(price => {
        const profit = positions.reduce((sum, pos) => sum + calculatePositionProfit(price, pos.strike, pos.last, pos.optType, pos.ordType) * 1000, 0);
        return { price, profit };
    });

    const breakEvenPoints = findBreakEvens(data);
    if (breakEvenPoints.length === 0 && p.BE) breakEvenPoints.push(p.BE);

    let minProfit = Infinity, maxProfit = -Infinity;
    data.forEach(d => {
        if (d.profit < minProfit) minProfit = d.profit;
        if (d.profit > maxProfit) maxProfit = d.profit;
    });

    let yDomainMax = Math.max(Math.abs(minProfit), Math.abs(maxProfit)) * 1.25;
    if (yDomainMax === 0) yDomainMax = 1000;
    const yDomainMin = -yDomainMax;

    const minDomainPrice = pricePoints[0];
    const maxDomainPrice = pricePoints[pricePoints.length - 1];

    const scaleX = pr => xPadLeft + ((pr - minDomainPrice) / (maxDomainPrice - minDomainPrice)) * chartW;
    const scaleY = pf => bottomY - ((pf - yDomainMin) / (yDomainMax - yDomainMin)) * chartH;
    const zeroY = scaleY(0);

    // خطوط گرید افقی با تصحیح تراز ارقام و جهت منفی
    let gridLines = '';
    const ticksCount = 6;
    for (let i = 0; i <= ticksCount; i++) {
        const pf = yDomainMin + i * ((yDomainMax - yDomainMin) / ticksCount);
        const yPos = scaleY(pf);
        const isNeg = pf < -1;
        const formattedVal = (isNeg ? '-' : '') + toFaDigit(Math.abs(Math.round(pf)).toLocaleString('en-US'));
        
        gridLines += `
            <line stroke="${cGrid}" stroke-dasharray="3 3" x1="${xPadLeft}" y1="${yPos}" x2="${xPadLeft + chartW}" y2="${yPos}"></line>
            <text x="${xPadLeft - 10}" y="${yPos + 4}" fill="${cText}" font-size="11" font-weight="600" text-anchor="start" direction="ltr">${formattedVal}</text>
        `;
    }

    let pathD = '';
    data.forEach((pt, idx) => pathD += (idx === 0 ? `M ${scaleX(pt.price)},${scaleY(pt.profit)}` : ` L ${scaleX(pt.price)},${scaleY(pt.profit)}`));

    // پلی‌گان سبز سود
    let posPoly = `${scaleX(data[0].price)},${zeroY} `;
    data.forEach(pt => { posPoly += `${scaleX(pt.price)},${pt.profit >= 0 ? scaleY(pt.profit) : zeroY} `; });
    posPoly += `${scaleX(data[data.length - 1].price)},${zeroY}`;

    // پلی‌گان قرمز زیان
    let negPoly = `${scaleX(data[0].price)},${zeroY} `;
    data.forEach(pt => { negPoly += `${scaleX(pt.price)},${pt.profit < 0 ? scaleY(pt.profit) : zeroY} `; });
    negPoly += `${scaleX(data[data.length - 1].price)},${zeroY}`;

    // خطوط عمودی مرجع
    let beLinesHtml = '';
    breakEvenPoints.forEach(be => {
        const beX = scaleX(be);
        if (beX >= xPadLeft && beX <= xPadLeft + chartW) {
            beLinesHtml += `
                <line x1="${beX}" y1="${yPadTop}" x2="${beX}" y2="${bottomY}" stroke="${cRed}" stroke-dasharray="4 4" stroke-width="1.8"></line>
                <text x="${beX}" y="${yPadTop - 12}" fill="${cRed}" font-size="12" font-weight="800" text-anchor="middle">سر به سر ${fN(be)}</text>
            `;
        }
    });

    const spotX = p.S ? scaleX(p.S) : null;
    let spotLineHtml = '';
    if (spotX && spotX >= xPadLeft && spotX <= xPadLeft + chartW) {
        // قرار دادن متن قیمت پایانی درون نمودار بالای خط محور X تا با اعداد محور تداخل پیدا نکند
        spotLineHtml = `
            <line x1="${spotX}" y1="${yPadTop}" x2="${spotX}" y2="${bottomY}" stroke="${cBlue}" stroke-dasharray="4 4" stroke-width="1.8"></line>
            <text x="${spotX}" y="${bottomY - 10}" fill="${cBlue}" font-size="12" font-weight="800" text-anchor="middle">قیمت پایانی ${fN(p.S)}</text>
        `;
    }

    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `
        <defs>
            <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#22c55e" stop-opacity="0.75"/>
                <stop offset="100%" stop-color="${isDark ? '#131b2e' : '#ffffff'}" stop-opacity="0.05"/>
            </linearGradient>
            <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${isDark ? '#131b2e' : '#ffffff'}" stop-opacity="0.05"/>
                <stop offset="100%" stop-color="#ef4444" stop-opacity="0.75"/>
            </linearGradient>
        </defs>

        <g>${gridLines}</g>
        
        <!-- خط مبنای صفر -->
        <line x1="${xPadLeft}" y1="${zeroY}" x2="${xPadLeft + chartW}" y2="${zeroY}" stroke="${cZero}" stroke-width="2"></line>

        <!-- سطوح گرادیانت -->
        <polygon points="${posPoly}" fill="url(#positiveGradient)"></polygon>
        <polygon points="${negPoly}" fill="url(#negativeGradient)"></polygon>

        <!-- خط اصلی بازدهی -->
        <path d="${pathD}" fill="none" stroke="${cGreen}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>

        <!-- خطوط راهنما -->
        ${beLinesHtml}
        ${spotLineHtml}

        <!-- محور افقی قیمت سهم پایه -->
        <line x1="${xPadLeft}" y1="${bottomY}" x2="${xPadLeft + chartW}" y2="${bottomY}" stroke="${cGrid}" stroke-width="1.5"></line>
        <text x="${xPadLeft}" y="${bottomY + 22}" fill="${cText}" font-size="11.5" font-weight="600" text-anchor="middle">${fN(minDomainPrice)}</text>
        <text x="${xPadLeft + chartW * 0.5}" y="${bottomY + 22}" fill="${cText}" font-size="11.5" font-weight="600" text-anchor="middle">${fN((minDomainPrice + maxDomainPrice) / 2)}</text>
        <text x="${xPadLeft + chartW}" y="${bottomY + 22}" fill="${cText}" font-size="11.5" font-weight="600" text-anchor="middle">${fN(maxDomainPrice)}</text>
    `;

    currentChartData = data.map(d => {
        let sudeZiyan = totalInvestment !== 0 ? (d.profit / Math.abs(totalInvestment)) * 100 : 0;
        let bahrehSalaneh = sudeZiyan * (365 / Math.max(p.days || 1, 1));
        return { ...d, sudeZiyan, bahrehSalaneh, sx: scaleX(d.price) };
    });
}

/* ══ TOOLTIP HOVER LISTENER ══ */
document.addEventListener('mousemove', function(e) {
    const svg = document.getElementById('cm-chart');
    const tt = document.getElementById('cm-tooltip');
    if (!svg || !tt || !currentChartData || currentChartData.length === 0) return;

    const rect = svg.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const scale = 620 / rect.width;
        const mouseX = (e.clientX - rect.left) * scale;
        
        let closest = currentChartData[0];
        let minDist = Math.abs(mouseX - closest.sx);
        for(let i = 1; i < currentChartData.length; i++) {
            let d = Math.abs(mouseX - currentChartData[i].sx);
            if(d < minDist) { minDist = d; closest = currentChartData[i]; }
        }

        const isProfitable = closest.profit >= 0;
        const colorClass = isProfitable ? 'tt-green' : 'tt-red';
        const sign = isProfitable ? 'سود' : 'زیان';

        tt.innerHTML = `
            <div class="tt-row"><span class="tt-lbl">قیمت فرضی:</span><span class="tt-val persian-num">${fN(closest.price)}</span></div>
            <div class="tt-row"><span class="tt-lbl">${sign} نقدی:</span><span class="tt-val persian-num ${colorClass}">${fN(Math.abs(closest.profit))}</span></div>
            <div class="tt-row"><span class="tt-lbl">درصد ${sign}:</span><span class="tt-val persian-num ${colorClass}">%${f2(Math.abs(closest.sudeZiyan))}</span></div>
            <div class="tt-row"><span class="tt-lbl">بهره سالانه:</span><span class="tt-val persian-num ${colorClass}">%${f2(Math.abs(closest.bahrehSalaneh))}</span></div>
        `;
        
        tt.style.left = (e.clientX + 16) + 'px';
        tt.style.top = (e.clientY + 16) + 'px';
        tt.classList.add('visible');
    } else {
        tt.classList.remove('visible');
    }
});

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
        if(el) el.textContent = toFaDigit(cdSec);
        updateCircle((cdSec/60)*100);
        
        const ta = document.getElementById('time-ago');
        if(ta && window.lastUpdateTs) ta.textContent = timeAgo(window.lastUpdateTs);

        if (cdSec <= 0) { cdSec = 60; loadLiveData(false); }
    }, 1000);
}

document.addEventListener('DOMContentLoaded', () => { 
    if(!document.getElementById('cm-tooltip')) {
        const tt = document.createElement('div');
        tt.id = 'cm-tooltip';
        tt.className = 'chart-tooltip';
        document.body.appendChild(tt);
    }
    document.getElementById('dash').style.display = 'block';
    loadLiveData(false); 
    startCD(); 
});

/* ══ ماشین‌حساب‌های دستی درون‌صفحه‌ای ══ */
function calcManual() {
    const g = id => parseFloat(document.getElementById(id).value) || 0;
    const p1 = g('ci-p1'), k1 = g('ci-k1'), p2 = g('ci-p2'), k2 = g('ci-k2'), s = g('ci-s'), ep1 = g('ci-ep1'), ep2 = g('ci-ep2');
    const errEl = document.getElementById('calc-err'), posEl = document.getElementById('pos-section');
    const setV = (id, val, cls) => { const el = document.getElementById(id); el.textContent = val; if (cls) el.className = 'co-val persian-num ' + cls; };
    const reset = () => { ['co-debit', 'co-profit', 'co-loss', 'co-rr', 'co-ret', 'co-be', 'co-safety', 'co-open-ret', 'co-pnl', 'co-now-ret', 'co-coverage'].forEach(id => document.getElementById(id).textContent = '—'); posEl.style.display = 'none'; };
    
    if (!p1 || !k1 || !p2 || !k2) { reset(); errEl.style.display = 'none'; return; }
    if (k2 <= k1) { reset(); errEl.textContent = '⚠ K₂ باید از K₁ بزرگ‌تر باشد'; errEl.style.display = 'block'; return; }
    if (p1 <= p2) { reset(); errEl.textContent = '⚠ P₁ باید از P₂ بزرگ‌تر باشد'; errEl.style.display = 'block'; return; }
    
    errEl.style.display = 'none';
    const nd = p1 - p2, ks = k2 - k1, mp = ks - nd, ml = nd, be = k1 + nd, rr = mp / nd, ret = rr * 100, safety = s > 0 ? (k1 - s) / s * 100 : null;
    
    if (mp <= 0) { reset(); errEl.textContent = '⚠ Max Profit منفی است'; errEl.style.display = 'block'; setV('co-debit', fN(nd), 'v-amber'); setV('co-loss', fN(ml), 'v-rose'); return; }
    
    setV('co-debit', fN(nd), 'v-amber'); setV('co-profit', fN(mp), 'v-teal'); setV('co-loss', fN(ml), 'v-rose');
    setV('co-rr', toFaDigit(f2(rr)) + 'x', rr >= 2 ? 'v-teal' : rr >= 1 ? 'v-blue' : 'v-rose');
    document.getElementById('co-ret').textContent = f2(ret) + '%'; document.getElementById('co-be').textContent = fN(be);
    if (safety !== null) setV('co-safety', (safety > 0 ? '+' : '') + f2(safety) + '%', safety < 0 ? 'v-teal' : safety < 5 ? 'v-amber' : 'v-rose');
    else document.getElementById('co-safety').textContent = '—';
    
    if (ep1 > 0 && ep2 > 0) {
        posEl.style.display = 'block';
        const od = ep1 - ep2, omp = ks - od, oret = od > 0 && omp > 0 ? omp / od * 100 : null;
        const cn = p1 - p2, pnl = cn - od, nr = od > 0 ? pnl / od * 100 : null, cov = omp > 0 ? pnl / omp * 100 : null;
        setV('co-open-ret', oret != null ? f2(oret) + '%' : '⚠', oret != null && oret >= 0 ? 'v-blue' : 'v-rose');
        setV('co-pnl', (pnl >= 0 ? '+' : '') + fN(pnl), pnl >= 0 ? 'v-teal' : 'v-rose');
        setV('co-now-ret', nr != null ? (nr >= 0 ? '+' : '') + f2(nr) + '%' : '—', nr != null ? (nr >= 0 ? 'v-teal' : 'v-rose') : '');
        setV('co-coverage', cov != null ? f2(cov) + '%' : '—', cov != null ? (cov >= 50 ? 'v-teal' : cov >= 0 ? 'v-amber' : 'v-rose') : '');
    } else { posEl.style.display = 'none'; }
}

function calcCCOffset() {
    const g = id => parseFloat(document.getElementById(id).value) || 0;
    const s0 = g('cco-s0'), snow = g('cco-snow'), psold = g('cco-psold'), pnow = g('cco-pnow');
    const errEl = document.getElementById('cco-err'), bd = document.getElementById('cco-bd');
    const setV = (id, val, cls) => { const el = document.getElementById(id); el.textContent = val; if (cls) el.className = 'co-val persian-num ' + cls; };
    const resetOut = () => { ['cco-orig', 'cco-now', 'cco-cov'].forEach(id => { document.getElementById(id).textContent = '—'; document.getElementById(id).className = 'co-val'; }); bd.style.display = 'none'; };
    
    if (!s0 || !psold) { resetOut(); errEl.style.display = 'none'; return; }
    if (psold >= s0) { resetOut(); errEl.textContent = '⚠ پریمیوم فروش نباید از قیمت خرید سهم بیشتر باشد'; errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';
    
    const cb = s0 - psold, origRet = psold / cb * 100;
    setV('cco-orig', (origRet >= 0 ? '+' : '') + f2(origRet) + '%', 'v-blue');
    
    if (!snow && !pnow) return;
    const sPnL = snow - s0, oPnL = psold - pnow, tPnL = sPnL + oPnL;
    const nowRet = tPnL / cb * 100, cov = psold > 0 ? tPnL / psold * 100 : 0;
    setV('cco-now', (nowRet >= 0 ? '+' : '') + f2(nowRet) + '%', nowRet >= 0 ? 'v-teal' : 'v-rose');
    setV('cco-cov', (cov >= 0 ? '+' : '') + f2(cov) + '%', cov >= 100 ? 'v-teal' : cov >= 50 ? 'v-amber' : cov >= 0 ? 'v-amber' : 'v-rose');
    
    bd.style.display = 'flex';
    const sp = document.getElementById('cco-s-pnl'), op = document.getElementById('cco-o-pnl'), tp = document.getElementById('cco-t-pnl');
    sp.textContent = (sPnL >= 0 ? '+' : '') + fN(sPnL); sp.style.color = sPnL >= 0 ? 'var(--secondary)' : 'var(--error)';
    op.textContent = (oPnL >= 0 ? '+' : '') + fN(oPnL); op.style.color = oPnL >= 0 ? 'var(--secondary)' : 'var(--error)';
    tp.textContent = (tPnL >= 0 ? '+' : '') + fN(tPnL); tp.style.color = tPnL >= 0 ? 'var(--secondary)' : 'var(--error)';
}