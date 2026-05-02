import React, { useState, useRef, useCallback, useEffect } from 'react';
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
function useUpdateAdjacencies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/bookings/tables/adjacencies', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  });
}
function useRemoveAdjacency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.delete('/bookings/tables/adjacencies', { data: body }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  });
}
function useBlockRecommendations() {
  return useMutation({ mutationFn: (body: any) => api.post('/bookings/seating/block-recommend', body).then(r => r.data.data) });
}
function useAdjacencies() {
  return useQuery({ queryKey: ['adjacencies'], queryFn: () => api.get('/bookings/seating/adjacencies-all').then(r => r.data.data), staleTime: 60_000 });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 900;
const CANVAS_H = 620;
const TABLE_W  = 88;
const TABLE_H  = 72;

const STATUS_STYLES: Record<string, { fill: string; stroke: string; text: string; glow?: string }> = {
  free:     { fill: '#1a2e1a', stroke: '#22c55e', text: '#86efac' },
  booked:   { fill: '#1a1b3a', stroke: '#6366f1', text: '#a5b4fc' },
  seated:   { fill: '#2a0f0f', stroke: '#C41E3A', text: '#fca5a5' },
  blocked:  { fill: '#1c1c1c', stroke: '#4b5563', text: '#6b7280' },
  combined: { fill: '#1a2000', stroke: '#C9973A', text: '#fcd34d', glow: '0 0 10px #C9973A60' },
  editing:  { fill: '#1a1000', stroke: '#C9973A', text: '#fcd34d', glow: '0 0 12px #C9973A80' },
};

const TIMES = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 11;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

// ── Table SVG ─────────────────────────────────────────────────────────────────

function TableSVG({ table, status, label, onClick, onMouseDown, isSelected, isDragging }: {
  table: any; status: string; label?: string;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  isSelected?: boolean; isDragging?: boolean;
}) {
  const st = STATUS_STYLES[status] || STATUS_STYLES.free;
  const w = TABLE_W, h = TABLE_H;
  const isRound = table.shape === 'round';
  const chairs = Math.min(table.capacity, 8);

  const chairPositions: { x: number; y: number }[] = [];
  if (isRound) {
    const cx = w / 2, cy = h / 2, r = 28;
    for (let i = 0; i < chairs; i++) {
      const a = (i / chairs) * 2 * Math.PI - Math.PI / 2;
      chairPositions.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  } else {
    const perSide = Math.ceil(chairs / 2);
    const xStep = perSide > 1 ? (w - 20) / (perSide - 1) : 0;
    for (let i = 0; i < perSide && chairPositions.length < chairs; i++) {
      chairPositions.push({ x: 10 + i * xStep, y: 6 });
    }
    for (let i = 0; i < perSide && chairPositions.length < chairs; i++) {
      chairPositions.push({ x: 10 + i * xStep, y: h - 6 });
    }
  }

  return (
    <svg width={w} height={h}
      onClick={onClick}
      onMouseDown={onMouseDown}
      style={{ cursor: onMouseDown ? 'grab' : onClick ? 'pointer' : 'default', filter: (isSelected || st.glow) ? `drop-shadow(${isSelected ? '0 0 14px #C9973Aaa' : st.glow})` : undefined, opacity: isDragging ? 0.4 : 1, transition: 'filter 0.15s, opacity 0.15s' }}>
      {/* Chairs */}
      {chairPositions.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={5}
          fill={st.fill} stroke={st.stroke} strokeWidth="1" opacity="0.55" />
      ))}
      {/* Body */}
      {isRound
        ? <circle cx={w/2} cy={h/2} r={22} fill={st.fill} stroke={st.stroke} strokeWidth={isSelected ? 2.5 : 1.5} />
        : <rect x={8} y={13} width={w-16} height={h-26} rx={6} fill={st.fill} stroke={st.stroke} strokeWidth={isSelected ? 2.5 : 1.5} />
      }
      {/* Name */}
      <text x={w/2} y={isRound ? h/2-3 : h/2-2} textAnchor="middle" fill={st.text} fontSize="10" fontWeight="600" fontFamily="system-ui">
        {table.name}
      </text>
      <text x={w/2} y={isRound ? h/2+10 : h/2+10} textAnchor="middle" fill={st.text} fontSize="8" opacity="0.7" fontFamily="system-ui">
        {label || `${table.capacity}p`}
      </text>
    </svg>
  );
}

