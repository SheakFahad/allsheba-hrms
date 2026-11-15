-- =====================================================================
-- ALL SHEBA HRMS — GPS-verified self-service attendance
--
--  * Employees with their own login (role "employee", linked to one employee
--    record) check in / check out from their own phone or PC.
--  * The browser sends its location ONLY when the button is pressed. The server
--    computes the distance to the configured office and decides; the time
--    recorded is the server's clock, never the device's.
--  * Every attempt (accepted or rejected) is stored in attendance_geo_events.
--  * Operator entries (Entry Panel / shared computer) are marked "operator" and
--    are NOT GPS-verified. Entry operators cannot edit GPS-verified records.
--
-- Additive only: new columns have defaults, existing rows become
-- entry_method = 'operator'. No existing data is changed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
alter table public.company_settings
  add column if not exists office_latitude  numeric(9,6) check (office_latitude between -90 and 90),
  add column if not exists office_longitude numeric(9,6) check (office_longitude between -180 and 180),
  add column if not exists office_radius_m  integer not null default 100 check (office_radius_m between 10 and 5000),
  add column if not exists gps_max_accuracy_m integer not null default 50 check (gps_max_accuracy_m between 5 and 1000),
  add column if not exists self_service_enabled boolean not null default true,
  add column if not exists gps_required boolean not null default true,
  add column if not exists office_name text,
  add column if not exists office_address text;

-- ---------------------------------------------------------------------
-- Link a login to an employee (required for role "employee")
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists employee_id uuid references public.employees (id) on delete set null;

create unique index if not exists profiles_employee_id_uq on public.profiles (employee_id) where employee_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_employee_link') then
    alter table public.profiles add constraint profiles_employee_link
      check (role <> 'employee' or employee_id is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- How an attendance record was captured
-- ---------------------------------------------------------------------
alter table public.attendance
  add column if not exists entry_method text not null default 'operator'
    check (entry_method in ('operator', 'self_gps', 'self'));

-- ---------------------------------------------------------------------
-- Every self-service attempt with its location evidence
-- ---------------------------------------------------------------------
create table if not exists public.attendance_geo_events (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees (id) on delete cascade,
  attendance_id    uuid references public.attendance (id) on delete set null,
  attendance_date  date not null,
  kind             text not null check (kind in ('check_in', 'check_out')),
  latitude         numeric(9,6) not null check (latitude between -90 and 90),
  longitude        numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_m       numeric(8,1) not null check (accuracy_m >= 0),
  distance_m       numeric(10,1),
  office_latitude  numeric(9,6),
  office_longitude numeric(9,6),
  radius_m         integer,
  max_accuracy_m   integer,
  verified         boolean not null,
  result           text not null check (result in ('accepted', 'outside_radius', 'low_accuracy', 'not_configured', 'duplicate', 'not_checked_in')),
  message          text,
  user_id          uuid references auth.users (id) on delete set null,
  captured_at      timestamptz not null default now()
);
create index if not exists attendance_geo_events_emp_idx on public.attendance_geo_events (employee_id, captured_at desc);
create index if not exists attendance_geo_events_att_idx on public.attendance_geo_events (attendance_id);
create index if not exists attendance_geo_events_time_idx on public.attendance_geo_events (captured_at desc);

alter table public.attendance_geo_events enable row level security;
revoke all on public.attendance_geo_events from anon;

-- ---------------------------------------------------------------------
-- Office location / GPS settings change history (previous + new values,
-- who, when). Historical attendance is never modified by these changes.
-- ---------------------------------------------------------------------
create table if not exists public.office_location_history (
  id          bigint generated always as identity primary key,
  changed_by  uuid references auth.users (id) on delete set null,
  changed_by_name text,
  old_values  jsonb not null,
  new_values  jsonb not null,
  changed_at  timestamptz not null default now()
);
create index if not exists office_location_history_time_idx on public.office_location_history (changed_at desc);
alter table public.office_location_history enable row level security;
revoke all on public.office_location_history from anon;

create or replace function public.track_office_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := jsonb_build_object(
    'office_name', old.office_name, 'office_address', old.office_address,
    'office_latitude', old.office_latitude, 'office_longitude', old.office_longitude,
    'office_radius_m', old.office_radius_m, 'gps_max_accuracy_m', old.gps_max_accuracy_m,
    'gps_required', old.gps_required, 'self_service_enabled', old.self_service_enabled);
  v_new jsonb := jsonb_build_object(
    'office_name', new.office_name, 'office_address', new.office_address,
    'office_latitude', new.office_latitude, 'office_longitude', new.office_longitude,
    'office_radius_m', new.office_radius_m, 'gps_max_accuracy_m', new.gps_max_accuracy_m,
    'gps_required', new.gps_required, 'self_service_enabled', new.self_service_enabled);
begin
  if v_old is distinct from v_new then
    insert into public.office_location_history (changed_by, changed_by_name, old_values, new_values)
    values (auth.uid(), (select username from public.profiles where id = auth.uid()), v_old, v_new);
  end if;
  return new;
end $$;
drop trigger if exists trg_settings_office_location on public.company_settings;
create trigger trg_settings_office_location after update on public.company_settings
  for each row execute function public.track_office_location();

-- ---------------------------------------------------------------------
-- Role helpers
-- "staff" = admin or entry operator. Employees are NOT staff: they only see
-- their own records through the policies / functions below.
-- ---------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and is_active and role in ('admin', 'entry'))
$$;

