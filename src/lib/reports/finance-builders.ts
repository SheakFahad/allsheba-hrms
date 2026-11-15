import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod } from "@/lib/params";
import { MONTH_LABELS } from "@/lib/constants";
import {
  EXPENSE_METHOD_LABELS, FINANCE_STATUS_LABELS, SALARY_METHOD_LABELS, SALARY_MONTH_STATUS_LABELS,
  type Expense, type SalaryMonthStatus, type SalaryPayment,
} from "@/lib/finance";
import { formatAmount } from "@/lib/format";
import { formatDate, formatMonth } from "@/lib/time";
import type { ReportColumn, ReportParams, ReportSection, Row, TableSection } from "./types";

interface Ctx {
  today: string;
  p: ReportParams;
}

interface Built {
  title: string;
  subtitle?: string;
  orientation: "portrait" | "landscape";
  meta: { label: string; value: string }[];
  sections: ReportSection[];
  fileName?: string;
}

interface MonthStatusRow {
  employee_id: string; employee_code: string; employee_name: string; designation: string | null;
  configured_salary: number; paid: number; pending: number; remaining: number; status: SalaryMonthStatus;
}

const money = (n: number) => `BDT ${formatAmount(n)}`;
const amt = (label: string, key = "amount"): ReportColumn => ({ key, label, format: "money", align: "right" });

