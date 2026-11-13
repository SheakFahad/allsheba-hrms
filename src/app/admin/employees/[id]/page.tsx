import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/shared/link-tabs";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { EmploymentBadge, LeaveBadge, ToneBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filters";
import { ExportButton } from "@/components/shared/export-button";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { AttendanceSummaryCards } from "@/components/attendance/attendance-summary";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_SELECT, getLeaveTypes, getSettings } from "@/lib/data";
import { attendanceAnalytics, fetchAttendance } from "@/lib/attendance-data";
import { EMPLOYMENT_TYPE_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import { formatBytes, formatMoney, publicStorageUrl } from "@/lib/format";
import { formatDate, formatDateTime, formatMonth, formatTime12, monthRange, todayISO } from "@/lib/time";
import { isMonth, param } from "@/lib/params";
import type {
  AuditLog, Employee, EmployeeDocument, EmployeeEvent, EmployeePersonal, LeaveRequest, PayrollItem, SalaryStructure,
} from "@/lib/types";
import { ArchiveControls, DocumentActions, DocumentUpload, SalaryDialog } from "./profile-actions";

export const metadata: Metadata = { title: "Employee profile" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "personal", label: "Personal Information" },
  { key: "attendance", label: "Attendance History" },
  { key: "leave", label: "Leave History" },
  { key: "salary", label: "Salary History" },
  { key: "documents", label: "Documents" },
  { key: "activity", label: "Activity History" },
];

