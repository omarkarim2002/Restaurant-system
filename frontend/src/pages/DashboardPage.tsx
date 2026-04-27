import React from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useSchedules, useScheduleAdvisory, useEmployees, useTimeOffRequests, useReviewTimeOff } from '../hooks/useRota';

const AVATAR_COLORS = [
  { bg: '#fde8ec', text: '#9e1830' },
  { bg: '#f5ead6', text: '#8a6220' },
  { bg: '#e6f1fb', text: '#0c447c' },
  { bg: '#eaf3de', text: '#27500a' },
  { bg: '#eeedfe', text: '#3c3489' },
];

function initials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

export function DashboardPage() {
  const navigate = useNavigate();
  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const { data: schedules = [] } = useSchedules();
  const { data: employees = [] } = useEmployees({ active: true });
  const { data: timeOffRequests = [] } = useTimeOffRequests({ status: 'pending' });
  const reviewTimeOff = useReviewTimeOff();

  const todayWeekStart = (() => {
    const d = new Date(today);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return format(d, 'yyyy-MM-dd');
  })();

  const currentSchedule = schedules.find(
    (s: any) => format(new Date(s.week_start), 'yyyy-MM-dd') === todayWeekStart
  );

  const { data: advisory } = useScheduleAdvisory(currentSchedule?.id || '');
  const understaffed = advisory?.warnings?.filter((w: any) => w.level === 'understaffed') || [];
  const totalWarnings = advisory?.warnings?.length || 0;
  const hoursWorked = advisory
    ? Math.round(Object.values(advisory.total_hours_by_employee as Record<string, number>).reduce((a, b) => a + b, 0))
    : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting}, {employees.find((e: any) => true)?.first_name || 'there'}</h1>
          <p className="page-sub">
            <span className="live-dot" />
            {format(today, 'EEEE d MMMM yyyy')} — staffing overview
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/rota')}>
          View rota →
        </button>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Staff active</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>{employees.length}</div>
          <div className="metric-sub">employees on record</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Warnings</div>
          <div className="metric-val" style={{ color: totalWarnings > 0 ? '#C41E3A' : '#27500a' }}>
            {currentSchedule ? totalWarnings : '—'}
          </div>
          <div className="metric-sub">{totalWarnings > 0 ? 'shifts need attention' : currentSchedule ? 'all clear' : 'no schedule yet'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Hours scheduled</div>
          <div className="metric-val" style={{ color: '#C9973A' }}>{currentSchedule ? hoursWorked : '—'}</div>
          <div className="metric-sub">this week</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Pending time off</div>
          <div className="metric-val" style={{ color: timeOffRequests.length > 0 ? '#C9973A' : 'var(--color-text-primary)' }}>
            {timeOffRequests.length}
          </div>
          <div className="metric-sub" style={{ color: timeOffRequests.length > 0 ? '#8a6220' : undefined }}>
            {timeOffRequests.length > 0 ? 'needs review' : 'all clear'}
          </div>
        </div>
      </div>

      {understaffed.map((w: any, i: number) => (
        <div key={i} className="warn-banner">
          <div className="warn-dot">!</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#9e1830', marginBottom: '2px' }}>
              {w.shift_name} understaffed — {w.assigned_count} {w.role_name}(s) assigned, minimum is {w.min_required}
            </div>
            <div style={{ fontSize: '12px', color: '#b84a5e' }}>{w.date}</div>
          </div>
          <button className="btn-primary" style={{ fontSize: '12px', padding: '5px 12px' }} onClick={() => navigate('/rota')}>
            Fix →
          </button>
        </div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: '14px' }}>
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>This week's schedule</h3>
              {currentSchedule && (
                <span className={`badge ${currentSchedule.status === 'published' ? 'badge-green' : 'badge-gold'}`}>
                  {currentSchedule.status}
                </span>
              )}
            </div>
            {!currentSchedule ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                  No schedule has been created for this week yet.
                </p>
                <button className="btn-primary" onClick={() => navigate('/rota')}>Create this week's rota →</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                  Week of {format(new Date(currentSchedule.week_start), 'dd MMMM yyyy')}
                  {totalWarnings > 0 && <span style={{ color: '#C41E3A' }}> · {totalWarnings} warning{totalWarnings > 1 ? 's' : ''}</span>}
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" onClick={() => navigate('/rota')}>Open rota →</button>
                  {totalWarnings > 0 && <button onClick={() => navigate('/rota')}>Review warnings</button>}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Active staff</h3>
              <button className="btn-gold" style={{ fontSize: '12px', padding: '5px 12px' }} onClick={() => navigate('/staff')}>
                + Add staff
              </button>
            </div>
            {employees.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                No staff added yet. <span style={{ color: '#C41E3A', cursor: 'pointer' }} onClick={() => navigate('/staff')}>Add your first staff member →</span>
              </p>
            ) : (
              employees.slice(0, 6).map((emp: any, i: number) => {
                const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                return (
                  <div key={emp.id} className="staff-row">
                    <div className="avatar" style={{ background: color.bg, color: color.text }}>
                      {initials(emp.first_name, emp.last_name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{emp.first_name} {emp.last_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{emp.role_name || 'No role'}</div>
                    </div>
                    <span className="badge badge-gray">{emp.employment_type?.replace('_', ' ')}</span>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', minWidth: '70px', textAlign: 'right' }}>
                      max {emp.max_hours_per_week}h/wk
                    </div>
                  </div>
                );
              })
            )}
            {employees.length > 6 && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                +{employees.length - 6} more ·{' '}
                <span style={{ color: '#C41E3A', cursor: 'pointer' }} onClick={() => navigate('/staff')}>view all</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Pending time off</h3>
            {timeOffRequests.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>No pending requests.</p>
            ) : timeOffRequests.map((req: any) => (
              <div key={req.id} style={{ padding: '10px', background: 'var(--color-background-secondary)', borderRadius: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{req.first_name} {req.last_name}</div>
                  <span className="badge badge-gold">Pending</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  {req.request_type} · {format(new Date(req.start_date), 'dd MMM')}
                  {req.start_date !== req.end_date && ` – ${format(new Date(req.end_date), 'dd MMM')}`}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn-primary" style={{ flex: 1, padding: '5px 0', fontSize: '12px' }}
                    onClick={() => reviewTimeOff.mutate({ id: req.id, status: 'approved' })}>
                    Approve
                  </button>
                  <button style={{ flex: 1, padding: '5px 0', fontSize: '12px' }}
                    onClick={() => reviewTimeOff.mutate({ id: req.id, status: 'rejected' })}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Quick actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: '+ Add staff member', action: () => navigate('/staff') },
                { label: '+ Create next week\'s rota', action: () => navigate('/rota') },
                { label: 'Review time off requests', action: () => navigate('/time-off') },
              ].map(({ label, action }) => (
                <button key={label} onClick={action} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '13px' }}>
                  {label} →
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ borderLeft: '3px solid #C41E3A', borderRadius: '0 12px 12px 0' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '4px', fontSize: '12px' }}>Roadmap</div>
              <div>✓ Phase 1 — Staff rota</div>
              <div style={{ opacity: 0.5 }}>· Phase 2 — Bookings</div>
              <div style={{ opacity: 0.5 }}>· Phase 3 — Inventory</div>
              <div style={{ opacity: 0.5 }}>· Phase 4 — AI engine</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
