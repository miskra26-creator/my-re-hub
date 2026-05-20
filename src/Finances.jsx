// Finances.jsx — Business money hub for Monica.
//
// Four tabs:
//   📊 Dashboard — monthly income vs expenses, YTD net, goal progress, top categories
//   💵 Income    — commissions in (shared storage with old CommissionTracker)
//   🧾 Expenses  — Schedule C-categorized expenses + mileage + receipt photos + CSV export
//   🎯 Goals     — annual income goal w/ monthly breakdown
//
// Storage (intentional — keeps compatibility with existing pages):
//   localStorage "commissions"        — same key as CommissionTracker
//   localStorage "commission_goals"   — same key as CommissionTracker; we add .monthlyOverride
//   IndexedDB    "expenses"           — expenses w/ receipt dataURLs (IDB used for capacity)
//   localStorage "finance_settings"   — mileage rate, currency, etc.
//
// Mileage rate default = $0.70/mile (IRS standard mileage rate, 2025; user can override
// in Settings tab when 2026 rate is announced — typically mid-December).

import { useState, useMemo, useRef } from 'react';
import { useLS, useIDB } from './cloudHooks';
import {
  DollarSign, TrendingUp, TrendingDown, Plus, Trash2, Edit3, X, Save,
  Target, Download, Camera, Filter, ArrowLeft, Receipt, Car,
  AlertCircle, CheckCircle, FileText, PiggyBank,
} from 'lucide-react';

// ── SCHEDULE C CATEGORIES ───────────────────────────────────────────────────
// Each maps to a Schedule C line for the CPA export. Picked to be the ones a
// realtor actually deals with — common categories first.
const CATEGORIES = [
  { id: 'advertising',        label: 'Advertising',              sc: 'Line 8',   note: 'Meta/FB ads, signage, postcards, business cards' },
  { id: 'mileage',            label: 'Mileage (Auto)',           sc: 'Line 9',   note: 'IRS std mileage rate × business miles' },
  { id: 'auto_other',         label: 'Auto — Gas/Repairs',       sc: 'Line 9',   note: 'Only if NOT using std mileage method' },
  { id: 'broker_fees',        label: 'Broker Fees & Splits',     sc: 'Line 10',  note: 'Desk fees, transaction fees, splits paid' },
  { id: 'referral_paid',      label: 'Referral Fees Paid',       sc: 'Line 10',  note: 'Fees you paid to other agents' },
  { id: 'contract_labor',     label: 'Contract Labor / TC',      sc: 'Line 11',  note: 'Transaction coordinators, VAs, freelancers' },
  { id: 'insurance',          label: 'Insurance (E&O, Biz)',     sc: 'Line 15',  note: 'Errors & Omissions, liability — not health' },
  { id: 'legal_pro',          label: 'Legal & Professional',     sc: 'Line 17',  note: 'CPA, attorney, bookkeeping' },
  { id: 'office_supplies',    label: 'Office Supplies',          sc: 'Line 18',  note: 'Paper, ink, pens, postage, printing' },
  { id: 'office_rent',        label: 'Office Rent',              sc: 'Line 20b', note: 'Brokerage office or co-working' },
  { id: 'supplies',           label: 'Signage & Lockboxes',      sc: 'Line 22',  note: 'Yard signs, riders, lockboxes, key tags' },
  { id: 'dues',               label: 'Dues & Subscriptions',     sc: 'Line 23',  note: 'MLS, NAR, state board, license renewal' },
  { id: 'software',           label: 'Software Subscriptions',   sc: 'Line 27a', note: 'CRM, Canva, ChatGPT, Modal, Coffee & Contracts' },
  { id: 'continuing_ed',      label: 'Continuing Education',     sc: 'Line 27a', note: 'CE classes, conferences, coaching' },
  { id: 'travel',             label: 'Travel & Lodging',         sc: 'Line 24a', note: 'Conferences, business trips' },
  { id: 'meals',              label: 'Meals (50%)',              sc: 'Line 24b', note: 'Client meals — only 50% deductible' },
  { id: 'phone_internet',     label: 'Phone & Internet',         sc: 'Line 25',  note: 'Business % of cell + home internet' },
  { id: 'photography',        label: 'Photography & Staging',    sc: 'Line 8',   note: 'Listing photos, virtual staging, drone' },
  { id: 'client_gifts',       label: 'Client Gifts',             sc: 'Line 27a', note: 'IRS caps at $25/client/year for the deduction' },
  { id: 'closing_gifts',      label: 'Closing Gifts',            sc: 'Line 27a', note: '$25/client cap unless branded promotional' },
  { id: 'bank_fees',          label: 'Bank & Card Fees',         sc: 'Line 27a', note: 'Square, Stripe, business account fees' },
  { id: 'open_house',         label: 'Open House Supplies',      sc: 'Line 22',  note: 'Refreshments, flyers, signs' },
  { id: 'other',              label: 'Other',                    sc: 'Line 27a', note: 'Catch-all' },
];

