import type { Metadata } from "next";
import { AlertTriangle, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { EMPLOYMENT_TYPE_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import type { EmploymentType } from "@/lib/types";

export const metadata: Metadata = { title: "My Profile" };

interface MyProfile {
  code: string;
  name: string;
  photo_path: string | null;
  phone: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
  shift: string | null;
  joining_date: string;
  employment_type: EmploymentType;
  status: string;
  off_days: number[];
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
}

/** Read-only: employees cannot edit their profile. */
export default async function MyProfilePage() {
  await requirePageRole("employee");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_profile");
  if (error || !data) {
    return (
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>{error?.message ?? "Your profile could not be loaded."}</p>
      </div>
    );
  }
  const p = data as MyProfile;
  const items: [string, string | null][] = [
    ["Employee ID", p.code],
    ["Department", p.department],
    ["Designation", p.designation],
    ["Shift", p.shift ?? "Flexible / default"],
    ["Weekly off", p.off_days?.length ? p.off_days.map((d) => WEEKDAY_LABELS[d]).join(", ") : null],
    ["Joining date", formatDate(p.joining_date)],
    ["Employment type", EMPLOYMENT_TYPE_LABELS[p.employment_type] ?? p.employment_type],
    ["Phone", p.phone],
    ["Email", p.email],
  ];
  const emergency: [string, string | null][] = [
    ["Name", p.emergency_contact_name],
    ["Relation", p.emergency_contact_relation],
    ["Phone", p.emergency_contact_phone],
  ];
  return (
    <>
      <PageHeader title="My Profile" description="Your employee information. Contact the administrator if anything is wrong." />
      <Card>
        <CardContent className="grid gap-5">
          <div className="flex items-center gap-3">
            <EmployeeAvatar name={p.name} photoUrl={publicStorageUrl(p.photo_path)} className="size-14 text-lg" />
            <div>
              <p className="text-lg font-semibold">{p.name}</p>
              <p className="text-sm text-muted-foreground">{[p.designation, p.department].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {items.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card className="mt-5">
        <CardHeader><CardTitle>Emergency contact</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {emergency.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" /> Read only. Only an administrator can change employee information.
      </p>
    </>
  );
}
