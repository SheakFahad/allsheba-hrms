"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, FileSpreadsheet, FileText, Loader2, Printer, RectangleHorizontal, RectangleVertical, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/time";
import { formatCell } from "@/lib/reports/format";
import { logReportExport } from "@/lib/reports/actions";
import type { ReportDocument, TableSection } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

/**
 * Preview of a report exactly as it will print, with Print / PDF / Excel / CSV
 * actions. Column visibility applies to every output format.
 */
export function ReportViewer({ doc: initial }: { doc: ReportDocument }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [orientation, setOrientation] = React.useState(initial.orientation);
  const primary = initial.sections.find((s): s is TableSection => s.kind === "table" && !!s.primary);
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);

  const doc: ReportDocument = React.useMemo(
    () => ({
      ...initial,
      orientation,
      sections: initial.sections.map((s) =>
        s === primary ? { ...s, columns: s.columns.filter((c) => !hidden.has(c.key)) } : s,
      ),
    }),
    [initial, orientation, hidden, primary],
  );

  async function run(format: "print" | "pdf" | "xlsx" | "csv") {
    setBusy(format);
    try {
      await logReportExport({ type: doc.type, format, title: doc.title, query: params.toString() });
      if (format === "print") {
        const style = document.createElement("style");
        style.textContent = `@page { size: A4 ${orientation}; }`;
        document.head.appendChild(style);
        window.print();
        setTimeout(() => style.remove(), 1000);
      } else {
        const m = await import("@/lib/reports/export-client");
        if (format === "pdf") await m.exportPdf(doc);
        if (format === "xlsx") await m.exportXlsx(doc);
        if (format === "csv") m.exportCsv(doc);
        toast.success(`${format.toUpperCase()} downloaded`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function setSort(key: string) {
    const next = new URLSearchParams(params.toString());
    const same = next.get("sort") === key;
    next.set("sort", key);
    next.set("dir", same && next.get("dir") !== "desc" ? "desc" : "asc");
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <Button onClick={() => run("print")} disabled={!!busy}>
          {busy === "print" ? <Loader2 className="animate-spin" /> : <Printer />} Print
        </Button>
        <Button variant="outline" onClick={() => run("pdf")} disabled={!!busy}>
          {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} PDF
        </Button>
        <Button variant="outline" onClick={() => run("xlsx")} disabled={!!busy}>
          {busy === "xlsx" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel
        </Button>
        <Button variant="outline" onClick={() => run("csv")} disabled={!!busy}>
          {busy === "csv" ? <Loader2 className="animate-spin" /> : <Sheet />} CSV
        </Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="Page orientation">
          {(["portrait", "landscape"] as const).map((o) => (
            <button
              key={o}
              role="radio"
              aria-checked={orientation === o}
              onClick={() => setOrientation(o)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium capitalize",
                orientation === o ? "bg-brand-soft text-brand-deep dark:text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o === "portrait" ? <RectangleVertical className="size-3.5" /> : <RectangleHorizontal className="size-3.5" />}
              A4 {o}
            </button>
          ))}
        </div>
        {primary && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost"><Columns3 /> Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {primary.columns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hidden.has(c.key)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) =>
                    setHidden((h) => {
                      const n = new Set(h);
                      if (v) n.delete(c.key);
                      else if (primary.columns.length - n.size > 1) n.add(c.key);
                      return n;
                    })
                  }
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {initial.sensitive && (
          <span className="ml-auto rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
            Confidential — exports are logged
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl bg-muted/50 p-3 sm:p-6 print:overflow-visible print:bg-transparent print:p-0">
        <article
          className={cn(
            "print-root mx-auto bg-white p-[12mm] text-[11px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/5",
            orientation === "landscape" ? "w-[297mm]" : "w-[210mm]",
          )}
        >
          <header className="mb-4 flex items-center gap-4 border-b-2 border-[#1d6fb3] pb-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- report logo keeps its natural aspect ratio */}
            <img src={doc.branding.logoUrl} alt={doc.branding.name} className="h-14 w-auto max-w-[45mm] object-contain" />
            <div className="min-w-0">
              <p className="text-base font-bold">{doc.branding.name}</p>
              <p className="text-[10px] text-neutral-500">
                {[doc.branding.address, doc.branding.phone, doc.branding.email, doc.branding.website].filter(Boolean).join("  ·  ")}
              </p>
            </div>
          </header>

          <div className="mb-3">
            <h1 className="text-lg font-bold">{doc.title}</h1>
            {doc.subtitle && <p className="text-xs text-neutral-600">{doc.subtitle}</p>}
            {doc.meta.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-x-5 text-[10px] text-neutral-600">
                {doc.meta.map((m) => (
                  <span key={m.label}><span className="font-semibold">{m.label}:</span> {m.value}</span>
                ))}
              </p>
            )}
          </div>

          {doc.sections.map((s, i) => {
            if (s.kind === "kv")
              return (
                <section key={i} className="print-avoid-break mb-4">
                  {s.title && <h2 className="mb-1.5 text-xs font-bold text-[#1d6fb3]">{s.title}</h2>}
                  <dl className={cn("grid gap-x-6 gap-y-1", orientation === "landscape" ? "grid-cols-3" : "grid-cols-2")}>
                    {s.items.map((it) => (
                      <div key={it.label} className="flex gap-2">
                        <dt className="w-32 shrink-0 text-neutral-500">{it.label}</dt>
                        <dd className="font-semibold">{it.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            if (s.kind === "note") return <p key={i} className="mb-3 text-[10px] text-neutral-600">{s.text}</p>;
            if (s.kind === "signatures")
              return (
                <section key={i} className="print-avoid-break mt-14 flex gap-8">
                  {s.labels.map((l) => (
                    <div key={l} className="flex-1 border-t border-neutral-800 pt-1 text-center text-[10px]">{l}</div>
                  ))}
                </section>
              );
            return (
              <section key={i} className="mb-4">
                {s.title && <h2 className="mb-1.5 text-xs font-bold text-[#1d6fb3]">{s.title}</h2>}
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-[#1d6fb3] text-white">
                      {s.columns.map((c) => (
                        <th
                          key={c.key}
                          className={cn("border border-[#1d6fb3] px-1.5 py-1 font-semibold", c.align === "right" ? "text-right" : "text-left")}
                        >
                          {s.primary ? (
                            <button className="no-print-underline hover:underline" onClick={() => setSort(c.key)} title="Sort">
                              {c.label}
                            </button>
                          ) : c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.length === 0 ? (
                      <tr><td colSpan={s.columns.length} className="border border-neutral-200 px-2 py-4 text-center text-neutral-500">No records for the selected criteria.</td></tr>
                    ) : (
                      s.rows.map((r, ri) => (
                        <tr key={ri} className="odd:bg-white even:bg-neutral-50">
                          {s.columns.map((c) => (
                            <td
                              key={c.key}
                              className={cn("border border-neutral-200 px-1.5 py-[3px] align-top", c.align === "right" && "text-right tabular-nums")}
                            >
                              {formatCell(r[c.key] ?? null, c.format)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {s.totals && (
                    <tfoot>
                      <tr className="bg-neutral-100 font-bold">
                        {s.columns.map((c, ci) => (
                          <td key={c.key} className={cn("border border-neutral-200 px-1.5 py-1", c.align === "right" && "text-right tabular-nums")}>
                            {s.totals![c.key] !== undefined ? formatCell(s.totals![c.key], ci === 0 ? "text" : c.format) : ""}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </section>
            );
          })}

          <footer className="mt-6 flex justify-between border-t border-neutral-200 pt-2 text-[9px] text-neutral-500">
            <span>{doc.branding.footer}</span>
            <span>Generated {formatDateTime(doc.generatedAt, doc.timezone)} by {doc.generatedBy}</span>
          </footer>
        </article>
      </div>
    </div>
  );
}
