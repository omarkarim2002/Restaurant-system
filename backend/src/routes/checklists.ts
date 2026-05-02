import { Router } from 'express';
import { format } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const MODEL = 'claude-haiku-4-5';

// ── GET /inventory/checklists?date=&limit= ────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { date, limit } = req.query;
    const rows = await db('shift_checklists as c')
      .leftJoin('employees as e', 'c.submitted_by', 'e.id')
      .modify((q: any) => { if (date) q.where('c.checklist_date', date); })
      .orderBy('c.checklist_date', 'desc')
      .limit(parseInt(limit as string) || 30)
      .select(
        'c.id', 'c.checklist_date', 'c.shift_type', 'c.status',
        'c.extracted_by_ai', 'c.notes', 'c.submitted_at', 'c.created_at',
        'e.first_name as submitted_by_first', 'e.last_name as submitted_by_last'
      );

    // Attach counts
    const ids = rows.map((r: any) => r.id);
    const counts = ids.length > 0
      ? await db('checklist_items').whereIn('checklist_id', ids)
          .groupBy('checklist_id')
          .select(
            'checklist_id',
            db.raw("count(*) as total"),
            db.raw("count(*) filter (where status = 'low') as low_count"),
            db.raw("count(*) filter (where status = 'out') as out_count"),
            db.raw("count(*) filter (where flagged_for_order = true) as flagged_count")
          )
      : [];
    const cmap: Record<string, any> = {};
    for (const c of counts) cmap[c.checklist_id] = c;

    res.json({ data: rows.map((r: any) => ({ ...r, ...cmap[r.id] })) });
  } catch (err) { next(err); }
});

// ── GET /inventory/checklists/:id ─────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const checklist = await db('shift_checklists as c')
      .leftJoin('employees as e', 'c.submitted_by', 'e.id')
      .where('c.id', req.params.id).first()
      .select('c.*', 'e.first_name as submitted_by_first', 'e.last_name as submitted_by_last');
    if (!checklist) throw new AppError('Checklist not found', 404);

    const items = await db('checklist_items as ci')
      .leftJoin('inventory_items as i', 'ci.item_id', 'i.id')
      .where('ci.checklist_id', req.params.id)
      .orderBy('ci.sort_order')
      .select('ci.*', 'i.unit as item_unit', 'i.current_unit_cost');

    res.json({ data: { ...checklist, items } });
  } catch (err) { next(err); }
});

// ── POST /inventory/checklists — create blank or from items ───────────────────
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { checklist_date, shift_type, notes, items } = req.body;
    const date = checklist_date || format(new Date(), 'yyyy-MM-dd');

    const [checklist] = await db('shift_checklists').insert({
      checklist_date: date,
      shift_type: shift_type || 'close',
      notes,
      submitted_by: (req as any).user?.sub,
    }).returning('*');

    if (items?.length > 0) {
      await db('checklist_items').insert(
        items.map((item: any, i: number) => ({
          checklist_id: checklist.id,
          item_id: item.item_id || null,
          item_name: item.item_name || item.name,
          status: item.status || 'unknown',
          notes: item.notes,
          quantity_remaining: item.quantity_remaining,
          flagged_for_order: item.flagged_for_order || false,
          sort_order: i,
        }))
      );
    }

    res.status(201).json({ data: checklist });
  } catch (err) { next(err); }
});

