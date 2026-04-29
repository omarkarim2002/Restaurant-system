import { Router, Request, Response, NextFunction } from 'express';
import { format, subWeeks, startOfWeek, parseISO, eachWeekOfInterval } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ── SMART RECOMMENDATION ENGINE ───────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

interface ItemMetrics {
  itemId:      string;
  name:        string;
  unit:        string;
  parLevel:    number;
  avgOrdered:  number;
  avgByDow:    Record<number, number>; // day-of-week averages
  trend:       number;                 // positive = trending up, negative = down
  wasteRate:   number;                 // avg waste per week
  dataPoints:  number;
  confidence:  'low' | 'medium' | 'high';
}

async function buildItemMetrics(itemId: string): Promise<ItemMetrics | null> {
  const item = await db('inventory_items').where({ id: itemId, is_active: true }).first();
  if (!item) return null;

  // Get all submitted orders for this item (up to 12 weeks)
  const orders = await db('daily_order_lines as l')
    .join('daily_orders as o', 'l.order_id', 'o.id')
    .where('l.item_id', itemId)
    .where('o.status', 'submitted')
    .orderBy('o.order_date', 'desc')
    .limit(84) // 12 weeks × 7 days
    .select('l.quantity', 'o.order_date');

  const dataPoints = orders.length;

  if (dataPoints === 0) {
    return {
      itemId, name: item.name, unit: item.unit,
      parLevel: parseFloat(item.par_level) || 0,
      avgOrdered: parseFloat(item.par_level) || 0,
      avgByDow: {}, trend: 0, wasteRate: 0,
      dataPoints: 0, confidence: 'low',
    };
  }

  // Overall average
  const avgOrdered = orders.reduce((s: number, o: any) => s + parseFloat(o.quantity), 0) / orders.length;

  // Day-of-week averages
  const dowGroups: Record<number, number[]> = {};
  for (const o of orders) {
    const dow = new Date(o.order_date + 'T12:00:00Z').getDay();
    if (!dowGroups[dow]) dowGroups[dow] = [];
    dowGroups[dow].push(parseFloat(o.quantity));
  }
  const avgByDow: Record<number, number> = {};
  for (const [dow, qtys] of Object.entries(dowGroups)) {
    avgByDow[parseInt(dow)] = qtys.reduce((s, v) => s + v, 0) / qtys.length;
  }

  // Trend: compare last 4 orders vs previous 4
  let trend = 0;
  if (orders.length >= 8) {
    const recent = orders.slice(0, 4).map((o: any) => parseFloat(o.quantity));
    const older  = orders.slice(4, 8).map((o: any) => parseFloat(o.quantity));
    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const olderAvg  = older.reduce((s, v) => s + v, 0) / older.length;
    trend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
  }

  // Waste rate from waste_logs
  const wasteRows = await db('waste_logs')
    .where({ item_id: itemId })
    .where('log_date', '>=', format(subWeeks(new Date(), 8), 'yyyy-MM-dd'))
    .sum('quantity as total')
    .first();
  const wasteRate = parseFloat(wasteRows?.total || '0') / 8; // per week average

  const confidence: 'low' | 'medium' | 'high' =
    dataPoints >= 14 ? 'high' : dataPoints >= 6 ? 'medium' : 'low';

  return { itemId, name: item.name, unit: item.unit, parLevel: parseFloat(item.par_level) || 0, avgOrdered, avgByDow, trend, wasteRate, dataPoints, confidence };
}

