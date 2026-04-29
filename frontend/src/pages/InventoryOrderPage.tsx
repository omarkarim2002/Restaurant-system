import React, { useState, useRef } from 'react';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useOrderLines(date: string) {
  return useQuery({
    queryKey: ['inv-order', date],
    queryFn: () => api.get(`/inventory/orders/${date}/lines`).then(r => r.data.data),
    enabled: !!date,
    staleTime: 30_000,
  });
}

function useOrderHistory() {
  return useQuery({
    queryKey: ['inv-order-history'],
    queryFn: () => api.get('/inventory/orders/history').then(r => r.data.data),
    staleTime: 60_000,
  });
}

function useUpdateLine(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, quantity, notes }: { lineId: string; quantity: number; notes?: string }) =>
      api.patch(`/inventory/orders/${date}/lines/${lineId}`, { quantity, notes }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-order', date] }),
  });
}

function useSubmitOrder(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/inventory/orders/${date}/submit`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv-order', date] });
      qc.invalidateQueries({ queryKey: ['inv-order-history'] });
    },
  });
}

function useExtractSheet() {
  return useMutation({
    mutationFn: (body: any) => api.post('/inventory/orders/extract-sheet', body).then(r => r.data.data),
  });
}

// ── Color map ─────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  red:    { bg: '#fde8ec', text: '#9e1830' },
  green:  { bg: '#eaf3de', text: '#27500a' },
  blue:   { bg: '#e6f1fb', text: '#0c447c' },
  amber:  { bg: '#faeeda', text: '#633806' },
  teal:   { bg: '#e1f5ee', text: '#085041' },
  gray:   { bg: '#f1efe8', text: '#444441' },
  purple: { bg: '#eeedfe', text: '#3c3489' },
};

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({ date, lines, onApply, onClose }: {
  date: string; lines: any[]; onApply: (extracted: any[]) => void; onClose: () => void;
}) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const extract   = useExtractSheet();
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult]   = useState<any[] | null>(null);
  const [error, setError]     = useState('');

  async function handleFile(file: File) {
    setError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setPreview(reader.result as string);
      try {
        const data = await extract.mutateAsync({ image_base64: base64, media_type: file.type || 'image/jpeg', order_date: date });
        // Merge with known lines
        const merged = data.lines.map((l: any) => {
          const line = lines.find((line: any) => line.item_id === l.item_id);
          return { ...l, name: line?.name || 'Unknown item', unit: line?.unit || 'unit' };
        });
        setResult(merged);
      } catch (e: any) { setError(e.response?.data?.error || 'Extraction failed — try a clearer photo.'); }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Upload order sheet</h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>AI reads handwritten quantities and fills in the form</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          {!result && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{ border: '2px dashed var(--color-border-secondary)', borderRadius: '10px', padding: preview ? '12px' : '2.5rem', textAlign: 'center', cursor: 'pointer', background: 'var(--color-background-secondary)' }}
            >
              {preview ? (
                <img src={preview} alt="preview" style={{ maxHeight: '220px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} />
              ) : (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📸</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Drop your order sheet here</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Photo or scan · PNG, JPG · Click to browse</div>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>
          )}

          {extract.isPending && (
            <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '12px 14px', marginTop: '1rem', fontSize: '13px', color: '#0c447c', textAlign: 'center' }}>
              🤖 Reading your order sheet…
            </div>
          )}

          {result && (
            <>
              <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem', fontSize: '13px', color: '#27500a' }}>
                ✓ Found {result.length} quantities — review before applying
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {result.map((r: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: '8px' }}>
                    <div style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: '13px', color: '#0c447c', fontWeight: 500 }}>{r.quantity} {r.unit}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          {result ? (
            <>
              <button onClick={() => onApply(result)} className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                Apply {result.length} quantities →
              </button>
              <button onClick={() => { setResult(null); setPreview(null); }} style={{ padding: '10px 14px', borderRadius: '8px' }}>Retake</button>
            </>
          ) : (
            <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InventoryOrderPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate]             = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd')); // default tomorrow
  const [showUpload, setShowUpload] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [pendingUpdates, setPending] = useState<Record<string, number>>({});

  const { data, isLoading, refetch } = useOrderLines(date);
  const { data: history = [] }       = useOrderHistory();
  const updateLine  = useUpdateLine(date);
  const submitOrder = useSubmitOrder(date);

  const order = data?.order;
  const lines: any[] = data?.lines || [];
  const isSubmitted = order?.status === 'submitted';

  // Group lines by category
  const grouped: Record<string, { cat: any; lines: any[] }> = {};
  for (const line of lines) {
    if (!grouped[line.category_id]) {
      grouped[line.category_id] = {
        cat: { name: line.category_name, icon: line.category_icon, color: line.category_color },
        lines: [],
      };
    }
    grouped[line.category_id].lines.push(line);
  }

  const totalItems = lines.filter(l => (pendingUpdates[l.line_id] ?? parseFloat(l.quantity)) > 0).length;

  function getQty(line: any): number {
    return pendingUpdates[line.line_id] ?? parseFloat(line.quantity) ?? 0;
  }

  function setQty(lineId: string, val: number) {
    setPending(prev => ({ ...prev, [lineId]: val }));
  }

  async function saveAll() {
    for (const [lineId, quantity] of Object.entries(pendingUpdates)) {
      await updateLine.mutateAsync({ lineId, quantity });
    }
    setPending({});
  }

  async function handleSubmit() {
    await saveAll();
    await submitOrder.mutateAsync();
    setSubmitted(true);
  }

  function useSuggested() {
    const updates: Record<string, number> = {};
    for (const line of lines) updates[line.line_id] = parseFloat(line.suggested_qty) || 0;
    setPending(updates);
  }

  function applyExtracted(extracted: any[]) {
    const updates: Record<string, number> = { ...pendingUpdates };
    for (const e of extracted) {
      const line = lines.find(l => l.item_id === e.item_id);
      if (line) updates[line.line_id] = e.quantity;
    }
    setPending(updates);
    setShowUpload(false);
  }

  const dateLabel = date === today ? 'Today' : date === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'Tomorrow' : format(parseISO(date), 'EEEE d MMM');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Daily order</h1>
          <p className="page-sub">Set quantities to order for {dateLabel.toLowerCase()}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{ fontSize: '13px' }}>
            📋 {showHistory ? 'Hide' : 'Order'} history
          </button>
          {!isSubmitted && (
            <>
              <button onClick={() => setShowUpload(true)} style={{ fontSize: '13px' }}>📸 Upload sheet</button>
              <button onClick={useSuggested} style={{ fontSize: '13px' }}>🤖 AI suggestions</button>
              <button onClick={handleSubmit} className="btn-primary" disabled={submitOrder.isPending || totalItems === 0}>
                {submitOrder.isPending ? 'Submitting…' : `Submit order (${totalItems} items)`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Date navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
        <button onClick={() => setDate(format(subDays(parseISO(date), 1), 'yyyy-MM-dd'))}>← Prev</button>
        <button onClick={() => setDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'))}>Tomorrow</button>
        <button onClick={() => setDate(format(addDays(new Date(), 2), 'yyyy-MM-dd'))}>Day after</button>
        <button onClick={() => setDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'))}>Next →</button>
        <div style={{ fontSize: '14px', fontWeight: 500, marginLeft: '8px' }}>
          {format(parseISO(date), 'EEEE d MMMM yyyy')}
        </div>
        {isSubmitted && <span className="badge badge-green" style={{ marginLeft: '8px' }}>✓ Submitted</span>}
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '13px', marginBottom: '0.75rem' }}>Recent orders</h3>
          {history.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No submitted orders yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {history.slice(0, 10).map((o: any) => (
                <div key={o.id} onClick={() => { setDate(o.order_date); setShowHistory(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', background: 'var(--color-background-secondary)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{format(parseISO(o.order_date), 'EEE d MMM yyyy')}</div>
                  <span className="badge badge-green" style={{ marginLeft: 'auto' }}>Submitted</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submitted banner */}
      {(isSubmitted || submitted) && (
        <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#27500a' }}>
          ✓ Order submitted for {format(parseISO(date), 'EEEE d MMMM yyyy')} — {totalItems || lines.filter(l => parseFloat(l.quantity) > 0).length} items ordered
        </div>
      )}

      {/* AI suggestion banner */}
      {!isSubmitted && !isLoading && lines.length > 0 && (
        <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#0c447c', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span>🤖</span>
          <div>
            <strong>AI suggestions loaded</strong> — quantities based on your order history for this day of week and current par levels. Adjust any amounts before submitting.
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading order…</div>
      ) : lines.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '36px', marginBottom: '1rem' }}>📦</div>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No inventory items</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Add items to your inventory first — go to the Items page.
          </div>
        </div>
      ) : (
        <>
          {Object.values(grouped).map(({ cat, lines: catLines }) => {
            const colors = COLOR_MAP[cat.color] || COLOR_MAP.gray;
            return (
              <div key={cat.name} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '12px' }}>
                {/* Category header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: colors.bg, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <span style={{ fontSize: '16px' }}>{cat.icon}</span>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>{cat.name}</div>
                  <div style={{ fontSize: '11px', color: colors.text, opacity: 0.7, marginLeft: 'auto' }}>
                    {catLines.filter((l: any) => getQty(l) > 0).length} of {catLines.length} items ordered
                  </div>
                </div>

                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 100px 150px', padding: '6px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <div>Item</div><div>Unit</div><div>Par level</div><div>AI suggested</div><div>Order quantity</div>
                </div>

                {catLines.map((line: any, idx: number) => {
                  const qty       = getQty(line);
                  const suggested = parseFloat(line.suggested_qty) || 0;
                  const isOver    = suggested > 0 && qty > suggested * 1.3;
                  const isUnder   = suggested > 0 && qty < suggested * 0.7 && qty > 0;
                  const isZero    = qty === 0;

                  return (
                    <div key={line.line_id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 100px 150px', padding: '11px 16px', borderBottom: idx < catLines.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center', opacity: isSubmitted ? 0.8 : 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: isZero ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>
                        {line.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{line.unit}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{line.par_level} {line.unit}</div>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: suggested > 0 ? '#0c447c' : '#d0cec6' }}>
                        {suggested > 0 ? `${suggested} ${line.unit}` : '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isSubmitted ? (
                          <span style={{ fontSize: '13px', fontWeight: 500 }}>{qty > 0 ? `${qty} ${line.unit}` : '—'}</span>
                        ) : (
                          <>
                            <input
                              type="number" min={0} step={0.5} value={qty || ''}
                              onChange={e => setQty(line.line_id, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              style={{ width: '70px', fontSize: '13px', padding: '5px 8px', borderColor: isOver ? '#ef9f27' : isUnder ? '#f5b8c4' : undefined }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{line.unit}</span>
                            {isOver && <span style={{ fontSize: '11px', color: '#8a6220' }} title="Over suggested">⚠</span>}
                            {isUnder && <span style={{ fontSize: '11px', color: '#9e1830' }} title="Under suggested">↓</span>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Bottom action bar */}
          {!isSubmitted && Object.keys(pendingUpdates).length > 0 && (
            <div style={{ position: 'sticky', bottom: 0, background: 'white', borderTop: '0.5px solid var(--color-border-tertiary)', padding: '12px 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {Object.keys(pendingUpdates).length} unsaved change{Object.keys(pendingUpdates).length !== 1 ? 's' : ''}
              </div>
              <button onClick={saveAll} style={{ marginLeft: 'auto', fontSize: '13px' }} disabled={updateLine.isPending}>
                {updateLine.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button onClick={handleSubmit} className="btn-primary" disabled={submitOrder.isPending}>
                {submitOrder.isPending ? 'Submitting…' : `Submit order →`}
              </button>
            </div>
          )}
        </>
      )}

      {showUpload && (
        <UploadModal date={date} lines={lines} onApply={applyExtracted} onClose={() => setShowUpload(false)} />
      )}
    </div>
  );
}