function KV({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 text-sm font-medium break-words">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const EVENT_LABELS: Record<string, string> = {
  designation: "Designation changed", department: "Department changed", status: "Status changed",
  joining_date: "Joining date changed", employment_type: "Employment type changed", salary: "Salary changed",
  archived: "Archived", restored: "Restored",
};

export default async function EmployeeProfilePage({ params, searchParams }: PageProps<"/admin/employees/[id]">) {
  await requirePageRole("admin");
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === param(sp, "tab")) ? param(sp, "tab")! : "overview";
  const supabase = await createClient();
  const settings = await getSettings();
  const today = todayISO(settings.timezone);

  const { data: emp } = await supabase.from("employees").select(EMPLOYEE_SELECT).eq("id", id).maybeSingle<Employee>();
  if (!emp) notFound();
  const { data: salaries } = await supabase
    .from("salary_structures").select("*").eq("employee_id", id).order("effective_from", { ascending: false });
  const salaryHistory = (salaries ?? []) as SalaryStructure[];
  const current = salaryHistory.find((s) => s.effective_from <= today) ?? salaryHistory[salaryHistory.length - 1];

  const month = isMonth(param(sp, "month")) ? param(sp, "month")! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const range = monthRange(y, m);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/employees", label: "Employees" }}
        title={
          <span className="flex items-center gap-3">
            <EmployeeAvatar name={emp.full_name} photoUrl={publicStorageUrl(emp.photo_path)} className="size-12 text-base" />
            <span className="min-w-0">
              <span className="block truncate">{emp.full_name}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-normal text-muted-foreground">
                <span className="tabular font-medium text-foreground">{emp.employee_code}</span>
                {emp.designations?.name && <span>· {emp.designations.name}</span>}
                {emp.departments?.name && <span>· {emp.departments.name}</span>}
                <EmploymentBadge status={emp.status} archived={!!emp.archived_at} />
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <ExportButton type="employee_profile" params={{ employee: id }} label="Profile report" />
            <ArchiveControls id={id} archived={!!emp.archived_at} name={emp.full_name} />
            <Button asChild><Link href={`/admin/employees/${id}/edit`}><Pencil /> Edit</Link></Button>
          </>
        }
      />
      {emp.archived_at && (
        <div className="mb-5 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          Archived on {formatDateTime(emp.archived_at)}{emp.archived_reason ? ` — ${emp.archived_reason}` : ""}.
        </div>
      )}
      <LinkTabs tabs={TABS} active={tab} baseHref={`/admin/employees/${id}`} />

      {tab === "overview" && <Overview emp={emp} current={current} id={id} range={range} today={today} />}

      {tab === "personal" && <Personal id={id} emp={emp} />}

      {tab === "attendance" && (
        <AttendanceTab id={id} emp={emp} range={range} month={month} label={formatMonth(y, m)} />
      )}

      {tab === "leave" && <LeaveTab id={id} year={Number(today.slice(0, 4))} />}

      {tab === "salary" && (
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Current salary</CardTitle>
              <CardAction>
                <SalaryDialog employeeId={id} today={today} current={current ? { basic: Number(current.basic_salary), allowances: Number(current.allowances) } : undefined} />
              </CardAction>
            </CardHeader>
            <CardContent>
              {current ? (
                <KV items={[
                  ["Basic salary", formatMoney(current.basic_salary)],
                  ["Allowances", formatMoney(current.allowances)],
                  ["Gross monthly", formatMoney(Number(current.basic_salary) + Number(current.allowances))],
                  ["Effective from", formatDate(current.effective_from)],
                ]} />
              ) : (
                <p className="text-sm text-muted-foreground">No salary has been set. This employee is excluded from payroll until a salary is added.</p>
              )}
            </CardContent>
          </Card>
          <Card className="gap-0 pb-0">
            <CardHeader className="border-b pb-4"><CardTitle>Salary history</CardTitle></CardHeader>
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-4">Effective from</TableHead><TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Allowances</TableHead><TableHead className="text-right">Gross</TableHead>
                <TableHead className="pr-4">Note</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {salaryHistory.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular pl-4">{formatDate(s.effective_from)}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(s.basic_salary)}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(s.allowances)}</TableCell>
                    <TableCell className="tabular text-right font-medium">{formatMoney(Number(s.basic_salary) + Number(s.allowances))}</TableCell>
                    <TableCell className="pr-4 text-muted-foreground">{s.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {salaryHistory.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No salary records.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
          <PayslipHistory id={id} />
        </div>
      )}

      {tab === "documents" && <Documents id={id} />}

      {tab === "activity" && <Activity id={id} />}
    </>
  );
}

async function Overview({ emp, current, id, range, today }: {
  emp: Employee; current?: SalaryStructure; id: string; range: { from: string; to: string }; today: string;
}) {
  const rows = await fetchAttendance({ ...range, employeeIds: [id] });
  const summary = await attendanceAnalytics(rows, [emp], range.from, range.to);
  const recent = rows.slice(0, 7);
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
        <CardContent>
          <KV items={[
            ["Employee ID", emp.employee_code],
            ["Department", emp.departments?.name],
            ["Designation", emp.designations?.name],
            ["Joining date", formatDate(emp.joining_date)],
            ["Employment type", EMPLOYMENT_TYPE_LABELS[emp.employment_type]],
            ["Phone", emp.phone],
            ["Shift", emp.shifts ? `${emp.shifts.name} (${formatTime12(emp.shifts.start_time)} – ${formatTime12(emp.shifts.end_time)})` : "Default shift"],
            ["Weekly holiday", emp.weekly_off_days ? (emp.weekly_off_days.length ? emp.weekly_off_days.map((d) => WEEKDAY_LABELS[d]).join(", ") : "None (works 7 days)") : "Company default"],
            ["Gross salary", current ? formatMoney(Number(current.basic_salary) + Number(current.allowances)) : "Not set"],
          ]} />
        </CardContent>
      </Card>
      <div>
        <h2 className="mb-3 text-sm font-semibold">This month ({formatDate(range.from)} – {formatDate(range.to < today ? range.to : today)})</h2>
        <AttendanceSummaryCards summary={summary} />
      </div>
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Recent attendance</CardTitle>
          <CardAction><Button variant="outline" size="sm" asChild><Link href={`/admin/employees/${id}?tab=attendance`}>View all</Link></Button></CardAction>
        </CardHeader>
        <AttendanceTable rows={recent} showEmployee={false} emptyTitle="No attendance recorded this month" />
      </Card>
    </div>
  );
}

async function Personal({ id, emp }: { id: string; emp: Employee }) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("employee_personal").select("*").eq("employee_id", id).maybeSingle<EmployeePersonal>();
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
        <CardContent>
          <KV items={[
            ["Full name", emp.full_name], ["Phone", emp.phone], ["Email", p?.email],
            ["Date of birth", p?.date_of_birth ? formatDate(p.date_of_birth) : null], ["National ID", p?.national_id],
            ["Address", p?.address],
          ]} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Emergency contact</CardTitle></CardHeader>
        <CardContent>
          <KV items={[["Name", p?.emergency_contact_name], ["Phone", p?.emergency_contact_phone], ["Relationship", p?.emergency_contact_relation]]} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent><p className="text-sm whitespace-pre-wrap">{p?.notes || "No notes."}</p></CardContent>
      </Card>
    </div>
  );
}

