-- =====================================================================
-- ALL SHEBA HRMS — Storage buckets & policies
--   public-assets      : company logo + employee photos (public read, admin write)
--   employee-documents : private HR documents (admin only, signed URLs)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-assets', 'public-assets', true, 5242880,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('employee-documents', 'employee-documents', false, 10485760,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy "public-assets admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-assets' and public.is_admin());
create policy "public-assets admin update" on storage.objects for update to authenticated
  using (bucket_id = 'public-assets' and public.is_admin());
create policy "public-assets admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'public-assets' and public.is_admin());

create policy "documents admin select" on storage.objects for select to authenticated
  using (bucket_id = 'employee-documents' and public.is_admin());
create policy "documents admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-documents' and public.is_admin());
create policy "documents admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-documents' and public.is_admin());
