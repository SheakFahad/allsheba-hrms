"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Loader2, Pencil, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/shared/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EXPENSE_METHOD_LABELS, type Expense, type ExpenseCategory, type ExpenseKind } from "@/lib/finance";
import { saveExpense, setExpenseStatus } from "@/lib/finance-actions";

export interface EmployeeLite {
  id: string;
  name: string;
  code: string;
  designation: string | null;
}

type Values = {
  expense_kind: ExpenseKind;
  category_id: string;
  expense_date: string;
  period_start: string;
  period_end: string;
  payee_name: string;
  employee_id: string;
  employee_designation: string;
  details: string;
  amount: string;
  comments: string;
  payment_method: string;
  prepared_by_name: string;
  checked_by_name: string;
  approved_by_name: string;
  received_by_name: string;
};

function initialValues(kind: ExpenseKind, today: string, preparedBy: string, e?: Expense): Values {
  if (e) {
    return {
      expense_kind: e.expense_kind, category_id: e.category_id, expense_date: e.expense_date,
      period_start: e.period_start ?? "", period_end: e.period_end ?? "", payee_name: e.payee_name,
      employee_id: e.employee_id ?? "", employee_designation: e.employee_designation ?? "", details: e.details ?? "",
      amount: String(e.amount), comments: e.comments ?? "", payment_method: e.payment_method,
      prepared_by_name: e.prepared_by_name ?? "", checked_by_name: e.checked_by_name ?? "",
      approved_by_name: e.approved_by_name ?? "", received_by_name: e.received_by_name ?? "",
    };
  }
  const month = today.slice(0, 7);
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return {
    expense_kind: kind, category_id: "", expense_date: today,
    period_start: kind === "monthly" ? `${month}-01` : "", period_end: kind === "monthly" ? `${month}-${String(last).padStart(2, "0")}` : "",
    payee_name: "", employee_id: "", employee_designation: "", details: "", amount: "", comments: "",
    payment_method: "cash", prepared_by_name: preparedBy, checked_by_name: "", approved_by_name: "", received_by_name: "",
  };
}

