import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { format, startOfWeek, subWeeks, parseISO } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── Item costs ────────────────────────────────────────────────────────────────

// GET /inventory/costs/items — all items with current cost
router.get('/items', authenticate, requireManager, async (_req, res, next) => {
  try {
    const items = await db('inventory_items as i')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('i.is_active', true)
      .orderBy(['c.sort_order', 'i.name'])
      .select(
        'i.id', 'i.name', 'i.unit', 'i.par_level', 'i.current_unit_cost',
        'c.id as category_id', 'c.name as category_name', 'c.icon as category_icon', 'c.color as category_color'
      );

    // Get weekly cost estimate (par_level × unit_cost)
    const withCost = items.map((item: any) => ({
      ...item,
      weekly_cost_estimate: Math.round(parseFloat(item.par_level || 0) * parseFloat(item.current_unit_cost || 0) * 100) / 100,
    }));

    res.json({ data: withCost });
  } catch (err) { next(err); }
});

// PATCH /inventory/costs/items/:id — update unit cost
router.patch('/items/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    const { unit_cost, notes } = req.body;
    const cost = parseFloat(unit_cost);
    if (isNaN(cost) || cost < 0) throw new AppError('Invalid unit cost', 422);

    await db.transaction(async (trx: any) => {
      // Log to history
      await trx('item_cost_history').insert({
        item_id: req.params.id, unit_cost: cost,
        effective_from: format(new Date(), 'yyyy-MM-dd'),
        notes: notes || null, created_by: req.user!.sub,
      });
      // Update current cost on item
      await trx('inventory_items').where({ id: req.params.id })
        .update({ current_unit_cost: cost, updated_at: trx.fn.now() });
    });

    const updated = await db('inventory_items').where({ id: req.params.id }).first();
    res.json({ data: updated, message: 'Cost updated.' });
  } catch (err) { next(err); }
});

// GET /inventory/costs/items/:id/history — price history for an item
router.get('/items/:id/history', authenticate, requireManager, async (req, res, next) => {
  try {
    const history = await db('item_cost_history')
      .where({ item_id: req.params.id })
      .orderBy('effective_from', 'desc')
      .limit(20)
      .select('*');
    res.json({ data: history });
  } catch (err) { next(err); }
});

// ── Category budgets ──────────────────────────────────────────────────────────

router.get('/budgets', authenticate, requireManager, async (_req, res, next) => {
  try {
    // Latest budget per category
    const budgets = await db('category_budgets as b')
      .join('inventory_categories as c', 'b.category_id', 'c.id')
      .where('c.is_active', true)
      .orderByRaw('b.category_id, b.effective_from DESC')
      .distinctOn(['b.category_id'])
      .select('b.*', 'c.name as category_name', 'c.icon as category_icon', 'c.color as category_color');
    res.json({ data: budgets });
  } catch (err) { next(err); }
});

router.post('/budgets', authenticate, requireManager, async (req, res, next) => {
  try {
    const { category_id, weekly_budget } = req.body;
    if (!category_id || !weekly_budget) throw new AppError('category_id and weekly_budget are required', 422);
    const [budget] = await db('category_budgets')
      .insert({ category_id, weekly_budget: parseFloat(weekly_budget), created_by: req.user!.sub })
      .onConflict(['category_id', 'effective_from']).merge({ weekly_budget: parseFloat(weekly_budget) })
      .returning('*');
    res.status(201).json({ data: budget });
  } catch (err) { next(err); }
});

// ── Invoices ──────────────────────────────────────────────────────────────────

router.get('/invoices', authenticate, requireManager, async (req, res, next) => {
  try {
    const { supplier_id, status } = req.query;
    const invoices = await db('invoices as inv')
      .leftJoin('suppliers as s', 'inv.supplier_id', 's.id')
      .modify((q: any) => {
        if (supplier_id) q.where('inv.supplier_id', supplier_id as string);
        if (status) q.where('inv.status', status as string);
      })
      .orderBy('inv.invoice_date', 'desc')
      .limit(50)
      .select('inv.*', 's.name as supplier_name');

    // Attach line counts
    const ids = invoices.map((i: any) => i.id);
    const lineCounts = ids.length
      ? await db('invoice_lines').whereIn('invoice_id', ids).groupBy('invoice_id')
          .select('invoice_id', db.raw('count(*) as line_count'), db.raw('sum(line_total) as computed_total'))
      : [];

    const lcMap: Record<string, any> = {};
    for (const lc of lineCounts) lcMap[lc.invoice_id] = lc;

    res.json({ data: invoices.map((inv: any) => ({ ...inv, line_count: lcMap[inv.id]?.line_count || 0, computed_total: lcMap[inv.id]?.computed_total || 0 })) });
  } catch (err) { next(err); }
});