function computeRecommendation(metrics: ItemMetrics, forDate: string): { qty: number; reasoning: string } {
  const dow = new Date(forDate + 'T12:00:00Z').getDay();

  // Base: day-of-week average if available, else overall average
  let base = metrics.avgByDow[dow] ?? metrics.avgOrdered;

  // Adjust for trend
  if (Math.abs(metrics.trend) > 0.1) {
    base = base * (1 + metrics.trend * 0.5); // dampen trend to avoid overcorrection
  }

  // Reduce by estimated waste
  base = Math.max(0, base - metrics.wasteRate * 0.5);

  // Round to nearest 0.5
  const qty = Math.round(base * 2) / 2;

  // Build reasoning
  const parts: string[] = [];
  if (metrics.dataPoints >= 6 && metrics.avgByDow[dow] !== undefined) {
    parts.push(`Average for this day of week: ${metrics.avgByDow[dow].toFixed(1)} ${metrics.unit}`);
  } else if (metrics.dataPoints > 0) {
    parts.push(`Overall average across ${metrics.dataPoints} orders: ${metrics.avgOrdered.toFixed(1)} ${metrics.unit}`);
  } else {
    parts.push(`No order history — using par level: ${metrics.parLevel} ${metrics.unit}`);
  }
  if (metrics.trend > 0.1) parts.push(`Trending up ${Math.round(metrics.trend * 100)}% recently`);
  if (metrics.trend < -0.1) parts.push(`Trending down ${Math.round(Math.abs(metrics.trend) * 100)}% recently`);
  if (metrics.wasteRate > 0.1) parts.push(`Reduced by estimated waste (${metrics.wasteRate.toFixed(1)} ${metrics.unit}/wk avg)`);

  return { qty, reasoning: parts.join('. ') + '.' };
}

// ── GET /inventory/analytics/recommendations?date= ────────────────────────────
router.get('/recommendations', authenticate, async (req, res, next) => {
  try {
    const forDate = (req.query.date as string) || format(new Date(), 'yyyy-MM-dd');
    const items   = await db('inventory_items').where({ is_active: true }).select('id', 'name', 'unit', 'par_level');

    const recommendations = await Promise.all(
      items.map(async (item: any) => {
        const metrics = await buildItemMetrics(item.id);
        if (!metrics) return null;
        const { qty, reasoning } = computeRecommendation(metrics, forDate);
        return {
          item_id:    item.id,
          name:       item.name,
          unit:       item.unit,
          recommended_qty: qty,
          confidence: metrics.confidence,
          reasoning,
          data_points: metrics.dataPoints,
          trend: metrics.trend,
          waste_rate: metrics.wasteRate,
        };
      })
    );

    const valid = recommendations.filter(Boolean);

    // Cache recommendations
    if (valid.length > 0) {
      for (const rec of valid) {
        if (!rec) continue;
        await db('order_recommendations')
          .insert({ item_id: rec.item_id, for_date: forDate, recommended_qty: rec.recommended_qty, confidence: rec.confidence, reasoning: rec.reasoning, data_points: rec.data_points })
          .onConflict(['item_id', 'for_date'])
          .merge({ recommended_qty: rec.recommended_qty, confidence: rec.confidence, reasoning: rec.reasoning, data_points: rec.data_points });
      }
    }

    res.json({ data: valid });
  } catch (err) { next(err); }
});

