"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/shared/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmployeePicker, type PickerEmployee } from "@/components/shared/employee-picker";
import { applyLeave, cancelLeave, reviewLeave, saveLeaveType, setLeaveBalance } from "@/lib/leave-actions";
import type { LeaveType } from "@/lib/types";

export function LeaveApplyForm({
  employees,
  types,
  today,
  isAdmin,
  balances,
  onDone,
}: {
  employees: PickerEmployee[];
  types: LeaveType[];
  today: string;
  isAdmin: boolean;
  balances?: Record<string, Record<string, number>>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const active = types.filter((t) => t.is_active);
  const [employee, setEmployee] = React.useState<string | null>(null);
  const [typeId, setTypeId] = React.useState(active[0]?.id ?? "");
  const [start, setStart] = React.useState(today);
  const [end, setEnd] = React.useState(today);
  const [half, setHalf] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [approveNow, setApproveNow] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const type = active.find((t) => t.id === typeId);
  const remaining = employee && balances?.[employee]?.[typeId];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return void toast.error("Select an employee.");
    if (!typeId) return void toast.error("Select a leave type.");
    if (end < start) return void toast.error("End date must be on or after the start date.");
    startTransition(async () => {
      const r = await applyLeave({
        employee_id: employee, leave_type_id: typeId, start_date: start, end_date: half ? start : end,
        is_half_day: half, reason, approve_now: approveNow,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      setEmployee(null);
      setReason("");
      setHalf(false);
      router.refresh();
      onDone?.();
    });
  }

  if (!active.length) return <p className="text-sm text-muted-foreground">No active leave types. An administrator must configure leave policies first.</p>;

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Employee" htmlFor="lv_emp" required>
        <EmployeePicker id="lv_emp" employees={employees} value={employee} onChange={setEmployee} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Leave type"
          htmlFor="lv_type"
          required
          hint={type?.is_paid && remaining !== undefined && remaining !== null ? `${remaining} day(s) remaining this year` : type && !type.is_paid ? "Unpaid leave" : undefined}
        >
          <NativeSelect id="lv_type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </NativeSelect>
        </Field>
        {type?.allow_half_day && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={half} onCheckedChange={(v) => setHalf(v === true)} /> Half day
          </label>
        )}
        <Field label={half ? "Date" : "From"} htmlFor="lv_from" required>
          <Input id="lv_from" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} />
        </Field>
        {!half && (
          <Field label="To" htmlFor="lv_to" required>
            <Input id="lv_to" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="Reason" htmlFor="lv_reason">
        <Textarea id="lv_reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      </Field>
      <p className="text-xs text-muted-foreground">Weekly off days and holidays are excluded automatically when counting leave days.</p>
      {isAdmin && (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={approveNow} onCheckedChange={setApproveNow} /> Approve immediately
        </label>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />} {isAdmin && approveNow ? "Record leave" : "Submit application"}</Button>
      </div>
    </form>
  );
}

export function NewLeaveDialog(props: React.ComponentProps<typeof LeaveApplyForm>) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> New leave</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New leave</DialogTitle>
          <DialogDescription>Record a leave application for an employee.</DialogDescription>
        </DialogHeader>
        <LeaveApplyForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function LeaveReviewButtons({ id, canReview, canCancel }: { id: string; canReview: boolean; canCancel: boolean }) {
  const router = useRouter();
  const done = <T extends { ok: boolean }>(r: T) => { if (r.ok) router.refresh(); return r; };
  return (
    <div className="flex justify-end gap-1">
      {canReview && (
        <>
          <ConfirmDialog
            trigger={<Button size="sm"><Check /> Approve</Button>}
            title="Approve leave?"
            description="Paid leave is checked against the remaining balance. Days already closed as Absent become Leave."
            confirmLabel="Approve"
            noteLabel="Note (optional)"
            onConfirm={async (note) => done(await reviewLeave({ id, approve: true, note }))}
          />
          <ConfirmDialog
            trigger={<Button size="sm" variant="outline"><X /> Reject</Button>}
            title="Reject leave?"
            confirmLabel="Reject"
            destructive
            noteLabel="Reason"
            noteRequired
            onConfirm={async (note) => done(await reviewLeave({ id, approve: false, note }))}
          />
        </>
      )}
      {canCancel && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost"><Ban /> Cancel</Button>}
          title="Cancel this leave?"
          confirmLabel="Cancel leave"
          destructive
          noteLabel="Reason (optional)"
          onConfirm={async (note) => done(await cancelLeave({ id, note }))}
        />
      )}
    </div>
  );
}

export function LeaveTypeDialog({ type }: { type?: LeaveType }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const init = {
    name: type?.name ?? "", code: type?.code ?? "", days_per_year: String(type?.days_per_year ?? 0),
    is_paid: type?.is_paid ?? true, allow_half_day: type?.allow_half_day ?? true, carry_forward: type?.carry_forward ?? false,
    max_carry_days: String(type?.max_carry_days ?? 0), color: type?.color ?? "#2a86c2", is_active: type?.is_active ?? true,
  };
  const [v, setV] = React.useState(init);
  const [pending, startTransition] = React.useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveLeaveType({ ...v, id: type?.id ?? "" });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      setOpen(false);
      router.refresh();
    });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(init); }}>
      <DialogTrigger asChild>
        {type ? <Button variant="ghost" size="sm"><Pencil /> Edit</Button> : <Button variant="outline"><Plus /> Add leave type</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{type ? "Edit leave policy" : "New leave policy"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Field label="Name" htmlFor="lt_name" required><Input id="lt_name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Code" htmlFor="lt_code" required><Input id="lt_code" value={v.code} maxLength={6} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Days per year" htmlFor="lt_days"><Input id="lt_days" type="number" min={0} step="0.5" value={v.days_per_year} onChange={(e) => setV({ ...v, days_per_year: e.target.value })} /></Field>
            <Field label="Max carry-forward" htmlFor="lt_carry"><Input id="lt_carry" type="number" min={0} step="0.5" value={v.max_carry_days} disabled={!v.carry_forward} onChange={(e) => setV({ ...v, max_carry_days: e.target.value })} /></Field>
            <Field label="Colour" htmlFor="lt_color"><Input id="lt_color" type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="p-1" /></Field>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {([["is_paid", "Paid leave (balance enforced)"], ["allow_half_day", "Allow half day"], ["carry_forward", "Carry forward unused days"], ["is_active", "Active"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2"><Switch checked={v[k]} onCheckedChange={(c) => setV({ ...v, [k]: c })} /> {label}</label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BalanceEditor({ employeeId, typeId, year, allocated, carried }: { employeeId: string; typeId: string; year: number; allocated: number; carried: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [a, setA] = React.useState(String(allocated));
  const [c, setC] = React.useState(String(carried));
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="Edit balance"><Pencil /></Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Edit leave balance ({year})</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Allocated" htmlFor="b_a"><Input id="b_a" type="number" min={0} step="0.5" value={a} onChange={(e) => setA(e.target.value)} /></Field>
          <Field label="Carried forward" htmlFor="b_c"><Input id="b_c" type="number" min={0} step="0.5" value={c} onChange={(e) => setC(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => startTransition(async () => {
              const r = await setLeaveBalance({ employee_id: employeeId, leave_type_id: typeId, year, allocated: a, carried: c });
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
