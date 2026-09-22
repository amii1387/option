/* ══ GLOBAL STATE ══ */
let strats = { bcs: [], cc: [], collar: [], conversion: [] };
let filteredStrats = [], filteredCC = [], filteredCollar = [], filteredConversion = [];
let cdSec = 60, cdInt = null, _cmType = null;

/* ══ UTILS & FORMATTERS ══ */
function showAlert(m) { const el = document.getElementById('alrt'); if(el){ el.textContent = '⚠ ' + m; el.style.display = 'block'; } }
function hideAlert() { const el = document.getElementById('alrt'); if(el) el.style.display = 'none'; }
function esc(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// فرمت‌کننده‌های ایمن (Safe Formatters)
const fN = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-US');
const f2 = n => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(2);
const fVol = v => {
    if (!v) return '<span style="color:var(--dim);font-size:10px">—</span>';
    if (v >= 1e9) return '<span class="tg">' + (v / 1e9).toFixed(1) + 'B</span>';
    if (v >= 1e6) return '<span class="ty">' + (v / 1e6).toFixed(1) + 'M</span>';
    return (v / 1e3).toFixed(0) + 'K';
};

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
    document.getElementById('page-bcs').classList.toggle('active', tab === 'bcs');
    document.getElementById('page-cc').classList.toggle('active', tab === 'cc');
    document.getElementById('page-collar').classList.toggle('active', tab === 'collar');
    document.getElementById('page-conversion').classList.toggle('active', tab === 'conversion');
}

/* ══ LIVE DATA LOADER ══ */
async function loadLiveData(manual = false) {
    try {
        if(manual) {
            updateLiveStatus(-1, 'در حال بروزرسانی...');
        }
        
        const r = await fetch('api/options.php?t=' + Date.now());

        if (r.status === 503) {
            const err = await r.json().catch(() => ({}));
            updateLiveStatus(-1, err.message || 'داده هنوز آماده نیست');
            setTimeout(() => loadLiveData(false), (err.retry_in || 5) * 1000);
            return;
        }

        if (!r.ok) {
            updateLiveStatus(-1, 'خطا در ارتباط با سرور (HTTP ' + r.status + ')');
            return;
        }

        const payload = await r.json();
        
        strats.bcs = payload.data.bcs || [];
        strats.cc = payload.data.cc || [];
        strats.collar = payload.data.collar || [];
        strats.conversion = payload.data.conversion || [];

        updateStats(strats.bcs); updateFilters(strats.bcs, 'fu', 'fe'); render();
        updateCCStats(strats.cc); updateFilters(strats.cc, 'cc-fu', 'cc-fe'); renderCC();
        updateCollarStats(strats.collar); updateFilters(strats.collar, 'col-fu', 'col-fe'); renderCollar();
        updateConversionStats(strats.conversion); updateFilters(strats.conversion, 'cv-fu', 'cv-fe'); renderConversion();

        const age = Math.round(Date.now() / 1000 - (payload.meta.updated_ts || 0));
        updateLiveStatus(age, '');
        document.getElementById('lupd').textContent = payload.meta.updated_at || '—';

        if (payload.meta.stale || age > 300) {
            showAlert('⚠ داده از ' + Math.round(age / 60) + ' دقیقه پیش بروز شده — Collector متوقف است');
        } else {
            hideAlert();
        }

    } catch (e) {
        updateLiveStatus(-1, 'عدم اتصال: ' + e.message);
    }
}

function updateLiveStatus(ageSec, msg) {
    const el = document.getElementById('live-status'), dot = document.getElementById('live-dot');
    if (!el) return;
    if (msg) {
        el.innerHTML = msg; el.style.color = 'var(--rose)';
        if (dot) { dot.style.background = 'var(--rose)'; dot.style.boxShadow = '0 0 8px var(--rose)'; }
        return;
    }
    if (ageSec < 0) {
        el.innerHTML = 'در انتظار داده...'; el.style.color = 'var(--muted)';
        if (dot) { dot.style.background = 'var(--amber)'; dot.style.boxShadow = '0 0 8px var(--amber)'; }
    } else if (ageSec < 90) {
        el.innerHTML = '● داده زنده — آخرین بروزرسانی ' + ageSec + ' ثانیه پیش'; el.style.color = 'var(--teal)';
        if (dot) { dot.style.background = 'var(--teal)'; dot.style.boxShadow = '0 0 8px var(--teal)'; }
    } else if (ageSec < 300) {
        el.innerHTML = '⚠ داده تا ' + Math.round(ageSec / 60) + ' دقیقه پیش بروز شده'; el.style.color = 'var(--amber)';
        if (dot) { dot.style.background = 'var(--amber)'; dot.style.boxShadow = '0 0 8px var(--amber)'; }
    } else {
        el.innerHTML = '⚠ داده قدیمی (' + Math.round(ageSec / 60) + ' دقیقه) — Collector متوقف است'; el.style.color = 'var(--rose)';
        if (dot) { dot.style.background = 'var(--rose)'; dot.style.boxShadow = '0 0 8px var(--rose)'; }
    }
}

function manRefresh() { cdSec = 60; loadLiveData(true); }

