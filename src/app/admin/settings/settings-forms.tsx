"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, NativeSelect } from "@/components/shared/field";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { PAYROLL_BASIS_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import type { CompanySettings } from "@/lib/types";
import { saveSettings } from "../system-actions";

type Section = "company" | "attendance" | "payroll" | "reports";

function useSave(section: Section) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const save = (values: Record<string, unknown>) =>
    startTransition(async () => {
      const r = await saveSettings({ section, values });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Settings saved");
      router.refresh();
    });
  return { pending, save };
}

function SaveBar({ pending }: { pending: boolean }) {
  return (
    <div className="flex justify-end border-t pt-4">
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Save changes</Button>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
    </label>
  );
}

export function CompanyForm({ s }: { s: CompanySettings }) {
  const { pending, save } = useSave("company");
  const [v, setV] = React.useState({
    company_name: s.company_name, tagline: s.tagline ?? "", address: s.address ?? "", phone: s.phone ?? "",
    email: s.email ?? "", website: s.website ?? "", logo_path: s.logo_path ?? "",
    employee_code_prefix: s.employee_code_prefix, max_employees: String(s.max_employees),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Card>
      <CardHeader><CardTitle>Company profile & branding</CardTitle><CardDescription>Shown on the sign-in page, sidebar, reports, payslips and printouts.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); save(v); }} className="grid gap-4">
          <Field label="Company logo" hint="Leave as default to use the original All Sheba logo. The logo is never stretched.">
            <PhotoUpload shape="logo" value={v.logo_path || null} onChange={(p) => setV({ ...v, logo_path: p ?? "" })} folder="branding" name={v.company_name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="c_name" required><Input id="c_name" value={v.company_name} onChange={set("company_name")} /></Field>
            <Field label="Tagline" htmlFor="c_tag"><Input id="c_tag" value={v.tagline} onChange={set("tagline")} /></Field>
            <Field label="Address" htmlFor="c_addr" className="sm:col-span-2"><Textarea id="c_addr" rows={2} value={v.address} onChange={set("address")} /></Field>
            <Field label="Phone" htmlFor="c_phone"><Input id="c_phone" value={v.phone} onChange={set("phone")} /></Field>
            <Field label="Email" htmlFor="c_email"><Input id="c_email" type="email" value={v.email} onChange={set("email")} /></Field>
            <Field label="Website" htmlFor="c_web"><Input id="c_web" value={v.website} onChange={set("website")} /></Field>
            <Field label="Employee ID prefix" htmlFor="c_prefix" hint="New IDs look like ASL-0001"><Input id="c_prefix" value={v.employee_code_prefix} maxLength={8} onChange={(e) => setV({ ...v, employee_code_prefix: e.target.value.toUpperCase() })} /></Field>
            <Field label="Maximum employees" htmlFor="c_max" hint="Raise this to expand capacity."><Input id="c_max" type="number" min={1} value={v.max_employees} onChange={set("max_employees")} /></Field>
          </div>
          <SaveBar pending={pending} />
        </form>
      </CardContent>
    </Card>
  );
}

export function AttendanceForm({ s }: { s: CompanySettings }) {
  const { pending, save } = useSave("attendance");
  const [v, setV] = React.useState({
    weekly_off_days: s.weekly_off_days, late_reason_required: s.late_reason_required,
    late_note_required_for_other: s.late_note_required_for_other,
    flexible_schedule_unassigned: s.flexible_schedule_unassigned ?? true, entry_backdate_days: String(s.entry_backdate_days),
    entry_edit_days: String(s.entry_edit_days), auto_close_enabled: s.auto_close_enabled,
  });
  return (
    <Card>
      <CardHeader><CardTitle>Attendance rules</CardTitle><CardDescription>Office hours and grace period are set per shift in Holidays &amp; Shifts.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); save(v); }} className="grid gap-5">
          <Field label="Weekly holidays">
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_LABELS.map((d, i) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={v.weekly_off_days.includes(i)}
                    onCheckedChange={(c) => setV({ ...v, weekly_off_days: c === true ? [...v.weekly_off_days, i].sort() : v.weekly_off_days.filter((x) => x !== i) })}
                  />
                  {d}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Late reason is mandatory" hint="Operators must choose a reason for every late arrival." checked={v.late_reason_required} onChange={(c) => setV({ ...v, late_reason_required: c })} />
            <Toggle label="Explanation required for “Other”" checked={v.late_note_required_for_other} onChange={(c) => setV({ ...v, late_note_required_for_other: c })} />
            <Toggle label="Flexible schedule for employees without a shift" hint="Employees whose Shift is “Default shift” (not set) get no office hours: no late or early-departure calculation, and actual in/out are optional (shown as “Flexible”). Employees with an assigned shift, including General Shift 10:00–7:00, are not affected." checked={v.flexible_schedule_unassigned} onChange={(c) => setV({ ...v, flexible_schedule_unassigned: c })} />
            <Toggle label="Automatic attendance closing" hint="Daily cron closes the previous day (marks absent / leave / holiday / weekly off)." checked={v.auto_close_enabled} onChange={(c) => setV({ ...v, auto_close_enabled: c })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Entry panel: back-dated entry (days)" htmlFor="a_back" hint="0 = today only"><Input id="a_back" type="number" min={0} max={31} value={v.entry_backdate_days} onChange={(e) => setV({ ...v, entry_backdate_days: e.target.value })} /></Field>
            <Field label="Entry panel: editable for (days)" htmlFor="a_edit" hint="0 = same day only. Admin-edited records are always locked."><Input id="a_edit" type="number" min={0} max={31} value={v.entry_edit_days} onChange={(e) => setV({ ...v, entry_edit_days: e.target.value })} /></Field>
          </div>
          <SaveBar pending={pending} />
        </form>
      </CardContent>
    </Card>
  );
}

