"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/shared/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { ActionResult } from "@/lib/types";

export type FieldDef =
  | { name: string; label: string; type: "text" | "number" | "time" | "date" | "password"; required?: boolean; hint?: string; min?: number; max?: number; step?: string }
  | { name: string; label: string; type: "textarea"; hint?: string }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean }
  | { name: string; label: string; type: "switch"; hint?: string };

type Values = Record<string, string | boolean>;

/** Generic create/edit dialog bound to a server action. */
export function RecordDialog({
  title,
  description,
  fields,
  initial,
  action,
  triggerLabel,
  edit,
}: {
  title: string;
  description?: string;
  fields: FieldDef[];
  initial: Values;
  action: (input: unknown) => Promise<ActionResult<unknown>>;
  triggerLabel?: string;
  edit?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<Values>(initial);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await action(v);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(initial); setErrors({}); } }}>
      <DialogTrigger asChild>
        {edit ? (
          <Button variant="ghost" size="sm"><Pencil /> Edit</Button>
        ) : (
          <Button variant="outline"><Plus /> {triggerLabel ?? "Add"}</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {fields.map((f) => {
            const id = `rd_${f.name}`;
            const err = errors[f.name]?.[0];
            if (f.type === "switch")
              return (
                <label key={f.name} className="flex items-center gap-2 text-sm">
                  <Switch checked={!!v[f.name]} onCheckedChange={(c) => setV({ ...v, [f.name]: c })} /> {f.label}
                  {f.hint && <span className="text-xs text-muted-foreground">— {f.hint}</span>}
                </label>
              );
            return (
              <Field key={f.name} label={f.label} htmlFor={id} required={"required" in f && f.required} error={err} hint={"hint" in f ? f.hint : undefined}>
                {f.type === "textarea" ? (
                  <Textarea id={id} rows={2} value={String(v[f.name] ?? "")} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
                ) : f.type === "select" ? (
                  <NativeSelect id={id} value={String(v[f.name] ?? "")} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </NativeSelect>
                ) : (
                  <Input
                    id={id}
                    type={f.type}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={String(v[f.name] ?? "")}
                    aria-invalid={!!err}
                    onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
                  />
                )}
              </Field>
            );
          })}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteButton({
  id,
  label,
  action,
}: {
  id: string;
  label: string;
  action: (input: unknown) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${label}`}><Trash2 className="text-danger" /></Button>}
      title={`Delete ${label}?`}
      description="This cannot be undone."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const r = await action({ id });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}
