import React, { useState, useEffect } from 'react';
import { format, startOfWeek } from 'date-fns';
import { useRotaConfig, useSaveRotaConfig, useClosedDays, useAddClosedDay, useRemoveClosedDay, useGenerateRota } from '../hooks/useRotaConfig';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6, 0].map(d => ({
  day_of_week: d,
  open_time: d === 0 ? '10:00' : '08:00',
  close_time: d === 5 || d === 6 ? '23:30' : '23:00',
  is_open: true,
}));

// Each section now has a `shifts` array instead of fixed shift_1/shift_2 fields
interface ShiftSlot {
  start: string;
  end: string | null;
  show_end: boolean;
}

interface Section {
  name: string;
  role_id: string | null;
  min_staff: number;
  max_staff: number;
  shifts: ShiftSlot[];
}

const DEFAULT_SECTIONS: Section[] = [
  {
    name: 'Kitchen', role_id: null, min_staff: 2, max_staff: 4,
    shifts: [
      { start: '08:00', end: '16:00', show_end: true },
      { start: '14:00', end: '23:00', show_end: true },
    ],
  },
  {
    name: 'Front of House', role_id: null, min_staff: 3, max_staff: 6,
    shifts: [
      { start: '10:00', end: '18:00', show_end: true },
      { start: '16:00', end: '23:00', show_end: true },
    ],
  },
  {
    name: 'Bar', role_id: null, min_staff: 1, max_staff: 3,
    shifts: [
      { start: '12:00', end: null, show_end: false },
    ],
  },
];

// Convert flat DB format → section with shifts array
function fromDb(s: any): Section {
  const shifts: ShiftSlot[] = [
    { start: s.shift_start_1 || '09:00', end: s.shift_end_1 || null, show_end: s.shift_end_1 != null },
  ];
  if (s.shift_start_2) {
    shifts.push({ start: s.shift_start_2, end: s.shift_end_2 || null, show_end: s.shift_end_2 != null });
  }
  // Handle extra shifts stored in shift_start_3..N if present
  let n = 3;
  while (s[`shift_start_${n}`]) {
    shifts.push({ start: s[`shift_start_${n}`], end: s[`shift_end_${n}`] || null, show_end: s[`shift_end_${n}`] != null });
    n++;
  }
  return { name: s.name, role_id: s.role_id, min_staff: s.min_staff, max_staff: s.max_staff, shifts };
}

// Convert section with shifts array → flat DB format
function toDb(s: Section, sort_order: number) {
  const flat: any = { name: s.name, role_id: s.role_id, min_staff: s.min_staff, max_staff: s.max_staff, sort_order };
  s.shifts.forEach((sh, i) => {
    flat[`shift_start_${i + 1}`] = sh.start;
    flat[`shift_end_${i + 1}`] = sh.show_end ? sh.end : null;
  });
  // Null out any slots beyond what we have (up to 5)
  for (let i = s.shifts.length + 1; i <= 5; i++) {
    flat[`shift_start_${i}`] = null;
    flat[`shift_end_${i}`] = null;
  }
  return flat;
}

type Tab = 'working-hours' | 'sections' | 'closed-days' | 'generate';