// POST /inventory/costs/invoices/extract — AI reads invoice image
router.post('/invoices/extract', authenticate, requireManager, async (req, res, next) => {
  try {
    const { image_base64, media_type = 'image/jpeg' } = req.body;
    if (!image_base64) throw new AppError('image_base64 is required', 422);

    const items = await db('inventory_items').where({ is_active: true }).select('id', 'name', 'unit');
    const itemList = items.map((i: any) => `- "${i.name}" (${i.unit}), id: ${i.id}`).join('\n');

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new AppError('Anthropic API key not configured', 500);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            {
              type: 'text',
              text: `This is a supplier invoice for a restaurant. Extract all line items with prices.

Known inventory items to match against:
${itemList}

Return ONLY a JSON object, no other text:
{
  "supplier_name": "name if visible",
  "invoice_ref": "invoice number if visible",
  "invoice_date": "YYYY-MM-DD if visible",
  "total_amount": number or null,
  "lines": [
    {
      "description": "exact text from invoice",
      "item_id": "uuid if matched to known item, else null",
      "quantity": number or null,
      "unit_cost": number or null,
      "line_total": number
    }
  ]
}

Rules:
- Match line items to known inventory items where possible
- If not matched, leave item_id as null and use the exact description
- All monetary values in GBP as plain numbers (no £ symbol)
- Dates in YYYY-MM-DD format`,
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

    res.json({ data: extracted });
  } catch (err) { next(err); }
});

// POST /inventory/costs/invoices — save extracted invoice
router.post('/invoices', authenticate, requireManager, async (req, res, next) => {
  try {
    const { supplier_id, delivery_id, invoice_ref, invoice_date, total_amount, lines = [] } = req.body;
    if (!invoice_date) throw new AppError('invoice_date is required', 422);

    await db.transaction(async (trx: any) => {
      const [invoice] = await trx('invoices').insert({
        supplier_id: supplier_id || null, delivery_id: delivery_id || null,
        invoice_ref: invoice_ref || null, invoice_date, total_amount: total_amount || null,
        status: 'pending', created_by: req.user!.sub,
      }).returning('*');

      if (lines.length > 0) {
        await trx('invoice_lines').insert(
          lines.map((l: any) => ({
            invoice_id: invoice.id, item_id: l.item_id || null,
            description: l.description, quantity: l.quantity || null,
            unit_cost: l.unit_cost || null, line_total: l.line_total || 0,
            is_matched: !!l.item_id,
          }))
        );

        // Auto-update unit costs for matched items
        for (const line of lines) {
          if (line.item_id && line.unit_cost) {
            await trx('inventory_items').where({ id: line.item_id })
              .update({ current_unit_cost: line.unit_cost, updated_at: trx.fn.now() });
            await trx('item_cost_history').insert({
              item_id: line.item_id, unit_cost: line.unit_cost,
              effective_from: invoice_date, notes: `Auto-updated from invoice ${invoice_ref || invoice.id}`,
              created_by: req.user!.sub,
            });
          }
        }
      }

      res.status(201).json({ data: invoice, message: 'Invoice saved.' });
    });
  } catch (err) { next(err); }
});

// ── Spend analytics ───────────────────────────────────────────────────────────

// GET /inventory/costs/spend?from=&to= — spend summary
router.get('/spend', authenticate, requireManager, async (req, res, next) => {
  try {
    const to   = (req.query.to as string)   || format(new Date(), 'yyyy-MM-dd');
    const from = (req.query.from as string) || format(subWeeks(parseISO(to), 4), 'yyyy-MM-dd');

    // Spend from invoices
    const invoiceSpend = await db('invoices')
      .where('invoice_date', '>=', from)
      .where('invoice_date', '<=', to)
      .where('total_amount', '>', 0)
      .sum('total_amount as total')
      .count('id as invoice_count')
      .first();

    // Spend by category (from invoice lines matched to items)
    const byCategory = await db('invoice_lines as il')
      .join('invoices as inv', 'il.invoice_id', 'inv.id')
      .join('inventory_items as i', 'il.item_id', 'i.id')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('il.is_matched', true)
      .where('inv.invoice_date', '>=', from)
      .where('inv.invoice_date', '<=', to)
      .groupBy('c.id', 'c.name', 'c.icon', 'c.color')
      .select('c.id as category_id', 'c.name as category_name', 'c.icon', 'c.color', db.raw('sum(il.line_total) as total'));

    // Get budgets for comparison
    const budgets = await db('category_budgets as b')
      .orderByRaw('b.category_id, b.effective_from DESC')
      .distinctOn(['b.category_id'])
      .select('b.category_id', 'b.weekly_budget');

    const budgetMap: Record<string, number> = {};
    for (const b of budgets) budgetMap[b.category_id] = parseFloat(b.weekly_budget);

    const weeksInRange = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (7 * 24 * 60 * 60 * 1000));

    const categorySpend = byCategory.map((c: any) => {
      const total   = parseFloat(c.total || 0);
      const budget  = budgetMap[c.category_id];
      const weeklyBudgetTotal = budget ? budget * weeksInRange : null;
      return {
        ...c,
        total: Math.round(total * 100) / 100,
        weekly_budget: budget || null,
        budget_total: weeklyBudgetTotal,
        over_budget: weeklyBudgetTotal ? total > weeklyBudgetTotal : false,
        budget_pct: weeklyBudgetTotal ? Math.round((total / weeklyBudgetTotal) * 100) : null,
      };
    }).sort((a: any, b: any) => b.total - a.total);

    res.json({
      data: {
        from, to,
        total_spend: Math.round(parseFloat(invoiceSpend?.total as string || '0') * 100) / 100,
        invoice_count: parseInt(invoiceSpend?.invoice_count as string || '0'),
        by_category: categorySpend,
        weeks_in_range: weeksInRange,
      }
    });
  } catch (err) { next(err); }
});

export default router;
