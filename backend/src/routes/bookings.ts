import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { format } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const MODEL = 'claude-haiku-4-5';

// ── Seating plans ─────────────────────────────────────────────────────────────

router.get('/seating-plans', authenticate, async (_req, res, next) => {
  try {
    const plans = await db('seating_plans').where({ is_active: true }).orderBy('created_at', 'desc').select('id', 'name', 'extracted_layout', 'created_at');
    res.json({ data: plans });
  } catch (err) { next(err); }
});

router.post('/seating-plans', authenticate, requireManager, async (req, res, next) => {
  try {
    const { name, image_base64, media_type } = req.body;
    if (!image_base64) throw new AppError('image_base64 is required', 422);

    const [plan] = await db('seating_plans')
      .insert({ name: name || 'Main floor', image_base64, created_by: req.user!.sub })
      .returning('*');

    res.status(201).json({ data: plan, message: 'Seating plan saved. Use /extract to read the layout.' });
  } catch (err) { next(err); }
});

// AI extracts table layout from seating plan image — Haiku only
router.post('/seating-plans/:id/extract', authenticate, requireManager, async (req, res, next) => {
  try {
    const plan = await db('seating_plans').where({ id: req.params.id }).first();
    if (!plan) throw new AppError('Seating plan not found', 404);
    if (!plan.image_base64) throw new AppError('No image uploaded for this plan', 422);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new AppError('Anthropic API key not configured', 500);

    const existingTables = await db('restaurant_tables').where({ is_active: true }).select('name', 'capacity', 'section');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: req.body.media_type || 'image/jpeg', data: plan.image_base64 } },
            {
              type: 'text',
              text: `This is a restaurant floor plan or seating diagram. Extract the table layout.

${existingTables.length > 0 ? `Known tables already in the system:\n${existingTables.map((t: any) => `- ${t.name} (seats ${t.capacity}, section: ${t.section})`).join('\n')}` : 'No tables set up yet.'}

Return ONLY a JSON object, no other text:
{
  "tables": [
    {
      "name": "Table 1",
      "capacity": 4,
      "section": "Main",
      "shape": "rectangle",
      "pos_x": 25,
      "pos_y": 30,
      "notes": ""
    }
  ],
  "adjacencies": [["Table 1", "Table 2"]],
  "sections": ["Main", "Bar", "Outside"],
  "summary": "Brief description of the layout"
}

Rules:
- pos_x and pos_y are percentage positions (0-100) on the floor plan
- section should be one of: Main, Bar, Outside, Private, or a descriptive name
- adjacencies list pairs of table names that are physically next to each other (can be pushed together)
- capacity is your best estimate from the diagram
- shape is rectangle or round
- If tables match existing ones, use the same names`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) throw new AppError('AI extraction failed', 500);
    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '{}';

    let extracted: any = {};
    try { extracted = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { throw new AppError('Could not parse AI response — try a clearer image.', 422); }

    // Save extracted layout to plan
    await db('seating_plans').where({ id: req.params.id }).update({ extracted_layout: JSON.stringify(extracted), updated_at: db.fn.now() });

    res.json({ data: extracted, message: `Found ${extracted.tables?.length || 0} tables. Review and import below.` });
  } catch (err) { next(err); }
});

// Import extracted tables into restaurant_tables
router.post('/seating-plans/:id/import', authenticate, requireManager, async (req, res, next) => {
  try {
    const { tables, adjacencies } = req.body;
    if (!tables?.length) throw new AppError('No tables to import', 422);

    await db.transaction(async (trx: any) => {
      // Upsert tables by name
      for (const t of tables) {
        const existing = await trx('restaurant_tables').where({ name: t.name }).first();
        if (existing) {
          await trx('restaurant_tables').where({ id: existing.id }).update({
            capacity: t.capacity, section: t.section || 'Main',
            shape: t.shape || 'rectangle', pos_x: t.pos_x || 0, pos_y: t.pos_y || 0,
            notes: t.notes || null, updated_at: trx.fn.now(),
          });
        } else {
          await trx('restaurant_tables').insert({
            name: t.name, capacity: t.capacity, section: t.section || 'Main',
            shape: t.shape || 'rectangle', pos_x: t.pos_x || 0, pos_y: t.pos_y || 0,
            notes: t.notes || null, created_by: req.user!.sub,
          });
        }
      }

      // Save adjacencies
      if (adjacencies?.length) {
        for (const [nameA, nameB] of adjacencies) {
          const tA = await trx('restaurant_tables').where({ name: nameA }).first();
          const tB = await trx('restaurant_tables').where({ name: nameB }).first();
          if (tA && tB) {
            await trx('table_adjacencies')
              .insert({ table_a: tA.id, table_b: tB.id })
              .onConflict(['table_a', 'table_b']).ignore();
            await trx('table_adjacencies')
              .insert({ table_a: tB.id, table_b: tA.id })
              .onConflict(['table_a', 'table_b']).ignore();
          }
        }
      }
    });

    const updatedTables = await db('restaurant_tables').where({ is_active: true }).orderBy(['section', 'name']).select('*');
    res.json({ data: updatedTables, message: `${tables.length} tables imported.` });
  } catch (err) { next(err); }
});

// ── Tables ────────────────────────────────────────────────────────────────────

router.get('/tables', authenticate, async (_req, res, next) => {
  try {
    const tables = await db('restaurant_tables').where({ is_active: true }).orderBy(['section', 'name']).select('*');
    res.json({ data: tables });
  } catch (err) { next(err); }
});

