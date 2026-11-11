import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ToneBadge } from "@/components/shared/status-badge";
import { ExportButton } from "@/components/shared/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAYROLL_BASIS_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { formatDateTime, formatDuration, formatMonth } from "@/lib/time";
import type { PayrollItem, PayrollRecord } from "@/lib/types";
import { DeleteDraftButton, EditItemDialog, FinalizeButton, RegenerateButton } from "../payroll-controls";

export const metadata: Metadata = { title: "Payroll details" };

export default async function PayrollDetailPage({ params }: PageProps<"/admin/payroll/[id]">) {
  await requirePageRole("admin");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: rec }, { data: items }, { data: profiles }] = await Promise.all([
    supabase.from("payroll_records").select("*").eq("id", id).maybeSingle<PayrollRecord>(),
    supabase.from("payroll_items").select("*").eq("payroll_id", id).order("employee_code"),
    supabase.from("profiles").select("id, username"),
  ]);
  if (!rec) notFound();
  const list = (items ?? []) as PayrollItem[];
  const users = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
  const draft = rec.status === "draft";
  const month = `${rec.period_year}-${String(rec.period_month).padStart(2, "0")}`;
  const snap = rec.settings_snapshot as Record<string, unknown>;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/payroll", label: "Payroll" }}
        title={<span className="flex items-center gap-3">{formatMonth(rec.period_year, rec.period_month)} {draft ? <ToneBadge tone="warning">Draft</ToneBadge> : <ToneBadge tone="success">Finalized</ToneBadge>}</span>}
        description={
          draft
            ? `Generated ${formatDateTime(rec.generated_at)}. Review and adjust, then finalize.`
            : `Finalized ${formatDateTime(rec.finalized_at)}${rec.finalized_by ? ` by ${users.get(rec.finalized_by) ?? "admin"}` : ""}. Values are frozen.`
        }
        actions={
          <>
            <ExportButton type="payroll_summary" params={{ payroll: id }} label="Payroll sheet" />
            {draft && <DeleteDraftButton id={id} />}
            {draft && <RegenerateButton month={month} />}
            {draft && list.length > 0 && <FinalizeButton id={id} count={list.length} net={formatMoney(rec.total_net)} />}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Employees" value={rec.employee_count} tone="info" />
        <StatCard label="Gross" value={formatMoney(rec.total_gross)} tone="brand" />
        <StatCard label="Deductions" value={formatMoney(rec.total_deductions)} tone="danger" />
        <StatCard label="Net pay" value={formatMoney(rec.total_net)} tone="success" icon={Wallet} />
        <StatCard
          label="Day basis"
          value={<span className="text-base">{Number(rec.basis_days)} days</span>}
          hint={`${PAYROLL_BASIS_LABELS[(snap.payroll_day_basis as keyof typeof PAYROLL_BASIS_LABELS) ?? "fixed_30"]} · ${rec.working_days} working days`}
          tone="neutral"
        />
      </div>
      <Card className="gap-0 py-0">
        {list.length === 0 ? (
          <EmptyState title="No employees in this payroll" description="Only employees with a salary set on or before the month end are included." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-[13px]">
              <TableHeader><TableRow>
                <TableHead className="pl-4">Employee</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">OT / Bonus</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {list.map((i) => (
                  <TableRow key={i.id} className="align-top">
                    <TableCell className="pl-4">
                      <Link href={`/admin/employees/${i.employee_id}?tab=salary`} className="font-medium hover:underline">{i.employee_name}</Link>
                      <span className="tabular block text-xs text-muted-foreground">{i.employee_code}{i.designation_name ? ` · ${i.designation_name}` : ""}</span>
                    </TableCell>
                    <TableCell className="tabular text-right text-xs">
                      <span className="block">{Number(i.present_days)}/{i.working_days} present</span>
                      <span className="block text-muted-foreground">{i.late_days} late · {i.absent_days} absent{Number(i.unpaid_leave_days) ? ` · ${Number(i.unpaid_leave_days)} unpaid` : ""}</span>
                    </TableCell>
                    <TableCell className="tabular text-right">{formatMoney(i.basic_salary)}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(i.allowances)}</TableCell>
                    <TableCell className="tabular text-right">
                      {formatMoney(Number(i.overtime_amount) + Number(i.bonus) + Number(i.other_earnings))}
                      {i.overtime_minutes > 0 && <span className="block text-xs text-muted-foreground">OT {formatDuration(i.overtime_minutes)}</span>}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatMoney(i.gross_earnings)}</TableCell>
                    <TableCell className="tabular text-right text-danger">
                      {formatMoney(i.total_deductions)}
                      {i.adjustment_note && <span className="block max-w-40 truncate text-xs text-muted-foreground" title={i.adjustment_note}>{i.adjustment_note}</span>}
                    </TableCell>
                    <TableCell className="tabular text-right font-semibold">{formatMoney(i.net_salary)}</TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-1">
                        {draft && <EditItemDialog item={i} />}
                        <Button variant="ghost" size="sm" asChild><Link href={`/admin/reports/view?type=payslip&item=${i.id}`}><Printer /> Payslip</Link></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4 font-semibold" colSpan={5}>Total</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(rec.total_gross)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(rec.total_deductions)}</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(rec.total_net)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
