import React from 'react';

interface Props {
  assignment: any;
  isPublished: boolean;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

const SHIFT_COLORS: Record<string, { bg: string; text: string; border: string; label: string; labelBg: string }> = {
  morning:   { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', label: 'Opening',  labelBg: '#bfdbfe' },
  afternoon: { bg: '#fef9c3', text: '#854d0e', border: '#fde047', label: 'Mid',      labelBg: '#fef08a' },
  evening:   { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd', label: 'Closing',  labelBg: '#ddd6fe' },
  full_day:  { bg: '#dcfce7', text: '#166534', border: '#86efac', label: 'Full day', labelBg: '#bbf7d0' },
};

function getShiftLabel(shiftType: string, startTime: string): string {
  // Use start time to determine opener vs closer more precisely
  if (!startTime) return SHIFT_COLORS[shiftType]?.label ?? 'Shift';
  const hour = parseInt(startTime.split(':')[0], 10);
  if (hour < 12) return 'Opening';
  if (hour < 16) return 'Mid';
  return 'Closing';
}

export function ShiftCard({ assignment, isPublished, onRemove, onDragStart, onDragEnd }: Props) {
  const colors = SHIFT_COLORS[assignment.shift_type] || SHIFT_COLORS.morning;
  const label = getShiftLabel(assignment.shift_type, assignment.start_time);
  const startStr = assignment.start_time?.slice(0, 5) ?? '';
  const endStr = assignment.end_time?.slice(0, 5) ?? '';

  return (
    <div
      draggable={!isPublished}
      onDragStart={!isPublished ? onDragStart : undefined}
      onDragEnd={!isPublished ? onDragEnd : undefined}
      style={{
        background: colors.bg,
        border: `0.5px solid ${colors.border}`,
        borderRadius: '7px',
        padding: '5px 7px',
        marginBottom: '4px',
        position: 'relative',
        cursor: isPublished ? 'default' : 'grab',
        userSelect: 'none',
      }}
    >
      {/* Shift type label pill */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: colors.labelBg,
        borderRadius: '4px',
        padding: '1px 5px',
        fontSize: '9px',
        fontWeight: 600,
        color: colors.text,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: '3px',
      }}>
        {label}
      </div>

      {/* Name */}
      <div style={{ fontWeight: 500, color: colors.text, fontSize: '12px', paddingRight: '14px', lineHeight: 1.2 }}>
        {assignment.first_name} {assignment.last_name}
      </div>

      {/* Role */}
      <div style={{ fontSize: '10px', color: colors.text, opacity: 0.75, marginTop: '1px' }}>
        {assignment.role_name}
      </div>

      {/* Times */}
      <div style={{
        fontSize: '10px',
        color: colors.text,
        opacity: 0.6,
        marginTop: '2px',
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
      }}>
        <span>{startStr}</span>
        {endStr && endStr !== startStr && (
          <>
            <span style={{ opacity: 0.6 }}>–</span>
            <span>{endStr}</span>
          </>
        )}
      </div>

      {!isPublished && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Remove shift"
          style={{
            position: 'absolute', top: '4px', right: '5px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.text, opacity: 0.45, fontSize: '14px',
            padding: '0', lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  );
}
