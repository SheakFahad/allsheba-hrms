"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { ActionError, check, one, runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { attendanceSchema, isoDate, optionalHHMM, uuid } from "@/lib/validation";
import { ATTENDANCE_STATUSES, LATE_REASONS } from "@/lib/constants";
import type { Attendance } from "@/lib/types";

function revalidateAttendance() {
  for (const p of ["/admin", "/admin/attendance", "/admin/attendance/history", "/entry", "/entry/today", "/entry/history"]) {
    revalidatePath(p);
  }
}

/** Existing record for an employee/date (to prevent duplicates and to load it for editing). */
export async function lookupAttendance(input: unknown) {
  return runAction(z.object({ employee_id: uuid, attendance_date: isoDate }), input, async (q) => {
    await assertRole("admin", "entry");
    const supabase = await createClient();
    const { data } = check(
      await supabase.from("attendance").select("*").eq("employee_id", q.employee_id).eq("attendance_date", q.attendance_date).maybeSingle(),
    );
    return { record: (data ?? null) as Attendance | null };
  });
}

export async function saveAttendance(input: unknown) {
  return runAction(attendanceSchema, input, async (v) => {
    const user = await assertRole("admin", "entry");
    const supabase = await createClient();
    const payload = {
      employee_id: v.employee_id,
      attendance_date: v.attendance_date,
      scheduled_in: v.scheduled_in,
      scheduled_out: v.scheduled_out,
      actual_in: v.actual_in,
      actual_out: v.actual_out,
      status: v.status,
      late_reason: v.late_reason,
      late_reason_note: v.late_reason_note,
      notes: v.notes,
    };

    if (v.id) {
      if (user.role === "admin" && !v.change_reason) {
        throw new ActionError("Please enter a reason for this correction.");
      }
      const res = check(
        await supabase
          .from("attendance")
          .update({
            ...payload,
            ...(user.role === "admin" ? { source: "admin", is_locked: true } : {}),
            last_change_reason: v.change_reason ?? (user.role === "entry" ? "Updated from Entry Panel" : null),
          })
          .eq("id", v.id)
          .select("id"),
      );
      if (!res.data?.length) {
        throw new ActionError(
          user.role === "entry"
            ? "This record can no longer be edited from the Entry Panel. Submit a correction request instead."
            : "Attendance record not found.",
        );
      }
      revalidateAttendance();
      return { ok: true as const, message: "Attendance updated" };
    }

    check(await supabase.from("attendance").insert({ ...payload, source: user.role === "admin" ? "admin" : "entry" }));
    revalidateAttendance();
    return { ok: true as const, message: "Attendance saved" };
  });
}

export async function deleteAttendance(input: unknown) {
  return runAction(z.object({ id: uuid, reason: z.string().trim().min(3).max(300) }), input, async ({ id, reason }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const row = one<{ employee_id: string; attendance_date: string }>(await supabase.from("attendance").select("employee_id, attendance_date").eq("id", id).single());
    check(await supabase.from("attendance").delete().eq("id", id));
    await supabase.rpc("log_event", {
      p_action: "delete_reason", p_entity: "attendance", p_entity_id: id,
      p_summary: `Deleted attendance of ${row.attendance_date}: ${reason}`, p_details: row,
    });
    revalidateAttendance();
    return { ok: true as const, message: "Attendance record deleted" };
  });
}

const correctionSchema = z.object({
  attendance_id: uuid,
  reason: z.string().trim().min(3, "Explain why the correction is needed").max(500),
  status: z.union([z.enum(ATTENDANCE_STATUSES), z.literal("")]).optional(),
  actual_in: optionalHHMM,
  actual_out: optionalHHMM,
  late_reason: z.union([z.enum(LATE_REASONS), z.literal("")]).optional(),
  late_reason_note: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function requestCorrection(input: unknown) {
  return runAction(correctionSchema, input, async (v) => {
    await assertRole("admin", "entry");
    const proposed: Record<string, string | null> = {};
    if (v.status) proposed.status = v.status;
    if (v.actual_in !== null) proposed.actual_in = v.actual_in;
    if (v.actual_out !== null) proposed.actual_out = v.actual_out;
    if (v.late_reason) proposed.late_reason = v.late_reason;
    if (v.late_reason_note) proposed.late_reason_note = v.late_reason_note;
    if (v.notes) proposed.notes = v.notes;
    if (Object.keys(proposed).length === 0) throw new ActionError("Change at least one field.");

    const supabase = await createClient();
    const att = one<{ employee_id: string; attendance_date: string }>(
      await supabase.from("attendance").select("employee_id, attendance_date").eq("id", v.attendance_id).single(),
    );
    check(
      await supabase.from("attendance_corrections").insert({
        attendance_id: v.attendance_id, employee_id: att.employee_id, attendance_date: att.attendance_date,
        kind: "request", status: "pending", reason: v.reason, proposed_data: proposed,
      }),
    );
    revalidatePath("/entry/corrections");
    revalidatePath("/admin/attendance/corrections");
    return { ok: true as const, message: "Correction request sent to the administrator" };
  });
}

export async function reviewCorrection(input: unknown) {
  return runAction(z.object({ id: uuid, approve: z.boolean(), note: z.string().trim().max(500).optional() }), input, async (v) => {
    await assertRole("admin");
    const supabase = await createClient();
    check(await supabase.rpc("review_correction", { p_id: v.id, p_approve: v.approve, p_note: v.note || null }));
    revalidatePath("/admin/attendance/corrections");
    revalidateAttendance();
    return { ok: true as const, message: v.approve ? "Correction approved and applied" : "Correction rejected" };
  });
}

export async function closeAttendance(input: unknown) {
  return runAction(z.object({ from: isoDate, to: isoDate }), input, async ({ from, to }) => {
    await assertRole("admin");
    const supabase = await createClient();
    const { data } = check(await supabase.rpc("close_attendance_range", { p_from: from, p_to: to }));
    revalidateAttendance();
    const n = Number(data ?? 0);
    return { ok: true as const, message: n === 0 ? "Nothing to close — every employee already has a record." : `Attendance closed: ${n} record(s) generated` };
  });
}
