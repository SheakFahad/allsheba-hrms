"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Download, FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field, NativeSelect } from "@/components/shared/field";
import { createClient } from "@/lib/supabase/client";
import { salarySchema } from "@/lib/validation";
import { addDocument, addSalary, archiveEmployee, deleteDocument, getDocumentUrl, restoreEmployee } from "../actions";

export function ArchiveControls({ id, archived, name }: { id: string; archived: boolean; name: string }) {
  const router = useRouter();
  if (archived) {
    return (
      <ConfirmDialog
        trigger={<Button variant="outline"><ArchiveRestore /> Restore</Button>}
        title={`Restore ${name}?`}
        description="The employee will appear again in attendance entry and employee lists."
        confirmLabel="Restore"
        onConfirm={async () => {
          const r = await restoreEmployee({ id });
          if (r.ok) router.refresh();
          return r;
        }}
      />
    );
  }
  return (
    <ConfirmDialog
      trigger={<Button variant="outline"><Archive /> Archive</Button>}
      title={`Archive ${name}?`}
      description="Archived employees are hidden from attendance entry. All history (attendance, leave, payroll) is preserved and the employee can be restored later."
      confirmLabel="Archive"
      destructive
      noteLabel="Reason"
      noteRequired
      onConfirm={async (reason) => {
        const r = await archiveEmployee({ id, reason });
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

type SalaryValues = z.input<typeof salarySchema>;

export function SalaryDialog({ employeeId, today, current }: { employeeId: string; today: string; current?: { basic: number; allowances: number } }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const form = useForm<SalaryValues, unknown, z.output<typeof salarySchema>>({
    resolver: zodResolver(salarySchema),
    defaultValues: {
      employee_id: employeeId,
      effective_from: today,
      basic_salary: current?.basic ?? 0,
      allowances: current?.allowances ?? 0,
      notes: "",
    },
  });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit((v) =>
    startTransition(async () => {
      const r = await addSalary(v);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Salary updated");
      setOpen(false);
      router.refresh();
    }),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus /> Change salary</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change salary</DialogTitle>
          <DialogDescription>A new salary record is added to the history. Previous records are never overwritten.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label="Effective from" htmlFor="effective_from" required error={errors.effective_from?.message}>
            <Input id="effective_from" type="date" {...form.register("effective_from")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Basic salary (BDT)" htmlFor="basic_salary" required error={errors.basic_salary?.message}>
              <Input id="basic_salary" type="number" min={0} step="0.01" {...form.register("basic_salary")} />
            </Field>
            <Field label="Allowances (BDT)" htmlFor="allowances" error={errors.allowances?.message}>
              <Input id="allowances" type="number" min={0} step="0.01" {...form.register("allowances")} />
            </Field>
          </div>
          <Field label="Note" htmlFor="salary_notes" hint="e.g. Annual increment, promotion">
            <Textarea id="salary_notes" rows={2} {...form.register("notes")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save salary</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DOC_CATEGORIES = [
  { value: "contract", label: "Contract / Appointment letter" },
  { value: "id", label: "National ID / Passport" },
  { value: "certificate", label: "Certificate" },
  { value: "cv", label: "CV / Resume" },
  { value: "letter", label: "Letter" },
  { value: "other", label: "Other" },
] as const;

export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<string>("other");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Choose a file to upload.");
    if (file.size > 10 * 1024 * 1024) return toast.error("Files must be smaller than 10 MB.");
    if (!title.trim()) return toast.error("Enter a document title.");
    setBusy(true);
    try {
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
      const path = `${employeeId}/${crypto.randomUUID()}-${safe}`;
      const up = await createClient().storage.from("employee-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error(up.error.message);
      const r = await addDocument({
        employee_id: employeeId, title, category, file_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || "",
      });
      if (!r.ok) {
        await createClient().storage.from("employee-documents").remove([path]);
        throw new Error(r.error);
      }
      toast.success("Document uploaded");
      setOpen(false);
      setTitle("");
      setFile(null);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><FileUp /> Upload document</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>PDF, Word, Excel or image — up to 10 MB. Stored privately; only administrators can open it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Title" htmlFor="doc_title" required>
            <Input id="doc_title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Category" htmlFor="doc_category">
            <NativeSelect id="doc_category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="File" htmlFor="doc_file" required>
            <Input
              id="doc_file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Upload</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await getDocumentUrl({ id });
          setBusy(false);
          if (!r.ok) return void toast.error(r.error);
          window.open(r.data!.url, "_blank", "noopener,noreferrer");
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />} Download
      </Button>
      <ConfirmDialog
        trigger={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${title}`}><Trash2 className="text-danger" /></Button>}
        title="Delete document?"
        description={`"${title}" will be permanently deleted.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const r = await deleteDocument({ id });
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}

