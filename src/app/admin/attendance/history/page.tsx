import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { ExportButton } from "@/components/shared/export-button";
import { LinkTabs } from "@/components/shared/link-tabs";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { AttendanceSummaryCards } from "@/components/attendance/attendance-summary";
import { ChartCard } from "@/components/charts/charts";
import { requirePageRole } from "@/lib/auth";
import { getActiveEmployees, getDepartments, getSettings } from "@/lib/data";
import { attendanceAnalytics, fetchAttendance } from "@/lib/attendance-data";
import { dailyTrend, employeeWiseAnalytics } from "@/lib/employee-analytics";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUSES } from "@/lib/constants";
import { pageParams, param, resolvePeriod } from "@/lib/params";
import { formatDate, formatDuration, todayISO } from "@/lib/time";
import type { AttendanceStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Attendance History" };

export default async function AttendanceHistoryPage({ searchParams }: PageProps<"/admin/attendance/history">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const period = resolvePeriod(sp, today);
  const employeeId = param(sp, "employee");
  const departmentId = param(sp, "department");
  const statusParam = param(sp, "status");
  const status = ATTENDANCE_STATUSES.includes(statusParam as AttendanceStatus) ? (statusParam as AttendanceStatus) : undefined;
  const lateOnly = param(sp, "late") === "1";
  const view = param(sp, "view") === "employees" ? "employees" : "records";

  const [allEmployees, departments] = await Promise.all([getActiveEmployees(), getDepartments()]);
  const scope = allEmployees.filter(
    (e) => (!employeeId || e.id === employeeId) && (!departmentId || e.department_id === departmentId),
  );
  const rows = await fetchAttendance({
    from: period.from, to: period.to, employeeIds: employeeId ? [employeeId] : undefined,
    departmentId, status, lateOnly,
  });
  const summary = await attendanceAnalytics(rows, scope, period.from, period.to);
  const trend = dailyTrend(rows).map((d) => ({ ...d, label: formatDate(d.date).slice(0, 6) }));
  const reasons = summary.lateReasonBreakdown.map((r) => ({ reason: r.reason, count: r.count }));

  const exportParams = {
    employee: employeeId, department: departmentId, from: period.from, to: period.to,
    status, late: lateOnly ? "1" : undefined,
  };
  const keep = Object.fromEntries(
    ["employee", "department", "from", "to", "month", "year", "status", "late"].map((k) => [k, param(sp, k)]),
  );

  return (
    <>
      <PageHeader
        title="Attendance History"
        description={`${formatDate(period.from)} – ${formatDate(period.to)} · ${scope.length} employee(s)`}
        actions={
          <>
            <ExportButton type="late_report" params={exportParams} label="Late report" />
            <ExportButton type="attendance_history" params={exportParams} />
          </>
        }
      />
      <Card className="mb-5 p-4">
        <FilterBar
          filters={[
            { type: "select", name: "employee", label: "Employee", options: allEmployees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` })) },
            { type: "select", name: "department", label: "Department", options: departments.map((d) => ({ value: d.id, label: d.name })) },
            { type: "month", name: "month", label: "Month" },
            { type: "select", name: "year", label: "Year", allLabel: "—", options: Array.from({ length: 5 }, (_, i) => String(Number(today.slice(0, 4)) - i)).map((y) => ({ value: y, label: y })) },
            { type: "date", name: "from", label: "From" },
            { type: "date", name: "to", label: "To" },
            { type: "select", name: "status", label: "Status", options: ATTENDANCE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_LABELS[s] })) },
            { type: "select", name: "late", label: "Late status", allLabel: "All", options: [{ value: "1", label: "Late only" }] },
          ]}
        />
      </Card>

      <div className="mb-5">
        <AttendanceSummaryCards summary={summary} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Daily attendance trend"
          description="Employees present and late per day"
          kind="line"
          data={trend}
          xKey="label"
          xLabel="Date"
          series={[{ key: "present", label: "Present" }, { key: "late", label: "Late" }]}
        />
        <ChartCard
          title="Late reasons"
          description="Number of late arrivals by reason"
          layout="horizontal"
          data={reasons}
          xKey="reason"
          xLabel="Reason"
          series={[{ key: "count", label: "Late arrivals" }]}
        />
      </div>

      <LinkTabs
        tabs={[{ key: "records", label: "Daily records", count: rows.length }, { key: "employees", label: "Employee-wise analytics" }]}
        active={view}
        param="view"
        baseHref="/admin/attendance/history"
        keep={keep}
      />
      {view === "records" ? (
        <Records rows={rows} sp={sp} />
      ) : (
        <EmployeeWise rows={rows} scope={scope} from={period.from} to={period.to} />
      )}
    </>
  );
}

function Records({ rows, sp }: { rows: Awaited<ReturnType<typeof fetchAttendance>>; sp: Record<string, string | string[] | undefined> }) {
  const { page, pageSize, from, to } = pageParams(sp, 50);
  return (
    <Card className="gap-0 py-0">
      <AttendanceTable rows={rows.slice(from, to + 1)} emptyTitle="No records for these filters" />
      <Pagination page={page} pageSize={pageSize} total={rows.length} />
    </Card>
  );
}

async function EmployeeWise({ rows, scope, from, to }: {
  rows: Awaited<ReturnType<typeof fetchAttendance>>; scope: Awaited<ReturnType<typeof getActiveEmployees>>; from: string; to: string;
}) {
  const data = (await employeeWiseAnalytics(scope, rows, from, to)).sort(
    (a, b) => b.summary.attendancePercentage - a.summary.attendancePercentage,
  );
  return (
    <div className="grid gap-5">
      <ChartCard
        title="Employee attendance ranking"
        description="Attendance percentage for the period"
        layout="horizontal"
        valueFormat="percent"
        height={Math.max(200, data.length * 28)}
        data={data.map((d) => ({ name: d.employee.full_name, pct: d.summary.attendancePercentage }))}
        xKey="name"
        xLabel="Employee"
        series={[{ key: "pct", label: "Attendance %" }]}
      />
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4"><CardTitle>Employee-wise summary</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Employee</TableHead>
                <TableHead className="text-right">Working days</TableHead>
                <TableHead className="text-right">Present</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Leave</TableHead>
                <TableHead className="text-right">Late days</TableHead>
                <TableHead className="text-right">Total late</TableHead>
                <TableHead className="text-right">Avg late</TableHead>
                <TableHead className="text-right">Early dep.</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="pr-4">Top late reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(({ employee: e, summary: s }) => (
                <TableRow key={e.id}>
                  <TableCell className="pl-4">
                    <Link href={`/admin/employees/${e.id}?tab=attendance`} className="font-medium hover:underline">{e.full_name}</Link>
                    <span className="tabular block text-xs text-muted-foreground">{e.employee_code}</span>
                  </TableCell>
                  <TableCell className="tabular text-right">{s.workingDays}</TableCell>
                  <TableCell className="tabular text-right">{s.presentDays}{s.halfDays ? ` +${s.halfDays}½` : ""}</TableCell>
                  <TableCell className="tabular text-right">{s.absentDays}</TableCell>
                  <TableCell className="tabular text-right">{s.leaveDays}</TableCell>
                  <TableCell className="tabular text-right">{s.lateDays}</TableCell>
                  <TableCell className="tabular text-right">{formatDuration(s.totalLateMinutes)}</TableCell>
                  <TableCell className="tabular text-right">{s.averageLateMinutes} min</TableCell>
                  <TableCell className="tabular text-right">{s.earlyDepartureDays}</TableCell>
                  <TableCell className="tabular text-right">{formatDuration(s.totalWorkMinutes)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{s.attendancePercentage}%</TableCell>
                  <TableCell className="pr-4">{s.mostCommonLateReason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

