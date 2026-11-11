import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, FileText, Lock, SlidersHorizontal, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { requirePageRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { REPORTS, type ReportDef } from "@/lib/reports/catalog";
import { todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Print & PDF Center" };

const GROUPS = [
  { key: "company", label: "Company reports", icon: Building2 },
  { key: "individual", label: "Individual reports", icon: User },
  { key: "custom", label: "Custom", icon: SlidersHorizontal },
] as const;

/** Ready-to-print link for reports that need no mandatory input; others open the builder preset. */
function hrefFor(r: ReportDef, today: string) {
  if (r.required?.length) return `/admin/reports?type=${r.id}`;
  const qs = new URLSearchParams({ type: r.id });
  if (r.needs.includes("date")) qs.set("date", today);
  else if (r.needs.includes("month")) qs.set("month", today.slice(0, 7));
  else if (r.needs.includes("year")) qs.set("year", today.slice(0, 4));
  return `/admin/reports/view?${qs}`;
}

export default async function PrintCenterPage() {
  await requirePageRole("admin");
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  return (
    <>
      <PageHeader
        title="Print & PDF Center"
        description="Every report template in one place. Each opens a print preview with Print, PDF, Excel and CSV."
      />
      <div className="grid gap-8">
        {GROUPS.map((g) => (
          <section key={g.key}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><g.icon className="size-4 text-brand" /> {g.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {REPORTS.filter((r) => r.category === g.key).map((r) => (
                <Card key={r.id} className="group relative gap-0 p-4 transition-colors hover:border-brand/40">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-deep dark:text-brand">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={hrefFor(r, today)} className="font-medium after:absolute after:inset-0">
                        {r.label}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                      <p className="mt-2 flex items-center gap-2 text-xs font-medium text-brand">
                        {r.required?.length ? "Choose options" : "Open preview"} <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                        {r.sensitive && <span className="ml-auto inline-flex items-center gap-1 text-warning"><Lock className="size-3" /> Confidential</span>}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
