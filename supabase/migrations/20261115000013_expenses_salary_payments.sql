-- =====================================================================
-- ALL SHEBA HRMS — Expenses, salary payment tracking and vouchers
--
-- Additive only. Existing employees, salary structures and payroll are not
-- modified. Salary payments are tracked separately from payroll.
--
--  * expense_categories            — daily / monthly categories
--  * expenses                      — daily and monthly expenses (kind column);
--                                    one table, so totals never double-count
--  * salary_payments               — actual salary payments (partial allowed)
--  * profiles.can_manage_expenses  — admin grants expense entry to an operator
--  * Status: pending → confirmed (admin only) or cancelled. Only CONFIRMED
--    records count as paid cost. Printing a voucher changes nothing.
--  * Voucher numbers: EXP-YYYY-00001 / SAL-YYYY-00001, unique.
--  * Every change is audited (previous + new values, who, when).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permission flag for entry operators
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists can_manage_expenses boolean not null default false;

create or replace function public.can_manage_expenses()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' or (role = 'entry' and can_manage_expenses)
                     from public.profiles where id = auth.uid() and is_active), false)
$$;

-- ---------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------
create table if not exists public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  kind        text not null default 'daily' check (kind in ('daily', 'monthly', 'both')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists expense_categories_name_uq on public.expense_categories (lower(name));
drop trigger if exists trg_expense_categories_touch on public.expense_categories;
create trigger trg_expense_categories_touch before update on public.expense_categories
  for each row execute function public.touch_updated_at();

insert into public.expense_categories (name, kind)
select v.name, v.kind from (values
  ('Office Supplies', 'daily'), ('Transport / Conveyance', 'daily'), ('Food & Refreshment', 'daily'),
  ('Repair & Maintenance', 'daily'), ('Printing & Stationery', 'daily'), ('Miscellaneous', 'both'),
  ('Office Rent', 'monthly'), ('Electricity Bill', 'monthly'), ('Internet Bill', 'monthly'),
  ('Software Subscription', 'monthly'), ('Other Monthly Expense', 'monthly')
) v(name, kind)
where not exists (select 1 from public.expense_categories);

-- ---------------------------------------------------------------------
-- Voucher numbers
-- ---------------------------------------------------------------------
create sequence if not exists public.expense_voucher_seq;
create sequence if not exists public.salary_voucher_seq;

create or replace function public.next_voucher_no(p_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare v_no text; v_n bigint;
begin
  loop
    v_n := nextval(case when p_prefix = 'SAL' then 'public.salary_voucher_seq' else 'public.expense_voucher_seq' end);
    v_no := p_prefix || '-' || to_char(public.local_today(), 'YYYY') || '-' || lpad(v_n::text, 5, '0');
    exit when not exists (select 1 from public.expenses where voucher_no = v_no)
          and not exists (select 1 from public.salary_payments where voucher_no = v_no);
  end loop;
  return v_no;
end $$;

-- ---------------------------------------------------------------------
-- Expenses (daily + monthly)
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id                    uuid primary key default gen_random_uuid(),
  voucher_no            text not null unique,
  expense_kind          text not null check (expense_kind in ('daily', 'monthly')),
  category_id           uuid not null references public.expense_categories (id) on delete restrict,
  expense_date          date not null,                 -- daily: the day; monthly: payment/bill date
  period_start          date,                          -- monthly / custom period
  period_end            date,
  payee_name            text not null check (length(trim(payee_name)) between 1 and 120),
  employee_id           uuid references public.employees (id) on delete set null,
  employee_designation  text,
  details               text check (details is null or length(details) <= 2000),
  amount                numeric(14,2) not null check (amount > 0),
  comments              text check (comments is null or length(comments) <= 1000),
  payment_method        text not null default 'cash'
                        check (payment_method in ('cash', 'bank_transfer', 'mobile_banking', 'cheque', 'other')),
  status                text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  prepared_by_name      text,
  checked_by_name       text,
  approved_by_name      text,
  received_by_name      text,
  cancel_reason         text,
  created_by            uuid references auth.users (id) on delete set null,
  updated_by            uuid references auth.users (id) on delete set null,
  confirmed_by          uuid references auth.users (id) on delete set null,
  confirmed_at          timestamptz,
  cancelled_by          uuid references auth.users (id) on delete set null,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint expenses_period check (
    (expense_kind = 'daily' and period_start is null and period_end is null)
    or (expense_kind = 'monthly' and period_start is not null and period_end is not null and period_end >= period_start)
  )
);
create index if not exists expenses_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_kind_date_idx on public.expenses (expense_kind, expense_date desc);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_status_idx on public.expenses (status);
-- One active recurring expense per category and period (prevents accidental duplicates).
create unique index if not exists expenses_monthly_unique
  on public.expenses (category_id, period_start, period_end)
  where expense_kind = 'monthly' and status <> 'cancelled';

-- ---------------------------------------------------------------------
-- Salary payments (separate from payroll and salary configuration)
-- ---------------------------------------------------------------------
create table if not exists public.salary_payments (
  id                    uuid primary key default gen_random_uuid(),
  voucher_no            text not null unique,
  employee_id           uuid not null references public.employees (id) on delete restrict,
  employee_code         text not null,
  employee_name         text not null,
  designation           text,
  salary_month          date not null check (extract(day from salary_month) = 1),
  configured_salary     numeric(14,2) not null default 0 check (configured_salary >= 0),
  amount                numeric(14,2) not null check (amount > 0),
  payment_date          date not null,
  payment_method        text not null default 'cash'
                        check (payment_method in ('cash', 'bank_transfer', 'mobile_banking', 'other')),
  status                text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  comments              text check (comments is null or length(comments) <= 1000),
  over_salary_reason    text,
  prepared_by_name      text,
  checked_by_name       text,
  approved_by_name      text,
  received_by_name      text,
  cancel_reason         text,
  created_by            uuid references auth.users (id) on delete set null,
  updated_by            uuid references auth.users (id) on delete set null,
  confirmed_by          uuid references auth.users (id) on delete set null,
  confirmed_at          timestamptz,
  cancelled_by          uuid references auth.users (id) on delete set null,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists salary_payments_emp_month_idx on public.salary_payments (employee_id, salary_month);
create index if not exists salary_payments_date_idx on public.salary_payments (payment_date desc);
create index if not exists salary_payments_status_idx on public.salary_payments (status);

-- ---------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------
create or replace function public.expenses_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin boolean := public.is_admin();
begin
  if tg_op = 'INSERT' then
    new.voucher_no := coalesce(nullif(new.voucher_no, ''), public.next_voucher_no('EXP'));
    new.created_by := coalesce(new.created_by, auth.uid());
    if not v_admin then
      new.status := 'pending';              -- only administrators confirm
      new.confirmed_by := null; new.confirmed_at := null;
    end if;
  else
    new.updated_by := auth.uid();
    new.voucher_no := old.voucher_no;       -- voucher numbers never change
    new.created_by := old.created_by;
    if old.status = 'cancelled' then
      raise exception 'A cancelled expense cannot be changed.';
    end if;
    if old.status = 'confirmed' and (
         new.amount is distinct from old.amount or new.category_id is distinct from old.category_id
      or new.expense_date is distinct from old.expense_date or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end or new.expense_kind is distinct from old.expense_kind) then
      raise exception 'A confirmed expense cannot be changed. Cancel it and record a new one.';
    end if;
    if new.status is distinct from old.status and not v_admin then
      raise exception 'Only administrators can confirm or cancel expenses.';
    end if;
  end if;
  if new.employee_id is not null and new.employee_designation is null then
    new.employee_designation := (select g.name from public.employees e
                                  left join public.designations g on g.id = e.designation_id where e.id = new.employee_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_expenses_before_write on public.expenses;
create trigger trg_expenses_before_write before insert or update on public.expenses
  for each row execute function public.expenses_before_write();
drop trigger if exists trg_expenses_touch on public.expenses;
create trigger trg_expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

create or replace function public.salary_payments_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  e        public.employees;
  v_sal    numeric;
  v_others numeric;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can manage salary payments.';
  end if;

  if tg_op = 'INSERT' then
    new.voucher_no := coalesce(nullif(new.voucher_no, ''), public.next_voucher_no('SAL'));
    new.created_by := coalesce(new.created_by, auth.uid());
    new.salary_month := date_trunc('month', new.salary_month)::date;
    -- Employee details and configured salary are filled automatically (snapshot).
    select * into e from public.employees where id = new.employee_id;
    if e.id is null then raise exception 'Employee not found.'; end if;
    new.employee_code := e.employee_code;
    new.employee_name := e.full_name;
    new.designation := coalesce(new.designation, (select name from public.designations where id = e.designation_id));
    select basic_salary + allowances into v_sal from public.salary_structures
     where employee_id = e.id and effective_from <= (new.salary_month + interval '1 month - 1 day')::date
     order by effective_from desc limit 1;
    new.configured_salary := coalesce(v_sal, 0);
  else
    new.updated_by := auth.uid();
    new.voucher_no := old.voucher_no;
    new.employee_id := old.employee_id;
    new.employee_code := old.employee_code;
    new.employee_name := old.employee_name;
    new.configured_salary := old.configured_salary;
    new.created_by := old.created_by;
    if old.status = 'cancelled' then
      raise exception 'A cancelled salary payment cannot be changed.';
    end if;
    if old.status = 'confirmed' and (new.amount is distinct from old.amount
         or new.salary_month is distinct from old.salary_month or new.payment_date is distinct from old.payment_date) then
      raise exception 'A confirmed salary payment cannot be changed. Cancel it and record a new one.';
    end if;
  end if;

  -- Prevent paying more than the configured salary for a month (duplicate full
  -- payments) unless the administrator records a reason.
  if new.status <> 'cancelled' then
    select coalesce(sum(amount), 0) into v_others from public.salary_payments
     where employee_id = new.employee_id and salary_month = new.salary_month
       and status <> 'cancelled' and id <> new.id;
    if new.configured_salary > 0 and v_others >= new.configured_salary
       and length(trim(coalesce(new.over_salary_reason, ''))) < 3 then
      raise exception 'The full salary for this month is already recorded (% of %).', round(v_others, 2), round(new.configured_salary, 2);
    end if;
    if new.configured_salary > 0 and v_others + new.amount > new.configured_salary
       and length(trim(coalesce(new.over_salary_reason, ''))) < 3 then
      raise exception 'This payment would exceed the configured salary (% already recorded, % configured). Enter a reason to pay more.',
        round(v_others, 2), round(new.configured_salary, 2);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_salary_payments_before_write on public.salary_payments;
create trigger trg_salary_payments_before_write before insert or update on public.salary_payments
  for each row execute function public.salary_payments_before_write();
drop trigger if exists trg_salary_payments_touch on public.salary_payments;
create trigger trg_salary_payments_touch before update on public.salary_payments
  for each row execute function public.touch_updated_at();

-- Audit (previous + new values, who, when) via the existing audit_row().
drop trigger if exists trg_expenses_audit on public.expenses;
create trigger trg_expenses_audit after insert or update or delete on public.expenses
  for each row execute function public.audit_row();
drop trigger if exists trg_salary_payments_audit on public.salary_payments;
create trigger trg_salary_payments_audit after insert or update or delete on public.salary_payments
  for each row execute function public.audit_row();
drop trigger if exists trg_expense_categories_audit on public.expense_categories;
create trigger trg_expense_categories_audit after insert or update or delete on public.expense_categories
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------
-- Confirm / cancel (the only way to change status)
-- ---------------------------------------------------------------------
create or replace function public.set_expense_status(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can confirm or cancel expenses.'; end if;
  if p_status not in ('confirmed', 'cancelled') then raise exception 'Invalid status.'; end if;
  if p_status = 'cancelled' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for cancelling.'; end if;
  update public.expenses set
    status = p_status,
    confirmed_by = case when p_status = 'confirmed' then auth.uid() else confirmed_by end,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    cancelled_by = case when p_status = 'cancelled' then auth.uid() else cancelled_by end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_status = 'cancelled' then p_reason else cancel_reason end
  where id = p_id and (status = 'pending' or (p_status = 'cancelled' and status = 'confirmed'));
  if not found then raise exception 'This expense cannot be changed (already confirmed or cancelled).'; end if;
end $$;

create or replace function public.set_salary_payment_status(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can confirm salary payments.'; end if;
  if p_status not in ('confirmed', 'cancelled') then raise exception 'Invalid status.'; end if;
  if p_status = 'cancelled' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for cancelling.'; end if;
  update public.salary_payments set
    status = p_status,
    confirmed_by = case when p_status = 'confirmed' then auth.uid() else confirmed_by end,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    cancelled_by = case when p_status = 'cancelled' then auth.uid() else cancelled_by end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_status = 'cancelled' then p_reason else cancel_reason end
  where id = p_id and (status = 'pending' or (p_status = 'cancelled' and status = 'confirmed'));
  if not found then raise exception 'This payment cannot be changed (already confirmed or cancelled).'; end if;
end $$;

-- Month status per employee: configured salary, confirmed paid, recorded-but-unconfirmed, remaining.
create or replace function public.salary_payment_status(p_month date)
returns table (
  employee_id uuid, employee_code text, employee_name text, designation text,
  configured_salary numeric, paid numeric, pending numeric, remaining numeric, status text
) language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date as d),
  emp as (
    select e.id, e.employee_code, e.full_name, g.name as designation,
           coalesce((select s.basic_salary + s.allowances from public.salary_structures s, m
                      where s.employee_id = e.id and s.effective_from <= (m.d + interval '1 month - 1 day')::date
                      order by s.effective_from desc limit 1), 0) as salary
      from public.employees e
      left join public.designations g on g.id = e.designation_id, m
     where e.joining_date <= (m.d + interval '1 month - 1 day')::date
       and (e.archived_at is null or e.archived_at::date >= m.d)
  ),
  pay as (
    select sp.employee_id,
           coalesce(sum(sp.amount) filter (where sp.status = 'confirmed'), 0) as paid,
           coalesce(sum(sp.amount) filter (where sp.status = 'pending'), 0) as pending
      from public.salary_payments sp, m
     where sp.salary_month = m.d and sp.status <> 'cancelled'
     group by sp.employee_id
  )
  select emp.id, emp.employee_code, emp.full_name, emp.designation, emp.salary,
         coalesce(pay.paid, 0), coalesce(pay.pending, 0),
         greatest(emp.salary - coalesce(pay.paid, 0), 0),
         case when emp.salary > 0 and coalesce(pay.paid, 0) >= emp.salary then 'paid'
              when coalesce(pay.paid, 0) > 0 then 'partially_paid'
              else 'pending' end
    from emp left join pay on pay.employee_id = emp.id
   where public.is_admin()
   order by emp.employee_code
$$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.salary_payments enable row level security;
revoke all on public.expense_categories, public.expenses, public.salary_payments from anon;

drop policy if exists expense_categories_select on public.expense_categories;
create policy expense_categories_select on public.expense_categories for select to authenticated
  using (public.can_manage_expenses());
drop policy if exists expense_categories_admin on public.expense_categories;
create policy expense_categories_admin on public.expense_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (public.is_admin() or (public.can_manage_expenses() and created_by = auth.uid()));
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.can_manage_expenses());
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_admin() or (public.can_manage_expenses() and created_by = auth.uid() and status = 'pending'))
  with check (public.is_admin() or (public.can_manage_expenses() and created_by = auth.uid()));
-- No delete policy: expenses are cancelled, never deleted.

drop policy if exists salary_payments_admin on public.salary_payments;
create policy salary_payments_admin on public.salary_payments for select to authenticated
  using (public.is_admin());
drop policy if exists salary_payments_admin_insert on public.salary_payments;
create policy salary_payments_admin_insert on public.salary_payments for insert to authenticated
  with check (public.is_admin());
drop policy if exists salary_payments_admin_update on public.salary_payments;
create policy salary_payments_admin_update on public.salary_payments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.expense_categories, public.expenses, public.salary_payments to authenticated;
grant usage on sequence public.expense_voucher_seq, public.salary_voucher_seq to authenticated;
revoke execute on function public.next_voucher_no(text) from public, anon;
revoke execute on function public.can_manage_expenses() from public, anon;
revoke execute on function public.set_expense_status(uuid, text, text) from public, anon;
revoke execute on function public.set_salary_payment_status(uuid, text, text) from public, anon;
revoke execute on function public.salary_payment_status(date) from public, anon;
grant execute on function public.can_manage_expenses() to authenticated;
grant execute on function public.set_expense_status(uuid, text, text) to authenticated;
grant execute on function public.set_salary_payment_status(uuid, text, text) to authenticated;
grant execute on function public.salary_payment_status(date) to authenticated;