/* ══ GENERIC FILTER UPDATER ══ */
function updateFilters(d, idU, idE) {
    const und = [...new Set(d.map(s => s.underlying))].sort();
    const exp = [...new Set(d.map(s => s.expiry))].sort();
    const setOptions = (id, arr) => {
        const el = document.getElementById(id);
        if(!el) return;
        const cur = el.value;
        el.innerHTML = '<option value="">همه</option>' + arr.map(v => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
    };
    setOptions(idU, und);
    setOptions(idE, exp);
}

/* ══ BCS RENDER ══ */
function updateStats(d) {
    document.getElementById('st').textContent = d.length;
    document.getElementById('su').textContent = new Set(d.map(s => s.underlying)).size;
    document.getElementById('se').textContent = new Set(d.map(s => s.expiry)).size;
    document.getElementById('tab-badge-bcs').textContent = d.length;
}

function checkGold(s) {
    const sv = document.getElementById('gf-safety').value, wv = document.getElementById('gf-worst').value;
    const rv = document.getElementById('gf-ret').value, v1v = document.getElementById('gf-v1').value, v2v = document.getElementById('gf-v2').value;
    const st = document.getElementById('gf-status').value;
    if (sv !== '' && (s.safetyMargin == null || s.safetyMargin < parseFloat(sv))) return false;
    if (wv !== '' && (s.retWorst == null || s.retWorst < parseFloat(wv))) return false;
    if (rv !== '' && s.returnPct < parseFloat(rv)) return false;
    if (v1v !== '' && s.v1 < parseFloat(v1v) * 1e9) return false;
    if (v2v !== '' && s.v2 < parseFloat(v2v) * 1e9) return false;
    if (st && (s.k1 < s.uprice * .97 ? 'ITM' : s.k1 <= s.uprice * 1.03 ? 'ATM' : 'OTM') !== st) return false;
    return true;
}

function render() {
    const fU = document.getElementById('fu').value, fE = document.getElementById('fe').value;
    const fV = (parseFloat(document.getElementById('fvol').value) || 0) * 1e9, fS = document.getElementById('fs').value;
    
    let list = strats.bcs.filter(s => (!fU || s.underlying === fU) && (!fE || s.expiry === fE) && s.v1 >= fV && s.v2 >= fV);
    const withGold = list.map(s => Object.assign({}, s, { _gold: checkGold(s) }));
    const goldCount = withGold.filter(s => s._gold).length;
    
    document.getElementById('gfp-count').textContent = goldCount + ' قرارداد طلایی';
    document.getElementById('gold-count-stat').textContent = goldCount;
    
    if (fS === 'gold') withGold.sort((a, b) => (b._gold ? 1 : 0) - (a._gold ? 1 : 0) || ((b.safetyMargin != null ? b.safetyMargin : -999) - (a.safetyMargin != null ? a.safetyMargin : -999)));
    else if (fS === 'profit') withGold.sort((a, b) => (b.safetyMargin != null ? b.safetyMargin : -999) - (a.safetyMargin != null ? a.safetyMargin : -999));
    else if (fS === 'loss') withGold.sort((a, b) => a.maxLoss - b.maxLoss);
    else if (fS === 'debit') withGold.sort((a, b) => a.netDebit - b.netDebit);
    else if (fS === 'ret') withGold.sort((a, b) => b.returnPct - a.returnPct);
    else if (fS === 'atm') withGold.sort((a, b) => Math.abs(a.safetyMargin != null ? a.safetyMargin : 999) - Math.abs(b.safetyMargin != null ? b.safetyMargin : 999));
    else if (fS === 'days') withGold.sort((a, b) => a.days - b.days);
    
    filteredStrats = withGold;
    const tb = document.getElementById('tb'), emp = document.getElementById('emp');
    document.getElementById('tcnt').textContent = withGold.length + ' استراتژی';
    document.getElementById('einfo').textContent = withGold.length + ' آماده export';
    
    if (!withGold.length) { tb.innerHTML = ''; emp.style.display = 'block'; return; } 
    emp.style.display = 'none';

    tb.innerHTML = withGold.map((s, i) => {
        const goldBadge = s._gold ? '<span class="badge badge-gold">⭐</span>' : '';
        const st = s.k1 < s.uprice * .97 ? 'ITM' : s.k1 <= s.uprice * 1.03 ? 'ATM' : 'OTM';
        const mn = s.uprice > 0 ? (st === 'ITM' ? '<span class="badge badge-teal">ITM</span>' : st === 'ATM' ? '<span class="badge badge-amber">ATM</span>' : '<span class="badge badge-rose">OTM</span>') : '—';
        const sd = s.safetyMargin != null ? `<span class="tn ${s.safetyMargin > 0 ? 'tg' : s.safetyMargin > -5 ? 'ty' : 'tr'}">${s.safetyMargin > 0 ? '+' : ''}${f2(s.safetyMargin)}%</span>` : '—';
        const ud = s.uprice > 0 ? `<span class="tn" style="color:var(--muted)">${fN(s.uprice)}</span>` : '—';
        const bcsD = encodeURIComponent(JSON.stringify({ t: 'bcs', u: s.underlying, S: s.uprice, k1: s.k1, k2: s.k2, p1: s.p1, p2: s.p2, exp: s.expiry, days: s.days }));
        
        return `<tr class="${s._gold ? 'is-gold' : ''}">
            <td style="text-align:center;padding:6px 4px"><button class="calc-btn" onclick="openCalc('${bcsD}')">🧮</button></td>
            <td style="color:var(--dim);font-size:10px">${i + 1}</td>
            <td class="tu">${esc(s.underlying)}${goldBadge}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(s.expiry)}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${s.days || '—'}</td>
            <td>${ud}</td>
            <td class="tn tg"><span style="display:block;font-size:9px;color:var(--dim);font-weight:400">${esc(s.sym1)}</span>${fN(s.k1)}</td>
            <td class="tn tr"><span style="display:block;font-size:9px;color:var(--dim);font-weight:400">${esc(s.sym2)}</span>${fN(s.k2)}</td>
            <td class="tn">${fN(s.p1)}</td>
            <td class="tn">${fN(s.p2)}</td>
            <td class="tn">${fN(s.breakeven)}</td>
            <td>${sd}</td>
            <td>${s.retWorst != null ? `<span class="ts">${f2(s.retWorst)}%</span>` : '—'}</td>
            <td><span class="ts">${f2(s.returnPct)}%</span></td>
            <td>${s.retBest != null ? `<span class="ts">${f2(s.retBest)}%</span>` : '—'}</td>
            <td>${mn}</td>
            <td>${fVol(s.v1)}</td>
            <td>${fVol(s.v2)}</td>
        </tr>`;
    }).join('');
}

/* ══ CC RENDER ══ */
function updateCCStats(d) {
    document.getElementById('cc-st').textContent = d.length;
    document.getElementById('cc-sb').textContent = d.length ? Math.max(...d.map(o => o.mpct)).toFixed(2) + '%' : '—';
    document.getElementById('cc-sa').textContent = d.length ? Math.max(...d.map(o => o.spct)).toFixed(2) + '%' : '—';
    document.getElementById('tab-badge-cc').textContent = d.length;
}

function renderCC() {
    const fU = document.getElementById('cc-fu').value, fE = document.getElementById('cc-fe').value, fSt = document.getElementById('cc-fst').value;
    const fM = parseFloat(document.getElementById('cc-fminm').value) || 0, fV = (parseFloat(document.getElementById('cc-fvol').value) || 0) * 1e9, fS = document.getElementById('cc-fs').value;
    const gfM = parseFloat(document.getElementById('ccgf-monthly').value), gfT = parseFloat(document.getElementById('ccgf-total').value), gfS = parseFloat(document.getElementById('ccgf-safety').value), gfV = (parseFloat(document.getElementById('ccgf-vol').value) || 0) * 1e9, gfSt = document.getElementById('ccgf-status').value || '';
    
    let list = strats.cc.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE) && (!fSt || o.status === fSt) && o.mpct >= fM && o.volume >= fV);
    list = list.map(o => Object.assign({}, o, { _gold: (!isNaN(gfM) && o.mpct < gfM) || (!isNaN(gfT) && o.tpct < gfT) || (!isNaN(gfS) && o.spct < gfS) || (gfV > 0 && o.volume < gfV) || (gfSt && o.status !== gfSt) ? false : true }));
    
    if (fS === 'monthly') list.sort((a, b) => b.mpct - a.mpct);
    else if (fS === 'total') list.sort((a, b) => b.tpct - a.tpct);
    else if (fS === 'safety') list.sort((a, b) => b.spct - a.spct);
    else if (fS === 'volume') list.sort((a, b) => b.volume - a.volume);
    else if (fS === 'days') list.sort((a, b) => a.days - b.days);
    
    filteredCC = list;
    const goldCount = list.filter(o => o._gold).length;
    document.getElementById('cc-gfp-count').textContent = goldCount + ' فرصت طلایی';
    document.getElementById('cc-gold-stat').textContent = goldCount;
    
    const tb = document.getElementById('cc-tb'), emp = document.getElementById('cc-emp');
    document.getElementById('cc-tcnt').textContent = list.length + ' فرصت';
    document.getElementById('cc-einfo').textContent = list.length + ' آماده export';
    
    if (!list.length) { tb.innerHTML = ''; emp.style.display = 'block'; return; }
    emp.style.display = 'none';

    tb.innerHTML = list.map((o, i) => {
        const stBadge = o.status === 'OTM' ? '<span class="badge badge-rose">OTM</span>' : o.status === 'ATM' ? '<span class="badge badge-amber">ATM</span>' : '<span class="badge badge-teal">ITM</span>';
        const ccD = encodeURIComponent(JSON.stringify({ t: 'cc', sym: o.symRaw, u: o.underlying, S: o.uprice, K: o.strike, P: o.premium, days: o.days, exp: o.expiry }));
        return `<tr class="${o._gold ? 'is-gold' : ''}">
            <td style="text-align:center;padding:6px 4px"><button class="calc-btn" onclick="openCalc('${ccD}')">🧮</button></td>
            <td style="color:var(--dim);font-size:10px">${i + 1}</td>
            <td class="tu" style="font-size:12px">${esc(o.symRaw)}${o._gold ? '<span class="badge-gold" style="margin-right:4px">⭐</span>' : ''}</td>
            <td style="color:var(--blue);font-size:11px;font-weight:600">${esc(o.underlying)}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(o.expiry)}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${o.days || '—'}</td>
            <td class="tn" style="color:var(--muted)">${fN(o.uprice)}</td>
            <td class="tn tg">${fN(o.strike)}</td>
            <td class="tn">${fN(o.premium)}</td>
            <td>${fVol(o.volume)}</td>
            <td><span class="tn ${o.tpct >= 15 ? 'tg' : o.tpct >= 8 ? 'ty' : ''}">${f2(o.tpct)}%</span></td>
            <td><span class="tn ${o.mpct >= 5 ? 'tg' : o.mpct >= 2.5 ? 'ty' : ''}" style="font-size:13px;font-weight:700">${f2(o.mpct)}%</span></td>
            <td><span class="tn">${fN(o.breakeven)}</span> <span class="${o.spct >= 10 ? 'tg' : o.spct >= 5 ? 'ty' : 'tr'}" style="font-size:10px">(${f2(o.spct)}%)</span></td>
            <td><span class="tn">${fN(o.strike)}</span> <span class="${o.mpStartPct <= 0 ? 'tg' : o.mpStartPct <= 5 ? 'ty' : 'tr'}" style="font-size:10px">(${o.mpStartPct >= 0 ? '+' : ''}${f2(o.mpStartPct)}%)</span></td>
            <td>${stBadge}</td>
        </tr>`;
    }).join('');
}

