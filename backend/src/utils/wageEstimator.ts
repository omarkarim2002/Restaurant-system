import db from '../db/connection.js';

// ─────────────────────────────────────────────────────────────────────────────
// WAGE ESTIMATION ENGINE
// Strategy (in order of data quality):
//   1. Use actual confirmed hours from shift_actuals (best — real data)
//   2. Use scheduled end time from shift template (second best)
//   3. Use average of past actuals for same shift_type + role (learned)
//   4. Use average of past actuals for same shift_type (fallback)
//   5. Use industry defaults by shift type (cold start)
// As real data accumulates, the engine automatically upgrades each estimate.
// ─────────────────────────────────────────────────────────────────────────────

const SHIFT_TYPE_DEFAULTS: Record<string, number> = {
  morning:   8.0,
  afternoon: 8.0,
  evening:   7.0,
  full_day:  11.5,
};

const COLD_START_DEFAULT = 7.5;

interface ShiftEstimate {
  hours: number;
  confidence: 'confirmed' | 'scheduled' | 'learned_role' | 'learned_type' | 'default';
  source: string;
}

// Cache learned averages in memory for the request lifetime
const learnedCache: Record<string, number> = {};

async function getLearnedAverage(
  shiftType: string,
  roleId: string | null
): Promise<{ byRole: number | null; byType: number | null }> {
  // By role + shift type
  let byRole: number | null = null;
  if (roleId) {
    const key = `${shiftType}:${roleId}`;
    if (learnedCache[key] !== undefined) {
      byRole = learnedCache[key];
    } else {
      const result = await db('shift_actuals as sa')
        .join('shift_assignments as ass', 'sa.shift_assignment_id', 'ass.id')
        .join('shifts as s', 'ass.shift_id', 's.id')
        .join('employees as e', 'sa.employee_id', 'e.id')
        .where('sa.is_confirmed', true)
        .where('s.shift_type', shiftType)
        .where('e.role_id', roleId)
        .whereNotNull('sa.actual_hours')
        .avg('sa.actual_hours as avg_hours')
        .count('sa.id as sample_count')
        .first();

      const count = parseInt(String(result?.sample_count || '0'));
      if (count >= 3) { // Need at least 3 data points to trust
        byRole = parseFloat(String(result?.avg_hours || '0'));
        learnedCache[key] = byRole;
      }
    }
  }

  // By shift type only
  const typeKey = `type:${shiftType}`;
  let byType: number | null = null;
  if (learnedCache[typeKey] !== undefined) {
    byType = learnedCache[typeKey];
  } else {
    const result = await db('shift_actuals as sa')
      .join('shift_assignments as ass', 'sa.shift_assignment_id', 'ass.id')
      .join('shifts as s', 'ass.shift_id', 's.id')
      .where('sa.is_confirmed', true)
      .where('s.shift_type', shiftType)
      .whereNotNull('sa.actual_hours')
      .avg('sa.actual_hours as avg_hours')
      .count('sa.id as sample_count')
      .first();

    const count = parseInt(String(result?.sample_count || '0'));
    if (count >= 3) {
      byType = parseFloat(String(result?.avg_hours || '0'));
      learnedCache[typeKey] = byType;
    }
  }

  return { byRole, byType };
}

export async function estimateShiftHours(
  assignmentId: string,
  shiftType: string,
  scheduledStart: string | null,
  scheduledEnd: string | null,
  roleId: string | null
): Promise<ShiftEstimate> {

  // 1. Check for confirmed actual hours
  const actual = await db('shift_actuals')
    .where({ shift_assignment_id: assignmentId, is_confirmed: true })
    .whereNotNull('actual_hours')
    .first();

  if (actual) {
    return {
      hours: parseFloat(actual.actual_hours),
      confidence: 'confirmed',
      source: 'Confirmed actual hours',
    };
  }

  // 2. Use scheduled end time if available
  if (scheduledStart && scheduledEnd) {
    const hours = calcHours(scheduledStart, scheduledEnd);
    if (hours > 0 && hours <= 16) {
      return {
        hours,
        confidence: 'scheduled',
        source: 'Scheduled shift times',
      };
    }
  }

  // 3 & 4. Use learned averages from past actuals
  const learned = await getLearnedAverage(shiftType, roleId);

  if (learned.byRole !== null) {
    return {
      hours: learned.byRole,
      confidence: 'learned_role',
      source: `Average from past ${shiftType} shifts (this role)`,
    };
  }

  if (learned.byType !== null) {
    return {
      hours: learned.byType,
      confidence: 'learned_type',
      source: `Average from past ${shiftType} shifts`,
    };
  }

  // 5. Industry default by shift type
  const defaultHours = SHIFT_TYPE_DEFAULTS[shiftType] ?? COLD_START_DEFAULT;
  return {
    hours: defaultHours,
    confidence: 'default',
    source: `Default estimate for ${shiftType} shift`,
  };
}

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins < startMins) endMins += 24 * 60; // crosses midnight
  return (endMins - startMins) / 60;
}