export function RotaConfigPage() {
  const { data: config } = useRotaConfig();
  const saveConfig = useSaveRotaConfig();
  const generateRota = useGenerateRota();
  const addClosedDay = useAddClosedDay();
  const removeClosedDay = useRemoveClosedDay();

  const [tab, setTab] = useState<Tab>('working-hours');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [dayConfigs, setDayConfigs] = useState(DEFAULT_DAYS);
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const { data: closedDays = [] } = useClosedDays();
  const [newClosedDate, setNewClosedDate] = useState('');
  const [newClosedReason, setNewClosedReason] = useState('');
  const [genMode, setGenMode] = useState<'week' | 'month'>('week');
  const [genStart, setGenStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [genResult, setGenResult] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [dbRoles, setDbRoles] = useState<any[]>([]);

  useEffect(() => {
    if (!config) return;
    if (config.working_days) setWorkingDays(config.working_days);
    if (config.days?.length > 0) setDayConfigs(config.days);
    if (config.sections?.length > 0) setSections(config.sections.map(fromDb));
  }, [config]);

  useEffect(() => {
    fetch('/api/roles', { headers: { Authorization: `Bearer ${localStorage.getItem('rms_token')}` } })
      .then(r => r.json()).then(d => setDbRoles(d.data || [])).catch(() => {});
  }, []);

  // ── Section helpers ──────────────────────────────────────────────────────────

  function updateSection(i: number, field: keyof Omit<Section, 'shifts'>, value: any) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  function addShiftSlot(sectionIdx: number) {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIdx) return s;
      return { ...s, shifts: [...s.shifts, { start: '12:00', end: null, show_end: false }] };
    }));
  }

  function removeShiftSlot(sectionIdx: number, shiftIdx: number) {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIdx) return s;
      if (s.shifts.length <= 1) return s; // always keep at least one
      return { ...s, shifts: s.shifts.filter((_, si) => si !== shiftIdx) };
    }));
  }

  function updateShiftSlot(sectionIdx: number, shiftIdx: number, field: keyof ShiftSlot, value: any) {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIdx) return s;
      return {
        ...s,
        shifts: s.shifts.map((sh, si) => si === shiftIdx ? { ...sh, [field]: value } : sh),
      };
    }));
  }

  function toggleShowEnd(sectionIdx: number, shiftIdx: number) {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIdx) return s;
      return {
        ...s,
        shifts: s.shifts.map((sh, si) => {
          if (si !== shiftIdx) return sh;
          const nowShowing = !sh.show_end;
          return { ...sh, show_end: nowShowing, end: nowShowing ? (sh.end || '') : null };
        }),
      };
    }));
  }

  function addSection() {
    setSections(prev => [...prev, {
      name: `Section ${prev.length + 1}`, role_id: null, min_staff: 1, max_staff: 3,
      shifts: [{ start: '09:00', end: null, show_end: false }],
    }]);
  }

  function removeSection(i: number) {
    setSections(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── Save / Generate ──────────────────────────────────────────────────────────

  async function handleSave() {
    setError('');
    try {
      await saveConfig.mutateAsync({
        working_days: workingDays,
        days: dayConfigs,
        sections: sections.map((s, i) => toDb(s, i)),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to save configuration.');
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    setError('');
    try {
      const result = await generateRota.mutateAsync({ mode: genMode, start_date: genStart });
      setGenResult(result);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to generate rota.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddClosedDay() {
    if (!newClosedDate) return;
    try {
      await addClosedDay.mutateAsync({ closed_date: newClosedDate, reason: newClosedReason || undefined });
      setNewClosedDate('');
      setNewClosedReason('');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to add closed day.');
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'working-hours', label: 'Working hours' },
    { id: 'sections', label: 'Sections & shifts' },
    { id: 'closed-days', label: 'Closed days' },
    { id: 'generate', label: 'Generate rota' },
  ];

  const shiftLabel = (n: number) =>
    n === 0 ? 'Primary shift' : n === 1 ? 'Staggered start' : `Staggered start ${n}`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rota configuration</h1>
          <p className="page-sub">Set up your working pattern, sections, and shift rules</p>
        </div>
        {tab !== 'generate' && (
          <button className="btn-primary" onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending ? 'Saving…' : 'Save configuration'}
          </button>
        )}
      </div>

      {saved && (
        <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#27500a' }}>
          ✓ Configuration saved successfully.
        </div>
      )}
      {error && (
        <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>
          {error}
        </div>
      )}

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent',
            color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)',
            fontWeight: tab === t.id ? 500 : 400, borderRadius: 0, marginBottom: '-1px',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Working hours ────────────────────────────────────────────────────── */}
      {tab === 'working-hours' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Working days</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Select the days your restaurant is normally open.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[1,2,3,4,5,6,0].map(d => {
                const active = workingDays.includes(d);
                return (
                  <button key={d}
                    onClick={() => setWorkingDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                    style={{
                      width: '52px', height: '52px', borderRadius: '10px', fontSize: '12px', fontWeight: 500,
                      border: active ? '2px solid #C41E3A' : '0.5px solid var(--color-border-secondary)',
                      background: active ? '#fde8ec' : 'var(--color-background-secondary)',
                      color: active ? '#C41E3A' : 'var(--color-text-tertiary)', cursor: 'pointer',
                    }}>
                    {DAY_NAMES[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '0.25rem' }}>Hours per day</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>Set open and close times for each working day.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[1,2,3,4,5,6,0].map(d => {
                const dc = dayConfigs.find(x => x.day_of_week === d) || { day_of_week: d, open_time: '08:00', close_time: '23:00', is_open: true };
                const isWorking = workingDays.includes(d);
                return (
                  <div key={d} style={{
                    display: 'grid', gridTemplateColumns: '90px 1fr 1fr 80px', gap: '10px', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '8px',
                    background: isWorking ? 'var(--color-background-secondary)' : '#f7f6f3',
                    opacity: isWorking ? 1 : 0.4,
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{DAY_FULL[d]}</div>
                    <div>
                      <label style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '3px' }}>Opens</label>
                      <input type="time" value={dc.open_time} disabled={!isWorking}
                        onChange={e => setDayConfigs(prev => prev.map(x => x.day_of_week === d ? { ...x, open_time: e.target.value } : x))}
                        style={{ fontSize: '13px', padding: '5px 8px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '3px' }}>Closes</label>
                      <input type="time" value={dc.close_time} disabled={!isWorking}
                        onChange={e => setDayConfigs(prev => prev.map(x => x.day_of_week === d ? { ...x, close_time: e.target.value } : x))}
                        style={{ fontSize: '13px', padding: '5px 8px' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: isWorking ? '#27500a' : 'var(--color-text-tertiary)', textAlign: 'center' }}>
                      {isWorking ? '✓ Open' : 'Closed'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Sections & shifts ────────────────────────────────────────────────── */}
      {tab === 'sections' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Define each section and its shift patterns. Add as many staggered starts as you need.
            </p>
            <button className="btn-gold" onClick={addSection}>+ Add section</button>
          </div>

          {sections.map((section, si) => (
            <div key={si} className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid #C41E3A', borderRadius: '0 12px 12px 0' }}>
              {/* Section header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <input
                  value={section.name}
                  onChange={e => updateSection(si, 'name', e.target.value)}
                  style={{ fontSize: '15px', fontWeight: 500, border: 'none', background: 'transparent', padding: 0, outline: 'none', color: 'var(--color-text-primary)', width: '220px' }}
                  placeholder="Section name"
                />
                <button onClick={() => removeSection(si)} style={{ color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px' }}>
                  Remove section
                </button>
              </div>

              {/* Role + staff counts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '1.25rem' }}>
                <div className="form-group">
                  <label className="form-label">Role (optional)</label>
                  <select value={section.role_id || ''} onChange={e => updateSection(si, 'role_id', e.target.value || null)}>
                    <option value="">Any role</option>
                    {dbRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Min staff per shift</label>
                  <input type="number" min={1} max={20} value={section.min_staff}
                    onChange={e => updateSection(si, 'min_staff', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Max staff per shift</label>
                  <input type="number" min={1} max={20} value={section.max_staff}
                    onChange={e => updateSection(si, 'max_staff', Number(e.target.value))} />
                </div>
              </div>

              {/* Shift slots */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {section.shifts.map((sh, shi) => (
                  <div key={shi} style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                        {shiftLabel(shi)}
                      </div>
                      {section.shifts.length > 1 && (
                        <button
                          onClick={() => removeShiftSlot(si, shi)}
                          style={{ fontSize: '11px', color: '#9e1830', border: '0.5px solid #f5b8c4', background: '#fde8ec', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}
                        >
                          Remove ×
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: sh.show_end ? '1fr 1fr' : '1fr auto', gap: '12px', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Start time {shi === 0 ? '*' : ''}</label>
                        <input type="time" value={sh.start}
                          onChange={e => updateShiftSlot(si, shi, 'start', e.target.value)} />
                      </div>

                      {sh.show_end ? (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>End time</span>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 400 }}>
                              <input type="checkbox" checked onChange={() => toggleShowEnd(si, shi)} style={{ width: 'auto', cursor: 'pointer' }} />
                              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Show</span>
                            </label>
                          </label>
                          <input type="time" value={sh.end || ''}
                            onChange={e => updateShiftSlot(si, shi, 'end', e.target.value || null)} />
                        </div>
                      ) : (
                        <div style={{ paddingBottom: '2px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--color-text-tertiary)', userSelect: 'none' }}>
                            <input type="checkbox" checked={false} onChange={() => toggleShowEnd(si, shi)} style={{ width: 'auto', cursor: 'pointer' }} />
                            Add end time
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add staggered start */}
              <button
                onClick={() => addShiftSlot(si)}
                style={{
                  marginTop: '10px', width: '100%', padding: '8px', fontSize: '12px',
                  cursor: 'pointer', background: 'transparent',
                  border: '0.5px dashed var(--color-border-secondary)',
                  borderRadius: '8px', color: 'var(--color-text-tertiary)',
                }}
              >
                + Add staggered start
              </button>
            </div>
          ))}

          {sections.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>No sections configured yet.</p>
              <button className="btn-primary" onClick={addSection}>+ Add your first section</button>
            </div>
          )}
        </div>
      )}

      {/* ── Closed days ──────────────────────────────────────────────────────── */}
      {tab === 'closed-days' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Add a closed day</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              These days will be greyed out on the rota and skipped during auto-generation.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date</label>
                <input type="date" value={newClosedDate} onChange={e => setNewClosedDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Reason (optional)</label>
                <input value={newClosedReason} onChange={e => setNewClosedReason(e.target.value)} placeholder="e.g. Bank Holiday, Private event" />
              </div>
              <button className="btn-primary" onClick={handleAddClosedDay} disabled={!newClosedDate || addClosedDay.isPending}>Add</button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>UK bank holidays 2025–2026</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>Click to quickly add.</p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { date: '2025-12-25', label: 'Christmas Day' },
                { date: '2025-12-26', label: 'Boxing Day' },
                { date: '2026-01-01', label: "New Year's Day" },
                { date: '2026-04-03', label: 'Good Friday' },
                { date: '2026-04-06', label: 'Easter Monday' },
                { date: '2026-05-04', label: 'Early May BH' },
                { date: '2026-05-25', label: 'Spring BH' },
                { date: '2026-08-31', label: 'Summer BH' },
                { date: '2026-12-25', label: 'Christmas Day' },
                { date: '2026-12-26', label: 'Boxing Day' },
              ].map(({ date, label }) => {
                const already = closedDays.some((c: any) => (c.closed_date?.split?.('T')?.[0] || c.closed_date) === date);
                return (
                  <button key={date} disabled={already}
                    onClick={() => addClosedDay.mutate({ closed_date: date, reason: `Bank Holiday — ${label}` })}
                    style={{ fontSize: '12px', padding: '5px 10px', background: already ? '#eaf3de' : undefined, color: already ? '#27500a' : undefined, border: already ? '0.5px solid #97c459' : undefined }}>
                    {already ? '✓ ' : '+ '}{label} ({date})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Closed days ({closedDays.length})</h3>
            {closedDays.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>No closed days added yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[...closedDays].sort((a: any, b: any) => a.closed_date > b.closed_date ? 1 : -1).map((cd: any) => {
                  const dateStr = cd.closed_date?.split?.('T')?.[0] || cd.closed_date;
                  return (
                    <div key={cd.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', background: 'var(--color-background-secondary)', borderRadius: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C41E3A', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{format(new Date(dateStr + 'T12:00:00'), 'EEEE d MMMM yyyy')}</div>
                        {cd.reason && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{cd.reason}</div>}
                      </div>
                      <button onClick={() => removeClosedDay.mutate(dateStr)}
                        style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer' }}>
                        Remove ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Generate ─────────────────────────────────────────────────────────── */}
      {tab === 'generate' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Auto-generate rota</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
              Creates draft schedules using your section rules, staff availability, and approved time off. Closed days are skipped automatically.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Start from</label>
                <input type="date" value={genStart} onChange={e => setGenStart(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Generate</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['week', 'month'] as const).map(m => (
                    <button key={m} onClick={() => setGenMode(m)} style={{
                      flex: 1, padding: '9px', fontSize: '13px', borderRadius: '8px',
                      fontWeight: genMode === m ? 500 : 400,
                      background: genMode === m ? '#fde8ec' : undefined,
                      border: genMode === m ? '2px solid #C41E3A' : undefined,
                      color: genMode === m ? '#C41E3A' : undefined,
                    }}>
                      {m === 'week' ? 'Next week' : 'Whole month'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.5rem', fontSize: '13px' }}>
              <div style={{ fontWeight: 500, marginBottom: '6px' }}>What will be generated:</div>
              <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                <div>• {genMode === 'week' ? '1 week' : '4 weeks'} of draft schedules from {format(new Date(genStart + 'T12:00:00'), 'EEEE d MMMM yyyy')}</div>
                <div>• {sections.length} section{sections.length !== 1 ? 's' : ''}: {sections.map(s => s.name).join(', ')}</div>
                <div>• Staff assigned based on role, availability, and time off</div>
                <div>• Closed days and non-working days skipped automatically</div>
              </div>
            </div>
            <button className="btn-primary" onClick={handleGenerate} disabled={generating || !config} style={{ fontSize: '14px', padding: '10px 24px' }}>
              {generating ? 'Generating…' : `Generate ${genMode === 'week' ? 'week' : 'monthly'} rota →`}
            </button>
            {!config && <p style={{ fontSize: '13px', color: '#9e1830', marginTop: '8px' }}>⚠ Save your configuration first.</p>}
          </div>

          {genResult && (
            <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: '#27500a', marginBottom: '0.75rem' }}>✓ Rota generated</div>
              <div style={{ fontSize: '13px', color: '#3d6b1a', marginBottom: '1rem' }}>
                {genResult.data.total_assignments} shifts across {genResult.data.results.length} week{genResult.data.results.length !== 1 ? 's' : ''}
              </div>
              {genResult.data.results.map((r: any) => (
                <div key={r.week} style={{ fontSize: '12px', color: '#27500a', marginBottom: '2px' }}>
                  Week of {format(new Date(r.week + 'T12:00:00'), 'dd MMM yyyy')} — {r.assignments} shift{r.assignments !== 1 ? 's' : ''}
                </div>
              ))}

              {/* Skipped staff summary */}
              {genResult.data.skipped_staff?.length > 0 && (
                <div style={{ marginTop: '1rem', background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#633806', marginBottom: '6px' }}>
                    ℹ {genResult.data.skipped_staff.length} shift{genResult.data.skipped_staff.length !== 1 ? 's' : ''} skipped due to approved time off
                  </div>
                  <div style={{ fontSize: '11px', color: '#854f0b', lineHeight: 1.7 }}>
                    {Array.from(new Set(genResult.data.skipped_staff.map((s: any) => s.name))).map((name: any) => {
                      const dates = genResult.data.skipped_staff
                        .filter((s: any) => s.name === name)
                        .map((s: any) => {
                          try { return format(new Date(s.date + 'T12:00:00'), 'EEE d MMM'); } catch { return s.date; }
                        });
                      return (
                        <div key={name}><strong>{name}</strong> — {dates.join(', ')}</div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '11px', color: '#854f0b', marginTop: '6px', fontStyle: 'italic' }}>
                    Pending time off requests were ignored — staff were still assigned on those days.
                  </div>
                </div>
              )}

              <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => window.location.href = '/rota'}>
                Review rota →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