/* ══ COLLAR RENDER ══ */
function updateCollarStats(d) {
    document.getElementById('col-st').textContent = d.length;
    document.getElementById('col-sbp').textContent = d.length ? Math.max(...d.map(o => o.profitPct)).toFixed(2) + '%' : '—';
    const bestLoss = d.length ? Math.max(...d.map(o => o.lossPct)) : null;
    document.getElementById('col-sbl').textContent = bestLoss != null ? (bestLoss >= 0 ? '+' : '') + bestLoss.toFixed(2) + '%' : '—';
    document.getElementById('col-su').textContent = new Set(d.map(o => o.underlying)).size;
    document.getElementById('tab-badge-collar').textContent = d.length;
}

function checkGoldCollar(o) {
    const pv = document.getElementById('col-gf-profit').value, lv = document.getElementById('col-gf-loss').value;
    const vv = document.getElementById('col-gf-vol').value, liv = document.getElementById('col-gf-live').value;
    if (pv !== '' && o.profitPct < parseFloat(pv)) return false;
    if (lv !== '' && o.lossPct < parseFloat(lv)) return false;
    if (vv !== '' && (o.callVol < parseFloat(vv) * 1e9 || o.putVol < parseFloat(vv) * 1e9)) return false;
    if (liv !== '' && Math.abs(o.livePnLPct) > parseFloat(liv)) return false;
    return true;
}

