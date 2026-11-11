# ALL SHEBA HRMS — Development Status

_Last updated: 2026-11-11_

## Stack (pinned)
Next.js 16.4.6 (App Router, `src/proxy.ts` replaces middleware) · React 19.3 · TypeScript · Tailwind 4 · shadcn/ui (radix-nova) · Supabase (`@supabase/ssr` 0.12) · Zod 4 · RHF 7 · Recharts 3 · jsPDF 4 + autotable 5 · ExcelJS 4 · Vitest 5 + PGlite (DB tests without Docker).

> Note: `cacheComponents` is intentionally **disabled** (fully dynamic, authenticated app).
> RHF + Zod transforms: always `useForm<z.input<S>, unknown, z.output<S>>`.

## Phase checklist

| # | Phase | Status |
|---|-------|--------|
| 1 | Inspection & architecture | ✅ Logo found (`logo.png`), trimmed copies in `public/brand/`, favicon in `src/app/icon.png` |
| 2 | Database & migrations | ✅ `supabase/migrations/0001–0006` · 20 PGlite tests pass (`npm test`) |
| 3 | Auth & roles | ✅ username→email mapping, login, logout, forced password change, proxy + layout + action + RLS checks |
| 4 | Admin / Entry layouts | ✅ sidebar, mobile sheet, dark mode, user menu |
| 5 | Employee management | ✅ list (search/filter/sort/paginate), create/edit, archive/restore, profile with 7 tabs, salary history, documents (private bucket, signed URLs) |
| 6 | Attendance & late tracking | ✅ Quick Attendance (Entry), admin day view, edit with reason, delete, closing (day/range), correction requests + review |
| 7 | History & analytics | ✅ admin history page with filters, summary, charts, employee-wise analytics |
| 8 | Report / PDF / print engine | ✅ 21 report types, builder, Print & PDF Center, viewer (print/PDF/XLSX/CSV, columns, sort, orientation), export audit |
| 9 | Leave management | ✅ requests + approval, balances with overrides, calendar, policies; Entry applications |
| 10 | Payroll | ✅ generate/recalculate, adjustments, finalize (immutable), payslips, salary expense |
| 11 | Settings, users, departments, holidays/shifts, audit logs, dashboard | ✅ + `scripts/provision.ts`, cron `/api/cron/close-attendance` |
| 12 | Testing & deployment prep | ✅ typecheck, lint (0 issues), 35 tests, production build; docs. ⏳ Needs Supabase project to verify live integration; deployment awaits owner approval |

## Key decisions / assumptions
- Usernames map to Supabase Auth emails `<username>@AUTH_EMAIL_DOMAIN`; public sign-up must be disabled in Supabase.
- Password reset = admin resets from User Management (internal emails cannot receive mail).
- Absence is never inferred from a missing entry — only `close_attendance()` (manual or cron) creates Absent/Leave/Holiday/Weekly-off rows.
- Late = actual-in later than scheduled-in by **more than** the shift grace; late minutes stored as full delay.
- All payroll deductions default OFF; enabled only in Company Settings. Finalized payroll is immutable (DB trigger).
- Weekly off default: Friday. Entry operators: same-day entry/edit by default (configurable backdate/edit days).
- Personal details, salary, documents, payroll, audit logs are admin-only at the RLS level.

## Deployment (2026-11-11)
- Supabase project `mcenelqeuaffxqvszjph` — schema applied via `supabase/setup.sql`, RLS verified from outside.
- Accounts `admin` (admin) and `user` (entry) created; both must change password at first sign-in.
- GitHub: https://github.com/SheakFahad/allsheba-hrms (private) · Vercel: https://allsheba-hrms.vercel.app (live, owner confirmed).

## Remaining owner actions
1. Supabase → Authentication → Email: disable "Allow new users to sign up".
2. Supabase → Authentication → URL Configuration: Site URL = https://allsheba-hrms.vercel.app
3. Vercel env: add `CRON_SECRET` (automatic closing) and `SUPABASE_SERVICE_ROLE_KEY` (in-app Add user / Reset password), then redeploy.
