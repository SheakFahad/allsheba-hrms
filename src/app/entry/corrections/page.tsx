import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { CorrectionsTable, type CorrectionRow } from "@/components/attendance/corrections-table";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Correction Requests" };

export default async function EntryCorrectionsPage() {
  const user = await requirePageRole("entry");
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_corrections")
    .select("*, employees(full_name, employee_code)")
    .eq("kind", "request")
    .eq("requested_by", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  return (
    <>
      <PageHeader
        title="Correction Requests"
        description="Requests you have sent. To create one, open Entry History and choose “Request correction” on a record."
      />
      <Card className="gap-0 py-0">
        <CorrectionsTable rows={(data ?? []) as CorrectionRow[]} users={new Map([[user.id, user.username]])} />
      </Card>
    </>
  );
}
