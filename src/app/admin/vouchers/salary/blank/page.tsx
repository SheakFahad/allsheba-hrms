import type { Metadata } from "next";
import { BlankSalaryVoucherPage } from "@/components/finance/voucher-pages";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Blank salary voucher" };

export default async function Page() {
  await requirePageRole("admin");
  return <BlankSalaryVoucherPage backHref="/admin/print-center" backLabel="Print & PDF Center" />;
}
