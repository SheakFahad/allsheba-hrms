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
