import { DEFAULT_TIMEZONE, MONTH_LABELS } from "./constants";

/** YYYY-MM-DD for "today" in the company timezone. */
export function todayISO(tz = DEFAULT_TIMEZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** HH:MM (24h) for "now" in the company timezone. */
export function nowHHMM(tz = DEFAULT_TIMEZONE, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  return parts;
}

/** "10:25" or "10:25:00" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Normalise a DB time ("10:25:00") to "10:25" for <input type="time">. */
export function toHHMM(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

/** "13:05:00" → "1:05 PM" */
export function formatTime12(t: string | null | undefined): string {
  if (!t) return "—";
  const mins = timeToMinutes(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** 85 → "1h 25m", 0 → "0m" */
export function formatDuration(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** 485 → "8.08" */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** Parse YYYY-MM-DD as a UTC date (no timezone drift). */
export function parseISODate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = parseISODate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISODate(x);
}

/** Inclusive list of ISO dates. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayOfWeek(d: string): number {
  return parseISODate(d).getUTCDay();
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

export function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** "2026-11-11" → "11 Nov 2026" */
export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const x = parseISODate(d.slice(0, 10));
  return `${String(x.getUTCDate()).padStart(2, "0")} ${MONTH_LABELS[x.getUTCMonth()].slice(0, 3)} ${x.getUTCFullYear()}`;
}

/** Timestamp → "11 Nov 2026, 3:04 PM" in company timezone. */
export function formatDateTime(ts: string | null | undefined, tz = DEFAULT_TIMEZONE): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, day: "2-digit", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(ts));
}

export function formatMonth(year: number, month: number) {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

export function weekdayName(d: string) {
  return parseISODate(d).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** Working days between two dates, excluding weekly-off weekdays and holidays. */
export function workingDays(from: string, to: string, weeklyOff: number[], holidays: Set<string>): string[] {
  if (to < from) return [];
  return eachDay(from, to).filter((d) => !weeklyOff.includes(dayOfWeek(d)) && !holidays.has(d));
}
