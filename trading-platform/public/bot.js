'use strict';

const $ = (id) => document.getElementById(id);
let strategies = [];
let autoEnabled = false;
let botAvailable = true;

async function init() {
  await loadStrategies();
  await loadStatus();
  if (botAvailable) await loadAccount();
  $('run').addEventListener('click', runOnce);
  $('refresh').addEventListener('click', loadAccount);
  $('autoToggle').addEventListener('click', toggleAuto);
}

async function loadStrategies() {
  strategies = await (await fetch('/api/strategies')).json();
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
  const defaults = (strat && strat.defaults) || {};
  const keys = Object.keys(defaults);
  $('params').innerHTML = keys.length
    ? keys
        .map(
          (k) => `<label style="color:var(--muted);font-size:.85rem">${k[0].toUpperCase() + k.slice(1)}
            <input data-param="${k}" type="number" value="${defaults[k]}" step="1" min="1" /></label>`
        )
        .join('')
    : '<p class="blurb" style="grid-column:1/-1;margin:0">No parameters.</p>';
}

function collectConfig() {
  const params = {};
  document.querySelectorAll('[data-param]').forEach((el) => (params[el.dataset.param] = Number(el.value)));
  return {
    symbol: $('symbol').value,
    strategy: $('strategy').value,
    params,
    notional: Number($('notional').value),
    dryRun: $('dryRun').checked,
  };
}

async function loadStatus() {
  let s;
  try {
    s = await (await fetch('/api/bot/status')).json();
  } catch {
    s = { notAvailable: true };
  }
  if (s.notAvailable) {
    botAvailable = false;
    $('setup').classList.remove('hidden');
    $('setup').innerHTML =
      '<h2>Bot only runs locally</h2>' +
      '<p>The paper-trading bot needs your Alpaca API keys and a running server, so it is not available on this public URL.</p>' +
      '<p>To use it, run the app on your own computer:</p>' +
      '<ol><li>Download the code from GitHub.</li>' +
      '<li>Add your Alpaca keys to <code>trading-platform/.env</code>.</li>' +
      '<li>Run <code>npm start</code>, then open <code>http://localhost:4000/bot.html</code>.</li></ol>' +
      '<p>The <a href="/">Backtester</a> works right here in your browser.</p>';
    $('run').disabled = true;
    $('autoToggle').disabled = true;
    $('refresh').disabled = true;
    $('acctMeta').textContent = 'not available on public URL';
    return;
  }
  $('setup').classList.toggle('hidden', s.hasKeys);
  autoEnabled = s.auto && s.auto.enabled;
  updateAutoUi(s.auto);
  renderLog(s.log || []);
}

function updateAutoUi(auto) {
  const btn = $('autoToggle');
  btn.textContent = autoEnabled ? 'Stop auto' : 'Start auto';
  btn.classList.toggle('danger', autoEnabled);
  $('autoMeta').textContent =
    auto && auto.enabled ? `auto-running every ${auto.minutes} min` : '';
}

async function loadAccount() {
  if (!botAvailable) return;
  const meta = $('acctMeta');
  meta.textContent = 'loading…';
  try {
    const data = await (await fetch('/api/bot/account')).json();
    if (data.noKeys) {
      meta.textContent = 'no API keys yet';
      $('account').innerHTML = '';
      return;
    }
    if (data.error) throw new Error(data.error);
    const a = data.account;
    meta.textContent = data.clock.is_open ? 'market OPEN' : 'market closed';
    const cards = [
      ['Portfolio value', money(a.portfolio_value)],
      ['Cash', money(a.cash)],
      ['Buying power', money(a.buying_power)],
      ['Open positions', String((data.positions || []).length)],
    ];
    $('account').innerHTML = cards
      .map(([l, v]) => `<div class="metric"><div class="label">${l}</div><div class="value">${v}</div></div>`)
      .join('');
    renderPositions(data.positions || []);
  } catch (err) {
    meta.textContent = err.message;
  }
}

function renderPositions(positions) {
  const tbody = $('positionsTable').querySelector('tbody');
  if (!positions.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No open positions.</td></tr>';
    return;
  }
  tbody.innerHTML = positions
    .map((p) => {
      const pl = Number(p.unrealized_pl);
      return `<tr>
        <td style="text-align:left">${p.symbol}</td>
        <td>${Number(p.qty).toFixed(4)}</td>
        <td>${money(p.avg_entry_price)}</td>
        <td>${money(p.market_value)}</td>
        <td class="${pl > 0 ? 'pos' : pl < 0 ? 'neg' : ''}">${money(pl)}</td>
      </tr>`;
    })
    .join('');
}

async function runOnce() {
  const btn = $('run');
  btn.disabled = true;
  setStatus('Running…');
  try {
    const res = await fetch('/api/bot/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectConfig()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bot run failed.');
    renderLog(data.log);
    setStatus(`${data.entry.action} — ${data.entry.note}`);
    loadAccount();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function toggleAuto() {
  const enabling = !autoEnabled;
  if (enabling && !$('dryRun').checked) {
    const ok = confirm(
      'Auto-run with LIVE paper orders (not dry run). The bot will place simulated orders on its own. Continue?'
    );
    if (!ok) return;
  }
  setStatus(enabling ? 'Starting auto-run…' : 'Stopping…');
  const cfg = collectConfig();
  const res = await fetch('/api/bot/auto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: enabling, minutes: Number($('autoMinutes').value), ...cfg }),
  });
  const data = await res.json();
  autoEnabled = data.auto && data.auto.enabled;
  updateAutoUi(data.auto);
  setStatus(autoEnabled ? 'Auto-run started.' : 'Auto-run stopped.');
  setTimeout(loadStatus, 1500);
}

function renderLog(log) {
  const tbody = $('logTable').querySelector('tbody');
  if (!log || !log.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No activity yet.</td></tr>';
    return;
  }
  tbody.innerHTML = log
    .map((e) => {
      const t = new Date(e.time).toLocaleString();
      const actCls = e.action === 'BUY' ? 'pos' : e.action === 'SELL' ? 'neg' : '';
      return `<tr>
        <td style="text-align:left">${t}</td>
        <td>${e.symbol || ''}</td>
        <td>${e.signal || ''}${e.dryRun ? ' <span class="open-tag">DRY</span>' : ''}</td>
        <td class="${actCls}">${e.action || ''}</td>
        <td style="text-align:left">${e.note || ''}</td>
      </tr>`;
    })
    .join('');
}

function money(x) {
  return '$' + Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function setStatus(msg, isError) {
  const s = $('status');
  s.textContent = msg;
  s.className = 'status' + (isError ? ' error' : '');
}

init();
