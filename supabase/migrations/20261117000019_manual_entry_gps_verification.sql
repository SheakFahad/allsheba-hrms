-- =====================================================================
-- Manual attendance entered by an admin / entry operator INSIDE the office
-- counts as GPS-verified.
--
--  * staff_mark_gps(attendance_id, lat, lng, accuracy): called right after a
--    manual save. The server checks the recorder's own device location against
--    the office (radius + accuracy). Only if it is inside, the record's
--    entry_method becomes 'self_gps' (shown as GPS ✓). Every attempt is logged
--    in attendance_geo_events with the recorder's user id.
--  * Entry operators may still edit records they entered themselves after
--    such a verification (previously only entry_method = 'operator').
--
-- ADDITIVE ONLY: one new function and one re-created update policy (same
-- rules plus "or entered_by = the operator"). No row is changed here.
-- =====================================================================

create or replace function public.staff_mark_gps(
  p_attendance uuid, p_lat numeric, p_lng numeric, p_accuracy numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s      public.company_settings;
  a      public.attendance;
  v_dist numeric;
  v_result text;
  v_msg  text;
begin
  if not public.is_staff() then
    raise exception 'Only an administrator or entry operator can do this.';
  end if;
  select * into a from public.attendance where id = p_attendance;
  if a.id is null then
    raise exception 'Attendance record not found.';
  end if;
  if p_lat is null or p_lng is null or p_accuracy is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy < 0 then
    raise exception 'Invalid location data.';
  end if;

  select * into s from public.company_settings where id = 1;
  if s.office_latitude is null or s.office_longitude is null then
    v_result := 'not_configured';
    v_msg := 'The office location has not been set yet.';
  else
    v_dist := round(public.geo_distance_m(p_lat, p_lng, s.office_latitude, s.office_longitude), 1);
    if p_accuracy > s.gps_max_accuracy_m then
      v_result := 'low_accuracy';
      v_msg := format('Location accuracy is %s m; at most %s m is required.', round(p_accuracy), s.gps_max_accuracy_m);
    elsif v_dist > s.office_radius_m then
      v_result := 'outside_radius';
      v_msg := format('You are %s m from the office (allowed %s m).', round(v_dist), s.office_radius_m);
    elsif a.actual_in is null then
      v_result := 'duplicate';
      v_msg := 'Only records with an in-time can be GPS-verified.';
    else
      v_result := 'accepted';
      v_msg := 'Recorded by the office inside the office location.';
      update public.attendance set entry_method = 'self_gps' where id = a.id;
    end if;
  end if;

  -- A staff-entered record saved again from OUTSIDE the office is no longer GPS-verified.
  -- (An employee's own GPS check-in is never downgraded here.)
  if v_result <> 'accepted' and a.entry_method = 'self_gps'
     and a.entered_by is distinct from (select id from public.profiles where employee_id = a.employee_id) then
    update public.attendance set entry_method = 'operator' where id = a.id;
  end if;

  insert into public.attendance_geo_events (
    employee_id, attendance_id, attendance_date, kind, latitude, longitude, accuracy_m, distance_m,
    office_latitude, office_longitude, radius_m, max_accuracy_m, verified, result, message, user_id)
  values (
    a.employee_id, case when v_result = 'accepted' then a.id end, a.attendance_date,
    case when a.actual_out is not null then 'check_out' else 'check_in' end,
    p_lat, p_lng, round(p_accuracy, 1), v_dist,
    s.office_latitude, s.office_longitude, s.office_radius_m, s.gps_max_accuracy_m,
    v_result = 'accepted', v_result, v_msg, auth.uid());

  return jsonb_build_object('ok', v_result = 'accepted', 'result', v_result, 'message', v_msg, 'distance_m', v_dist);
end $$;

revoke execute on function public.staff_mark_gps(uuid, numeric, numeric, numeric) from public, anon;
grant execute on function public.staff_mark_gps(uuid, numeric, numeric, numeric) to authenticated;

drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (
    public.is_admin()
    or (public.is_entry()
        and not is_locked
        and source = 'entry'
        and (entry_method = 'operator' or entered_by = auth.uid())
        and attendance_date >= public.local_today()
             - (select entry_edit_days from public.company_settings where id = 1))
  )
  with check (
    public.is_admin()
    or (public.is_entry()
        and attendance_date >= public.local_today()
             - (select entry_edit_days from public.company_settings where id = 1))
  );
