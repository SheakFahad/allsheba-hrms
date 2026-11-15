import { AppShell } from "@/components/layout/app-shell";
import { requirePageRole } from "@/lib/auth";
import { getPublicBranding } from "@/lib/data";

export default async function EntryLayout({ children }: LayoutProps<"/entry">) {
  const [user, branding] = await Promise.all([requirePageRole("entry"), getPublicBranding()]);
  return (
    <AppShell
      role="entry"
      user={{ fullName: user.fullName, username: user.username }}
      company={{ name: branding.name, logoUrl: branding.logoUrl }}
      hiddenHrefs={user.canManageExpenses ? [] : ["/entry/expenses"]}
    >
      {children}
    </AppShell>
  );
}
