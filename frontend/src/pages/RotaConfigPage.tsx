import React, { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, startOfMonth, addMonths } from 'date-fns';
import { useRotaConfig, useSaveRotaConfig, useClosedDays, useAddClosedDay, useRemoveClosedDay, useGenerateRota } from '../hooks/useRotaConfig';
import { useEmployees } from '../hooks/useRota';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6, 0].map(d => ({
  day_of_week: d,
  open_time: d === 0 ? '10:00' : '08:00',
  close_time: d === 5 || d === 6 ? '23:30' : '23:00',
  is_open: true,
}));

const DEFAULT_SECTIONS = [
  { name: 'Kitchen', role_id: null, min_staff: 2, max_staff: 4, shift_start_1: '08:00', shift_end_1: '16:00', shift_start_2: '14:00', shift_end_2: '23:00' },
  { name: 'Front of House', role_id: null, min_staff: 3, max_staff: 6, shift_start_1: '10:00', shift_end_1: '18:00', shift_start_2: '16:00', shift_end_2: '23:00' },
  { name: 'Bar', role_id: null, min_staff: 1, max_staff: 3, shift_start_1: '12:00', shift_end_1: null, shift_start_2: null, shift_end_2: null },
];

type Tab = 'working-hours' | 'sections' | 'closed-days' | 'generate';

