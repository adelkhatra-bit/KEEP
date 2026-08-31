-- KEEP 2026-08-27
-- 1) Diagnostic client minimal pour que le Super Admin puisse voir les erreurs
--    réelles de micro/reconnaissance d'un compte connecté.
-- 2) Notification automatique aux abonnés lorsqu'un KEEP devient PUBLIC.

create table if not exists public.client_diagnostics (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  area text not null,
  code text not null,
  message text not null,
  platform text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists client_diagnostics_profile_created_idx
  on public.client_diagnostics(profile_id, created_at desc);

alter table public.client_diagnostics enable row level security;

drop policy if exists client_diagnostics_insert_own on public.client_diagnostics;
create policy client_diagnostics_insert_own
  on public.client_diagnostics
  for insert
  to authenticated
  with check (profile_id = auth.uid());

drop policy if exists client_diagnostics_select_own on public.client_diagnostics;
create policy client_diagnostics_select_own
  on public.client_diagnostics
  for select
  to authenticated
  using (profile_id = auth.uid());

create table if not exists public.profile_music_notification_sends (
  decision_id uuid not null references public.keep_decisions(id) on delete cascade,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (decision_id, follower_id)
);

alter table public.profile_music_notification_sends enable row level security;

create or replace function public.notify_followers_on_public_keep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_title text;
  v_artist text;
  v_follower record;
begin
  if new.decision <> 'KEPT' or new.visibility <> 'PUBLIC' then
    return new;
  end if;

  -- Une simple mise à jour d'un KEEP déjà public ne doit jamais renvoyer la
  -- notification. On notifie seulement à la création PUBLIC ou au passage
  -- PRIVÉ -> PUBLIC.
  if tg_op = 'UPDATE'
     and old.decision = 'KEPT'
     and old.visibility = 'PUBLIC' then
    return new;
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = new.profile_id;

  select t.title, t.artist into v_title, v_artist
  from public.tracks t
  where t.id = new.track_id;

  for v_follower in
    select f.follower_id
    from public.follows f
    left join public.notification_preferences np
      on np.profile_id = f.follower_id
    where f.followee_id = new.profile_id
      and coalesce(np.social_enabled, true) = true
  loop
    insert into public.profile_music_notification_sends(decision_id, follower_id)
    values (new.id, v_follower.follower_id)
    on conflict do nothing;

    if found then
      insert into public.notifications(profile_id, type, title, body, data)
      values (
        v_follower.follower_id,
        'NEW_PUBLIC_KEEP',
        '@' || coalesce(v_username, 'KEEP') || ' a ajouté une musique',
        trim(both ' ' from coalesce(v_title, 'Nouveau KEEP') || case when v_artist is not null and v_artist <> '' then ' — ' || v_artist else '' end),
        jsonb_build_object(
          'ownerProfileId', new.profile_id,
          'username', v_username,
          'trackId', new.track_id,
          'decisionId', new.id,
          'kind', 'new_public_keep'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_followers_on_public_keep() from public;

DROP TRIGGER IF EXISTS trg_notify_followers_on_public_keep ON public.keep_decisions;
create trigger trg_notify_followers_on_public_keep
after insert or update of decision, visibility on public.keep_decisions
for each row execute function public.notify_followers_on_public_keep();
