import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEFAULT_LOGO } from "@/lib/constants";
import { publicStorageUrl } from "@/lib/format";

export async function getPublicBranding() {
  const fallback = { companyName: "All Sheba Limited", tagline: "One app all services", logoUrl: DEFAULT_LOGO };
  if (!isSupabaseConfigured()) return fallback;
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("public_branding");
    if (!data) return fallback;
    const b = data as { company_name: string; tagline: string | null; logo_path: string | null };
    return {
      companyName: b.company_name || fallback.companyName,
      tagline: b.tagline ?? "",
      logoUrl: publicStorageUrl(b.logo_path) ?? DEFAULT_LOGO,
    };
  } catch {
    return fallback;
  }
}
