import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/shared/link-tabs";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { CorrectionsTable, type CorrectionRow } from "@/components/attendance/corrections-table";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees } from "@/lib/data";
import { pageParams, param } from "@/lib/params";
import { ReviewButtons } from "../attendance-controls";

export const metadata: Metadata = { title: "Attendance Corrections" };

export default async function CorrectionsPage({ searchParams }: PageProps<"/admin/attendance/corrections">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const tab = param(sp, "tab") === "history" ? "history" : "pending";
  const employee = param(sp, "employee");
  const { page, pageSize, from, to } = pageParams(sp);
  const supabase = await createClient();

  let q = supabase.from("attendance_corrections").select("*, employees(full_name, employee_code)", { count: "exact" });
  q = tab === "pending" ? q.eq("status", "pending") : q.neq("status", "pending");
  if (employee) q = q.eq("employee_id", employee);
  const [{ data, count }, { count: pending }, { data: profiles }, employees] = await Promise.all([
    q.order("created_at", { ascending: false }).range(from, to),
    supabase.from("attendance_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("profiles").select("id, username"),
    getActiveEmployees(),
  ]);
  const users = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));

  return (
    <>
      <PageHeader title="Attendance Corrections" description="Review correction requests and the complete edit history of attendance records." />
      <LinkTabs
        tabs={[{ key: "pending", label: "Pending requests", count: pending ?? 0 }, { key: "history", label: "Correction history" }]}
        active={tab}
        baseHref="/admin/attendance/corrections"
      />
      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <FilterBar filters={[{ type: "select", name: "employee", label: "Employee", options: employees.map((e) => ({ value: e.id, label: e.full_name })) }]} />
        </div>
        <CorrectionsTable
          rows={(data ?? []) as CorrectionRow[]}
          users={users}
          actions={tab === "pending" ? (r) => <ReviewButtons id={r.id} /> : undefined}
        />
        <Pagination page={page} pageSize={pageSize} total={count ?? 0} />
      </Card>
    </>
  );
}
