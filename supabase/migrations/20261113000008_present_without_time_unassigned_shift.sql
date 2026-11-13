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