export function RotaConfigPage() {
  const { data: config, isLoading } = useRotaConfig();
  const { data: allEmployees = [] } = useEmployees({ active: true });
  const saveConfig = useSaveRotaConfig();
  const generateRota = useGenerateRota();
  const addClosedDay = useAddClosedDay();
  const removeClosedDay = useRemoveClosedDay();

  const [tab, setTab] = useState<Tab>('working-hours');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Working days
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [dayConfigs, setDayConfigs] = useState(DEFAULT_DAYS);

  // Sections
  const [sections, setSections] = useState(DEFAULT_SECTIONS as any[]);

  // Closed days
  const { data: closedDays = [] } = useClosedDays();
  const [newClosedDate, setNewClosedDate] = useState('');
  const [newClosedReason, setNewClosedReason] = useState('');

  // Generate
  const [genMode, setGenMode] = useState<'week' | 'month'>('week');
  const [genStart, setGenStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [genResult, setGenResult] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  // Load config into state
  useEffect(() => {
    if (!config) return;
    if (config.working_days) setWorkingDays(config.working_days);
    if (config.days?.length > 0) setDayConfigs(config.days);
    if (config.sections?.length > 0) setSections(config.sections);
  }, [config]);

  // ── Fetch roles for section dropdowns
  const [dbRoles, setDbRoles] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/roles', { headers: { Authorization: `Bearer ${localStorage.getItem('rms_token')}` } })
      .then(r => r.json()).then(d => setDbRoles(d.data || [])).catch(() => {});
  }, []);

  function toggleWorkingDay(d: number) {
    setWorkingDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  function updateDayConfig(dow: number, field: string, value: any) {
    setDayConfigs(prev => prev.map(dc =>
      dc.day_of_week === dow ? { ...dc, [field]: value } : dc
    ));
  }

  function addSection() {
    setSections(prev => [...prev, {
      name: `Section ${prev.length + 1}`, role_id: null,
      min_staff: 1, max_staff: 3,
      shift_start_1: '09:00', shift_end_1: null,
      shift_start_2: null, shift_end_2: null,
    }]);
  }

  function updateSection(i: number, field: string, value: any) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  function removeSection(i: number) {
    setSections(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setError('');
    try {
      await saveConfig.mutateAsync({
        working_days: workingDays,
        days: dayConfigs,
        sections,
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
      <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', borderBottom: '0.5px solid var(--color-border-tertiary)', paddingBottom: '0' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent',
              color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)',
              fontWeight: tab === t.id ? 500 : 400,
              borderRadius: 0, marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Working hours ──────────────────────────────────────────────── */}
      {tab === 'working-hours' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Working days</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Select the days your restaurant is normally open. You can add bank holidays and ad-hoc closures in the Closed Days tab.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[1,2,3,4,5,6,0].map(d => {
                const active = workingDays.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleWorkingDay(d)}
                    style={{
                      width: '52px', height: '52px', borderRadius: '10px', fontSize: '12px', fontWeight: 500,
                      border: active ? '2px solid #C41E3A' : '0.5px solid var(--color-border-secondary)',
                      background: active ? '#fde8ec' : 'var(--color-background-secondary)',
                      color: active ? '#C41E3A' : 'var(--color-text-tertiary)',
                      cursor: 'pointer',
                    }}
                  >
                    {DAY_NAMES[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '0.25rem' }}>Hours per day</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Set open and close times for each day. These inform the auto-generator which hours staff need covering.
            </p>
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
                      <input
                        type="time" value={dc.open_time}
                        onChange={e => updateDayConfig(d, 'open_time', e.target.value)}
                        disabled={!isWorking}
                        style={{ fontSize: '13px', padding: '5px 8px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: '3px' }}>Closes</label>
                      <input
                        type="time" value={dc.close_time}
                        onChange={e => updateDayConfig(d, 'close_time', e.target.value)}
                        disabled={!isWorking}
                        style={{ fontSize: '13px', padding: '5px 8px' }}
                      />
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

      {/* ── TAB: Sections & shifts ──────────────────────────────────────────── */}
      {tab === 'sections' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Define each section of your restaurant and the shift patterns for that section.
            </p>
            <button className="btn-gold" onClick={addSection}>+ Add section</button>
          </div>

          {sections.map((section, i) => (
            <div key={i} className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid #C41E3A', borderRadius: '0 12px 12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <input
                  value={section.name}
                  onChange={e => updateSection(i, 'name', e.target.value)}
                  style={{ fontSize: '15px', fontWeight: 500, border: 'none', background: 'transparent', padding: 0, outline: 'none', color: 'var(--color-text-primary)', width: '200px' }}
                  placeholder="Section name"
                />
                <button onClick={() => removeSection(i)} style={{ color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px' }}>Remove</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Role (optional)</label>
                  <select value={section.role_id || ''} onChange={e => updateSection(i, 'role_id', e.target.value || null)}>
                    <option value="">Any role</option>
                    {dbRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Min staff per shift</label>
                  <input type="number" min={1} max={20} value={section.min_staff}
                    onChange={e => updateSection(i, 'min_staff', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Max staff per shift</label>
                  <input type="number" min={1} max={20} value={section.max_staff}
                    onChange={e => updateSection(i, 'max_staff', Number(e.target.value))} />
                </div>
              </div>

              <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '10px' }}>Shift 1 (primary)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Start time *</label>
                    <input type="time" value={section.shift_start_1}
                      onChange={e => updateSection(i, 'shift_start_1', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">End time (optional)</label>
                    <input type="time" value={section.shift_end_1 || ''}
                      onChange={e => updateSection(i, 'shift_end_1', e.target.value || null)}
                      placeholder="Leave blank if open-ended" />
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  Shift 2 (staggered start — optional)
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '10px' }}>
                  Use this if you have staff starting at different times in the same section
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Start time</label>
                    <input type="time" value={section.shift_start_2 || ''}
                      onChange={e => updateSection(i, 'shift_start_2', e.target.value || null)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">End time (optional)</label>
                    <input type="time" value={section.shift_end_2 || ''}
                      onChange={e => updateSection(i, 'shift_end_2', e.target.value || null)} />
                  </div>
                </div>
              </div>
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

      {/* ── TAB: Closed days ────────────────────────────────────────────────── */}
      {tab === 'closed-days' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Add a closed day</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Add bank holidays or any ad-hoc closure. These days will be greyed out on the rota and skipped during auto-generation.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date</label>
                <input type="date" value={newClosedDate} onChange={e => setNewClosedDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Reason (optional)</label>
                <input value={newClosedReason} onChange={e => setNewClosedReason(e.target.value)} placeholder="e.g. Bank Holiday, Maintenance" />
              </div>
              <button className="btn-primary" onClick={handleAddClosedDay} disabled={!newClosedDate || addClosedDay.isPending}>
                Add closed day
              </button>
            </div>
          </div>

          {/* UK Bank Holidays quick-add */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>UK bank holidays 2025–2026</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>Click to quickly add common bank holidays.</p>
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
                const already = closedDays.some((c: any) => {
                  const d = c.closed_date?.split?.('T')?.[0] || c.closed_date;
                  return d === date;
                });
                return (
                  <button
                    key={date}
                    disabled={already}
                    onClick={() => addClosedDay.mutate({ closed_date: date, reason: `Bank Holiday — ${label}` })}
                    style={{
                      fontSize: '12px', padding: '5px 10px',
                      background: already ? '#eaf3de' : undefined,
                      color: already ? '#27500a' : undefined,
                      border: already ? '0.5px solid #97c459' : undefined,
                    }}
                  >
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
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>
                          {format(new Date(dateStr + 'T12:00:00'), 'EEEE d MMMM yyyy')}
                        </div>
                        {cd.reason && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{cd.reason}</div>}
                      </div>
                      <button
                        onClick={() => removeClosedDay.mutate(dateStr)}
                        style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer' }}
                      >
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

      {/* ── TAB: Generate rota ──────────────────────────────────────────────── */}
      {tab === 'generate' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Auto-generate rota</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
              The system will create draft schedules using your section rules, staff availability, and approved time off.
              Closed days will be skipped automatically. You can review and adjust the generated rota before publishing.
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
                    <button
                      key={m}
                      onClick={() => setGenMode(m)}
                      style={{
                        flex: 1, padding: '9px', fontSize: '13px', fontWeight: genMode === m ? 500 : 400,
                        background: genMode === m ? '#fde8ec' : undefined,
                        border: genMode === m ? '2px solid #C41E3A' : undefined,
                        color: genMode === m ? '#C41E3A' : undefined,
                        borderRadius: '8px',
                      }}
                    >
                      {m === 'week' ? 'Next week only' : 'Whole month (4 weeks)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary of what will be generated */}
            <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.5rem', fontSize: '13px' }}>
              <div style={{ fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-primary)' }}>What will be generated:</div>
              <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                <div>• {genMode === 'week' ? '1 week' : '4 weeks'} of draft schedules starting {format(new Date(genStart + 'T12:00:00'), 'EEEE d MMMM yyyy')}</div>
                <div>• {sections.length} section{sections.length !== 1 ? 's' : ''}: {sections.map(s => s.name).join(', ')}</div>
                <div>• Staff assigned based on role, availability, and time off</div>
                <div>• Closed days and non-working days will be skipped</div>
                <div>• Existing schedules for covered weeks will be reused (not replaced)</div>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={generating || !config}
              style={{ fontSize: '14px', padding: '10px 24px' }}
            >
              {generating ? 'Generating…' : `Generate ${genMode === 'week' ? 'next week' : 'monthly'} rota →`}
            </button>

            {!config && (
              <p style={{ fontSize: '13px', color: '#9e1830', marginTop: '8px' }}>
                ⚠ Please save your configuration first before generating.
              </p>
            )}
          </div>

          {genResult && (
            <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: '#27500a', marginBottom: '0.75rem' }}>
                ✓ Rota generated successfully
              </div>
              <div style={{ fontSize: '13px', color: '#3d6b1a', marginBottom: '1rem' }}>
                {genResult.data.total_assignments} shifts assigned across {genResult.data.results.length} week{genResult.data.results.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '1rem' }}>
                {genResult.data.results.map((r: any) => (
                  <div key={r.week} style={{ fontSize: '12px', color: '#27500a' }}>
                    Week of {format(new Date(r.week + 'T12:00:00'), 'dd MMM yyyy')} — {r.assignments} shift{r.assignments !== 1 ? 's' : ''} assigned
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={() => window.location.href = '/rota'}>
                Review rota →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
