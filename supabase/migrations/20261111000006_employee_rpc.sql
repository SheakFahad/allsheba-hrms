-- =====================================================================
-- ALL SHEBA HRMS — Atomic employee save (core + personal + initial salary)
-- SECURITY INVOKER: RLS and all triggers apply to the calling admin.
-- =====================================================================

create or replace function public.save_employee(p_id uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can manage employees.';
  end if;

  if p_id is null then
    insert into public.employees (full_name, phone, designation_id, department_id, shift_id,
                                  joining_date, employment_type, status, photo_path)
    values (p ->> 'full_name', nullif(p ->> 'phone', ''),
            nullif(p ->> 'designation_id', '')::uuid, nullif(p ->> 'department_id', '')::uuid,
            nullif(p ->> 'shift_id', '')::uuid, (p ->> 'joining_date')::date,
            (p ->> 'employment_type')::public.employment_type, (p ->> 'status')::public.employment_status,
            nullif(p ->> 'photo_path', ''))
    returning id into v_id;
  else
    update public.employees set
      full_name       = p ->> 'full_name',
      phone           = nullif(p ->> 'phone', ''),
      designation_id  = nullif(p ->> 'designation_id', '')::uuid,
      department_id   = nullif(p ->> 'department_id', '')::uuid,
      shift_id        = nullif(p ->> 'shift_id', '')::uuid,
      joining_date    = (p ->> 'joining_date')::date,
      employment_type = (p ->> 'employment_type')::public.employment_type,
      status          = (p ->> 'status')::public.employment_status,
      photo_path      = nullif(p ->> 'photo_path', '')
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Employee not found.';
    end if;
  end if;

  insert into public.employee_personal as ep (employee_id, email, address, date_of_birth, national_id,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation, notes)
  values (v_id, nullif(p ->> 'email', ''), nullif(p ->> 'address', ''), nullif(p ->> 'date_of_birth', '')::date,
          nullif(p ->> 'national_id', ''), nullif(p ->> 'emergency_contact_name', ''),
          nullif(p ->> 'emergency_contact_phone', ''), nullif(p ->> 'emergency_contact_relation', ''),
          nullif(p ->> 'notes', ''))
  on conflict (employee_id) do update set
    email = excluded.email, address = excluded.address, date_of_birth = excluded.date_of_birth,
    national_id = excluded.national_id, emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_relation = excluded.emergency_contact_relation, notes = excluded.notes;

  if p_id is null and coalesce(p ->> 'basic_salary', '') <> '' then
    insert into public.salary_structures (employee_id, effective_from, basic_salary, allowances, notes)
    values (v_id, (p ->> 'joining_date')::date, (p ->> 'basic_salary')::numeric,
            coalesce(nullif(p ->> 'allowances', '')::numeric, 0), 'Initial salary');
  end if;
  return v_id;
end $$;

revoke execute on function public.save_employee(uuid, jsonb) from public, anon;
grant execute on function public.save_employee(uuid, jsonb) to authenticated;
