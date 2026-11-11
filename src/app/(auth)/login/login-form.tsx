"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { loginSchema } from "@/lib/validation";
import { signIn } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [show, setShow] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const form = useForm<z.input<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res = await signIn(values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const dest = res.data?.redirectTo ?? "/";
      const target = next && dest !== "/change-password" && next.startsWith(dest) ? next : dest;
      router.replace(target);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Username" htmlFor="username" error={form.formState.errors.username?.message}>
        <Input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          className="h-10"
          aria-invalid={!!form.formState.errors.username}
          {...form.register("username")}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            className="h-10 pr-10"
            aria-invalid={!!form.formState.errors.password}
            {...form.register("password")}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        Sign in
      </Button>
    </form>
  );
}
