-- =============================================================
-- ALL SHEBA HRMS — complete database setup (run ONCE on a NEW project)
-- Generated from supabase/migrations/* in order. Do not edit here.
-- =============================================================

-- >>> 20261111000001_core_schema.sql
-- =====================================================================
-- ALL SHEBA HRMS — Core schema
-- Tables, enums, constraints, indexes. Business logic lives in 0002,
-- security (RLS) in 0003, storage in 0004, seed configuration in 0005.
-- All "local" dates/times are Asia/Dhaka wall-clock values.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'entry');

create type public.employment_type as enum (
  'full_time', 'part_time', 'contract', 'intern', 'probation'
);

create type public.employment_status as enum (
  'active', 'on_notice', 'suspended', 'resigned', 'terminated'
);

create type public.attendance_status as enum (
  'present', 'late', 'half_day', 'absent', 'leave', 'holiday', 'weekly_off'
);

create type public.late_reason as enum (
  'traffic_jam', 'transport_problem', 'personal_emergency', 'health_issue',
  'family_issue', 'weather_problem', 'other'
);

create type public.attendance_source as enum ('entry', 'admin', 'closing', 'correction');

create type public.correction_kind as enum ('edit', 'request');

create type public.correction_status as enum ('applied', 'pending', 'approved', 'rejected');

create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create type public.payroll_status as enum ('draft', 'finalized');

create type public.payroll_day_basis as enum ('fixed_30', 'calendar', 'working');

-- ---------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- profiles — one row per application user (auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  username              text not null unique
                        check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  full_name             text not null default '',
  role                  public.app_role not null,
  is_active             boolean not null default true,
  must_change_password  boolean not null default true,
  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Organisation reference data
-- ---------------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  code        text check (code is null or length(code) <= 16),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index departments_name_uq on public.departments (lower(name));
create trigger trg_departments_touch before update on public.departments
  for each row execute function public.touch_updated_at();

create table public.designations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index designations_name_uq on public.designations (lower(name));
create trigger trg_designations_touch before update on public.designations
  for each row execute function public.touch_updated_at();

create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) between 1 and 60),
  start_time     time not null,
  end_time       time not null,
  grace_minutes  integer not null default 0 check (grace_minutes between 0 and 240),
  is_default     boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint shifts_time_order check (end_time > start_time)
);
create unique index shifts_name_uq on public.shifts (lower(name));
create unique index shifts_single_default on public.shifts (is_default) where is_default;
create trigger trg_shifts_touch before update on public.shifts
  for each row execute function public.touch_updated_at();

create table public.holidays (
  id            uuid primary key default gen_random_uuid(),
  holiday_date  date not null unique,
  name          text not null check (length(trim(name)) between 1 and 120),
  kind          text not null default 'public' check (kind in ('public', 'company', 'optional')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_holidays_touch before update on public.holidays
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- company_settings — single row (id = 1). Every business rule lives here.
-- ---------------------------------------------------------------------
create table public.company_settings (
  id                              smallint primary key default 1 check (id = 1),
  company_name                    text not null default 'All Sheba Limited',
  tagline                         text default 'One app all services',
  address                         text default '',
  phone                           text default '',
  email                           text default '',
  website                         text default '',
  logo_path                       text,          -- storage path in public-assets; null = bundled logo
  timezone                        text not null default 'Asia/Dhaka',
  currency                        text not null default 'BDT',
  employee_code_prefix            text not null default 'ASL'
                                  check (employee_code_prefix ~ '^[A-Z0-9]{1,8}$'),
  max_employees                   integer not null default 20 check (max_employees between 1 and 100000),
  weekly_off_days                 smallint[] not null default '{5}',  -- 0=Sun … 6=Sat (5 = Friday)
  -- Attendance policy
  late_reason_required            boolean not null default true,
  late_note_required_for_other    boolean not null default true,
  entry_backdate_days             integer not null default 0 check (entry_backdate_days between 0 and 31),
  entry_edit_days                 integer not null default 0 check (entry_edit_days between 0 and 31),
  auto_close_enabled              boolean not null default false,
  auto_close_time                 time not null default '23:30',
  -- Payroll policy (all deductions OFF until an admin configures them)
  payroll_day_basis               public.payroll_day_basis not null default 'fixed_30',
  absent_deduction_enabled        boolean not null default false,
  unpaid_leave_deduction_enabled  boolean not null default false,
  half_day_deduction_enabled      boolean not null default false,
  late_deduction_enabled          boolean not null default false,
  late_days_per_deduction         integer not null default 3 check (late_days_per_deduction between 1 and 31),
  late_deduction_day_fraction     numeric(4,2) not null default 1 check (late_deduction_day_fraction between 0 and 1),
  overtime_enabled                boolean not null default false,
  overtime_rate_multiplier        numeric(4,2) not null default 1 check (overtime_rate_multiplier between 0 and 5),
  overtime_min_minutes            integer not null default 30 check (overtime_min_minutes between 0 and 600),
  -- Report branding
  report_footer                   text default 'This is a system generated document.',
  payslip_note                    text default '',
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint weekly_off_valid check (weekly_off_days <@ array[0,1,2,3,4,5,6]::smallint[])
);
create trigger trg_settings_touch before update on public.company_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------
create sequence public.employee_code_seq start 1;

create table public.employees (
  id                 uuid primary key default gen_random_uuid(),
  employee_code      text not null unique,
  full_name          text not null check (length(trim(full_name)) between 2 and 120),
  photo_path         text,
  phone              text check (phone is null or phone ~ '^[0-9+() -]{6,20}$'),
  designation_id     uuid references public.designations (id) on delete restrict,
  department_id      uuid references public.departments (id) on delete restrict,
  shift_id           uuid references public.shifts (id) on delete restrict,
  joining_date       date not null,
  employment_type    public.employment_type not null default 'full_time',
  status             public.employment_status not null default 'active',
  archived_at        timestamptz,
  archived_reason    text,
  created_by         uuid references auth.users (id) on delete set null,
  updated_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index employees_department_idx on public.employees (department_id);
create index employees_active_idx on public.employees (archived_at) where archived_at is null;
create index employees_name_idx on public.employees (lower(full_name));
create trigger trg_employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();

-- Sensitive personal details (admin only, separated so RLS can hide them
-- from the Entry panel while it still sees the operational directory).
create table public.employee_personal (
  employee_id               uuid primary key references public.employees (id) on delete cascade,
  email                     text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address                   text,
  date_of_birth             date,
  national_id               text,
  emergency_contact_name    text,
  emergency_contact_phone   text,
  emergency_contact_relation text,
  notes                     text,
  updated_at                timestamptz not null default now()
);
create trigger trg_employee_personal_touch before update on public.employee_personal
  for each row execute function public.touch_updated_at();

create table public.employee_documents (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 120),
  category     text not null default 'other',
  file_path    text not null unique,
  file_name    text not null,
  file_size    bigint not null check (file_size > 0),
  mime_type    text,
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index employee_documents_emp_idx on public.employee_documents (employee_id);

-- Salary history: every change is a new row (never overwritten).
create table public.salary_structures (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id) on delete cascade,
  effective_from  date not null,
  basic_salary    numeric(12,2) not null check (basic_salary >= 0),
  allowances      numeric(12,2) not null default 0 check (allowances >= 0),
  notes           text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (employee_id, effective_from)
);
create index salary_structures_emp_idx on public.salary_structures (employee_id, effective_from desc);

-- Employment change history (designation / department / status / joining date)
create table public.employee_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  event_type   text not null,
  old_value    text,
  new_value    text,
  actor_id     uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index employee_events_emp_idx on public.employee_events (employee_id, created_at desc);

-- ---------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------
create table public.attendance (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references public.employees (id) on delete restrict,
  attendance_date       date not null,
  shift_id              uuid references public.shifts (id) on delete set null,
  scheduled_in          time not null,
  scheduled_out         time not null,
  grace_minutes         integer not null default 0 check (grace_minutes >= 0),
  actual_in             time,
  actual_out            time,
  status                public.attendance_status not null,
  late_minutes          integer not null default 0 check (late_minutes >= 0),
  early_leave_minutes   integer not null default 0 check (early_leave_minutes >= 0),
  overtime_minutes      integer not null default 0 check (overtime_minutes >= 0),
  work_minutes          integer not null default 0 check (work_minutes >= 0),
  late_reason           public.late_reason,
  late_reason_note      text check (late_reason_note is null or length(late_reason_note) <= 500),
  notes                 text check (notes is null or length(notes) <= 1000),
  source                public.attendance_source not null default 'entry',
  is_locked             boolean not null default false,
  last_change_reason    text,
  entered_by            uuid references auth.users (id) on delete set null,
  updated_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint attendance_one_per_day unique (employee_id, attendance_date),
  constraint attendance_schedule_order check (scheduled_out > scheduled_in),
  constraint attendance_actual_order check (actual_out is null or actual_in is null or actual_out > actual_in),
  constraint attendance_out_needs_in check (actual_out is null or actual_in is not null)
);
create index attendance_date_idx on public.attendance (attendance_date);
create index attendance_emp_date_idx on public.attendance (employee_id, attendance_date desc);
create index attendance_status_idx on public.attendance (attendance_date, status);

-- Every edit (automatic history) and every correction request.
create table public.attendance_corrections (
  id              uuid primary key default gen_random_uuid(),
  attendance_id   uuid references public.attendance (id) on delete set null,
  employee_id     uuid not null references public.employees (id) on delete cascade,
  attendance_date date not null,
  kind            public.correction_kind not null,
  status          public.correction_status not null,
  reason          text,
  before_data     jsonb,
  proposed_data   jsonb,
  after_data      jsonb,
  requested_by    uuid references auth.users (id) on delete set null,
  reviewed_by     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now(),
  constraint correction_request_reason check (kind <> 'request' or length(trim(coalesce(reason, ''))) >= 3)
);
create index attendance_corrections_att_idx on public.attendance_corrections (attendance_id, created_at desc);
create index attendance_corrections_pending_idx on public.attendance_corrections (status) where status = 'pending';
create index attendance_corrections_emp_idx on public.attendance_corrections (employee_id, attendance_date desc);

-- ---------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------
create table public.leave_types (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) between 1 and 60),
  code            text not null check (code ~ '^[A-Z]{1,6}$'),
  days_per_year   numeric(5,1) not null default 0 check (days_per_year between 0 and 366),
  is_paid         boolean not null default true,
  allow_half_day  boolean not null default true,
  carry_forward   boolean not null default false,
  max_carry_days  numeric(5,1) not null default 0 check (max_carry_days >= 0),
  color           text not null default '#2a86c2' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index leave_types_code_uq on public.leave_types (code);
create unique index leave_types_name_uq on public.leave_types (lower(name));
create trigger trg_leave_types_touch before update on public.leave_types
  for each row execute function public.touch_updated_at();

create table public.leave_balances (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id) on delete cascade,
  leave_type_id  uuid not null references public.leave_types (id) on delete cascade,
  year           integer not null check (year between 2000 and 2200),
  allocated      numeric(5,1) not null check (allocated >= 0),
  carried        numeric(5,1) not null default 0 check (carried >= 0),
  notes          text,
  updated_at     timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);
create trigger trg_leave_balances_touch before update on public.leave_balances
  for each row execute function public.touch_updated_at();

create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id) on delete cascade,
  leave_type_id  uuid not null references public.leave_types (id) on delete restrict,
  start_date     date not null,
  end_date       date not null,
  is_half_day    boolean not null default false,
  days           numeric(5,1) not null default 0 check (days >= 0),
  reason         text check (reason is null or length(reason) <= 1000),
  status         public.leave_status not null default 'pending',
  applied_by     uuid references auth.users (id) on delete set null,
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint leave_dates_order check (end_date >= start_date),
  constraint leave_half_day_single check (not is_half_day or start_date = end_date)
);
create index leave_requests_emp_idx on public.leave_requests (employee_id, start_date desc);
create index leave_requests_status_idx on public.leave_requests (status);
create index leave_requests_range_idx on public.leave_requests (start_date, end_date);
create trigger trg_leave_requests_touch before update on public.leave_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------
create table public.payroll_records (
  id                 uuid primary key default gen_random_uuid(),
  period_year        integer not null check (period_year between 2000 and 2200),
  period_month       integer not null check (period_month between 1 and 12),
  status             public.payroll_status not null default 'draft',
  basis_days         numeric(5,2) not null,
  working_days       integer not null,
  settings_snapshot  jsonb not null,
  total_gross        numeric(14,2) not null default 0,
  total_deductions   numeric(14,2) not null default 0,
  total_net          numeric(14,2) not null default 0,
  employee_count     integer not null default 0,
  notes              text,
  generated_by       uuid references auth.users (id) on delete set null,
  generated_at       timestamptz not null default now(),
  finalized_by       uuid references auth.users (id) on delete set null,
  finalized_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (period_year, period_month)
);
create trigger trg_payroll_records_touch before update on public.payroll_records
  for each row execute function public.touch_updated_at();

create table public.payroll_items (
  id                      uuid primary key default gen_random_uuid(),
  payroll_id              uuid not null references public.payroll_records (id) on delete cascade,
  employee_id             uuid not null references public.employees (id) on delete restrict,
  -- Snapshot of source values at generation time
  employee_code           text not null,
  employee_name           text not null,
  department_name         text,
  designation_name        text,
  basic_salary            numeric(12,2) not null default 0,
  allowances              numeric(12,2) not null default 0,
  per_day_rate            numeric(12,4) not null default 0,
  working_days            integer not null default 0,
  present_days            numeric(5,1) not null default 0,
  late_days               integer not null default 0,
  half_days               integer not null default 0,
  absent_days             integer not null default 0,
  paid_leave_days         numeric(5,1) not null default 0,
  unpaid_leave_days       numeric(5,1) not null default 0,
  overtime_minutes        integer not null default 0,
  -- Calculated amounts
  overtime_amount         numeric(12,2) not null default 0,
  absent_deduction        numeric(12,2) not null default 0,
  unpaid_leave_deduction  numeric(12,2) not null default 0,
  half_day_deduction      numeric(12,2) not null default 0,
  late_deduction          numeric(12,2) not null default 0,
  -- Manual (editable while draft)
  bonus                   numeric(12,2) not null default 0 check (bonus >= 0),
  other_earnings          numeric(12,2) not null default 0 check (other_earnings >= 0),
  other_deduction         numeric(12,2) not null default 0 check (other_deduction >= 0),
  adjustment_note         text,
  -- Totals (maintained by trigger)
  gross_earnings          numeric(12,2) not null default 0,
  total_deductions        numeric(12,2) not null default 0,
  net_salary              numeric(12,2) not null default 0,
  calculation             jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (payroll_id, employee_id)
);
create index payroll_items_emp_idx on public.payroll_items (employee_id);
create trigger trg_payroll_items_touch before update on public.payroll_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  actor_name   text,
  action       text not null,
  entity       text not null,
  entity_id    text,
  summary      text,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- >>> 20261111000002_business_logic.sql
-- =====================================================================
-- ALL SHEBA HRMS — Business logic (functions, triggers, RPCs)
-- The database is the source of truth for every calculation so that the
-- Admin panel, Entry panel, reports and payroll always agree.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so RLS policies can call them cheaply)
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and is_active), false)
$$;

create or replace function public.is_entry()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'entry' from public.profiles where id = auth.uid() and is_active), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

-- Trusted server-side jobs (Vercel cron / provisioning with the service-role key).
-- Uses the JWT claim because current_user is the owner inside SECURITY DEFINER code.
create or replace function public.is_service()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- ---------------------------------------------------------------------
-- Calendar helpers
-- ---------------------------------------------------------------------
create or replace function public.local_now()
returns timestamp language sql stable security definer set search_path = public as $$
  select now() at time zone coalesce((select timezone from public.company_settings where id = 1), 'Asia/Dhaka')
$$;

create or replace function public.local_today()
returns date language sql stable as $$
  select public.local_now()::date
$$;

create or replace function public.is_weekly_off(p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select extract(dow from p_date)::smallint = any (
    coalesce((select weekly_off_days from public.company_settings where id = 1), '{}'::smallint[])
  )
$$;

create or replace function public.is_holiday(p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.holidays where holiday_date = p_date)
$$;

create or replace function public.is_working_day(p_date date)
returns boolean language sql stable as $$
  select not public.is_weekly_off(p_date) and not public.is_holiday(p_date)
$$;

create or replace function public.count_working_days(p_start date, p_end date)
returns integer language sql stable as $$
  select count(*)::int
  from generate_series(p_start, p_end, interval '1 day') g(d)
  where public.is_working_day(g.d::date)
$$;

-- ---------------------------------------------------------------------
-- Profiles: self-service helpers
-- ---------------------------------------------------------------------
create or replace function public.mark_password_changed()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;

create or replace function public.record_login()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_login_at = now() where id = auth.uid()
$$;

-- Users may not change their own role / active flag even if RLS let them update.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_service() then
    return new;
  end if;
  if not public.is_admin() then
    raise exception 'Only administrators can change user accounts.';
  end if;
  if old.id = auth.uid() and (new.role <> old.role or new.is_active is distinct from old.is_active) then
    raise exception 'You cannot change your own role or deactivate your own account.';
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on public.profiles
  for each row
  when (old.role is distinct from new.role or old.is_active is distinct from new.is_active
        or old.username is distinct from new.username)
  execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- Audit logging
-- ---------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_diff jsonb;
  v_id text := coalesce(v_row ->> 'id', v_row ->> 'employee_id');
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('from', v_old -> key, 'to', value))
      into v_diff
      from jsonb_each(v_new)
     where key not in ('updated_at', 'updated_by')
       and (v_old -> key) is distinct from value;
    if v_diff is null then
      return new;
    end if;
  end if;

  insert into public.audit_logs (actor_id, actor_name, action, entity, entity_id, details)
  values (
    auth.uid(),
    coalesce((select username from public.profiles where id = auth.uid()),
             case when public.is_service() then 'system' end),
    lower(tg_op),
    tg_table_name,
    v_id,
    case tg_op when 'UPDATE' then jsonb_build_object('changes', v_diff)
               when 'INSERT' then jsonb_build_object('new', v_new)
               else jsonb_build_object('old', v_old) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'departments', 'designations', 'shifts', 'holidays', 'company_settings',
    'employees', 'employee_personal', 'employee_documents', 'salary_structures',
    'attendance', 'leave_types', 'leave_balances', 'leave_requests',
    'payroll_records', 'payroll_items'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on public.%1$I
         for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Explicit events (login, exports, prints) logged by the application.
create or replace function public.log_event(
  p_action text, p_entity text, p_entity_id text default null,
  p_summary text default null, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorised.';
  end if;
  insert into public.audit_logs (actor_id, actor_name, action, entity, entity_id, summary, details)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()),
          left(p_action, 60), left(p_entity, 60), left(p_entity_id, 120), left(p_summary, 500), p_details);
end $$;

-- ---------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------
create or replace function public.employees_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.company_settings;
  v_active int;
  v_code text;
begin
  select * into s from public.company_settings where id = 1;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if new.employee_code is null or trim(new.employee_code) = '' then
      loop
        v_code := s.employee_code_prefix || '-' || lpad(nextval('public.employee_code_seq')::text, 4, '0');
        exit when not exists (select 1 from public.employees where employee_code = v_code);
      end loop;
      new.employee_code := v_code;
    end if;
  else
    new.updated_by := auth.uid();
    if new.employee_code <> old.employee_code then
      raise exception 'Employee ID cannot be changed.';
    end if;
  end if;

  -- Capacity limit applies to non-archived employees (configurable in Settings).
  if new.archived_at is null and (tg_op = 'INSERT' or old.archived_at is not null) then
    select count(*) into v_active from public.employees where archived_at is null;
    if v_active >= s.max_employees then
      raise exception 'Employee limit reached (% employees). Increase "Maximum employees" in Company Settings.', s.max_employees;
    end if;
  end if;
  return new;
end $$;
create trigger trg_employees_before_write before insert or update on public.employees
  for each row execute function public.employees_before_write();

create or replace function public.employees_track_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.designation_id is distinct from old.designation_id then
    insert into public.employee_events (employee_id, event_type, old_value, new_value, actor_id)
    values (new.id, 'designation',
            (select name from public.designations where id = old.designation_id),
            (select name from public.designations where id = new.designation_id), auth.uid());
  end if;
  if new.department_id is distinct from old.department_id then
    insert into public.employee_events (employee_id, event_type, old_value, new_value, actor_id)
    values (new.id, 'department',
            (select name from public.departments where id = old.department_id),
            (select name from public.departments where id = new.department_id), auth.uid());
  end if;
  if new.status is distinct from old.status then
    insert into public.employee_events (employee_id, event_type, old_value, new_value, actor_id)
    values (new.id, 'status', old.status::text, new.status::text, auth.uid());
  end if;
  if new.joining_date is distinct from old.joining_date then
    insert into public.employee_events (employee_id, event_type, old_value, new_value, actor_id)
    values (new.id, 'joining_date', old.joining_date::text, new.joining_date::text, auth.uid());
  end if;
  if new.employment_type is distinct from old.employment_type then
    insert into public.employee_events (employee_id, event_type, old_value, new_value, actor_id)
    values (new.id, 'employment_type', old.employment_type::text, new.employment_type::text, auth.uid());
  end if;
  if new.archived_at is distinct from old.archived_at then
    insert into public.employee_events (employee_id, event_type, old_value, new_value, actor_id)
    values (new.id, case when new.archived_at is null then 'restored' else 'archived' end,
            null, new.archived_reason, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_employees_events after update on public.employees
  for each row execute function public.employees_track_events();

create or replace function public.salary_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  insert into public.employee_events (employee_id, event_type, old_value, new_value, actor_id)
  values (new.employee_id, 'salary',
          (select (basic_salary + allowances)::text from public.salary_structures
            where employee_id = new.employee_id order by effective_from desc limit 1),
          (new.basic_salary + new.allowances)::text, auth.uid());
  return new;
end $$;
create trigger trg_salary_before_insert before insert on public.salary_structures
  for each row execute function public.salary_before_insert();

-- ---------------------------------------------------------------------
-- Attendance calculation (authoritative)
-- ---------------------------------------------------------------------
create or replace function public.minutes_between(p_from time, p_to time)
returns integer language sql immutable as $$
  select (extract(epoch from (p_to - p_from)) / 60)::int
$$;

create or replace function public.attendance_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s     public.company_settings;
  emp   public.employees;
  sh    public.shifts;
  v_delay int;
  v_admin boolean := public.is_admin() or public.is_service();
begin
  select * into s from public.company_settings where id = 1;
  select * into emp from public.employees where id = new.employee_id;
  if emp.id is null then
    raise exception 'Employee not found.';
  end if;

  if tg_op = 'INSERT' and emp.archived_at is not null then
    raise exception 'Attendance cannot be recorded for an archived employee.';
  end if;
  if new.attendance_date > public.local_today() then
    raise exception 'Attendance cannot be recorded for a future date.';
  end if;
  if new.attendance_date < emp.joining_date then
    raise exception 'Attendance date is before the employee''s joining date (%).', emp.joining_date;
  end if;

  -- Schedule: taken from the employee's shift (or the default shift) when not supplied.
  if new.shift_id is null then
    new.shift_id := coalesce(emp.shift_id, (select id from public.shifts where is_default limit 1));
  end if;
  select * into sh from public.shifts where id = new.shift_id;
  if tg_op = 'INSERT' then
    new.scheduled_in  := coalesce(new.scheduled_in, sh.start_time);
    new.scheduled_out := coalesce(new.scheduled_out, sh.end_time);
    new.grace_minutes := coalesce(sh.grace_minutes, 0);
    new.entered_by    := coalesce(new.entered_by, auth.uid());
    if not v_admin then
      new.source := 'entry';
      new.is_locked := false;
    end if;
  else
    new.updated_by := auth.uid();
    if not v_admin then
      -- Entry operators cannot alter provenance fields.
      new.source     := old.source;
      new.is_locked  := old.is_locked;
      new.entered_by := old.entered_by;
      new.employee_id := old.employee_id;
      new.attendance_date := old.attendance_date;
    end if;
  end if;
  if new.scheduled_in is null or new.scheduled_out is null then
    raise exception 'No shift is configured. Create a default shift in Holiday & Shift Management.';
  end if;

  -- Non-working statuses carry no clock times.
  if new.status in ('absent', 'leave', 'holiday', 'weekly_off') then
    new.actual_in := null;
    new.actual_out := null;
    new.late_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
    new.work_minutes := 0;
    new.late_reason := null;
    new.late_reason_note := null;
    return new;
  end if;

  if new.actual_in is null then
    raise exception 'Actual in-time is required for status "%".', new.status;
  end if;

  v_delay := public.minutes_between(new.scheduled_in, new.actual_in);
  new.late_minutes := case when v_delay > new.grace_minutes then v_delay else 0 end;

  if new.status = 'present' and new.late_minutes > 0 then
    new.status := 'late';
  elsif new.status = 'late' and new.late_minutes = 0 then
    new.status := 'present';
  end if;

  if new.actual_out is not null then
    new.work_minutes := greatest(public.minutes_between(new.actual_in, new.actual_out), 0);
    new.early_leave_minutes := greatest(public.minutes_between(new.actual_out, new.scheduled_out), 0);
    new.overtime_minutes := greatest(public.minutes_between(new.scheduled_out, new.actual_out), 0);
  else
    new.work_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
  end if;

  if new.late_minutes > 0 then
    if new.late_reason is null and s.late_reason_required then
      raise exception 'Late reason is required: the employee arrived % minutes late.', new.late_minutes;
    end if;
    if new.late_reason = 'other' and s.late_note_required_for_other
       and length(trim(coalesce(new.late_reason_note, ''))) < 3 then
      raise exception 'Please describe the late reason when "Other" is selected.';
    end if;
  else
    new.late_reason := null;
    new.late_reason_note := null;
  end if;
  return new;
end $$;
create trigger trg_attendance_before_write before insert or update on public.attendance
  for each row execute function public.attendance_before_write();

-- Automatic, complete correction history of every attendance edit.
create or replace function public.attendance_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fields text[] := array['status', 'actual_in', 'actual_out', 'scheduled_in', 'scheduled_out',
                           'late_minutes', 'late_reason', 'late_reason_note', 'notes',
                           'early_leave_minutes', 'work_minutes'];
  v_before jsonb := '{}'; v_after jsonb := '{}';
  f text;
begin
  foreach f in array v_fields loop
    if (to_jsonb(old) -> f) is distinct from (to_jsonb(new) -> f) then
      v_before := v_before || jsonb_build_object(f, to_jsonb(old) -> f);
      v_after  := v_after  || jsonb_build_object(f, to_jsonb(new) -> f);
    end if;
  end loop;
  if v_after = '{}'::jsonb then
    return new;
  end if;
  insert into public.attendance_corrections
    (attendance_id, employee_id, attendance_date, kind, status, reason,
     before_data, after_data, requested_by, reviewed_by, reviewed_at)
  values
    (new.id, new.employee_id, new.attendance_date, 'edit', 'applied',
     coalesce(new.last_change_reason, 'Edited'), v_before, v_after, auth.uid(), auth.uid(), now());
  return new;
end $$;
create trigger trg_attendance_history after update on public.attendance
  for each row execute function public.attendance_history();

-- Entry operators submit correction requests; admins review them here.
create or replace function public.correction_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.attendance;
begin
  if new.kind = 'request' then
    if public.is_admin() is false and public.is_entry() is false then
      raise exception 'Not authorised.';
    end if;
    select * into a from public.attendance where id = new.attendance_id;
    if a.id is null then
      raise exception 'Attendance record not found.';
    end if;
    if exists (select 1 from public.attendance_corrections
                where attendance_id = new.attendance_id and kind = 'request' and status = 'pending') then
      raise exception 'A correction request for this record is already pending.';
    end if;
    new.employee_id := a.employee_id;
    new.attendance_date := a.attendance_date;
    new.status := 'pending';
    new.requested_by := auth.uid();
    new.before_data := jsonb_build_object(
      'status', a.status, 'actual_in', a.actual_in, 'actual_out', a.actual_out,
      'late_reason', a.late_reason, 'late_reason_note', a.late_reason_note, 'notes', a.notes);
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end $$;
create trigger trg_correction_before_insert before insert on public.attendance_corrections
  for each row execute function public.correction_before_insert();

create or replace function public.review_correction(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.attendance_corrections;
  p jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can review correction requests.';
  end if;
  select * into c from public.attendance_corrections where id = p_id for update;
  if c.id is null or c.kind <> 'request' then
    raise exception 'Correction request not found.';
  end if;
  if c.status <> 'pending' then
    raise exception 'This request has already been reviewed.';
  end if;

  if p_approve then
    p := c.proposed_data;
    update public.attendance set
      status           = coalesce((p ->> 'status')::public.attendance_status, status),
      actual_in        = case when p ? 'actual_in' then (p ->> 'actual_in')::time else actual_in end,
      actual_out       = case when p ? 'actual_out' then (p ->> 'actual_out')::time else actual_out end,
      late_reason      = case when p ? 'late_reason' then (p ->> 'late_reason')::public.late_reason else late_reason end,
      late_reason_note = case when p ? 'late_reason_note' then p ->> 'late_reason_note' else late_reason_note end,
      notes            = case when p ? 'notes' then p ->> 'notes' else notes end,
      source           = 'correction',
      is_locked        = true,
      last_change_reason = 'Correction request approved: ' || c.reason
    where id = c.attendance_id;
  end if;

  update public.attendance_corrections set
    status = case when p_approve then 'approved'::public.correction_status else 'rejected'::public.correction_status end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_note,
    after_data = case when p_approve then
      (select jsonb_build_object('status', a.status, 'actual_in', a.actual_in, 'actual_out', a.actual_out,
              'late_reason', a.late_reason, 'late_reason_note', a.late_reason_note, 'notes', a.notes)
         from public.attendance a where a.id = c.attendance_id) end
  where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Attendance closing: fills in missing days for every eligible employee.
-- Nobody is marked absent merely because no entry exists yet — only when
-- this process runs for a completed day.
-- ---------------------------------------------------------------------
create or replace function public.close_attendance(p_date date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_end time;
  v_count int := 0;
  r record;
  v_status public.attendance_status;
  v_is_holiday boolean := public.is_holiday(p_date);
  v_is_off boolean := public.is_weekly_off(p_date);
begin
  if not (public.is_admin() or public.is_service()) then
    raise exception 'Only administrators can close attendance.';
  end if;
  if p_date > public.local_today() then
    raise exception 'Cannot close a future date.';
  end if;
  if p_date = public.local_today() then
    select end_time into v_end from public.shifts where is_default limit 1;
    if v_end is not null and public.local_now()::time < v_end then
      raise exception 'Today can only be closed after office hours end (%).', to_char(v_end, 'HH12:MI AM');
    end if;
  end if;

  for r in
    select e.id
      from public.employees e
     where e.archived_at is null
       and e.status in ('active', 'on_notice')
       and e.joining_date <= p_date
       and not exists (select 1 from public.attendance a
                        where a.employee_id = e.id and a.attendance_date = p_date)
  loop
    v_status := case
      when v_is_holiday then 'holiday'
      when v_is_off then 'weekly_off'
      when exists (select 1 from public.leave_requests l
                    where l.employee_id = r.id and l.status = 'approved'
                      and p_date between l.start_date and l.end_date) then 'leave'
      else 'absent'
    end;
    insert into public.attendance (employee_id, attendance_date, status, source, is_locked, notes)
    values (r.id, p_date, v_status, 'closing', false, 'Generated by attendance closing');
    v_count := v_count + 1;
  end loop;

  if not public.is_service() then
    perform public.log_event('close', 'attendance', p_date::text,
      format('Closed attendance for %s (%s records generated)', p_date, v_count), null);
  end if;
  return v_count;
end $$;

create or replace function public.close_attendance_range(p_from date, p_to date)
returns integer language plpgsql security definer set search_path = public as $$
declare d date; v_total int := 0;
begin
  if p_to < p_from then raise exception 'Invalid date range.'; end if;
  if p_to - p_from > 92 then raise exception 'Close at most 93 days at a time.'; end if;
  d := p_from;
  while d <= p_to loop
    v_total := v_total + public.close_attendance(d);
    d := d + 1;
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------
create or replace function public.leave_used(p_employee uuid, p_type uuid, p_year int, p_status public.leave_status)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(days), 0) from public.leave_requests
   where employee_id = p_employee and leave_type_id = p_type and status = p_status
     and extract(year from start_date)::int = p_year
$$;

create or replace function public.leave_allocated(p_employee uuid, p_type uuid, p_year int)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select allocated + carried from public.leave_balances
      where employee_id = p_employee and leave_type_id = p_type and year = p_year),
    (select days_per_year from public.leave_types where id = p_type), 0)
$$;

create or replace function public.leave_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare lt public.leave_types;
begin
  select * into lt from public.leave_types where id = new.leave_type_id;
  if lt.id is null then raise exception 'Leave type not found.'; end if;

  if tg_op = 'INSERT' then
    new.applied_by := coalesce(new.applied_by, auth.uid());
    if not public.is_admin() then
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;

  if extract(year from new.start_date) <> extract(year from new.end_date) then
    raise exception 'A leave request cannot span two calendar years. Please split it.';
  end if;
  if new.is_half_day and not lt.allow_half_day then
    raise exception '% does not allow half-day leave.', lt.name;
  end if;

  new.days := case when new.is_half_day then 0.5
                   else public.count_working_days(new.start_date, new.end_date) end;
  if new.days = 0 then
    raise exception 'The selected dates contain no working days.';
  end if;

  if new.status in ('pending', 'approved') and exists (
    select 1 from public.leave_requests o
     where o.employee_id = new.employee_id and o.id <> new.id
       and o.status in ('pending', 'approved')
       and daterange(o.start_date, o.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')) then
    raise exception 'This employee already has a leave request overlapping these dates.';
  end if;
  return new;
end $$;
create trigger trg_leave_before_write before insert or update on public.leave_requests
  for each row execute function public.leave_before_write();

create or replace function public.review_leave(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l  public.leave_requests;
  lt public.leave_types;
  v_remaining numeric;
  v_year int;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can approve or reject leave.';
  end if;
  select * into l from public.leave_requests where id = p_id for update;
  if l.id is null then raise exception 'Leave request not found.'; end if;
  if l.status <> 'pending' then raise exception 'This request has already been reviewed.'; end if;
  select * into lt from public.leave_types where id = l.leave_type_id;

  if p_approve and lt.is_paid then
    v_year := extract(year from l.start_date)::int;
    v_remaining := public.leave_allocated(l.employee_id, l.leave_type_id, v_year)
                 - public.leave_used(l.employee_id, l.leave_type_id, v_year, 'approved');
    if l.days > v_remaining then
      raise exception 'Insufficient % balance: % day(s) remaining, % requested.', lt.name, v_remaining, l.days;
    end if;
  end if;

  update public.leave_requests set
    status = case when p_approve then 'approved'::public.leave_status else 'rejected'::public.leave_status end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  where id = p_id;

  -- Days already closed as "absent" become "leave" once leave is approved.
  if p_approve and not l.is_half_day then
    update public.attendance set
      status = 'leave', source = 'admin', is_locked = true,
      last_change_reason = 'Leave approved (' || lt.name || ')'
    where employee_id = l.employee_id
      and attendance_date between l.start_date and l.end_date
      and status = 'absent';
  end if;
end $$;

create or replace function public.cancel_leave(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.leave_requests;
begin
  select * into l from public.leave_requests where id = p_id for update;
  if l.id is null then raise exception 'Leave request not found.'; end if;
  if not (public.is_admin() or (public.is_entry() and l.applied_by = auth.uid() and l.status = 'pending')) then
    raise exception 'You cannot cancel this leave request.';
  end if;
  if l.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved requests can be cancelled.';
  end if;
  update public.leave_requests set status = 'cancelled', review_note = coalesce(p_note, review_note),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
end $$;

create or replace function public.leave_balance_report(p_year int)
returns table (
  employee_id uuid, leave_type_id uuid, allocated numeric, used numeric, pending numeric, remaining numeric
) language sql stable security definer set search_path = public as $$
  select e.id, t.id,
         public.leave_allocated(e.id, t.id, p_year),
         public.leave_used(e.id, t.id, p_year, 'approved'),
         public.leave_used(e.id, t.id, p_year, 'pending'),
         public.leave_allocated(e.id, t.id, p_year) - public.leave_used(e.id, t.id, p_year, 'approved')
    from public.employees e
    cross join public.leave_types t
   where public.is_staff() and e.archived_at is null and t.is_active
$$;

-- ---------------------------------------------------------------------
-- Payroll
-- Formula (documented in docs/PAYROLL.md):
--   gross        = basic + allowances + bonus + other_earnings + overtime_amount
--   per_day_rate = (basic + allowances) / basis_days
--   deductions   = absent + unpaid_leave + half_day + late + other_deduction
--                  (each automatic deduction applies only when enabled in Settings)
--   net          = max(gross − deductions, 0)
-- ---------------------------------------------------------------------
create or replace function public.payroll_items_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status public.payroll_status;
begin
  select status into v_status from public.payroll_records
   where id = coalesce(new.payroll_id, old.payroll_id);
  if v_status = 'finalized' then
    raise exception 'This payroll is finalized and can no longer be changed.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.gross_earnings := round(new.basic_salary + new.allowances + new.bonus + new.other_earnings + new.overtime_amount, 2);
  new.total_deductions := round(new.absent_deduction + new.unpaid_leave_deduction + new.half_day_deduction
                               + new.late_deduction + new.other_deduction, 2);
  new.net_salary := greatest(new.gross_earnings - new.total_deductions, 0);
  return new;
end $$;
create trigger trg_payroll_items_before_write before insert or update or delete on public.payroll_items
  for each row execute function public.payroll_items_before_write();

create or replace function public.payroll_refresh_totals(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.payroll_records r set
    total_gross = coalesce(t.gross, 0), total_deductions = coalesce(t.ded, 0),
    total_net = coalesce(t.net, 0), employee_count = coalesce(t.n, 0)
  from (select sum(gross_earnings) gross, sum(total_deductions) ded, sum(net_salary) net, count(*) n
          from public.payroll_items where payroll_id = p_id) t
  where r.id = p_id and r.status = 'draft'
$$;

create or replace function public.payroll_items_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.payroll_refresh_totals(coalesce(new.payroll_id, old.payroll_id));
  return null;
end $$;
create trigger trg_payroll_items_after_write after insert or update or delete on public.payroll_items
  for each row execute function public.payroll_items_after_write();

create or replace function public.payroll_records_guard()
returns trigger language plpgsql as $$
begin
  if old.status = 'finalized' then
    raise exception 'This payroll is finalized and can no longer be changed.';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_payroll_records_guard before update or delete on public.payroll_records
  for each row execute function public.payroll_records_guard();

create or replace function public.generate_payroll(p_year int, p_month int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s        public.company_settings;
  v_start  date := make_date(p_year, p_month, 1);
  v_end    date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_id     uuid;
  v_status public.payroll_status;
  v_basis  numeric;
  v_working int;
  r        record;
  sal      public.salary_structures;
  att      record;
  lv       record;
  v_shift_minutes int;
  v_per_day numeric;
  v_ot_min int;
  v_ids    uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Only administrators can generate payroll.';
  end if;
  if v_start > public.local_today() then
    raise exception 'Cannot generate payroll for a future month.';
  end if;
  select * into s from public.company_settings where id = 1;

  select id, status into v_id, v_status from public.payroll_records
   where period_year = p_year and period_month = p_month for update;
  if v_status = 'finalized' then
    raise exception 'Payroll for this month is already finalized.';
  end if;

  v_working := public.count_working_days(v_start, v_end);
  v_basis := case s.payroll_day_basis
               when 'fixed_30' then 30
               when 'calendar' then extract(day from v_end)
               else greatest(v_working, 1) end;

  if v_id is null then
    insert into public.payroll_records (period_year, period_month, basis_days, working_days,
                                        settings_snapshot, generated_by)
    values (p_year, p_month, v_basis, v_working, to_jsonb(s), auth.uid())
    returning id into v_id;
  else
    update public.payroll_records set basis_days = v_basis, working_days = v_working,
           settings_snapshot = to_jsonb(s), generated_by = auth.uid(), generated_at = now()
     where id = v_id;
  end if;

  for r in
    select e.*, d.name as dept_name, g.name as desig_name,
           coalesce(sh.start_time, ds.start_time) as s_start, coalesce(sh.end_time, ds.end_time) as s_end
      from public.employees e
      left join public.departments d on d.id = e.department_id
      left join public.designations g on g.id = e.designation_id
      left join public.shifts sh on sh.id = e.shift_id
      left join public.shifts ds on ds.is_default
     where e.joining_date <= v_end
       and (e.archived_at is null or e.archived_at::date >= v_start)
  loop
    select * into sal from public.salary_structures
     where employee_id = r.id and effective_from <= v_end
     order by effective_from desc limit 1;
    continue when sal.id is null;   -- no salary configured: not included

    select
      count(*) filter (where status in ('present', 'late'))  as present_days,
      count(*) filter (where status = 'late')                 as late_days,
      count(*) filter (where status = 'half_day')             as half_days,
      count(*) filter (where status = 'absent')               as absent_days,
      coalesce(sum(overtime_minutes) filter (where overtime_minutes >= s.overtime_min_minutes), 0) as ot
    into att
    from public.attendance
    where employee_id = r.id and attendance_date between v_start and v_end;

    select
      coalesce(sum(case when l.is_half_day then 0.5 else 1 end) filter (where t.is_paid), 0)     as paid,
      coalesce(sum(case when l.is_half_day then 0.5 else 1 end) filter (where not t.is_paid), 0) as unpaid
    into lv
    from public.leave_requests l
    join public.leave_types t on t.id = l.leave_type_id
    cross join lateral generate_series(greatest(l.start_date, v_start), least(l.end_date, v_end), interval '1 day') g(d)
    where l.employee_id = r.id and l.status = 'approved'
      and l.start_date <= v_end and l.end_date >= v_start
      and public.is_working_day(g.d::date);

    v_per_day := round((sal.basic_salary + sal.allowances) / v_basis, 4);
    v_shift_minutes := greatest(coalesce(public.minutes_between(r.s_start, r.s_end), 480), 60);
    v_ot_min := case when s.overtime_enabled then att.ot else 0 end;

    insert into public.payroll_items as pi (
      payroll_id, employee_id, employee_code, employee_name, department_name, designation_name,
      basic_salary, allowances, per_day_rate, working_days,
      present_days, late_days, half_days, absent_days, paid_leave_days, unpaid_leave_days, overtime_minutes,
      overtime_amount, absent_deduction, unpaid_leave_deduction, half_day_deduction, late_deduction, calculation)
    values (
      v_id, r.id, r.employee_code, r.full_name, r.dept_name, r.desig_name,
      sal.basic_salary, sal.allowances, v_per_day, v_working,
      att.present_days + att.half_days * 0.5, att.late_days, att.half_days, att.absent_days,
      lv.paid, lv.unpaid, v_ot_min,
      case when s.overtime_enabled
           then round(v_ot_min / 60.0 * (v_per_day / (v_shift_minutes / 60.0)) * s.overtime_rate_multiplier, 2)
           else 0 end,
      case when s.absent_deduction_enabled then round(att.absent_days * v_per_day, 2) else 0 end,
      case when s.unpaid_leave_deduction_enabled then round(lv.unpaid * v_per_day, 2) else 0 end,
      case when s.half_day_deduction_enabled then round(att.half_days * 0.5 * v_per_day, 2) else 0 end,
      case when s.late_deduction_enabled
           then round(floor(att.late_days::numeric / s.late_days_per_deduction) * v_per_day * s.late_deduction_day_fraction, 2)
           else 0 end,
      jsonb_build_object(
        'salary_structure_id', sal.id, 'salary_effective_from', sal.effective_from,
        'basis', s.payroll_day_basis, 'basis_days', v_basis, 'shift_minutes', v_shift_minutes,
        'rules', jsonb_build_object(
          'absent', s.absent_deduction_enabled, 'unpaid_leave', s.unpaid_leave_deduction_enabled,
          'half_day', s.half_day_deduction_enabled, 'late', s.late_deduction_enabled,
          'late_days_per_deduction', s.late_days_per_deduction,
          'late_deduction_day_fraction', s.late_deduction_day_fraction,
          'overtime', s.overtime_enabled, 'overtime_multiplier', s.overtime_rate_multiplier,
          'overtime_min_minutes', s.overtime_min_minutes))
    )
    on conflict (payroll_id, employee_id) do update set
      employee_code = excluded.employee_code, employee_name = excluded.employee_name,
      department_name = excluded.department_name, designation_name = excluded.designation_name,
      basic_salary = excluded.basic_salary, allowances = excluded.allowances,
      per_day_rate = excluded.per_day_rate, working_days = excluded.working_days,
      present_days = excluded.present_days, late_days = excluded.late_days,
      half_days = excluded.half_days, absent_days = excluded.absent_days,
      paid_leave_days = excluded.paid_leave_days, unpaid_leave_days = excluded.unpaid_leave_days,
      overtime_minutes = excluded.overtime_minutes, overtime_amount = excluded.overtime_amount,
      absent_deduction = excluded.absent_deduction, unpaid_leave_deduction = excluded.unpaid_leave_deduction,
      half_day_deduction = excluded.half_day_deduction, late_deduction = excluded.late_deduction,
      calculation = excluded.calculation;
      -- bonus / other_earnings / other_deduction / adjustment_note are preserved on regeneration

    v_ids := v_ids || r.id;
  end loop;

  delete from public.payroll_items where payroll_id = v_id and not (employee_id = any (v_ids));
  perform public.payroll_refresh_totals(v_id);
  return v_id;
end $$;

create or replace function public.finalize_payroll(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status public.payroll_status; v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can finalize payroll.';
  end if;
  select status into v_status from public.payroll_records where id = p_id for update;
  if v_status is null then raise exception 'Payroll not found.'; end if;
  if v_status = 'finalized' then raise exception 'Payroll is already finalized.'; end if;
  select count(*) into v_count from public.payroll_items where payroll_id = p_id;
  if v_count = 0 then raise exception 'Cannot finalize an empty payroll.'; end if;
  perform public.payroll_refresh_totals(p_id);
  update public.payroll_records
     set status = 'finalized', finalized_by = auth.uid(), finalized_at = now()
   where id = p_id;
end $$;

-- >>> 20261111000003_row_level_security.sql
-- =====================================================================
-- ALL SHEBA HRMS — Row Level Security
-- ADMIN  : full access (subject to business triggers).
-- ENTRY  : operational directory + attendance entry within policy,
--          correction requests, leave applications. No salary, payroll,
--          personal details, documents, users, settings writes or audit.
-- anon   : nothing.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'departments', 'designations', 'shifts', 'holidays', 'company_settings',
    'employees', 'employee_personal', 'employee_documents', 'salary_structures', 'employee_events',
    'attendance', 'attendance_corrections', 'leave_types', 'leave_balances', 'leave_requests',
    'payroll_records', 'payroll_items', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- profiles --------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- inserts/deletes are performed by the server with the service-role key only.

-- Reference data: staff read, admin write ------------------------------
do $$
declare t text;
begin
  foreach t in array array['departments', 'designations', 'shifts', 'holidays', 'leave_types'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- company_settings -----------------------------------------------------
create policy settings_select on public.company_settings for select to authenticated
  using (public.is_staff());
create policy settings_update on public.company_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- employees (operational directory) -------------------------------------
create policy employees_select on public.employees for select to authenticated
  using (public.is_staff());
create policy employees_insert on public.employees for insert to authenticated
  with check (public.is_admin());
create policy employees_update on public.employees for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- No delete policy: employees are archived, never deleted.

-- Admin-only employee data ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['employee_personal', 'employee_documents', 'salary_structures',
                           'leave_balances', 'payroll_records', 'payroll_items'] loop
    execute format('create policy %1$s_admin_all on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Entry operators may read leave balances (needed when applying for leave).
create policy leave_balances_entry_select on public.leave_balances for select to authenticated
  using (public.is_entry());

create policy employee_events_select on public.employee_events for select to authenticated
  using (public.is_admin());

-- attendance -------------------------------------------------------------
create policy attendance_select on public.attendance for select to authenticated
  using (public.is_staff());

create policy attendance_insert on public.attendance for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_entry()
        and attendance_date >= public.local_today()
             - (select entry_backdate_days from public.company_settings where id = 1))
  );

create policy attendance_update on public.attendance for update to authenticated
  using (
    public.is_admin()
    or (public.is_entry()
        and not is_locked
        and source = 'entry'
        and attendance_date >= public.local_today()
             - (select entry_edit_days from public.company_settings where id = 1))
  )
  with check (
    public.is_admin()
    or (public.is_entry()
        and attendance_date >= public.local_today()
             - (select entry_edit_days from public.company_settings where id = 1))
  );

create policy attendance_delete on public.attendance for delete to authenticated
  using (public.is_admin());

-- attendance_corrections ---------------------------------------------------
create policy corrections_select on public.attendance_corrections for select to authenticated
  using (public.is_admin() or (public.is_entry() and requested_by = auth.uid()));
create policy corrections_insert on public.attendance_corrections for insert to authenticated
  with check (kind = 'request' and public.is_staff());
-- Reviews go through review_correction(); history rows are written by triggers.

-- leave_requests -------------------------------------------------------------
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (public.is_staff());
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check (public.is_admin() or (public.is_entry() and status = 'pending'));
create policy leave_requests_update on public.leave_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy leave_requests_delete on public.leave_requests for delete to authenticated
  using (public.is_admin() and status in ('pending', 'rejected', 'cancelled'));

-- audit_logs: read-only for admins; writes only through triggers/log_event --
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Function execution privileges
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- >>> 20261111000004_storage.sql
-- =====================================================================
-- ALL SHEBA HRMS — Storage buckets & policies
--   public-assets      : company logo + employee photos (public read, admin write)
--   employee-documents : private HR documents (admin only, signed URLs)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-assets', 'public-assets', true, 5242880,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('employee-documents', 'employee-documents', false, 10485760,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy "public-assets admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-assets' and public.is_admin());
create policy "public-assets admin update" on storage.objects for update to authenticated
  using (bucket_id = 'public-assets' and public.is_admin());
create policy "public-assets admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'public-assets' and public.is_admin());

create policy "documents admin select" on storage.objects for select to authenticated
  using (bucket_id = 'employee-documents' and public.is_admin());
create policy "documents admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-documents' and public.is_admin());
create policy "documents admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-documents' and public.is_admin());

-- >>> 20261111000005_default_configuration.sql
-- =====================================================================
-- ALL SHEBA HRMS — Default configuration (idempotent)
-- Configuration only. No employees or sample/mock data are created.
-- Every value here is editable from the Admin panel.
-- =====================================================================

insert into public.company_settings (id) values (1) on conflict (id) do nothing;

insert into public.shifts (name, start_time, end_time, grace_minutes, is_default)
select 'General Shift', '10:00', '19:00', 0, true
where not exists (select 1 from public.shifts);

-- Common Bangladesh leave categories (Labour Act 2006). Adjust in Leave settings.
insert into public.leave_types (name, code, days_per_year, is_paid, allow_half_day, color)
select * from (values
  ('Casual Leave', 'CL', 10::numeric, true,  true,  '#2a86c2'),
  ('Sick Leave',   'SL', 14::numeric, true,  true,  '#0f9d76'),
  ('Annual Leave', 'AL', 0::numeric,  true,  false, '#30338a'),
  ('Unpaid Leave', 'UL', 0::numeric,  false, true,  '#9a6b00')
) v(name, code, days, paid, half, color)
where not exists (select 1 from public.leave_types);

-- Public branding for the sign-in page (name, tagline, logo only — nothing sensitive).
create or replace function public.public_branding()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('company_name', company_name, 'tagline', tagline, 'logo_path', logo_path)
    from public.company_settings where id = 1
$$;
revoke execute on function public.public_branding() from public;
grant execute on function public.public_branding() to anon, authenticated;

-- >>> 20261111000006_employee_rpc.sql
-- =====================================================================
-- ALL SHEBA HRMS — Atomic employee save (core + personal + initial salary)
-- SECURITY INVOKER: RLS and all triggers apply to the calling admin.
-- =====================================================================

create or replace function public.save_employee(p_id uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can manage employees.';
  end if;

  if p_id is null then
    insert into public.employees (full_name, phone, designation_id, department_id, shift_id,
                                  joining_date, employment_type, status, photo_path)
    values (p ->> 'full_name', nullif(p ->> 'phone', ''),
            nullif(p ->> 'designation_id', '')::uuid, nullif(p ->> 'department_id', '')::uuid,
            nullif(p ->> 'shift_id', '')::uuid, (p ->> 'joining_date')::date,
            (p ->> 'employment_type')::public.employment_type, (p ->> 'status')::public.employment_status,
            nullif(p ->> 'photo_path', ''))
    returning id into v_id;
  else
    update public.employees set
      full_name       = p ->> 'full_name',
      phone           = nullif(p ->> 'phone', ''),
      designation_id  = nullif(p ->> 'designation_id', '')::uuid,
      department_id   = nullif(p ->> 'department_id', '')::uuid,
      shift_id        = nullif(p ->> 'shift_id', '')::uuid,
      joining_date    = (p ->> 'joining_date')::date,
      employment_type = (p ->> 'employment_type')::public.employment_type,
      status          = (p ->> 'status')::public.employment_status,
      photo_path      = nullif(p ->> 'photo_path', '')
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Employee not found.';
    end if;
  end if;

  insert into public.employee_personal as ep (employee_id, email, address, date_of_birth, national_id,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation, notes)
  values (v_id, nullif(p ->> 'email', ''), nullif(p ->> 'address', ''), nullif(p ->> 'date_of_birth', '')::date,
          nullif(p ->> 'national_id', ''), nullif(p ->> 'emergency_contact_name', ''),
          nullif(p ->> 'emergency_contact_phone', ''), nullif(p ->> 'emergency_contact_relation', ''),
          nullif(p ->> 'notes', ''))
  on conflict (employee_id) do update set
    email = excluded.email, address = excluded.address, date_of_birth = excluded.date_of_birth,
    national_id = excluded.national_id, emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_relation = excluded.emergency_contact_relation, notes = excluded.notes;

  if p_id is null and coalesce(p ->> 'basic_salary', '') <> '' then
    insert into public.salary_structures (employee_id, effective_from, basic_salary, allowances, notes)
    values (v_id, (p ->> 'joining_date')::date, (p ->> 'basic_salary')::numeric,
            coalesce(nullif(p ->> 'allowances', '')::numeric, 0), 'Initial salary');
  end if;
  return v_id;
end $$;

revoke execute on function public.save_employee(uuid, jsonb) from public, anon;
grant execute on function public.save_employee(uuid, jsonb) to authenticated;

-- >>> 20261113000007_present_without_time.sql
-- =====================================================================
-- ALL SHEBA HRMS — "Present" without clock times (default-shift employees)
-- Adds a Company Settings switch (default ON) and updates the attendance
-- trigger. Actual times are never invented: they remain NULL.
-- =====================================================================

alter table public.company_settings
  add column if not exists present_without_time_default_shift boolean not null default true;

create or replace function public.attendance_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s     public.company_settings;
  emp   public.employees;
  sh    public.shifts;
  v_delay int;
  v_admin boolean := public.is_admin() or public.is_service();
begin
  select * into s from public.company_settings where id = 1;
  select * into emp from public.employees where id = new.employee_id;
  if emp.id is null then
    raise exception 'Employee not found.';
  end if;

  if tg_op = 'INSERT' and emp.archived_at is not null then
    raise exception 'Attendance cannot be recorded for an archived employee.';
  end if;
  if new.attendance_date > public.local_today() then
    raise exception 'Attendance cannot be recorded for a future date.';
  end if;
  if new.attendance_date < emp.joining_date then
    raise exception 'Attendance date is before the employee''s joining date (%).', emp.joining_date;
  end if;

  -- Schedule: taken from the employee's shift (or the default shift) when not supplied.
  if new.shift_id is null then
    new.shift_id := coalesce(emp.shift_id, (select id from public.shifts where is_default limit 1));
  end if;
  select * into sh from public.shifts where id = new.shift_id;
  if tg_op = 'INSERT' then
    new.scheduled_in  := coalesce(new.scheduled_in, sh.start_time);
    new.scheduled_out := coalesce(new.scheduled_out, sh.end_time);
    new.grace_minutes := coalesce(sh.grace_minutes, 0);
    new.entered_by    := coalesce(new.entered_by, auth.uid());
    if not v_admin then
      new.source := 'entry';
      new.is_locked := false;
    end if;
  else
    new.updated_by := auth.uid();
    if not v_admin then
      -- Entry operators cannot alter provenance fields.
      new.source     := old.source;
      new.is_locked  := old.is_locked;
      new.entered_by := old.entered_by;
      new.employee_id := old.employee_id;
      new.attendance_date := old.attendance_date;
    end if;
  end if;
  if new.scheduled_in is null or new.scheduled_out is null then
    raise exception 'No shift is configured. Create a default shift in Holiday & Shift Management.';
  end if;

  -- Non-working statuses carry no clock times.
  if new.status in ('absent', 'leave', 'holiday', 'weekly_off') then
    new.actual_in := null;
    new.actual_out := null;
    new.late_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
    new.work_minutes := 0;
    new.late_reason := null;
    new.late_reason_note := null;
    return new;
  end if;

  if new.actual_in is null then
    -- Policy: "Present" without clock times is allowed for employees on the
    -- default shift. Nothing is invented: actual times stay NULL, late = 0,
    -- worked minutes = 0. Late / Half Day always need the real in-time.
    if new.status = 'present'
       and s.present_without_time_default_shift
       and coalesce(sh.is_default, false) then
      new.actual_out := null;
      new.late_minutes := 0;
      new.early_leave_minutes := 0;
      new.overtime_minutes := 0;
      new.work_minutes := 0;
      new.late_reason := null;
      new.late_reason_note := null;
      return new;
    end if;
    raise exception 'Actual in-time is required for status "%".', new.status;
  end if;

  v_delay := public.minutes_between(new.scheduled_in, new.actual_in);
  new.late_minutes := case when v_delay > new.grace_minutes then v_delay else 0 end;

  if new.status = 'present' and new.late_minutes > 0 then
    new.status := 'late';
  elsif new.status = 'late' and new.late_minutes = 0 then
    new.status := 'present';
  end if;

  if new.actual_out is not null then
    new.work_minutes := greatest(public.minutes_between(new.actual_in, new.actual_out), 0);
    new.early_leave_minutes := greatest(public.minutes_between(new.actual_out, new.scheduled_out), 0);
    new.overtime_minutes := greatest(public.minutes_between(new.scheduled_out, new.actual_out), 0);
  else
    new.work_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
  end if;

  if new.late_minutes > 0 then
    if new.late_reason is null and s.late_reason_required then
      raise exception 'Late reason is required: the employee arrived % minutes late.', new.late_minutes;
    end if;
    if new.late_reason = 'other' and s.late_note_required_for_other
       and length(trim(coalesce(new.late_reason_note, ''))) < 3 then
      raise exception 'Please describe the late reason when "Other" is selected.';
    end if;
  else
    new.late_reason := null;
    new.late_reason_note := null;
  end if;
  return new;
end $$;

-- >>> 20261113000008_present_without_time_unassigned_shift.sql
-- =====================================================================
-- ALL SHEBA HRMS — limit "Present without time" to employees with NO shift set
-- Supersedes the condition in 0007. Safe to run whether or not 0007 was run.
-- =====================================================================

alter table public.company_settings
  add column if not exists present_without_time_default_shift boolean not null default true;

comment on column public.company_settings.present_without_time_default_shift is
  'Allow status Present without clock times for employees whose shift is not set (Default shift).';

create or replace function public.attendance_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s     public.company_settings;
  emp   public.employees;
  sh    public.shifts;
  v_delay int;
  v_admin boolean := public.is_admin() or public.is_service();
begin
  select * into s from public.company_settings where id = 1;
  select * into emp from public.employees where id = new.employee_id;
  if emp.id is null then
    raise exception 'Employee not found.';
  end if;

  if tg_op = 'INSERT' and emp.archived_at is not null then
    raise exception 'Attendance cannot be recorded for an archived employee.';
  end if;
  if new.attendance_date > public.local_today() then
    raise exception 'Attendance cannot be recorded for a future date.';
  end if;
  if new.attendance_date < emp.joining_date then
    raise exception 'Attendance date is before the employee''s joining date (%).', emp.joining_date;
  end if;

  -- Schedule: taken from the employee's shift (or the default shift) when not supplied.
  if new.shift_id is null then
    new.shift_id := coalesce(emp.shift_id, (select id from public.shifts where is_default limit 1));
  end if;
  select * into sh from public.shifts where id = new.shift_id;
  if tg_op = 'INSERT' then
    new.scheduled_in  := coalesce(new.scheduled_in, sh.start_time);
    new.scheduled_out := coalesce(new.scheduled_out, sh.end_time);
    new.grace_minutes := coalesce(sh.grace_minutes, 0);
    new.entered_by    := coalesce(new.entered_by, auth.uid());
    if not v_admin then
      new.source := 'entry';
      new.is_locked := false;
    end if;
  else
    new.updated_by := auth.uid();
    if not v_admin then
      -- Entry operators cannot alter provenance fields.
      new.source     := old.source;
      new.is_locked  := old.is_locked;
      new.entered_by := old.entered_by;
      new.employee_id := old.employee_id;
      new.attendance_date := old.attendance_date;
    end if;
  end if;
  if new.scheduled_in is null or new.scheduled_out is null then
    raise exception 'No shift is configured. Create a default shift in Holiday & Shift Management.';
  end if;

  -- Non-working statuses carry no clock times.
  if new.status in ('absent', 'leave', 'holiday', 'weekly_off') then
    new.actual_in := null;
    new.actual_out := null;
    new.late_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
    new.work_minutes := 0;
    new.late_reason := null;
    new.late_reason_note := null;
    return new;
  end if;

  if new.actual_in is null then
    -- Policy: "Present" without clock times is allowed ONLY for employees whose
    -- shift is not set ("Default shift" in the employee form). Employees with an
    -- explicitly assigned shift (including "General Shift 10:00–19:00") must
    -- always have their real in-time. Nothing is invented: actual times stay
    -- NULL, late = 0, worked minutes = 0. Late / Half Day always need in-time.
    if new.status = 'present'
       and s.present_without_time_default_shift
       and emp.shift_id is null then
      new.actual_out := null;
      new.late_minutes := 0;
      new.early_leave_minutes := 0;
      new.overtime_minutes := 0;
      new.work_minutes := 0;
      new.late_reason := null;
      new.late_reason_note := null;
      return new;
    end if;
    raise exception 'Actual in-time is required for status "%".', new.status;
  end if;

  v_delay := public.minutes_between(new.scheduled_in, new.actual_in);
  new.late_minutes := case when v_delay > new.grace_minutes then v_delay else 0 end;

  if new.status = 'present' and new.late_minutes > 0 then
    new.status := 'late';
  elsif new.status = 'late' and new.late_minutes = 0 then
    new.status := 'present';
  end if;

  if new.actual_out is not null then
    new.work_minutes := greatest(public.minutes_between(new.actual_in, new.actual_out), 0);
    new.early_leave_minutes := greatest(public.minutes_between(new.actual_out, new.scheduled_out), 0);
    new.overtime_minutes := greatest(public.minutes_between(new.scheduled_out, new.actual_out), 0);
  else
    new.work_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
  end if;

  if new.late_minutes > 0 then
    if new.late_reason is null and s.late_reason_required then
      raise exception 'Late reason is required: the employee arrived % minutes late.', new.late_minutes;
    end if;
    if new.late_reason = 'other' and s.late_note_required_for_other
       and length(trim(coalesce(new.late_reason_note, ''))) < 3 then
      raise exception 'Please describe the late reason when "Other" is selected.';
    end if;
  else
    new.late_reason := null;
    new.late_reason_note := null;
  end if;
  return new;
end $$;

-- >>> 20261113000009_flexible_schedule.sql
-- =====================================================================
-- ALL SHEBA HRMS — Flexible schedule for employees with no shift set
-- Replaces the 0007/0008 "Present without time" rule. Safe to run whether
-- or not 0007 / 0008 were run.
--   * company_settings.flexible_schedule_unassigned (default ON)
--   * attendance.is_flexible; scheduled_in / scheduled_out become nullable
--   * attendance_before_write(): flexible branch (no schedule, no late/early,
--     actual in/out optional -> worked hours only)
-- =====================================================================

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'company_settings'
                and column_name = 'present_without_time_default_shift') then
    alter table public.company_settings
      rename column present_without_time_default_shift to flexible_schedule_unassigned;
  elsif not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'company_settings'
                       and column_name = 'flexible_schedule_unassigned') then
    alter table public.company_settings
      add column flexible_schedule_unassigned boolean not null default true;
  end if;
end $$;

comment on column public.company_settings.flexible_schedule_unassigned is
  'Employees with no shift set have a flexible schedule: no scheduled times, no late/early, optional actual in/out.';

alter table public.attendance
  alter column scheduled_in drop not null,
  alter column scheduled_out drop not null,
  add column if not exists is_flexible boolean not null default false;

create or replace function public.attendance_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s     public.company_settings;
  emp   public.employees;
  sh    public.shifts;
  v_delay int;
  v_admin boolean := public.is_admin() or public.is_service();
begin
  select * into s from public.company_settings where id = 1;
  select * into emp from public.employees where id = new.employee_id;
  if emp.id is null then
    raise exception 'Employee not found.';
  end if;

  if tg_op = 'INSERT' and emp.archived_at is not null then
    raise exception 'Attendance cannot be recorded for an archived employee.';
  end if;
  if new.attendance_date > public.local_today() then
    raise exception 'Attendance cannot be recorded for a future date.';
  end if;
  if new.attendance_date < emp.joining_date then
    raise exception 'Attendance date is before the employee''s joining date (%).', emp.joining_date;
  end if;

  -- Schedule: taken from the employee's shift (or the default shift) when not supplied.
  if new.shift_id is null then
    new.shift_id := coalesce(emp.shift_id, (select id from public.shifts where is_default limit 1));
  end if;
  select * into sh from public.shifts where id = new.shift_id;
  if tg_op = 'INSERT' then
    new.scheduled_in  := coalesce(new.scheduled_in, sh.start_time);
    new.scheduled_out := coalesce(new.scheduled_out, sh.end_time);
    new.grace_minutes := coalesce(sh.grace_minutes, 0);
    new.entered_by    := coalesce(new.entered_by, auth.uid());
    if not v_admin then
      new.source := 'entry';
      new.is_locked := false;
    end if;
  else
    new.updated_by := auth.uid();
    if not v_admin then
      -- Entry operators cannot alter provenance fields.
      new.source     := old.source;
      new.is_locked  := old.is_locked;
      new.entered_by := old.entered_by;
      new.employee_id := old.employee_id;
      new.attendance_date := old.attendance_date;
    end if;
  end if;
  -- Flexible schedule: employees with NO shift set ("Default shift" in the
  -- employee form) have no office hours when the company policy is on. No
  -- scheduled times, no late / early-departure calculation; actual in/out are
  -- optional and, when given, only produce worked hours. The flag is fixed
  -- when the record is created so later shift changes never rewrite history.
  if tg_op = 'INSERT' then
    new.is_flexible := emp.shift_id is null and coalesce(s.flexible_schedule_unassigned, false);
  else
    new.is_flexible := old.is_flexible;
  end if;

  if new.is_flexible then
    new.shift_id := null;
    new.scheduled_in := null;
    new.scheduled_out := null;
    new.grace_minutes := 0;
    new.late_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
    new.late_reason := null;
    new.late_reason_note := null;
    if new.status = 'late' then
      new.status := 'present';   -- "late" has no meaning without a schedule
    end if;
    if new.status in ('absent', 'leave', 'holiday', 'weekly_off') then
      new.actual_in := null;
      new.actual_out := null;
      new.work_minutes := 0;
      return new;
    end if;
    if new.actual_out is not null and new.actual_in is null then
      raise exception 'Enter the in-time before the out-time.';
    end if;
    new.work_minutes := case
      when new.actual_in is not null and new.actual_out is not null
        then greatest(public.minutes_between(new.actual_in, new.actual_out), 0)
      else 0 end;
    return new;
  end if;

  if new.scheduled_in is null or new.scheduled_out is null then
    raise exception 'No shift is configured. Create a default shift in Holiday & Shift Management.';
  end if;

  -- Non-working statuses carry no clock times.
  if new.status in ('absent', 'leave', 'holiday', 'weekly_off') then
    new.actual_in := null;
    new.actual_out := null;
    new.late_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
    new.work_minutes := 0;
    new.late_reason := null;
    new.late_reason_note := null;
    return new;
  end if;

  if new.actual_in is null then
    raise exception 'Actual in-time is required for status "%".', new.status;
  end if;

  v_delay := public.minutes_between(new.scheduled_in, new.actual_in);
  new.late_minutes := case when v_delay > new.grace_minutes then v_delay else 0 end;

  if new.status = 'present' and new.late_minutes > 0 then
    new.status := 'late';
  elsif new.status = 'late' and new.late_minutes = 0 then
    new.status := 'present';
  end if;

  if new.actual_out is not null then
    new.work_minutes := greatest(public.minutes_between(new.actual_in, new.actual_out), 0);
    new.early_leave_minutes := greatest(public.minutes_between(new.actual_out, new.scheduled_out), 0);
    new.overtime_minutes := greatest(public.minutes_between(new.scheduled_out, new.actual_out), 0);
  else
    new.work_minutes := 0;
    new.early_leave_minutes := 0;
    new.overtime_minutes := 0;
  end if;

  if new.late_minutes > 0 then
    if new.late_reason is null and s.late_reason_required then
      raise exception 'Late reason is required: the employee arrived % minutes late.', new.late_minutes;
    end if;
    if new.late_reason = 'other' and s.late_note_required_for_other
       and length(trim(coalesce(new.late_reason_note, ''))) < 3 then
      raise exception 'Please describe the late reason when "Other" is selected.';
    end if;
  else
    new.late_reason := null;
    new.late_reason_note := null;
  end if;
  return new;
end $$;

-- >>> 20261113000010_employee_weekly_off.sql
-- =====================================================================
-- ALL SHEBA HRMS — Per-employee weekly off days
--   employees.weekly_off_days: NULL = use the company default (Settings).
--   Attendance closing, leave day counting and payroll working days now use
--   each employee's own weekly off days.
-- =====================================================================

alter table public.employees
  add column if not exists weekly_off_days smallint[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_weekly_off_valid') then
    alter table public.employees add constraint employees_weekly_off_valid check (
      weekly_off_days is null
      or (weekly_off_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(weekly_off_days) <= 6)
    );
  end if;
end $$;

comment on column public.employees.weekly_off_days is
  'Weekly off weekdays for this employee (0=Sun … 6=Sat). NULL = company default.';

-- Effective weekly off days for an employee.
create or replace function public.employee_off_days(p_employee uuid)
returns smallint[] language sql stable security definer set search_path = public as $$
  select coalesce(e.weekly_off_days, s.weekly_off_days, '{}'::smallint[])
    from public.company_settings s
    left join public.employees e on e.id = p_employee
   where s.id = 1
$$;

create or replace function public.is_employee_working_day(p_employee uuid, p_date date)
returns boolean language sql stable as $$
  select not (extract(dow from p_date)::smallint = any (public.employee_off_days(p_employee)))
     and not public.is_holiday(p_date)
$$;

create or replace function public.count_employee_working_days(p_employee uuid, p_start date, p_end date)
returns integer language sql stable as $$
  select count(*)::int
    from generate_series(p_start, p_end, interval '1 day') g(d)
   where public.is_employee_working_day(p_employee, g.d::date)
$$;

create or replace function public.close_attendance(p_date date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_end time;
  v_count int := 0;
  r record;
  v_status public.attendance_status;
  v_is_holiday boolean := public.is_holiday(p_date);
begin
  if not (public.is_admin() or public.is_service()) then
    raise exception 'Only administrators can close attendance.';
  end if;
  if p_date > public.local_today() then
    raise exception 'Cannot close a future date.';
  end if;
  if p_date = public.local_today() then
    select end_time into v_end from public.shifts where is_default limit 1;
    if v_end is not null and public.local_now()::time < v_end then
      raise exception 'Today can only be closed after office hours end (%).', to_char(v_end, 'HH12:MI AM');
    end if;
  end if;

  for r in
    select e.id
      from public.employees e
     where e.archived_at is null
       and e.status in ('active', 'on_notice')
       and e.joining_date <= p_date
       and not exists (select 1 from public.attendance a
                        where a.employee_id = e.id and a.attendance_date = p_date)
  loop
    v_status := case
      when v_is_holiday then 'holiday'
      when extract(dow from p_date)::smallint = any (public.employee_off_days(r.id)) then 'weekly_off'
      when exists (select 1 from public.leave_requests l
                    where l.employee_id = r.id and l.status = 'approved'
                      and p_date between l.start_date and l.end_date) then 'leave'
      else 'absent'
    end;
    insert into public.attendance (employee_id, attendance_date, status, source, is_locked, notes)
    values (r.id, p_date, v_status, 'closing', false, 'Generated by attendance closing');
    v_count := v_count + 1;
  end loop;

  if not public.is_service() then
    perform public.log_event('close', 'attendance', p_date::text,
      format('Closed attendance for %s (%s records generated)', p_date, v_count), null);
  end if;
  return v_count;
end $$;

create or replace function public.leave_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare lt public.leave_types;
begin
  select * into lt from public.leave_types where id = new.leave_type_id;
  if lt.id is null then raise exception 'Leave type not found.'; end if;

  if tg_op = 'INSERT' then
    new.applied_by := coalesce(new.applied_by, auth.uid());
    if not public.is_admin() then
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;

  if extract(year from new.start_date) <> extract(year from new.end_date) then
    raise exception 'A leave request cannot span two calendar years. Please split it.';
  end if;
  if new.is_half_day and not lt.allow_half_day then
    raise exception '% does not allow half-day leave.', lt.name;
  end if;

  new.days := case when new.is_half_day then 0.5
                   else public.count_employee_working_days(new.employee_id, new.start_date, new.end_date) end;
  if new.days = 0 then
    raise exception 'The selected dates contain no working days.';
  end if;

  if new.status in ('pending', 'approved') and exists (
    select 1 from public.leave_requests o
     where o.employee_id = new.employee_id and o.id <> new.id
       and o.status in ('pending', 'approved')
       and daterange(o.start_date, o.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')) then
    raise exception 'This employee already has a leave request overlapping these dates.';
  end if;
  return new;
end $$;

create or replace function public.generate_payroll(p_year int, p_month int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s        public.company_settings;
  v_start  date := make_date(p_year, p_month, 1);
  v_end    date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_id     uuid;
  v_status public.payroll_status;
  v_basis  numeric;
  v_working int;
  r        record;
  sal      public.salary_structures;
  att      record;
  lv       record;
  v_shift_minutes int;
  v_per_day numeric;
  v_ot_min int;
  v_ids    uuid[] := '{}';
  v_emp_working int;
  v_emp_basis   numeric;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can generate payroll.';
  end if;
  if v_start > public.local_today() then
    raise exception 'Cannot generate payroll for a future month.';
  end if;
  select * into s from public.company_settings where id = 1;

  select id, status into v_id, v_status from public.payroll_records
   where period_year = p_year and period_month = p_month for update;
  if v_status = 'finalized' then
    raise exception 'Payroll for this month is already finalized.';
  end if;

  v_working := public.count_working_days(v_start, v_end);
  v_basis := case s.payroll_day_basis
               when 'fixed_30' then 30
               when 'calendar' then extract(day from v_end)
               else greatest(v_working, 1) end;

  if v_id is null then
    insert into public.payroll_records (period_year, period_month, basis_days, working_days,
                                        settings_snapshot, generated_by)
    values (p_year, p_month, v_basis, v_working, to_jsonb(s), auth.uid())
    returning id into v_id;
  else
    update public.payroll_records set basis_days = v_basis, working_days = v_working,
           settings_snapshot = to_jsonb(s), generated_by = auth.uid(), generated_at = now()
     where id = v_id;
  end if;

  for r in
    select e.*, d.name as dept_name, g.name as desig_name,
           coalesce(sh.start_time, ds.start_time) as s_start, coalesce(sh.end_time, ds.end_time) as s_end
      from public.employees e
      left join public.departments d on d.id = e.department_id
      left join public.designations g on g.id = e.designation_id
      left join public.shifts sh on sh.id = e.shift_id
      left join public.shifts ds on ds.is_default
     where e.joining_date <= v_end
       and (e.archived_at is null or e.archived_at::date >= v_start)
  loop
    select * into sal from public.salary_structures
     where employee_id = r.id and effective_from <= v_end
     order by effective_from desc limit 1;
    continue when sal.id is null;   -- no salary configured: not included

    -- Working days follow the employee's own weekly off days.
    v_emp_working := public.count_employee_working_days(r.id, v_start, v_end);
    v_emp_basis := case when s.payroll_day_basis = 'working' then greatest(v_emp_working, 1) else v_basis end;

    select
      count(*) filter (where status in ('present', 'late'))  as present_days,
      count(*) filter (where status = 'late')                 as late_days,
      count(*) filter (where status = 'half_day')             as half_days,
      count(*) filter (where status = 'absent')               as absent_days,
      coalesce(sum(overtime_minutes) filter (where overtime_minutes >= s.overtime_min_minutes), 0) as ot
    into att
    from public.attendance
    where employee_id = r.id and attendance_date between v_start and v_end;

    select
      coalesce(sum(case when l.is_half_day then 0.5 else 1 end) filter (where t.is_paid), 0)     as paid,
      coalesce(sum(case when l.is_half_day then 0.5 else 1 end) filter (where not t.is_paid), 0) as unpaid
    into lv
    from public.leave_requests l
    join public.leave_types t on t.id = l.leave_type_id
    cross join lateral generate_series(greatest(l.start_date, v_start), least(l.end_date, v_end), interval '1 day') g(d)
    where l.employee_id = r.id and l.status = 'approved'
      and l.start_date <= v_end and l.end_date >= v_start
      and public.is_employee_working_day(r.id, g.d::date);

    v_per_day := round((sal.basic_salary + sal.allowances) / v_emp_basis, 4);
    v_shift_minutes := greatest(coalesce(public.minutes_between(r.s_start, r.s_end), 480), 60);
    v_ot_min := case when s.overtime_enabled then att.ot else 0 end;

    insert into public.payroll_items as pi (
      payroll_id, employee_id, employee_code, employee_name, department_name, designation_name,
      basic_salary, allowances, per_day_rate, working_days,
      present_days, late_days, half_days, absent_days, paid_leave_days, unpaid_leave_days, overtime_minutes,
      overtime_amount, absent_deduction, unpaid_leave_deduction, half_day_deduction, late_deduction, calculation)
    values (
      v_id, r.id, r.employee_code, r.full_name, r.dept_name, r.desig_name,
      sal.basic_salary, sal.allowances, v_per_day, v_emp_working,
      att.present_days + att.half_days * 0.5, att.late_days, att.half_days, att.absent_days,
      lv.paid, lv.unpaid, v_ot_min,
      case when s.overtime_enabled
           then round(v_ot_min / 60.0 * (v_per_day / (v_shift_minutes / 60.0)) * s.overtime_rate_multiplier, 2)
           else 0 end,
      case when s.absent_deduction_enabled then round(att.absent_days * v_per_day, 2) else 0 end,
      case when s.unpaid_leave_deduction_enabled then round(lv.unpaid * v_per_day, 2) else 0 end,
      case when s.half_day_deduction_enabled then round(att.half_days * 0.5 * v_per_day, 2) else 0 end,
      case when s.late_deduction_enabled
           then round(floor(att.late_days::numeric / s.late_days_per_deduction) * v_per_day * s.late_deduction_day_fraction, 2)
           else 0 end,
      jsonb_build_object(
        'salary_structure_id', sal.id, 'salary_effective_from', sal.effective_from,
        'basis', s.payroll_day_basis, 'basis_days', v_emp_basis, 'weekly_off_days', public.employee_off_days(r.id), 'shift_minutes', v_shift_minutes,
        'rules', jsonb_build_object(
          'absent', s.absent_deduction_enabled, 'unpaid_leave', s.unpaid_leave_deduction_enabled,
          'half_day', s.half_day_deduction_enabled, 'late', s.late_deduction_enabled,
          'late_days_per_deduction', s.late_days_per_deduction,
          'late_deduction_day_fraction', s.late_deduction_day_fraction,
          'overtime', s.overtime_enabled, 'overtime_multiplier', s.overtime_rate_multiplier,
          'overtime_min_minutes', s.overtime_min_minutes))
    )
    on conflict (payroll_id, employee_id) do update set
      employee_code = excluded.employee_code, employee_name = excluded.employee_name,
      department_name = excluded.department_name, designation_name = excluded.designation_name,
      basic_salary = excluded.basic_salary, allowances = excluded.allowances,
      per_day_rate = excluded.per_day_rate, working_days = excluded.working_days,
      present_days = excluded.present_days, late_days = excluded.late_days,
      half_days = excluded.half_days, absent_days = excluded.absent_days,
      paid_leave_days = excluded.paid_leave_days, unpaid_leave_days = excluded.unpaid_leave_days,
      overtime_minutes = excluded.overtime_minutes, overtime_amount = excluded.overtime_amount,
      absent_deduction = excluded.absent_deduction, unpaid_leave_deduction = excluded.unpaid_leave_deduction,
      half_day_deduction = excluded.half_day_deduction, late_deduction = excluded.late_deduction,
      calculation = excluded.calculation;
      -- bonus / other_earnings / other_deduction / adjustment_note are preserved on regeneration

    v_ids := v_ids || r.id;
  end loop;

  delete from public.payroll_items where payroll_id = v_id and not (employee_id = any (v_ids));
  perform public.payroll_refresh_totals(v_id);
  return v_id;
end $$;

-- save_employee: also stores weekly_off_days (JSON array of weekdays, or null = company default)
create or replace function public.save_employee(p_id uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can manage employees.';
  end if;

  if p_id is null then
    insert into public.employees (full_name, phone, designation_id, department_id, shift_id,
                                  joining_date, employment_type, status, photo_path, weekly_off_days)
    values (p ->> 'full_name', nullif(p ->> 'phone', ''),
            nullif(p ->> 'designation_id', '')::uuid, nullif(p ->> 'department_id', '')::uuid,
            nullif(p ->> 'shift_id', '')::uuid, (p ->> 'joining_date')::date,
            (p ->> 'employment_type')::public.employment_type, (p ->> 'status')::public.employment_status,
            nullif(p ->> 'photo_path', ''),
            case when jsonb_typeof(p -> 'weekly_off_days') = 'array'
                 then array(select (jsonb_array_elements_text(p -> 'weekly_off_days'))::smallint)
                 else null end)
    returning id into v_id;
  else
    update public.employees set
      full_name       = p ->> 'full_name',
      phone           = nullif(p ->> 'phone', ''),
      designation_id  = nullif(p ->> 'designation_id', '')::uuid,
      department_id   = nullif(p ->> 'department_id', '')::uuid,
      shift_id        = nullif(p ->> 'shift_id', '')::uuid,
      joining_date    = (p ->> 'joining_date')::date,
      employment_type = (p ->> 'employment_type')::public.employment_type,
      status          = (p ->> 'status')::public.employment_status,
      photo_path      = nullif(p ->> 'photo_path', ''),
      weekly_off_days = case when jsonb_typeof(p -> 'weekly_off_days') = 'array'
                 then array(select (jsonb_array_elements_text(p -> 'weekly_off_days'))::smallint)
                 else null end
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Employee not found.';
    end if;
  end if;

  insert into public.employee_personal as ep (employee_id, email, address, date_of_birth, national_id,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation, notes)
  values (v_id, nullif(p ->> 'email', ''), nullif(p ->> 'address', ''), nullif(p ->> 'date_of_birth', '')::date,
          nullif(p ->> 'national_id', ''), nullif(p ->> 'emergency_contact_name', ''),
          nullif(p ->> 'emergency_contact_phone', ''), nullif(p ->> 'emergency_contact_relation', ''),
          nullif(p ->> 'notes', ''))
  on conflict (employee_id) do update set
    email = excluded.email, address = excluded.address, date_of_birth = excluded.date_of_birth,
    national_id = excluded.national_id, emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_relation = excluded.emergency_contact_relation, notes = excluded.notes;

  if p_id is null and coalesce(p ->> 'basic_salary', '') <> '' then
    insert into public.salary_structures (employee_id, effective_from, basic_salary, allowances, notes)
    values (v_id, (p ->> 'joining_date')::date, (p ->> 'basic_salary')::numeric,
            coalesce(nullif(p ->> 'allowances', '')::numeric, 0), 'Initial salary');
  end if;
  return v_id;
end $$;

revoke execute on function public.employee_off_days(uuid) from public, anon;
revoke execute on function public.is_employee_working_day(uuid, date) from public, anon;
revoke execute on function public.count_employee_working_days(uuid, date, date) from public, anon;
grant execute on function public.employee_off_days(uuid) to authenticated, service_role;
grant execute on function public.is_employee_working_day(uuid, date) to authenticated, service_role;
grant execute on function public.count_employee_working_days(uuid, date, date) to authenticated, service_role;
