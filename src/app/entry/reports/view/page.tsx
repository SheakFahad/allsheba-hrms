import type { Metadata } from "next";
import { ReportPage } from "@/components/reports/report-page";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Report preview" };

/** Entry operators can only open reports whose catalog roles include "entry" (enforced in buildReport). */
export default async function EntryReportViewPage({ searchParams }: PageProps<"/entry/reports/view">) {
  const user = await requirePageRole("entry");
  return <ReportPage sp={await searchParams} user={user} backHref="/entry/today" />;
}
