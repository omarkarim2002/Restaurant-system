import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useFloorPlan(date: string, time: string) {
  return useQuery({
    queryKey: ['floor-plan', date, time],
    queryFn: () => api.get(`/bookings/seating/floor-plan?date=${date}&time=${time}`).then(r => r.data.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function useBookings(date: string) {
  return useQuery({
    queryKey: ['bookings', date],
    queryFn: () => api.get(`/bookings?date=${date}`).then(r => r.data.data),
    staleTime: 30_000,
  });
}

function useBlockRecommendations() {
  return useMutation({
    mutationFn: (body: any) =>
      api.post('/bookings/seating/block-recommend', body).then(r => r.data.data),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  Main:    { bg: '#1e293b', border: '#334155', label: '#94a3b8' },
  Bar:     { bg: '#1c1a14', border: '#3d3820', label: '#a39060' },
  Outside: { bg: '#0f1f0f', border: '#1e3a1e', label: '#4ade80' },
  Private: { bg: '#1a0f2e', border: '#2d1a5e', label: '#a78bfa' },
};

const DEFAULT_SECTION = { bg: '#1a1a18', border: '#333', label: '#888' };

const STATUS_STYLES: Record<string, { fill: string; stroke: string; text: string; glow?: string }> = {
  free:     { fill: '#1e3a1e', stroke: '#22c55e', text: '#86efac' },
  booked:   { fill: '#1e1b4b', stroke: '#6366f1', text: '#a5b4fc' },
  seated:   { fill: '#1a0f0f', stroke: '#C41E3A', text: '#fca5a5' },
  blocked:  { fill: '#1c1c1c', stroke: '#4b5563', text: '#6b7280' },
  selected: { fill: '#422006', stroke: '#C9973A', text: '#fcd34d', glow: '0 0 12px #C9973A80' },
  suggested:{ fill: '#042f2e', stroke: '#10b981', text: '#6ee7b7', glow: '0 0 12px #10b98180' },
};

const TIMES = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 11;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

// ── Table shape SVG ───────────────────────────────────────────────────────────

function TableShape({
  table, status, size = 72, onClick, label,
}: {
  table: any; status: keyof typeof STATUS_STYLES; size?: number; onClick?: () => void; label?: string;
}) {
  const st = STATUS_STYLES[status] || STATUS_STYLES.free;
  const isRound = table.shape === 'round';
  const pad = 6;
  const w = isRound ? size : size * 1.3;
  const h = size;

  // Chair count around table
  const chairs = Math.min(table.capacity, 8);
  const chairSize = 7;
  const chairPositions: { x: number; y: number; angle: number }[] = [];

  if (isRound) {
    const cx = w / 2, cy = h / 2, r = size / 2 - pad - chairSize;
    for (let i = 0; i < chairs; i++) {
      const angle = (i / chairs) * 2 * Math.PI - Math.PI / 2;
      chairPositions.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), angle });
    }
  } else {
    const perSide = Math.ceil(chairs / 2);
    for (let i = 0; i < perSide && chairPositions.length < chairs; i++) {
      chairPositions.push({ x: pad + chairSize / 2 + (i * (w - 2 * pad - chairSize)) / Math.max(perSide - 1, 1), y: pad / 2, angle: 0 });
    }
    for (let i = 0; i < perSide && chairPositions.length < chairs; i++) {
      chairPositions.push({ x: pad + chairSize / 2 + (i * (w - 2 * pad - chairSize)) / Math.max(perSide - 1, 1), y: h - pad / 2, angle: Math.PI });
    }
  }

  return (
    <svg
      width={w} height={h}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', filter: st.glow ? `drop-shadow(${st.glow})` : undefined, transition: 'filter 0.2s' }}
    >
      {/* Chairs */}
      {chairPositions.map((pos, i) => (
        <circle key={i} cx={pos.x} cy={pos.y} r={chairSize / 2} fill={st.fill} stroke={st.stroke} strokeWidth="1" opacity="0.6" />
      ))}

      {/* Table body */}
      {isRound ? (
        <circle cx={w / 2} cy={h / 2} r={size / 2 - pad - chairSize - 2} fill={st.fill} stroke={st.stroke} strokeWidth="1.5" />
      ) : (
        <rect x={pad} y={pad + chairSize} width={w - pad * 2} height={h - pad * 2 - chairSize * 2}
          rx="6" fill={st.fill} stroke={st.stroke} strokeWidth="1.5" />
      )}

      {/* Table name */}
      <text x={w / 2} y={isRound ? h / 2 - 4 : h / 2 - 2} textAnchor="middle"
        fill={st.text} fontSize="10" fontWeight="600" fontFamily="system-ui">
        {table.name}
      </text>
      <text x={w / 2} y={isRound ? h / 2 + 9 : h / 2 + 10} textAnchor="middle"
        fill={st.text} fontSize="8" opacity="0.75" fontFamily="system-ui">
        {label || `${table.capacity} seats`}
      </text>
    </svg>
  );
}

// ── AI block recommendation modal ─────────────────────────────────────────────

function BlockRecommendModal({
  tables, bookings, date, onApply, onClose,
}: {
  tables: any[]; bookings: any[]; date: string; onApply: (blocked: string[]) => void; onClose: () => void;
}) {
  const recommend = useBlockRecommendations();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const totalCovers = bookings
    .filter((b: any) => ['confirmed', 'seated'].includes(b.status))
    .reduce((s: number, b: any) => s + b.party_size, 0);

  async function getRecommendation() {
    setLoading(true);
    try {
      const res = await recommend.mutateAsync({
        date,
        tables: tables.map(t => ({ id: t.id, name: t.name, capacity: t.capacity, section: t.section, shape: t.shape, is_free: t.is_free })),
        bookings: bookings.filter((b: any) => ['confirmed', 'seated'].includes(b.status)).map((b: any) => ({
          party_size: b.party_size, booking_time: b.booking_time?.slice(0, 5), status: b.status,
          tables: b.tables?.map((t: any) => t.table_name),
        })),
        total_covers: totalCovers,
      });
      setResult(res);
    } catch (e: any) {
      setResult({ error: e.response?.data?.error || 'Failed to get recommendation.' });
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { getRecommendation(); }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: '#1a1a18', border: '0.5px solid #333', borderRadius: '16px', width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, color: 'white', margin: 0 }}>🤖 AI block recommendations</h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
              {format(parseISO(date), 'EEEE d MMMM')} · {totalCovers} covers booked · {tables.filter(t => t.is_free).length} tables free
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#666', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤖</div>
              Haiku is analysing your bookings and table layout…
            </div>
          ) : result?.error ? (
            <div style={{ color: '#fca5a5', fontSize: '13px' }}>{result.error}</div>
          ) : result ? (
            <>
              {/* Summary */}
              <div style={{ background: '#0f2420', border: '0.5px solid #10b981', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#6ee7b7', marginBottom: '4px' }}>Recommendation</div>
                <div style={{ fontSize: '13px', color: '#a7f3d0', lineHeight: 1.6 }}>{result.summary}</div>
              </div>

              {/* Tables to block */}
              {result.block?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>
                    Block these tables ({result.block.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {result.block.map((item: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#1c1c1c', border: '0.5px solid #4b5563', borderRadius: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4b5563', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>{item.table_name}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>{item.reason}</div>
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>{item.capacity} seats</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tables to keep open */}
              {result.keep_open?.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>
                    Keep open ({result.keep_open.length})
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {result.keep_open.map((item: any, i: number) => (
                      <div key={i} style={{ padding: '4px 10px', background: '#0f2420', border: '0.5px solid #10b981', borderRadius: '20px', fontSize: '12px', color: '#6ee7b7' }}>
                        {item.table_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #333', display: 'flex', gap: '8px' }}>
          {result && !result.error && result.block?.length > 0 && (
            <button
              onClick={() => { onApply(result.block.map((b: any) => b.table_id)); onClose(); }}
              style={{ flex: 1, padding: '10px', background: '#C9973A', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              Apply — block {result.block?.length} table{result.block?.length !== 1 ? 's' : ''}
            </button>
          )}
          <button onClick={getRecommendation} disabled={loading}
            style={{ padding: '10px 14px', background: 'transparent', color: '#888', border: '0.5px solid #444', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            Retry
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', background: 'transparent', color: '#888', border: '0.5px solid #444', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main floor plan page ──────────────────────────────────────────────────────

export function FloorPlanPage() {
  const [date, setDate]           = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime]           = useState(format(new Date(), 'HH') + ':00');
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [showRecommend, setShowRecommend] = useState(false);
  const [hoveredTable, setHoveredTable]   = useState<string | null>(null);

  const { data: floorData, isLoading } = useFloorPlan(date, time);
  const { data: bookings = [] }         = useBookings(date);

  const tables: any[] = floorData?.tables || [];
  const sections = [...new Set(tables.map((t: any) => t.section as string))];

  // Determine table display status
  function getStatus(table: any): keyof typeof STATUS_STYLES {
    if (blockedIds.has(table.id)) return 'blocked';
    if (!table.is_free) {
      // Find if seated or just booked
      const booking = bookings.find((b: any) => b.tables?.some((t: any) => t.table_id === table.id) && b.status === 'seated');
      return booking ? 'seated' : 'booked';
    }
    return 'free';
  }

  function toggleBlock(tableId: string) {
    setBlockedIds(prev => {
      const next = new Set(prev);
      next.has(tableId) ? next.delete(tableId) : next.add(tableId);
      return next;
    });
  }

  function applyRecommendation(tableIds: string[]) {
    setBlockedIds(new Set(tableIds));
  }

  const freeCount    = tables.filter(t => t.is_free && !blockedIds.has(t.id)).length;
  const bookedCount  = tables.filter(t => !t.is_free).length;
  const blockedCount = blockedIds.size;
  const totalCovers  = bookings.filter((b: any) => ['confirmed','seated'].includes(b.status)).reduce((s: number, b: any) => s + b.party_size, 0);
  const totalCapacityOpen = tables.filter(t => t.is_free && !blockedIds.has(t.id)).reduce((s: number, t: any) => s + t.capacity, 0);

  // Booking lookup for table tooltip
  function getBookingForTable(tableId: string) {
    return bookings.find((b: any) => b.tables?.some((t: any) => t.table_id === tableId));
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0e', color: 'white', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px', background: '#1a1a18', borderBottom: '0.5px solid #2a2a28', flexWrap: 'wrap' }}>
        <button onClick={() => window.history.back()}
          style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '13px', padding: '6px 10px', borderRadius: '6px' }}>
          ← Back
        </button>

        <div style={{ width: '0.5px', height: '20px', background: '#333' }} />

        <div style={{ fontSize: '14px', fontWeight: 500, color: 'white' }}>Floor plan</div>

        {/* Date + time */}
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ fontSize: '13px', padding: '5px 10px', background: '#252523', border: '0.5px solid #444', borderRadius: '7px', color: 'white' }} />
        <select value={time} onChange={e => setTime(e.target.value)}
          style={{ fontSize: '13px', padding: '5px 10px', background: '#252523', border: '0.5px solid #444', borderRadius: '7px', color: 'white' }}>
          {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '16px', marginLeft: '8px' }}>
          {[
            { label: 'Free', count: freeCount, color: '#22c55e' },
            { label: 'Booked', count: bookedCount, color: '#6366f1' },
            { label: 'Seated', count: tables.filter(t => getStatus(t) === 'seated').length, color: '#C41E3A' },
            { label: 'Blocked', count: blockedCount, color: '#6b7280' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
              <span style={{ color: '#aaa' }}>{label}</span>
              <span style={{ fontWeight: 600, color: 'white' }}>{count}</span>
            </div>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {blockedCount > 0 && (
            <button onClick={() => setBlockedIds(new Set())}
              style={{ fontSize: '12px', padding: '6px 12px', background: 'transparent', border: '0.5px solid #444', borderRadius: '7px', color: '#888', cursor: 'pointer' }}>
              Clear {blockedCount} blocked
            </button>
          )}
          <button onClick={() => setShowRecommend(true)}
            style={{ fontSize: '13px', padding: '6px 14px', background: '#C9973A', border: 'none', borderRadius: '7px', color: 'white', fontWeight: 500, cursor: 'pointer' }}>
            🤖 AI recommendations
          </button>
        </div>
      </div>

      {/* Covers summary bar */}
      <div style={{ display: 'flex', gap: '24px', padding: '10px 24px', background: '#141413', borderBottom: '0.5px solid #222', fontSize: '12px', color: '#888', alignItems: 'center' }}>
        <span>📅 {format(parseISO(date), 'EEEE d MMMM')}</span>
        <span style={{ color: '#444' }}>|</span>
        <span>{totalCovers} covers booked</span>
        <span style={{ color: '#444' }}>|</span>
        <span style={{ color: totalCapacityOpen >= totalCovers ? '#22c55e' : '#f87171' }}>
          {totalCapacityOpen} seats open {totalCapacityOpen < totalCovers ? '⚠ not enough capacity' : '✓'}
        </span>
        {blockedCount > 0 && <>
          <span style={{ color: '#444' }}>|</span>
          <span style={{ color: '#C9973A' }}>{blockedCount} table{blockedCount !== 1 ? 's' : ''} manually blocked</span>
        </>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#1e3a1e', border: '1px solid #22c55e' }} />
            <span>Free</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#1e1b4b', border: '1px solid #6366f1' }} />
            <span>Booked</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#1a0f0f', border: '1px solid #C41E3A' }} />
            <span>Seated</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#1c1c1c', border: '1px solid #4b5563' }} />
            <span>Blocked</span>
          </div>
        </div>
      </div>

      {/* Floor area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#666', fontSize: '13px' }}>Loading floor plan…</div>
        ) : tables.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#666' }}>
            <div style={{ fontSize: '40px', marginBottom: '1rem' }}>🗺</div>
            <div style={{ fontSize: '14px', marginBottom: '0.5rem' }}>No tables configured</div>
            <div style={{ fontSize: '13px' }}>Go to Bookings → Table setup to add your tables.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {sections.map(section => {
              const secTables = tables.filter((t: any) => t.section === section);
              const secColors = SECTION_COLORS[section] || DEFAULT_SECTION;
              return (
                <div key={section}>
                  {/* Section label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: secColors.label, textTransform: 'uppercase', letterSpacing: '.1em' }}>{section}</div>
                    <div style={{ flex: 1, height: '0.5px', background: secColors.border }} />
                    <div style={{ fontSize: '11px', color: '#555' }}>
                      {secTables.filter(t => t.is_free && !blockedIds.has(t.id)).length} free · {secTables.filter(t => !t.is_free).length} booked
                    </div>
                  </div>

                  {/* Tables grid */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', background: secColors.bg, borderRadius: '12px', border: `0.5px solid ${secColors.border}`, minHeight: '120px' }}>
                    {secTables.map((table: any) => {
                      const status = getStatus(table);
                      const booking = getBookingForTable(table.id);
                      const isHovered = hoveredTable === table.id;

                      return (
                        <div key={table.id} style={{ position: 'relative' }}
                          onMouseEnter={() => setHoveredTable(table.id)}
                          onMouseLeave={() => setHoveredTable(null)}>
                          <TableShape
                            table={table}
                            status={status}
                            size={76}
                            label={
                              status === 'blocked' ? 'blocked' :
                              status === 'seated' ? (booking?.guest_name?.split(' ')[0] || 'seated') :
                              status === 'booked' ? (booking?.booking_time?.slice(0,5) || 'booked') :
                              `${table.capacity} seats`
                            }
                            onClick={() => {
                              if (status === 'free' || status === 'blocked') toggleBlock(table.id);
                            }}
                          />

                          {/* Tooltip on hover */}
                          {isHovered && (
                            <div style={{
                              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                              marginBottom: '8px', background: '#0f0f0e', border: '0.5px solid #333',
                              borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#d1d5db',
                              whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                              pointerEvents: 'none',
                            }}>
                              <div style={{ fontWeight: 600, marginBottom: '2px' }}>{table.name}</div>
                              {booking ? (
                                <>
                                  <div style={{ color: '#9ca3af' }}>{booking.guest_name} · party of {booking.party_size}</div>
                                  <div style={{ color: '#9ca3af' }}>{booking.booking_time?.slice(0,5)} · {booking.status}</div>
                                  {booking.dietary_notes && <div style={{ color: '#fca5a5', marginTop: '2px' }}>⚠ {booking.dietary_notes}</div>}
                                </>
                              ) : status === 'blocked' ? (
                                <div style={{ color: '#6b7280' }}>Manually blocked · click to unblock</div>
                              ) : (
                                <div style={{ color: '#6ee7b7' }}>Free · {table.capacity} seats · click to block</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showRecommend && (
        <BlockRecommendModal
          tables={tables}
          bookings={bookings}
          date={date}
          onApply={applyRecommendation}
          onClose={() => setShowRecommend(false)}
        />
      )}
    </div>
  );
}
