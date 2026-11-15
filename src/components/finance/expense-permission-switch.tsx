"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setExpensePermission } from "@/lib/finance-actions";

/** Admin grants / removes expense entry for an entry operator. */
export function ExpensePermissionSwitch({ id, allowed }: { id: string; allowed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
      <Switch
        checked={allowed}
        disabled={pending}
        onCheckedChange={(c) =>
          startTransition(async () => {
            const r = await setExpensePermission({ id, allowed: c });
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message ?? "Saved");
            router.refresh();
          })
        }
        aria-label="Allow expense entry"
      />
      Expense entry & vouchers
    </label>
  );
}
