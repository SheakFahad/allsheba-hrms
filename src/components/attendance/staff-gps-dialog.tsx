"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/shared/field";
import { EmployeePicker, type PickerEmployee } from "@/components/shared/employee-picker";
import { readLocation } from "@/app/me/self-check";
import { staffGpsAttendance } from "@/lib/attendance-actions";
import { LATE_REASON_LABELS, LATE_REASONS } from "@/lib/constants";
import type { LateReason } from "@/lib/types";

/**
 * Admin / entry operator records an employee's check-in or check-out with the
 * GPS of their own device. Works only inside the office (checked on the
 * server); the time is the server time.
 */
export function StaffGpsDialog({ employees, maxAccuracy }: { employees: PickerEmployee[]; maxAccuracy: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [employee, setEmployee] = React.useState<string | null>(null);
  const [lateReason, setLateReason] = React.useState<LateReason | "">("");
  const [lateNote, setLateNote] = React.useState("");
  const [busy, setBusy] = React.useState<null | "check_in" | "check_out">(null);
  const [status, setStatus] = React.useState<string | null>(null);

  async function run(kind: "check_in" | "check_out") {
    if (!employee) return void toast.error("Select an employee.");
    if (!window.isSecureContext || !("geolocation" in navigator)) return void toast.error("Location is not available on this device.");
    setBusy(kind);
    setStatus("Detecting your current location...");
    try {
      let coords: GeolocationCoordinates;
      try {
        coords = await readLocation(maxAccuracy);
      } catch (e) {
        const code = (e as GeolocationPositionError)?.code;
        setStatus(null);
        return void toast.error(code === 1 ? "Location permission is required." : "Unable to detect your current location. Please try again.");
      }
      setStatus("Verifying attendance...");
      const res = await staffGpsAttendance({
        employee_id: employee, kind,
        latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy,
        late_reason: kind === "check_in" ? lateReason : "", late_note: kind === "check_in" ? lateNote : "",
      });
      setStatus(null);
      if (!res.ok) return void toast.error(/late reason/i.test(res.error) ? "Late arrival: select the late reason, then try again." : res.error);
      const r = res.data!;
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message, { description: r.late_minutes ? `${r.late_minutes} min late` : undefined });
      setEmployee(null);
      setLateReason("");
      setLateNote("");
      router.refresh();
    } finally {
      setBusy(null);
      setStatus(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><MapPin /> GPS check-in</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>GPS check-in / check-out</DialogTitle>
          <DialogDescription>For an employee who forgot. Use your phone inside the office — your location is verified and the time is taken from the server.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Employee" htmlFor="sg_emp" required>
            <EmployeePicker id="sg_emp" employees={employees} value={employee} onChange={setEmployee} />
          </Field>
          <Field label="Late reason (if late)" htmlFor="sg_late">
            <NativeSelect id="sg_late" value={lateReason} onChange={(e) => setLateReason(e.target.value as LateReason | "")}>
              <option value="">—</option>
              {LATE_REASONS.map((r) => <option key={r} value={r}>{LATE_REASON_LABELS[r]}</option>)}
            </NativeSelect>
          </Field>
          {lateReason && (
            <Field label="Details" htmlFor="sg_note">
              <Input id="sg_note" value={lateNote} onChange={(e) => setLateNote(e.target.value)} maxLength={500} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button className="h-11" disabled={!!busy} onClick={() => run("check_in")}>
              {busy === "check_in" ? <Loader2 className="animate-spin" /> : <LogIn />} Check In
            </Button>
            <Button className="h-11" variant="outline" disabled={!!busy} onClick={() => run("check_out")}>
              {busy === "check_out" ? <Loader2 className="animate-spin" /> : <LogOut />} Check Out
            </Button>
          </div>
          {status && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {status}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
