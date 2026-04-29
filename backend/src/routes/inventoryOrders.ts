import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { format } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── GET /inventory/orders?date=YYYY-MM-DD ─────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { date, limit = '30' } = req.query;

    const orders = await db('daily_orders as o')
      .modify(q => { if (date) q.where('o.order_date', date as string); })
      .orderBy('o.order_date', 'desc')
      .limit(parseInt(limit as string))
      .select('o.*');

    // Attach line counts
    const ids = orders.map((o: any) => o.id);
    const lineCounts = ids.length ? await db('daily_order_lines')
      .whereIn('order_id', ids)
      .groupBy('order_id')
      .select('order_id', db.raw('count(*) as line_count, sum(quantity) as total_qty')) : [];

    const countMap: Record<string, any> = {};
    for (const lc of lineCounts) countMap[lc.order_id] = lc;

    res.json({ data: orders.map((o: any) => ({ ...o, ...countMap[o.id] })) });
  } catch (err) { next(err); }
});

// ── GET /inventory/orders/:date/lines — get or init today's order ─────────────
router.get('/:date/lines', authenticate, async (req, res, next) => {
  try {
    const { date } = req.params;

    let order = await db('daily_orders').where({ order_date: date }).first();

    // Auto-create draft if not exists
    if (!order) {
      [order] = await db('daily_orders').insert({ order_date: date, status: 'draft' }).returning('*');
    }

    // Get lines with item details
    const lines = await db('daily_order_lines as l')
      .join('inventory_items as i', 'l.item_id', 'i.id')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('l.order_id', order.id)
      .orderBy(['c.sort_order', 'i.name'])
      .select(
        'l.id as line_id', 'l.item_id', 'l.quantity', 'l.suggested_qty', 'l.notes as line_notes',
        'i.name', 'i.unit', 'i.par_level', 'i.current_stock',
        'c.id as category_id', 'c.name as category_name', 'c.icon as category_icon', 'c.color as category_color'
      );

    // If no lines yet, auto-populate with all active items
    if (lines.length === 0) {
      const items = await db('inventory_items').where({ is_active: true }).select('*');
      if (items.length > 0) {
        const suggested = await computeSuggestions(items, date);
        const lineRows = items.map((item: any) => ({
          order_id:     order.id,
          item_id:      item.id,
          quantity:     suggested[item.id] || 0,
          suggested_qty: suggested[item.id] || 0,
        }));
        await db('daily_order_lines').insert(lineRows);
        return res.redirect(307, `/api/inventory/orders/${date}/lines`);
      }
    }

    res.json({ data: { order, lines } });
  } catch (err) { next(err); }
});

// ── PATCH /inventory/orders/:date/lines/:lineId — update a quantity ───────────
router.patch('/:date/lines/:lineId', authenticate, async (req, res, next) => {
  try {
    const { quantity, notes } = req.body;
    const [updated] = await db('daily_order_lines')
      .where({ id: req.params.lineId })
      .update({ quantity: parseFloat(quantity) || 0, notes: notes || null, updated_at: db.fn.now() })
      .returning('*');
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// ── POST /inventory/orders/:date/submit ───────────────────────────────────────
router.post('/:date/submit', authenticate, async (req, res, next) => {
  try {
    const { date } = req.params;
    const order = await db('daily_orders').where({ order_date: date }).first();
    if (!order) throw new AppError('Order not found', 404);

    const [updated] = await db('daily_orders')
      .where({ id: order.id })
      .update({ status: 'submitted', submitted_by: req.user!.sub, submitted_at: db.fn.now(), updated_at: db.fn.now() })
      .returning('*');

    res.json({ data: updated, message: 'Order submitted.' });
  } catch (err) { next(err); }
});

// ── POST /inventory/orders/extract-sheet — AI reads handwritten order sheet ───
router.post('/extract-sheet', authenticate, async (req, res, next) => {
  try {
    const { image_base64, media_type = 'image/jpeg', order_date } = req.body;
    if (!image_base64) throw new AppError('image_base64 is required', 422);

    const items = await db('inventory_items as i')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('i.is_active', true)
      .orderBy('i.name')
      .select('i.id', 'i.name', 'i.unit');

    const itemList = items.map((i: any) => `- "${i.name}" (${i.unit}), id: ${i.id}`).join('\n');

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new AppError('Anthropic API key not configured', 500);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            {
              type: 'text',
              text: `This is a handwritten daily order sheet for a restaurant. Extract the quantity to order for each item.

Known inventory items:
${itemList}

Return ONLY a JSON array, no other text:
[
  { "item_id": "exact-uuid", "quantity": number }
]

Rules:
- Only include items where a quantity is clearly written
- Match item names as best you can to the known items list above
- Use the exact item_id from the list
- quantity must be a positive number
- Skip items with no quantity or illegible quantities`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) throw new AppError('AI extraction failed', 500);

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '[]';
    let extracted: any[] = [];
    try {
      extracted = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      throw new AppError('Could not parse AI response', 422);
    }

    res.json({ data: { lines: extracted, count: extracted.length } });
  } catch (err) { next(err); }
});

// ── Smart suggestion engine ───────────────────────────────────────────────────

async function computeSuggestions(items: any[], date: string): Promise<Record<string, number>> {
  const suggestions: Record<string, number> = {};
  const dayOfWeek = new Date(date + 'T12:00:00Z').getDay();

  // Get last 4 weeks of orders for this day of week
  const pastLines = await db('daily_order_lines as l')
    .join('daily_orders as o', 'l.order_id', 'o.id')
    .where('o.status', 'submitted')
    .whereRaw(`EXTRACT(DOW FROM o.order_date) = ?`, [dayOfWeek])
    .where('o.order_date', '<', date)
    .orderBy('o.order_date', 'desc')
    .limit(items.length * 4) // up to 4 weeks per item
    .select('l.item_id', 'l.quantity');

  // Group by item
  const byItem: Record<string, number[]> = {};
  for (const line of pastLines) {
    if (!byItem[line.item_id]) byItem[line.item_id] = [];
    byItem[line.item_id].push(parseFloat(line.quantity));
  }

  for (const item of items) {
    const history = byItem[item.id];
    if (history && history.length >= 2) {
      // Use average of past same-day orders
      const avg = history.reduce((s: number, v: number) => s + v, 0) / history.length;
      suggestions[item.id] = Math.round(avg * 2) / 2; // round to nearest 0.5
    } else {
      // Cold start: suggest par level
      suggestions[item.id] = parseFloat(item.par_level) || 0;
    }
  }

  return suggestions;
}

// ── GET /inventory/orders/history — past N orders ─────────────────────────────
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const orders = await db('daily_orders')
      .where('status', 'submitted')
      .orderBy('order_date', 'desc')
      .limit(30)
      .select('*');
    res.json({ data: orders });
  } catch (err) { next(err); }
});

export default router;
