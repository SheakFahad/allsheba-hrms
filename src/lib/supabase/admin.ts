import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * Service-role client. Bypasses RLS — use ONLY on the server, ONLY after the
 * caller's admin role has been verified, and only for operations that need it
 * (Auth user administration, cron jobs).
 */
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function usernameToEmail(username: string) {
  const domain = process.env.AUTH_EMAIL_DOMAIN || "hrms.allsheba.local";
  return `${username.trim().toLowerCase()}@${domain}`;
}
