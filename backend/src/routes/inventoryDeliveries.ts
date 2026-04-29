import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── Suppliers ─────────────────────────────────────────────────────────────────

router.get('/suppliers', authenticate, async (_req, res, next) => {
  try {
    const suppliers = await db('suppliers').where({ is_active: true }).orderBy('name').select('*');

    // Attach delivery counts and reliability stats
    const stats = await db('deliveries as d')
      .whereIn('d.supplier_id', suppliers.map((s: any) => s.id))
      .where('d.status', '!=', 'expected')
      .groupBy('d.supplier_id')
      .select(
        'd.supplier_id',
        db.raw('count(*) as total_deliveries'),
        db.raw("count(*) filter (where d.status = 'partial') as partial_count")
      );

    const statsMap: Record<string, any> = {};
    for (const s of stats) statsMap[s.supplier_id] = s;

    const enriched = suppliers.map((s: any) => {
      const st = statsMap[s.id] || { total_deliveries: 0, partial_count: 0 };
      const total = parseInt(st.total_deliveries);
      const partial = parseInt(st.partial_count);
      const reliability = total > 0 ? Math.round(((total - partial) / total) * 100) : null;
      return { ...s, total_deliveries: total, reliability_pct: reliability };
    });

    res.json({ data: enriched });
  } catch (err) { next(err); }
});

const SupplierSchema = z.object({
  name:         z.string().min(1).max(200),
  contact_name: z.string().max(200).optional().nullable(),
  phone:        z.string().max(50).optional().nullable(),
  email:        z.string().email().optional().nullable(),
  notes:        z.string().max(500).optional().nullable(),
});

router.post('/suppliers', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = SupplierSchema.parse(req.body);
    const [s] = await db('suppliers').insert({ ...body, created_by: req.user!.sub }).returning('*');
    res.status(201).json({ data: s });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.patch('/suppliers/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = SupplierSchema.partial().parse(req.body);
    const [updated] = await db('suppliers').where({ id: req.params.id }).update({ ...body, updated_at: db.fn.now() }).returning('*');
    if (!updated) throw new AppError('Supplier not found', 404);
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.delete('/suppliers/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    await db('suppliers').where({ id: req.params.id }).update({ is_active: false });
    res.json({ message: 'Supplier removed.' });
  } catch (err) { next(err); }
});

// ── Deliveries ────────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { from, to, supplier_id, status } = req.query;

    const deliveries = await db('deliveries as d')
      .leftJoin('suppliers as s', 'd.supplier_id', 's.id')
      .leftJoin('daily_orders as o', 'd.order_id', 'o.id')
      .modify((q: any) => {
        if (from) q.where('d.delivery_date', '>=', from as string);
        if (to)   q.where('d.delivery_date', '<=', to as string);
        if (supplier_id) q.where('d.supplier_id', supplier_id as string);
        if (status) q.where('d.status', status as string);
      })
      .orderBy('d.delivery_date', 'desc')
      .limit(50)
      .select(
        'd.*',
        's.name as supplier_name',
        'o.order_date'
      );

    // Attach line counts and discrepancy flags
    const ids = deliveries.map((d: any) => d.id);
    const lineSummaries = ids.length
      ? await db('delivery_lines')
          .whereIn('delivery_id', ids)
          .groupBy('delivery_id')
          .select(
            'delivery_id',
            db.raw('count(*) as line_count'),
            db.raw('count(*) filter (where variance < 0) as short_count'),
            db.raw('sum(abs(variance)) as total_variance')
          )
      : [];

    const lineMap: Record<string, any> = {};
    for (const l of lineSummaries) lineMap[l.delivery_id] = l;

    res.json({
      data: deliveries.map((d: any) => ({
        ...d,
        line_count:     parseInt(lineMap[d.id]?.line_count || '0'),
        short_count:    parseInt(lineMap[d.id]?.short_count || '0'),
        total_variance: parseFloat(lineMap[d.id]?.total_variance || '0'),
        has_discrepancy: parseInt(lineMap[d.id]?.short_count || '0') > 0,
      }))
    });
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const delivery = await db('deliveries as d')
      .leftJoin('suppliers as s', 'd.supplier_id', 's.id')
      .where('d.id', req.params.id)
      .select('d.*', 's.name as supplier_name')
      .first();
    if (!delivery) throw new AppError('Delivery not found', 404);

    const lines = await db('delivery_lines as dl')
      .join('inventory_items as i', 'dl.item_id', 'i.id')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('dl.delivery_id', req.params.id)
      .orderBy(['c.sort_order', 'i.name'])
      .select(
        'dl.*',
        'i.name as item_name', 'i.unit',
        'c.name as category_name', 'c.icon as category_icon', 'c.color as category_color'
      );

    res.json({ data: { delivery, lines } });
  } catch (err) { next(err); }
});

