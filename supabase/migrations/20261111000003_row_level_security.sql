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
