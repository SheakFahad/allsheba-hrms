"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { ActionError, check, runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, usernameToEmail } from "@/lib/supabase/admin";
import { hhmm, isoDate, optionalText, passwordSchema, usernameSchema, uuid } from "@/lib/validation";

const idOpt = z.union([uuid, z.literal("")]).optional();
const bool = z.union([z.boolean(), z.literal("true"), z.literal("false"), z.literal("on")]).transform((v) => v === true || v === "true" || v === "on");

/* ---------------- Departments & designations ---------------- */

export async function saveDepartment(input: unknown) {
  return runAction(
    z.object({ id: idOpt, name: z.string().trim().min(1, "Enter a name").max(80), code: optionalText(16), description: optionalText(300), is_active: bool }),
    input,
    async ({ id, ...v }) => {
      await assertRole("admin");
      const supabase = await createClient();
      check(id ? await supabase.from("departments").update(v).eq("id", id) : await supabase.from("departments").insert(v));
      revalidatePath("/admin/departments");
      return { ok: true as const, message: "Department saved" };
    },
  );
}

export async function deleteDepartment(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { count } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("department_id", id);
    if (count) throw new ActionError(`${count} employee(s) belong to this department. Move them or mark the department inactive instead.`);
    check(await supabase.from("departments").delete().eq("id", id));
    revalidatePath("/admin/departments");
    return { ok: true as const, message: "Department deleted" };
  });
}

export async function saveDesignation(input: unknown) {
  return runAction(z.object({ id: idOpt, name: z.string().trim().min(1, "Enter a name").max(80), is_active: bool }), input, async ({ id, ...v }) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(id ? await supabase.from("designations").update(v).eq("id", id) : await supabase.from("designations").insert(v));
    revalidatePath("/admin/departments");
    return { ok: true as const, message: "Designation saved" };
  });
}

export async function deleteDesignation(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { count } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("designation_id", id);
    if (count) throw new ActionError(`${count} employee(s) have this designation. Change them or mark it inactive instead.`);
    check(await supabase.from("designations").delete().eq("id", id));
    revalidatePath("/admin/departments");
    return { ok: true as const, message: "Designation deleted" };
  });
}

/* ---------------- Holidays & shifts ---------------- */

export async function saveHoliday(input: unknown) {
  return runAction(
    z.object({ id: idOpt, holiday_date: isoDate, name: z.string().trim().min(1, "Enter a name").max(120), kind: z.enum(["public", "company", "optional"]), notes: optionalText(300) }),
    input,
    async ({ id, ...v }) => {
      await assertRole("admin");
      const supabase = await createClient();
      check(id ? await supabase.from("holidays").update(v).eq("id", id) : await supabase.from("holidays").insert(v));
      revalidatePath("/admin/holidays");
      return { ok: true as const, message: "Holiday saved" };
    },
  );
}

export async function deleteHoliday(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.from("holidays").delete().eq("id", id));
    revalidatePath("/admin/holidays");
    return { ok: true as const, message: "Holiday deleted" };
  });
}

export async function saveShift(input: unknown) {
  return runAction(
    z
      .object({
        id: idOpt, name: z.string().trim().min(1, "Enter a name").max(60), start_time: hhmm, end_time: hhmm,
        grace_minutes: z.coerce.number().int().min(0).max(240), is_default: bool, is_active: bool,
      })
      .refine((v) => v.end_time > v.start_time, { path: ["end_time"], message: "End time must be after start time" }),
    input,
    async ({ id, ...v }) => {
      await assertRole("admin");
      const supabase = await createClient();
      if (v.is_default) {
        v.is_active = true;
        check(await supabase.from("shifts").update({ is_default: false }).eq("is_default", true).neq("id", id || "00000000-0000-0000-0000-000000000000"));
      }
      check(id ? await supabase.from("shifts").update(v).eq("id", id) : await supabase.from("shifts").insert(v));
      revalidatePath("/admin/holidays");
      revalidatePath("/admin/settings");
      return { ok: true as const, message: "Shift saved" };
    },
  );
}

export async function deleteShift(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { data: s } = await supabase.from("shifts").select("is_default").eq("id", id).maybeSingle();
    if (s?.is_default) throw new ActionError("The default shift cannot be deleted. Make another shift the default first.");
    const { count } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("shift_id", id);
    if (count) throw new ActionError(`${count} employee(s) use this shift. Reassign them or mark it inactive.`);
    check(await supabase.from("shifts").delete().eq("id", id));
    revalidatePath("/admin/holidays");
    return { ok: true as const, message: "Shift deleted" };
  });
}

/* ---------------- Company settings ---------------- */