create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles
   where id = auth.uid() and is_active and role = 'employee'
$$;

-- Any active user (including employees) may write their own login/export events.
create or replace function public.log_event(
  p_action text, p_entity text, p_entity_id text default null,
  p_summary text default null, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Not authorised.';
  end if;
  insert into public.audit_logs (actor_id, actor_name, action, entity, entity_id, summary, details)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()),
          left(p_action, 60), left(p_entity, 60), left(p_entity_id, 120), left(p_summary, 500), p_details);
end $$;

-- ---------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------
drop policy if exists attendance_self_select on public.attendance;
create policy attendance_self_select on public.attendance for select to authenticated
  using (employee_id = public.my_employee_id());

drop policy if exists office_history_admin_select on public.office_location_history;
create policy office_history_admin_select on public.office_location_history for select to authenticated
  using (public.is_admin());

drop policy if exists geo_events_admin_select on public.attendance_geo_events;
create policy geo_events_admin_select on public.attendance_geo_events for select to authenticated
  using (public.is_admin());

drop policy if exists geo_events_self_select on public.attendance_geo_events;
create policy geo_events_self_select on public.attendance_geo_events for select to authenticated
  using (employee_id = public.my_employee_id());

-- Entry operators may no longer edit GPS-verified (self-service) records.
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (
    public.is_admin()
    or (public.is_entry()
        and not is_locked
        and source = 'entry'
        and entry_method = 'operator'
        and attendance_date >= public.local_today()
             - (select entry_edit_days from public.company_settings where id = 1))
  )
  with check (
    public.is_admin()
    or (public.is_entry()
        and attendance_date >= public.local_today()
             - (select entry_edit_days from public.company_settings where id = 1))
  );

-- ---------------------------------------------------------------------
-- Great-circle distance in metres (haversine)
-- ---------------------------------------------------------------------
create or replace function public.geo_distance_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric language sql immutable as $$
  select (2 * 6371000 * asin(sqrt(
           power(sin(radians((lat2 - lat1)::float8) / 2), 2)
         + cos(radians(lat1::float8)) * cos(radians(lat2::float8))
         * power(sin(radians((lng2 - lng1)::float8) / 2), 2))))::numeric
$$;

-- ---------------------------------------------------------------------
-- What the self-service screen needs (own data only)
-- ---------------------------------------------------------------------
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
                                   'grace', coalesce(sh.grace_minutes, 0)),
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

