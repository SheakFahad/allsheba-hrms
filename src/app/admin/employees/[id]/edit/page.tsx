import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requirePageRole } from "@/lib/auth";
import { getDepartments, getDesignations, getSettings, getShifts } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";
import type { Employee, EmployeePersonal } from "@/lib/types";
import { EmployeeForm } from "../../employee-form";

export const metadata: Metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: PageProps<"/admin/employees/[id]/edit">) {
  await requirePageRole("admin");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: emp }, { data: personal }, departments, designations, shifts, settings] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).maybeSingle<Employee>(),
    supabase.from("employee_personal").select("*").eq("employee_id", id).maybeSingle<EmployeePersonal>(),
    getDepartments(), getDesignations(), getShifts(), getSettings(),
  ]);
  if (!emp) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${emp.full_name}`}
        description={emp.employee_code}
        back={{ href: `/admin/employees/${id}`, label: "Back to profile" }}
      />
      <EmployeeForm
        mode="edit"
        employeeId={id}
        departments={departments}
        designations={designations}
        shifts={shifts}
        today={todayISO(settings.timezone)}
        companyWeeklyOff={settings.weekly_off_days}
        defaults={{
          full_name: emp.full_name,
          phone: emp.phone ?? "",
          photo_path: emp.photo_path ?? "",
          designation_id: emp.designation_id ?? "",
          department_id: emp.department_id ?? "",
          shift_id: emp.shift_id ?? "",
          joining_date: emp.joining_date,
          employment_type: emp.employment_type,
          status: emp.status,
          weekly_off_days: emp.weekly_off_days ?? null,
          email: personal?.email ?? "",
          address: personal?.address ?? "",
          date_of_birth: personal?.date_of_birth ?? "",
          national_id: personal?.national_id ?? "",
          emergency_contact_name: personal?.emergency_contact_name ?? "",
          emergency_contact_phone: personal?.emergency_contact_phone ?? "",
          emergency_contact_relation: personal?.emergency_contact_relation ?? "",
          notes: personal?.notes ?? "",
        }}
      />
    </div>
  );
}
