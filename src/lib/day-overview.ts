import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees, getHolidays, getSettings } from "@/lib/data";
import { dayOfWeek } from "@/lib/time";
import type { Attendance, Employee } from "@/lib/types";

export interface DayRow {
  employee: Employee;
  record: Attendance | null;
}

export interface DayOverview {
  date: string;
  rows: DayRow[];
  holidayName: string | null;
  isWeeklyOff: boolean;
  counts: {
    expected: number;
    recorded: number;
    notRecorded: number;
    present: number;
    late: number;
    halfDay: number;
    absent: number;
    leave: number;
    checkedOut: number;
  };
}

/** Every eligible employee for a date with their attendance record (if any). */
export async function getDayOverview(date: string): Promise<DayOverview> {
  const supabase = await createClient();
  const [employees, settings, holidays, { data }] = await Promise.all([
    getActiveEmployees(),
    getSettings(),
    getHolidays(date, date),
    supabase.from("attendance").select("*").eq("attendance_date", date),
  ]);
  const byEmp = new Map(((data ?? []) as Attendance[]).map((a) => [a.employee_id, a]));
  const eligible = employees.filter(
    (e) => e.joining_date <= date && (e.status === "active" || e.status === "on_notice" || byEmp.has(e.id)),
  );
  const rows = eligible.map((employee) => ({ employee, record: byEmp.get(employee.id) ?? null }));
  const recs = rows.map((r) => r.record).filter(Boolean) as Attendance[];
  const count = (s: Attendance["status"]) => recs.filter((r) => r.status === s).length;
  return {
    date,
    rows,
    holidayName: holidays[0]?.name ?? null,
    isWeeklyOff: settings.weekly_off_days.includes(dayOfWeek(date)),
    counts: {
      expected: rows.length,
      recorded: recs.length,
      notRecorded: rows.length - recs.length,
      present: count("present") + count("late"),
      late: count("late"),
      halfDay: count("half_day"),
      absent: count("absent"),
      leave: count("leave"),
      checkedOut: recs.filter((r) => r.actual_out).length,
    },
  };
}