function renderCollar() {
    const fU = document.getElementById('col-fu').value, fE = document.getElementById('col-fe').value;
    const fMP = parseFloat(document.getElementById('col-fmp').value) || 0, fML = parseFloat(document.getElementById('col-fml').value);
    const fVC = (parseFloat(document.getElementById('col-fvc').value) || 0) * 1e9, fVP = (parseFloat(document.getElementById('col-fvp').value) || 0) * 1e9;
    const fS = document.getElementById('col-fs').value, maxLossPct = isNaN(fML) ? -Infinity : fML;
    
    let list = strats.collar.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE) && o.profitPct >= fMP && o.lossPct >= maxLossPct && o.callVol >= fVC && o.putVol >= fVP);
    list = list.map(o => Object.assign({}, o, { _gold: checkGoldCollar(o) }));
    
    const colGoldCount = list.filter(o => o._gold).length;
    document.getElementById('col-gfp-count').textContent = colGoldCount + ' ترکیب طلایی';
    
    if (fS === 'gold') list.sort((a, b) => (b._gold ? 1 : 0) - (a._gold ? 1 : 0) || (b.profitPct - a.profitPct));
    else if (fS === 'profit') list.sort((a, b) => b.profitPct - a.profitPct);
    else if (fS === 'loss') list.sort((a, b) => b.lossPct - a.lossPct);
    else if (fS === 'net') list.sort((a, b) => b.netP - a.netP);
    else if (fS === 'live') list.sort((a, b) => b.livePnLPct - a.livePnLPct);
    else if (fS === 'days') list.sort((a, b) => a.days - b.days);
    
    filteredCollar = list;
    const tb = document.getElementById('col-tb'), emp = document.getElementById('col-emp');
    document.getElementById('col-tcnt').textContent = list.length + ' ترکیب';
    document.getElementById('col-einfo').textContent = list.length + ' آماده export';
    
    if (!list.length) { tb.innerHTML = ''; emp.style.display = 'block'; return; }
    emp.style.display = 'none';

    tb.innerHTML = list.map((o, i) => {
        const colD = encodeURIComponent(JSON.stringify({ t: 'collar', u: o.underlying, S: o.uprice, Kc: o.Kc, Kp: o.Kp, Pc: o.Pc, Pp: o.Pp, exp: o.expiry, days: o.days }));
        return `<tr class="${o._gold ? 'is-gold' : ''}">
            <td style="text-align:center;padding:6px 4px"><button class="calc-btn" onclick="openCalc('${colD}')">🧮</button></td>
            <td style="color:var(--dim);font-size:10px">${i + 1}</td>
            <td style="color:var(--blue);font-size:11px;font-weight:600">${esc(o.underlying)}${o._gold ? '<span class="badge-gold" style="margin-right:4px">⭐</span>' : ''}</td>
            <td class="tu" style="font-size:11px">${esc(o.callSym)}</td>
            <td class="tu" style="font-size:11px">${esc(o.putSym)}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(o.expiry)}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${o.days || '—'}</td>
            <td class="tn" style="color:var(--muted)">${fN(o.uprice)}</td>
            <td class="tn">${fN(o.Kp)}</td>
            <td class="tn tg">${fN(o.Kc)}</td>
            <td class="tn tr">${fN(o.Pp)}</td>
            <td class="tn tg">${fN(o.Pc)}</td>
            <td class="tn ${o.netP >= 0 ? 'tg' : 'tr'}" style="font-weight:700">${o.netP >= 0 ? '+' : ''}${fN(o.netP)}</td>
            <td><span class="tn ${o.profitPct >= 15 ? 'tg' : o.profitPct >= 8 ? 'ty' : ''}" style="font-size:13px;font-weight:700">${f2(o.profitPct)}% <span style="font-size:10px;font-weight:400">(${fN(o.maxProfit)})</span></span></td>
            <td><span class="tn ${o.lossPct >= -5 ? 'tg' : o.lossPct >= -15 ? 'ty' : 'tr'}" style="font-size:13px;font-weight:700">${o.lossPct >= 0 ? '+' : ''}${f2(o.lossPct)}% <span style="font-size:10px;font-weight:400">(${fN(o.maxLoss)})</span></span></td>
            <td class="tn">${fN(o.breakeven)}</td>
            <td><span class="tn ${o.livePnLPct >= 0 ? 'tg' : 'tr'}">${o.livePnLPct >= 0 ? '+' : ''}${f2(o.livePnLPct)}%</span></td>
            <td>${fVol(o.callVol)}</td>
            <td>${fVol(o.putVol)}</td>
        </tr>`;
    }).join('');
}

/* ══ CONVERSION RENDER ══ */
function updateConversionStats(d) {
    document.getElementById('cv-st').textContent = d.length;
    document.getElementById('cv-sbr').textContent = d.length ? Math.max(...d.map(o => o.annualPct)).toFixed(2) + '%' : '—';
    document.getElementById('cv-savg').textContent = d.length ? (d.reduce((a, o) => a + o.days, 0) / d.length).toFixed(0) : '—';
    document.getElementById('cv-su').textContent = new Set(d.map(o => o.underlying)).size;
    document.getElementById('tab-badge-conversion').textContent = d.length;
}

