"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/shared/field";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUSES, LATE_REASON_LABELS, LATE_REASONS } from "@/lib/constants";
import { requestCorrection } from "@/lib/attendance-actions";
import { formatDate, toHHMM } from "@/lib/time";
import type { Attendance } from "@/lib/types";

export function CorrectionRequestDialog({ record, employeeName }: { record: Attendance; employeeName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const initial = {
    status: record.status as string,
    actual_in: toHHMM(record.actual_in),
    actual_out: toHHMM(record.actual_out),
    late_reason: (record.late_reason ?? "") as string,
    late_reason_note: record.late_reason_note ?? "",
    notes: record.notes ?? "",
    reason: "",
  };
  const [v, setV] = React.useState(initial);
  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Only send fields that actually changed.
    const changed: Record<string, string> = {};
    for (const k of ["status", "actual_in", "actual_out", "late_reason", "late_reason_note", "notes"] as const) {
      if (v[k] !== initial[k]) changed[k] = v[k];
    }
    if (Object.keys(changed).length === 0) return void toast.error("Change at least one field.");
    if (v.reason.trim().length < 3) return void toast.error("Explain why the correction is needed.");
    startTransition(async () => {
      const r = await requestCorrection({ attendance_id: record.id, reason: v.reason, ...changed });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Request sent");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(initial); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><FilePenLine /> Request correction</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request correction</DialogTitle>
          <DialogDescription>
            {employeeName} · {formatDate(record.attendance_date)}. The administrator will review and apply it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Status" htmlFor="cr_status">
              <NativeSelect id="cr_status" value={v.status} onChange={set("status")}>
                {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Actual in" htmlFor="cr_in"><Input id="cr_in" type="time" value={v.actual_in} onChange={set("actual_in")} /></Field>
            <Field label="Actual out" htmlFor="cr_out"><Input id="cr_out" type="time" value={v.actual_out} onChange={set("actual_out")} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Late reason" htmlFor="cr_lr">
              <NativeSelect id="cr_lr" value={v.late_reason} onChange={set("late_reason")}>
                <option value="">—</option>
                {LATE_REASONS.map((r) => <option key={r} value={r}>{LATE_REASON_LABELS[r]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Late details" htmlFor="cr_ln"><Input id="cr_ln" value={v.late_reason_note} onChange={set("late_reason_note")} maxLength={500} /></Field>
          </div>
          <Field label="Why is this correction needed?" htmlFor="cr_reason" required>
            <Textarea id="cr_reason" rows={3} value={v.reason} onChange={set("reason")} maxLength={500} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Send request</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
