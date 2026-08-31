-- KEEP — confidentialité profil propriétaire.
--
-- L'onglet KEEP du profil doit représenter exactement ce qui est visible sur
-- le profil public. Les morceaux PRIVÉ restent comptés dans
-- keep_own_profile_snapshot(), mais ne sont jamais renvoyés par la liste
-- utilisée pour dessiner le profil.

create or replace function public.keep_own_profile_tracks(
  p_limit integer default 250,
  p_offset integer default 0
)
returns table(
  decision_id uuid,
  kept_at timestamptz,
  visibility text,
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
set search_path = public, auth
as $$
  with latest as (
    select distinct on (kd.track_id)
      kd.id as decision_id,
      kd.created_at as kept_at,
      kd.visibility::text as visibility,
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
    join public.tracks t on t.id = kd.track_id
    where kd.profile_id = auth.uid()
      and kd.decision = 'KEPT'
    order by kd.track_id, kd.created_at desc, kd.id desc
  )
  select
    decision_id,
    kept_at,
    visibility,
    track_id,
    isrc,
    title,
    artist,
    album,
    duration_sec,
    artwork_url,
    genres,
    provider_ids,
    preview_url,
    external_urls,
    available_on,
    context,
    source_user_id,
    source_type
  from latest
  where visibility = 'PUBLIC'
  order by kept_at desc, decision_id desc
  limit least(greatest(coalesce(p_limit, 250), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.keep_own_profile_tracks(integer, integer) from public;
revoke all on function public.keep_own_profile_tracks(integer, integer) from anon;
revoke all on function public.keep_own_profile_tracks(integer, integer) from authenticated;
grant execute on function public.keep_own_profile_tracks(integer, integer) to authenticated;
