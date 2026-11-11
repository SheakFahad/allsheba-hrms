import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// The combined supabase/setup.sql must apply cleanly in one run (SQL Editor path).
it("supabase/setup.sql applies in a single run", async () => {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  `);
  const sql = readFileSync("supabase/setup.sql", "utf8").replace(/create extension if not exists pgcrypto;/g, "");
  await db.exec(sql);
  const r = await db.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  expect(r.rows[0].n).toBe(19);
}, 120_000);
