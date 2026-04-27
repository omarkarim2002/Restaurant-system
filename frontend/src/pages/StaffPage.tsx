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
  system_role: 'staff', password: '', off_rota: false,
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
  const [togglingId, setTogglingId] = useState<string | null>(null);

  React.useEffect(() => {
    fetch('/api/roles', { headers: { Authorization: `Bearer ${localStorage.getItem('rms_token')}` } })
      .then(r => r.json()).then(d => setDbRoles(d.data || [])).catch(() => {});
  }, []);

  const filtered = filterRole === 'all'
    ? employees
    : employees.filter((e: any) => e.role_name?.toLowerCase() === filterRole.toLowerCase());

  const onRota = filtered.filter((e: any) => !e.off_rota);
  const offRota = filtered.filter((e: any) => e.off_rota);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      const roleObj = dbRoles.find((r: any) => r.name.toLowerCase() === form.role_id.toLowerCase());
      if (!roleObj) throw new Error('Please select a valid role.');
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

  async function toggleOffRota(emp: any) {
    setTogglingId(emp.id);
    try {
      await employeesApi.update(emp.id, { off_rota: !emp.off_rota });
      qc.invalidateQueries({ queryKey: ['employees'] });
    } catch {
      alert('Failed to update rota status.');
    } finally {
      setTogglingId(null);
    }
  }

  function field(key: string, value: any) {
    setForm(f => ({ ...f, [key]: value }));
    setError('');
  }

  const RoleFilters = () => (
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
  );

  const StaffCard = ({ emp, i }: { emp: any; i: number }) => {
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const isOff = emp.off_rota;
    return (
      <div className="card" style={{
        display: 'flex', gap: '12px', alignItems: 'flex-start',
        opacity: isOff ? 0.75 : 1,
        borderLeft: isOff ? '3px solid #d0cec6' : '3px solid transparent',
        borderRadius: isOff ? '0 12px 12px 0' : '12px',
      }}>
        <div className="avatar" style={{ background: isOff ? '#f0efe8' : color.bg, color: isOff ? '#b0aea6' : color.text, width: '40px', height: '40px', fontSize: '13px', flexShrink: 0 }}>
          {initials(emp.first_name, emp.last_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {emp.first_name} {emp.last_name}
            {isOff && (
              <span style={{ fontSize: '10px', background: '#f0efe8', color: '#888780', border: '0.5px solid #d0cec6', padding: '1px 7px', borderRadius: '20px', fontWeight: 500 }}>
                Off rota
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{emp.email}</div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span className="badge badge-red">{emp.role_name || 'No role'}</span>
            <span className="badge badge-gray">{emp.employment_type?.replace('_', ' ')}</span>
            {emp.system_role === 'manager' && <span className="badge badge-gold">Manager</span>}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>
            Max {emp.max_hours_per_week}h/week
          </div>

          {/* Off rota toggle */}
          <button
            onClick={() => toggleOffRota(emp)}
            disabled={togglingId === emp.id}
            style={{
              fontSize: '11px', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
              background: isOff ? '#eaf3de' : '#f0efe8',
              color: isOff ? '#27500a' : '#888780',
              border: isOff ? '0.5px solid #97c459' : '0.5px solid #d0cec6',
              fontWeight: 500,
            }}
          >
            {togglingId === emp.id ? '…' : isOff ? '+ Add to rota' : '− Remove from rota'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-sub">{onRota.length} on rota · {offRota.length} off rota</p>
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

            {/* Off rota option at creation */}
            <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px 14px', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.off_rota}
                  onChange={e => field('off_rota', e.target.checked)}
                  style={{ width: 'auto', marginTop: '2px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>Off rota</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    This person will not be included in the auto-generated rota or counted in staffing requirements.
                    Use this for owners, admin staff, or anyone who manages the system but doesn't take shifts.
                  </div>
                </div>
              </label>
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

      <RoleFilters />

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
        <div>
          {/* On rota section */}
          {onRota.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#27500a', display: 'inline-block' }} />
                On rota ({onRota.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {onRota.map((emp: any, i: number) => <StaffCard key={emp.id} emp={emp} i={i} />)}
              </div>
            </div>
          )}

          {/* Off rota section */}
          {offRota.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d0cec6', display: 'inline-block' }} />
                Off rota ({offRota.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {offRota.map((emp: any, i: number) => <StaffCard key={emp.id} emp={emp} i={i} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
