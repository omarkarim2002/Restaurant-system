import React, { useState } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/index';

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full time', part_time: 'Part time', casual: 'Casual',
};

const NLW_FALLBACK = { rate: 12.21, year: '2025', source: 'fallback' };

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

function useUpdateWage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.patch(`/wages/employees/${id}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wage-employees'] }),
  });
}

export function WageRatesPage() {
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
    if (isNaN(rate) || rate < 0) { setError('Please enter a valid hourly rate (0 or above).'); return; }
    if (d.enforce_contracted_hours && !d.contracted_hours) {
      setError('Please set contracted hours before enabling enforcement.');
      return;
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

  // Quick toggle without opening edit mode
  async function quickToggleEnforce(emp: any) {
    if (!emp.contracted_hours && !emp.enforce_contracted_hours) {
      setError(`Set contracted hours for ${emp.first_name} before enabling enforcement.`);
      startEdit(emp);
      return;
    }
    try {
      await updateWage.mutateAsync({
        id: emp.id,
        body: { enforce_contracted_hours: !emp.enforce_contracted_hours },
      });
    } catch {
      setError('Failed to update.');
    }
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
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Wage rates</h1>
          <p className="page-sub">Set hourly rates and contracted hours — optionally enforce limits on the rota</p>
        </div>
      </div>

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

      {/* Enforcement explanation */}
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>About contracted hours enforcement:</strong> When the toggle is <strong>on</strong> for an employee, the rota generator will not assign them shifts that would exceed their contracted hours for the week.
        If a shift has no end time, the system uses the restaurant's closing time as the upper boundary — so the employee is still considered for the shift, but the worst-case hours are counted against their budget.
        When the toggle is <strong>off</strong>, contracted hours are stored for reference only and have no effect on the rota.
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
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 110px 100px 120px 120px 160px 100px',
            padding: '10px 16px',
            background: 'var(--color-background-secondary)',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            fontSize: '11px', fontWeight: 500,
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>
            <div>Employee</div>
            <div>Role</div>
            <div>Type</div>
            <div>Hourly rate</div>
            <div>Contracted hrs</div>
            <div>Enforce on rota</div>
            <div></div>
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
                {/* Name */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {emp.first_name} {emp.last_name}
                    {emp.off_rota && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#f0efe8', color: '#888780', border: '0.5px solid #d0cec6', padding: '1px 6px', borderRadius: '20px' }}>Off rota</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                    {EMPLOYMENT_TYPE_LABELS[emp.employment_type] || emp.employment_type}
                  </div>
                </div>

                {/* Role */}
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{emp.role_name}</div>

                {/* Wage type */}
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

                {/* Hourly rate */}
                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>£</span>
                      <input type="number" min="0" max="9999" step="0.01" value={d.hourly_rate}
                        onChange={e => updateDraft(emp.id, 'hourly_rate', e.target.value)}
                        style={{ width: '75px', fontSize: '13px', padding: '4px 6px' }} autoFocus />
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

                {/* Contracted hours */}
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

                {/* Enforce toggle */}
                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '12px' }}>
                        <div
                          onClick={() => updateDraft(emp.id, 'enforce_contracted_hours', !d.enforce_contracted_hours)}
                          style={{
                            width: '36px', height: '20px', borderRadius: '10px', position: 'relative', cursor: 'pointer', flexShrink: 0,
                            background: d.enforce_contracted_hours ? '#C41E3A' : '#d0cec6',
                            transition: 'background 0.2s',
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: '2px', borderRadius: '50%', width: '16px', height: '16px', background: 'white',
                            left: d.enforce_contracted_hours ? '18px' : '2px', transition: 'left 0.2s',
                          }} />
                        </div>
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
                      <div
                        onClick={() => !emp.off_rota && quickToggleEnforce(emp)}
                        style={{
                          width: '36px', height: '20px', borderRadius: '10px', position: 'relative',
                          cursor: emp.off_rota ? 'not-allowed' : 'pointer', flexShrink: 0,
                          background: isEnforced ? '#C41E3A' : '#d0cec6',
                          opacity: emp.off_rota ? 0.4 : 1,
                          transition: 'background 0.2s',
                        }}
                        title={emp.off_rota ? 'Off-rota staff are excluded from scheduling' : isEnforced ? 'Click to disable enforcement' : 'Click to enforce contracted hours on rota'}
                      >
                        <div style={{
                          position: 'absolute', top: '2px', borderRadius: '50%', width: '16px', height: '16px', background: 'white',
                          left: isEnforced ? '18px' : '2px', transition: 'left 0.2s',
                        }} />
                      </div>
                      <span style={{ fontSize: '12px', color: isEnforced ? '#C41E3A' : 'var(--color-text-tertiary)', fontWeight: isEnforced ? 500 : 400 }}>
                        {isEnforced ? 'Enforced' : 'Off'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  {isEditing ? (
                    <>
                      <button onClick={() => saveEdit(emp.id)} disabled={updateWage.isPending}
                        style={{ fontSize: '12px', padding: '5px 10px', background: '#C41E3A', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                        {updateWage.isPending ? '…' : 'Save'}
                      </button>
                      <button onClick={() => cancelEdit(emp.id)} style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer' }}>
                        Cancel
                      </button>
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
        The NLW figure is fetched from gov.uk and refreshed automatically — shown for reference only, no enforcement.
        Contracted hours are informational unless the rota enforcement toggle is on for that employee.
      </div>
    </div>
  );
}
