import type { Metadata } from "next";
import { AlarmClock, CalendarCheck2, CalendarX2, LogOut, PlaneTakeoff, UserX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { FilterBar } from "@/components/shared/filters";
import { ExportButton } from "@/components/shared/export-button";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { AttendanceBadge, ToneBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePageRole } from "@/lib/auth";
import { getActiveEmployees, getSettings, getShifts, toEmployeeOption } from "@/lib/data";
import { getDayOverview } from "@/lib/day-overview";
import { LATE_REASON_LABELS } from "@/lib/constants";
import { isISODate, param } from "@/lib/params";
import { formatDate, formatDuration, formatTime12, todayISO, weekdayName } from "@/lib/time";
import { publicStorageUrl } from "@/lib/format";
import { AdminAttendanceDialog, CloseDayButton, CloseRangeDialog, DeleteAttendanceButton } from "./attendance-controls";

export const metadata: Metadata = { title: "Attendance Management" };

export default async function AdminAttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const requested = param(sp, "date");
  const date = isISODate(requested) && requested <= today ? requested : today;
  const [overview, employees, shifts] = await Promise.all([getDayOverview(date), getActiveEmployees(), getShifts()]);
  const options = employees.map((e) => toEmployeeOption(e, settings.weekly_off_days));
  const c = overview.counts;
  const dialogProps = {
    employees: options, shifts, timezone: settings.timezone, today, date,
    lateReasonRequired: settings.late_reason_required, noteRequiredForOther: settings.late_note_required_for_other,
    flexibleSchedule: settings.flexible_schedule_unassigned ?? true,
  };

  return (
    <>
      <PageHeader
        title="Attendance Management"
        description={`${weekdayName(date)}, ${formatDate(date)}${overview.holidayName ? ` · Holiday: ${overview.holidayName}` : overview.isWeeklyOff ? " · Weekly off" : ""}`}
        actions={
          <>
            <ExportButton type="daily_attendance" params={{ date }} />
            <CloseRangeDialog today={today} />
            <CloseDayButton date={date} notRecorded={c.notRecorded} />
            <AdminAttendanceDialog {...dialogProps} />
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Present" value={c.present} icon={CalendarCheck2} tone="success" hint={`of ${c.expected} employees`} />
        <StatCard label="Late" value={c.late} icon={AlarmClock} tone="warning" />
        <StatCard label="Half day" value={c.halfDay} icon={LogOut} tone="info" />
        <StatCard label="Absent" value={c.absent} icon={CalendarX2} tone="danger" />
        <StatCard label="On leave" value={c.leave} icon={PlaneTakeoff} tone="brand" />
        <StatCard label="Not recorded" value={c.notRecorded} icon={UserX} tone="neutral" hint={c.weeklyOff ? `${c.weeklyOff} on weekly off · absence set by closing` : "Absence is set only by closing"} />
      </div>
      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <FilterBar filters={[{ type: "date", name: "date", label: "Date" }]} />
        </div>
        {overview.rows.length === 0 ? (
          <EmptyState title="No employees for this date" />
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Employee</TableHead>
                  <TableHead>Sched. In</TableHead>
                  <TableHead>Actual In</TableHead>
                  <TableHead className="text-right">Late</TableHead>
                  <TableHead>Late Reason</TableHead>
                  <TableHead>Actual Out</TableHead>
                  <TableHead className="text-right">Early</TableHead>
                  <TableHead className="text-right">Worked</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.rows.map(({ employee: e, record: r }) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4">
                      <span className="flex items-center gap-2.5">
                        <EmployeeAvatar name={e.full_name} photoUrl={publicStorageUrl(e.photo_path)} className="size-7" />
                        <span>
                          <span className="block font-medium">{e.full_name}</span>
                          <span className="tabular block text-xs text-muted-foreground">{e.employee_code}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">{r?.is_flexible || (!r && !e.shift_id && (settings.flexible_schedule_unassigned ?? true)) ? "Flexible" : formatTime12(r?.scheduled_in ?? e.shifts?.start_time)}</TableCell>
                    <TableCell className="tabular font-medium">{formatTime12(r?.actual_in)}</TableCell>
                    <TableCell className="tabular text-right">{r?.late_minutes ? <span className="font-semibold text-warning">{r.late_minutes} min</span> : "—"}</TableCell>
                    <TableCell>{r?.late_reason ? LATE_REASON_LABELS[r.late_reason] : "—"}</TableCell>
                    <TableCell className="tabular font-medium">{formatTime12(r?.actual_out)}</TableCell>
                    <TableCell className="tabular text-right">{r?.early_leave_minutes ? <span className="text-danger">{r.early_leave_minutes} min</span> : "—"}</TableCell>
                    <TableCell className="tabular text-right">{r?.work_minutes ? formatDuration(r.work_minutes) : "—"}</TableCell>
                    <TableCell>{r ? <AttendanceBadge status={r.status} /> : <ToneBadge tone="neutral">Not recorded</ToneBadge>}</TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-1">
                        {r ? (
                          <>
                            <AdminAttendanceDialog {...dialogProps} record={r} />
                            <DeleteAttendanceButton id={r.id} label={`${e.full_name} · ${formatDate(date)}`} />
                          </>
                        ) : (
                          <AdminAttendanceDialog {...dialogProps} employeeId={e.id} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
