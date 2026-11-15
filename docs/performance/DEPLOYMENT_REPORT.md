# Deployment Report

## Status
| Step | Status |
|---|---|
| Branch `perf/optimizations` pushed | done |
| Vercel preview deployment | created automatically by the push; URL in Vercel → Deployments |
| Preview tested by owner | **pending** |
| Production deployment | **waiting for owner approval** |

## Environment
- No environment variable changes are required.
- `vercel.json` adds `"regions": ["hnd1"]` (Tokyo). The cron job (`/api/cron/close-attendance`, 18:30 UTC) is unchanged.

## How to approve and release
1. Open the preview from Vercel → Deployments (branch `perf/optimizations`) and run the checklist in TESTING_REPORT.md.
2. Approve. The branch is then merged into `main`; Vercel deploys production automatically.
3. After release: confirm the `x-vercel-id` response header contains `hnd1` and re-measure `/login` TTFB.

## Rollback
Vercel → Deployments → the previous production deployment → **Instant Rollback** (seconds, no rebuild).
