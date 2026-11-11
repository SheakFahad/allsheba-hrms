"use client";

import { formatDateTime } from "@/lib/time";
import { excelNumFmt, excelValue, formatCell } from "./format";
import type { ReportDocument, TableSection } from "./types";

const BRAND: [number, number, number] = [29, 111, 179];
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [91, 100, 116];

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function loadImage(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = data;
    });
    return { data, ...dims };
  } catch {
    return null;
  }
}

function contactLine(doc: ReportDocument) {
  const b = doc.branding;
  return [b.address, b.phone, b.email, b.website].filter(Boolean).join("  ·  ");
}

/* ------------------------------------------------------------------ PDF */

export async function exportPdf(doc: ReportDocument) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: doc.orientation, unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 12;
  const logo = await loadImage(new URL(doc.branding.logoUrl, window.location.origin).toString());
  const HEADER_H = 26;
  const generated = formatDateTime(doc.generatedAt, doc.timezone);

  const drawChrome = () => {
    // Header: logo (natural aspect ratio — never stretched), company, contact.
    let x = M;
    if (logo) {
      const h = 14;
      const w = Math.min((logo.w / logo.h) * h, 40);
      const hh = (w / (logo.w / logo.h));
      pdf.addImage(logo.data, "PNG", M, 8 + (h - hh) / 2, w, hh);
      x = M + w + 4;
    }
    pdf.setTextColor(...INK);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(doc.branding.name, x, 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    const contact = contactLine(doc);
    if (contact) pdf.text(pdf.splitTextToSize(contact, W - x - M)[0], x, 18);
    pdf.setDrawColor(...BRAND);
    pdf.setLineWidth(0.6);
    pdf.line(M, HEADER_H - 2, W - M, HEADER_H - 2);
    // Footer
    pdf.setDrawColor(220, 226, 234);
    pdf.setLineWidth(0.2);
    pdf.line(M, H - 10, W - M, H - 10);
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    pdf.text(`${doc.branding.footer ? `${doc.branding.footer}  ·  ` : ""}Generated ${generated} by ${doc.generatedBy}`, M, H - 6);
  };

  // Title block (first page only)
  let y = HEADER_H + 6;
  pdf.setTextColor(...INK);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(doc.title, M, y);
  y += 6;
  if (doc.subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...MUTED);
    pdf.text(doc.subtitle, M, y);
    y += 5;
  }
  if (doc.meta.length) {
    pdf.setFontSize(8.5);
    pdf.setTextColor(...MUTED);
    const text = doc.meta.map((m) => `${m.label}: ${m.value}`).join("    ");
    const lines = pdf.splitTextToSize(text, W - 2 * M);
    pdf.text(lines, M, y);
    y += lines.length * 4;
  }
  y += 2;

  const margin = { top: HEADER_H + 4, left: M, right: M, bottom: 14 };
  const lastY = () => (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  for (const s of doc.sections) {
    if (s.kind === "kv") {
      const perRow = doc.orientation === "landscape" ? 3 : 2;
      const body: string[][] = [];
      for (let i = 0; i < s.items.length; i += perRow) {
        const row: string[] = [];
        for (let j = 0; j < perRow; j++) {
          const it = s.items[i + j];
          row.push(it ? it.label : "", it ? it.value : "");
        }
        body.push(row);
      }
      autoTable(pdf, {
        startY: y,
        margin,
        head: s.title ? [[{ content: s.title, colSpan: perRow * 2 }]] : undefined,
        body,
        theme: "plain",
        styles: { fontSize: 8.5, cellPadding: 1.4, textColor: INK },
        headStyles: { fontStyle: "bold", textColor: BRAND, fontSize: 9.5 },
        columnStyles: Object.fromEntries(Array.from({ length: perRow }, (_, i) => [i * 2, { textColor: MUTED, cellWidth: 32 }])),
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index % 2 === 1) d.cell.styles.fontStyle = "bold";
        },
      });
      y = lastY() + 4;
    } else if (s.kind === "table") {
      autoTable(pdf, tableOptions(s, y, margin));
      y = lastY() + 5;
    } else if (s.kind === "note") {
      pdf.setFontSize(8.5);
      pdf.setTextColor(...MUTED);
      const lines = pdf.splitTextToSize(s.text, W - 2 * M);
      if (y + lines.length * 4 > H - 16) {
        pdf.addPage();
        y = HEADER_H + 6;
      }
      pdf.text(lines, M, y + 3);
      y += lines.length * 4 + 4;
    } else if (s.kind === "signatures") {
      if (y + 30 > H - 14) {
        pdf.addPage();
        y = HEADER_H + 6;
      }
      y += 18;
      const n = s.labels.length;
      const gap = 10;
      const w = (W - 2 * M - gap * (n - 1)) / n;
      pdf.setDrawColor(...INK);
      pdf.setLineWidth(0.3);
      pdf.setFontSize(8.5);
      pdf.setTextColor(...INK);
      s.labels.forEach((label, i) => {
        const x = M + i * (w + gap);
        pdf.line(x, y, x + w, y);
        pdf.text(label, x + w / 2, y + 4.5, { align: "center" });
      });
      y += 10;
    }
  }

  // Header/footer + "Page X of Y" on every page.
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    drawChrome();
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    pdf.text(`Page ${i} of ${total}`, W - M, H - 6, { align: "right" });
  }
  pdf.save(`${doc.fileName}.pdf`);

  function tableOptions(s: TableSection, startY: number, mg: typeof margin) {
    const head = [s.columns.map((c) => c.label)];
    const body = s.rows.map((r) => s.columns.map((c) => formatCell(r[c.key] ?? null, c.format)));
    const foot = s.totals ? [s.columns.map((c, i) => (s.totals![c.key] !== undefined ? formatCell(s.totals![c.key], i === 0 ? "text" : c.format) : ""))] : undefined;
    const align = Object.fromEntries(s.columns.map((c, i) => [i, { halign: c.align ?? "left" }])) as Record<number, { halign: "left" | "right" | "center" }>;
    return {
      startY: s.title ? startY + 5 : startY,
      margin: mg,
      head,
      body: body.length ? body : [[{ content: "No records", colSpan: s.columns.length, styles: { halign: "center" as const, textColor: MUTED } }]],
      foot,
      showHead: "everyPage" as const,
      showFoot: "lastPage" as const,
      theme: "grid" as const,
      styles: { fontSize: s.columns.length > 12 ? 6.8 : 7.8, cellPadding: 1.3, lineColor: [227, 232, 239] as [number, number, number], lineWidth: 0.15, textColor: INK, overflow: "linebreak" as const },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const },
      footStyles: { fillColor: [241, 244, 248] as [number, number, number], textColor: INK, fontStyle: "bold" as const },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      columnStyles: align,
      // Section title is drawn once, directly above the table.
      ...(s.title ? drawTitle(s.title, startY) : {}),
    };
  }

  function drawTitle(title: string, at: number) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...BRAND);
    pdf.text(title, M, at + 3);
    return {};
  }
}

