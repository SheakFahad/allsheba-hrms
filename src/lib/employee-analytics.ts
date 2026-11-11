import "server-only";
import { summarizeAttendance, type AttendanceSummary } from "@/lib/analytics";
import { scheduledWorkingDays } from "@/lib/attendance-data";
import type { Attendance, Employee } from "@/lib/types";

export interface EmployeeAnalyticsRow {
  employee: Employee;
  summary: AttendanceSummary;
}

/** Per-employee summaries for a period (employee-wise analytics). */
export async function employeeWiseAnalytics(
  employees: Employee[],
  rows: Attendance[],
  from: string,
  to: string,
): Promise<EmployeeAnalyticsRow[]> {
  const byEmp = new Map<string, Attendance[]>();
  for (const r of rows) {
    const list = byEmp.get(r.employee_id) ?? [];
    list.push(r);
    byEmp.set(r.employee_id, list);
  }
  return Promise.all(
    employees.map(async (employee) => ({
      employee,
      summary: summarizeAttendance(byEmp.get(employee.id) ?? [], await scheduledWorkingDays([employee], from, to)),
    })),
  );
}

/** Daily totals for trend charts. */
export function dailyTrend(rows: Attendance[]) {
  const map = new Map<string, { date: string; present: number; late: number; absent: number; lateMinutes: number }>();
  for (const r of rows) {
    const d = map.get(r.attendance_date) ?? { date: r.attendance_date, present: 0, late: 0, absent: 0, lateMinutes: 0 };
    if (r.status === "present" || r.status === "late" || r.status === "half_day") d.present++;
    if (r.status === "late") d.late++;
    if (r.status === "absent") d.absent++;
    d.lateMinutes += r.late_minutes;
    map.set(r.attendance_date, d);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
