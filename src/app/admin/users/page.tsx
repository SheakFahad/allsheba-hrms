import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { RecordDialog, type FieldDef } from "@/components/shared/record-dialog";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { createUser, resetUserPassword, updateUser } from "../system-actions";

export const metadata: Metadata = { title: "User Management" };

const ROLE_OPTIONS = [{ value: "entry", label: "Entry operator (attendance entry only)" }, { value: "admin", label: "Administrator (full access)" }];
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
  { name: "password", label: "New temporary password", type: "password", required: true, hint: "The user must change it at next sign-in." },
];

const PERMISSIONS: [string, string, string][] = [
  ["Quick attendance entry & today's overview", "✓", "✓"],
  ["Edit own entries (within policy window)", "✓", "✓"],
  ["Correction requests", "Review", "Submit"],
  ["Leave applications", "Approve / reject", "Submit"],
  ["Employee directory (name, ID, department)", "✓", "✓"],
  ["Personal details, documents, salary", "✓", "—"],
  ["Payroll & payslips", "✓", "—"],
  ["Reports & exports", "All", "Daily / attendance only"],
  ["Users, settings, audit logs", "✓", "—"],
];

export default async function UsersPage() {
  const me = await requirePageRole("admin");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("role").order("username");
  const users = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader
        title="User Management"
        description="Sign-in accounts for the Admin and Entry panels."
        actions={<RecordDialog title="New user" fields={CREATE_FIELDS} initial={{ username: "", full_name: "", role: "entry", password: "" }} action={createUser} triggerLabel="Add user" />}
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
                  <TableCell>{u.role === "admin" ? <ToneBadge tone="brand">Administrator</ToneBadge> : <ToneBadge tone="info">Entry operator</ToneBadge>}</TableCell>
                  <TableCell className="space-x-1">
                    {u.is_active ? <ToneBadge tone="success">Active</ToneBadge> : <ToneBadge tone="neutral">Inactive</ToneBadge>}
                    {u.must_change_password && <ToneBadge tone="warning">Password change pending</ToneBadge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(u.last_login_at)}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      <RecordDialog edit title={`Edit @${u.username}`} fields={EDIT_FIELDS} initial={{ id: u.id, full_name: u.full_name, role: u.role, is_active: u.is_active }} action={updateUser} />
                      <RecordDialog title={`Reset password for @${u.username}`} triggerLabel="Reset password" fields={RESET_FIELDS} initial={{ id: u.id, password: "" }} action={resetUserPassword} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Role permissions</CardTitle>
          <CardDescription>Enforced on the server and by database row-level security, not only by hiding buttons.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead className="pl-4">Capability</TableHead><TableHead>Administrator</TableHead><TableHead className="pr-4">Entry operator</TableHead></TableRow></TableHeader>
          <TableBody>
            {PERMISSIONS.map(([cap, a, e]) => (
              <TableRow key={cap}><TableCell className="pl-4">{cap}</TableCell><TableCell>{a}</TableCell><TableCell className="pr-4">{e}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
