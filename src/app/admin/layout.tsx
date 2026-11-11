import { AppShell } from "@/components/layout/app-shell";
import { requirePageRole } from "@/lib/auth";
import { getBranding } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageRole("admin");
  const branding = await getBranding();
  const supabase = await createClient();
  const [corrections, leaves] = await Promise.all([
    supabase.from("attendance_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <AppShell
      role="admin"
      user={{ fullName: user.fullName, username: user.username }}
      company={{ name: branding.name, logoUrl: branding.logoUrl }}
      badges={{ "/admin/attendance/corrections": corrections.count ?? 0, "/admin/leave": leaves.count ?? 0 }}
    >
      {children}
    </AppShell>
  );
}
