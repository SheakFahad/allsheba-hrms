import { CalendarDays } from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { AttendanceBadge, ToneBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatTime12 } from "@/lib/time";
import { publicStorageUrl } from "@/lib/format";
import type { DayRow } from "@/lib/day-overview";

/** Compact list of who is in / out / not yet recorded for a day. */
export function DayList({ rows, actions }: { rows: DayRow[]; actions?: (row: DayRow) => React.ReactNode }) {
  if (rows.length === 0) {
    return <EmptyState icon={CalendarDays} title="No employees to show" description="Add employees from the Admin panel." />;
  }
  // Not recorded (working today) first, then recorded, then today's weekly-off employees.
  const rank = (r: DayRow) => (r.record ? 1 : r.offDay ? 2 : 0);
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b) || a.employee.full_name.localeCompare(b.employee.full_name));
  return (
    <ul className="divide-y">
      {sorted.map(({ employee: e, record: r, offDay }) => (
        <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
          <EmployeeAvatar name={e.full_name} photoUrl={publicStorageUrl(e.photo_path)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{e.full_name}</p>
            <p className="tabular truncate text-xs text-muted-foreground">
              {e.employee_code}
              {r?.actual_in && ` · In ${formatTime12(r.actual_in)}`}
              {r?.actual_out && ` · Out ${formatTime12(r.actual_out)}`}
              {r && r.late_minutes > 0 && ` · ${r.late_minutes} min late`}
            </p>
          </div>
          {r ? <AttendanceBadge status={r.status} /> : offDay ? <ToneBadge tone="neutral">Weekly off</ToneBadge> : <ToneBadge tone="neutral">Not recorded</ToneBadge>}
          {actions?.({ employee: e, record: r, offDay })}
        </li>
      ))}
    </ul>
  );
}
