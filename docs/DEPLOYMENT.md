# Deployment guide — GitHub + Vercel + Supabase

> Production deployment requires the owner's approval. These steps are prepared; nothing has been deployed.

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "ALL SHEBA HRMS v1.0.0"
git branch -M main
git remote add origin https://github.com/<org>/allsheba-hrms.git
git push -u origin main
```

Before pushing, confirm that no secrets will be committed:

```bash
git status --ignored   # .env.local must appear under "Ignored files"
```

## 2. Import into Vercel

1. Go to https://vercel.com/new and import the repository. The framework is detected as **Next.js**.
2. Under **Environment Variables**, add these for **Production** (and Preview if you use it):

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret**; server-only |
| `AUTH_EMAIL_DOMAIN` | must match the value used for provisioning |
| `CRON_SECRET` | long random string; Vercel sends it to the cron job |

Do **not** add `ADMIN_INITIAL_PASSWORD` or `ENTRY_INITIAL_PASSWORD` to Vercel. Provisioning runs once from a local machine.

3. Click **Deploy**.

## 3. Automatic attendance closing (cron)

`vercel.json` schedules `/api/cron/close-attendance` daily at **18:30 UTC (00:30 Asia/Dhaka)**. The job closes the previous day only when **Company Settings → Attendance → Automatic attendance closing** is on. The endpoint rejects any request without `Authorization: Bearer $CRON_SECRET`.

## 4. Supabase production checklist

- Sign-ups disabled and email confirmation off (see SETUP.md).
- Under **Authentication → URL Configuration**, set the Site URL to your Vercel domain.
- Point-in-time recovery or daily backups enabled (paid plans).
- Apply future migrations with `npx supabase db push`, and back up the database first.

## 5. Updating

Push to `main` and Vercel redeploys automatically. Add any new migration file under `supabase/migrations/` with a later timestamp. Never edit a migration that has already been applied.
