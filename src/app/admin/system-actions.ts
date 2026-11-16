"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { ActionError, check, runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, usernameToEmail } from "@/lib/supabase/admin";
import { hhmm, isoDate, optionalText, passwordSchema, usernameSchema, uuid } from "@/lib/validation";

const idOpt = z.union([uuid, z.literal("")]).optional();

/** Service-role client for sign-in account administration, with a clear message when the server key is missing. */
function serviceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ActionError("Login accounts cannot be created or changed yet: the server key SUPABASE_SERVICE_ROLE_KEY is not set for this site (Vercel → Environment Variables). Nothing was changed.");
  }
  return createAdminClient();
}
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
  location: z
    .object({
      office_name: optionalText(120),
      office_address: optionalText(300),
      office_latitude: z.union([z.literal(""), z.coerce.number().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90")]).transform((x) => (x === "" ? null : x)),
      office_longitude: z.union([z.literal(""), z.coerce.number().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180")]).transform((x) => (x === "" ? null : x)),
      office_radius_m: z.coerce.number().int().min(10, "Radius must be at least 10 m").max(5000),
      gps_max_accuracy_m: z.coerce.number().int().min(5).max(1000),
      self_grace_minutes: z.coerce.number().int().min(0, "0–120 minutes").max(120, "0–120 minutes"),
      gps_required: bool,
      self_service_enabled: bool,
    })
    .refine((x) => (x.office_latitude === null) === (x.office_longitude === null), { message: "Enter both latitude and longitude", path: ["office_latitude"] }),
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
    z
      .object({ username: usernameSchema, full_name: z.string().trim().min(2).max(120), role: z.enum(["admin", "entry", "employee"]), password: passwordSchema, employee_id: z.union([uuid, z.literal(""), z.null()]).optional().transform((x) => (x ? x : null)) })
      .refine((x) => x.role !== "employee" || x.employee_id, { path: ["employee_id"], message: "Choose the employee this login belongs to" }),
    input,
    async (v) => {
      await assertRole("admin");
      const admin = serviceClient();
      const { data: existing } = await admin.from("profiles").select("id").eq("username", v.username).maybeSingle();
      if (existing) throw new ActionError("That username is already taken.");
      const { data, error } = await admin.auth.admin.createUser({ email: usernameToEmail(v.username), password: v.password, email_confirm: true });
      if (error || !data.user) throw new ActionError(error?.message ?? "Could not create the user.");
      const ins = await admin.from("profiles").insert({
        id: data.user.id, username: v.username, full_name: v.full_name, role: v.role, must_change_password: true,
        employee_id: v.role === "employee" ? v.employee_id : null,
      });
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
    z
      .object({ id: uuid, full_name: z.string().trim().min(2).max(120), role: z.enum(["admin", "entry", "employee"]), is_active: bool, employee_id: z.union([uuid, z.literal(""), z.null()]).optional().transform((x) => (x ? x : null)) })
      .refine((x) => x.role !== "employee" || x.employee_id, { path: ["employee_id"], message: "Choose the employee this login belongs to" }),
    input,
    async ({ id, ...v }) => {
      const me = await assertRole("admin");
      if (id === me.id && (v.role !== "admin" || !v.is_active)) throw new ActionError("You cannot remove your own admin access or deactivate yourself.");
      const supabase = await createClient();
      if (v.role !== "admin" || !v.is_active) {
        const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true).neq("id", id);
        if (!count) throw new ActionError("At least one active administrator is required.");
      }
      check(await supabase.from("profiles").update({ ...v, employee_id: v.role === "employee" ? v.employee_id : null }).eq("id", id));
      if (!v.is_active && process.env.SUPABASE_SERVICE_ROLE_KEY) await createAdminClient().auth.admin.signOut(id).catch(() => undefined);
      revalidatePath("/admin/users");
      return { ok: true as const, message: "User updated" };
    },
  );
}

export async function resetUserPassword(input: unknown) {
  return runAction(z.object({ id: uuid, password: passwordSchema }), input, async ({ id, password }) => {
    await assertRole("admin");
    const admin = serviceClient();
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) throw new ActionError(error.message);
    check(await admin.from("profiles").update({ must_change_password: true }).eq("id", id));
    const supabase = await createClient();
    await supabase.rpc("log_event", { p_action: "reset_password", p_entity: "profiles", p_entity_id: id, p_summary: "Administrator reset a user password" });
    revalidatePath("/admin/users");
    return { ok: true as const, message: "Password reset. The user must choose a new password at next sign-in." };
  });
}

/* ---------------- Employee login accounts ---------------- */

export interface CreatedAccount {
  employee_id: string;
  name: string;
  code: string;
  username: string;
  password: string;
}

/** Readable temporary password (no 0/O/1/l/I), always with letters and digits. */
function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(letters), pick(letters), pick(digits), pick(digits), ...Array.from({ length: 6 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Creates one Employee login per selected employee that has none yet.
 * Existing employee records are only read, never changed. Username = the
 * Employee ID in lower case; the temporary password is shown once and must be
 * changed at first sign-in.
 */
export async function createEmployeeAccounts(input: unknown) {
  return runAction(z.object({ employee_ids: z.array(uuid).min(1, "Select at least one employee").max(500) }), input, async ({ employee_ids }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const admin = serviceClient();
    const [{ data: emps }, { data: linked }, { data: taken }] = await Promise.all([
      supabase.from("employees").select("id, full_name, employee_code").in("id", employee_ids).is("archived_at", null),
      admin.from("profiles").select("employee_id").in("employee_id", employee_ids),
      admin.from("profiles").select("username"),
    ]);
    const alreadyLinked = new Set((linked ?? []).map((p) => p.employee_id as string));
    const usernames = new Set((taken ?? []).map((p) => p.username as string));
    const created: CreatedAccount[] = [];
    const failed: { name: string; error: string }[] = [];

    for (const e of (emps ?? []) as { id: string; full_name: string; employee_code: string }[]) {
      if (alreadyLinked.has(e.id)) continue;
      const base = e.employee_code.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 28) || "emp";
      let username = base.length >= 3 ? base : `emp-${base}`;
      for (let n = 2; usernames.has(username); n++) username = `${base}-${n}`;
      const password = temporaryPassword();
      const { data, error } = await admin.auth.admin.createUser({ email: usernameToEmail(username), password, email_confirm: true });
      if (error || !data.user) {
        failed.push({ name: e.full_name, error: error?.message ?? "Could not create the login." });
        continue;
      }
      const ins = await admin.from("profiles").insert({
        id: data.user.id, username, full_name: e.full_name, role: "employee", must_change_password: true, employee_id: e.id,
      });
      if (ins.error) {
        await admin.auth.admin.deleteUser(data.user.id);
        failed.push({ name: e.full_name, error: ins.error.message });
        continue;
      }
      usernames.add(username);
      created.push({ employee_id: e.id, name: e.full_name, code: e.employee_code, username, password });
      await supabase.rpc("log_event", {
        p_action: "create_user", p_entity: "profiles", p_entity_id: data.user.id,
        p_summary: `Created employee login ${username} for ${e.full_name} (${e.employee_code})`,
      });
    }
    revalidatePath("/admin/users");
    revalidatePath("/admin/employees");
    return { created, failed };
  });
}