/* ------------------------------------------------------------------ Excel */

export async function exportXlsx(doc: ReportDocument) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = doc.branding.name;
  wb.created = new Date(doc.generatedAt);
  const ws = wb.addWorksheet(doc.title.slice(0, 31), {
    pageSetup: { paperSize: 9, orientation: doc.orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${doc.branding.name}&RPage &P of &N` },
  });
  const widest = Math.max(4, ...doc.sections.map((s) => (s.kind === "table" ? s.columns.length : s.kind === "kv" ? 4 : 1)));

  const logo = await loadImage(new URL(doc.branding.logoUrl, window.location.origin).toString());
  let r = 1;
  if (logo) {
    const id = wb.addImage({ base64: logo.data, extension: "png" });
    const h = 48;
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: (logo.w / logo.h) * h, height: h } });
    ws.getRow(1).height = 20;
    ws.getRow(2).height = 20;
    r = 4;
  }
  const title = (text: string, size: number, bold = true, color = "FF111827") => {
    const row = ws.getRow(r++);
    row.getCell(1).value = text;
    row.getCell(1).font = { size, bold, color: { argb: color } };
  };
  title(doc.branding.name, 14);
  const contact = contactLine(doc);
  if (contact) title(contact, 9, false, "FF5B6474");
  r++;
  title(doc.title, 13, true, "FF1D6FB3");
  if (doc.subtitle) title(doc.subtitle, 10, false, "FF5B6474");
  for (const m of doc.meta) title(`${m.label}: ${m.value}`, 9, false, "FF5B6474");
  title(`Generated ${formatDateTime(doc.generatedAt, doc.timezone)} by ${doc.generatedBy}`, 9, false, "FF5B6474");
  r++;

  const colWidths = new Array<number>(widest).fill(10);
  for (const s of doc.sections) {
    if (s.kind === "kv") {
      if (s.title) title(s.title, 11, true, "FF1D6FB3");
      for (let i = 0; i < s.items.length; i += 2) {
        const row = ws.getRow(r++);
        [s.items[i], s.items[i + 1]].forEach((it, j) => {
          if (!it) return;
          row.getCell(j * 2 + 1).value = it.label;
          row.getCell(j * 2 + 1).font = { color: { argb: "FF5B6474" } };
          row.getCell(j * 2 + 2).value = it.value;
          row.getCell(j * 2 + 2).font = { bold: true };
          colWidths[j * 2] = Math.max(colWidths[j * 2], it.label.length + 2);
          colWidths[j * 2 + 1] = Math.max(colWidths[j * 2 + 1], Math.min(it.value.length + 2, 40));
        });
      }
      r++;
    } else if (s.kind === "table") {
      if (s.title) title(s.title, 11, true, "FF1D6FB3");
      const head = ws.getRow(r++);
      s.columns.forEach((c, i) => {
        const cell = head.getCell(i + 1);
        cell.value = c.label;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D6FB3" } };
        cell.alignment = { horizontal: c.align ?? "left", vertical: "middle", wrapText: true };
        colWidths[i] = Math.max(colWidths[i], c.label.length + 2);
      });
      for (const row of s.rows) {
        const xr = ws.getRow(r++);
        s.columns.forEach((c, i) => {
          const cell = xr.getCell(i + 1);
          cell.value = excelValue(row[c.key] ?? null, c.format);
          const fmt = excelNumFmt(c.format);
          if (fmt) cell.numFmt = fmt;
          cell.alignment = { horizontal: c.align ?? "left" };
          cell.border = { bottom: { style: "hair", color: { argb: "FFE3E8EF" } } };
          colWidths[i] = Math.max(colWidths[i], Math.min(formatCell(row[c.key] ?? null, c.format).length + 2, 45));
        });
      }
      if (s.totals) {
        const xr = ws.getRow(r++);
        s.columns.forEach((c, i) => {
          const v = s.totals![c.key];
          if (v === undefined) return;
          const cell = xr.getCell(i + 1);
          cell.value = i === 0 ? String(v) : excelValue(v, c.format);
          const fmt = excelNumFmt(c.format);
          if (fmt && i > 0) cell.numFmt = fmt;
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F4F8" } };
        });
      }
      r++;
    } else if (s.kind === "note") {
      title(s.text, 9, false, "FF5B6474");
    } else if (s.kind === "signatures") {
      r += 2;
      const row = ws.getRow(r++);
      s.labels.forEach((l, i) => {
        const cell = row.getCell(i * 2 + 1);
        cell.value = l;
        cell.border = { top: { style: "thin" } };
      });
    }
  }
  colWidths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${doc.fileName}.xlsx`);
}

/* ------------------------------------------------------------------ CSV */

export function exportCsv(doc: ReportDocument) {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // Neutralise spreadsheet formula injection.
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const lines: string[] = [];
  const tables = doc.sections.filter((s): s is TableSection => s.kind === "table");
  const primary = tables.find((t) => t.primary) ?? tables[0];
  const list = primary ? [primary, ...tables.filter((t) => t !== primary)] : [];
  for (const t of list) {
    if (list.length > 1 && t.title) lines.push(esc(t.title));
    lines.push(t.columns.map((c) => esc(c.label)).join(","));
    for (const row of t.rows) {
      lines.push(
        t.columns
          .map((c) => {
            const v = row[c.key];
            if (v === null || v === undefined) return "";
            if (typeof v === "number" && (c.format === "money" || c.format === "number" || c.format === "minutes" || c.format === "percent")) return String(v);
            return esc(safe(formatCell(v, c.format)));
          })
          .join(","),
      );
    }
    lines.push("");
  }
  save(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${doc.fileName}.csv`);
}