function renderConversion() {
    const fU = document.getElementById('cv-fu').value, fE = document.getElementById('cv-fe').value;
    const fR = parseFloat(document.getElementById('cv-fret').value) || 0, fV = (parseFloat(document.getElementById('cv-fvol').value) || 0) * 1e9, fS = document.getElementById('cv-fs').value;
    
    let list = strats.conversion.filter(o => (!fU || o.underlying === fU) && (!fE || o.expiry === fE) && o.annualPct >= fR && o.callVol >= fV && o.putVol >= fV);
    
    if (fS === 'annual') list.sort((a, b) => b.annualPct - a.annualPct);
    else if (fS === 'ret') list.sort((a, b) => b.retPct - a.retPct);
    else if (fS === 'days') list.sort((a, b) => a.days - b.days);
    
    filteredConversion = list;
    document.getElementById('cv-tcnt').textContent = list.length + ' ترکیب';
    document.getElementById('cv-einfo').textContent = list.length ? list.length + ' ترکیب برای خروجی' : '—';
    
    const tb = document.getElementById('cv-tb');
    if (!list.length) { tb.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:32px;color:var(--dim)">ترکیبی با این شرایط یافت نشد</td></tr>'; return; }
    
    tb.innerHTML = list.map((o, i) => {
        const cvD = encodeURIComponent(JSON.stringify({ t: 'conversion', u: o.underlying, S: o.uprice, K: o.strike, Pc: o.Pc, Pp: o.Pp, days: o.days, exp: o.expiry }));
        return `<tr>
            <td style="text-align:center;padding:6px 4px"><button class="calc-btn" onclick="openCalc('${cvD}')">🧮</button></td>
            <td style="color:var(--dim);font-size:10px">${i + 1}</td>
            <td style="color:var(--blue);font-size:11px;font-weight:600">${esc(o.underlying)}</td>
            <td class="tu" style="font-size:11px">${esc(o.callSym)}</td>
            <td class="tu" style="font-size:11px">${esc(o.putSym)}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(o.expiry)}</td>
            <td class="tn" style="color:var(--dim);text-align:center">${o.days}</td>
            <td class="tn" style="color:var(--muted);text-align:center">${fN(o.uprice)}</td>
            <td class="tn tg" style="text-align:center">${fN(o.strike)}</td>
            <td class="tn" style="text-align:center">${fN(o.netCost)}</td>
            <td><span class="tn tg" style="font-size:13px;font-weight:700">${f2(o.monthlyPct)}%</span></td>
            <td><span class="tn tg" style="font-size:13px;font-weight:700">${f2(o.retPct)}%</span> <span style="font-size:9px;color:var(--dim)">(${f2(o.annualPct)}% سالانه)</span></td>
            <td>${fVol(o.callVol)}</td>
            <td>${fVol(o.putVol)}</td>
        </tr>`;
    }).join('');
}

/* ══ EXPORT TO EXCEL ══ */
const ts = () => { const n = new Date(); return n.getFullYear() + String(n.getMonth() + 1).padStart(2, '0') + String(n.getDate()).padStart(2, '0') + '_' + String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0'); };

function exportXL() {
    if (!filteredStrats.length) { alert('داده‌ای وجود ندارد'); return; }
    const rows = filteredStrats.map((s, i) => ({ '#': i + 1, '⭐': s._gold ? 'بله' : '', 'نماد پایه': s.underlying, 'سررسید': s.expiry, 'نماد پایین': s.sym1, 'اعمال پایین': s.k1, 'نماد بالا': s.sym2, 'اعمال بالا': s.k2, 'پرمیوم پایین': s.p1, 'پرمیوم بالا': s.p2, 'سر به سر': s.breakeven, 'حاشیه امنیت%': s.safetyMargin != null ? +s.safetyMargin.toFixed(2) : '', 'پایین‌ترین سود%': s.retWorst != null ? +s.retWorst.toFixed(2) : '', 'سود%': +s.returnPct.toFixed(2), 'بالاترین سود%': s.retBest != null ? +s.retBest.toFixed(2) : '', 'ارزش K1': s.v1, 'ارزش K2': s.v2 }));
    const ws = XLSX.utils.json_to_sheet(rows), wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, ws, 'BCS'); XLSX.writeFile(wb2, 'BCS_' + ts() + '.xlsx');
}
function exportCCXL() {
    if (!filteredCC.length) { alert('داده‌ای وجود ندارد'); return; }
    const rows = filteredCC.map((o, i) => ({ '#': i + 1, 'نماد': o.symRaw, 'نماد پایه': o.underlying, 'سررسید': o.expiry, 'روز': o.days, 'S': o.uprice, 'K': o.strike, 'P': o.premium, 'ارزش': o.volume, 'سود کل%': +o.tpct.toFixed(2), 'سود ماهانه%': +o.mpct.toFixed(2), 'سر به سر': o.breakeven, 'حاشیه%': +o.spct.toFixed(2), 'شروع حداکثر سود': o.strike, 'فاصله تا حداکثر سود%': +o.mpStartPct.toFixed(2), 'وضعیت': o.status }));
    const ws = XLSX.utils.json_to_sheet(rows), wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, ws, 'CC'); XLSX.writeFile(wb2, 'CC_' + ts() + '.xlsx');
}
function exportCollarXL() {
    if (!filteredCollar.length) { alert('داده‌ای وجود ندارد'); return; }
    const rows = filteredCollar.map((o, i) => ({ '#': i + 1, '⭐': o._gold ? 'بله' : '', 'نماد کال': o.callSym, 'نماد پوت': o.putSym, 'نماد پایه': o.underlying, 'سررسید': o.expiry, 'روز': o.days, 'S': o.uprice, 'K پوت': o.Kp, 'K کال': o.Kc, 'P پوت': o.Pp, 'P کال': o.Pc, 'خالص پرمیوم': o.netP, 'حداکثر سود': o.maxProfit, 'حداکثر سود%': +o.profitPct.toFixed(2), 'حداکثر ضرر': o.maxLoss, 'حداکثر ضرر%': +o.lossPct.toFixed(2), 'سر به سر': o.breakeven, 'سود/ضرر زنده%': +o.livePnLPct.toFixed(2), 'ارزش کال': o.callVol, 'ارزش پوت': o.putVol }));
    const ws = XLSX.utils.json_to_sheet(rows), wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, ws, 'Collar'); XLSX.writeFile(wb2, 'Collar_' + ts() + '.xlsx');
}
function exportConversionXL() {
    if (!filteredConversion.length) { alert('داده‌ای وجود ندارد'); return; }
    const rows = filteredConversion.map((o, i) => ({ '#': i + 1, 'نماد پایه': o.underlying, 'نماد کال': o.callSym, 'نماد پوت': o.putSym, 'سررسید': o.expiry, 'روز': o.days, 'S': o.uprice, 'K': o.strike, 'P کال': o.Pc, 'P پوت': o.Pp, 'هزینه خالص': o.netCost, 'سود قفل‌شده': +o.profit.toFixed(0), 'بازده کل%': +o.retPct.toFixed(2), 'بازده ماهانه%': +o.monthlyPct.toFixed(2), 'بازده سالانه%': +o.annualPct.toFixed(2), 'ارزش کال': o.callVol, 'ارزش پوت': o.putVol }));
    const ws = XLSX.utils.json_to_sheet(rows), wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, ws, 'Conversion'); XLSX.writeFile(wb2, 'Conversion_' + ts() + '.xlsx');
}

