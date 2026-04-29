import React, { useState, useRef } from 'react';
import { format, subWeeks, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useItemCosts() {
  return useQuery({ queryKey: ['inv-costs-items'], queryFn: () => api.get('/inventory/costs/items').then(r => r.data.data), staleTime: 60_000 });
}
function useInvoices() {
  return useQuery({ queryKey: ['invoices'], queryFn: () => api.get('/inventory/costs/invoices').then(r => r.data.data), staleTime: 30_000 });
}
function useSpend(from: string, to: string) {
  return useQuery({ queryKey: ['inv-spend', from, to], queryFn: () => api.get(`/inventory/costs/spend?from=${from}&to=${to}`).then(r => r.data.data), staleTime: 60_000 });
}
function useBudgets() {
  return useQuery({ queryKey: ['inv-budgets'], queryFn: () => api.get('/inventory/costs/budgets').then(r => r.data.data), staleTime: 60_000 });
}
function useUpdateCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, unit_cost }: any) => api.patch(`/inventory/costs/items/${id}`, { unit_cost }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-costs-items'] }),
  });
}
function useExtractInvoice() {
  return useMutation({ mutationFn: (b: any) => api.post('/inventory/costs/invoices/extract', b).then(r => r.data.data) });
}
function useSaveInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: any) => api.post('/inventory/costs/invoices', b).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['inv-costs-items'] });
      qc.invalidateQueries({ queryKey: ['inv-spend'] });
    },
  });
}
function useSaveBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: any) => api.post('/inventory/costs/budgets', b).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-budgets'] }),
  });
}
function useSuppliers() {
  return useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/inventory/deliveries/suppliers').then(r => r.data.data), staleTime: 60_000 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  red:   { bg: '#fde8ec', text: '#9e1830' },
  green: { bg: '#eaf3de', text: '#27500a' },
  blue:  { bg: '#e6f1fb', text: '#0c447c' },
  amber: { bg: '#faeeda', text: '#633806' },
  teal:  { bg: '#e1f5ee', text: '#085041' },
  gray:  { bg: '#f1efe8', text: '#444441' },
};

// ── Invoice upload modal ──────────────────────────────────────────────────────

