import type { Metadata } from "next";
import { Building2, BadgeCheck } from "lucide-react";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { DeleteButton, RecordDialog, type FieldDef } from "@/components/shared/record-dialog";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getDesignations } from "@/lib/data";
import { deleteDepartment, deleteDesignation, saveDepartment, saveDesignation } from "../system-actions";

export const metadata: Metadata = { title: "Departments" };

const DEPT_FIELDS: FieldDef[] = [
  { name: "name", label: "Department name", type: "text", required: true },
  { name: "code", label: "Short code", type: "text", hint: "Optional, e.g. OPS" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "is_active", label: "Active", type: "switch" },
];
const DESIG_FIELDS: FieldDef[] = [
  { name: "name", label: "Designation", type: "text", required: true },
  { name: "is_active", label: "Active", type: "switch" },
];

export default async function DepartmentsPage() {
  await requirePageRole("admin");
  const supabase = await createClient();
  const [departments, designations, { data: emps }] = await Promise.all([
    getDepartments(), getDesignations(),
    supabase.from("employees").select("department_id, designation_id").is("archived_at", null),
  ]);
  const deptCount = new Map<string, number>();
  const desigCount = new Map<string, number>();
  for (const e of (emps ?? []) as { department_id: string | null; designation_id: string | null }[]) {
    if (e.department_id) deptCount.set(e.department_id, (deptCount.get(e.department_id) ?? 0) + 1);
    if (e.designation_id) desigCount.set(e.designation_id, (desigCount.get(e.designation_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Department Management" description="Departments and designations used across employees, reports and analytics." />
      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4">
            <CardTitle>Departments</CardTitle>
            <CardAction><RecordDialog title="New department" fields={DEPT_FIELDS} initial={{ id: "", name: "", code: "", description: "", is_active: true }} action={saveDepartment} triggerLabel="Add department" /></CardAction>
          </CardHeader>
          {departments.length === 0 ? <EmptyState icon={Building2} title="No departments yet" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-4">Name</TableHead><TableHead>Code</TableHead><TableHead className="text-right">Employees</TableHead><TableHead>Status</TableHead><TableHead className="pr-4" />
              </TableRow></TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="pl-4"><span className="font-medium">{d.name}</span>{d.description && <span className="block text-xs text-muted-foreground">{d.description}</span>}</TableCell>
                    <TableCell>{d.code ?? "—"}</TableCell>
                    <TableCell className="tabular text-right">{deptCount.get(d.id) ?? 0}</TableCell>
                    <TableCell>{d.is_active ? <ToneBadge tone="success">Active</ToneBadge> : <ToneBadge tone="neutral">Inactive</ToneBadge>}</TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-1">
                        <RecordDialog edit title="Edit department" fields={DEPT_FIELDS} initial={{ id: d.id, name: d.name, code: d.code ?? "", description: d.description ?? "", is_active: d.is_active }} action={saveDepartment} />
                        <DeleteButton id={d.id} label={d.name} action={deleteDepartment} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4">
            <CardTitle>Designations</CardTitle>
            <CardAction><RecordDialog title="New designation" fields={DESIG_FIELDS} initial={{ id: "", name: "", is_active: true }} action={saveDesignation} triggerLabel="Add designation" /></CardAction>
          </CardHeader>
          {designations.length === 0 ? <EmptyState icon={BadgeCheck} title="No designations yet" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-4">Designation</TableHead><TableHead className="text-right">Employees</TableHead><TableHead>Status</TableHead><TableHead className="pr-4" />
              </TableRow></TableHeader>
              <TableBody>
                {designations.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="pl-4 font-medium">{d.name}</TableCell>
                    <TableCell className="tabular text-right">{desigCount.get(d.id) ?? 0}</TableCell>
                    <TableCell>{d.is_active ? <ToneBadge tone="success">Active</ToneBadge> : <ToneBadge tone="neutral">Inactive</ToneBadge>}</TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-1">
                        <RecordDialog edit title="Edit designation" fields={DESIG_FIELDS} initial={{ id: d.id, name: d.name, is_active: d.is_active }} action={saveDesignation} />
                        <DeleteButton id={d.id} label={d.name} action={deleteDesignation} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
