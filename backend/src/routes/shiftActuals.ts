import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ── GET /shift-actuals?schedule_id=&shift_date= ───────────────────────────────
// Returns all actuals for a schedule (or filtered by date)
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { schedule_id, shift_date } = req.query;
    if (!schedule_id) throw new AppError('schedule_id is required', 422);

    const actuals = await db('shift_actuals as sa')
      .join('shift_assignments as ass', 'sa.shift_assignment_id', 'ass.id')
      .where('ass.schedule_id', schedule_id as string)
      .modify((q) => { if (shift_date) q.where('sa.shift_date', shift_date as string); })
      .select(
        'sa.id',
        'sa.shift_assignment_id',
        'sa.employee_id',
        'sa.shift_date',
        'sa.scheduled_start',
        'sa.scheduled_end',
        'sa.actual_start',
        'sa.actual_end',
        'sa.actual_hours',
        'sa.is_confirmed',
        'sa.notes',
        'sa.confirmed_at',
      );

    res.json({ data: actuals });
  } catch (err) { next(err); }
});

// ── POST /shift-actuals — confirm finish time for a shift assignment ───────────
const ConfirmSchema = z.object({
  shift_assignment_id: z.string().uuid(),
  employee_id:         z.string().uuid(),
  shift_date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_start:     z.string(),
  scheduled_end:       z.string().optional().nullable(),
  actual_start:        z.string().optional().nullable(),
  actual_end:          z.string(),  // required — this is what manager is confirming
  notes:               z.string().max(300).optional().nullable(),
});

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e < s) e += 24 * 60; // crosses midnight
  return Math.round(((e - s) / 60) * 100) / 100;
}

router.post('/', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ConfirmSchema.parse(req.body);

    // Validate the assignment exists
    const assignment = await db('shift_assignments').where({ id: body.shift_assignment_id }).first();
    if (!assignment) throw new AppError('Shift assignment not found', 404);

    const actualStart = body.actual_start || body.scheduled_start;
    const actualHours = calcHours(actualStart, body.actual_end);

    if (actualHours <= 0 || actualHours > 16) {
      throw new AppError('Actual hours seems incorrect — please check start and end times.', 422);
    }

    // Upsert — one actual per assignment
    const [actual] = await db('shift_actuals')
      .insert({
        shift_assignment_id: body.shift_assignment_id,
        employee_id:         body.employee_id,
        shift_date:          body.shift_date,
        scheduled_start:     body.scheduled_start,
        scheduled_end:       body.scheduled_end || null,
        actual_start:        actualStart,
        actual_end:          body.actual_end,
        actual_hours:        actualHours,
        is_confirmed:        true,
        confirmed_by:        req.user!.sub,
        confirmed_at:        db.fn.now(),
        notes:               body.notes || null,
        updated_at:          db.fn.now(),
      })
      .onConflict('shift_assignment_id')
      .merge({
        actual_start:  actualStart,
        actual_end:    body.actual_end,
        actual_hours:  actualHours,
        is_confirmed:  true,
        confirmed_by:  req.user!.sub,
        confirmed_at:  db.fn.now(),
        notes:         body.notes || null,
        updated_at:    db.fn.now(),
      })
      .returning('*');

    res.status(201).json({
      data: actual,
      message: `${actualHours}h confirmed for this shift.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

// ── DELETE /shift-actuals/:id — un-confirm a shift (back to predicted) ────────
router.delete('/:assignmentId', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db('shift_actuals').where({ shift_assignment_id: req.params.assignmentId }).delete();
    res.json({ message: 'Confirmation removed — shift reverted to predicted.' });
  } catch (err) { next(err); }
});

export default router;
