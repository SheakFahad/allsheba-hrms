import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ReportBuilder } from "@/components/reports/report-builder";
import { ChartCard } from "@/components/charts/charts";
import { requirePageRole } from "@/lib/auth";
import { getActiveEmployees, getDepartments, getSettings, toEmployeeOption } from "@/lib/data";
import { fetchAttendance, scheduledWorkingDays } from "@/lib/attendance-data";
import { summarizeAttendance } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { MONTH_LABELS } from "@/lib/constants";
import { param } from "@/lib/params";
import { monthRange, todayISO } from "@/lib/time";
import type { PayrollRecord } from "@/lib/types";

export const metadata: Metadata = { title: "Reports & Analytics" };

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const [employees, departments] = await Promise.all([getActiveEmployees(), getDepartments()]);

  // Last 6 months company analytics from real records.
  const months: { y: number; m: number }[] = [];
  const [cy, cm] = today.split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(cy, cm - 1 - i, 1));
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  }
  const first = monthRange(months[0].y, months[0].m).from;
  const rows = await fetchAttendance({ from: first, to: today });
  const trend = await Promise.all(
    months.map(async ({ y, m }) => {
      const r = monthRange(y, m);
      const mine = rows.filter((x) => x.attendance_date >= r.from && x.attendance_date <= r.to);
      const s = summarizeAttendance(mine, await scheduledWorkingDays(employees, r.from, r.to));
      return { month: `${MONTH_LABELS[m - 1].slice(0, 3)} ${String(y).slice(2)}`, pct: s.attendancePercentage, late: s.lateDays, absent: s.absentDays };
    }),
  );
  const deptData = await Promise.all(
    departments.map(async (d) => {
      const emps = employees.filter((e) => e.department_id === d.id);
      const ids = new Set(emps.map((e) => e.id));
      const r = monthRange(cy, cm);
      const s = summarizeAttendance(rows.filter((x) => ids.has(x.employee_id) && x.attendance_date >= r.from), await scheduledWorkingDays(emps, r.from, r.to));
      return { department: d.name, pct: s.attendancePercentage };
    }),
  );
  const supabase = await createClient();
  const { data: payroll } = await supabase.from("payroll_records").select("*").gte("period_year", cy - 1).order("period_year").order("period_month");
  const payrollTrend = ((payroll ?? []) as PayrollRecord[]).slice(-12).map((p) => ({
    month: `${MONTH_LABELS[p.period_month - 1].slice(0, 3)} ${String(p.period_year).slice(2)}`, net: Number(p.total_net),
  }));

  return (
    <>
      <PageHeader title="Reports & Analytics" description="Build any report from live data, preview it, then print or export." />
      <div className="grid items-start gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Custom report builder</CardTitle>
            <CardDescription>Choose a report, employees, department and period.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReportBuilder
              employees={employees.map(toEmployeeOption)}
              departments={departments.map((d) => ({ id: d.id, name: d.name }))}
              today={today}
              initialType={param(sp, "type")}
            />
          </CardContent>
        </Card>
        <div className="grid gap-5">
          <ChartCard title="Monthly attendance rate" description="Company-wide, last 6 months" kind="line" valueFormat="percent" data={trend} xKey="month" xLabel="Month" series={[{ key: "pct", label: "Attendance %" }]} />
          <ChartCard title="Late and absent days" description="Company-wide, last 6 months" data={trend} xKey="month" xLabel="Month" series={[{ key: "late", label: "Late days" }, { key: "absent", label: "Absent days" }]} />
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Department attendance — this month" layout="horizontal" valueFormat="percent" data={deptData} xKey="department" xLabel="Department" series={[{ key: "pct", label: "Attendance %" }]} emptyText="No departments or attendance yet" />
        <ChartCard title="Payroll expense trend" description="Net salary per payroll month" kind="area" valueFormat="money" data={payrollTrend} xKey="month" xLabel="Month" series={[{ key: "net", label: "Net payroll (BDT)" }]} emptyText="No payroll generated yet" />
      </div>
    </>
  );
}
