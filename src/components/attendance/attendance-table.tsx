import { CalendarX2, Lock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LATE_REASON_LABELS } from "@/lib/constants";
import { formatDate, formatDuration, formatTime12, weekdayName } from "@/lib/time";
import type { Attendance } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Detailed per-day attendance table used across Admin and Entry panels. */
export function AttendanceTable({
  rows,
  showEmployee = true,
  actions,
  emptyTitle = "No attendance records",
  emptyDescription,
}: {
  rows: Attendance[];
  showEmployee?: boolean;
  actions?: (row: Attendance) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={CalendarX2} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="overflow-x-auto">
      <Table className="text-[13px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Date</TableHead>
            {showEmployee && <TableHead>Employee</TableHead>}
            <TableHead>Sched. In</TableHead>
            <TableHead>Actual In</TableHead>
            <TableHead className="text-right">Late</TableHead>
            <TableHead>Late Reason</TableHead>
            <TableHead>Sched. Out</TableHead>
            <TableHead>Actual Out</TableHead>
            <TableHead className="text-right">Early Leave</TableHead>
            <TableHead className="text-right">Worked</TableHead>
            <TableHead>Status</TableHead>
            {actions && <TableHead className="pr-4 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-4">
                <span className="tabular block font-medium">{formatDate(r.attendance_date)}</span>
                <span className="block text-xs text-muted-foreground">{weekdayName(r.attendance_date)}</span>
              </TableCell>
              {showEmployee && (
                <TableCell>
                  <span className="block font-medium">{r.employees?.full_name}</span>
                  <span className="tabular block text-xs text-muted-foreground">{r.employees?.employee_code}</span>
                </TableCell>
              )}
              <TableCell className="tabular text-muted-foreground">{formatTime12(r.scheduled_in)}</TableCell>
              <TableCell className="tabular font-medium">{formatTime12(r.actual_in)}</TableCell>
              <TableCell className={cn("tabular text-right", r.late_minutes > 0 && "font-semibold text-warning")}>
                {r.late_minutes > 0 ? `${r.late_minutes} min` : "—"}
              </TableCell>
              <TableCell className="max-w-48">
                {r.late_reason ? (
                  <span className="block truncate" title={r.late_reason_note ?? undefined}>
                    {LATE_REASON_LABELS[r.late_reason]}
                    {r.late_reason_note && <span className="block truncate text-xs text-muted-foreground">{r.late_reason_note}</span>}
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell className="tabular text-muted-foreground">{formatTime12(r.scheduled_out)}</TableCell>
              <TableCell className="tabular font-medium">{formatTime12(r.actual_out)}</TableCell>
              <TableCell className={cn("tabular text-right", r.early_leave_minutes > 0 && "text-danger")}>
                {r.early_leave_minutes > 0 ? `${r.early_leave_minutes} min` : "—"}
              </TableCell>
              <TableCell className="tabular text-right">{r.work_minutes > 0 ? formatDuration(r.work_minutes) : "—"}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <AttendanceBadge status={r.status} />
                  {r.is_locked && <Lock className="size-3 text-muted-foreground" aria-label="Locked by admin" />}
                </span>
              </TableCell>
              {actions && <TableCell className="pr-4 text-right">{actions(r)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
