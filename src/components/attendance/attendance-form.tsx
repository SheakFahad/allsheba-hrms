"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, CheckCircle2, Clock, Info, Loader2, LogOut, Save, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/shared/field";
import { EmployeePicker, type PickerEmployee } from "@/components/shared/employee-picker";
import { calculateAttendance } from "@/lib/attendance-calc";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUSES, LATE_REASON_LABELS, LATE_REASONS } from "@/lib/constants";
import { formatDuration, formatTime12, nowHHMM, toHHMM } from "@/lib/time";
import { lookupAttendance, saveAttendance } from "@/lib/attendance-actions";
import type { Attendance, AttendanceStatus, LateReason, Shift } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface FormEmployee extends PickerEmployee {
  shiftId: string | null;
  joiningDate: string;
}

interface Policy {
  timezone: string;
  lateReasonRequired: boolean;
  noteRequiredForOther: boolean;
  /** "Present" may be saved without clock times for employees on the default shift. */
  presentWithoutTime?: boolean;
  minDate?: string;
  maxDate: string;
}

const EMPTY = {
  id: "",
  scheduled_in: "",
  scheduled_out: "",
  actual_in: "",
  actual_out: "",
  status: "present" as AttendanceStatus,
  late_reason: "" as LateReason | "",
  late_reason_note: "",
  notes: "",
  change_reason: "",
};

