import type { AppRole } from "@/lib/types";

export type ReportNeed = "employee" | "employees" | "department" | "period" | "month" | "year" | "date" | "payroll" | "status" | "late";

export interface ReportDef {
  id: string;
  label: string;
  category: "individual" | "company" | "custom";
  description: string;
  needs: ReportNeed[];
  /** Required (must be supplied) — everything else in `needs` is optional. */
  required?: ReportNeed[];
  roles: AppRole[];
  sensitive: boolean;
}

export const REPORTS: ReportDef[] = [
  // Individual
  { id: "employee_profile", label: "Complete Employee Profile", category: "individual", description: "Employment, personal details, salary and this year's attendance summary.", needs: ["employee"], required: ["employee"], roles: ["admin"], sensitive: true },
  { id: "personal_information", label: "Personal Information", category: "individual", description: "Personal and emergency contact details.", needs: ["employee"], required: ["employee"], roles: ["admin"], sensitive: true },
  { id: "employee_attendance", label: "Attendance History (Monthly / Yearly / Range)", category: "individual", description: "Day-by-day attendance with late, early departure and hours.", needs: ["employee", "period", "month", "year"], required: ["employee"], roles: ["admin"], sensitive: false },
  { id: "late_history", label: "Late Arrival History", category: "individual", description: "Every late arrival with reason and explanation.", needs: ["employee", "period", "month", "year"], required: ["employee"], roles: ["admin"], sensitive: false },
  { id: "late_reason_analysis", label: "Late Reason Analysis", category: "individual", description: "Late arrivals grouped by reason (one employee, a department or everyone).", needs: ["employee", "department", "period", "month", "year"], roles: ["admin"], sensitive: false },
  { id: "leave_history", label: "Leave History", category: "individual", description: "Leave requests and balances for a year.", needs: ["employee", "year"], required: ["employee"], roles: ["admin"], sensitive: false },
  { id: "salary_statement", label: "Salary Statement", category: "individual", description: "Monthly payroll for a year and salary history.", needs: ["employee", "year"], required: ["employee"], roles: ["admin"], sensitive: true },
  { id: "payslip", label: "Payslip", category: "individual", description: "Monthly payslip with earnings, deductions and net pay.", needs: ["employee", "month"], required: ["employee", "month"], roles: ["admin"], sensitive: true },
  { id: "employee_performance", label: "Employee Performance (Attendance)", category: "individual", description: "Month-by-month attendance performance for a year.", needs: ["employee", "year"], required: ["employee"], roles: ["admin"], sensitive: false },
  // Company
  { id: "daily_attendance", label: "Daily Attendance", category: "company", description: "Every employee's attendance for one day.", needs: ["date", "department"], roles: ["admin", "entry"], sensitive: false },
  { id: "monthly_attendance", label: "Monthly Attendance", category: "company", description: "Per-employee attendance summary for a month.", needs: ["month", "department", "employees"], roles: ["admin"], sensitive: false },
  { id: "yearly_attendance", label: "Yearly Attendance", category: "company", description: "Per-employee attendance summary for a year.", needs: ["year", "department", "employees"], roles: ["admin"], sensitive: false },
  { id: "department_attendance", label: "Department-wise Attendance", category: "company", description: "Attendance totals and percentage by department.", needs: ["period", "month", "year"], roles: ["admin"], sensitive: false },
  { id: "employee_directory", label: "Employee Directory", category: "company", description: "List of employees with department, designation and contact.", needs: ["department", "status"], roles: ["admin"], sensitive: false },
  { id: "late_report", label: "Late Employee Report", category: "company", description: "All late arrivals in a period.", needs: ["period", "month", "year", "department", "employees"], roles: ["admin"], sensitive: false },
  { id: "absence_report", label: "Absence Report", category: "company", description: "All absences in a period with per-employee totals.", needs: ["period", "month", "year", "department", "employees"], roles: ["admin"], sensitive: false },
  { id: "leave_summary", label: "Leave Summary", category: "company", description: "Leave taken and remaining per employee and type.", needs: ["year", "department"], roles: ["admin"], sensitive: false },
  { id: "payroll_summary", label: "Payroll Summary", category: "company", description: "Monthly payroll sheet with totals.", needs: ["month"], required: ["month"], roles: ["admin"], sensitive: true },
  { id: "salary_expense", label: "Salary Expense", category: "company", description: "Monthly payroll expense for a year.", needs: ["year"], roles: ["admin"], sensitive: true },
  { id: "employee_statistics", label: "Employee Statistics", category: "company", description: "Headcount by department, type, status and tenure.", needs: [], roles: ["admin"], sensitive: false },
  // Custom
  { id: "attendance_history", label: "Custom Attendance Report", category: "custom", description: "Choose employees, department, period, status and columns.", needs: ["employees", "department", "period", "month", "year", "status", "late"], roles: ["admin", "entry"], sensitive: false },
];

export const REPORT_MAP = new Map(REPORTS.map((r) => [r.id, r]));
