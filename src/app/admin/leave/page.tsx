import type { Metadata } from "next";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/shared/link-tabs";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { LeaveBadge, ToneBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ExportButton } from "@/components/shared/export-button";
import { BalanceEditor, LeaveReviewButtons, LeaveTypeDialog, NewLeaveDialog } from "@/components/leave/leave-components";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees, getHolidays, getLeaveTypes, getSettings, toEmployeeOption } from "@/lib/data";
import { LEAVE_STATUS_LABELS, MONTH_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import { isMonth, pageParams, param } from "@/lib/params";
import { dayOfWeek, eachDay, formatDate, formatDateTime, monthRange, todayISO } from "@/lib/time";
import type { Employee, LeaveRequest, LeaveStatus, LeaveType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leave Management" };

type Balance = { employee_id: string; leave_type_id: string; allocated: number; used: number; pending: number; remaining: number };
type ReqRow = LeaveRequest & { employees: { full_name: string; employee_code: string } | null };

export default async function AdminLeavePage({ searchParams }: PageProps<"/admin/leave">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const tab = (["requests", "balances", "calendar", "policies"] as const).find((t) => t === param(sp, "tab")) ?? "requests";
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const year = Number(param(sp, "year") ?? today.slice(0, 4)) || Number(today.slice(0, 4));
  const supabase = await createClient();
  const [employees, types, { count: pendingCount }, { data: bal }] = await Promise.all([
    getActiveEmployees(),
    getLeaveTypes(),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.rpc("leave_balance_report", { p_year: Number(today.slice(0, 4)) }),
  ]);
  const balances: Record<string, Record<string, number>> = {};
  for (const b of (bal ?? []) as Balance[]) (balances[b.employee_id] ??= {})[b.leave_type_id] = Number(b.remaining);

  return (
    <>
      <PageHeader
        title="Leave Management"
        description="Applications, approvals, balances, calendar and leave policies."
        actions={
          <>
            <ExportButton type="leave_summary" params={{ year: String(year) }} label="Leave summary" />
            <NewLeaveDialog employees={employees.map((e) => toEmployeeOption(e, settings.weekly_off_days))} types={types} today={today} isAdmin balances={balances} />
          </>
        }
      />
      <LinkTabs
        tabs={[
          { key: "requests", label: "Requests", count: pendingCount ?? 0 },
          { key: "balances", label: "Leave balance" },
          { key: "calendar", label: "Leave calendar" },
          { key: "policies", label: "Leave policies" },
        ]}
        active={tab}
        baseHref="/admin/leave"
      />
      {tab === "requests" && <Requests sp={sp} employees={employees} types={types} />}
      {tab === "balances" && <Balances year={year} employees={employees} types={types} today={today} />}
      {tab === "calendar" && <Calendar sp={sp} today={today} employees={employees} types={types} weeklyOff={settings.weekly_off_days} />}
      {tab === "policies" && <Policies types={types} />}
    </>
  );
}

async function Requests({ sp, employees, types }: { sp: Record<string, string | string[] | undefined>; employees: Employee[]; types: LeaveType[] }) {
  const supabase = await createClient();
  const status = param(sp, "status") ?? "pending";
  const employee = param(sp, "employee");
  const type = param(sp, "type");
  const { page, pageSize, from, to } = pageParams(sp);
  let q = supabase.from("leave_requests").select("*, employees(full_name, employee_code)", { count: "exact" });
  if (status !== "all") q = q.eq("status", status);
  if (employee) q = q.eq("employee_id", employee);
  if (type) q = q.eq("leave_type_id", type);
  const { data, count } = await q.order("created_at", { ascending: false }).range(from, to);
  const rows = (data ?? []) as ReqRow[];
  const tmap = new Map(types.map((t) => [t.id, t]));
  return (
    <Card className="gap-0 py-0">
      <div className="border-b p-4">
        <FilterBar filters={[
          { type: "select", name: "status", label: "Status", allLabel: "Pending", options: [{ value: "all", label: "All" }, ...(["approved", "rejected", "cancelled"] as LeaveStatus[]).map((s) => ({ value: s, label: LEAVE_STATUS_LABELS[s] }))] },
          { type: "select", name: "employee", label: "Employee", options: employees.map((e) => ({ value: e.id, label: e.full_name })) },
          { type: "select", name: "type", label: "Leave type", options: types.map((t) => ({ value: t.id, label: t.name })) },
        ]} />
      </div>
      {rows.length === 0 ? <EmptyState title={status === "pending" ? "No pending leave requests" : "No leave requests"} /> : (
        <div className="overflow-x-auto">
          <Table className="text-[13px]">
            <TableHeader><TableRow>
              <TableHead className="pl-4">Employee</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
              <TableHead className="text-right">Days</TableHead><TableHead>Reason</TableHead><TableHead>Applied</TableHead><TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const t = tmap.get(r.leave_type_id);
                return (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="pl-4"><span className="block font-medium">{r.employees?.full_name}</span><span className="tabular text-xs text-muted-foreground">{r.employees?.employee_code}</span></TableCell>
                    <TableCell><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: t?.color }} />{t?.name}</span>{t && !t.is_paid && <span className="block text-xs text-muted-foreground">Unpaid</span>}</TableCell>
                    <TableCell className="tabular">{formatDate(r.start_date)}</TableCell>
                    <TableCell className="tabular">{formatDate(r.end_date)}</TableCell>
                    <TableCell className="tabular text-right">{Number(r.days)}{r.is_half_day ? " (½)" : ""}</TableCell>
                    <TableCell className="max-w-56 whitespace-normal text-muted-foreground">{r.reason ?? "—"}{r.review_note && <span className="block text-xs">Review: {r.review_note}</span>}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell><LeaveBadge status={r.status} /></TableCell>
                    <TableCell className="pr-4"><LeaveReviewButtons id={r.id} canReview={r.status === "pending"} canCancel={r.status === "pending" || r.status === "approved"} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={count ?? 0} />
    </Card>
  );
}

async function Balances({ year, employees, types, today }: { year: number; employees: Employee[]; types: LeaveType[]; today: string }) {
  const supabase = await createClient();
  const [{ data }, { data: stored }] = await Promise.all([
    supabase.rpc("leave_balance_report", { p_year: year }),
    supabase.from("leave_balances").select("*").eq("year", year),
  ]);
  const rows = (data ?? []) as Balance[];
  const storedMap = new Map(((stored ?? []) as { employee_id: string; leave_type_id: string; allocated: number; carried: number }[]).map((s) => [`${s.employee_id}:${s.leave_type_id}`, s]));
  const active = types.filter((t) => t.is_active);
  const thisYear = Number(today.slice(0, 4));
  return (
    <Card className="gap-0 py-0">
      <div className="border-b p-4">
        <FilterBar filters={[{ type: "select", name: "year", label: "Year", allLabel: String(thisYear), options: [thisYear - 1, thisYear + 1].map((y) => ({ value: String(y), label: String(y) })) }]} />
        <p className="mt-2 text-xs text-muted-foreground">Remaining = allocated (policy default unless overridden) + carried forward − approved. Use the pencil to override an employee&apos;s allocation.</p>
      </div>
      <div className="overflow-x-auto">
        <Table className="text-[13px]">
          <TableHeader><TableRow>
            <TableHead className="pl-4">Employee</TableHead>
            {active.map((t) => <TableHead key={t.id} className="text-right">{t.name}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {employees.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="pl-4"><span className="block font-medium">{e.full_name}</span><span className="tabular text-xs text-muted-foreground">{e.employee_code}</span></TableCell>
                {active.map((t) => {
                  const b = rows.find((r) => r.employee_id === e.id && r.leave_type_id === t.id);
                  const s = storedMap.get(`${e.id}:${t.id}`);
                  return (
                    <TableCell key={t.id} className="tabular text-right">
                      <span className="inline-flex items-center gap-1">
                        {t.is_paid ? (
                          <span><span className="font-semibold">{Number(b?.remaining ?? 0)}</span><span className="text-muted-foreground"> / {Number(b?.allocated ?? 0)}</span></span>
                        ) : (
                          <span>{Number(b?.used ?? 0)} used</span>
                        )}
                        {Number(b?.pending ?? 0) > 0 && <ToneBadge tone="warning">{Number(b?.pending)} pending</ToneBadge>}
                        {t.is_paid && <BalanceEditor employeeId={e.id} typeId={t.id} year={year} allocated={Number(s?.allocated ?? t.days_per_year)} carried={Number(s?.carried ?? 0)} />}
                      </span>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

async function Calendar({ sp, today, employees, types, weeklyOff }: { sp: Record<string, string | string[] | undefined>; today: string; employees: Employee[]; types: LeaveType[]; weeklyOff: number[] }) {
  const month = isMonth(param(sp, "month")) ? param(sp, "month")! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const { from, to } = monthRange(y, m);
  const supabase = await createClient();
  const [{ data }, holidays] = await Promise.all([
    supabase.from("leave_requests").select("*").in("status", ["approved", "pending"]).lte("start_date", to).gte("end_date", from),
    getHolidays(from, to),
  ]);
  const reqs = (data ?? []) as LeaveRequest[];
  const tmap = new Map(types.map((t) => [t.id, t]));
  const emap = new Map(employees.map((e) => [e.id, e]));
  const hmap = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const days = eachDay(from, to);
  const lead = dayOfWeek(from);
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>{MONTH_LABELS[m - 1]} {y}</CardTitle>
        <CardAction><FilterBar filters={[{ type: "month", name: "month", label: "Month" }]} /></CardAction>
      </CardHeader>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7">
          {WEEKDAY_LABELS.map((d) => <div key={d} className="border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">{d.slice(0, 3)}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} className="border-r border-b bg-muted/30" />)}
          {days.map((d) => {
            const off = weeklyOff.includes(dayOfWeek(d));
            const items = reqs.filter((r) => r.start_date <= d && r.end_date >= d);
            return (
              <div key={d} className={cn("min-h-24 border-r border-b p-1.5", (off || hmap.has(d)) && "bg-muted/40", d === today && "ring-2 ring-brand ring-inset")}>
                <p className="flex justify-between text-xs"><span className="tabular font-medium">{Number(d.slice(8))}</span>{hmap.get(d) && <span className="truncate pl-1 text-[10px] text-muted-foreground">{hmap.get(d)}</span>}</p>
                <ul className="mt-1 grid gap-0.5">
                  {items.map((r) => (
                    <li key={r.id} className={cn("truncate rounded px-1 py-0.5 text-[11px] text-white", r.status === "pending" && "opacity-60")} style={{ background: tmap.get(r.leave_type_id)?.color }} title={`${emap.get(r.employee_id)?.full_name} — ${tmap.get(r.leave_type_id)?.name}${r.status === "pending" ? " (pending)" : ""}`}>
                      {emap.get(r.employee_id)?.full_name ?? "Employee"}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-muted-foreground">
        {types.filter((t) => t.is_active).map((t) => <span key={t.id} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: t.color }} />{t.name}</span>)}
        <span>Faded = pending approval · Grey = weekly off / holiday</span>
      </div>
    </Card>
  );
}

function Policies({ types }: { types: LeaveType[] }) {
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Leave policies</CardTitle>
        <CardAction><LeaveTypeDialog /></CardAction>
      </CardHeader>
      <Table className="text-[13px]">
        <TableHeader><TableRow>
          <TableHead className="pl-4">Leave type</TableHead><TableHead>Code</TableHead><TableHead className="text-right">Days / year</TableHead>
          <TableHead>Paid</TableHead><TableHead>Half day</TableHead><TableHead>Carry forward</TableHead><TableHead>Status</TableHead><TableHead className="pr-4" />
        </TableRow></TableHeader>
        <TableBody>
          {types.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="pl-4 font-medium"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: t.color }} />{t.name}</span></TableCell>
              <TableCell>{t.code}</TableCell>
              <TableCell className="tabular text-right">{t.days_per_year}</TableCell>
              <TableCell>{t.is_paid ? "Paid" : "Unpaid"}</TableCell>
              <TableCell>{t.allow_half_day ? "Allowed" : "No"}</TableCell>
              <TableCell>{t.carry_forward ? `Up to ${t.max_carry_days} days` : "No"}</TableCell>
              <TableCell>{t.is_active ? <ToneBadge tone="success">Active</ToneBadge> : <ToneBadge tone="neutral">Inactive</ToneBadge>}</TableCell>
              <TableCell className="pr-4 text-right"><LeaveTypeDialog type={t} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
