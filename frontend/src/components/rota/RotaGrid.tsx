import React, { useMemo } from 'react';
import { format, addDays, parseISO } from 'date-fns';
import { useSchedule, useRemoveAssignment, useScheduleAdvisory } from '../../hooks/useRota';

interface RotaGridProps {
  scheduleId: string;
  onAddShift?: (date: string) => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHIFT_COLORS: Record<string, string> = {
  morning: '#dbeafe',
  afternoon: '#fef9c3',
  evening: '#ede9fe',
  full_day: '#dcfce7',
};
const SHIFT_TEXT_COLORS: Record<string, string> = {
  morning: '#1e40af',
  afternoon: '#854d0e',
  evening: '#5b21b6',
  full_day: '#166534',
};

export function RotaGrid({ scheduleId, onAddShift }: RotaGridProps) {
  const { data: schedule, isLoading, error } = useSchedule(scheduleId);
  const { data: advisory } = useScheduleAdvisory(scheduleId);
  const removeAssignment = useRemoveAssignment(scheduleId);

  const weekDates = useMemo(() => {
    if (!schedule?.week_start) return [];
    const start = parseISO(schedule.week_start);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [schedule?.week_start]);

  // Build a map: dateKey → assignments[]
  const assignmentsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const a of schedule?.assignments || []) {
      const key = format(new Date(a.shift_date), 'yyyy-MM-dd');
      map[key] = [...(map[key] || []), a];
    }
    return map;
  }, [schedule?.assignments]);

  // Build warning set for quick lookup: "date|shift_id|role"
  const warningSet = useMemo(() => {
    const set = new Set<string>();
    for (const w of advisory?.warnings || []) {
      set.add(`${w.date}|${w.level}`);
    }
    return set;
  }, [advisory]);

  if (isLoading) return <div style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>Loading schedule…</div>;
  if (error) return <div style={{ padding: '2rem', color: 'var(--color-text-danger)' }}>Failed to load schedule.</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Advisory Warnings Banner */}
      {advisory?.warnings?.length > 0 && (
        <div style={{
          background: 'var(--color-background-warning)',
          border: '0.5px solid var(--color-border-warning)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          fontSize: '13px',
          color: 'var(--color-text-warning)',
        }}>
          <strong>Staffing Warnings ({advisory.warnings.length})</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
            {advisory.warnings.slice(0, 5).map((w: any, i: number) => (
              <li key={i}>{w.message} — {w.date}</li>
            ))}
            {advisory.warnings.length > 5 && (
              <li>…and {advisory.warnings.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Grid */}
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        fontSize: '13px',
      }}>
        <thead>
          <tr>
            {weekDates.map((date, i) => {
              const dateKey = format(date, 'yyyy-MM-dd');
              const hasWarning = [...warningSet].some(k => k.startsWith(dateKey));
              return (
                <th key={i} style={{
                  padding: '8px 6px',
                  textAlign: 'center',
                  fontWeight: 500,
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  color: hasWarning ? 'var(--color-text-warning)' : 'var(--color-text-primary)',
                  background: hasWarning ? 'var(--color-background-warning)' : 'transparent',
                }}>
                  <div>{DAYS[i]}</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>
                    {format(date, 'd MMM')}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            {weekDates.map((date, i) => {
              const dateKey = format(date, 'yyyy-MM-dd');
              const dayAssignments = assignmentsByDate[dateKey] || [];

              return (
                <td key={i} style={{
                  verticalAlign: 'top',
                  padding: '6px',
                  borderRight: '0.5px solid var(--color-border-tertiary)',
                  minHeight: '120px',
                  minWidth: '110px',
                }}>
                  {dayAssignments.length === 0 ? (
                    <div style={{
                      color: 'var(--color-text-tertiary)',
                      fontSize: '11px',
                      textAlign: 'center',
                      padding: '8px 0',
                    }}>
                      No shifts
                    </div>
                  ) : (
                    dayAssignments.map((a: any) => (
                      <ShiftCard
                        key={a.id}
                        assignment={a}
                        isPublished={schedule?.status === 'published'}
                        onRemove={() => removeAssignment.mutate(a.id)}
                      />
                    ))
                  )}

                  {schedule?.status !== 'published' && onAddShift && (
                    <button
                      onClick={() => onAddShift(dateKey)}
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        padding: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        background: 'transparent',
                        border: '0.5px dashed var(--color-border-secondary)',
                        borderRadius: '4px',
                        color: 'var(--color-text-tertiary)',
                      }}
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
  );
}

function ShiftCard({ assignment, isPublished, onRemove }: {
  assignment: any;
  isPublished: boolean;
  onRemove: () => void;
}) {
  const bg = SHIFT_COLORS[assignment.shift_type] || '#f1f5f9';
  const color = SHIFT_TEXT_COLORS[assignment.shift_type] || '#334155';

  return (
    <div style={{
      background: bg,
      border: `0.5px solid ${color}40`,
      borderRadius: '6px',
      padding: '5px 7px',
      marginBottom: '4px',
      position: 'relative',
    }}>
      <div style={{ fontWeight: 500, color, fontSize: '12px' }}>
        {assignment.first_name} {assignment.last_name}
      </div>
      <div style={{ fontSize: '11px', color: `${color}cc`, marginTop: '1px' }}>
        {assignment.role_name}
      </div>
      <div style={{ fontSize: '10px', color: `${color}99`, marginTop: '1px' }}>
        {assignment.start_time?.slice(0, 5)} – {assignment.end_time?.slice(0, 5)}
      </div>
      {!isPublished && (
        <button
          onClick={onRemove}
          title="Remove shift"
          style={{
            position: 'absolute',
            top: '3px',
            right: '4px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: `${color}99`,
            fontSize: '12px',
            lineHeight: 1,
            padding: '2px',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
