import React, { useState, useRef } from 'react';
import { format, addDays, startOfWeek, addWeeks, subWeeks, parseISO } from 'date-fns';
import {
  useSchedules, useSchedule, useRemoveAssignment,
  useScheduleAdvisory, useCreateSchedule, usePublishSchedule
} from '../hooks/useRota';
import { useClosedDays } from '../hooks/useRotaConfig';
import { AssignShiftModal } from '../components/rota/AssignShiftModal';
import { WarningsModal } from '../components/shared/WarningsModal';
import { ConfirmModal } from '../components/shared/ConfirmModal';
import { ShiftCard } from '../components/rota/ShiftCard';
import { schedulesApi } from '../api/index';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function friendlyDate(d: string) {
  try { return format(parseISO(d), 'EEEE d MMM'); } catch { return d; }
}

export function RotaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [addShiftDate, setAddShiftDate] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string; shiftName: string; date: string } | null>(null);
  const [confirmMove, setConfirmMove] = useState<{
    assignmentId: string; employeeName: string; shiftName: string;
    fromDate: string; toDate: string; scheduleId: string;
    employeeId: string; shiftId: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragItem = useRef<any>(null);
  const [moving, setMoving] = useState(false);

  const weekKey = format(selectedWeek, 'yyyy-MM-dd');
  const weekEnd = format(addDays(selectedWeek, 6), 'yyyy-MM-dd');

  const { data: schedules = [] } = useSchedules();
  const { data: closedDaysData = [] } = useClosedDays(weekKey, weekEnd);
  const createSchedule = useCreateSchedule();
  const publishSchedule = usePublishSchedule();

  const closedDates = new Set(closedDaysData.map((c: any) =>
    (c.closed_date?.split?.('T')?.[0] || c.closed_date) as string
  ));

  const currentSchedule = schedules.find(
    (s: any) => format(new Date(s.week_start), 'yyyy-MM-dd') === weekKey
  );

  const { data: schedule } = useSchedule(currentSchedule?.id || '');
  const { data: advisory } = useScheduleAdvisory(currentSchedule?.id || '');
  const removeAssignment = useRemoveAssignment(currentSchedule?.id || '');

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(selectedWeek, i));

  // Group and sort assignments by date, then by shift start time
  const assignmentsByDate: Record<string, any[]> = {};
  for (const a of schedule?.assignments || []) {
    const key = format(new Date(a.shift_date), 'yyyy-MM-dd');
    if (!assignmentsByDate[key]) assignmentsByDate[key] = [];
    assignmentsByDate[key].push(a);
  }
  // Sort each day's assignments: earliest start first
  for (const key of Object.keys(assignmentsByDate)) {
    assignmentsByDate[key].sort((a, b) => {
      const aMin = a.start_time ? parseInt(a.start_time.replace(':', '')) : 0;
      const bMin = b.start_time ? parseInt(b.start_time.replace(':', '')) : 0;
      return aMin - bMin;
    });
  }

  const warnings = advisory?.warnings || [];
  const understaffed = warnings.filter((w: any) => w.level === 'understaffed');
  const overstaffed = warnings.filter((w: any) => w.level === 'overstaffed');

  function handleDragStart(e: React.DragEvent, assignment: any) {
    dragItem.current = assignment;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd(e: React.DragEvent) {
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1';
    setDragOver(null);
  }

  function handleDrop(e: React.DragEvent, toDateKey: string) {
    e.preventDefault();
    setDragOver(null);
    const a = dragItem.current;
    if (!a || !currentSchedule) return;
    const fromDate = format(new Date(a.shift_date), 'yyyy-MM-dd');
    if (fromDate === toDateKey || closedDates.has(toDateKey)) return;
    setConfirmMove({
      assignmentId: a.id, employeeName: `${a.first_name} ${a.last_name}`,
      shiftName: a.shift_name, fromDate, toDate: toDateKey,
      scheduleId: currentSchedule.id, employeeId: a.employee_id, shiftId: a.shift_id,
    });
    dragItem.current = null;
  }

  async function executeMove() {
    if (!confirmMove) return;
    setMoving(true);
    try {
      await schedulesApi.removeAssignment(confirmMove.scheduleId, confirmMove.assignmentId);
      await schedulesApi.addAssignment(confirmMove.scheduleId, {
        employee_id: confirmMove.employeeId,
        shift_id: confirmMove.shiftId,
        shift_date: confirmMove.toDate,
      });
      qc.invalidateQueries({ queryKey: ['schedules', confirmMove.scheduleId] });
      qc.invalidateQueries({ queryKey: ['schedules', confirmMove.scheduleId, 'advisory'] });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Could not move shift — scheduling conflict detected.');
    } finally {
      setMoving(false);
      setConfirmMove(null);
    }
  }

  const isPublished = currentSchedule?.status === 'published';

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
          <button onClick={() => navigate('/rota-config')} style={{ fontSize: '12px' }}>⚙ Configure</button>
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
          {isPublished && <span className="badge badge-green">Published</span>}
        </div>
      </div>

      {/* Shift legend */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Opening', bg: '#bfdbfe', text: '#1e40af' },
          { label: 'Mid', bg: '#fef08a', text: '#854d0e' },
          { label: 'Closing', bg: '#ddd6fe', text: '#5b21b6' },
          { label: 'Full day', bg: '#bbf7d0', text: '#166534' },
        ].map(({ label, bg, text }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: bg, border: `0.5px solid ${text}40` }} />
            {label}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
          Sorted earliest → latest within each day
        </div>
      </div>

      {warnings.length > 0 && (
        <div onClick={() => setShowWarnings(true)} style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '1rem' }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#C41E3A', color: 'white', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#9e1830' }}>
              {understaffed.length > 0 && `${understaffed.length} understaffed`}
              {understaffed.length > 0 && overstaffed.length > 0 && ' · '}
              {overstaffed.length > 0 && `${overstaffed.length} overstaffed`}
            </span>
            <span style={{ fontSize: '12px', color: '#c45a6e', marginLeft: '8px' }}>Click to review</span>
          </div>
          <span style={{ fontSize: '12px', color: '#9e1830', fontWeight: 500 }}>View all →</span>
        </div>
      )}

      {closedDates.size > 0 && (
        <div style={{ background: '#f7f6f3', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '8px 14px', marginBottom: '1rem', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
          🔒 {closedDates.size} day{closedDates.size !== 1 ? 's' : ''} this week marked as closed
        </div>
      )}

      {!isPublished && currentSchedule && (
        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '0.75rem' }}>
          💡 Drag shift cards between days to move · Click × to remove
        </div>
      )}

      {!currentSchedule ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>No schedule for this week yet.</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => createSchedule.mutate({ week_start: weekKey })}>Create manually</button>
            <button className="btn-gold" onClick={() => navigate('/rota-config')}>Auto-generate →</button>
          </div>
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
                  const isClosed = closedDates.has(key);
                  const closedInfo = closedDaysData.find((c: any) => (c.closed_date?.split?.('T')?.[0] || c.closed_date) === key);
                  const dayCount = assignmentsByDate[key]?.length ?? 0;

                  return (
                    <th key={i} style={{
                      padding: '10px 8px', textAlign: 'center', fontWeight: 500, fontSize: '13px',
                      borderBottom: `2px solid ${isClosed ? '#d0cec6' : isToday ? '#C41E3A' : 'var(--color-border-tertiary)'}`,
                      color: isClosed ? '#b0aea6' : isToday ? '#C41E3A' : hasWarn ? '#9e1830' : 'var(--color-text-primary)',
                      background: isClosed ? '#f0efe8' : isToday ? '#fde8ec' : hasWarn ? '#fff5f6' : 'transparent',
                      borderRadius: isToday ? '8px 8px 0 0' : 0,
                    }}>
                      <div>{DAYS[i]}</div>
                      <div style={{ fontSize: '11px', fontWeight: 400, color: isClosed ? '#b0aea6' : isToday ? '#C41E3A' : 'var(--color-text-secondary)' }}>
                        {format(date, 'd MMM')}
                      </div>
                      {isClosed && <div style={{ fontSize: '9px', color: '#b0aea6', marginTop: '2px' }}>🔒 {closedInfo?.reason?.replace('Bank Holiday — ', '') || 'Closed'}</div>}
                      {!isClosed && hasWarn && <div style={{ fontSize: '9px', color: '#C41E3A', marginTop: '2px' }}>⚠ warning</div>}
                      {!isClosed && dayCount > 0 && <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{dayCount} staff</div>}
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
                  const isClosed = closedDates.has(key);
                  const isDragTarget = dragOver === key && !isClosed;

                  return (
                    <td key={i}
                      onDragOver={!isPublished && !isClosed ? (e) => { e.preventDefault(); setDragOver(key); } : undefined}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
                      onDrop={!isPublished && !isClosed ? (e) => handleDrop(e, key) : undefined}
                      style={{
                        verticalAlign: 'top', padding: '6px',
                        borderRight: '0.5px solid var(--color-border-tertiary)',
                        minWidth: '120px', minHeight: '80px',
                        background: isClosed
                          ? 'repeating-linear-gradient(45deg,#f0efe8,#f0efe8 4px,#f7f6f3 4px,#f7f6f3 12px)'
                          : isDragTarget ? '#eef6ff' : 'transparent',
                        outline: isDragTarget ? '2px dashed #93c5fd' : 'none',
                        outlineOffset: '-2px',
                        borderRadius: '4px',
                        transition: 'background 0.1s',
                        position: 'relative',
                      }}
                    >
                      {isClosed && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                          <span style={{ fontSize: '11px', color: '#b0aea6', fontWeight: 500 }}>Closed</span>
                        </div>
                      )}

                      {!isClosed && dayAssignments.map((a: any) => (
                        <ShiftCard
                          key={a.id}
                          assignment={a}
                          isPublished={isPublished}
                          onRemove={() => setConfirmRemove({ id: a.id, name: `${a.first_name} ${a.last_name}`, shiftName: a.shift_name, date: format(new Date(a.shift_date), 'EEEE d MMM') })}
                          onDragStart={(e) => handleDragStart(e, a)}
                          onDragEnd={handleDragEnd}
                        />
                      ))}

                      {!isPublished && !isClosed && (
                        <button onClick={() => setAddShiftDate(key)} style={{ width: '100%', marginTop: '2px', padding: '5px', fontSize: '11px', cursor: 'pointer', background: 'transparent', border: '0.5px dashed var(--color-border-secondary)', borderRadius: '6px', color: 'var(--color-text-tertiary)' }}>
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
        <AssignShiftModal scheduleId={currentSchedule.id} date={addShiftDate} onClose={() => setAddShiftDate(null)} />
      )}
      {showWarnings && <WarningsModal warnings={warnings} onClose={() => setShowWarnings(false)} />}
      {confirmRemove && (
        <ConfirmModal
          title="Remove this shift?"
          message={`Remove ${confirmRemove.name} from the ${confirmRemove.shiftName} on ${confirmRemove.date}?`}
          confirmLabel="Remove shift" cancelLabel="Keep" danger
          onConfirm={() => { removeAssignment.mutate(confirmRemove.id); setConfirmRemove(null); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
      {confirmMove && (
        <ConfirmModal
          title="Move this shift?"
          message={`Move ${confirmMove.employeeName}'s ${confirmMove.shiftName} from ${friendlyDate(confirmMove.fromDate)} to ${friendlyDate(confirmMove.toDate)}?`}
          confirmLabel={moving ? 'Moving…' : 'Yes, move shift'} cancelLabel="Cancel"
          onConfirm={executeMove} onCancel={() => setConfirmMove(null)}
        />
      )}
    </div>
  );
}
