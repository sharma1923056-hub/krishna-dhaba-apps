-- =====================================================================
-- Krishna Dhaba  |  Migration 004: image storage + Realtime
-- =====================================================================

-- ---------- Storage bucket for food images and logo ----------
-- Public bucket (anyone can VIEW images); only staff can upload/change/delete.
-- Files must be stored under a folder named after the restaurant id:
--   <restaurant_id>/<filename>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safely checks "is the caller staff of the restaurant named by the first folder?"
create or replace function public.can_manage_storage_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
begin
  begin
    v_restaurant_id := ((storage.foldername(p_name))[1])::uuid;
  exception when others then
    return false;
  end;
  return public.is_staff(v_restaurant_id);
end;
$$;

revoke all on function public.can_manage_storage_path(text) from public, anon;
grant execute on function public.can_manage_storage_path(text) to authenticated;

drop policy if exists "menu images are public" on storage.objects;
create policy "menu images are public" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-images');

drop policy if exists "staff upload menu images" on storage.objects;
create policy "staff upload menu images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and public.can_manage_storage_path(name));

drop policy if exists "staff update menu images" on storage.objects;
create policy "staff update menu images" on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and public.can_manage_storage_path(name))
  with check (bucket_id = 'menu-images' and public.can_manage_storage_path(name));

drop policy if exists "staff delete menu images" on storage.objects;
create policy "staff delete menu images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and public.can_manage_storage_path(name));

-- ---------- Realtime ----------
-- Realtime respects the RLS policies above: a customer only receives events
-- for their own orders; staff receive events for their restaurant's orders.
do $$
declare t text;
begin
  foreach t in array array['orders', 'products', 'categories', 'restaurant_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
