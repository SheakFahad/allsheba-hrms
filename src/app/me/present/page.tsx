import type { Metadata } from "next";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime12, todayISO, weekdayName } from "@/lib/time";
import type { AttendanceStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Present Today" };

interface PresentRow {
  employee_code: string;
  full_name: string;
  department: string | null;
  designation: string | null;
  actual_in: string | null;
  status: AttendanceStatus;
  entry_method: string;
}

/** Shared list: name, department, designation and check-in time only. */
export default async function PresentTodayPage() {
  await requirePageRole("employee");
  const supabase = await createClient();
  const { data } = await supabase.rpc("today_present_list");
  const rows = (data ?? []) as PresentRow[];
  const today = todayISO();
  return (
    <>
      <PageHeader title="Present Today" description={`${weekdayName(today)}, ${formatDate(today)} · ${rows.length} present`} />
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4"><CardTitle>Employees present</CardTitle></CardHeader>
        {rows.length === 0 ? (
          <EmptyState title="No one has checked in yet today" />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.employee_code} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[r.designation, r.department].filter(Boolean).join(" · ") || r.employee_code}</p>
                </div>
                <span className="tabular text-xs text-muted-foreground">{r.actual_in ? formatTime12(r.actual_in) : ""}</span>
                <AttendanceBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