/* ══ CALC BAR & MODAL TOGGLES ══ */
let bcsOpen = false, ccOpen = false, gfpOpen = false, ccGfpOpen = false, colGfpOpen = false;

function toggleCalcBCS() { bcsOpen = !bcsOpen; document.getElementById('cb-body-bcs').classList.toggle('collapsed', !bcsOpen); document.getElementById('cb-head-bcs').classList.toggle('is-open', bcsOpen); document.getElementById('cb-arrow-bcs').textContent = bcsOpen ? '▲' : '▼'; document.getElementById('cb-lbl-bcs').textContent = bcsOpen ? 'بستن' : 'باز کردن'; setTimeout(updateLayout, 400); }
function toggleCalcCC() { ccOpen = !ccOpen; document.getElementById('cb-body-cc').classList.toggle('collapsed', !ccOpen); document.getElementById('cb-head-cc').classList.toggle('is-open', ccOpen); document.getElementById('cb-arrow-cc').textContent = ccOpen ? '▲' : '▼'; document.getElementById('cb-lbl-cc').textContent = ccOpen ? 'بستن' : 'باز کردن'; setTimeout(updateLayout, 400); }
function toggleGFP() { gfpOpen = !gfpOpen; document.getElementById('gfp-body').classList.toggle('collapsed', !gfpOpen); document.getElementById('gfp-arrow').textContent = gfpOpen ? '▲' : '▼'; document.getElementById('gfp-lbl').textContent = gfpOpen ? 'بستن' : 'نمایش فیلترها'; }
function toggleCCGFP() { ccGfpOpen = !ccGfpOpen; document.getElementById('cc-gfp-body').classList.toggle('collapsed', !ccGfpOpen); document.getElementById('cc-gfp-arrow').textContent = ccGfpOpen ? '▲' : '▼'; document.getElementById('cc-gfp-lbl').textContent = ccGfpOpen ? 'بستن' : 'نمایش فیلترها'; }
function toggleColGFP() { colGfpOpen = !colGfpOpen; document.getElementById('col-gfp-body').classList.toggle('collapsed', !colGfpOpen); document.getElementById('col-gfp-arrow').textContent = colGfpOpen ? '▲' : '▼'; document.getElementById('col-gfp-lbl').textContent = colGfpOpen ? 'بستن' : 'نمایش فیلترها'; }
function togDebug() { const c = document.getElementById('dc'), a = document.getElementById('darr'); c.classList.toggle('open'); a.textContent = c.classList.contains('open') ? '▲' : '▼'; }

