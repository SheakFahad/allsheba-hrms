-- =====================================================================
-- Employee portal: own profile, own leave (apply / view / cancel pending),
-- today's shared Present List.
--
-- ADDITIVE ONLY: new policies and new functions, plus one CREATE OR REPLACE
-- of cancel_leave() that keeps every existing rule and only adds "an
-- employee may cancel their own pending request". No table is altered,
-- no row is changed, nothing is dropped.
-- =====================================================================

-- Leave types: employees may read active types (to choose one when applying).
create policy leave_types_employee_select on public.leave_types for select to authenticated
  using (is_active and public.my_employee_id() is not null);

-- Leave requests: an employee sees and creates only their own requests.
-- leave_before_write() already forces status = 'pending' for non-admins and
-- validates dates, working days and overlaps.
create policy leave_requests_self_select on public.leave_requests for select to authenticated
  using (employee_id = public.my_employee_id());
create policy leave_requests_self_insert on public.leave_requests for insert to authenticated
  with check (
    employee_id = public.my_employee_id()
    and status = 'pending'
    and (applied_by is null or applied_by = auth.uid())
  );

-- Same rules as before, plus: an employee may cancel their own pending request.
create or replace function public.cancel_leave(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.leave_requests;
begin
  select * into l from public.leave_requests where id = p_id for update;
  if l.id is null then raise exception 'Leave request not found.'; end if;
  if not (public.is_admin()
          or (public.is_entry() and l.applied_by = auth.uid() and l.status = 'pending')
          or (l.employee_id = public.my_employee_id() and l.status = 'pending')) then
    raise exception 'You cannot cancel this leave request.';
  end if;
  if l.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved requests can be cancelled.';
  end if;
  update public.leave_requests set status = 'cancelled', review_note = coalesce(p_note, review_note),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
end $$;

-- Own leave balance for a year (allocated / used / pending / remaining per type).
create or replace function public.my_leave_balances(p_year int)
returns table (leave_type_id uuid, name text, code text, color text, allocated numeric, used numeric, pending numeric, remaining numeric)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.code, t.color,
         public.leave_allocated(v.emp, t.id, p_year),
         public.leave_used(v.emp, t.id, p_year, 'approved'),
         public.leave_used(v.emp, t.id, p_year, 'pending'),
         public.leave_allocated(v.emp, t.id, p_year) - public.leave_used(v.emp, t.id, p_year, 'approved')
    from (select public.my_employee_id() as emp) v
    cross join public.leave_types t
   where v.emp is not null and t.is_active
   order by t.name
$$;

-- Own profile, read-only (no salary, no ID numbers, no notes).
create or replace function public.my_profile()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_emp uuid := public.my_employee_id();
  e public.employees;
  p public.employee_personal;
begin
  if v_emp is null then
    raise exception 'Your account is not linked to an employee. Contact the administrator.';
  end if;
  select * into e from public.employees where id = v_emp;
  select * into p from public.employee_personal where employee_id = v_emp;
  return jsonb_build_object(
    'code', e.employee_code,
    'name', e.full_name,
    'photo_path', e.photo_path,
    'phone', e.phone,
    'email', p.email,
    'department', (select name from public.departments where id = e.department_id),
    'designation', (select name from public.designations where id = e.designation_id),
    'shift', (select name || ' (' || to_char(start_time, 'HH12:MI AM') || ' – ' || to_char(end_time, 'HH12:MI AM') || ')'
                from public.shifts where id = e.shift_id),
    'joining_date', e.joining_date,
    'employment_type', e.employment_type,
    'status', e.status,
    'off_days', to_jsonb(public.employee_off_days(v_emp)),
    'emergency_contact_name', p.emergency_contact_name,
    'emergency_contact_phone', p.emergency_contact_phone,
    'emergency_contact_relation', p.emergency_contact_relation
  );
end $$;

-- Today's Present List, shared with every signed-in employee and staff
-- member. Only name, department, designation, check-in time and status —
-- nothing personal or financial.
create or replace function public.today_present_list()
returns table (employee_code text, full_name text, department text, designation text, actual_in time, status public.attendance_status, entry_method text)
language sql stable security definer set search_path = public as $$
  select e.employee_code, e.full_name, d.name, g.name, a.actual_in, a.status, a.entry_method::text
    from public.attendance a
    join public.employees e on e.id = a.employee_id
    left join public.departments d on d.id = e.department_id
    left join public.designations g on g.id = e.designation_id
   where a.attendance_date = public.local_today()
     and a.status in ('present', 'late', 'half_day')
     and e.archived_at is null
     and (public.is_staff() or public.my_employee_id() is not null)
   order by a.actual_in nulls last, e.full_name
$$;

revoke execute on function public.my_leave_balances(int) from public, anon;
revoke execute on function public.my_profile() from public, anon;
revoke execute on function public.today_present_list() from public, anon;
grant execute on function public.my_leave_balances(int) to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.today_present_list() to authenticated;
