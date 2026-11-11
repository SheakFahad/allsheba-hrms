import { cn } from "@/lib/utils";
import {
  ATTENDANCE_STATUS_LABELS, ATTENDANCE_TONE, CORRECTION_STATUS_LABELS,
  EMPLOYMENT_STATUS_LABELS, LEAVE_STATUS_LABELS, type Tone,
} from "@/lib/constants";
import type { AttendanceStatus, CorrectionStatus, EmploymentStatus, LeaveStatus } from "@/lib/types";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
  brand: "bg-brand-soft text-brand-deep ring-brand-deep/20 dark:text-brand",
  neutral: "bg-muted text-muted-foreground ring-border",
};

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  return <ToneBadge tone={ATTENDANCE_TONE[status]}>{ATTENDANCE_STATUS_LABELS[status]}</ToneBadge>;
}

const LEAVE_TONE: Record<LeaveStatus, Tone> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };
export function LeaveBadge({ status }: { status: LeaveStatus }) {
  return <ToneBadge tone={LEAVE_TONE[status]}>{LEAVE_STATUS_LABELS[status]}</ToneBadge>;
}

const CORR_TONE: Record<CorrectionStatus, Tone> = { applied: "info", pending: "warning", approved: "success", rejected: "danger" };
export function CorrectionBadge({ status }: { status: CorrectionStatus }) {
  return <ToneBadge tone={CORR_TONE[status]}>{CORRECTION_STATUS_LABELS[status]}</ToneBadge>;
}

const EMP_TONE: Record<EmploymentStatus, Tone> = {
  active: "success", on_notice: "warning", suspended: "danger", resigned: "neutral", terminated: "neutral",
};
export function EmploymentBadge({ status, archived }: { status: EmploymentStatus; archived?: boolean }) {
  if (archived) return <ToneBadge tone="neutral">Archived</ToneBadge>;
  return <ToneBadge tone={EMP_TONE[status]}>{EMPLOYMENT_STATUS_LABELS[status]}</ToneBadge>;
}
