import { FileClock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorrectionBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ATTENDANCE_STATUS_LABELS, LATE_REASON_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatTime12 } from "@/lib/time";
import type { AttendanceCorrection, AttendanceStatus, LateReason } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  status: "Status", actual_in: "In", actual_out: "Out", scheduled_in: "Sched. in", scheduled_out: "Sched. out",
  late_minutes: "Late min", late_reason: "Late reason", late_reason_note: "Late note", notes: "Notes",
  early_leave_minutes: "Early min", work_minutes: "Worked min",
};

export function formatCorrectionValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "status") return ATTENDANCE_STATUS_LABELS[value as AttendanceStatus] ?? String(value);
  if (key === "late_reason") return LATE_REASON_LABELS[value as LateReason] ?? String(value);
  if (key.startsWith("actual_") || key.startsWith("scheduled_")) return formatTime12(String(value));
  return String(value);
}

export function ChangeList({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = Object.keys(after ?? {});
  if (!keys.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="grid gap-0.5 text-xs">
      {keys.map((k) => (
        <li key={k}>
          <span className="text-muted-foreground">{FIELD_LABELS[k] ?? k}:</span>{" "}
          <span className="line-through opacity-60">{formatCorrectionValue(k, before?.[k])}</span>{" "}
          → <span className="font-medium">{formatCorrectionValue(k, after?.[k])}</span>
        </li>
      ))}
    </ul>
  );
}

export type CorrectionRow = AttendanceCorrection & { employees?: { full_name: string; employee_code: string } | null };

export function CorrectionsTable({
  rows,
  actions,
  users,
}: {
  rows: CorrectionRow[];
  actions?: (r: CorrectionRow) => React.ReactNode;
  users?: Map<string, string>;
}) {
  if (!rows.length) return <EmptyState icon={FileClock} title="No corrections" />;
  return (
    <div className="overflow-x-auto">
      <Table className="text-[13px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Attendance date</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Changes</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>By</TableHead>
            <TableHead>Status</TableHead>
            {actions && <TableHead className="pr-4 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="align-top">
              <TableCell className="tabular pl-4 font-medium">{formatDate(r.attendance_date)}</TableCell>
              <TableCell>
                <span className="block font-medium">{r.employees?.full_name}</span>
                <span className="tabular block text-xs text-muted-foreground">{r.employees?.employee_code}</span>
              </TableCell>
              <TableCell>{r.kind === "request" ? "Request" : "Edit"}</TableCell>
              <TableCell className="min-w-56">
                <ChangeList before={r.before_data} after={r.kind === "request" && r.status === "pending" ? r.proposed_data : r.after_data ?? r.proposed_data} />
              </TableCell>
              <TableCell className="max-w-64 whitespace-normal">
                {r.reason}
                {r.review_note && <span className="block text-xs text-muted-foreground">Review: {r.review_note}</span>}
              </TableCell>
              <TableCell className="text-xs">
                <span className="block">{(r.requested_by && users?.get(r.requested_by)) ?? "—"}</span>
                <span className="block text-muted-foreground">{formatDateTime(r.created_at)}</span>
              </TableCell>
              <TableCell><CorrectionBadge status={r.status} /></TableCell>
              {actions && <TableCell className="pr-4 text-right">{actions(r)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
