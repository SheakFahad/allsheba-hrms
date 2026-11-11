import { AlarmClock, CalendarCheck2, CalendarX2, Clock, LogOut, Percent, Timer, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { formatDuration } from "@/lib/time";
import type { AttendanceSummary } from "@/lib/analytics";

export function AttendanceSummaryCards({ summary }: { summary: AttendanceSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
      <StatCard label="Working Days" value={summary.workingDays} icon={CalendarCheck2} tone="info" hint={`${summary.recordedDays} recorded`} />
      <StatCard label="Present Days" value={summary.presentDays} icon={CalendarCheck2} tone="success" hint={summary.halfDays ? `+ ${summary.halfDays} half day(s)` : undefined} />
      <StatCard label="Absent Days" value={summary.absentDays} icon={CalendarX2} tone="danger" hint={summary.leaveDays ? `${summary.leaveDays} on leave` : undefined} />
      <StatCard label="Late Days" value={summary.lateDays} icon={AlarmClock} tone="warning" />
      <StatCard label="Attendance" value={`${summary.attendancePercentage}%`} icon={Percent} tone="brand" />
      <StatCard label="Total Late" value={formatDuration(summary.totalLateMinutes)} icon={Clock} tone="warning" />
      <StatCard label="Avg. Late" value={`${summary.averageLateMinutes} min`} icon={Timer} tone="warning" />
      <StatCard label="Early Departures" value={summary.earlyDepartureDays} icon={LogOut} tone="danger" />
      <StatCard label="Hours Worked" value={formatDuration(summary.totalWorkMinutes)} icon={TrendingUp} tone="success" />
      <StatCard label="Top Late Reason" value={<span className="text-base">{summary.mostCommonLateReason ?? "—"}</span>} icon={AlarmClock} tone="neutral" />
    </div>
  );
}
