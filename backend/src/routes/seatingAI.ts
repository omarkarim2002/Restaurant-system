import { Router, Request, Response, NextFunction } from 'express';
import { format } from 'date-fns';
import db from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const MODEL = 'claude-haiku-4-5';

// ─────────────────────────────────────────────────────────────────────────────
// ── AVAILABILITY ENGINE ───────────────────────────────────────────────────────
// Returns tables that are free for a given date/time/duration
// ─────────────────────────────────────────────────────────────────────────────

interface TableAvailability {
  id: string;
  name: string;
  capacity: number;
  section: string;
  shape: string;
  pos_x: number;
  pos_y: number;
  is_free: boolean;
  conflict_booking?: string;
}

async function getTableAvailability(
  date: string,
  time: string,
  durationMins: number
): Promise<TableAvailability[]> {
  const tables = await db('restaurant_tables')
    .where({ is_active: true })
    .orderBy(['section', 'name'])
    .select('*');

  // Find bookings that overlap with the requested time window
  const [startH, startM] = time.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins   = startMins + durationMins;

  const existingBookings = await db('bookings as b')
    .join('table_assignments as ta', 'b.id', 'ta.booking_id')
    .where('b.booking_date', date)
    .whereNotIn('b.status', ['cancelled', 'completed', 'no_show'])
    .select('ta.table_id', 'b.booking_time', 'b.duration_mins', 'b.guest_name');

  // Build conflict map: table_id → booking name
  const conflictMap: Record<string, string> = {};
  for (const booking of existingBookings) {
    const [bH, bM] = (booking.booking_time as string).split(':').map(Number);
    const bStart = bH * 60 + bM;
    const bEnd   = bStart + (booking.duration_mins || 90);
    // Overlaps if not (new ends before existing starts OR new starts after existing ends)
    const overlaps = !(endMins <= bStart || startMins >= bEnd);
    if (overlaps) conflictMap[booking.table_id] = booking.guest_name;
  }

  return tables.map((t: any) => ({
    id:       t.id,
    name:     t.name,
    capacity: t.capacity,
    section:  t.section,
    shape:    t.shape,
    pos_x:    parseFloat(t.pos_x) || 0,
    pos_y:    parseFloat(t.pos_y) || 0,
    is_free:  !conflictMap[t.id],
    conflict_booking: conflictMap[t.id],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// ── RECOMMENDATION ENGINE ─────────────────────────────────────────────────────
// Given party size + available tables + adjacency info, ask Haiku for options
// ─────────────────────────────────────────────────────────────────────────────

export interface SeatingOption {
  option_number: number;
  table_ids: string[];
  table_names: string[];
  total_capacity: number;
  fit: 'exact' | 'good' | 'combined' | 'oversized';
  label: string;
  reasoning: string;
  score: number; // 1-10, higher = better
}

async function generateSeatingOptions(
  partySize: number,
  freeTables: TableAvailability[],
  adjacencies: Array<{ table_a: string; table_b: string }>,
  section?: string
): Promise<SeatingOption[]> {
  if (freeTables.length === 0) return [];

  // Filter by section preference
  const candidates = section
    ? freeTables.filter(t => t.section === section)
    : freeTables;

  const eligible = candidates.filter(t => t.is_free);
  if (eligible.length === 0) return [];

  // Build adjacency pairs from eligible tables
  const eligibleIds = new Set(eligible.map(t => t.id));
  const eligibleAdj = adjacencies.filter(
    a => eligibleIds.has(a.table_a) && eligibleIds.has(a.table_b)
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key not configured');

  const tableList = eligible.map(t =>
    `- ${t.name}: capacity ${t.capacity}, section ${t.section}${t.shape === 'round' ? ' (round)' : ''}`
  ).join('\n');

  const adjList = eligibleAdj.length > 0
    ? eligibleAdj.map(a => {
        const tA = eligible.find(t => t.id === a.table_a);
        const tB = eligible.find(t => t.id === a.table_b);
        return `${tA?.name} + ${tB?.name}`;
      }).filter((v, i, arr) => arr.indexOf(v) === i).join(', ')
    : 'none';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `You are a restaurant seating assistant. Recommend 2-3 seating options for a party of ${partySize}.

Available free tables:
${tableList}

Adjacent tables that can be combined:
${adjList}

Return ONLY a JSON array of options, no other text:
[
  {
    "option_number": 1,
    "table_names": ["Table 3"],
    "total_capacity": 4,
    "fit": "exact",
    "label": "Table 3 — seats exactly ${partySize}",
    "reasoning": "Perfect fit — seats exactly your party size with no wasted space.",
    "score": 9
  }
]

Ranking rules (score 1-10):
- Exact fit single table: 9-10
- Single table 1-2 seats over: 7-8
- Combined adjacent tables exact/near exact: 6-8
- Single table 3+ seats over: 4-6
- Combined tables with excess: 3-5

fit values: "exact" (capacity = party size), "good" (1-2 over), "combined" (multiple tables), "oversized" (3+ over)

Give 2-3 best options only. Do not suggest tables smaller than the party size.
Prefer same-section combinations when combining. Consider round tables for intimacy.`,
      }],
    }),
  });

  if (!response.ok) throw new Error('AI recommendation failed');
  const data = await response.json() as any;
  const text = data.content?.[0]?.text || '[]';

  let options: any[] = [];
  try { options = JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return []; }

  // Resolve table names back to IDs
  const nameToId: Record<string, string> = {};
  for (const t of eligible) nameToId[t.name] = t.id;

  return options
    .filter((o: any) => o.table_names?.length > 0)
    .map((o: any) => ({
      ...o,
      table_ids: (o.table_names || []).map((name: string) => nameToId[name]).filter(Boolean),
    }))
    .filter((o: any) => o.table_ids.length === o.table_names?.length); // only include if all resolved
}

