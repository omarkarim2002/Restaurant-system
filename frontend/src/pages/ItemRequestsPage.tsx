import React, { useState } from 'react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

function useRequests(status?: string) {
  return useQuery({
    queryKey: ['item-requests', status],
    queryFn: () => api.get(`/inventory/requests${status ? `?status=${status}` : ''}`).then(r => r.data.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
function useCounts() {
  return useQuery({ queryKey: ['request-counts'], queryFn: () => api.get('/inventory/requests/counts').then(r => r.data.data), staleTime: 15_000, refetchInterval: 30_000 });
}
function useItems() {
  return useQuery({ queryKey: ['inventory-items'], queryFn: () => api.get('/inventory/items').then(r => r.data.data), staleTime: 60_000 });
}
function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: any) => api.post('/inventory/requests', b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['item-requests'] }); qc.invalidateQueries({ queryKey: ['request-counts'] }); },
  });
}
function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: any) => api.patch(`/inventory/requests/${id}`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['item-requests'] }); qc.invalidateQueries({ queryKey: ['request-counts'] }); },
  });
}

const URGENCY: Record<string, { bg: string; text: string; border: string; label: string; dot: string }> = {
  urgent: { bg: '#fde8ec', text: '#9e1830', border: '#f5b8c4', label: 'Urgent', dot: '#C41E3A' },
  normal: { bg: '#e6f1fb', text: '#0c447c', border: '#85b7eb', label: 'Normal', dot: '#85b7eb' },
  low:    { bg: '#f1efe8', text: '#5f5e5a', border: '#d3d1c7', label: 'Low',    dot: '#b4b2a9' },
};

const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  pending:      { bg: '#faeeda', text: '#854f0b', label: 'Pending' },
  acknowledged: { bg: '#e6f1fb', text: '#0c447c', label: 'On the way' },
  purchased:    { bg: '#eaf3de', text: '#27500a', label: 'Purchased' },
  cancelled:    { bg: '#f1efe8', text: '#5f5e5a', label: 'Cancelled' },
};

