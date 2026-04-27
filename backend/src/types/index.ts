// ─── Core Domain Types ────────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  description?: string;
  min_per_shift: number;
  max_per_shift: number;
  created_at: Date;
}

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role_id: string;
  employment_type: 'full_time' | 'part_time' | 'casual';
  max_hours_per_week: number;
  is_active: boolean;
  system_role: 'staff' | 'manager' | 'admin';
  created_at: Date;
  updated_at: Date;
  // Joined
  role?: Role;
}

export type ShiftType = 'morning' | 'afternoon' | 'evening' | 'full_day';

export interface Shift {
  id: string;
  name: string;
  shift_type: ShiftType;
  start_time: string; // "08:00"
  end_time: string;
  duration_hours: number;
  is_active: boolean;
  created_at: Date;
}

export type ScheduleStatus = 'draft' | 'published' | 'archived';

export interface Schedule {
  id: string;
  week_start: Date;
  status: ScheduleStatus;
  created_by?: string;
  published_at?: Date;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  // Joined
  assignments?: ShiftAssignment[];
}

export interface ShiftAssignment {
  id: string;
  schedule_id: string;
  employee_id: string;
  shift_id: string;
  shift_date: Date;
  notes?: string;
  created_at: Date;
  // Joined
  employee?: Employee;
  shift?: Shift;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Availability {
  id: string;
  employee_id: string;
  day_of_week: DayOfWeek;
  available_from?: string;
  available_until?: string;
  is_unavailable: boolean;
  created_at: Date;
}

export type TimeOffStatus = 'pending' | 'approved' | 'rejected';
export type TimeOffType = 'holiday' | 'sick' | 'personal' | 'unpaid';

export interface TimeOffRequest {
  id: string;
  employee_id: string;
  start_date: Date;
  end_date: Date;
  reason?: string;
  request_type: TimeOffType;
  status: TimeOffStatus;
  reviewed_by?: string;
  review_notes?: string;
  reviewed_at?: Date;
  created_at: Date;
  // Joined
  employee?: Employee;
}

export interface DemandInput {
  id: string;
  target_date: Date;
  expected_covers: number;
  source: 'manual' | 'booking_sync';
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// ─── Smart Staffing Advisory Types ────────────────────────────────────────────

export type StaffingWarningLevel = 'ok' | 'understaffed' | 'overstaffed';

export interface StaffingWarning {
  date: string;
  shift_id: string;
  shift_name: string;
  role_id: string;
  role_name: string;
  assigned_count: number;
  min_required: number;
  max_allowed: number;
  level: StaffingWarningLevel;
  message: string;
}

export interface ScheduleAdvisory {
  schedule_id: string;
  week_start: string;
  warnings: StaffingWarning[];
  total_hours_by_employee: Record<string, number>;
  employees_over_max_hours: string[];
}

// ─── API Types ─────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string; // employee id
  email: string;
  system_role: 'staff' | 'manager' | 'admin';
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}
