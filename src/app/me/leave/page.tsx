import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { LeaveBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveApplyForm, LeaveReviewButtons } from "@/components/leave/leave-components";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLeaveTypes } from "@/lib/data";
import { formatDate, todayISO } from "@/lib/time";
import type { LeaveRequest } from "@/lib/types";

export const metadata: Metadata = { title: "My Leave" };

interface Balance {
  leave_type_id: string;
  name: string;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
}

export default async function MyLeavePage() {
  await requirePageRole("employee");
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const supabase = await createClient();
  const [{ data: me }, types, { data: reqs }, { data: bal }] = await Promise.all([
    supabase.rpc("my_employee_id"),
    getLeaveTypes(),
    supabase.from("leave_requests").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.rpc("my_leave_balances", { p_year: year }),
  ]);
  if (!me) {
    return (
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Your account is not linked to an employee. Contact the administrator.</p>
      </div>
    );
  }
  const myId = me as string;
  const balances = (bal ?? []) as Balance[];
  const rows = (reqs ?? []) as LeaveRequest[];
  const tname = new Map(types.map((t) => [t.id, t.name]));
  const remaining = { [myId]: Object.fromEntries(balances.map((b) => [b.leave_type_id, Number(b.remaining)])) };

  return (
    <>
      <PageHeader title="My Leave" description="Apply for leave and follow its status. An administrator approves or rejects it." />
      {balances.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {balances.map((b) => (
            <div key={b.leave_type_id} className="rounded-lg border bg-card p-3">
              <p className="truncate text-xs text-muted-foreground">{b.name} · {year}</p>
              <p className="text-lg font-semibold tabular-nums">
                {Number(b.remaining)} <span className="text-xs font-normal text-muted-foreground">of {Number(b.allocated)} left</span>
              </p>
              {Number(b.pending) > 0 && <p className="text-[11px] text-warning">{Number(b.pending)} day(s) pending</p>}
            </div>
          ))}
        </div>
      )}
      <Card>
        <CardHeader><CardTitle>Apply for leave</CardTitle></CardHeader>
        <CardContent>
          <LeaveApplyForm selfEmployeeId={myId} employees={[]} types={types} today={today} isAdmin={false} balances={remaining} />
        </CardContent>
      </Card>
      <Card className="mt-5 gap-0 pb-0">
        <CardHeader className="border-b pb-4"><CardTitle>My applications</CardTitle></CardHeader>
        {rows.length === 0 ? (
          <EmptyState title="No leave applications yet" />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{tname.get(r.leave_type_id) ?? "Leave"} · {Number(r.days)} day(s)</p>
                  <p className="tabular text-xs text-muted-foreground">
                    {formatDate(r.start_date)}
                    {r.end_date !== r.start_date && ` – ${formatDate(r.end_date)}`}
                    {r.review_note ? ` · ${r.review_note}` : ""}
                  </p>
                </div>
                <LeaveBadge status={r.status} />
                <LeaveReviewButtons id={r.id} canReview={false} canCancel={r.status === "pending"} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
