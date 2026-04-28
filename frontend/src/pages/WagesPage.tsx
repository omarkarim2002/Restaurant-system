import React, { useState } from 'react';
import { format, startOfWeek, addWeeks, subWeeks, parseISO } from 'date-fns';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeWageSummary {
  employee_id: string;
  first_name: string;
  last_name: string;
  hourly_rate: number;
  predicted_hours: number;
  predicted_wage: number;
  confirmed_hours: number;
  confirmed_wage: number;
  has_unconfirmed_shifts: boolean;
}

interface WeeklyWages {
  total_predicted_wage: number;
  total_predicted_hours: number;
  has_unconfirmed: boolean;
  confidence_breakdown: { confirmed: number; scheduled: number; learned: number; default: number };
  employee_breakdown: EmployeeWageSummary[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const NLW_FALLBACK = { rate: 12.21, year: '2025', source: 'fallback' };
const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full time', part_time: 'Part time', casual: 'Casual',
};

function useNLW() {
  return useQuery({
    queryKey: ['nlw'],
    queryFn: () => api.get('/wages/nlw').then(r => r.data.data).catch(() => NLW_FALLBACK),
    staleTime: 1000 * 60 * 60 * 24 * 7,
    gcTime:    1000 * 60 * 60 * 24 * 30,
  });
}

function useWageEmployees() {
  return useQuery({
    queryKey: ['wage-employees'],
    queryFn: () => api.get('/wages/employees').then(r => r.data.data),
  });
}

function useWeeklyWages(weekStart: string) {
  return useQuery({
    queryKey: ['wages', 'week', weekStart],
    queryFn: () => api.get(`/wages/week?week_start=${weekStart}`).then(r => r.data.data),
    enabled: !!weekStart,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

function useUpdateWage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.patch(`/wages/employees/${id}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wage-employees'] }),
  });
}

// ─── Weekly Summary Tab ───────────────────────────────────────────────────────

function WeeklySummaryTab() {
  const [selectedWeek, setSelectedWeek] = useState(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  );

  const { data: wages, isLoading } = useWeeklyWages(selectedWeek);
  const weekLabel = format(parseISO(selectedWeek), 'dd MMM yyyy');
  const weekEndLabel = format(addWeeks(parseISO(selectedWeek), 1), 'dd MMM yyyy');

  const totalConfirmed = wages?.employee_breakdown?.reduce((s: number, e: EmployeeWageSummary) => s + e.confirmed_wage, 0) ?? 0;
  const totalPredicted = wages?.total_predicted_wage ?? 0;
  const totalConfirmedHours = wages?.employee_breakdown?.reduce((s: number, e: EmployeeWageSummary) => s + e.confirmed_hours, 0) ?? 0;
  const totalPredictedHours = wages?.total_predicted_hours ?? 0;
  const unconfirmedCount = wages?.employee_breakdown?.filter((e: EmployeeWageSummary) => e.has_unconfirmed_shifts).length ?? 0;
  const breakdown = wages?.confidence_breakdown;

  return (
    <div>
      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
        <button onClick={() => setSelectedWeek(format(subWeeks(parseISO(selectedWeek), 1), 'yyyy-MM-dd'))}>← Prev</button>
        <button onClick={() => setSelectedWeek(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'))}>
          This week
        </button>
        <button onClick={() => setSelectedWeek(format(addWeeks(parseISO(selectedWeek), 1), 'yyyy-MM-dd'))}>Next →</button>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', marginLeft: '8px' }}>
          {weekLabel} – {weekEndLabel}
        </div>
      </div>

      {/* Summary metric cards */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">Confirmed wages (so far)</div>
          <div className="metric-val" style={{ color: '#27500a' }}>
            {totalConfirmed > 0 ? `£${totalConfirmed.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '£0.00'}
          </div>
          <div className="metric-sub">
            {totalConfirmedHours > 0
              ? `${totalConfirmedHours}h with confirmed finish times`
              : 'no finish times confirmed yet'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Predicted wages (full week)</div>
          <div className="metric-val" style={{ color: '#C9973A' }}>
            {isLoading ? '…' : `£${totalPredicted.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className="metric-sub" style={{ color: wages?.has_unconfirmed ? '#8a6220' : undefined }}>
            {wages?.has_unconfirmed
              ? <span>⚠ some shifts unconfirmed — estimate only</span>
              : `${totalPredictedHours}h total scheduled`}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Variance</div>
          <div className="metric-val" style={{ color: totalPredicted - totalConfirmed > 0 ? '#854d0e' : 'var(--color-text-primary)' }}>
            {totalConfirmed > 0 ? `£${(totalPredicted - totalConfirmed).toFixed(2)}` : '—'}
          </div>
          <div className="metric-sub">predicted vs confirmed</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Estimation quality</div>
          <div className="metric-val" style={{ fontSize: '16px', fontWeight: 500, color: breakdown?.confirmed > 0 ? '#27500a' : 'var(--color-text-tertiary)' }}>
            {breakdown
              ? breakdown.confirmed > 0
                ? `${Math.round((breakdown.confirmed / (breakdown.confirmed + breakdown.scheduled + breakdown.learned + breakdown.default)) * 100)}% confirmed`
                : 'Estimated'
              : '—'}
          </div>
          <div className="metric-sub">
            {breakdown
              ? `${breakdown.confirmed} confirmed · ${breakdown.scheduled + breakdown.learned} estimated · ${breakdown.default} default`
              : 'no data yet'}
          </div>
        </div>
      </div>

      {/* Context banner — always shown when there's data */}
      {wages && wages.employee_breakdown?.length > 0 && (
        <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#eaf3de', border: '0.5px solid #97c459', flexShrink: 0 }} />
            <span><strong style={{ color: 'var(--color-text-primary)' }}>Confirmed</strong> — actual finish times entered on the rota. Exact.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#fef9c3', border: '0.5px solid #fde047', flexShrink: 0 }} />
            <span><strong style={{ color: 'var(--color-text-primary)' }}>Predicted</strong> — full week projection using scheduled shifts + estimation engine. Updates as finish times are confirmed.</span>
          </div>
        </div>
      )}

      {/* Unconfirmed warning */}
      {wages?.has_unconfirmed && (
        <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#633806', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚠</span>
          <div>
            <strong>Some wages are estimated</strong> — {unconfirmedCount} employee{unconfirmedCount !== 1 ? 's' : ''} have past shifts without confirmed finish times.
            Go to the <span style={{ color: '#C41E3A', cursor: 'pointer', fontWeight: 500 }} onClick={() => window.location.href = '/rota'}>Rota page</span> to confirm finish times and make these figures exact.
          </div>
        </div>
      )}

      {/* Employee breakdown table */}
      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading wages…</div>
      ) : !wages || wages.employee_breakdown?.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '32px', marginBottom: '0.75rem' }}>📋</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>No schedule for this week</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Create a rota for this week to see wage calculations here.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 90px 110px 110px 110px 110px 100px',
            padding: '10px 16px',
            background: 'var(--color-background-secondary)',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: '11px', fontWeight: 500,
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>
            <div>Employee</div>
            <div>Rate</div>
            <div>Pred. hours</div>
            <div>Pred. wage</div>
            <div>Conf. hours</div>
            <div>Conf. wage</div>
            <div>Status</div>
          </div>

          {wages.employee_breakdown.map((emp: EmployeeWageSummary, idx: number) => {
            const hasRate = emp.hourly_rate > 0;
            const isFullyConfirmed = emp.confirmed_hours > 0 && !emp.has_unconfirmed_shifts;
            const hasAnyConfirmed = emp.confirmed_hours > 0;
            const variance = emp.predicted_wage - emp.confirmed_wage;

            return (
              <div key={emp.employee_id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 110px 110px 110px 110px 100px',
                padding: '12px 16px',
                borderBottom: idx < wages.employee_breakdown.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                alignItems: 'center',
                background: isFullyConfirmed ? '#f8fdf4' : 'transparent',
              }}>
                {/* Name */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {emp.first_name} {emp.last_name}
                  </div>
                  {!hasRate && (
                    <div style={{ fontSize: '10px', color: '#9e1830', marginTop: '1px' }}>No rate set</div>
                  )}
                </div>

                {/* Rate */}
                <div style={{ fontSize: '13px', color: hasRate ? 'var(--color-text-primary)' : '#d0cec6', fontWeight: hasRate ? 500 : 400 }}>
                  {hasRate ? `£${emp.hourly_rate.toFixed(2)}` : '—'}
                </div>

                {/* Predicted hours */}
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {emp.predicted_hours > 0 ? `${emp.predicted_hours}h` : '—'}
                </div>

                {/* Predicted wage */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: hasRate ? '#C9973A' : '#d0cec6' }}>
                    {hasRate && emp.predicted_wage > 0 ? `£${emp.predicted_wage.toFixed(2)}` : '—'}
                  </div>
                  {emp.has_unconfirmed_shifts && (
                    <div style={{ fontSize: '10px', color: '#854f0b', marginTop: '1px' }}>estimated</div>
                  )}
                </div>

                {/* Confirmed hours */}
                <div style={{ fontSize: '13px', color: hasAnyConfirmed ? '#27500a' : 'var(--color-text-tertiary)' }}>
                  {hasAnyConfirmed ? `${emp.confirmed_hours}h` : '—'}
                </div>

                {/* Confirmed wage */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: hasAnyConfirmed ? '#27500a' : '#d0cec6' }}>
                    {hasAnyConfirmed && hasRate ? `£${emp.confirmed_wage.toFixed(2)}` : '—'}
                  </div>
                  {hasAnyConfirmed && variance !== 0 && (
                    <div style={{ fontSize: '10px', color: variance > 0 ? '#854d0e' : '#27500a', marginTop: '1px' }}>
                      {variance > 0 ? `£${variance.toFixed(2)} over est.` : `£${Math.abs(variance).toFixed(2)} under est.`}
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div>
                  {isFullyConfirmed ? (
                    <span className="badge badge-green">✓ Confirmed</span>
                  ) : emp.has_unconfirmed_shifts ? (
                    <span className="badge badge-gold">⚠ Pending</span>
                  ) : (
                    <span className="badge badge-gray">Scheduled</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Totals row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 90px 110px 110px 110px 110px 100px',
            padding: '12px 16px',
            background: 'var(--color-background-secondary)',
            borderTop: '1.5px solid var(--color-border-secondary)',
            fontSize: '13px', fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}>
            <div>Total</div>
            <div></div>
            <div>{totalPredictedHours}h</div>
            <div style={{ color: '#C9973A' }}>£{totalPredicted.toFixed(2)}</div>
            <div style={{ color: '#27500a' }}>{totalConfirmedHours > 0 ? `${totalConfirmedHours}h` : '—'}</div>
            <div style={{ color: '#27500a' }}>{totalConfirmed > 0 ? `£${totalConfirmed.toFixed(2)}` : '—'}</div>
            <div></div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1rem', fontSize: '12px', color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
        Predicted wages update in real time as you confirm finish times on the rota — once every shift is confirmed, predicted and confirmed figures will match exactly.
      </div>
    </div>
  );
}

// ─── Wage Rates Tab ───────────────────────────────────────────────────────────

function WageRatesTab() {
  const { data: employees = [], isLoading } = useWageEmployees();
  const { data: nlwData } = useNLW();
  const updateWage = useUpdateWage();

  const NLW_RATE = nlwData?.rate ?? NLW_FALLBACK.rate;
  const NLW_YEAR = nlwData?.year ?? NLW_FALLBACK.year;
  const NLW_NEXT_YEAR = String(parseInt(NLW_YEAR) + 1).slice(2);

  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');

  function startEdit(emp: any) {
    setEditing(emp.id);
    setDrafts(prev => ({
      ...prev,
      [emp.id]: {
        hourly_rate: emp.hourly_rate ?? 0,
        wage_type: emp.wage_type ?? 'hourly',
        contracted_hours: emp.contracted_hours ?? '',
        enforce_contracted_hours: emp.enforce_contracted_hours ?? false,
      },
    }));
    setError('');
  }

  function cancelEdit(id: string) {
    setEditing(null);
    setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function saveEdit(id: string) {
    const d = drafts[id];
    if (!d) return;
    const rate = parseFloat(d.hourly_rate);
    if (isNaN(rate) || rate < 0) { setError('Please enter a valid hourly rate.'); return; }
    if (d.enforce_contracted_hours && !d.contracted_hours) {
      setError('Set contracted hours before enabling enforcement.'); return;
    }
    try {
      await updateWage.mutateAsync({
        id,
        body: {
          hourly_rate: rate,
          wage_type: d.wage_type,
          contracted_hours: d.contracted_hours ? parseInt(d.contracted_hours) : null,
          enforce_contracted_hours: d.enforce_contracted_hours,
        },
      });
      setEditing(null);
      setSaved(id);
      setError('');
      setTimeout(() => setSaved(null), 2500);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to save.');
    }
  }

  async function quickToggleEnforce(emp: any) {
    if (!emp.contracted_hours && !emp.enforce_contracted_hours) {
      setError(`Set contracted hours for ${emp.first_name} before enabling enforcement.`);
      startEdit(emp);
      return;
    }
    try {
      await updateWage.mutateAsync({ id: emp.id, body: { enforce_contracted_hours: !emp.enforce_contracted_hours } });
    } catch { setError('Failed to update.'); }
  }

  function updateDraft(id: string, field: string, value: any) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setError('');
  }

  const totalWeeklyWageBill = employees.reduce((sum: number, e: any) => {
    const rate = parseFloat(e.hourly_rate) || 0;
    const hours = e.contracted_hours || e.max_hours_per_week || 40;
    return sum + rate * hours;
  }, 0);
  const unsetCount = employees.filter((e: any) => !e.hourly_rate || parseFloat(e.hourly_rate) === 0).length;
  const enforcedCount = employees.filter((e: any) => e.enforce_contracted_hours).length;

  return (
    <div>
      {/* Metrics */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">Rates set</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>
            {employees.length - unsetCount}
            <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--color-text-tertiary)' }}>/{employees.length}</span>
          </div>
          <div className="metric-sub">{unsetCount > 0 ? `${unsetCount} still need a rate` : 'all set'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Est. weekly wage bill</div>
          <div className="metric-val" style={{ color: '#C9973A' }}>
            £{totalWeeklyWageBill.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="metric-sub">based on contracted hours</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Hours enforced on rota</div>
          <div className="metric-val" style={{ color: enforcedCount > 0 ? '#27500a' : 'var(--color-text-primary)' }}>
            {enforcedCount}
          </div>
          <div className="metric-sub">of {employees.length} staff</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">NLW {NLW_YEAR}/{NLW_NEXT_YEAR}</div>
          <div className="metric-val">£{NLW_RATE.toFixed(2)}</div>
          <div className="metric-sub" style={{ color: nlwData?.source === 'gov_api' ? '#27500a' : 'var(--color-text-tertiary)' }}>
            {nlwData?.source === 'gov_api' ? '✓ from gov.uk' : 'reference rate'}
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>Contracted hours enforcement:</strong> When the toggle is <strong>on</strong>, the rota generator won't assign shifts that would exceed that employee's contracted hours. When <strong>off</strong>, contracted hours are for reference only.
      </div>

      {unsetCount > 0 && (
        <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#633806' }}>
          ⚠ {unsetCount} employee{unsetCount !== 1 ? 's have' : ' has'} no hourly rate set — wages will show as £0.00 until updated.
        </div>
      )}

      {error && (
        <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer', color: '#9e1830', fontSize: '16px' }}>×</button>
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 110px 100px 120px 120px 160px 100px',
            padding: '10px 16px',
            background: 'var(--color-background-secondary)',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: '11px', fontWeight: 500, color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>
            <div>Employee</div><div>Role</div><div>Type</div>
            <div>Hourly rate</div><div>Contracted hrs</div><div>Enforce on rota</div><div></div>
          </div>

          {employees.map((emp: any, idx: number) => {
            const isEditing = editing === emp.id;
            const d = drafts[emp.id];
            const rate = parseFloat(emp.hourly_rate) || 0;
            const isSaved = saved === emp.id;
            const hasRate = rate > 0;
            const belowMin = hasRate && rate < NLW_RATE;
            const isEnforced = emp.enforce_contracted_hours;
            const hasContracted = !!emp.contracted_hours;

            const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
              <div onClick={onChange} style={{ width: '36px', height: '20px', borderRadius: '10px', position: 'relative', cursor: 'pointer', flexShrink: 0, background: value ? '#C41E3A' : '#d0cec6', transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: '2px', borderRadius: '50%', width: '16px', height: '16px', background: 'white', left: value ? '18px' : '2px', transition: 'left 0.2s' }} />
              </div>
            );

            return (
              <div key={emp.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 110px 100px 120px 120px 160px 100px',
                padding: '12px 16px',
                borderBottom: idx < employees.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                alignItems: 'center',
                background: isEditing ? 'var(--color-background-secondary)' : isSaved ? '#f0faf0' : 'transparent',
                transition: 'background 0.2s',
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {emp.first_name} {emp.last_name}
                    {emp.off_rota && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#f0efe8', color: '#888780', border: '0.5px solid #d0cec6', padding: '1px 6px', borderRadius: '20px' }}>Off rota</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                    {EMPLOYMENT_TYPE_LABELS[emp.employment_type] || emp.employment_type}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{emp.role_name}</div>
                <div>
                  {isEditing ? (
                    <select value={d.wage_type} onChange={e => updateDraft(emp.id, 'wage_type', e.target.value)} style={{ fontSize: '12px', padding: '4px 6px' }}>
                      <option value="hourly">Hourly</option>
                      <option value="salary">Salary</option>
                    </select>
                  ) : (
                    <span className={`badge ${emp.wage_type === 'salary' ? 'badge-gold' : 'badge-gray'}`}>
                      {emp.wage_type === 'salary' ? 'Salary' : 'Hourly'}
                    </span>
                  )}
                </div>
                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>£</span>
                      <input type="number" min="0" max="9999" step="0.01" value={d.hourly_rate} autoFocus
                        onChange={e => updateDraft(emp.id, 'hourly_rate', e.target.value)}
                        style={{ width: '75px', fontSize: '13px', padding: '4px 6px' }} />
                    </div>
                  ) : (
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: !hasRate ? '#d0cec6' : 'var(--color-text-primary)' }}>
                        {hasRate ? `£${rate.toFixed(2)}` : '—'}
                      </span>
                      {belowMin && <div style={{ fontSize: '10px', color: '#8a6220', marginTop: '1px' }}>Below NLW (note)</div>}
                    </div>
                  )}
                </div>
                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="number" min="1" max="168" value={d.contracted_hours}
                        onChange={e => updateDraft(emp.id, 'contracted_hours', e.target.value)}
                        placeholder={String(emp.max_hours_per_week)}
                        style={{ width: '55px', fontSize: '13px', padding: '4px 6px' }} />
                      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>hrs/wk</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '13px', color: hasContracted ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                      {hasContracted ? `${emp.contracted_hours} hrs/wk` : `${emp.max_hours_per_week} hrs/wk`}
                      {!hasContracted && <span style={{ fontSize: '10px', display: 'block', color: 'var(--color-text-tertiary)' }}>(max hrs)</span>}
                    </span>
                  )}
                </div>
                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '12px' }}>
                        <Toggle value={d.enforce_contracted_hours} onChange={() => updateDraft(emp.id, 'enforce_contracted_hours', !d.enforce_contracted_hours)} />
                        <span style={{ color: d.enforce_contracted_hours ? '#C41E3A' : 'var(--color-text-tertiary)' }}>
                          {d.enforce_contracted_hours ? 'Enforced' : 'Off'}
                        </span>
                      </label>
                      {d.enforce_contracted_hours && !d.contracted_hours && (
                        <div style={{ fontSize: '10px', color: '#9e1830' }}>Set hours first</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Toggle
                        value={isEnforced}
                        onChange={() => !emp.off_rota && quickToggleEnforce(emp)}
                      />
                      <span style={{ fontSize: '12px', color: isEnforced ? '#C41E3A' : 'var(--color-text-tertiary)', fontWeight: isEnforced ? 500 : 400 }}>
                        {isEnforced ? 'Enforced' : 'Off'}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  {isEditing ? (
                    <>
                      <button onClick={() => saveEdit(emp.id)} disabled={updateWage.isPending}
                        style={{ fontSize: '12px', padding: '5px 10px', background: '#C41E3A', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                        {updateWage.isPending ? '…' : 'Save'}
                      </button>
                      <button onClick={() => cancelEdit(emp.id)} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => startEdit(emp)}
                      style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', color: isSaved ? '#27500a' : undefined }}>
                      {isSaved ? '✓ Saved' : !hasRate ? 'Set rate' : 'Edit'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '1rem', fontSize: '12px', color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
        NLW figure fetched from gov.uk and refreshed automatically — shown for reference only.
        Contracted hours are informational unless enforcement is enabled.
      </div>
    </div>
  );
}

// ─── Main WagesPage with tabs ─────────────────────────────────────────────────

type Tab = 'summary' | 'rates';

export function WagesPage() {
  const [tab, setTab] = useState<Tab>('summary');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Wages</h1>
          <p className="page-sub">Weekly summaries, pay rates, and contracted hours</p>
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.75rem', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {([
          { id: 'summary', label: 'Weekly summary' },
          { id: 'rates',   label: 'Pay rates & hours' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 20px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer',
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

      {tab === 'summary' && <WeeklySummaryTab />}
      {tab === 'rates'   && <WageRatesTab />}
    </div>
  );
}
