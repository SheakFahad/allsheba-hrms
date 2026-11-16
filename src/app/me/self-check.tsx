"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, LogOut, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/shared/field";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { LATE_REASON_LABELS, LATE_REASONS } from "@/lib/constants";
import { formatDuration, formatTime12, nowHHMM, timeToMinutes } from "@/lib/time";
import type { AttendanceStatus, LateReason } from "@/lib/types";
import { cn } from "@/lib/utils";
import { selfAttendance } from "./actions";

export interface SelfContext {
  employee: { id: string; code: string; name: string; department: string | null };
  today: string;
  server_time: string;
  timezone: string;
  flexible: boolean;
  schedule: { in: string | null; out: string | null; grace: number };
  weekly_off: boolean;
  holiday: string | null;
  enabled: boolean;
  gps_required: boolean;
  office_name: string;
  office_configured: boolean;
  radius_m: number;
  max_accuracy_m: number;
  late_reason_required: boolean;
  late_note_required_for_other: boolean;
  record: {
    status: AttendanceStatus;
    actual_in: string | null;
    actual_out: string | null;
    late_minutes: number;
    work_minutes: number;
    entry_method: "operator" | "self_gps" | "self";
  } | null;
}

type Kind = "check_in" | "check_out";

/** The exact status messages shown to employees. */
const MSG = {
  detecting: "Detecting your current location...",
  verifying: "Verifying attendance...",
  success: "Current location verified. Attendance successful.",
  successNoGps: "Attendance successful.",
  outside: "You are outside the authorized office location.",
  denied: "Location permission is required for attendance.",
  unavailable: "Unable to detect your current location. Please try again.",
  accuracy: "Location accuracy is insufficient. Please try again.",
  network: "Attendance could not be verified. Please check your connection and try again.",
} as const;

type Status =
  | { kind: "idle" }
  | { kind: "busy"; action: Kind; text: string }
  | { kind: "error"; action: Kind; text: string; retry: boolean };

/**
 * Reads the device location once, right after the button press.
 * Watches for up to `maxWaitMs` so the device can refine its first fix, stops as
 * soon as the required accuracy is reached, then stops listening. No background
 * tracking and no fabricated coordinates.
 */
function readLocation(requiredAccuracy: number, maxWaitMs = 10000): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    let best: GeolocationCoordinates | null = null;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      fn();
    };
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.accuracy) best = pos.coords;
        if (pos.coords.accuracy <= requiredAccuracy) finish(() => resolve(pos.coords));
      },
      (err) => finish(() => (best ? resolve(best) : reject(err))),
      { enableHighAccuracy: true, timeout: maxWaitMs + 5000, maximumAge: 0 },
    );
    const timer = setTimeout(
      () => finish(() => (best ? resolve(best) : reject({ code: 3 } as GeolocationPositionError))),
      maxWaitMs,
    );
  });
}

