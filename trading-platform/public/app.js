'use strict';

const $ = (id) => document.getElementById(id);
let strategies = [];

async function loadStrategies() {
  const res = await fetch('/api/strategies');
  strategies = await res.json();
  const sel = $('strategy');
  sel.innerHTML = strategies.map((s) => `<option value="${s.key}">${s.name}</option>`).join('');
  sel.addEventListener('change', renderParams);
  renderParams();
}

function currentStrategy() {
  return strategies.find((s) => s.key === $('strategy').value);
}

function renderParams() {
  const strat = currentStrategy();
  $('strategyBlurb').textContent = strat ? strat.blurb : '';
  const wrap = $('params');
  const defaults = (strat && strat.defaults) || {};
  const keys = Object.keys(defaults);
  if (keys.length === 0) {
    wrap.innerHTML = '<p class="blurb" style="grid-column:1/-1;margin:0">No parameters for this strategy.</p>';
    return;
  }
  wrap.innerHTML = keys
    .map(
      (k) => `<label style="color:var(--muted);font-size:.85rem">${prettify(k)}
        <input data-param="${k}" type="number" value="${defaults[k]}" step="1" min="1" />
      </label>`
    )
    .join('');
}

function prettify(k) {
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function collectParams() {
  const params = {};
  document.querySelectorAll('[data-param]').forEach((el) => {
    params[el.dataset.param] = Number(el.value);
  });
  return params;
}

async function runBacktest() {
  const btn = $('run');
  const status = $('status');
  btn.disabled = true;
  status.className = 'status';
  status.textContent = 'Running…';
  try {
    const res = await fetch('/api/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: $('symbol').value,
        strategy: $('strategy').value,
        params: collectParams(),
        years: Number($('years').value),
        startCash: Number($('startCash').value),
        commission: Number($('commission').value),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backtest failed.');
    render(data);
    status.textContent = `Done — ${data.source}.`;
  } catch (err) {
    status.className = 'status error';
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

function fmtMoney(x) {
  return '$' + Number(x).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtPct(x) {
  const v = Number(x);
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
}
function cls(x) {
  return Number(x) > 0 ? 'pos' : Number(x) < 0 ? 'neg' : '';
}

function render(data) {
  window.__last = data;
  $('results').classList.remove('hidden');
  const m = data.metrics;
  $('resultMeta').textContent = `${data.symbol} · ${data.strategy} · ${m.fromDate} → ${m.toDate}`;

  const beat = m.totalReturnPct - m.buyHoldReturnPct;
  const cards = [
    ['Total return', fmtPct(m.totalReturnPct), cls(m.totalReturnPct)],
    ['Final equity', fmtMoney(m.finalEquity), ''],
    ['Buy & hold', fmtPct(m.buyHoldReturnPct), cls(m.buyHoldReturnPct)],
    ['vs. buy & hold', fmtPct(beat), cls(beat)],
    ['Max drawdown', '-' + m.maxDrawdownPct.toFixed(2) + '%', 'neg'],
    ['Win rate', m.winRatePct + '%', ''],
    ['Trades', String(m.numTrades), ''],
    ['Sharpe (ann.)', m.sharpe.toFixed(2), cls(m.sharpe)],
    ['CAGR', fmtPct(m.cagrPct), cls(m.cagrPct)],
    ['Time in market', m.exposurePct + '%', ''],
  ];
  $('metrics').innerHTML = cards
    .map(
      ([label, value, c]) =>
        `<div class="metric"><div class="label">${label}</div><div class="value ${c}">${value}</div></div>`
    )
    .join('');

  drawEquity($('equityChart'), data.equityCurve);
  drawPrice($('priceChart'), data.priceSeries, data.trades);
  renderTrades(data.trades);
}

function renderTrades(trades) {
  const tbody = $('tradesTable').querySelector('tbody');
  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No trades taken.</td></tr>';
    return;
  }
  tbody.innerHTML = trades
    .map((t, i) => {
      const exit = t.open ? `${t.exitDate || 'now'} <span class="open-tag">OPEN</span>` : t.exitDate;
      return `<tr>
        <td>${i + 1}</td>
        <td>${t.entryDate}</td>
        <td>$${t.entryPrice}</td>
        <td>${exit}</td>
        <td>$${t.exitPrice}</td>
        <td class="${cls(t.returnPct)}">${fmtPct(t.returnPct)}</td>
        <td class="${cls(t.pnl)}">${fmtMoney(t.pnl)}</td>
      </tr>`;
    })
    .join('');
}

// ---- Canvas charts (no external libraries) ----

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth;
  const h = canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function bounds(values) {
  let min = Infinity, max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function drawAxes(ctx, w, h, pad, min, max) {
  ctx.strokeStyle = '#2d3640';
  ctx.fillStyle = '#8b97a7';
  ctx.font = '11px sans-serif';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ((h - pad.top - pad.bottom) * i) / 4;
    const val = max - ((max - min) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(val.toLocaleString(undefined, { maximumFractionDigits: 0 }), 4, y + 3);
  }
}

function line(ctx, pts, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

function drawEquity(canvas, curve) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const pad = { top: 12, right: 12, bottom: 22, left: 52 };
  const all = curve.flatMap((p) => [p.equity, p.bh]);
  const { min, max } = bounds(all);
  drawAxes(ctx, w, h, pad, min, max);

  const X = (i) => pad.left + ((w - pad.left - pad.right) * i) / (curve.length - 1);
  const Y = (v) => pad.top + (h - pad.top - pad.bottom) * (1 - (v - min) / (max - min));

  line(ctx, curve.map((p, i) => ({ x: X(i), y: Y(p.bh) })), '#8b97a7', 1.4);
  line(ctx, curve.map((p, i) => ({ x: X(i), y: Y(p.equity) })), '#4c9aff', 2);
}

function drawPrice(canvas, series, trades) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const pad = { top: 12, right: 12, bottom: 22, left: 52 };
  const { min, max } = bounds(series.map((p) => p.close));
  drawAxes(ctx, w, h, pad, min, max);

  const idxByDate = new Map(series.map((p, i) => [p.date, i]));
  const X = (i) => pad.left + ((w - pad.left - pad.right) * i) / (series.length - 1);
  const Y = (v) => pad.top + (h - pad.top - pad.bottom) * (1 - (v - min) / (max - min));

  line(ctx, series.map((p, i) => ({ x: X(i), y: Y(p.close) })), '#4c9aff', 1.5);

  const marker = (date, price, color) => {
    if (!idxByDate.has(date)) return;
    const x = X(idxByDate.get(date));
    const y = Y(price);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const t of trades) {
    marker(t.entryDate, t.entryPrice, '#3fb950');
    if (t.exitDate) marker(t.exitDate, t.exitPrice, '#f85149');
  }
}

window.addEventListener('resize', () => {
  if (!$('results').classList.contains('hidden') && window.__last) render(window.__last);
});

$('run').addEventListener('click', runBacktest);
loadStrategies();