/** First day of every month that overlaps [from, to]. */
function monthsIn(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endKey = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(`${key}-01`);
    if (key >= endKey || out.length > 120) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

async function monthStatus(months: string[]): Promise<(MonthStatusRow & { month: string })[]> {
  const supabase = await createClient();
  const all = await Promise.all(
    months.map(async (month) => {
      const { data } = await supabase.rpc("salary_payment_status", { p_month: month });
      return ((data ?? []) as MonthStatusRow[]).map((r) => ({
        ...r, month,
        configured_salary: Number(r.configured_salary), paid: Number(r.paid), pending: Number(r.pending), remaining: Number(r.remaining),
      }));
    }),
  );
  return all.flat();
}

export const financeBuilders: Record<string, (ctx: Ctx) => Promise<Built>> = {
  async cost_report(ctx): Promise<Built> {
    const { from, to } = resolvePeriod({ from: ctx.p.from, to: ctx.p.to, month: ctx.p.month, year: ctx.p.year }, ctx.today);
    const supabase = await createClient();

    let eq = supabase
      .from("expenses")
      .select("*, expense_categories(name)")
      .neq("status", "cancelled")
      .gte("expense_date", from)
      .lte("expense_date", to);
    if (ctx.p.category) eq = eq.eq("category_id", ctx.p.category);
    if (ctx.p.method) eq = eq.eq("payment_method", ctx.p.method);
    if (ctx.p.pstatus === "pending" || ctx.p.pstatus === "confirmed") eq = eq.eq("status", ctx.p.pstatus);

    let sq = supabase.from("salary_payments").select("*").neq("status", "cancelled").gte("payment_date", from).lte("payment_date", to);
    if (ctx.p.employee) sq = sq.eq("employee_id", ctx.p.employee);
    if (ctx.p.method) sq = sq.eq("payment_method", ctx.p.method);
    if (ctx.p.pstatus === "pending" || ctx.p.pstatus === "confirmed") sq = sq.eq("status", ctx.p.pstatus);

    const [{ data: ex }, { data: sal }, statusRows] = await Promise.all([
      eq.order("expense_date"),
      sq.order("payment_date"),
      monthStatus(monthsIn(from, to)),
    ]);
    const expenses = (ex ?? []) as Expense[];
    const salaries = (sal ?? []) as SalaryPayment[];
    const status = statusRows.filter((r) => !ctx.p.employee || r.employee_id === ctx.p.employee);

    const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
    const conf = (x: { status: string }) => x.status === "confirmed";
    const dailyConfirmed = sum(expenses.filter((e) => e.expense_kind === "daily" && conf(e)), (e) => Number(e.amount));
    const monthlyConfirmed = sum(expenses.filter((e) => e.expense_kind === "monthly" && conf(e)), (e) => Number(e.amount));
    const expensePending = sum(expenses.filter((e) => !conf(e)), (e) => Number(e.amount));
    const salaryPaid = sum(salaries.filter(conf), (s) => Number(s.amount));
    const salaryUnconfirmed = sum(salaries.filter((s) => !conf(s)), (s) => Number(s.amount));
    const partialPaid = sum(status.filter((r) => r.status === "partially_paid"), (r) => r.paid);
    const salaryPending = sum(status, (r) => r.remaining);
    const businessExpenses = dailyConfirmed + monthlyConfirmed;
    const totalCost = businessExpenses + salaryPaid;

    // Category summary (confirmed vs pending)
    const byCat = new Map<string, { confirmed: number; pending: number; n: number }>();
    for (const e of expenses) {
      const k = `${e.expense_categories?.name ?? "—"}|${e.expense_kind}`;
      const v = byCat.get(k) ?? { confirmed: 0, pending: 0, n: 0 };
      if (conf(e)) v.confirmed += Number(e.amount); else v.pending += Number(e.amount);
      v.n++;
      byCat.set(k, v);
    }

    // Day / month / year cost summaries (confirmed only)
    const bucket = (len: number) => {
      const m = new Map<string, { expenses: number; salary: number }>();
      for (const e of expenses.filter(conf)) {
        const k = e.expense_date.slice(0, len);
        const v = m.get(k) ?? { expenses: 0, salary: 0 };
        v.expenses += Number(e.amount);
        m.set(k, v);
      }
      for (const s of salaries.filter(conf)) {
        const k = s.payment_date.slice(0, len);
        const v = m.get(k) ?? { expenses: 0, salary: 0 };
        v.salary += Number(s.amount);
        m.set(k, v);
      }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };
    const costCols = (first: ReportColumn): ReportColumn[] => [first, amt("Expenses (confirmed)", "expenses"), amt("Salary paid", "salary"), amt("Total cost", "total")];
    const costRows = (len: number, label: (k: string) => string): Row[] =>
      bucket(len).map(([k, v]) => ({ period: label(k), expenses: v.expenses, salary: v.salary, total: v.expenses + v.salary }));
    const totalsRow = (rows: Row[]): Row => ({
      period: "Total",
      expenses: sum(rows, (r) => Number(r.expenses)), salary: sum(rows, (r) => Number(r.salary)), total: sum(rows, (r) => Number(r.total)),
    });

    const dayRows = costRows(10, (k) => formatDate(k));
    const monthRows = costRows(7, (k) => formatMonth(Number(k.slice(0, 4)), Number(k.slice(5, 7))));
    const yearRows = costRows(4, (k) => k);

    const expenseHistory = (kind: "daily" | "monthly"): TableSection => {
      const list = expenses.filter((e) => e.expense_kind === kind);
      return {
        kind: "table",
        title: kind === "daily" ? "Daily expense history" : "Monthly expense history",
        columns: [
          { key: "voucher", label: "Voucher" }, { key: "date", label: "Date", format: "date" },
          ...(kind === "monthly" ? [{ key: "period", label: "Period" }] : []),
          { key: "category", label: "Category" }, { key: "name", label: "Name" }, { key: "method", label: "Payment" },
          amt("Amount"), { key: "status", label: "Status" },
        ],
        rows: list.map((e) => ({
          voucher: e.voucher_no, date: e.expense_date,
          period: e.period_start && e.period_end ? `${formatDate(e.period_start)} – ${formatDate(e.period_end)}` : null,
          category: e.expense_categories?.name ?? "", name: e.payee_name, method: EXPENSE_METHOD_LABELS[e.payment_method],
          amount: Number(e.amount), status: FINANCE_STATUS_LABELS[e.status],
        })),
        totals: { voucher: "Total", amount: sum(list, (e) => Number(e.amount)) },
      };
    };

    return {
      title: "Total Cost & Expense Report",
      subtitle: `${formatDate(from)} – ${formatDate(to)}`,
      orientation: "landscape",
      meta: [
        { label: "Rule", value: "Total cost = confirmed business expenses + confirmed salary payments. Pending items are shown separately." },
      ],
      sections: [
        {
          kind: "kv",
          title: "Summary",
          items: [
            { label: "Total daily expenses", value: money(dailyConfirmed) },
            { label: "Total monthly expenses", value: money(monthlyConfirmed) },
            { label: "Confirmed business expenses", value: money(businessExpenses) },
            { label: "Total salary paid", value: money(salaryPaid) },
            { label: "Partial salary paid", value: money(partialPaid) },
            { label: "Salary pending", value: money(salaryPending) },
            { label: "TOTAL COST", value: money(totalCost) },
            { label: "Expenses awaiting confirmation", value: money(expensePending) },
            { label: "Salary awaiting confirmation", value: money(salaryUnconfirmed) },
          ],
        },
        {
          kind: "table", primary: true, title: "Daily cost summary",
          columns: costCols({ key: "period", label: "Date" }), rows: dayRows, totals: totalsRow(dayRows),
        },
        { kind: "table", title: "Monthly cost summary", columns: costCols({ key: "period", label: "Month" }), rows: monthRows, totals: totalsRow(monthRows) },
        { kind: "table", title: "Yearly cost summary", columns: costCols({ key: "period", label: "Year" }), rows: yearRows, totals: totalsRow(yearRows) },
        {
          kind: "table", title: "Category-wise expense summary",
          columns: [{ key: "category", label: "Category" }, { key: "kind", label: "Type" }, { key: "n", label: "Vouchers", format: "number", align: "right" }, amt("Confirmed", "confirmed"), amt("Pending", "pending")],
          rows: [...byCat.entries()].sort((a, b) => b[1].confirmed - a[1].confirmed).map(([k, v]) => {
            const [category, kind] = k.split("|");
            return { category, kind: kind === "monthly" ? "Monthly" : "Daily", n: v.n, confirmed: v.confirmed, pending: v.pending };
          }),
          totals: { category: "Total", confirmed: businessExpenses, pending: expensePending },
        },
        {
          kind: "table", title: "Employee-wise salary payment history",
          columns: [
            { key: "voucher", label: "Voucher" }, { key: "date", label: "Paid on", format: "date" }, { key: "code", label: "Emp. ID" },
            { key: "name", label: "Employee" }, { key: "month", label: "Salary month" }, { key: "method", label: "Payment" }, amt("Amount"), { key: "status", label: "Status" },
          ],
          rows: [...salaries].sort((a, b) => a.employee_name.localeCompare(b.employee_name) || a.payment_date.localeCompare(b.payment_date)).map((s) => ({
            voucher: s.voucher_no, date: s.payment_date, code: s.employee_code, name: s.employee_name,
            month: formatMonth(Number(s.salary_month.slice(0, 4)), Number(s.salary_month.slice(5, 7))),
            method: SALARY_METHOD_LABELS[s.payment_method], amount: Number(s.amount), status: FINANCE_STATUS_LABELS[s.status],
          })),
          totals: { voucher: "Total", amount: sum(salaries, (s) => Number(s.amount)) },
        },
        {
          kind: "table", title: "Employee-wise pending salary",
          columns: [
            { key: "month", label: "Month" }, { key: "code", label: "Emp. ID" }, { key: "name", label: "Employee" },
            amt("Configured", "salary"), amt("Paid", "paid"), amt("Pending", "remaining"), { key: "status", label: "Status" },
          ],
          rows: status
            .filter((r) => r.remaining > 0 && (!ctx.p.pstatus || !["partially_paid", "paid"].includes(ctx.p.pstatus) || r.status === ctx.p.pstatus))
            .map((r) => ({
              month: `${MONTH_LABELS[Number(r.month.slice(5, 7)) - 1]} ${r.month.slice(0, 4)}`, code: r.employee_code, name: r.employee_name,
              salary: r.configured_salary, paid: r.paid, remaining: r.remaining, status: SALARY_MONTH_STATUS_LABELS[r.status],
            })),
          totals: { month: "Total", remaining: salaryPending },
        },
        expenseHistory("daily"),
        expenseHistory("monthly"),
        { kind: "signatures", labels: ["Prepared by", "Checked by", "Approved by"] },
      ],
      fileName: `cost-expense-report-${from}-${to}`,
    };
  },

  async salary_payments(ctx): Promise<Built> {
    const month = ctx.p.month ?? ctx.today.slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const supabase = await createClient();
    let q = supabase.from("salary_payments").select("*").eq("salary_month", `${month}-01`).neq("status", "cancelled");
    if (ctx.p.employee) q = q.eq("employee_id", ctx.p.employee);
    if (ctx.p.method) q = q.eq("payment_method", ctx.p.method);
    if (ctx.p.pstatus === "pending" || ctx.p.pstatus === "confirmed") q = q.eq("status", ctx.p.pstatus);
    const [{ data }, status] = await Promise.all([q.order("payment_date"), monthStatus([`${month}-01`])]);
    const rows = (data ?? []) as SalaryPayment[];
    const st = status.filter((r) => (!ctx.p.employee || r.employee_id === ctx.p.employee)
      && (!ctx.p.pstatus || !["partially_paid", "paid"].includes(ctx.p.pstatus) || r.status === ctx.p.pstatus));
    const s = (f: (r: MonthStatusRow) => number) => st.reduce((a, r) => a + f(r), 0);
    return {
      title: "Salary Payment Report",
      subtitle: formatMonth(y, m),
      orientation: "landscape",
      meta: [],
      sections: [
        {
          kind: "kv", title: "Summary",
          items: [
            { label: "Configured salary", value: money(s((r) => r.configured_salary)) },
            { label: "Paid (confirmed)", value: money(s((r) => r.paid)) },
            { label: "Awaiting confirmation", value: money(s((r) => r.pending)) },
            { label: "Salary pending", value: money(s((r) => r.remaining)) },
          ],
        },
        {
          kind: "table", primary: true, title: "Employee-wise status",
          columns: [
            { key: "code", label: "Emp. ID" }, { key: "name", label: "Employee" }, { key: "designation", label: "Designation" },
            amt("Configured", "salary"), amt("Paid", "paid"), amt("Unconfirmed", "pending"), amt("Pending", "remaining"), { key: "status", label: "Status" },
          ],
          rows: st.map((r) => ({
            code: r.employee_code, name: r.employee_name, designation: r.designation, salary: r.configured_salary,
            paid: r.paid, pending: r.pending, remaining: r.remaining, status: SALARY_MONTH_STATUS_LABELS[r.status],
          })),
          totals: { code: "Total", salary: s((r) => r.configured_salary), paid: s((r) => r.paid), pending: s((r) => r.pending), remaining: s((r) => r.remaining) },
        },
        {
          kind: "table", title: "Payments",
          columns: [
            { key: "voucher", label: "Voucher" }, { key: "date", label: "Paid on", format: "date" }, { key: "code", label: "Emp. ID" },
            { key: "name", label: "Employee" }, { key: "method", label: "Payment" }, amt("Amount"), { key: "status", label: "Status" },
          ],
          rows: rows.map((p) => ({
            voucher: p.voucher_no, date: p.payment_date, code: p.employee_code, name: p.employee_name,
            method: SALARY_METHOD_LABELS[p.payment_method], amount: Number(p.amount), status: FINANCE_STATUS_LABELS[p.status],
          })),
          totals: { voucher: "Total", amount: rows.reduce((a, p) => a + Number(p.amount), 0) },
        },
        { kind: "signatures", labels: ["Prepared by", "Checked by", "Approved by"] },
      ],
      fileName: `salary-payments-${month}`,
    };
  },
};
