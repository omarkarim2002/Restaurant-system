import { Router, Request, Response, NextFunction } from 'express';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── GET /inventory/requests — list (default: pending) ────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, limit } = req.query;

    const rows = await db('item_requests as r')
      .leftJoin('inventory_items as i', 'r.item_id', 'i.id')
      .leftJoin('employees as e', 'r.requested_by', 'e.id')
      .modify((q: any) => {
        if (status) q.where('r.status', status);
      })
      .orderByRaw(`
        CASE r.status
          WHEN 'pending' THEN 1
          WHEN 'acknowledged' THEN 2
          ELSE 3
        END,
        CASE r.urgency
          WHEN 'urgent' THEN 1
          WHEN 'normal' THEN 2
          ELSE 3
        END,
        r.created_at DESC
      `)
      .limit(parseInt(limit as string) || 100)
      .select(
        'r.*',
        'i.name as item_name', 'i.unit as item_unit', 'i.current_unit_cost',
        'e.first_name as requested_by_first', 'e.last_name as requested_by_last'
      );

    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ── GET /inventory/requests/counts — quick badge data ────────────────────────
router.get('/counts', authenticate, async (_req, res, next) => {
  try {
    const counts = await db('item_requests')
      .groupBy('status')
      .select('status', db.raw('count(*) as count'));
    const out: Record<string, number> = { pending: 0, acknowledged: 0, purchased: 0, cancelled: 0 };
    for (const c of counts) out[c.status as string] = parseInt(c.count as string);
    const urgent = await db('item_requests').where({ status: 'pending', urgency: 'urgent' }).count('* as c').first();
    res.json({ data: { ...out, urgent_pending: parseInt(urgent?.c as string || '0') } });
  } catch (err) { next(err); }
});

// ── POST /inventory/requests — staff flags an item ───────────────────────────
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { item_id, custom_item, quantity_needed, urgency, notes } = req.body;
    if (!item_id && !custom_item) throw new AppError('Either item_id or custom_item is required', 422);

    const [request] = await db('item_requests').insert({
      item_id: item_id || null,
      custom_item: custom_item || null,
      quantity_needed,
      urgency: urgency || 'normal',
      notes,
      requested_by: (req as any).user?.sub,
    }).returning('*');

    // Build notification — owner/manager gets notified
    const requester = await db('employees').where({ id: (req as any).user?.sub }).first();
    let itemName = custom_item;
    if (item_id) {
      const item = await db('inventory_items').where({ id: item_id }).first();
      itemName = item?.name || custom_item;
    }

    // Find managers + admins to notify
    const managers = await db('employees')
      .whereIn('system_role', ['manager', 'admin'])
      .where({ is_active: true })
      .select('id');

    if (managers.length > 0) {
      await db('notifications').insert(managers.map((m: any) => ({
        user_id: m.id,
        type: 'item_request',
        title: `${urgency === 'urgent' ? '🔴 URGENT: ' : ''}${itemName} needed`,
        body: `${requester?.first_name || 'Staff'} flagged "${itemName}"${quantity_needed ? ` (${quantity_needed})` : ''}${notes ? ' — ' + notes : ''}`,
        link: '/inventory/requests',
        reference_id: request.id,
      })));
    }

    res.status(201).json({ data: request });
  } catch (err) { next(err); }
});

// ── PATCH /inventory/requests/:id — update status ────────────────────────────
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const updates: any = { updated_at: db.fn.now() };
    if (status) {
      updates.status = status;
      if (status === 'acknowledged') {
        updates.acknowledged_by = (req as any).user?.sub;
        updates.acknowledged_at = db.fn.now();
      }
      if (status === 'purchased' || status === 'cancelled') {
        updates.completed_at = db.fn.now();
      }
    }
    if (notes !== undefined) updates.notes = notes;

    await db('item_requests').where({ id: req.params.id }).update(updates);
    res.json({ message: 'Updated' });
  } catch (err) { next(err); }
});

// ── DELETE /inventory/requests/:id ───────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await db('item_requests').where({ id: req.params.id }).delete();
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

export default router;
