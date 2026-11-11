import type { AttendanceStatus, LateReason } from "./types";
import { LATE_REASON_LABELS } from "./constants";

export interface AttendanceRowLite {
  employee_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  late_minutes: number;
  early_leave_minutes: number;
  work_minutes: number;
  late_reason: LateReason | null;
}

export interface AttendanceSummary {
  workingDays: number;
  recordedDays: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  totalLateMinutes: number;
  averageLateMinutes: number;
  earlyDepartureDays: number;
  totalWorkMinutes: number;
  attendancePercentage: number;
  mostCommonLateReason: string | null;
  lateReasonBreakdown: { reason: string; count: number }[];
}

/**
 * Summary statistics for a set of attendance rows.
 * - presentDays counts on-time + late days (half days are reported separately)
 * - attendance % = (present + late + 0.5 × half) / working days
 *   where working days = scheduled working days in the period (excludes weekly
 *   off days and holidays) multiplied by the number of employees considered.
 */
export function summarizeAttendance(rows: AttendanceRowLite[], workingDays: number): AttendanceSummary {
  let presentDays = 0, lateDays = 0, halfDays = 0, absentDays = 0, leaveDays = 0;
  let totalLateMinutes = 0, earlyDepartureDays = 0, totalWorkMinutes = 0;
  const reasons = new Map<string, number>();

  for (const r of rows) {
    switch (r.status) {
      case "present": presentDays++; break;
      case "late": presentDays++; lateDays++; break;
      case "half_day": halfDays++; break;
      case "absent": absentDays++; break;
      case "leave": leaveDays++; break;
    }
    if (r.late_minutes > 0) {
      totalLateMinutes += r.late_minutes;
      if (r.late_reason) reasons.set(r.late_reason, (reasons.get(r.late_reason) ?? 0) + 1);
    }
    if (r.early_leave_minutes > 0) earlyDepartureDays++;
    totalWorkMinutes += r.work_minutes ?? 0;
  }

  const breakdown = [...reasons.entries()]
    .map(([reason, count]) => ({ reason: LATE_REASON_LABELS[reason as LateReason] ?? reason, count }))
    .sort((a, b) => b.count - a.count);
  const attended = presentDays + halfDays * 0.5;

  return {
    workingDays,
    recordedDays: rows.length,
    presentDays,
    lateDays,
    halfDays,
    absentDays,
    leaveDays,
    totalLateMinutes,
    averageLateMinutes: lateDays > 0 ? Math.round(totalLateMinutes / lateDays) : 0,
    earlyDepartureDays,
    totalWorkMinutes,
    attendancePercentage: workingDays > 0 ? Math.min(100, Math.round((attended / workingDays) * 1000) / 10) : 0,
    mostCommonLateReason: breakdown[0]?.reason ?? null,
    lateReasonBreakdown: breakdown,
  };
}
