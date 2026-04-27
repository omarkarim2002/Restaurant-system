import { Router, Request, Response, NextFunction } from 'express';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const router = Router();

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── GET /rota-config — fetch active config with days + sections ──────────────
router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await db('rota_config').where({ is_active: true }).orderBy('created_at', 'desc').first();
    if (!config) return res.json({ data: null });

    const days = await db('rota_config_days')
      .where({ config_id: config.id }).orderBy('day_of_week');

    const sections = await db('rota_sections as s')
      .leftJoin('roles as r', 's.role_id', 'r.id')
      .where('s.config_id', config.id)
      .orderBy('s.sort_order')
      .select('s.*', 'r.name as role_name');

    res.json({ data: { ...config, days, sections } });
  } catch (err) { next(err); }
});

// ── POST /rota-config — create or replace config ─────────────────────────────
const SectionSchema = z.object({
  name: z.string().min(1),
  role_id: z.string().uuid().optional().nullable(),
  min_staff: z.number().int().min(1),
  max_staff: z.number().int().min(1),
  shift_start_1: z.string(),
  shift_end_1: z.string().optional().nullable(),
  shift_start_2: z.string().optional().nullable(),
  shift_end_2: z.string().optional().nullable(),
  sort_order: z.number().int().optional(),
});

const DaySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  open_time: z.string(),
  close_time: z.string(),
  is_open: z.boolean(),
});

const ConfigSchema = z.object({
  name: z.string().min(1).optional(),
  working_days: z.array(z.number().int().min(0).max(6)),
  days: z.array(DaySchema),
  sections: z.array(SectionSchema),
});

router.post('/', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ConfigSchema.parse(req.body);

    await db.transaction(async (trx) => {
      // Deactivate old configs
      await trx('rota_config').update({ is_active: false });

      // Create new config
      const [config] = await trx('rota_config').insert({
        name: body.name || 'Default Config',
        working_days: body.working_days,
        is_active: true,
        created_by: req.user!.sub,
      }).returning('*');

      // Insert day configs
      if (body.days.length > 0) {
        await trx('rota_config_days').insert(
          body.days.map(d => ({ ...d, config_id: config.id }))
        );
      }

      // Insert sections
      if (body.sections.length > 0) {
        await trx('rota_sections').insert(
          body.sections.map((s, i) => ({ ...s, config_id: config.id, sort_order: s.sort_order ?? i }))
        );
      }
    });

    // Return fresh config
    const fresh = await db('rota_config').where({ is_active: true }).first();
    const days = await db('rota_config_days').where({ config_id: fresh.id }).orderBy('day_of_week');
    const sections = await db('rota_sections').where({ config_id: fresh.id }).orderBy('sort_order');

    res.status(201).json({ data: { ...fresh, days, sections }, message: 'Configuration saved.' });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

// ── GET /rota-config/closed-days ─────────────────────────────────────────────
router.get('/closed-days', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = req.query;
    const query = db('closed_days').select('*').orderBy('closed_date');
    if (from) query.where('closed_date', '>=', from as string);
    if (to) query.where('closed_date', '<=', to as string);
    res.json({ data: await query });
  } catch (err) { next(err); }
});

// ── POST /rota-config/closed-days ────────────────────────────────────────────
router.post('/closed-days', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { closed_date, reason } = req.body;
    if (!closed_date) throw new AppError('closed_date is required', 422);
    const [row] = await db('closed_days')
      .insert({ closed_date, reason, created_by: req.user!.sub })
      .onConflict('closed_date').merge({ reason })
      .returning('*');
    res.status(201).json({ data: row });
  } catch (err) { next(err); }
});

// ── DELETE /rota-config/closed-days/:date ────────────────────────────────────
router.delete('/closed-days/:date', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db('closed_days').where({ closed_date: req.params.date }).delete();
    res.json({ message: 'Closed day removed.' });
  } catch (err) { next(err); }
});

