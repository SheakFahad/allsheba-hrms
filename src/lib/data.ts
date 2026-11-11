import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOGO } from "@/lib/constants";
import { publicStorageUrl } from "@/lib/format";
import type {
  CompanySettings, Department, Designation, Employee, Holiday, LeaveType, Shift,
} from "@/lib/types";

export const getSettings = cache(async (): Promise<CompanySettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Company settings are missing. Run the database migrations.");
  return {
    ...data,
    late_deduction_day_fraction: Number(data.late_deduction_day_fraction),
    overtime_rate_multiplier: Number(data.overtime_rate_multiplier),
  } as CompanySettings;
});

export interface Branding {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  footer: string;
}

export function brandingFrom(s: CompanySettings): Branding {
  return {
    name: s.company_name,
    tagline: s.tagline ?? "",
    address: s.address ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    website: s.website ?? "",
    logoUrl: publicStorageUrl(s.logo_path) ?? DEFAULT_LOGO,
    footer: s.report_footer ?? "",
  };
}

export const getBranding = cache(async () => brandingFrom(await getSettings()));

export const getDepartments = cache(async (): Promise<Department[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("*").order("name");
  return (data ?? []) as Department[];
});

export const getDesignations = cache(async (): Promise<Designation[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("designations").select("*").order("name");
  return (data ?? []) as Designation[];
});

export const getShifts = cache(async (): Promise<Shift[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("shifts").select("*").order("is_default", { ascending: false }).order("name");
  return (data ?? []) as Shift[];
});

export const getLeaveTypes = cache(async (): Promise<LeaveType[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("leave_types").select("*").order("name");
  return (data ?? []).map((t) => ({ ...t, days_per_year: Number(t.days_per_year), max_carry_days: Number(t.max_carry_days) })) as LeaveType[];
});

export const getHolidays = cache(async (from?: string, to?: string): Promise<Holiday[]> => {
  const supabase = await createClient();
  let q = supabase.from("holidays").select("*").order("holiday_date");
  if (from) q = q.gte("holiday_date", from);
  if (to) q = q.lte("holiday_date", to);
  const { data } = await q;
  return (data ?? []) as Holiday[];
});

export const EMPLOYEE_SELECT =
  "*, departments(name), designations(name), shifts(name, start_time, end_time)";

/** Non-archived employees for pickers (operational directory; no sensitive fields). */
export const getActiveEmployees = cache(async (): Promise<Employee[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select(EMPLOYEE_SELECT)
    .is("archived_at", null)
    .order("full_name");
  return (data ?? []) as Employee[];
});

export interface EmployeeOption {
  id: string;
  code: string;
  name: string;
  department: string | null;
  designation: string | null;
  shiftId: string | null;
  photoUrl: string | null;
  joiningDate: string;
}

export function toEmployeeOption(e: Employee): EmployeeOption {
  return {
    id: e.id,
    code: e.employee_code,
    name: e.full_name,
    department: e.departments?.name ?? null,
    designation: e.designations?.name ?? null,
    shiftId: e.shift_id,
    photoUrl: publicStorageUrl(e.photo_path),
    joiningDate: e.joining_date,
  };
}
