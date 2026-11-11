/**
 * In-process PostgreSQL (PGlite) harness that emulates the parts of Supabase
 * the migrations depend on (auth.users, auth.uid(), auth.jwt(), storage,
 * the anon/authenticated/service_role roles) so migrations, triggers, RPCs
 * and RLS policies can be tested without Docker or a cloud project.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function createDb() {
  const db = await PGlite.create();
  await db.exec("create extension if not exists pgcrypto;").catch(() => undefined);
  await db.exec(SUPABASE_STUB);
  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(dir, file), "utf8").replace(
      /create extension if not exists pgcrypto;/g,
      "",
    );
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

/** Create an auth user + profile (as the superuser, like the provisioning script). */
export async function createUser(db: Db, username: string, role: "admin" | "entry") {
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`${username}@hrms.local`],
  );
  const id = res.rows[0].id;
  await db.query(
    "insert into public.profiles (id, username, full_name, role, must_change_password) values ($1,$2,$3,$4,false)",
    [id, username, username, role],
  );
  return id;
}

/** Run a callback as an authenticated user (RLS applies). */
export async function asUser<T>(db: Db, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function asService<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  }
}
