-- =====================================================================
-- ALL SHEBA HRMS — new role "employee" (self-service check-in / check-out)
-- Kept in its own migration: a new enum value must be committed before it
-- can be used (0012 uses it). Additive and safe to run more than once.
-- =====================================================================

alter type public.app_role add value if not exists 'employee';
