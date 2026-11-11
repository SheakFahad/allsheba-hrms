export type AppRole = "admin" | "entry";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern" | "probation";
export type EmploymentStatus = "active" | "on_notice" | "suspended" | "resigned" | "terminated";
export type AttendanceStatus =
  | "present" | "late" | "half_day" | "absent" | "leave" | "holiday" | "weekly_off";
export type LateReason =
  | "traffic_jam" | "transport_problem" | "personal_emergency" | "health_issue"
  | "family_issue" | "weather_problem" | "other";
export type AttendanceSource = "entry" | "admin" | "closing" | "correction";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type CorrectionStatus = "applied" | "pending" | "approved" | "rejected";
export type PayrollStatus = "draft" | "finalized";
export type PayrollDayBasis = "fixed_30" | "calendar" | "working";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
}

export interface Designation {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  is_default: boolean;
  is_active: boolean;
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  kind: "public" | "company" | "optional";
  notes: string | null;
}

export interface CompanySettings {
  company_name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_path: string | null;
  timezone: string;
  currency: string;
  employee_code_prefix: string;
  max_employees: number;
  weekly_off_days: number[];
  late_reason_required: boolean;
  late_note_required_for_other: boolean;
  entry_backdate_days: number;
  entry_edit_days: number;
  auto_close_enabled: boolean;
  auto_close_time: string;
  payroll_day_basis: PayrollDayBasis;
  absent_deduction_enabled: boolean;
  unpaid_leave_deduction_enabled: boolean;
  half_day_deduction_enabled: boolean;
  late_deduction_enabled: boolean;
  late_days_per_deduction: number;
  late_deduction_day_fraction: number;
  overtime_enabled: boolean;
  overtime_rate_multiplier: number;
  overtime_min_minutes: number;
  report_footer: string | null;
  payslip_note: string | null;
  updated_at: string;
}

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  photo_path: string | null;
  phone: string | null;
  designation_id: string | null;
  department_id: string | null;
  shift_id: string | null;
  joining_date: string;
  employment_type: EmploymentType;
  status: EmploymentStatus;
  archived_at: string | null;
  archived_reason: string | null;
  created_at: string;
  updated_at: string;
  departments?: { name: string } | null;
  designations?: { name: string } | null;
  shifts?: { name: string; start_time: string; end_time: string } | null;
}

export interface EmployeePersonal {
  employee_id: string;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  national_id: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  notes: string | null;
}

export interface SalaryStructure {
  id: string;
  employee_id: string;
  effective_from: string;
  basic_salary: number;
  allowances: number;
  notes: string | null;
  created_at: string;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  title: string;
  category: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
}

export interface EmployeeEvent {
  id: string;
  employee_id: string;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  attendance_date: string;
  shift_id: string | null;
  scheduled_in: string;
  scheduled_out: string;
  grace_minutes: number;
  actual_in: string | null;
  actual_out: string | null;
  status: AttendanceStatus;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  work_minutes: number;
  late_reason: LateReason | null;
  late_reason_note: string | null;
  notes: string | null;
  source: AttendanceSource;
  is_locked: boolean;
  entered_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  employees?: Pick<Employee, "employee_code" | "full_name" | "department_id"> & {
    departments?: { name: string } | null;
  };
}

export interface AttendanceCorrection {
  id: string;
  attendance_id: string | null;
  employee_id: string;
  attendance_date: string;
  kind: "edit" | "request";
  status: CorrectionStatus;
  reason: string | null;
  before_data: Record<string, unknown> | null;
  proposed_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  days_per_year: number;
  is_paid: boolean;
  allow_half_day: boolean;
  carry_forward: boolean;
  max_carry_days: number;
  color: string;
  is_active: boolean;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  applied_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface PayrollRecord {
  id: string;
  period_year: number;
  period_month: number;
  status: PayrollStatus;
  basis_days: number;
  working_days: number;
  settings_snapshot: Record<string, unknown>;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  employee_count: number;
  notes: string | null;
  generated_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
}

export interface PayrollItem {
  id: string;
  payroll_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  department_name: string | null;
  designation_name: string | null;
  basic_salary: number;
  allowances: number;
  per_day_rate: number;
  working_days: number;
  present_days: number;
  late_days: number;
  half_days: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  overtime_minutes: number;
  overtime_amount: number;
  absent_deduction: number;
  unpaid_leave_deduction: number;
  half_day_deduction: number;
  late_deduction: number;
  bonus: number;
  other_earnings: number;
  other_deduction: number;
  adjustment_note: string | null;
  gross_earnings: number;
  total_deductions: number;
  net_salary: number;
  calculation: Record<string, unknown>;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
