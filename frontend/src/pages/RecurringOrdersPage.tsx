import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useRecurring() {
  return useQuery({ queryKey: ['recurring-orders'], queryFn: () => api.get('/inventory/recurring').then(r => r.data.data), staleTime: 30_000 });
}
function useUpcoming() {
  return useQuery({ queryKey: ['recurring-upcoming'], queryFn: () => api.get('/inventory/recurring/upcoming/next7').then(r => r.data.data), staleTime: 30_000 });
}
function useTemplate(id: string) {
  return useQuery({ queryKey: ['recurring', id], queryFn: () => api.get(`/inventory/recurring/${id}`).then(r => r.data.data), enabled: !!id });
}
function useSuppliers() {
  return useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/inventory/suppliers').then(r => r.data.data), staleTime: 60_000 });
}
function useItems() {
  return useQuery({ queryKey: ['inventory-items'], queryFn: () => api.get('/inventory/items').then(r => r.data.data), staleTime: 60_000 });
}
function useCreate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/inventory/recurring', b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-orders'] }) });
}
function useUpdate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: any) => api.patch(`/inventory/recurring/${id}`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-orders'] }); qc.invalidateQueries({ queryKey: ['recurring', id] }); },
  });
}
function useDelete() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/inventory/recurring/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-orders'] }) });
}
function useAddLine(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post(`/inventory/recurring/${id}/lines`, b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring', id] }) });
}
function useRemoveLine(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (lineId: string) => api.delete(`/inventory/recurring/${id}/lines/${lineId}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring', id] }) });
}
function useAdjust(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post(`/inventory/recurring/${id}/adjust`, b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring', id] }) });
}
function useGenerate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: any) => api.post(`/inventory/recurring/${id}/generate`, b).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-orders'] }); qc.invalidateQueries({ queryKey: ['recurring-upcoming'] }); qc.invalidateQueries({ queryKey: ['daily-orders'] }); },
  });
}

// ── New template modal ─────────────────────────────────────────────────────────
function NewTemplateModal({ onClose }: { onClose: () => void }) {
  const { data: suppliers = [] } = useSuppliers();
  const create = useCreate();
  const [form, setForm] = useState({ supplier_id: '', name: '', day_of_week: 1, notes: '' });
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!form.supplier_id || !form.name) { setError('Supplier and name are required.'); return; }
    try {
      const result = await create.mutateAsync({ ...form, lines: [] });
      onClose();
      // Navigate to detail
      window.location.hash = `#/inventory/recurring/${result.data.id}`;
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to create.'); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '460px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>New recurring order</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}
          <div className="form-group"><label className="form-label">Supplier *</label>
            <select value={form.supplier_id} onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value }))}>
              <option value="">Select supplier…</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bidfood weekly produce" autoFocus />
          </div>
          <div className="form-group"><label className="form-label">Delivery day *</label>
            <select value={form.day_of_week} onChange={e => setForm(p => ({ ...p, day_of_week: parseInt(e.target.value) }))}>
              {[1,2,3,4,5,6,0].map(d => <option key={d} value={d}>{DAY_FULL[d]}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Order cut-off times, special instructions…" rows={3} />
          </div>
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px' }}>
          <button onClick={handleSubmit} className="btn-primary" disabled={create.isPending} style={{ flex: 1 }}>
            {create.isPending ? 'Creating…' : 'Create + add items →'}
          </button>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Adjust modal ───────────────────────────────────────────────────────────────
function AdjustModal({ templateId, line, onClose }: { templateId: string; line: any; onClose: () => void }) {
  const adjust = useAdjust(templateId);
  const [qty, setQty] = useState(parseFloat(line.current_quantity).toString());
  const [reason, setReason] = useState('');
  const [applyNow, setApplyNow] = useState(false);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  async function handleSubmit() {
    await adjust.mutateAsync({
      item_id: line.item_id,
      adjusted_quantity: parseFloat(qty),
      reason,
      adjusted_for_date: date,
      apply_now: applyNow,
    });
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Adjust {line.item_name}</h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>Currently {line.current_quantity} {line.unit || line.item_unit}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          <div className="form-group"><label className="form-label">New quantity</label>
            <input type="number" step="0.1" value={qty} onChange={e => setQty(e.target.value)} autoFocus />
          </div>
          <div className="form-group"><label className="form-label">For delivery date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group"><label className="form-label">Reason (optional)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Quiet week, less covers expected" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={applyNow} onChange={e => setApplyNow(e.target.checked)} />
            Make this the new normal (update template baseline)
          </label>
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px' }}>
          <button onClick={handleSubmit} className="btn-primary" disabled={adjust.isPending} style={{ flex: 1 }}>
            {adjust.isPending ? 'Saving…' : 'Save adjustment'}
          </button>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Add item modal ─────────────────────────────────────────────────────────────
function AddItemModal({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const { data: items = [] } = useItems();
  const addLine = useAddLine(templateId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [qty, setQty] = useState('1');

  const filtered = items.filter((i: any) => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20);

  async function handleAdd() {
    if (!selected) return;
    await addLine.mutateAsync({ item_id: selected.id, quantity: parseFloat(qty), unit: selected.unit });
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>{selected ? `Add ${selected.name}` : 'Add item to recurring order'}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem 1.5rem', flex: 1, overflowY: 'auto' }}>
          {!selected ? (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" autoFocus style={{ marginBottom: '12px', width: '100%' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {filtered.map((item: any) => (
                  <div key={item.id} onClick={() => setSelected(item)} style={{ padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{item.unit}</div>
                  </div>
                ))}
                {filtered.length === 0 && <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '1rem', textAlign: 'center' }}>No items found.</div>}
              </div>
            </>
          ) : (
            <>
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: '7px', padding: '10px 12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{selected.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Unit: {selected.unit}</div>
              </div>
              <div className="form-group"><label className="form-label">Default quantity (per delivery)</label>
                <input type="number" step="0.1" value={qty} onChange={e => setQty(e.target.value)} autoFocus />
              </div>
              <button onClick={() => setSelected(null)} style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>← Pick different item</button>
            </>
          )}
        </div>
        {selected && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px' }}>
            <button onClick={handleAdd} className="btn-primary" disabled={addLine.isPending} style={{ flex: 1 }}>
              {addLine.isPending ? 'Adding…' : 'Add to template'}
            </button>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '8px' }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail page (when viewing a single template) ──────────────────────────────
function TemplateDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: template, isLoading } = useTemplate(id);
  const update = useUpdate(id);
  const removeLine = useRemoveLine(id);
  const generate = useGenerate(id);
  const del = useDelete();
  const [adjusting, setAdjusting] = useState<any | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generate.mutateAsync({});
      alert('✓ Order generated. Find it in Daily Orders.');
    } catch (e: any) { alert(e.response?.data?.error || 'Failed to generate.'); }
    finally { setGenerating(false); }
  }

  async function handleDelete() {
    if (!confirm('Delete this recurring order template?')) return;
    await del.mutateAsync(id);
    onBack();
  }

  if (isLoading) return <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem' }}>Loading…</div>;
  if (!template) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button onClick={onBack} style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginBottom: '6px' }}>← All recurring orders</button>
          <h1 className="page-title">{template.name}</h1>
          <p className="page-sub">{template.supplier_name} · Every {DAY_FULL[template.day_of_week]}{template.last_generated && ` · Last generated ${format(parseISO(template.last_generated), 'd MMM yyyy')}`}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleDelete} style={{ fontSize: '12px', color: '#9e1830' }}>Delete</button>
          <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : '→ Generate today\'s order'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        {/* Items list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '13px' }}>Items in template ({template.lines?.length || 0})</h3>
            <button onClick={() => setAddingItem(true)} style={{ fontSize: '12px', color: '#C41E3A', border: '0.5px solid #C41E3A', background: 'white', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer' }}>+ Add item</button>
          </div>
          {template.lines?.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
              No items yet. Add items to make this template ready to generate orders.
            </div>
          ) : (
            template.lines?.map((line: any, idx: number) => (
              <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 80px', padding: '10px 16px', borderBottom: idx < template.lines.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center', fontSize: '13px' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{line.item_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>{line.category_name}</div>
                </div>
                <div>
                  <span style={{ fontWeight: 500 }}>{parseFloat(line.current_quantity)}</span>
                  <span style={{ color: 'var(--color-text-tertiary)', marginLeft: '4px' }}>{line.unit || line.item_unit}</span>
                  {parseFloat(line.current_quantity) !== parseFloat(line.base_quantity) && (
                    <div style={{ fontSize: '10px', color: '#C9973A' }}>was {parseFloat(line.base_quantity)}</div>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {line.current_unit_cost ? `£${(parseFloat(line.current_unit_cost) * parseFloat(line.current_quantity)).toFixed(2)}` : '—'}
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setAdjusting(line)} style={{ fontSize: '11px', color: '#C41E3A', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Adjust</button>
                  <button onClick={() => removeLine.mutate(line.id)} style={{ fontSize: '11px', color: '#aaa', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>×</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Recent adjustments */}
        <div className="card">
          <h3 style={{ margin: 0, fontSize: '13px', marginBottom: '0.75rem' }}>Recent adjustments</h3>
          {template.recent_adjustments?.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>No adjustments yet. Use the "Adjust" button on any item to record a one-off change or update the baseline.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {template.recent_adjustments?.slice(0, 8).map((a: any) => (
                <div key={a.id} style={{ padding: '8px 10px', background: 'var(--color-background-secondary)', borderRadius: '7px', fontSize: '11px' }}>
                  <div style={{ fontWeight: 500, fontSize: '12px' }}>{a.item_name}</div>
                  <div style={{ color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                    {parseFloat(a.previous_quantity)} → <strong>{parseFloat(a.adjusted_quantity)}</strong>
                    <span style={{ color: parseFloat(a.delta) > 0 ? '#27500a' : '#9e1830', marginLeft: '4px' }}>
                      ({parseFloat(a.delta) > 0 ? '+' : ''}{parseFloat(a.delta)})
                    </span>
                  </div>
                  {a.reason && <div style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic', marginTop: '2px' }}>"{a.reason}"</div>}
                  <div style={{ color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{format(parseISO(a.created_at), 'd MMM')} · for {format(parseISO(a.adjusted_for_date), 'd MMM')}{a.applied ? ' · applied' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {adjusting && <AdjustModal templateId={id} line={adjusting} onClose={() => setAdjusting(null)} />}
      {addingItem && <AddItemModal templateId={id} onClose={() => setAddingItem(false)} />}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function RecurringOrdersPage() {
  const { data: orders = [], isLoading } = useRecurring();
  const { data: upcoming = [] } = useUpcoming();
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Hash-based detail navigation
  React.useEffect(() => {
    const handler = () => {
      const m = window.location.hash.match(/^#\/inventory\/recurring\/(.+)/);
      setSelectedId(m ? m[1] : null);
    };
    handler();
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (selectedId) {
    return <TemplateDetail id={selectedId} onBack={() => { window.location.hash = ''; }} />;
  }

  const dueSoon = upcoming.filter((o: any) => o.days_ahead <= 1 && !o.already_generated);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Recurring orders</h1>
          <p className="page-sub">Weekly delivery templates · auto-generate ready-to-send orders</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ New recurring order</button>
      </div>

      {dueSoon.length > 0 && (
        <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '10px', padding: '12px 14px', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#854f0b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>⚡ Due within 24 hours</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {dueSoon.map((o: any) => (
              <div key={o.id} onClick={() => { window.location.hash = `#/inventory/recurring/${o.id}`; }} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', padding: '4px 0' }}>
                <span style={{ fontWeight: 500, color: '#633806' }}>{o.name}</span>
                <span style={{ fontSize: '11px', color: '#854f0b' }}>{o.supplier_name} · {DAY_FULL[o.day_of_week]} ({o.days_ahead === 0 ? 'today' : 'tomorrow'})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '40px', marginBottom: '1rem' }}>📦</div>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No recurring orders yet</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Set up your weekly deliveries — pick a supplier, a day, and the items you usually order.<br />Adjust quantities week to week as your needs change.</div>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Create your first template</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {orders.map((o: any) => (
            <div key={o.id} onClick={() => { window.location.hash = `#/inventory/recurring/${o.id}`; }} className="card"
              style={{ cursor: 'pointer', padding: '1rem 1.25rem', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-background-secondary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{o.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{o.supplier_name}</div>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 500, padding: '3px 8px', borderRadius: '20px', background: o.is_active ? '#eaf3de' : '#f1efe8', color: o.is_active ? '#27500a' : '#888' }}>
                  {o.is_active ? 'Active' : 'Paused'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                <span>📅 {DAY_FULL[o.day_of_week]}</span>
                <span>· {o.line_count} item{o.line_count !== 1 ? 's' : ''}</span>
                {o.last_generated && <span>· Last: {format(parseISO(o.last_generated), 'd MMM')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewTemplateModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
