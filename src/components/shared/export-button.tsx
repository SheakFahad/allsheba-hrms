import Link from "next/link";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens the report preview (Print / PDF / Excel / CSV) for the given report
 * type with the page's current filters.
 */
export function ExportButton({
  type,
  params,
  base = "/admin/reports/view",
  label = "Export / Print",
}: {
  type: string;
  params?: Record<string, string | undefined>;
  base?: string;
  label?: string;
}) {
  const qs = new URLSearchParams({ type });
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  return (
    <Button variant="outline" asChild>
      <Link href={`${base}?${qs.toString()}`}>
        <FileDown /> {label}
      </Link>
    </Button>
  );
}
