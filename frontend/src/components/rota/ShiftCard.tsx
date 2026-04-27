import React from 'react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';

interface Props {
  assignment: any;
  actual?: any;           // shift_actual row if it exists
  isPublished: boolean;
  isPastDay: boolean;     // true if shift_date < today
  selectMode: boolean;
  isSelected: boolean;
  onRemove: () => void;
  onConfirmFinish: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

const SHIFT_COLORS: Record<string, { bg: string; text: string; border: string; labelBg: string }> = {
  morning:   { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', labelBg: '#bfdbfe' },
  afternoon: { bg: '#fef9c3', text: '#854d0e', border: '#fde047', labelBg: '#fef08a' },
  evening:   { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd', labelBg: '#ddd6fe' },
  full_day:  { bg: '#dcfce7', text: '#166534', border: '#86efac', labelBg: '#bbf7d0' },
};

function shiftLabel(shiftType: string, startTime: string): string {
  const hour = parseInt((startTime || '').split(':')[0], 10);
  if (hour < 12) return 'Opening';
  if (hour < 16) return 'Mid';
  return 'Closing';
}

export function ShiftCard({
  assignment, actual, isPublished, isPastDay, selectMode, isSelected,
  onRemove, onConfirmFinish, onDragStart, onDragEnd,
}: Props) {
  const colors = SHIFT_COLORS[assignment.shift_type] || SHIFT_COLORS.morning;
  const label = shiftLabel(assignment.shift_type, assignment.start_time || '');
  const startStr = assignment.start_time?.slice(0, 5) ?? '';
  const endStr   = assignment.end_time?.slice(0, 5) ?? '';

  const isConfirmed = actual?.is_confirmed === true;
  const needsConfirmation = isPastDay && !isConfirmed;

  // Border override for confirmation state
  const borderColor = isConfirmed
    ? '#97c459'
    : needsConfirmation
      ? '#ef9f27'
      : colors.border;

  const bgColor = isConfirmed
    ? colors.bg
    : needsConfirmation
      ? colors.bg  // keep original colour, just change border + badge
      : colors.bg;

  return (
    <div
      draggable={!isPublished && !selectMode}
      onDragStart={!isPublished && !selectMode ? onDragStart : undefined}
      onDragEnd={!isPublished && !selectMode ? onDragEnd : undefined}
      style={{
        background: bgColor,
        border: `0.5px solid ${borderColor}`,
        borderRadius: '7px',
        padding: '5px 7px',
        marginBottom: '4px',
        position: 'relative',
        cursor: isPublished ? 'default' : selectMode ? 'pointer' : 'grab',
        userSelect: 'none',
        outline: isSelected ? '2px solid #C41E3A' : 'none',
        outlineOffset: '1px',
        opacity: selectMode && !isSelected ? 0.6 : 1,
        transition: 'opacity 0.1s, outline 0.1s',
      }}
    >
      {/* Shift type label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          background: colors.labelBg, borderRadius: '4px',
          padding: '1px 5px', fontSize: '9px', fontWeight: 600,
          color: colors.text, textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {label}
        </div>

        {/* Confirmation status badge */}
        {isPastDay && !selectMode && (
          isConfirmed ? (
            <div
              title={`Confirmed: ${actual.actual_start?.slice(0,5)} – ${actual.actual_end?.slice(0,5)} (${actual.actual_hours}h)`}
              style={{ fontSize: '11px', cursor: 'pointer', lineHeight: 1 }}
              onClick={(e) => { e.stopPropagation(); onConfirmFinish(); }}
            >
              ✓
            </div>
          ) : (
            <div
              onClick={(e) => { e.stopPropagation(); onConfirmFinish(); }}
              title="Click to confirm finish time"
              style={{
                fontSize: '9px', fontWeight: 600, color: '#633806',
                background: '#faeeda', border: '0.5px solid #ef9f27',
                borderRadius: '4px', padding: '1px 5px', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ⚠ confirm
            </div>
          )
        )}
      </div>

      {/* Name */}
      <div style={{ fontWeight: 500, color: colors.text, fontSize: '12px', paddingRight: '14px', lineHeight: 1.2 }}>
        {assignment.first_name} {assignment.last_name}
      </div>

      {/* Role */}
      <div style={{ fontSize: '10px', color: colors.text, opacity: 0.75, marginTop: '1px' }}>
        {assignment.role_name}
      </div>

      {/* Times — show actual if confirmed, scheduled otherwise */}
      <div style={{ fontSize: '10px', color: colors.text, opacity: 0.65, marginTop: '2px' }}>
        {isConfirmed ? (
          <span title="Actual hours worked">
            {actual.actual_start?.slice(0,5)} – {actual.actual_end?.slice(0,5)}
            <span style={{ marginLeft: '4px', color: '#27500a', opacity: 1 }}>({actual.actual_hours}h)</span>
          </span>
        ) : (
          <span>
            {startStr}{endStr ? ` – ${endStr}` : ''}
          </span>
        )}
      </div>

      {/* Remove button — only in edit mode, not in select mode */}
      {!isPublished && !selectMode && (
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
