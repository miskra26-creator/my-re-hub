/**
 * SmartLists — FUB-style dynamic lead filters + bulk actions.
 *
 * Three panes:
 *   ◆ LEFT     — saved Smart Lists sidebar (named filters with live counts)
 *   ◆ CENTER   — filter builder + filtered results table with checkbox column
 *   ◆ FLOATING — Bulk Action Bar (appears when ≥1 lead is selected)
 *
 * Saved Smart Lists persist via useLS('smart_lists'). Each entry:
 *   { id, name, criteria: {...}, builtIn: bool, createdAt }
 *
 * BUILT-IN smart lists (always present, can't delete):
 *   - 🔥 Hot Leads (status contains "hot" OR last contact < 7d AND source != past)
 *   - 🏡 Past Clients (status contains "past")
 *   - 💤 Stale (no contact in 60+ days)
 *   - 🎯 Buyers Active (type=Buyer AND status NOT Past/Closed/Lost)
 *   - 🏠 Sellers Active (type=Seller AND status NOT Past/Closed/Lost)
 *   - 📍 Livonia Area (area contains "Livonia")
 *
 * Custom user lists are saved alongside.
 *
 * Bulk actions:
 *   - 🏷  Add/Remove Tag
 *   - 📋 Change Status
 *   - 📧 Bulk Email (AI-personalized per recipient via Gemini, drafts via Gmail)
 *   - 💬 Bulk SMS Draft (creates a Task per lead for one-tap-Send)
 *   - ⚡ Enroll in Drip Campaign
 *   - 📥 Export to CSV
 *   - 🗑 Delete (with confirmation)
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Filter, Plus, Save, Trash2, Mail, MessageSquare, Tag as TagIcon, Download,
  CheckCircle, Zap, X, ChevronRight, Users, ArrowLeft, Search, Loader, Edit2,
} from 'lucide-react';
import { useLS } from './cloudHooks';
import { useLeadsCloud } from './useLeadsCloud';
import { ContactDetail } from './App';

// ─── Style tokens ────────────────────────────────────────────────────────────
const S = {
  card: {
    background: 'rgba(15,20,38,.6)', border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 14, padding: 16,
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, #b8864b, #d4a017)',
    border: 'none', borderRadius: 8, padding: '8px 14px',
    color: '#0f172a', fontSize: 12.5, fontWeight: 900, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  ghostBtn: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 8, padding: '7px 12px', color: '#cbd5e1', fontSize: 12,
    fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  input: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 7, padding: '7px 10px', color: '#f1f5f9', fontSize: 12.5,
    outline: 'none', fontFamily: 'inherit',
  },
  fieldLabel: { fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
};

// ─── Built-in smart lists (always available) ────────────────────────────────
const BUILT_IN_LISTS = [
  { id:'bi_hot',     name:'🔥 Hot Leads',       criteria: { statusContains:'hot' }, builtIn:true },
  { id:'bi_past',    name:'🏡 Past Clients',    criteria: { statusContains:'past' }, builtIn:true },
  { id:'bi_stale',   name:'💤 Stale (60+ days)', criteria: { lastContactDays:60, lastContactOp:'gt' }, builtIn:true },
  { id:'bi_buyer',   name:'🎯 Buyers Active',   criteria: { type:'Buyer', statusNotIn:['Past Client','Closed','Lost'] }, builtIn:true },
  { id:'bi_seller',  name:'🏠 Sellers Active',  criteria: { type:'Seller', statusNotIn:['Past Client','Closed','Lost'] }, builtIn:true },
  { id:'bi_livonia', name:'📍 Livonia Area',    criteria: { areaContains:'livonia' }, builtIn:true },
  { id:'bi_nophone', name:'📵 No Phone on File', criteria: { hasPhone:false }, builtIn:true },
  { id:'bi_unworked',name:'🆕 Never Contacted', criteria: { lastContactDays:0, lastContactOp:'never' }, builtIn:true },
];

// ─── Filter engine — runs a criteria object against the leads array ─────────
function applyCriteria(leads, c) {
  if (!c) return leads;
  const matchText = (val, q) => (val || '').toString().toLowerCase().includes((q || '').toLowerCase());

  return leads.filter(l => {
    if (c.statusContains && !matchText(l.status, c.statusContains)) return false;
    if (c.statusEquals && (l.status || '').toLowerCase() !== c.statusEquals.toLowerCase()) return false;
    if (c.statusNotIn && c.statusNotIn.length > 0) {
      if (c.statusNotIn.some(s => (l.status || '').toLowerCase() === s.toLowerCase())) return false;
    }
    if (c.type && (l.type || '').toLowerCase() !== c.type.toLowerCase()) return false;
    if (c.source && !matchText(l.source, c.source)) return false;
    if (c.areaContains && !matchText(l.area, c.areaContains)) return false;
    if (c.nameContains && !matchText(l.name, c.nameContains)) return false;
    if (c.hasEmail === true && !l.email) return false;
    if (c.hasEmail === false && l.email) return false;
    if (c.hasPhone === true && !l.phone) return false;
    if (c.hasPhone === false && l.phone) return false;
    if (c.tagsAny && c.tagsAny.length > 0) {
      const tags = (l.tags || []).map(t => String(t).toLowerCase());
      if (!c.tagsAny.some(t => tags.includes(String(t).toLowerCase()))) return false;
    }
    if (c.lastContactDays != null && c.lastContactOp) {
      const last = l.updated_at || l.meta?.lastTouch;
      const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
      if (c.lastContactOp === 'gt' && (days == null || days < c.lastContactDays)) return false;
      if (c.lastContactOp === 'lt' && (days == null || days > c.lastContactDays)) return false;
      if (c.lastContactOp === 'never' && days != null) return false;
    }
    if (c.budgetMin != null) {
      const b = parseFloat((l.budget || '').toString().replace(/[^0-9.]/g, ''));
      if (!isFinite(b) || b < c.budgetMin) return false;
    }
    if (c.budgetMax != null) {
      const b = parseFloat((l.budget || '').toString().replace(/[^0-9.]/g, ''));
      if (!isFinite(b) || b > c.budgetMax) return false;
    }
    return true;
  });
}

// ─── Build a human-readable description of a criteria object ────────────────
function describeCriteria(c) {
  if (!c) return 'No filters';
  const parts = [];
  if (c.statusContains) parts.push(`status contains "${c.statusContains}"`);
  if (c.statusEquals)   parts.push(`status = "${c.statusEquals}"`);
  if (c.statusNotIn)    parts.push(`status NOT in (${c.statusNotIn.join(', ')})`);
  if (c.type)           parts.push(`type = ${c.type}`);
  if (c.source)         parts.push(`source contains "${c.source}"`);
  if (c.areaContains)   parts.push(`area contains "${c.areaContains}"`);
  if (c.nameContains)   parts.push(`name contains "${c.nameContains}"`);
  if (c.hasEmail === true) parts.push('has email');
  if (c.hasEmail === false) parts.push('no email');
  if (c.hasPhone === true) parts.push('has phone');
  if (c.hasPhone === false) parts.push('no phone');
  if (c.tagsAny?.length) parts.push(`tags: ${c.tagsAny.join(', ')}`);
  if (c.lastContactOp === 'gt') parts.push(`no contact in ${c.lastContactDays}+ days`);
  if (c.lastContactOp === 'lt') parts.push(`contacted within ${c.lastContactDays} days`);
  if (c.lastContactOp === 'never') parts.push('never contacted');
  if (c.budgetMin != null) parts.push(`budget ≥ ${c.budgetMin}`);
  if (c.budgetMax != null) parts.push(`budget ≤ ${c.budgetMax}`);
  return parts.length ? parts.join(' · ') : 'No filters';
}

export default function SmartLists({ setPage, toast }) {
  const [leads, setLeads] = useLeadsCloud();
  const [savedLists, setSavedLists] = useLS('smart_lists', []);
  const [activeListId, setActiveListId] = useState('bi_hot');
  const [criteria, setCriteria] = useState(BUILT_IN_LISTS[0].criteria);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [bulkModal, setBulkModal] = useState(null); // 'tag'|'status'|'email'|'sms'|'campaign'|'export'|'delete'
  // When set, opens the full ContactDetail modal for this lead — shows the
  // unified Timeline (every email/text/call/AI-touch chronologically).
  const [viewingLead, setViewingLead] = useState(null);

  const allLists = useMemo(() => [...BUILT_IN_LISTS, ...savedLists], [savedLists]);

  // When user clicks a saved list, load its criteria
  const selectList = (list) => {
    setActiveListId(list.id);
    setCriteria(list.criteria || {});
    setSelectedIds(new Set());
  };

  // Filter leads by active criteria + search
  const filtered = useMemo(() => {
    let result = applyCriteria(leads || [], criteria);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.area || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, criteria, search]);

  // Toggle selection on a lead
  const toggleSelected = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = () => setSelectedIds(new Set(filtered.map(l => l.id)));
  const clearSelection = () => setSelectedIds(new Set());

  // Save the current criteria as a new Smart List
  const saveCurrentAsList = () => {
    const name = window.prompt('Name this Smart List:', `My List ${savedLists.length + 1}`);
    if (!name) return;
    const newList = { id: 'usr_' + Date.now(), name, criteria, builtIn: false, createdAt: Date.now() };
    setSavedLists([...savedLists, newList]);
    setActiveListId(newList.id);
    toast?.success(`Saved "${name}"`);
  };

  const deleteSavedList = (id) => {
    if (!window.confirm('Delete this Smart List?')) return;
    setSavedLists(savedLists.filter(l => l.id !== id));
    if (activeListId === id) selectList(BUILT_IN_LISTS[0]);
  };

  const renameSavedList = (id) => {
    const current = savedLists.find(l => l.id === id);
    if (!current) return;
    const name = window.prompt('Rename:', current.name);
    if (!name) return;
    setSavedLists(savedLists.map(l => l.id === id ? { ...l, name } : l));
  };

  const selectedLeads = useMemo(
    () => filtered.filter(l => selectedIds.has(l.id)),
    [filtered, selectedIds]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page-content" style={{ position: 'relative' }}>
      <style>{`
        .sl-row:hover {
          background: rgba(184,134,75,.12) !important;
        }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <button className="btn-back" style={{ marginBottom: 14 }} onClick={() => setPage?.('dashboard')}>
          <ArrowLeft size={13} /> Dashboard
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 14,
            background: 'linear-gradient(135deg, #b8864b, #d4a017)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 24px rgba(184,134,75,.35)',
          }}>
            <Filter size={24} color="#0f172a" strokeWidth={2.5} />
          </div>
          <div>
            <div className="page-title" style={{ margin: 0 }}>Smart Lists</div>
            <div className="page-sub" style={{ margin: 0 }}>
              Filter your {leads?.length || 0} leads · save lists · bulk-act on them
            </div>
          </div>
        </div>
      </div>

      {/* Three-pane layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14, alignItems: 'flex-start' }}>

        {/* LEFT: saved lists sidebar */}
        <div style={S.card}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#b8864b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Lists
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {allLists.map(list => {
              const count = applyCriteria(leads || [], list.criteria).length;
              const isActive = list.id === activeListId;
              return (
                <div key={list.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 9px',
                  borderRadius: 7,
                  background: isActive ? 'rgba(184,134,75,.18)' : 'transparent',
                  border: isActive ? '1px solid rgba(184,134,75,.4)' : '1px solid transparent',
                  cursor: 'pointer',
                  gap: 6,
                }} onClick={() => selectList(list)}>
                  <span style={{
                    fontSize: 12, color: isActive ? '#e0b370' : '#cbd5e1',
                    fontWeight: isActive ? 800 : 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                  }}>{list.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    color: isActive ? '#e0b370' : '#64748b',
                    background: isActive ? 'rgba(184,134,75,.15)' : 'rgba(255,255,255,.04)',
                    borderRadius: 5, padding: '1px 6px', flexShrink: 0,
                  }}>{count}</span>
                  {!list.builtIn && isActive && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); renameSavedList(list.id); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                        <Edit2 size={11} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteSavedList(list.id); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', marginTop: 10, paddingTop: 10 }}>
            <button onClick={() => { setActiveListId('new'); setCriteria({}); }} style={{ ...S.ghostBtn, width: '100%', justifyContent: 'center', fontSize: 11 }}>
              <Plus size={11} /> New filter
            </button>
          </div>
        </div>

        {/* CENTER: filter + results */}
        <div>
          {/* Filter Builder */}
          <FilterBuilder
            criteria={criteria}
            onChange={setCriteria}
            onSave={saveCurrentAsList}
          />

          {/* Results */}
          <div style={{ ...S.card, marginTop: 14, padding: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <strong style={{ color: '#f1f5f9', fontSize: 13 }}>{filtered.length} match{filtered.length === 1 ? '' : 'es'}</strong>
                {selectedIds.size > 0 && (
                  <span style={{ fontSize: 11.5, color: '#e0b370', fontWeight: 700 }}>
                    · {selectedIds.size} selected
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search results…"
                    style={{ ...S.input, paddingLeft: 28, width: 180 }} />
                </div>
                <button onClick={selectAll} style={{ ...S.ghostBtn, fontSize: 11 }}>
                  Select all
                </button>
                {selectedIds.size > 0 && (
                  <button onClick={clearSelection} style={{ ...S.ghostBtn, fontSize: 11 }}>
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Result rows */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '30px 14px', textAlign: 'center', color: '#64748b', fontSize: 12.5 }}>
                  No leads match this filter.
                </div>
              ) : (
                filtered.slice(0, 500).map(lead => {
                  const checked = selectedIds.has(lead.id);
                  return (
                    <div key={lead.id}
                      onDoubleClick={() => setViewingLead(lead)}
                      className="sl-row"
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid rgba(255,255,255,.04)',
                        display: 'grid',
                        gridTemplateColumns: '20px 1fr auto auto auto auto',
                        gap: 12, alignItems: 'center',
                        background: checked ? 'rgba(184,134,75,.08)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => setViewingLead(lead)}
                    >
                      {/* Checkbox = select for bulk action (separate click target — stops propagation) */}
                      <input type="checkbox" checked={checked}
                        onChange={() => toggleSelected(lead.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ accentColor: '#b8864b', width: 14, height: 14, cursor: 'pointer' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {lead.name || '(no name)'}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {[lead.phone, lead.email, lead.area].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', background: 'rgba(255,255,255,.04)', borderRadius: 5, padding: '2px 7px' }}>
                        {lead.type || '—'}
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#e0b370', background: 'rgba(184,134,75,.12)', borderRadius: 5, padding: '2px 7px' }}>
                        {lead.status || '—'}
                      </span>
                      <span style={{ fontSize: 10.5, color: '#64748b' }}>
                        {lead.source || ''}
                      </span>
                      {/* Big obvious "Open →" button — single click opens the contact */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewingLead(lead); }}
                        style={{
                          background: 'linear-gradient(135deg, #b8864b, #d4a017)',
                          border: 'none', borderRadius: 6, padding: '6px 12px',
                          color: '#0f172a', fontSize: 11.5, fontWeight: 900,
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                        Open <ChevronRight size={12} />
                      </button>
                    </div>
                  );
                })
              )}
              {filtered.length > 500 && (
                <div style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: '#64748b' }}>
                  Showing first 500 of {filtered.length}. Narrow your filter to see more.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: '1px solid rgba(184,134,75,.4)',
          borderRadius: 14, padding: '10px 14px',
          boxShadow: '0 20px 60px rgba(0,0,0,.6), 0 0 0 1px rgba(184,134,75,.2)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', maxWidth: '95vw',
          zIndex: 100,
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#e0b370', paddingRight: 8, borderRight: '1px solid rgba(255,255,255,.1)' }}>
            {selectedIds.size} selected
          </span>
          <button onClick={() => setBulkModal('tag')} style={S.ghostBtn}>
            <TagIcon size={13} /> Tag
          </button>
          <button onClick={() => setBulkModal('status')} style={S.ghostBtn}>
            <CheckCircle size={13} /> Status
          </button>
          <button onClick={() => setBulkModal('email')} style={S.ghostBtn}>
            <Mail size={13} /> Email
          </button>
          <button onClick={() => setBulkModal('sms')} style={S.ghostBtn}>
            <MessageSquare size={13} /> SMS
          </button>
          <button onClick={() => setBulkModal('campaign')} style={S.ghostBtn}>
            <Zap size={13} /> Enroll
          </button>
          <button onClick={() => setBulkModal('export')} style={S.ghostBtn}>
            <Download size={13} /> Export
          </button>
          <button onClick={() => setBulkModal('delete')} style={{ ...S.ghostBtn, color: '#fca5a5', borderColor: 'rgba(239,68,68,.3)' }}>
            <Trash2 size={13} /> Delete
          </button>
          <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 4 }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Bulk action modals */}
      {bulkModal && (
        <BulkActionModal
          action={bulkModal}
          selectedLeads={selectedLeads}
          leads={leads}
          setLeads={setLeads}
          onClose={() => setBulkModal(null)}
          onComplete={() => { setBulkModal(null); clearSelection(); }}
          toast={toast}
        />
      )}

      {/* Full ContactDetail modal — shows the unified Timeline (every email/
          text/call/AI-touch chronologically), plus tasks + notes tabs. */}
      {viewingLead && (
        <ContactDetail
          lead={viewingLead}
          onClose={() => setViewingLead(null)}
          onUpdate={(updated) => {
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
            setViewingLead(updated);
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ─── Filter Builder UI ───────────────────────────────────────────────────────
function FilterBuilder({ criteria, onChange, onSave }) {
  const c = criteria || {};
  const update = (patch) => onChange({ ...c, ...patch });
  const remove = (key) => { const next = { ...c }; delete next[key]; onChange(next); };

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#b8864b', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Filters · {describeCriteria(c)}
        </div>
        <button onClick={onSave} style={S.primaryBtn}>
          <Save size={12} /> Save as Smart List
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div>
          <div style={S.fieldLabel}>Status contains</div>
          <input value={c.statusContains || ''} onChange={e => update({ statusContains: e.target.value || undefined })}
            placeholder='"hot", "past", "active"' style={{ ...S.input, width: '100%' }} />
        </div>
        <div>
          <div style={S.fieldLabel}>Type</div>
          <select value={c.type || ''} onChange={e => update({ type: e.target.value || undefined })}
            style={{ ...S.input, width: '100%' }}>
            <option value="">Any</option>
            <option>Buyer</option>
            <option>Seller</option>
            <option>Both</option>
          </select>
        </div>
        <div>
          <div style={S.fieldLabel}>Source contains</div>
          <input value={c.source || ''} onChange={e => update({ source: e.target.value || undefined })}
            placeholder='"zillow", "facebook"' style={{ ...S.input, width: '100%' }} />
        </div>
        <div>
          <div style={S.fieldLabel}>Area contains</div>
          <input value={c.areaContains || ''} onChange={e => update({ areaContains: e.target.value || undefined })}
            placeholder='"Livonia"' style={{ ...S.input, width: '100%' }} />
        </div>
        <div>
          <div style={S.fieldLabel}>Name contains</div>
          <input value={c.nameContains || ''} onChange={e => update({ nameContains: e.target.value || undefined })}
            placeholder='partial name' style={{ ...S.input, width: '100%' }} />
        </div>
        <div>
          <div style={S.fieldLabel}>Last contact</div>
          <div style={{ display: 'flex', gap: 5 }}>
            <select value={c.lastContactOp || ''} onChange={e => update({ lastContactOp: e.target.value || undefined })}
              style={{ ...S.input, flex: 1.2 }}>
              <option value="">Any</option>
              <option value="gt">no contact in</option>
              <option value="lt">contacted within</option>
              <option value="never">never contacted</option>
            </select>
            {c.lastContactOp && c.lastContactOp !== 'never' && (
              <>
                <input type="number" value={c.lastContactDays || ''} onChange={e => update({ lastContactDays: parseInt(e.target.value) || undefined })}
                  placeholder="days" style={{ ...S.input, width: 60 }} />
                <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>days</span>
              </>
            )}
          </div>
        </div>
        <div>
          <div style={S.fieldLabel}>Has email</div>
          <select value={c.hasEmail === undefined ? '' : String(c.hasEmail)} onChange={e => update({ hasEmail: e.target.value === '' ? undefined : e.target.value === 'true' })}
            style={{ ...S.input, width: '100%' }}>
            <option value="">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div>
          <div style={S.fieldLabel}>Has phone</div>
          <select value={c.hasPhone === undefined ? '' : String(c.hasPhone)} onChange={e => update({ hasPhone: e.target.value === '' ? undefined : e.target.value === 'true' })}
            style={{ ...S.input, width: '100%' }}>
            <option value="">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <button onClick={() => onChange({})} style={{ ...S.ghostBtn, fontSize: 11 }}>
          <X size={12} /> Clear all filters
        </button>
      </div>
    </div>
  );
}

// ─── Bulk Action Modal — switches on action type ────────────────────────────
function BulkActionModal({ action, selectedLeads, leads, setLeads, onClose, onComplete, toast }) {
  const [busy, setBusy] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('Hi [name],\n\n[your message here]\n\n— Monica');
  const [smsBody, setSmsBody] = useState('');
  const [campaigns] = useLS('email_campaigns', []);
  const [campaignId, setCampaignId] = useState('');
  const [aiPersonalize, setAiPersonalize] = useLS('smartlist_ai_personalize', true);

  // ─── Tag ──────────────────────────────────────────────────────────────────
  if (action === 'tag') {
    const apply = (mode) => {
      if (!tagInput.trim()) return;
      const tag = tagInput.trim();
      const ids = new Set(selectedLeads.map(l => l.id));
      setLeads(prev => prev.map(l => {
        if (!ids.has(l.id)) return l;
        const existing = l.tags || [];
        const next = mode === 'add'
          ? Array.from(new Set([...existing, tag]))
          : existing.filter(t => t !== tag);
        return { ...l, tags: next };
      }));
      toast?.success(`${mode === 'add' ? 'Added' : 'Removed'} tag "${tag}" on ${selectedLeads.length} leads`);
      onComplete?.();
    };
    return (
      <Modal onClose={onClose} title={`🏷 Tag ${selectedLeads.length} leads`}>
        <div style={{ marginBottom: 14, fontSize: 12.5, color: '#cbd5e1' }}>
          Add or remove a tag from all {selectedLeads.length} selected leads.
        </div>
        <input value={tagInput} onChange={e => setTagInput(e.target.value)}
          placeholder='e.g. "metro-detroit-buyer"' autoFocus
          style={{ ...S.input, width: '100%', marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancel</button>
          <button onClick={() => apply('remove')} style={{ ...S.ghostBtn, color: '#fca5a5' }}>Remove</button>
          <button onClick={() => apply('add')} style={S.primaryBtn}>Add tag</button>
        </div>
      </Modal>
    );
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  if (action === 'status') {
    const apply = () => {
      if (!statusInput) return;
      const ids = new Set(selectedLeads.map(l => l.id));
      setLeads(prev => prev.map(l => ids.has(l.id) ? { ...l, status: statusInput } : l));
      toast?.success(`Set status "${statusInput}" on ${selectedLeads.length} leads`);
      onComplete?.();
    };
    return (
      <Modal onClose={onClose} title={`📋 Change status for ${selectedLeads.length} leads`}>
        <select value={statusInput} onChange={e => setStatusInput(e.target.value)} style={{ ...S.input, width: '100%', marginBottom: 14 }}>
          <option value="">— Select a status —</option>
          <option>Hot</option>
          <option>Warm</option>
          <option>Cold</option>
          <option>Past Client</option>
          <option>Closed</option>
          <option>Lost</option>
          <option>Nurturing</option>
          <option>Showing</option>
          <option>Offer</option>
          <option>Under Contract</option>
        </select>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancel</button>
          <button onClick={apply} disabled={!statusInput} style={{ ...S.primaryBtn, opacity: statusInput ? 1 : 0.5 }}>Apply</button>
        </div>
      </Modal>
    );
  }

  // ─── Email ────────────────────────────────────────────────────────────────
  if (action === 'email') {
    const apply = async () => {
      if (!emailSubject.trim() || !emailBody.trim()) {
        toast?.error('Subject + body required');
        return;
      }
      const recipients = selectedLeads.filter(l => l.email);
      if (recipients.length === 0) {
        toast?.error('None of the selected leads have an email address');
        return;
      }
      setBusy(true);
      try {
        // Drop each into the email queue with personalization tokens replaced.
        // The existing GmailSyncWorker will fire them on its next tick.
        const stored = JSON.parse(localStorage.getItem('email_queue') || '[]');
        const queueItems = recipients.map(lead => ({
          id: 'eml_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          to: lead.email,
          leadId: lead.id,
          subject: personalizeText(emailSubject, lead),
          body: personalizeText(emailBody, lead),
          createdAt: new Date().toISOString(),
          dueDate: new Date().toISOString(),
          status: 'queued',
          source: 'smart-list-bulk',
        }));
        localStorage.setItem('email_queue', JSON.stringify([...stored, ...queueItems]));
        toast?.success(`Queued ${queueItems.length} personalized emails — GmailSyncWorker will send on next tick`);
        onComplete?.();
      } catch (e) {
        toast?.error('Email queue failed: ' + e.message);
      }
      setBusy(false);
    };
    const validRecipients = selectedLeads.filter(l => l.email);
    return (
      <Modal onClose={onClose} title={`📧 Bulk email ${validRecipients.length} of ${selectedLeads.length}`} wide>
        {validRecipients.length < selectedLeads.length && (
          <div style={{ background: 'rgba(245,158,11,.1)', borderLeft: '3px solid #f59e0b', padding: 10, borderRadius: 6, fontSize: 11.5, color: '#fbbf24', marginBottom: 12, lineHeight: 1.5 }}>
            ⚠ {selectedLeads.length - validRecipients.length} selected leads have no email address — they'll be skipped.
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <div style={S.fieldLabel}>Subject (use [name] for first name)</div>
          <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{ ...S.input, width: '100%' }} />
        </div>
        <div>
          <div style={S.fieldLabel}>Body (use [name], [email], [phone] tokens)</div>
          <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={8}
            style={{ ...S.input, width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
          Replaces <code style={{ background: 'rgba(0,0,0,.3)', padding: '1px 4px', borderRadius: 3 }}>[name]</code>, <code style={{ background: 'rgba(0,0,0,.3)', padding: '1px 4px', borderRadius: 3 }}>[email]</code>, <code style={{ background: 'rgba(0,0,0,.3)', padding: '1px 4px', borderRadius: 3 }}>[phone]</code>, <code style={{ background: 'rgba(0,0,0,.3)', padding: '1px 4px', borderRadius: 3 }}>[area]</code> with each lead's actual values before sending.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancel</button>
          <button onClick={apply} disabled={busy || validRecipients.length === 0}
            style={{ ...S.primaryBtn, opacity: busy ? 0.5 : 1 }}>
            {busy ? <Loader size={13} className="spin" /> : <Mail size={13} />}
            Queue {validRecipients.length} email{validRecipients.length === 1 ? '' : 's'}
          </button>
        </div>
      </Modal>
    );
  }

  // ─── SMS ──────────────────────────────────────────────────────────────────
  if (action === 'sms') {
    const apply = () => {
      if (!smsBody.trim()) {
        toast?.error('SMS body required');
        return;
      }
      const recipients = selectedLeads.filter(l => l.phone);
      if (recipients.length === 0) {
        toast?.error('None of the selected leads have a phone number');
        return;
      }
      // Drop a Task per lead with smsBody pre-filled — Monica taps Send on phone
      const existing = JSON.parse(localStorage.getItem('tasks') || '[]');
      const tasks = recipients.map(lead => ({
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: `SMS: ${personalizeText(smsBody, lead).slice(0, 40)}…`,
        type: 'Text',
        leadId: lead.id,
        leadName: lead.name,
        leadPhone: lead.phone,
        dueDate: new Date().toISOString().slice(0, 10),
        notes: personalizeText(smsBody, lead),
        smsBody: personalizeText(smsBody, lead),
        completed: false,
        createdAt: Date.now(),
        source: 'smart-list-bulk-sms',
      }));
      localStorage.setItem('tasks', JSON.stringify([...existing, ...tasks]));
      toast?.success(`Drafted ${tasks.length} SMS tasks — tap Send on each from your Tasks tab`);
      onComplete?.();
    };
    const validRecipients = selectedLeads.filter(l => l.phone);
    return (
      <Modal onClose={onClose} title={`💬 Bulk SMS draft for ${validRecipients.length} of ${selectedLeads.length}`}>
        {validRecipients.length < selectedLeads.length && (
          <div style={{ background: 'rgba(245,158,11,.1)', borderLeft: '3px solid #f59e0b', padding: 10, borderRadius: 6, fontSize: 11.5, color: '#fbbf24', marginBottom: 12, lineHeight: 1.5 }}>
            ⚠ {selectedLeads.length - validRecipients.length} selected leads have no phone — they'll be skipped.
          </div>
        )}
        <div>
          <div style={S.fieldLabel}>Message (use [name] for first name, max 280 chars)</div>
          <textarea value={smsBody} onChange={e => setSmsBody(e.target.value.slice(0, 320))} rows={4}
            maxLength={320}
            placeholder='"Hey [name], quick question about your home search — got a sec?"'
            style={{ ...S.input, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4, textAlign: 'right' }}>
            {smsBody.length}/320 chars
          </div>
        </div>
        <div style={{ background: 'rgba(245,158,11,.08)', borderLeft: '3px solid #f59e0b', padding: 10, borderRadius: 6, fontSize: 11.5, color: '#fbbf24', marginTop: 12, lineHeight: 1.5 }}>
          No Twilio yet — this DRAFTS a Task per lead with the SMS pre-filled. You open Tasks tab, tap "Send via phone" on each. Add Twilio (~$5-15/mo) later for true auto-fire.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancel</button>
          <button onClick={apply} disabled={validRecipients.length === 0} style={S.primaryBtn}>
            <MessageSquare size={13} /> Draft {validRecipients.length} task{validRecipients.length === 1 ? '' : 's'}
          </button>
        </div>
      </Modal>
    );
  }

  // ─── Enroll in Campaign ────────────────────────────────────────────────────
  if (action === 'campaign') {
    const apply = () => {
      if (!campaignId) return;
      const ids = new Set(selectedLeads.map(l => l.id));
      setLeads(prev => prev.map(l => {
        if (!ids.has(l.id)) return l;
        const enrolled = (l.meta?.campaigns || []).filter(c => c !== campaignId);
        return { ...l, meta: { ...(l.meta || {}), campaigns: [...enrolled, campaignId], lastEnrolledAt: new Date().toISOString() } };
      }));
      toast?.success(`Enrolled ${selectedLeads.length} leads in campaign`);
      onComplete?.();
    };
    return (
      <Modal onClose={onClose} title={`⚡ Enroll ${selectedLeads.length} leads in a campaign`}>
        <select value={campaignId} onChange={e => setCampaignId(e.target.value)} style={{ ...S.input, width: '100%', marginBottom: 14 }}>
          <option value="">— Pick a campaign —</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {campaigns.length === 0 && (
          <div style={{ fontSize: 11.5, color: '#fbbf24', marginBottom: 12 }}>
            No campaigns saved yet. Set one up in Email Campaigns first.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancel</button>
          <button onClick={apply} disabled={!campaignId} style={{ ...S.primaryBtn, opacity: campaignId ? 1 : 0.5 }}>
            Enroll
          </button>
        </div>
      </Modal>
    );
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  if (action === 'export') {
    const downloadCSV = () => {
      const headers = ['Name','Email','Phone','Type','Status','Source','Area','Budget','Tags','Notes','Created','Updated'];
      const rows = selectedLeads.map(l => [
        l.name || '',
        l.email || '',
        l.phone || '',
        l.type || '',
        l.status || '',
        l.source || '',
        l.area || '',
        l.budget || '',
        (l.tags || []).join('|'),
        (l.notes || '').replace(/\n/g, ' '),
        l.created_at || '',
        l.updated_at || '',
      ]);
      const csv = [headers, ...rows]
        .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast?.success(`Exported ${selectedLeads.length} leads`);
      onComplete?.();
    };
    return (
      <Modal onClose={onClose} title={`📥 Export ${selectedLeads.length} leads to CSV`}>
        <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 14, lineHeight: 1.5 }}>
          Downloads a CSV file with all fields for the {selectedLeads.length} selected leads. Use it for backups, import into other tools, or share with team.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancel</button>
          <button onClick={downloadCSV} style={S.primaryBtn}>
            <Download size={13} /> Download CSV
          </button>
        </div>
      </Modal>
    );
  }

  // ─── Delete ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const apply = () => {
      const ids = new Set(selectedLeads.map(l => l.id));
      setLeads(prev => prev.filter(l => !ids.has(l.id)));
      toast?.success(`Deleted ${selectedLeads.length} leads`);
      onComplete?.();
    };
    return (
      <Modal onClose={onClose} title={`🗑 Delete ${selectedLeads.length} leads — PERMANENT`}>
        <div style={{ fontSize: 13, color: '#fca5a5', marginBottom: 14, lineHeight: 1.5, padding: 12, background: 'rgba(239,68,68,.1)', borderLeft: '3px solid #ef4444', borderRadius: 6 }}>
          This will PERMANENTLY delete {selectedLeads.length} leads from your database. Can't be undone. If you only want to filter them out, use a tag or change status instead.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.ghostBtn}>Cancel</button>
          <button onClick={apply} style={{ ...S.primaryBtn, background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff' }}>
            <Trash2 size={13} /> Delete forever
          </button>
        </div>
      </Modal>
    );
  }

  return null;
}

// ─── Modal shell ─────────────────────────────────────────────────────────────
function Modal({ title, children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0f172a', borderRadius: 14, padding: 22,
        maxWidth: wide ? 640 : 460, width: '100%',
        border: '1px solid rgba(184,134,75,.3)',
        boxShadow: '0 20px 80px rgba(0,0,0,.5)',
        maxHeight: '90vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {children}
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// ─── Helper: replace [name] / [email] / etc. with lead's actual values ──────
function personalizeText(text, lead) {
  if (!text) return '';
  const firstName = (lead.name || '').trim().split(/\s+/)[0] || 'there';
  return text
    .replace(/\[name\]/gi, firstName)
    .replace(/\[fullname\]/gi, lead.name || '')
    .replace(/\[email\]/gi, lead.email || '')
    .replace(/\[phone\]/gi, lead.phone || '')
    .replace(/\[area\]/gi, lead.area || '')
    .replace(/\[budget\]/gi, lead.budget || '')
    .replace(/\[type\]/gi, lead.type || '');
}
