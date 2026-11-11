import type {
  AttendanceStatus, EmploymentStatus, EmploymentType, LateReason, LeaveStatus,
  PayrollDayBasis, CorrectionStatus, AttendanceSource,
} from "./types";

export const DEFAULT_TIMEZONE = "Asia/Dhaka";
export const DEFAULT_LOGO = "/brand/logo.png";
export const DEFAULT_LOGO_MARK = "/brand/logo-mark.png";

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  half_day: "Half Day",
  absent: "Absent",
  leave: "Leave",
  holiday: "Holiday",
  weekly_off: "Weekly Off",
};
export const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[];
export const WORKING_STATUSES: AttendanceStatus[] = ["present", "late", "half_day"];

export const LATE_REASON_LABELS: Record<LateReason, string> = {
  traffic_jam: "Traffic Jam",
  transport_problem: "Transport Problem",
  personal_emergency: "Personal Emergency",
  health_issue: "Health Issue",
  family_issue: "Family Issue",
  weather_problem: "Weather Problem",
  other: "Other",
};
export const LATE_REASONS = Object.keys(LATE_REASON_LABELS) as LateReason[];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
  probation: "Probation",
};
export const EMPLOYMENT_TYPES = Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active",
  on_notice: "On Notice",
  suspended: "Suspended",
  resigned: "Resigned",
  terminated: "Terminated",
};
export const EMPLOYMENT_STATUSES = Object.keys(EMPLOYMENT_STATUS_LABELS) as EmploymentStatus[];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  applied: "Applied",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const SOURCE_LABELS: Record<AttendanceSource, string> = {
  entry: "Entry Panel",
  admin: "Admin",
  closing: "Closing",
  correction: "Correction",
};

export const PAYROLL_BASIS_LABELS: Record<PayrollDayBasis, string> = {
  fixed_30: "Fixed 30 days",
  calendar: "Calendar days in month",
  working: "Working days in month",
};

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Badge tone per attendance status (maps to <StatusBadge /> variants). */
export const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = {
  present: "success",
  late: "warning",
  half_day: "info",
  absent: "danger",
  leave: "brand",
  holiday: "neutral",
  weekly_off: "neutral",
};

export type Tone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

export const PAGE_SIZE = 20;
