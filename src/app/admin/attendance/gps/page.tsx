import type { Metadata } from "next";
import Link from "next/link";
import { MapPinned } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar, Pagination } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/empty-state";
import { ToneBadge } from "@/components/shared/status-badge";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveEmployees, getSettings } from "@/lib/data";
import { isISODate, pageParams, param } from "@/lib/params";
import { formatDateTime } from "@/lib/time";
import type { Tone } from "@/lib/constants";

export const metadata: Metadata = { title: "GPS Check-ins" };

const RESULTS: Record<string, { label: string; tone: Tone }> = {
  accepted: { label: "Accepted", tone: "success" },
  outside_radius: { label: "Outside radius", tone: "danger" },
  low_accuracy: { label: "Low accuracy", tone: "warning" },
  not_configured: { label: "Office not set", tone: "neutral" },
  duplicate: { label: "Duplicate", tone: "neutral" },
  not_checked_in: { label: "Not checked in", tone: "neutral" },
};

interface GeoEvent {
  id: string;
  kind: "check_in" | "check_out";
  latitude: number;
  longitude: number;
  accuracy_m: number;
  distance_m: number | null;
  radius_m: number | null;
  max_accuracy_m: number | null;
  verified: boolean;
  result: string;
  message: string | null;
  captured_at: string;
  employees: { full_name: string; employee_code: string } | null;
}

export default async function GpsLogPage({ searchParams }: PageProps<"/admin/attendance/gps">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const { page, pageSize, from, to } = pageParams(sp, 50);
  const employee = param(sp, "employee");
  const result = param(sp, "result");
  const date = param(sp, "date");
  const supabase = await createClient();
  let q = supabase
    .from("attendance_geo_events")
    .select("id, kind, latitude, longitude, accuracy_m, distance_m, radius_m, max_accuracy_m, verified, result, message, captured_at, employees(full_name, employee_code)", { count: "exact" });
  if (employee) q = q.eq("employee_id", employee);
  if (result && result in RESULTS) q = q.eq("result", result);
  if (isISODate(date)) q = q.eq("attendance_date", date);
  const [{ data, count }, employees, settings] = await Promise.all([
    q.order("captured_at", { ascending: false }).range(from, to),
    getActiveEmployees(),
    getSettings(),
  ]);
  const rows = (data ?? []) as unknown as GeoEvent[];

  return (
    <>
      <PageHeader
        title="GPS Check-ins"
        description={
          settings.office_latitude !== null
            ? `Every employee self check-in / check-out attempt with its location evidence. Office radius ${settings.office_radius_m} m, accuracy ≤ ${settings.gps_max_accuracy_m} m.`
            : "Office location is not set yet — employees cannot check in with GPS until it is."
        }
        actions={<Link href="/admin/settings?tab=location" className="text-sm font-medium text-brand hover:underline">Office & GPS settings</Link>}
      />
      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <FilterBar
            filters={[
              { type: "select", name: "employee", label: "Employee", options: employees.map((e) => ({ value: e.id, label: e.full_name })) },
              { type: "select", name: "result", label: "Result", options: Object.entries(RESULTS).map(([value, r]) => ({ value, label: r.label })) },
              { type: "date", name: "date", label: "Date" },
            ]}
          />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={MapPinned} title="No GPS check-ins yet" description="Employees with an Employee login check in from /me on their own phone or PC." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Time</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="text-right">Accuracy</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="pr-4">Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="tabular pl-4 whitespace-nowrap">{formatDateTime(r.captured_at)}</TableCell>
                    <TableCell>
                      <span className="block font-medium">{r.employees?.full_name}</span>
                      <span className="tabular text-xs text-muted-foreground">{r.employees?.employee_code}</span>
                    </TableCell>
                    <TableCell>{r.kind === "check_in" ? "Check in" : "Check out"}</TableCell>
                    <TableCell className="tabular text-right">
                      {r.distance_m === null ? "—" : `${Math.round(Number(r.distance_m))} m`}
                      {r.radius_m && <span className="block text-xs text-muted-foreground">limit {r.radius_m} m</span>}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      ±{Math.round(Number(r.accuracy_m))} m
                      {r.max_accuracy_m && <span className="block text-xs text-muted-foreground">limit {r.max_accuracy_m} m</span>}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      <ToneBadge tone={RESULTS[r.result]?.tone ?? "neutral"}>{RESULTS[r.result]?.label ?? r.result}</ToneBadge>
                      {r.message && r.result !== "accepted" && <span className="mt-0.5 block text-xs text-muted-foreground">{r.message}</span>}
                    </TableCell>
                    <TableCell className="pr-4">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=18/${r.latitude}/${r.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tabular text-xs text-brand hover:underline"
                      >
                        {Number(r.latitude).toFixed(5)}, {Number(r.longitude).toFixed(5)}
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={count ?? 0} />
      </Card>
    </>
  );
}
