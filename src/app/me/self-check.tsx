"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, Crosshair, Loader2, LogIn, LogOut, MapPin, MapPinOff, RotateCcw, ShieldCheck, Timer, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/shared/field";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { LATE_REASON_LABELS, LATE_REASONS } from "@/lib/constants";
import { formatDuration, formatTime12, nowHHMM, timeToMinutes } from "@/lib/time";
import type { AttendanceStatus, LateReason } from "@/lib/types";
import { cn } from "@/lib/utils";
import { selfAttendance, type SelfAttendanceResult } from "./actions";

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
type Phase =
  | { step: "idle" }
  | { step: "locating"; kind: Kind }
  | { step: "submitting"; kind: Kind }
  | { step: "done"; kind: Kind; result: SelfAttendanceResult; locateMs: number | null; serverMs: number }
  | { step: "geo_error"; kind: Kind; code: "denied" | "unavailable" | "timeout" | "unsupported" | "insecure" }
  | { step: "error"; kind: Kind; message: string };

const GEO_MESSAGES: Record<"denied" | "unavailable" | "timeout" | "unsupported" | "insecure", { title: string; body: string }> = {
  denied: {
    title: "Location permission denied",
    body: "Attendance needs your location only at this moment. Allow location for this site (tap the lock icon in the address bar → Location → Allow), then try again.",
  },
  unavailable: { title: "Location unavailable", body: "Turn on your device's location / GPS and try again. Indoors, move near a window." },
  timeout: { title: "Location took too long", body: "Your device could not get a fix in time. Move near a window or outdoors and try again." },
  unsupported: { title: "Location not supported", body: "This browser cannot share location. Use an up-to-date Chrome, Edge, Safari or Firefox." },
  insecure: { title: "Secure connection required", body: "Location only works on a secure (https) page." },
};

/** One-shot, high-accuracy location read. Never tracks continuously. */
function readLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }),
  );
}