export function PayrollForm({ s }: { s: CompanySettings }) {
  const { pending, save } = useSave("payroll");
  const [v, setV] = React.useState({
    payroll_day_basis: s.payroll_day_basis, absent_deduction_enabled: s.absent_deduction_enabled,
    unpaid_leave_deduction_enabled: s.unpaid_leave_deduction_enabled, half_day_deduction_enabled: s.half_day_deduction_enabled,
    late_deduction_enabled: s.late_deduction_enabled, late_days_per_deduction: String(s.late_days_per_deduction),
    late_deduction_day_fraction: String(s.late_deduction_day_fraction), overtime_enabled: s.overtime_enabled,
    overtime_rate_multiplier: String(s.overtime_rate_multiplier), overtime_min_minutes: String(s.overtime_min_minutes),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Salary calculation rules</CardTitle>
        <CardDescription>No deduction is applied unless enabled here. Changes affect payroll generated or recalculated afterwards; finalized payroll keeps its own snapshot.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); save(v); }} className="grid gap-5">
          <Field label="Per-day rate basis" htmlFor="p_basis" hint="Per-day rate = (basic + allowances) ÷ basis days">
            <NativeSelect id="p_basis" value={v.payroll_day_basis} onChange={(e) => setV({ ...v, payroll_day_basis: e.target.value as typeof v.payroll_day_basis })}>
              {Object.entries(PAYROLL_BASIS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Deduct absent days" hint="absent days × per-day rate" checked={v.absent_deduction_enabled} onChange={(c) => setV({ ...v, absent_deduction_enabled: c })} />
            <Toggle label="Deduct approved unpaid leave" hint="unpaid leave days × per-day rate" checked={v.unpaid_leave_deduction_enabled} onChange={(c) => setV({ ...v, unpaid_leave_deduction_enabled: c })} />
            <Toggle label="Deduct half days" hint="half days × 0.5 × per-day rate" checked={v.half_day_deduction_enabled} onChange={(c) => setV({ ...v, half_day_deduction_enabled: c })} />
            <Toggle label="Late attendance deduction" hint="every N late days = fraction of a day" checked={v.late_deduction_enabled} onChange={(c) => setV({ ...v, late_deduction_enabled: c })} />
          </div>
          {v.late_deduction_enabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Late days per deduction (N)" htmlFor="p_ln"><Input id="p_ln" type="number" min={1} max={31} value={v.late_days_per_deduction} onChange={(e) => setV({ ...v, late_days_per_deduction: e.target.value })} /></Field>
              <Field label="Days deducted each time" htmlFor="p_lf" hint="0–1, e.g. 1 = one full day"><Input id="p_lf" type="number" min={0} max={1} step="0.25" value={v.late_deduction_day_fraction} onChange={(e) => setV({ ...v, late_deduction_day_fraction: e.target.value })} /></Field>
            </div>
          )}
          <Toggle label="Pay overtime" hint="minutes worked after scheduled out-time × hourly rate × multiplier" checked={v.overtime_enabled} onChange={(c) => setV({ ...v, overtime_enabled: c })} />
          {v.overtime_enabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Overtime rate multiplier" htmlFor="p_om"><Input id="p_om" type="number" min={0} max={5} step="0.25" value={v.overtime_rate_multiplier} onChange={(e) => setV({ ...v, overtime_rate_multiplier: e.target.value })} /></Field>
              <Field label="Minimum overtime per day (minutes)" htmlFor="p_omin"><Input id="p_omin" type="number" min={0} max={600} value={v.overtime_min_minutes} onChange={(e) => setV({ ...v, overtime_min_minutes: e.target.value })} /></Field>
            </div>
          )}
          <SaveBar pending={pending} />
        </form>
      </CardContent>
    </Card>
  );
}

export function ReportsForm({ s }: { s: CompanySettings }) {
  const { pending, save } = useSave("reports");
  const [v, setV] = React.useState({ report_footer: s.report_footer ?? "", payslip_note: s.payslip_note ?? "" });
  return (
    <Card>
      <CardHeader><CardTitle>Report branding</CardTitle><CardDescription>Logo, name and contact details come from the company profile.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); save(v); }} className="grid gap-4">
          <Field label="Report footer" htmlFor="r_footer"><Input id="r_footer" value={v.report_footer} onChange={(e) => setV({ ...v, report_footer: e.target.value })} /></Field>
          <Field label="Payslip note" htmlFor="r_slip" hint="Printed at the bottom of every payslip."><Textarea id="r_slip" rows={3} value={v.payslip_note} onChange={(e) => setV({ ...v, payslip_note: e.target.value })} /></Field>
          <SaveBar pending={pending} />
        </form>
      </CardContent>
    </Card>
  );
}
