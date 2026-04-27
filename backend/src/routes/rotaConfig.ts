import { Router, Request, Response, NextFunction } from 'express';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const router = Router();

// ── GET /rota-config ─────────────────────────────────────────────────────────
router.get('/', authenticate, async (_req, res, next) => {
  try {
    const config = await db('rota_config').where({ is_active: true }).orderBy('created_at', 'desc').first();
    if (!config) return res.json({ data: null });
    const days = await db('rota_config_days').where({ config_id: config.id }).orderBy('day_of_week');
    const sections = await db('rota_sections as s')
      .leftJoin('roles as r', 's.role_id', 'r.id')
      .where('s.config_id', config.id)
      .orderBy('s.sort_order')
      .select('s.*', 'r.name as role_name');
    res.json({ data: { ...config, days, sections } });
  } catch (err) { next(err); }
});

// ── POST /rota-config ────────────────────────────────────────────────────────
const SectionSchema = z.object({
  name: z.string().min(1),
  role_id: z.string().uuid().optional().nullable(),
  min_staff: z.number().int().min(1),
  max_staff: z.number().int().min(1),
  sort_order: z.number().int().optional(),
  shift_start_1: z.string(), shift_end_1: z.string().optional().nullable(),
  shift_start_2: z.string().optional().nullable(), shift_end_2: z.string().optional().nullable(),
  shift_start_3: z.string().optional().nullable(), shift_end_3: z.string().optional().nullable(),
  shift_start_4: z.string().optional().nullable(), shift_end_4: z.string().optional().nullable(),
  shift_start_5: z.string().optional().nullable(), shift_end_5: z.string().optional().nullable(),
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

router.post('/', authenticate, requireManager, async (req, res, next) => {
  try {
    const body = ConfigSchema.parse(req.body);
    await db.transaction(async (trx) => {
      await trx('rota_config').update({ is_active: false });
      const [config] = await trx('rota_config').insert({
        name: body.name || 'Default Config',
        working_days: body.working_days,
        is_active: true,
        created_by: req.user!.sub,
      }).returning('*');
      if (body.days.length > 0) await trx('rota_config_days').insert(body.days.map(d => ({ ...d, config_id: config.id })));
      if (body.sections.length > 0) await trx('rota_sections').insert(body.sections.map((s, i) => ({ ...s, config_id: config.id, sort_order: s.sort_order ?? i })));
    });
    const fresh = await db('rota_config').where({ is_active: true }).first();
    const days = await db('rota_config_days').where({ config_id: fresh.id }).orderBy('day_of_week');
    const sections = await db('rota_sections').where({ config_id: fresh.id }).orderBy('sort_order');
    res.status(201).json({ data: { ...fresh, days, sections }, message: 'Configuration saved.' });
  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

// ── Closed days ───────────────────────────────────────────────────────────────
router.get('/closed-days', authenticate, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const query = db('closed_days').select('*').orderBy('closed_date');
    if (from) query.where('closed_date', '>=', from as string);
    if (to) query.where('closed_date', '<=', to as string);
    res.json({ data: await query });
  } catch (err) { next(err); }
});

router.post('/closed-days', authenticate, requireManager, async (req, res, next) => {
  try {
    const { closed_date, reason } = req.body;
    if (!closed_date) throw new AppError('closed_date is required', 422);
    const [row] = await db('closed_days').insert({ closed_date, reason, created_by: req.user!.sub }).onConflict('closed_date').merge({ reason }).returning('*');
    res.status(201).json({ data: row });
  } catch (err) { next(err); }
});

router.delete('/closed-days/:date', authenticate, requireManager, async (req, res, next) => {
  try {
    await db('closed_days').where({ closed_date: req.params.date }).delete();
    res.json({ message: 'Closed day removed.' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ── SMART ROTA GENERATOR ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const GenerateSchema = z.object({
  mode: z.enum(['week', 'month']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Get shift slots from a section row (shift_start_1..5)
 */
function getSectionShifts(section: any): { start: string; end: string | null; slot: number }[] {
  const slots = [];
  for (let i = 1; i <= 5; i++) {
    const start = section[`shift_start_${i}`];
    if (!start) break;
    slots.push({ start: start.slice(0, 5), end: section[`shift_end_${i}`]?.slice(0, 5) ?? null, slot: i });
  }
  return slots;
}

/**
 * Parse "HH:MM" into minutes since midnight
 */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calculate shift duration in hours
 */
function shiftHours(start: string, end: string | null): number {
  if (!end) return 8; // default assumption if no end time
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (e < s) e += 24 * 60; // crosses midnight
  return (e - s) / 60;
}

/**
 * Find the best matching shift template from the DB for a given start/end
 */
function findShiftTemplate(shifts: any[], start: string, end: string | null): any | null {
  // Exact match first
  const exact = shifts.find(s => {
    const sStart = s.start_time?.slice(0, 5);
    const sEnd = s.end_time?.slice(0, 5);
    if (sStart !== start) return false;
    if (!end) return true;
    return sEnd === end;
  });
  if (exact) return exact;

  // Fallback: match by start time only
  return shifts.find(s => s.start_time?.slice(0, 5) === start) ?? null;
}

router.post('/generate', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode, start_date } = GenerateSchema.parse(req.body);

    const config = await db('rota_config').where({ is_active: true }).first();
    if (!config) throw new AppError('No rota configuration found. Set up your rota config first.', 400);

    const sections = await db('rota_sections').where({ config_id: config.id }).orderBy('sort_order');
    if (!sections.length) throw new AppError('No sections configured. Add at least one section.', 400);

    // Load all active employees with role info
    const employees = await db('employees as e')
      .join('roles as r', 'e.role_id', 'r.id')
      .where('e.is_active', true)
      .where('e.off_rota', false)
      .select('e.id', 'e.first_name', 'e.last_name', 'e.role_id', 'e.max_hours_per_week', 'e.employment_type', 'r.name as role_name');

    if (!employees.length) throw new AppError('No active employees found.', 400);

    // Build date range
    const startDate = new Date(start_date + 'T12:00:00Z');
    const endDate = new Date(start_date + 'T12:00:00Z');
    endDate.setDate(endDate.getDate() + (mode === 'week' ? 6 : 29));

    const closedRows = await db('closed_days')
      .where('closed_date', '>=', start_date)
      .where('closed_date', '<=', endDate.toISOString().split('T')[0]);
    const closedDates = new Set(closedRows.map((r: any) => r.closed_date?.toISOString?.().split('T')[0] ?? r.closed_date));

    const workingDays: number[] = config.working_days;
    const allShiftTemplates = await db('shifts').where({ is_active: true }).select('*');

    // Collect all Mondays in range
    const mondays: string[] = [];
    const cur = new Date(startDate);
    const dow = cur.getDay();
    cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1));
    while (cur <= endDate) {
      mondays.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 7);
    }

    // ── Weekly hours tracking (reset per week) ────────────────────────────────
    // empWeeklyHours[weekKey][empId] = hours assigned so far this week
    const empWeeklyHours: Record<string, Record<string, number>> = {};

    // ── Rotation counter: track how many times each employee was assigned ─────
    // Used to distribute fairly across the period
    const empTotalAssignments: Record<string, number> = {};
    for (const e of employees) empTotalAssignments[e.id] = 0;

    const results: { week: string; schedule_id: string; assignments: number }[] = [];

    for (const weekStart of mondays) {
      if (!empWeeklyHours[weekStart]) {
        empWeeklyHours[weekStart] = {};
        for (const e of employees) empWeeklyHours[weekStart][e.id] = 0;
      }
      const weekHours = empWeeklyHours[weekStart];

      await db.transaction(async (trx) => {
        let schedule = await trx('schedules').where({ week_start: weekStart }).first();
        if (!schedule) {
          [schedule] = await trx('schedules').insert({
            week_start: weekStart,
            status: 'draft',
            created_by: req.user!.sub,
            notes: `Auto-generated (${mode})`,
          }).returning('*');
        }

        let assignmentCount = 0;

        // For each day Mon→Sun
        for (let d = 0; d < 7; d++) {
          const date = new Date(weekStart + 'T12:00:00Z');
          date.setUTCDate(date.getUTCDate() + d);
          const dateStr = date.toISOString().split('T')[0];
          const dayOfWeek = date.getUTCDay(); // 0=Sun

          if (!workingDays.includes(dayOfWeek)) continue;
          if (closedDates.has(dateStr)) continue;

          // Already-assigned employee IDs today (across all sections)
          const alreadyToday = new Set<string>(
            (await trx('shift_assignments')
              .where({ schedule_id: schedule.id, shift_date: dateStr })
              .select('employee_id'))
              .map((a: any) => a.employee_id)
          );

          // ── Process each section ────────────────────────────────────────────
          for (const section of sections) {
            const sectionShifts = getSectionShifts(section);
            if (!sectionShifts.length) continue;

            // Get eligible employees for this section
            const eligible = section.role_id
              ? employees.filter(e => e.role_id === section.role_id)
              : employees;

            if (!eligible.length) continue;

            // Check who is available (not on time off, not marked unavailable)
            const onTimeOff = await trx('time_off_requests')
              .whereIn('employee_id', eligible.map(e => e.id))
              .where('status', 'approved')
              .where('start_date', '<=', dateStr)
              .where('end_date', '>=', dateStr)
              .select('employee_id');
            const onTimeOffIds = new Set(onTimeOff.map((r: any) => r.employee_id));

            const unavailable = await trx('availability')
              .whereIn('employee_id', eligible.map(e => e.id))
              .where({ day_of_week: dayOfWeek, is_unavailable: true })
              .select('employee_id');
            const unavailableIds = new Set(unavailable.map((r: any) => r.employee_id));

            // Available = eligible, not on time off, not marked unavailable
            const available = eligible.filter(e =>
              !onTimeOffIds.has(e.id) &&
              !unavailableIds.has(e.id)
            );

            if (!available.length) continue;

            // ── Distribute staff across shift slots ──────────────────────────
            // Goal: fill each slot up to max_staff, respect min/max per section,
            // prioritise employees with fewer assignments and remaining hours.
            //
            // Strategy:
            // 1. Split max_staff evenly across slots (round-robin)
            // 2. For each slot, score and rank available employees:
            //    - Not already working today = priority
            //    - Fewer total assignments across the period = fairer rotation
            //    - More remaining weekly hours = can take more shifts
            // 3. Assign top-N where N = per-slot quota

            const totalSlots = sectionShifts.length;
            const maxPerSlot = Math.max(1, Math.floor(section.max_staff / totalSlots));
            const minPerSlot = Math.max(1, Math.floor(section.min_staff / totalSlots));

            for (const shiftSlot of sectionShifts) {
              const template = findShiftTemplate(allShiftTemplates, shiftSlot.start, shiftSlot.end);
              if (!template) continue;

              const hours = shiftHours(shiftSlot.start, shiftSlot.end);

              // Score each available employee for this slot
              const scored = available
                .filter(e => {
                  // Must have remaining hours budget
                  const remainingHours = e.max_hours_per_week - (weekHours[e.id] || 0);
                  return remainingHours >= hours * 0.8; // allow 80% threshold
                })
                .map(e => ({
                  emp: e,
                  alreadyToday: alreadyToday.has(e.id),
                  totalAssignments: empTotalAssignments[e.id] || 0,
                  remainingHours: e.max_hours_per_week - (weekHours[e.id] || 0),
                }))
                .sort((a, b) => {
                  // 1. Prefer not already working today
                  if (a.alreadyToday !== b.alreadyToday) return a.alreadyToday ? 1 : -1;
                  // 2. Prefer fewer total assignments (fair rotation)
                  if (a.totalAssignments !== b.totalAssignments) return a.totalAssignments - b.totalAssignments;
                  // 3. Prefer more remaining hours (more capacity)
                  return b.remainingHours - a.remainingHours;
                });

              // Assign up to maxPerSlot employees
              let slotAssigned = 0;
              for (const { emp } of scored) {
                if (slotAssigned >= maxPerSlot) break;

                try {
                  const inserted = await trx('shift_assignments')
                    .insert({
                      schedule_id: schedule.id,
                      employee_id: emp.id,
                      shift_id: template.id,
                      shift_date: dateStr,
                    })
                    .onConflict(['employee_id', 'shift_date', 'shift_id'])
                    .ignore()
                    .returning('id');

                  if (inserted.length > 0) {
                    weekHours[emp.id] = (weekHours[emp.id] || 0) + hours;
                    empTotalAssignments[emp.id] = (empTotalAssignments[emp.id] || 0) + 1;
                    alreadyToday.add(emp.id);
                    slotAssigned++;
                    assignmentCount++;
                  }
                } catch {}
              }
            }
          }
        }

        results.push({ week: weekStart, schedule_id: schedule.id, assignments: assignmentCount });
      });
    }

    res.json({
      data: { results, total_assignments: results.reduce((a, r) => a + r.assignments, 0) },
      message: `Generated ${results.length} week${results.length !== 1 ? 's' : ''} of rota.`,
    });

  } catch (err) {
    if (err instanceof z.ZodError) next(new AppError(err.errors.map(e => e.message).join(', '), 422));
    else next(err);
  }
});

export default router;
