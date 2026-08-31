-- KEEP Music Match Engine — additive, data-preserving foundation.
-- Existing profiles/KEEP/playlists are never rewritten or deleted.

create index if not exists idx_profiles_favorite_artists_gin
  on public.profiles using gin (favorite_artists);
create index if not exists idx_profiles_favorite_genres_gin
  on public.profiles using gin (favorite_genres);
create index if not exists idx_keep_decisions_profile_decision_track
  on public.keep_decisions (profile_id, decision, track_id);

create or replace function public.keep_profile_match_score(p_target_profile_id uuid)
returns table (
  score integer,
  shared_tracks integer,
  shared_artists text[],
  shared_genres text[],
  viewer_keep_count integer,
  target_keep_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as id
  ), target_ok as (
    select p.id
    from public.profiles p, viewer v
    where p.id = p_target_profile_id
      and p.id <> v.id
      and p.is_public = true
      and coalesce(p.discovery_hidden, false) = false
  ), viewer_tracks as (
    select distinct kd.track_id
    from public.keep_decisions kd, viewer v
    where kd.profile_id = v.id and kd.decision = 'KEPT'
  ), target_tracks as (
    select distinct kd.track_id
    from public.keep_decisions kd
    join target_ok t on t.id = kd.profile_id
    where kd.decision = 'KEPT' and kd.visibility = 'PUBLIC'
  ), track_stats as (
    select
      (select count(*) from viewer_tracks)::int as vc,
      (select count(*) from target_tracks)::int as tc,
      (select count(*) from viewer_tracks v join target_tracks t using (track_id))::int as sc
  ), viewer_artists as (
    select distinct lower(trim(t.artist)) as artist
    from viewer_tracks vt join public.tracks t on t.id = vt.track_id
    where trim(coalesce(t.artist,'')) <> ''
  ), target_artists as (
    select distinct lower(trim(t.artist)) as artist
    from target_tracks tt join public.tracks t on t.id = tt.track_id
    where trim(coalesce(t.artist,'')) <> ''
  ), artist_shared as (
    select va.artist from viewer_artists va join target_artists ta using (artist) order by va.artist limit 8
  ), artist_stats as (
    select
      (select count(*) from viewer_artists)::numeric as vc,
      (select count(*) from target_artists)::numeric as tc,
      (select count(*) from viewer_artists va join target_artists ta using (artist))::numeric as sc
  ), viewer_genres as (
    select distinct lower(trim(g.genre)) as genre
    from viewer_tracks vt join public.tracks t on t.id = vt.track_id
    cross join lateral unnest(coalesce(t.genres,'{}'::text[])) g(genre)
    where trim(g.genre) <> ''
  ), target_genres as (
    select distinct lower(trim(g.genre)) as genre
    from target_tracks tt join public.tracks t on t.id = tt.track_id
    cross join lateral unnest(coalesce(t.genres,'{}'::text[])) g(genre)
    where trim(g.genre) <> ''
  ), genre_shared as (
    select vg.genre from viewer_genres vg join target_genres tg using (genre) order by vg.genre limit 8
  ), genre_stats as (
    select
      (select count(*) from viewer_genres)::numeric as vc,
      (select count(*) from target_genres)::numeric as tc,
      (select count(*) from viewer_genres vg join target_genres tg using (genre))::numeric as sc
  ), components as (
    select
      ts.vc::int viewer_keep_count,
      ts.tc::int target_keep_count,
      ts.sc::int shared_tracks,
      case when least(ts.vc,ts.tc) > 0 then ts.sc::numeric / least(ts.vc,ts.tc) else 0 end track_overlap,
      case when least(a.vc,a.tc) > 0 then a.sc / least(a.vc,a.tc) else 0 end artist_overlap,
      case when least(g.vc,g.tc) > 0 then g.sc / least(g.vc,g.tc) else 0 end genre_overlap
    from track_stats ts cross join artist_stats a cross join genre_stats g
  )
  select
    least(100, greatest(0, round(100 * (0.50*c.track_overlap + 0.30*c.artist_overlap + 0.20*c.genre_overlap))))::int,
    c.shared_tracks,
    coalesce((select array_agg(artist) from artist_shared), '{}'::text[]),
    coalesce((select array_agg(genre) from genre_shared), '{}'::text[]),
    c.viewer_keep_count,
    c.target_keep_count
  from components c
  where exists (select 1 from target_ok);
$$;

create or replace function public.keep_discovery_match_candidates(p_limit integer default 24)
returns table (
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  city text,
  country_code char(2),
  match_score integer,
  shared_tracks integer,
  shared_artists text[],
  shared_genres text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
  v_artists text[];
  v_genres text[];
begin
  if v_id is null then return; end if;
  select coalesce(favorite_artists,'{}'::text[]), coalesce(favorite_genres,'{}'::text[])
    into v_artists, v_genres
  from public.profiles where id = v_id;

  return query
  with candidates as (
    select p.id,p.username,p.display_name,p.avatar_url,p.city,p.country_code
    from public.profiles p
    where p.id <> v_id
      and p.is_public = true
      and coalesce(p.discovery_hidden,false) = false
      and (
        (cardinality(v_artists) > 0 and p.favorite_artists && v_artists)
        or (cardinality(v_genres) > 0 and p.favorite_genres && v_genres)
      )
    order by
      case when p.country_code = (select country_code from public.profiles where id=v_id) then 0 else 1 end,
      p.updated_at desc
    limit greatest(1, least(coalesce(p_limit,24), 100)) * 3
  ), scored as (
    select c.*, m.score, m.shared_tracks, m.shared_artists, m.shared_genres
    from candidates c
    cross join lateral public.keep_profile_match_score(c.id) m
  )
  select s.id,s.username,s.display_name,s.avatar_url,s.city,s.country_code,
         s.score,s.shared_tracks,s.shared_artists,s.shared_genres
  from scored s
  order by s.score desc, s.shared_tracks desc, s.username
  limit greatest(1, least(coalesce(p_limit,24), 100));
end;
$$;

grant execute on function public.keep_profile_match_score(uuid) to authenticated;
grant execute on function public.keep_discovery_match_candidates(integer) to authenticated;
