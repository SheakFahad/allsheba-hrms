import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AlertTriangle } from "lucide-react";
import { AuthShell } from "../auth-shell";
import { getPublicBranding } from "../branding";
import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSessionUser, homeFor } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection(); // env is read at request time, not baked in at build
  const configured = isSupabaseConfigured();
  if (configured) {
    const user = await getSessionUser();
    if (user) redirect(user.mustChangePassword ? "/change-password" : homeFor(user.role));
  }
  const branding = await getPublicBranding();
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : undefined;

  return (
    <AuthShell {...branding}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use the username and password provided by your administrator.</p>
      </div>
      {configured ? (
        <LoginForm next={next} />
      ) : (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            The database is not connected yet. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> as described in <code>docs/SETUP.md</code>.
          </p>
        </div>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Forgot your password? Ask an administrator to reset it from User Management.
      </p>
    </AuthShell>
  );
}
