import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { getPublicBranding } from "../branding";
import { ChangePasswordForm } from "./change-password-form";
import { getSessionUser, homeFor } from "@/lib/auth";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const branding = await getPublicBranding();
  return (
    <AuthShell {...branding}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.mustChangePassword ? "Set a new password" : "Change password"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.mustChangePassword
            ? `Welcome, ${user.fullName}. For security, choose a new password before continuing.`
            : "Use at least 8 characters with letters and numbers."}
        </p>
      </div>
      <ChangePasswordForm cancelHref={user.mustChangePassword ? undefined : homeFor(user.role)} />
    </AuthShell>
  );
}
