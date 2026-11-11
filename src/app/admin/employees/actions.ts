"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { ActionError, check, runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { employeeSchema, optionalText, salarySchema, uuid } from "@/lib/validation";

const createSchema = employeeSchema.extend({
  // "" (not provided) must be matched before coercion, otherwise it becomes 0.
  basic_salary: z.union([z.literal(""), z.coerce.number().min(0, "Must be 0 or more").max(100_000_000)]).optional(),
  allowances: z.union([z.literal(""), z.coerce.number().min(0, "Must be 0 or more").max(100_000_000)]).optional(),
});

export async function createEmployee(input: unknown) {
  return runAction(createSchema, input, async (data) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { data: id } = check(await supabase.rpc("save_employee", { p_id: null, p: data }));
    revalidatePath("/admin/employees");
    return { id: id as string };
  });
}

export async function updateEmployee(input: unknown) {
  return runAction(employeeSchema.extend({ id: uuid }), input, async ({ id, ...data }) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.rpc("save_employee", { p_id: id, p: data }));
    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${id}`);
    return { id };
  });
}

export async function archiveEmployee(input: unknown) {
  return runAction(z.object({ id: uuid, reason: z.string().trim().min(3, "Enter a reason").max(300) }), input, async ({ id, reason }) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.from("employees").update({ archived_at: new Date().toISOString(), archived_reason: reason }).eq("id", id));
    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${id}`);
    return { ok: true as const, message: "Employee archived" };
  });
}

export async function restoreEmployee(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.from("employees").update({ archived_at: null, archived_reason: null }).eq("id", id));
    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${id}`);
    return { ok: true as const, message: "Employee restored" };
  });
}

export async function addSalary(input: unknown) {
  return runAction(salarySchema, input, async (data) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.from("salary_structures").insert(data));
    revalidatePath(`/admin/employees/${data.employee_id}`);
    return { ok: true as const, message: "Salary updated" };
  });
}

const docSchema = z.object({
  employee_id: uuid,
  title: z.string().trim().min(1, "Enter a title").max(120),
  category: z.enum(["contract", "id", "certificate", "cv", "letter", "other"]),
  file_path: z.string().min(5).max(400),
  file_name: z.string().min(1).max(255),
  file_size: z.number().int().positive().max(10 * 1024 * 1024),
  mime_type: optionalText(120),
});

export async function addDocument(input: unknown) {
  return runAction(docSchema, input, async (data) => {
    await assertRole("admin");
    if (!data.file_path.startsWith(`${data.employee_id}/`)) throw new ActionError("Invalid file location.");
    const supabase = await createClient();
    check(await supabase.from("employee_documents").insert(data));
    revalidatePath(`/admin/employees/${data.employee_id}`);
    return { ok: true as const, message: "Document uploaded" };
  });
}

export async function getDocumentUrl(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { data: doc } = check(await supabase.from("employee_documents").select("*").eq("id", id).single());
    const { data, error } = await supabase.storage.from("employee-documents").createSignedUrl(doc.file_path, 120, { download: doc.file_name });
    if (error || !data) throw new ActionError("Could not open the document.");
    await supabase.rpc("log_event", {
      p_action: "download", p_entity: "employee_documents", p_entity_id: id,
      p_summary: `Downloaded document "${doc.title}"`,
    });
    return { url: data.signedUrl };
  });
}

export async function deleteDocument(input: unknown) {
  return runAction(z.object({ id: uuid }), input, async ({ id }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { data: doc } = check(await supabase.from("employee_documents").select("*").eq("id", id).single());
    await supabase.storage.from("employee-documents").remove([doc.file_path]);
    check(await supabase.from("employee_documents").delete().eq("id", id));
    revalidatePath(`/admin/employees/${doc.employee_id}`);
    return { ok: true as const, message: "Document deleted" };
  });
}
