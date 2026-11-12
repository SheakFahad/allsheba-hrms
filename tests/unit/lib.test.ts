import { describe, expect, it } from "vitest";
import { calculateAttendance } from "@/lib/attendance-calc";
import { summarizeAttendance, type AttendanceRowLite } from "@/lib/analytics";
import { addDays, formatDuration, formatTime12, monthRange, todayISO, workingDays } from "@/lib/time";
import { formatCell, excelValue } from "@/lib/reports/format";
import { resolvePeriod, escapeLike } from "@/lib/params";
import { parseReportParams } from "@/lib/reports/params";
import { friendlyDbError } from "@/lib/format";

describe("calculateAttendance (mirror of the DB trigger)", () => {
  const base = { scheduledIn: "10:00", scheduledOut: "19:00", graceMinutes: 0 };
  it("computes the spec example: 10:25 arrival = 25 minutes late", () => {
    const r = calculateAttendance({ ...base, actualIn: "10:25", status: "present" });
    expect(r).toMatchObject({ status: "late", lateMinutes: 25, isLate: true });
  });
  it("honours the grace period", () => {
    expect(calculateAttendance({ ...base, graceMinutes: 10, actualIn: "10:10", status: "present" }).lateMinutes).toBe(0);
    expect(calculateAttendance({ ...base, graceMinutes: 10, actualIn: "10:11", status: "present" }).lateMinutes).toBe(11);
  });
  it("computes early departure, overtime and working hours", () => {
    expect(calculateAttendance({ ...base, actualIn: "09:55", actualOut: "18:30", status: "present" })).toMatchObject({
      status: "present", earlyLeaveMinutes: 30, workMinutes: 515, overtimeMinutes: 0,
    });
    expect(calculateAttendance({ ...base, actualIn: "10:00", actualOut: "20:15", status: "present" }).overtimeMinutes).toBe(75);
  });
  it("never computes times for non-working statuses", () => {
    expect(calculateAttendance({ ...base, actualIn: "11:00", status: "absent" })).toMatchObject({ lateMinutes: 0, requiresTimes: false });
  });
  it("keeps half day as chosen", () => {
    expect(calculateAttendance({ ...base, actualIn: "13:00", status: "half_day" }).status).toBe("half_day");
  });
});

describe("summarizeAttendance", () => {
  const row = (status: AttendanceRowLite["status"], late = 0, reason: AttendanceRowLite["late_reason"] = null, early = 0, work = 480): AttendanceRowLite => ({
    employee_id: "e", attendance_date: "2026-11-01", status, late_minutes: late, early_leave_minutes: early, work_minutes: work, late_reason: reason,
  });
  it("calculates the required analytics", () => {
    const s = summarizeAttendance(
      [row("present"), row("late", 20, "traffic_jam"), row("late", 10, "traffic_jam"), row("late", 30, "health_issue", 15), row("absent", 0, null, 0, 0), row("half_day", 0, null, 0, 240)],
      6,
    );
    expect(s).toMatchObject({
      workingDays: 6, presentDays: 4, lateDays: 3, absentDays: 1, halfDays: 1, totalLateMinutes: 60, averageLateMinutes: 20,
      earlyDepartureDays: 1, mostCommonLateReason: "Traffic Jam",
    });
    expect(s.attendancePercentage).toBe(75); // (4 + 0.5) / 6
  });
  it("handles zero working days", () => {
    expect(summarizeAttendance([], 0).attendancePercentage).toBe(0);
  });
});

describe("time helpers", () => {
  it("uses Asia/Dhaka for today", () => {
    expect(todayISO("Asia/Dhaka", new Date("2026-11-10T19:30:00Z"))).toBe("2026-11-11");
  });
  it("formats", () => {
    expect(formatTime12("13:05:00")).toBe("1:05 PM");
    expect(formatTime12("00:15")).toBe("12:15 AM");
    expect(formatDuration(85)).toBe("1h 25m");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(monthRange(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("counts working days excluding weekly off and holidays", () => {
    // Nov 2026: 30 days, Fridays = 6, 13, 20, 27
    expect(workingDays("2026-11-01", "2026-11-30", [5], new Set(["2026-11-03"])).length).toBe(25);
  });
});

describe("reports", () => {
  it("formats cells consistently", () => {
    expect(formatCell(25, "minutes")).toBe("25 min");
    expect(formatCell(null, "text")).toBe("—");
    expect(formatCell(1234.5, "money")).toBe("1,234.50");
    expect(excelValue(50, "percent")).toBe(0.5);
  });
  it("strictly validates URL parameters", () => {
    const p = parseReportParams({ type: "late_report;drop", employee: "not-a-uuid", month: "2026-13", cols: "date,name,bad col", dir: "x" });
    expect(p.type).toBe("late_reportdrop");
    expect(p.employee).toBeUndefined();
    expect(p.month).toBeUndefined();
    expect(p.cols).toEqual(["date", "name"]);
    expect(p.dir).toBeUndefined();
  });
  it("resolves periods", () => {
    expect(resolvePeriod({ month: "2026-02" }, "2026-11-11")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolvePeriod({}, "2026-11-11")).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(resolvePeriod({ from: "2026-05-10", to: "2026-05-01" }, "2026-11-11")).toMatchObject({ from: "2026-05-01", to: "2026-05-10" });
  });
});

describe("safety helpers", () => {
  it("sanitises search input for PostgREST filters", () => {
    expect(escapeLike("a%b,c(d)")).toBe("a b c d");
  });
  it("maps database errors to friendly messages", () => {
    expect(friendlyDbError('duplicate key value violates unique constraint "attendance_one_per_day"')).toMatch(/already exists/);
    expect(friendlyDbError("new row violates row-level security policy")).toMatch(/permission/);
  });
});

describe("form → server validation round trip", () => {
  it("accepts an employee with only the required fields (client-transformed nulls re-parsed on the server)", async () => {
    const { employeeSchema, salarySchema } = await import("@/lib/validation");
    const raw = {
      full_name: "Rahim Uddin", phone: "", email: "", address: "", date_of_birth: "", national_id: "",
      designation_id: "", department_id: "", shift_id: "", joining_date: "2026-11-12",
      employment_type: "full_time", status: "active", emergency_contact_name: "", emergency_contact_phone: "",
      emergency_contact_relation: "", notes: "", photo_path: "",
    };
    const client = employeeSchema.parse(raw);        // what react-hook-form submits
    const server = employeeSchema.safeParse(client); // what the server action re-validates
    expect(server.success).toBe(true);
    expect(server.data?.phone).toBeNull();
    const salary = salarySchema.parse({ employee_id: "5842edc9-1633-4e65-83a8-a69b5ab66d9a", effective_from: "2026-11-12", basic_salary: 1, allowances: 0, notes: "" });
    expect(salarySchema.safeParse(salary).success).toBe(true);
  });
});
