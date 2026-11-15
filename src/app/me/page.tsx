import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDuration, formatTime12, weekdayName } from "@/lib/time";
import type { Attendance } from "@/lib/types";
import { SelfCheck, type SelfContext } from "./self-check";

export const metadata: Metadata = { title: "Check In / Check Out" };

export default async function EmployeeHome() {
  await requirePageRole("employee");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("self_service_context");
  if (error || !data) {
    return (
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>{error?.message ?? "Your account is not ready yet. Please contact the administrator."}</p>
      </div>
    );
  }
  const ctx = data as SelfContext;
  // Own records only (row-level security).
  const { data: recent } = await supabase
    .from("attendance")
    .select("id, attendance_date, actual_in, actual_out, status, late_minutes, work_minutes, entry_method")
    .gte("attendance_date", addDays(ctx.today, -13))
    .order("attendance_date", { ascending: false });
  const rows = (recent ?? []) as Pick<Attendance, "id" | "attendance_date" | "actual_in" | "actual_out" | "status" | "late_minutes" | "work_minutes" | "entry_method">[];

  return (
    <>
      <PageHeader
        title={`Hello, ${ctx.employee.name.split(" ")[0]}`}
        description={`${weekdayName(ctx.today)}, ${formatDate(ctx.today)} · ${ctx.employee.code}${ctx.employee.department ? ` · ${ctx.employee.department}` : ""}`}
      />
      <SelfCheck ctx={ctx} />
      <Card className="mt-5 gap-0 pb-0">
        <CardHeader className="border-b pb-4"><CardTitle>Last 14 days</CardTitle></CardHeader>
        {rows.length === 0 ? (
          <EmptyState title="No attendance yet" />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatDate(r.attendance_date)} <span className="text-xs text-muted-foreground">{weekdayName(r.attendance_date).slice(0, 3)}</span></p>
                  <p className="tabular text-xs text-muted-foreground">
                    {r.actual_in ? `In ${formatTime12(r.actual_in)}` : ""}
                    {r.actual_out ? ` · Out ${formatTime12(r.actual_out)}` : ""}
                    {r.work_minutes ? ` · ${formatDuration(r.work_minutes)}` : ""}
                    {r.late_minutes ? ` · ${r.late_minutes} min late` : ""}
                    {r.entry_method === "self_gps" ? " · GPS verified" : r.entry_method === "operator" ? " · Recorded by office" : ""}
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
