import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/empty-state";
import { ToneBadge } from "@/components/shared/status-badge";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isISODate, pageParams, param } from "@/lib/params";
import { addDays, formatDateTime } from "@/lib/time";
import type { AuditLog } from "@/lib/types";

export const metadata: Metadata = { title: "Audit Logs" };

const ENTITIES = [
  "attendance", "employees", "employee_personal", "salary_structures", "employee_documents", "leave_requests",
  "payroll_records", "payroll_items", "company_settings", "profiles", "report", "auth", "departments", "holidays", "shifts",
];

function describe(l: AuditLog): string {
  if (l.summary) return l.summary;
  const d = l.details as { changes?: Record<string, { from: unknown; to: unknown }> } | null;
  if (l.action === "update" && d?.changes) {
    return Object.entries(d.changes)
      .slice(0, 6)
      .map(([k, v]) => `${k.replaceAll("_", " ")}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`)
      .join(" · ");
  }
  return `${l.action} ${l.entity.replaceAll("_", " ")}`;
}

export default async function AuditLogsPage({ searchParams }: PageProps<"/admin/audit-logs">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const { page, pageSize, from, to } = pageParams(sp, 50);
  const entity = param(sp, "entity");
  const action = param(sp, "action");
  const actor = param(sp, "actor");
  const dfrom = param(sp, "from");
  const dto = param(sp, "to");
  const supabase = await createClient();
  let q = supabase.from("audit_logs").select("*", { count: "exact" });
  if (entity && ENTITIES.includes(entity)) q = q.eq("entity", entity);
  if (action) q = q.ilike("action", `${action.replace(/[^a-z_]/g, "")}%`);
  if (actor) q = q.eq("actor_id", actor);
  if (isISODate(dfrom)) q = q.gte("created_at", `${dfrom}T00:00:00+06:00`);
  if (isISODate(dto)) q = q.lt("created_at", `${addDays(dto, 1)}T00:00:00+06:00`);
  const [{ data, count }, { data: profiles }] = await Promise.all([
    q.order("created_at", { ascending: false }).range(from, to),
    supabase.from("profiles").select("id, username"),
  ]);
  const logs = (data ?? []) as AuditLog[];

  return (
    <>
      <PageHeader title="Audit Logs" description="Append-only record of every change, sign-in, export and print. Logs cannot be edited or deleted." />
      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <FilterBar filters={[
            { type: "select", name: "entity", label: "Area", options: ENTITIES.map((e) => ({ value: e, label: e.replaceAll("_", " ") })) },
            { type: "select", name: "action", label: "Action", options: ["insert", "update", "delete", "login", "export", "close", "download", "reset_password", "create_user"].map((a) => ({ value: a, label: a.replaceAll("_", " ") })) },
            { type: "select", name: "actor", label: "User", options: ((profiles ?? []) as { id: string; username: string }[]).map((p) => ({ value: p.id, label: p.username })) },
            { type: "date", name: "from", label: "From" },
            { type: "date", name: "to", label: "To" },
          ]} />
        </div>
        {logs.length === 0 ? <EmptyState icon={ScrollText} title="No log entries" /> : (
          <div className="overflow-x-auto">
            <Table className="text-[13px]">
              <TableHeader><TableRow>
                <TableHead className="pl-4">Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Area</TableHead><TableHead className="pr-4">Details</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id} className="align-top">
                    <TableCell className="tabular pl-4 whitespace-nowrap">{formatDateTime(l.created_at)}</TableCell>
                    <TableCell>{l.actor_name ?? "system"}</TableCell>
                    <TableCell>
                      <ToneBadge tone={l.action === "delete" ? "danger" : l.action === "insert" ? "success" : l.action.startsWith("export") ? "brand" : "info"}>
                        {l.action.replaceAll("_", " ")}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="capitalize">{l.entity.replaceAll("_", " ")}</TableCell>
                    <TableCell className="max-w-xl pr-4 text-xs break-words whitespace-normal text-muted-foreground">{describe(l)}</TableCell>
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
