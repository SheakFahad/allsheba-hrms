"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Loader2, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/shared/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmployeePicker, type PickerEmployee } from "@/components/shared/employee-picker";
import { formatMoney } from "@/lib/format";
import { SALARY_METHOD_LABELS, SALARY_MONTH_STATUS_LABELS, type SalaryMonthStatus, type SalaryPayment } from "@/lib/finance";
import { salaryLookup, saveSalaryPayment, setSalaryPaymentStatus } from "@/lib/finance-actions";

type Info = Extract<Awaited<ReturnType<typeof salaryLookup>>, { ok: true }>["data"];

export function SalaryPaymentDialog({
  employees,
  today,
  preparedBy,
  defaultMonth,
  presetEmployee,
  trigger,
}: {
  employees: PickerEmployee[];
  today: string;
  preparedBy: string;
  defaultMonth: string;
  presetEmployee?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [employee, setEmployee] = React.useState<string | null>(presetEmployee ?? null);
  const [month, setMonth] = React.useState(defaultMonth);
  const [info, setInfo] = React.useState<Info | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [v, setV] = React.useState({
    amount: "", payment_date: today, payment_method: "cash", designation: "", comments: "", over_salary_reason: "",
    prepared_by_name: preparedBy, checked_by_name: "", approved_by_name: "", received_by_name: "",
  });
  const req = React.useRef(0);

  async function lookup(emp: string | null, m: string) {
    const id = ++req.current;
    setInfo(null);
    if (!emp || !/^\d{4}-\d{2}$/.test(m)) return;
    setLoading(true);
    const r = await salaryLookup({ employee_id: emp, month: m });
    if (id !== req.current) return;
    setLoading(false);
    if (!r.ok) return void toast.error(r.error);
    const d = r.data!;
    setInfo(d);
    setV((x) => ({ ...x, amount: d.remaining > 0 ? String(d.remaining) : "", designation: d.designation ?? "" }));
  }

  const amount = Number(v.amount) || 0;
  const exceeds = !!info && info.configuredSalary > 0 && info.paid + info.pending + amount > info.configuredSalary;

  function submit(e: React.FormEvent, thenPrint: boolean) {
    e.preventDefault();
    if (!employee) return void toast.error("Select an employee.");
    startTransition(async () => {
      const r = await saveSalaryPayment({ employee_id: employee, month, ...v });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Salary payment recorded (pending confirmation)");
      setOpen(false);
      if (thenPrint && r.data?.id) router.push(`/admin/vouchers/salary/${r.data.id}`);
      else router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void lookup(employee, month);
      }}
    >
      <DialogTrigger asChild>{trigger ?? <Button><Plus /> Record salary payment</Button>}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record salary payment</DialogTitle>
          <DialogDescription>
            Employee details and the configured salary are filled in automatically. Recording or printing does not mark the salary as paid — an
            administrator confirms the payment after it is made.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => submit(e, false)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="Employee" htmlFor="sp_emp" required>
              <EmployeePicker id="sp_emp" employees={employees} value={employee} onChange={(id) => { setEmployee(id); void lookup(id, month); }} />
            </Field>
            <Field label="Salary month" htmlFor="sp_month" required>
              <Input id="sp_month" type="month" value={month} onChange={(e) => { setMonth(e.target.value); void lookup(employee, e.target.value); }} />
            </Field>
          </div>

          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading salary…</p>}
          {info && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-muted/60 px-4 py-3 text-sm sm:grid-cols-3">
              <span><span className="text-muted-foreground">Employee ID:</span> <b>{info.code}</b></span>
              <span><span className="text-muted-foreground">Designation:</span> {info.designation ?? "—"}</span>
              <span><span className="text-muted-foreground">Configured salary:</span> <b className="tabular">{formatMoney(info.configuredSalary)}</b></span>
              <span><span className="text-muted-foreground">Paid (confirmed):</span> <span className="tabular">{formatMoney(info.paid)}</span></span>
              <span><span className="text-muted-foreground">Recorded, unconfirmed:</span> <span className="tabular">{formatMoney(info.pending)}</span></span>
              <span><span className="text-muted-foreground">Status:</span> {SALARY_MONTH_STATUS_LABELS[info.status as SalaryMonthStatus]}</span>
              {info.configuredSalary === 0 && <span className="col-span-full text-warning">No salary configured for this month. Set it on the employee profile first.</span>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount (BDT)" htmlFor="sp_amt" required hint={info ? `Remaining: ${formatMoney(info.remaining)}` : undefined}>
              <Input id="sp_amt" type="number" min={0} step="0.01" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            </Field>
            <Field label="Payment date" htmlFor="sp_date" required><Input id="sp_date" type="date" value={v.payment_date} onChange={(e) => setV({ ...v, payment_date: e.target.value })} /></Field>
            <Field label="Payment method" htmlFor="sp_pm" required>
              <NativeSelect id="sp_pm" value={v.payment_method} onChange={(e) => setV({ ...v, payment_method: e.target.value })}>
                {Object.entries(SALARY_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </NativeSelect>
            </Field>
          </div>
          {exceeds && (
            <Field label="Reason for paying more than the salary" htmlFor="sp_over" required hint="Required when the total for the month would exceed the configured salary (e.g. bonus, arrears).">
              <Input id="sp_over" value={v.over_salary_reason} onChange={(e) => setV({ ...v, over_salary_reason: e.target.value })} maxLength={300} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Designation (on voucher)" htmlFor="sp_des"><Input id="sp_des" value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })} maxLength={80} /></Field>
            <Field label="Comments / payment notes" htmlFor="sp_cm"><Input id="sp_cm" value={v.comments} onChange={(e) => setV({ ...v, comments: e.target.value })} maxLength={1000} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            {(["prepared_by_name", "checked_by_name", "approved_by_name", "received_by_name"] as const).map((k) => (
              <Field key={k} label={k.replace("_by_name", " by").replace(/^./, (c) => c.toUpperCase())} htmlFor={`sp_${k}`}>
                <Input id={`sp_${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={80} />
              </Field>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={(e) => submit(e as unknown as React.FormEvent, true)}><Printer /> Save & print voucher</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SalaryPaymentActions({ payment }: { payment: SalaryPayment }) {
  const router = useRouter();
  const done = <T extends { ok: boolean }>(r: T) => { if (r.ok) router.refresh(); return r; };
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" asChild><Link href={`/admin/vouchers/salary/${payment.id}`}><Printer /> Voucher</Link></Button>
      {payment.status === "pending" && (
        <ConfirmDialog
          trigger={<Button size="sm"><CheckCircle2 /> Confirm paid</Button>}
          title={`Confirm ${payment.voucher_no} as paid?`}
          description={`Confirm only after ${formatMoney(payment.amount)} has actually been paid to ${payment.employee_name}.`}
          confirmLabel="Confirm paid"
          onConfirm={async () => done(await setSalaryPaymentStatus({ id: payment.id, status: "confirmed" }))}
        />
      )}
      {payment.status !== "cancelled" && (
        <ConfirmDialog
          trigger={<Button size="icon-sm" variant="ghost" aria-label="Cancel payment"><Ban className="text-danger" /></Button>}
          title={`Cancel ${payment.voucher_no}?`}
          description="The record is kept for the audit trail but no longer counts as paid."
          confirmLabel="Cancel payment"
          destructive
          noteLabel="Reason"
          noteRequired
          onConfirm={async (reason) => done(await setSalaryPaymentStatus({ id: payment.id, status: "cancelled", reason }))}
        />
      )}
    </div>
  );
}
