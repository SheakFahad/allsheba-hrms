"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { ActionError, check, runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { isoDate, optionalText, uuid } from "@/lib/validation";

function revalidateFinance() {
  for (const p of ["/admin/expenses", "/entry/expenses", "/admin/salary-payments", "/admin/finance"]) revalidatePath(p);
}

const names = {
  prepared_by_name: optionalText(80),
  checked_by_name: optionalText(80),
  approved_by_name: optionalText(80),
  received_by_name: optionalText(80),
};

const expenseSchema = z
  .object({
    id: z.union([uuid, z.literal("")]).optional(),
    expense_kind: z.enum(["daily", "monthly"]),
    category_id: uuid,
    expense_date: isoDate,
    period_start: z.union([isoDate, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
    period_end: z.union([isoDate, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
    payee_name: z.string().trim().min(1, "Enter the name").max(120),
    employee_id: z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
    employee_designation: optionalText(80),
    details: optionalText(2000),
    amount: z.coerce.number().positive("Amount must be more than 0").max(1_000_000_000),
    comments: optionalText(1000),
    payment_method: z.enum(["cash", "bank_transfer", "mobile_banking", "cheque", "other"]),
    ...names,
  })
  .refine((v) => v.expense_kind === "daily" || (v.period_start && v.period_end && v.period_end >= v.period_start), {
    path: ["period_end"],
    message: "Enter a valid period (end on or after start)",
  });

export async function saveExpense(input: unknown) {
  return runAction(expenseSchema, input, async ({ id, ...v }) => {
    const user = await assertRole("admin", "entry");
    if (!user.canManageExpenses) throw new ActionError("You do not have permission to manage expenses.");
    const row = {
      ...v,
      period_start: v.expense_kind === "monthly" ? v.period_start : null,
      period_end: v.expense_kind === "monthly" ? v.period_end : null,
    };
    const supabase = await createClient();
    if (id) {
      const res = check(await supabase.from("expenses").update(row).eq("id", id).select("id"));
      if (!res.data?.length) throw new ActionError("This expense can no longer be edited.");
      revalidateFinance();
      return { id };
    }
    const { data } = check(await supabase.from("expenses").insert(row).select("id").single());
    revalidateFinance();
    return { id: (data as { id: string }).id };
  });
}

export async function setExpenseStatus(input: unknown) {
  return runAction(
    z.object({ id: uuid, status: z.enum(["confirmed", "cancelled"]), reason: z.string().trim().max(300).optional() }),
    input,
    async (v) => {
      await assertRole("admin");
      const supabase = await createClient();
      check(await supabase.rpc("set_expense_status", { p_id: v.id, p_status: v.status, p_reason: v.reason || null }));
      revalidateFinance();
      return { ok: true as const, message: v.status === "confirmed" ? "Expense confirmed as paid" : "Expense cancelled" };
    },
  );
}

export async function saveExpenseCategory(input: unknown) {
  return runAction(
    z.object({
      id: z.union([uuid, z.literal("")]).optional(),
      name: z.string().trim().min(1, "Enter a name").max(80),
      kind: z.enum(["daily", "monthly", "both"]),
      is_active: z.union([z.boolean(), z.literal("true"), z.literal("false")]).transform((x) => x === true || x === "true"),
    }),
    input,
    async ({ id, ...v }) => {
      await assertRole("admin");
      const supabase = await createClient();
      check(id ? await supabase.from("expense_categories").update(v).eq("id", id) : await supabase.from("expense_categories").insert(v));
      revalidateFinance();
      return { ok: true as const, message: "Category saved" };
    },
  );
}

/** Employee details and the month's configured salary / payments, for auto-fill. */
export async function salaryLookup(input: unknown) {
  return runAction(z.object({ employee_id: uuid, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }), input, async (v) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { data } = check(await supabase.rpc("salary_payment_status", { p_month: `${v.month}-01` }));
    const row = ((data ?? []) as {
      employee_id: string; employee_code: string; employee_name: string; designation: string | null;
      configured_salary: number; paid: number; pending: number; remaining: number; status: string;
    }[]).find((r) => r.employee_id === v.employee_id);
    if (!row) throw new ActionError("This employee was not employed in that month.");
    return {
      code: row.employee_code,
      name: row.employee_name,
      designation: row.designation,
      configuredSalary: Number(row.configured_salary),
      paid: Number(row.paid),
      pending: Number(row.pending),
      remaining: Math.max(Number(row.configured_salary) - Number(row.paid) - Number(row.pending), 0),
      status: row.status,
    };
  });
}

const salarySchema = z.object({
  employee_id: uuid,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Select the salary month"),
  amount: z.coerce.number().positive("Amount must be more than 0").max(1_000_000_000),
  payment_date: isoDate,
  payment_method: z.enum(["cash", "bank_transfer", "mobile_banking", "other"]),
  designation: optionalText(80),
  comments: optionalText(1000),
  over_salary_reason: optionalText(300),
  ...names,
});

export async function saveSalaryPayment(input: unknown) {
  return runAction(salarySchema, input, async ({ month, ...v }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { data } = check(
      await supabase
        .from("salary_payments")
        // employee_code / employee_name / configured_salary are filled by the database trigger.
        .insert({ ...v, salary_month: `${month}-01`, employee_code: "", employee_name: "" })
        .select("id")
        .single(),
    );
    revalidateFinance();
    return { id: (data as { id: string }).id };
  });
}

export async function setSalaryPaymentStatus(input: unknown) {
  return runAction(
    z.object({ id: uuid, status: z.enum(["confirmed", "cancelled"]), reason: z.string().trim().max(300).optional() }),
    input,
    async (v) => {
      await assertRole("admin");
      const supabase = await createClient();
      check(await supabase.rpc("set_salary_payment_status", { p_id: v.id, p_status: v.status, p_reason: v.reason || null }));
      revalidateFinance();
      return { ok: true as const, message: v.status === "confirmed" ? "Payment confirmed as paid" : "Payment cancelled" };
    },
  );
}

export async function setExpensePermission(input: unknown) {
  return runAction(
    z.object({ id: uuid, allowed: z.boolean() }),
    input,
    async (v) => {
      await assertRole("admin");
      const supabase = await createClient();
      check(await supabase.from("profiles").update({ can_manage_expenses: v.allowed }).eq("id", v.id).eq("role", "entry"));
      revalidatePath("/admin/users");
      return { ok: true as const, message: v.allowed ? "Expense entry granted" : "Expense entry removed" };
    },
  );
}
