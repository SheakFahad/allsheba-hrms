"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, NativeSelect } from "@/components/shared/field";
import { EmployeePicker, type PickerEmployee } from "@/components/shared/employee-picker";
import { REPORTS, REPORT_MAP, type ReportNeed } from "@/lib/reports/catalog";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUSES } from "@/lib/constants";

const CATEGORY_LABEL = { individual: "Individual reports", company: "Company reports", custom: "Custom report builder" } as const;

export function ReportBuilder({
  employees,
  departments,
  today,
  initialType,
}: {
  employees: PickerEmployee[];
  departments: { id: string; name: string }[];
  today: string;
  initialType?: string;
}) {
  const router = useRouter();
  const [type, setType] = React.useState(initialType && REPORT_MAP.has(initialType) ? initialType : "attendance_history");
  const def = REPORT_MAP.get(type)!;
  const has = (n: ReportNeed) => def.needs.includes(n);
  const [employee, setEmployee] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [department, setDepartment] = React.useState("");
  const [periodMode, setPeriodMode] = React.useState<"month" | "year" | "range">("month");
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [year, setYear] = React.useState(today.slice(0, 4));
  const [from, setFrom] = React.useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = React.useState(today);
  const [date, setDate] = React.useState(today);
  const [status, setStatus] = React.useState("");
  const [late, setLate] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasPeriod = has("period") || (has("month") && has("year"));
  const years = Array.from({ length: 6 }, (_, i) => String(Number(today.slice(0, 4)) - i));

  function preview() {
    const qs = new URLSearchParams({ type });
    if (has("employee")) {
      if (!employee && def.required?.includes("employee")) return setError("Select an employee.");
      if (employee) qs.set("employee", employee);
    }
    if (has("employees") && selected.size) qs.set("employees", [...selected].join(","));
    if (has("department") && department) qs.set("department", department);
    if (hasPeriod) {
      if (periodMode === "month") qs.set("month", month);
      else if (periodMode === "year") qs.set("year", year);
      else {
        if (from > to) return setError("The start date must be before the end date.");
        qs.set("from", from);
        qs.set("to", to);
      }
    } else {
      if (has("month")) qs.set("month", month);
      if (has("year")) qs.set("year", year);
    }
    if (has("date")) qs.set("date", date);
    if (has("status") && status) qs.set("status", status);
    if (has("late") && late) qs.set("late", "1");
    setError(null);
    router.push(`/admin/reports/view?${qs}`);
  }

  return (
    <div className="grid gap-5">
      <Field label="Report type" htmlFor="rb_type">
        <NativeSelect id="rb_type" value={type} onChange={(e) => { setType(e.target.value); setError(null); }}>
          {(["custom", "individual", "company"] as const).map((cat) => (
            <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
              {REPORTS.filter((r) => r.category === cat).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </optgroup>
          ))}
        </NativeSelect>
      </Field>
      <p className="-mt-3 text-xs text-muted-foreground">{def.description}{def.sensitive ? " Contains confidential data — exports are logged." : ""}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {has("employee") && (
          <Field label={def.required?.includes("employee") ? "Employee" : "Employee (optional)"} htmlFor="rb_emp" required={def.required?.includes("employee")} className="sm:col-span-2">
            <EmployeePicker id="rb_emp" employees={employees} value={employee} onChange={setEmployee} />
          </Field>
        )}
        {has("department") && (
          <Field label="Department" htmlFor="rb_dept">
            <NativeSelect id="rb_dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </NativeSelect>
          </Field>
        )}
        {has("date") && (
          <Field label="Date" htmlFor="rb_date"><Input id="rb_date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        )}
        {hasPeriod ? (
          <>
            <Field label="Period" htmlFor="rb_mode">
              <NativeSelect id="rb_mode" value={periodMode} onChange={(e) => setPeriodMode(e.target.value as typeof periodMode)}>
                <option value="month">Month</option>
                <option value="year">Year</option>
                <option value="range">Date range</option>
              </NativeSelect>
            </Field>
            {periodMode === "month" && <Field label="Month" htmlFor="rb_month"><Input id="rb_month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>}
            {periodMode === "year" && (
              <Field label="Year" htmlFor="rb_year">
                <NativeSelect id="rb_year" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</NativeSelect>
              </Field>
            )}
            {periodMode === "range" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" htmlFor="rb_from"><Input id="rb_from" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="To" htmlFor="rb_to"><Input id="rb_to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              </div>
            )}
          </>
        ) : (
          <>
            {has("month") && <Field label="Month" htmlFor="rb_month2" required={def.required?.includes("month")}><Input id="rb_month2" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>}
            {has("year") && (
              <Field label="Year" htmlFor="rb_year2">
                <NativeSelect id="rb_year2" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</NativeSelect>
              </Field>
            )}
          </>
        )}
        {has("status") && (
          <Field label="Attendance status" htmlFor="rb_status">
            <NativeSelect id="rb_status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}
            </NativeSelect>
          </Field>
        )}
        {has("late") && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={late} onCheckedChange={(v) => setLate(v === true)} /> Late arrivals only
          </label>
        )}
      </div>

      {has("employees") && (
        <Field label={`Employees (${selected.size ? `${selected.size} selected` : "all"})`}>
          <div className="max-h-56 overflow-y-auto rounded-lg border p-2">
            <div className="mb-1 flex gap-2 border-b pb-2">
              <Button type="button" variant="ghost" size="xs" onClick={() => setSelected(new Set(employees.map((e) => e.id)))}>Select all</Button>
              <Button type="button" variant="ghost" size="xs" onClick={() => setSelected(new Set())}>Clear (all employees)</Button>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {employees.map((e) => (
                <label key={e.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                  <Checkbox
                    checked={selected.has(e.id)}
                    onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v === true) n.add(e.id); else n.delete(e.id); return n; })}
                  />
                  <span className="truncate">{e.name}</span>
                  <span className="tabular ml-auto text-xs text-muted-foreground">{e.code}</span>
                </label>
              ))}
            </div>
          </div>
        </Field>
      )}

      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Columns and sorting can be adjusted in the preview before printing or exporting.</p>
        <Button onClick={preview}><Eye /> Preview report</Button>
      </div>
    </div>
  );
}
