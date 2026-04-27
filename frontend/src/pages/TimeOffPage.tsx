import React, { useState } from 'react';
import { format } from 'date-fns';
import { useTimeOffRequests, useReviewTimeOff } from '../hooks/useRota';
import { timeOffApi } from '../api/index';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:  { bg: '#faeeda', text: '#633806' },
  approved: { bg: '#eaf3de', text: '#27500a' },
  rejected: { bg: '#fde8ec', text: '#9e1830' },
};

const TYPE_LABELS: Record<string, string> = {
  holiday: 'Holiday', sick: 'Sick leave', personal: 'Personal', unpaid: 'Unpaid',
};

export function TimeOffPage() {
  const qc = useQueryClient();
  const { employee } = useAuthStore();
  const isManager = ['manager', 'admin'].includes(employee?.system_role || '');

  const [filter, setFilter] = useState('pending');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '', request_type: 'holiday' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data: requests = [], isLoading } = useTimeOffRequests({ status: filter === 'all' ? undefined : filter });
  const reviewTimeOff = useReviewTimeOff();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await timeOffApi.create(form);
      setSuccess('Time off request submitted successfully.');
      setForm({ start_date: '', end_date: '', reason: '', request_type: 'holiday' });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['time-off'] });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit request.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Time off</h1>
          <p className="page-sub">{isManager ? 'Review and manage staff time off requests' : 'Your time off requests'}</p>
        </div>
        <button className="btn-primary" onClick={() => { setShowForm(true); setSuccess(''); setError(''); }}>
          + Request time off
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
            <h3>New time off request</h3>
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
                <label className="form-label">Start date *</label>
                <input type="date" required value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">End date *</label>
                <input type="date" required value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select value={form.request_type} onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))}>
                  <option value="holiday">Holiday</option>
                  <option value="sick">Sick leave</option>
                  <option value="personal">Personal</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reason (optional)</label>
                <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Brief reason..." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Submitting...' : 'Submit request'}</button>
              <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={filter === s ? { background: '#C41E3A', color: 'white', border: 'none', fontWeight: 500 } : {}}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>No {filter} requests.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {requests.map((req: any) => {
            const colors = STATUS_COLORS[req.status] || STATUS_COLORS.pending;
            const startFmt = format(new Date(req.start_date), 'dd MMM yyyy');
            const endFmt = format(new Date(req.end_date), 'dd MMM yyyy');
            const sameDay = req.start_date === req.end_date;
            return (
              <div key={req.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#fde8ec', color: '#9e1830', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 500, flexShrink: 0 }}>
                  {req.first_name?.[0]}{req.last_name?.[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>
                    {req.first_name} {req.last_name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {TYPE_LABELS[req.request_type] || req.request_type} · {sameDay ? startFmt : `${startFmt} – ${endFmt}`}
                  </div>
                  {req.reason && <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{req.reason}</div>}
                </div>
                <span className="badge" style={{ background: colors.bg, color: colors.text }}>
                  {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                </span>
                {isManager && req.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn-primary" style={{ fontSize: '12px', padding: '5px 12px' }}
                      onClick={() => reviewTimeOff.mutate({ id: req.id, status: 'approved' })}>
                      Approve
                    </button>
                    <button style={{ fontSize: '12px', padding: '5px 12px' }}
                      onClick={() => reviewTimeOff.mutate({ id: req.id, status: 'rejected' })}>
                      Decline
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
