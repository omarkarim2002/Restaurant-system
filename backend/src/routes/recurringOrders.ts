import { Router, Request, Response, NextFunction } from 'express';
import { format, addDays, parseISO } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── GET /inventory/recurring — list all recurring orders ──────────────────────
router.get('/', authenticate, async (_req, res, next) => {
  try {
    const rows = await db('recurring_orders as ro')
      .leftJoin('suppliers as s', 'ro.supplier_id', 's.id')
      .orderBy('ro.day_of_week')
      .select('ro.*', 's.name as supplier_name', 's.contact_phone', 's.contact_email');

    // Get line counts
    const orderIds = rows.map((r: any) => r.id);
    const lineCounts = orderIds.length > 0
      ? await db('recurring_order_lines').whereIn('recurring_order_id', orderIds)
          .groupBy('recurring_order_id')
          .select('recurring_order_id', db.raw('count(*) as count'), db.raw('sum(current_quantity) as total_qty'))
      : [];
    const countMap: Record<string, any> = {};
    for (const lc of lineCounts) countMap[lc.recurring_order_id] = lc;

    const enriched = rows.map((r: any) => ({
      ...r,
      line_count: parseInt(countMap[r.id]?.count as string || '0'),
      total_qty: parseFloat(countMap[r.id]?.total_qty as string || '0'),
    }));

    res.json({ data: enriched });
  } catch (err) { next(err); }
});

// ── GET /inventory/recurring/:id — full template with lines ───────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const order = await db('recurring_orders as ro')
      .leftJoin('suppliers as s', 'ro.supplier_id', 's.id')
      .where('ro.id', req.params.id).first()
      .select('ro.*', 's.name as supplier_name');
    if (!order) throw new AppError('Recurring order not found', 404);

    const lines = await db('recurring_order_lines as rol')
      .join('inventory_items as i', 'rol.item_id', 'i.id')
      .leftJoin('inventory_categories as c', 'i.category_id', 'c.id')
      .where('rol.recurring_order_id', req.params.id)
      .orderBy('rol.sort_order')
      .select(
        'rol.*', 'i.name as item_name', 'i.unit as item_unit',
        'i.current_unit_cost', 'c.name as category_name'
      );

    // Recent adjustments (last 8 weeks)
    const adjustments = await db('recurring_order_adjustments as a')
      .join('inventory_items as i', 'a.item_id', 'i.id')
      .where('a.recurring_order_id', req.params.id)
      .where('a.created_at', '>', db.raw("NOW() - INTERVAL '60 days'"))
      .orderBy('a.created_at', 'desc')
      .limit(50)
      .select('a.*', 'i.name as item_name');

    res.json({ data: { ...order, lines, recent_adjustments: adjustments } });
  } catch (err) { next(err); }
});

