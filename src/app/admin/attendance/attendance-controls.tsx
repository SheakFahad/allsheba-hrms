"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AttendanceForm, type FormEmployee } from "@/components/attendance/attendance-form";
import { closeAttendance, deleteAttendance, reviewCorrection } from "@/lib/attendance-actions";
import { formatDate } from "@/lib/time";
import type { Attendance, Shift } from "@/lib/types";

export function AdminAttendanceDialog({
  employees,
  shifts,
  timezone,
  lateReasonRequired,
  noteRequiredForOther,
  flexibleSchedule,
  date,
  today,
  employeeId,
  record,
}: {
  employees: FormEmployee[];
  shifts: Shift[];
  timezone: string;
  lateReasonRequired: boolean;
  noteRequiredForOther: boolean;
  flexibleSchedule: boolean;
  date: string;
  today: string;
  employeeId?: string;
  record?: Attendance | null;
}) {
  const [open, setOpen] = React.useState(false);
  const isEdit = !!record;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm"><Pencil /> Edit</Button>
        ) : employeeId ? (
          <Button variant="outline" size="sm"><Plus /> Record</Button>
        ) : (
          <Button><Plus /> Add attendance</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Correct attendance" : "Record attendance"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Every change is saved to the correction history with your reason." : "Admin entries are locked against Entry Panel edits."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <AttendanceForm
            mode="admin"
            compact
            employees={employees}
            shifts={shifts}
            initialDate={record?.attendance_date ?? date}
            initialEmployeeId={record?.employee_id ?? employeeId}
            initialRecord={isEdit ? record : undefined}
            policy={{ timezone, lateReasonRequired, noteRequiredForOther, flexibleSchedule, maxDate: today }}
            onSaved={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAttendanceButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete record"><Trash2 className="text-danger" /></Button>}
      title="Delete attendance record?"
      description={`${label}. This is recorded in the audit log. Prefer “Edit” for corrections.`}
      confirmLabel="Delete"
      destructive
      noteLabel="Reason"
      noteRequired
      onConfirm={async (reason) => {
        const r = await deleteAttendance({ id, reason });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

export function CloseDayButton({ date, notRecorded }: { date: string; notRecorded: number }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline"><Lock /> Close {formatDate(date)}</Button>}
      title={`Close attendance for ${formatDate(date)}?`}
      description={
        notRecorded > 0
          ? `${notRecorded} employee(s) have no record. They will be marked Holiday / Weekly Off / Leave (if approved) or Absent according to the work calendar.`
          : "Every employee already has a record for this day."
      }
      confirmLabel="Close day"
      onConfirm={async () => {
        const r = await closeAttendance({ from: date, to: date });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

export function CloseRangeDialog({ today }: { today: string }) {
  const router = useRouter();
  const [from, setFrom] = React.useState(today.slice(0, 8) + "01");
  const [to, setTo] = React.useState(today);
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost"><CalendarCheck /> Close a date range</Button>}
      title="Close attendance for a date range"
      description={
        <span className="grid gap-3 pt-2">
          <span>Fills missing days for every eligible employee (up to 93 days). Existing records are never changed.</span>
          <span className="grid grid-cols-2 gap-3">
            <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </span>
        </span>
      }
      confirmLabel="Close range"
      onConfirm={async () => {
        const r = await closeAttendance({ from, to });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

export function ReviewButtons({ id }: { id: string }) {
  const router = useRouter();
  return (
    <div className="flex justify-end gap-1">
      <ConfirmDialog
        trigger={<Button size="sm"><Check /> Approve</Button>}
        title="Approve correction?"
        description="The proposed values will be applied to the attendance record and logged."
        confirmLabel="Approve & apply"
        noteLabel="Note (optional)"
        onConfirm={async (note) => {
          const r = await reviewCorrection({ id, approve: true, note });
          if (r.ok) router.refresh();
          return r;
        }}
      />
      <ConfirmDialog
        trigger={<Button size="sm" variant="outline"><X /> Reject</Button>}
        title="Reject correction?"
        confirmLabel="Reject"
        destructive
        noteLabel="Reason"
        noteRequired
        onConfirm={async (note) => {
          const r = await reviewCorrection({ id, approve: false, note });
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}