export function ExpenseDialog({
  kind,
  categories,
  employees,
  today,
  preparedBy,
  expense,
  voucherBase,
}: {
  kind: ExpenseKind;
  categories: ExpenseCategory[];
  employees: EmployeeLite[];
  today: string;
  preparedBy: string;
  expense?: Expense;
  voucherBase: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<Values>(() => initialValues(kind, today, preparedBy, expense));
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, startTransition] = React.useTransition();
  const cats = categories.filter((c) => (c.is_active || c.id === expense?.category_id) && (c.kind === "both" || c.kind === v.expense_kind));
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  function submit(ev: React.FormEvent, thenPrint: boolean) {
    ev.preventDefault();
    startTransition(async () => {
      const r = await saveExpense({ ...v, id: expense?.id ?? "" });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.error);
      }
      toast.success(expense ? "Expense updated" : "Expense saved (pending confirmation)");
      setOpen(false);
      if (thenPrint && r.data?.id) router.push(`${voucherBase}/${r.data.id}`);
      else router.refresh();
    });
  }
  const err = (k: string) => errors[k]?.[0];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(initialValues(kind, today, preparedBy, expense)); setErrors({}); } }}>
      <DialogTrigger asChild>
        {expense ? <Button variant="ghost" size="sm"><Pencil /> Edit</Button> : <Button><Plus /> {kind === "monthly" ? "Add monthly expense" : "Add daily expense"}</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{expense ? `Edit ${expense.voucher_no}` : v.expense_kind === "monthly" ? "New monthly expense" : "New daily expense"}</DialogTitle>
          <DialogDescription>The voucher number is generated automatically. The expense counts as paid only after an administrator confirms it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => submit(e, false)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Expense type / category" htmlFor="ex_cat" required error={err("category_id")} className="sm:col-span-2">
              <NativeSelect id="ex_cat" value={v.category_id} onChange={set("category_id")}>
                <option value="">Select…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label={v.expense_kind === "monthly" ? "Bill / payment date" : "Date"} htmlFor="ex_date" required error={err("expense_date")}>
              <Input id="ex_date" type="date" value={v.expense_date} onChange={set("expense_date")} />
            </Field>
          </div>
          {v.expense_kind === "monthly" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Period from" htmlFor="ex_ps" required error={err("period_start")}><Input id="ex_ps" type="date" value={v.period_start} onChange={set("period_start")} /></Field>
              <Field label="Period to" htmlFor="ex_pe" required error={err("period_end")} hint="Use a full month or any custom period"><Input id="ex_pe" type="date" value={v.period_end} onChange={set("period_end")} /></Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (paid to)" htmlFor="ex_name" required error={err("payee_name")}><Input id="ex_name" value={v.payee_name} onChange={set("payee_name")} maxLength={120} /></Field>
            <Field label="Amount (BDT)" htmlFor="ex_amt" required error={err("amount")}><Input id="ex_amt" type="number" min={0} step="0.01" inputMode="decimal" value={v.amount} onChange={set("amount")} /></Field>
            <Field label="Employee (optional)" htmlFor="ex_emp">
              <NativeSelect
                id="ex_emp"
                value={v.employee_id}
                onChange={(e) => {
                  const emp = employees.find((x) => x.id === e.target.value);
                  setV({ ...v, employee_id: e.target.value, employee_designation: emp?.designation ?? "", payee_name: v.payee_name || emp?.name || "" });
                }}
              >
                <option value="">— None —</option>
                {employees.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}
              </NativeSelect>
            </Field>
            <Field label="Employee designation (optional)" htmlFor="ex_des"><Input id="ex_des" value={v.employee_designation} onChange={set("employee_designation")} maxLength={80} /></Field>
            <Field label="Payment method" htmlFor="ex_pm" required>
              <NativeSelect id="ex_pm" value={v.payment_method} onChange={set("payment_method")}>
                {Object.entries(EXPENSE_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Comments" htmlFor="ex_cm"><Input id="ex_cm" value={v.comments} onChange={set("comments")} maxLength={1000} /></Field>
          </div>
          <Field label="Full details" htmlFor="ex_det"><Textarea id="ex_det" rows={3} value={v.details} onChange={set("details")} maxLength={2000} /></Field>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Prepared by" htmlFor="ex_p1"><Input id="ex_p1" value={v.prepared_by_name} onChange={set("prepared_by_name")} maxLength={80} /></Field>
            <Field label="Checked by" htmlFor="ex_p2"><Input id="ex_p2" value={v.checked_by_name} onChange={set("checked_by_name")} maxLength={80} /></Field>
            <Field label="Approved by" htmlFor="ex_p3"><Input id="ex_p3" value={v.approved_by_name} onChange={set("approved_by_name")} maxLength={80} /></Field>
            <Field label="Received by" htmlFor="ex_p4"><Input id="ex_p4" value={v.received_by_name} onChange={set("received_by_name")} maxLength={80} /></Field>
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

export function ExpenseRowActions({
  expense,
  isAdmin,
  canEdit,
  voucherHref,
  editDialog,
}: {
  expense: Expense;
  isAdmin: boolean;
  canEdit: boolean;
  voucherHref: string;
  editDialog?: React.ReactNode;
}) {
  const router = useRouter();
  const done = <T extends { ok: boolean }>(r: T) => { if (r.ok) router.refresh(); return r; };
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" asChild><Link href={voucherHref}><Printer /> Voucher</Link></Button>
      {canEdit && expense.status === "pending" && editDialog}
      {isAdmin && expense.status === "pending" && (
        <ConfirmDialog
          trigger={<Button size="sm"><CheckCircle2 /> Confirm paid</Button>}
          title={`Confirm ${expense.voucher_no} as paid?`}
          description="Confirm only after the money has actually been paid. Confirmed expenses count in the business cost and can no longer be edited."
          confirmLabel="Confirm paid"
          onConfirm={async () => done(await setExpenseStatus({ id: expense.id, status: "confirmed" }))}
        />
      )}
      {isAdmin && expense.status !== "cancelled" && (
        <ConfirmDialog
          trigger={<Button size="icon-sm" variant="ghost" aria-label="Cancel expense"><Ban className="text-danger" /></Button>}
          title={`Cancel ${expense.voucher_no}?`}
          description="The record is kept for the audit trail but no longer counts as a cost."
          confirmLabel="Cancel expense"
          destructive
          noteLabel="Reason"
          noteRequired
          onConfirm={async (reason) => done(await setExpenseStatus({ id: expense.id, status: "cancelled", reason }))}
        />
      )}
    </div>
  );
}
