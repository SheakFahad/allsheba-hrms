import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { RecordDialog, type FieldDef } from "@/components/shared/record-dialog";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees } from "@/lib/data";
import { ExpensePermissionSwitch } from "@/components/finance/expense-permission-switch";
import { EmployeeAccountsPanel } from "@/components/users/employee-accounts";
import { loginUrl } from "@/lib/site";
import { formatDateTime } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { createUser, resetUserPassword, updateUser } from "../system-actions";

export const metadata: Metadata = { title: "User Management" };

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee (own GPS check-in / check-out only)" },
  { value: "entry", label: "Entry operator (attendance entry for everyone)" },
  { value: "admin", label: "Administrator (full access)" },
];
const CREATE_FIELDS: FieldDef[] = [
  { name: "username", label: "Username", type: "text", required: true, hint: "Lowercase letters, numbers, dot, dash, underscore" },
  { name: "full_name", label: "Full name", type: "text", required: true },
  { name: "role", label: "Role", type: "select", options: ROLE_OPTIONS },
  { name: "password", label: "Temporary password", type: "password", required: true, hint: "At least 8 characters with a letter and a number. User must change it at first sign-in." },
];
const EDIT_FIELDS: FieldDef[] = [
  { name: "full_name", label: "Full name", type: "text", required: true },
  { name: "role", label: "Role", type: "select", options: ROLE_OPTIONS },
  { name: "is_active", label: "Account active", type: "switch", hint: "inactive users cannot sign in" },
];
const RESET_FIELDS: FieldDef[] = [
  { name: "password", label: "New temporary password", type: "text", required: true, hint: "e.g. 123456 (at least 6 characters). The user must choose their own password at next sign-in." },
];

const PERMISSIONS: [string, string, string, string][] = [
  ["Quick attendance entry & today's overview", "✓", "✓", "—"],
  ["Own check-in / check-out", "—", "—", "✓ GPS-verified, server time"],
  ["Own profile & attendance history", "—", "—", "✓ view only"],
  ["Today's Present List", "✓", "✓", "✓ names & times only"],
  ["Edit own entries (within policy window)", "✓", "✓", "—"],
  ["Correction requests", "Review", "Submit", "—"],
  ["Leave applications", "Approve / reject", "Submit", "Own only (pending until approved)"],
  ["Employee directory (name, ID, department)", "✓", "✓", "—"],
  ["Personal details, documents, salary", "✓", "—", "—"],
  ["Payroll & payslips", "✓", "—", "—"],
  ["Reports & exports", "All", "Daily / attendance only", "—"],
  ["Users, settings, audit logs", "✓", "—", "—"],
  ["Expenses & expense vouchers", "Full control, confirm payments", "Only if granted (record + print; cannot confirm)", "—"],
  ["Salary payments & cost reports", "✓", "—", "—"],
  ["Location restriction (GPS)", "None — works from anywhere", "None (shared office computer, entries marked “not GPS-verified”)", "Must be inside the office radius"],
];

export default async function UsersPage() {
  const me = await requirePageRole("admin");
  const supabase = await createClient();
  const [{ data }, employees, url] = await Promise.all([
    supabase.from("profiles").select("*").order("role").order("username"),
    getActiveEmployees(),
    loginUrl(),
  ]);
  const users = (data ?? []) as Profile[];
  const linkedIds = new Set(users.map((u) => u.employee_id).filter(Boolean));
  const candidates = employees
    .filter((e) => !linkedIds.has(e.id))
    .map((e) => ({ id: e.id, name: e.full_name, code: e.employee_code, department: e.departments?.name ?? null }));
  const empName = new Map(employees.map((e) => [e.id, `${e.full_name} (${e.employee_code})`]));
  const EMP_FIELD: FieldDef = {
    name: "employee_id",
    label: "Linked employee (for Employee role)",
    type: "select",
    options: [{ value: "", label: "— None —" }, ...employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_code})` }))],
  };
  const createFields = [...CREATE_FIELDS.slice(0, 3), EMP_FIELD, CREATE_FIELDS[3]];
  const editFields = [...EDIT_FIELDS.slice(0, 2), EMP_FIELD, EDIT_FIELDS[2]];

  return (
    <>
      <PageHeader
        title="User Management"
        description="Sign-in accounts for the Admin and Entry panels and for individual employees."
        actions={<RecordDialog title="New user" fields={createFields} initial={{ username: "", full_name: "", role: "employee", employee_id: "", password: "" }} action={createUser} triggerLabel="Add user" />}
      />
      <Card className="mb-5 gap-0 py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-4">User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last sign-in</TableHead><TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4"><span className="block font-medium">{u.full_name || u.username}</span><span className="text-xs text-muted-foreground">@{u.username}{u.id === me.id ? " (you)" : ""}</span></TableCell>
                  <TableCell>
                    {u.role === "admin" ? <ToneBadge tone="brand">Administrator</ToneBadge> : u.role === "entry" ? <ToneBadge tone="info">Entry operator</ToneBadge> : <ToneBadge tone="success">Employee</ToneBadge>}
                    {u.role === "employee" && <span className="mt-0.5 block text-xs text-muted-foreground">{u.employee_id ? empName.get(u.employee_id) ?? "Archived employee" : "Not linked"}</span>}
                    {u.role === "entry" && <ExpensePermissionSwitch id={u.id} allowed={!!u.can_manage_expenses} />}
                  </TableCell>
                  <TableCell className="space-x-1">
                    {u.is_active ? <ToneBadge tone="success">Active</ToneBadge> : <ToneBadge tone="neutral">Inactive</ToneBadge>}
                    {u.must_change_password && <ToneBadge tone="warning">Password change pending</ToneBadge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(u.last_login_at)}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      <RecordDialog edit title={`Edit @${u.username}`} fields={editFields} initial={{ id: u.id, full_name: u.full_name, role: u.role, is_active: u.is_active, employee_id: u.employee_id ?? "" }} action={updateUser} />
                      <RecordDialog title={`Reset password for @${u.username}`} triggerLabel="Reset password" fields={RESET_FIELDS} initial={{ id: u.id, password: "" }} action={resetUserPassword} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Employee login accounts</CardTitle>
          <CardDescription>Create a personal login for existing employees. Each account is linked to the employee&apos;s existing record; nothing in the employee record or attendance history changes.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeAccountsPanel candidates={candidates} loginUrl={url} />
        </CardContent>
      </Card>
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Role permissions</CardTitle>
          <CardDescription>Enforced on the server and by database row-level security, not only by hiding buttons.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead className="pl-4">Capability</TableHead><TableHead>Administrator</TableHead><TableHead>Entry operator</TableHead><TableHead className="pr-4">Employee</TableHead></TableRow></TableHeader>
          <TableBody>
            {PERMISSIONS.map(([cap, a, e, emp]) => (
              <TableRow key={cap}><TableCell className="pl-4">{cap}</TableCell><TableCell>{a}</TableCell><TableCell>{e}</TableCell><TableCell className="pr-4">{emp}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
