# Deployment Report

## Status
| Step | Status |
|---|---|
| Branch `perf/optimizations` pushed | done |
| Vercel preview deployment | created automatically by the push; URL in Vercel → Deployments |
| Preview tested by owner | done — owner confirmed all features work |
| Production deployment | **done** 2026-11-15, commit `abc8834`, region `hnd1` verified |
| Post-release smoke test | login form renders; `/admin` signed-out → 307 to `/login`; cron without secret → 401 |

## Environment
- No environment variable changes are required.
- `vercel.json` adds `"regions": ["hnd1"]` (Tokyo). The cron job (`/api/cron/close-attendance`, 18:30 UTC) is unchanged.

## How to approve and release
1. Open the preview from Vercel → Deployments (branch `perf/optimizations`) and run the checklist in TESTING_REPORT.md.
2. Approve. The branch is then merged into `main`; Vercel deploys production automatically.
3. After release: confirm the `x-vercel-id` response header contains `hnd1` and re-measure `/login` TTFB.

## Rollback
Vercel → Deployments → the previous production deployment → **Instant Rollback** (seconds, no rebuild).
