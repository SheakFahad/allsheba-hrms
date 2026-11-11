import type { Metadata } from "next";
import { ReportPage } from "@/components/reports/report-page";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Report preview" };

export default async function AdminReportViewPage({ searchParams }: PageProps<"/admin/reports/view">) {
  const user = await requirePageRole("admin");
  return <ReportPage sp={await searchParams} user={user} backHref="/admin/reports" />;
}
