import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { CorrectionRequestDialog } from "@/components/attendance/correction-request-dialog";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees, getSettings } from "@/lib/data";
import { ATTENDANCE_SELECT } from "@/lib/attendance-data";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUSES } from "@/lib/constants";
import { isISODate, pageParams, param } from "@/lib/params";
import { addDays, todayISO } from "@/lib/time";
import type { Attendance } from "@/lib/types";

export const metadata: Metadata = { title: "Entry History" };

export default async function EntryHistoryPage({ searchParams }: PageProps<"/entry/history">) {
  const user = await requirePageRole("entry");
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const from = isISODate(param(sp, "from")) ? param(sp, "from")! : addDays(today, -30);
  const to = isISODate(param(sp, "to")) ? param(sp, "to")! : today;
  const employee = param(sp, "employee");
  const status = param(sp, "status");
  const mine = param(sp, "mine") === "1";
  const { page, pageSize, from: rFrom, to: rTo } = pageParams(sp);

  const supabase = await createClient();
  let q = supabase.from("attendance").select(ATTENDANCE_SELECT, { count: "exact" })
    .gte("attendance_date", from).lte("attendance_date", to);
  if (employee) q = q.eq("employee_id", employee);
  if (status) q = q.eq("status", status);
  if (mine) q = q.eq("entered_by", user.id);
  const [{ data, count }, employees] = await Promise.all([
    q.order("attendance_date", { ascending: false }).order("created_at", { ascending: false }).range(rFrom, rTo),
    getActiveEmployees(),
  ]);
  const rows = (data ?? []) as unknown as Attendance[];

  return (
    <>
      <PageHeader title="Entry History" description="Search previous attendance records and request corrections." />
      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <FilterBar
            filters={[
              { type: "select", name: "employee", label: "Employee", options: employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` })) },
              { type: "date", name: "from", label: "From" },
              { type: "date", name: "to", label: "To" },
              { type: "select", name: "status", label: "Status", options: ATTENDANCE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_LABELS[s] })) },
              { type: "select", name: "mine", label: "Entered by", allLabel: "Anyone", options: [{ value: "1", label: "Me" }] },
            ]}
          />
        </div>
        <AttendanceTable
          rows={rows}
          emptyTitle="No records found"
          emptyDescription="Try a different date range or employee."
          actions={(r) => <CorrectionRequestDialog record={r} employeeName={r.employees?.full_name ?? ""} />}
        />
        <Pagination page={page} pageSize={pageSize} total={count ?? 0} />
      </Card>
    </>
  );
}
