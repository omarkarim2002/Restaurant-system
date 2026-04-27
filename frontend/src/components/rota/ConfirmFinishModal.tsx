import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';

interface Props {
  assignment: any;
  existing?: any; // existing shift_actual if already confirmed
  onSave: (data: { actual_end: string; actual_start?: string; notes?: string }) => Promise<void>;
  onUnconfirm?: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmFinishModal({ assignment, existing, onSave, onUnconfirm, onClose }: Props) {
  const scheduledStart = assignment.start_time?.slice(0, 5) ?? '';
  const scheduledEnd   = assignment.end_time?.slice(0, 5) ?? '';
  const isAlreadyConfirmed = !!existing?.is_confirmed;

  const [actualStart, setActualStart] = useState(
    existing?.actual_start?.slice(0, 5) ?? scheduledStart
  );
  const [actualEnd, setActualEnd] = useState(
    existing?.actual_end?.slice(0, 5) ?? scheduledEnd ?? ''
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Calculate preview hours
  function calcHours(start: string, end: string): number | null {
    if (!start || !end) return null;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let s = sh * 60 + sm;
    let e = eh * 60 + em;
    if (e < s) e += 24 * 60;
    return Math.round(((e - s) / 60) * 100) / 100;
  }

  const previewHours = calcHours(actualStart, actualEnd);
  const rate = parseFloat(assignment.hourly_rate) || 0;
  const previewWage = previewHours !== null ? previewHours * rate : null;

  async function handleSave() {
    if (!actualEnd) { setError('Please enter a finish time.'); return; }
    if (!previewHours || previewHours <= 0 || previewHours > 16) {
      setError('Hours seem incorrect — please check the times.'); return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ actual_end: actualEnd, actual_start: actualStart, notes: notes || undefined });
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnconfirm() {
    if (!onUnconfirm) return;
    setSaving(true);
    try {
      await onUnconfirm();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const dateDisplay = (() => {
    try { return format(parseISO(assignment.shift_date), 'EEEE d MMMM'); }
    catch { return assignment.shift_date; }
  })();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>
                {isAlreadyConfirmed ? 'Edit finish time' : 'Confirm finish time'}
              </h3>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                {assignment.first_name} {assignment.last_name} · {dateDisplay}
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '1.25rem 1.5rem' }}>
          {error && (
            <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>
              {error}
            </div>
          )}

          {/* Scheduled reference */}
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem', fontSize: '12px' }}>
            <div style={{ color: 'var(--color-text-tertiary)', marginBottom: '3px' }}>Scheduled</div>
            <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {scheduledStart || '?'} – {scheduledEnd || 'no end time set'}
            </div>
          </div>

          {/* Actual times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '5px' }}>
                Actual start
              </label>
              <input
                type="time"
                value={actualStart}
                onChange={e => setActualStart(e.target.value)}
                style={{ width: '100%', fontSize: '14px', padding: '8px 10px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '5px' }}>
                Actual finish *
              </label>
              <input
                type="time"
                value={actualEnd}
                onChange={e => setActualEnd(e.target.value)}
                style={{ width: '100%', fontSize: '14px', padding: '8px 10px', borderColor: !actualEnd ? '#f5b8c4' : undefined }}
                autoFocus
              />
            </div>
          </div>

          {/* Live preview */}
          {previewHours !== null && previewHours > 0 && (
            <div style={{
              background: previewHours > 0 && previewHours <= 16 ? '#eaf3de' : '#fde8ec',
              border: `0.5px solid ${previewHours > 0 && previewHours <= 16 ? '#97c459' : '#f5b8c4'}`,
              borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#27500a' }}>
                  {previewHours}h worked
                </div>
                {rate > 0 && (
                  <div style={{ fontSize: '11px', color: '#3d6b1a' }}>
                    £{previewWage?.toFixed(2)} at £{rate.toFixed(2)}/hr
                  </div>
                )}
              </div>
              {previewHours > 0 && previewHours <= 16 && (
                <span style={{ fontSize: '20px' }}>✓</span>
              )}
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '5px' }}>
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Left early — quiet evening"
              style={{ width: '100%', fontSize: '13px' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSave}
              disabled={saving || !actualEnd}
              style={{
                flex: 1, background: '#C41E3A', color: 'white', border: 'none',
                borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 500,
                cursor: saving || !actualEnd ? 'not-allowed' : 'pointer',
                opacity: saving || !actualEnd ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : isAlreadyConfirmed ? 'Update times' : 'Confirm finish'}
            </button>
            <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>

          {/* Unconfirm option */}
          {isAlreadyConfirmed && onUnconfirm && (
            <button
              onClick={handleUnconfirm}
              disabled={saving}
              style={{ marginTop: '10px', width: '100%', background: 'none', border: 'none', fontSize: '12px', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '4px' }}
            >
              Remove confirmation — revert to predicted
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
