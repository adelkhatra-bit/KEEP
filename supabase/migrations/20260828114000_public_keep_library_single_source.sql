-- KEEP — bibliothèque publique canonique par profil.
-- Objectif : compteur, liste, Swipe et ADN doivent lire exactement les mêmes morceaux.
-- Une même piste gardée plusieurs fois n'apparait qu'une fois (la décision publique la plus récente gagne).
-- La requête reste indexée par profil pour tenir la charge lorsque la base grandit.

create index if not exists idx_keep_decisions_public_profile_track_latest
on public.keep_decisions (profile_id, track_id, created_at desc)
where decision = 'KEPT' and visibility = 'PUBLIC';

drop function if exists public.keep_public_profile_tracks(uuid, integer, integer);
create function public.keep_public_profile_tracks(
  p_profile_id uuid,
  p_limit integer default 250,
  p_offset integer default 0
)
returns table(
  decision_id uuid,
  kept_at timestamptz,
  track_id uuid,
  isrc text,
  title text,
  artist text,
  album text,
  duration_sec integer,
  artwork_url text,
  genres text[],
  provider_ids jsonb,
  preview_url text,
  external_urls jsonb,
  available_on text[],
  context jsonb,
  source_user_id uuid,
  source_type text
)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (kd.track_id)
      kd.id as decision_id,
      kd.created_at as kept_at,
      kd.track_id,
      t.isrc,
      t.title,
      t.artist,
      t.album,
      t.duration_sec,
      t.artwork_url,
      t.genres,
      t.provider_ids,
      t.preview_url,
      t.external_urls,
      t.available_on,
      kd.context,
      kd.source_user_id,
      kd.source_type::text as source_type
    from public.keep_decisions kd
    join public.profiles p on p.id = kd.profile_id
    join public.tracks t on t.id = kd.track_id
    where kd.profile_id = p_profile_id
      and p.is_public = true
      and kd.decision = 'KEPT'
      and kd.visibility = 'PUBLIC'
    order by kd.track_id, kd.created_at desc, kd.id desc
  )
  select *
  from latest
  order by kept_at desc, decision_id desc
  limit least(greatest(coalesce(p_limit, 250), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.keep_public_profile_tracks(uuid, integer, integer) from public;
grant execute on function public.keep_public_profile_tracks(uuid, integer, integer) to anon, authenticated;
