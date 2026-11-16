-- =====================================================================
-- Late grace for employee self check-in.
--
-- An employee who checks in themselves (GPS self-service) is marked late only
-- after the shift start + the self-service grace (default 15 minutes; Admin →
-- Company Settings), or the shift's own grace if that is longer.
--
-- ADDITIVE ONLY:
--   * new column company_settings.self_grace_minutes (default 15)
--   * attendance_before_write(): identical to 0009 plus the self check-in grace
--     line; operator / admin entries are calculated exactly as before
--   * self_service_context(): reports the effective grace to the employee page
-- Existing attendance rows keep their stored grace and late minutes.
-- =====================================================================

alter table public.company_settings
  add column if not exists self_grace_minutes integer not null default 15
    check (self_grace_minutes between 0 and 120);

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
    -- Employee self check-in: late only after the self-service grace (default 15 min),
    -- or the shift grace if that is longer. Stored on the row, so history never changes.
    if new.entry_method in ('self_gps', 'self') then
      new.grace_minutes := greatest(new.grace_minutes, coalesce(s.self_grace_minutes, 15));
    end if;
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

create or replace function public.self_service_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_emp uuid := public.my_employee_id();
  s public.company_settings;
  e public.employees;
  sh public.shifts;
  a public.attendance;
  v_today date := public.local_today();
begin
  if v_emp is null then
    raise exception 'Your account is not linked to an employee. Contact the administrator.';
  end if;
  select * into s from public.company_settings where id = 1;
  select * into e from public.employees where id = v_emp;
  select * into sh from public.shifts where id = coalesce(e.shift_id, (select id from public.shifts where is_default limit 1));
  select * into a from public.attendance where employee_id = v_emp and attendance_date = v_today;
  return jsonb_build_object(
    'employee', jsonb_build_object('id', e.id, 'code', e.employee_code, 'name', e.full_name,
                                   'department', (select name from public.departments where id = e.department_id)),
    'today', v_today,
    'server_time', to_char(public.local_now(), 'HH24:MI'),
    'timezone', s.timezone,
    'flexible', e.shift_id is null and coalesce(s.flexible_schedule_unassigned, false),
    'schedule', jsonb_build_object('in', to_char(sh.start_time, 'HH24:MI'), 'out', to_char(sh.end_time, 'HH24:MI'),
                                   'grace', greatest(coalesce(sh.grace_minutes, 0), coalesce(s.self_grace_minutes, 15))),
    'weekly_off', extract(dow from v_today)::smallint = any (public.employee_off_days(v_emp)),
    'holiday', (select name from public.holidays where holiday_date = v_today),
    'enabled', s.self_service_enabled,
    'gps_required', s.gps_required,
    'office_name', coalesce(nullif(s.office_name, ''), s.company_name),
    'office_configured', s.office_latitude is not null and s.office_longitude is not null,
    'radius_m', s.office_radius_m,
    'max_accuracy_m', s.gps_max_accuracy_m,
    'late_reason_required', s.late_reason_required,
    'late_note_required_for_other', s.late_note_required_for_other,
    'record', case when a.id is null then null else jsonb_build_object(
      'status', a.status, 'actual_in', to_char(a.actual_in, 'HH24:MI'), 'actual_out', to_char(a.actual_out, 'HH24:MI'),
      'late_minutes', a.late_minutes, 'work_minutes', a.work_minutes, 'entry_method', a.entry_method) end
  );
end $$;
