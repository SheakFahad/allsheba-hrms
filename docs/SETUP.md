# Setup guide — ALL SHEBA HRMS

Follow these steps once to connect the app to its database and create the first accounts.

## 1. Create a Supabase project

1. Sign in at https://supabase.com and click **New project**.
2. Pick a region close to Bangladesh (for example **Singapore**). Choose a strong database password and store it safely.
3. When the project is ready, open **Project Settings → API** and note:
   - **Project URL**
   - **anon public** key
   - **service_role** key (secret — never share it, never put it in browser code)

## 2. Secure Supabase Auth

In **Authentication → Providers → Email**:

- **Disable "Allow new users to sign up"** (accounts are created only by administrators).
- **Disable "Confirm email"** (the app uses internal usernames, not real mailboxes).

## 3. Apply the database migrations

The schema lives in `supabase/migrations/`. Apply the files **in filename order**.

**Option A — SQL Editor (no tools needed):** open **SQL Editor → New query**, paste the contents of each file in order, and click **Run**:

1. `20261111000001_core_schema.sql`
2. `20261111000002_business_logic.sql`
3. `20261111000003_row_level_security.sql`
4. `20261111000004_storage.sql`
5. `20261111000005_default_configuration.sql`
6. `20261111000006_employee_rpc.sql`

**Option B — Supabase CLI:**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The migrations create configuration only (default 10:00–19:00 shift, settings, standard leave types). No sample employees are created.

> Never run destructive SQL on a production database without a backup (Database → Backups).

## 4. Configure environment variables

Copy `.env.example` to `.env.local` and fill it in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
AUTH_EMAIL_DOMAIN=hrms.allsheba.local
ADMIN_INITIAL_PASSWORD=<strong temporary password>
ENTRY_INITIAL_PASSWORD=<strong temporary password>
CRON_SECRET=<long random string>
```

`.env.local` is ignored by git. Never commit it.

## 5. Create the initial accounts

```bash
npm install
npm run provision
```

This creates:

| Username | Role | Password |
|----------|------|----------|
| `admin` | Administrator | value of `ADMIN_INITIAL_PASSWORD` |
| `user` | Entry operator | value of `ENTRY_INITIAL_PASSWORD` |

Both accounts must choose a new password at first sign-in. The script is safe to run again; it never changes existing accounts. **After provisioning, delete the two `*_INITIAL_PASSWORD` lines from `.env.local`.**

## 6. Run the app

```bash
npm run dev        # http://localhost:3000
```

Then, as `admin`:

1. **Company Settings:** check the company name, address, contact details, weekly holiday and payroll rules.
2. **Holidays & Shifts:** confirm office hours and grace period, then add this year's public holidays.
3. **Departments:** create departments and designations.
4. **Employees:** add employees, including a salary for each one so they appear in payroll.

## Verifying the installation

```bash
npm run check      # typecheck + lint + tests + production build
```
