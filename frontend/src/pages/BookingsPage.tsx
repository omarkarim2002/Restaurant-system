import React, { useState, useRef } from 'react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useBookings(date?: string, status?: string) {
  return useQuery({
    queryKey: ['bookings', date, status],
    queryFn: () => {
      const p = new URLSearchParams();
      if (date) p.set('date', date);
      if (status) p.set('status', status);
      return api.get(`/bookings?${p}`).then(r => r.data.data);
    },
    staleTime: 30_000,
  });
}
function useTables() {
  return useQuery({ queryKey: ['tables'], queryFn: () => api.get('/bookings/tables').then(r => r.data.data), staleTime: 60_000 });
}
function useFloorPlan(date: string, time: string) {
  return useQuery({
    queryKey: ['floor-plan', date, time],
    queryFn: () => api.get(`/bookings/seating/floor-plan?date=${date}&time=${time}`).then(r => r.data.data),
    staleTime: 30_000,
  });
}
function useSeatingRecommend() {
  return useMutation({ mutationFn: (b: any) => api.post('/bookings/seating/recommend', b).then(r => r.data.data) });
}
function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/bookings', b).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['floor-plan'] }); } });
}
function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/bookings/${id}`, b).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['floor-plan'] }); } });
}
function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/bookings/${id}`).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['floor-plan'] }); } });
}
function useAssignTables() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, table_ids }: any) => api.post(`/bookings/${id}/assign`, { table_ids }).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['floor-plan'] }); } });
}
function useCreateTable() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/bookings/tables', b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }) });
}
function useUploadPlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/bookings/seating-plans', b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['seating-plans'] }) });
}
function useExtractPlan() {
  return useMutation({ mutationFn: ({ id, media_type }: any) => api.post(`/bookings/seating-plans/${id}/extract`, { media_type }).then(r => r.data.data) });
}
function useImportPlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...b }: any) => api.post(`/bookings/seating-plans/${id}/import`, b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }) });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  confirmed: { bg: '#e6f1fb', text: '#0c447c', dot: '#85b7eb', label: 'Confirmed' },
  seated:    { bg: '#eaf3de', text: '#27500a', dot: '#97c459', label: 'Seated' },
  completed: { bg: '#f1efe8', text: '#444441', dot: '#b4b2a9', label: 'Completed' },
  cancelled: { bg: '#fde8ec', text: '#9e1830', dot: '#f09595', label: 'Cancelled' },
  no_show:   { bg: '#faeeda', text: '#633806', dot: '#ef9f27', label: 'No show' },
};

const TIMES = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 11;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

const SECTIONS = ['Main', 'Bar', 'Outside', 'Private'];

const FIT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  exact:    { bg: '#eaf3de', text: '#27500a', border: '#97c459' },
  good:     { bg: '#e6f1fb', text: '#0c447c', border: '#85b7eb' },
  combined: { bg: '#faeeda', text: '#633806', border: '#ef9f27' },
  oversized:{ bg: '#f1efe8', text: '#444441', border: '#d3d1c7' },
};

// ── Interactive floor plan ────────────────────────────────────────────────────

