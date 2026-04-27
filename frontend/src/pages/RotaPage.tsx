import React, { useState, useRef } from 'react';
import { format, addDays, startOfWeek, addWeeks, subWeeks, parseISO } from 'date-fns';
import {
  useSchedules, useSchedule, useRemoveAssignment,
  useScheduleAdvisory, useCreateSchedule, usePublishSchedule, useAddAssignment
} from '../hooks/useRota';
import { AssignShiftModal } from '../components/rota/AssignShiftModal';
import { WarningsModal } from '../components/shared/WarningsModal';
import { ConfirmModal } from '../components/shared/ConfirmModal';
import { schedulesApi } from '../api/index';
import { useQueryClient } from '@tanstack/react-query';

const SHIFT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  morning:   { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  afternoon: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  evening:   { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  full_day:  { bg: '#dcfce7', text: '#166534', border: '#86efac' },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function RotaPage() {
  const qc = useQueryClient();
  const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [addShiftDate, setAddShiftDate] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);

  // Confirm remove
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);

  // Drag state
  const dragItem = useRef<any>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<{
    assignmentId: string; employeeName: string; shiftName: string;
    fromDate: string; toDate: string; scheduleId: string;
  } | null>(null);

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

  function friendlyDate(d: string) {
    try { return format(parseISO(d), 'EEEE d MMM'); } catch { return d; }
  }

  // Drag handlers
  function handleDragStart(e: React.DragEvent, assignment: any) {
    dragItem.current = assignment;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, dateKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(dateKey);
  }

  function handleDrop(e: React.DragEvent, toDateKey: string) {
    e.preventDefault();
    setDragOver(null);
    const a = dragItem.current;
    if (!a || !currentSchedule) return;
    const fromDate = format(new Date(a.shift_date), 'yyyy-MM-dd');
    if (fromDate === toDateKey) return;

    setConfirmMove({
      assignmentId: a.id,
      employeeName: `${a.first_name} ${a.last_name}`,
      shiftName: a.shift_name,
      fromDate,
      toDate: toDateKey,
      scheduleId: currentSchedule.id,
    });
    dragItem.current = null;
  }

  async function executeMove() {
    if (!confirmMove) return;
    try {
      // Remove old assignment and create new one with the new date
      await schedulesApi.removeAssignment(confirmMove.scheduleId, confirmMove.assignmentId);
      const assignment = schedule?.assignments?.find((a: any) => a.id === confirmMove.assignmentId);
      if (assignment) {
        await schedulesApi.addAssignment(confirmMove.scheduleId, {
          employee_id: assignment.employee_id,
          shift_id: assignment.shift_id,
          shift_date: confirmMove.toDate,
        });
      }
      qc.invalidateQueries({ queryKey: ['schedules', confirmMove.scheduleId] });
      qc.invalidateQueries({ queryKey: ['schedules', confirmMove.scheduleId, 'advisory'] });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Could not move shift — there may be a conflict.');
    } finally {
      setConfirmMove(null);
    }
  }

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
        <div
          onClick={() => setShowWarnings(true)}
          style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '1rem' }}
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
          <span style={{ fontSize: '12px', color: '#9e1830', fontWeight: 500 }}>View all →</span>
        </div>
      )}

      {currentSchedule?.status !== 'published' && (
        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>💡</span> Drag shift cards between days to move them. Click × to remove.
        </div>
      )}

      {!currentSchedule ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>No schedule for this week yet.</p>
          <button className="btn-primary" onClick={() => createSchedule.mutate({ week_start: weekKey })}>Create schedule</button>
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
                      padding: '10px 8px', textAlign: 'center', fontWeight: 500, fontSize: '13px',
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
                  const isDragTarget = dragOver === key;

                  return (
                    <td
                      key={i}
                      onDragOver={!isPublished ? (e) => handleDragOver(e, key) : undefined}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={!isPublished ? (e) => handleDrop(e, key) : undefined}
                      style={{
                        verticalAlign: 'top', padding: '6px',
                        borderRight: '0.5px solid var(--color-border-tertiary)',
                        minWidth: '110px',
                        background: isDragTarget ? '#f0f7ff' : 'transparent',
                        outline: isDragTarget ? '2px dashed #93c5fd' : 'none',
                        transition: 'background 0.1s',
                        borderRadius: '4px',
                      }}
                    >
                      {dayAssignments.map((a: any) => {
                        const colors = SHIFT_COLORS[a.shift_type] || SHIFT_COLORS.morning;
                        return (
                          <div
                            key={a.id}
                            draggable={!isPublished}
                            onDragStart={!isPublished ? (e) => handleDragStart(e, a) : undefined}
                            style={{
                              background: colors.bg, border: `0.5px solid ${colors.border}`,
                              borderRadius: '7px', padding: '6px 8px', marginBottom: '4px',
                              position: 'relative', cursor: isPublished ? 'default' : 'grab',
                              userSelect: 'none',
                            }}
                          >
                            <div style={{ fontWeight: 500, color: colors.text, fontSize: '12px', paddingRight: '14px' }}>
                              {a.first_name} {a.last_name}
                            </div>
                            <div style={{ fontSize: '11px', color: colors.text, opacity: 0.8 }}>{a.role_name}</div>
                            <div style={{ fontSize: '10px', color: colors.text, opacity: 0.65, marginTop: '1px' }}>
                              {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)}
                            </div>
                            {!isPublished && (
                              <button
                                onClick={() => setConfirmRemove({ id: a.id, name: `${a.first_name} ${a.last_name}` })}
                                style={{ position: 'absolute', top: '4px', right: '4px', background: 'none', border: 'none', cursor: 'pointer', color: colors.text, opacity: 0.5, fontSize: '13px', padding: '1px', lineHeight: 1 }}
                                title="Remove shift"
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

      {/* Assign shift modal */}
      {addShiftDate && currentSchedule && (
        <AssignShiftModal scheduleId={currentSchedule.id} date={addShiftDate} onClose={() => setAddShiftDate(null)} />
      )}

      {/* Warnings modal */}
      {showWarnings && <WarningsModal warnings={warnings} onClose={() => setShowWarnings(false)} />}

      {/* Confirm remove modal */}
      {confirmRemove && (
        <ConfirmModal
          title="Remove shift?"
          message={`Are you sure you want to remove ${confirmRemove.name} from this shift? This cannot be undone.`}
          confirmLabel="Remove"
          cancelLabel="Keep"
          danger
          onConfirm={() => { removeAssignment.mutate(confirmRemove.id); setConfirmRemove(null); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {/* Confirm drag-and-drop move modal */}
      {confirmMove && (
        <ConfirmModal
          title="Move shift?"
          message={`Move ${confirmMove.employeeName}'s ${confirmMove.shiftName} shift from ${friendlyDate(confirmMove.fromDate)} to ${friendlyDate(confirmMove.toDate)}?`}
          confirmLabel="Move shift"
          cancelLabel="Cancel"
          onConfirm={executeMove}
          onCancel={() => setConfirmMove(null)}
        />
      )}
    </div>
  );
}
