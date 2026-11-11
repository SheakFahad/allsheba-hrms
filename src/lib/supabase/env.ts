/**
 * Public Supabase connection values.
 *
 * The project URL and the *publishable* key are public by design: they are
 * shipped to every browser, and the database grants them nothing beyond what
 * Row Level Security allows (anonymous visitors are denied every table).
 * They are therefore kept here as defaults so a deployment works even before
 * environment variables are configured. Environment variables, when set,
 * always take precedence.
 *
 * NEVER put the secret / service-role key or CRON_SECRET in source code.
 */
const DEFAULT_SUPABASE_URL = "https://mcenelqeuaffxqvszjph.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Uc64IjlC3VqACrTCqy1g6w_JADM_qhB";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export function getSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
