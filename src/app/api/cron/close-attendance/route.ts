import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, todayISO } from "@/lib/time";

/**
 * Daily attendance closing (Vercel Cron, see vercel.json).
 * Closes YESTERDAY in the company timezone when "Automatic attendance closing"
 * is enabled in Company Settings. Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sb = createAdminClient();
    const { data: s, error } = await sb.from("company_settings").select("auto_close_enabled, timezone").eq("id", 1).single();
    if (error || !s) throw new Error(error?.message ?? "Settings missing");
    if (!s.auto_close_enabled) return NextResponse.json({ skipped: true, reason: "Automatic closing is disabled" });

    const date = addDays(todayISO(s.timezone), -1);
    const { data, error: rpcErr } = await sb.rpc("close_attendance", { p_date: date });
    if (rpcErr) throw new Error(rpcErr.message);
    await sb.from("audit_logs").insert({
      actor_name: "system", action: "close", entity: "attendance", entity_id: date,
      summary: `Automatic closing for ${date} (${data ?? 0} records generated)`,
    });
    return NextResponse.json({ closed: date, generated: data ?? 0 });
  } catch (e) {
    console.error("[cron close-attendance]", e);
    return NextResponse.json({ error: "Closing failed" }, { status: 500 });
  }
}