const TableSchema = z.object({
  name:     z.string().min(1).max(100),
  capacity: z.number().int().min(1).max(50),
  section:  z.string().max(100).optional().default('Main'),
  shape:    z.enum(['rectangle', 'round']).optional().default('rectangle'),
  pos_x:    z.number().optional().default(0),
  pos_y:    z.number().optional().default(0),
  notes:    z.string().max(300).optional().nullable(),
});

router.post('/tables', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = TableSchema.parse(req.body);
    const [t] = await db('restaurant_tables').insert({ ...body, created_by: req.user!.sub }).returning('*');
    res.status(201).json({ data: t });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.patch('/tables/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = TableSchema.partial().parse(req.body);
    const [t] = await db('restaurant_tables').where({ id: req.params.id }).update({ ...body, updated_at: db.fn.now() }).returning('*');
    if (!t) throw new AppError('Table not found', 404);
    res.json({ data: t });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.delete('/tables/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    await db('restaurant_tables').where({ id: req.params.id }).update({ is_active: false });
    res.json({ message: 'Table removed.' });
  } catch (err) { next(err); }
});

// Adjacencies
router.post('/tables/adjacencies', authenticate, requireManager, async (req, res, next) => {
  try {
    const { table_a, table_b } = req.body;
    await db('table_adjacencies').insert({ table_a, table_b }).onConflict(['table_a', 'table_b']).ignore();
    await db('table_adjacencies').insert({ table_a: table_b, table_b: table_a }).onConflict(['table_a', 'table_b']).ignore();
    res.json({ message: 'Tables linked as adjacent.' });
  } catch (err) { next(err); }
});

router.delete('/tables/adjacencies', authenticate, requireManager, async (req, res, next) => {
  try {
    const { table_a, table_b } = req.body;
    await db('table_adjacencies').where({ table_a, table_b }).orWhere({ table_a: table_b, table_b: table_a }).delete();
    res.json({ message: 'Adjacency removed.' });
  } catch (err) { next(err); }
});

// ── Bookings ──────────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { date, status } = req.query;
    const bookings = await db('bookings as b')
      .modify((q: any) => {
        if (date) q.where('b.booking_date', date as string);
        if (status) q.where('b.status', status as string);
      })
      .orderBy(['b.booking_date', 'b.booking_time'])
      .limit(200)
      .select('b.*');

    // Attach table assignments
    const ids = bookings.map((b: any) => b.id);
    const assignments = ids.length
      ? await db('table_assignments as ta')
          .join('restaurant_tables as t', 'ta.table_id', 't.id')
          .whereIn('ta.booking_id', ids)
          .select('ta.booking_id', 't.id as table_id', 't.name as table_name', 't.capacity', 't.section')
      : [];

    const assignMap: Record<string, any[]> = {};
    for (const a of assignments) {
      if (!assignMap[a.booking_id]) assignMap[a.booking_id] = [];
      assignMap[a.booking_id].push(a);
    }

    res.json({ data: bookings.map((b: any) => ({ ...b, tables: assignMap[b.id] || [] })) });
  } catch (err) { next(err); }
});

// Today's covers count
router.get('/covers/today', authenticate, async (_req, res, next) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const result = await db('bookings')
      .where({ booking_date: today })
      .whereIn('status', ['confirmed', 'seated'])
      .sum('party_size as covers')
      .count('id as booking_count')
      .first();
    res.json({ data: { covers: parseInt(result?.covers as string || '0'), booking_count: parseInt(result?.booking_count as string || '0'), date: today } });
  } catch (err) { next(err); }
});

const BookingSchema = z.object({
  booking_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time:   z.string(),
  party_size:     z.number().int().min(1).max(100),
  guest_name:     z.string().min(1).max(200),
  guest_phone:    z.string().max(50).optional().nullable(),
  guest_email:    z.string().email().optional().nullable(),
  dietary_notes:  z.string().max(500).optional().nullable(),
  internal_notes: z.string().max(500).optional().nullable(),
  duration_mins:  z.number().int().min(30).max(480).optional().default(90),
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const body = BookingSchema.parse(req.body);
    const [booking] = await db('bookings')
      .insert({ ...body, status: 'confirmed', created_by: req.user!.sub })
      .returning('*');
    res.status(201).json({ data: { ...booking, tables: [] }, message: 'Booking confirmed.' });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const allowed = ['status', 'dietary_notes', 'internal_notes', 'booking_date', 'booking_time', 'party_size', 'duration_mins'];
    const update: any = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    const [updated] = await db('bookings').where({ id: req.params.id }).update({ ...update, updated_at: db.fn.now() }).returning('*');
    if (!updated) throw new AppError('Booking not found', 404);
    res.json({ data: updated });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    await db('bookings').where({ id: req.params.id }).update({ status: 'cancelled', updated_at: db.fn.now() });
    res.json({ message: 'Booking cancelled.' });
  } catch (err) { next(err); }
});

// Assign tables to booking
router.post('/:id/assign', authenticate, async (req, res, next) => {
  try {
    const { table_ids } = req.body;
    if (!table_ids?.length) throw new AppError('table_ids required', 422);

    await db('table_assignments').where({ booking_id: req.params.id }).delete();
    await db('table_assignments').insert(table_ids.map((tid: string) => ({ booking_id: req.params.id, table_id: tid })));

    const tables = await db('restaurant_tables').whereIn('id', table_ids).select('id', 'name', 'capacity', 'section');
    res.json({ data: tables, message: `Assigned to ${tables.map((t: any) => t.name).join(' + ')}.` });
  } catch (err) { next(err); }
});

export default router;
