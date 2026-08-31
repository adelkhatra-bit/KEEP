-- KEEP — liens de profil publics permanents.
--
-- Un lien /share-profile/?u=<pseudo> déjà envoyé ne doit jamais devenir une
-- page blanche ou pointer vers un autre utilisateur si le propriétaire change
-- ensuite de pseudo. Chaque ancien pseudo reste donc réservé et résout vers le
-- même profile_id. Le domaine et le format de lien public restent inchangés.

create table if not exists public.profile_username_aliases (
  alias text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (alias),
  constraint profile_username_alias_length check (char_length(alias) between 3 and 30)
);

create unique index if not exists profile_username_aliases_lower_uidx
  on public.profile_username_aliases (lower(alias));
create index if not exists profile_username_aliases_profile_idx
  on public.profile_username_aliases (profile_id);

-- Tous les pseudos actuels deviennent immédiatement des liens permanents.
insert into public.profile_username_aliases(alias, profile_id)
select username, id from public.profiles
where username is not null and char_length(username) between 3 and 30
on conflict do nothing;

alter table public.profile_username_aliases enable row level security;
revoke all on public.profile_username_aliases from anon, authenticated;
grant select on public.profile_username_aliases to anon, authenticated;

drop policy if exists profile_username_aliases_public_read on public.profile_username_aliases;
create policy profile_username_aliases_public_read
on public.profile_username_aliases
for select
to anon, authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_username_aliases.profile_id
      and p.is_public = true
  )
);

-- Interdit à un autre compte de reprendre un ancien pseudo : sinon un ancien
-- lien partagé pourrait être détourné vers la mauvaise personne.
create or replace function public.keep_guard_reserved_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflicting_profile uuid;
begin
  new.username := btrim(new.username);
  select a.profile_id into conflicting_profile
  from public.profile_username_aliases a
  where lower(a.alias) = lower(new.username)
    and a.profile_id <> new.id
  limit 1;

  if conflicting_profile is not null then
    raise exception using errcode = '23505', message = 'username_reserved_by_previous_profile';
  end if;
  return new;
end;
$$;

-- Capture automatiquement le pseudo actuel ET l'ancien à chaque changement.
create or replace function public.keep_capture_username_alias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.username is distinct from new.username then
    insert into public.profile_username_aliases(alias, profile_id)
    values (old.username, new.id)
    on conflict do nothing;
  end if;

  insert into public.profile_username_aliases(alias, profile_id)
  values (new.username, new.id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.keep_guard_reserved_username() from public, anon, authenticated;
revoke all on function public.keep_capture_username_alias() from public, anon, authenticated;

drop trigger if exists keep_profiles_reserved_username on public.profiles;
create trigger keep_profiles_reserved_username
before insert or update of username on public.profiles
for each row execute function public.keep_guard_reserved_username();

drop trigger if exists keep_profiles_username_alias on public.profiles;
create trigger keep_profiles_username_alias
after insert or update of username on public.profiles
for each row execute function public.keep_capture_username_alias();
