import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filters";
import { ReportViewer } from "@/components/reports/report-viewer";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees } from "@/lib/data";
import { buildReport, ReportError } from "@/lib/reports/builders";
import { parseReportParams } from "@/lib/reports/params";
import { EXPENSE_METHOD_LABELS } from "@/lib/finance";

export const metadata: Metadata = { title: "Total Cost & Expense Report" };

export default async function FinanceReportPage({ searchParams }: PageProps<"/admin/finance">) {
  const user = await requirePageRole("admin");
  const sp = await searchParams;
  const supabase = await createClient();
  const [employees, { data: cats }] = await Promise.all([
    getActiveEmployees(),
    supabase.from("expense_categories").select("id, name").order("name"),
  ]);

  let doc;
  let error: string | null = null;
  try {
    doc = await buildReport({ ...parseReportParams(sp), type: "cost_report" }, user);
  } catch (e) {
    error = e instanceof ReportError ? e.message : "The report could not be generated. Please try again.";
    if (!(e instanceof ReportError)) console.error("[finance report]", e);
  }

  return (
    <>
      <PageHeader
        title="Total Cost & Expense Report"
        description="Total business cost = confirmed expenses + confirmed salary payments. Pending items are shown separately and are not counted as paid."
      />
      <Card className="no-print mb-5 p-4">
        <FilterBar
          filters={[
            { type: "date", name: "from", label: "Start date" },
            { type: "date", name: "to", label: "End date" },
            { type: "select", name: "employee", label: "Employee", options: employees.map((e) => ({ value: e.id, label: e.full_name })) },
            { type: "select", name: "category", label: "Expense category", options: ((cats ?? []) as { id: string; name: string }[]).map((c) => ({ value: c.id, label: c.name })) },
            { type: "select", name: "pstatus", label: "Payment status", options: [
              { value: "confirmed", label: "Confirmed (paid)" }, { value: "pending", label: "Awaiting confirmation" },
              { value: "partially_paid", label: "Salary partially paid" }, { value: "paid", label: "Salary fully paid" },
            ] },
            { type: "select", name: "method", label: "Payment method", options: Object.entries(EXPENSE_METHOD_LABELS).map(([value, label]) => ({ value, label })) },
          ]}
        />
        <p className="mt-2 text-xs text-muted-foreground">Default period: this month. Use Print, PDF, Excel or CSV below to export exactly what you see.</p>
      </Card>
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
