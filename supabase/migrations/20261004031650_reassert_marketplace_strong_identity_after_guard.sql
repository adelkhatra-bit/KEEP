-- Loki Music — réaffirme l'identité forte après les gardes marketplace.
-- Important pour les rebuilds : une migration plus récente peut redéfinir
-- keep_playlist_sale_track_is_owned(). Cette version reste la source finale
-- commune Web + mobile.

create or replace function public.keep_playlist_sale_track_is_owned(p_profile_id uuid, p_track_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  t public.tracks%rowtype;
  t_has_strong boolean;
begin
  if p_profile_id is null or p_track_id is null then return false; end if;
  select * into t from public.tracks where id=p_track_id;
  if t.id is null then return false; end if;

  if exists (
    select 1 from public.keep_decisions kd
    where kd.profile_id=p_profile_id and kd.decision='KEPT'
      and public.keep_tracks_equivalent(kd.track_id,p_track_id)
  ) then return true; end if;

  if exists (
    select 1 from public.playlist_tracks pt
    join public.playlists pl on pl.id=pt.playlist_id
    where pl.owner_id=p_profile_id
      and public.keep_tracks_equivalent(pt.track_id,p_track_id)
  ) then return true; end if;

  if exists (
    select 1 from public.music_library_items ml
    where ml.profile_id=p_profile_id and ml.removed_at is null and ml.track_id is not null
      and public.keep_tracks_equivalent(ml.track_id,p_track_id)
  ) then return true; end if;

  t_has_strong := nullif(trim(coalesce(t.isrc,'')),'') is not null
    or nullif(t.provider_ids->>'spotify','') is not null
    or nullif(t.provider_ids->>'appleMusic','') is not null
    or nullif(t.provider_ids->>'deezer','') is not null;

  if exists (
    select 1 from public.music_library_items ml
    where ml.profile_id=p_profile_id and ml.removed_at is null and ml.track_id is null
      and (
        (nullif(trim(coalesce(t.isrc,'')),'') is not null
          and upper(trim(coalesce(ml.isrc,'')))=upper(trim(t.isrc)))
        or (lower(coalesce(ml.provider,''))='spotify'
          and nullif(t.provider_ids->>'spotify','') is not null
          and ml.provider_track_id=t.provider_ids->>'spotify')
        or (lower(coalesce(ml.provider,'')) in ('apple','applemusic','apple_music')
          and nullif(t.provider_ids->>'appleMusic','') is not null
          and ml.provider_track_id=t.provider_ids->>'appleMusic')
        or (lower(coalesce(ml.provider,''))='deezer'
          and nullif(t.provider_ids->>'deezer','') is not null
          and ml.provider_track_id=t.provider_ids->>'deezer')
        or (not t_has_strong and nullif(trim(coalesce(ml.isrc,'')),'') is null
          and public.keep_track_identity(ml.title,ml.artist)=public.keep_track_identity(t.title,t.artist))
      )
  ) then return true; end if;

  return false;
end;
$$;

comment on function public.keep_playlist_sale_track_is_owned(uuid,uuid) is
  'Single Web/mobile ownership test for marketplace anti-duplicate: canonical track id, ISRC/provider identity, playlists, KEEP decisions and imported libraries.';
