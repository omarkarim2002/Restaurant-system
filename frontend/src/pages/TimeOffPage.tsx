import React, { useState } from 'react';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { useTimeOffRequests, useReviewTimeOff } from '../hooks/useRota';
import { timeOffApi } from '../api/index';
import api from '../api/index';
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

interface CoverageConflict {
  date: string;
  section: string;
  role: string;
  assigned: number;
  minimum: number;
  shortfall: number;
}

export function TimeOffPage() {
  const qc = useQueryClient();
  const { employee } = useAuthStore();
  const isManager = ['manager', 'admin'].includes(employee?.system_role || '');

  const [filter, setFilter] = useState('pending');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '', request_type: 'holiday' });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [coverageWarning, setCoverageWarning] = useState<CoverageConflict[]>([]);
  const [reviewWarning, setReviewWarning] = useState<string>('');

  const { data: requests = [], isLoading } = useTimeOffRequests({ status: filter === 'all' ? undefined : filter });
  const reviewTimeOff = useReviewTimeOff();

  // Live coverage check as user selects dates
  async function checkCoverage(start: string, end: string) {
    if (!start || !end || start > end) { setCoverageWarning([]); return; }
    setChecking(true);
    try {
      const res = await api.post('/time-off/check', { start_date: start, end_date: end });
      setCoverageWarning(res.data.data.conflicts || []);
    } catch {
      setCoverageWarning([]);
    } finally {
      setChecking(false);
    }
  }

  function handleDateChange(field: 'start_date' | 'end_date', value: string) {
    const updated = { ...form, [field]: value };
    setForm(updated);
    setError('');
    if (updated.start_date && updated.end_date) {
      checkCoverage(updated.start_date, updated.end_date);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await timeOffApi.create(form);
      setSuccess('Time off request submitted successfully.');
      setForm({ start_date: '', end_date: '', reason: '', request_type: 'holiday' });
      setCoverageWarning([]);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['time-off'] });
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to submit request.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleReview(id: string, status: 'approved' | 'rejected') {
    setReviewWarning('');
    try {
      const res = await api.patch(`/time-off/${id}/review`, { status });
      if (res.data.warning) setReviewWarning(res.data.warning);
      qc.invalidateQueries({ queryKey: ['time-off'] });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update request.');
    }
  }

  // How many days in the request
  const requestedDays = form.start_date && form.end_date && form.start_date <= form.end_date
    ? eachDayOfInterval({ start: parseISO(form.start_date), end: parseISO(form.end_date) }).length
    : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Time off</h1>
          <p className="page-sub">
            {isManager ? 'Review and manage staff time off requests' : 'Submit and track your time off requests'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setShowForm(true); setSuccess(''); setError(''); setCoverageWarning([]); }}>
          + Request time off
        </button>
      </div>

      {/* How it works banner */}
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ fontSize: '14px' }}>ℹ</span>
        <div>
          <strong style={{ color: 'var(--color-text-primary)' }}>How time off works:</strong> When you request time off, the system checks if your absence would leave any shift understaffed based on minimum staffing rules.
          If cover is available, your request is submitted for manager approval. If not, you'll be asked to arrange cover first.
        </div>
      </div>

      {success && (
        <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#27500a' }}>
          ✓ {success}
        </div>
      )}

      {reviewWarning && (
        <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#633806' }}>
          <strong>Coverage warning:</strong> {reviewWarning}
          <button onClick={() => setReviewWarning('')} style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer', color: '#854f0b', fontSize: '16px' }}>×</button>
        </div>
      )}

      {/* Request form */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem', borderTop: '3px solid #C41E3A', borderRadius: '0 0 12px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3>New time off request</h3>
            <button onClick={() => { setShowForm(false); setCoverageWarning([]); setError(''); }} style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Cancel</button>
          </div>

          {error && (
            <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '12px 14px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830', lineHeight: 1.5 }}>
              <strong>Request blocked:</strong> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Start date *</label>
                <input
                  type="date" required value={form.start_date}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={e => handleDateChange('start_date', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">End date *</label>
                <input
                  type="date" required value={form.end_date}
                  min={form.start_date || format(new Date(), 'yyyy-MM-dd')}
                  onChange={e => handleDateChange('end_date', e.target.value)}
                />
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

            {/* Live coverage check result */}
            {form.start_date && form.end_date && form.start_date <= form.end_date && (
              <div style={{ marginBottom: '1.25rem' }}>
                {checking ? (
                  <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
                    Checking shift coverage for {requestedDays} day{requestedDays !== 1 ? 's' : ''}…
                  </div>
                ) : coverageWarning.length > 0 ? (
                  <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#9e1830', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>⚠</span> Cover not available — request will be blocked
                    </div>
                    <div style={{ fontSize: '12px', color: '#b84a5e', lineHeight: 1.7 }}>
                      {coverageWarning.map((c, i) => (
                        <div key={i}>
                          <strong>{format(parseISO(c.date), 'EEEE d MMM')}</strong> — {c.section} would be understaffed
                          ({c.assigned - 1} staff remaining, minimum is {c.minimum})
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9e1830', marginTop: '8px', fontStyle: 'italic' }}>
                      Please speak to your manager to arrange cover before requesting these dates.
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#27500a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>✓</span>
                    Cover is available for {requestedDays} day{requestedDays !== 1 ? 's' : ''} — you can submit this request.
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || coverageWarning.length > 0}
                style={{ opacity: coverageWarning.length > 0 ? 0.5 : 1, cursor: coverageWarning.length > 0 ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Submitting...' : 'Submit request'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setCoverageWarning([]); setError(''); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs */}
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
                  {req.reason && (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{req.reason}</div>
                  )}
                  {req.review_notes && (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px', fontStyle: 'italic' }}>
                      Note: {req.review_notes}
                    </div>
                  )}
                </div>

                <span className="badge" style={{ background: colors.bg, color: colors.text }}>
                  {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                </span>

                {isManager && req.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn-primary"
                      style={{ fontSize: '12px', padding: '5px 12px' }}
                      onClick={() => handleReview(req.id, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      style={{ fontSize: '12px', padding: '5px 12px' }}
                      onClick={() => handleReview(req.id, 'rejected')}
                    >
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
