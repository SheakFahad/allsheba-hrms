import type { Metadata } from "next";
import { ExpenseVoucherPage } from "@/components/finance/voucher-pages";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Expense voucher" };

export default async function Page({ params }: PageProps<"/admin/vouchers/expense/[id]">) {
  await requirePageRole("admin");
  const { id } = await params;
  return <ExpenseVoucherPage id={id} backHref="/admin/expenses" />;
}
