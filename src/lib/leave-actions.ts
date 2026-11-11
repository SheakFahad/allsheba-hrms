"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { check, runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { isoDate, optionalText, uuid } from "@/lib/validation";

function revalidateLeave() {
  for (const p of ["/admin/leave", "/entry/leave", "/admin", "/admin/attendance"]) revalidatePath(p);
}

const applySchema = z
  .object({
    employee_id: uuid,
    leave_type_id: uuid,
    start_date: isoDate,
    end_date: isoDate,
    is_half_day: z.boolean().default(false),
    reason: optionalText(1000),
    approve_now: z.boolean().optional(),
  })
  .refine((v) => v.end_date >= v.start_date, { path: ["end_date"], message: "End date must be on or after the start date" })
  .refine((v) => !v.is_half_day || v.start_date === v.end_date, { path: ["is_half_day"], message: "Half-day leave must be a single day" });

export async function applyLeave(input: unknown) {
  return runAction(applySchema, input, async ({ approve_now, ...v }) => {
    const user = await assertRole("admin", "entry");
    const supabase = await createClient();
    const { data } = check(await supabase.from("leave_requests").insert({ ...v, status: "pending" }).select("id").single());
    if (approve_now && user.role === "admin") {
      check(await supabase.rpc("review_leave", { p_id: data!.id, p_approve: true, p_note: "Approved on entry by admin" }));
    }
    revalidateLeave();
    return { ok: true as const, message: approve_now && user.role === "admin" ? "Leave recorded and approved" : "Leave application submitted for approval" };
  });
}

export async function reviewLeave(input: unknown) {
  return runAction(z.object({ id: uuid, approve: z.boolean(), note: z.string().trim().max(500).optional() }), input, async (v) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.rpc("review_leave", { p_id: v.id, p_approve: v.approve, p_note: v.note || null }));
    revalidateLeave();
    return { ok: true as const, message: v.approve ? "Leave approved" : "Leave rejected" };
  });
}

export async function cancelLeave(input: unknown) {
  return runAction(z.object({ id: uuid, note: z.string().trim().max(500).optional() }), input, async (v) => {
    await assertRole("admin", "entry");
    const supabase = await createClient();
    check(await supabase.rpc("cancel_leave", { p_id: v.id, p_note: v.note || null }));
    revalidateLeave();
    return { ok: true as const, message: "Leave cancelled" };
  });
}

const typeSchema = z.object({
  id: z.union([uuid, z.literal("")]).optional(),
  name: z.string().trim().min(1, "Enter a name").max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{1,6}$/, "1–6 letters"),
  days_per_year: z.coerce.number().min(0).max(366),
  is_paid: z.boolean(),
  allow_half_day: z.boolean(),
  carry_forward: z.boolean(),
  max_carry_days: z.coerce.number().min(0).max(366),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  is_active: z.boolean(),
});

export async function saveLeaveType(input: unknown) {
  return runAction(typeSchema, input, async ({ id, ...v }) => {
    await assertRole("admin");
    const supabase = await createClient();
    if (id) check(await supabase.from("leave_types").update(v).eq("id", id));
    else check(await supabase.from("leave_types").insert(v));
    revalidateLeave();
    return { ok: true as const, message: "Leave policy saved" };
  });
}

export async function setLeaveBalance(input: unknown) {
  return runAction(
    z.object({
      employee_id: uuid, leave_type_id: uuid, year: z.coerce.number().int().min(2000).max(2200),
      allocated: z.coerce.number().min(0).max(366), carried: z.coerce.number().min(0).max(366), notes: optionalText(300),
    }),
    input,
    async (v) => {
      await assertRole("admin");
      const supabase = await createClient();
      check(await supabase.from("leave_balances").upsert(v, { onConflict: "employee_id,leave_type_id,year" }));
      revalidateLeave();
      return { ok: true as const, message: "Leave balance updated" };
    },
  );
}
