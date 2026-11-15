import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BlankExpenseVoucherPage } from "@/components/finance/voucher-pages";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Blank expense voucher" };

export default async function Page() {
  const user = await requirePageRole("entry");
  if (!user.canManageExpenses) redirect("/entry");
  return <BlankExpenseVoucherPage backHref="/entry/expenses" backLabel="Expenses" />;
}
