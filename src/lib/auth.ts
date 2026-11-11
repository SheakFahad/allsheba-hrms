import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { AppRole, Profile } from "@/lib/types";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: AppRole;
  mustChangePassword: boolean;
}

/** Current signed-in user with their profile (cached per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, is_active, must_change_password")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "id" | "username" | "full_name" | "role" | "is_active" | "must_change_password">>();
  if (!data || !data.is_active) return null;
  return {
    id: data.id,
    username: data.username,
    fullName: data.full_name || data.username,
    role: data.role,
    mustChangePassword: data.must_change_password,
  };
});

export function homeFor(role: AppRole) {
  return role === "admin" ? "/admin" : "/entry";
}

/** For pages/layouts: redirect when the user may not see this area. */
export async function requirePageRole(role: AppRole | "any"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (role !== "any" && user.role !== role) redirect(homeFor(user.role));
  return user;
}

export class AuthorizationError extends Error {}

/** For server actions / route handlers: throw instead of redirecting. */
export async function assertRole(...roles: AppRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthorizationError("Your session has expired. Please sign in again.");
  if (user.mustChangePassword) throw new AuthorizationError("Please change your password first.");
  if (roles.length && !roles.includes(user.role)) {
    throw new AuthorizationError("You do not have permission to perform this action.");
  }
  return user;
}
