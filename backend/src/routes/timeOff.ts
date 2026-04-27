import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
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

const ReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  review_notes: z.string().max(500).optional(),
});

// ─── Coverage check ────────────────────────────────────────────────────────────
// For each day in the requested range, checks whether removing this employee
// would leave any section below its minimum staffing requirement.
// Returns an array of conflicts (empty = safe to approve).

interface CoverageConflict {
  date: string;
  section: string;
  role: string;
  assigned: number;
  minimum: number;
  shortfall: number;
}

async function checkCoverageImpact(
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<CoverageConflict[]> {
  const conflicts: CoverageConflict[] = [];

  // Get all dates in range
  const days = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  });

  // Get active rota config with sections
  const config = await db('rota_config').where({ is_active: true }).first();
  if (!config) return []; // no config = no rules to violate

  const sections = await db('rota_sections').where({ config_id: config.id }).select('*');
  if (!sections.length) return [];

  // Get the employee's role
  const employee = await db('employees').where({ id: employeeId }).first();
  if (!employee) return [];

  for (const day of days) {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayOfWeek = day.getDay();

    // Skip non-working days
    if (!config.working_days.includes(dayOfWeek)) continue;

    // Skip closed days
    const isClosed = await db('closed_days').where({ closed_date: dateStr }).first();
    if (isClosed) continue;

    // Find the schedule for this week
    const weekStart = format(
      new Date(day.getFullYear(), day.getMonth(), day.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)),
      'yyyy-MM-dd'
    );
    const schedule = await db('schedules').where({ week_start: weekStart }).first();
    if (!schedule) continue; // no schedule yet = nothing to check

    // For each section that covers this employee's role
    const relevantSections = sections.filter(s =>
      !s.role_id || s.role_id === employee.role_id
    );

    for (const section of relevantSections) {
      // Count currently assigned staff in this section on this day
      // (employees with the same role as this section requires)
      const assignedQuery = db('shift_assignments as sa')
        .join('employees as e', 'sa.employee_id', 'e.id')
        .where('sa.schedule_id', schedule.id)
        .where('sa.shift_date', dateStr);

      if (section.role_id) {
        assignedQuery.where('e.role_id', section.role_id);
      }

      const assigned = await assignedQuery.count('sa.id as count').first();
      const assignedCount = Number((assigned as any)?.count ?? 0);

      // Check if this employee is actually assigned on this day
      const isAssigned = await db('shift_assignments')
        .where({
          schedule_id: schedule.id,
          employee_id: employeeId,
          shift_date: dateStr,
        })
        .first();

      if (!isAssigned) continue; // employee isn't working this day anyway

      // If removing them would drop below minimum
      const afterRemoval = assignedCount - 1;
      if (afterRemoval < section.min_staff) {
        conflicts.push({
          date: dateStr,
          section: section.name,
          role: employee.role_name || 'Staff',
          assigned: assignedCount,
          minimum: section.min_staff,
          shortfall: section.min_staff - afterRemoval,
        });
      }
    }
  }

  return conflicts;
}

// ─── GET /time-off ─────────────────────────────────────────────────────────────
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
  } catch (err) { next(err); }
});

// ─── POST /time-off/check ──────────────────────────────────────────────────────
// Dry-run endpoint — checks coverage without submitting
router.post('/check', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date } = req.body;
    if (!start_date || !end_date) throw new AppError('start_date and end_date are required', 422);

    const conflicts = await checkCoverageImpact(req.user!.sub, start_date, end_date);
    res.json({ data: { conflicts, can_request: conflicts.length === 0 } });
  } catch (err) { next(err); }
});

// ─── POST /time-off ────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateTimeOffSchema.parse(req.body);

    if (body.start_date > body.end_date) {
      throw new AppError('start_date must be before or equal to end_date', 422);
    }

    // Check for overlapping existing requests
    const overlap = await db('time_off_requests')
      .where({ employee_id: req.user!.sub })
      .whereIn('status', ['pending', 'approved'])
      .where('start_date', '<=', body.end_date)
      .where('end_date', '>=', body.start_date)
      .first();

    if (overlap) {
      throw new AppError('You already have a time-off request covering some of these dates.', 409);
    }

    // ── Coverage check ─────────────────────────────────────────────────────────
    // Only block if there's an active schedule AND rota config.
    // If no schedule exists yet, allow the request (can't check what doesn't exist).
    const conflicts = await checkCoverageImpact(req.user!.sub, body.start_date, body.end_date);

    if (conflicts.length > 0) {
      // Build a human-readable explanation
      const conflictDetails = conflicts
        .map(c => `${format(parseISO(c.date), 'EEE d MMM')} — ${c.section} would be understaffed (${c.assigned - 1} of ${c.minimum} minimum required)`)
        .join('; ');

      throw new AppError(
        `Time off cannot be requested for these dates as it would leave shifts understaffed: ${conflictDetails}. Please speak to your manager to arrange cover first.`,
        409,
        'COVERAGE_CONFLICT'
      );
    }

    const [request] = await db('time_off_requests')
      .insert({
        ...body,
        employee_id: req.user!.sub,
        status: 'pending',
      })
      .returning('*');

    res.status(201).json({
      data: request,
      message: 'Time-off request submitted successfully.',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

// ─── PATCH /time-off/:id/review ────────────────────────────────────────────────
// Managers can approve/reject — also runs coverage check on approval
router.patch('/:id/review', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ReviewSchema.parse(req.body);

    const request = await db('time_off_requests').where({ id: req.params.id }).first();
    if (!request) throw new AppError('Request not found', 404);

    // If manager is approving, run coverage check
    if (body.status === 'approved') {
      const conflicts = await checkCoverageImpact(
        request.employee_id,
        format(new Date(request.start_date), 'yyyy-MM-dd'),
        format(new Date(request.end_date), 'yyyy-MM-dd')
      );

      if (conflicts.length > 0) {
        const conflictDetails = conflicts
          .map(c => `${format(parseISO(c.date), 'EEE d MMM')}: ${c.section} would be understaffed (${c.assigned - 1}/${c.minimum} minimum)`)
          .join('; ');

        // Don't block manager — just attach a warning to the response
        const [updated] = await db('time_off_requests')
          .where({ id: req.params.id })
          .update({
            ...body,
            reviewed_by: req.user!.sub,
            reviewed_at: db.fn.now(),
          })
          .returning('*');

        return res.json({
          data: updated,
          message: `Approved with coverage warning.`,
          warning: `Approving this creates understaffed shifts: ${conflictDetails}. Consider updating the rota.`,
        });
      }
    }

    const [updated] = await db('time_off_requests')
      .where({ id: req.params.id })
      .update({
        ...body,
        reviewed_by: req.user!.sub,
        reviewed_at: db.fn.now(),
      })
      .returning('*');

    res.json({ data: updated, message: `Request ${body.status}.` });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

export default router;
