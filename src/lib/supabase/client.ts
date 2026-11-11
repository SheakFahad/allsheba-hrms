"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser client (anon key + user session). Used for direct-to-storage uploads only. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
