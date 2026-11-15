import type { Metadata } from "next";
import { SalaryVoucherPage } from "@/components/finance/voucher-pages";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Salary voucher" };

export default async function Page({ params }: PageProps<"/admin/vouchers/salary/[id]">) {
  await requirePageRole("admin");
  const { id } = await params;
  return <SalaryVoucherPage id={id} backHref="/admin/salary-payments" />;
}
