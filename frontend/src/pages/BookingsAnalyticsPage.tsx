import React, { useState } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useSummary(from: string, to: string) {
  return useQuery({ queryKey: ['bookings-summary', from, to], queryFn: () => api.get(`/bookings/analytics/summary?from=${from}&to=${to}`).then(r => r.data.data), staleTime: 60_000 });
}
function usePeakTimes() {
  return useQuery({ queryKey: ['peak-times'], queryFn: () => api.get('/bookings/analytics/peak-times').then(r => r.data.data), staleTime: 300_000 });
}
function useGuests(search?: string) {
  return useQuery({ queryKey: ['guests', search], queryFn: () => api.get(`/bookings/analytics/guests${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(r => r.data.data), staleTime: 60_000 });
}
function useGuest(id: string) {
  return useQuery({ queryKey: ['guest', id], queryFn: () => api.get(`/bookings/analytics/guests/${id}`).then(r => r.data.data), enabled: !!id });
}
function useForecastAccuracy() {
  return useQuery({ queryKey: ['forecast-accuracy'], queryFn: () => api.get('/bookings/analytics/forecast/accuracy').then(r => r.data.data), staleTime: 300_000 });
}
function useWalkInConfig() {
  return useQuery({ queryKey: ['walk-in-config'], queryFn: () => api.get('/bookings/analytics/walk-in-config').then(r => r.data.data), staleTime: 300_000 });
}
function useUpdateWalkIn() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ dow, buffer_pct }: any) => api.patch(`/bookings/analytics/walk-in-config/${dow}`, { buffer_pct }).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['walk-in-config'] }) });
}
function useLogActual() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ date, actual_covers }: any) => api.patch(`/bookings/analytics/forecast/${date}/actual`, { actual_covers }).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-accuracy'] }) });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Guest detail modal ────────────────────────────────────────────────────────

function GuestModal({ guestId, onClose }: { guestId: string; onClose: () => void }) {
  const { data: guest, isLoading } = useGuest(guestId);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>{guest?.name || '…'}</h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>{guest?.phone} {guest?.email && `· ${guest.email}`}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {isLoading ? <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>Loading…</div> : guest && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '1.25rem' }}>
                <div className="metric-card" style={{ padding: '12px' }}>
                  <div className="metric-label">Visits</div>
                  <div style={{ fontSize: '22px', fontWeight: 500, color: '#C41E3A' }}>{guest.visit_count}</div>
                </div>
                <div className="metric-card" style={{ padding: '12px' }}>
                  <div className="metric-label">No-shows</div>
                  <div style={{ fontSize: '22px', fontWeight: 500, color: guest.no_show_count > 0 ? '#C9973A' : 'var(--color-text-primary)' }}>{guest.no_show_count}</div>
                </div>
                <div className="metric-card" style={{ padding: '12px' }}>
                  <div className="metric-label">Last visit</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginTop: '4px' }}>{guest.last_visit ? format(parseISO(guest.last_visit), 'd MMM yy') : '—'}</div>
                </div>
              </div>
              {guest.dietary_notes && (
                <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>
                  ⚠ Dietary: {guest.dietary_notes}
                </div>
              )}
              {guest.no_show_count >= 2 && (
                <div style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem', fontSize: '13px', color: '#633806' }}>
                  ⚠ {guest.no_show_count} no-shows on record — consider requesting a deposit for future bookings.
                </div>
              )}
              {guest.bookings?.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Booking history</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {guest.bookings.map((b: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--color-background-secondary)', borderRadius: '7px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 500, flex: 1 }}>{format(parseISO(b.booking_date), 'EEE d MMM yyyy')}</div>
                        <div style={{ color: 'var(--color-text-secondary)' }}>{b.booking_time?.slice(0, 5)}</div>
                        <div style={{ color: 'var(--color-text-secondary)' }}>Party of {b.party_size}</div>
                        {b.table_name && <div style={{ color: 'var(--color-text-tertiary)' }}>{b.table_name}</div>}
                        <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '20px', background: b.status === 'completed' ? '#eaf3de' : b.status === 'no_show' ? '#faeeda' : '#e6f1fb', color: b.status === 'completed' ? '#27500a' : b.status === 'no_show' ? '#633806' : '#0c447c', fontWeight: 500 }}>
                          {b.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main analytics page ───────────────────────────────────────────────────────

type Tab = 'overview' | 'guests' | 'forecast';

export function BookingsAnalyticsPage() {
  const [tab, setTab]               = useState<Tab>('overview');
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);
  const [logDate, setLogDate]       = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logActualVal, setLogActualVal] = useState('');
  const [editingDow, setEditingDow] = useState<number | null>(null);
  const [newBuffer, setNewBuffer]   = useState('');

  const to   = format(new Date(), 'yyyy-MM-dd');
  const from = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const { data: summary, isLoading: summaryLoading }  = useSummary(from, to);
  const { data: peakTimes = [] }                       = usePeakTimes();
  const { data: guests = [] }                          = useGuests(guestSearch);
  const { data: accuracy }                             = useForecastAccuracy();
  const { data: walkInConfig = [] }                    = useWalkInConfig();
  const logActual  = useLogActual();
  const updateWalk = useUpdateWalkIn();

  const maxPeak = Math.max(...peakTimes.map((p: any) => p.bookings), 1);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings analytics</h1>
          <p className="page-sub">Last 30 days · guest profiles · covers forecasting</p>
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        {[{ id: 'overview', label: 'Overview' }, { id: 'guests', label: 'Guest profiles' }, { id: 'forecast', label: 'Covers forecast' }].map((t: any) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 20px', fontSize: '13px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: tab === t.id ? '2px solid #C41E3A' : '2px solid transparent', color: tab === t.id ? '#C41E3A' : 'var(--color-text-secondary)', fontWeight: tab === t.id ? 500 : 400, borderRadius: 0, marginBottom: '-1px' }}>{t.label}</button>
        ))}
      </div>

      {/* ── Overview tab ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div>
          {summaryLoading ? <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>Loading…</div> : !summary ? null : (
            <>
              <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="metric-card"><div className="metric-label">Total bookings</div><div className="metric-val" style={{ color: '#C41E3A' }}>{summary.total_bookings}</div><div className="metric-sub">last 30 days</div></div>
                <div className="metric-card"><div className="metric-label">Total covers</div><div className="metric-val" style={{ color: '#C9973A' }}>{summary.total_covers}</div><div className="metric-sub">avg {summary.avg_party_size} per booking</div></div>
                <div className="metric-card"><div className="metric-label">No-show rate</div><div className="metric-val" style={{ color: summary.no_show_rate_pct > 10 ? '#C41E3A' : 'var(--color-text-primary)' }}>{summary.no_show_rate_pct}%</div><div className="metric-sub">{summary.no_show_rate_pct > 10 ? 'above average' : 'within normal range'}</div></div>
                <div className="metric-card"><div className="metric-label">Guest profiles</div><div className="metric-val">{guests.length}</div><div className="metric-sub">returning guests tracked</div></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                {/* Bookings by day of week */}
                <div className="card">
                  <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '1rem' }}>Bookings by day of week</h3>
                  {summary.by_day_of_week.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No data yet</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {summary.by_day_of_week.map((d: any) => {
                        const maxBook = Math.max(...summary.by_day_of_week.map((x: any) => x.bookings), 1);
                        const pct = Math.round((d.bookings / maxBook) * 100);
                        return (
                          <div key={d.dow} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{d.day_name}</div>
                            <div style={{ flex: 1, height: '8px', background: 'var(--color-background-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#C41E3A', borderRadius: '4px', transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ width: '30px', fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>{d.bookings}</div>
                            <div style={{ width: '50px', fontSize: '11px', color: 'var(--color-text-tertiary)', textAlign: 'right' }}>{d.covers} cov</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Peak times */}
                <div className="card">
                  <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '1rem' }}>Peak booking times</h3>
                  {peakTimes.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No data yet</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {peakTimes.map((p: any) => {
                        const pct = Math.round((p.bookings / maxPeak) * 100);
                        return (
                          <div key={p.hour} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '40px', fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{p.label}</div>
                            <div style={{ flex: 1, height: '8px', background: 'var(--color-background-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#C9973A', borderRadius: '4px' }} />
                            </div>
                            <div style={{ width: '30px', fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>{p.bookings}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Table utilisation */}
                {summary.table_utilisation?.length > 0 && (
                  <div className="card">
                    <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '1rem' }}>Table utilisation</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {summary.table_utilisation.map((t: any) => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                          <div style={{ fontWeight: 500, flex: 1 }}>{t.name}</div>
                          <div style={{ color: 'var(--color-text-secondary)' }}>{t.section}</div>
                          <div style={{ color: 'var(--color-text-secondary)' }}>{t.booking_count} bookings</div>
                          <div style={{ color: 'var(--color-text-tertiary)' }}>{t.total_covers} covers</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top guests */}
                {summary.top_guests?.length > 0 && (
                  <div className="card">
                    <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '1rem' }}>Top returning guests</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {summary.top_guests.map((g: any) => (
                        <div key={g.id} onClick={() => setSelectedGuest(g.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--color-background-secondary)', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fde8ec', color: '#9e1830', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
                            {g.name.charAt(0)}
                          </div>
                          <div style={{ flex: 1, fontWeight: 500 }}>{g.name}</div>
                          <div style={{ color: 'var(--color-text-secondary)' }}>{g.visit_count} visits</div>
                          {g.no_show_count > 0 && <div style={{ color: '#854f0b', fontSize: '11px' }}>⚠ {g.no_show_count} no-shows</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Guests tab ────────────────────────────────────────────────────── */}
      {tab === 'guests' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <input value={guestSearch} onChange={e => setGuestSearch(e.target.value)} placeholder="Search by name, phone or email…" style={{ fontSize: '13px', padding: '8px 12px', width: '320px' }} />
          </div>

          {guests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '36px', marginBottom: '1rem' }}>👤</div>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '0.5rem' }}>{guestSearch ? 'No guests found' : 'No guest profiles yet'}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Guest profiles build up automatically as bookings are created and linked. Returning guests are matched by phone or email.</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 80px 100px 90px', padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <div>Guest</div><div>Last visit</div><div>Visits</div><div>No-shows</div><div>Dietary</div><div></div>
              </div>
              {guests.map((g: any, idx: number) => (
                <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 80px 100px 90px', padding: '11px 16px', borderBottom: idx < guests.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{g.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{g.phone || g.email || '—'}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{g.last_visit ? format(parseISO(g.last_visit), 'd MMM yyyy') : '—'}</div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{g.visit_count}</div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: g.no_show_count > 1 ? '#C9973A' : 'var(--color-text-primary)' }}>{g.no_show_count || '—'}</div>
                  <div style={{ fontSize: '11px', color: '#9e1830' }}>{g.dietary_notes ? '⚠ ' + g.dietary_notes.slice(0, 15) : '—'}</div>
                  <div><button onClick={() => setSelectedGuest(g.id)} style={{ fontSize: '11px', color: '#C41E3A', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>View →</button></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Forecast tab ──────────────────────────────────────────────────── */}
      {tab === 'forecast' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '1.5rem' }}>

            {/* Log actual covers */}
            <div className="card">
              <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '1rem' }}>Log actual covers</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>After service, log how many covers you actually did. This improves the walk-in buffer accuracy over time.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Date</label><input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Actual covers</label><input type="number" min={0} value={logActualVal} onChange={e => setLogActualVal(e.target.value)} placeholder="e.g. 68" /></div>
                <button onClick={() => { if (logActualVal) { logActual.mutate({ date: logDate, actual_covers: parseInt(logActualVal) }); setLogActualVal(''); } }} className="btn-primary" disabled={!logActualVal || logActual.isPending} style={{ padding: '8px 12px', fontSize: '13px' }}>
                  {logActual.isPending ? '…' : 'Log'}
                </button>
              </div>
            </div>

            {/* Walk-in buffers */}
            <div className="card">
              <h3 style={{ fontSize: '13px', fontWeight: 500, marginBottom: '0.5rem' }}>Walk-in buffers by day</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '0.75rem', lineHeight: 1.5 }}>% added to booked covers for the total forecast.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {walkInConfig.map((c: any) => (
                  <div key={c.day_of_week} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                    <div style={{ width: '36px', fontWeight: 500 }}>{DAY_NAMES[c.day_of_week]}</div>
                    {editingDow === c.day_of_week ? (
                      <>
                        <input type="number" min={0} max={1} step={0.05} value={newBuffer}
                          onChange={e => setNewBuffer(e.target.value)}
                          style={{ width: '65px', fontSize: '12px', padding: '3px 6px' }} autoFocus />
                        <button onClick={() => { updateWalk.mutate({ dow: c.day_of_week, buffer_pct: parseFloat(newBuffer) }); setEditingDow(null); }} style={{ fontSize: '11px', padding: '3px 8px', background: '#C41E3A', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>✓</button>
                        <button onClick={() => setEditingDow(null)} style={{ fontSize: '11px', padding: '3px 6px', border: 'none', background: 'none', cursor: 'pointer', color: '#aaa' }}>×</button>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: 1, color: 'var(--color-text-secondary)' }}>+{Math.round(parseFloat(c.buffer_pct) * 100)}% walk-ins</div>
                        <button onClick={() => { setEditingDow(c.day_of_week); setNewBuffer(String(c.buffer_pct)); }} style={{ fontSize: '11px', color: '#C41E3A', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Accuracy history */}
          {accuracy?.rows?.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '13px' }}>Forecast accuracy history</h3>
                <div style={{ fontSize: '12px', color: accuracy.avg_accuracy_pct >= 80 ? '#27500a' : '#854f0b', fontWeight: 500 }}>
                  Avg {accuracy.avg_accuracy_pct}% accurate
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 100px 100px 100px 100px', padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                <div>Date</div><div>Booked</div><div>Forecast</div><div>Actual</div><div>Accuracy</div>
              </div>
              {accuracy.rows.slice(0, 14).map((r: any, idx: number) => (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '140px 100px 100px 100px 100px', padding: '10px 16px', borderBottom: idx < Math.min(accuracy.rows.length, 14) - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center', fontSize: '13px' }}>
                  <div style={{ fontWeight: 500 }}>{format(parseISO(r.forecast_date), 'EEE d MMM')}</div>
                  <div style={{ color: 'var(--color-text-secondary)' }}>{r.booked_covers}</div>
                  <div style={{ color: 'var(--color-text-secondary)' }}>{r.total_forecast}</div>
                  <div style={{ fontWeight: 500 }}>{r.actual_covers}</div>
                  <div>
                    {r.accuracy_pct !== null ? (
                      <span style={{ fontSize: '12px', fontWeight: 500, color: r.accuracy_pct >= 85 ? '#27500a' : r.accuracy_pct >= 70 ? '#633806' : '#9e1830' }}>
                        {r.accuracy_pct}%
                        {r.variance > 0 ? ` (+${r.variance})` : r.variance < 0 ? ` (${r.variance})` : ''}
                      </span>
                    ) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedGuest && <GuestModal guestId={selectedGuest} onClose={() => setSelectedGuest(null)} />}
    </div>
  );
}
