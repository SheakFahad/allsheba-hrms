-- =====================================================================
-- Employee self check-out on a check-in recorded by the office.
--
-- Before: if the operator recorded today's check-in, the employee could not
-- check out themselves. Now they can add a (GPS-verified) check-out to it.
-- The check-in stays as recorded by the office (entry_method unchanged); the
-- check-out is logged in attendance_geo_events and last_change_reason.
-- Locked (closed) days still cannot be changed by the employee.
--
-- ADDITIVE ONLY: one CREATE OR REPLACE of self_attendance(), identical to
-- 0012 except this rule. No table or row is changed.
-- =====================================================================

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
      elsif a.is_locked then
        v_result := 'duplicate';
        v_msg := 'Today''s attendance is closed. Please ask the office to change it.';
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
