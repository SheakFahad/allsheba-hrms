import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ExpensesView } from "@/components/finance/expenses-view";
import { requirePageRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";

export const metadata: Metadata = { title: "Daily Expenses" };

/** Only for entry operators the administrator has granted expense entry. */
export default async function EntryExpensesPage({ searchParams }: PageProps<"/entry/expenses">) {
  const user = await requirePageRole("entry");
  if (!user.canManageExpenses) redirect("/entry");
  const [sp, settings] = await Promise.all([searchParams, getSettings()]);
  return (
    <>
      <PageHeader title="Daily Expenses" description="Record expenses and print vouchers. An administrator confirms payment." />
      <ExpensesView kind="daily" sp={sp} user={user} timezone={settings.timezone} voucherBase="/entry/vouchers/expense" />
    </>
  );
}
