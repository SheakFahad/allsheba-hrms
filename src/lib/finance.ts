/** Shared finance types, labels and helpers (client + server safe). */

export type ExpenseKind = "daily" | "monthly";
export type FinanceStatus = "pending" | "confirmed" | "cancelled";
export type ExpenseMethod = "cash" | "bank_transfer" | "mobile_banking" | "cheque" | "other";
export type SalaryMethod = "cash" | "bank_transfer" | "mobile_banking" | "other";
export type SalaryMonthStatus = "pending" | "partially_paid" | "paid";

export interface ExpenseCategory {
  id: string;
  name: string;
  kind: "daily" | "monthly" | "both";
  is_active: boolean;
}

export interface Expense {
  id: string;
  voucher_no: string;
  expense_kind: ExpenseKind;
  category_id: string;
  expense_date: string;
  period_start: string | null;
  period_end: string | null;
  payee_name: string;
  employee_id: string | null;
  employee_designation: string | null;
  details: string | null;
  amount: number;
  comments: string | null;
  payment_method: ExpenseMethod;
  status: FinanceStatus;
  prepared_by_name: string | null;
  checked_by_name: string | null;
  approved_by_name: string | null;
  received_by_name: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  expense_categories?: { name: string } | null;
  employees?: { full_name: string; employee_code: string } | null;
}

export interface SalaryPayment {
  id: string;
  voucher_no: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  designation: string | null;
  salary_month: string;
  configured_salary: number;
  amount: number;
  payment_date: string;
  payment_method: SalaryMethod;
  status: FinanceStatus;
  comments: string | null;
  over_salary_reason: string | null;
  prepared_by_name: string | null;
  checked_by_name: string | null;
  approved_by_name: string | null;
  received_by_name: string | null;
  cancel_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  mobile_banking: "Mobile Banking",
  cheque: "Cheque",
  other: "Other",
};
export const SALARY_METHOD_LABELS: Record<SalaryMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  mobile_banking: "Mobile Banking",
  other: "Other",
};
export const FINANCE_STATUS_LABELS: Record<FinanceStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};
export const SALARY_MONTH_STATUS_LABELS: Record<SalaryMonthStatus, string> = {
  pending: "Pending",
  partially_paid: "Partially Paid",
  paid: "Paid",
};

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** Whole number in words using the Bangladeshi system (crore / lakh / thousand). */
export function integerInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${integerInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

/** 5450.5 → "Taka Five Thousand Four Hundred Fifty and Paisa Fifty Only" */
export function amountInWords(amount: number | string): string {
  const v = Math.round(Number(amount) * 100) / 100;
  const taka = Math.floor(v);
  const paisa = Math.round((v - taka) * 100);
  return `Taka ${integerInWords(taka)}${paisa ? ` and Paisa ${integerInWords(paisa)}` : ""} Only`;
}
