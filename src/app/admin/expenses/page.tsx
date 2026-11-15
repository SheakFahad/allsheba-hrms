import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/shared/link-tabs";
import { ToneBadge } from "@/components/shared/status-badge";
import { RecordDialog, type FieldDef } from "@/components/shared/record-dialog";
import { ExportButton } from "@/components/shared/export-button";
import { ExpensesView } from "@/components/finance/expenses-view";
import { requirePageRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { saveExpenseCategory } from "@/lib/finance-actions";
import { param } from "@/lib/params";
import type { ExpenseCategory } from "@/lib/finance";

export const metadata: Metadata = { title: "Expenses" };

const CAT_FIELDS: FieldDef[] = [
  { name: "name", label: "Category name", type: "text", required: true },
  { name: "kind", label: "Used for", type: "select", options: [{ value: "daily", label: "Daily expenses" }, { value: "monthly", label: "Monthly expenses" }, { value: "both", label: "Both" }] },
  { name: "is_active", label: "Active", type: "switch" },
];

export default async function AdminExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  const user = await requirePageRole("admin");
  const sp = await searchParams;
  const tab = param(sp, "tab") === "monthly" ? "monthly" : param(sp, "tab") === "categories" ? "categories" : "daily";
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Expense Management"
        description="Daily and monthly expenses with printable vouchers. Only confirmed expenses count as paid cost."
        actions={
          <>
            <Button variant="outline" asChild><Link href="/admin/vouchers/expense/blank"><PenLine /> Blank voucher</Link></Button>
            <ExportButton type="cost_report" params={{ from: param(sp, "from"), to: param(sp, "to") }} label="Cost & expense report" />
          </>
        }
      />
      <LinkTabs
        tabs={[{ key: "daily", label: "Daily expenses" }, { key: "monthly", label: "Monthly expenses" }, { key: "categories", label: "Categories" }]}
        active={tab}
        baseHref="/admin/expenses"
      />
      {tab === "categories" ? (
        <Categories />
      ) : (
        <ExpensesView kind={tab} sp={sp} user={user} timezone={settings.timezone} voucherBase="/admin/vouchers/expense" />
      )}
    </>
  );
}

async function Categories() {
  const supabase = await createClient();
  const { data } = await supabase.from("expense_categories").select("*").order("kind").order("name");
  const cats = (data ?? []) as ExpenseCategory[];
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>Expense categories</CardTitle>
        <CardAction><RecordDialog title="New category" fields={CAT_FIELDS} initial={{ id: "", name: "", kind: "daily", is_active: true }} action={saveExpenseCategory} triggerLabel="Add category" /></CardAction>
      </CardHeader>
      <Table>
        <TableHeader><TableRow><TableHead className="pl-4">Category</TableHead><TableHead>Used for</TableHead><TableHead>Status</TableHead><TableHead className="pr-4" /></TableRow></TableHeader>
        <TableBody>
          {cats.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="pl-4 font-medium">{c.name}</TableCell>
              <TableCell className="capitalize">{c.kind}</TableCell>
              <TableCell>{c.is_active ? <ToneBadge tone="success">Active</ToneBadge> : <ToneBadge tone="neutral">Inactive</ToneBadge>}</TableCell>
              <TableCell className="pr-4 text-right"><RecordDialog edit title="Edit category" fields={CAT_FIELDS} initial={{ id: c.id, name: c.name, kind: c.kind, is_active: c.is_active }} action={saveExpenseCategory} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
