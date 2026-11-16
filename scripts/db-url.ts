/**
 * Database URL for the scripts. Paste the Supabase "Session pooler" link
 * unchanged (with [YOUR-PASSWORD] still in it) as SUPABASE_DB_URL and put the
 * database password on its own line as SUPABASE_DB_PASSWORD — the password is
 * inserted here (URL-encoded, so @ # / etc. are safe). A link that already
 * contains the password still works.
 */
export function databaseUrl(): string | undefined {
  const raw = process.env.SUPABASE_DB_URL?.trim();
  if (!raw) return undefined;
  const pw = process.env.SUPABASE_DB_PASSWORD;
  if (raw.includes("[YOUR-PASSWORD]")) {
    if (!pw) throw new Error("SUPABASE_DB_URL still contains [YOUR-PASSWORD]: add the password on its own line as SUPABASE_DB_PASSWORD=...");
    return raw.replace("[YOUR-PASSWORD]", encodeURIComponent(pw));
  }
  return raw;
}

/** Same URL with the password hidden, safe to print. */
export function maskedUrl(url: string): string {
  const at = url.lastIndexOf("@");
  const scheme = url.indexOf("://");
  const colon = url.indexOf(":", scheme + 3);
  if (at < 0 || colon < 0 || colon > at) return "(database url)";
  return `${url.slice(0, colon)}:****${url.slice(at)}`;
}
