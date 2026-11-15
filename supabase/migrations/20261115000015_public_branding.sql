-- =====================================================================
-- Company branding (name, logo, contact line) for every signed-in user.
--
-- company_settings stays readable by staff only (RLS unchanged). Employees
-- need just the public branding for their portal header, so this function
-- returns only those fields. ADDITIVE ONLY: one new function, no table or
-- row is changed.
-- =====================================================================

create or replace function public.company_branding()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'company_name', s.company_name, 'tagline', s.tagline, 'address', s.address, 'phone', s.phone,
    'email', s.email, 'website', s.website, 'logo_path', s.logo_path, 'report_footer', s.report_footer)
    from public.company_settings s
   where s.id = 1
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
$$;

revoke execute on function public.company_branding() from public, anon;
grant execute on function public.company_branding() to authenticated;
