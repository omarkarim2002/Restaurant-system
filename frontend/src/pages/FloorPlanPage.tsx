import React, { useState, useRef, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useFloorPlan(date: string, time: string) {
  return useQuery({
    queryKey: ['floor-plan', date, time],
    queryFn: () => api.get(`/bookings/seating/floor-plan?date=${date}&time=${time}`).then(r => r.data.data),
    staleTime: 30_000,
  });
}
function useTables() {
  return useQuery({ queryKey: ['tables'], queryFn: () => api.get('/bookings/tables').then(r => r.data.data), staleTime: 60_000 });
}
function useBookings(date: string) {
  return useQuery({ queryKey: ['bookings', date], queryFn: () => api.get(`/bookings?date=${date}`).then(r => r.data.data), staleTime: 30_000 });
}
function useUpdateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/bookings/tables/${id}`, body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); qc.invalidateQueries({ queryKey: ['floor-plan'] }); },
  });
}
function useAdjacencies() {
  return useQuery({ queryKey: ['adjacencies'], queryFn: () => api.get('/bookings/seating/adjacencies-all').then(r => r.data.data), staleTime: 60_000 });
}
function useBlockRecommendations() {
  return useMutation({ mutationFn: (body: any) => api.post('/bookings/seating/block-recommend', body).then(r => r.data.data) });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TW = 100; // table width px
const TH = 80;  // table height px

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; shadow?: string }> = {
  free:     { bg: '#1a2e1a', border: '#22c55e', text: '#86efac' },
  booked:   { bg: '#1a1b3a', border: '#6366f1', text: '#a5b4fc' },
  seated:   { bg: '#2a0f0f', border: '#C41E3A', text: '#fca5a5' },
  blocked:  { bg: '#1c1c1c', border: '#4b5563', text: '#6b7280' },
  combined: { bg: '#1a1400', border: '#C9973A', text: '#fcd34d', shadow: '0 0 14px #C9973A60' },
  editing:  { bg: '#111', border: '#C9973A', text: '#fcd34d', shadow: '0 0 14px #C9973A60' },
};

const TIMES = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 11;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

// ── Table component (pure DOM, no SVG scaling issues) ─────────────────────────

function TableCard({ table, status, label, onMouseDown, onClick, isSelected, isDragging }: {
  table: any; status: string; label: string;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  isSelected?: boolean; isDragging?: boolean;
}) {
  const st = STATUS_STYLES[status] || STATUS_STYLES.free;
  const isRound = table.shape === 'round';
  const chairs = Math.min(table.capacity, 8);

  // Render chair dots around the table
  const chairEls: React.ReactNode[] = [];
  if (isRound) {
    for (let i = 0; i < chairs; i++) {
      const a = (i / chairs) * 2 * Math.PI - Math.PI / 2;
      const cx = 50 + 42 * Math.cos(a);
      const cy = 50 + 42 * Math.sin(a);
      chairEls.push(
        <div key={i} style={{ position: 'absolute', left: `${cx}%`, top: `${cy}%`, width: 10, height: 10, borderRadius: '50%', background: st.bg, border: `1px solid ${st.border}`, transform: 'translate(-50%,-50%)', opacity: 0.6 }} />
      );
    }
  } else {
    const perSide = Math.ceil(chairs / 2);
    for (let i = 0; i < perSide && chairEls.length < chairs; i++) {
      const pct = perSide > 1 ? (i / (perSide - 1)) * 80 + 10 : 50;
      chairEls.push(<div key={`t${i}`} style={{ position: 'absolute', left: `${pct}%`, top: -6, width: 10, height: 10, borderRadius: 3, background: st.bg, border: `1px solid ${st.border}`, transform: 'translateX(-50%)', opacity: 0.6 }} />);
    }
    for (let i = 0; i < perSide && chairEls.length < chairs; i++) {
      const pct = perSide > 1 ? (i / (perSide - 1)) * 80 + 10 : 50;
      chairEls.push(<div key={`b${i}`} style={{ position: 'absolute', left: `${pct}%`, bottom: -6, width: 10, height: 10, borderRadius: 3, background: st.bg, border: `1px solid ${st.border}`, transform: 'translateX(-50%)', opacity: 0.6 }} />);
    }
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: table.pos_x,
        top: table.pos_y,
        width: TW,
        height: TH,
        borderRadius: isRound ? '50%' : 10,
        background: st.bg,
        border: `${isSelected ? 3 : 1.5}px solid ${isSelected ? '#fcd34d' : st.border}`,
        boxShadow: isSelected ? '0 0 16px #C9973Aaa' : st.shadow || undefined,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: onMouseDown ? (isDragging ? 'grabbing' : 'grab') : onClick ? 'pointer' : 'default',
        userSelect: 'none',
        opacity: isDragging ? 0.5 : 1,
        transition: isDragging ? 'none' : 'box-shadow 0.15s',
        zIndex: isDragging ? 100 : 1,
      }}
    >
      {chairEls}
      <div style={{ fontSize: 11, fontWeight: 700, color: st.text, lineHeight: 1.2, textAlign: 'center', pointerEvents: 'none' }}>
        {table.name}
      </div>
      <div style={{ fontSize: 9, color: st.text, opacity: 0.7, marginTop: 2, pointerEvents: 'none' }}>
        {label}
      </div>
    </div>
  );
}

// ── AI block modal ─────────────────────────────────────────────────────────────

function BlockRecommendModal({ tables, bookings, date, onApply, onClose }: {
  tables: any[]; bookings: any[]; date: string;
  onApply: (blocked: string[], combineNames: string[][]) => void; onClose: () => void;
}) {
  const recommend = useBlockRecommendations();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const totalCovers = bookings.filter((b: any) => ['confirmed','seated'].includes(b.status)).reduce((s: number, b: any) => s + b.party_size, 0);

  useEffect(() => {
    recommend.mutateAsync({
      date, total_covers: totalCovers, allow_combining: true,
      tables: tables.map((t: any) => ({ id: t.id, name: t.name, capacity: t.capacity, section: t.section, shape: t.shape, is_free: t.is_free })),
      bookings: bookings.filter((b: any) => ['confirmed','seated'].includes(b.status)).map((b: any) => ({ party_size: b.party_size, booking_time: b.booking_time?.slice(0,5), status: b.status, tables: b.tables?.map((t: any) => t.table_name) })),
    }).then(r => { setResult(r); setLoading(false); }).catch(e => { setResult({ error: e.response?.data?.error || 'Failed' }); setLoading(false); });
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: '#1a1a18', border: '0.5px solid #333', borderRadius: 16, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: 'white', margin: 0 }}>🤖 AI floor recommendations</h3>
            <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>{format(parseISO(date), 'EEEE d MMMM')} · {totalCovers} covers · {tables.filter((t: any) => t.is_free).length} free tables</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: '#666', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>Haiku is analysing your layout…
            </div>
          ) : result?.error ? (
            <div style={{ color: '#fca5a5', fontSize: 13 }}>{result.error}</div>
          ) : result && (
            <>
              <div style={{ background: '#0f2420', border: '0.5px solid #10b981', borderRadius: 8, padding: '12px 14px', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 13, color: '#a7f3d0', lineHeight: 1.6 }}>{result.summary}</div>
              </div>
              {result.combine?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#C9973A', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>⟋ Combine ({result.combine.length})</div>
                  {result.combine.map((c: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#1a1400', border: '0.5px solid #C9973A40', borderRadius: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fcd34d' }}>{c.tables?.join(' + ')}</span>
                      <span style={{ fontSize: 11, color: '#92400e', flex: 1 }}>{c.reason}</span>
                      <span style={{ fontSize: 11, color: '#fcd34d' }}>{c.combined_capacity}p</span>
                    </div>
                  ))}
                </div>
              )}
              {result.block?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>✕ Block ({result.block.length})</div>
                  {result.block.map((item: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#1c1c1c', border: '0.5px solid #333', borderRadius: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#d1d5db' }}>{item.table_name}</span>
                      <span style={{ fontSize: 11, color: '#6b7280', flex: 1 }}>{item.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.keep_open?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>✓ Keep open ({result.keep_open.length})</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {result.keep_open.map((item: any, i: number) => (
                      <span key={i} style={{ padding: '4px 10px', background: '#0f2420', border: '0.5px solid #22c55e40', borderRadius: 20, fontSize: 12, color: '#86efac' }}>{item.table_name}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #333', display: 'flex', gap: 8 }}>
          {result && !result.error && (
            <button onClick={() => {
              const nameToId: Record<string, string> = {};
              tables.forEach((t: any) => { nameToId[t.name] = t.id; });
              const blockIds = (result.block || []).map((b: any) => nameToId[b.table_name]).filter(Boolean);
              const combineNames = (result.combine || []).map((c: any) => c.tables || []);
              onApply(blockIds, combineNames);
              onClose();
            }} style={{ flex: 1, padding: 10, background: '#C9973A', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Apply recommendations
            </button>
          )}
          <button onClick={onClose} style={{ padding: '10px 14px', background: 'transparent', color: '#888', border: '0.5px solid #444', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function FloorPlanPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate]     = useState(today);
  const [time, setTime]     = useState(format(new Date(), 'HH') + ':00');
  const [editMode, setEditMode]       = useState(false);
  const [combineMode, setCombineMode] = useState(false);
  const [blockedIds, setBlockedIds]   = useState<Set<string>>(new Set());
  const [combinedPairs, setCombinedPairs] = useState<string[][]>([]);
  const [selectedForCombine, setSelectedForCombine] = useState<string | null>(null);
  const [showRecommend, setShowRecommend] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [dragId, setDragId]   = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  // Drag state stored in ref to avoid stale closures
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const { data: floorData }       = useFloorPlan(date, time);
  const { data: rawTables = [] }  = useTables();
  const { data: bookings = [] }   = useBookings(date);
  const { data: adjData = [] }    = useAdjacencies();
  const updateTable = useUpdateTable();
  const qc = useQueryClient();

  // Merge availability
  const availMap: Record<string, any> = {};
  for (const t of (floorData?.tables || [])) availMap[t.id] = t;

  // Init positions from DB — auto-grid if all at origin
  useEffect(() => {
    if (!rawTables.length) return;
    const pos: Record<string, { x: number; y: number }> = {};
    let allAtOrigin = true;
    for (const t of rawTables) {
      const x = parseFloat(t.pos_x), y = parseFloat(t.pos_y);
      pos[t.id] = { x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y };
      if (x > 5 || y > 5) allAtOrigin = false;
    }
    if (allAtOrigin) {
      const cols = Math.ceil(Math.sqrt(rawTables.length));
      rawTables.forEach((t: any, i: number) => {
        pos[t.id] = { x: 40 + (i % cols) * (TW + 30), y: 40 + Math.floor(i / cols) * (TH + 50) };
      });
    }
    setPositions(pos);
  }, [rawTables.map((t: any) => t.id).join(',')]);

  // ── Native window drag ───────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = drag.current;
      if (!d || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      // Clamp to canvas bounds
      const newX = Math.max(0, Math.min(rect.width  - TW, e.clientX - rect.left - d.offsetX));
      const newY = Math.max(0, Math.min(rect.height - TH, e.clientY - rect.top  - d.offsetY));
      setPositions(p => ({ ...p, [d.id]: { x: newX, y: newY } }));
    }
    function onUp() {
      drag.current = null;
      setDragId(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  function startDrag(e: React.MouseEvent, tableId: string) {
    if (!editMode || !canvasRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const pos  = positions[tableId] || { x: 0, y: 0 };
    // Offset = where inside the table the user clicked
    drag.current = {
      id: tableId,
      offsetX: e.clientX - rect.left - pos.x,
      offsetY: e.clientY - rect.top  - pos.y,
    };
    setDragId(tableId);
  }

  // ── Table data ───────────────────────────────────────────────────────────────
  const tables = rawTables.map((t: any) => ({
    ...t,
    pos_x: positions[t.id]?.x ?? 0,
    pos_y: positions[t.id]?.y ?? 0,
    is_free: availMap[t.id]?.is_free ?? true,
    conflict_booking: availMap[t.id]?.conflict_booking,
  }));

  const allCombined = new Set(combinedPairs.flat());

  function getStatus(table: any): string {
    if (editMode) return 'editing';
    if (blockedIds.has(table.id)) return 'blocked';
    if (allCombined.has(table.id)) return 'combined';
    if (!table.is_free) {
      const b = bookings.find((b: any) => b.tables?.some((t: any) => t.table_id === table.id) && b.status === 'seated');
      return b ? 'seated' : 'booked';
    }
    return 'free';
  }

  function getLabel(table: any) {
    const s = getStatus(table);
    if (s === 'blocked') return 'blocked';
    if (s === 'seated')  { const b = bookings.find((b: any) => b.tables?.some((t: any) => t.table_id === table.id)); return b?.guest_name?.split(' ')[0] || 'seated'; }
    if (s === 'booked')  { const b = bookings.find((b: any) => b.tables?.some((t: any) => t.table_id === table.id)); return b?.booking_time?.slice(0,5) || 'booked'; }
    if (s === 'combined') return 'combined';
    return `${table.capacity}p`;
  }

  function handleTableClick(e: React.MouseEvent, table: any) {
    if (editMode) return;
    if (combineMode) {
      if (!selectedForCombine) { setSelectedForCombine(table.id); return; }
      if (selectedForCombine === table.id) { setSelectedForCombine(null); return; }
      const exists = combinedPairs.some(p => (p[0] === selectedForCombine && p[1] === table.id) || (p[1] === selectedForCombine && p[0] === table.id));
      if (exists) setCombinedPairs(prev => prev.filter(p => !((p[0] === selectedForCombine && p[1] === table.id) || (p[1] === selectedForCombine && p[0] === table.id))));
      else setCombinedPairs(prev => [...prev, [selectedForCombine, table.id]]);
      setSelectedForCombine(null);
      return;
    }
    const s = getStatus(table);
    if (s === 'free' || s === 'blocked') setBlockedIds(prev => { const n = new Set(prev); n.has(table.id) ? n.delete(table.id) : n.add(table.id); return n; });
  }

  // ── Auto layout ──────────────────────────────────────────────────────────────
  function autoLayout() {
    if (!canvasRef.current) return;
    const W = canvasRef.current.offsetWidth;
    const H = canvasRef.current.offsetHeight;
    const sections = [...new Set(tables.map((t: any) => t.section as string))];
    const sectionCols = Math.ceil(Math.sqrt(sections.length));
    const newPos: Record<string, { x: number; y: number }> = {};
    sections.forEach((section, si) => {
      const secTables = tables.filter((t: any) => t.section === section);
      const sCol = si % sectionCols;
      const sRow = Math.floor(si / sectionCols);
      const zoneW = Math.floor(W / sectionCols);
      const zoneH = Math.floor(H / Math.ceil(sections.length / sectionCols));
      const cols = Math.ceil(Math.sqrt(secTables.length));
      secTables.forEach((t: any, ti: number) => {
        newPos[t.id] = {
          x: Math.min(W - TW - 10, sCol * zoneW + 24 + (ti % cols) * (TW + 24)),
          y: Math.min(H - TH - 10, sRow * zoneH + 40 + Math.floor(ti / cols) * (TH + 40)),
        };
      });
    });
    setPositions(newPos);
  }

  // ── Save layout ──────────────────────────────────────────────────────────────
  async function saveLayout() {
    try {
      await Promise.all(tables.map((t: any) => updateTable.mutateAsync({ id: t.id, pos_x: Math.round(t.pos_x), pos_y: Math.round(t.pos_y) })));
      setSavedMsg('Saved ✓');
      setEditMode(false);
      setTimeout(() => setSavedMsg(''), 3000);
    } catch { setSavedMsg('Save failed'); }
  }

  function applyAI(blockIds: string[], combineNamePairs: string[][]) {
    setBlockedIds(new Set(blockIds));
    const nameToId: Record<string, string> = {};
    tables.forEach((t: any) => { nameToId[t.name] = t.id; });
    setCombinedPairs(combineNamePairs.map(pair => pair.map((n: string) => nameToId[n]).filter(Boolean)).filter(p => p.length === 2));
  }

  const freeCount    = tables.filter((t: any) => t.is_free && !blockedIds.has(t.id) && !allCombined.has(t.id)).length;
  const bookedCount  = tables.filter((t: any) => !t.is_free).length;
  const totalCovers  = bookings.filter((b: any) => ['confirmed','seated'].includes(b.status)).reduce((s: number, b: any) => s + b.party_size, 0);

  return (
    <div style={{ height: '100vh', background: '#0d0d0c', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#1a1a18', borderBottom: '0.5px solid #2a2a28', flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={() => window.history.back()} style={{ background: 'transparent', border: 'none', color: '#777', cursor: 'pointer', fontSize: 13, padding: '5px 8px' }}>← Back</button>
        <div style={{ width: 0.5, height: 18, background: '#333' }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>Floor plan</div>

        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', background: '#252523', border: '0.5px solid #3a3a38', borderRadius: 6, color: 'white' }} />
        <select value={time} onChange={e => setTime(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', background: '#252523', border: '0.5px solid #3a3a38', borderRadius: 6, color: 'white' }}>
          {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 12, marginLeft: 4 }}>
          {[{ label: 'Free', count: freeCount, color: '#22c55e' }, { label: 'Booked', count: bookedCount, color: '#6366f1' }, { label: 'Blocked', count: blockedIds.size, color: '#6b7280' }, { label: 'Combined', count: combinedPairs.length, color: '#C9973A' }]
            .map(({ label, count, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                <span style={{ color: '#777' }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
              </div>
            ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {savedMsg && <span style={{ fontSize: 12, color: '#22c55e' }}>{savedMsg}</span>}

          {!editMode && (
            <>
              <button onClick={() => { setCombineMode(v => !v); setSelectedForCombine(null); }}
                style={{ fontSize: 12, padding: '5px 10px', background: combineMode ? '#C9973A' : 'transparent', border: `0.5px solid ${combineMode ? '#C9973A' : '#444'}`, borderRadius: 6, color: combineMode ? 'white' : '#aaa', cursor: 'pointer' }}>
                ⟋ {combineMode ? 'Combining' : 'Combine'}
              </button>
              {combinedPairs.length > 0 && <button onClick={() => setCombinedPairs([])} style={{ fontSize: 11, padding: '5px 8px', background: 'transparent', border: '0.5px solid #444', borderRadius: 6, color: '#888', cursor: 'pointer' }}>Clear combos</button>}
              {blockedIds.size > 0 && <button onClick={() => setBlockedIds(new Set())} style={{ fontSize: 11, padding: '5px 8px', background: 'transparent', border: '0.5px solid #444', borderRadius: 6, color: '#888', cursor: 'pointer' }}>Clear blocked</button>}
              <button onClick={() => setShowRecommend(true)}
                style={{ fontSize: 12, padding: '5px 10px', background: '#1a2e1a', border: '0.5px solid #22c55e40', borderRadius: 6, color: '#86efac', cursor: 'pointer', fontWeight: 500 }}>
                🤖 AI
              </button>
            </>
          )}

          {editMode ? (
            <>
              <button onClick={autoLayout} style={{ fontSize: 12, padding: '5px 10px', background: '#1a1000', border: '0.5px solid #C9973A60', borderRadius: 6, color: '#C9973A', cursor: 'pointer' }}>⟳ Auto layout</button>
              <button onClick={saveLayout} disabled={updateTable.isPending} style={{ fontSize: 12, padding: '5px 12px', background: '#22c55e', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontWeight: 500 }}>
                {updateTable.isPending ? 'Saving…' : 'Save layout'}
              </button>
              <button onClick={() => { setEditMode(false); setPositions({}); }} style={{ fontSize: 12, padding: '5px 10px', background: 'transparent', border: '0.5px solid #444', borderRadius: 6, color: '#888', cursor: 'pointer' }}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)} style={{ fontSize: 12, padding: '5px 10px', background: '#252523', border: '0.5px solid #444', borderRadius: 6, color: '#aaa', cursor: 'pointer' }}>✎ Edit layout</button>
          )}
        </div>
      </div>

      {/* Mode hint bar */}
      {(editMode || (combineMode && selectedForCombine)) && (
        <div style={{ padding: '6px 16px', background: '#1a1000', borderBottom: '0.5px solid #C9973A30', fontSize: 12, color: '#C9973A', flexShrink: 0 }}>
          {editMode
            ? '✎ Drag tables to reposition · Auto layout to reset · Save when done'
            : `⟋ Now click a second table to combine with ${tables.find((t: any) => t.id === selectedForCombine)?.name}`}
        </div>
      )}

      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        style={{
          flex: 1,
          position: 'relative',
          background: editMode
            ? 'radial-gradient(circle, #2a2a26 1px, transparent 1px) 0 0 / 30px 30px'
            : '#111110',
          overflow: 'hidden',
          cursor: editMode ? (dragId ? 'grabbing' : 'default') : 'default',
        }}
      >
        {/* Edit mode border */}
        {editMode && (
          <div style={{ position: 'absolute', inset: 8, border: '1px dashed #C9973A40', borderRadius: 10, pointerEvents: 'none' }} />
        )}

        {/* Combined pair overlays */}
        {combinedPairs.map((pair, i) => {
          const tA = tables.find((t: any) => t.id === pair[0]);
          const tB = tables.find((t: any) => t.id === pair[1]);
          if (!tA || !tB) return null;
          const x1 = Math.min(tA.pos_x, tB.pos_x) - 6;
          const y1 = Math.min(tA.pos_y, tB.pos_y) - 6;
          const x2 = Math.max(tA.pos_x + TW, tB.pos_x + TW) + 6;
          const y2 = Math.max(tA.pos_y + TH, tB.pos_y + TH) + 6;
          return (
            <div key={i} style={{ position: 'absolute', left: x1, top: y1, width: x2 - x1, height: y2 - y1, border: '1.5px dashed #C9973A', borderRadius: 12, pointerEvents: 'none', opacity: 0.7 }} />
          );
        })}

        {/* Selected-for-combine ring */}
        {selectedForCombine && (() => {
          const t = tables.find((t: any) => t.id === selectedForCombine);
          if (!t) return null;
          return <div style={{ position: 'absolute', left: t.pos_x - 8, top: t.pos_y - 8, width: TW + 16, height: TH + 16, border: '2px dashed #fcd34d', borderRadius: 14, pointerEvents: 'none' }} />;
        })()}

        {/* Tables */}
        {tables.map((table: any) => {
          const status = getStatus(table);
          const label  = getLabel(table);
          return (
            <TableCard
              key={table.id}
              table={table}
              status={status}
              label={label}
              isDragging={dragId === table.id}
              isSelected={selectedForCombine === table.id}
              onMouseDown={editMode ? (e) => startDrag(e, table.id) : undefined}
              onClick={!editMode ? (e) => handleTableClick(e, table) : undefined}
            />
          );
        })}

        {tables.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 14, flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 40 }}>🗺</div>
            <div>No tables — go to Bookings → Table setup</div>
          </div>
        )}
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 18, padding: '8px 16px', background: '#141413', borderTop: '0.5px solid #222', fontSize: 11, color: '#555', alignItems: 'center', flexShrink: 0 }}>
        {[['#22c55e','Free — click to block'], ['#6366f1','Booked'], ['#C41E3A','Seated'], ['#6b7280','Blocked'], ['#C9973A','Combined']].map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: '#3a3a38' }}>
          {totalCovers} covers · {tables.length} tables · {tables.reduce((s: number, t: any) => s + t.capacity, 0)} seats
        </div>
      </div>

      {showRecommend && (
        <BlockRecommendModal tables={tables} bookings={bookings} date={date} onApply={applyAI} onClose={() => setShowRecommend(false)} />
      )}
    </div>
  );
}
