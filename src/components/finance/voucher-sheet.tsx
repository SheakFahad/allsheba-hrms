"use client";

import * as React from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface VoucherData {
  title: string;
  voucherNo: string;
  date: string;
  status: "pending" | "confirmed" | "cancelled";
  /** Two-column information grid (label → value). `full` spans both columns; `choices` prints tick boxes. */
  rows: { label: string; value: string; full?: boolean; choices?: string[] }[];
  details?: { label: string; value: string } | null;
  amount: number;
  amountWords: string;
  signatures: { label: string; name?: string | null }[];
  fileName: string;
  /** Blank form for filling in by hand with a pen (no values, writing space instead). */
  blank?: boolean;
}

export interface VoucherBranding {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
}

const COPY_LABELS = ["Office Copy", "Receiver Copy"] as const;
const STATUS_NOTE: Record<VoucherData["status"], string> = {
  pending: "Payment not yet confirmed",
  confirmed: "Payment confirmed",
  cancelled: "CANCELLED",
};

/** One voucher (half of an A4 sheet). */
function VoucherCopy({ v, b, copy }: { v: VoucherData; b: VoucherBranding; copy: string }) {
  const blankLine = <span className="inline-block w-[38mm] border-b border-neutral-500 align-bottom">&nbsp;</span>;
  return (
    <div className="relative flex h-full flex-col px-[10mm] pt-[7mm] pb-[6mm] text-[10.5px] leading-snug text-neutral-900">
      {v.status === "cancelled" && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[64px] font-black tracking-widest text-red-600/15 -rotate-12">
          CANCELLED
        </span>
      )}
      <header className="flex items-start gap-3 border-b-2 border-[#1d6fb3] pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- original logo, natural aspect ratio */}
        <img src={b.logoUrl} alt={b.name} className="h-[15mm] w-auto max-w-[40mm] object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">{b.name}</p>
          <p className="text-[9px] text-neutral-500">{[b.address, b.phone, b.email].filter(Boolean).join("  ·  ")}</p>
        </div>
        <div className="text-right">
          <p className="rounded bg-[#1d6fb3] px-2 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase">{v.title}</p>
          <p className="mt-1 text-[9px] text-neutral-500">{copy}</p>
        </div>
      </header>

      <div className="mt-2 flex justify-between text-[11px]">
        <p><span className="text-neutral-500">Voucher No:</span> {v.blank ? blankLine : <b className="tabular-nums">{v.voucherNo}</b>}</p>
        <p><span className="text-neutral-500">Date:</span> {v.blank ? blankLine : <b className="tabular-nums">{v.date}</b>}</p>
      </div>

      <dl className={cn("mt-1.5 grid grid-cols-2 gap-x-6", v.blank ? "gap-y-0" : "gap-y-1")}>
        {v.rows.map((r) => (
          <div
            key={r.label}
            className={cn(
              "flex items-end gap-2 pb-0.5",
              r.full && "col-span-2",
              !r.choices && (v.blank ? "border-b border-neutral-500" : "border-b border-dotted border-neutral-300"),
              v.blank && "min-h-[8mm]",
            )}
          >
            <dt className="w-[28mm] shrink-0 text-neutral-500">{r.label}</dt>
            <dd className="min-w-0 flex-1 font-semibold break-words">
              {r.choices ? (
                <span className="flex flex-wrap gap-x-4 gap-y-1 font-normal">
                  {r.choices.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5">
                      <span className="inline-block size-[3.2mm] border border-neutral-700" />
                      {c}
                    </span>
                  ))}
                </span>
              ) : (
                r.value || (v.blank ? "" : "—")
              )}
            </dd>
          </div>
        ))}
      </dl>

      {v.details && (
        <div className="mt-1.5">
          <p className="text-neutral-500">{v.details.label}</p>
          <p className={cn("line-clamp-3 rounded border px-2 py-1 whitespace-pre-wrap", v.blank ? "min-h-[15mm] border-neutral-500" : "min-h-[9mm] border-neutral-200")}>
            {v.details.value || (v.blank ? "" : "—")}
          </p>
        </div>
      )}

      <div className="mt-2 flex items-stretch gap-3">
        <div className="flex items-center rounded border-2 border-neutral-900 px-3 py-1.5">
          <span className="mr-2 text-neutral-500">Amount</span>
          <span className="text-[15px] font-bold tabular-nums">BDT {v.blank ? <span className="inline-block w-[30mm]" /> : formatAmount(v.amount)}</span>
        </div>
        <div className={cn("flex flex-1 items-center rounded px-3 py-1.5", v.blank ? "border border-neutral-500" : "bg-neutral-100")}>
          <span className="mr-2 shrink-0 text-neutral-500">In words</span>
          <span className="font-semibold italic">{v.amountWords}</span>
        </div>
      </div>

      <div className="mt-auto flex gap-[5mm] pt-[11mm]">
        {v.signatures.map((s) => (
          <div key={s.label} className="flex-1 text-center">
            <p className="min-h-[4mm] truncate text-[9.5px] font-medium">{s.name ?? ""}</p>
            <div className="border-t border-neutral-800 pt-0.5 text-[9.5px] text-neutral-600">{s.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-right text-[8px] text-neutral-400">
        {v.blank ? "Manual voucher · fill in by hand" : `${STATUS_NOTE[v.status]} · System generated voucher`}
      </p>
    </div>
  );
}

/** A4 sheet with two identical voucher copies and a cutting line; Print and PDF. */
export function VoucherSheet({ v, b }: { v: VoucherData; b: VoucherBranding }) {
  const [busy, setBusy] = React.useState(false);

  function print() {
    const style = document.createElement("style");
    style.textContent = "@page { size: A4 portrait; margin: 0; }";
    document.head.appendChild(style);
    window.print();
    setTimeout(() => style.remove(), 1000);
  }

  async function pdf() {
    setBusy(true);
    try {
      const { downloadVoucherPdf } = await import("./voucher-pdf");
      await downloadVoucherPdf(v, b);
    } catch (e) {
      console.error(e);
      toast.error("PDF could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <Button onClick={print}><Printer /> Print (A4, 2 copies)</Button>
        <Button variant="outline" onClick={pdf} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Download />} Download PDF</Button>
        {!v.blank && (
          <span className={cn("ml-auto rounded-full px-2.5 py-1 text-xs font-medium",
            v.status === "confirmed" ? "bg-success-soft text-success" : v.status === "cancelled" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
            {STATUS_NOTE[v.status]}
          </span>
        )}
      </div>
      <p className="no-print text-xs text-muted-foreground">
        {v.blank
          ? "Blank form to fill in by hand. It is not saved in the system — enter the payment in the software later if it should count in reports."
          : "Printing does not mark anything as paid. Only an administrator can confirm a payment."}
      </p>

      <div className="overflow-x-auto rounded-xl bg-muted/50 p-3 sm:p-6 print:overflow-visible print:bg-transparent print:p-0">
        <article className="print-root mx-auto h-[297mm] w-[210mm] bg-white shadow-sm ring-1 ring-black/5 print:shadow-none print:ring-0">
          <div className="h-[148.5mm] overflow-hidden"><VoucherCopy v={v} b={b} copy={COPY_LABELS[0]} /></div>
          <div className="relative h-0 border-t border-dashed border-neutral-500">
            <span className="absolute -top-[2.2mm] left-1/2 -translate-x-1/2 bg-white px-2 text-[8px] tracking-widest text-neutral-500 uppercase">cut here</span>
          </div>
          <div className="h-[148.5mm] overflow-hidden"><VoucherCopy v={v} b={b} copy={COPY_LABELS[1]} /></div>
        </article>
      </div>
    </div>
  );
}
