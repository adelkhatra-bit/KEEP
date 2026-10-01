-- KEEP / Loki Music — ingestion Battle catalogue en lots
-- 2026-10-01: le catalogue Chanson française live n'avait que 96 morceaux /
-- 67 artistes. Cette RPC interne permet au worker catalogue d'ingérer plusieurs
-- milliers de résultats en quelques appels DB au lieu d'un aller-retour par titre.

create or replace function public.service_battle_catalog_ingest(
  p_theme text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_theme text := upper(trim(coalesce(p_theme, '')));
  v_item jsonb;
  v_track_id uuid;
  v_apple_id text;
  v_title text;
  v_artist text;
  v_album text;
  v_artwork text;
  v_preview text;
  v_track_url text;
  v_genre text;
  v_storefront text;
  v_year smallint;
  v_duration integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_linked integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'BATTLE_CATALOG_ITEMS_ARRAY_REQUIRED';
  end if;
  if not exists (select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then
    raise exception 'BATTLE_THEME_UNAVAILABLE:%', v_theme;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) with ordinality as e(value, ord)
    where ord <= 500
  loop
    v_track_id := null;
    v_apple_id := nullif(trim(v_item->>'appleId'), '');
    v_title := nullif(trim(v_item->>'title'), '');
    v_artist := nullif(trim(v_item->>'artist'), '');
    v_album := nullif(trim(v_item->>'album'), '');
    v_artwork := nullif(trim(v_item->>'artworkUrl'), '');
    v_preview := nullif(trim(v_item->>'previewUrl'), '');
    v_track_url := nullif(trim(v_item->>'trackUrl'), '');
    v_genre := nullif(trim(v_item->>'genre'), '');
    v_storefront := nullif(upper(trim(v_item->>'storefront')), '');
    v_duration := case when coalesce(v_item->>'durationSec','') ~ '^[0-9]+$'
      then greatest(1, least((v_item->>'durationSec')::integer, 86400)) else null end;
    v_year := case when coalesce(v_item->>'releaseYear','') ~ '^(19|20)[0-9]{2}$'
      then (v_item->>'releaseYear')::smallint else null end;

    if v_apple_id is null or v_title is null or v_artist is null or v_preview !~ '^https://' then
      continue;
    end if;

    select t.id into v_track_id
    from public.tracks t
    where t.provider_ids->>'appleMusic' = v_apple_id
    limit 1;

    if v_track_id is null then
      select t.id into v_track_id
      from public.tracks t
      where public.keep_track_identity(t.title,t.artist)=public.keep_track_identity(v_title,v_artist)
      limit 1;
    end if;

    if v_track_id is null then
      begin
        insert into public.tracks(
          title,artist,album,duration_sec,artwork_url,genres,provider_ids,
          source,source_url,preview_url,external_urls,available_on,release_year
        ) values (
          v_title,v_artist,v_album,v_duration,v_artwork,
          case when v_genre is null then array[]::text[] else array[v_genre] end,
          jsonb_strip_nulls(jsonb_build_object('appleMusic',v_apple_id,'appleStorefront',v_storefront)),
          'itunes_public_battle',v_track_url,v_preview,
          case when v_track_url is null then '{}'::jsonb else jsonb_build_object('appleMusic',v_track_url) end,
          array['Apple Music']::text[],v_year
        )
        returning id into v_track_id;
        v_inserted := v_inserted + 1;
      exception when unique_violation then
        select t.id into v_track_id
        from public.tracks t
        where t.provider_ids->>'appleMusic'=v_apple_id
           or public.keep_track_identity(t.title,t.artist)=public.keep_track_identity(v_title,v_artist)
        order by case when t.provider_ids->>'appleMusic'=v_apple_id then 0 else 1 end
        limit 1;
      end;
    end if;

    if v_track_id is null then continue; end if;

    if not exists (
      select 1 from public.tracks t
      where t.id=v_track_id
        and t.title=v_title
        and t.artist=v_artist
        and coalesce(t.preview_url,'')=v_preview
        and t.provider_ids->>'appleMusic'=v_apple_id
    ) then
      update public.tracks t set
        album=coalesce(v_album,t.album),
        duration_sec=coalesce(v_duration,t.duration_sec),
        artwork_url=coalesce(v_artwork,t.artwork_url),
        preview_url=v_preview,
        source=coalesce(t.source,'itunes_public_battle'),
        source_url=coalesce(v_track_url,t.source_url),
        release_year=coalesce(v_year,t.release_year),
        genres=case
          when v_genre is null or v_genre=any(t.genres) then t.genres
          else array_append(t.genres,v_genre)
        end,
        provider_ids=t.provider_ids || jsonb_strip_nulls(jsonb_build_object('appleMusic',v_apple_id,'appleStorefront',v_storefront)),
        external_urls=t.external_urls || case when v_track_url is null then '{}'::jsonb else jsonb_build_object('appleMusic',v_track_url) end,
        available_on=case when 'Apple Music'=any(t.available_on) then t.available_on else array_append(t.available_on,'Apple Music') end
      where t.id=v_track_id;
      v_updated := v_updated + 1;
    end if;

    insert into public.keep_battle_track_themes(track_id,theme_code,source,confidence)
    values(v_track_id,v_theme,'itunes_deep_catalog',0.97)
    on conflict(track_id,theme_code) do update
      set confidence=greatest(public.keep_battle_track_themes.confidence,excluded.confidence),
          source=excluded.source;
    v_linked := v_linked + 1;
  end loop;

  return jsonb_build_object(
    'theme',v_theme,
    'inserted',v_inserted,
    'updated',v_updated,
    'linked',v_linked
  );
end;
$function$;

revoke all on function public.service_battle_catalog_ingest(text,jsonb) from public;
revoke all on function public.service_battle_catalog_ingest(text,jsonb) from anon;
revoke all on function public.service_battle_catalog_ingest(text,jsonb) from authenticated;
grant execute on function public.service_battle_catalog_ingest(text,jsonb) to service_role;