// ── GET /inventory/analytics/patterns — over/under ordering ───────────────────
router.get('/patterns', authenticate, requireManager, async (_req, res, next) => {
  try {
    const from = format(subWeeks(new Date(), 8), 'yyyy-MM-dd');

    // Items ordered consistently more than par level (potential over-ordering)
    const overOrdered = await db('daily_order_lines as l')
      .join('daily_orders as o', 'l.order_id', 'o.id')
      .join('inventory_items as i', 'l.item_id', 'i.id')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('o.status', 'submitted')
      .where('o.order_date', '>=', from)
      .groupBy('l.item_id', 'i.name', 'i.unit', 'i.par_level', 'c.name', 'c.icon')
      .havingRaw('avg(l.quantity::numeric) > i.par_level * 1.3')
      .select(
        'l.item_id', 'i.name', 'i.unit', 'i.par_level',
        'c.name as category_name', 'c.icon as category_icon',
        db.raw('count(*) as order_count'),
        db.raw('avg(l.quantity::numeric) as avg_qty'),
        db.raw('avg(l.quantity::numeric) - i.par_level as avg_excess')
      );

    // Items ordered consistently less than par level (potential under-ordering)
    const underOrdered = await db('daily_order_lines as l')
      .join('daily_orders as o', 'l.order_id', 'o.id')
      .join('inventory_items as i', 'l.item_id', 'i.id')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('o.status', 'submitted')
      .where('o.order_date', '>=', from)
      .where('i.par_level', '>', 0)
      .groupBy('l.item_id', 'i.name', 'i.unit', 'i.par_level', 'c.name', 'c.icon')
      .havingRaw('avg(l.quantity::numeric) < i.par_level * 0.7')
      .select(
        'l.item_id', 'i.name', 'i.unit', 'i.par_level',
        'c.name as category_name', 'c.icon as category_icon',
        db.raw('count(*) as order_count'),
        db.raw('avg(l.quantity::numeric) as avg_qty'),
        db.raw('i.par_level - avg(l.quantity::numeric) as avg_shortfall')
      );

    // Delivery shortfall patterns — suppliers that consistently short-deliver
    const supplierShortfalls = await db('delivery_lines as dl')
      .join('deliveries as d', 'dl.delivery_id', 'd.id')
      .join('suppliers as s', 'd.supplier_id', 's.id')
      .where('d.status', 'partial')
      .where('d.delivery_date', '>=', from)
      .groupBy('d.supplier_id', 's.name')
      .select(
        'd.supplier_id',
        's.name as supplier_name',
        db.raw('count(*) as shortfall_count'),
        db.raw('sum(abs(dl.variance)) as total_variance')
      )
      .orderBy('shortfall_count', 'desc');

    res.json({
      data: {
        over_ordered:  overOrdered.map((i: any) => ({ ...i, avg_qty: parseFloat(i.avg_qty), avg_excess: parseFloat(i.avg_excess) })),
        under_ordered: underOrdered.map((i: any) => ({ ...i, avg_qty: parseFloat(i.avg_qty), avg_shortfall: parseFloat(i.avg_shortfall) })),
        supplier_shortfalls: supplierShortfalls.map((s: any) => ({ ...s, total_variance: parseFloat(s.total_variance) })),
      }
    });
  } catch (err) { next(err); }
});

// ── POST /inventory/analytics/waste — log waste ───────────────────────────────
router.post('/waste', authenticate, async (req, res, next) => {
  try {
    const { item_id, quantity, reason, notes, log_date } = req.body;
    if (!item_id || !quantity) throw new AppError('item_id and quantity are required', 422);
    const [row] = await db('waste_logs').insert({
      item_id, quantity: parseFloat(quantity), reason: reason || null,
      notes: notes || null, log_date: log_date || format(new Date(), 'yyyy-MM-dd'),
      logged_by: req.user!.sub,
    }).returning('*');
    res.status(201).json({ data: row });
  } catch (err) { next(err); }
});

// ── GET /inventory/analytics/waste — waste summary ────────────────────────────
router.get('/waste', authenticate, requireManager, async (req, res, next) => {
  try {
    const from = (req.query.from as string) || format(subWeeks(new Date(), 4), 'yyyy-MM-dd');
    const rows = await db('waste_logs as w')
      .join('inventory_items as i', 'w.item_id', 'i.id')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('w.log_date', '>=', from)
      .groupBy('w.item_id', 'i.name', 'i.unit', 'i.current_unit_cost', 'c.name', 'c.icon', 'c.color')
      .select(
        'w.item_id', 'i.name', 'i.unit', 'i.current_unit_cost',
        'c.name as category_name', 'c.icon as category_icon', 'c.color as category_color',
        db.raw('sum(w.quantity) as total_waste'),
        db.raw('count(*) as log_count')
      )
      .orderBy('total_waste', 'desc');

    const withCost = rows.map((r: any) => ({
      ...r,
      total_waste: parseFloat(r.total_waste),
      waste_cost: Math.round(parseFloat(r.total_waste) * parseFloat(r.current_unit_cost || 0) * 100) / 100,
    }));

    res.json({ data: withCost });
  } catch (err) { next(err); }
});

