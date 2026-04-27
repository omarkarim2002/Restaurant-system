import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── GET /wages/employees — list employees with wage info ─────────────────────
router.get('/employees', authenticate, requireManager, async (_req, res, next) => {
  try {
    const employees = await db('employees as e')
      .join('roles as r', 'e.role_id', 'r.id')
      .where('e.is_active', true)
      .select(
        'e.id', 'e.first_name', 'e.last_name', 'e.email',
        'e.employment_type', 'e.wage_type', 'e.hourly_rate',
        'e.contracted_hours', 'e.max_hours_per_week', 'e.off_rota',
        'r.name as role_name'
      )
      .orderBy(['e.last_name', 'e.first_name']);

    res.json({ data: employees });
  } catch (err) { next(err); }
});

// ── PATCH /wages/employees/:id — update wage info ────────────────────────────
const WageUpdateSchema = z.object({
  hourly_rate:       z.number().min(0).max(999).optional(),
  wage_type:         z.enum(['hourly', 'salary']).optional(),
  contracted_hours:  z.number().int().min(1).max(60).nullable().optional(),
});

router.patch('/employees/:id', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = WageUpdateSchema.parse(req.body);
    const [updated] = await db('employees')
      .where({ id: req.params.id })
      .update({ ...body, updated_at: db.fn.now() })
      .returning(['id', 'first_name', 'last_name', 'hourly_rate', 'wage_type', 'contracted_hours']);

    if (!updated) throw new AppError('Employee not found', 404);
    res.json({ data: updated, message: 'Wage details updated.' });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

export default router;
