import { PAGE_SIZE } from "./constants";

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim() : undefined;
}

export function pageParams(sp: SearchParams, pageSize = PAGE_SIZE) {
  const page = Math.max(1, Number.parseInt(param(sp, "page") ?? "1", 10) || 1);
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

/** Only allow sorting on known columns (prevents arbitrary column injection). */
export function sortParams<T extends string>(sp: SearchParams, allowed: readonly T[], fallback: T, fallbackDir: "asc" | "desc" = "desc") {
  const s = param(sp, "sort") as T | undefined;
  const column = s && allowed.includes(s) ? s : fallback;
  const dir = param(sp, "dir") === "asc" ? "asc" : param(sp, "dir") === "desc" ? "desc" : fallbackDir;
  return { column, ascending: dir === "asc" };
}

/** Sanitise user text for PostgREST ilike/or filters (removes wildcard & syntax characters). */
export function escapeLike(q: string) {
  return q.replace(/[\\%_,()*:."']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function isISODate(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function isMonth(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/**
 * Resolve the reporting period from search params. Priority: explicit from/to,
 * then month (YYYY-MM), then year, then the current month.
 */
export function resolvePeriod(sp: SearchParams, today: string): { from: string; to: string; label: string } {
  const f = param(sp, "from");
  const t = param(sp, "to");
  if (isISODate(f) || isISODate(t)) {
    const from = isISODate(f) ? f : `${today.slice(0, 4)}-01-01`;
    const to = isISODate(t) ? t : today;
    return from <= to ? { from, to, label: `${from} to ${to}` } : { from: to, to: from, label: `${to} to ${from}` };
  }
  const m = param(sp, "month");
  if (isMonth(m)) {
    const [y, mm] = m.split("-").map(Number);
    const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}`, label: m };
  }
  const y = param(sp, "year");
  if (y && /^\d{4}$/.test(y)) return { from: `${y}-01-01`, to: `${y}-12-31`, label: y };
  const cur = today.slice(0, 7);
  const [cy, cm] = cur.split("-").map(Number);
  const last = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  return { from: `${cur}-01`, to: `${cur}-${String(last).padStart(2, "0")}`, label: cur };
}
