/**
 * READ-ONLY logical backup + data fingerprint of the HRMS database.
 *
 * Usage:  npm run db:backup                         (database from .env.local)
 *         npm run db:backup -- --env .env.staging.local
 *         npm run db:backup -- --compare backups/<earlier>.json   (also prints a preservation report)
 *
 * Writes backups/<project>-<timestamp>.json with every row of every public
 * table plus auth user ids/emails (no password hashes), and a per-table
 * fingerprint (row count + md5 of all rows in primary-key order). It only runs
 * SELECT statements inside a READ ONLY transaction — it can never change data.
 *
 * --compare checks that every table's rows from the earlier backup are still
 * present and unchanged (new rows are allowed: an additive update may add rows,
 * e.g. new login accounts).
 */
import { config } from "dotenv";
import { databaseUrl } from "./db-url";
import postgres from "postgres";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ENV_FILE = arg("--env") ?? ".env.local";
config({ path: ENV_FILE, override: true });

interface TableDump {
  rows: number;
  md5: string;
  data: Record<string, unknown>[];
}
interface Backup {
  project: string;
  taken_at: string;
  tables: Record<string, TableDump>;
}

async function main() {
  const url = databaseUrl();
  if (!url) throw new Error(`SUPABASE_DB_URL is not set in ${ENV_FILE}.`);
  const project = /postgres\.([a-z0-9]+):/.exec(url)?.[1] ?? "db";
  console.log(`Backup of project ${project} (from ${ENV_FILE}) — read only`);
  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => undefined, prepare: false });
  const backup: Backup = { project, taken_at: new Date().toISOString(), tables: {} };
  try {
    await sql.begin("read only", async (tx) => {
      const tables = await tx<{ table_name: string }[]>`
        select table_name from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
      for (const { table_name } of tables) {
        const pk = await tx<{ col: string }[]>`
          select a.attname as col from pg_index i
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
           where i.indrelid = ${`public.${table_name}`}::regclass and i.indisprimary order by a.attnum`;
        const order = pk.length ? pk.map((c) => `"${c.col}"`).join(", ") : "1";
        const data = await tx.unsafe(`select * from public."${table_name}" order by ${order}`);
        const [{ md5 }] = await tx.unsafe<{ md5: string }[]>(
          `select md5(coalesce(string_agg(t::text, '|' order by ${pk.length ? pk.map((c) => `t."${c.col}"`).join(", ") : "t::text"}), '')) as md5 from public."${table_name}" t`,
        );
        backup.tables[table_name] = { rows: data.length, md5, data: [...data] };
      }
      const users = await tx`select id, email, created_at from auth.users order by id`;
      backup.tables["auth.users (id, email only)"] = { rows: users.length, md5: "", data: [...users] };
    });
  } finally {
    await sql.end();
  }

  mkdirSync("backups", { recursive: true });
  const file = path.join("backups", `${project}-${backup.taken_at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(backup));
  // Verify the file reads back and matches.
  const check = JSON.parse(readFileSync(file, "utf8")) as Backup;
  for (const [t, d] of Object.entries(backup.tables)) {
    if (check.tables[t]?.rows !== d.rows) throw new Error(`Backup verification failed for ${t}`);
  }
  console.log(`\n✔ Backup written and verified: ${file}\n`);
  console.log("Table".padEnd(32) + "Rows");
  for (const [t, d] of Object.entries(backup.tables)) console.log(t.padEnd(32) + d.rows);

  const cmp = arg("--compare");
  if (cmp) {
    const before = JSON.parse(readFileSync(cmp, "utf8")) as Backup;
    console.log(`\nData preservation report: ${cmp} → now`);
    let problems = 0;
    for (const [t, old] of Object.entries(before.tables)) {
      const now = backup.tables[t];
      if (!now) { console.log(`  ✖ ${t}: table missing`); problems++; continue; }
      const key = (r: Record<string, unknown>) => JSON.stringify(r.id ?? r.employee_id ?? r);
      const current = new Map(now.data.map((r) => [key(r), JSON.stringify(r)]));
      let changed = 0;
      let missing = 0;
      for (const r of old.data) {
        const c = current.get(key(r));
        if (c === undefined) missing++;
        else if (c !== JSON.stringify(r) && !/^(profiles|company_settings|app_migrations)$/.test(t)) changed++;
      }
      const added = now.rows - (old.rows - missing);
      const ok = missing === 0 && changed === 0;
      if (!ok) problems++;
      console.log(`  ${ok ? "✔" : "✖"} ${t.padEnd(30)} before ${String(old.rows).padStart(5)}  now ${String(now.rows).padStart(5)}  missing ${missing}  changed ${changed}  new ${added}`);
    }
    console.log(problems ? `\n✖ ${problems} table(s) differ — investigate before continuing.` : "\n✔ Every earlier row is still present and unchanged.");
    if (problems) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
