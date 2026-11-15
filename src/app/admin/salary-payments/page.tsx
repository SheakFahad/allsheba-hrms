import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/shared/link-tabs";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { ToneBadge } from "@/components/shared/status-badge";
import { ExportButton } from "@/components/shared/export-button";
import { SalaryPaymentActions, SalaryPaymentDialog } from "@/components/finance/salary-payment-controls";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees, getSettings, toEmployeeOption } from "@/lib/data";
import {
  FINANCE_STATUS_LABELS, SALARY_METHOD_LABELS, SALARY_MONTH_STATUS_LABELS, type SalaryMonthStatus, type SalaryPayment,
} from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { isMonth, pageParams, param } from "@/lib/params";
import { formatDate, formatMonth, todayISO } from "@/lib/time";
import type { Tone } from "@/lib/constants";

export const metadata: Metadata = { title: "Salary Payments" };

const PAY_TONE: Record<string, Tone> = { pending: "warning", confirmed: "success", cancelled: "neutral" };
const MONTH_TONE: Record<SalaryMonthStatus, Tone> = { pending: "danger", partially_paid: "warning", paid: "success" };

interface MonthRow {
  employee_id: string; employee_code: string; employee_name: string; designation: string | null;
  configured_salary: number; paid: number; pending: number; remaining: number; status: SalaryMonthStatus;
}

