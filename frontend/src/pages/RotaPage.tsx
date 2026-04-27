import React, { useState } from 'react';
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { useSchedules, useCreateSchedule, usePublishSchedule } from '../hooks/useRota';
import { RotaGrid } from '../components/rota/RotaGrid';

export function RotaPage() {
  const [selectedWeek, setSelectedWeek] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [addShiftDate, setAddShiftDate] = useState<string | null>(null);

  const { data: schedules = [] } = useSchedules();
  const createSchedule = useCreateSchedule();
  const publishSchedule = usePublishSchedule();

  const weekKey = format(selectedWeek, 'yyyy-MM-dd');
  const currentSchedule = schedules.find((s: any) =>
    format(new Date(s.week_start), 'yyyy-MM-dd') === weekKey
  );

  const activeScheduleId = selectedScheduleId || currentSchedule?.id;

  const handleCreateSchedule = async () => {
    const result = await createSchedule.mutateAsync({ week_start: weekKey });
    setSelectedScheduleId(result.data.data.id);
  };

  const handlePublish = () => {
    if (activeScheduleId) publishSchedule.mutate(activeScheduleId);
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Staff Rota</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            Week of {format(selectedWeek, 'dd MMMM yyyy')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Week navigation */}
          <button onClick={() => setSelectedWeek(subWeeks(selectedWeek, 1))}>← Prev</button>
          <button onClick={() => setSelectedWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            This Week
          </button>
          <button onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))}>Next →</button>

          {!currentSchedule && (
            <button
              onClick={handleCreateSchedule}
              disabled={createSchedule.isPending}
              style={{
                background: 'var(--color-background-info)',
                color: 'var(--color-text-info)',
                border: '0.5px solid var(--color-border-info)',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {createSchedule.isPending ? 'Creating…' : 'Create Schedule'}
            </button>
          )}

          {currentSchedule?.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={publishSchedule.isPending}
              style={{
                background: 'var(--color-background-success)',
                color: 'var(--color-text-success)',
                border: '0.5px solid var(--color-border-success)',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Publish Schedule
            </button>
          )}

          {currentSchedule?.status === 'published' && (
            <span style={{
              background: 'var(--color-background-success)',
              color: 'var(--color-text-success)',
              border: '0.5px solid var(--color-border-success)',
              borderRadius: '6px',
              padding: '4px 12px',
              fontSize: '12px',
            }}>
              Published
            </span>
          )}
        </div>
      </div>

      {/* Rota grid */}
      {activeScheduleId ? (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: '12px',
          padding: '1rem',
        }}>
          <RotaGrid
            scheduleId={activeScheduleId}
            onAddShift={currentSchedule?.status !== 'published' ? setAddShiftDate : undefined}
          />
        </div>
      ) : (
        <div style={{
          background: 'var(--color-background-secondary)',
          borderRadius: '12px',
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: '14px',
        }}>
          No schedule exists for this week. Create one to start adding shifts.
        </div>
      )}

      {/* TODO: Add AssignShiftModal when addShiftDate is set */}
      {addShiftDate && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{
            background: 'var(--color-background-primary)',
            borderRadius: '12px',
            padding: '1.5rem',
            width: '360px',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 500, marginTop: 0 }}>
              Add Shift — {addShiftDate}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              AssignShiftForm component goes here. Selects employee + shift type, calls useAddAssignment().
            </p>
            <button onClick={() => setAddShiftDate(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
