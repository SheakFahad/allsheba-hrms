"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/supabase/admin";
import { getSessionUser, homeFor } from "@/lib/auth";
import { ActionError, runAction } from "@/lib/action";
import { changePasswordSchema, loginSchema } from "@/lib/validation";

export async function signIn(input: unknown) {
  return runAction(loginSchema, input, async ({ username, password }) => {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      // Same message for unknown user / wrong password (no account enumeration).
      throw new ActionError(
        /rate|too many/i.test(error.message)
          ? "Too many attempts. Please wait a few minutes and try again."
          : "Incorrect username or password.",
      );
    }
    const user = await getSessionUser();
    if (!user) {
      await supabase.auth.signOut();
      throw new ActionError("This account is not active. Please contact your administrator.");
    }
    await supabase.rpc("record_login");
    await supabase.rpc("log_event", { p_action: "login", p_entity: "auth", p_entity_id: user.id, p_summary: `${user.username} signed in` });
    return { redirectTo: user.mustChangePassword ? "/change-password" : homeFor(user.role) };
  });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changePassword(input: unknown) {
  return runAction(changePasswordSchema, input, async ({ currentPassword, newPassword }) => {
    const user = await getSessionUser();
    if (!user) throw new ActionError("Your session has expired. Please sign in again.");
    const supabase = await createClient();

    // Re-verify the current password before changing it.
    const verify = await supabase.auth.signInWithPassword({
      email: usernameToEmail(user.username),
      password: currentPassword,
    });
    if (verify.error) throw new ActionError("Your current password is incorrect.");

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new ActionError(error.message);
    await supabase.rpc("mark_password_changed");
    await supabase.rpc("log_event", { p_action: "password_change", p_entity: "auth", p_entity_id: user.id, p_summary: `${user.username} changed password` });
    return { redirectTo: homeFor(user.role) };
  });
}
