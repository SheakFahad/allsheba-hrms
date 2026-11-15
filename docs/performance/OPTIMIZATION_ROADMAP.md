# Optimization Roadmap

Small, independently testable phases on branch `perf/optimizations`. No database changes in any phase.

| Phase | Change | Root cause addressed | Verification |
|---|---|---|---|
| 1 | Run Vercel functions in Tokyo (`hnd1`), next to the database | #1 region | TTFB of `/login` and `/` before vs after; `x-vercel-id` shows `hnd1` |
| 2 | Verify the session locally with `getClaims()` (ES256) in `proxy.ts` and `getSessionUser()`; profile + role check kept | #2 auth round trips | Login, redirect and role tests; RLS unchanged |
| 3 | Remove waterfalls: parallel layout queries; load holidays once per request and filter in memory; dashboard leave query joins the main batch | #3 waterfalls | Same numbers on dashboard; typecheck/tests |
| 4 | Stream dashboard and history charts behind `<Suspense>` and lazy-load Recharts | #4 charts | Stat cards render first; `/admin` client JS (gzip) before vs after |
| 5 | Route `loading.tsx` skeletons for Admin and Entry | #5 feedback | Visual |
| 6 | Full check: typecheck, lint, unit + DB tests, build; deploy **preview**; owner approval; production; re-measure | — | Reports in `docs/performance/` |

## Deliberately not done (no evidence of benefit)
- New indexes or SQL functions (no `EXPLAIN ANALYZE` access; data volume small; existing indexes cover all filters).
- Cross-request caching of private data (risk of serving one user's data to another; per-request caching is kept).
- Changing hosting or database provider.
