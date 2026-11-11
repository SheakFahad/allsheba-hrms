import "server-only";
import { createClient } from "@/lib/supabase/server";
import { brandingFrom, EMPLOYEE_SELECT, getActiveEmployees, getDepartments, getHolidays, getLeaveTypes, getSettings } from "@/lib/data";
import { fetchAttendance, scheduledWorkingDays } from "@/lib/attendance-data";
import { summarizeAttendance, type AttendanceSummary } from "@/lib/analytics";
import { employeeWiseAnalytics } from "@/lib/employee-analytics";
import {
  ATTENDANCE_STATUS_LABELS, EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, LATE_REASON_LABELS,
  LEAVE_STATUS_LABELS, MONTH_LABELS, PAYROLL_BASIS_LABELS,
} from "@/lib/constants";
import { formatAmount } from "@/lib/format";
import { resolvePeriod } from "@/lib/params";
import { formatDate, formatDuration, formatMonth, formatTime12, monthRange, todayISO, weekdayName, yearRange } from "@/lib/time";
import type {
  Attendance, AttendanceStatus, CompanySettings, Employee, EmployeePersonal, LeaveRequest, PayrollItem, PayrollRecord, SalaryStructure,
} from "@/lib/types";
import type { SessionUser } from "@/lib/auth";
import { REPORT_MAP } from "./catalog";
import type { KVSection, ReportColumn, ReportDocument, ReportParams, ReportSection, Row, TableSection } from "./types";

export class ReportError extends Error {}

interface Ctx {
  settings: CompanySettings;
  today: string;
  user: SessionUser;
  p: ReportParams;
}

type Built = Omit<ReportDocument, "generatedAt" | "generatedBy" | "branding" | "sensitive" | "type" | "timezone" | "fileName"> & { fileName?: string };

/* ------------------------------------------------------------------ helpers */

function period(ctx: Ctx) {
  const sp: Record<string, string | undefined> = { from: ctx.p.from, to: ctx.p.to, month: ctx.p.month, year: ctx.p.year };
  return resolvePeriod(sp, ctx.today);
}

