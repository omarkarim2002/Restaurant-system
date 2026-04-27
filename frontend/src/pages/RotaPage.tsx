import React, { useState } from 'react';
import { format, addDays, parseISO, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { useSchedules, useSchedule, useRemoveAssignment, useScheduleAdvisory, useCreateSchedule, usePublishSchedule } from '../hooks/useRota';
import { AssignShiftModal } from '../components/rota/AssignShiftModal';

const SHIFT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  morning:   { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  afternoon: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  evening:   { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  full_day:  { bg: '#dcfce7', text: '#166534', border: '#86efac' },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function RotaPage() {
  const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [addShiftDate, setAddShiftDate] = useState<string | null>(null);
  const [showAdvisory, setShowAdvisory] = useState(false);

  const weekKey = format(selectedWeek, 'yyyy-MM-dd');
  const { data: schedules = [] } = useSchedules();
  const createSchedule = useCreateSchedule();
  const publishSchedule = usePublishSchedule();

  const currentSchedule = schedules.find((s: any) => format(new Date(s.week_start), 'yyyy-MM-dd') === weekKey);
  const { data: schedule } = useSchedule(currentSchedule?.id || '');
  const { data: advisory } = useScheduleAdvisory(currentSchedule?.id || '');
  const removeAssignment = useRemoveAssignment(currentSchedule?.id || '');

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(selectedWeek, i));

  const assignmentsByDate: Record<string, any[]> = {};
  for (const a of schedule?.assignments || []) {
    const key = format(new Date(a.shift_date), 'yyyy-MM-dd');
    assignmentsByDate[key] = [...(assignmentsByDate[key] || []), a];
  }

  const warnings = advisory?.warnings || [];
  const understaffed = warnings.filter((w: any) => w.level === 'understaffed');
  const overstaffed = warnings.filter((w: any) => w.level === 'overstaffed');

  return (
    <div className="page" style={{ maxWidth: '100%' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rota</h1>
          <p className="page-sub">Week of {format(selectedWeek, 'dd MMMM yyyy')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setSelectedWeek(subWeeks(selectedWeek, 1))}>← Prev</button>
          <button onClick={() => setSelectedWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This week</button>
          <button onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))}>Next →</button>

          {!currentSchedule && (
            <button className="btn-primary" disabled={createSchedule.isPending}
              onClick={() => createSchedule.mutate({ week_start: weekKey })}>
              {createSchedule.isPending ? 'Creating…' : '+ Create schedule'}
            </button>
          )}
          {currentSchedule?.status === 'draft' && (
            <button className="btn-gold" onClick={() => publishSchedule.mutate(currentSchedule.id)}>
              Publish schedule
            </button>
          )}
          {currentSchedule?.status === 'published' && (
            <span className="badge badge-green">Published</span>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div
            onClick={() => setShowAdvisory(true)}
            style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#C41E3A', color: 'white', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#9e1830' }}>
                {understaffed.length > 0 && `${understaffed.length} understaffed shift${understaffed.length > 1 ? 's' : ''}`}
                {understaffed.length > 0 && overstaffed.length > 0 && ' · '}
                {overstaffed.length > 0 && `${overstaffed.length} overstaffed shift${overstaffed.length > 1 ? 's' : ''}`}
              </span>
              <span style={{ fontSize: '12px', color: '#c45a6e', marginLeft: '8px' }}>Click to review all warnings</span>
            </div>
            <span style={{ fontSize: '12px', color: '#9e1830' }}>View →</span>
          </div>
        </div>
      )}

      {!currentSchedule ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>No schedule for this week.</p>
          <button className="btn-primary" onClick={() => createSchedule.mutate({ week_start: weekKey })}>
            Create schedule
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '800px' }}>
            <thead>
              <tr>
                {weekDates.map((date, i) => {
                  const key = format(date, 'yyyy-MM-dd');
                  const isToday = key === format(new Date(), 'yyyy-MM-dd');
                  const hasWarn = warnings.some((w: any) => w.date === key);
                  return (
                    <th key={i} style={{
                      padding: '10px 8px',
                      textAlign: 'center',
                      fontWeight: 500,
                      fontSize: '13px',
                      borderBottom: `2px solid ${isToday ? '#C41E3A' : 'var(--color-border-tertiary)'}`,
                      color: isToday ? '#C41E3A' : hasWarn ? '#9e1830' : 'var(--color-text-primary)',
                      background: isToday ? '#fde8ec' : hasWarn ? '#fff5f6' : 'transparent',
                      borderRadius: isToday ? '8px 8px 0 0' : 0,
                    }}>
                      <div>{DAYS[i]}</div>
                      <div style={{ fontSize: '11px', fontWeight: 400, color: isToday ? '#C41E3A' : 'var(--color-text-secondary)' }}>
                        {format(date, 'd MMM')}
                      </div>
                      {hasWarn && <div style={{ fontSize: '9px', color: '#C41E3A', marginTop: '2px' }}>⚠ warning</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                {weekDates.map((date, i) => {
                  const key = format(date, 'yyyy-MM-dd');
                  const dayAssignments = assignmentsByDate[key] || [];
                  const isPublished = currentSchedule.status === 'published';
                  return (
                    <td key={i} style={{ verticalAlign: 'top', padding: '6px', borderRight: '0.5px solid var(--color-border-tertiary)', minWidth: '110px' }}>
                      {dayAssignments.map((a: any) => {
                        const colors = SHIFT_COLORS[a.shift_type] || SHIFT_COLORS.morning;
                        return (
                          <div key={a.id} style={{ background: colors.bg, border: `0.5px solid ${colors.border}`, borderRadius: '7px', padding: '6px 8px', marginBottom: '4px', position: 'relative' }}>
                            <div style={{ fontWeight: 500, color: colors.text, fontSize: '12px', paddingRight: '14px' }}>
                              {a.first_name} {a.last_name}
                            </div>
                            <div style={{ fontSize: '11px', color: colors.text, opacity: 0.8 }}>{a.role_name}</div>
                            <div style={{ fontSize: '10px', color: colors.text, opacity: 0.65, marginTop: '1px' }}>
                              {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)}
                            </div>
                            {!isPublished && (
                              <button
                                onClick={() => removeAssignment.mutate(a.id)}
                                style={{ position: 'absolute', top: '4px', right: '4px', background: 'none', border: 'none', cursor: 'pointer', color: colors.text, opacity: 0.5, fontSize: '13px', padding: '1px', lineHeight: 1 }}
                              >×</button>
                            )}
                          </div>
                        );
                      })}
                      {!isPublished && (
                        <button
                          onClick={() => setAddShiftDate(key)}
                          style={{ width: '100%', marginTop: '2px', padding: '5px', fontSize: '11px', cursor: 'pointer', background: 'transparent', border: '0.5px dashed var(--color-border-secondary)', borderRadius: '6px', color: 'var(--color-text-tertiary)' }}
                        >
                          + Add
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {addShiftDate && currentSchedule && (
        <AssignShiftModal
          scheduleId={currentSchedule.id}
          date={addShiftDate}
          onClose={() => setAddShiftDate(null)}
        />
      )}

      {showAdvisory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 500 }}>Staffing warnings ({warnings.length})</h3>
              <button onClick={() => setShowAdvisory(false)} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#888', cursor: 'pointer' }}>×</button>
            </div>

            {understaffed.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#9e1830', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>
                  Understaffed ({understaffed.length})
                </div>
                {understaffed.map((w: any, i: number) => (
                  <div key={i} style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 12px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#9e1830', marginBottom: '2px' }}>{w.shift_name} — {w.date}</div>
                    <div style={{ fontSize: '12px', color: '#b84a5e' }}>{w.message}</div>
                  </div>
                ))}
              </div>
            )}

            {overstaffed.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#633806', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>
                  Overstaffed ({overstaffed.length})
                </div>
                {overstaffed.map((w: any, i: number) => (
                  <div key={i} style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 12px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#633806', marginBottom: '2px' }}>{w.shift_name} — {w.date}</div>
                    <div style={{ fontSize: '12px', color: '#854f0b' }}>{w.message}</div>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setShowAdvisory(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
