"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { check, runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { LATE_REASONS } from "@/lib/constants";

export interface SelfAttendanceResult {
  ok: boolean;
  result: "accepted" | "outside_radius" | "low_accuracy" | "not_configured" | "duplicate" | "not_checked_in";
  message: string;
  gps_verified: boolean;
  distance_m: number | null;
  accuracy_m: number | null;
  radius_m: number;
  max_accuracy_m: number;
  time: string | null;
  status: string | null;
  late_minutes: number | null;
}

const schema = z.object({
  kind: z.enum(["check_in", "check_out"]),
  // Raw device readings only. The server computes distance and decides; no
  // client-side "verified" flag is accepted.
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  accuracy: z.number().min(0).max(100000).nullable(),
  late_reason: z.union([z.enum(LATE_REASONS), z.literal("")]).optional(),
  late_note: z.string().trim().max(500).optional(),
});

export async function selfAttendance(input: unknown) {
  return runAction(schema, input, async (v) => {
    await assertRole("employee");
    const supabase = await createClient();
    const { data } = check(
      await supabase.rpc("self_attendance", {
        p_kind: v.kind,
        p_lat: v.latitude,
        p_lng: v.longitude,
        p_accuracy: v.accuracy,
        p_late_reason: v.late_reason || null,
        p_late_note: v.late_note || null,
      }),
    );
    const result = data as SelfAttendanceResult;
    if (result.ok) {
      revalidatePath("/me");
      revalidatePath("/admin");
      revalidatePath("/admin/attendance");
    }
    return result;
  });
}
