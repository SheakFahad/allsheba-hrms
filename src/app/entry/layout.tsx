import { AppShell } from "@/components/layout/app-shell";
import { requirePageRole } from "@/lib/auth";
import { getBranding } from "@/lib/data";

export default async function EntryLayout({ children }: LayoutProps<"/entry">) {
  const user = await requirePageRole("entry");
  const branding = await getBranding();
  return (
    <AppShell
      role="entry"
      user={{ fullName: user.fullName, username: user.username }}
      company={{ name: branding.name, logoUrl: branding.logoUrl }}
    >
      {children}
    </AppShell>
  );
}
