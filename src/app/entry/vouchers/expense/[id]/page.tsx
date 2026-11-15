import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExpenseVoucherPage } from "@/components/finance/voucher-pages";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Expense voucher" };

export default async function Page({ params }: PageProps<"/entry/vouchers/expense/[id]">) {
  const user = await requirePageRole("entry");
  if (!user.canManageExpenses) redirect("/entry");
  const { id } = await params;
  return <ExpenseVoucherPage id={id} backHref="/entry/expenses" />;
}
