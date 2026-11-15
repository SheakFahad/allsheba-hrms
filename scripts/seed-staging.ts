/**
 * Seeds the STAGING database with test accounts and test employees.
 *
 * Usage:  npm run db:seed:staging      (reads .env.staging.local)
 *
 * Refuses to run against the production project. Safe to run again: existing
 * usernames / employees are left as they are. Prints the test logins.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { randomInt } from "node:crypto";

config({ path: ".env.staging.local", override: true });

const PRODUCTION_REF = "mcenelqeuaffxqvszjph";
const DOMAIN = process.env.AUTH_EMAIL_DOMAIN || "hrms.allsheba.local";

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function password() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  let s = "";
  for (let i = 0; i < 7; i++) s += letters[randomInt(letters.length)];
  return s + digits[randomInt(digits.length)] + digits[randomInt(digits.length)];
}

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) fail("SUPABASE_DB_URL is not set in .env.staging.local.");
  if (url.includes(PRODUCTION_REF)) fail("This URL is the PRODUCTION database. Seeding is only allowed on staging.");

  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => undefined, prepare: false });
  try {
    await sql`update public.company_settings
                 set company_name = 'All Sheba Limited (STAGING)', tagline = 'Test environment — not real data'
               where id = 1 and company_name not like '%(STAGING)%'`;

    const testEmployees = [
      { name: "Test Employee One", shift: "default" },
      { name: "Test Employee Two", shift: "default" },
      { name: "Test Flexible Employee", shift: null },
    ];
    const ids: string[] = [];
    for (const t of testEmployees) {
      const found = await sql<{ id: string }[]>`select id from public.employees where full_name = ${t.name}`;
      if (found.length) {
        ids.push(found[0].id);
        continue;
      }
      const [row] = await sql<{ id: string }[]>`
        insert into public.employees (full_name, joining_date, shift_id)
        values (${t.name}, current_date - 30,
                ${t.shift ? sql`(select id from public.shifts where is_default)` : null})
        returning id`;
      ids.push(row.id);
    }

    const accounts = [
      { username: "admin", full_name: "Staging Admin", role: "admin", employee: null as string | null },
      { username: "user", full_name: "Staging Entry Operator", role: "entry", employee: null },
      { username: "emp1", full_name: "Test Employee One", role: "employee", employee: ids[0] },
      { username: "emp2", full_name: "Test Employee Two", role: "employee", employee: ids[1] },
      { username: "flex1", full_name: "Test Flexible Employee", role: "employee", employee: ids[2] },
    ];
    const created: { username: string; role: string; password: string }[] = [];

    for (const a of accounts) {
      const exists = await sql`select 1 from public.profiles where username = ${a.username}`;
      if (exists.length) {
        console.log(`• ${a.username}: already exists — unchanged`);
        continue;
      }
      const pw = password();
      const email = `${a.username}@${DOMAIN}`;
      await sql.begin(async (tx) => {
        const [u] = await tx<{ id: string }[]>`
          insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                                  confirmation_token, email_change, email_change_token_new, recovery_token)
          values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', ${email},
                  extensions.crypt(${pw}, extensions.gen_salt('bf')), now(),
                  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')
          returning id`;
        await tx`
          insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          values (gen_random_uuid(), ${u.id}, ${u.id}::text,
                  jsonb_build_object('sub', ${u.id}::text, 'email', ${email}::text, 'email_verified', true),
                  'email', now(), now(), now())`;
        await tx`
          insert into public.profiles (id, username, full_name, role, employee_id, must_change_password)
          values (${u.id}, ${a.username}, ${a.full_name}, ${a.role}::public.app_role, ${a.employee}, false)`;
      });
      created.push({ username: a.username, role: a.role, password: pw });
    }

    if (created.length) {
      console.log("\nStaging test logins (staging only — not production):");
      for (const c of created) console.log(`  ${c.username.padEnd(6)} ${c.role.padEnd(9)} ${c.password}`);
    }
    console.log("\n✔ Staging seed complete.");
  } catch (e) {
    fail((e as Error).message);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
