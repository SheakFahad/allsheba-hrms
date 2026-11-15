# Optimization Report

Branch `perf/optimizations` · base `v1.1.0-pre-perf` · **no database changes**.

## Root causes and fixes

| # | Root cause (see PERFORMANCE_AUDIT.md) | Fix | Files |
|---|---|---|---|
| 1 | Server functions ran in Washington DC (`iad1`); database is in Tokyo | Functions pinned to Tokyo `hnd1` | `vercel.json` |
| 2 | Two Supabase Auth network calls per request (`getUser()` in proxy and in the session loader) | `getClaims()`: ES256 signature verified locally with cached JWKS. Profile, active flag and role are still read from the database on every request; RLS unchanged | `src/proxy.ts`, `src/lib/auth.ts` |
| 3a | One holiday query per date range (up to 7 per dashboard) | Holidays loaded once per request, filtered in memory | `src/lib/data.ts` |
| 3b | Layouts awaited session → branding → counts in sequence | Started together with `Promise.all` (role check still decides rendering; redirect on failure) | `src/app/admin/layout.tsx`, `src/app/entry/layout.tsx` |
| 3c | Dashboard leave query waited for everything else; whole page waited for 6-month analytics | Stat cards: one parallel batch for the selected month only. Charts: separate async component streamed with `<Suspense>` | `src/app/admin/page.tsx` |
| 4 | Recharts (~110 KB gzip) in the initial bundle of dashboard and history | Drawing code moved to `chart-plot.tsx`, loaded with `next/dynamic` (`ssr: false`) | `src/components/charts/*` |
| 5 | No feedback while navigating | `loading.tsx` skeletons for `/admin/*` and `/entry/*` | `src/app/*/loading.tsx`, `page-skeleton.tsx` |

Calculations are unchanged: the same `summarizeAttendance`, `scheduledWorkingDays`, `employeeWiseAnalytics` and
database functions are used. Payroll, attendance, leave and report logic were not modified.

## Measured results

| Metric | Before | After | Change |
|---|---|---|---|
| `/admin` client JS (gzip) | 193 KB | 82 KB | −58% |
| `/admin/attendance/history` client JS (gzip) | 193 KB | 82 KB | −58% |
| Other routes client JS | 79–96 KB | 79–96 KB | unchanged |
| Supabase Auth round trips per signed-in request | 2 | 0 (token verified locally) | −2 |
| Holiday queries per dashboard load | up to 7 | 1 | — |
| `/login` TTFB, production (10 samples, from Bangladesh) | median 1069 ms (min 648) | **median 394 ms** (min 375) | **−63%** |
| `/` TTFB (proxy + redirect) | median 389 ms | median 341 ms | −12% |
| Server region (`x-vercel-id`) | `iad1` Washington DC | `hnd1` Tokyo | same region as database |

Measured on 2026-11-15 before (commit `429d758`) and after (commit `abc8834`) the production release. Signed-in pages were
not timed (no credentials in this session); they make more database round trips than `/login`, so they gain at least as much.

## Remaining bottlenecks / next steps
- Visitors in Bangladesh reach Tokyo in ~150 ms; this distance remains for every navigation.
- Employee profile page loads tab data after the employee record (2 sequential steps); acceptable at current volume.
- `EXPLAIN ANALYZE` on production was not possible (no database credentials); revisit indexes if data grows.
