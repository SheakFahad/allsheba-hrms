# Data Preservation Plan

## Scope of this optimization round
**No database changes.** No migrations, no SQL, no data writes, no schema changes, no index changes.
All work is in application code and deployment configuration, so production data (employees, attendance,
in/out times, late reasons, leave, payroll and finalized snapshots, users, settings, storage files) cannot be
altered by it.

## Safeguards already in place
| Safeguard | Status |
|---|---|
| Git backup branch `backup/pre-performance-2026-11-15` | pushed |
| Git tag `v1.1.0-pre-perf` (exact production code) | pushed |
| Work on branch `perf/optimizations`, production only after approval | yes |
| Instant rollback in Vercel (Deployments → previous → "Promote"/"Instant Rollback") | available |

## Database backup — action for the owner (not possible from this session)
This session has no database credentials, so it **cannot** take or verify a database backup or record counts.
Before any *future* database change, do one of:

1. **Supabase Pro** (daily backups, 7-day retention): Dashboard → Database → Backups.
2. **Free plan manual backup:** add `SUPABASE_DB_URL` (Supabase → Connect → Session pooler) to `.env.local`; a
   read-only export script can then save every table to a local file, and record counts can be captured.
3. **Storage:** download the `employee-documents` and `public-assets` buckets from Dashboard → Storage.

## Record counts
Not captured (no credentials). Because this round makes no database changes, before/after counts are unaffected by
construction. When credentials are available, run this read-only query in the SQL Editor and keep the result:

```sql
select 'employees' t, count(*) from employees union all
select 'attendance', count(*) from attendance union all
select 'attendance_corrections', count(*) from attendance_corrections union all
select 'leave_requests', count(*) from leave_requests union all
select 'salary_structures', count(*) from salary_structures union all
select 'payroll_records', count(*) from payroll_records union all
select 'payroll_items', count(*) from payroll_items union all
select 'employee_documents', count(*) from employee_documents union all
select 'profiles', count(*) from profiles union all
select 'audit_logs', count(*) from audit_logs;
```

## Risks and mitigations
| Change | Risk | Mitigation |
|---|---|---|
| Move server functions to Tokyo (`hnd1`) | None for data; region only affects where code runs | Rollback = previous deployment |
| `getClaims()` instead of `getUser()` | A revoked session could stay valid until its token expires (≤1 h) | Every request still re-checks `profiles.is_active` and role in the database; RLS unchanged |
| Streaming / lazy charts | Visual only | Same data functions and calculations |
