import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── Categories ────────────────────────────────────────────────────────────────

router.get('/categories', authenticate, async (_req, res, next) => {
  try {
    const cats = await db('inventory_categories')
      .where({ is_active: true })
      .orderBy('sort_order')
      .select('*');

    // Attach item counts
    const counts = await db('inventory_items')
      .where({ is_active: true })
      .groupBy('category_id')
      .select('category_id', db.raw('count(*) as item_count'));

    const countMap: Record<string, number> = {};
    for (const c of counts) countMap[c.category_id] = parseInt(c.item_count);

    res.json({ data: cats.map(c => ({ ...c, item_count: countMap[c.id] || 0 })) });
  } catch (err) { next(err); }
});

const CategorySchema = z.object({
  name:       z.string().min(1).max(100),
  icon:       z.string().max(10).optional(),
  color:      z.string().max(20).optional(),
  sort_order: z.number().int().optional(),
});

router.post('/categories', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = CategorySchema.parse(req.body);
    const [cat] = await db('inventory_categories')
      .insert({ ...body, created_by: req.user!.sub })
      .returning('*');
    res.status(201).json({ data: cat });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.patch('/categories/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = CategorySchema.partial().parse(req.body);
    const [updated] = await db('inventory_categories')
      .where({ id: req.params.id })
      .update({ ...body, updated_at: db.fn.now() })
      .returning('*');
    if (!updated) throw new AppError('Category not found', 404);
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.delete('/categories/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    await db('inventory_categories').where({ id: req.params.id }).update({ is_active: false, updated_at: db.fn.now() });
    res.json({ message: 'Category removed.' });
  } catch (err) { next(err); }
});

// ── Items ─────────────────────────────────────────────────────────────────────

router.get('/items', authenticate, async (req, res, next) => {
  try {
    const { category_id } = req.query;
    const items = await db('inventory_items as i')
      .join('inventory_categories as c', 'i.category_id', 'c.id')
      .where('i.is_active', true)
      .modify(q => { if (category_id) q.where('i.category_id', category_id as string); })
      .orderBy(['c.sort_order', 'i.name'])
      .select(
        'i.id', 'i.name', 'i.unit', 'i.par_level', 'i.current_stock',
        'i.notes', 'i.category_id', 'i.created_at',
        'c.name as category_name', 'c.icon as category_icon', 'c.color as category_color'
      );

    // Compute stock status
    const withStatus = items.map(item => {
      const stock = parseFloat(String(item.current_stock)) || 0;
      const par   = parseFloat(String(item.par_level)) || 0;
      const ratio = par > 0 ? stock / par : 1;
      const status = ratio === 0 ? 'critical' : ratio < 0.4 ? 'critical' : ratio < 0.75 ? 'low' : 'ok';
      return { ...item, stock_status: status, stock_ratio: ratio };
    });

    res.json({ data: withStatus });
  } catch (err) { next(err); }
});

const ItemSchema = z.object({
  category_id:   z.string().uuid(),
  name:          z.string().min(1).max(200),
  unit:          z.string().min(1).max(50),
  par_level:     z.number().min(0).optional(),
  current_stock: z.number().min(0).optional(),
  notes:         z.string().max(500).optional().nullable(),
});

router.post('/items', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = ItemSchema.parse(req.body);
    const [item] = await db('inventory_items')
      .insert({ ...body, created_by: req.user!.sub })
      .returning('*');
    res.status(201).json({ data: item, message: `${item.name} added.` });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

// Bulk import from AI extraction
const BulkImportSchema = z.object({
  items: z.array(z.object({
    category_id:   z.string().uuid(),
    name:          z.string().min(1).max(200),
    unit:          z.string().min(1).max(50),
    par_level:     z.number().min(0).optional(),
  })),
});

router.post('/items/bulk', authenticate, requireManager, async (req, res, next) => {
  try {
    const { items } = BulkImportSchema.parse(req.body);
    const rows = await db('inventory_items')
      .insert(items.map(i => ({ ...i, created_by: req.user!.sub })))
      .returning('*');
    res.status(201).json({ data: rows, message: `${rows.length} items imported.` });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.patch('/items/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = ItemSchema.partial().parse(req.body);
    const [updated] = await db('inventory_items')
      .where({ id: req.params.id })
      .update({ ...body, updated_at: db.fn.now() })
      .returning('*');
    if (!updated) throw new AppError('Item not found', 404);
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

router.delete('/items/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    await db('inventory_items').where({ id: req.params.id }).update({ is_active: false, updated_at: db.fn.now() });
    res.json({ message: 'Item removed.' });
  } catch (err) { next(err); }
});

// ── AI extraction endpoint ────────────────────────────────────────────────────
// Accepts base64 image, sends to Claude, returns structured item list

router.post('/extract', authenticate, requireManager, async (req, res, next) => {
  try {
    const { image_base64, media_type = 'image/jpeg' } = req.body;
    if (!image_base64) throw new AppError('image_base64 is required', 422);

    const categories = await db('inventory_categories').where({ is_active: true }).orderBy('sort_order').select('id', 'name');
    const categoryList = categories.map(c => `- ${c.name} (id: ${c.id})`).join('\n');

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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type, data: image_base64 },
            },
            {
              type: 'text',
              text: `This is a restaurant inventory or order sheet. Extract all inventory items visible.

Available categories (use the exact id):
${categoryList}

Return ONLY a JSON array, no other text, no markdown:
[
  {
    "name": "item name",
    "unit": "kg/litre/unit/bag/box/dozen/etc",
    "par_level": number or 0 if not shown,
    "category_id": "exact uuid from the list above"
  }
]

Rules:
- Use the closest matching category
- If unit is not clear, use "unit"
- Normalise item names (title case, remove abbreviations)
- Do not include duplicates
- Return empty array [] if no items found`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new AppError(`AI extraction failed: ${err}`, 500);
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '[]';

    let extracted: any[] = [];
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      extracted = JSON.parse(clean);
    } catch {
      throw new AppError('Could not parse AI response — try a clearer image.', 422);
    }

    res.json({ data: { items: extracted, count: extracted.length } });
  } catch (err) { next(err); }
});

export default router;