/* ══ CALCULATORS LOGIC ══ */
function calcManual() {
    const p1 = parseFloat(document.getElementById('ci-p1').value) || 0, k1 = parseFloat(document.getElementById('ci-k1').value) || 0;
    const p2 = parseFloat(document.getElementById('ci-p2').value) || 0, k2 = parseFloat(document.getElementById('ci-k2').value) || 0;
    const s = parseFloat(document.getElementById('ci-s').value) || 0, ep1 = parseFloat(document.getElementById('ci-ep1').value) || 0, ep2 = parseFloat(document.getElementById('ci-ep2').value) || 0;
    const errEl = document.getElementById('calc-err'), posEl = document.getElementById('pos-section');
    const setV = (id, val, cls) => { const el = document.getElementById(id); el.textContent = val; if (cls) el.className = 'co-val ' + cls; };
    const reset = () => { ['co-debit', 'co-profit', 'co-loss', 'co-rr', 'co-ret', 'co-be', 'co-safety', 'co-open-ret', 'co-pnl', 'co-now-ret', 'co-coverage'].forEach(id => document.getElementById(id).textContent = '—'); posEl.style.display = 'none'; };
    
    if (!p1 || !k1 || !p2 || !k2) { reset(); errEl.style.display = 'none'; return; }
    if (k2 <= k1) { reset(); errEl.textContent = '⚠ K₂ باید از K₁ بزرگ‌تر باشد'; errEl.style.display = 'block'; return; }
    if (p1 <= p2) { reset(); errEl.textContent = '⚠ P₁ باید از P₂ بزرگ‌تر باشد'; errEl.style.display = 'block'; return; }
    
    errEl.style.display = 'none';
    const nd = p1 - p2, ks = k2 - k1, mp = ks - nd, ml = nd, be = k1 + nd, rr = mp / nd, ret = rr * 100, safety = s > 0 ? (k1 - s) / s * 100 : null;
    
    if (mp <= 0) { reset(); errEl.textContent = '⚠ Max Profit منفی است'; errEl.style.display = 'block'; setV('co-debit', fN(nd), 'v-amber'); setV('co-loss', fN(ml), 'v-rose'); return; }
    
    setV('co-debit', fN(nd), 'v-amber'); setV('co-profit', fN(mp), 'v-teal'); setV('co-loss', fN(ml), 'v-rose');
    setV('co-rr', f2(rr) + 'x', rr >= 2 ? 'v-teal' : rr >= 1 ? 'v-blue' : 'v-rose');
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
    const s0 = parseFloat(document.getElementById('cco-s0').value) || 0, snow = parseFloat(document.getElementById('cco-snow').value) || 0;
    const psold = parseFloat(document.getElementById('cco-psold').value) || 0, pnow = parseFloat(document.getElementById('cco-pnow').value) || 0;
    const errEl = document.getElementById('cco-err'), bd = document.getElementById('cco-bd');
    const setV = (id, val, cls) => { const el = document.getElementById(id); el.textContent = val; if (cls) el.className = 'co-val ' + cls; };
    const resetOut = () => { ['cco-orig', 'cco-now', 'cco-cov'].forEach(id => { document.getElementById(id).textContent = '—'; document.getElementById(id).className = 'co-val'; }); bd.style.display = 'none'; };
    
    if (!s0 || !psold) { resetOut(); errEl.style.display = 'none'; return; }
    if (psold >= s0) { resetOut(); errEl.textContent = '⚠ پریمیوم فروش نباید از قیمت خرید سهم بیشتر باشد'; errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';
    
    const cb = s0 - psold, origRet = psold / cb * 100;
    setV('cco-orig', (origRet >= 0 ? '+' : '') + origRet.toFixed(2) + '%', 'v-blue');
    
    if (!snow && !pnow) return;
    const sPnL = snow - s0, oPnL = psold - pnow, tPnL = sPnL + oPnL;
    const nowRet = tPnL / cb * 100, cov = psold > 0 ? tPnL / psold * 100 : 0;
    setV('cco-now', (nowRet >= 0 ? '+' : '') + nowRet.toFixed(2) + '%', nowRet >= 0 ? 'v-teal' : 'v-rose');
    setV('cco-cov', (cov >= 0 ? '+' : '') + cov.toFixed(2) + '%', cov >= 100 ? 'v-teal' : cov >= 50 ? 'v-amber' : cov >= 0 ? 'v-amber' : 'v-rose');
    
    bd.style.display = 'flex';
    const sp = document.getElementById('cco-s-pnl'), op = document.getElementById('cco-o-pnl'), tp = document.getElementById('cco-t-pnl');
    sp.textContent = (sPnL >= 0 ? '+' : '') + fN(sPnL); sp.style.color = sPnL >= 0 ? 'var(--teal)' : 'var(--rose)';
    op.textContent = (oPnL >= 0 ? '+' : '') + fN(oPnL); op.style.color = oPnL >= 0 ? 'var(--teal)' : 'var(--rose)';
    tp.textContent = (tPnL >= 0 ? '+' : '') + fN(tPnL); tp.style.color = tPnL >= 0 ? 'var(--teal)' : 'var(--rose)';
}

function closeCalc() { document.getElementById('cm-overlay').style.display = 'none'; document.body.style.overflow = ''; }

function openCalc(jsonData) {
    const d = JSON.parse(decodeURIComponent(jsonData));
    _cmType = d.t;
    document.getElementById('cm-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    let title, subtitle, inputs;
    if (d.t === 'bcs') {
        title = '🧮 Bull Call Spread'; subtitle = `نماد پایه: ${d.u} | سررسید: ${d.exp || ''} | ${d.days || 0} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال پایین K₁</label><input id="cm-k1" type="number" value="${d.k1 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال بالا K₂</label><input id="cm-k2" type="number" value="${d.k2 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم کال پایین P₁</label><input id="cm-p1" type="number" value="${d.p1 || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم کال بالا P₂</label><input id="cm-p2" type="number" value="${d.p2 || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'cc') {
        title = '🧮 Covered Call'; subtitle = `نماد: ${d.sym || ''} | پایه: ${d.u || ''} | ${d.days || 0} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>قیمت اعمال (K)</label><input id="cm-K" type="number" value="${d.K || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم دریافتی (P)</label><input id="cm-P" type="number" value="${d.P || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>روزهای باقیمانده</label><input id="cm-days" type="number" value="${d.days || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'collar') {
        title = '🧮 Collar'; subtitle = `نماد پایه: ${d.u || ''} | سررسید: ${d.exp || ''} | ${d.days || 0} روز`;
        inputs = `<div class="cm-field"><label>قیمت سهم پایه (S)</label><input id="cm-S" type="number" value="${d.S || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال کال (Kc)</label><input id="cm-Kc" type="number" value="${d.Kc || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>اعمال پوت (Kp)</label><input id="cm-Kp" type="number" value="${d.Kp || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم کال دریافتی (Pc)</label><input id="cm-Pc" type="number" value="${d.Pc || 0}" oninput="updateCalc()"></div>
                  <div class="cm-field"><label>پرمیوم پوت پرداختی (Pp)</label><input id="cm-Pp" type="number" value="${d.Pp || 0}" oninput="updateCalc()"></div>`;
    } else if (d.t === 'conversion') {
        title = '🧮 Conversion'; subtitle = `نماد پایه: ${d.u || ''} | سررسید: ${d.exp || ''} | ${d.days || 0} روز`;
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
    const fPct = n => (!isFinite(n) || isNaN(n)) ? '—' : n.toFixed(2) + '%';
    const res = document.getElementById('cm-results');
    if (!res) return;
    
    let html = '';
    if (_cmType === 'bcs') {
        const S = g('cm-S'), k1 = g('cm-k1'), k2 = g('cm-k2'), p1 = g('cm-p1'), p2 = g('cm-p2');
        const nd = p1 - p2, mp = k2 - k1 - nd, be = k1 + nd, sm = S > 0 ? (S - be) / S * 100 : NaN, rr = nd > 0 ? mp / nd * 100 : NaN;
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه استراتژی</div><div class="cm-res-val" style="color:var(--amber)">${fStr(nd)}</div></div>
                <div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val">${fStr(mp)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val" style="color:var(--blue)">${fStr(be)}</div></div>
                <div class="cm-res ${sm > 0 ? 'hi' : sm < -5 ? 'neg' : ''}"><div class="cm-res-lbl">حاشیه امنیت</div><div class="cm-res-val" style="color:${sm > 0 ? 'var(--teal)' : 'var(--rose)'}">${fPct(sm)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">نسبت سود به هزینه</div><div class="cm-res-val">${fPct(rr)}</div></div>
                <div class="cm-res neg"><div class="cm-res-lbl">حداکثر ضرر</div><div class="cm-res-val">${fStr(nd)}</div></div>`;
    } else if (_cmType === 'cc') {
        const S = g('cm-S'), K = g('cm-K'), P = g('cm-P'), days = g('cm-days');
        const mp = K - S + P, be = S - P, tpct = S > 0 ? mp / S * 100 : NaN, mpct = days > 0 ? tpct / days * 30 : NaN, spct = S > 0 ? P / S * 100 : NaN;
        html = `<div class="cm-res ${mp > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val">${fStr(mp)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val" style="color:var(--blue)">${fStr(be)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">سود کل %</div><div class="cm-res-val">${fPct(tpct)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">سود ماهانه %</div><div class="cm-res-val">${fPct(mpct)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">درصد پرمیوم</div><div class="cm-res-val" style="color:var(--amber)">${fPct(spct)}</div></div>
                <div class="cm-res neg"><div class="cm-res-lbl">ریسک سهم</div><div class="cm-res-val">${fStr(S)}</div></div>`;
    } else if (_cmType === 'collar') {
        const S = g('cm-S'), Kc = g('cm-Kc'), Kp = g('cm-Kp'), Pc = g('cm-Pc'), Pp = g('cm-Pp');
        const netP = Pc - Pp, mp = Kc - S + netP, ml = Kp - S + netP, be = S - netP;
        const prot = S > 0 ? (S - Kp) / S * 100 : NaN, profPct = S > 0 ? mp / S * 100 : NaN, lossPct = S > 0 ? ml / S * 100 : NaN;
        html = `<div class="cm-res"><div class="cm-res-lbl">خالص پرمیوم</div><div class="cm-res-val" style="color:${netP >= 0 ? 'var(--teal)' : 'var(--rose)'}">${netP >= 0 ? '+' : ''}${fStr(netP)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">حداکثر سود</div><div class="cm-res-val">${fStr(mp)} (${fPct(profPct)})</div></div>
                <div class="cm-res neg"><div class="cm-res-lbl">حداکثر ضرر</div><div class="cm-res-val">${fStr(ml)} (${fPct(lossPct)})</div></div>
                <div class="cm-res"><div class="cm-res-lbl">سر به سر</div><div class="cm-res-val" style="color:var(--blue)">${fStr(be)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">حفاظت پوت %</div><div class="cm-res-val" style="color:var(--amber)">${fPct(prot)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">بازه قیمتی</div><div class="cm-res-val" style="font-size:13px">${fStr(Kp)} ← → ${fStr(Kc)}</div></div>`;
    } else if (_cmType === 'conversion') {
        const S = g('cm-S'), K = g('cm-K'), Pc = g('cm-Pc'), Pp = g('cm-Pp'), days = g('cm-days');
        const netCost = S + Pp - Pc, profit = K - netCost, retPct = netCost > 0 ? profit / netCost * 100 : NaN;
        const annualPct = (days > 0 && !isNaN(retPct)) ? retPct / days * 365 : NaN, monthlyPct = (days > 0 && !isNaN(retPct)) ? retPct / days * 30 : NaN;
        html = `<div class="cm-res"><div class="cm-res-lbl">هزینه خالص</div><div class="cm-res-val" style="color:var(--amber)">${fStr(netCost)}</div></div>
                <div class="cm-res ${profit > 0 ? 'hi' : 'neg'}"><div class="cm-res-lbl">سود قفل‌شده</div><div class="cm-res-val">${fStr(profit)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">بازده کل %</div><div class="cm-res-val">${fPct(retPct)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">بازده ماهانه %</div><div class="cm-res-val">${fPct(monthlyPct)}</div></div>
                <div class="cm-res hi"><div class="cm-res-lbl">بازده سالانه %</div><div class="cm-res-val">${fPct(annualPct)}</div></div>
                <div class="cm-res"><div class="cm-res-lbl">قیمت اعمال مشترک</div><div class="cm-res-val" style="color:var(--blue)">${fStr(K)}</div></div>`;
    }
    res.innerHTML = html;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCalc(); });

/* ══ BOOT APP ══ */
function startCD() {
    clearInterval(cdInt); cdSec = 60;
    cdInt = setInterval(() => {
        cdSec--; document.getElementById('cd').textContent = cdSec + 's';
        if (cdSec <= 0) { cdSec = 60; loadLiveData(false); }
    }, 1000);
}

function bootApp() {
    updateLayout();
    document.getElementById('dash').style.display = 'block'; // نمایش مستقیم داشبورد
    loadLiveData(false);
    startCD();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', bootApp); } 
else { bootApp(); }