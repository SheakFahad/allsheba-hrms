# Changelog

## 1.0.0 — 2026-11-11

### Added
- Supabase schema with 19 tables, constraints, indexes, RLS, storage buckets and default configuration (6 migrations).
- Database-enforced attendance calculation (late minutes after grace, early departure, overtime, working hours), duplicate prevention, mandatory late reason, and automatic correction history.
- Attendance closing process (manual, date range, and daily Vercel cron) that marks absent, leave, holiday or weekly off. Absence is never inferred from a missing entry.
- Username-based authentication with forced password change, admin password reset, a role-separated Admin and Entry panel, and an audit log.
- Employee management: auto-generated IDs, photos, private documents, salary history, archive and restore, change history, and a 7-tab profile.
- Quick Attendance (Entry) with live late, early and hours calculation; admin day view with corrections and deletion.
- Attendance history and analytics: filters, summary metrics, trend, late-reason and ranking charts, employee-wise table.
- Leave management: policies, balances with overrides, applications, approval with balance check, calendar.
- Payroll: configurable rules (all deductions off by default), draft adjustments, recalculation, immutable finalization, payslips.
- Universal report engine: 21 report types, custom builder, column selection and sorting, print, PDF, Excel and CSV, with export audit logging.
- Admin dashboard, company settings, users, departments and designations, holidays and shifts, audit log viewer.
- Brand design system derived from the company logo, with light and dark mode and a validated chart palette.
- Tests: 20 PGlite database tests and 15 unit tests.
