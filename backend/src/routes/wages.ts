import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { format, startOfWeek } from 'date-fns';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { getNationalLivingWage } from '../utils/nlwCache.js';
import { calculateWeeklyWages } from '../utils/wageEstimator.js';

const router = Router();

// ── GET /wages/nlw ────────────────────────────────────────────────────────────
router.get('/nlw', authenticate, async (_req, res, next) => {
  try {
    const nlw = await getNationalLivingWage();
    res.json({ data: nlw });
  } catch (err) { next(err); }
});

// ── GET /wages/week?week_start=YYYY-MM-DD ─────────────────────────────────────
router.get('/week', authenticate, requireManager, async (req, res, next) => {
  try {
    const weekStart = req.query.week_start as string
      || format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

    const wages = await calculateWeeklyWages(weekStart);
    res.json({ data: wages });
  } catch (err) { next(err); }
});


// ── GET /wages/month?month_start=YYYY-MM-DD ───────────────────────────────────
// Returns per-week breakdown + per-employee totals for the full month
router.get('/month', authenticate, requireManager, async (req, res, next) => {
  try {
    const monthStartStr = req.query.month_start as string;
    if (!monthStartStr) throw new AppError('month_start is required', 422);

    const monthStart = new Date(monthStartStr + 'T12:00:00Z');
    const monthEnd   = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0); // last day of month

    // Find all Monday week starts that overlap with this month
    const weeks: any[] = [];
    const cur = new Date(monthStart);
    // Back to Monday of the week containing monthStart
    const dow = cur.getDay();
    cur.setDate(cur.getDate() - (dow === 0 ? 6 : dow - 1));

    while (cur <= monthEnd) {
      const weekStart = cur.toISOString().split('T')[0];
      const weekEndDate = new Date(cur);
      weekEndDate.setDate(weekEndDate.getDate() + 6);
      const weekEnd = weekEndDate.toISOString().split('T')[0];

      const weekWages = await calculateWeeklyWages(weekStart);
      const schedule = await db('schedules').where({ week_start: weekStart }).first();

      weeks.push({
        week_start: weekStart,
        week_end: weekEnd,
        has_assignments: weekWages.employee_breakdown.length > 0,
        predicted_hours: weekWages.total_predicted_hours,
        predicted_wage: weekWages.total_predicted_wage,
        confirmed_wage: Math.round(weekWages.employee_breakdown.reduce((s: number, e: any) => s + e.confirmed_wage, 0) * 100) / 100,
        confirmed_hours: Math.round(weekWages.employee_breakdown.reduce((s: number, e: any) => s + e.confirmed_hours, 0) * 100) / 100,
        has_unconfirmed: weekWages.has_unconfirmed,
        status: schedule?.status ?? null,
        signed_off_date: null, // Phase 4 will populate this
      });

      cur.setDate(cur.getDate() + 7);
    }

    // Roll up per-employee totals across all weeks
    const empTotals: Record<string, any> = {};
    for (const week of weeks) {
      const weekWages = await calculateWeeklyWages(week.week_start);
      for (const emp of weekWages.employee_breakdown) {
        if (!empTotals[emp.employee_id]) {
          empTotals[emp.employee_id] = {
            employee_id:    emp.employee_id,
            first_name:     emp.first_name,
            last_name:      emp.last_name,
            hourly_rate:    emp.hourly_rate,
            predicted_hours: 0,
            predicted_wage:  0,
            confirmed_hours: 0,
            confirmed_wage:  0,
            has_unconfirmed: false,
          };
        }
        empTotals[emp.employee_id].predicted_hours  += emp.predicted_hours;
        empTotals[emp.employee_id].predicted_wage   += emp.predicted_wage;
        empTotals[emp.employee_id].confirmed_hours  += emp.confirmed_hours;
        empTotals[emp.employee_id].confirmed_wage   += emp.confirmed_wage;
        if (emp.has_unconfirmed_shifts) empTotals[emp.employee_id].has_unconfirmed = true;
      }
    }

    // Round employee totals
    const employeeTotals = Object.values(empTotals).map((e: any) => ({
      ...e,
      predicted_hours: Math.round(e.predicted_hours * 100) / 100,
      predicted_wage:  Math.round(e.predicted_wage  * 100) / 100,
      confirmed_hours: Math.round(e.confirmed_hours * 100) / 100,
      confirmed_wage:  Math.round(e.confirmed_wage  * 100) / 100,
    })).sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));

    // Grand totals
    const totals = {
      predicted_wage:  Math.round(weeks.reduce((s, w) => s + w.predicted_wage,  0) * 100) / 100,
      confirmed_wage:  Math.round(weeks.reduce((s, w) => s + w.confirmed_wage,  0) * 100) / 100,
      predicted_hours: Math.round(weeks.reduce((s, w) => s + w.predicted_hours, 0) * 100) / 100,
      confirmed_hours: Math.round(weeks.reduce((s, w) => s + w.confirmed_hours, 0) * 100) / 100,
    };

    res.json({
      data: {
        month_start:     monthStartStr,
        weeks:           weeks.filter(w => w.has_assignments || w.week_start >= monthStartStr),
        employee_totals: employeeTotals,
        totals,
      }
    });
  } catch (err) { next(err); }
});

// ── GET /wages/employees ──────────────────────────────────────────────────────
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

// ── PATCH /wages/employees/:id ────────────────────────────────────────────────
const WageUpdateSchema = z.object({
  hourly_rate:      z.number().min(0).max(9999).optional(),
  wage_type:        z.enum(['hourly', 'salary']).optional(),
  contracted_hours: z.number().int().min(1).max(168).nullable().optional(),
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
