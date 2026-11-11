/**
 * One-time, idempotent provisioning of the initial accounts:
 *   admin (Administrator) — password from ADMIN_INITIAL_PASSWORD
 *   user  (Entry operator) — password from ENTRY_INITIAL_PASSWORD
 *
 * Usage:  npm run provision
 * Reads .env.local. Both users must change the password at first sign-in.
 * Existing accounts are never modified (safe to run again).
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mcenelqeuaffxqvszjph.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.AUTH_EMAIL_DOMAIN || "hrms.allsheba.local";

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function strong(p: string | undefined, name: string): string {
  if (!p) fail(`${name} is not set in .env.local`);
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) fail(`${name} must be at least 8 characters and contain a letter and a number.`);
  return p;
}

async function main() {
  if (!url || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  const accounts = [
    { username: "admin", full_name: "Administrator", role: "admin" as const, password: strong(process.env.ADMIN_INITIAL_PASSWORD, "ADMIN_INITIAL_PASSWORD") },
    { username: "user", full_name: "Entry Operator", role: "entry" as const, password: strong(process.env.ENTRY_INITIAL_PASSWORD, "ENTRY_INITIAL_PASSWORD") },
  ];
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { error: schemaErr } = await sb.from("company_settings").select("id").eq("id", 1).single();
  if (schemaErr) fail(`Database is not ready (${schemaErr.message}). Apply the SQL migrations first — see docs/SETUP.md.`);

  for (const a of accounts) {
    const { data: existing } = await sb.from("profiles").select("id").eq("username", a.username).maybeSingle();
    if (existing) {
      console.log(`• ${a.username}: already exists — left unchanged`);
      continue;
    }
    const email = `${a.username}@${domain}`;
    let userId: string | undefined;
    const created = await sb.auth.admin.createUser({ email, password: a.password, email_confirm: true });
    if (created.error) {
      // Auth user may exist without a profile (interrupted earlier run).
      const list = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = list.data.users.find((u) => u.email === email)?.id;
      if (!userId) fail(`Could not create ${a.username}: ${created.error.message}`);
      await sb.auth.admin.updateUserById(userId, { password: a.password });
    } else {
      userId = created.data.user.id;
    }
    const { error } = await sb.from("profiles").insert({
      id: userId, username: a.username, full_name: a.full_name, role: a.role, must_change_password: true,
    });
    if (error) fail(`Could not create profile for ${a.username}: ${error.message}`);
    console.log(`✔ ${a.username} (${a.role}) created — must change password at first sign-in`);
  }
  console.log("\nDone. Remove ADMIN_INITIAL_PASSWORD and ENTRY_INITIAL_PASSWORD from your environment now.\n");
}

main().catch((e) => fail((e as Error).message));
