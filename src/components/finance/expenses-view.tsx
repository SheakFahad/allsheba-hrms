import { Receipt } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { ToneBadge } from "@/components/shared/status-badge";
import { ExpenseDialog, ExpenseRowActions, type EmployeeLite } from "@/components/finance/expense-controls";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees } from "@/lib/data";
import { EXPENSE_METHOD_LABELS, FINANCE_STATUS_LABELS, type Expense, type ExpenseCategory, type ExpenseKind } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { escapeLike, isISODate, pageParams, param, type SearchParams } from "@/lib/params";
import { formatDate, todayISO } from "@/lib/time";
import type { SessionUser } from "@/lib/auth";
import type { Tone } from "@/lib/constants";

const STATUS_TONE: Record<string, Tone> = { pending: "warning", confirmed: "success", cancelled: "neutral" };

export async function ExpensesView({
  kind,
  sp,
  user,
  timezone,
  voucherBase,
}: {
  kind: ExpenseKind;
  sp: SearchParams;
  user: SessionUser;
  timezone: string;
  voucherBase: string;
}) {
  const isAdmin = user.role === "admin";
  const today = todayISO(timezone);
  const from = isISODate(param(sp, "from")) ? param(sp, "from")! : `${today.slice(0, 7)}-01`;
  const to = isISODate(param(sp, "to")) ? param(sp, "to")! : today;
  const category = param(sp, "category");
  const status = param(sp, "status");
  const method = param(sp, "method");
  const q = param(sp, "q");
  const { page, pageSize, from: rFrom, to: rTo } = pageParams(sp, 50);

  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("*, expense_categories(name), employees(full_name, employee_code)")
    .eq("expense_kind", kind)
    .gte("expense_date", from)
    .lte("expense_date", to);
  if (category) query = query.eq("category_id", category);
  if (status && ["pending", "confirmed", "cancelled"].includes(status)) query = query.eq("status", status);
  if (method) query = query.eq("payment_method", method);
  if (q) query = query.or(`payee_name.ilike.%${escapeLike(q)}%,voucher_no.ilike.%${escapeLike(q)}%`);
  const [{ data }, { data: cats }, employees] = await Promise.all([
    query.order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
    supabase.from("expense_categories").select("*").order("name"),
    isAdmin ? getActiveEmployees() : Promise.resolve([]),
  ]);
  const rows = (data ?? []) as Expense[];
  const categories = (cats ?? []) as ExpenseCategory[];
  const employeeList: EmployeeLite[] = employees.map((e) => ({ id: e.id, name: e.full_name, code: e.employee_code, designation: e.designations?.name ?? null }));

  const live = rows.filter((r) => r.status !== "cancelled");
  const sum = (list: Expense[]) => list.reduce((s, r) => s + Number(r.amount), 0);
  const confirmed = sum(live.filter((r) => r.status === "confirmed"));
  const pendingTotal = sum(live.filter((r) => r.status === "pending"));
  const byDay = new Map<string, { confirmed: number; pending: number; n: number }>();
  for (const r of live) {
    const d = byDay.get(r.expense_date) ?? { confirmed: 0, pending: 0, n: 0 };
    if (r.status === "confirmed") d.confirmed += Number(r.amount);
    else d.pending += Number(r.amount);
    d.n++;
    byDay.set(r.expense_date, d);
  }
  const pageRows = rows.slice(rFrom, rTo + 1);
  const dialogProps = { kind, categories, employees: employeeList, today, preparedBy: user.fullName, voucherBase };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar
          filters={[
            { type: "search", name: "q", placeholder: "Search name or voucher no…" },
            { type: "date", name: "from", label: "From" },
            { type: "date", name: "to", label: "To" },
            { type: "select", name: "category", label: "Category", options: categories.filter((c) => c.kind === "both" || c.kind === kind).map((c) => ({ value: c.id, label: c.name })) },
            { type: "select", name: "status", label: "Status", options: Object.entries(FINANCE_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
            { type: "select", name: "method", label: "Payment", options: Object.entries(EXPENSE_METHOD_LABELS).map(([value, label]) => ({ value, label })) },
          ]}
        />
        <ExpenseDialog {...dialogProps} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Confirmed (paid)" value={formatMoney(confirmed)} tone="success" hint={`${formatDate(from)} – ${formatDate(to)}`} />
        <StatCard label="Pending confirmation" value={formatMoney(pendingTotal)} tone="warning" hint="Not counted as paid" />
        <StatCard label="Vouchers" value={live.length} tone="info" hint={`${rows.length - live.length} cancelled`} />
        <StatCard label="Today" value={formatMoney((byDay.get(today)?.confirmed ?? 0) + (byDay.get(today)?.pending ?? 0))} tone="brand" />
      </div>

      {kind === "daily" && byDay.size > 0 && (
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4"><CardTitle>Daily totals</CardTitle></CardHeader>
          <div className="max-h-72 overflow-y-auto">
            <Table className="text-[13px]">
              <TableHeader><TableRow><TableHead className="pl-4">Date</TableHead><TableHead className="text-right">Vouchers</TableHead><TableHead className="text-right">Confirmed</TableHead><TableHead className="pr-4 text-right">Pending</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, t]) => (
                  <TableRow key={d}>
                    <TableCell className="tabular pl-4">{formatDate(d)}</TableCell>
                    <TableCell className="tabular text-right">{t.n}</TableCell>
                    <TableCell className="tabular text-right font-medium">{formatMoney(t.confirmed)}</TableCell>
                    <TableCell className="tabular pr-4 text-right text-warning">{t.pending ? formatMoney(t.pending) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="gap-0 py-0">
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title={`No ${kind} expenses in this period`} description="Add an expense to create its voucher." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Voucher</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="tabular pl-4 font-medium">{r.voucher_no}</TableCell>
                    <TableCell className="tabular">
                      {formatDate(r.expense_date)}
                      {r.period_start && r.period_end && <span className="block text-xs text-muted-foreground">{formatDate(r.period_start)} – {formatDate(r.period_end)}</span>}
                    </TableCell>
                    <TableCell>{r.expense_categories?.name}</TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate">{r.payee_name}</span>
                      {r.employees && <span className="block truncate text-xs text-muted-foreground">{r.employees.full_name}{r.employee_designation ? ` · ${r.employee_designation}` : ""}</span>}
                    </TableCell>
                    <TableCell>{EXPENSE_METHOD_LABELS[r.payment_method]}</TableCell>
                    <TableCell className="tabular text-right font-semibold">{formatMoney(r.amount)}</TableCell>
                    <TableCell>
                      <ToneBadge tone={STATUS_TONE[r.status]}>{FINANCE_STATUS_LABELS[r.status]}</ToneBadge>
                      {r.cancel_reason && <span className="mt-0.5 block max-w-40 truncate text-xs text-muted-foreground" title={r.cancel_reason}>{r.cancel_reason}</span>}
                    </TableCell>
                    <TableCell className="pr-4">
                      <ExpenseRowActions
                        expense={r}
                        isAdmin={isAdmin}
                        canEdit
                        voucherHref={`${voucherBase}/${r.id}`}
                        editDialog={<ExpenseDialog {...dialogProps} expense={r} />}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4 font-semibold" colSpan={5}>Total (excluding cancelled)</TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatMoney(confirmed + pendingTotal)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={rows.length} />
      </Card>
    </div>
  );
}
