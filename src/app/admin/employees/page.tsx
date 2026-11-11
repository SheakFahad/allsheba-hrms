import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, Pagination, SortHeader } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/empty-state";
import { EmploymentBadge } from "@/components/shared/status-badge";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { ExportButton } from "@/components/shared/export-button";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_SELECT, getDepartments, getDesignations, getSettings } from "@/lib/data";
import { EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUSES, EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPES } from "@/lib/constants";
import { escapeLike, pageParams, param, sortParams } from "@/lib/params";
import { formatDate } from "@/lib/time";
import { publicStorageUrl } from "@/lib/format";
import type { Employee } from "@/lib/types";

export const metadata: Metadata = { title: "Employees" };

const SORTABLE = ["full_name", "employee_code", "joining_date", "created_at"] as const;

export default async function EmployeesPage({ searchParams }: PageProps<"/admin/employees">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const { page, pageSize, from, to } = pageParams(sp);
  const sort = sortParams(sp, SORTABLE, "employee_code", "asc");
  const q = param(sp, "q");
  const department = param(sp, "department");
  const designation = param(sp, "designation");
  const status = param(sp, "status");
  const type = param(sp, "type");
  const view = param(sp, "view") ?? "current";

  const supabase = await createClient();
  let query = supabase.from("employees").select(EMPLOYEE_SELECT, { count: "exact" });
  query = view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) {
    const s = escapeLike(q);
    query = query.or(`full_name.ilike.%${s}%,employee_code.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  if (department) query = query.eq("department_id", department);
  if (designation) query = query.eq("designation_id", designation);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("employment_type", type);
  const { data, count } = await query.order(sort.column, { ascending: sort.ascending }).range(from, to);
  const employees = (data ?? []) as Employee[];

  const [departments, designations, settings, activeCount] = await Promise.all([
    getDepartments(),
    getDesignations(),
    getSettings(),
    supabase.from("employees").select("id", { count: "exact", head: true }).is("archived_at", null),
  ]);

  return (
    <>
      <PageHeader
        title="Employee Management"
        description={`${activeCount.count ?? 0} of ${settings.max_employees} employee slots in use`}
        actions={
          <>
            <ExportButton type="employee_directory" params={{ department, status, view }} />
            <Button asChild>
              <Link href="/admin/employees/new"><Plus /> Add employee</Link>
            </Button>
          </>
        }
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4">
          <FilterBar
            filters={[
              { type: "search", name: "q", placeholder: "Search name, Employee ID or phone…" },
              { type: "select", name: "view", label: "Show", allLabel: "Current employees", options: [{ value: "archived", label: "Archived" }] },
              { type: "select", name: "department", label: "Department", options: departments.map((d) => ({ value: d.id, label: d.name })) },
              { type: "select", name: "designation", label: "Designation", options: designations.map((d) => ({ value: d.id, label: d.name })) },
              { type: "select", name: "status", label: "Status", options: EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: EMPLOYMENT_STATUS_LABELS[s] })) },
              { type: "select", name: "type", label: "Type", options: EMPLOYMENT_TYPES.map((s) => ({ value: s, label: EMPLOYMENT_TYPE_LABELS[s] })) },
            ]}
          />
        </div>
        {employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q || department || status ? "No employees match your filters" : view === "archived" ? "No archived employees" : "No employees yet"}
            description={view === "archived" ? undefined : "Add your first employee to start recording attendance."}
            action={view !== "archived" && <Button asChild><Link href="/admin/employees/new"><Plus /> Add employee</Link></Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4"><SortHeader column="full_name" label="Employee" /></TableHead>
                  <TableHead><SortHeader column="employee_code" label="Employee ID" /></TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead><SortHeader column="joining_date" label="Joined" /></TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`/admin/employees/${e.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <EmployeeAvatar name={e.full_name} photoUrl={publicStorageUrl(e.photo_path)} />
                        <span>
                          <span className="block font-medium">{e.full_name}</span>
                          <span className="block text-xs text-muted-foreground">{e.phone ?? "No phone"}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="tabular font-medium">{e.employee_code}</TableCell>
                    <TableCell>{e.departments?.name ?? "—"}</TableCell>
                    <TableCell>{e.designations?.name ?? "—"}</TableCell>
                    <TableCell>{EMPLOYMENT_TYPE_LABELS[e.employment_type]}</TableCell>
                    <TableCell className="tabular">{formatDate(e.joining_date)}</TableCell>
                    <TableCell className="pr-4"><EmploymentBadge status={e.status} archived={!!e.archived_at} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={count ?? 0} />
      </Card>
    </>
  );
}
