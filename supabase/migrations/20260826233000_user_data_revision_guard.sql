-- KEEP — garde-fou de données utilisateur.
--
-- Une mise à jour de l'application ne doit jamais rendre irrécupérable un
-- profil déjà complété. Le client protège désormais les sauvegardes de fond ;
-- cette seconde barrière conserve aussi, côté Supabase, la version précédente
-- de chaque ligne avant UPDATE/DELETE sur les données de profil.
--
-- La table est strictement privée : anon/authenticated n'ont aucun accès.
-- Elle sert uniquement à une restauration support/admin si une future version
-- introduisait malgré tout une écriture destructive.

create table if not exists public.user_data_revision_log (
  id bigint generated always as identity primary key,
  profile_id uuid not null,
  source_table text not null check (source_table in ('profiles','profile_private_info','social_links')),
  operation text not null check (operation in ('UPDATE','DELETE')),
  row_data jsonb not null,
  captured_at timestamptz not null default now()
);

create index if not exists user_data_revision_log_profile_captured_idx
  on public.user_data_revision_log (profile_id, captured_at desc);

alter table public.user_data_revision_log enable row level security;
revoke all on public.user_data_revision_log from anon, authenticated;
grant all on public.user_data_revision_log to service_role;

create or replace function public.keep_capture_user_data_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    owner_id := old.id;
  else
    owner_id := old.profile_id;
  end if;

  insert into public.user_data_revision_log(profile_id, source_table, operation, row_data)
  values (owner_id, tg_table_name, tg_op, to_jsonb(old));

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_capture_user_data_revision() from public, anon, authenticated;
grant execute on function public.keep_capture_user_data_revision() to service_role;

drop trigger if exists keep_profiles_revision_guard on public.profiles;
create trigger keep_profiles_revision_guard
before update or delete on public.profiles
for each row execute function public.keep_capture_user_data_revision();

drop trigger if exists keep_profile_private_revision_guard on public.profile_private_info;
create trigger keep_profile_private_revision_guard
before update or delete on public.profile_private_info
for each row execute function public.keep_capture_user_data_revision();

drop trigger if exists keep_social_links_revision_guard on public.social_links;
create trigger keep_social_links_revision_guard
before update or delete on public.social_links
for each row execute function public.keep_capture_user_data_revision();
