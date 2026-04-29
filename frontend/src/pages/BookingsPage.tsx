import React, { useState, useRef } from 'react';
import { format, parseISO, addDays, subDays, isSameDay } from 'date-fns';
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

function useSeatingPlans() {
  return useQuery({ queryKey: ['seating-plans'], queryFn: () => api.get('/bookings/seating-plans').then(r => r.data.data), staleTime: 300_000 });
}

function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/bookings', b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }) });
}

function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/bookings/${id}`, b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }) });
}

function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/bookings/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }) });
}

function useAssignTables() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, table_ids }: any) => api.post(`/bookings/${id}/assign`, { table_ids }).then(r => r.data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['tables'] }); } });
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

// ── New booking modal ─────────────────────────────────────────────────────────

function BookingModal({ tables, onClose, initialDate }: { tables: any[]; onClose: () => void; initialDate: string }) {
  const create = useCreateBooking();
  const [form, setForm] = useState({
    booking_date: initialDate,
    booking_time: '19:00',
    party_size: 2,
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    dietary_notes: '',
    internal_notes: '',
    duration_mins: 90,
  });
  const [error, setError] = useState('');
  const f = (k: string, v: any) => { setForm(p => ({ ...p, [k]: v })); setError(''); };

  async function save() {
    if (!form.guest_name) { setError('Guest name is required.'); return; }
    try { await create.mutateAsync(form); onClose(); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to create booking.'); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '480px', padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>New booking</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div className="form-group"><label className="form-label">Date *</label><input type="date" value={form.booking_date} onChange={e => f('booking_date', e.target.value)} /></div>
            <div className="form-group">
              <label className="form-label">Time *</label>
              <select value={form.booking_time} onChange={e => f('booking_time', e.target.value)}>
                {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Party size *</label><input type="number" min={1} max={100} value={form.party_size} onChange={e => f('party_size', parseInt(e.target.value) || 1)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group"><label className="form-label">Guest name *</label><input value={form.guest_name} onChange={e => f('guest_name', e.target.value)} placeholder="e.g. Sarah Johnson" autoFocus /></div>
            <div className="form-group"><label className="form-label">Phone</label><input value={form.guest_phone} onChange={e => f('guest_phone', e.target.value)} placeholder="07700 900000" /></div>
          </div>
          <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.guest_email} onChange={e => f('guest_email', e.target.value)} placeholder="guest@email.com" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group"><label className="form-label">Dietary notes</label><input value={form.dietary_notes} onChange={e => f('dietary_notes', e.target.value)} placeholder="Allergies, preferences…" /></div>
            <div className="form-group">
              <label className="form-label">Duration</label>
              <select value={form.duration_mins} onChange={e => f('duration_mins', parseInt(e.target.value))}>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
                <option value={150}>2.5 hours</option>
                <option value={180}>3 hours</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Internal notes</label><input value={form.internal_notes} onChange={e => f('internal_notes', e.target.value)} placeholder="Staff notes (not shown to guest)" /></div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '1.25rem' }}>
          <button onClick={save} className="btn-primary" disabled={create.isPending} style={{ flex: 1, padding: '10px' }}>
            {create.isPending ? 'Creating…' : 'Confirm booking'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Table setup modal ─────────────────────────────────────────────────────────

function TableSetupModal({ onClose }: { onClose: () => void }) {
  const { data: tables = [] } = useTables();
  const createTable = useCreateTable();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadPlan = useUploadPlan();
  const extractPlan = useExtractPlan();
  const importPlan = useImportPlan();
  const [tab, setTab] = useState<'tables' | 'plan'>('tables');
  const [newTable, setNewTable] = useState({ name: '', capacity: 4, section: 'Main', shape: 'rectangle' });
  const [preview, setPreview] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any | null>(null);
  const [error, setError] = useState('');

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
      const mediaType = file.type || 'image/jpeg';
      setPreview(reader.result as string);
      try {
        const plan = await uploadPlan.mutateAsync({ image_base64: base64, media_type: mediaType });
        setPlanId(plan.data.id);
        const result = await extractPlan.mutateAsync({ id: plan.data.id, media_type: mediaType });
        setExtracted(result);
      } catch (e: any) { setError(e.response?.data?.error || 'Extraction failed — try a clearer image.'); }
    };
    reader.readAsDataURL(file);
  }

  async function handleImport() {
    if (!extracted || !planId) return;
    try {
      await importPlan.mutateAsync({ id: planId, tables: extracted.tables, adjacencies: extracted.adjacencies || [] });
      setExtracted(null); setPreview(null); setPlanId(null);
      setTab('tables');
    } catch (e: any) { setError(e.response?.data?.error || 'Import failed.'); }
  }

  const sections = [...new Set(tables.map((t: any) => t.section))];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 0', borderBottom: '0.5px solid #eee', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Table setup</h3>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: '0' }}>
            {[{ id: 'tables', label: 'Tables' }, { id: 'plan', label: 'Upload floor plan' }].map((t: any) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 16px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent', color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)', fontWeight: tab === t.id ? 500 : 400, borderRadius: 0, marginBottom: '-1px' }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          {tab === 'tables' && (
            <>
              {/* Add table */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px 110px 80px', gap: '8px', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Name</label>
                  <input value={newTable.name} onChange={e => setNewTable(p => ({ ...p, name: e.target.value }))} placeholder="Table 1" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Seats</label>
                  <input type="number" min={1} max={50} value={newTable.capacity} onChange={e => setNewTable(p => ({ ...p, capacity: parseInt(e.target.value) || 1 }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Section</label>
                  <select value={newTable.section} onChange={e => setNewTable(p => ({ ...p, section: e.target.value }))}>
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Shape</label>
                  <select value={newTable.shape} onChange={e => setNewTable(p => ({ ...p, shape: e.target.value }))}>
                    <option value="rectangle">Rectangle</option>
                    <option value="round">Round</option>
                  </select>
                </div>
                <button onClick={addTable} className="btn-primary" disabled={createTable.isPending} style={{ padding: '8px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  + Add
                </button>
              </div>

              {/* Table list grouped by section */}
              {sections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No tables yet — add your first table above or upload a floor plan.</div>
              ) : (
                sections.map((section: any) => {
                  const sectionTables = tables.filter((t: any) => t.section === section);
                  return (
                    <div key={String(section)} style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>{String(section)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {sectionTables.map((t: any) => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: '7px', fontSize: '13px' }}>
                            <div style={{ fontWeight: 500, flex: 1 }}>{t.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{t.shape}</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{t.capacity} seats</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'plan' && (
            <>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
                Upload a photo or diagram of your restaurant floor plan. The AI (Haiku) will extract your tables, their capacity, and their layout — then you review before importing.
              </div>

              {!extracted && (
                <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  style={{ border: '2px dashed var(--color-border-secondary)', borderRadius: '10px', padding: preview ? '12px' : '2.5rem', textAlign: 'center', cursor: 'pointer', background: 'var(--color-background-secondary)', marginBottom: '1rem' }}>
                  {preview
                    ? <img src={preview} alt="preview" style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} />
                    : <><div style={{ fontSize: '32px', marginBottom: '8px' }}>🗺</div><div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Drop your floor plan here</div><div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>PNG, JPG, PDF · Click to browse</div></>}
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                </div>
              )}

              {(uploadPlan.isPending || extractPlan.isPending) && (
                <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#0c447c', textAlign: 'center' }}>
                  🤖 Haiku is reading your floor plan…
                </div>
              )}

              {extracted && (
                <>
                  <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem', fontSize: '13px', color: '#27500a' }}>
                    ✓ Found {extracted.tables?.length || 0} tables · {extracted.adjacencies?.length || 0} adjacent pairs · {extracted.sections?.length || 0} sections
                    {extracted.summary && <div style={{ marginTop: '4px', fontStyle: 'italic', opacity: 0.8 }}>{extracted.summary}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '250px', overflowY: 'auto', marginBottom: '1rem' }}>
                    {extracted.tables?.map((t: any, i: number) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px', gap: '8px', alignItems: 'center', padding: '7px 10px', background: 'var(--color-background-secondary)', borderRadius: '7px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 500 }}>{t.name}</div>
                        <div style={{ color: 'var(--color-text-secondary)' }}>{t.section}</div>
                        <div style={{ color: 'var(--color-text-secondary)' }}>{t.capacity} seats</div>
                        <div style={{ color: 'var(--color-text-secondary)' }}>{t.shape}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          {tab === 'plan' && extracted ? (
            <>
              <button onClick={handleImport} className="btn-primary" disabled={importPlan.isPending} style={{ flex: 1, padding: '10px' }}>
                {importPlan.isPending ? 'Importing…' : `Import ${extracted.tables?.length || 0} tables →`}
              </button>
              <button onClick={() => { setExtracted(null); setPreview(null); setPlanId(null); }} style={{ padding: '10px 14px', borderRadius: '8px' }}>Retake</button>
            </>
          ) : (
            <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Booking detail / assign tables ────────────────────────────────────────────

function BookingDetailModal({ booking, tables, onClose }: { booking: any; tables: any[]; onClose: () => void }) {
  const update     = useUpdateBooking();
  const cancel     = useCancelBooking();
  const assignTbls = useAssignTables();
  const [selectedTables, setSelectedTables] = useState<string[]>(booking.tables?.map((t: any) => t.table_id) || []);
  const [error, setError] = useState('');

  const totalCapacity = selectedTables.reduce((s, id) => {
    const t = tables.find((t: any) => t.id === id);
    return s + (t?.capacity || 0);
  }, 0);

  async function handleAssign() {
    try {
      await assignTbls.mutateAsync({ id: booking.id, table_ids: selectedTables });
      onClose();
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to assign tables.'); }
  }

  async function handleStatus(status: string) {
    await update.mutateAsync({ id: booking.id, status });
    onClose();
  }

  const st = STATUS[booking.status] || STATUS.confirmed;
  const sections = [...new Set(tables.map((t: any) => t.section))];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '500px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          {/* Guest details */}
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
            {booking.guest_phone && <div><span style={{ color: 'var(--color-text-tertiary)' }}>Phone</span><div style={{ fontWeight: 500, marginTop: '1px' }}>{booking.guest_phone}</div></div>}
            {booking.guest_email && <div><span style={{ color: 'var(--color-text-tertiary)' }}>Email</span><div style={{ fontWeight: 500, marginTop: '1px' }}>{booking.guest_email}</div></div>}
            {booking.dietary_notes && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--color-text-tertiary)' }}>Dietary</span><div style={{ fontWeight: 500, marginTop: '1px', color: '#C41E3A' }}>{booking.dietary_notes}</div></div>}
            {booking.internal_notes && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--color-text-tertiary)' }}>Notes</span><div style={{ fontWeight: 500, marginTop: '1px' }}>{booking.internal_notes}</div></div>}
            <div><span style={{ color: 'var(--color-text-tertiary)' }}>Duration</span><div style={{ fontWeight: 500, marginTop: '1px' }}>{booking.duration_mins} min</div></div>
          </div>

          {/* Table assignment */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
              Assign tables
              {selectedTables.length > 0 && (
                <span style={{ fontWeight: 400, color: totalCapacity >= booking.party_size ? '#27500a' : '#9e1830', marginLeft: '8px', fontSize: '12px' }}>
                  {totalCapacity} seats selected {totalCapacity >= booking.party_size ? '✓' : `— need ${booking.party_size - totalCapacity} more`}
                </span>
              )}
            </div>
            {sections.map((section: any) => {
              const sectionTables = tables.filter((t: any) => t.section === section);
              return (
                <div key={String(section)} style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '5px' }}>{String(section)}</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {sectionTables.map((t: any) => {
                      const isSelected = selectedTables.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => setSelectedTables(prev => isSelected ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                          style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '7px', cursor: 'pointer', background: isSelected ? '#C41E3A' : 'var(--color-background-secondary)', color: isSelected ? 'white' : 'var(--color-text-primary)', border: isSelected ? 'none' : '0.5px solid var(--color-border-secondary)', fontWeight: isSelected ? 500 : 400 }}>
                          {t.name} ({t.capacity})
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status actions */}
          {booking.status === 'confirmed' && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Update status</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => handleStatus('seated')} style={{ fontSize: '12px', padding: '6px 14px', background: '#eaf3de', color: '#27500a', border: '0.5px solid #97c459', borderRadius: '7px', cursor: 'pointer', fontWeight: 500 }}>Seat guests</button>
                <button onClick={() => handleStatus('no_show')} style={{ fontSize: '12px', padding: '6px 14px', background: '#faeeda', color: '#633806', border: '0.5px solid #ef9f27', borderRadius: '7px', cursor: 'pointer' }}>No show</button>
                <button onClick={() => { cancel.mutate(booking.id); onClose(); }} style={{ fontSize: '12px', padding: '6px 14px', background: '#fde8ec', color: '#9e1830', border: '0.5px solid #f5b8c4', borderRadius: '7px', cursor: 'pointer' }}>Cancel booking</button>
              </div>
            </div>
          )}
          {booking.status === 'seated' && (
            <button onClick={() => handleStatus('completed')} style={{ fontSize: '12px', padding: '6px 14px', background: '#f1efe8', color: '#444441', border: '0.5px solid #d3d1c7', borderRadius: '7px', cursor: 'pointer' }}>Mark completed</button>
          )}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={handleAssign} className="btn-primary" disabled={selectedTables.length === 0 || assignTbls.isPending} style={{ flex: 1, padding: '10px', opacity: selectedTables.length === 0 ? 0.5 : 1 }}>
            {assignTbls.isPending ? 'Saving…' : selectedTables.length === 0 ? 'Select tables to assign' : `Assign ${selectedTables.length} table${selectedTables.length !== 1 ? 's' : ''}`}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main bookings page ────────────────────────────────────────────────────────

export function BookingsPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showNew, setShowNew] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');

  const { data: bookings = [], isLoading } = useBookings(date, filterStatus || undefined);
  const { data: tables = [] } = useTables();

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const isToday = date === todayKey;

  const totalCovers = bookings.filter((b: any) => ['confirmed', 'seated'].includes(b.status)).reduce((s: number, b: any) => s + b.party_size, 0);
  const seatedNow   = bookings.filter((b: any) => b.status === 'seated').length;
  const pending     = bookings.filter((b: any) => b.status === 'confirmed').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-sub">{format(parseISO(date), 'EEEE d MMMM yyyy')}{isToday ? ' — today' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowSetup(true)} style={{ fontSize: '13px' }}>⚙ Table setup</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ New booking</button>
        </div>
      </div>

      {/* Date navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
        <button onClick={() => setDate(format(subDays(parseISO(date), 1), 'yyyy-MM-dd'))}>← Prev</button>
        <button onClick={() => setDate(todayKey)}>Today</button>
        <button onClick={() => setDate(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))}>Next →</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: '13px', marginLeft: '8px' }} />
      </div>

      {/* Metric cards */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">Total covers</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>{totalCovers}</div>
          <div className="metric-sub">{bookings.filter((b: any) => b.status !== 'cancelled').length} booking{bookings.filter((b: any) => b.status !== 'cancelled').length !== 1 ? 's' : ''}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Seated now</div>
          <div className="metric-val" style={{ color: '#27500a' }}>{seatedNow}</div>
          <div className="metric-sub">tables in service</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Still to arrive</div>
          <div className="metric-val" style={{ color: '#C9973A' }}>{pending}</div>
          <div className="metric-sub">confirmed bookings</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Tables set up</div>
          <div className="metric-val">{tables.length}</div>
          <div className="metric-sub">{tables.reduce((s: number, t: any) => s + t.capacity, 0)} total seats</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[{ id: '', label: `All (${bookings.length})` },
          { id: 'confirmed', label: `Confirmed (${bookings.filter((b: any) => b.status === 'confirmed').length})` },
          { id: 'seated', label: `Seated (${bookings.filter((b: any) => b.status === 'seated').length})` },
          { id: 'completed', label: `Completed (${bookings.filter((b: any) => b.status === 'completed').length})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFilterStatus(f.id)}
            style={filterStatus === f.id ? { background: '#C41E3A', color: 'white', border: 'none', fontWeight: 500 } : {}}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading bookings…</div>
      ) : bookings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '40px', marginBottom: '1rem' }}>📅</div>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>No bookings for {format(parseISO(date), 'd MMMM')}</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            {tables.length === 0 ? 'Set up your tables first, then start taking bookings.' : 'Click below to add the first booking for this day.'}
          </div>
          {tables.length === 0
            ? <button onClick={() => setShowSetup(true)}>⚙ Set up tables</button>
            : <button className="btn-primary" onClick={() => setShowNew(true)}>+ New booking</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {bookings
            .filter((b: any) => b.status !== 'cancelled')
            .sort((a: any, b: any) => a.booking_time > b.booking_time ? 1 : -1)
            .map((booking: any) => {
              const st = STATUS[booking.status] || STATUS.confirmed;
              const hasTable = booking.tables?.length > 0;
              return (
                <div key={booking.id} className="card" onClick={() => setSelectedBooking(booking)}
                  style={{ display: 'grid', gridTemplateColumns: '70px 1fr 120px 140px 120px', gap: '12px', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-background-secondary)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                  {/* Time */}
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {booking.booking_time?.slice(0, 5)}
                  </div>
                  {/* Guest */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{booking.guest_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px', display: 'flex', gap: '8px' }}>
                      <span>Party of {booking.party_size}</span>
                      {booking.dietary_notes && <span style={{ color: '#C41E3A' }}>⚠ {booking.dietary_notes}</span>}
                    </div>
                  </div>
                  {/* Tables */}
                  <div style={{ fontSize: '12px' }}>
                    {hasTable
                      ? <span style={{ fontWeight: 500 }}>{booking.tables.map((t: any) => t.table_name).join(' + ')}</span>
                      : <span style={{ color: '#ef9f27', fontSize: '11px', fontWeight: 500 }}>⚠ No table</span>}
                  </div>
                  {/* Phone */}
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{booking.guest_phone || '—'}</div>
                  {/* Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot }} />
                    <span style={{ fontSize: '11px', fontWeight: 500, background: st.bg, color: st.text, padding: '2px 8px', borderRadius: '20px' }}>{st.label}</span>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {showNew     && <BookingModal tables={tables} onClose={() => setShowNew(false)} initialDate={date} />}
      {showSetup   && <TableSetupModal onClose={() => setShowSetup(false)} />}
      {selectedBooking && <BookingDetailModal booking={selectedBooking} tables={tables} onClose={() => setSelectedBooking(null)} />}
    </div>
  );
}
