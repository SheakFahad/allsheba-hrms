import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ReportViewer } from "@/components/reports/report-viewer";
import { buildReport, ReportError } from "@/lib/reports/builders";
import { parseReportParams } from "@/lib/reports/params";
import { REPORT_MAP } from "@/lib/reports/catalog";
import type { SessionUser } from "@/lib/auth";
import type { SearchParams } from "@/lib/params";

/** Server component: builds the report from real data and renders the preview. */
export async function ReportPage({ sp, user, backHref }: { sp: SearchParams; user: SessionUser; backHref: string }) {
  const params = parseReportParams(sp);
  const def = REPORT_MAP.get(params.type);
  let doc;
  let error: string | null = null;
  try {
    doc = await buildReport(params, user);
  } catch (e) {
    if (e instanceof ReportError) error = e.message;
    else {
      console.error("[report]", e);
      error = "The report could not be generated. Please try again.";
    }
  }
  return (
    <>
      <PageHeader
        title={def?.label ?? "Report"}
        description="Preview before printing or downloading."
        back={{ href: backHref, label: "Back" }}
      />
      {error || !doc ? (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : (
        <ReportViewer doc={doc} />
      )}
    </>
  );
}