const settingsSchemas = {
  company: z.object({
    company_name: z.string().trim().min(2).max(120),
    tagline: optionalText(160),
    address: optionalText(300),
    phone: optionalText(60),
    email: optionalText(120),
    website: optionalText(120),
    logo_path: optionalText(300),
    employee_code_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/, "1–8 letters/numbers"),
    max_employees: z.coerce.number().int().min(1).max(100000),
  }),
  attendance: z.object({
    weekly_off_days: z.array(z.coerce.number().int().min(0).max(6)).max(6),
    late_reason_required: bool,
    late_note_required_for_other: bool,
    flexible_schedule_unassigned: bool,
    entry_backdate_days: z.coerce.number().int().min(0).max(31),
    entry_edit_days: z.coerce.number().int().min(0).max(31),
    auto_close_enabled: bool,
  }),
  payroll: z.object({
    payroll_day_basis: z.enum(["fixed_30", "calendar", "working"]),
    absent_deduction_enabled: bool,
    unpaid_leave_deduction_enabled: bool,
    half_day_deduction_enabled: bool,
    late_deduction_enabled: bool,
    late_days_per_deduction: z.coerce.number().int().min(1).max(31),
    late_deduction_day_fraction: z.coerce.number().min(0).max(1),
    overtime_enabled: bool,
    overtime_rate_multiplier: z.coerce.number().min(0).max(5),
    overtime_min_minutes: z.coerce.number().int().min(0).max(600),
  }),
  reports: z.object({
    report_footer: optionalText(300),
    payslip_note: optionalText(500),
  }),
};

export async function saveSettings(input: unknown) {
  const section = (input as { section?: string })?.section as keyof typeof settingsSchemas;
  const schema = settingsSchemas[section];
  if (!schema) return { ok: false as const, error: "Unknown settings section." };
  return runAction(schema, (input as { values: unknown }).values, async (v) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.from("company_settings").update(v).eq("id", 1));
    revalidatePath("/", "layout");
    return { ok: true as const, message: "Settings saved" };
  });
}

/* ---------------- Users (service role, admin-verified) ---------------- */

export async function createUser(input: unknown) {
  return runAction(
    z.object({ username: usernameSchema, full_name: z.string().trim().min(2).max(120), role: z.enum(["admin", "entry"]), password: passwordSchema }),
    input,
    async (v) => {
      await assertRole("admin");
      const admin = createAdminClient();
      const { data: existing } = await admin.from("profiles").select("id").eq("username", v.username).maybeSingle();
      if (existing) throw new ActionError("That username is already taken.");
      const { data, error } = await admin.auth.admin.createUser({ email: usernameToEmail(v.username), password: v.password, email_confirm: true });
      if (error || !data.user) throw new ActionError(error?.message ?? "Could not create the user.");
      const ins = await admin.from("profiles").insert({ id: data.user.id, username: v.username, full_name: v.full_name, role: v.role, must_change_password: true });
      if (ins.error) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw new ActionError(ins.error.message);
      }
      const supabase = await createClient();
      await supabase.rpc("log_event", { p_action: "create_user", p_entity: "profiles", p_entity_id: data.user.id, p_summary: `Created ${v.role} user ${v.username}` });
      revalidatePath("/admin/users");
      return { ok: true as const, message: `User ${v.username} created. They must change the password at first sign-in.` };
    },
  );
}

export async function updateUser(input: unknown) {
  return runAction(
    z.object({ id: uuid, full_name: z.string().trim().min(2).max(120), role: z.enum(["admin", "entry"]), is_active: bool }),
    input,
    async ({ id, ...v }) => {
      const me = await assertRole("admin");
      if (id === me.id && (v.role !== "admin" || !v.is_active)) throw new ActionError("You cannot remove your own admin access or deactivate yourself.");
      const supabase = await createClient();
      if (v.role !== "admin" || !v.is_active) {
        const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true).neq("id", id);
        if (!count) throw new ActionError("At least one active administrator is required.");
      }
      check(await supabase.from("profiles").update(v).eq("id", id));
      if (!v.is_active) await createAdminClient().auth.admin.signOut(id).catch(() => undefined);
      revalidatePath("/admin/users");
      return { ok: true as const, message: "User updated" };
    },
  );
}

export async function resetUserPassword(input: unknown) {
  return runAction(z.object({ id: uuid, password: passwordSchema }), input, async ({ id, password }) => {
    await assertRole("admin");
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) throw new ActionError(error.message);
    check(await admin.from("profiles").update({ must_change_password: true }).eq("id", id));
    const supabase = await createClient();
    await supabase.rpc("log_event", { p_action: "reset_password", p_entity: "profiles", p_entity_id: id, p_summary: "Administrator reset a user password" });
    revalidatePath("/admin/users");
    return { ok: true as const, message: "Password reset. The user must choose a new password at next sign-in." };
  });
}
