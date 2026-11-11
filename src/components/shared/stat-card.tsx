import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/constants";

const ICON_TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand-deep dark:text-brand",
  neutral: "bg-muted text-muted-foreground",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "info",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-xs", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ICON_TONE[tone])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