// ── New request modal ──────────────────────────────────────────────────────────
function NewRequestModal({ onClose }: { onClose: () => void }) {
  const { data: items = [] } = useItems();
  const create = useCreate();
  const [mode, setMode] = useState<'inventory' | 'custom'>('inventory');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [customName, setCustomName] = useState('');
  const [qty, setQty] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'urgent'>('normal');
  const [notes, setNotes] = useState('');

  const filtered = items.filter((i: any) => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 15);

  async function handleSubmit() {
    if (mode === 'inventory' && !selected) return;
    if (mode === 'custom' && !customName) return;
    try {
      await create.mutateAsync({
        item_id: mode === 'inventory' ? selected.id : null,
        custom_item: mode === 'custom' ? customName : null,
        quantity_needed: qty,
        urgency,
        notes,
      });
      onClose();
    } catch (e: any) { alert(e.response?.data?.error || 'Failed.'); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '460px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Flag an item</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem' }}>
            <button onClick={() => setMode('inventory')} style={{ flex: 1, padding: '8px', fontSize: '12px', background: mode === 'inventory' ? '#fde8ec' : 'transparent', border: mode === 'inventory' ? '2px solid #C41E3A' : '0.5px solid var(--color-border-secondary)', borderRadius: '7px', color: mode === 'inventory' ? '#C41E3A' : 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: mode === 'inventory' ? 500 : 400 }}>From inventory</button>
            <button onClick={() => setMode('custom')} style={{ flex: 1, padding: '8px', fontSize: '12px', background: mode === 'custom' ? '#fde8ec' : 'transparent', border: mode === 'custom' ? '2px solid #C41E3A' : '0.5px solid var(--color-border-secondary)', borderRadius: '7px', color: mode === 'custom' ? '#C41E3A' : 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: mode === 'custom' ? 500 : 400 }}>Custom item</button>
          </div>

          {mode === 'inventory' ? (
            !selected ? (
              <>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inventory…" autoFocus style={{ marginBottom: '12px', width: '100%' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                  {filtered.map((item: any) => (
                    <div key={item.id} onClick={() => setSelected(item)} style={{ padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>
                      <div style={{ fontWeight: 500 }}>{item.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>{item.unit}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: '7px', padding: '10px 12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{selected.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{selected.unit}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer' }}>change</button>
              </div>
            )
          ) : (
            <div className="form-group"><label className="form-label">What do you need?</label>
              <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g. Cling film, Black bin liners" autoFocus />
            </div>
          )}

          <div className="form-group"><label className="form-label">How much?</label>
            <input value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 2 boxes, 5kg, half a roll" />
          </div>

          <div className="form-group">
            <label className="form-label">Urgency</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['low', 'normal', 'urgent'] as const).map(u => {
                const style = URGENCY[u];
                const active = urgency === u;
                return (
                  <button key={u} onClick={() => setUrgency(u)} style={{ flex: 1, padding: '8px', fontSize: '12px', background: active ? style.bg : 'transparent', border: `${active ? '2px' : '0.5px'} solid ${active ? style.border : 'var(--color-border-secondary)'}`, borderRadius: '7px', color: active ? style.text : 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: active ? 500 : 400 }}>
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group"><label className="form-label">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Brand preference, any specifics…" rows={2} />
          </div>
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px' }}>
          <button onClick={handleSubmit} className="btn-primary"
            disabled={create.isPending || (mode === 'inventory' && !selected) || (mode === 'custom' && !customName)}
            style={{ flex: 1 }}>
            {create.isPending ? 'Sending…' : '🔔 Flag for owner'}
          </button>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function ItemRequestsPage() {
  const [filter, setFilter] = useState<string>('pending');
  const [showNew, setShowNew] = useState(false);
  const { data: requests = [], isLoading } = useRequests(filter === 'all' ? undefined : filter);
  const { data: counts } = useCounts();
  const update = useUpdate();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Item requests</h1>
          <p className="page-sub">Staff flag items they need · owner gets a notification to pick them up</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Flag an item</button>
      </div>

      {/* Stat cards */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card"><div className="metric-label">Pending</div><div className="metric-val" style={{ color: counts?.urgent_pending > 0 ? '#C41E3A' : '#C9973A' }}>{counts?.pending || 0}</div><div className="metric-sub">{counts?.urgent_pending > 0 ? `${counts.urgent_pending} urgent ⚠` : 'awaiting pickup'}</div></div>
        <div className="metric-card"><div className="metric-label">On the way</div><div className="metric-val" style={{ color: '#0c447c' }}>{counts?.acknowledged || 0}</div><div className="metric-sub">acknowledged</div></div>
        <div className="metric-card"><div className="metric-label">Purchased</div><div className="metric-val" style={{ color: '#27500a' }}>{counts?.purchased || 0}</div><div className="metric-sub">completed</div></div>
        <div className="metric-card"><div className="metric-label">All-time</div><div className="metric-val">{(counts?.pending || 0) + (counts?.acknowledged || 0) + (counts?.purchased || 0) + (counts?.cancelled || 0)}</div><div className="metric-sub">total requests</div></div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { id: 'pending', label: `Pending (${counts?.pending || 0})` },
          { id: 'acknowledged', label: `On the way (${counts?.acknowledged || 0})` },
          { id: 'purchased', label: `Purchased (${counts?.purchased || 0})` },
          { id: 'all', label: 'All' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={filter === f.id ? { background: '#C41E3A', color: 'white', border: 'none', fontWeight: 500 } : {}}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading…</div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '40px', marginBottom: '1rem' }}>{filter === 'pending' ? '✨' : '📋'}</div>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>
            {filter === 'pending' ? 'All caught up — no pending requests' : 'No requests in this filter'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {filter === 'pending' ? 'Staff can flag items here when they need something for the kitchen or restaurant.' : 'Try a different filter.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {requests.map((r: any) => {
            const u = URGENCY[r.urgency] || URGENCY.normal;
            const s = STATUS[r.status] || STATUS.pending;
            const itemName = r.item_name || r.custom_item;

            return (
              <div key={r.id} className="card" style={{ display: 'grid', gridTemplateColumns: '14px 1fr 130px 120px 180px', gap: '12px', alignItems: 'center', padding: '14px 16px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: u.dot, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {itemName}
                    {r.quantity_needed && <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: '6px' }}>· {r.quantity_needed}</span>}
                    {!r.item_id && <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginLeft: '6px', fontStyle: 'italic' }}>(custom)</span>}
                  </div>
                  {r.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>"{r.notes}"</div>}
                  <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                    by {r.requested_by_first || 'Staff'} · {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 9px', borderRadius: '20px', background: u.bg, color: u.text }}>
                    {u.label}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 9px', borderRadius: '20px', background: s.bg, color: s.text }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  {r.status === 'pending' && (
                    <button onClick={() => update.mutate({ id: r.id, status: 'acknowledged' })}
                      style={{ fontSize: '11px', padding: '5px 10px', background: '#e6f1fb', color: '#0c447c', border: '0.5px solid #85b7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                      I'll get it
                    </button>
                  )}
                  {(r.status === 'pending' || r.status === 'acknowledged') && (
                    <button onClick={() => update.mutate({ id: r.id, status: 'purchased' })}
                      style={{ fontSize: '11px', padding: '5px 10px', background: '#eaf3de', color: '#27500a', border: '0.5px solid #97c459', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                      ✓ Got it
                    </button>
                  )}
                  {r.status === 'pending' && (
                    <button onClick={() => update.mutate({ id: r.id, status: 'cancelled' })}
                      style={{ fontSize: '11px', padding: '5px 8px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer' }}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
