-- Issue #48: shared-link ingestion only. Recognition retains its stricter
-- recording-identity rules; no content is merged, deleted or reassigned.
create or replace function public.service_catalog_track_from_shared_link(
  p_title text,
  p_artist text,
  p_isrc text default null,
  p_artwork_url text default null,
  p_provider_ids jsonb default '{}'::jsonb,
  p_external_urls jsonb default '{}'::jsonb,
  p_genres text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_artist text := nullif(trim(coalesce(p_artist, '')), '');
  v_isrc text := nullif(upper(trim(coalesce(p_isrc, ''))), '');
  v_identity text;
  v_id uuid;
begin
  if v_title is null or v_artist is null then return null; end if;
  if length(v_title) > 300 or length(v_artist) > 300 then
    raise exception 'INVALID_SHARED_MUSIC_METADATA';
  end if;
  v_identity := public.keep_track_identity(
    regexp_replace(normalize(v_title, NFKD), U&'[\0300-\036F]', '', 'g'),
    regexp_replace(normalize(v_artist, NFKD), U&'[\0300-\036F]', '', 'g')
  );
  -- All importers of the same normalized title/artist wait for the first
  -- transaction, including imports with an ISRC and imports without one.
  perform pg_advisory_xact_lock(hashtextextended('shared-music:' || v_identity, 0));
  if v_isrc is not null then
    select id into v_id from public.tracks where upper(isrc) = v_isrc limit 1;
  end if;
  if v_id is null then
    select id into v_id from public.tracks
    where public.keep_track_identity(
      regexp_replace(normalize(title, NFKD), U&'[\0300-\036F]', '', 'g'),
      regexp_replace(normalize(artist, NFKD), U&'[\0300-\036F]', '', 'g')
    ) = v_identity
      -- Different known ISRCs describe different recordings, not duplicates.
      and (v_isrc is null or isrc is null or upper(isrc) = v_isrc)
    order by created_at, id limit 1;
  end if;
  if v_id is not null then
    begin
      update public.tracks set
        isrc = coalesce(isrc, v_isrc),
        artwork_url = coalesce(artwork_url, nullif(trim(coalesce(p_artwork_url, '')), '')),
        external_urls = coalesce(external_urls, '{}'::jsonb) || coalesce(p_external_urls, '{}'::jsonb),
        genres = array(
          select distinct x from unnest(coalesce(genres, '{}'::text[]) || coalesce(p_genres, '{}'::text[])) x
          where nullif(trim(x), '') is not null
        )
      where id = v_id;
      return v_id;
    exception when unique_violation then
      -- A simultaneous recognition/import with another title may have claimed
      -- this ISRC. Keep that canonical winner; never merge or delete content.
      if v_isrc is not null then
        select id into v_id from public.tracks where upper(isrc) = v_isrc limit 1;
      end if;
      if v_id is null then raise; end if;
      return v_id;
    end;
  end if;
  return public.service_catalog_track_from_recognition(
    p_title => v_title, p_artist => v_artist, p_isrc => v_isrc,
    p_artwork_url => p_artwork_url, p_provider_ids => p_provider_ids,
    p_external_urls => p_external_urls,
    p_available_on => array(select jsonb_object_keys(coalesce(p_external_urls, '{}'::jsonb))),
    p_genres => p_genres
  );
end;
$$;

revoke all on function public.service_catalog_track_from_shared_link(text,text,text,text,jsonb,jsonb,text[]) from public, anon, authenticated;
grant execute on function public.service_catalog_track_from_shared_link(text,text,text,text,jsonb,jsonb,text[]) to service_role;
