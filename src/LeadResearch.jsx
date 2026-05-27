import { useState, useMemo } from 'react';
import { useLeadsCloud } from './useLeadsCloud';
import { researchLead, briefToText } from './aiLeadResearch';
import {
  Search, ArrowLeft, Loader, Copy, ExternalLink, AlertCircle, UserCheck,
} from 'lucide-react';

const FIELD = {
  background: 'rgba(255,255,255,.04)', color: '#fff',
  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
  padding: '9px 11px', fontSize: 13, width: '100%', boxSizing: 'border-box',
};
const LABEL = { fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4, display: 'block' };

const CONF_COLOR = { HIGH: '#10b981', MEDIUM: '#e0b370', LOW: '#f87171' };

const EMPTY = { name: '', email: '', phone: '', address: '', city: '', company: '', social: '', notes: '' };

const LeadResearch = ({ setPage, toast }) => {
  const [leads] = useLeadsCloud();
  const [form, setForm] = useState(EMPTY);
  const [leadQuery, setLeadQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const matches = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    if (!q) return [];
    return (leads || []).filter(l =>
      (l.name || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q)
    ).slice(0, 6);
  }, [leadQuery, leads]);

  const pickLead = (l) => {
    setForm({
      name: l.name || '',
      email: l.email || '',
      phone: l.phone || '',
      address: l.address || '',
      city: l.area || '',
      company: l.meta?.company || '',
      social: '',
      notes: l.notes || '',
    });
    setLeadQuery('');
    setBrief(null);
    setError(null);
  };

  const canRun = (form.name || form.email || form.phone || form.address).trim().length > 0;

  const run = async () => {
    setLoading(true); setError(null); setBrief(null);
    try {
      const result = await researchLead(form);
      setBrief(result);
      toast?.success?.('Research brief ready');
    } catch (e) {
      setError(e.message);
      toast?.error?.('Research failed: ' + e.message);
    }
    setLoading(false);
  };

  const copyBrief = () => {
    const txt = briefToText(brief, form);
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
    toast?.success?.('Brief copied to clipboard');
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <button onClick={() => setPage('dashboard')} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          color: '#7eb8f7', cursor: 'pointer', fontSize: 12, fontWeight: 700, marginBottom: 10, padding: 0,
        }}>
          <ArrowLeft size={14} /> Dashboard
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Search size={22} color="#7eb8f7" />
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>Lead Research</h1>
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', maxWidth: 720 }}>
          Give it a name, email, phone, or address and it searches the public web — finding public profiles when they exist plus other public info — then writes you a 3-minute prep brief.
        </div>
      </div>

      {/* Honest scope note */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 13px', marginBottom: 18, background: 'rgba(126,184,247,.07)', border: '1px solid rgba(126,184,247,.2)', borderRadius: 10, fontSize: 11.5, color: '#9fc3ef', lineHeight: 1.5 }}>
        <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Searches <strong>public</strong> web info only. It can surface public Facebook/Instagram/LinkedIn or business profiles when they're indexed — it can't open private accounts (no tool can). Best results when you add an email or city to pin down the right person.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: brief || loading || error ? '380px 1fr' : '1fr', gap: 18, alignItems: 'start' }}>
        {/* Input card */}
        <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '18px 20px' }}>
          {/* Prefill from a saved lead */}
          <label style={LABEL}>Start from a saved lead (optional)</label>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input value={leadQuery} onChange={e => setLeadQuery(e.target.value)} placeholder="Search your leads by name, email, phone…" style={FIELD} />
            {matches.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, marginTop: 4, background: '#111927', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                {matches.map(l => (
                  <button key={l.id} onClick={() => pickLead(l)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '8px 11px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,.05)', cursor: 'pointer', color: '#fff',
                  }}>
                    <UserCheck size={13} color="#7eb8f7" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{l.name || '(no name)'}</span>
                      <span style={{ fontSize: 10.5, color: '#94a3b8', display: 'block' }}>{l.email || l.phone || l.area}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {[
            ['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'],
            ['address', 'Address'], ['city', 'City / Area'], ['company', 'Company / Employer'],
            ['social', 'Known handle or profile URL'],
          ].map(([k, label]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <label style={LABEL}>{label}</label>
              <input value={form[k]} onChange={set(k)} style={FIELD} />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Notes you already have</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3} style={{ ...FIELD, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={run} disabled={!canRun || loading} style={{
              flex: 1, padding: '12px', borderRadius: 10, border: 'none',
              background: (!canRun || loading) ? 'rgba(126,184,247,.25)' : 'linear-gradient(135deg, #2563eb, #7eb8f7)',
              color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: (!canRun || loading) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
              {loading ? <><Loader size={15} className="spin" /> Researching…</> : <><Search size={15} /> Research this lead</>}
            </button>
            <button onClick={() => { setForm(EMPTY); setBrief(null); setError(null); }} style={{
              padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)',
              background: 'none', color: '#94a3b8', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}>Clear</button>
          </div>
        </div>

        {/* Result */}
        {(loading || error || brief) && (
          <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '20px 22px', minHeight: 200 }}>
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '50px 0', color: '#94a3b8' }}>
                <Loader size={28} className="spin" color="#7eb8f7" />
                <div style={{ fontSize: 13 }}>Searching the public web…</div>
              </div>
            )}
            {error && !loading && (
              <div style={{ display: 'flex', gap: 8, padding: '12px 14px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, fontSize: 12.5, color: '#f87171' }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
              </div>
            )}
            {brief && !loading && (
              <ResultBrief brief={brief} onCopy={copyBrief} />
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 10, fontWeight: 800, color: '#7eb8f7', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 6 }}>{title}</div>
    {children}
  </div>
);

const Bullets = ({ items, color = '#cbd5e1' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    {items.map((t, i) => (
      <div key={i} style={{ fontSize: 12, color, lineHeight: 1.5, display: 'flex', gap: 7 }}>
        <span style={{ color: '#475569' }}>•</span><span>{t}</span>
      </div>
    ))}
  </div>
);

const ResultBrief = ({ brief, onCopy }) => {
  const cc = CONF_COLOR[brief.confidence] || '#94a3b8';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.4, marginBottom: 6 }}>{brief.identity}</div>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 8, background: `${cc}22`, color: cc }}>
            {brief.confidence || '?'} CONFIDENCE
          </span>
          {brief.confidenceWhy && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{brief.confidenceWhy}</span>}
        </div>
        <button onClick={onCopy} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 8,
          background: 'rgba(126,184,247,.12)', color: '#7eb8f7', border: '1px solid rgba(126,184,247,.3)',
          fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
        }}><Copy size={13} /> Copy</button>
      </div>

      {brief.found?.length > 0 && <Section title="Found online"><Bullets items={brief.found} /></Section>}

      {brief.profiles?.length > 0 && (
        <Section title="Profiles">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {brief.profiles.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,.03)', textDecoration: 'none', border: '1px solid rgba(255,255,255,.06)',
              }}>
                <ExternalLink size={13} color="#7eb8f7" />
                <span style={{ fontSize: 11.5, color: '#7eb8f7', fontWeight: 700 }}>{p.platform}</span>
                {p.note && <span style={{ fontSize: 11, color: '#94a3b8' }}>— {p.note}</span>}
              </a>
            ))}
          </div>
        </Section>
      )}

      {brief.propertyContext && brief.propertyContext !== 'Unknown' && (
        <Section title="Property / area"><div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{brief.propertyContext}</div></Section>
      )}
      {brief.signals?.length > 0 && <Section title="Signals"><Bullets items={brief.signals} color="#e0b370" /></Section>}
      {brief.talkingPoints?.length > 0 && <Section title="Talking points"><Bullets items={brief.talkingPoints} /></Section>}
      {brief.questionsToAsk?.length > 0 && <Section title="Questions to ask"><Bullets items={brief.questionsToAsk} /></Section>}
      {brief.approach && (
        <Section title="Approach"><div style={{ fontSize: 12, color: '#6ee7b7', lineHeight: 1.5 }}>{brief.approach}</div></Section>
      )}
      {brief.gaps?.length > 0 && <Section title="Still unknown — verify yourself"><Bullets items={brief.gaps} color="#94a3b8" /></Section>}

      {brief.sources?.length > 0 && (
        <Section title="Sources">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {brief.sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{
                fontSize: 10.5, color: '#7eb8f7', textDecoration: 'none', padding: '3px 8px',
                background: 'rgba(126,184,247,.08)', borderRadius: 6, border: '1px solid rgba(126,184,247,.15)',
              }}>{s.title || s.url} ↗</a>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

export default LeadResearch;