// ── POST /rota-config/generate ───────────────────────────────────────────────
// Auto-generates shift assignments for a week or month
const GenerateSchema = z.object({
  mode: z.enum(['week', 'month']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post('/generate', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode, start_date } = GenerateSchema.parse(req.body);

    const config = await db('rota_config').where({ is_active: true }).first();
    if (!config) throw new AppError('No rota configuration found. Please set up your rota config first.', 400);

    const sections = await db('rota_sections').where({ config_id: config.id }).orderBy('sort_order');
    if (sections.length === 0) throw new AppError('No sections configured. Add at least one section to your rota config.', 400);

    const employees = await db('employees as e')
      .join('roles as r', 'e.role_id', 'r.id')
      .where({ 'e.is_active': true })
      .select('e.*', 'r.name as role_name');

    if (employees.length === 0) throw new AppError('No active employees found.', 400);

    // Get closed days
    const startDate = new Date(start_date);
    const endDate = new Date(start_date);
    if (mode === 'week') {
      endDate.setDate(endDate.getDate() + 6);
    } else {
      endDate.setDate(endDate.getDate() + 29);
    }

    const closedDaysRows = await db('closed_days')
      .where('closed_date', '>=', start_date)
      .where('closed_date', '<=', endDate.toISOString().split('T')[0]);

    const closedDates = new Set(closedDaysRows.map((r: any) => r.closed_date.toISOString?.().split('T')[0] || r.closed_date));

    const workingDays: number[] = config.working_days;

    // Get all shifts
    const shifts = await db('shifts').where({ is_active: true }).select('*');

    const results: { week: string; schedule_id: string; assignments: number }[] = [];
    const errors: string[] = [];

    // Generate week by week
    const weeksToGenerate: Date[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      // Get Monday of this week
      const dayOfWeek = cur.getDay();
      const monday = new Date(cur);
      monday.setDate(cur.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      
      const weekKey = monday.toISOString().split('T')[0];
      if (!weeksToGenerate.find(w => w.toISOString().split('T')[0] === weekKey)) {
        weeksToGenerate.push(new Date(monday));
      }
      cur.setDate(cur.getDate() + 7);
    }

    for (const weekStart of weeksToGenerate) {
      const weekKey = weekStart.toISOString().split('T')[0];

      await db.transaction(async (trx) => {
        // Create or get schedule for this week
        let schedule = await trx('schedules').where({ week_start: weekKey }).first();
        if (!schedule) {
          [schedule] = await trx('schedules').insert({
            week_start: weekKey,
            status: 'draft',
            created_by: req.user!.sub,
            notes: `Auto-generated (${mode})`,
          }).returning('*');
        }

        let assignmentCount = 0;

        // For each day of the week
        for (let d = 0; d < 7; d++) {
          const date = new Date(weekStart);
          date.setDate(weekStart.getDate() + d);
          const dateStr = date.toISOString().split('T')[0];
          const dayOfWeek = date.getDay();

          // Skip if not a working day or is closed
          if (!workingDays.includes(dayOfWeek)) continue;
          if (closedDates.has(dateStr)) continue;

          // For each section, assign staff
          for (const section of sections) {
            // Find employees matching this section's role
            const roleEmployees = section.role_id
              ? employees.filter((e: any) => e.role_id === section.role_id)
              : employees;

            if (roleEmployees.length === 0) continue;

            // Check availability and time off for this day
            const available = await trx('employees as e')
              .leftJoin('availability as a', function() {
                this.on('a.employee_id', '=', 'e.id').andOn('a.day_of_week', '=', trx.raw('?', [dayOfWeek]));
              })
              .leftJoin('time_off_requests as t', function() {
                this.on('t.employee_id', '=', 'e.id')
                  .andOn('t.status', '=', trx.raw("'approved'"))
                  .andOnVal('t.start_date', '<=', dateStr)
                  .andOnVal('t.end_date', '>=', dateStr);
              })
              .whereIn('e.id', roleEmployees.map((e: any) => e.id))
              .whereNull('t.id')                    // no approved time off
              .where(function() {
                this.whereNull('a.id').orWhere('a.is_unavailable', false);
              })
              .select('e.id', 'e.first_name', 'e.last_name')
              .groupBy('e.id', 'e.first_name', 'e.last_name');

            if (available.length === 0) continue;

            // Find the right shift template
            const findShift = (startTime: string, endTime: string | null) => {
              return shifts.find((s: any) => {
                const matchStart = s.start_time === startTime || s.start_time.slice(0,5) === startTime;
                if (!matchStart) return false;
                if (!endTime) return true;
                return s.end_time === endTime || s.end_time.slice(0,5) === endTime;
              });
            };

            const shiftsToAssign = [
              { start: section.shift_start_1, end: section.shift_end_1 },
              section.shift_start_2 ? { start: section.shift_start_2, end: section.shift_end_2 } : null,
            ].filter(Boolean) as { start: string; end: string | null }[];

            // Already assigned today for this schedule
            const alreadyAssigned = await trx('shift_assignments')
              .where({ schedule_id: schedule.id, shift_date: dateStr })
              .select('employee_id');
            const assignedIds = new Set(alreadyAssigned.map((a: any) => a.employee_id));

            // Distribute available staff evenly across shift starts
            const unassigned = available.filter((e: any) => !assignedIds.has(e.id));
            const toAssign = unassigned.slice(0, section.max_staff);

            for (let si = 0; si < toAssign.length; si++) {
              const emp = toAssign[si];
              const shiftDef = shiftsToAssign[si % shiftsToAssign.length];
              const shift = findShift(shiftDef.start, shiftDef.end);
              if (!shift) continue;

              try {
                await trx('shift_assignments').insert({
                  schedule_id: schedule.id,
                  employee_id: emp.id,
                  shift_id: shift.id,
                  shift_date: dateStr,
                }).onConflict(['employee_id', 'shift_date', 'shift_id']).ignore();
                assignmentCount++;
              } catch {}
            }
          }
        }

        results.push({ week: weekKey, schedule_id: schedule.id, assignments: assignmentCount });
      });
    }

    res.json({
      data: { results, total_assignments: results.reduce((a, r) => a + r.assignments, 0) },
      message: `Generated ${results.length} week${results.length > 1 ? 's' : ''} of rota.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

export default router;
