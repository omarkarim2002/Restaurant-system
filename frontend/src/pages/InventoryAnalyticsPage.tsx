import React, { useState } from 'react';
import { format, subWeeks, startOfWeek, parseISO, addWeeks } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function usePatterns() {
  return useQuery({ queryKey: ['inv-patterns'], queryFn: () => api.get('/inventory/analytics/patterns').then(r => r.data.data), staleTime: 300_000 });
}
function useWaste(from: string) {
  return useQuery({ queryKey: ['inv-waste', from], queryFn: () => api.get(`/inventory/analytics/waste?from=${from}`).then(r => r.data.data), staleTime: 60_000 });
}
function useDigests() {
  return useQuery({ queryKey: ['inv-digests'], queryFn: () => api.get('/inventory/analytics/digest').then(r => r.data.data), staleTime: 300_000 });
}
function useGenerateDigest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (week_start: string) => api.post('/inventory/analytics/digest', { week_start }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-digests'] }),
  });
}
function useLogWaste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: any) => api.post('/inventory/analytics/waste', b).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-waste'] }),
  });
}
function useItems() {
  return useQuery({ queryKey: ['inv-items'], queryFn: () => api.get('/inventory/items').then(r => r.data.data), staleTime: 60_000 });
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

// ── Log waste modal ───────────────────────────────────────────────────────────

function WasteModal({ items, onClose }: { items: any[]; onClose: () => void }) {
  const logWaste = useLogWaste();
  const [form, setForm] = useState({ item_id: items[0]?.id || '', quantity: '', reason: '', notes: '', log_date: format(new Date(), 'yyyy-MM-dd') });
  const [error, setError] = useState('');
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function save() {
    if (!form.item_id || !form.quantity) { setError('Item and quantity are required.'); return; }
    try { await logWaste.mutateAsync(form); onClose(); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to log waste.'); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '400px', padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Log waste</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Item *</label>
            <select value={form.item_id} onChange={e => f('item_id', e.target.value)}>
              {items.map((i: any) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input type="number" min={0} step={0.5} value={form.quantity} onChange={e => f('quantity', e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" value={form.log_date} onChange={e => f('log_date', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <select value={form.reason} onChange={e => f('reason', e.target.value)}>
              <option value="">Select reason</option>
              <option value="spoiled">Spoiled / expired</option>
              <option value="overcooked">Overcooked</option>
              <option value="over_prepped">Over-prepped</option>
              <option value="damaged">Damaged in delivery</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Optional detail" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '1.25rem' }}>
          <button onClick={save} className="btn-primary" disabled={logWaste.isPending} style={{ flex: 1, padding: '10px' }}>
            {logWaste.isPending ? 'Logging…' : 'Log waste'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'digest' | 'patterns' | 'waste';

export function InventoryAnalyticsPage() {
  const [tab, setTab]           = useState<Tab>('digest');
  const [showWaste, setShowWaste] = useState(false);
  const [generatingDigest, setGeneratingDigest] = useState(false);

  const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const wasteFrom = format(subWeeks(new Date(), 4), 'yyyy-MM-dd');

  const { data: patterns, isLoading: patternsLoading } = usePatterns();
  const { data: wasteData = [], isLoading: wasteLoading } = useWaste(wasteFrom);
  const { data: digests = [], isLoading: digestsLoading } = useDigests();
  const { data: items = [] } = useItems();
  const generateDigest = useGenerateDigest();

  const totalWasteCost = wasteData.reduce((s: number, w: any) => s + (w.waste_cost || 0), 0);
  const overOrderedCount  = patterns?.over_ordered?.length || 0;
  const underOrderedCount = patterns?.under_ordered?.length || 0;

  async function handleGenerateDigest() {
    setGeneratingDigest(true);
    try { await generateDigest.mutateAsync(thisWeek); }
    catch (e: any) { alert(e.response?.data?.error || 'Failed to generate digest.'); }
    finally { setGeneratingDigest(false); }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Smart analytics</h1>
          <p className="page-sub">AI-powered ordering patterns, waste tracking, and weekly insights</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowWaste(true)} style={{ fontSize: '13px' }}>+ Log waste</button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">Over-ordered items</div>
          <div className="metric-val" style={{ color: overOrderedCount > 0 ? '#C9973A' : 'var(--color-text-primary)' }}>{overOrderedCount}</div>
          <div className="metric-sub">consistently above par level</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Under-ordered items</div>
          <div className="metric-val" style={{ color: underOrderedCount > 0 ? '#C41E3A' : 'var(--color-text-primary)' }}>{underOrderedCount}</div>
          <div className="metric-sub">consistently below par level</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Waste cost (4 weeks)</div>
          <div className="metric-val" style={{ color: totalWasteCost > 0 ? '#C41E3A' : 'var(--color-text-primary)' }}>
            {totalWasteCost > 0 ? `£${totalWasteCost.toFixed(2)}` : '—'}
          </div>
          <div className="metric-sub">{wasteData.length > 0 ? `${wasteData.length} items logged` : 'no waste logged'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">AI digests</div>
          <div className="metric-val">{digests.length}</div>
          <div className="metric-sub">weekly summaries generated</div>
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {[
          { id: 'digest',   label: 'Weekly digest' },
          { id: 'patterns', label: 'Order patterns' },
          { id: 'waste',    label: 'Waste tracker' },
        ].map((t: any) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent',
            color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)',
            fontWeight: tab === t.id ? 500 : 400, borderRadius: 0, marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Weekly digest tab ─────────────────────────────────────────────── */}
      {tab === 'digest' && (
        <div>
          <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem', fontSize: '13px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <div style={{ flex: 1 }}>
              Generate a weekly AI summary of your ordering activity, delivery issues, and waste. Gets smarter as more data accumulates.
            </div>
            <button onClick={handleGenerateDigest} disabled={generatingDigest} className="btn-primary" style={{ fontSize: '12px', padding: '6px 14px', whiteSpace: 'nowrap' }}>
              {generatingDigest ? 'Generating…' : 'Generate this week →'}
            </button>
          </div>

          {digestsLoading ? (
            <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading digests…</div>
          ) : digests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '40px', marginBottom: '1rem' }}>📊</div>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No digests yet</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
                Generate your first weekly digest above. Works best with at least 2 weeks of orders and deliveries.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {digests.map((digest: any) => {
                const weekEnd = format(addWeeks(parseISO(digest.week_start), 1), 'd MMM');
                return (
                  <div key={digest.id} className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Week of {format(parseISO(digest.week_start), 'd MMM')} – {weekEnd}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                        Generated {format(parseISO(digest.created_at), 'd MMM HH:mm')}
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.8, color: 'var(--color-text-primary)', whiteSpace: 'pre-line' }}>
                      {digest.content}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Order patterns tab ────────────────────────────────────────────── */}
      {tab === 'patterns' && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            Based on your last 8 weeks of submitted orders. Items are flagged when they consistently deviate from par levels.
          </div>

          {patternsLoading ? (
            <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Analysing patterns…</div>
          ) : !patterns ? null : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Over-ordered */}
              {patterns.over_ordered.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#854f0b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef9f27', display: 'inline-block' }} />
                    Consistently over-ordered ({patterns.over_ordered.length})
                  </div>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 120px', padding: '7px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      <div>Item</div><div>Par level</div><div>Avg ordered</div><div>Avg excess</div><div>Orders analysed</div>
                    </div>
                    {patterns.over_ordered.map((item: any, idx: number) => (
                      <div key={item.item_id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 120px', padding: '11px 16px', borderBottom: idx < patterns.over_ordered.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.category_icon} {item.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{item.category_name}</div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.par_level} {item.unit}</div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.avg_qty.toFixed(1)} {item.unit}</div>
                        <div style={{ fontSize: '12px', color: '#854f0b', fontWeight: 500 }}>+{item.avg_excess.toFixed(1)} {item.unit}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{item.order_count} orders</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '6px', fontStyle: 'italic' }}>
                    Consider raising the par level to match actual ordering patterns, or review whether you need this much.
                  </div>
                </div>
              )}

              {/* Under-ordered */}
              {patterns.under_ordered.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#9e1830', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C41E3A', display: 'inline-block' }} />
                    Consistently under-ordered ({patterns.under_ordered.length})
                  </div>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 110px 120px', padding: '7px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      <div>Item</div><div>Par level</div><div>Avg ordered</div><div>Avg shortfall</div><div>Orders analysed</div>
                    </div>
                    {patterns.under_ordered.map((item: any, idx: number) => (
                      <div key={item.item_id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 110px 120px', padding: '11px 16px', borderBottom: idx < patterns.under_ordered.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.category_icon} {item.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{item.category_name}</div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.par_level} {item.unit}</div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.avg_qty.toFixed(1)} {item.unit}</div>
                        <div style={{ fontSize: '12px', color: '#9e1830', fontWeight: 500 }}>−{item.avg_shortfall.toFixed(1)} {item.unit}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{item.order_count} orders</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '6px', fontStyle: 'italic' }}>
                    Consider lowering the par level — or check if these items are running out mid-week.
                  </div>
                </div>
              )}

              {/* Supplier shortfalls */}
              {patterns.supplier_shortfalls.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#633806', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef9f27', display: 'inline-block' }} />
                    Suppliers with repeated shortfalls
                  </div>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {patterns.supplier_shortfalls.map((s: any, idx: number) => (
                      <div key={s.supplier_id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '11px 16px', borderBottom: idx < patterns.supplier_shortfalls.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                        <div style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{s.supplier_name}</div>
                        <div style={{ fontSize: '12px', color: '#854f0b' }}>{s.shortfall_count} partial deliveries</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{s.total_variance.toFixed(1)} units short total</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {overOrderedCount === 0 && underOrderedCount === 0 && patterns.supplier_shortfalls.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <div style={{ fontSize: '36px', marginBottom: '1rem' }}>✓</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No patterns detected yet</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    Patterns appear after 6+ submitted orders. Keep logging your daily orders and they'll surface here automatically.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Waste tab ─────────────────────────────────────────────────────── */}
      {tab === 'waste' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
              Last 4 weeks · {format(parseISO(wasteFrom), 'd MMM')} to today
            </div>
            <button onClick={() => setShowWaste(true)} style={{ fontSize: '13px' }}>+ Log waste</button>
          </div>

          {wasteLoading ? (
            <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading…</div>
          ) : wasteData.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '36px', marginBottom: '1rem' }}>♻️</div>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No waste logged</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
                Log waste when items spoil or are over-prepped. This improves your AI order recommendations and helps reduce costs.
              </div>
              <button onClick={() => setShowWaste(true)} style={{ fontSize: '13px' }}>+ Log first waste entry</button>
            </div>
          ) : (
            <div>
              {totalWasteCost > 0 && (
                <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#9e1830' }}>
                  Total estimated waste cost: <strong>£{totalWasteCost.toFixed(2)}</strong> in the last 4 weeks
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 100px 100px', padding: '7px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <div>Item</div><div>Category</div><div>Total waste</div><div>Est. cost</div><div>Log entries</div>
                </div>
                {wasteData.map((w: any, idx: number) => {
                  const colors = COLOR_MAP[w.category_color] || COLOR_MAP.gray;
                  return (
                    <div key={w.item_id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 100px 100px', padding: '11px 16px', borderBottom: idx < wasteData.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{w.name}</div>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 500, background: colors.bg, color: colors.text, padding: '2px 7px', borderRadius: '20px' }}>
                          {w.category_icon} {w.category_name}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#9e1830' }}>{w.total_waste.toFixed(1)} {w.unit}</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: w.waste_cost > 0 ? '#9e1830' : '#d0cec6' }}>
                        {w.waste_cost > 0 ? `£${w.waste_cost.toFixed(2)}` : '—'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{w.log_count}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '8px', fontStyle: 'italic' }}>
                Waste data feeds into the AI order recommendations — items with high waste rates get reduced suggested quantities.
              </div>
            </div>
          )}
        </div>
      )}

      {showWaste && <WasteModal items={items} onClose={() => setShowWaste(false)} />}
    </div>
  );
}
