import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LeaveBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveApplyForm, LeaveReviewButtons } from "@/components/leave/leave-components";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees, getLeaveTypes, getSettings, toEmployeeOption } from "@/lib/data";
import { formatDate } from "@/lib/time";
import { todayISO } from "@/lib/time";
import type { LeaveRequest } from "@/lib/types";

export const metadata: Metadata = { title: "Leave Applications" };

export default async function EntryLeavePage() {
  const user = await requirePageRole("entry");
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const supabase = await createClient();
  const [employees, types, { data }, { data: bal }] = await Promise.all([
    getActiveEmployees(),
    getLeaveTypes(),
    supabase.from("leave_requests").select("*, employees(full_name, employee_code)").order("created_at", { ascending: false }).limit(100),
    supabase.rpc("leave_balance_report", { p_year: Number(today.slice(0, 4)) }),
  ]);
  const balances: Record<string, Record<string, number>> = {};
  for (const b of (bal ?? []) as { employee_id: string; leave_type_id: string; remaining: number }[]) {
    (balances[b.employee_id] ??= {})[b.leave_type_id] = Number(b.remaining);
  }
  const rows = (data ?? []) as (LeaveRequest & { employees: { full_name: string; employee_code: string } | null })[];
  const tname = new Map(types.map((t) => [t.id, t.name]));

  return (
    <>
      <PageHeader title="Leave Applications" description="Submit leave on behalf of an employee. An administrator approves or rejects it." />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader><CardTitle>New application</CardTitle></CardHeader>
          <CardContent>
            <LeaveApplyForm employees={employees.map(toEmployeeOption)} types={types} today={today} isAdmin={false} balances={balances} />
          </CardContent>
        </Card>
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4"><CardTitle>Recent applications</CardTitle></CardHeader>
          {rows.length === 0 ? <EmptyState title="No leave applications yet" /> : (
            <div className="overflow-x-auto">
              <Table className="text-[13px]">
                <TableHeader><TableRow>
                  <TableHead className="pl-4">Employee</TableHead><TableHead>Type</TableHead><TableHead>Dates</TableHead>
                  <TableHead className="text-right">Days</TableHead><TableHead>Status</TableHead><TableHead className="pr-4" />
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4 font-medium">{r.employees?.full_name}</TableCell>
                      <TableCell>{tname.get(r.leave_type_id)}</TableCell>
                      <TableCell className="tabular">{formatDate(r.start_date)}{r.end_date !== r.start_date && ` – ${formatDate(r.end_date)}`}</TableCell>
                      <TableCell className="tabular text-right">{Number(r.days)}</TableCell>
                      <TableCell><LeaveBadge status={r.status} /></TableCell>
                      <TableCell className="pr-4">
                        <LeaveReviewButtons id={r.id} canReview={false} canCancel={r.status === "pending" && r.applied_by === user.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
