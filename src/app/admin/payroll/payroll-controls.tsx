"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2, Lock, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/shared/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteDraftPayroll, finalizePayroll, generatePayroll, updatePayrollItem } from "./actions";
import type { PayrollItem } from "@/lib/types";

export function GeneratePayrollForm({ defaultMonth, maxMonth }: { defaultMonth: string; maxMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = React.useState(defaultMonth);
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await generatePayroll({ month });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Payroll generated as draft");
          router.push(`/admin/payroll/${r.data!.id}`);
        });
      }}
    >
      <Field label="Payroll month" htmlFor="pm">
        <Input id="pm" type="month" value={month} max={maxMonth} onChange={(e) => setMonth(e.target.value)} className="w-44" />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Calculator />} Generate payroll</Button>
    </form>
  );
}

export function RegenerateButton({ month }: { month: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline"><RefreshCw /> Recalculate</Button>}
      title="Recalculate this payroll?"
      description="Attendance, leave, salary and the current payroll rules are read again. Bonus, other earnings, other deductions and notes you entered are kept."
      confirmLabel="Recalculate"
      onConfirm={async () => {
        const r = await generatePayroll({ month });
        if (r.ok) router.refresh();
        return r.ok ? { ok: true, message: "Payroll recalculated" } : r;
      }}
    />
  );
}

export function FinalizeButton({ id, count, net }: { id: string; count: number; net: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button><Lock /> Finalize payroll</Button>}
      title="Finalize this payroll?"
      description={`${count} employee(s), total net pay ${net}. After finalizing, all amounts and source values are frozen and cannot be edited by anyone.`}
      confirmLabel="Finalize"
      onConfirm={async () => {
        const r = await finalizePayroll({ id });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

export function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost"><Trash2 className="text-danger" /> Delete draft</Button>}
      title="Delete this draft payroll?"
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const r = await deleteDraftPayroll({ id });
        if (r.ok) router.push("/admin/payroll");
        return r;
      }}
    />
  );
}

export function EditItemDialog({ item }: { item: PayrollItem }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const init = {
    bonus: String(item.bonus), other_earnings: String(item.other_earnings),
    other_deduction: String(item.other_deduction), adjustment_note: item.adjustment_note ?? "",
  };
  const [v, setV] = React.useState(init);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(init); }}>
      <DialogTrigger asChild><Button variant="ghost" size="sm"><Pencil /> Adjust</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust {item.employee_name}</DialogTitle>
          <DialogDescription>Manual amounts in BDT. Automatic amounts are recalculated from attendance and rules.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Bonus" htmlFor="pi_bonus"><Input id="pi_bonus" type="number" min={0} step="0.01" value={v.bonus} onChange={(e) => setV({ ...v, bonus: e.target.value })} /></Field>
          <Field label="Other earnings" htmlFor="pi_oe"><Input id="pi_oe" type="number" min={0} step="0.01" value={v.other_earnings} onChange={(e) => setV({ ...v, other_earnings: e.target.value })} /></Field>
          <Field label="Other deduction" htmlFor="pi_od"><Input id="pi_od" type="number" min={0} step="0.01" value={v.other_deduction} onChange={(e) => setV({ ...v, other_deduction: e.target.value })} /></Field>
        </div>
        <Field label="Note (shown on payslip)" htmlFor="pi_note"><Input id="pi_note" value={v.adjustment_note} maxLength={300} onChange={(e) => setV({ ...v, adjustment_note: e.target.value })} /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() => startTransition(async () => {
              const r = await updatePayrollItem({ id: item.id, payroll_id: item.payroll_id, ...v });
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.message ?? "Saved");
              setOpen(false);
              router.refresh();
            })}
          >
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
