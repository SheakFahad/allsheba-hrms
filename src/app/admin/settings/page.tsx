import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/shared/link-tabs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { param } from "@/lib/params";
import { formatDateTime } from "@/lib/time";
import { AttendanceForm, CompanyForm, PayrollForm, ReportsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Company Settings" };

const TABS = [
  { key: "company", label: "Company" },
  { key: "attendance", label: "Attendance" },
  { key: "payroll", label: "Payroll" },
  { key: "reports", label: "Reports" },
  { key: "more", label: "More settings" },
];

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === param(sp, "tab"))?.key ?? "company";
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Company Settings" description={`Last updated ${formatDateTime(s.updated_at)} · Timezone ${s.timezone}`} />
      <LinkTabs tabs={TABS} active={tab} baseHref="/admin/settings" />
      {tab === "company" && <CompanyForm s={s} />}
      {tab === "attendance" && <AttendanceForm s={s} />}
      {tab === "payroll" && <PayrollForm s={s} />}
      {tab === "reports" && <ReportsForm s={s} />}
      {tab === "more" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["/admin/holidays", "Office hours, shifts & grace period", "Default shift 10:00 AM – 7:00 PM, public holidays."],
            ["/admin/leave?tab=policies", "Leave policies", "Leave types, yearly days, paid/unpaid, carry forward."],
            ["/admin/departments", "Departments & designations", "Organisation structure."],
            ["/admin/users", "Users & permissions", "Accounts and role permissions."],
          ].map(([href, title, desc]) => (
            <Link key={href} href={href}>
              <Card className="h-full transition-colors hover:border-brand/40">
                <CardHeader><CardTitle className="text-sm">{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
