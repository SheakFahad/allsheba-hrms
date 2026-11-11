"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/types";

/**
 * Confirmation dialog that runs a server action, shows a toast and closes on
 * success. Optionally collects a note/reason (required when `noteRequired`).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  noteLabel,
  noteRequired,
  onConfirm,
  successMessage,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  noteLabel?: string;
  noteRequired?: boolean;
  onConfirm: (note: string) => Promise<ActionResult<unknown>>;
  successMessage?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const id = React.useId();

  function run() {
    if (noteRequired && note.trim().length < 3) {
      toast.error(`Please enter ${noteLabel?.toLowerCase() ?? "a reason"}.`);
      return;
    }
    startTransition(async () => {
      const res = await onConfirm(note.trim());
      if (res.ok) {
        toast.success(res.message ?? successMessage ?? "Done");
        setOpen(false);
        setNote("");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {noteLabel && (
          <div className="grid gap-1.5">
            <Label htmlFor={id}>
              {noteLabel}
              {noteRequired && <span className="text-danger">*</span>}
            </Label>
            <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} onClick={run} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
