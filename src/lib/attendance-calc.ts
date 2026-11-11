import type { AttendanceStatus } from "./types";
import { timeToMinutes } from "./time";

export interface AttendanceCalcInput {
  scheduledIn: string;
  scheduledOut: string;
  actualIn?: string | null;
  actualOut?: string | null;
  graceMinutes: number;
  status: AttendanceStatus;
}

export interface AttendanceCalcResult {
  status: AttendanceStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  workMinutes: number;
  isLate: boolean;
  requiresTimes: boolean;
}

const NON_WORKING: AttendanceStatus[] = ["absent", "leave", "holiday", "weekly_off"];

/**
 * Client-side mirror of public.attendance_before_write() so operators see the
 * result before saving. The database trigger remains authoritative.
 */
export function calculateAttendance(input: AttendanceCalcInput): AttendanceCalcResult {
  if (NON_WORKING.includes(input.status)) {
    return {
      status: input.status, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0,
      workMinutes: 0, isLate: false, requiresTimes: false,
    };
  }
  let status = input.status;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;
  let workMinutes = 0;

  if (input.actualIn) {
    const delay = timeToMinutes(input.actualIn) - timeToMinutes(input.scheduledIn);
    lateMinutes = delay > input.graceMinutes ? delay : 0;
    if (status === "present" && lateMinutes > 0) status = "late";
    else if (status === "late" && lateMinutes === 0) status = "present";

    if (input.actualOut) {
      const out = timeToMinutes(input.actualOut);
      const inn = timeToMinutes(input.actualIn);
      const schedOut = timeToMinutes(input.scheduledOut);
      workMinutes = Math.max(out - inn, 0);
      earlyLeaveMinutes = Math.max(schedOut - out, 0);
      overtimeMinutes = Math.max(out - schedOut, 0);
    }
  }
  return {
    status, lateMinutes, earlyLeaveMinutes, overtimeMinutes, workMinutes,
    isLate: lateMinutes > 0, requiresTimes: true,
  };
}