export default async function SalaryPaymentsPage({ searchParams }: PageProps<"/admin/salary-payments">) {
  const user = await requirePageRole("admin");
  const [sp, settings, employees] = await Promise.all([searchParams, getSettings(), getActiveEmployees()]);
  const today = todayISO(settings.timezone);
  const month = isMonth(param(sp, "month")) ? param(sp, "month")! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const tab = param(sp, "tab") === "payments" ? "payments" : "status";
  const supabase = await createClient();
  const { data: st } = await supabase.rpc("salary_payment_status", { p_month: `${month}-01` });
  const statusRows = ((st ?? []) as MonthRow[]).map((r) => ({
    ...r, configured_salary: Number(r.configured_salary), paid: Number(r.paid), pending: Number(r.pending), remaining: Number(r.remaining),
  }));
  const totals = statusRows.reduce(
    (a, r) => ({ salary: a.salary + r.configured_salary, paid: a.paid + r.paid, pending: a.pending + r.pending, remaining: a.remaining + r.remaining }),
    { salary: 0, paid: 0, pending: 0, remaining: 0 },
  );
  const options = employees.map((e) => toEmployeeOption(e, settings.weekly_off_days));
  const dialogProps = { employees: options, today, preparedBy: user.fullName, defaultMonth: month };

  return (
    <>
      <PageHeader
        title="Salary Payments"
        description={`Actual salary payments for ${formatMonth(y, m)}. Separate from payroll and salary configuration; only confirmed payments count as paid.`}
        actions={
          <>
            <ExportButton type="salary_payments" params={{ month }} label="Payment report" />
            <SalaryPaymentDialog {...dialogProps} />
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Configured salary" value={formatMoney(totals.salary)} tone="info" hint={`${statusRows.length} employee(s)`} />
        <StatCard label="Paid (confirmed)" value={formatMoney(totals.paid)} tone="success" />
        <StatCard label="Recorded, unconfirmed" value={formatMoney(totals.pending)} tone="warning" />
        <StatCard label="Salary pending" value={formatMoney(totals.remaining)} tone="danger" hint="Configured − confirmed paid" />
      </div>
      <Card className="mb-5 p-4"><FilterBar filters={[{ type: "month", name: "month", label: "Salary month" }]} /></Card>
      <LinkTabs tabs={[{ key: "status", label: "Employee-wise status" }, { key: "payments", label: "Payment records" }]} active={tab} baseHref="/admin/salary-payments" keep={{ month: param(sp, "month") }} />

      {tab === "status" ? (
        <Card className="gap-0 py-0">
          {statusRows.length === 0 ? <EmptyState icon={Banknote} title="No employees for this month" /> : (
            <div className="overflow-x-auto">
              <Table className="text-[13px]">
                <TableHeader><TableRow>
                  <TableHead className="pl-4">Employee</TableHead><TableHead className="text-right">Configured</TableHead><TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Unconfirmed</TableHead><TableHead className="text-right">Pending</TableHead><TableHead>Status</TableHead><TableHead className="pr-4" />
                </TableRow></TableHeader>
                <TableBody>
                  {statusRows.map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell className="pl-4"><span className="block font-medium">{r.employee_name}</span><span className="tabular text-xs text-muted-foreground">{r.employee_code}{r.designation ? ` · ${r.designation}` : ""}</span></TableCell>
                      <TableCell className="tabular text-right">{formatMoney(r.configured_salary)}</TableCell>
                      <TableCell className="tabular text-right font-medium text-success">{formatMoney(r.paid)}</TableCell>
                      <TableCell className="tabular text-right text-warning">{r.pending ? formatMoney(r.pending) : "—"}</TableCell>
                      <TableCell className="tabular text-right font-semibold">{formatMoney(r.remaining)}</TableCell>
                      <TableCell><ToneBadge tone={MONTH_TONE[r.status]}>{SALARY_MONTH_STATUS_LABELS[r.status]}</ToneBadge></TableCell>
                      <TableCell className="pr-4 text-right">
                        {r.status !== "paid" && r.configured_salary > 0 && (
                          <SalaryPaymentDialog {...dialogProps} presetEmployee={r.employee_id} trigger={<Button variant="outline" size="sm">Pay</Button>} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter><TableRow>
                  <TableCell className="pl-4 font-semibold">Total</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(totals.salary)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(totals.paid)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(totals.pending)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(totals.remaining)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow></TableFooter>
              </Table>
            </div>
          )}
        </Card>
      ) : (
        <Payments month={month} sp={sp} employees={employees.map((e) => ({ id: e.id, name: e.full_name }))} />
      )}
    </>
  );
}

async function Payments({ month, sp, employees }: { month: string; sp: Record<string, string | string[] | undefined>; employees: { id: string; name: string }[] }) {
  const { page, pageSize, from, to } = pageParams(sp);
  const employee = param(sp, "employee");
  const status = param(sp, "status");
  const method = param(sp, "method");
  const supabase = await createClient();
  let q = supabase.from("salary_payments").select("*", { count: "exact" }).eq("salary_month", `${month}-01`);
  if (employee) q = q.eq("employee_id", employee);
  if (status && ["pending", "confirmed", "cancelled"].includes(status)) q = q.eq("status", status);
  if (method) q = q.eq("payment_method", method);
  const { data, count } = await q.order("created_at", { ascending: false }).range(from, to);
  const rows = (data ?? []) as SalaryPayment[];
  return (
    <Card className="gap-0 py-0">
      <div className="border-b p-4">
        <FilterBar filters={[
          { type: "select", name: "employee", label: "Employee", options: employees.map((e) => ({ value: e.id, label: e.name })) },
          { type: "select", name: "status", label: "Status", options: Object.entries(FINANCE_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
          { type: "select", name: "method", label: "Payment", options: Object.entries(SALARY_METHOD_LABELS).map(([value, label]) => ({ value, label })) },
        ]} />
      </div>
      {rows.length === 0 ? <EmptyState icon={Banknote} title="No salary payments recorded for this month" /> : (
        <div className="overflow-x-auto">
          <Table className="text-[13px]">
            <TableHeader><TableRow>
              <TableHead className="pl-4">Voucher</TableHead><TableHead>Employee</TableHead><TableHead>Payment date</TableHead><TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className="align-top">
                  <TableCell className="tabular pl-4 font-medium">{p.voucher_no}</TableCell>
                  <TableCell><span className="block font-medium">{p.employee_name}</span><span className="tabular text-xs text-muted-foreground">{p.employee_code}</span></TableCell>
                  <TableCell className="tabular">{formatDate(p.payment_date)}</TableCell>
                  <TableCell>{SALARY_METHOD_LABELS[p.payment_method]}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(p.amount)}{p.over_salary_reason && <span className="block text-xs font-normal text-muted-foreground" title={p.over_salary_reason}>above salary</span>}</TableCell>
                  <TableCell><ToneBadge tone={PAY_TONE[p.status]}>{FINANCE_STATUS_LABELS[p.status]}</ToneBadge>{p.cancel_reason && <span className="mt-0.5 block max-w-40 truncate text-xs text-muted-foreground">{p.cancel_reason}</span>}</TableCell>
                  <TableCell className="pr-4"><SalaryPaymentActions payment={p} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={count ?? 0} />
    </Card>
  );
}