export function AttendanceForm({
  mode,
  employees,
  shifts,
  policy,
  initialDate,
  initialEmployeeId,
  initialRecord,
  onSaved,
  compact,
}: {
  mode: "entry" | "admin";
  employees: FormEmployee[];
  shifts: Shift[];
  policy: Policy;
  initialDate: string;
  initialEmployeeId?: string;
  initialRecord?: Attendance | null;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = React.useState(initialDate);
  const [employeeId, setEmployeeId] = React.useState<string | null>(initialEmployeeId ?? null);
  const defaultShift = shifts.find((s) => s.is_default) ?? shifts[0];
  const scheduleFor = (emp: FormEmployee | null) => {
    const shift = shifts.find((s) => s.id === emp?.shiftId) ?? defaultShift;
    return { in: toHHMM(shift?.start_time) || "10:00", out: toHHMM(shift?.end_time) || "19:00", grace: shift?.grace_minutes ?? 0 };
  };
  const findEmp = (id: string | null) => employees.find((e) => e.id === id) ?? null;

  /** Form values for an existing record, or a blank form with the scheduled times pre-filled.
   *  Actual times are NEVER pre-filled. */
  const valuesFor = (record: Attendance | null, emp: FormEmployee | null) => {
    if (record) {
      return {
        id: record.id,
        scheduled_in: toHHMM(record.scheduled_in),
        scheduled_out: toHHMM(record.scheduled_out),
        actual_in: toHHMM(record.actual_in),
        actual_out: toHHMM(record.actual_out),
        status: record.status,
        late_reason: (record.late_reason ?? "") as LateReason | "",
        late_reason_note: record.late_reason_note ?? "",
        notes: record.notes ?? "",
        change_reason: "",
      };
    }
    const sc = scheduleFor(emp);
    return { ...EMPTY, scheduled_in: sc.in, scheduled_out: sc.out };
  };

  const needsInitialLookup = !!initialEmployeeId && initialRecord === undefined;
  const [v, setV] = React.useState(() => valuesFor(initialRecord ?? null, findEmp(initialEmployeeId ?? null)));
  const [statusTouched, setStatusTouched] = React.useState(!!initialRecord);
  const [existing, setExisting] = React.useState<Attendance | null>(initialRecord ?? null);
  const [loading, setLoading] = React.useState(needsInitialLookup);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const requestId = React.useRef(0);

  const employee = findEmp(employeeId);
  const schedule = scheduleFor(employee);
  const grace = existing?.grace_minutes ?? schedule.grace;

  function apply(record: Attendance | null, emp: FormEmployee | null) {
    setErrors({});
    setStatusTouched(!!record);
    setExisting(record);
    setV(valuesFor(record, emp));
  }

  /** Load the existing record (duplicate prevention) whenever employee or date changes. */
  async function refresh(empId: string | null, d: string) {
    const id = ++requestId.current;
    if (!empId || !d) {
      setLoading(false);
      apply(null, null);
      return;
    }
    setLoading(true);
    const r = await lookupAttendance({ employee_id: empId, attendance_date: d });
    if (id !== requestId.current) return;
    setLoading(false);
    if (r.ok) apply(r.data?.record ?? null, findEmp(empId));
    else toast.error(r.error);
  }

  // Admin "Record" dialog opened for a specific employee: look up once on mount.
  React.useEffect(() => {
    if (!needsInitialLookup) return;
    const id = ++requestId.current;
    lookupAttendance({ employee_id: initialEmployeeId!, attendance_date: initialDate }).then((r) => {
      if (id !== requestId.current) return;
      setLoading(false);
      if (r.ok) apply(r.data?.record ?? null, findEmp(initialEmployeeId!));
      else toast.error(r.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Status follows the clock times automatically until the operator picks one explicitly.
  const autoStatus = v.actual_in
    ? calculateAttendance({
        scheduledIn: v.scheduled_in || schedule.in, scheduledOut: v.scheduled_out || schedule.out,
        actualIn: v.actual_in, actualOut: v.actual_out || null, graceMinutes: grace, status: "present",
      }).status
    : v.status;
  const status: AttendanceStatus = statusTouched ? v.status : autoStatus;

  const calc = calculateAttendance({
    scheduledIn: v.scheduled_in || schedule.in,
    scheduledOut: v.scheduled_out || schedule.out,
    actualIn: v.actual_in || null,
    actualOut: v.actual_out || null,
    graceMinutes: grace,
    status,
  });

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const needsTimes = calc.requiresTimes;
  // Only employees with NO shift set ("Default shift" in the employee form) qualify;
  // an explicitly assigned shift — even the 10:00–19:00 General Shift — always needs times.
  const onDefaultShift = !!employee && !employee.shiftId;
  // In-time is optional only for "Present" on the default shift when the policy allows it.
  const inTimeOptional = !!policy.presentWithoutTime && onDefaultShift && status === "present";
  // Out-time earlier than in-time is almost always AM chosen instead of PM.
  const outBeforeIn = !!v.actual_in && !!v.actual_out && v.actual_out <= v.actual_in;
  const pmSuggestion = (() => {
    if (!outBeforeIn) return null;
    const [h, m] = v.actual_out.split(":").map(Number);
    if (h >= 12) return null;
    const candidate = `${String(h + 12).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    return candidate > v.actual_in ? candidate : null;
  })();
  const showLate = needsTimes && calc.isLate;
  const editingLockedForEntry = mode === "entry" && !!existing && (existing.is_locked || existing.source !== "entry");

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!employeeId) e.employee = "Select an employee";
    if (!date) e.date = "Select a date";
    if (needsTimes && !v.actual_in && !inTimeOptional) e.actual_in = "Enter the actual in-time";
    if (v.actual_in && v.actual_out && v.actual_out <= v.actual_in) e.actual_out = pmSuggestion
      ? `Out-time is before in-time. Did you mean ${formatTime12(pmSuggestion)}?`
      : "Out-time must be after in-time";
    if (showLate && policy.lateReasonRequired && !v.late_reason) e.late_reason = "Select a late reason";
    if (showLate && v.late_reason === "other" && policy.noteRequiredForOther && v.late_reason_note.trim().length < 3)
      e.late_reason_note = "Describe the reason";
    if (mode === "admin" && v.id && v.change_reason.trim().length < 3) e.change_reason = "Enter a reason for the correction";
    if (employee && date < employee.joiningDate) e.date = "Date is before the employee's joining date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    startTransition(async () => {
      const res = await saveAttendance({
        id: v.id || undefined,
        employee_id: employeeId,
        attendance_date: date,
        scheduled_in: v.scheduled_in || schedule.in,
        scheduled_out: v.scheduled_out || schedule.out,
        actual_in: needsTimes ? v.actual_in : "",
        actual_out: needsTimes ? v.actual_out : "",
        status,
        late_reason: showLate ? v.late_reason : "",
        late_reason_note: showLate ? v.late_reason_note : "",
        notes: v.notes,
        change_reason: v.change_reason,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved", {
        description: employee ? `${employee.name} · ${ATTENDANCE_STATUS_LABELS[calc.status]}${calc.lateMinutes ? ` · ${calc.lateMinutes} min late` : ""}` : undefined,
      });
      router.refresh();
      if (onSaved) onSaved();
      else {
        setEmployeeId(null);
        requestId.current++;
        apply(null, null);
      }
    });
  }

  const nowBtn = (k: "actual_in" | "actual_out") => (
    <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => setV((s) => ({ ...s, [k]: nowHHMM(policy.timezone) }))}>
      <TimerReset /> Now
    </Button>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className={cn("grid gap-4", !compact && "sm:grid-cols-[180px_1fr]")}>
        <Field label="Attendance date" htmlFor="att_date" required error={errors.date}>
          <Input
            id="att_date"
            type="date"
            className="h-11"
            value={date}
            min={policy.minDate}
            max={policy.maxDate}
            onChange={(e) => { setDate(e.target.value); void refresh(employeeId, e.target.value); }}
            disabled={mode === "admin" && !!initialRecord}
          />
        </Field>
        <Field label="Employee" htmlFor="att_emp" required error={errors.employee}>
          <EmployeePicker
            id="att_emp"
            employees={employees}
            value={employeeId}
            onChange={(id) => { setEmployeeId(id); void refresh(id, date); }}
            invalid={!!errors.employee}
            disabled={mode === "admin" && !!initialRecord}
          />
        </Field>
      </div>

      {employee && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-muted/60 px-4 py-2.5 text-sm">
          <span><span className="text-muted-foreground">Employee ID:</span> <span className="tabular font-semibold">{employee.code}</span></span>
          {employee.department && <span><span className="text-muted-foreground">Department:</span> {employee.department}</span>}
          <span><span className="text-muted-foreground">Schedule:</span> {formatTime12(schedule.in)} – {formatTime12(schedule.out)}{grace ? ` (grace ${grace} min)` : ""}</span>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      )}

      {existing && (
        <div className={cn("flex gap-2.5 rounded-lg border px-4 py-3 text-sm", editingLockedForEntry ? "border-warning/30 bg-warning-soft text-warning" : "border-info/20 bg-info-soft text-info")}>
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            {editingLockedForEntry
              ? "Attendance for this date is already recorded and locked. Use “Correction Requests” to ask the administrator for a change."
              : "Attendance for this date already exists — you are editing the existing record (duplicates are not allowed)."}
          </p>
        </div>
      )}

      <fieldset disabled={!employee || editingLockedForEntry || loading} className="grid gap-5 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Attendance status" htmlFor="att_status" required>
            <NativeSelect
              id="att_status"
              className="h-10"
              value={status}
              onChange={(e) => {
                setStatusTouched(true);
                setV((s) => ({ ...s, status: e.target.value as AttendanceStatus }));
              }}
            >
              {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}
            </NativeSelect>
          </Field>
          {statusTouched && v.actual_in && mode === "entry" && !existing && (
            <div className="flex items-end">
              <Button type="button" variant="link" size="sm" onClick={() => setStatusTouched(false)}>Use automatic status</Button>
            </div>
          )}
        </div>

        {needsTimes && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-4 rounded-xl border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><Clock className="size-4 text-brand" /> Arrival</p>
              <Field label="Scheduled in" htmlFor="sched_in">
                <Input id="sched_in" type="time" className="h-10" value={v.scheduled_in} onChange={set("scheduled_in")} />
              </Field>
              <Field
                label="Actual in"
                htmlFor="actual_in"
                required={!inTimeOptional}
                error={errors.actual_in}
                hint={inTimeOptional ? "Optional — leave empty to mark Present without times." : undefined}
              >
                <div className="flex gap-2">
                  <Input id="actual_in" type="time" className="h-10" value={v.actual_in} onChange={set("actual_in")} aria-invalid={!!errors.actual_in} />
                  {nowBtn("actual_in")}
                </div>
              </Field>
            </div>
            <div className="grid gap-4 rounded-xl border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><LogOut className="size-4 text-brand" /> Departure</p>
              <Field label="Scheduled out" htmlFor="sched_out">
                <Input id="sched_out" type="time" className="h-10" value={v.scheduled_out} onChange={set("scheduled_out")} />
              </Field>
              <Field label="Actual out" htmlFor="actual_out" error={errors.actual_out} hint="Can be added later in the day.">
                <div className="flex gap-2">
                  <Input id="actual_out" type="time" className="h-10" value={v.actual_out} onChange={set("actual_out")} aria-invalid={!!errors.actual_out} />
                  {nowBtn("actual_out")}
                </div>
                {pmSuggestion && !errors.actual_out && (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-warning">
                    Out-time is earlier than in-time ({formatTime12(v.actual_in)}).
                    <button
                      type="button"
                      className="rounded bg-warning-soft px-1.5 py-0.5 underline-offset-2 hover:underline"
                      onClick={() => setV((s) => ({ ...s, actual_out: pmSuggestion }))}
                    >
                      Use {formatTime12(pmSuggestion)}
                    </button>
                  </p>
                )}
                {pmSuggestion && errors.actual_out && (
                  <button
                    type="button"
                    className="w-fit rounded bg-warning-soft px-2 py-1 text-xs font-medium text-warning hover:underline"
                    onClick={() => {
                      setV((s) => ({ ...s, actual_out: pmSuggestion }));
                      setErrors((prev) => { const next = { ...prev }; delete next.actual_out; return next; });
                    }}
                  >
                    Change to {formatTime12(pmSuggestion)}
                  </button>
                )}
              </Field>
            </div>
          </div>
        )}

        {needsTimes && v.actual_in && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Late" value={calc.lateMinutes ? `${calc.lateMinutes} min` : "On time"} tone={calc.lateMinutes ? "warning" : "success"} />
            <Metric label="Early departure" value={v.actual_out && !outBeforeIn ? (calc.earlyLeaveMinutes ? `${calc.earlyLeaveMinutes} min` : "None") : "—"} tone={calc.earlyLeaveMinutes && !outBeforeIn ? "danger" : "neutral"} />
            <Metric label="Working hours" value={v.actual_out && !outBeforeIn ? formatDuration(calc.workMinutes) : "—"} tone="neutral" />
            <Metric label="Status" value={ATTENDANCE_STATUS_LABELS[calc.status]} tone={calc.status === "late" ? "warning" : "success"} />
          </div>
        )}

        {showLate && (
          <div className="grid gap-4 rounded-xl border border-warning/30 bg-warning-soft/50 p-4 sm:grid-cols-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning sm:col-span-2">
              <AlarmClock className="size-4" /> Arrived {calc.lateMinutes} minutes late
            </p>
            <Field label="Late reason" htmlFor="late_reason" required={policy.lateReasonRequired} error={errors.late_reason}>
              <NativeSelect id="late_reason" className="h-10" value={v.late_reason} onChange={set("late_reason")} aria-invalid={!!errors.late_reason}>
                <option value="">Select reason…</option>
                {LATE_REASONS.map((r) => <option key={r} value={r}>{LATE_REASON_LABELS[r]}</option>)}
              </NativeSelect>
            </Field>
            <Field
              label="Late reason details"
              htmlFor="late_note"
              required={v.late_reason === "other" && policy.noteRequiredForOther}
              error={errors.late_reason_note}
            >
              <Input id="late_note" className="h-10" value={v.late_reason_note} onChange={set("late_reason_note")} maxLength={500} placeholder="Additional explanation" />
            </Field>
          </div>
        )}

        <Field label="Additional notes" htmlFor="att_notes">
          <Textarea id="att_notes" rows={2} value={v.notes} onChange={set("notes")} maxLength={1000} />
        </Field>

        {mode === "admin" && v.id && (
          <Field label="Reason for correction" htmlFor="change_reason" required error={errors.change_reason} hint="Saved in the correction history.">
            <Input id="change_reason" value={v.change_reason} onChange={set("change_reason")} maxLength={300} />
          </Field>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="submit" size="lg" className="h-11 min-w-44 text-base" disabled={pending || !employee}>
            {pending ? <Loader2 className="animate-spin" /> : v.id ? <Save /> : <CheckCircle2 />}
            {v.id ? "Update attendance" : "Save attendance"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "success" && "border-success/20 bg-success-soft",
        tone === "warning" && "border-warning/25 bg-warning-soft",
        tone === "danger" && "border-danger/20 bg-danger-soft",
      )}
    >
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("tabular text-sm font-semibold", tone === "success" && "text-success", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}
