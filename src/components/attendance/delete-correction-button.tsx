"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteCorrection } from "@/lib/attendance-actions";

/** Removes a correction record. The deletion is recorded in the audit log. */
export function DeleteCorrectionButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" className="text-danger"><Trash2 /> Delete</Button>}
      title="Delete this correction?"
      description="It is removed from the list. The deletion is kept in the Audit Log."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const r = await deleteCorrection({ id });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}