function InvoiceModal({ suppliers, onClose }: { suppliers: any[]; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const extract = useExtractInvoice();
  const save    = useSaveInvoice();

  const [preview, setPreview]   = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleFile(file: File) {
    setError(''); setExtracted(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setPreview(reader.result as string);
      try {
        const data = await extract.mutateAsync({ image_base64: base64, media_type: file.type || 'image/jpeg' });
        setExtracted(data);
        if (data.supplier_name) {
          const match = suppliers.find((s: any) => s.name.toLowerCase().includes(data.supplier_name.toLowerCase()));
          if (match) setSupplierId(match.id);
        }
      } catch (e: any) { setError(e.response?.data?.error || 'Extraction failed — try a clearer photo.'); }
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!extracted) return;
    setSaving(true);
    try {
      await save.mutateAsync({
        supplier_id:   supplierId || null,
        invoice_ref:   extracted.invoice_ref,
        invoice_date:  extracted.invoice_date || format(new Date(), 'yyyy-MM-dd'),
        total_amount:  extracted.total_amount,
        lines:         extracted.lines || [],
      });
      onClose();
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to save invoice.'); }
    finally { setSaving(false); }
  }

  const matchedLines  = extracted?.lines?.filter((l: any) => l.item_id) || [];
  const unmatchedLines = extracted?.lines?.filter((l: any) => !l.item_id) || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '580px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Upload invoice</h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>AI extracts line items and updates unit costs automatically</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          {!extracted && (
            <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{ border: '2px dashed var(--color-border-secondary)', borderRadius: '10px', padding: preview ? '12px' : '2.5rem', textAlign: 'center', cursor: 'pointer', background: 'var(--color-background-secondary)' }}>
              {preview
                ? <img src={preview} alt="preview" style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} />
                : <><div style={{ fontSize: '32px', marginBottom: '8px' }}>🧾</div><div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Drop your invoice here</div><div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>PDF, PNG, JPG · Click to browse</div></>}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>
          )}

          {extract.isPending && (
            <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '12px 14px', marginTop: '1rem', fontSize: '13px', color: '#0c447c', textAlign: 'center' }}>
              🤖 Reading invoice…
            </div>
          )}

          {extracted && (
            <>
              <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem', fontSize: '13px', color: '#27500a' }}>
                ✓ Extracted {extracted.lines?.length || 0} lines · {matchedLines.length} matched to inventory items
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Supplier</label>
                  <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                    <option value="">Unknown</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Total amount</label>
                  <div style={{ fontSize: '15px', fontWeight: 500, padding: '9px 0' }}>
                    {extracted.total_amount ? `£${parseFloat(extracted.total_amount).toFixed(2)}` : '—'}
                  </div>
                </div>
              </div>

              {matchedLines.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>
                    Matched to inventory ({matchedLines.length})
                  </div>
                  {matchedLines.map((l: any, i: number) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: '8px', alignItems: 'center', padding: '7px 10px', background: '#eaf3de', borderRadius: '7px', marginBottom: '4px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 500, color: '#27500a' }}>{l.description}</div>
                      <div style={{ color: '#3d6b1a' }}>×{l.quantity || '?'}</div>
                      <div style={{ color: '#3d6b1a' }}>{l.unit_cost ? `£${parseFloat(l.unit_cost).toFixed(2)} ea` : '?'}</div>
                      <div style={{ fontWeight: 600, color: '#27500a' }}>£{parseFloat(l.line_total || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}

              {unmatchedLines.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>
                    Unmatched ({unmatchedLines.length}) — saved for reference
                  </div>
                  {unmatchedLines.map((l: any, i: number) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px', alignItems: 'center', padding: '7px 10px', background: 'var(--color-background-secondary)', borderRadius: '7px', marginBottom: '4px', fontSize: '12px' }}>
                      <div style={{ color: 'var(--color-text-secondary)' }}>{l.description}</div>
                      <div style={{ fontWeight: 500 }}>£{parseFloat(l.line_total || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          {extracted ? (
            <>
              <button onClick={handleSave} className="btn-primary" disabled={saving} style={{ flex: 1, padding: '10px' }}>
                {saving ? 'Saving…' : `Save invoice · update ${matchedLines.length} item costs`}
              </button>
              <button onClick={() => { setExtracted(null); setPreview(null); }} style={{ padding: '10px 14px', borderRadius: '8px' }}>Retake</button>
            </>
          ) : (
            <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main analytics page ───────────────────────────────────────────────────────

type Tab = 'spend' | 'items' | 'invoices';

export function InventoryAnalyticsPage() {
  const [tab, setTab] = useState<Tab>('spend');
  const [showInvoice, setShowInvoice] = useState(false);
  const [editingCost, setEditingCost] = useState<any | null>(null);
  const [editingBudget, setEditingBudget] = useState<any | null>(null);
  const [newCost, setNewCost] = useState('');
  const [newBudget, setNewBudget] = useState('');

  const to   = format(new Date(), 'yyyy-MM-dd');
  const from = format(subWeeks(new Date(), 4), 'yyyy-MM-dd');

  const { data: spendData, isLoading: spendLoading } = useSpend(from, to);
  const { data: items = [], isLoading: itemsLoading } = useItemCosts();
  const { data: invoices = [] }  = useInvoices();
  const { data: budgets = [] }   = useBudgets();
  const { data: suppliers = [] } = useSuppliers();
  const updateCost  = useUpdateCost();
  const saveBudget  = useSaveBudget();

  const totalSpend  = spendData?.total_spend || 0;
  const overBudget  = (spendData?.by_category || []).filter((c: any) => c.over_budget).length;
  const priced      = items.filter((i: any) => parseFloat(i.current_unit_cost) > 0).length;

  async function handleSaveCost() {
    if (!editingCost || !newCost) return;
    await updateCost.mutateAsync({ id: editingCost.id, unit_cost: parseFloat(newCost) });
    setEditingCost(null); setNewCost('');
  }

  async function handleSaveBudget() {
    if (!editingBudget || !newBudget) return;
    await saveBudget.mutateAsync({ category_id: editingBudget.id, weekly_budget: parseFloat(newBudget) });
    setEditingBudget(null); setNewBudget('');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cost analytics</h1>
          <p className="page-sub">Track spend, item costs, and supplier invoices</p>
        </div>
        <button onClick={() => setShowInvoice(true)} style={{ fontSize: '13px' }}>🧾 Upload invoice</button>
      </div>

      {/* Metrics */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">4-week spend</div>
          <div className="metric-val" style={{ color: '#C9973A' }}>
            {spendLoading ? '…' : `£${totalSpend.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className="metric-sub">from {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Over budget</div>
          <div className="metric-val" style={{ color: overBudget > 0 ? '#C41E3A' : 'var(--color-text-primary)' }}>{overBudget}</div>
          <div className="metric-sub">categories this period</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Items priced</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>
            {priced}
            <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--color-text-tertiary)' }}>/{items.length}</span>
          </div>
          <div className="metric-sub">{items.length - priced > 0 ? `${items.length - priced} still need a cost` : 'all priced'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Invoices logged</div>
          <div className="metric-val">{invoices.length}</div>
          <div className="metric-sub">last 4 weeks</div>
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {[{ id: 'spend', label: 'Spend by category' }, { id: 'items', label: 'Item costs' }, { id: 'invoices', label: 'Invoices' }].map((t: any) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent',
            color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)',
            fontWeight: tab === t.id ? 500 : 400, borderRadius: 0, marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Spend tab ──────────────────────────────────────────────────────── */}
      {tab === 'spend' && (
        <div>
          {spendLoading ? (
            <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading spend data…</div>
          ) : !spendData || spendData.by_category.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '36px', marginBottom: '1rem' }}>🧾</div>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No spend data yet</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Upload supplier invoices to start tracking costs by category.</div>
              <button onClick={() => setShowInvoice(true)} style={{ fontSize: '13px' }}>🧾 Upload first invoice</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Budget info banner */}
              <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Showing 4-week spend ({from} to {to}). Set weekly budgets per category on the Item costs tab.
              </div>

              {spendData.by_category.map((cat: any) => {
                const colors = COLOR_MAP[cat.color] || COLOR_MAP.gray;
                const pct = cat.budget_pct;
                const barColor = !pct ? '#97c459' : pct > 100 ? '#C41E3A' : pct > 85 ? '#ef9f27' : '#97c459';
                return (
                  <div key={cat.category_id} className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '18px' }}>{cat.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{cat.category_name}</div>
                        {cat.weekly_budget && <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Budget: £{(cat.weekly_budget * spendData.weeks_in_range).toFixed(0)} over {spendData.weeks_in_range} weeks</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: cat.over_budget ? '#C41E3A' : 'var(--color-text-primary)' }}>
                          £{parseFloat(cat.total).toFixed(2)}
                        </div>
                        {pct !== null && (
                          <div style={{ fontSize: '11px', color: cat.over_budget ? '#9e1830' : 'var(--color-text-tertiary)' }}>
                            {pct}% of budget{cat.over_budget ? ' ⚠ over' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Budget bar */}
                    {cat.budget_total && (
                      <div style={{ height: '6px', background: '#f0efe8', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: '3px', transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Item costs tab ─────────────────────────────────────────────────── */}
      {tab === 'items' && (
        <div>
          {items.length - priced > 0 && (
            <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#633806' }}>
              ⚠ {items.length - priced} item{items.length - priced !== 1 ? 's have' : ' has'} no cost set — upload a supplier invoice to auto-populate, or set manually.
            </div>
          )}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 100px 120px 80px', padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <div>Item</div><div>Category</div><div>Unit</div><div>Par level</div><div>Unit cost</div><div>Weekly est.</div>
            </div>
            {itemsLoading ? (
              <div style={{ padding: '2rem', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>Loading…</div>
            ) : (
              items.map((item: any, idx: number) => {
                const hasCost = parseFloat(item.current_unit_cost) > 0;
                const isEditing = editingCost?.id === item.id;
                return (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 100px 120px 80px', padding: '11px 16px', borderBottom: idx < items.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{item.category_icon} {item.category_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.unit}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.par_level}</div>
                    <div>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px' }}>£</span>
                          <input type="number" min={0} step={0.01} value={newCost} onChange={e => setNewCost(e.target.value)}
                            style={{ width: '65px', fontSize: '13px', padding: '4px 6px' }} autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveCost(); if (e.key === 'Escape') { setEditingCost(null); setNewCost(''); } }} />
                          <button onClick={handleSaveCost} style={{ fontSize: '11px', padding: '3px 8px', background: '#C41E3A', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>✓</button>
                          <button onClick={() => { setEditingCost(null); setNewCost(''); }} style={{ fontSize: '11px', padding: '3px 6px', border: 'none', background: 'none', cursor: 'pointer', color: '#aaa' }}>×</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 500, color: hasCost ? 'var(--color-text-primary)' : '#d0cec6' }}>
                            {hasCost ? `£${parseFloat(item.current_unit_cost).toFixed(2)}` : '—'}
                          </span>
                          <button onClick={() => { setEditingCost(item); setNewCost(hasCost ? String(item.current_unit_cost) : ''); }}
                            style={{ fontSize: '11px', color: '#C41E3A', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                            {hasCost ? 'Edit' : 'Set'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: item.weekly_cost_estimate > 0 ? 'var(--color-text-primary)' : '#d0cec6' }}>
                      {item.weekly_cost_estimate > 0 ? `£${item.weekly_cost_estimate.toFixed(2)}` : '—'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Invoices tab ───────────────────────────────────────────────────── */}
      {tab === 'invoices' && (
        invoices.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '1rem' }}>🧾</div>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No invoices yet</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
              Upload your first supplier invoice. The AI will extract line items and automatically update unit costs.
            </div>
            <button onClick={() => setShowInvoice(true)} style={{ fontSize: '13px' }}>🧾 Upload invoice</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 100px 110px 120px', padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <div>Supplier</div><div>Date</div><div>Ref</div><div>Lines</div><div>Total</div><div>Status</div>
            </div>
            {invoices.map((inv: any, idx: number) => (
              <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 100px 110px 120px', padding: '12px 16px', borderBottom: idx < invoices.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{inv.supplier_name || 'Unknown'}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{format(parseISO(inv.invoice_date), 'd MMM yyyy')}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{inv.invoice_ref || '—'}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{inv.line_count || '—'}</div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{inv.total_amount ? `£${parseFloat(inv.total_amount).toFixed(2)}` : '—'}</div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 500, background: inv.status === 'pending' ? '#faeeda' : '#eaf3de', color: inv.status === 'pending' ? '#633806' : '#27500a', padding: '2px 8px', borderRadius: '20px' }}>
                    {inv.status === 'pending' ? 'Saved' : 'Matched'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {showInvoice && <InvoiceModal suppliers={suppliers} onClose={() => setShowInvoice(false)} />}
    </div>
  );
}
