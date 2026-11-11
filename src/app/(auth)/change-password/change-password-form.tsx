"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { changePasswordSchema } from "@/lib/validation";
import { changePassword, signOut } from "../actions";

export function ChangePasswordForm({ cancelHref }: { cancelHref?: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const form = useForm<z.input<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const res = await changePassword(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Password updated");
      router.replace(res.data?.redirectTo ?? "/");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message}>
        <Input id="currentPassword" type="password" autoComplete="current-password" className="h-10" {...form.register("currentPassword")} />
      </Field>
      <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message} hint="At least 8 characters, including a letter and a number.">
        <Input id="newPassword" type="password" autoComplete="new-password" className="h-10" {...form.register("newPassword")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" className="h-10" {...form.register("confirmPassword")} />
      </Field>
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        Update password
      </Button>
      {cancelHref ? (
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      ) : (
        <Button variant="ghost" type="button" onClick={() => signOut()}>
          Sign out
        </Button>
      )}
    </form>
  );
}