// ── GET /bookings/seating/availability?date=&time=&duration_mins=&party_size= ─

router.get('/availability', authenticate, async (req, res, next) => {
  try {
    const { date, time, duration_mins, party_size } = req.query;
    if (!date || !time) throw new AppError('date and time are required', 422);

    const availability = await getTableAvailability(
      date as string,
      time as string,
      parseInt(duration_mins as string) || 90
    );

    const free     = availability.filter(t => t.is_free);
    const occupied = availability.filter(t => !t.is_free);

    res.json({
      data: {
        date, time,
        all_tables: availability,
        free_tables: free,
        occupied_tables: occupied,
        free_count: free.length,
        total_free_capacity: free.reduce((s, t) => s + t.capacity, 0),
      }
    });
  } catch (err) { next(err); }
});

// ── POST /bookings/seating/recommend ─────────────────────────────────────────
// Main endpoint — returns AI seating options for a party

router.post('/recommend', authenticate, async (req, res, next) => {
  try {
    const { date, time, party_size, duration_mins = 90, section } = req.body;
    if (!date || !time || !party_size) throw new AppError('date, time, party_size required', 422);

    // Get available tables
    const availability = await getTableAvailability(date, time, duration_mins);
    const freeTables   = availability.filter(t => t.is_free);

    // Get adjacencies for free tables
    const freeIds = freeTables.map(t => t.id);
    const adjacencies = freeIds.length
      ? await db('table_adjacencies')
          .whereIn('table_a', freeIds)
          .whereIn('table_b', freeIds)
          .select('table_a', 'table_b')
      : [];

    if (freeTables.length === 0) {
      return res.json({
        data: {
          options: [],
          message: 'No tables available for this time slot.',
          free_tables: [],
          party_size,
        }
      });
    }

    // Check if any table can fit the party at all
    const maxSingleCapacity = Math.max(...freeTables.map(t => t.capacity));
    const maxCombinedCapacity = freeTables.reduce((s, t) => s + t.capacity, 0);

    if (maxCombinedCapacity < party_size) {
      return res.json({
        data: {
          options: [],
          message: `Cannot accommodate a party of ${party_size} — maximum available capacity is ${maxCombinedCapacity}.`,
          free_tables: freeTables,
          party_size,
        }
      });
    }

    const options = await generateSeatingOptions(party_size, freeTables, adjacencies, section);

    res.json({
      data: {
        options: options.sort((a, b) => b.score - a.score),
        free_tables: freeTables,
        occupied_tables: availability.filter(t => !t.is_free),
        party_size,
        message: options.length > 0 ? `${options.length} seating option${options.length !== 1 ? 's' : ''} found.` : 'No suitable options found.',
      }
    });
  } catch (err) { next(err); }
});

