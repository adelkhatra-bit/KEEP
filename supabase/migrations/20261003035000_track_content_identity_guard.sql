-- Loki Music · identité réelle d'un morceau.
-- Ne jamais fusionner deux contenus sur titre + artiste : une version live,
-- reprise, remix ou chanson aux paroles différentes doit rester distincte.

drop index if exists public.tracks_no_isrc_identity_uidx;
drop index if exists public.keep_fingerprint_tracks_title_artist_key;

alter table public.keep_fingerprint_tracks
  add column if not exists isrc text;

create index if not exists keep_fingerprint_tracks_isrc_idx
  on public.keep_fingerprint_tracks (upper(isrc))
  where nullif(trim(isrc),'') is not null;

create index if not exists keep_fingerprint_tracks_apple_idx
  on public.keep_fingerprint_tracks ((provider_ids->>'appleMusic'))
  where nullif(provider_ids->>'appleMusic','') is not null;

create index if not exists keep_fingerprint_tracks_spotify_idx
  on public.keep_fingerprint_tracks ((provider_ids->>'spotify'))
  where nullif(provider_ids->>'spotify','') is not null;

create index if not exists keep_fingerprint_tracks_deezer_idx
  on public.keep_fingerprint_tracks ((provider_ids->>'deezer'))
  where nullif(provider_ids->>'deezer','') is not null;

