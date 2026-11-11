"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { check, runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { optionalText, uuid } from "@/lib/validation";

export async function generatePayroll(input: unknown) {
  return runAction(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Select a month") }), input, async ({ month }) => {
    await assertRole("admin");
    const [y, m] = month.split("-").map(Number);
    const supabase = await createClient();
    const { data } = check(await supabase.rpc("generate_payroll", { p_year: y, p_month: m }));
    revalidatePath("/admin/payroll");
    return { id: data as string };
  });
}

export async function updatePayrollItem(input: unknown) {
  return runAction(
    z.object({
      id: uuid,
      payroll_id: uuid,
      bonus: z.coerce.number().min(0).max(100_000_000),
      other_earnings: z.coerce.number().min(0).max(100_000_000),
      other_deduction: z.coerce.number().min(0).max(100_000_000),
      adjustment_note: optionalText(300),
    }),
    input,
    async ({ id, payroll_id, ...v }) => {
      await assertRole("admin");
      const supabase = await createClient();
      check(await supabase.from("payroll_items").update(v).eq("id", id).eq("payroll_id", payroll_id));
      revalidatePath(`/admin/payroll/${payroll_id}`);
      return { ok: true as const, message: "Payroll line updated" };
    },
  );
}

export async function finalizePayroll(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.rpc("finalize_payroll", { p_id: id }));
    revalidatePath("/admin/payroll");
    revalidatePath(`/admin/payroll/${id}`);
    return { ok: true as const, message: "Payroll finalized. It can no longer be changed." };
  });
}

export async function deleteDraftPayroll(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.from("payroll_records").delete().eq("id", id).eq("status", "draft"));
    revalidatePath("/admin/payroll");
    return { ok: true as const, message: "Draft payroll deleted" };
  });
}