// ─── Weekly wage prediction ────────────────────────────────────────────────────
export interface WeeklyWagePrediction {
  total_predicted_wage: number;
  total_predicted_hours: number;
  has_unconfirmed: boolean;
  confidence_breakdown: {
    confirmed: number;
    scheduled: number;
    learned: number;
    default: number;
  };
  employee_breakdown: {
    employee_id: string;
    first_name: string;
    last_name: string;
    hourly_rate: number;
    predicted_hours: number;
    predicted_wage: number;
    confirmed_hours: number;
    confirmed_wage: number;
    has_unconfirmed_shifts: boolean;
  }[];
}

export async function calculateWeeklyWages(weekStart: string): Promise<WeeklyWagePrediction> {
  // Get all schedules for this week
  const schedule = await db('schedules').where({ week_start: weekStart }).first();

  if (!schedule) {
    return {
      total_predicted_wage: 0,
      total_predicted_hours: 0,
      has_unconfirmed: false,
      confidence_breakdown: { confirmed: 0, scheduled: 0, learned: 0, default: 0 },
      employee_breakdown: [],
    };
  }

  // Get all assignments with employee + shift info
  const assignments = await db('shift_assignments as sa')
    .join('employees as e', 'sa.employee_id', 'e.id')
    .join('shifts as s', 'sa.shift_id', 's.id')
    .leftJoin('shift_actuals as act', 'sa.id', 'act.shift_assignment_id')
    .where('sa.schedule_id', schedule.id)
    .where('e.is_active', true)
    .select(
      'sa.id as assignment_id',
      'sa.shift_date',
      'e.id as employee_id',
      'e.first_name',
      'e.last_name',
      'e.hourly_rate',
      'e.role_id',
      's.shift_type',
      's.start_time',
      's.end_time',
      'act.actual_hours',
      'act.is_confirmed',
    );

  // Group by employee
  const byEmployee: Record<string, any> = {};
  const breakdown = { confirmed: 0, scheduled: 0, learned: 0, default: 0 };

  for (const a of assignments) {
    if (!byEmployee[a.employee_id]) {
      byEmployee[a.employee_id] = {
        employee_id: a.employee_id,
        first_name: a.first_name,
        last_name: a.last_name,
        hourly_rate: parseFloat(a.hourly_rate) || 0,
        predicted_hours: 0,
        predicted_wage: 0,
        confirmed_hours: 0,
        confirmed_wage: 0,
        has_unconfirmed_shifts: false,
      };
    }

    const emp = byEmployee[a.employee_id];
    const rate = parseFloat(a.hourly_rate) || 0;

    // Is this shift in the past?
    const shiftDate = new Date(a.shift_date + 'T12:00:00Z');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = shiftDate < today;

    const estimate = await estimateShiftHours(
      a.assignment_id,
      a.shift_type,
      a.start_time,
      a.end_time,
      a.role_id
    );

    emp.predicted_hours += estimate.hours;
    emp.predicted_wage += estimate.hours * rate;

    if (a.is_confirmed && a.actual_hours) {
      emp.confirmed_hours += parseFloat(a.actual_hours);
      emp.confirmed_wage += parseFloat(a.actual_hours) * rate;
      breakdown.confirmed++;
    } else {
      if (isPast) emp.has_unconfirmed_shifts = true;
      if (estimate.confidence === 'scheduled') breakdown.scheduled++;
      else if (estimate.confidence.startsWith('learned')) breakdown.learned++;
      else breakdown.default++;
    }
  }

  const employeeBreakdown = Object.values(byEmployee);
  const totalPredicted = employeeBreakdown.reduce((s: number, e: any) => s + e.predicted_wage, 0);
  const totalHours = employeeBreakdown.reduce((s: number, e: any) => s + e.predicted_hours, 0);
  const hasUnconfirmed = employeeBreakdown.some((e: any) => e.has_unconfirmed_shifts);

  return {
    total_predicted_wage: Math.round(totalPredicted * 100) / 100,
    total_predicted_hours: Math.round(totalHours * 100) / 100,
    has_unconfirmed: hasUnconfirmed,
    confidence_breakdown: breakdown,
    employee_breakdown: employeeBreakdown.map((e: any) => ({
      ...e,
      predicted_hours: Math.round(e.predicted_hours * 100) / 100,
      predicted_wage: Math.round(e.predicted_wage * 100) / 100,
      confirmed_hours: Math.round(e.confirmed_hours * 100) / 100,
      confirmed_wage: Math.round(e.confirmed_wage * 100) / 100,
    })),
  };
}
