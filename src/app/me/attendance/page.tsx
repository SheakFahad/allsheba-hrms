import type { Metadata } from "next";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filters";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/params";
import { formatDate, formatDuration, formatMonth, formatTime12, monthRange, todayISO, weekdayName } from "@/lib/time";
import type { Attendance } from "@/lib/types";

export const metadata: Metadata = { title: "My Attendance History" };

type Row = Pick<Attendance, "id" | "attendance_date" | "actual_in" | "actual_out" | "status" | "late_minutes" | "work_minutes" | "entry_method">;

/** Own records only (row-level security). Read only. */
export default async function MyAttendancePage({ searchParams }: PageProps<"/me/attendance">) {
  await requirePageRole("employee");
  const sp = await searchParams;
  const raw = param(sp, "month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : todayISO().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const { from, to } = monthRange(y, m);
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance")
    .select("id, attendance_date, actual_in, actual_out, status, late_minutes, work_minutes, entry_method")
    .gte("attendance_date", from)
    .lte("attendance_date", to)
    .order("attendance_date", { ascending: false });
  const rows = (data ?? []) as Row[];
  const count = (s: string[]) => rows.filter((r) => s.includes(r.status)).length;
  const summary = [
    ["Present", count(["present", "late"])],
    ["Late", count(["late"])],
    ["Half day", count(["half_day"])],
    ["Absent", count(["absent"])],
    ["Leave", count(["leave"])],
  ] as const;

  return (
    <>
      <PageHeader title="My Attendance History" description={formatMonth(y, m)} />
      <Card className="no-print mb-4 p-4">
        <FilterBar filters={[{ type: "month", name: "month", label: "Month" }]} />
      </Card>
      <div className="mb-4 grid grid-cols-5 gap-2 text-center">
        {summary.map(([k, v]) => (
          <div key={k} className="rounded-lg border bg-card px-1 py-2">
            <p className="text-lg font-semibold tabular-nums">{v}</p>
            <p className="text-[11px] text-muted-foreground">{k}</p>
          </div>
        ))}
      </div>
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4"><CardTitle>{formatMonth(y, m)}</CardTitle></CardHeader>
        {rows.length === 0 ? (
          <EmptyState title="No attendance for this month" />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDate(r.attendance_date)} <span className="text-xs text-muted-foreground">{weekdayName(r.attendance_date).slice(0, 3)}</span>
                  </p>
                  <p className="tabular text-xs text-muted-foreground">
                    {r.actual_in ? `In ${formatTime12(r.actual_in)}` : ""}
                    {r.actual_out ? ` · Out ${formatTime12(r.actual_out)}` : ""}
                    {r.work_minutes ? ` · ${formatDuration(r.work_minutes)}` : ""}
                    {r.late_minutes ? ` · ${r.late_minutes} min late` : ""}
                    {r.entry_method === "self_gps" ? " · GPS verified" : r.entry_method === "self" ? " · Self (not GPS-verified)" : r.actual_in ? " · Recorded by office" : ""}
                  </p>
                </div>
                <AttendanceBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
