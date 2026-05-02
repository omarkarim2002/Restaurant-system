import React, { useState, useRef } from 'react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useChecklists(date?: string) {
  return useQuery({
    queryKey: ['checklists', date],
    queryFn: () => api.get(`/inventory/checklists${date ? `?date=${date}` : ''}`).then(r => r.data.data),
    staleTime: 30_000,
  });
}
function useChecklist(id: string) {
  return useQuery({
    queryKey: ['checklist', id],
    queryFn: () => api.get(`/inventory/checklists/${id}`).then(r => r.data.data),
    enabled: !!id,
    staleTime: 15_000,
  });
}
function useFlagged() {
  return useQuery({ queryKey: ['flagged-items'], queryFn: () => api.get('/inventory/checklists/flagged/items').then(r => r.data.data), staleTime: 60_000 });
}
function useExtract() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/inventory/checklists/extract', b).then(r => r.data.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }) });
}
function useCreateChecklist() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/inventory/checklists', b).then(r => r.data.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }) });
}
function useUpdateItem(checklistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...b }: any) => api.patch(`/inventory/checklists/${checklistId}/items/${itemId}`, b).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist', checklistId] }),
  });
}
function useAddItem(checklistId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post(`/inventory/checklists/${checklistId}/items`, b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist', checklistId] }) });
}
function useDeleteItem(checklistId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (itemId: string) => api.delete(`/inventory/checklists/${checklistId}/items/${itemId}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist', checklistId] }) });
}
function useSubmit(checklistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/inventory/checklists/${checklistId}/submit`, {}).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklist', checklistId] }); qc.invalidateQueries({ queryKey: ['checklists'] }); qc.invalidateQueries({ queryKey: ['flagged-items'] }); qc.invalidateQueries({ queryKey: ['item-requests'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
  ok:      { bg: '#eaf3de', text: '#27500a', border: '#97c459', label: 'OK',      icon: '✓' },
  low:     { bg: '#faeeda', text: '#633806', border: '#ef9f27', label: 'Low',     icon: '⚠' },
  out:     { bg: '#fde8ec', text: '#9e1830', border: '#f5b8c4', label: 'Out',     icon: '✕' },
  unknown: { bg: '#f1efe8', text: '#5f5e5a', border: '#d3d1c7', label: '?',       icon: '?' },
};

// ── Item row ───────────────────────────────────────────────────────────────────
function ChecklistItemRow({ item, checklistId, readOnly }: { item: any; checklistId: string; readOnly: boolean }) {
  const update = useUpdateItem(checklistId);
  const del = useDeleteItem(checklistId);
  const [editingQty, setEditingQty] = useState(false);
  const [qtyVal, setQtyVal] = useState(item.quantity_remaining || '');
  const st = STATUS_STYLES[item.status] || STATUS_STYLES.unknown;

  function setStatus(status: string) {
    const flagged = status === 'low' || status === 'out';
    update.mutate({ itemId: item.id, status, flagged_for_order: flagged });
  }

  function saveQty() {
    update.mutate({ itemId: item.id, quantity_remaining: qtyVal });
    setEditingQty(false);
  }

  function toggleFlag() {
    update.mutate({ itemId: item.id, flagged_for_order: !item.flagged_for_order });
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 200px 120px 36px',
      padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)',
      alignItems: 'center', gap: '10px',
      background: item.status === 'out' ? '#fff8f8' : item.status === 'low' ? '#fffcf5' : 'white',
    }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.item_name}</div>
        {editingQty ? (
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <input value={qtyVal} onChange={e => setQtyVal(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveQty(); if (e.key === 'Escape') setEditingQty(false); }}
              style={{ fontSize: '12px', padding: '3px 8px', width: '120px' }} placeholder="e.g. about 1kg" />
            <button onClick={saveQty} style={{ fontSize: '11px', padding: '3px 8px', background: '#27500a', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Save</button>
          </div>
        ) : (
          <div onClick={() => !readOnly && setEditingQty(true)}
            style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px', cursor: readOnly ? 'default' : 'text', minHeight: '14px' }}>
            {item.quantity_remaining || (!readOnly ? 'click to add quantity note' : '')}
          </div>
        )}
      </div>

      {/* Status buttons */}
      {readOnly ? (
        <span style={{ fontSize: '12px', fontWeight: 500, padding: '4px 10px', borderRadius: '20px', background: st.bg, color: st.text, border: `0.5px solid ${st.border}`, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span>{st.icon}</span> {st.label}
        </span>
      ) : (
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['ok', 'low', 'out'] as const).map(s => {
            const ss = STATUS_STYLES[s];
            const active = item.status === s;
            return (
              <button key={s} onClick={() => setStatus(s)} style={{
                flex: 1, padding: '5px', fontSize: '11px', fontWeight: active ? 600 : 400,
                background: active ? ss.bg : 'transparent',
                border: `${active ? '1.5px' : '0.5px'} solid ${active ? ss.border : 'var(--color-border-secondary)'}`,
                borderRadius: '6px', cursor: 'pointer', color: active ? ss.text : 'var(--color-text-tertiary)',
              }}>{ss.icon} {ss.label}</button>
            );
          })}
        </div>
      )}

      {/* Flag for order */}
      <button onClick={() => !readOnly && toggleFlag()}
        disabled={readOnly}
        title={item.flagged_for_order ? 'Flagged for order' : 'Flag for order'}
        style={{
          fontSize: '11px', padding: '5px 8px', borderRadius: '6px', cursor: readOnly ? 'default' : 'pointer',
          background: item.flagged_for_order ? '#fde8ec' : 'transparent',
          border: `0.5px solid ${item.flagged_for_order ? '#f5b8c4' : 'var(--color-border-secondary)'}`,
          color: item.flagged_for_order ? '#9e1830' : 'var(--color-text-tertiary)',
          fontWeight: item.flagged_for_order ? 500 : 400,
        }}>
        {item.flagged_for_order ? '🔴 Order' : '+ Flag'}
      </button>

      {!readOnly && (
        <button onClick={() => del.mutate(item.id)}
          style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>×</button>
      )}
    </div>
  );
}

