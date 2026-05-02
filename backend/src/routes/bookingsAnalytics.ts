import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { format, subDays, startOfWeek, parseISO } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── PHASE 3: Covers Forecasting ───────────────────────────────────────────────

// GET /bookings/analytics/forecast?date= — get or build forecast for a date
router.get('/forecast', authenticate, async (req, res, next) => {
  try {
    const date = (req.query.date as string) || format(new Date(), 'yyyy-MM-dd');
    const dow  = new Date(date + 'T12:00:00Z').getDay();

    // Get booked covers
    const bookedResult = await db('bookings')
      .where({ booking_date: date })
      .whereIn('status', ['confirmed', 'seated', 'completed'])
      .sum('party_size as covers')
      .first();
    const bookedCovers = parseInt(bookedResult?.covers as string || '0');

    // Get walk-in config for this day
    const config = await db('walk_in_config').where({ day_of_week: dow }).first();
    const bufferPct = parseFloat(config?.buffer_pct || '0.20');
    const totalForecast = Math.round(bookedCovers * (1 + bufferPct));

    // Upsert forecast
    const [forecast] = await db('covers_forecasts')
      .insert({ forecast_date: date, booked_covers: bookedCovers, walk_in_buffer: bufferPct, total_forecast: totalForecast })
      .onConflict('forecast_date')
      .merge({ booked_covers: bookedCovers, total_forecast: totalForecast, updated_at: db.fn.now() })
      .returning('*');

    res.json({ data: forecast });
  } catch (err) { next(err); }
});