// ── POST /inventory/checklists/extract — AI reads a photo ────────────────────
// Staff photograph the paper checklist, Haiku reads it and returns items + status
router.post('/extract', authenticate, async (req, res, next) => {
  try {
    const { image_base64, media_type, checklist_date, shift_type } = req.body;
    if (!image_base64) throw new AppError('image_base64 required', 422);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new AppError('Anthropic API key not configured', 500);

    // Fetch known inventory items to help with matching
    const knownItems = await db('inventory_items')
      .where({ is_active: true })
      .select('id', 'name', 'unit')
      .limit(200);
    const itemList = knownItems.map((i: any) => i.name).join(', ');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 },
            },
            {
              type: 'text',
              text: `This is a restaurant end-of-shift stock checklist. Extract every item and its stock status.

Known inventory items for matching: ${itemList}

Return ONLY a JSON array, no other text:
[
  {
    "item_name": "Tomatoes",
    "matched_item_name": "Tomatoes",
    "status": "low",
    "quantity_remaining": "about 1kg",
    "notes": "need more by Tuesday",
    "flagged_for_order": true
  }
]

Status values:
- "ok" = plenty of stock, no action needed
- "low" = running low, should reorder soon
- "out" = completely out, urgent
- "unknown" = can't tell from checklist

flagged_for_order = true if the item is marked as needing ordering (low or out, or explicitly marked on the list).

Extract ALL items visible on the checklist, even if their status is ok. If the image is unclear, still try to extract what you can.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) throw new AppError('AI extraction failed', 500);
    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '[]';

    let extracted: any[] = [];
    try { extracted = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { throw new AppError('Could not parse AI response', 422); }

    // Match to known inventory items
    const nameToItem: Record<string, any> = {};
    for (const item of knownItems) nameToItem[item.name.toLowerCase()] = item;

    const matched = extracted.map((e: any, i: number) => {
      const matchName = (e.matched_item_name || e.item_name || '').toLowerCase();
      const knownItem = nameToItem[matchName] || Object.values(nameToItem).find((ki: any) => matchName.includes(ki.name.toLowerCase()) || ki.name.toLowerCase().includes(matchName));
      return {
        ...e,
        item_id: knownItem?.id || null,
        item_name: e.item_name,
        sort_order: i,
      };
    });

    // Create checklist + save to DB
    const date = checklist_date || format(new Date(), 'yyyy-MM-dd');
    const [checklist] = await db('shift_checklists').insert({
      checklist_date: date,
      shift_type: shift_type || 'close',
      image_media_type: media_type || 'image/jpeg',
      extracted_by_ai: true,
      submitted_by: (req as any).user?.sub,
    }).returning('*');

    if (matched.length > 0) {
      await db('checklist_items').insert(matched.map((m: any) => ({
        checklist_id: checklist.id,
        item_id: m.item_id,
        item_name: m.item_name,
        status: m.status || 'unknown',
        notes: m.notes,
        quantity_remaining: m.quantity_remaining,
        flagged_for_order: !!m.flagged_for_order,
        sort_order: m.sort_order,
      })));
    }

    res.json({
      data: {
        checklist_id: checklist.id,
        extracted_count: matched.length,
        flagged_count: matched.filter((m: any) => m.flagged_for_order).length,
        items: matched,
      }
    });
  } catch (err) { next(err); }
});

// ── PATCH /inventory/checklists/:id/items/:itemId — update a single item ──────
router.patch('/:id/items/:itemId', authenticate, async (req, res, next) => {
  try {
    const { status, notes, quantity_remaining, flagged_for_order } = req.body;
    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (quantity_remaining !== undefined) updates.quantity_remaining = quantity_remaining;
    if (flagged_for_order !== undefined) updates.flagged_for_order = flagged_for_order;
    await db('checklist_items').where({ id: req.params.itemId, checklist_id: req.params.id }).update(updates);
    res.json({ message: 'Updated' });
  } catch (err) { next(err); }
});

// ── POST /inventory/checklists/:id/items — add a manual item ─────────────────
router.post('/:id/items', authenticate, async (req, res, next) => {
  try {
    const { item_id, item_name, status, notes, quantity_remaining, flagged_for_order } = req.body;
    if (!item_name) throw new AppError('item_name required', 422);
    const count = await db('checklist_items').where({ checklist_id: req.params.id }).count('* as c').first();
    const [item] = await db('checklist_items').insert({
      checklist_id: req.params.id,
      item_id: item_id || null,
      item_name,
      status: status || 'unknown',
      notes,
      quantity_remaining,
      flagged_for_order: !!flagged_for_order,
      sort_order: parseInt(count?.c as string || '0'),
    }).returning('*');
    res.json({ data: item });
  } catch (err) { next(err); }
});

// ── DELETE /inventory/checklists/:id/items/:itemId ────────────────────────────
router.delete('/:id/items/:itemId', authenticate, async (req, res, next) => {
  try {
    await db('checklist_items').where({ id: req.params.itemId, checklist_id: req.params.id }).delete();
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

// ── POST /inventory/checklists/:id/submit — finalise + notify owner ───────────
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const checklist = await db('shift_checklists').where({ id: req.params.id }).first();
    if (!checklist) throw new AppError('Checklist not found', 404);

    await db('shift_checklists').where({ id: req.params.id }).update({
      status: 'submitted',
      submitted_by: (req as any).user?.sub,
      submitted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    // Get flagged items for notification
    const flagged = await db('checklist_items')
      .where({ checklist_id: req.params.id, flagged_for_order: true });
    const out    = await db('checklist_items').where({ checklist_id: req.params.id, status: 'out' }).count('* as c').first();
    const low    = await db('checklist_items').where({ checklist_id: req.params.id, status: 'low' }).count('* as c').first();
    const outCount = parseInt(out?.c as string || '0');
    const lowCount = parseInt(low?.c as string || '0');

    if (flagged.length > 0 || outCount > 0) {
      const managers = await db('employees').whereIn('system_role', ['manager', 'admin']).where({ is_active: true }).select('id');
      if (managers.length > 0) {
        const itemNames = flagged.slice(0, 3).map((f: any) => f.item_name).join(', ');
        const moreText = flagged.length > 3 ? ` +${flagged.length - 3} more` : '';
        await db('notifications').insert(managers.map((m: any) => ({
          user_id: m.id,
          type: 'checklist_submitted',
          title: outCount > 0 ? `🔴 Close checklist: ${outCount} items OUT` : `📋 Close checklist submitted`,
          body: `${lowCount} low · ${outCount} out · Needs ordering: ${itemNames}${moreText}`,
          link: `/inventory/checklists/${req.params.id}`,
          reference_id: req.params.id,
        })));
      }
    }

    // Auto-create item requests for "out" items
    const outItems = await db('checklist_items').where({ checklist_id: req.params.id, status: 'out' });
    const requester = (req as any).user?.sub;
    for (const item of outItems) {
      await db('item_requests').insert({
        item_id: item.item_id || null,
        custom_item: !item.item_id ? item.item_name : null,
        quantity_needed: item.quantity_remaining || 'needs restocking',
        urgency: 'urgent',
        notes: `Auto-flagged from close checklist — OUT of stock`,
        requested_by: requester,
      }).onConflict().ignore();
    }

    res.json({ message: 'Checklist submitted.', flagged_count: flagged.length, out_count: outCount });
  } catch (err) { next(err); }
});

// ── GET /inventory/checklists/flagged/items — all flagged items for next order
router.get('/flagged/items', authenticate, async (_req, res, next) => {
  try {
    const cutoff = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const items = await db('checklist_items as ci')
      .join('shift_checklists as c', 'ci.checklist_id', 'c.id')
      .leftJoin('inventory_items as i', 'ci.item_id', 'i.id')
      .where('c.checklist_date', '>=', cutoff)
      .where('c.status', 'submitted')
      .where('ci.flagged_for_order', true)
      .orderBy([{ column: 'c.checklist_date', order: 'desc' }, { column: 'ci.status', order: 'asc' }])
      .select('ci.*', 'c.checklist_date', 'c.shift_type', 'i.unit as item_unit');
    res.json({ data: items });
  } catch (err) { next(err); }
});

export default router;