// ── Detail view ────────────────────────────────────────────────────────────────
function ChecklistDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: checklist, isLoading } = useChecklist(id);
  const submit = useSubmit(id);
  const addItem = useAddItem(id);
  const [newItem, setNewItem] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const result = await submit.mutateAsync();
      alert(`✓ Checklist submitted.\n${result.out_count} items out of stock → auto-added to requests.\nOwner notified.`);
      onBack();
    } catch (e: any) { alert(e.response?.data?.error || 'Failed to submit.'); }
    finally { setSubmitting(false); }
  }

  async function handleAddItem() {
    if (!newItem.trim()) return;
    await addItem.mutateAsync({ item_name: newItem.trim(), status: 'unknown' });
    setNewItem('');
  }

  if (isLoading) return <div style={{ padding: '2rem', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>Loading…</div>;
  if (!checklist) return null;

  const readOnly = checklist.status === 'submitted';
  const outCount  = checklist.items?.filter((i: any) => i.status === 'out').length || 0;
  const lowCount  = checklist.items?.filter((i: any) => i.status === 'low').length || 0;
  const flagCount = checklist.items?.filter((i: any) => i.flagged_for_order).length || 0;
  const totalItems = checklist.items?.length || 0;
  const statusedItems = checklist.items?.filter((i: any) => i.status !== 'unknown').length || 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button onClick={onBack} style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginBottom: '6px' }}>← All checklists</button>
          <h1 className="page-title">
            {checklist.shift_type === 'close' ? 'Close' : checklist.shift_type === 'open' ? 'Open' : 'Mid'} checklist
            {checklist.extracted_by_ai && <span style={{ fontSize: '11px', fontWeight: 400, color: '#0c447c', marginLeft: '10px', background: '#e6f1fb', padding: '2px 8px', borderRadius: '20px' }}>🤖 AI extracted</span>}
          </h1>
          <p className="page-sub">{format(parseISO(checklist.checklist_date), 'EEEE d MMMM yyyy')}{checklist.submitted_by_first && ` · by ${checklist.submitted_by_first} ${checklist.submitted_by_last}`}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {readOnly ? (
            <span style={{ fontSize: '12px', fontWeight: 500, background: '#eaf3de', color: '#27500a', padding: '6px 12px', borderRadius: '20px' }}>✓ Submitted</span>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                {statusedItems}/{totalItems} checked
                {flagCount > 0 && <span style={{ color: '#9e1830', marginLeft: '8px' }}>· {flagCount} flagged for order</span>}
              </div>
              <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit checklist →'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary pills */}
      {(outCount > 0 || lowCount > 0) && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
          {outCount > 0 && <span style={{ fontSize: '12px', fontWeight: 500, background: '#fde8ec', color: '#9e1830', padding: '5px 12px', borderRadius: '20px', border: '0.5px solid #f5b8c4' }}>✕ {outCount} out of stock</span>}
          {lowCount > 0 && <span style={{ fontSize: '12px', fontWeight: 500, background: '#faeeda', color: '#633806', padding: '5px 12px', borderRadius: '20px', border: '0.5px solid #ef9f27' }}>⚠ {lowCount} running low</span>}
          {flagCount > 0 && <span style={{ fontSize: '12px', fontWeight: 500, background: '#fde8ec', color: '#9e1830', padding: '5px 12px', borderRadius: '20px' }}>🔴 {flagCount} flagged to order</span>}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'grid', gridTemplateColumns: '1fr 200px 120px 36px', gap: '10px', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>Item</div><div>Status</div><div>Order flag</div><div></div>
        </div>
        {checklist.items?.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No items yet. Add items below or go back and upload a photo.</div>
        ) : (
          checklist.items?.map((item: any) => (
            <ChecklistItemRow key={item.id} item={item} checklistId={id} readOnly={readOnly} />
          ))
        )}

        {!readOnly && (
          <div style={{ padding: '10px 16px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: '8px' }}>
            <input value={newItem} onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); }}
              placeholder="Add item manually…" style={{ flex: 1, fontSize: '13px' }} />
            <button onClick={handleAddItem} disabled={!newItem.trim()} style={{ padding: '8px 14px', fontSize: '13px' }}>+ Add</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New checklist modal (photo or manual) ─────────────────────────────────────
function NewChecklistModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const fileRef    = useRef<HTMLInputElement>(null);
  const extract    = useExtract();
  const create     = useCreateChecklist();
  const [tab, setTab]       = useState<'photo' | 'manual'>('photo');
  const [preview, setPreview] = useState<string | null>(null);
  const [shiftType, setShiftType] = useState<'close' | 'open' | 'mid'>('close');
  const [date, setDate]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function handlePhoto(file: File) {
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setPreview(reader.result as string);
      setLoading(true);
      try {
        const result = await extract.mutateAsync({ image_base64: base64, media_type: file.type || 'image/jpeg', checklist_date: date, shift_type: shiftType });
        onCreated(result.checklist_id);
        onClose();
      } catch (e: any) { setError(e.response?.data?.error || 'Extraction failed — try a clearer photo.'); setLoading(false); }
    };
    reader.readAsDataURL(file);
  }

  async function handleManual() {
    setLoading(true);
    try {
      const result = await create.mutateAsync({ checklist_date: date, shift_type: shiftType, items: [] });
      onCreated(result.id);
      onClose();
    } catch (e: any) { setError(e.response?.data?.error || 'Failed.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '480px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 0', borderBottom: '0.5px solid #eee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>New checklist</h3>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex' }}>
            {[{ id: 'photo', label: '📷 Upload photo' }, { id: 'manual', label: '✍ Enter manually' }].map((t: any) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 16px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent', color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)', fontWeight: tab === t.id ? 500 : 400, borderRadius: 0, marginBottom: '-1px' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Shift</label>
              <select value={shiftType} onChange={e => setShiftType(e.target.value as any)}>
                <option value="close">Close of day</option>
                <option value="open">Open of day</option>
                <option value="mid">Mid shift</option>
              </select>
            </div>
          </div>

          {tab === 'photo' && (
            <div onClick={() => !loading && fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePhoto(f); }}
              style={{ border: '2px dashed var(--color-border-secondary)', borderRadius: '10px', padding: preview ? '12px' : '2.5rem', textAlign: 'center', cursor: loading ? 'wait' : 'pointer', background: 'var(--color-background-secondary)' }}>
              {loading ? (
                <div>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🤖</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Haiku is reading your checklist…</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>This takes about 5 seconds</div>
                </div>
              ) : preview ? (
                <img src={preview} alt="preview" style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} />
              ) : (
                <>
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>📋</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Drop your checklist photo here</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>PNG, JPG · Any angle · Haiku will read it</div>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handlePhoto(e.target.files[0]); }} />
            </div>
          )}

          {tab === 'manual' && (
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '14px', lineHeight: 1.6 }}>
              A blank checklist will open. You can add items one by one and mark each as OK, Low, or Out — or type items in quickly and flag the ones that need ordering.
            </div>
          )}
        </div>

        {tab === 'manual' && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px' }}>
            <button onClick={handleManual} className="btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Creating…' : 'Open blank checklist →'}
            </button>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: '8px' }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function ChecklistsPage() {
  const { data: checklists = [], isLoading } = useChecklists();
  const { data: flaggedItems = [] }          = useFlagged();
  const [showNew, setShowNew]   = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  if (detailId) return <ChecklistDetail id={detailId} onBack={() => setDetailId(null)} />;

  const recentFlagged = flaggedItems.slice(0, 6);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Shift checklists</h1>
          <p className="page-sub">End-of-shift stock checks · photo extraction · auto-flag for ordering</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ New checklist</button>
      </div>

      {/* Flagged items panel */}
      {recentFlagged.length > 0 && (
        <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '10px', padding: '12px 14px', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#854f0b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px' }}>
            🔴 Flagged for ordering — last 7 days
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {recentFlagged.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: `0.5px solid ${item.status === 'out' ? '#f5b8c4' : '#ef9f27'}`, borderRadius: '20px', padding: '3px 10px', fontSize: '12px' }}>
                <span style={{ color: item.status === 'out' ? '#9e1830' : '#633806', fontWeight: 500 }}>
                  {item.status === 'out' ? '✕' : '⚠'} {item.item_name}
                </span>
                {item.quantity_remaining && <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px' }}>· {item.quantity_remaining}</span>}
              </div>
            ))}
            {flaggedItems.length > 6 && <div style={{ fontSize: '12px', color: '#854f0b', padding: '3px 8px' }}>+{flaggedItems.length - 6} more</div>}
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading…</div>
      ) : checklists.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '40px', marginBottom: '1rem' }}>📋</div>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No checklists yet</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            At the end of each shift, photograph your paper checklist — Haiku reads it and flags what needs ordering.<br />Or enter stock levels manually if you prefer.
          </div>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Start your first checklist</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {checklists.map((c: any) => {
            const outCount  = parseInt(c.out_count  || '0');
            const lowCount  = parseInt(c.low_count  || '0');
            const flagCount = parseInt(c.flagged_count || '0');
            const isSubmitted = c.status === 'submitted';

            return (
              <div key={c.id} className="card" onClick={() => setDetailId(c.id)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 120px', gap: '12px', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-background-secondary)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {c.shift_type === 'close' ? 'Close' : c.shift_type === 'open' ? 'Open' : 'Mid'} checklist
                    {c.extracted_by_ai && <span style={{ fontSize: '10px', color: '#0c447c', marginLeft: '8px', background: '#e6f1fb', padding: '1px 6px', borderRadius: '10px' }}>🤖 AI</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                    {format(parseISO(c.checklist_date), 'EEE d MMM yyyy')}
                    {c.submitted_by_first && ` · ${c.submitted_by_first}`}
                    {c.submitted_at && ` · ${formatDistanceToNow(parseISO(c.submitted_at), { addSuffix: true })}`}
                  </div>
                </div>
                <div style={{ fontSize: '12px', textAlign: 'center' }}>
                  {outCount > 0 && <span style={{ color: '#9e1830', fontWeight: 500 }}>✕ {outCount} out</span>}
                </div>
                <div style={{ fontSize: '12px', textAlign: 'center' }}>
                  {lowCount > 0 && <span style={{ color: '#633806', fontWeight: 500 }}>⚠ {lowCount} low</span>}
                </div>
                <div style={{ fontSize: '12px', textAlign: 'center' }}>
                  {flagCount > 0 && <span style={{ color: '#9e1830', fontWeight: 500 }}>🔴 {flagCount} order</span>}
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 9px', borderRadius: '20px', background: isSubmitted ? '#eaf3de' : '#f1efe8', color: isSubmitted ? '#27500a' : '#5f5e5a' }}>
                    {isSubmitted ? '✓ Submitted' : 'Draft'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewChecklistModal onClose={() => setShowNew(false)} onCreated={id => { setDetailId(id); setShowNew(false); }} />}
    </div>
  );
}