create or replace function public.keep_tracks_same_content(p_left uuid, p_right uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with a as (
    select id, upper(nullif(trim(isrc),'')) isrc, provider_ids, nullif(trim(preview_url),'') preview_url
    from public.tracks where id=p_left
  ), b as (
    select id, upper(nullif(trim(isrc),'')) isrc, provider_ids, nullif(trim(preview_url),'') preview_url
    from public.tracks where id=p_right
  )
  select coalesce((
    select
      a.id=b.id
      or (a.isrc is not null and b.isrc is not null and a.isrc=b.isrc)
      or (nullif(a.provider_ids->>'appleMusic','') is not null and a.provider_ids->>'appleMusic'=b.provider_ids->>'appleMusic')
      or (nullif(a.provider_ids->>'spotify','') is not null and a.provider_ids->>'spotify'=b.provider_ids->>'spotify')
      or (nullif(a.provider_ids->>'deezer','') is not null and a.provider_ids->>'deezer'=b.provider_ids->>'deezer')
      or (nullif(a.provider_ids->>'itunes','') is not null and a.provider_ids->>'itunes'=b.provider_ids->>'itunes')
      or (a.preview_url is not null and b.preview_url is not null and a.preview_url=b.preview_url)
    from a cross join b
  ), false);
$$;

revoke all on function public.keep_tracks_same_content(uuid,uuid) from public, anon;
grant execute on function public.keep_tracks_same_content(uuid,uuid) to authenticated, service_role;

create or replace function public.keep_reject_duplicate_music_content()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.decision <> 'KEPT' then return new; end if;

  if exists (
    select 1
    from public.keep_decisions kd
    where kd.profile_id=new.profile_id
      and kd.decision='KEPT'
      and kd.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
      and public.keep_tracks_same_content(kd.track_id,new.track_id)
  ) then
    raise exception 'DUPLICATE_MUSIC_CONTENT';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_keep_reject_duplicate_music_content on public.keep_decisions;
create trigger trg_keep_reject_duplicate_music_content
before insert or update of profile_id,track_id,decision on public.keep_decisions
for each row execute function public.keep_reject_duplicate_music_content();

create or replace function public.service_catalog_track_from_recognition(
  p_title text,
  p_artist text,
  p_isrc text default null,
  p_album text default null,
  p_artwork_url text default null,
  p_preview_url text default null,
  p_provider_ids jsonb default '{}'::jsonb,
  p_external_urls jsonb default '{}'::jsonb,
  p_available_on text[] default '{}'::text[],
  p_genres text[] default '{}'::text[],
  p_release_year smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text := nullif(trim(coalesce(p_title,'')),'');
  v_artist text := nullif(trim(coalesce(p_artist,'')),'');
  v_isrc text := nullif(upper(trim(coalesce(p_isrc,''))),'');
begin
  if v_title is null or v_artist is null then return null; end if;

  if v_isrc is not null then
    select id into v_id from public.tracks where upper(isrc)=v_isrc limit 1;
  end if;
  if v_id is null and nullif(p_provider_ids->>'appleMusic','') is not null then
    select id into v_id from public.tracks where provider_ids->>'appleMusic'=p_provider_ids->>'appleMusic' limit 1;
  end if;
  if v_id is null and nullif(p_provider_ids->>'spotify','') is not null then
    select id into v_id from public.tracks where provider_ids->>'spotify'=p_provider_ids->>'spotify' limit 1;
  end if;
  if v_id is null and nullif(p_provider_ids->>'deezer','') is not null then
    select id into v_id from public.tracks where provider_ids->>'deezer'=p_provider_ids->>'deezer' limit 1;
  end if;
  if v_id is null and nullif(p_provider_ids->>'itunes','') is not null then
    select id into v_id from public.tracks where provider_ids->>'itunes'=p_provider_ids->>'itunes' limit 1;
  end if;
  if v_id is null and nullif(trim(coalesce(p_preview_url,'')),'') is not null then
    select id into v_id from public.tracks where preview_url=p_preview_url limit 1;
  end if;

  if v_id is not null then
    update public.tracks set
      isrc=coalesce(isrc,v_isrc),
      album=coalesce(album,nullif(trim(coalesce(p_album,'')),'')),
      artwork_url=coalesce(artwork_url,nullif(trim(coalesce(p_artwork_url,'')),'')),
      preview_url=coalesce(preview_url,nullif(trim(coalesce(p_preview_url,'')),'')),
      provider_ids=coalesce(provider_ids,'{}'::jsonb) || coalesce(p_provider_ids,'{}'::jsonb),
      external_urls=coalesce(external_urls,'{}'::jsonb) || coalesce(p_external_urls,'{}'::jsonb),
      available_on=array(select distinct x from unnest(coalesce(available_on,'{}'::text[]) || coalesce(p_available_on,'{}'::text[])) x where nullif(trim(x),'') is not null),
      genres=array(select distinct x from unnest(coalesce(genres,'{}'::text[]) || coalesce(p_genres,'{}'::text[])) x where nullif(trim(x),'') is not null),
      release_year=coalesce(release_year,p_release_year),
      source=coalesce(source,'recognition')
    where id=v_id;
    return v_id;
  end if;

  begin
    insert into public.tracks(
      isrc,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on,release_year,source
    ) values(
      v_isrc,v_title,v_artist,nullif(trim(coalesce(p_album,'')),''),
      nullif(trim(coalesce(p_artwork_url,'')),''),nullif(trim(coalesce(p_preview_url,'')),''),
      coalesce(p_genres,'{}'::text[]),coalesce(p_provider_ids,'{}'::jsonb),
      coalesce(p_external_urls,'{}'::jsonb),coalesce(p_available_on,'{}'::text[]),p_release_year,'recognition'
    ) returning id into v_id;
    return v_id;
  exception when unique_violation then
    if v_isrc is not null then select id into v_id from public.tracks where upper(isrc)=v_isrc limit 1; end if;
    if v_id is null and nullif(p_provider_ids->>'appleMusic','') is not null then select id into v_id from public.tracks where provider_ids->>'appleMusic'=p_provider_ids->>'appleMusic' limit 1; end if;
    if v_id is null and nullif(p_provider_ids->>'spotify','') is not null then select id into v_id from public.tracks where provider_ids->>'spotify'=p_provider_ids->>'spotify' limit 1; end if;
    if v_id is null and nullif(p_provider_ids->>'deezer','') is not null then select id into v_id from public.tracks where provider_ids->>'deezer'=p_provider_ids->>'deezer' limit 1; end if;
    if v_id is null and nullif(p_provider_ids->>'itunes','') is not null then select id into v_id from public.tracks where provider_ids->>'itunes'=p_provider_ids->>'itunes' limit 1; end if;
    if v_id is null then raise; end if;
    return v_id;
  end;
end;
$$;

revoke all on function public.service_catalog_track_from_recognition(text,text,text,text,text,text,jsonb,jsonb,text[],text[],smallint) from public, anon, authenticated;
grant execute on function public.service_catalog_track_from_recognition(text,text,text,text,text,text,jsonb,jsonb,text[],text[],smallint) to service_role;
