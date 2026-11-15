# Testing Report

## Automated (run on branch `perf/optimizations`)

| Check | Result |
|---|---|
| TypeScript (`next typegen && tsc --noEmit`) | pass, 0 errors |
| ESLint | pass, 0 errors, 0 warnings |
| Unit tests (calculations, validation, formatting, report params) | pass |
| Database tests (PGlite: migrations, triggers, RLS, closing, leave, payroll immutability, flexible schedule, weekly off) | pass |
| Total | **47 / 47 passed** |
| Production build (`next build`) | pass |
| Secret scan of the commit | no keys or passwords |

## Security review of the changes
- Role checks: `requirePageRole()` still runs on every admin/entry layout and page; server actions still call
  `assertRole()`; database RLS policies unchanged.
- `getClaims()` verifies the token signature (ES256). A deactivated user is still blocked on the next request
  because `profiles.is_active` is checked in the database.
- No new caching of private data. Per-request React `cache()` only; nothing shared between users.

## Manual testing on the preview deployment — confirmed by the owner (2026-11-15)
- [x] Admin: login, dashboard (cards then charts), employee add/edit, attendance edit + correction, leave approve,
      payroll page, a PDF and an Excel export, settings save, users page, audit logs
- [x] Entry: login, employee search, attendance save (in, out, late reason), duplicate prevention, history
- [x] Payslip opens and matches production
