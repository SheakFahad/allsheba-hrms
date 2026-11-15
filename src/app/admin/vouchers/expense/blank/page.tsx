import type { Metadata } from "next";
import { BlankExpenseVoucherPage } from "@/components/finance/voucher-pages";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Blank expense voucher" };

export default async function Page() {
  await requirePageRole("admin");
  return <BlankExpenseVoucherPage backHref="/admin/print-center" backLabel="Print & PDF Center" />;
}
