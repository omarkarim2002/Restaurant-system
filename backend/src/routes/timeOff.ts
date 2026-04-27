import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const CreateTimeOffSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
  request_type: z.enum(['holiday', 'sick', 'personal', 'unpaid']).default('holiday'),
});

// ─── GET /time-off — list requests (manager sees all, staff sees own) ──────────

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const isManager = ['manager', 'admin'].includes(req.user!.system_role);

    const requests = await db('time_off_requests as t')
      .join('employees as e', 't.employee_id', 'e.id')
      .select(
        't.*',
        'e.first_name',
        'e.last_name',
        db.raw("e.first_name || ' ' || e.last_name as employee_name")
      )
      .modify((q) => {
        if (!isManager) q.where('t.employee_id', req.user!.sub);
        if (status) q.where('t.status', status);
      })
      .orderBy('t.created_at', 'desc');

    res.json({ data: requests });
  } catch (err) {
    next(err);
  }
});

// ─── POST /time-off — submit request ─────────────────────────────────────────

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateTimeOffSchema.parse(req.body);

    if (body.start_date > body.end_date) {
      throw new AppError('start_date must be before or equal to end_date', 422);
    }

    // Check for overlapping approved/pending requests
    const overlap = await db('time_off_requests')
      .where({ employee_id: req.user!.sub })
      .whereIn('status', ['pending', 'approved'])
      .where('start_date', '<=', body.end_date)
      .where('end_date', '>=', body.start_date)
      .first();

    if (overlap) {
      throw new AppError('You already have a time-off request covering some of these dates.', 409);
    }

    const [request] = await db('time_off_requests')
      .insert({
        ...body,
        employee_id: req.user!.sub,
        status: 'pending',
      })
      .returning('*');

    res.status(201).json({ data: request, message: 'Time-off request submitted.' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map((e) => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

// ─── PATCH /time-off/:id/review — approve or reject ──────────────────────────

const ReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  review_notes: z.string().max(500).optional(),
});

router.patch('/:id/review', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ReviewSchema.parse(req.body);

    const [updated] = await db('time_off_requests')
      .where({ id: req.params.id })
      .update({
        ...body,
        reviewed_by: req.user!.sub,
        reviewed_at: db.fn.now(),
      })
      .returning('*');

    if (!updated) throw new AppError('Request not found', 404);

    res.json({ data: updated, message: `Request ${body.status}.` });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map((e) => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

export default router;
