"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, KeyRound, Loader2, Printer, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { easyPassword } from "@/lib/easy-password";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createEmployeeAccounts, type CreatedAccount } from "@/app/admin/system-actions";

export interface AccountCandidate {
  id: string;
  name: string;
  code: string;
  department: string | null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Shows the new usernames + temporary passwords once, with Print and CSV. */
function CredentialsDialog({ accounts, loginUrl, onClose }: { accounts: CreatedAccount[]; loginUrl: string; onClose: () => void }) {
  function csv() {
    const rows = [["Employee", "Employee ID", "Username", "Temporary password"], ...accounts.map((a) => [a.name, a.code, a.username, a.password])];
    const text = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-logins.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function print() {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return void toast.error("Allow pop-ups to print.");
    const slips = accounts
      .map(
        (a) => `<div class="slip"><h3>${escapeHtml(a.name)} <small>${escapeHtml(a.code)}</small></h3>
<p>Website: <b>${escapeHtml(loginUrl)}</b></p><p>Username: <b>${escapeHtml(a.username)}</b></p>
<p>Temporary password: <b class="pw">${escapeHtml(a.password)}</b></p>
<p class="note">You must choose a new password at first sign-in. Keep it private.</p></div>`,
      )
      .join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Employee logins</title><style>
body{font-family:system-ui,Arial,sans-serif;margin:12mm;color:#111}.slip{border:1px dashed #888;padding:10px 14px;margin-bottom:8px;break-inside:avoid}
h3{margin:0 0 6px;font-size:15px}small{color:#666;font-weight:normal}p{margin:3px 0;font-size:13px}.pw{font-family:monospace;font-size:15px;letter-spacing:1px}.note{color:#666;font-size:11px}
</style></head><body>${slips}<script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{accounts.length} employee login{accounts.length === 1 ? "" : "s"} created</DialogTitle>
          <DialogDescription>
            Temporary passwords are shown <b>only now</b>. Print the login slips or download the list before closing. Each employee must choose a new password at first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Username</th><th className="px-3 py-2">Temporary password</th></tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((a) => (
                <tr key={a.employee_id}>
                  <td className="px-3 py-2">{a.name} <span className="text-xs text-muted-foreground">{a.code}</span></td>
                  <td className="px-3 py-2 font-mono">{a.username}</td>
                  <td className="px-3 py-2 font-mono tracking-wide">{a.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={print}><Printer /> Print login slips</Button>
            <Button variant="outline" onClick={csv}><Download /> Download CSV</Button>
          </div>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useCreateAccounts() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [created, setCreated] = React.useState<CreatedAccount[] | null>(null);
  function run(ids: string[], opts: { mode?: "easy" | "random"; password?: string } = {}, onOk?: () => void) {
    startTransition(async () => {
      const r = await createEmployeeAccounts({ employee_ids: ids, ...opts });
      if (!r.ok) return void toast.error(r.error);
      const { created: made, failed } = r.data!;
      for (const f of failed) toast.error(`${f.name}: ${f.error}`);
      if (!made.length && !failed.length) toast.info("Every selected employee already has a login.");
      if (made.length) { setCreated(made); onOk?.(); }
      router.refresh();
    });
  }
  return { pending, created, setCreated, run };
}

/** User Management: create logins for existing employees that have none. */
export function EmployeeAccountsPanel({ candidates, loginUrl }: { candidates: AccountCandidate[]; loginUrl: string }) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(candidates.map((c) => c.id)));
  const { pending, created, setCreated, run } = useCreateAccounts();
  const [easy, setEasy] = React.useState(true);
  const all = selected.size === candidates.length && candidates.length > 0;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="grid gap-3">
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every active employee already has a login account.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={all} onCheckedChange={(v) => setSelected(v === true ? new Set(candidates.map((c) => c.id)) : new Set())} />
            Select all ({candidates.length} without a login)
          </label>
          <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
            {candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.code}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={easy} onCheckedChange={(c) => setEasy(c === true)} />
                Easy passwords: Employee ID + last 4 digits of phone (e.g. asl00056663)
              </label>
              <p className="text-xs text-muted-foreground">Username = Employee ID (e.g. asl-0005). Every employee must choose their own new password at first sign-in. Employee records are not changed.</p>
            </div>
            <Button onClick={() => run([...selected], { mode: easy ? "easy" : "random" })} disabled={pending || selected.size === 0}>
              {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Create {selected.size} login{selected.size === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      )}
      {created && <CredentialsDialog accounts={created} loginUrl={loginUrl} onClose={() => setCreated(null)} />}
    </div>
  );
}

/** Employee profile page: create this employee's login with an easy password the admin can change. */
export function CreateEmployeeLoginButton({ employeeId, code, phone, loginUrl }: { employeeId: string; code: string; phone: string | null; loginUrl: string }) {
  const { pending, created, setCreated, run } = useCreateAccounts();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState(() => easyPassword(code, phone, "1234"));
  const valid = password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
  return (
    <>
      <Button variant="outline" onClick={() => { setPassword(easyPassword(code, phone)); setOpen(true); }} disabled={pending}>
        <KeyRound /> Create login account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create login account</DialogTitle>
            <DialogDescription>Give these to the employee. They must choose their own new password at first sign-in.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Username</Label>
              <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">{code.toLowerCase()}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="emp_pw">Temporary password</Label>
              <Input id="emp_pw" className="font-mono" value={password} onChange={(e) => setPassword(e.target.value.trim())} autoComplete="off" />
              <p className={valid ? "text-xs text-muted-foreground" : "text-xs text-danger"}>
                {valid ? "Suggested: Employee ID + last 4 digits of phone. You can type any password." : "At least 8 characters with a letter and a number."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => run([employeeId], { password }, () => setOpen(false))} disabled={pending || !valid}>
              {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Create login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {created && <CredentialsDialog accounts={created} loginUrl={loginUrl} onClose={() => setCreated(null)} />}
    </>
  );
}