function FloorPlan({ tables, selectedIds, onToggle, highlightIds }: {
  tables: any[]; selectedIds: string[]; onToggle?: (id: string) => void; highlightIds?: string[];
}) {
  if (!tables.length) return (
    <div style={{ textAlign: 'center', padding: '2rem', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
      No tables configured — upload a floor plan or add tables manually.
    </div>
  );

  const sections = [...new Set(tables.map((t: any) => t.section as string))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {sections.map((section: any) => {
        const sectionTables = tables.filter((t: any) => t.section === section);
        return (
          <div key={String(section)}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px' }}>{String(section)}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {sectionTables.map((t: any) => {
                const isFree      = t.is_free !== false;
                const isSelected  = selectedIds.includes(t.id);
                const isHighlight = highlightIds?.includes(t.id);
                const isRound     = t.shape === 'round';

                let bg = isFree ? 'var(--color-background-secondary)' : '#fde8ec';
                let border = isFree ? 'var(--color-border-secondary)' : '#f5b8c4';
                let color = isFree ? 'var(--color-text-primary)' : '#9e1830';

                if (isSelected) { bg = '#C41E3A'; border = '#C41E3A'; color = 'white'; }
                else if (isHighlight) { bg = '#eaf3de'; border = '#97c459'; color = '#27500a'; }

                return (
                  <div key={t.id} onClick={() => isFree && onToggle?.(t.id)}
                    title={isFree ? `${t.name} — ${t.capacity} seats` : `${t.name} — booked: ${t.conflict_booking}`}
                    style={{
                      width: isRound ? '70px' : '90px',
                      height: isRound ? '70px' : '56px',
                      borderRadius: isRound ? '50%' : '10px',
                      background: bg,
                      border: `1.5px solid ${border}`,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      cursor: isFree && onToggle ? 'pointer' : 'default',
                      transition: 'all 0.15s',
                      userSelect: 'none',
                    }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color }}>{t.name}</div>
                    <div style={{ fontSize: '10px', color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--color-text-tertiary)', marginTop: '2px' }}>
                      {t.capacity} seats
                    </div>
                    {!isFree && (
                      <div style={{ fontSize: '9px', color: '#9e1830', marginTop: '1px' }}>booked</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-secondary)' }} />Free</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#fde8ec', border: '1px solid #f5b8c4' }} />Booked</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#C41E3A' }} />Selected</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#eaf3de', border: '1px solid #97c459' }} />AI suggested</div>
      </div>
    </div>
  );
}

// ── New booking + seating AI modal ────────────────────────────────────────────

function NewBookingModal({ onClose, initialDate }: { onClose: () => void; initialDate: string }) {
  const create     = useCreateBooking();
  const recommend  = useSeatingRecommend();
  const assignTbls = useAssignTables();
  const { data: floorData } = useFloorPlan(initialDate, '19:00');

  const [step, setStep] = useState<'details' | 'seating'>('details');
  const [form, setForm] = useState({
    booking_date: initialDate, booking_time: '19:00', party_size: 2,
    guest_name: '', guest_phone: '', guest_email: '',
    dietary_notes: '', internal_notes: '', duration_mins: 90,
  });
  const [createdBooking, setCreatedBooking] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [manualTables, setManualTables] = useState<string[]>([]);
  const [useManual, setUseManual] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const f = (k: string, v: any) => { setForm(p => ({ ...p, [k]: v })); setError(''); };

  async function handleCreate() {
    if (!form.guest_name) { setError('Guest name is required.'); return; }
    setLoading(true);
    try {
      const result = await create.mutateAsync(form);
      setCreatedBooking(result.data);
      // Fetch AI recommendations
      const recs = await recommend.mutateAsync({
        date: form.booking_date, time: form.booking_time,
        party_size: form.party_size, duration_mins: form.duration_mins,
      });
      setRecommendations(recs);
      setStep('seating');
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to create booking.'); }
    finally { setLoading(false); }
  }

  async function handleAssign() {
    if (!createdBooking) return;
    const tableIds = useManual
      ? manualTables
      : (recommendations?.options?.[selectedOption ?? 0]?.table_ids || []);
    if (!tableIds.length) { setError('Please select a seating option.'); return; }
    try {
      await assignTbls.mutateAsync({ id: createdBooking.id, table_ids: tableIds });
      onClose();
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to assign tables.'); }
  }

  const allTables: any[] = recommendations?.all_tables || floorData?.tables || [];
  const selectedOptionData = recommendations?.options?.[selectedOption ?? -1];
  const highlightIds = selectedOptionData?.table_ids || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: step === 'seating' ? '620px' : '480px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', transition: 'width 0.2s' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>
                {step === 'details' ? 'New booking' : `Seat ${form.guest_name} — party of ${form.party_size}`}
              </h3>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                {['details', 'seating'].map((s, i) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: step === s ? '#C41E3A' : 'var(--color-text-tertiary)', fontWeight: step === s ? 500 : 400 }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: step === s ? '#C41E3A' : step === 'seating' && s === 'details' ? '#97c459' : 'var(--color-border-secondary)', color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step === 'seating' && s === 'details' ? '✓' : i + 1}</div>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </div>
                ))}
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          {step === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div className="form-group"><label className="form-label">Date *</label><input type="date" value={form.booking_date} onChange={e => f('booking_date', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Time *</label><select value={form.booking_time} onChange={e => f('booking_time', e.target.value)}>{TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Party size *</label><input type="number" min={1} max={100} value={form.party_size} onChange={e => f('party_size', parseInt(e.target.value) || 1)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group"><label className="form-label">Guest name *</label><input value={form.guest_name} onChange={e => f('guest_name', e.target.value)} placeholder="e.g. Sarah Johnson" autoFocus /></div>
                <div className="form-group"><label className="form-label">Phone</label><input value={form.guest_phone} onChange={e => f('guest_phone', e.target.value)} placeholder="07700 900000" /></div>
              </div>
              <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.guest_email} onChange={e => f('guest_email', e.target.value)} placeholder="guest@email.com" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group"><label className="form-label">Dietary notes</label><input value={form.dietary_notes} onChange={e => f('dietary_notes', e.target.value)} placeholder="Allergies, preferences…" /></div>
                <div className="form-group"><label className="form-label">Duration</label><select value={form.duration_mins} onChange={e => f('duration_mins', parseInt(e.target.value))}><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option><option value={150}>2.5 hours</option><option value={180}>3 hours</option></select></div>
              </div>
              <div className="form-group"><label className="form-label">Internal notes</label><input value={form.internal_notes} onChange={e => f('internal_notes', e.target.value)} placeholder="Staff notes (not shown to guest)" /></div>
            </div>
          )}

          {step === 'seating' && (
            <div>
              {/* AI recommendations */}
              {recommend.isPending ? (
                <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#0c447c', textAlign: 'center' }}>
                  🤖 Haiku is finding the best seating options…
                </div>
              ) : recommendations?.options?.length > 0 ? (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                    AI seating recommendations
                    <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: '8px' }}>powered by Haiku</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recommendations.options.map((opt: any, i: number) => {
                      const fc = FIT_COLORS[opt.fit] || FIT_COLORS.good;
                      const isChosen = selectedOption === i;
                      return (
                        <div key={i} onClick={() => { setSelectedOption(i); setUseManual(false); setError(''); }}
                          style={{ padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${isChosen ? '#C41E3A' : fc.border}`, background: isChosen ? '#fde8ec' : fc.bg, cursor: 'pointer', transition: 'all 0.1s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: isChosen ? '#C41E3A' : fc.border, color: 'white', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: isChosen ? '#9e1830' : fc.text, flex: 1 }}>{opt.label}</div>
                            <div style={{ fontSize: '11px', fontWeight: 500, color: isChosen ? '#9e1830' : fc.text }}>Score {opt.score}/10</div>
                          </div>
                          <div style={{ fontSize: '12px', color: isChosen ? '#b84a5e' : fc.text, marginLeft: '28px', opacity: 0.85 }}>{opt.reasoning}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : recommendations?.message ? (
                <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#633806' }}>
                  ⚠ {recommendations.message}
                </div>
              ) : null}

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>or pick manually</span>
                <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
              </div>

              {/* Floor plan */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                  Floor plan
                  {useManual && manualTables.length > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 400, color: '#27500a', marginLeft: '8px' }}>
                      {manualTables.reduce((s, id) => {
                        const t = allTables.find((t: any) => t.id === id);
                        return s + (t?.capacity || 0);
                      }, 0)} seats selected
                    </span>
                  )}
                </div>
                <FloorPlan
                  tables={allTables}
                  selectedIds={useManual ? manualTables : (selectedOption !== null ? (recommendations?.options?.[selectedOption]?.table_ids || []) : [])}
                  highlightIds={!useManual && selectedOption === null ? recommendations?.options?.[0]?.table_ids : []}
                  onToggle={(id) => {
                    setUseManual(true);
                    setSelectedOption(null);
                    setManualTables(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                    setError('');
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          {step === 'details' ? (
            <>
              <button onClick={handleCreate} className="btn-primary" disabled={loading} style={{ flex: 1, padding: '10px' }}>
                {loading ? 'Creating…' : 'Confirm booking → choose seating'}
              </button>
              <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={handleAssign} className="btn-primary"
                disabled={(!useManual && selectedOption === null) || (useManual && manualTables.length === 0) || assignTbls.isPending}
                style={{ flex: 1, padding: '10px', opacity: ((!useManual && selectedOption === null) || (useManual && manualTables.length === 0)) ? 0.5 : 1 }}>
                {assignTbls.isPending ? 'Assigning…' : 'Confirm seating →'}
              </button>
              <button onClick={() => { onClose(); }} style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>Skip for now</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Table setup modal (unchanged from Phase 1) ────────────────────────────────

function TableSetupModal({ onClose }: { onClose: () => void }) {
  const { data: tables = [] } = useTables();
  const createTable = useCreateTable();
  const fileRef     = useRef<HTMLInputElement>(null);
  const uploadPlan  = useUploadPlan();
  const extractPlan = useExtractPlan();
  const importPlan  = useImportPlan();
  const [tab, setTab]         = useState<'tables' | 'plan'>('tables');
  const [newTable, setNewTable] = useState({ name: '', capacity: 4, section: 'Main', shape: 'rectangle' });
  const [preview, setPreview]   = useState<string | null>(null);
  const [planId, setPlanId]     = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any | null>(null);
  const [error, setError]       = useState('');

  async function addTable() {
    if (!newTable.name) { setError('Table name required.'); return; }
    try { await createTable.mutateAsync(newTable); setNewTable({ name: '', capacity: 4, section: 'Main', shape: 'rectangle' }); setError(''); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to add table.'); }
  }

  async function handleFile(file: File) {
    setError(''); setExtracted(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setPreview(reader.result as string);
      try {
        const plan = await uploadPlan.mutateAsync({ image_base64: base64, media_type: file.type || 'image/jpeg' });
        setPlanId(plan.data.id);
        const result = await extractPlan.mutateAsync({ id: plan.data.id, media_type: file.type || 'image/jpeg' });
        setExtracted(result);
      } catch (e: any) { setError(e.response?.data?.error || 'Extraction failed — try a clearer image.'); }
    };
    reader.readAsDataURL(file);
  }

  async function handleImport() {
    if (!extracted || !planId) return;
    try { await importPlan.mutateAsync({ id: planId, tables: extracted.tables, adjacencies: extracted.adjacencies || [] }); setExtracted(null); setPreview(null); setPlanId(null); setTab('tables'); }
    catch (e: any) { setError(e.response?.data?.error || 'Import failed.'); }
  }

  const sections = [...new Set(tables.map((t: any) => t.section as string))];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 0', borderBottom: '0.5px solid #eee', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Table setup</h3>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex' }}>
            {[{ id: 'tables', label: 'Tables' }, { id: 'plan', label: 'Upload floor plan' }].map((t: any) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 16px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent', color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)', fontWeight: tab === t.id ? 500 : 400, borderRadius: 0, marginBottom: '-1px' }}>{t.label}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}
          {tab === 'tables' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px 110px 80px', gap: '8px', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Name</label><input value={newTable.name} onChange={e => setNewTable(p => ({ ...p, name: e.target.value }))} placeholder="Table 1" /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Seats</label><input type="number" min={1} max={50} value={newTable.capacity} onChange={e => setNewTable(p => ({ ...p, capacity: parseInt(e.target.value) || 1 }))} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Section</label><select value={newTable.section} onChange={e => setNewTable(p => ({ ...p, section: e.target.value }))}>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Shape</label><select value={newTable.shape} onChange={e => setNewTable(p => ({ ...p, shape: e.target.value }))}><option value="rectangle">Rectangle</option><option value="round">Round</option></select></div>
                <button onClick={addTable} className="btn-primary" disabled={createTable.isPending} style={{ padding: '8px', fontSize: '13px' }}>+ Add</button>
              </div>
              {sections.length === 0 ? <div style={{ textAlign: 'center', padding: '2rem', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No tables yet.</div> : sections.map((section: any) => (
                <div key={String(section)} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>{String(section)}</div>
                  {tables.filter((t: any) => t.section === section).map((t: any) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: '7px', marginBottom: '4px', fontSize: '13px' }}>
                      <div style={{ fontWeight: 500, flex: 1 }}>{t.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{t.shape} · {t.capacity} seats</div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
          {tab === 'plan' && (
            <>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
                Upload a photo of your floor plan. Haiku will extract tables, sections, and adjacencies — then you review before importing.
              </div>
              {!extracted && (
                <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  style={{ border: '2px dashed var(--color-border-secondary)', borderRadius: '10px', padding: preview ? '12px' : '2.5rem', textAlign: 'center', cursor: 'pointer', background: 'var(--color-background-secondary)', marginBottom: '1rem' }}>
                  {preview ? <img src={preview} alt="preview" style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} /> : <><div style={{ fontSize: '32px', marginBottom: '8px' }}>🗺</div><div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Drop your floor plan here</div><div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>PNG, JPG · Click to browse</div></>}
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                </div>
              )}
              {(uploadPlan.isPending || extractPlan.isPending) && <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#0c447c', textAlign: 'center' }}>🤖 Haiku is reading your floor plan…</div>}
              {extracted && (
                <>
                  <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem', fontSize: '13px', color: '#27500a' }}>✓ Found {extracted.tables?.length || 0} tables · {extracted.adjacencies?.length || 0} adjacent pairs{extracted.summary && ` · ${extracted.summary}`}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                    {extracted.tables?.map((t: any, i: number) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px', gap: '8px', padding: '7px 10px', background: 'var(--color-background-secondary)', borderRadius: '7px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 500 }}>{t.name}</div><div style={{ color: 'var(--color-text-secondary)' }}>{t.section}</div><div style={{ color: 'var(--color-text-secondary)' }}>{t.capacity} seats</div><div style={{ color: 'var(--color-text-secondary)' }}>{t.shape}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          {tab === 'plan' && extracted ? <><button onClick={handleImport} className="btn-primary" disabled={importPlan.isPending} style={{ flex: 1, padding: '10px' }}>{importPlan.isPending ? 'Importing…' : `Import ${extracted.tables?.length || 0} tables →`}</button><button onClick={() => { setExtracted(null); setPreview(null); setPlanId(null); }} style={{ padding: '10px 14px', borderRadius: '8px' }}>Retake</button></> : <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Done</button>}
        </div>
      </div>
    </div>
  );
}

// ── Booking detail modal ──────────────────────────────────────────────────────

function BookingDetailModal({ booking, onClose }: { booking: any; onClose: () => void }) {
  const update     = useUpdateBooking();
  const cancel     = useCancelBooking();
  const assignTbls = useAssignTables();
  const recommend  = useSeatingRecommend();
  const { data: floorData } = useFloorPlan(
    format(parseISO(booking.booking_date), 'yyyy-MM-dd'),
    booking.booking_time?.slice(0, 5) || '19:00'
  );

  const [selectedTables, setSelectedTables] = useState<string[]>(booking.tables?.map((t: any) => t.table_id) || []);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [selectedOption, setSelectedOption]   = useState<number | null>(null);
  const [loadingRecs, setLoadingRecs]         = useState(false);
  const [error, setError] = useState('');

  const allTables: any[] = floorData?.tables || [];
  const st = STATUS[booking.status] || STATUS.confirmed;

  async function loadRecommendations() {
    setLoadingRecs(true);
    try {
      const recs = await recommend.mutateAsync({
        date: format(parseISO(booking.booking_date), 'yyyy-MM-dd'),
        time: booking.booking_time?.slice(0, 5),
        party_size: booking.party_size,
        duration_mins: booking.duration_mins || 90,
      });
      setRecommendations(recs);
    } catch { setError('Failed to get recommendations.'); }
    finally { setLoadingRecs(false); }
  }

  async function handleAssign() {
    const tableIds = selectedOption !== null
      ? (recommendations?.options?.[selectedOption]?.table_ids || [])
      : selectedTables;
    if (!tableIds.length) { setError('Select tables to assign.'); return; }
    try { await assignTbls.mutateAsync({ id: booking.id, table_ids: tableIds }); onClose(); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to assign.'); }
  }

  async function handleStatus(status: string) {
    await update.mutateAsync({ id: booking.id, status });
    onClose();
  }

  const highlightIds = selectedOption !== null ? (recommendations?.options?.[selectedOption]?.table_ids || []) : [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>{booking.guest_name}</h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
              {format(parseISO(booking.booking_date), 'EEE d MMM')} at {booking.booking_time?.slice(0, 5)} · Party of {booking.party_size}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, background: st.bg, color: st.text, padding: '2px 9px', borderRadius: '20px' }}>{st.label}</span>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          {/* Guest info */}
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
            {booking.guest_phone && <div><div style={{ color: 'var(--color-text-tertiary)' }}>Phone</div><div style={{ fontWeight: 500, marginTop: '1px' }}>{booking.guest_phone}</div></div>}
            {booking.guest_email && <div><div style={{ color: 'var(--color-text-tertiary)' }}>Email</div><div style={{ fontWeight: 500, marginTop: '1px' }}>{booking.guest_email}</div></div>}
            {booking.dietary_notes && <div style={{ gridColumn: '1/-1' }}><div style={{ color: 'var(--color-text-tertiary)' }}>Dietary</div><div style={{ fontWeight: 500, marginTop: '1px', color: '#C41E3A' }}>{booking.dietary_notes}</div></div>}
            {booking.internal_notes && <div style={{ gridColumn: '1/-1' }}><div style={{ color: 'var(--color-text-tertiary)' }}>Notes</div><div style={{ fontWeight: 500, marginTop: '1px' }}>{booking.internal_notes}</div></div>}
          </div>

          {/* AI recommendations (on demand) */}
          {!recommendations ? (
            <button onClick={loadRecommendations} disabled={loadingRecs} style={{ width: '100%', padding: '10px', marginBottom: '1rem', fontSize: '13px', background: '#e6f1fb', color: '#0c447c', border: '0.5px solid #85b7eb', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
              {loadingRecs ? '🤖 Haiku is finding options…' : '🤖 Get AI seating recommendations'}
            </button>
          ) : recommendations.options?.length > 0 ? (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>AI recommendations</div>
              {recommendations.options.map((opt: any, i: number) => {
                const fc = FIT_COLORS[opt.fit] || FIT_COLORS.good;
                const isChosen = selectedOption === i;
                return (
                  <div key={i} onClick={() => { setSelectedOption(i); setSelectedTables([]); }} style={{ padding: '10px 12px', borderRadius: '8px', border: `1.5px solid ${isChosen ? '#C41E3A' : fc.border}`, background: isChosen ? '#fde8ec' : fc.bg, cursor: 'pointer', marginBottom: '6px', transition: 'all 0.1s' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: isChosen ? '#9e1830' : fc.text }}>{opt.label}</div>
                    <div style={{ fontSize: '12px', color: isChosen ? '#b84a5e' : fc.text, marginTop: '2px', opacity: 0.85 }}>{opt.reasoning}</div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Floor plan */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Floor plan — click to assign manually</div>
            <FloorPlan
              tables={allTables}
              selectedIds={selectedOption !== null ? (recommendations?.options?.[selectedOption]?.table_ids || []) : selectedTables}
              highlightIds={highlightIds}
              onToggle={id => { setSelectedOption(null); setSelectedTables(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }}
            />
          </div>

          {/* Status actions */}
          {booking.status === 'confirmed' && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button onClick={() => handleStatus('seated')} style={{ fontSize: '12px', padding: '6px 14px', background: '#eaf3de', color: '#27500a', border: '0.5px solid #97c459', borderRadius: '7px', cursor: 'pointer', fontWeight: 500 }}>Seat guests</button>
              <button onClick={() => handleStatus('no_show')} style={{ fontSize: '12px', padding: '6px 14px', background: '#faeeda', color: '#633806', border: '0.5px solid #ef9f27', borderRadius: '7px', cursor: 'pointer' }}>No show</button>
              <button onClick={() => { cancel.mutate(booking.id); onClose(); }} style={{ fontSize: '12px', padding: '6px 14px', background: '#fde8ec', color: '#9e1830', border: '0.5px solid #f5b8c4', borderRadius: '7px', cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
          {booking.status === 'seated' && (
            <button onClick={() => handleStatus('completed')} style={{ fontSize: '12px', padding: '6px 14px', background: '#f1efe8', color: '#444441', border: '0.5px solid #d3d1c7', borderRadius: '7px', cursor: 'pointer' }}>Mark completed</button>
          )}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={handleAssign} className="btn-primary"
            disabled={(selectedOption === null && selectedTables.length === 0) || assignTbls.isPending}
            style={{ flex: 1, padding: '10px', opacity: (selectedOption === null && selectedTables.length === 0) ? 0.5 : 1 }}>
            {assignTbls.isPending ? 'Assigning…' : 'Confirm seating'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function BookingsPage() {
  const [date, setDate]           = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showNew, setShowNew]     = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [filterStatus, setFilterStatus]       = useState<string>('');

  const { data: bookings = [], isLoading } = useBookings(date, filterStatus || undefined);
  const { data: tables = [] }              = useTables();
  const { data: floorData }                = useFloorPlan(date, format(new Date(), 'HH:mm'));

  const todayKey    = format(new Date(), 'yyyy-MM-dd');
  const totalCovers = bookings.filter((b: any) => ['confirmed','seated'].includes(b.status)).reduce((s: number, b: any) => s + b.party_size, 0);
  const seatedNow   = bookings.filter((b: any) => b.status === 'seated').length;
  const pending     = bookings.filter((b: any) => b.status === 'confirmed').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-sub">{format(parseISO(date), 'EEEE d MMMM yyyy')}{date === todayKey ? ' — today' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowSetup(true)} style={{ fontSize: '13px' }}>⚙ Table setup</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ New booking</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
        <button onClick={() => setDate(format(subDays(parseISO(date), 1), 'yyyy-MM-dd'))}>← Prev</button>
        <button onClick={() => setDate(todayKey)}>Today</button>
        <button onClick={() => setDate(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))}>Next →</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: '13px', marginLeft: '8px' }} />
      </div>

      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card"><div className="metric-label">Total covers</div><div className="metric-val" style={{ color: '#C41E3A' }}>{totalCovers}</div><div className="metric-sub">{bookings.filter((b: any) => b.status !== 'cancelled').length} bookings</div></div>
        <div className="metric-card"><div className="metric-label">Seated now</div><div className="metric-val" style={{ color: '#27500a' }}>{seatedNow}</div><div className="metric-sub">tables in service</div></div>
        <div className="metric-card"><div className="metric-label">Still to arrive</div><div className="metric-val" style={{ color: '#C9973A' }}>{pending}</div><div className="metric-sub">confirmed bookings</div></div>
        <div className="metric-card"><div className="metric-label">Tables free now</div><div className="metric-val">{floorData?.tables?.filter((t: any) => t.is_free).length ?? tables.length}</div><div className="metric-sub">of {tables.length} total</div></div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[{ id: '', label: `All (${bookings.length})` }, { id: 'confirmed', label: `Confirmed (${bookings.filter((b: any) => b.status === 'confirmed').length})` }, { id: 'seated', label: `Seated (${bookings.filter((b: any) => b.status === 'seated').length})` }, { id: 'completed', label: `Completed (${bookings.filter((b: any) => b.status === 'completed').length})` }].map(f => (
          <button key={f.id} onClick={() => setFilterStatus(f.id)} style={filterStatus === f.id ? { background: '#C41E3A', color: 'white', border: 'none', fontWeight: 500 } : {}}>{f.label}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading bookings…</div>
      ) : bookings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '40px', marginBottom: '1rem' }}>📅</div>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No bookings for {format(parseISO(date), 'd MMMM')}</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>{tables.length === 0 ? 'Set up your tables first.' : 'Add the first booking for this day.'}</div>
          {tables.length === 0 ? <button onClick={() => setShowSetup(true)}>⚙ Set up tables</button> : <button className="btn-primary" onClick={() => setShowNew(true)}>+ New booking</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {bookings.filter((b: any) => b.status !== 'cancelled').sort((a: any, b: any) => a.booking_time > b.booking_time ? 1 : -1).map((booking: any) => {
            const st = STATUS[booking.status] || STATUS.confirmed;
            const hasTable = booking.tables?.length > 0;
            return (
              <div key={booking.id} className="card" onClick={() => setSelectedBooking(booking)}
                style={{ display: 'grid', gridTemplateColumns: '70px 1fr 120px 140px 120px', gap: '12px', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-background-secondary)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{booking.booking_time?.slice(0, 5)}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{booking.guest_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px', display: 'flex', gap: '8px' }}>
                    <span>Party of {booking.party_size}</span>
                    {booking.dietary_notes && <span style={{ color: '#C41E3A' }}>⚠ {booking.dietary_notes}</span>}
                  </div>
                </div>
                <div style={{ fontSize: '12px' }}>
                  {hasTable ? <span style={{ fontWeight: 500 }}>{booking.tables.map((t: any) => t.table_name).join(' + ')}</span> : <span style={{ color: '#ef9f27', fontSize: '11px', fontWeight: 500 }}>⚠ No table</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{booking.guest_phone || '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot }} />
                  <span style={{ fontSize: '11px', fontWeight: 500, background: st.bg, color: st.text, padding: '2px 8px', borderRadius: '20px' }}>{st.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew      && <NewBookingModal onClose={() => setShowNew(false)} initialDate={date} />}
      {showSetup    && <TableSetupModal onClose={() => setShowSetup(false)} />}
      {selectedBooking && <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />}
    </div>
  );
}