// ── Combine tables overlay (dotted rect around adjacent selected tables) ───────

function CombinedOverlay({ tableA, tableB, color }: { tableA: any; tableB: any; color: string }) {
  const x1 = Math.min(tableA.pos_x, tableB.pos_x) - 4;
  const y1 = Math.min(tableA.pos_y, tableB.pos_y) - 4;
  const x2 = Math.max(tableA.pos_x + TABLE_W, tableB.pos_x + TABLE_W) + 4;
  const y2 = Math.max(tableA.pos_y + TABLE_H, tableB.pos_y + TABLE_H) + 4;
  return (
    <rect x={x1} y={y1} width={x2-x1} height={y2-y1}
      rx={10} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="6 3" opacity="0.6" />
  );
}

// ── AI block modal ────────────────────────────────────────────────────────────

function BlockRecommendModal({ tables, bookings, combinedPairs, date, onApply, onClose }: {
  tables: any[]; bookings: any[]; combinedPairs: string[][]; date: string;
  onApply: (blocked: string[], combineSuggestions: string[][]) => void; onClose: () => void;
}) {
  const recommend = useBlockRecommendations();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const totalCovers = bookings
    .filter((b: any) => ['confirmed', 'seated'].includes(b.status))
    .reduce((s: number, b: any) => s + b.party_size, 0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await recommend.mutateAsync({
          date, total_covers: totalCovers,
          allow_combining: true,
          tables: tables.map((t: any) => ({
            id: t.id, name: t.name, capacity: t.capacity, section: t.section,
            shape: t.shape, is_free: t.is_free,
          })),
          bookings: bookings
            .filter((b: any) => ['confirmed', 'seated'].includes(b.status))
            .map((b: any) => ({
              party_size: b.party_size, booking_time: b.booking_time?.slice(0, 5),
              status: b.status, tables: b.tables?.map((t: any) => t.table_name),
            })),
        });
        setResult(res);
      } catch (e: any) {
        setResult({ error: e.response?.data?.error || 'Failed to get recommendation.' });
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: '#1a1a18', border: '0.5px solid #333', borderRadius: '16px', width: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, color: 'white', margin: 0 }}>🤖 AI floor recommendations</h3>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>
              {format(parseISO(date), 'EEEE d MMMM')} · {totalCovers} covers · {tables.filter((t: any) => t.is_free).length} free tables
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#666', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤖</div>
              Haiku is analysing your bookings and layout…
            </div>
          ) : result?.error ? (
            <div style={{ color: '#fca5a5', fontSize: '13px' }}>{result.error}</div>
          ) : result && (
            <>
              <div style={{ background: '#0f2420', border: '0.5px solid #10b981', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '13px', color: '#a7f3d0', lineHeight: 1.6 }}>{result.summary}</div>
              </div>

              {result.combine?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#C9973A', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>
                    ⟋ Combine for large parties ({result.combine.length})
                  </div>
                  {result.combine.map((c: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#1a1400', border: '0.5px solid #C9973A40', borderRadius: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#fcd34d' }}>{c.tables.join(' + ')}</span>
                      <span style={{ fontSize: '11px', color: '#92400e', flex: 1 }}>{c.reason}</span>
                      <span style={{ fontSize: '11px', color: '#fcd34d' }}>{c.combined_capacity}p total</span>
                    </div>
                  ))}
                </div>
              )}

              {result.block?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>
                    ✕ Block off ({result.block.length})
                  </div>
                  {result.block.map((item: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#1c1c1c', border: '0.5px solid #333', borderRadius: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>{item.table_name}</span>
                      <span style={{ fontSize: '11px', color: '#6b7280', flex: 1 }}>{item.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.keep_open?.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>
                    ✓ Keep open for walk-ins ({result.keep_open.length})
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {result.keep_open.map((item: any, i: number) => (
                      <span key={i} style={{ padding: '4px 10px', background: '#0f2420', border: '0.5px solid #22c55e40', borderRadius: '20px', fontSize: '12px', color: '#86efac' }}>
                        {item.table_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #333', display: 'flex', gap: '8px' }}>
          {result && !result.error && (
            <button onClick={() => {
              const blockIds = (result.block || []).map((b: any) => b.table_id).filter(Boolean);
              const combineNames = (result.combine || []).map((c: any) => c.tables);
              onApply(blockIds, combineNames);
              onClose();
            }} style={{ flex: 1, padding: '10px', background: '#C9973A', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              Apply recommendations
            </button>
          )}
          <button onClick={onClose} style={{ padding: '10px 14px', background: 'transparent', color: '#888', border: '0.5px solid #444', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main floor plan page ──────────────────────────────────────────────────────

export function FloorPlanPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate]   = useState(today);
  const [time, setTime]   = useState(format(new Date(), 'HH') + ':00');
  const [editMode, setEditMode]       = useState(false);
  const [combineMode, setCombineMode] = useState(false);
  const [blockedIds, setBlockedIds]   = useState<Set<string>>(new Set());
  const [combinedPairs, setCombinedPairs] = useState<string[][]>([]); // [tableIdA, tableIdB]
  const [selectedForCombine, setSelectedForCombine] = useState<string | null>(null);
  const [showRecommend, setShowRecommend] = useState(false);
  const [hoveredId, setHoveredId]     = useState<string | null>(null);
  const [savedMsg, setSavedMsg]       = useState('');

  // Drag state — use native window events to cover entire screen
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragId, setDragId]       = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Attach window-level drag listeners once
  useEffect(() => {
    function onWindowMouseMove(e: MouseEvent) {
      const d = dragging.current;
      if (!d || !svgRef.current) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const scaleX = CANVAS_W / svgRect.width;
      const scaleY = CANVAS_H / svgRect.height;
      const mouseXInSvg = (e.clientX - svgRect.left) * scaleX;
      const mouseYInSvg = (e.clientY - svgRect.top)  * scaleY;
      const newX = Math.max(0, Math.min(CANVAS_W - TABLE_W, mouseXInSvg - d.offsetX));
      const newY = Math.max(0, Math.min(CANVAS_H - TABLE_H, mouseYInSvg - d.offsetY));
      // Update via ref to avoid stale closure crash
      setPositions(p => ({ ...p, [d.id]: { x: newX, y: newY } }));
    }
    function onWindowMouseUp() {
      dragging.current = null;
      setDragId(null);
    }
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup',   onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup',   onWindowMouseUp);
    };
  }, []);

  const { data: floorData } = useFloorPlan(date, time);
  const { data: rawTables = [] } = useTables();
  const { data: bookings = [] }  = useBookings(date);
  const { data: adjData = [] }   = useAdjacencies();
  const updateTable   = useUpdateTable();
  const updateAdj     = useUpdateAdjacencies();
  const removeAdj     = useRemoveAdjacency();
  const qc            = useQueryClient();

  // Merge floor plan availability into tables
  const availMap: Record<string, any> = {};
  for (const t of (floorData?.tables || [])) availMap[t.id] = t;

  const tables = rawTables.map((t: any) => ({
    ...t,
    is_free: availMap[t.id]?.is_free ?? true,
    conflict_booking: availMap[t.id]?.conflict_booking,
    pos_x: positions[t.id]?.x ?? parseFloat(t.pos_x) ?? 50,
    pos_y: positions[t.id]?.y ?? parseFloat(t.pos_y) ?? 50,
  }));

  // Initialise positions from DB — auto-spread if all stacked at origin
  useEffect(() => {
    if (!rawTables.length) return;
    const init: Record<string, { x: number; y: number }> = {};
    let allAtOrigin = true;
    for (const t of rawTables) {
      const x = parseFloat(t.pos_x);
      const y = parseFloat(t.pos_y);
      if (x > 5 || y > 5) allAtOrigin = false;
      init[t.id] = { x: isNaN(x) || x === 0 ? 0 : x, y: isNaN(y) || y === 0 ? 0 : y };
    }
    // If everything is at 0,0 auto-arrange in a grid
    if (allAtOrigin) {
      const cols = Math.ceil(Math.sqrt(rawTables.length));
      rawTables.forEach((t: any, i: number) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        init[t.id] = { x: 40 + col * (TABLE_W + 30), y: 40 + row * (TABLE_H + 40) };
      });
    }
    setPositions(init);
  }, [rawTables.map((t: any) => t.id).join(',')]);

  // Adjacency pairs as sets of IDs
  const adjPairs: string[][] = adjData.map((a: any) => [a.table_a, a.table_b]);

  // Combined pairs from AI or manual
  const allCombined = new Set(combinedPairs.flat());

  function getStatus(table: any): string {
    if (editMode) return 'editing';
    if (blockedIds.has(table.id)) return 'blocked';
    if (allCombined.has(table.id)) return 'combined';
    if (!table.is_free) {
      const booking = bookings.find((b: any) =>
        b.tables?.some((t: any) => t.table_id === table.id) && b.status === 'seated'
      );
      return booking ? 'seated' : 'booked';
    }
    return 'free';
  }

  function getLabel(table: any) {
    const status = getStatus(table);
    if (status === 'blocked') return 'blocked';
    if (status === 'seated') {
      const b = bookings.find((b: any) => b.tables?.some((t: any) => t.table_id === table.id));
      return b?.guest_name?.split(' ')[0] || 'seated';
    }
    if (status === 'booked') {
      const b = bookings.find((b: any) => b.tables?.some((t: any) => t.table_id === table.id));
      return b?.booking_time?.slice(0, 5) || 'booked';
    }
    if (status === 'combined') return 'combined';
    return `${table.capacity}p`;
  }

  // ── Drag handlers ────────────────────────────────────────────────────────────

  function onTableMouseDown(e: React.MouseEvent, tableId: string) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    const svgRect = svgRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / svgRect.width;
    const scaleY = CANVAS_H / svgRect.height;
    const t = tables.find((t: any) => t.id === tableId)!;
    const mouseXInSvg = (e.clientX - svgRect.left) * scaleX;
    const mouseYInSvg = (e.clientY - svgRect.top)  * scaleY;
    // Store offset from mouse to table top-left corner
    dragging.current = {
      id: tableId,
      offsetX: mouseXInSvg - (t.pos_x ?? 0),
      offsetY: mouseYInSvg - (t.pos_y ?? 0),
    };
    setDragId(tableId);
  }

  // Mouse move/up handled by window listeners (see useEffect above)

  // ── Auto layout ──────────────────────────────────────────────────────────────

  function autoLayout() {
    // Group by section, then arrange each section in a cluster
    const sections = [...new Set(tables.map((t: any) => t.section as string))];
    const sectionCols = Math.ceil(Math.sqrt(sections.length));
    const sectionW = Math.floor(CANVAS_W / sectionCols);
    const newPositions: Record<string, { x: number; y: number }> = {};

    sections.forEach((section, si) => {
      const secTables = tables.filter((t: any) => t.section === section);
      const sCol = si % sectionCols;
      const sRow = Math.floor(si / sectionCols);
      const sectionH = Math.floor(CANVAS_H / Math.ceil(sections.length / sectionCols));
      const originX = sCol * sectionW + 20;
      const originY = sRow * sectionH + 40;
      const cols = Math.ceil(Math.sqrt(secTables.length));

      secTables.forEach((t: any, ti: number) => {
        const col = ti % cols;
        const row = Math.floor(ti / cols);
        newPositions[t.id] = {
          x: Math.min(CANVAS_W - TABLE_W - 10, originX + col * (TABLE_W + 24)),
          y: Math.min(CANVAS_H - TABLE_H - 10, originY + row * (TABLE_H + 36)),
        };
      });
    });

    setPositions(newPositions);
  }

  // ── Save layout ───────────────────────────────────────────────────────────────

  async function saveLayout() {
    try {
      await Promise.all(
        tables.map((t: any) => updateTable.mutateAsync({ id: t.id, pos_x: Math.round(t.pos_x), pos_y: Math.round(t.pos_y) }))
      );
      setSavedMsg('Layout saved ✓');
      setEditMode(false);
      setTimeout(() => setSavedMsg(''), 3000);
    } catch { setSavedMsg('Save failed'); }
  }

  // ── Combine mode ──────────────────────────────────────────────────────────────

  function handleTableClick(e: React.MouseEvent, table: any) {
    if (editMode) return;
    if (combineMode) {
      if (!selectedForCombine) {
        setSelectedForCombine(table.id);
      } else if (selectedForCombine !== table.id) {
        // Check if already combined
        const alreadyCombined = combinedPairs.some(
          p => (p[0] === selectedForCombine && p[1] === table.id) || (p[1] === selectedForCombine && p[0] === table.id)
        );
        if (alreadyCombined) {
          // Remove combination
          setCombinedPairs(prev => prev.filter(p => !(
            (p[0] === selectedForCombine && p[1] === table.id) || (p[1] === selectedForCombine && p[0] === table.id)
          )));
        } else {
          setCombinedPairs(prev => [...prev, [selectedForCombine, table.id]]);
        }
        setSelectedForCombine(null);
      } else {
        setSelectedForCombine(null);
      }
      return;
    }
    // Normal mode: toggle block on free/blocked tables
    const status = getStatus(table);
    if (status === 'free' || status === 'blocked') {
      setBlockedIds(prev => { const n = new Set(prev); n.has(table.id) ? n.delete(table.id) : n.add(table.id); return n; });
    }
  }

  function applyAIRecommendation(blockIds: string[], combineNamePairs: string[][]) {
    setBlockedIds(new Set(blockIds));
    // Resolve names to IDs
    const nameToId: Record<string, string> = {};
    for (const t of tables) nameToId[t.name] = t.id;
    const resolved = combineNamePairs.map(pair => pair.map(name => nameToId[name]).filter(Boolean)).filter(p => p.length === 2);
    setCombinedPairs(resolved);
  }

  // Stats
  const freeCount    = tables.filter((t: any) => t.is_free && !blockedIds.has(t.id) && !allCombined.has(t.id)).length;
  const bookedCount  = tables.filter((t: any) => !t.is_free).length;
  const blockedCount = blockedIds.size;
  const combinedCount = combinedPairs.length;
  const totalCovers  = bookings.filter((b: any) => ['confirmed','seated'].includes(b.status)).reduce((s: number, b: any) => s + b.party_size, 0);

  // Tooltip booking
  function getTooltipBooking(tableId: string) {
    return bookings.find((b: any) => b.tables?.some((t: any) => t.table_id === tableId));
  }

  return (
    <div style={{ height: '100vh', background: '#0d0d0c', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: '#1a1a18', borderBottom: '0.5px solid #2a2a28', flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={() => window.history.back()}
          style={{ background: 'transparent', border: 'none', color: '#777', cursor: 'pointer', fontSize: '13px', padding: '5px 8px', borderRadius: '6px' }}>
          ← Back
        </button>
        <div style={{ width: '0.5px', height: '18px', background: '#333' }} />
        <div style={{ fontSize: '14px', fontWeight: 500 }}>Floor plan</div>

        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ fontSize: '13px', padding: '5px 10px', background: '#252523', border: '0.5px solid #3a3a38', borderRadius: '7px', color: 'white' }} />
        <select value={time} onChange={e => setTime(e.target.value)}
          style={{ fontSize: '13px', padding: '5px 10px', background: '#252523', border: '0.5px solid #3a3a38', borderRadius: '7px', color: 'white' }}>
          {TIMES.map((t: any) => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '14px', marginLeft: '4px' }}>
          {[
            { label: 'Free', count: freeCount, color: '#22c55e' },
            { label: 'Booked', count: bookedCount, color: '#6366f1' },
            { label: 'Blocked', count: blockedCount, color: '#6b7280' },
            { label: 'Combined', count: combinedCount, color: '#C9973A' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
              <span style={{ color: '#777' }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{count}</span>
            </div>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {savedMsg && <span style={{ fontSize: '12px', color: '#22c55e' }}>{savedMsg}</span>}

          {/* Combine mode toggle */}
          {!editMode && (
            <button onClick={() => { setCombineMode(v => !v); setSelectedForCombine(null); }}
              style={{ fontSize: '12px', padding: '6px 12px', background: combineMode ? '#C9973A' : 'transparent', border: `0.5px solid ${combineMode ? '#C9973A' : '#444'}`, borderRadius: '7px', color: combineMode ? 'white' : '#aaa', cursor: 'pointer', fontWeight: combineMode ? 500 : 400 }}>
              ⟋ {combineMode ? 'Combining…' : 'Combine tables'}
            </button>
          )}

          {combinedPairs.length > 0 && !editMode && (
            <button onClick={() => setCombinedPairs([])}
              style={{ fontSize: '12px', padding: '6px 10px', background: 'transparent', border: '0.5px solid #444', borderRadius: '7px', color: '#888', cursor: 'pointer' }}>
              Clear combos
            </button>
          )}

          {blockedIds.size > 0 && !editMode && (
            <button onClick={() => setBlockedIds(new Set())}
              style={{ fontSize: '12px', padding: '6px 10px', background: 'transparent', border: '0.5px solid #444', borderRadius: '7px', color: '#888', cursor: 'pointer' }}>
              Clear blocked
            </button>
          )}

          {!editMode && (
            <button onClick={() => setShowRecommend(true)}
              style={{ fontSize: '12px', padding: '6px 12px', background: '#1a2e1a', border: '0.5px solid #22c55e40', borderRadius: '7px', color: '#86efac', cursor: 'pointer', fontWeight: 500 }}>
              🤖 AI recommend
            </button>
          )}

          {/* Edit mode */}
          {editMode ? (
            <>
              <button onClick={saveLayout} disabled={updateTable.isPending}
                style={{ fontSize: '12px', padding: '6px 14px', background: '#22c55e', border: 'none', borderRadius: '7px', color: 'white', cursor: 'pointer', fontWeight: 500 }}>
                {updateTable.isPending ? 'Saving…' : 'Save layout'}
              </button>
              <button onClick={() => { setEditMode(false); setPositions({}); }}
                style={{ fontSize: '12px', padding: '6px 12px', background: 'transparent', border: '0.5px solid #444', borderRadius: '7px', color: '#888', cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)}
              style={{ fontSize: '12px', padding: '6px 12px', background: '#252523', border: '0.5px solid #444', borderRadius: '7px', color: '#aaa', cursor: 'pointer' }}>
              ✎ Edit layout
            </button>
          )}
        </div>
      </div>

      {/* ── Mode hints ─────────────────────────────────────────────────────── */}
      {(editMode || combineMode) && (
        <div style={{ padding: '8px 20px', background: editMode ? '#1a1000' : '#1a1000', borderBottom: '0.5px solid #333', fontSize: '12px', color: '#C9973A', flexShrink: 0 }}>
          {editMode
            ? '✎ Edit mode — drag tables to reposition them, then click Save layout'
            : combineMode
              ? selectedForCombine
                ? `⟋ Now click a second table to combine with ${tables.find((t: any) => t.id === selectedForCombine)?.name}`
                : '⟋ Click two tables to mark them as combined — click an existing combo to split it'
              : ''}
        </div>
      )}

      {/* ── Canvas ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '16px', minHeight: 0 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block', background: '#111110', borderRadius: '12px', border: '0.5px solid #222', userSelect: 'none' }}

        >
          {/* Grid dots */}
          <defs>
            <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="1.2" fill={editMode ? "#3a3a36" : "#1f1f1d"} />
            </pattern>
          </defs>
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#dots)" />
          {editMode && (
            <rect width={CANVAS_W} height={CANVAS_H} fill="none" stroke="#C9973A" strokeWidth="1.5"
              strokeDasharray="8 4" rx="10" opacity="0.3" />
          )}

          {/* Combine pair overlays */}
          {combinedPairs.map((pair, i) => {
            const tA = tables.find((t: any) => t.id === pair[0]);
            const tB = tables.find((t: any) => t.id === pair[1]);
            if (!tA || !tB) return null;
            return <CombinedOverlay key={i} tableA={tA} tableB={tB} color="#C9973A" />;
          })}

          {/* Selected-for-combine highlight */}
          {selectedForCombine && (() => {
            const t = tables.find((t: any) => t.id === selectedForCombine);
            if (!t) return null;
            return <rect x={t.pos_x - 6} y={t.pos_y - 6} width={TABLE_W + 12} height={TABLE_H + 12} rx={10} fill="none" stroke="#C9973A" strokeWidth="2" strokeDasharray="4 2" />;
          })()}

          {/* Tables */}
          {tables.map((table: any) => {
            const status = getStatus(table);
            const hovered = hoveredId === table.id;
            const booking = getTooltipBooking(table.id);

            return (
              <g key={table.id}
                transform={`translate(${table.pos_x}, ${table.pos_y})`}
                onMouseEnter={() => setHoveredId(table.id)}
                onMouseLeave={() => setHoveredId(null)}>
                <TableSVG
                  table={table}
                  status={status}
                  label={getLabel(table)}
                  isSelected={selectedForCombine === table.id}
                  isDragging={dragId === table.id}
                  onMouseDown={editMode ? (e) => onTableMouseDown(e, table.id) : undefined}
                  onClick={!editMode ? (e) => handleTableClick(e, table) : undefined}
                />

                {/* Hover tooltip */}
                {hovered && !editMode && (
                  <foreignObject x={TABLE_W + 6} y={-10} width="180" height="120">
                    <div style={{ background: '#0f0f0e', border: '0.5px solid #333', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#d1d5db', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
                      <div style={{ fontWeight: 600, marginBottom: '3px', fontSize: '12px' }}>{table.name} · {table.capacity}p</div>
                      {booking ? (
                        <>
                          <div style={{ color: '#9ca3af' }}>{booking.guest_name}</div>
                          <div style={{ color: '#9ca3af' }}>Party of {booking.party_size} · {booking.booking_time?.slice(0,5)}</div>
                          {booking.dietary_notes && <div style={{ color: '#fca5a5', marginTop: '2px' }}>⚠ {booking.dietary_notes}</div>}
                        </>
                      ) : status === 'blocked' ? (
                        <div style={{ color: '#6b7280' }}>Blocked · click to unblock</div>
                      ) : status === 'combined' ? (
                        <div style={{ color: '#fcd34d' }}>Combined with adjacent table</div>
                      ) : (
                        <div style={{ color: '#86efac' }}>Free · click to block</div>
                      )}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Empty state */}
          {tables.length === 0 && (
            <text x={CANVAS_W/2} y={CANVAS_H/2} textAnchor="middle" fill="#444" fontSize="14" fontFamily="system-ui">
              No tables — go to Bookings → Table setup to add tables or upload your floor plan
            </text>
          )}
        </svg>
      </div>

      {/* ── Bottom legend ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '20px', padding: '10px 20px', background: '#141413', borderTop: '0.5px solid #222', fontSize: '11px', color: '#555', alignItems: 'center', flexShrink: 0 }}>
        {[
          { color: '#22c55e', label: 'Free — click to block' },
          { color: '#6366f1', label: 'Booked' },
          { color: '#C41E3A', label: 'Seated' },
          { color: '#6b7280', label: 'Blocked' },
          { color: '#C9973A', label: 'Combined' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: color }} />
            <span>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: '#444', fontSize: '11px' }}>
          {totalCovers} covers booked · {tables.length} tables · {tables.reduce((s: number, t: any) => s + t.capacity, 0)} total seats
        </div>
      </div>

      {showRecommend && (
        <BlockRecommendModal
          tables={tables}
          bookings={bookings}
          combinedPairs={combinedPairs}
          date={date}
          onApply={applyAIRecommendation}
          onClose={() => setShowRecommend(false)}
        />
      )}
    </div>
  );
}
