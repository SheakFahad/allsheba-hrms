import { formatAmount } from "@/lib/format";
import { formatDate, formatDuration, formatTime12 } from "@/lib/time";
import type { Cell, CellFormat } from "./types";

/** Human-readable cell text — identical in preview, print, PDF and CSV. */
export function formatCell(value: Cell, format: CellFormat = "text"): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "date":
      return formatDate(String(value));
    case "time":
      return formatTime12(String(value));
    case "minutes":
      return Number(value) ? `${value} min` : "—";
    case "duration":
      return Number(value) ? formatDuration(Number(value)) : "—";
    case "money":
      return formatAmount(Number(value));
    case "number":
      return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value));
    case "percent":
      return `${value}%`;
    default:
      return String(value);
  }
}

/** Raw value for Excel cells (numbers stay numeric so totals and formulas work). */
export function excelValue(value: Cell, format: CellFormat = "text"): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (format === "money" || format === "number" || format === "minutes") return Number(value);
  if (format === "percent") return Number(value) / 100;
  if (format === "duration") return Math.round((Number(value) / 60) * 100) / 100;
  return formatCell(value, format);
}

export function excelNumFmt(format: CellFormat = "text"): string | undefined {
  switch (format) {
    case "money":
      return "#,##0.00";
    case "number":
      return "#,##0.##";
    case "minutes":
      return "0";
    case "percent":
      return "0.0%";
    case "duration":
      return '0.00" h"';
    default:
      return undefined;
  }
}
