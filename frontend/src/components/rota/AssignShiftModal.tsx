import React, { useState } from 'react';
import { useEmployees, useAddAssignment } from '../../hooks/useRota';

interface Props {
  scheduleId: string;
  date: string;
  onClose: () => void;
}

const SHIFTS = [
  { name: 'Morning',   shift_type: 'morning',   start: '08:00', end: '16:00' },
  { name: 'Afternoon', shift_type: 'afternoon',  start: '12:00', end: '20:00' },
  { name: 'Evening',   shift_type: 'evening',    start: '16:00', end: '23:00' },
  { name: 'Full Day',  shift_type: 'full_day',   start: '08:00', end: '23:00' },
  { name: 'Brunch',    shift_type: 'morning',    start: '09:00', end: '15:00' },
];

export function AssignShiftModal({ scheduleId, date, onClose }: Props) {
  const { data: employees = [] } = useEmployees({ active: true });
  const addAssignment = useAddAssignment(scheduleId);
  const [employeeId, setEmployeeId] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [dbShifts, setDbShifts] = useState<any[]>([]);
  React.useEffect(() => {
    fetch('/api/shifts', { headers: { Authorization: `Bearer ${localStorage.getItem('rms_token')}` } })
      .then(r => r.json()).then(d => setDbShifts(d.data || [])).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !shiftName) { setError('Please select both an employee and a shift.'); return; }
    setSaving(true);
    setError('');
    try {
      const shift = dbShifts.find((s: any) => s.name === shiftName);
      if (!shift) throw new Error('Shift not found — make sure shifts exist in the database.');
      await addAssignment.mutateAsync({ employee_id: employeeId, shift_id: shift.id, shift_date: date });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to assign shift.');
    } finally {
      setSaving(false);
    }
  }

  const selectedEmp = employees.find((e: any) => e.id === employeeId);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 500 }}>Add shift</h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{date}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#888', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {error && (
          <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '9px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, color: '#5f5e5a', display: 'block', marginBottom: '5px' }}>Employee</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} required style={{ width: '100%' }}>
              <option value="">Select employee...</option>
              {employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} — {emp.role_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, color: '#5f5e5a', display: 'block', marginBottom: '8px' }}>Shift</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {(dbShifts.length > 0 ? dbShifts : SHIFTS).map((s: any) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setShiftName(s.name)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: shiftName === s.name ? '2px solid #C41E3A' : '0.5px solid #e0e0d8',
                    background: shiftName === s.name ? '#fde8ec' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 500, color: shiftName === s.name ? '#C41E3A' : '#1a1a18' }}>{s.name}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{s.start_time || s.start} – {s.end_time || s.end}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              disabled={saving}
              style={{ flex: 1, background: '#C41E3A', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Assigning...' : 'Assign shift'}
            </button>
            <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
