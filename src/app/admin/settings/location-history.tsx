import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";

type Values = Record<string, string | number | boolean | null>;
const LABELS: Record<string, string> = {
  office_name: "Office name", office_address: "Address", office_latitude: "Latitude", office_longitude: "Longitude",
  office_radius_m: "Radius (m)", gps_max_accuracy_m: "Accuracy (m)", gps_required: "GPS required", self_service_enabled: "Self check-in",
};
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : v === true ? "On" : v === false ? "Off" : String(v));

/** Who changed the office location / GPS rules, when, and from what to what. */
export async function LocationHistory() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("office_location_history")
    .select("id, changed_by_name, old_values, new_values, changed_at")
    .order("changed_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as { id: number; changed_by_name: string | null; old_values: Values; new_values: Values; changed_at: string }[];
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Location change history</CardTitle>
        <CardDescription>Every change to the office location or GPS rules, with previous and new values.</CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState title="No changes yet" />
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-[13px]">
            <TableHeader><TableRow><TableHead className="pl-4">When</TableHead><TableHead>By</TableHead><TableHead className="pr-4">Changes</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="tabular pl-4 whitespace-nowrap">{formatDateTime(r.changed_at)}</TableCell>
                  <TableCell>{r.changed_by_name ?? "system"}</TableCell>
                  <TableCell className="pr-4">
                    <ul className="grid gap-0.5 text-xs">
                      {Object.keys(LABELS).filter((k) => show(r.old_values?.[k]) !== show(r.new_values?.[k])).map((k) => (
                        <li key={k}>
                          <span className="text-muted-foreground">{LABELS[k]}:</span>{" "}
                          <span className="line-through opacity-60">{show(r.old_values?.[k])}</span> → <span className="font-medium">{show(r.new_values?.[k])}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
