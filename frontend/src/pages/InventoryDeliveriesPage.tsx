import React, { useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useDeliveries(from?: string, to?: string) {
  return useQuery({
    queryKey: ['deliveries', from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
      return api.get(`/inventory/deliveries?${params}`).then(r => r.data.data);
    },
    staleTime: 30_000,
  });
}

function useDelivery(id: string) {
  return useQuery({
    queryKey: ['delivery', id],
    queryFn: () => api.get(`/inventory/deliveries/${id}`).then(r => r.data.data),
    enabled: !!id,
  });
}

function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/inventory/deliveries/suppliers').then(r => r.data.data),
    staleTime: 60_000,
  });
}

function useCreateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: any) => api.post('/inventory/deliveries', b).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliveries'] }),
  });
}

function useUpdateLine(deliveryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, received_qty, notes }: any) =>
      api.patch(`/inventory/deliveries/${deliveryId}/lines/${lineId}`, { received_qty, notes }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery', deliveryId] });
    },
  });
}

function useConfirmDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/inventory/deliveries/${id}/confirm`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['inv-items'] });
    },
  });
}

function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: any) => api.post('/inventory/deliveries/suppliers', b).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

function useOrderHistory() {
  return useQuery({
    queryKey: ['inv-order-history'],
    queryFn: () => api.get('/inventory/orders/history').then(r => r.data.data),
    staleTime: 60_000,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  expected: { bg: '#e6f1fb', text: '#0c447c', label: 'Expected',            dot: '#85b7eb' },
  received: { bg: '#eaf3de', text: '#27500a', label: 'Received',            dot: '#97c459' },
  partial:  { bg: '#faeeda', text: '#633806', label: 'Partial — shortfall', dot: '#ef9f27' },
};

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  red:   { bg: '#fde8ec', text: '#9e1830' },
  green: { bg: '#eaf3de', text: '#27500a' },
  blue:  { bg: '#e6f1fb', text: '#0c447c' },
  amber: { bg: '#faeeda', text: '#633806' },
  teal:  { bg: '#e1f5ee', text: '#085041' },
  gray:  { bg: '#f1efe8', text: '#444441' },
};

// ── Receive delivery modal ────────────────────────────────────────────────────

function ReceiveModal({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const { data, isLoading } = useDelivery(deliveryId);
  const updateLine  = useUpdateLine(deliveryId);
  const confirmDel  = useConfirmDelivery();
  const [pending, setPending] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  const delivery = data?.delivery;
  const lines: any[] = data?.lines || [];

  // Group lines by category
  const grouped: Record<string, { cat: any; lines: any[] }> = {};
  for (const line of lines) {
    const k = line.category_name;
    if (!grouped[k]) grouped[k] = { cat: { name: line.category_name, icon: line.category_icon, color: line.category_color }, lines: [] };
    grouped[k].lines.push(line);
  }

  function getQty(line: any) {
    return pending[line.id] ?? String(parseFloat(line.received_qty) || parseFloat(line.ordered_qty) || '');
  }

  async function handleConfirm() {
    setError('');
    try {
      // Save all pending changes first
      for (const [lineId, qty] of Object.entries(pending)) {
        await updateLine.mutateAsync({ lineId, received_qty: parseFloat(qty) || 0 });
      }
      await confirmDel.mutateAsync(deliveryId);
      setConfirmed(true);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to confirm delivery.');
    }
  }

  const totalOrdered  = lines.reduce((s, l) => s + parseFloat(l.ordered_qty || 0), 0);
  const totalReceived = lines.reduce((s, l) => s + parseFloat(pending[l.id] ?? l.received_qty ?? l.ordered_qty ?? 0), 0);
  const hasShortfall  = lines.some(l => parseFloat(pending[l.id] ?? l.received_qty ?? l.ordered_qty) < parseFloat(l.ordered_qty || 0));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '600px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>
              {confirmed ? '✓ Delivery confirmed' : 'Receive delivery'}
            </h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
              {delivery?.supplier_name} · {delivery ? format(parseISO(delivery.delivery_date), 'd MMMM yyyy') : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          {confirmed ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>✓</div>
              <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '0.5rem', color: hasShortfall ? '#633806' : '#27500a' }}>
                {hasShortfall ? 'Delivery received — shortfalls logged' : 'Delivery received — stock updated'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {totalReceived.toFixed(1)} of {totalOrdered.toFixed(1)} units received across {lines.length} items.
                Stock levels have been updated automatically.
              </div>
            </div>
          ) : isLoading ? (
            <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading delivery…</div>
          ) : (
            <>
              {/* Summary bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '1.25rem' }}>
                <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '3px' }}>Items</div>
                  <div style={{ fontSize: '16px', fontWeight: 500 }}>{lines.length}</div>
                </div>
                <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '3px' }}>Ordered total</div>
                  <div style={{ fontSize: '16px', fontWeight: 500 }}>{totalOrdered.toFixed(1)}</div>
                </div>
                <div style={{ background: hasShortfall ? '#faeeda' : 'var(--color-background-secondary)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: hasShortfall ? '#854f0b' : 'var(--color-text-tertiary)', marginBottom: '3px' }}>
                    {hasShortfall ? '⚠ Receiving' : 'Receiving'}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 500, color: hasShortfall ? '#633806' : undefined }}>
                    {totalReceived.toFixed(1)}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '1rem' }}>
                Enter the actual received quantity for each item. Leave as-is if the delivery matches the order exactly.
              </div>

              {Object.values(grouped).map(({ cat, lines: catLines }) => {
                const colors = COLOR_MAP[cat.color] || COLOR_MAP.gray;
                return (
                  <div key={cat.name} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: colors.bg, borderRadius: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px' }}>{cat.icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: colors.text }}>{cat.name}</span>
                    </div>
                    {catLines.map((line: any) => {
                      const orderedQty  = parseFloat(line.ordered_qty) || 0;
                      const receivedVal = getQty(line);
                      const receivedQty = parseFloat(receivedVal) || 0;
                      const variance    = receivedQty - orderedQty;
                      const isShort     = variance < 0;
                      const isSurplus   = variance > 0;

                      return (
                        <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 100px', gap: '8px', alignItems: 'center', padding: '9px 10px', background: isShort ? '#fffbf4' : 'var(--color-background-secondary)', borderRadius: '7px', marginBottom: '4px', border: isShort ? '0.5px solid #fde047' : '0.5px solid transparent' }}>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{line.item_name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            Ordered: <strong>{orderedQty} {line.unit}</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <input
                              type="number" min={0} step={0.5}
                              value={receivedVal}
                              onChange={e => setPending(p => ({ ...p, [line.id]: e.target.value }))}
                              style={{ width: '65px', fontSize: '13px', padding: '5px 7px', borderColor: isShort ? '#ef9f27' : undefined }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{line.unit}</span>
                          </div>
                          <div style={{ fontSize: '11px', textAlign: 'right' }}>
                            {isShort && <span style={{ color: '#854f0b', fontWeight: 500 }}>−{Math.abs(variance).toFixed(1)} short</span>}
                            {isSurplus && <span style={{ color: '#27500a', fontWeight: 500 }}>+{variance.toFixed(1)} extra</span>}
                            {variance === 0 && <span style={{ color: '#97c459' }}>✓ Full</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          {confirmed ? (
            <button onClick={onClose} className="btn-primary" style={{ flex: 1, padding: '10px' }}>Done</button>
          ) : (
            <>
              <button onClick={handleConfirm} className="btn-primary" disabled={confirmDel.isPending || isLoading} style={{ flex: 1, padding: '10px' }}>
                {confirmDel.isPending ? 'Confirming…' : hasShortfall ? 'Confirm — log shortfalls' : 'Confirm delivery →'}
              </button>
              <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New delivery modal ────────────────────────────────────────────────────────

function NewDeliveryModal({ suppliers, orders, prefillOrderId, onClose }: { suppliers: any[]; orders: any[]; prefillOrderId?: string | null; onClose: () => void }) {
  const createDelivery = useCreateDelivery();
  const prefillOrder = prefillOrderId ? orders.find((o: any) => o.id === prefillOrderId) : null;
  const [form, setForm] = useState({
    supplier_id:   prefillOrder?.supplier_id || suppliers[0]?.id || '',
    order_id:      prefillOrderId || '',
    delivery_date: format(new Date(), 'yyyy-MM-dd'),
    invoice_ref:   '',
    notes:         prefillOrder?.notes?.startsWith('From recurring:') ? prefillOrder.notes.replace('From recurring: ', 'Delivery for: ') : '',
  });
  const [error, setError] = useState('');

  async function save() {
    try {
      await createDelivery.mutateAsync({ ...form, order_id: form.order_id || null, invoice_ref: form.invoice_ref || null });
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to create delivery.');
    }
  }

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '420px', padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
          <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Log new delivery</h3>
          {prefillOrder && <div style={{ fontSize: '11px', color: '#27500a', marginTop: '3px' }}>Pre-filled from recurring order</div>}
        </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Supplier *</label>
            <select value={form.supplier_id} onChange={e => f('supplier_id', e.target.value)}>
              <option value="">No supplier</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '3px' }}>
              Same suppliers as your recurring orders. Link to an order above to auto-select.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Delivery date *</label>
            <input type="date" value={form.delivery_date} onChange={e => f('delivery_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Link to order (optional)</label>
            <select value={form.order_id} onChange={e => {
              f('order_id', e.target.value);
              // Auto-select supplier from the linked order
              const linked = orders.find((o: any) => o.id === e.target.value);
              if (linked?.supplier_id) f('supplier_id', linked.supplier_id);
            }}>
              <option value="">No linked order</option>
              {orders.map((o: any) => <option key={o.id} value={o.id}>
                {format(parseISO(o.order_date), 'EEE d MMM yyyy')}{o.notes?.startsWith('From recurring:') ? ' · ' + o.notes.replace('From recurring: ', '') : o.supplier_name ? ' · ' + o.supplier_name : ''}
              </option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Invoice reference</label>
            <input value={form.invoice_ref} onChange={e => f('invoice_ref', e.target.value)} placeholder="e.g. INV-2024-0042" />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Any notes about this delivery" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '1.25rem' }}>
          <button onClick={save} className="btn-primary" disabled={createDelivery.isPending} style={{ flex: 1, padding: '10px' }}>
            {createDelivery.isPending ? 'Creating…' : 'Create delivery'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Add supplier modal ────────────────────────────────────────────────────────

function SupplierModal({ onClose }: { onClose: () => void }) {
  const createSupplier = useCreateSupplier();
  const [form, setForm] = useState({ name: '', contact_name: '', phone: '', email: '', notes: '' });
  const [error, setError] = useState('');

  async function save() {
    if (!form.name) { setError('Supplier name is required.'); return; }
    try {
      await createSupplier.mutateAsync(form);
      onClose();
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to add supplier.'); }
  }

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '400px', padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Add supplier</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="form-group"><label className="form-label">Supplier name *</label><input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Fresh Direct" autoFocus /></div>
          <div className="form-group"><label className="form-label">Contact name</label><input value={form.contact_name} onChange={e => f('contact_name', e.target.value)} placeholder="e.g. James Walsh" /></div>
          <div className="form-group"><label className="form-label">Phone</label><input value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="07700 900000" /></div>
          <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="supplier@example.com" /></div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '1.25rem' }}>
          <button onClick={save} className="btn-primary" disabled={createSupplier.isPending} style={{ flex: 1, padding: '10px' }}>
            {createSupplier.isPending ? 'Adding…' : 'Add supplier'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main deliveries page ──────────────────────────────────────────────────────

export function InventoryDeliveriesPage() {
  const [tab, setTab] = useState<'deliveries' | 'suppliers'>('deliveries');

  // Auto-open new delivery modal if prefill_order param is present
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillId = params.get('prefill_order');
    if (prefillId) {
      setPrefillOrderId(prefillId);
      setShowNew(true);
      // Clean URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const [prefillOrderId, setPrefillOrderId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [from] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));

  const { data: deliveries = [], isLoading } = useDeliveries(from);
  const { data: suppliers = [] } = useSuppliers();
  const { data: orders = [] } = useOrderHistory();

  const expected  = deliveries.filter((d: any) => d.status === 'expected').length;
  const partial   = deliveries.filter((d: any) => d.status === 'partial').length;
  const weekSpend = 0; // Phase 4 adds costs

  const discrepancyCount = deliveries.filter((d: any) => d.has_discrepancy).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Deliveries</h1>
          <p className="page-sub">Track incoming stock and manage suppliers</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tab === 'suppliers'
            ? <button className="btn-primary" onClick={() => setShowNewSupplier(true)}>+ Add supplier</button>
            : <button className="btn-primary" onClick={() => setShowNew(true)}>+ Log delivery</button>
          }
        </div>
      </div>

      {/* Metric cards */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">Expected today</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>{expected}</div>
          <div className="metric-sub">deliveries pending</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Discrepancies</div>
          <div className="metric-val" style={{ color: discrepancyCount > 0 ? '#C9973A' : 'var(--color-text-primary)' }}>{discrepancyCount}</div>
          <div className="metric-sub">last 30 days</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Partial deliveries</div>
          <div className="metric-val">{partial}</div>
          <div className="metric-sub">last 30 days</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Suppliers</div>
          <div className="metric-val">{suppliers.length}</div>
          <div className="metric-sub">active</div>
        </div>
      </div>

      {/* Discrepancy alert */}
      {discrepancyCount > 0 && (
        <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#633806', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚠</span>
          <strong>{discrepancyCount} delivery{discrepancyCount !== 1 ? 'ies' : ''} with shortfalls in the last 30 days.</strong>
          <span>Check with your supplier if discrepancies are repeated.</span>
        </div>
      )}

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {[{ id: 'deliveries', label: 'Deliveries' }, { id: 'suppliers', label: 'Suppliers' }].map((t: any) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent',
            color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)',
            fontWeight: tab === t.id ? 500 : 400, borderRadius: 0, marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Deliveries tab ─────────────────────────────────────────────────── */}
      {tab === 'deliveries' && (
        isLoading ? (
          <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading deliveries…</div>
        ) : deliveries.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '1rem' }}>🚚</div>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No deliveries yet</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Log your first delivery to start tracking stock.</div>
            <button className="btn-primary" onClick={() => setShowNew(true)}>+ Log delivery</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 80px 200px 120px', padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <div>Supplier</div><div>Date</div><div>Items</div><div>Invoice</div><div>Status</div><div></div>
            </div>
            {deliveries.map((d: any, idx: number) => {
              const st = STATUS[d.status] || STATUS.expected;
              return (
                <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 80px 200px 120px', padding: '12px 16px', borderBottom: idx < deliveries.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{d.supplier_name || 'Unknown supplier'}</div>
                    {d.has_discrepancy && <div style={{ fontSize: '11px', color: '#854f0b', marginTop: '2px' }}>⚠ Shortfall logged</div>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{format(parseISO(d.delivery_date), 'd MMM yyyy')}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{d.line_count || '—'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{d.invoice_ref || '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot }} />
                    <span style={{ fontSize: '11px', fontWeight: 500, background: st.bg, color: st.text, padding: '2px 8px', borderRadius: '20px' }}>{st.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {d.status === 'expected' && (
                      <button onClick={() => setReceivingId(d.id)} style={{ fontSize: '12px', padding: '4px 10px', background: '#C41E3A', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                        Receive
                      </button>
                    )}
                    {(d.status === 'received' || d.status === 'partial') && (
                      <button onClick={() => setReceivingId(d.id)} style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer' }}>View</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Suppliers tab ──────────────────────────────────────────────────── */}
      {tab === 'suppliers' && (
        suppliers.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No suppliers yet</div>
            <button className="btn-primary" onClick={() => setShowNewSupplier(true)}>+ Add supplier</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 100px 80px', padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <div>Supplier</div><div>Contact</div><div>Email</div><div>Deliveries</div><div>Reliability</div>
            </div>
            {suppliers.map((s: any, idx: number) => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 100px 80px', padding: '12px 16px', borderBottom: idx < suppliers.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.name}</div>
                  {s.phone && <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{s.phone}</div>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{s.contact_name || '—'}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{s.email || '—'}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{s.total_deliveries}</div>
                <div>
                  {s.reliability_pct !== null ? (
                    <span style={{ fontSize: '12px', fontWeight: 500, color: s.reliability_pct >= 90 ? '#27500a' : s.reliability_pct >= 70 ? '#633806' : '#9e1830' }}>
                      {s.reliability_pct}%
                    </span>
                  ) : <span style={{ fontSize: '12px', color: '#d0cec6' }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {showNew && <NewDeliveryModal suppliers={suppliers} orders={orders} prefillOrderId={prefillOrderId} onClose={() => { setShowNew(false); setPrefillOrderId(null); }} />}
      {showNewSupplier && <SupplierModal onClose={() => setShowNewSupplier(false)} />}
      {receivingId && <ReceiveModal deliveryId={receivingId} onClose={() => setReceivingId(null)} />}
    </div>
  );
}
