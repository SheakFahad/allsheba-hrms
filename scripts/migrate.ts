/**
 * Applies pending SQL migrations from supabase/migrations to the Supabase database.
 *
 * Usage:  npm run db:migrate            (apply pending)
 *         npm run db:migrate -- --status (show what is applied / pending)
 *
 * Needs SUPABASE_DB_URL in .env.local (Supabase → Connect → "Session pooler"
 * connection string, with your database password). Never commit it.
 *
 * Applied files are recorded in public.app_migrations. Each file runs in its
 * own transaction: on error nothing from that file is kept and the run stops.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

config({ path: ".env.local" });
config();

const DIR = path.join(process.cwd(), "supabase", "migrations");

// Already applied in production before this runner existed:
//  0001–0006 via supabase/setup.sql; 0007/0008 are superseded by the idempotent 0009.
const BASELINE = [
  "20261111000001_core_schema.sql",
  "20261111000002_business_logic.sql",
  "20261111000003_row_level_security.sql",
  "20261111000004_storage.sql",
  "20261111000005_default_configuration.sql",
  "20261111000006_employee_rpc.sql",
  "20261113000007_present_without_time.sql",
  "20261113000008_present_without_time_unassigned_shift.sql",
];

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) fail("SUPABASE_DB_URL is not set in .env.local (see the comment at the top of scripts/migrate.ts).");
  const statusOnly = process.argv.includes("--status");
  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => undefined, prepare: false });

  try {
    await sql`
      create table if not exists public.app_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )`;
    // Internal bookkeeping table: never exposed through the API.
    await sql`alter table public.app_migrations enable row level security`;
    await sql`revoke all on public.app_migrations from anon, authenticated`;

    let applied = new Set((await sql<{ name: string }[]>`select name from public.app_migrations`).map((r) => r.name));
    if (applied.size === 0) {
      const [{ exists }] = await sql<{ exists: boolean }[]>`select to_regclass('public.company_settings') is not null as exists`;
      if (exists) {
        for (const name of BASELINE) await sql`insert into public.app_migrations (name) values (${name}) on conflict do nothing`;
        console.log("• Existing database detected — baseline recorded (0001–0008).");
        applied = new Set(BASELINE);
      }
    }

    const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    const pending = files.filter((f) => !applied.has(f));

    if (statusOnly) {
      for (const f of files) console.log(`${applied.has(f) ? "✔ applied " : "… pending "} ${f}`);
      return;
    }
    if (pending.length === 0) {
      console.log("✔ Database is up to date.");
      return;
    }
    for (const f of pending) {
      const body = readFileSync(path.join(DIR, f), "utf8");
      process.stdout.write(`→ ${f} … `);
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into public.app_migrations (name) values (${f})`;
      });
      console.log("done");
    }
    // Ask PostgREST to reload its schema cache so new functions/columns are visible immediately.
    await sql`notify pgrst, 'reload schema'`;
    console.log(`\n✔ Applied ${pending.length} migration(s).`);
  } catch (e) {
    fail((e as Error).message);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
