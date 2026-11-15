import "server-only";
import { headers } from "next/headers";

/** Absolute sign-in URL of the current deployment (for printed login slips). */
export async function loginUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}/login` : "/login";
}
