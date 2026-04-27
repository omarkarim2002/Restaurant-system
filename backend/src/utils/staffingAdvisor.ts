import { format, eachDayOfInterval, parseISO, getDay } from 'date-fns';
import db from '../db/connection.js';
import type {
  ShiftAssignment,
  StaffingWarning,
  ScheduleAdvisory,
  Employee,
  Role,
} from '../types/index.js';

// ─── Conflict Detection ────────────────────────────────────────────────────────

export interface ConflictCheckResult {
  hasConflict: boolean;
  reason?: string;
}

/**
 * Checks if assigning an employee to a shift on a given date would cause a conflict.
 * Checks:
 *   1. Employee already has a shift that day
 *   2. Employee has approved time off covering that date
 *   3. Employee is marked unavailable on that day of week
 */
export async function checkAssignmentConflict(
  employeeId: string,
  shiftDate: string, // "YYYY-MM-DD"
  shiftId: string,
  excludeAssignmentId?: string // for updates
): Promise<ConflictCheckResult> {
  // 1. Check for existing shift on same date
  const existing = await db('shift_assignments')
    .where({ employee_id: employeeId, shift_date: shiftDate })
    .whereNot({ shift_id: shiftId }) // allow re-assigning same shift
    .modify((q) => {
      if (excludeAssignmentId) q.whereNot({ id: excludeAssignmentId });
    })
    .first();

  if (existing) {
    return {
      hasConflict: true,
      reason: 'Employee already has a shift assigned on this date.',
    };
  }

  // 2. Check for approved time off
  const timeOff = await db('time_off_requests')
    .where({ employee_id: employeeId, status: 'approved' })
    .where('start_date', '<=', shiftDate)
    .where('end_date', '>=', shiftDate)
    .first();

  if (timeOff) {
    return {
      hasConflict: true,
      reason: 'Employee has approved time off on this date.',
    };
  }

  // 3. Check recurring availability (0=Sun ... 6=Sat)
  const dayOfWeek = getDay(parseISO(shiftDate));
  const availability = await db('availability')
    .where({ employee_id: employeeId, day_of_week: dayOfWeek })
    .first();

  if (availability?.is_unavailable) {
    return {
      hasConflict: true,
      reason: 'Employee has marked themselves as unavailable on this day of the week.',
    };
  }

  return { hasConflict: false };
}

// ─── Staffing Advisory ─────────────────────────────────────────────────────────

/**
 * Analyses a published/draft schedule and returns:
 *   - Understaffed / overstaffed warnings per role per shift per day
 *   - Total hours per employee
 *   - Employees exceeding their max weekly hours
 */
export async function analyseSchedule(scheduleId: string): Promise<ScheduleAdvisory> {
  const schedule = await db('schedules').where({ id: scheduleId }).first();
  if (!schedule) throw new Error('Schedule not found');

  const assignments: (ShiftAssignment & { employee: Employee; role: Role; shift_type: string; start_time: string; end_time: string; duration_hours: number; role_name: string; role_min: number; role_max: number })[] =
    await db('shift_assignments as sa')
      .join('employees as e', 'sa.employee_id', 'e.id')
      .join('roles as r', 'e.role_id', 'r.id')
      .join('shifts as s', 'sa.shift_id', 's.id')
      .where('sa.schedule_id', scheduleId)
      .select(
        'sa.*',
        'e.first_name',
        'e.last_name',
        'e.max_hours_per_week',
        'r.name as role_name',
        'r.min_per_shift as role_min',
        'r.max_per_shift as role_max',
        's.name as shift_name',
        's.shift_type',
        's.duration_hours'
      );

  // Group assignments by date → shift → role
  const grouped: Record<string, Record<string, Record<string, typeof assignments>>> = {};
  for (const a of assignments) {
    const dateKey = format(new Date(a.shift_date), 'yyyy-MM-dd');
    const shiftKey = a.shift_id;
    const roleKey = (a as any).role_name;

    grouped[dateKey] ??= {};
    grouped[dateKey][shiftKey] ??= {};
    grouped[dateKey][shiftKey][roleKey] ??= [];
    grouped[dateKey][shiftKey][roleKey].push(a);
  }

  const warnings: StaffingWarning[] = [];

  for (const [date, shifts] of Object.entries(grouped)) {
    for (const [shiftId, roles] of Object.entries(shifts)) {
      for (const [roleName, roleAssignments] of Object.entries(roles)) {
        const sample = roleAssignments[0] as any;
        const count = roleAssignments.length;
        const min = sample.role_min;
        const max = sample.role_max;

        if (count < min) {
          warnings.push({
            date,
            shift_id: shiftId,
            shift_name: sample.shift_name,
            role_id: sample.role_id ?? '',
            role_name: roleName,
            assigned_count: count,
            min_required: min,
            max_allowed: max,
            level: 'understaffed',
            message: `Only ${count} ${roleName}(s) assigned — minimum is ${min}.`,
          });
        } else if (count > max) {
          warnings.push({
            date,
            shift_id: shiftId,
            shift_name: sample.shift_name,
            role_id: sample.role_id ?? '',
            role_name: roleName,
            assigned_count: count,
            min_required: min,
            max_allowed: max,
            level: 'overstaffed',
            message: `${count} ${roleName}(s) assigned — maximum is ${max}. Cost inefficiency risk.`,
          });
        }
      }
    }
  }

  // Total hours per employee
  const totalHours: Record<string, number> = {};
  for (const a of assignments) {
    totalHours[a.employee_id] = (totalHours[a.employee_id] || 0) + Number((a as any).duration_hours);
  }

  // Employees over max hours
  const employeesOverMax: string[] = [];
  for (const a of assignments) {
    const emp = a as any;
    if ((totalHours[emp.employee_id] || 0) > emp.max_hours_per_week) {
      if (!employeesOverMax.includes(emp.employee_id)) {
        employeesOverMax.push(emp.employee_id);
      }
    }
  }

  return {
    schedule_id: scheduleId,
    week_start: format(new Date(schedule.week_start), 'yyyy-MM-dd'),
    warnings,
    total_hours_by_employee: totalHours,
    employees_over_max_hours: employeesOverMax,
  };
}
