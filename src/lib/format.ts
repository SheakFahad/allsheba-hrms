export function formatMoney(n: number | string | null | undefined, currency = "BDT"): string {
  const v = Number(n ?? 0);
  const formatted = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  return currency === "BDT" ? `৳ ${formatted}` : `${currency} ${formatted}`;
}

/** Plain number formatting for exports (no currency symbol — avoids font issues in PDFs). */
export function formatAmount(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function publicStorageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/public-assets/${path}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Map a raw database/PostgREST error into a message safe to show users. */
export function friendlyDbError(message: string | undefined | null): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/attendance_one_per_day|duplicate key.*attendance/i.test(message))
    return "Attendance for this employee on this date already exists. Edit the existing record instead.";
  if (/row-level security|permission denied/i.test(message))
    return "You do not have permission to perform this action.";
  if (/duplicate key/i.test(message)) return "A record with the same value already exists.";
  if (/violates foreign key/i.test(message)) return "This record is linked to other data and cannot be changed this way.";
  if (/violates check constraint/i.test(message)) return "Some values are invalid. Please review the form.";
  if (/JWT|session/i.test(message)) return "Your session has expired. Please sign in again.";
  // Messages raised by our own triggers/RPCs are already user friendly.
  return message.replace(/^ERROR:\s*/, "");
}
