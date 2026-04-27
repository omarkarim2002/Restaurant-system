import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { format, startOfWeek, parseISO } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { checkAssignmentConflict, analyseSchedule } from '../utils/staffingAdvisor.js';

const router = Router();

// ─── GET /schedules — list schedules ─────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedules = await db('schedules')
      .select('*')
      .orderBy('week_start', 'desc')
      .limit(20);
    res.json({ data: schedules });
  } catch (err) {
    next(err);
  }
});

// ─── GET /schedules/:id — get schedule with all assignments ──────────────────

router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schedule = await db('schedules').where({ id: req.params.id }).first();
    if (!schedule) throw new AppError('Schedule not found', 404);

    const assignments = await db('shift_assignments as sa')
      .join('employees as e', 'sa.employee_id', 'e.id')
      .join('roles as r', 'e.role_id', 'r.id')
      .join('shifts as s', 'sa.shift_id', 's.id')
      .where('sa.schedule_id', req.params.id)
      .select(
        'sa.id',
        'sa.shift_date',
        'sa.notes',
        'sa.employee_id',
        'sa.shift_id',
        'e.first_name',
        'e.last_name',
        'r.name as role_name',
        's.name as shift_name',
        's.shift_type',
        's.start_time',
        's.end_time',
        's.duration_hours'
      )
      .orderBy(['sa.shift_date', 's.start_time']);

    res.json({ data: { ...schedule, assignments } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /schedules — create a new week schedule ────────────────────────────

const CreateScheduleSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Must be a Monday
  notes: z.string().optional(),
});

router.post('/', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateScheduleSchema.parse(req.body);

    // Force to Monday of the given week
    const weekStart = format(
      startOfWeek(parseISO(body.week_start), { weekStartsOn: 1 }),
      'yyyy-MM-dd'
    );

    const [schedule] = await db('schedules')
      .insert({
        week_start: weekStart,
        notes: body.notes,
        created_by: req.user!.sub,
        status: 'draft',
      })
      .returning('*');

    res.status(201).json({ data: schedule });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map((e) => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

// ─── POST /schedules/:id/assignments — add a shift assignment ─────────────────

const CreateAssignmentSchema = z.object({
  employee_id: z.string().uuid(),
  shift_id: z.string().uuid(),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

router.post('/:id/assignments', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scheduleId = req.params.id;
    const schedule = await db('schedules').where({ id: scheduleId }).first();
    if (!schedule) throw new AppError('Schedule not found', 404);
    if (schedule.status === 'archived') throw new AppError('Cannot modify an archived schedule', 400);

    const body = CreateAssignmentSchema.parse(req.body);

    // ── Conflict check ──────────────────────────────────────────────────────
    const conflict = await checkAssignmentConflict(
      body.employee_id,
      body.shift_date,
      body.shift_id
    );

    if (conflict.hasConflict) {
      throw new AppError(conflict.reason!, 409, 'SCHEDULING_CONFLICT');
    }

    const [assignment] = await db('shift_assignments')
      .insert({ ...body, schedule_id: scheduleId })
      .returning('*');

    res.status(201).json({
      data: assignment,
      message: 'Shift assigned successfully.',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map((e) => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

// ─── DELETE /schedules/:id/assignments/:assignmentId ─────────────────────────

router.delete('/:id/assignments/:assignmentId', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await db('shift_assignments')
      .where({ id: req.params.assignmentId, schedule_id: req.params.id })
      .delete();

    if (!deleted) throw new AppError('Assignment not found', 404);

    res.json({ message: 'Assignment removed.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /schedules/:id/publish ─────────────────────────────────────────────

router.post('/:id/publish', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [schedule] = await db('schedules')
      .where({ id: req.params.id })
      .update({
        status: 'published',
        published_at: db.fn.now(),
        updated_at: db.fn.now(),
      })
      .returning('*');

    if (!schedule) throw new AppError('Schedule not found', 404);

    res.json({ data: schedule, message: 'Schedule published.' });
  } catch (err) {
    next(err);
  }
});

// ─── GET /schedules/:id/advisory — staffing warnings ─────────────────────────

router.get('/:id/advisory', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const advisory = await analyseSchedule(req.params.id);
    res.json({ data: advisory });
  } catch (err) {
    next(err);
  }
});

export default router;
