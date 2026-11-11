"use server";

import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { runAction } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";
import { REPORT_MAP } from "./catalog";

/** Audit-log every print / download of a report (sensitive ones are flagged). */
export async function logReportExport(input: unknown) {
  return runAction(
    z.object({
      type: z.string().max(40),
      format: z.enum(["print", "pdf", "xlsx", "csv"]),
      title: z.string().max(200),
      query: z.string().max(2000),
    }),
    input,
    async (v) => {
      const user = await assertRole("admin", "entry");
      const def = REPORT_MAP.get(v.type);
      if (!def || !def.roles.includes(user.role)) return { ok: false as const, error: "Not permitted." };
      const supabase = await createClient();
      await supabase.rpc("log_event", {
        p_action: `export_${v.format}`,
        p_entity: "report",
        p_entity_id: v.type,
        p_summary: `${def.sensitive ? "[Sensitive] " : ""}${v.title} exported as ${v.format.toUpperCase()}`,
        p_details: { query: v.query, sensitive: def.sensitive },
      });
      return { ok: true as const };
    },
  );
}
