import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePageRole } from "@/lib/auth";
import { getDepartments, getDesignations, getSettings, getShifts } from "@/lib/data";
import { todayISO } from "@/lib/time";
import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requirePageRole("admin");
  const [departments, designations, shifts, settings] = await Promise.all([
    getDepartments(), getDesignations(), getShifts(), getSettings(),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Add employee" back={{ href: "/admin/employees", label: "Employees" }} />
      <EmployeeForm
        mode="create"
        departments={departments}
        designations={designations}
        shifts={shifts}
        today={todayISO(settings.timezone)}
        companyWeeklyOff={settings.weekly_off_days}
      />
    </div>
  );
}
