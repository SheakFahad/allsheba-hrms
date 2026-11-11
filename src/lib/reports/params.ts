import { isISODate, isMonth, param, type SearchParams } from "@/lib/params";
import { ATTENDANCE_STATUSES, EMPLOYMENT_STATUSES } from "@/lib/constants";
import type { ReportParams } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOr = (v?: string) => (v && UUID.test(v) ? v : undefined);

/** Strictly validated report parameters from a URL (never trusted as-is). */
export function parseReportParams(sp: SearchParams): ReportParams {
  const status = param(sp, "status");
  const list = (k: string) => (param(sp, k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const year = param(sp, "year");
  return {
    type: (param(sp, "type") ?? "").replace(/[^a-z_]/g, ""),
    employee: uuidOr(param(sp, "employee")),
    employees: list("employees").filter((x) => UUID.test(x)).slice(0, 500),
    department: uuidOr(param(sp, "department")),
    payroll: uuidOr(param(sp, "payroll")),
    item: uuidOr(param(sp, "item")),
    from: isISODate(param(sp, "from")) ? param(sp, "from") : undefined,
    to: isISODate(param(sp, "to")) ? param(sp, "to") : undefined,
    month: isMonth(param(sp, "month")) ? param(sp, "month") : undefined,
    year: year && /^\d{4}$/.test(year) ? year : undefined,
    date: isISODate(param(sp, "date")) ? param(sp, "date") : undefined,
    status:
      status && ([...ATTENDANCE_STATUSES, ...EMPLOYMENT_STATUSES] as string[]).includes(status) ? status : undefined,
    late: param(sp, "late") === "1" ? "1" : undefined,
    view: param(sp, "view") === "archived" ? "archived" : undefined,
    cols: list("cols").filter((c) => /^[a-z_A-Z0-9]{1,40}$/.test(c)),
    sort: /^[a-z_A-Z0-9]{1,40}$/.test(param(sp, "sort") ?? "") ? param(sp, "sort") : undefined,
    dir: param(sp, "dir") === "desc" ? "desc" : param(sp, "dir") === "asc" ? "asc" : undefined,
    orientation: param(sp, "orientation") === "portrait" ? "portrait" : param(sp, "orientation") === "landscape" ? "landscape" : undefined,
  };
}
