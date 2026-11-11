import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClock, CalendarCheck2, CalendarX2, FileClock, Percent, PlaneTakeoff, UserCheck, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { FilterBar } from "@/components/shared/filters";
import { ChartCard } from "@/components/charts/charts";
import { DayList } from "@/components/attendance/day-list";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees, getDepartments, getLeaveTypes, getSettings } from "@/lib/data";
import { getDayOverview } from "@/lib/day-overview";
import { fetchAttendance, scheduledWorkingDays } from "@/lib/attendance-data";
import { summarizeAttendance } from "@/lib/analytics";
import { employeeWiseAnalytics } from "@/lib/employee-analytics";
import { MONTH_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { isMonth, param } from "@/lib/params";
import { formatDate, formatMonth, monthRange, todayISO, weekdayName } from "@/lib/time";
import type { LeaveRequest, PayrollRecord } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  const user = await requirePageRole("admin");
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const month = isMonth(param(sp, "month")) && param(sp, "month")! <= today.slice(0, 7) ? param(sp, "month")! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const range = monthRange(y, m);
  const end = range.to < today ? range.to : today;

  // Six-month window ending at the selected month (for trends).
  const months: { y: number; m: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  }
  const trendFrom = monthRange(months[0].y, months[0].m).from;

  const supabase = await createClient();
  const [employees, departments, leaveTypes, overview, rows, { count: totalEmployees }, { data: leaveToday }, { data: payrolls }, { count: pendingLeave }, { count: pendingCorr }] =
    await Promise.all([
      getActiveEmployees(),
      getDepartments(),
      getLeaveTypes(),
      getDayOverview(today),
      fetchAttendance({ from: trendFrom, to: end }),
      supabase.from("employees").select("id", { count: "exact", head: true }),
      supabase.from("leave_requests").select("employee_id").eq("status", "approved").lte("start_date", today).gte("end_date", today),
      supabase.from("payroll_records").select("*").gte("period_year", months[0].y).order("period_year").order("period_month"),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("attendance_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
  const active = employees.filter((e) => e.status === "active" || e.status === "on_notice");
  const monthRows = rows.filter((r) => r.attendance_date >= range.from && r.attendance_date <= end);
  const monthSummary = summarizeAttendance(monthRows, await scheduledWorkingDays(active, range.from, end));
  const c = overview.counts;
  const onLeaveToday = new Set(((leaveToday ?? []) as { employee_id: string }[]).map((l) => l.employee_id)).size;
  const payrollList = (payrolls ?? []) as PayrollRecord[];
  const monthPayroll = payrollList.find((p) => p.period_year === y && p.period_month === m);

  const attendanceTrend = await Promise.all(
    months.map(async ({ y: yy, m: mm }) => {
      const r = monthRange(yy, mm);
      const to = r.to < today ? r.to : today;
      const mine = rows.filter((x) => x.attendance_date >= r.from && x.attendance_date <= to);
      const s = summarizeAttendance(mine, await scheduledWorkingDays(active, r.from, to));
      return { month: `${MONTH_LABELS[mm - 1].slice(0, 3)} ${String(yy).slice(2)}`, pct: s.attendancePercentage, late: s.lateDays, lateMin: s.totalLateMinutes };
    }),
  );
  const deptData = await Promise.all(
    departments.filter((d) => d.is_active).map(async (d) => {
      const emps = active.filter((e) => e.department_id === d.id);
      const ids = new Set(emps.map((e) => e.id));
      const s = summarizeAttendance(monthRows.filter((r) => ids.has(r.employee_id)), await scheduledWorkingDays(emps, range.from, end));
      return { department: d.name, pct: s.attendancePercentage };
    }),
  );
  const ranking = (await employeeWiseAnalytics(active, monthRows, range.from, end))
    .sort((a, b) => b.summary.attendancePercentage - a.summary.attendancePercentage)
    .slice(0, 10)
    .map((r) => ({ name: r.employee.full_name, pct: r.summary.attendancePercentage }));

  const { data: monthLeaves } = await supabase.from("leave_requests").select("leave_type_id, days, status").eq("status", "approved").gte("start_date", `${y}-01-01`).lte("start_date", `${y}-12-31`);
  const leaveStats = leaveTypes.filter((t) => t.is_active).map((t) => ({
    type: t.name,
    days: ((monthLeaves ?? []) as Pick<LeaveRequest, "leave_type_id" | "days">[]).filter((l) => l.leave_type_id === t.id).reduce((s, l) => s + Number(l.days), 0),
  }));
  const payrollTrend = months.map(({ y: yy, m: mm }) => {
    const p = payrollList.find((x) => x.period_year === yy && x.period_month === mm);
    return { month: `${MONTH_LABELS[mm - 1].slice(0, 3)} ${String(yy).slice(2)}`, net: p ? Number(p.total_net) : 0 };
  });

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName}`}
        description={`${weekdayName(today)}, ${formatDate(today)}${overview.holidayName ? ` · Holiday: ${overview.holidayName}` : overview.isWeeklyOff ? " · Weekly off" : ""}`}
        actions={
          <>
            <FilterBar filters={[{ type: "month", name: "month", label: "Analytics month" }]} />
            <Button asChild><Link href="/admin/attendance"><CalendarCheck2 /> Today&apos;s attendance</Link></Button>
          </>
        }
      />

      {(!!pendingLeave || !!pendingCorr) && (
        <div className="mb-5 flex flex-wrap gap-3">
          {!!pendingLeave && (
            <Link href="/admin/leave" className="inline-flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
              <PlaneTakeoff className="size-4" /> {pendingLeave} leave request(s) waiting for approval
            </Link>
          )}
          {!!pendingCorr && (
            <Link href="/admin/attendance/corrections" className="inline-flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
              <FileClock className="size-4" /> {pendingCorr} correction request(s) to review
            </Link>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Employees" value={totalEmployees ?? 0} icon={Users} tone="info" hint={`${employees.length} current · capacity ${settings.max_employees}`} />
        <StatCard label="Active Employees" value={active.length} icon={UserCheck} tone="success" />
        <StatCard label="Present Today" value={c.present} icon={CalendarCheck2} tone="success" hint={`${c.notRecorded} not recorded yet`} />
        <StatCard label="Absent Today" value={c.absent} icon={CalendarX2} tone="danger" hint="Counted after attendance closing" />
        <StatCard label="Late Today" value={c.late} icon={AlarmClock} tone="warning" />
        <StatCard label="On Leave Today" value={onLeaveToday} icon={PlaneTakeoff} tone="brand" />
        <StatCard label="Attendance Rate" value={`${monthSummary.attendancePercentage}%`} icon={Percent} tone="brand" hint={formatMonth(y, m)} />
        <StatCard
          label="Payroll"
          value={<span className="text-xl">{monthPayroll ? formatMoney(monthPayroll.total_net) : "—"}</span>}
          icon={Wallet}
          tone="neutral"
          hint={monthPayroll ? `${formatMonth(y, m)} · ${monthPayroll.status === "finalized" ? "Finalized" : "Draft"}` : `Not generated for ${formatMonth(y, m)}`}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Monthly attendance trend" description="Company attendance rate, last 6 months" kind="line" valueFormat="percent" data={attendanceTrend} xKey="month" xLabel="Month" series={[{ key: "pct", label: "Attendance %" }]} />
        <ChartCard title="Late arrival trend" description="Late days per month" data={attendanceTrend} xKey="month" xLabel="Month" series={[{ key: "late", label: "Late days" }]} />
        <ChartCard title="Department-wise attendance" description={formatMonth(y, m)} layout="horizontal" valueFormat="percent" data={deptData} xKey="department" xLabel="Department" series={[{ key: "pct", label: "Attendance %" }]} emptyText="No departments yet" />
        <ChartCard title="Employee attendance ranking" description={`Top 10 · ${formatMonth(y, m)}`} layout="horizontal" valueFormat="percent" height={Math.max(220, ranking.length * 28)} data={ranking} xKey="name" xLabel="Employee" series={[{ key: "pct", label: "Attendance %" }]} emptyText="No attendance yet" />
        <ChartCard title="Leave statistics" description={`Approved leave days in ${y}`} data={leaveStats} xKey="type" xLabel="Leave type" series={[{ key: "days", label: "Days" }]} emptyText="No approved leave this year" />
        <ChartCard title="Payroll expense trend" description="Net payroll, last 6 months" kind="area" valueFormat="money" data={payrollTrend} xKey="month" xLabel="Month" series={[{ key: "net", label: "Net payroll (BDT)" }]} emptyText="No payroll generated yet" />
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Today at a glance</CardTitle>
          <CardAction><Button variant="outline" size="sm" asChild><Link href="/admin/attendance">Manage</Link></Button></CardAction>
        </CardHeader>
        <div className="max-h-[420px] overflow-y-auto"><DayList rows={overview.rows} /></div>
      </Card>
    </>
  );
}