function periodLabel(from: string, to: string) {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

async function loadEmployee(id: string | undefined): Promise<Employee> {
  if (!id) throw new ReportError("Select an employee.");
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select(EMPLOYEE_SELECT).eq("id", id).maybeSingle<Employee>();
  if (!data) throw new ReportError("Employee not found.");
  return data;
}

async function scopeEmployees(ctx: Ctx): Promise<Employee[]> {
  const all = await getActiveEmployees();
  const ids = ctx.p.employees?.length ? new Set(ctx.p.employees) : ctx.p.employee ? new Set([ctx.p.employee]) : null;
  return all.filter((e) => (!ids || ids.has(e.id)) && (!ctx.p.department || e.department_id === ctx.p.department));
}

function employeeKV(e: Employee, title = "Employee"): KVSection {
  return {
    kind: "kv",
    title,
    items: [
      { label: "Employee ID", value: e.employee_code },
      { label: "Name", value: e.full_name },
      { label: "Department", value: e.departments?.name ?? "—" },
      { label: "Designation", value: e.designations?.name ?? "—" },
      { label: "Joining date", value: formatDate(e.joining_date) },
      { label: "Employment type", value: EMPLOYMENT_TYPE_LABELS[e.employment_type] },
    ],
  };
}

function summaryKV(s: AttendanceSummary, title = "Summary"): KVSection {
  return {
    kind: "kv",
    title,
    items: [
      { label: "Working days", value: String(s.workingDays) },
      { label: "Present days", value: String(s.presentDays) },
      { label: "Half days", value: String(s.halfDays) },
      { label: "Absent days", value: String(s.absentDays) },
      { label: "Leave days", value: String(s.leaveDays) },
      { label: "Late days", value: String(s.lateDays) },
      { label: "Total late", value: formatDuration(s.totalLateMinutes) },
      { label: "Average late", value: `${s.averageLateMinutes} min` },
      { label: "Early departures", value: String(s.earlyDepartureDays) },
      { label: "Hours worked", value: formatDuration(s.totalWorkMinutes) },
      { label: "Attendance", value: `${s.attendancePercentage}%` },
      { label: "Most common late reason", value: s.mostCommonLateReason ?? "—" },
    ],
  };
}

const ATT_COLUMNS: ReportColumn[] = [
  { key: "date", label: "Date", format: "date" },
  { key: "day", label: "Day" },
  { key: "code", label: "Emp. ID" },
  { key: "name", label: "Employee" },
  { key: "department", label: "Department" },
  { key: "scheduled_in", label: "Sched. In", format: "time" },
  { key: "actual_in", label: "Actual In", format: "time" },
  { key: "late", label: "Late", format: "minutes", align: "right" },
  { key: "late_reason", label: "Late Reason" },
  { key: "late_note", label: "Late Details" },
  { key: "scheduled_out", label: "Sched. Out", format: "time" },
  { key: "actual_out", label: "Actual Out", format: "time" },
  { key: "early", label: "Early Dep.", format: "minutes", align: "right" },
  { key: "worked", label: "Worked", format: "duration", align: "right" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
];

function attRow(a: Attendance): Row {
  return {
    date: a.attendance_date,
    day: weekdayName(a.attendance_date).slice(0, 3),
    code: a.employees?.employee_code ?? "",
    name: a.employees?.full_name ?? "",
    department: a.employees?.departments?.name ?? "",
    scheduled_in: a.scheduled_in,
    actual_in: a.actual_in,
    late: a.late_minutes,
    late_reason: a.late_reason ? LATE_REASON_LABELS[a.late_reason] : null,
    late_note: a.late_reason_note,
    scheduled_out: a.scheduled_out,
    actual_out: a.actual_out,
    early: a.early_leave_minutes,
    worked: a.work_minutes,
    status: ATTENDANCE_STATUS_LABELS[a.status],
    notes: a.notes,
  };
}

function attTable(rows: Attendance[], opts: { individual?: boolean; title?: string } = {}): TableSection {
  const columns = opts.individual
    ? ATT_COLUMNS.filter((c) => !["code", "name", "department", "notes"].includes(c.key))
    : ATT_COLUMNS.filter((c) => c.key !== "late_note");
  const sorted = [...rows].sort((a, b) => a.attendance_date.localeCompare(b.attendance_date) || (a.employees?.full_name ?? "").localeCompare(b.employees?.full_name ?? ""));
  return {
    kind: "table", title: opts.title, primary: true, columns, rows: sorted.map(attRow),
    totals: {
      date: "Total", late: rows.reduce((s, r) => s + r.late_minutes, 0),
      early: rows.reduce((s, r) => s + r.early_leave_minutes, 0), worked: rows.reduce((s, r) => s + r.work_minutes, 0),
    },
  };
}

const SUMMARY_COLUMNS: ReportColumn[] = [
  { key: "code", label: "Emp. ID" },
  { key: "name", label: "Employee" },
  { key: "department", label: "Department" },
  { key: "working", label: "Working Days", format: "number", align: "right" },
  { key: "present", label: "Present", format: "number", align: "right" },
  { key: "half", label: "Half Days", format: "number", align: "right" },
  { key: "absent", label: "Absent", format: "number", align: "right" },
  { key: "leave", label: "Leave", format: "number", align: "right" },
  { key: "late_days", label: "Late Days", format: "number", align: "right" },
  { key: "late_total", label: "Total Late", format: "minutes", align: "right" },
  { key: "late_avg", label: "Avg Late", format: "minutes", align: "right" },
  { key: "early", label: "Early Dep.", format: "number", align: "right" },
  { key: "hours", label: "Worked", format: "duration", align: "right" },
  { key: "pct", label: "Attendance", format: "percent", align: "right" },
  { key: "reason", label: "Top Late Reason" },
];

function summaryRow(e: Employee, s: AttendanceSummary): Row {
  return {
    code: e.employee_code, name: e.full_name, department: e.departments?.name ?? "", working: s.workingDays,
    present: s.presentDays, half: s.halfDays, absent: s.absentDays, leave: s.leaveDays, late_days: s.lateDays,
    late_total: s.totalLateMinutes, late_avg: s.averageLateMinutes, early: s.earlyDepartureDays,
    hours: s.totalWorkMinutes, pct: s.attendancePercentage, reason: s.mostCommonLateReason,
  };
}

async function employeeSummaryTable(ctx: Ctx, from: string, to: string): Promise<TableSection> {
  const scope = await scopeEmployees(ctx);
  const rows = await fetchAttendance({ from, to, employeeIds: ctx.p.employees?.length ? ctx.p.employees : undefined, departmentId: ctx.p.department });
  const data = await employeeWiseAnalytics(scope, rows, from, to);
  const sum = (k: keyof AttendanceSummary) => data.reduce((s, d) => s + Number(d.summary[k]), 0);
  return {
    kind: "table", primary: true, columns: SUMMARY_COLUMNS,
    rows: data.map((d) => summaryRow(d.employee, d.summary)),
    totals: {
      code: "Total", working: sum("workingDays"), present: sum("presentDays"), half: sum("halfDays"), absent: sum("absentDays"),
      leave: sum("leaveDays"), late_days: sum("lateDays"), late_total: sum("totalLateMinutes"), early: sum("earlyDepartureDays"),
      hours: sum("totalWorkMinutes"),
    },
  };
}

function deptMeta(ctx: Ctx, departments: { id: string; name: string }[]) {
  return ctx.p.department ? [{ label: "Department", value: departments.find((d) => d.id === ctx.p.department)?.name ?? "—" }] : [];
}

function money(n: number | string) {
  return `BDT ${formatAmount(n)}`;
}

/* ------------------------------------------------------------------ builders */

const builders: Record<string, (ctx: Ctx) => Promise<Built>> = {
  async employee_profile(ctx) {
    const e = await loadEmployee(ctx.p.employee);
    const supabase = await createClient();
    const [{ data: p }, { data: sal }] = await Promise.all([
      supabase.from("employee_personal").select("*").eq("employee_id", e.id).maybeSingle<EmployeePersonal>(),
      supabase.from("salary_structures").select("*").eq("employee_id", e.id).lte("effective_from", ctx.today).order("effective_from", { ascending: false }).limit(1).maybeSingle<SalaryStructure>(),
    ]);
    const yr = yearRange(Number(ctx.today.slice(0, 4)));
    const rows = await fetchAttendance({ ...yr, employeeIds: [e.id] });
    const s = summarizeAttendance(rows, await scheduledWorkingDays([e], yr.from, yr.to));
    return {
      title: "Employee Profile",
      subtitle: `${e.full_name} (${e.employee_code})`,
      orientation: "portrait",
      meta: [{ label: "Status", value: e.archived_at ? "Archived" : EMPLOYMENT_STATUS_LABELS[e.status] }],
      sections: [
        employeeKV(e, "Employment"),
        { kind: "kv", title: "Personal information", items: [
          { label: "Phone", value: e.phone ?? "—" }, { label: "Email", value: p?.email ?? "—" },
          { label: "Date of birth", value: formatDate(p?.date_of_birth) }, { label: "National ID", value: p?.national_id ?? "—" },
          { label: "Address", value: p?.address ?? "—" },
        ] },
        { kind: "kv", title: "Emergency contact", items: [
          { label: "Name", value: p?.emergency_contact_name ?? "—" }, { label: "Phone", value: p?.emergency_contact_phone ?? "—" },
          { label: "Relationship", value: p?.emergency_contact_relation ?? "—" },
        ] },
        { kind: "kv", title: "Salary", items: sal ? [
          { label: "Basic salary", value: money(sal.basic_salary) }, { label: "Allowances", value: money(sal.allowances) },
          { label: "Gross monthly", value: money(Number(sal.basic_salary) + Number(sal.allowances)) },
          { label: "Effective from", value: formatDate(sal.effective_from) },
        ] : [{ label: "Salary", value: "Not set" }] },
        summaryKV(s, `Attendance summary — ${ctx.today.slice(0, 4)} (to date)`),
        { kind: "signatures", labels: ["Prepared by", "HR Manager", "Employee"] },
      ],
      fileName: `profile-${e.employee_code}`,
    };
  },

  async personal_information(ctx) {
    const e = await loadEmployee(ctx.p.employee);
    const supabase = await createClient();
    const { data: p } = await supabase.from("employee_personal").select("*").eq("employee_id", e.id).maybeSingle<EmployeePersonal>();
    return {
      title: "Personal Information", subtitle: `${e.full_name} (${e.employee_code})`, orientation: "portrait", meta: [],
      sections: [
        employeeKV(e),
        { kind: "kv", title: "Personal details", items: [
          { label: "Phone", value: e.phone ?? "—" }, { label: "Email", value: p?.email ?? "—" },
          { label: "Date of birth", value: formatDate(p?.date_of_birth) }, { label: "National ID", value: p?.national_id ?? "—" },
          { label: "Address", value: p?.address ?? "—" },
        ] },
        { kind: "kv", title: "Emergency contact", items: [
          { label: "Name", value: p?.emergency_contact_name ?? "—" }, { label: "Phone", value: p?.emergency_contact_phone ?? "—" },
          { label: "Relationship", value: p?.emergency_contact_relation ?? "—" },
        ] },
        { kind: "signatures", labels: ["Verified by", "Employee"] },
      ],
      fileName: `personal-${e.employee_code}`,
    };
  },

  async employee_attendance(ctx) {
    const e = await loadEmployee(ctx.p.employee);
    const { from, to } = period(ctx);
    const rows = await fetchAttendance({ from, to, employeeIds: [e.id] });
    const s = summarizeAttendance(rows, await scheduledWorkingDays([e], from, to));
    return {
      title: "Attendance History", subtitle: `${e.full_name} (${e.employee_code})`, orientation: "landscape",
      meta: [{ label: "Period", value: periodLabel(from, to) }],
      sections: [employeeKV(e), summaryKV(s), attTable(rows, { individual: true, title: "Daily attendance" }), { kind: "signatures", labels: ["Prepared by", "Approved by", "Employee"] }],
      fileName: `attendance-${e.employee_code}-${from}-${to}`,
    };
  },

  async late_history(ctx) {
    const e = await loadEmployee(ctx.p.employee);
    const { from, to } = period(ctx);
    const rows = await fetchAttendance({ from, to, employeeIds: [e.id], lateOnly: true });
    const total = rows.reduce((s, r) => s + r.late_minutes, 0);
    return {
      title: "Late Arrival History", subtitle: `${e.full_name} (${e.employee_code})`, orientation: "landscape",
      meta: [{ label: "Period", value: periodLabel(from, to) }],
      sections: [
        employeeKV(e),
        { kind: "kv", title: "Summary", items: [
          { label: "Late arrivals", value: String(rows.length) }, { label: "Total late", value: formatDuration(total) },
          { label: "Average late", value: rows.length ? `${Math.round(total / rows.length)} min` : "—" },
        ] },
        {
          kind: "table", primary: true, title: "Late arrivals",
          columns: ATT_COLUMNS.filter((c) => ["date", "day", "scheduled_in", "actual_in", "late", "late_reason", "late_note", "status"].includes(c.key)),
          rows: [...rows].reverse().map(attRow), totals: { date: "Total", late: total },
        },
      ],
      fileName: `late-history-${e.employee_code}`,
    };
  },

  async late_reason_analysis(ctx) {
    const { from, to } = period(ctx);
    const e = ctx.p.employee ? await loadEmployee(ctx.p.employee) : null;
    const rows = await fetchAttendance({ from, to, employeeIds: e ? [e.id] : undefined, departmentId: ctx.p.department, lateOnly: true });
    const map = new Map<string, { count: number; minutes: number; people: Set<string> }>();
    for (const r of rows) {
      const k = r.late_reason ? LATE_REASON_LABELS[r.late_reason] : "Not specified";
      const v = map.get(k) ?? { count: 0, minutes: 0, people: new Set() };
      v.count++; v.minutes += r.late_minutes; v.people.add(r.employee_id);
      map.set(k, v);
    }
    const total = rows.length;
    const departments = await getDepartments();
    return {
      title: "Late Reason Analysis", subtitle: e ? `${e.full_name} (${e.employee_code})` : "All employees", orientation: "portrait",
      meta: [{ label: "Period", value: periodLabel(from, to) }, ...deptMeta(ctx, departments)],
      sections: [{
        kind: "table", primary: true,
        columns: [
          { key: "reason", label: "Late Reason" }, { key: "count", label: "Occurrences", format: "number", align: "right" },
          { key: "share", label: "Share", format: "percent", align: "right" }, { key: "minutes", label: "Total Late", format: "minutes", align: "right" },
          { key: "avg", label: "Avg Late", format: "minutes", align: "right" }, { key: "people", label: "Employees", format: "number", align: "right" },
        ],
        rows: [...map.entries()].sort((a, b) => b[1].count - a[1].count).map(([reason, v]) => ({
          reason, count: v.count, share: total ? Math.round((v.count / total) * 1000) / 10 : 0, minutes: v.minutes,
          avg: Math.round(v.minutes / v.count), people: v.people.size,
        })),
        totals: { reason: "Total", count: total, minutes: rows.reduce((s, r) => s + r.late_minutes, 0) },
      }],
      fileName: `late-reasons-${from}-${to}`,
    };
  },

  async leave_history(ctx) {
    const e = await loadEmployee(ctx.p.employee);
    const year = Number(ctx.p.year ?? ctx.today.slice(0, 4));
    const supabase = await createClient();
    const [{ data: reqs }, { data: bal }, types] = await Promise.all([
      supabase.from("leave_requests").select("*").eq("employee_id", e.id).gte("start_date", `${year}-01-01`).lte("start_date", `${year}-12-31`).order("start_date"),
      supabase.rpc("leave_balance_report", { p_year: year }),
      getLeaveTypes(),
    ]);
    const tname = new Map(types.map((t) => [t.id, t.name]));
    const balances = ((bal ?? []) as { employee_id: string; leave_type_id: string; allocated: number; used: number; pending: number; remaining: number }[]).filter((b) => b.employee_id === e.id);
    return {
      title: "Leave History", subtitle: `${e.full_name} (${e.employee_code})`, orientation: "portrait", meta: [{ label: "Year", value: String(year) }],
      sections: [
        employeeKV(e),
        { kind: "table", title: "Leave balance", columns: [
          { key: "type", label: "Leave Type" }, { key: "allocated", label: "Allocated", format: "number", align: "right" },
          { key: "used", label: "Used", format: "number", align: "right" }, { key: "pending", label: "Pending", format: "number", align: "right" },
          { key: "remaining", label: "Remaining", format: "number", align: "right" },
        ], rows: balances.map((b) => ({ type: tname.get(b.leave_type_id) ?? "", allocated: Number(b.allocated), used: Number(b.used), pending: Number(b.pending), remaining: Number(b.remaining) })) },
        { kind: "table", primary: true, title: "Leave requests", columns: [
          { key: "type", label: "Type" }, { key: "from", label: "From", format: "date" }, { key: "to", label: "To", format: "date" },
          { key: "days", label: "Days", format: "number", align: "right" }, { key: "reason", label: "Reason" }, { key: "status", label: "Status" },
        ], rows: ((reqs ?? []) as LeaveRequest[]).map((r) => ({
          type: tname.get(r.leave_type_id) ?? "", from: r.start_date, to: r.end_date, days: Number(r.days), reason: r.reason, status: LEAVE_STATUS_LABELS[r.status],
        })) },
      ],
      fileName: `leave-${e.employee_code}-${year}`,
    };
  },

  async salary_statement(ctx) {
    const e = await loadEmployee(ctx.p.employee);
    const year = Number(ctx.p.year ?? ctx.today.slice(0, 4));
    const supabase = await createClient();
    const [{ data: items }, { data: sal }] = await Promise.all([
      supabase.from("payroll_items").select("*, payroll_records!inner(period_year, period_month, status)").eq("employee_id", e.id).eq("payroll_records.period_year", year),
      supabase.from("salary_structures").select("*").eq("employee_id", e.id).order("effective_from"),
    ]);
    const list = ((items ?? []) as (PayrollItem & { payroll_records: { period_month: number; status: string } })[])
      .sort((a, b) => a.payroll_records.period_month - b.payroll_records.period_month);
    const sum = (k: keyof PayrollItem) => list.reduce((s, i) => s + Number(i[k]), 0);
    return {
      title: "Salary Statement", subtitle: `${e.full_name} (${e.employee_code})`, orientation: "landscape", meta: [{ label: "Year", value: String(year) }],
      sections: [
        employeeKV(e),
        { kind: "table", primary: true, title: "Monthly payroll", columns: [
          { key: "month", label: "Month" }, { key: "basic", label: "Basic", format: "money", align: "right" },
          { key: "allow", label: "Allowances", format: "money", align: "right" }, { key: "bonus", label: "Bonus", format: "money", align: "right" },
          { key: "ot", label: "Overtime", format: "money", align: "right" }, { key: "gross", label: "Gross", format: "money", align: "right" },
          { key: "ded", label: "Deductions", format: "money", align: "right" }, { key: "net", label: "Net Pay", format: "money", align: "right" },
          { key: "status", label: "Status" },
        ], rows: list.map((i) => ({
          month: MONTH_LABELS[i.payroll_records.period_month - 1], basic: Number(i.basic_salary), allow: Number(i.allowances),
          bonus: Number(i.bonus) + Number(i.other_earnings), ot: Number(i.overtime_amount), gross: Number(i.gross_earnings),
          ded: Number(i.total_deductions), net: Number(i.net_salary), status: i.payroll_records.status === "finalized" ? "Finalized" : "Draft",
        })), totals: { month: "Total", basic: sum("basic_salary"), allow: sum("allowances"), gross: sum("gross_earnings"), ded: sum("total_deductions"), net: sum("net_salary") } },
        { kind: "table", title: "Salary history", columns: [
          { key: "from", label: "Effective From", format: "date" }, { key: "basic", label: "Basic", format: "money", align: "right" },
          { key: "allow", label: "Allowances", format: "money", align: "right" }, { key: "gross", label: "Gross", format: "money", align: "right" },
          { key: "notes", label: "Note" },
        ], rows: ((sal ?? []) as SalaryStructure[]).map((s) => ({ from: s.effective_from, basic: Number(s.basic_salary), allow: Number(s.allowances), gross: Number(s.basic_salary) + Number(s.allowances), notes: s.notes })) },
      ],
      fileName: `salary-statement-${e.employee_code}-${year}`,
    };
  },

  async payslip(ctx) {
    const supabase = await createClient();
    type SlipItem = PayrollItem & { payroll_records: PayrollRecord };
    let item: SlipItem | null = null;
    if (ctx.p.item) {
      const { data } = await supabase.from("payroll_items").select("*, payroll_records(*)").eq("id", ctx.p.item).maybeSingle();
      item = data as SlipItem | null;
    } else {
      if (!ctx.p.employee || !ctx.p.month) throw new ReportError("Select an employee and a month.");
      const [y, m] = ctx.p.month.split("-").map(Number);
      const { data } = await supabase.from("payroll_items").select("*, payroll_records!inner(*)").eq("employee_id", ctx.p.employee)
        .eq("payroll_records.period_year", y).eq("payroll_records.period_month", m).maybeSingle();
      item = data as SlipItem | null;
    }
    if (!item) throw new ReportError("No payroll found for this employee and month. Generate the payroll first.");
    const r = item.payroll_records;
    const e = await loadEmployee(item.employee_id);
    const earnings: Row[] = [
      { item: "Basic salary", amount: Number(item.basic_salary) },
      { item: "Allowances", amount: Number(item.allowances) },
      ...(Number(item.overtime_amount) ? [{ item: `Overtime (${formatDuration(item.overtime_minutes)})`, amount: Number(item.overtime_amount) }] : []),
      ...(Number(item.bonus) ? [{ item: "Bonus", amount: Number(item.bonus) }] : []),
      ...(Number(item.other_earnings) ? [{ item: "Other earnings", amount: Number(item.other_earnings) }] : []),
    ];
    const deductions: Row[] = [
      ...(Number(item.absent_deduction) ? [{ item: `Absence (${item.absent_days} day(s))`, amount: Number(item.absent_deduction) }] : []),
      ...(Number(item.unpaid_leave_deduction) ? [{ item: `Unpaid leave (${Number(item.unpaid_leave_days)} day(s))`, amount: Number(item.unpaid_leave_deduction) }] : []),
      ...(Number(item.half_day_deduction) ? [{ item: `Half days (${item.half_days})`, amount: Number(item.half_day_deduction) }] : []),
      ...(Number(item.late_deduction) ? [{ item: `Late attendance (${item.late_days} late day(s))`, amount: Number(item.late_deduction) }] : []),
      ...(Number(item.other_deduction) ? [{ item: "Other deductions", amount: Number(item.other_deduction) }] : []),
    ];
    const amountCols: ReportColumn[] = [{ key: "item", label: "Description" }, { key: "amount", label: "Amount (BDT)", format: "money", align: "right" }];
    return {
      title: "Payslip", subtitle: formatMonth(r.period_year, r.period_month), orientation: "portrait",
      meta: [{ label: "Payroll status", value: r.status === "finalized" ? "Finalized" : "Draft (not final)" }],
      sections: [
        employeeKV(e),
        { kind: "kv", title: "Attendance", items: [
          { label: "Working days", value: String(item.working_days) }, { label: "Present days", value: String(Number(item.present_days)) },
          { label: "Late days", value: String(item.late_days) }, { label: "Absent days", value: String(item.absent_days) },
          { label: "Paid leave", value: String(Number(item.paid_leave_days)) }, { label: "Unpaid leave", value: String(Number(item.unpaid_leave_days)) },
        ] },
        { kind: "table", title: "Earnings", columns: amountCols, rows: earnings, totals: { item: "Gross earnings", amount: Number(item.gross_earnings) } },
        { kind: "table", title: "Deductions", columns: amountCols, rows: deductions.length ? deductions : [{ item: "No deductions", amount: 0 }], totals: { item: "Total deductions", amount: Number(item.total_deductions) } },
        { kind: "kv", title: "Net pay", items: [{ label: "Net salary payable", value: money(item.net_salary) }] },
        ...(item.adjustment_note ? [{ kind: "note" as const, text: `Note: ${item.adjustment_note}` }] : []),
        ...(ctx.settings.payslip_note ? [{ kind: "note" as const, text: ctx.settings.payslip_note }] : []),
        { kind: "signatures", labels: ["Prepared by", "Authorised signature", "Employee signature"] },
      ],
      fileName: `payslip-${e.employee_code}-${r.period_year}-${String(r.period_month).padStart(2, "0")}`,
    };
  },

  async employee_performance(ctx) {
    const e = await loadEmployee(ctx.p.employee);
    const year = Number(ctx.p.year ?? ctx.today.slice(0, 4));
    const rows = await fetchAttendance({ ...yearRange(year), employeeIds: [e.id] });
    const out: Row[] = [];
    for (let m = 1; m <= 12; m++) {
      const r = monthRange(year, m);
      if (r.from > ctx.today) break;
      const mine = rows.filter((x) => x.attendance_date >= r.from && x.attendance_date <= r.to);
      const s = summarizeAttendance(mine, await scheduledWorkingDays([e], r.from, r.to));
      out.push({ month: MONTH_LABELS[m - 1], ...summaryRow(e, s) });
    }
    const total = summarizeAttendance(rows, await scheduledWorkingDays([e], `${year}-01-01`, `${year}-12-31`));
    return {
      title: "Employee Performance — Attendance", subtitle: `${e.full_name} (${e.employee_code})`, orientation: "landscape",
      meta: [{ label: "Year", value: String(year) }],
      sections: [
        employeeKV(e), summaryKV(total, `Year ${year} summary`),
        { kind: "table", primary: true, title: "Monthly performance", columns: [{ key: "month", label: "Month" }, ...SUMMARY_COLUMNS.filter((c) => !["code", "name", "department"].includes(c.key))], rows: out },
      ],
      fileName: `performance-${e.employee_code}-${year}`,
    };
  },

  async daily_attendance(ctx) {
    const date = ctx.p.date ?? ctx.today;
    const [employees, rows, departments, holidays] = await Promise.all([
      scopeEmployees(ctx), fetchAttendance({ from: date, to: date, departmentId: ctx.p.department }), getDepartments(), getHolidays(date, date),
    ]);
    const byEmp = new Map(rows.map((r) => [r.employee_id, r]));
    const eligible = employees.filter((e) => e.joining_date <= date);
    const out: Row[] = eligible.map((e) => {
      const r = byEmp.get(e.id);
      return r ? attRow(r) : { code: e.employee_code, name: e.full_name, department: e.departments?.name ?? "", status: "Not recorded", date };
    });
    const count = (s: AttendanceStatus) => rows.filter((r) => r.status === s).length;
    return {
      title: "Daily Attendance Report", subtitle: `${weekdayName(date)}, ${formatDate(date)}`, orientation: "landscape",
      meta: [...deptMeta(ctx, departments), ...(holidays[0] ? [{ label: "Holiday", value: holidays[0].name }] : [])],
      sections: [
        { kind: "kv", title: "Summary", items: [
          { label: "Employees", value: String(eligible.length) }, { label: "Present", value: String(count("present") + count("late")) },
          { label: "Late", value: String(count("late")) }, { label: "Half day", value: String(count("half_day")) },
          { label: "Absent", value: String(count("absent")) }, { label: "On leave", value: String(count("leave")) },
          { label: "Not recorded", value: String(eligible.length - rows.filter((r) => eligible.some((e) => e.id === r.employee_id)).length) },
        ] },
        { kind: "table", primary: true, columns: ATT_COLUMNS.filter((c) => !["date", "day", "late_note"].includes(c.key)), rows: out.sort((a, b) => String(a.name).localeCompare(String(b.name))) },
        { kind: "signatures", labels: ["Prepared by", "Checked by", "Approved by"] },
      ],
      fileName: `daily-attendance-${date}`,
    };
  },

  async monthly_attendance(ctx) {
    const month = ctx.p.month ?? ctx.today.slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const { from, to } = monthRange(y, m);
    const departments = await getDepartments();
    return {
      title: "Monthly Attendance Report", subtitle: formatMonth(y, m), orientation: "landscape", meta: deptMeta(ctx, departments),
      sections: [await employeeSummaryTable(ctx, from, to), { kind: "signatures", labels: ["Prepared by", "HR Manager", "Approved by"] }],
      fileName: `monthly-attendance-${month}`,
    };
  },

  async yearly_attendance(ctx) {
    const year = Number(ctx.p.year ?? ctx.today.slice(0, 4));
    const { from, to } = yearRange(year);
    const departments = await getDepartments();
    return {
      title: "Yearly Attendance Report", subtitle: String(year), orientation: "landscape", meta: deptMeta(ctx, departments),
      sections: [await employeeSummaryTable(ctx, from, to), { kind: "signatures", labels: ["Prepared by", "HR Manager", "Approved by"] }],
      fileName: `yearly-attendance-${year}`,
    };
  },

  async department_attendance(ctx) {
    const { from, to } = period(ctx);
    const [employees, departments, rows] = await Promise.all([getActiveEmployees(), getDepartments(), fetchAttendance({ from, to })]);
    const groups = [...departments.map((d) => ({ id: d.id as string | null, name: d.name })), { id: null, name: "Unassigned" }];
    const out: Row[] = [];
    for (const g of groups) {
      const emps = employees.filter((e) => e.department_id === g.id);
      if (!emps.length) continue;
      const ids = new Set(emps.map((e) => e.id));
      const s = summarizeAttendance(rows.filter((r) => ids.has(r.employee_id)), await scheduledWorkingDays(emps, from, to));
      out.push({ department: g.name, employees: emps.length, working: s.workingDays, present: s.presentDays, half: s.halfDays, absent: s.absentDays, leave: s.leaveDays, late_days: s.lateDays, late_total: s.totalLateMinutes, pct: s.attendancePercentage });
    }
    return {
      title: "Department-wise Attendance", subtitle: periodLabel(from, to), orientation: "landscape", meta: [],
      sections: [{ kind: "table", primary: true, columns: [
        { key: "department", label: "Department" }, { key: "employees", label: "Employees", format: "number", align: "right" },
        { key: "working", label: "Working Days", format: "number", align: "right" }, { key: "present", label: "Present", format: "number", align: "right" },
        { key: "half", label: "Half Days", format: "number", align: "right" }, { key: "absent", label: "Absent", format: "number", align: "right" },
        { key: "leave", label: "Leave", format: "number", align: "right" }, { key: "late_days", label: "Late Days", format: "number", align: "right" },
        { key: "late_total", label: "Total Late", format: "minutes", align: "right" }, { key: "pct", label: "Attendance", format: "percent", align: "right" },
      ], rows: out }],
      fileName: `department-attendance-${from}-${to}`,
    };
  },

  async employee_directory(ctx) {
    const supabase = await createClient();
    let q = supabase.from("employees").select(EMPLOYEE_SELECT);
    q = ctx.p.view === "archived" ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    if (ctx.p.department) q = q.eq("department_id", ctx.p.department);
    if (ctx.p.status) q = q.eq("status", ctx.p.status);
    const { data } = await q.order("employee_code");
    const departments = await getDepartments();
    return {
      title: "Employee Directory", subtitle: ctx.p.view === "archived" ? "Archived employees" : "Current employees", orientation: "landscape",
      meta: [...deptMeta(ctx, departments), ...(ctx.p.status ? [{ label: "Status", value: EMPLOYMENT_STATUS_LABELS[ctx.p.status as keyof typeof EMPLOYMENT_STATUS_LABELS] ?? ctx.p.status }] : [])],
      sections: [{ kind: "table", primary: true, columns: [
        { key: "code", label: "Emp. ID" }, { key: "name", label: "Name" }, { key: "department", label: "Department" },
        { key: "designation", label: "Designation" }, { key: "phone", label: "Phone" }, { key: "type", label: "Type" },
        { key: "joined", label: "Joined", format: "date" }, { key: "shift", label: "Shift" }, { key: "status", label: "Status" },
      ], rows: ((data ?? []) as Employee[]).map((e) => ({
        code: e.employee_code, name: e.full_name, department: e.departments?.name ?? null, designation: e.designations?.name ?? null,
        phone: e.phone, type: EMPLOYMENT_TYPE_LABELS[e.employment_type], joined: e.joining_date,
        shift: e.shifts ? `${formatTime12(e.shifts.start_time)} – ${formatTime12(e.shifts.end_time)}` : "Default",
        status: e.archived_at ? "Archived" : EMPLOYMENT_STATUS_LABELS[e.status],
      })) }],
      fileName: "employee-directory",
    };
  },

  async late_report(ctx) {
    const { from, to } = period(ctx);
    const ids = ctx.p.employees?.length ? ctx.p.employees : ctx.p.employee ? [ctx.p.employee] : undefined;
    const [rows, departments] = await Promise.all([fetchAttendance({ from, to, employeeIds: ids, departmentId: ctx.p.department, lateOnly: true }), getDepartments()]);
    const total = rows.reduce((s, r) => s + r.late_minutes, 0);
    return {
      title: "Late Employee Report", subtitle: periodLabel(from, to), orientation: "landscape", meta: deptMeta(ctx, departments),
      sections: [
        { kind: "kv", title: "Summary", items: [
          { label: "Late arrivals", value: String(rows.length) }, { label: "Employees late", value: String(new Set(rows.map((r) => r.employee_id)).size) },
          { label: "Total late", value: formatDuration(total) }, { label: "Average late", value: rows.length ? `${Math.round(total / rows.length)} min` : "—" },
        ] },
        { ...attTable(rows), columns: ATT_COLUMNS.filter((c) => ["date", "code", "name", "department", "scheduled_in", "actual_in", "late", "late_reason", "late_note"].includes(c.key)) },
      ],
      fileName: `late-report-${from}-${to}`,
    };
  },

  async absence_report(ctx) {
    const { from, to } = period(ctx);
    const ids = ctx.p.employees?.length ? ctx.p.employees : undefined;
    const [rows, departments] = await Promise.all([fetchAttendance({ from, to, employeeIds: ids, departmentId: ctx.p.department, status: "absent" }), getDepartments()]);
    const per = new Map<string, { name: string; code: string; dept: string; n: number }>();
    for (const r of rows) {
      const v = per.get(r.employee_id) ?? { name: r.employees?.full_name ?? "", code: r.employees?.employee_code ?? "", dept: r.employees?.departments?.name ?? "", n: 0 };
      v.n++;
      per.set(r.employee_id, v);
    }
    return {
      title: "Absence Report", subtitle: periodLabel(from, to), orientation: "portrait", meta: deptMeta(ctx, departments),
      sections: [
        { kind: "table", title: "Absences per employee", columns: [
          { key: "code", label: "Emp. ID" }, { key: "name", label: "Employee" }, { key: "department", label: "Department" }, { key: "n", label: "Absent Days", format: "number", align: "right" },
        ], rows: [...per.values()].sort((a, b) => b.n - a.n).map((v) => ({ code: v.code, name: v.name, department: v.dept, n: v.n })), totals: { code: "Total", n: rows.length } },
        { kind: "table", primary: true, title: "Absence dates", columns: ATT_COLUMNS.filter((c) => ["date", "day", "code", "name", "department", "notes"].includes(c.key)), rows: [...rows].reverse().map(attRow) },
      ],
      fileName: `absence-report-${from}-${to}`,
    };
  },

  async leave_summary(ctx) {
    const year = Number(ctx.p.year ?? ctx.today.slice(0, 4));
    const supabase = await createClient();
    const [{ data }, types, employees, departments] = await Promise.all([
      supabase.rpc("leave_balance_report", { p_year: year }), getLeaveTypes(), scopeEmployees(ctx), getDepartments(),
    ]);
    const activeTypes = types.filter((t) => t.is_active);
    const bal = (data ?? []) as { employee_id: string; leave_type_id: string; used: number; remaining: number }[];
    const columns: ReportColumn[] = [{ key: "code", label: "Emp. ID" }, { key: "name", label: "Employee" }];
    for (const t of activeTypes) {
      columns.push({ key: `${t.code}_used`, label: `${t.code} Used`, format: "number", align: "right" });
      if (t.is_paid) columns.push({ key: `${t.code}_left`, label: `${t.code} Left`, format: "number", align: "right" });
    }
    columns.push({ key: "total", label: "Total Used", format: "number", align: "right" });
    const rows = employees.map((e) => {
      const r: Row = { code: e.employee_code, name: e.full_name };
      let total = 0;
      for (const t of activeTypes) {
        const b = bal.find((x) => x.employee_id === e.id && x.leave_type_id === t.id);
        r[`${t.code}_used`] = Number(b?.used ?? 0);
        if (t.is_paid) r[`${t.code}_left`] = Number(b?.remaining ?? 0);
        total += Number(b?.used ?? 0);
      }
      r.total = total;
      return r;
    });
    return {
      title: "Leave Summary", subtitle: String(year), orientation: "landscape", meta: deptMeta(ctx, departments),
      sections: [
        { kind: "note", text: activeTypes.map((t) => `${t.code} = ${t.name}${t.is_paid ? "" : " (unpaid)"}`).join(" · ") },
        { kind: "table", primary: true, columns, rows },
      ],
      fileName: `leave-summary-${year}`,
    };
  },

  async payroll_summary(ctx) {
    const supabase = await createClient();
    let rec: PayrollRecord | null = null;
    if (ctx.p.payroll) {
      const { data } = await supabase.from("payroll_records").select("*").eq("id", ctx.p.payroll).maybeSingle<PayrollRecord>();
      rec = data;
    } else if (ctx.p.month) {
      const [y, m] = ctx.p.month.split("-").map(Number);
      const { data } = await supabase.from("payroll_records").select("*").eq("period_year", y).eq("period_month", m).maybeSingle<PayrollRecord>();
      rec = data;
    }
    if (!rec) throw new ReportError("No payroll exists for this month. Generate it in Payroll Management first.");
    const { data: items } = await supabase.from("payroll_items").select("*").eq("payroll_id", rec.id).order("employee_code");
    const list = (items ?? []) as PayrollItem[];
    const sum = (k: keyof PayrollItem) => list.reduce((s, i) => s + Number(i[k]), 0);
    return {
      title: "Payroll Summary", subtitle: formatMonth(rec.period_year, rec.period_month), orientation: "landscape",
      meta: [
        { label: "Status", value: rec.status === "finalized" ? `Finalized ${formatDate(rec.finalized_at?.slice(0, 10))}` : "Draft" },
        { label: "Day basis", value: `${PAYROLL_BASIS_LABELS[(rec.settings_snapshot.payroll_day_basis as keyof typeof PAYROLL_BASIS_LABELS) ?? "fixed_30"]} (${Number(rec.basis_days)})` },
      ],
      sections: [
        { kind: "table", primary: true, columns: [
          { key: "code", label: "Emp. ID" }, { key: "name", label: "Employee" }, { key: "department", label: "Department" },
          { key: "present", label: "Present", format: "number", align: "right" }, { key: "absent", label: "Absent", format: "number", align: "right" },
          { key: "basic", label: "Basic", format: "money", align: "right" }, { key: "allow", label: "Allowances", format: "money", align: "right" },
          { key: "extra", label: "Bonus/OT", format: "money", align: "right" }, { key: "gross", label: "Gross", format: "money", align: "right" },
          { key: "ded", label: "Deductions", format: "money", align: "right" }, { key: "net", label: "Net Pay", format: "money", align: "right" },
        ], rows: list.map((i) => ({
          code: i.employee_code, name: i.employee_name, department: i.department_name, present: Number(i.present_days), absent: i.absent_days,
          basic: Number(i.basic_salary), allow: Number(i.allowances), extra: Number(i.bonus) + Number(i.other_earnings) + Number(i.overtime_amount),
          gross: Number(i.gross_earnings), ded: Number(i.total_deductions), net: Number(i.net_salary),
        })), totals: { code: "Total", basic: sum("basic_salary"), allow: sum("allowances"), gross: sum("gross_earnings"), ded: sum("total_deductions"), net: sum("net_salary") } },
        { kind: "signatures", labels: ["Prepared by", "Checked by", "Approved by"] },
      ],
      fileName: `payroll-${rec.period_year}-${String(rec.period_month).padStart(2, "0")}`,
    };
  },

  async salary_expense(ctx) {
    const year = Number(ctx.p.year ?? ctx.today.slice(0, 4));
    const supabase = await createClient();
    const { data } = await supabase.from("payroll_records").select("*").eq("period_year", year).order("period_month");
    const recs = (data ?? []) as PayrollRecord[];
    const sum = (k: keyof PayrollRecord) => recs.reduce((s, r) => s + Number(r[k]), 0);
    return {
      title: "Salary Expense Report", subtitle: String(year), orientation: "portrait", meta: [],
      sections: [{ kind: "table", primary: true, columns: [
        { key: "month", label: "Month" }, { key: "employees", label: "Employees", format: "number", align: "right" },
        { key: "gross", label: "Gross", format: "money", align: "right" }, { key: "ded", label: "Deductions", format: "money", align: "right" },
        { key: "net", label: "Net Expense", format: "money", align: "right" }, { key: "status", label: "Status" },
      ], rows: recs.map((r) => ({
        month: MONTH_LABELS[r.period_month - 1], employees: r.employee_count, gross: Number(r.total_gross),
        ded: Number(r.total_deductions), net: Number(r.total_net), status: r.status === "finalized" ? "Finalized" : "Draft",
      })), totals: { month: "Total", gross: sum("total_gross"), ded: sum("total_deductions"), net: sum("total_net") } }],
      fileName: `salary-expense-${year}`,
    };
  },

  async employee_statistics(ctx) {
    const [employees, departments] = await Promise.all([getActiveEmployees(), getDepartments()]);
    const countBy = <K extends string>(f: (e: Employee) => K) => {
      const m = new Map<K, number>();
      for (const e of employees) m.set(f(e), (m.get(f(e)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const tenure = (e: Employee) => {
      const yrs = (Date.parse(ctx.today) - Date.parse(e.joining_date)) / (365.25 * 864e5);
      return yrs < 1 ? "Less than 1 year" : yrs < 3 ? "1–3 years" : yrs < 5 ? "3–5 years" : "5+ years";
    };
    const table = (title: string, entries: [string, number][]): TableSection => ({
      kind: "table", title,
      columns: [{ key: "k", label: title.replace("By ", "") }, { key: "n", label: "Employees", format: "number", align: "right" }, { key: "pct", label: "Share", format: "percent", align: "right" }],
      rows: entries.map(([k, n]) => ({ k, n, pct: employees.length ? Math.round((n / employees.length) * 1000) / 10 : 0 })),
    });
    return {
      title: "Employee Statistics", subtitle: `As of ${formatDate(ctx.today)}`, orientation: "portrait", meta: [],
      sections: [
        { kind: "kv", title: "Headcount", items: [
          { label: "Current employees", value: String(employees.length) }, { label: "Capacity", value: String(ctx.settings.max_employees) },
          { label: "Departments", value: String(departments.length) },
        ] },
        { ...table("By department", countBy((e) => e.departments?.name ?? "Unassigned")), primary: true },
        table("By employment type", countBy((e) => EMPLOYMENT_TYPE_LABELS[e.employment_type])),
        table("By status", countBy((e) => EMPLOYMENT_STATUS_LABELS[e.status])),
        table("By tenure", countBy(tenure)),
      ],
      fileName: "employee-statistics",
    };
  },

  async attendance_history(ctx) {
    const { from, to } = period(ctx);
    const ids = ctx.p.employees?.length ? ctx.p.employees : ctx.p.employee ? [ctx.p.employee] : undefined;
    const status = ctx.p.status as AttendanceStatus | undefined;
    const [rows, departments, scope] = await Promise.all([
      fetchAttendance({ from, to, employeeIds: ids, departmentId: ctx.p.department, status, lateOnly: ctx.p.late === "1" }),
      getDepartments(), scopeEmployees(ctx),
    ]);
    const s = summarizeAttendance(rows, await scheduledWorkingDays(scope, from, to));
    return {
      title: "Attendance Report", subtitle: periodLabel(from, to), orientation: "landscape",
      meta: [
        ...deptMeta(ctx, departments),
        ...(ids ? [{ label: "Employees", value: ids.length === 1 ? scope[0]?.full_name ?? "1 selected" : `${ids.length} selected` }] : []),
        ...(status ? [{ label: "Status", value: ATTENDANCE_STATUS_LABELS[status] }] : []),
        ...(ctx.p.late === "1" ? [{ label: "Filter", value: "Late arrivals only" }] : []),
      ],
      sections: [summaryKV(s), attTable(rows)],
      fileName: `attendance-${from}-${to}`,
    };
  },
};

/* ------------------------------------------------------------------ entry point */

function applyColumnsAndSort(doc: Built, p: ReportParams) {
  const primary = doc.sections.find((s): s is TableSection => s.kind === "table" && !!s.primary);
  if (!primary) return;
  if (p.sort && primary.columns.some((c) => c.key === p.sort)) {
    const k = p.sort;
    const dir = p.dir === "desc" ? -1 : 1;
    primary.rows.sort((a, b) => {
      const x = a[k], y = b[k];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x ?? "").localeCompare(String(y ?? "")) * dir;
    });
  }
  if (p.cols?.length) {
    const keep = new Set(p.cols);
    const filtered = primary.columns.filter((c) => keep.has(c.key));
    if (filtered.length) primary.columns = filtered;
  }
}

export async function buildReport(p: ReportParams, user: SessionUser): Promise<ReportDocument> {
  const def = REPORT_MAP.get(p.type);
  const build = builders[p.type];
  if (!def || !build) throw new ReportError("Unknown report type.");
  if (!def.roles.includes(user.role)) throw new ReportError("You do not have permission to view this report.");
  for (const need of def.required ?? []) {
    if (need === "employee" && !p.employee && !p.item) throw new ReportError("Select an employee for this report.");
    if (need === "month" && !p.month && !p.item && !p.payroll) throw new ReportError("Select a month for this report.");
  }
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const doc = await build({ settings, today, user, p });
  applyColumnsAndSort(doc, p);
  const sections: ReportSection[] = doc.sections;
  return {
    ...doc,
    sections,
    orientation: p.orientation ?? doc.orientation,
    type: p.type,
    generatedAt: new Date().toISOString(),
    generatedBy: user.fullName,
    fileName: (doc.fileName ?? p.type).replace(/[^A-Za-z0-9._-]+/g, "-"),
    branding: brandingFrom(settings),
    sensitive: def.sensitive,
    timezone: settings.timezone,
  };
}
