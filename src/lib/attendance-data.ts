import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getHolidays, getSettings } from "@/lib/data";
import { summarizeAttendance, type AttendanceSummary } from "@/lib/analytics";
import { todayISO, workingDays } from "@/lib/time";
import type { Attendance, AttendanceStatus } from "@/lib/types";

export const ATTENDANCE_SELECT =
  "*, employees!inner(employee_code, full_name, department_id, joining_date, archived_at, departments(name))";

export interface AttendanceQuery {
  from: string;
  to: string;
  employeeIds?: string[];
  departmentId?: string;
  status?: AttendanceStatus;
  lateOnly?: boolean;
  limit?: number;
}

export async function fetchAttendance(q: AttendanceQuery): Promise<Attendance[]> {
  const supabase = await createClient();
  let query = supabase
    .from("attendance")
    .select(ATTENDANCE_SELECT)
    .gte("attendance_date", q.from)
    .lte("attendance_date", q.to);
  if (q.employeeIds?.length) query = query.in("employee_id", q.employeeIds);
  if (q.departmentId) query = query.eq("employees.department_id", q.departmentId);
  if (q.status) query = query.eq("status", q.status);
  if (q.lateOnly) query = query.gt("late_minutes", 0);
  const { data, error } = await query
    .order("attendance_date", { ascending: false })
    .order("employee_id")
    .limit(q.limit ?? 5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Attendance[];
}

/**
 * Scheduled working days for a set of employees in a period, bounded by each
 * employee's joining date and today (future days are not counted).
 */
export async function scheduledWorkingDays(
  employees: { joining_date: string }[],
  from: string,
  to: string,
): Promise<number> {
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const end = to < today ? to : today;
  const holidays = new Set((await getHolidays(from, end)).map((h) => h.holiday_date));
  let total = 0;
  for (const e of employees) {
    const start = e.joining_date > from ? e.joining_date : from;
    total += workingDays(start, end, settings.weekly_off_days, holidays).length;
  }
  return total;
}

export async function attendanceAnalytics(
  rows: Attendance[],
  employees: { joining_date: string }[],
  from: string,
  to: string,
): Promise<AttendanceSummary> {
  return summarizeAttendance(rows, await scheduledWorkingDays(employees, from, to));
}