// ── GET /bookings/seating/floor-plan?date=&time=&duration_mins= ───────────────
// Returns all tables with their current status for the floor plan view

router.get('/floor-plan', authenticate, async (req, res, next) => {
  try {
    const { date, time, duration_mins } = req.query;
    const useDate = (date as string) || format(new Date(), 'yyyy-MM-dd');
    const useTime = (time as string) || format(new Date(), 'HH:mm');

    const availability = await getTableAvailability(useDate, useTime, parseInt(duration_mins as string) || 90);

    // Get section list for layout
    const sections = [...new Set(availability.map(t => t.section))];

    res.json({ data: { tables: availability, sections, date: useDate, time: useTime } });
  } catch (err) { next(err); }
});



// ── POST /bookings/seating/block-recommend ────────────────────────────────────
// Haiku analyses the day's bookings and recommends which tables to block
// to consolidate covers and free up staff from running the whole floor.

router.post('/block-recommend', authenticate, async (req, res, next) => {
  try {
    const { date, tables, bookings, total_covers } = req.body;
    if (!tables?.length) throw new AppError('tables required', 422);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new AppError('Anthropic API key not configured', 500);

    const freeTables  = tables.filter((t: any) => t.is_free);
    const bookedTables = tables.filter((t: any) => !t.is_free);

    const tableList = tables.map((t: any) =>
      `- ${t.name}: ${t.capacity} seats, ${t.section} section${!t.is_free ? ' [BOOKED]' : ''}`
    ).join('\n');

    const bookingList = (bookings || []).map((b: any) =>
      `- Party of ${b.party_size} at ${b.booking_time || '?'} (${b.status})${b.tables ? ` → ${b.tables.join(', ')}` : ''}`
    ).join('\n') || 'No bookings yet';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `You are a restaurant floor manager. Recommend which tables to block off for today to make the floor more efficient.

Date: ${date}
Total covers booked: ${total_covers}
Total free tables: ${freeTables.length}

All tables:
${tableList}

Today's bookings:
${bookingList}

Goals:
1. Make sure all booked covers can be seated comfortably
2. Consolidate open tables into a smaller area when it's quiet — saves staff running the whole floor
3. Block tables that are far from booked tables, awkward to serve alone, or too small/large to be useful
4. Never block a table that already has a booking

Return ONLY a JSON object, no other text:
{
  "summary": "One sentence explaining the recommendation",
  "block": [
    { "table_id": "...", "table_name": "Table X", "capacity": 4, "reason": "Brief reason" }
  ],
  "keep_open": [
    { "table_id": "...", "table_name": "Table Y", "capacity": 6 }
  ]
}

Only recommend blocking truly free tables. If it's a busy day with ${total_covers}+ covers, suggest blocking fewer tables.`,
        }],
      }),
    });

    if (!response.ok) throw new AppError('AI recommendation failed', 500);
    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '{}';

    let result: any = {};
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { throw new AppError('Could not parse AI response', 422); }

    // Resolve table_ids — Haiku may not know the UUIDs, match by name
    const nameToTable: Record<string, any> = {};
    for (const t of tables) nameToTable[t.name] = t;

    if (result.block) {
      result.block = result.block.map((b: any) => ({
        ...b,
        table_id: nameToTable[b.table_name]?.id || b.table_id,
        capacity: nameToTable[b.table_name]?.capacity || b.capacity,
      })).filter((b: any) => b.table_id);
    }

    if (result.keep_open) {
      result.keep_open = result.keep_open.map((k: any) => ({
        ...k,
        table_id: nameToTable[k.table_name]?.id || k.table_id,
      }));
    }

    res.json({ data: result });
  } catch (err) { next(err); }
});

export { getTableAvailability, generateSeatingOptions };
export default router;
