# Data Preservation Report

| Item | Result |
|---|---|
| Database migrations in this change | **none** |
| SQL executed against production | **none** |
| Schema, index or record changes | **none** |
| Storage changes | **none** |
| Code backup | branch `backup/pre-performance-2026-11-15`, tag `v1.1.0-pre-perf` (pushed) |
| Rollback | Vercel → Deployments → previous production deployment → Instant Rollback; or redeploy tag `v1.1.0-pre-perf` |

Because the change touches application code and Vercel region configuration only, existing employees, attendance
(including actual in/out times and late reasons), leave, payroll and finalized snapshots, users, settings and
documents are not read differently or written by it.

Record counts and a database backup could not be taken from this session (no database credentials). See
DATA_PRESERVATION_PLAN.md for the read-only count query and backup options.
