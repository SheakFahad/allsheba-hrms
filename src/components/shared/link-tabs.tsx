import Link from "next/link";
import { cn } from "@/lib/utils";

/** Server-rendered tabs driven by a URL search param (shareable, no client JS). */
export function LinkTabs({
  tabs,
  active,
  baseHref,
  param = "tab",
  keep,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  baseHref: string;
  param?: string;
  keep?: Record<string, string | undefined>;
}) {
  return (
    <nav className="no-print -mx-1 mb-5 flex gap-1 overflow-x-auto border-b px-1" aria-label="Sections">
      {tabs.map((t) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(keep ?? {})) if (v) qs.set(k, v);
        if (t.key !== tabs[0].key) qs.set(param, t.key);
        const href = qs.toString() ? `${baseHref}?${qs}` : baseHref;
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="tabular ml-1.5 text-xs text-muted-foreground">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