// PATCH /bookings/analytics/forecast/:date/actual — log actual covers after service
router.patch('/forecast/:date/actual', authenticate, requireManager, async (req, res, next) => {
  try {
    const { actual_covers, notes } = req.body;
    const [updated] = await db('covers_forecasts')
      .where({ forecast_date: req.params.date })
      .update({ actual_covers: parseInt(actual_covers), notes: notes || null, updated_at: db.fn.now() })
      .returning('*');
    if (!updated) throw new AppError('Forecast not found — call GET first to initialise', 404);
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// GET /bookings/analytics/forecast/accuracy — forecast vs actual over time
router.get('/forecast/accuracy', authenticate, requireManager, async (_req, res, next) => {
  try {
    const rows = await db('covers_forecasts')
      .whereNotNull('actual_covers')
      .orderBy('forecast_date', 'desc')
      .limit(30)
      .select('*');

    const withAccuracy = rows.map((r: any) => ({
      ...r,
      variance: r.actual_covers - r.total_forecast,
      accuracy_pct: r.total_forecast > 0
        ? Math.round((1 - Math.abs(r.actual_covers - r.total_forecast) / r.total_forecast) * 100)
        : null,
    }));

    const avgAccuracy = withAccuracy.filter((r: any) => r.accuracy_pct !== null).reduce((s: number, r: any) => s + r.accuracy_pct, 0) / (withAccuracy.filter((r: any) => r.accuracy_pct !== null).length || 1);

    res.json({ data: { rows: withAccuracy, avg_accuracy_pct: Math.round(avgAccuracy) } });
  } catch (err) { next(err); }
});

// PATCH /bookings/analytics/walk-in-config/:dow — update buffer for a day
router.patch('/walk-in-config/:dow', authenticate, requireManager, async (req, res, next) => {
  try {
    const { buffer_pct } = req.body;
    await db('walk_in_config').where({ day_of_week: req.params.dow }).update({ buffer_pct: parseFloat(buffer_pct), updated_at: db.fn.now() });
    res.json({ message: 'Walk-in buffer updated.' });
  } catch (err) { next(err); }
});

// GET /bookings/analytics/walk-in-config — get all day configs
router.get('/walk-in-config', authenticate, async (_req, res, next) => {
  try {
    const config = await db('walk_in_config').orderBy('day_of_week').select('*');
    res.json({ data: config });
  } catch (err) { next(err); }
});

// ── PHASE 4: Guest Profiles ───────────────────────────────────────────────────

// GET /bookings/analytics/guests?search= — list guests
router.get('/guests', authenticate, async (req, res, next) => {
  try {
    const { search } = req.query;
    const guests = await db('guests')
      .modify((q: any) => {
        if (search) q.whereILike('name', `%${search}%`).orWhereILike('phone', `%${search}%`).orWhereILike('email', `%${search}%`);
      })
      .orderBy([{ column: 'visit_count', order: 'desc' }, { column: 'last_visit', order: 'desc' }])
      .limit(50)
      .select('*');
    res.json({ data: guests });
  } catch (err) { next(err); }
});

// GET /bookings/analytics/guests/:id — guest detail with booking history
router.get('/guests/:id', authenticate, async (req, res, next) => {
  try {
    const guest = await db('guests').where({ id: req.params.id }).first();
    if (!guest) throw new AppError('Guest not found', 404);

    const bookings = await db('bookings as b')
      .leftJoin('table_assignments as ta', 'b.id', 'ta.booking_id')
      .leftJoin('restaurant_tables as t', 'ta.table_id', 't.id')
      .where('b.guest_id', req.params.id)
      .orderBy('b.booking_date', 'desc')
      .limit(20)
      .select('b.booking_date', 'b.booking_time', 'b.party_size', 'b.status', 'b.dietary_notes', 't.name as table_name');

    res.json({ data: { ...guest, bookings } });
  } catch (err) { next(err); }
});

// POST /bookings/analytics/guests — create or find guest
router.post('/guests', authenticate, async (req, res, next) => {
  try {
    const { name, phone, email, preferred_section, dietary_notes, internal_notes } = req.body;
    if (!name) throw new AppError('Guest name is required', 422);

    // Try to find existing by phone or email
    let existing = null;
    if (phone) existing = await db('guests').where({ phone }).first();
    if (!existing && email) existing = await db('guests').where({ email }).first();

    if (existing) return res.json({ data: existing, matched: true });

    const [guest] = await db('guests').insert({ name, phone, email, preferred_section, dietary_notes, internal_notes }).returning('*');
    res.status(201).json({ data: guest, matched: false });
  } catch (err) { next(err); }
});

// Link booking to guest + update guest stats
router.post('/guests/:guestId/link/:bookingId', authenticate, async (req, res, next) => {
  try {
    const { guestId, bookingId } = req.params;
    const booking = await db('bookings').where({ id: bookingId }).first();
    if (!booking) throw new AppError('Booking not found', 404);

    // Link
    await db('bookings').where({ id: bookingId }).update({ guest_id: guestId });

    // Update guest stats
    const stats = await db('bookings')
      .where({ guest_id: guestId })
      .select(db.raw('count(*) as total'), db.raw("count(*) filter (where status = 'no_show') as no_shows"), db.raw('max(booking_date) as last_visit'))
      .first();

    await db('guests').where({ id: guestId }).update({
      visit_count:   parseInt(stats?.total as string || '0'),
      no_show_count: parseInt(stats?.no_shows as string || '0'),
      last_visit:    stats?.last_visit || null,
      updated_at:    db.fn.now(),
    });

    res.json({ message: 'Guest linked.' });
  } catch (err) { next(err); }
});

// ── PHASE 4: Bookings Analytics ───────────────────────────────────────────────

// GET /bookings/analytics/summary?from=&to= — overview stats
router.get('/summary', authenticate, requireManager, async (req, res, next) => {
  try {
    const to   = (req.query.to as string)   || format(new Date(), 'yyyy-MM-dd');
    const from = (req.query.from as string) || format(subDays(new Date(), 30), 'yyyy-MM-dd');

    const [totals, byStatus, byDow, topGuests, tableUtil] = await Promise.all([
      db('bookings').where('booking_date', '>=', from).where('booking_date', '<=', to)
        .select(db.raw('count(*) as total_bookings'), db.raw('sum(party_size) as total_covers'), db.raw('avg(party_size) as avg_party_size'))
        .first(),

      db('bookings').where('booking_date', '>=', from).where('booking_date', '<=', to)
        .groupBy('status').select('status', db.raw('count(*) as count')),

      db('bookings').where('booking_date', '>=', from).where('booking_date', '<=', to)
        .whereNotIn('status', ['cancelled'])
        .select(db.raw('EXTRACT(DOW FROM booking_date)::int as dow'), db.raw('count(*) as bookings'), db.raw('sum(party_size) as covers'), db.raw('avg(party_size) as avg_size'))
        .groupBy(db.raw('EXTRACT(DOW FROM booking_date)'))
        .orderBy(db.raw('EXTRACT(DOW FROM booking_date)')),

      db('guests').orderBy('visit_count', 'desc').limit(5)
        .select('id', 'name', 'visit_count', 'no_show_count', 'last_visit', 'dietary_notes'),

      db('table_assignments as ta')
        .join('bookings as b', 'ta.booking_id', 'b.id')
        .join('restaurant_tables as t', 'ta.table_id', 't.id')
        .where('b.booking_date', '>=', from).where('b.booking_date', '<=', to)
        .whereNotIn('b.status', ['cancelled'])
        .groupBy('t.id', 't.name', 't.capacity', 't.section')
        .select('t.id', 't.name', 't.capacity', 't.section', db.raw('count(*) as booking_count'), db.raw('sum(b.party_size) as total_covers'))
        .orderBy('booking_count', 'desc'),
    ]);

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const noShows = (byStatus as any[]).find((s: any) => s.status === 'no_show')?.count || 0;
    const noShowRate = totals?.total_bookings > 0 ? Math.round((parseInt(noShows) / parseInt(totals.total_bookings)) * 100) : 0;

    res.json({
      data: {
        from, to,
        total_bookings:   parseInt(totals?.total_bookings as string || '0'),
        total_covers:     parseInt(totals?.total_covers as string || '0'),
        avg_party_size:   parseFloat(totals?.avg_party_size as string || '0').toFixed(1),
        no_show_rate_pct: noShowRate,
        by_status:        byStatus,
        by_day_of_week:   (byDow as any[]).map((r: any) => ({ ...r, day_name: DAY_NAMES[r.dow], bookings: parseInt(r.bookings), covers: parseInt(r.covers) })),
        top_guests:       topGuests,
        table_utilisation: tableUtil,
      }
    });
  } catch (err) { next(err); }
});

// Peak time analysis — what times are busiest
router.get('/peak-times', authenticate, requireManager, async (_req, res, next) => {
  try {
    const from = format(subDays(new Date(), 60), 'yyyy-MM-dd');
    const rows = await db('bookings')
      .where('booking_date', '>=', from)
      .whereNotIn('status', ['cancelled'])
      .select(db.raw("to_char(booking_time, 'HH24') as hour"), db.raw('count(*) as bookings'), db.raw('sum(party_size) as covers'))
      .groupBy(db.raw("to_char(booking_time, 'HH24')"))
      .orderBy(db.raw("to_char(booking_time, 'HH24')"));

    res.json({ data: rows.map((r: any) => ({ hour: parseInt(r.hour), label: `${r.hour}:00`, bookings: parseInt(r.bookings), covers: parseInt(r.covers) })) });
  } catch (err) { next(err); }
});

export default router;
