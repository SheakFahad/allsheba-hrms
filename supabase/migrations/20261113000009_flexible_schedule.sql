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
