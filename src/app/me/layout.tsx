import { AppShell } from "@/components/layout/app-shell";
import { requirePageRole } from "@/lib/auth";
import { getPublicBranding } from "@/lib/data";

export default async function EmployeeLayout({ children }: LayoutProps<"/me">) {
  const [user, branding] = await Promise.all([requirePageRole("employee"), getPublicBranding()]);
  return (
    <AppShell
      role="employee"
      user={{ fullName: user.fullName, username: user.username }}
      company={{ name: branding.name, logoUrl: branding.logoUrl }}
    >
      <div className="mx-auto max-w-xl">{children}</div>
    </AppShell>
  );
}