export function SelfCheck({ ctx }: { ctx: SelfContext }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const [lateReason, setLateReason] = React.useState<LateReason | "">("");
  const [lateNote, setLateNote] = React.useState("");
  const [needsReason, setNeedsReason] = React.useState(false);
  /** How long the last attempt took (shown small, for speed testing). */
  const [lastTiming, setLastTiming] = React.useState<string | null>(null);

  const rec = ctx.record;
  const canCheckIn = !rec;
  const canCheckOut = !!rec?.actual_in && !rec.actual_out && rec.entry_method !== "operator";
  const busy = status.kind === "busy";

  // Late preview for check-in (the server trigger remains authoritative).
  const lateNow =
    !ctx.flexible && !!ctx.schedule.in &&
    timeToMinutes(nowHHMM(ctx.timezone)) - timeToMinutes(ctx.schedule.in) > ctx.schedule.grace;
  const showLateReason = canCheckIn && ctx.late_reason_required && (lateNow || needsReason);
  const lateAfter = !ctx.flexible && ctx.schedule.in ? addMinutes(ctx.schedule.in, ctx.schedule.grace) : null;

  // Live clock (display only — the recorded time always comes from the server).
  const [clock, setClock] = React.useState(() => nowHHMM(ctx.timezone));
  React.useEffect(() => {
    const id = setInterval(() => setClock(nowHHMM(ctx.timezone)), 15000);
    return () => clearInterval(id);
  }, [ctx.timezone]);

  // Safety net (seen on iPhone Safari): if the saved record is already on screen,
  // the request is finished — never leave the button spinning.
  const recKey = `${rec?.actual_in ?? ""}|${rec?.actual_out ?? ""}`;
  const seenKey = React.useRef(recKey);
  React.useEffect(() => {
    if (seenKey.current === recKey) return;
    seenKey.current = recKey;
    setStatus((s) => (s.kind === "busy" ? { kind: "idle" } : s));
  }, [recKey]);

  const fail = (action: Kind, text: string, retry = true) => {
    setStatus({ kind: "error", action, text, retry });
    toast.error(text);
  };

  async function run(action: Kind) {
    if (action === "check_in" && showLateReason) {
      if (!lateReason) return fail(action, "Select the reason you are late.", false);
      if (lateReason === "other" && ctx.late_note_required_for_other && lateNote.trim().length < 3)
        return fail(action, "Please describe the reason.", false);
    }

    let coords: GeolocationCoordinates | null = null;
    let locateMs: number | null = null;
    if (ctx.gps_required) {
      if (!window.isSecureContext || !("geolocation" in navigator)) return fail(action, MSG.unavailable);
      setStatus({ kind: "busy", action, text: MSG.detecting });
      const t0 = performance.now();
      try {
        coords = await readLocation(ctx.max_accuracy_m);
        locateMs = Math.round(performance.now() - t0);
      } catch (e) {
        const code = (e as GeolocationPositionError)?.code;
        return fail(action, code === 1 ? MSG.denied : MSG.unavailable);
      }
    }

    setStatus({ kind: "busy", action, text: MSG.verifying });
    const t1 = performance.now();
    let res: Awaited<ReturnType<typeof selfAttendance>>;
    try {
      const call = selfAttendance({
        kind: action,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        accuracy: coords?.accuracy ?? null,
        late_reason: action === "check_in" ? lateReason : "",
        late_note: action === "check_in" ? lateNote : "",
      });
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 25000));
      res = await Promise.race([call, timeout]);
    } catch (e) {
      if ((e as Error)?.message === "timeout") {
        router.refresh(); // it may have been saved — the refreshed page shows the record if so
        return fail(action, "No reply from the server yet. Check the list below before trying again.", false);
      }
      return fail(action, MSG.network);
    }
    const timing = `${locateMs !== null ? `Location ${(locateMs / 1000).toFixed(1)} s · ` : ""}Server ${((performance.now() - t1) / 1000).toFixed(1)} s`;
    setLastTiming(timing);
    if (!res.ok) {
      if (/late reason/i.test(res.error)) {
        setNeedsReason(true);
        return fail(action, "Select the reason you are late.", false);
      }
      return fail(action, res.error);
    }

    const r = res.data!;
    if (r.ok) {
      setStatus({ kind: "idle" });
      toast.success(r.gps_verified ? MSG.success : MSG.successNoGps, {
        description: `${action === "check_in" ? "Checked in" : "Checked out"} at ${formatTime12(r.time)}${r.late_minutes ? ` · ${r.late_minutes} min late` : ""} · ${timing}`,
      });
      router.refresh();
      return;
    }
    if (r.result === "outside_radius") return fail(action, MSG.outside);
    if (r.result === "low_accuracy") return fail(action, MSG.accuracy);
    return fail(action, r.message, false); // already recorded / not checked in / office not set
  }

  if (!ctx.enabled) {
    return <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">Self check-in is turned off. Please record attendance with the office.</p>;
  }

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Today</p>
            <p className="text-xs text-muted-foreground">
              {ctx.flexible ? "Flexible schedule" : `Your shift ${formatTime12(ctx.schedule.in)} – ${formatTime12(ctx.schedule.out)} · late after ${ctx.schedule.grace} min`}
              {ctx.holiday ? ` · Holiday: ${ctx.holiday}` : ctx.weekly_off ? " · Your weekly holiday" : ""}
            </p>
          </div>
          {rec ? <AttendanceBadge status={rec.status} /> : <span className="text-xs font-medium text-muted-foreground">Not checked in</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TimeBox
            icon={<LogIn className="size-4 text-brand" />}
            title="Arrival"
            rows={ctx.flexible ? [] : [
              ["Scheduled in", formatTime12(ctx.schedule.in)],
              ...(lateAfter ? [["Late after", formatTime12(lateAfter)] as [string, string]] : []),
            ]}
            actualLabel="Actual in"
            actual={rec?.actual_in ? formatTime12(rec.actual_in) : null}
            extra={rec?.late_minutes ? `${rec.late_minutes} min late` : null}
          />
          <TimeBox
            icon={<LogOut className="size-4 text-brand" />}
            title="Departure"
            rows={ctx.flexible ? [] : [["Scheduled out", formatTime12(ctx.schedule.out)]]}
            actualLabel="Actual out"
            actual={rec?.actual_out ? formatTime12(rec.actual_out) : null}
            extra={rec?.work_minutes ? `Worked ${formatDuration(rec.work_minutes)}` : null}
          />
        </div>
        {!rec?.actual_out && (
          <p className="text-center text-xs text-muted-foreground">
            Now <span className="tabular font-semibold text-foreground" suppressHydrationWarning>{formatTime12(clock)}</span> · the time is taken automatically from the server when you press the button — it cannot be typed or changed.
          </p>
        )}
        {rec?.entry_method === "operator" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Today&apos;s attendance was recorded by the office.</p>
        )}

        {showLateReason && (
          <div className="grid gap-3 rounded-xl border border-warning/30 bg-warning-soft/50 p-3">
            <p className="text-sm font-semibold text-warning">You are late — please give a reason</p>
            <Field label="Late reason" htmlFor="me_late" required>
              <NativeSelect id="me_late" className="h-11" value={lateReason} onChange={(e) => setLateReason(e.target.value as LateReason | "")}>
                <option value="">Select reason…</option>
                {LATE_REASONS.map((r) => <option key={r} value={r}>{LATE_REASON_LABELS[r]}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Details" htmlFor="me_note" required={lateReason === "other" && ctx.late_note_required_for_other}>
              <Input id="me_note" className="h-11" value={lateNote} onChange={(e) => setLateNote(e.target.value)} maxLength={500} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" className="h-14 text-base" disabled={!canCheckIn || busy} onClick={() => run("check_in")}>
            {busy && status.action === "check_in" ? <Loader2 className="animate-spin" /> : <LogIn />} Check In
          </Button>
          <Button size="lg" variant="outline" className="h-14 text-base" disabled={!canCheckOut || busy} onClick={() => run("check_out")}>
            {busy && status.action === "check_out" ? <Loader2 className="animate-spin" /> : <LogOut />} Check Out
          </Button>
        </div>

        {/* Minimal status line (screen readers announce changes). */}
        <div aria-live="polite" className="min-h-5 text-sm">
          {status.kind === "busy" && (
            <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {status.text}</p>
          )}
          {status.kind !== "busy" && lastTiming && (
            <p className="mb-1 text-xs text-muted-foreground">Last attempt: {lastTiming}</p>
          )}
          {status.kind === "error" && (
            <p className={cn("flex flex-wrap items-center gap-2 text-danger")}>
              {status.text}
              {status.retry && (
                <Button variant="outline" size="xs" onClick={() => run(status.action)}><RotateCcw /> Try again</Button>
              )}
            </p>
          )}
        </div>

        {ctx.gps_required && !ctx.office_configured && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">The office location has not been set yet. Please contact the administrator.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Arrival / departure box, laid out like the operator's Quick Attendance form (read only). */
function TimeBox({ icon, title, rows, actualLabel, actual, extra }: {
  icon: React.ReactNode;
  title: string;
  rows: [string, string][];
  actualLabel: string;
  actual: string | null;
  extra: string | null;
}) {
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">{icon} {title}</p>
      {rows.map(([k, val]) => (
        <div key={k} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-sm">
          <span className="text-xs text-muted-foreground">{k}</span>
          <span className="tabular font-medium">{val}</span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-1.5 text-sm">
        <span className="text-xs text-muted-foreground">{actualLabel}</span>
        <span className={cn("tabular font-semibold", !actual && "text-muted-foreground")}>{actual ?? "—"}</span>
      </div>
      {extra && <p className="text-right text-[11px] text-muted-foreground">{extra}</p>}
    </div>
  );
}

/** "HH:MM" + minutes → "HH:MM". */
function addMinutes(hhmm: string, minutes: number) {
  const t = (timeToMinutes(hhmm) + minutes) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