// ── POST /inventory/analytics/digest — generate AI weekly digest ──────────────
router.post('/digest', authenticate, requireManager, async (req, res, next) => {
  try {
    const weekStart = (req.body.week_start as string) || format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd   = format(new Date(new Date(weekStart).getTime() + 6 * 86400000), 'yyyy-MM-dd');

    // Gather metrics
    const [orderCount, deliveryCount, partialCount, wasteRows, topOrdered] = await Promise.all([
      db('daily_orders').where('status', 'submitted').where('order_date', '>=', weekStart).where('order_date', '<=', weekEnd).count('id as n').first(),
      db('deliveries').where('delivery_date', '>=', weekStart).where('delivery_date', '<=', weekEnd).count('id as n').first(),
      db('deliveries').where('status', 'partial').where('delivery_date', '>=', weekStart).where('delivery_date', '<=', weekEnd).count('id as n').first(),
      db('waste_logs').where('log_date', '>=', weekStart).where('log_date', '<=', weekEnd).sum('quantity as total').first(),
      db('daily_order_lines as l')
        .join('daily_orders as o', 'l.order_id', 'o.id')
        .join('inventory_items as i', 'l.item_id', 'i.id')
        .where('o.status', 'submitted').where('o.order_date', '>=', weekStart).where('o.order_date', '<=', weekEnd)
        .groupBy('l.item_id', 'i.name', 'i.unit')
        .orderByRaw('sum(l.quantity::numeric) desc')
        .limit(5)
        .select('i.name', 'i.unit', db.raw('sum(l.quantity::numeric) as total_qty')),
    ]);

    const metrics = {
      week_start: weekStart, week_end: weekEnd,
      orders: parseInt((orderCount as any)?.n || '0'),
      deliveries: parseInt((deliveryCount as any)?.n || '0'),
      partial_deliveries: parseInt((partialCount as any)?.n || '0'),
      total_waste: parseFloat((wasteRows as any)?.total || '0'),
      top_ordered: topOrdered,
    };

    // Call Claude API to generate digest
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new AppError('Anthropic API key not configured', 500);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `You are a restaurant inventory assistant. Write a concise weekly inventory digest for the manager.

Week: ${weekStart} to ${weekEnd}
Orders submitted: ${metrics.orders}
Deliveries: ${metrics.deliveries} (${metrics.partial_deliveries} partial/short)
Total waste logged: ${metrics.total_waste} units
Top ordered items: ${topOrdered.map((i: any) => `${i.name} (${parseFloat(i.total_qty).toFixed(1)} ${i.unit})`).join(', ')}

Write 3-5 short bullet points covering:
- Overall ordering activity
- Any delivery issues
- Waste observations if applicable
- One concrete recommendation for next week

Keep it factual, specific, and under 150 words. No fluff. Use plain text bullets starting with •`,
        }],
      }),
    });

    if (!response.ok) throw new AppError('AI digest generation failed', 500);
    const aiData = await response.json() as any;
    const content = aiData.content?.[0]?.text || 'No digest available.';

    const [digest] = await db('insight_digests')
      .insert({ week_start: weekStart, content, metrics: JSON.stringify(metrics) })
      .onConflict('week_start').merge({ content, metrics: JSON.stringify(metrics) })
      .returning('*');

    res.json({ data: digest });
  } catch (err) { next(err); }
});

// ── GET /inventory/analytics/digest — get latest digests ─────────────────────
router.get('/digest', authenticate, async (_req, res, next) => {
  try {
    const digests = await db('insight_digests').orderBy('week_start', 'desc').limit(4).select('*');
    res.json({ data: digests });
  } catch (err) { next(err); }
});

export default router;