// Create delivery — optionally linked to a daily order
const DeliverySchema = z.object({
  supplier_id:    z.string().uuid().optional().nullable(),
  order_id:       z.string().uuid().optional().nullable(),
  delivery_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoice_ref:    z.string().max(100).optional().nullable(),
  notes:          z.string().max(500).optional().nullable(),
});

router.post('/', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = DeliverySchema.parse(req.body);

    await db.transaction(async (trx: any) => {
      const [delivery] = await trx('deliveries')
        .insert({ ...body, status: 'expected', created_by: req.user!.sub })
        .returning('*');

      // If linked to an order, pre-populate lines from that order
      if (body.order_id) {
        const orderLines = await trx('daily_order_lines').where({ order_id: body.order_id }).select('*');
        if (orderLines.length > 0) {
          await trx('delivery_lines').insert(
            orderLines.map((ol: any) => ({
              delivery_id:  delivery.id,
              item_id:      ol.item_id,
              ordered_qty:  ol.quantity,
              received_qty: ol.quantity, // default to full — manager adjusts
            }))
          );
        }
      }

      res.status(201).json({ data: delivery, message: 'Delivery created.' });
    });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

// Update delivery status + lines (receiving a delivery)
router.patch('/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    const { status, invoice_ref, notes } = req.body;
    const [updated] = await db('deliveries')
      .where({ id: req.params.id })
      .update({
        ...(status && { status }),
        ...(invoice_ref !== undefined && { invoice_ref }),
        ...(notes !== undefined && { notes }),
        updated_at: db.fn.now(),
      })
      .returning('*');
    if (!updated) throw new AppError('Delivery not found', 404);
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── Delivery lines — update received quantities ────────────────────────────────
router.patch('/:id/lines/:lineId', authenticate, requireManager, async (req, res, next) => {
  try {
    const { received_qty, notes } = req.body;
    const [updated] = await db('delivery_lines')
      .where({ id: req.params.lineId, delivery_id: req.params.id })
      .update({ received_qty: parseFloat(received_qty) || 0, notes: notes || null, updated_at: db.fn.now() })
      .returning('*');
    if (!updated) throw new AppError('Line not found', 404);
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── Confirm delivery received — compute status + update stock ─────────────────
router.post('/:id/confirm', authenticate, requireManager, async (req, res, next) => {
  try {
    const delivery = await db('deliveries').where({ id: req.params.id }).first();
    if (!delivery) throw new AppError('Delivery not found', 404);

    const lines = await db('delivery_lines').where({ delivery_id: req.params.id }).select('*');

    // Determine status: partial if any line has negative variance
    const hasShortfall = lines.some((l: any) => parseFloat(l.received_qty) < parseFloat(l.ordered_qty));
    const status = hasShortfall ? 'partial' : 'received';

    await db.transaction(async (trx: any) => {
      // Update delivery status
      await trx('deliveries').where({ id: req.params.id }).update({
        status,
        received_by:  req.user!.sub,
        received_at:  trx.fn.now(),
        updated_at:   trx.fn.now(),
      });

      // Update stock levels for each item
      for (const line of lines) {
        const qty = parseFloat(line.received_qty) || 0;
        if (qty > 0) {
          await trx('inventory_items')
            .where({ id: line.item_id })
            .update({
              current_stock: trx.raw('current_stock + ?', [qty]),
              updated_at:    trx.fn.now(),
            });
        }
      }
    });

    res.json({ data: { status }, message: `Delivery marked as ${status}. Stock levels updated.` });
  } catch (err) { next(err); }
});

export default router;