async function AttendanceTab({ id, emp, range, month, label }: {
  id: string; emp: Employee; range: { from: string; to: string }; month: string; label: string;
}) {
  const rows = await fetchAttendance({ ...range, employeeIds: [id] });
  const summary = await attendanceAnalytics(rows, [emp], range.from, range.to);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar filters={[{ type: "month", name: "month", label: "Month" }]} />
        <ExportButton type="employee_attendance" params={{ employee: id, month }} />
      </div>
      <AttendanceSummaryCards summary={summary} />
      <Card className="gap-0 py-0">
        <AttendanceTable rows={rows} showEmployee={false} emptyTitle={`No attendance in ${label}`} />
      </Card>
    </div>
  );
}

async function LeaveTab({ id, year }: { id: string; year: number }) {
  const supabase = await createClient();
  const [{ data: reqs }, { data: balances }, types] = await Promise.all([
    supabase.from("leave_requests").select("*").eq("employee_id", id).order("start_date", { ascending: false }),
    supabase.rpc("leave_balance_report", { p_year: year }),
    getLeaveTypes(),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t]));
  const mine = ((balances ?? []) as { employee_id: string; leave_type_id: string; allocated: number; used: number; pending: number; remaining: number }[])
    .filter((b) => b.employee_id === id);
  const requests = (reqs ?? []) as LeaveRequest[];
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {mine.map((b) => {
          const t = typeName.get(b.leave_type_id);
          return (
            <div key={b.leave_type_id} className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: t?.color }} />{t?.name}
              </p>
              <p className="tabular mt-1 text-2xl font-semibold">{t?.is_paid ? Number(b.remaining) : Number(b.used)}</p>
              <p className="text-xs text-muted-foreground">
                {t?.is_paid ? `remaining of ${Number(b.allocated)} · ${Number(b.used)} used` : "days taken (unpaid)"}
                {Number(b.pending) > 0 && ` · ${Number(b.pending)} pending`}
              </p>
            </div>
          );
        })}
      </div>
      <Card className="gap-0 py-0">
        {requests.length === 0 ? <EmptyState title="No leave requests" /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-4">Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
              <TableHead className="text-right">Days</TableHead><TableHead>Reason</TableHead><TableHead className="pr-4">Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-medium">{typeName.get(r.leave_type_id)?.name}</TableCell>
                  <TableCell className="tabular">{formatDate(r.start_date)}</TableCell>
                  <TableCell className="tabular">{formatDate(r.end_date)}</TableCell>
                  <TableCell className="tabular text-right">{Number(r.days)}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">{r.reason ?? "—"}</TableCell>
                  <TableCell className="pr-4"><LeaveBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

async function PayslipHistory({ id }: { id: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payroll_items")
    .select("*, payroll_records!inner(period_year, period_month, status)")
    .eq("employee_id", id)
    .order("created_at", { ascending: false })
    .limit(24);
  const items = (data ?? []) as (PayrollItem & { payroll_records: { period_year: number; period_month: number; status: string } })[];
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b pb-4"><CardTitle>Payroll & payslips</CardTitle></CardHeader>
      {items.length === 0 ? <EmptyState icon={FileText} title="No payroll yet" /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead className="pl-4">Period</TableHead><TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Deductions</TableHead><TableHead className="text-right">Net</TableHead>
            <TableHead>Status</TableHead><TableHead className="pr-4 text-right">Payslip</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="pl-4 font-medium">{formatMonth(i.payroll_records.period_year, i.payroll_records.period_month)}</TableCell>
                <TableCell className="tabular text-right">{formatMoney(i.gross_earnings)}</TableCell>
                <TableCell className="tabular text-right">{formatMoney(i.total_deductions)}</TableCell>
                <TableCell className="tabular text-right font-semibold">{formatMoney(i.net_salary)}</TableCell>
                <TableCell><ToneBadge tone={i.payroll_records.status === "finalized" ? "success" : "warning"}>{i.payroll_records.status === "finalized" ? "Finalized" : "Draft"}</ToneBadge></TableCell>
                <TableCell className="pr-4 text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/reports/view?type=payslip&item=${i.id}`}><Printer /> Payslip</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

async function Documents({ id }: { id: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("employee_documents").select("*").eq("employee_id", id).order("created_at", { ascending: false });
  const docs = (data ?? []) as EmployeeDocument[];
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Documents</CardTitle>
        <CardAction><DocumentUpload employeeId={id} /></CardAction>
      </CardHeader>
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description="Upload contracts, ID copies, certificates and other HR documents." />
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead className="pl-4">Title</TableHead><TableHead>Category</TableHead><TableHead>File</TableHead>
            <TableHead className="text-right">Size</TableHead><TableHead>Uploaded</TableHead><TableHead className="pr-4" />
          </TableRow></TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="pl-4 font-medium">{d.title}</TableCell>
                <TableCell className="capitalize">{d.category}</TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">{d.file_name}</TableCell>
                <TableCell className="tabular text-right">{formatBytes(d.file_size)}</TableCell>
                <TableCell className="tabular">{formatDateTime(d.created_at)}</TableCell>
                <TableCell className="pr-4"><DocumentActions id={d.id} title={d.title} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

async function Activity({ id }: { id: string }) {
  const supabase = await createClient();
  const [{ data: events }, { data: logs }] = await Promise.all([
    supabase.from("employee_events").select("*").eq("employee_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("audit_logs").select("*").in("entity", ["employees", "employee_personal"]).eq("entity_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  const timeline = [
    ...((events ?? []) as EmployeeEvent[]).map((e) => ({
      at: e.created_at,
      title: EVENT_LABELS[e.event_type] ?? e.event_type,
      detail: e.event_type === "archived" || e.event_type === "restored"
        ? e.new_value ?? ""
        : `${e.old_value ?? "—"} → ${e.new_value ?? "—"}`,
      by: null as string | null,
    })),
    ...((logs ?? []) as AuditLog[]).map((l) => ({
      at: l.created_at,
      title: l.action === "insert" ? "Record created" : l.action === "update" ? `${l.entity === "employee_personal" ? "Personal details" : "Profile"} updated` : l.action,
      detail: l.action === "update" ? Object.keys((l.details?.changes as object) ?? {}).join(", ").replaceAll("_", " ") : "",
      by: l.actor_name,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card>
      <CardHeader><CardTitle>Activity history</CardTitle></CardHeader>
      <CardContent>
        {timeline.length === 0 ? <EmptyState title="No activity yet" /> : (
          <ol className="relative grid gap-5 border-l pl-5">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-brand" />
                <p className="text-sm font-medium">{t.title}</p>
                {t.detail && <p className="text-sm text-muted-foreground">{t.detail}</p>}
                <p className="text-xs text-muted-foreground">{formatDateTime(t.at)}{t.by ? ` · by ${t.by}` : ""}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