// ── POST /inventory/recurring — create a recurring order template ────────────
router.post('/', authenticate, requireManager, async (req, res, next) => {
  try {
    const { supplier_id, name, day_of_week, notes, lines } = req.body;
    if (!supplier_id || !name || day_of_week === undefined) {
      throw new AppError('supplier_id, name, day_of_week required', 422);
    }

    const result = await db.transaction(async (trx) => {
      const [order] = await trx('recurring_orders').insert({
        supplier_id, name, day_of_week, notes,
        created_by: (req as any).user?.sub,
      }).returning('*');

      if (lines?.length > 0) {
        await trx('recurring_order_lines').insert(
          lines.map((l: any, i: number) => ({
            recurring_order_id: order.id,
            item_id: l.item_id,
            base_quantity: l.quantity,
            current_quantity: l.quantity,
            unit: l.unit,
            notes: l.notes,
            sort_order: i,
          }))
        );
      }

      return order;
    });

    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

// ── PATCH /inventory/recurring/:id — update template ─────────────────────────
router.patch('/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    const updates: any = {};
    for (const f of ['name', 'day_of_week', 'is_active', 'notes', 'supplier_id']) {
      if (f in req.body) updates[f] = req.body[f];
    }
    updates.updated_at = db.fn.now();
    await db('recurring_orders').where({ id: req.params.id }).update(updates);
    res.json({ message: 'Updated' });
  } catch (err) { next(err); }
});

// ── DELETE /inventory/recurring/:id ───────────────────────────────────────────
router.delete('/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    await db('recurring_orders').where({ id: req.params.id }).delete();
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// ── POST /inventory/recurring/:id/lines — add or update a line ────────────────
router.post('/:id/lines', authenticate, requireManager, async (req, res, next) => {
  try {
    const { item_id, quantity, unit, notes } = req.body;
    if (!item_id || quantity === undefined) throw new AppError('item_id and quantity required', 422);

    const [line] = await db('recurring_order_lines').insert({
      recurring_order_id: req.params.id,
      item_id,
      base_quantity: quantity,
      current_quantity: quantity,
      unit, notes,
    }).onConflict(['recurring_order_id', 'item_id'])
      .merge({ current_quantity: quantity, unit, notes })
      .returning('*');
    res.json({ data: line });
  } catch (err) { next(err); }
});

// ── DELETE /inventory/recurring/:id/lines/:lineId ─────────────────────────────
router.delete('/:id/lines/:lineId', authenticate, requireManager, async (req, res, next) => {
  try {
    await db('recurring_order_lines').where({ id: req.params.lineId, recurring_order_id: req.params.id }).delete();
    res.json({ message: 'Line removed' });
  } catch (err) { next(err); }
});

// ── POST /inventory/recurring/:id/adjust — record an adjustment ───────────────
// Cousin says "this week we need less tomatoes, only 3kg"
router.post('/:id/adjust', authenticate, requireManager, async (req, res, next) => {
  try {
    const { item_id, adjusted_quantity, reason, adjusted_for_date, apply_now } = req.body;
    if (!item_id || adjusted_quantity === undefined || !adjusted_for_date) {
      throw new AppError('item_id, adjusted_quantity, adjusted_for_date required', 422);
    }

    const line = await db('recurring_order_lines')
      .where({ recurring_order_id: req.params.id, item_id }).first();
    if (!line) throw new AppError('Item not in this recurring order', 404);

    const previous = parseFloat(line.current_quantity);
    const adjusted = parseFloat(adjusted_quantity);

    const [adj] = await db('recurring_order_adjustments').insert({
      recurring_order_id: req.params.id,
      item_id,
      adjusted_quantity: adjusted,
      previous_quantity: previous,
      delta: adjusted - previous,
      reason,
      adjusted_for_date,
      applied: !!apply_now,
      created_by: (req as any).user?.sub,
    }).returning('*');

    // If apply_now, this is the new normal — update current_quantity
    if (apply_now) {
      await db('recurring_order_lines')
        .where({ recurring_order_id: req.params.id, item_id })
        .update({ current_quantity: adjusted });
    }

    res.json({ data: adj });
  } catch (err) { next(err); }
});

// ── POST /inventory/recurring/:id/generate — generate today's order from template
// Creates a daily_order record from the template. Includes any recent
// adjustments for that date.
router.post('/:id/generate', authenticate, requireManager, async (req, res, next) => {
  try {
    const { order_date } = req.body;
    const date = order_date || format(new Date(), 'yyyy-MM-dd');

    const template = await db('recurring_orders').where({ id: req.params.id }).first();
    if (!template) throw new AppError('Template not found', 404);

    const lines = await db('recurring_order_lines').where({ recurring_order_id: req.params.id });

    // Get any pending adjustments for this date
    const adjustments = await db('recurring_order_adjustments')
      .where({ recurring_order_id: req.params.id, adjusted_for_date: date, applied: false });
    const adjMap: Record<string, any> = {};
    for (const a of adjustments) adjMap[a.item_id] = a;

    const result = await db.transaction(async (trx) => {
      // Create daily order
      const [dailyOrder] = await trx('daily_orders').insert({
        order_date: date,
        supplier_id: template.supplier_id,
        notes: `From recurring: ${template.name}`,
        status: 'draft',
        created_by: (req as any).user?.sub,
      }).returning('*');

      // Create order lines (apply any pending adjustments)
      if (lines.length > 0) {
        await trx('daily_order_lines').insert(lines.map((l: any) => {
          const adj = adjMap[l.item_id];
          const qty = adj ? parseFloat(adj.adjusted_quantity) : parseFloat(l.current_quantity);
          return {
            daily_order_id: dailyOrder.id,
            item_id: l.item_id,
            quantity: qty,
            unit: l.unit,
            notes: adj?.reason || l.notes,
          };
        }));
      }

      // Mark adjustments as applied
      if (adjustments.length > 0) {
        await trx('recurring_order_adjustments')
          .whereIn('id', adjustments.map((a: any) => a.id))
          .update({ applied: true });
      }

      // Update last_generated
      await trx('recurring_orders').where({ id: req.params.id }).update({ last_generated: date });

      return dailyOrder;
    });

    res.json({ data: result, message: 'Order generated. Review in Daily Orders.' });
  } catch (err) { next(err); }
});

// ── GET /inventory/recurring/upcoming — what's due in next 7 days ─────────────
router.get('/upcoming/next7', authenticate, async (_req, res, next) => {
  try {
    const today = new Date();
    const todayDow = today.getDay();

    const orders = await db('recurring_orders as ro')
      .join('suppliers as s', 'ro.supplier_id', 's.id')
      .where('ro.is_active', true)
      .select('ro.*', 's.name as supplier_name', 's.contact_phone');

    const upcoming = orders.map((o: any) => {
      const dow = o.day_of_week;
      const daysAhead = (dow - todayDow + 7) % 7;
      const orderDate = addDays(today, daysAhead);
      return {
        ...o,
        days_ahead: daysAhead,
        order_date: format(orderDate, 'yyyy-MM-dd'),
        already_generated: o.last_generated && format(new Date(o.last_generated), 'yyyy-MM-dd') === format(orderDate, 'yyyy-MM-dd'),
      };
    }).sort((a: any, b: any) => a.days_ahead - b.days_ahead);

    res.json({ data: upcoming });
  } catch (err) { next(err); }
});

export default router;
