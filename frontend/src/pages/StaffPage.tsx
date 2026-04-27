import React, { useState } from 'react';
import { useEmployees } from '../hooks/useRota';
import { employeesApi } from '../api/index';
import { useQueryClient } from '@tanstack/react-query';

const AVATAR_COLORS = [
  { bg: '#fde8ec', text: '#9e1830' },
  { bg: '#f5ead6', text: '#8a6220' },
  { bg: '#e6f1fb', text: '#0c447c' },
  { bg: '#eaf3de', text: '#27500a' },
  { bg: '#eeedfe', text: '#3c3489' },
];

const ROLES = ['Manager', 'Chef', 'Waiter', 'Barista', 'Kitchen Porter', 'Sous Chef', 'Bar Staff'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'casual'];

function initials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

const emptyForm = {
  first_name: '', last_name: '', email: '', phone: '',
  role_id: '', employment_type: 'full_time', max_hours_per_week: 40,
  system_role: 'staff', password: '',
};

export function StaffPage() {
  const qc = useQueryClient();
  const { data: employees = [], isLoading } = useEmployees({ active: true });
  const [showForm, setShowForm] = useState(false);
  const [filterRole, setFilterRole] = useState('all');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dbRoles, setDbRoles] = useState<any[]>([]);

  React.useEffect(() => {
    fetch('/api/roles', { headers: { Authorization: `Bearer ${localStorage.getItem('rms_token')}` } })
      .then(r => r.json()).then(d => setDbRoles(d.data || [])).catch(() => {});
  }, []);

  const grouped = ROLES.reduce((acc: any, role) => {
    const matched = employees.filter((e: any) =>
      e.role_name?.toLowerCase() === role.toLowerCase()
    );
    if (matched.length > 0 || filterRole === 'all') acc[role] = matched;
    return acc;
  }, {});

  const filtered = filterRole === 'all'
    ? employees
    : employees.filter((e: any) => e.role_name?.toLowerCase() === filterRole.toLowerCase());

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      const roleObj = dbRoles.find((r: any) => r.name.toLowerCase() === form.role_id.toLowerCase());
      if (!roleObj) throw new Error('Please select a valid role — make sure roles exist in the database.');
      await employeesApi.create({ ...form, role_id: roleObj.id });
      setSuccess(`${form.first_name} ${form.last_name} added successfully.`);
      setForm(emptyForm);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['employees'] });
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to add staff member.');
    } finally {
      setSaving(false);
    }
  }

  function field(key: string, value: any, extra?: any) {
    setForm(f => ({ ...f, [key]: value }));
    setError('');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-sub">{employees.length} active employees</p>
        </div>
        <button className="btn-primary" onClick={() => { setShowForm(true); setSuccess(''); setError(''); }}>
          + Add staff member
        </button>
      </div>

      {success && (
        <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#27500a' }}>
          {success}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem', borderTop: '3px solid #C41E3A', borderRadius: '0 0 12px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3>New staff member</h3>
            <button onClick={() => setShowForm(false)} style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Cancel</button>
          </div>

          {error && (
            <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">First name *</label>
                <input required value={form.first_name} onChange={e => field('first_name', e.target.value)} placeholder="e.g. Sarah" />
              </div>
              <div className="form-group">
                <label className="form-label">Last name *</label>
                <input required value={form.last_name} onChange={e => field('last_name', e.target.value)} placeholder="e.g. Chen" />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input required type="email" value={form.email} onChange={e => field('email', e.target.value)} placeholder="sarah@restaurant.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input value={form.phone} onChange={e => field('phone', e.target.value)} placeholder="+44 7700 000000" />
              </div>
              <div className="form-group">
                <label className="form-label">Role *</label>
                <select required value={form.role_id} onChange={e => field('role_id', e.target.value)}>
                  <option value="">Select a role...</option>
                  {dbRoles.length > 0
                    ? dbRoles.map((r: any) => <option key={r.id} value={r.name}>{r.name}</option>)
                    : ROLES.map(r => <option key={r} value={r}>{r}</option>)
                  }
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Employment type *</label>
                <select value={form.employment_type} onChange={e => field('employment_type', e.target.value)}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Max hours / week</label>
                <input type="number" min={1} max={60} value={form.max_hours_per_week} onChange={e => field('max_hours_per_week', Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">System access</label>
                <select value={form.system_role} onChange={e => field('system_role', e.target.value)}>
                  <option value="staff">Staff (view only)</option>
                  <option value="manager">Manager (full access)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Temporary password *</label>
                <input required type="password" value={form.password} onChange={e => field('password', e.target.value)} placeholder="Min 8 characters" minLength={8} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Adding...' : 'Add staff member'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          style={filterRole === 'all' ? { background: '#C41E3A', color: 'white', border: 'none', fontWeight: 500 } : {}}
          onClick={() => setFilterRole('all')}
        >
          All ({employees.length})
        </button>
        {ROLES.map(role => {
          const count = employees.filter((e: any) => e.role_name?.toLowerCase() === role.toLowerCase()).length;
          if (count === 0) return null;
          return (
            <button
              key={role}
              style={filterRole === role ? { background: '#C41E3A', color: 'white', border: 'none', fontWeight: 500 } : {}}
              onClick={() => setFilterRole(role)}
            >
              {role} ({count})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading staff...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            {filterRole === 'all' ? 'No staff members yet.' : `No ${filterRole}s on record.`}
          </div>
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add first staff member</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
          {filtered.map((emp: any, i: number) => {
            const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
            return (
              <div key={emp.id} className="card" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div className="avatar" style={{ background: color.bg, color: color.text, width: '40px', height: '40px', fontSize: '13px', flexShrink: 0 }}>
                  {initials(emp.first_name, emp.last_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '3px' }}>
                    {emp.first_name} {emp.last_name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                    {emp.email}
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <span className="badge badge-red">{emp.role_name || 'No role'}</span>
                    <span className="badge badge-gray">{emp.employment_type?.replace('_', ' ')}</span>
                    {emp.system_role === 'manager' && <span className="badge badge-gold">Manager</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '6px' }}>
                    Max {emp.max_hours_per_week}h/week
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