const CAT_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const PAYMENT_METHODS = ['Card', 'Cash', 'Check', 'Bank Transfer', 'Auto-pay'];

const MILEAGE_TYPES = ['Showing', 'Listing Appt', 'Client Meeting', 'Inspection', 'Closing', 'CE Class', 'Office', 'Other'];

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const fmtMoney = (n) => `$${Math.round(Number(n)||0).toLocaleString()}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
const monthKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
};
const todayISO = () => new Date().toISOString().slice(0,10);

// Calc commission $ from a CommissionTracker entry
const commissionAmount = (e) => Number(e.salePrice||0) * Number(e.commissionPct||0) / 100;

export default function Finances({ setPage, toast }) {
  const [tab, setTab] = useState('dashboard');
  const [commissions, setCommissions] = useLS('commissions', []);
  const [goals, setGoals] = useLS('commission_goals', { year: new Date().getFullYear(), target: '', monthlyOverride: {} });
  const [expenses, setExpenses] = useIDB('expenses', []);
  const [settings, setSettings] = useLS('finance_settings', { mileageRate: 0.70 });

  const year = new Date().getFullYear();
  const monthsThisYear = useMemo(() => {
    return Array.from({length: 12}, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);
  }, [year]);

  // ── Derived totals ───────────────────────────────────────────────────────
  const ytdIncomeReceived = useMemo(() =>
    commissions
      .filter(c => c.status === 'Received' && new Date(c.closeDate||c.createdAt).getFullYear() === year)
      .reduce((s,c) => s + commissionAmount(c), 0),
    [commissions, year]);

  const ytdIncomeExpected = useMemo(() =>
    commissions
      .filter(c => c.status === 'Expected' && new Date(c.closeDate||c.createdAt).getFullYear() === year)
      .reduce((s,c) => s + commissionAmount(c), 0),
    [commissions, year]);

  const ytdExpenses = useMemo(() =>
    expenses
      .filter(e => new Date(e.date).getFullYear() === year)
      .reduce((s,e) => s + Number(e.amount||0), 0),
    [expenses, year]);

  const ytdNet = ytdIncomeReceived - ytdExpenses;
  const goalAmt = Number(goals.target) || 0;
  const goalPct = goalAmt > 0 ? Math.min(100, Math.round((ytdIncomeReceived / goalAmt) * 100)) : 0;

  // Per-month breakdown
  const monthly = useMemo(() => {
    const m = Object.fromEntries(monthsThisYear.map(k => [k, { income: 0, expenses: 0 }]));
    commissions.forEach(c => {
      if (c.status !== 'Received') return;
      const k = monthKey(c.closeDate || c.createdAt);
      if (m[k]) m[k].income += commissionAmount(c);
    });
    expenses.forEach(e => {
      const k = monthKey(e.date);
      if (m[k]) m[k].expenses += Number(e.amount||0);
    });
    return m;
  }, [commissions, expenses, monthsThisYear]);

  // Top expense categories
  const topCategories = useMemo(() => {
    const map = {};
    expenses
      .filter(e => new Date(e.date).getFullYear() === year)
      .forEach(e => { map[e.category] = (map[e.category]||0) + Number(e.amount||0); });
    return Object.entries(map)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, amt]) => ({ id, amt, label: CAT_BY_ID[id]?.label || id }));
  }, [expenses, year]);

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <button className="btn-back" style={{ marginBottom: 14 }} onClick={() => setPage?.('dashboard')}>
          <ArrowLeft size={13} /> Dashboard
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <PiggyBank size={22} color="#6ee7b7" />
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>Finances</h1>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, background: 'rgba(110,231,183,.15)', color: '#6ee7b7' }}>{year}</span>
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 760 }}>
          Track commissions in, expenses out, and your monthly progress toward your annual income goal. Categories map to IRS Schedule C lines for tax time.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap' }}>
        {[
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'income',    label: `💵 Income (${commissions.length})` },
          { id: 'expenses',  label: `🧾 Expenses (${expenses.length})` },
          { id: 'goals',     label: '🎯 Goals' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              color: tab === t.id ? '#6ee7b7' : '#475569',
              borderBottom: tab === t.id ? '2px solid #6ee7b7' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <DashboardTab
          year={year} ytdIncomeReceived={ytdIncomeReceived} ytdIncomeExpected={ytdIncomeExpected}
          ytdExpenses={ytdExpenses} ytdNet={ytdNet} goalAmt={goalAmt} goalPct={goalPct}
          monthly={monthly} monthsThisYear={monthsThisYear} topCategories={topCategories}
          setTab={setTab}
        />
      )}

      {tab === 'income' && (
        <IncomeTab
          commissions={commissions} setCommissions={setCommissions}
          year={year} toast={toast}
        />
      )}

      {tab === 'expenses' && (
        <ExpensesTab
          expenses={expenses} setExpenses={setExpenses}
          commissions={commissions}
          settings={settings} setSettings={setSettings}
          year={year} toast={toast}
        />
      )}

      {tab === 'goals' && (
        <GoalsTab
          goals={goals} setGoals={setGoals}
          monthly={monthly} monthsThisYear={monthsThisYear}
          year={year} toast={toast}
        />
      )}
    </div>
  );
}

// ─── DASHBOARD TAB ──────────────────────────────────────────────────────────
function DashboardTab({ year, ytdIncomeReceived, ytdIncomeExpected, ytdExpenses, ytdNet, goalAmt, goalPct, monthly, monthsThisYear, topCategories, setTab }) {
  const maxBar = Math.max(1, ...monthsThisYear.map(k => Math.max(monthly[k].income, monthly[k].expenses)));
  const currentMonth = new Date().getMonth();

  return (
    <div>
      {/* KPI cards */}
      <div className="grid-4" style={{ gap: 14, marginBottom: 22 }}>
        <div className="stat-card stat-card-3">
          <DollarSign size={20} className="stat-icon" />
          <div className="stat-label">Income (Received YTD)</div>
          <div className="stat-number">{fmtMoney(ytdIncomeReceived)}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>+ {fmtMoney(ytdIncomeExpected)} expected</div>
        </div>
        <div className="stat-card stat-card-2">
          <TrendingDown size={20} className="stat-icon" />
          <div className="stat-label">Expenses YTD</div>
          <div className="stat-number">{fmtMoney(ytdExpenses)}</div>
        </div>
        <div className="stat-card stat-card-1">
          <TrendingUp size={20} className="stat-icon" />
          <div className="stat-label">Net Profit YTD</div>
          <div className="stat-number" style={{ color: ytdNet >= 0 ? '#6ee7b7' : '#fda4af' }}>{fmtMoney(ytdNet)}</div>
        </div>
        <div className="stat-card stat-card-4">
          <Target size={20} className="stat-icon" />
          <div className="stat-label">Goal Progress</div>
          <div className="stat-number">{goalAmt > 0 ? `${goalPct}%` : '—'}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>
            {goalAmt > 0 ? `of ${fmtMoney(goalAmt)}` : <button onClick={() => setTab('goals')} style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontWeight: 700, padding: 0, fontSize: 11 }}>Set a goal →</button>}
          </div>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div className="glass-card" style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 800, color: '#fff', marginBottom: 4, fontSize: 15 }}>Monthly Breakdown — {year}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14 }}>
            <span style={{ width: 10, height: 10, background: '#10b981', borderRadius: 2 }} /> Income
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, background: '#f59e0b', borderRadius: 2 }} /> Expenses
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, paddingBottom: 24, position: 'relative' }}>
          {monthsThisYear.map((k, i) => {
            const m = monthly[k];
            const incH = (m.income / maxBar) * 150;
            const expH = (m.expenses / maxBar) * 150;
            const isCurrent = i === currentMonth;
            return (
              <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 150, width: '100%', justifyContent: 'center' }}>
                  <div title={`Income: ${fmtMoney(m.income)}`} style={{ width: 12, height: Math.max(2, incH), background: 'linear-gradient(180deg,#10b981,#059669)', borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
                  <div title={`Expenses: ${fmtMoney(m.expenses)}`} style={{ width: 12, height: Math.max(2, expH), background: 'linear-gradient(180deg,#f59e0b,#d97706)', borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
                </div>
                <div style={{ fontSize: 10, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? '#6ee7b7' : '#64748b', position: 'absolute', bottom: 0 }}>{MONTH_LABELS[i]}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid-2" style={{ gap: 14, marginBottom: 22 }}>
        {/* Top categories */}
        <div className="glass-card">
          <div style={{ fontWeight: 800, color: '#fff', marginBottom: 14, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={16} /> Top Expense Categories
          </div>
          {topCategories.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, padding: '14px 0' }}>No expenses logged yet. <button onClick={() => setTab('expenses')} style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer', fontWeight: 700, padding: 0 }}>Add one →</button></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topCategories.map(c => {
                const pct = ytdExpenses > 0 ? (c.amt / ytdExpenses) * 100 : 0;
                return (
                  <div key={c.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>{c.label}</span>
                      <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{fmtMoney(c.amt)}</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 99, height: 6 }}>
                      <div style={{ background: 'linear-gradient(90deg,#f59e0b,#d97706)', borderRadius: 99, height: 6, width: `${pct}%`, transition: 'width .3s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="glass-card">
          <div style={{ fontWeight: 800, color: '#fff', marginBottom: 14, fontSize: 15 }}>This Month — {MONTH_LABELS[currentMonth]} {year}</div>
          {(() => {
            const k = monthsThisYear[currentMonth];
            const m = monthly[k];
            const net = m.income - m.expenses;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label="Income (received)" value={fmtMoney(m.income)} color="#6ee7b7" />
                <Row label="Expenses" value={fmtMoney(m.expenses)} color="#fbbf24" />
                <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', margin: '4px 0' }} />
                <Row label="Net for the month" value={fmtMoney(net)} color={net >= 0 ? '#6ee7b7' : '#fda4af'} bold />
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: bold ? 800 : 600 }}>{label}</span>
      <span style={{ fontSize: bold ? 18 : 15, color, fontWeight: bold ? 900 : 700, fontFamily: bold ? "'DM Serif Display',serif" : 'inherit' }}>{value}</span>
    </div>
  );
}

// ─── INCOME TAB ─────────────────────────────────────────────────────────────
// Reads same `commissions` LS key as CommissionTracker so data is shared.
function IncomeTab({ commissions, setCommissions, year, toast }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blankIncome());

  function blankIncome() {
    return { address:'', client:'', salePrice:'', commissionPct:'3', status:'Expected', closeDate:'', side:'Listing', notes:'' };
  }

  const save = () => {
    if (!form.address.trim()) return toast.error('Address required');
    if (!form.salePrice) return toast.error('Sale price required');
    const entry = { ...form, commission: commissionAmount(form) };
    if (editId) {
      setCommissions(p => p.map(e => e.id === editId ? { ...e, ...entry } : e));
      toast.success('Updated');
      setEditId(null);
    } else {
      setCommissions(p => [{ id: uid(), ...entry, createdAt: new Date().toISOString() }, ...p]);
      toast.success('Commission added');
    }
    setForm(blankIncome());
    setShowForm(false);
  };

  const startEdit = (e) => {
    setEditId(e.id);
    setForm({ ...blankIncome(), ...e });
    setShowForm(true);
  };

  const remove = (id) => {
    if (!window.confirm('Delete this commission entry?')) return;
    setCommissions(p => p.filter(e => e.id !== id));
  };

  const sorted = [...commissions].sort((a,b) => new Date(b.closeDate||b.createdAt) - new Date(a.closeDate||a.createdAt));
  const totalReceived = sorted.filter(e => e.status === 'Received' && new Date(e.closeDate||e.createdAt).getFullYear() === year).reduce((s,e) => s + commissionAmount(e), 0);
  const totalExpected = sorted.filter(e => e.status === 'Expected' && new Date(e.closeDate||e.createdAt).getFullYear() === year).reduce((s,e) => s + commissionAmount(e), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div><div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Received {year}</div><div style={{ fontSize: 20, color: '#6ee7b7', fontWeight: 900, fontFamily: "'DM Serif Display',serif" }}>{fmtMoney(totalReceived)}</div></div>
          <div><div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Expected {year}</div><div style={{ fontSize: 20, color: '#fbbf24', fontWeight: 900, fontFamily: "'DM Serif Display',serif" }}>{fmtMoney(totalExpected)}</div></div>
        </div>
        <button className="btn btn-blue" onClick={() => { setShowForm(true); setEditId(null); setForm(blankIncome()); }}><Plus size={13} /> Add Commission</button>
      </div>

      {showForm && (
        <div className="glass-card" style={{ marginBottom: 20 }}>
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>{editId ? 'Edit Commission' : 'Add Commission'}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setEditId(null); }}><X size={13} /> Cancel</button>
          </div>
          <div className="grid-2" style={{ gap: 12 }}>
            <Field label="Property Address *"><input className="input" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="123 Main St, Plymouth MI" /></Field>
            <Field label="Client"><input className="input" value={form.client} onChange={e => setForm(f => ({...f, client: e.target.value}))} placeholder="John & Jane Smith" /></Field>
            <Field label="Sale Price"><input className="input" type="number" value={form.salePrice} onChange={e => setForm(f => ({...f, salePrice: e.target.value}))} placeholder="450000" /></Field>
            <Field label="Commission %"><input className="input" type="number" step="0.1" value={form.commissionPct} onChange={e => setForm(f => ({...f, commissionPct: e.target.value}))} /></Field>
            {form.salePrice && form.commissionPct && (
              <div style={{ gridColumn: '1/-1', padding: '10px 14px', background: 'rgba(16,185,129,.1)', borderRadius: 9, fontSize: 14, fontWeight: 700, color: '#6ee7b7' }}>
                Commission: {fmtMoney(commissionAmount(form))}
              </div>
            )}
            <Field label="Side"><select className="select" value={form.side} onChange={e => setForm(f => ({...f, side: e.target.value}))}>{['Listing','Buyer','Both/Dual'].map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Status"><select className="select" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>{['Expected','Received','Cancelled'].map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Close Date"><input className="input" type="date" value={form.closeDate} onChange={e => setForm(f => ({...f, closeDate: e.target.value}))} /></Field>
            <Field label="Notes" full><input className="input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Split, referral source, etc." /></Field>
          </div>
          <button className="btn btn-blue" style={{ marginTop: 14 }} onClick={save}><Save size={13} /> {editId ? 'Update' : 'Add'}</button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="glass-card">
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#475569' }}>
            <DollarSign size={44} style={{ marginBottom: 10, opacity: .4 }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>No commissions yet</div>
            <div style={{ fontSize: 13 }}>Add your first deal to start tracking income.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(e => (
            <div key={e.id} className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>{e.address}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {e.client || '—'} · {fmtDate(e.closeDate)} · {e.side || 'Listing'}
                  </div>
                  {e.notes && <div style={{ fontSize: 11, color: '#475569', marginTop: 4, fontStyle: 'italic' }}>{e.notes}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#6ee7b7', fontFamily: "'DM Serif Display',serif" }}>{fmtMoney(commissionAmount(e))}</div>
                  <div style={{ fontSize: 10, color: '#475569' }}>{e.commissionPct}% of {fmtMoney(e.salePrice)}</div>
                </div>
                <span className={`badge ${e.status === 'Received' ? 'badge-green' : e.status === 'Expected' ? 'badge-gold' : 'badge-gray'}`}>{e.status}</span>
                <button className="btn btn-ghost btn-icon btn-xs" onClick={() => startEdit(e)}><Edit3 size={12} /></button>
                <button className="btn btn-danger btn-icon btn-xs" onClick={() => remove(e.id)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EXPENSES TAB ───────────────────────────────────────────────────────────
function ExpensesTab({ expenses, setExpenses, commissions, settings, setSettings, year, toast }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [mode, setMode] = useState('expense'); // 'expense' | 'mileage'
  const [form, setForm] = useState(blankExpense());
  const [filterMonth, setFilterMonth] = useState('all'); // 'all' | 'YYYY-MM'
  const [filterCat, setFilterCat] = useState('all');
  const fileInputRef = useRef(null);

  function blankExpense() {
    return {
      date: todayISO(), amount: '', category: 'advertising', description: '', vendor: '',
      paymentMethod: 'Card', dealId: '', receiptDataURL: '', notes: '',
      mileageType: '', miles: '', fromAddress: '', toAddress: '',
    };
  }

  // When the user enters miles, auto-fill amount from miles × rate
  const milesToAmount = (miles) => Number(((Number(miles)||0) * Number(settings.mileageRate||0.70)).toFixed(2));

  const handlePhoto = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Receipt too large (5MB max)');
    const reader = new FileReader();
    reader.onload = (ev) => setForm(f => ({ ...f, receiptDataURL: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (mode === 'mileage') {
      if (!form.miles || Number(form.miles) <= 0) return toast.error('Miles required');
      const amount = milesToAmount(form.miles);
      const entry = { ...form, category: 'mileage', amount, description: form.description || `${form.mileageType || 'Business'} drive — ${form.miles} mi @ $${settings.mileageRate}/mi` };
      writeEntry(entry);
    } else {
      if (!form.amount || Number(form.amount) <= 0) return toast.error('Amount required');
      writeEntry(form);
    }
  };

  const writeEntry = (entry) => {
    const clean = { ...entry, amount: Number(entry.amount) };
    if (editId) {
      setExpenses(p => p.map(e => e.id === editId ? { ...e, ...clean } : e));
      toast.success('Updated');
      setEditId(null);
    } else {
      setExpenses(p => [{ id: uid(), ...clean, createdAt: new Date().toISOString() }, ...p]);
      toast.success(mode === 'mileage' ? 'Mileage logged' : 'Expense added');
    }
    setForm(blankExpense());
    setShowForm(false);
    setMode('expense');
  };

  const startEdit = (e) => {
    setEditId(e.id);
    setMode(e.category === 'mileage' && e.miles ? 'mileage' : 'expense');
    setForm({ ...blankExpense(), ...e });
    setShowForm(true);
  };

  const remove = (id) => {
    if (!window.confirm('Delete this expense?')) return;
    setExpenses(p => p.filter(e => e.id !== id));
  };

  // Filter + sort
  const filtered = useMemo(() => {
    return expenses
      .filter(e => filterMonth === 'all' || monthKey(e.date) === filterMonth)
      .filter(e => filterCat === 'all' || e.category === filterCat)
      .sort((a,b) => new Date(b.date) - new Date(a.date));
  }, [expenses, filterMonth, filterCat]);

  const filteredTotal = filtered.reduce((s,e) => s + Number(e.amount||0), 0);

  // Available month options
  const monthOptions = useMemo(() => {
    const set = new Set(expenses.map(e => monthKey(e.date)));
    return Array.from(set).sort().reverse();
  }, [expenses]);

  // CSV export — Schedule C-friendly
  const exportCSV = () => {
    const rows = [
      ['Date','Amount','Category','Schedule C Line','Description','Vendor','Payment','Deal','Notes','Miles'],
      ...filtered.map(e => {
        const cat = CAT_BY_ID[e.category];
        const deal = commissions.find(c => c.id === e.dealId);
        return [
          e.date,
          (Number(e.amount)||0).toFixed(2),
          cat?.label || e.category,
          cat?.sc || '',
          (e.description||'').replace(/"/g,'""'),
          (e.vendor||'').replace(/"/g,'""'),
          e.paymentMethod || '',
          deal ? deal.address : '',
          (e.notes||'').replace(/"/g,'""'),
          e.miles || '',
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${filterMonth === 'all' ? year : filterMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} expense${filtered.length===1?'':'s'}`);
  };

  return (
    <div>
      {/* Filter bar + actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '4px 10px' }}>
          <Filter size={13} color="#64748b" />
          <select className="select" style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 12, padding: '4px 0' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="all">All months ({year})</option>
            {monthOptions.map(m => <option key={m} value={m}>{new Date(m+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '4px 10px' }}>
          <Receipt size={13} color="#64748b" />
          <select className="select" style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 12, padding: '4px 0' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Filtered total: <span style={{ color: '#fbbf24', fontWeight: 800 }}>{fmtMoney(filteredTotal)}</span></div>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={filtered.length === 0}><Download size={12} /> Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setMode('mileage'); setShowForm(true); setEditId(null); setForm(blankExpense()); }}><Car size={12} /> Log Mileage</button>
          <button className="btn btn-blue" onClick={() => { setMode('expense'); setShowForm(true); setEditId(null); setForm(blankExpense()); }}><Plus size={13} /> Add Expense</button>
        </div>
      </div>

      {showForm && (
        <div className="glass-card" style={{ marginBottom: 20 }}>
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              {mode === 'mileage' ? <><Car size={16} /> {editId ? 'Edit Mileage' : 'Log Mileage'}</> : <><Receipt size={16} /> {editId ? 'Edit Expense' : 'Add Expense'}</>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!editId && (
                <>
                  <button className="btn btn-ghost btn-sm" style={{ opacity: mode==='expense'?1:.5 }} onClick={() => setMode('expense')}>Expense</button>
                  <button className="btn btn-ghost btn-sm" style={{ opacity: mode==='mileage'?1:.5 }} onClick={() => setMode('mileage')}>Mileage</button>
                </>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setEditId(null); }}><X size={13} /> Cancel</button>
            </div>
          </div>

          {mode === 'mileage' ? (
            <div className="grid-2" style={{ gap: 12 }}>
              <Field label="Date"><input className="input" type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} /></Field>
              <Field label="Trip Type">
                <select className="select" value={form.mileageType} onChange={e => setForm(f => ({...f, mileageType: e.target.value}))}>
                  <option value="">— Select —</option>
                  {MILEAGE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="From"><input className="input" value={form.fromAddress} onChange={e => setForm(f => ({...f, fromAddress: e.target.value}))} placeholder="Home / Office" /></Field>
              <Field label="To"><input className="input" value={form.toAddress} onChange={e => setForm(f => ({...f, toAddress: e.target.value}))} placeholder="123 Main St" /></Field>
              <Field label="Miles *"><input className="input" type="number" step="0.1" value={form.miles} onChange={e => setForm(f => ({...f, miles: e.target.value}))} placeholder="18.5" /></Field>
              <Field label={`Rate ($/mi) — IRS std`}>
                <input className="input" type="number" step="0.01" value={settings.mileageRate} onChange={e => setSettings(s => ({...s, mileageRate: Number(e.target.value)||0.70}))} />
              </Field>
              {form.miles && (
                <div style={{ gridColumn: '1/-1', padding: '10px 14px', background: 'rgba(251,191,36,.1)', borderRadius: 9, fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>
                  Deduction: {fmtMoney(milesToAmount(form.miles))} ({form.miles} mi × ${settings.mileageRate}/mi)
                </div>
              )}
              <Field label="Link to Deal (optional)" full>
                <select className="select" value={form.dealId} onChange={e => setForm(f => ({...f, dealId: e.target.value}))}>
                  <option value="">— None —</option>
                  {commissions.map(c => <option key={c.id} value={c.id}>{c.address} ({c.client || 'no client'})</option>)}
                </select>
              </Field>
              <Field label="Notes" full><input className="input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Round trip? Extra stops?" /></Field>
            </div>
          ) : (
            <div className="grid-2" style={{ gap: 12 }}>
              <Field label="Date"><input className="input" type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} /></Field>
              <Field label="Amount *"><input className="input" type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} placeholder="49.99" /></Field>
              <Field label="Category *" full>
                <select className="select" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label} ({c.sc})</option>)}
                </select>
                {CAT_BY_ID[form.category] && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>{CAT_BY_ID[form.category].note}</div>
                )}
                {form.category === 'client_gifts' && (
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={11} /> IRS caps client gift deductions at $25/recipient/year.</div>
                )}
                {form.category === 'meals' && (
                  <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={11} /> Only 50% deductible — log the full amount, the CPA halves it.</div>
                )}
              </Field>
              <Field label="Description"><input className="input" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Meta ads Feb campaign" /></Field>
              <Field label="Vendor"><input className="input" value={form.vendor} onChange={e => setForm(f => ({...f, vendor: e.target.value}))} placeholder="Facebook, Canva, Staples..." /></Field>
              <Field label="Payment Method">
                <select className="select" value={form.paymentMethod} onChange={e => setForm(f => ({...f, paymentMethod: e.target.value}))}>
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Link to Deal (optional)">
                <select className="select" value={form.dealId} onChange={e => setForm(f => ({...f, dealId: e.target.value}))}>
                  <option value="">— None —</option>
                  {commissions.map(c => <option key={c.id} value={c.id}>{c.address} ({c.client || 'no client'})</option>)}
                </select>
              </Field>
              <Field label="Notes" full><input className="input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Anything to remember at tax time" /></Field>
              <Field label="Receipt Photo" full>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePhoto(e.target.files?.[0])} />
                  <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>
                    <Camera size={12} /> {form.receiptDataURL ? 'Replace photo' : 'Upload receipt'}
                  </button>
                  {form.receiptDataURL && (
                    <>
                      <img src={form.receiptDataURL} alt="receipt" style={{ height: 60, borderRadius: 6, border: '1px solid rgba(255,255,255,.1)' }} />
                      <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setForm(f => ({...f, receiptDataURL: ''}))}><X size={11} /></button>
                    </>
                  )}
                </div>
              </Field>
            </div>
          )}

          <button className="btn btn-blue" style={{ marginTop: 14 }} onClick={save}><Save size={13} /> {editId ? 'Update' : (mode === 'mileage' ? 'Log Mileage' : 'Add Expense')}</button>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="glass-card">
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#475569' }}>
            <Receipt size={44} style={{ marginBottom: 10, opacity: .4 }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>{expenses.length === 0 ? 'No expenses yet' : 'No expenses match the filter'}</div>
            <div style={{ fontSize: 13 }}>{expenses.length === 0 ? 'Add your first expense or mileage entry above.' : 'Try a different month or category.'}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(e => {
            const cat = CAT_BY_ID[e.category];
            const deal = commissions.find(c => c.id === e.dealId);
            return (
              <div key={e.id} className="glass-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
                  {e.receiptDataURL && (
                    <img src={e.receiptDataURL} alt="receipt" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,.1)', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{e.description || cat?.label || 'Expense'}</span>
                      {e.category === 'mileage' && e.miles && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(251,191,36,.15)', color: '#fbbf24', fontWeight: 700 }}>🚗 {e.miles} mi</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {fmtDate(e.date)} · {cat?.label || e.category} {e.vendor && ` · ${e.vendor}`} {e.paymentMethod && ` · ${e.paymentMethod}`}
                    </div>
                    {deal && <div style={{ fontSize: 11, color: '#7eb8f7', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={10} /> {deal.address}</div>}
                    {e.notes && <div style={{ fontSize: 11, color: '#475569', marginTop: 3, fontStyle: 'italic' }}>{e.notes}</div>}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#fbbf24', fontFamily: "'DM Serif Display',serif" }}>{fmtMoney(e.amount)}</div>
                  <button className="btn btn-ghost btn-icon btn-xs" onClick={() => startEdit(e)}><Edit3 size={12} /></button>
                  <button className="btn btn-danger btn-icon btn-xs" onClick={() => remove(e.id)}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── GOALS TAB ──────────────────────────────────────────────────────────────
function GoalsTab({ goals, setGoals, monthly, monthsThisYear, year, toast }) {
  const goalAmt = Number(goals.target) || 0;
  const flatMonthly = goalAmt / 12;
  const overrides = goals.monthlyOverride || {};

  const targetFor = (mk) => Number(overrides[mk] ?? flatMonthly) || 0;
  const currentMonth = new Date().getMonth();

  // Quick math: "What you need to close to hit goal"
  const ytdReceived = monthsThisYear.reduce((s,k) => s + monthly[k].income, 0);
  const remaining = Math.max(0, goalAmt - ytdReceived);
  const monthsLeft = 12 - currentMonth;
  const needPerMonth = monthsLeft > 0 ? remaining / monthsLeft : 0;

  const updateOverride = (mk, val) => {
    setGoals(g => {
      const next = { ...(g.monthlyOverride||{}) };
      if (val === '' || val == null) delete next[mk];
      else next[mk] = Number(val);
      return { ...g, monthlyOverride: next };
    });
  };

  const clearOverrides = () => {
    if (!window.confirm('Reset all monthly overrides back to flat monthly target?')) return;
    setGoals(g => ({ ...g, monthlyOverride: {} }));
    toast.success('Monthly targets reset');
  };

  return (
    <div>
      {/* Annual target input */}
      <div className="glass-card" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 800, color: '#fff', marginBottom: 12, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={16} color="#a78bfa" /> Annual Income Goal — {year}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#94a3b8', fontSize: 14 }}>$</span>
          <input
            className="input"
            style={{ maxWidth: 200, fontSize: 18, fontWeight: 800 }}
            type="number"
            placeholder="150000"
            value={goals.target}
            onChange={e => setGoals(g => ({ ...g, target: e.target.value }))}
          />
          <span style={{ fontSize: 13, color: '#64748b' }}>commissions received this year</span>
        </div>
        {goalAmt > 0 && (
          <div style={{ marginTop: 16, padding: 14, background: 'rgba(139,92,246,.08)', borderRadius: 9, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
            <div style={{ marginBottom: 6 }}>📊 At flat monthly pacing, that's <strong style={{ color: '#a78bfa' }}>{fmtMoney(flatMonthly)}/month</strong>.</div>
            <div>🎯 You've received <strong style={{ color: '#6ee7b7' }}>{fmtMoney(ytdReceived)}</strong> YTD. To hit goal, you need to close <strong style={{ color: '#fbbf24' }}>{fmtMoney(remaining)}</strong> over the remaining <strong>{monthsLeft}</strong> month{monthsLeft===1?'':'s'} — about <strong style={{ color: '#fbbf24' }}>{fmtMoney(needPerMonth)}/month</strong>.</div>
          </div>
        )}
      </div>

      {/* Monthly progress */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontWeight: 800, color: '#fff', fontSize: 15 }}>Monthly Progress</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Override any month to set a seasonal target (e.g., higher in spring)</span>
            {Object.keys(overrides).length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearOverrides}>Reset all</button>
            )}
          </div>
        </div>

        {goalAmt === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: '#475569' }}>
            <div style={{ fontSize: 14 }}>Set an annual goal above to see your monthly breakdown.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {monthsThisYear.map((mk, i) => {
              const m = monthly[mk];
              const target = targetFor(mk);
              const pct = target > 0 ? Math.min(100, (m.income / target) * 100) : 0;
              const isOverride = overrides[mk] != null;
              const isCurrent = i === currentMonth;
              const isPast = i < currentMonth;
              const onTrack = m.income >= target;
              return (
                <div key={mk} style={{ background: isCurrent ? 'rgba(110,231,183,.04)' : 'transparent', padding: 10, borderRadius: 8, border: isCurrent ? '1px solid rgba(110,231,183,.15)' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? '#6ee7b7' : '#cbd5e1', minWidth: 60 }}>
                      {MONTH_LABELS[i]} {isCurrent && <span style={{ fontSize: 9, color: '#6ee7b7', marginLeft: 4 }}>NOW</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Target:</span>
                      <input
                        type="number"
                        placeholder={String(Math.round(flatMonthly))}
                        value={isOverride ? overrides[mk] : ''}
                        onChange={e => updateOverride(mk, e.target.value)}
                        style={{ width: 90, background: 'rgba(255,255,255,.04)', border: `1px solid ${isOverride ? 'rgba(167,139,250,.4)' : 'rgba(255,255,255,.06)'}`, borderRadius: 6, color: '#fff', padding: '4px 8px', fontSize: 12, fontWeight: 600 }}
                      />
                      <span style={{ fontSize: 12, color: '#fff', fontWeight: 800, minWidth: 80, textAlign: 'right' }}>
                        {fmtMoney(m.income)}<span style={{ color: '#475569', fontWeight: 500 }}> / {fmtMoney(target)}</span>
                      </span>
                      {isPast && (onTrack ? <CheckCircle size={13} color="#6ee7b7" /> : <AlertCircle size={13} color="#fda4af" />)}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: 99, height: 6 }}>
                    <div style={{
                      background: onTrack ? 'linear-gradient(90deg,#10b981,#059669)' : pct > 60 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#ef4444,#dc2626)',
                      borderRadius: 99, height: 6, width: `${pct}%`, transition: 'width .3s',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SHARED FIELD WRAPPER ───────────────────────────────────────────────────
function Field({ label, children, full }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}
