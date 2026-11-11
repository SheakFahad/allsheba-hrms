import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ToneBadge } from "@/components/shared/status-badge";
import { ExportButton } from "@/components/shared/export-button";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { PAYROLL_BASIS_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { formatDateTime, formatMonth, todayISO } from "@/lib/time";
import type { PayrollRecord } from "@/lib/types";
import { GeneratePayrollForm } from "./payroll-controls";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage() {
  await requirePageRole("admin");
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const supabase = await createClient();
  const { data } = await supabase.from("payroll_records").select("*").order("period_year", { ascending: false }).order("period_month", { ascending: false });
  const records = (data ?? []) as PayrollRecord[];
  const rules = [
    settings.absent_deduction_enabled && "absence",
    settings.unpaid_leave_deduction_enabled && "unpaid leave",
    settings.half_day_deduction_enabled && "half days",
    settings.late_deduction_enabled && `late (${settings.late_days_per_deduction} lates = ${settings.late_deduction_day_fraction} day)`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Payroll Management"
        description="Generate monthly payroll from salary, attendance and leave; review, adjust and finalize."
        actions={<ExportButton type="salary_expense" params={{ year: today.slice(0, 4) }} label="Salary expense" />}
      />
      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Generate payroll</CardTitle>
            <CardDescription>Creates a draft. Close attendance for the month first so absences are counted.</CardDescription>
          </CardHeader>
          <CardContent><GeneratePayrollForm defaultMonth={today.slice(0, 7)} maxMonth={today.slice(0, 7)} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active payroll rules</CardTitle>
            <CardDescription>Change these in <Link href="/admin/settings?tab=payroll" className="font-medium text-brand hover:underline">Company Settings → Payroll</Link>.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            <p><span className="text-muted-foreground">Per-day rate basis:</span> {PAYROLL_BASIS_LABELS[settings.payroll_day_basis]}</p>
            <p><span className="text-muted-foreground">Automatic deductions:</span> {rules.length ? rules.join(", ") : "None (all disabled)"}</p>
            <p><span className="text-muted-foreground">Overtime:</span> {settings.overtime_enabled ? `Enabled · ${settings.overtime_rate_multiplier}× hourly rate · minimum ${settings.overtime_min_minutes} min/day` : "Disabled"}</p>
          </CardContent>
        </Card>
      </div>
      <Card className="gap-0 py-0">
        {records.length === 0 ? (
          <EmptyState icon={Wallet} title="No payroll yet" description="Generate the first monthly payroll above." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-4">Period</TableHead><TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net pay</TableHead><TableHead>Status</TableHead><TableHead className="pr-4">Updated</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id} className="relative">
                    <TableCell className="pl-4 font-medium"><Link href={`/admin/payroll/${r.id}`} className="after:absolute after:inset-0">{formatMonth(r.period_year, r.period_month)}</Link></TableCell>
                    <TableCell className="tabular text-right">{r.employee_count}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(r.total_gross)}</TableCell>
                    <TableCell className="tabular text-right">{formatMoney(r.total_deductions)}</TableCell>
                    <TableCell className="tabular text-right font-semibold">{formatMoney(r.total_net)}</TableCell>
                    <TableCell>{r.status === "finalized" ? <ToneBadge tone="success">Finalized</ToneBadge> : <ToneBadge tone="warning">Draft</ToneBadge>}</TableCell>
                    <TableCell className="pr-4 text-xs text-muted-foreground">{formatDateTime(r.finalized_at ?? r.generated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