export function SelfCheck({ ctx }: { ctx: SelfContext }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>({ step: "idle" });
  const [lateReason, setLateReason] = React.useState<LateReason | "">("");
  const [lateNote, setLateNote] = React.useState("");
  const [needsReason, setNeedsReason] = React.useState(false);

  const rec = ctx.record;
  const canCheckIn = !rec;
  const canCheckOut = !!rec?.actual_in && !rec.actual_out && rec.entry_method !== "operator";
  const busy = phase.step === "locating" || phase.step === "submitting";

  // Late preview for check-in (the server trigger remains authoritative).
  const lateNow =
    !ctx.flexible && !!ctx.schedule.in &&
    timeToMinutes(nowHHMM(ctx.timezone)) - timeToMinutes(ctx.schedule.in) > ctx.schedule.grace;
  const showLateReason = canCheckIn && ctx.late_reason_required && (lateNow || needsReason);

  async function run(kind: Kind) {
    if (kind === "check_in" && showLateReason) {
      if (!lateReason) return setPhase({ step: "error", kind, message: "Select the reason you are late." });
      if (lateReason === "other" && ctx.late_note_required_for_other && lateNote.trim().length < 3)
        return setPhase({ step: "error", kind, message: "Please describe the reason." });
    }

    let coords: { latitude: number; longitude: number; accuracy: number } | null = null;
    let locateMs: number | null = null;
    if (ctx.gps_required) {
      if (!window.isSecureContext) return setPhase({ step: "geo_error", kind, code: "insecure" });
      if (!("geolocation" in navigator)) return setPhase({ step: "geo_error", kind, code: "unsupported" });
      setPhase({ step: "locating", kind });
      const t0 = performance.now();
      try {
        const pos = await readLocation();
        locateMs = Math.round(performance.now() - t0);
        coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
      } catch (e) {
        const err = e as GeolocationPositionError;
        const code = err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable";
        return setPhase({ step: "geo_error", kind, code });
      }
    }

    setPhase({ step: "submitting", kind });
    const t1 = performance.now();
    const res = await selfAttendance({
      kind,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      accuracy: coords?.accuracy ?? null,
      late_reason: kind === "check_in" ? lateReason : "",
      late_note: kind === "check_in" ? lateNote : "",
    });
    const serverMs = Math.round(performance.now() - t1);
    if (!res.ok) {
      if (/late reason/i.test(res.error)) setNeedsReason(true);
      return setPhase({ step: "error", kind, message: res.error });
    }
    const result = res.data!;
    setPhase({ step: "done", kind, result, locateMs, serverMs });
    if (result.ok) router.refresh();
  }

  if (!ctx.enabled) {
    return <Notice tone="warning" icon={AlertTriangle} title="Self check-in is turned off" body="Please record attendance with the office." />;
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Today</p>
              <p className="text-xs text-muted-foreground">
                {ctx.flexible ? "Flexible schedule" : `Office hours ${formatTime12(ctx.schedule.in)} – ${formatTime12(ctx.schedule.out)}`}
                {ctx.holiday ? ` · Holiday: ${ctx.holiday}` : ctx.weekly_off ? " · Your weekly holiday" : ""}
              </p>
            </div>
            {rec ? <AttendanceBadge status={rec.status} /> : <span className="text-xs font-medium text-muted-foreground">Not checked in</span>}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Check in" value={rec?.actual_in ? formatTime12(rec.actual_in) : "—"} />
            <Stat label="Check out" value={rec?.actual_out ? formatTime12(rec.actual_out) : "—"} />
            <Stat label="Worked" value={rec?.work_minutes ? formatDuration(rec.work_minutes) : "—"} />
          </div>
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
              {busy && phase.kind === "check_in" ? <Loader2 className="animate-spin" /> : <LogIn />} Check In
            </Button>
            <Button size="lg" variant="outline" className="h-14 text-base" disabled={!canCheckOut || busy} onClick={() => run("check_out")}>
              {busy && phase.kind === "check_out" ? <Loader2 className="animate-spin" /> : <LogOut />} Check Out
            </Button>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            {ctx.gps_required ? <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" /> : <MapPinOff className="mt-0.5 size-3.5 shrink-0" />}
            {ctx.gps_required
              ? `Your location is read once when you press a button and checked against ${ctx.office_name} (within ${ctx.radius_m} m, accuracy ${ctx.max_accuracy_m} m or better). It is never tracked in the background.`
              : "Location verification is turned off by the administrator. Your check-in is recorded without GPS."}
          </p>
          {ctx.gps_required && !ctx.office_configured && (
            <Notice tone="warning" icon={AlertTriangle} title="Office location not set" body="The administrator has not set the office location yet, so check-in cannot be verified." />
          )}
        </CardContent>
      </Card>

      <PhaseView phase={phase} onRetry={() => phase.step !== "idle" && run(phase.kind)} />
    </div>
  );
}

function PhaseView({ phase, onRetry }: { phase: Phase; onRetry: () => void }) {
  if (phase.step === "idle") return null;
  if (phase.step === "locating")
    return <Notice tone="info" icon={Crosshair} spin title="Getting your location…" body="Allow location access if your browser asks." />;
  if (phase.step === "submitting")
    return <Notice tone="info" icon={Loader2} spin title="Verifying with the server…" />;
  if (phase.step === "geo_error") {
    const m = GEO_MESSAGES[phase.code];
    return <Notice tone="danger" icon={MapPinOff} title={m.title} body={m.body} action={<RetryButton onRetry={onRetry} />} />;
  }
  if (phase.step === "error") return <Notice tone="danger" icon={XCircle} title="Not saved" body={phase.message} action={<RetryButton onRetry={onRetry} />} />;

  const r = phase.result;
  const metrics = (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
      {r.distance_m !== null && <span><span className="text-muted-foreground">Distance:</span> <b className="tabular">{Math.round(r.distance_m)} m</b> / {r.radius_m} m</span>}
      {r.accuracy_m !== null && <span><span className="text-muted-foreground">Accuracy:</span> <b className="tabular">{Math.round(r.accuracy_m)} m</b> / {r.max_accuracy_m} m</span>}
      {phase.locateMs !== null && <span><span className="text-muted-foreground">Location:</span> <b className="tabular">{(phase.locateMs / 1000).toFixed(1)} s</b></span>}
      <span><Timer className="mr-1 inline size-3" /><span className="text-muted-foreground">Server:</span> <b className="tabular">{phase.serverMs} ms</b></span>
    </div>
  );
  if (r.ok)
    return (
      <Notice
        tone="success"
        icon={CheckCircle2}
        title={`${phase.kind === "check_in" ? "Checked in" : "Checked out"} at ${formatTime12(r.time)}${r.gps_verified ? " · GPS verified" : ""}`}
        body={r.late_minutes ? `${r.late_minutes} minutes late.` : undefined}
        extra={metrics}
      />
    );
  const retryable = r.result === "low_accuracy" || r.result === "outside_radius";
  return (
    <Notice
      tone={r.result === "duplicate" ? "info" : "danger"}
      icon={r.result === "outside_radius" ? MapPin : r.result === "duplicate" ? CheckCircle2 : XCircle}
      title={r.result === "outside_radius" ? "Outside the office area" : r.result === "low_accuracy" ? "Location not accurate enough" : r.result === "duplicate" ? "Already recorded" : "Not saved"}
      body={r.message}
      extra={metrics}
      action={retryable ? <RetryButton onRetry={onRetry} /> : undefined}
    />
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return <Button variant="outline" size="sm" onClick={onRetry}><RotateCcw /> Try again</Button>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular text-sm font-semibold">{value}</p>
    </div>
  );
}

function Notice({
  tone, icon: Icon, title, body, extra, action, spin,
}: {
  tone: "success" | "danger" | "warning" | "info";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  extra?: React.ReactNode;
  action?: React.ReactNode;
  spin?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-sm",
        tone === "success" && "border-success/25 bg-success-soft text-success",
        tone === "danger" && "border-danger/25 bg-danger-soft text-danger",
        tone === "warning" && "border-warning/30 bg-warning-soft text-warning",
        tone === "info" && "border-info/20 bg-info-soft text-info",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", spin && "animate-spin")} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {body && <p className="mt-0.5 text-foreground/80">{body}</p>}
        {extra && <div className="text-foreground/80">{extra}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
