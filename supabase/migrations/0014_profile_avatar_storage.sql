do $$
begin
  if to_regnamespace('storage') is null then
    raise notice 'storage schema absent: avatar storage migration skipped in plain PostgreSQL CI';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists "avatars_public_read" on storage.objects';
  execute 'create policy "avatars_public_read" on storage.objects for select using (bucket_id = ''avatars'')';

  execute 'drop policy if exists "avatars_own_insert" on storage.objects';
  execute 'create policy "avatars_own_insert" on storage.objects for insert to authenticated with check (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';

  execute 'drop policy if exists "avatars_own_update" on storage.objects';
  execute 'create policy "avatars_own_update" on storage.objects for update to authenticated using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';

  execute 'drop policy if exists "avatars_own_delete" on storage.objects';
  execute 'create policy "avatars_own_delete" on storage.objects for delete to authenticated using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
end $$;
