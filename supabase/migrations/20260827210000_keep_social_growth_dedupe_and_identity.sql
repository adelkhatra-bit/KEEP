-- KEEP — dédoublonnage définitif + boucle sociale sans crédit.
-- 1) Une chanson sans ISRC ne peut plus être créée deux fois par une course réseau.
-- 2) Un profil ne peut plus posséder deux décisions KEPT pour le même track.
-- 3) Les KEEP copiés depuis un autre profil conservent l'origine et notifient la source.

create or replace function public.keep_track_identity(p_title text, p_artist text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select lower(regexp_replace(trim(coalesce(p_title, '')), '[[:space:]]+', ' ', 'g'))
      || '|' ||
         lower(regexp_replace(trim(coalesce(p_artist, '')), '[[:space:]]+', ' ', 'g'));
$$;

revoke all on function public.keep_track_identity(text, text) from public;

-- Fusionne d'abord les doublons de catalogue sans ISRC.
-- Ne pas utiliser ON COMMIT DROP ici : le vérificateur PostgreSQL exécute le
-- fichier statement par statement en autocommit. La table temporaire doit
-- rester vivante pendant toute la session de cette migration.
create temporary table _keep_track_merge as
with ranked as (
  select
    id,
    first_value(id) over (
      partition by public.keep_track_identity(title, artist)
      order by created_at asc, id asc
    ) as canonical_id,
    row_number() over (
      partition by public.keep_track_identity(title, artist)
      order by created_at asc, id asc
    ) as rn
  from public.tracks
  where isrc is null
)
select id as old_id, canonical_id
from ranked
where rn > 1;

insert into public.playlist_tracks(playlist_id, track_id, added_at, added_via)
select pt.playlist_id, m.canonical_id, pt.added_at, pt.added_via
from public.playlist_tracks pt
join _keep_track_merge m on m.old_id = pt.track_id
on conflict (playlist_id, track_id) do nothing;

delete from public.playlist_tracks pt
using _keep_track_merge m
where pt.track_id = m.old_id;

insert into public.track_likes(profile_id, track_id, created_at)
select tl.profile_id, m.canonical_id, tl.created_at
from public.track_likes tl
join _keep_track_merge m on m.old_id = tl.track_id
on conflict (profile_id, track_id) do nothing;

delete from public.track_likes tl
using _keep_track_merge m
where tl.track_id = m.old_id;

update public.keep_fingerprints kf
set track_id = m.canonical_id
from _keep_track_merge m
where kf.track_id = m.old_id;

update public.keep_decisions kd
set track_id = m.canonical_id
from _keep_track_merge m
where kd.track_id = m.old_id;

delete from public.tracks t
using _keep_track_merge m
where t.id = m.old_id;

-- En cas d'anciens doubles KEEP, la décision la plus récente est conservée.
create temporary table _keep_decision_merge as
with ranked as (
  select
    id,
    first_value(id) over (
      partition by profile_id, track_id
      order by created_at desc, id desc
    ) as keep_id,
    row_number() over (
      partition by profile_id, track_id
      order by created_at desc, id desc
    ) as rn
  from public.keep_decisions
  where decision = 'KEPT'
)
select id as old_id, keep_id
from ranked
where rn > 1;

-- Conserve l'attribution si elle existait sur une ancienne ligne.
update public.keep_decisions kept
set
  source_user_id = coalesce(kept.source_user_id, old.source_user_id),
  source_type = coalesce(kept.source_type, old.source_type),
  context = coalesce(old.context, '{}'::jsonb) || coalesce(kept.context, '{}'::jsonb)
from _keep_decision_merge m
join public.keep_decisions old on old.id = m.old_id
where kept.id = m.keep_id;

-- Conserve aussi les marqueurs de notifications déjà envoyées avant suppression.
insert into public.profile_music_notification_sends(decision_id, follower_id, created_at)
select m.keep_id, s.follower_id, s.created_at
from public.profile_music_notification_sends s
join _keep_decision_merge m on m.old_id = s.decision_id
on conflict (decision_id, follower_id) do nothing;

delete from public.keep_decisions kd
using _keep_decision_merge m
where kd.id = m.old_id;

-- Barrières base de données : même si deux appareils cliquent en même temps,
-- PostgreSQL devient la dernière autorité et refuse le doublon.
create unique index if not exists keep_decisions_one_kept_track_per_profile_uidx
  on public.keep_decisions(profile_id, track_id)
  where decision = 'KEPT';

create unique index if not exists tracks_no_isrc_identity_uidx
  on public.tracks(public.keep_track_identity(title, artist))
  where isrc is null;

-- Notification sociale : lorsqu'un utilisateur reprend une musique depuis le
-- profil d'un autre utilisateur, le propriétaire direct du profil source le sait.
create or replace function public.notify_source_on_profile_keep_copy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_profile_id uuid;
  v_origin_profile_id uuid;
  v_copier_username text;
  v_origin_username text;
  v_title text;
  v_artist text;
  v_social_enabled boolean;
  v_source_text text;
begin
  if new.decision <> 'KEPT' or new.source_type <> 'profile' then
    return new;
  end if;

  v_source_text := coalesce(new.context ->> 'sourceProfileId', '');
  if v_source_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;

  v_source_profile_id := v_source_text::uuid;
  if v_source_profile_id = new.profile_id then
    return new;
  end if;

  v_origin_profile_id := coalesce(new.source_user_id, v_source_profile_id);

  select username into v_copier_username
  from public.profiles where id = new.profile_id;

  select username into v_origin_username
  from public.profiles where id = v_origin_profile_id;

  select title, artist into v_title, v_artist
  from public.tracks where id = new.track_id;

  select coalesce(np.social_enabled, true) into v_social_enabled
  from public.profiles p
  left join public.notification_preferences np on np.profile_id = p.id
  where p.id = v_source_profile_id;

  if coalesce(v_social_enabled, true) then
    insert into public.notifications(profile_id, type, title, body, data)
    values (
      v_source_profile_id,
      'MUSIC_TAKEN',
      '@' || coalesce(v_copier_username, 'un membre KEEP') || ' a gardé ton morceau',
      trim(both ' ' from coalesce(v_title, 'Un morceau') ||
        case when coalesce(v_artist, '') <> '' then ' — ' || v_artist else '' end ||
        '. Ouvre son profil pour découvrir son univers musical.'),
      jsonb_build_object(
        'viewerProfileId', new.profile_id,
        'username', v_copier_username,
        'sourceProfileId', v_source_profile_id,
        'originProfileId', v_origin_profile_id,
        'originUsername', v_origin_username,
        'trackId', new.track_id,
        'decisionId', new.id,
        'kind', 'music_taken'
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_source_on_profile_keep_copy() from public;

drop trigger if exists trg_notify_source_on_profile_keep_copy on public.keep_decisions;
create trigger trg_notify_source_on_profile_keep_copy
after insert on public.keep_decisions
for each row execute function public.notify_source_on_profile_keep_copy();