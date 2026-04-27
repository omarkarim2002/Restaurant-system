import React from 'react';
import { format } from 'date-fns';
import { useSchedules, useScheduleAdvisory, useEmployees, useTimeOffRequests, useReviewTimeOff } from '../hooks/useRota';

const AVATAR_COLORS = [
  { bg: '#E1F5EE', text: '#085041' },
  { bg: '#E6F1FB', text: '#0C447C' },
  { bg: '#FAEEDA', text: '#633806' },
  { bg: '#EEEDFE', text: '#3C3489' },
  { bg: '#FAECE7', text: '#712B13' },
];

function initials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export function DashboardPage() {
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening';

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

  const todayStr = format(today, 'yyyy-MM-dd');
  const todayAssignments = currentSchedule
    ? (advisory ? [] : [])
    : [];

  const understaffedWarnings = advisory?.warnings?.filter((w: any) => w.level === 'understaffed') || [];
  const overstaffedWarnings = advisory?.warnings?.filter((w: any) => w.level === 'overstaffed') || [];
  const totalWarnings = understaffedWarnings.length + overstaffedWarnings.length;

  const hoursWorked = advisory
    ? Object.values(advisory.total_hours_by_employee as Record<string, number>).reduce((a, b) => a + b, 0)
    : 0;

  const s: Record<string, React.CSSProperties> = {
    db: { padding: '1.5rem', background: 'var(--color-background-tertiary)', minHeight: '100vh' },
    topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
    h1: { fontSize: '20px', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 },
    sub: { fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' },
    livePill: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '20px', padding: '4px 12px' },
    dot: { width: '7px', height: '7px', borderRadius: '50%', background: '#3B6D11', flexShrink: 0 },
    nav: { display: 'flex', gap: '4px', marginBottom: '1.25rem' },
    navItem: { fontSize: '12px', padding: '5px 12px', borderRadius: '20px', cursor: 'pointer', color: 'var(--color-text-secondary)', border: '0.5px solid transparent', background: 'transparent' },
    navActive: { fontSize: '12px', padding: '5px 12px', borderRadius: '20px', cursor: 'pointer', color: 'var(--color-text-primary)', fontWeight: 500, border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)' },
    metrics: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '1.25rem' },
    metric: { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px', padding: '1rem 1.1rem' },
    metricLabel: { fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' },
    metricVal: { fontSize: '26px', fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1 },
    metricSub: { fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' },
    cols: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '12px' },
    card: { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px', padding: '1.1rem', marginBottom: '12px' },
    cardTitle: { fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '1rem' },
    btnPrimary: { background: '#185FA5', color: '#E6F1FB', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 },
    btnGhost: { background: 'transparent', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' },
    warnCard: { display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#FCEBEB', border: '0.5px solid #F09595', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' },
    warnIcon: { width: '18px', height: '18px', borderRadius: '50%', background: '#E24B4A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px', color: 'white', fontSize: '12px', fontWeight: 700 },
    warnText: { fontSize: '12px', color: '#501313', flex: 1 },
    staffCard: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', background: 'var(--color-background-primary)', marginBottom: '6px' },
    avatar: { width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 500, flexShrink: 0 },
    pendingCard: { padding: '8px 10px', background: 'var(--color-background-secondary)', borderRadius: '8px', marginBottom: '8px' },
  };

  return (
    <div style={s.db}>
      <div style={s.topbar}>
        <div>
          <h1 style={s.h1}>{greeting}, Omar</h1>
          <p style={s.sub}>{format(today, 'EEEE d MMMM')} — today's staffing overview</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={s.livePill}><div style={s.dot} /> live</div>
          <button style={s.btnPrimary} onClick={() => window.location.href = '/rota'}>
            View rota →
          </button>
        </div>
      </div>

      <div style={s.nav}>
        {['Today', 'This week', 'Staff', 'Time off'].map((item, i) => (
          <button
            key={item}
            style={i === 0 ? s.navActive : s.navItem}
            onClick={() => {
              if (item === 'This week' || item === 'Today') window.location.href = '/rota';
              if (item === 'Staff') window.location.href = '/staff';
              if (item === 'Time off') window.location.href = '/time-off';
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <div style={s.metrics}>
        <div style={s.metric}>
          <div style={s.metricLabel}>Staff active</div>
          <div style={{ ...s.metricVal, color: '#27500A' }}>{employees.length}</div>
          <div style={s.metricSub}>employees on record</div>
        </div>
        <div style={s.metric}>
          <div style={s.metricLabel}>Warnings</div>
          <div style={{ ...s.metricVal, color: totalWarnings > 0 ? '#A32D2D' : '#27500A' }}>
            {currentSchedule ? totalWarnings : '—'}
          </div>
          <div style={s.metricSub}>{totalWarnings > 0 ? 'shifts need attention' : currentSchedule ? 'all shifts ok' : 'no schedule yet'}</div>
        </div>
        <div style={s.metric}>
          <div style={s.metricLabel}>Hours scheduled</div>
          <div style={s.metricVal}>{currentSchedule ? Math.round(hoursWorked) : '—'}</div>
          <div style={s.metricSub}>this week</div>
        </div>
        <div style={s.metric}>
          <div style={s.metricLabel}>Pending time off</div>
          <div style={{ ...s.metricVal, color: timeOffRequests.length > 0 ? '#854F0B' : 'var(--color-text-primary)' }}>
            {timeOffRequests.length}
          </div>
          <div style={{ ...s.metricSub, color: timeOffRequests.length > 0 ? '#854F0B' : 'var(--color-text-tertiary)' }}>
            {timeOffRequests.length > 0 ? 'needs review' : 'all clear'}
          </div>
        </div>
      </div>

      {understaffedWarnings.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          {understaffedWarnings.slice(0, 3).map((w: any, i: number) => (
            <div key={i} style={s.warnCard}>
              <div style={s.warnIcon}>!</div>
              <div style={s.warnText}>
                <div style={{ fontWeight: 500, marginBottom: '2px' }}>
                  {w.shift_name} understaffed — {w.assigned_count} {w.role_name}(s) assigned, minimum is {w.min_required}
                </div>
                <div>{w.date}</div>
              </div>
              <button style={s.btnGhost} onClick={() => window.location.href = '/rota'}>
                Fix →
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={s.cols}>
        <div>
          {!currentSchedule ? (
            <div style={s.card}>
              <div style={s.cardTitle}>This week's schedule</div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                No schedule has been created for this week yet.
              </p>
              <button style={s.btnPrimary} onClick={() => window.location.href = '/rota'}>
                Create this week's rota →
              </button>
            </div>
          ) : (
            <div style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={s.cardTitle}>Schedule status</div>
                <span style={{
                  fontSize: '11px',
                  padding: '3px 10px',
                  borderRadius: '10px',
                  background: currentSchedule.status === 'published' ? '#EAF3DE' : '#FAEEDA',
                  color: currentSchedule.status === 'published' ? '#27500A' : '#633806',
                  fontWeight: 500,
                }}>
                  {currentSchedule.status}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                Week of {format(new Date(currentSchedule.week_start), 'dd MMMM yyyy')}
                {totalWarnings > 0 && ` · ${totalWarnings} warning${totalWarnings > 1 ? 's' : ''}`}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={s.btnPrimary} onClick={() => window.location.href = '/rota'}>
                  Open rota →
                </button>
                {totalWarnings > 0 && (
                  <button style={s.btnGhost} onClick={() => window.location.href = '/rota'}>
                    Review warnings
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={s.card}>
            <div style={s.cardTitle}>Active staff</div>
            {employees.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>No staff added yet.</div>
            ) : (
              <>
                {employees.slice(0, 5).map((emp: any, i: number) => {
                  const color = avatarColor(i);
                  return (
                    <div key={emp.id} style={s.staffCard}>
                      <div style={{ ...s.avatar, background: color.bg, color: color.text }}>
                        {initials(emp.first_name, emp.last_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                          {emp.first_name} {emp.last_name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          {emp.role_name || 'No role'} · {emp.employment_type?.replace('_', ' ')}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                        max {emp.max_hours_per_week}h/wk
                      </div>
                    </div>
                  );
                })}
                {employees.length > 5 && (
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '8px', textAlign: 'center' }}>
                    +{employees.length - 5} more staff members
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '8px' }}>
              <button style={s.btnGhost} onClick={() => window.location.href = '/staff'}>
                Manage staff →
              </button>
            </div>
          </div>
        </div>

        <div>
          <div style={s.card}>
            <div style={s.cardTitle}>Pending time off</div>
            {timeOffRequests.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>No pending requests.</div>
            ) : (
              timeOffRequests.map((req: any) => (
                <div key={req.id} style={s.pendingCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {req.first_name} {req.last_name}
                    </div>
                    <div style={{ fontSize: '11px', background: '#FAEEDA', color: '#633806', padding: '2px 8px', borderRadius: '10px' }}>
                      Pending
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                    {req.request_type} · {format(new Date(req.start_date), 'dd MMM')}
                    {req.start_date !== req.end_date && ` – ${format(new Date(req.end_date), 'dd MMM')}`}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      style={{ ...s.btnPrimary, flex: 1, textAlign: 'center', padding: '5px 0' }}
                      onClick={() => reviewTimeOff.mutate({ id: req.id, status: 'approved' })}
                    >
                      Approve
                    </button>
                    <button
                      style={{ ...s.btnGhost, flex: 1, textAlign: 'center', padding: '5px 0' }}
                      onClick={() => reviewTimeOff.mutate({ id: req.id, status: 'rejected' })}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Quick actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: '+ Add staff member', href: '/staff/new' },
                { label: '+ Create next week\'s rota', href: '/rota' },
                { label: 'View hours report', href: '/rota' },
              ].map(({ label, href }) => (
                <button
                  key={label}
                  style={{ ...s.btnGhost, textAlign: 'left', padding: '8px 12px' }}
                  onClick={() => window.location.href = href}
                >
                  {label} →
                </button>
              ))}
            </div>
          </div>

          <div style={{ ...s.card, marginBottom: 0 }}>
            <div style={s.cardTitle}>System</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
              <div>Phase 1 — Staff rota</div>
              <div style={{ color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                Phase 2 — Bookings (coming soon)
              </div>
              <div style={{ color: 'var(--color-text-tertiary)' }}>
                Phase 3 — Inventory (coming soon)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