-- ---------------------------------------------------------------------
-- Check in / check out with server-side location verification
-- ---------------------------------------------------------------------
create or replace function public.self_attendance(
  p_kind text, p_lat numeric default null, p_lng numeric default null, p_accuracy numeric default null,
  p_late_reason text default null, p_late_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_emp    uuid := public.my_employee_id();
  s        public.company_settings;
  a        public.attendance;
  v_today  date := public.local_today();
  v_now    time := date_trunc('minute', public.local_now())::time;
  v_dist   numeric;
  v_result text;
  v_msg    text;
  v_gps    boolean;
  v_has_location boolean := p_lat is not null and p_lng is not null and p_accuracy is not null;
begin
  if v_emp is null then
    raise exception 'Your account is not linked to an employee. Contact the administrator.';
  end if;
  if p_kind not in ('check_in', 'check_out') then
    raise exception 'Invalid action.';
  end if;

  select * into s from public.company_settings where id = 1;
  if not s.self_service_enabled then
    raise exception 'Self check-in is turned off by the administrator.';
  end if;
  v_gps := s.gps_required;

  if v_has_location and (p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy < 0) then
    raise exception 'Invalid location data.';
  end if;

  -- Location verification (server-side; the client's opinion is never trusted).
  if v_gps then
    if not v_has_location then
      raise exception 'Location is required for check-in and check-out. Allow location access and try again.';
    end if;
    if s.office_latitude is null or s.office_longitude is null then
      v_result := 'not_configured';
      v_msg := 'The office location has not been set yet. Please contact the administrator.';
    else
      v_dist := round(public.geo_distance_m(p_lat, p_lng, s.office_latitude, s.office_longitude), 1);
      if p_accuracy > s.gps_max_accuracy_m then
        v_result := 'low_accuracy';
        v_msg := format('Location accuracy is %s m; at most %s m is required. Move near a window or outdoors and try again.',
                        round(p_accuracy), s.gps_max_accuracy_m);
      elsif v_dist > s.office_radius_m then
        v_result := 'outside_radius';
        v_msg := format('You are %s m from the office. Check-in is allowed within %s m.', round(v_dist), s.office_radius_m);
      end if;
    end if;
  end if;

  select * into a from public.attendance where employee_id = v_emp and attendance_date = v_today;

  if v_result is null then
    if p_kind = 'check_in' then
      if a.id is not null then
        v_result := 'duplicate';
        v_msg := case when a.actual_in is not null
                      then format('You already checked in today at %s.', to_char(a.actual_in, 'HH12:MI AM'))
                      else 'Attendance for today is already recorded by the office.' end;
      else
        insert into public.attendance (employee_id, attendance_date, actual_in, status,
                                       late_reason, late_reason_note, entry_method)
        values (v_emp, v_today, v_now, 'present',
                nullif(p_late_reason, '')::public.late_reason, nullif(trim(coalesce(p_late_note, '')), ''),
                case when v_gps then 'self_gps' else 'self' end)
        returning * into a;
        v_result := 'accepted';
        v_msg := format('Checked in at %s.', to_char(v_now, 'HH12:MI AM'));
      end if;
    else
      if a.id is null or a.actual_in is null then
        v_result := 'not_checked_in';
        v_msg := 'You have not checked in today.';
      elsif a.actual_out is not null then
        v_result := 'duplicate';
        v_msg := format('You already checked out today at %s.', to_char(a.actual_out, 'HH12:MI AM'));
      elsif a.entry_method = 'operator' then
        v_result := 'duplicate';
        v_msg := 'Today''s attendance was recorded by the office; ask the office to record your check-out.';
      elsif v_now <= a.actual_in then
        raise exception 'Please wait at least one minute after checking in.';
      else
        update public.attendance
           set actual_out = v_now,
               last_change_reason = case when v_gps then 'Self check-out (GPS verified)' else 'Self check-out' end
         where id = a.id
        returning * into a;
        v_result := 'accepted';
        v_msg := format('Checked out at %s.', to_char(v_now, 'HH12:MI AM'));
      end if;
    end if;
  end if;

  -- Evidence log: every attempt that carried a location.
  if v_has_location then
    insert into public.attendance_geo_events (
      employee_id, attendance_id, attendance_date, kind, latitude, longitude, accuracy_m, distance_m,
      office_latitude, office_longitude, radius_m, max_accuracy_m, verified, result, message, user_id)
    values (
      v_emp, case when v_result = 'accepted' then a.id end, v_today, p_kind, p_lat, p_lng, round(p_accuracy, 1), v_dist,
      s.office_latitude, s.office_longitude, s.office_radius_m, s.gps_max_accuracy_m,
      v_gps and v_result = 'accepted', v_result, v_msg, auth.uid());
  end if;

  return jsonb_build_object(
    'ok', v_result = 'accepted', 'result', v_result, 'message', v_msg, 'gps_verified', v_gps and v_result = 'accepted',
    'distance_m', v_dist, 'accuracy_m', case when v_has_location then round(p_accuracy, 1) end,
    'radius_m', s.office_radius_m, 'max_accuracy_m', s.gps_max_accuracy_m,
    'time', case when v_result = 'accepted' then to_char(v_now, 'HH24:MI') end,
    'status', case when v_result = 'accepted' then a.status end,
    'late_minutes', case when v_result = 'accepted' then a.late_minutes end);
end $$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke execute on function public.my_employee_id() from public, anon;
revoke execute on function public.geo_distance_m(numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function public.self_service_context() from public, anon;
revoke execute on function public.self_attendance(text, numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.my_employee_id() to authenticated, service_role;
grant execute on function public.geo_distance_m(numeric, numeric, numeric, numeric) to authenticated, service_role;
grant execute on function public.self_service_context() to authenticated;
grant execute on function public.self_attendance(text, numeric, numeric, numeric, text, text) to authenticated;
grant select on public.attendance_geo_events to authenticated;
grant select on public.office_location_history to authenticated;
