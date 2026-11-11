-- =====================================================================
-- ALL SHEBA HRMS — Default configuration (idempotent)
-- Configuration only. No employees or sample/mock data are created.
-- Every value here is editable from the Admin panel.
-- =====================================================================

insert into public.company_settings (id) values (1) on conflict (id) do nothing;

insert into public.shifts (name, start_time, end_time, grace_minutes, is_default)
select 'General Shift', '10:00', '19:00', 0, true
where not exists (select 1 from public.shifts);

-- Common Bangladesh leave categories (Labour Act 2006). Adjust in Leave settings.
insert into public.leave_types (name, code, days_per_year, is_paid, allow_half_day, color)
select * from (values
  ('Casual Leave', 'CL', 10::numeric, true,  true,  '#2a86c2'),
  ('Sick Leave',   'SL', 14::numeric, true,  true,  '#0f9d76'),
  ('Annual Leave', 'AL', 0::numeric,  true,  false, '#30338a'),
  ('Unpaid Leave', 'UL', 0::numeric,  false, true,  '#9a6b00')
) v(name, code, days, paid, half, color)
where not exists (select 1 from public.leave_types);

-- Public branding for the sign-in page (name, tagline, logo only — nothing sensitive).
create or replace function public.public_branding()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('company_name', company_name, 'tagline', tagline, 'logo_path', logo_path)
    from public.company_settings where id = 1
$$;
revoke execute on function public.public_branding() from public;
grant execute on function public.public_branding() to anon, authenticated;
