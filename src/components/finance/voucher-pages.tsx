import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { VoucherSheet, type VoucherBranding } from "@/components/finance/voucher-sheet";
import { createClient } from "@/lib/supabase/server";
import { getBranding } from "@/lib/data";
import { amountInWords, EXPENSE_METHOD_LABELS, SALARY_METHOD_LABELS, type Expense, type SalaryPayment } from "@/lib/finance";
import { formatDate, formatMonth } from "@/lib/time";

async function voucherBranding(): Promise<VoucherBranding> {
  const b = await getBranding();
  return { name: b.name, address: b.address, phone: b.phone, email: b.email, logoUrl: b.logoUrl };
}

/** Daily / monthly expense voucher (RLS decides who may open it). */
export async function ExpenseVoucherPage({ id, backHref }: { id: string; backHref: string }) {
  const supabase = await createClient();
  const [{ data }, branding] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, expense_categories(name), employees(full_name, employee_code)")
      .eq("id", id)
      .maybeSingle<Expense>(),
    voucherBranding(),
  ]);
  if (!data) notFound();
  const e = data;
  const typeLabel = `${e.expense_categories?.name ?? "Expense"} (${e.expense_kind === "monthly" ? "Monthly" : "Daily"})`;
  return (
    <>
      <PageHeader title={`Expense Voucher ${e.voucher_no}`} back={{ href: backHref, label: "Expenses" }} />
      <VoucherSheet
        b={branding}
        v={{
          title: "Expense Voucher",
          voucherNo: e.voucher_no,
          date: formatDate(e.expense_date),
          status: e.status,
          rows: [
            { label: "Name", value: e.payee_name },
            { label: "Type", value: typeLabel },
            { label: "Employee", value: e.employees ? `${e.employees.full_name} (${e.employees.employee_code})` : "" },
            { label: "Designation", value: e.employee_designation ?? "" },
            ...(e.expense_kind === "monthly" && e.period_start && e.period_end
              ? [{ label: "Period", value: `${formatDate(e.period_start)} – ${formatDate(e.period_end)}` }]
              : []),
            { label: "Payment method", value: EXPENSE_METHOD_LABELS[e.payment_method] },
            { label: "Comments", value: e.comments ?? "" },
          ],
          details: { label: "Full details", value: e.details ?? "" },
          amount: Number(e.amount),
          amountWords: amountInWords(e.amount),
          signatures: [
            { label: "Prepared By", name: e.prepared_by_name },
            { label: "Checked By", name: e.checked_by_name },
            { label: "Approved By", name: e.approved_by_name },
            { label: "Received By", name: e.received_by_name },
          ],
          fileName: `expense-voucher-${e.voucher_no}`,
        }}
      />
    </>
  );
}

/** Salary payment voucher (administrators only, enforced by RLS). */
export async function SalaryVoucherPage({ id, backHref }: { id: string; backHref: string }) {
  const supabase = await createClient();
  const [{ data }, branding] = await Promise.all([
    supabase.from("salary_payments").select("*").eq("id", id).maybeSingle<SalaryPayment>(),
    voucherBranding(),
  ]);
  if (!data) notFound();
  const p = data;
  const [y, m] = p.salary_month.split("-").map(Number);
  return (
    <>
      <PageHeader title={`Salary Voucher ${p.voucher_no}`} back={{ href: backHref, label: "Salary payments" }} />
      <VoucherSheet
        b={branding}
        v={{
          title: "Salary Payment Voucher",
          voucherNo: p.voucher_no,
          date: formatDate(p.payment_date),
          status: p.status,
          rows: [
            { label: "Employee name", value: p.employee_name },
            { label: "Employee ID", value: p.employee_code },
            { label: "Designation", value: p.designation ?? "" },
            { label: "Salary month", value: formatMonth(y, m) },
            { label: "Payment date", value: formatDate(p.payment_date) },
            { label: "Payment method", value: SALARY_METHOD_LABELS[p.payment_method] },
            ...(p.comments ? [{ label: "Comments", value: p.comments }] : []),
          ],
          details: null,
          amount: Number(p.amount),
          amountWords: amountInWords(p.amount),
          signatures: [
            { label: "Prepared By", name: p.prepared_by_name },
            { label: "Checked By", name: p.checked_by_name },
            { label: "Approved By", name: p.approved_by_name },
            { label: "Received By", name: p.received_by_name },
            { label: "Employee Signature", name: null },
          ],
          fileName: `salary-voucher-${p.voucher_no}`,
        }}
      />
    </>
  );
}

const SIGNATURES = ["Prepared By", "Checked By", "Approved By", "Received By"];

/** Blank expense voucher to print and fill in by hand (offline). */
export async function BlankExpenseVoucherPage({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  const branding = await voucherBranding();
  return (
    <>
      <PageHeader title="Blank Expense Voucher" description="Print and fill in by hand with a pen." back={{ href: backHref, label: backLabel }} />
      <VoucherSheet
        b={branding}
        v={{
          blank: true,
          title: "Daily Expense",
          voucherNo: "",
          date: "",
          status: "pending",
          rows: [
            { label: "Name:", value: "" },
            { label: "Date:", value: "" },
            { label: "", value: "", spacer: true },
            { label: "Employee Designation:", value: "" },
          ],
          table: { columns: ["Date / Type", "Full Details", "Amount", "Comments"] },
          details: null,
          amount: 0,
          amountWords: "",
          signatures: ["Prepared By", "Checked By", "Approved By", "Received"].map((label) => ({ label })),
          fileName: "blank-expense-voucher",
        }}
      />
    </>
  );
}

/** Blank salary payment voucher to print and fill in by hand (offline). */
export async function BlankSalaryVoucherPage({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  const branding = await voucherBranding();
  return (
    <>
      <PageHeader title="Blank Salary Payment Voucher" description="Print and fill in by hand with a pen." back={{ href: backHref, label: backLabel }} />
      <VoucherSheet
        b={branding}
        v={{
          blank: true,
          title: "Salary Payment Voucher",
          voucherNo: "",
          date: "",
          status: "pending",
          rows: [
            { label: "Employee name", value: "" },
            { label: "Employee ID", value: "" },
            { label: "Designation", value: "" },
            { label: "Salary month", value: "" },
            { label: "Payment date", value: "" },
            { label: "Payment type", value: "", choices: ["Full", "Partial"] },
            { label: "Payment method", value: "", full: true, choices: Object.values(SALARY_METHOD_LABELS) },
            { label: "Comments", value: "", full: true },
          ],
          details: { label: "Notes", value: "" },
          amount: 0,
          amountWords: "",
          signatures: [...SIGNATURES, "Employee Signature"].map((label) => ({ label })),
          fileName: "blank-salary-voucher",
        }}
      />
    </>
  );
}
