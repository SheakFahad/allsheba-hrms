"use client";

import { formatAmount } from "@/lib/format";
import type { VoucherBranding, VoucherData } from "./voucher-sheet";

const BRAND: [number, number, number] = [29, 111, 179];
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [110, 116, 128];

async function loadLogo(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(new URL(url, window.location.origin).toString());
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((ok, err) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = err;
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((ok) => {
      const img = new Image();
      img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => ok({ w: 1, h: 1 });
      img.src = data;
    });
    return { data, ...dims };
  } catch {
    return null;
  }
}

/** Two identical copies on one A4 page (top / bottom) with a cutting line. */
export async function downloadVoucherPdf(v: VoucherData, b: VoucherBranding) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210;
  const HALF = 148.5;
  const M = 10;
  const logo = await loadLogo(b.logoUrl);

  const copy = (y0: number, label: string) => {
    let y = y0 + 8;
    // Header
    let x = M;
    if (logo) {
      const h = 14;
      const w = Math.min((logo.w / logo.h) * h, 38);
      pdf.addImage(logo.data, "PNG", M, y - 1, w, w / (logo.w / logo.h));
      x = M + w + 4;
    }
    pdf.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK).text(b.name, x, y + 4);
    pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    const contact = [b.address, b.phone, b.email].filter(Boolean).join("  ·  ");
    if (contact) pdf.text(pdf.splitTextToSize(contact, W - x - 60)[0], x, y + 9);
    pdf.setFillColor(...BRAND).roundedRect(W - M - 52, y - 1, 52, 7, 1, 1, "F");
    pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(255, 255, 255).text(v.title.toUpperCase(), W - M - 26, y + 3.8, { align: "center" });
    pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED).text(label, W - M, y + 10, { align: "right" });
    y += 15;
    pdf.setDrawColor(...BRAND).setLineWidth(0.6).line(M, y, W - M, y);
    y += 5.5;

    // Voucher no / date
    pdf.setFontSize(9).setTextColor(...MUTED).setFont("helvetica", "normal").text("Voucher No:", M, y);
    if (v.blank) {
      pdf.setDrawColor(...MUTED).setLineWidth(0.2).line(M + 20, y + 0.8, M + 58, y + 0.8);
      pdf.setFont("helvetica", "normal").setTextColor(...MUTED).text("Date:", W - M - 48, y);
      pdf.line(W - M - 38, y + 0.8, W - M, y + 0.8);
      y += 8;
    } else {
      pdf.setFont("helvetica", "bold").setTextColor(...INK).text(v.voucherNo, M + 20, y);
      pdf.setFont("helvetica", "normal").setTextColor(...MUTED).text("Date:", W - M - 32, y);
      pdf.setFont("helvetica", "bold").setTextColor(...INK).text(v.date, W - M, y, { align: "right" });
      y += 5;
    }

    // Rows: two columns, `full` rows span the width, `choices` print tick boxes
    const colW = (W - 2 * M - 8) / 2;
    const rowH = v.blank ? 8 : 5.6;
    let col = 0;
    for (const r of v.rows) {
      if (r.full && col === 1) { y += rowH; col = 0; }
      const cx = M + col * (colW + 8);
      const w = r.full ? W - 2 * M : colW;
      pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED).text(r.label, cx, y);
      if (r.choices) {
        let bx = cx + 30;
        pdf.setTextColor(...INK).setDrawColor(...INK).setLineWidth(0.25);
        for (const c of r.choices) {
          pdf.rect(bx, y - 2.7, 3, 3);
          pdf.text(c, bx + 4.2, y);
          bx += 4.2 + pdf.getTextWidth(c) + 6;
        }
      } else {
        if (r.value || !v.blank) pdf.setFont("helvetica", "bold").setTextColor(...INK).text(pdf.splitTextToSize(r.value || "-", w - 30)[0], cx + 30, y);
        if (v.blank) pdf.setDrawColor(...MUTED).setLineWidth(0.2).line(cx, y + 1.3, cx + w, y + 1.3);
        else pdf.setDrawColor(210, 210, 210).setLineWidth(0.1).setLineDashPattern([0.5, 0.8], 0).line(cx, y + 1.3, cx + w, y + 1.3).setLineDashPattern([], 0);
      }
      if (r.full || col === 1) { y += rowH; col = 0; } else col = 1;
    }
    if (col === 1) y += rowH;
    y += 1.5;

    // Details
    if (v.details) {
      pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED).text(v.details.label, M, y);
      const boxH = v.blank ? 16 : 12;
      if (v.blank) pdf.setDrawColor(...MUTED).setLineWidth(0.2);
      else pdf.setDrawColor(220, 220, 220);
      pdf.roundedRect(M, y + 1.2, W - 2 * M, boxH, 1, 1);
      if (!v.blank) pdf.setTextColor(...INK).text(pdf.splitTextToSize(v.details.value || "-", W - 2 * M - 4).slice(0, 3), M + 2, y + 5);
      y += boxH + 4;
    }

    // Amount + words
    pdf.setDrawColor(...INK).setLineWidth(0.5).roundedRect(M, y, 58, 9, 1, 1);
    pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED).text("Amount", M + 2.5, y + 5.8);
    if (v.blank) {
      pdf.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(...INK).text("BDT", M + 16, y + 6);
      pdf.setDrawColor(...MUTED).setLineWidth(0.2).roundedRect(M + 61, y, W - 2 * M - 61, 9, 1, 1);
    } else {
      pdf.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(...INK).text(`BDT ${formatAmount(v.amount)}`, M + 56, y + 6, { align: "right" });
      pdf.setFillColor(242, 242, 242).roundedRect(M + 61, y, W - 2 * M - 61, 9, 1, 1, "F");
    }
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED).text("In words", M + 63.5, y + 5.6);
    if (!v.blank) pdf.setFont("helvetica", "bolditalic").setFontSize(8.5).setTextColor(...INK)
      .text(pdf.splitTextToSize(v.amountWords, W - 2 * M - 80)[0], M + 78, y + 5.6);

    // Signatures (bottom of the half)
    const sy = y0 + HALF - 15;
    const n = v.signatures.length;
    const gap = 5;
    const sw = (W - 2 * M - gap * (n - 1)) / n;
    v.signatures.forEach((s, i) => {
      const sx = M + i * (sw + gap);
      if (s.name) pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...INK).text(pdf.splitTextToSize(s.name, sw)[0], sx + sw / 2, sy - 1.5, { align: "center" });
      pdf.setDrawColor(...INK).setLineWidth(0.3).line(sx, sy, sx + sw, sy);
      pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED).text(s.label, sx + sw / 2, sy + 4, { align: "center" });
    });
    const note = v.status === "confirmed" ? "Payment confirmed" : v.status === "cancelled" ? "CANCELLED" : "Payment not yet confirmed";
    pdf.setFontSize(6.5).setTextColor(160, 160, 160)
      .text(v.blank ? "Manual voucher · fill in by hand" : `${note} · System generated voucher`, W - M, y0 + HALF - 4, { align: "right" });

    if (v.status === "cancelled") {
      pdf.setFont("helvetica", "bold").setFontSize(48).setTextColor(240, 200, 200).text("CANCELLED", W / 2, y0 + HALF / 2 + 8, { align: "center", angle: 12 });
    }
  };

  copy(0, "Office Copy");
  // Cutting line
  pdf.setDrawColor(130, 130, 130).setLineWidth(0.25).setLineDashPattern([2, 1.5], 0).line(4, HALF, W - 4, HALF).setLineDashPattern([], 0);
  pdf.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(130, 130, 130);
  pdf.setFillColor(255, 255, 255).rect(W / 2 - 9, HALF - 2, 18, 4, "F");
  pdf.text("CUT HERE", W / 2, HALF + 0.9, { align: "center" });
  copy(HALF, "Receiver Copy");

  pdf.setProperties({ title: v.blank ? `${v.title} (blank)` : `${v.title} ${v.voucherNo}`, author: b.name });
  pdf.save(`${v.fileName}.pdf`);
}
