-- On-demand worldwide Pulse catalog expansion.
-- Authenticated users can request a bounded expansion around their declared/inferred tastes.
-- The Edge Function is the only caller of the service RPCs below.

create table if not exists public.profile_catalog_expansion_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  usage_day date not null default current_date,
  request_count integer not null default 0,
  last_requested_at timestamptz,
  primary key(profile_id,usage_day)
);

alter table public.profile_catalog_expansion_usage enable row level security;

create or replace function public.service_allow_catalog_expansion(
  p_profile_id uuid,
  p_daily_limit integer default 12,
  p_cooldown_minutes integer default 45
)
returns boolean
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_row public.profile_catalog_expansion_usage%rowtype;
  v_limit integer := greatest(1,least(coalesce(p_daily_limit,12),48));
  v_cooldown integer := greatest(5,least(coalesce(p_cooldown_minutes,45),360));
begin
  if p_profile_id is null then return false; end if;

  insert into public.profile_catalog_expansion_usage(profile_id,usage_day,request_count,last_requested_at)
  values(p_profile_id,current_date,0,null)
  on conflict(profile_id,usage_day) do nothing;

  select * into v_row
  from public.profile_catalog_expansion_usage
  where profile_id=p_profile_id and usage_day=current_date
  for update;

  if coalesce(v_row.request_count,0) >= v_limit then return false; end if;
  if v_row.last_requested_at is not null
     and v_row.last_requested_at > now() - make_interval(mins => v_cooldown) then
    return false;
  end if;

  update public.profile_catalog_expansion_usage
  set request_count=request_count+1,last_requested_at=now()
  where profile_id=p_profile_id and usage_day=current_date;
  return true;
end;
$function$;

revoke all on function public.service_allow_catalog_expansion(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.service_allow_catalog_expansion(uuid,integer,integer) to service_role;

create or replace function public.service_music_catalog_ingest(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
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
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'MUSIC_CATALOG_ITEMS_ARRAY_REQUIRED';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) with ordinality as e(value,ord)
    where ord <= 500
  loop
    v_track_id := null;
    v_apple_id := nullif(trim(v_item->>'appleId'),'');
    v_title := nullif(trim(v_item->>'title'),'');
    v_artist := nullif(trim(v_item->>'artist'),'');
    v_album := nullif(trim(v_item->>'album'),'');
    v_artwork := nullif(trim(v_item->>'artworkUrl'),'');
    v_preview := nullif(trim(v_item->>'previewUrl'),'');
    v_track_url := nullif(trim(v_item->>'trackUrl'),'');
    v_genre := nullif(trim(v_item->>'genre'),'');
    v_storefront := nullif(upper(trim(v_item->>'storefront')),'');
    v_duration := case when coalesce(v_item->>'durationSec','') ~ '^[0-9]+$'
      then greatest(1,least((v_item->>'durationSec')::integer,86400)) else null end;
    v_year := case when coalesce(v_item->>'releaseYear','') ~ '^(19|20)[0-9]{2}$'
      then (v_item->>'releaseYear')::smallint else null end;

    if v_apple_id is null or v_title is null or v_artist is null or v_preview !~ '^https://' then
      continue;
    end if;

    select t.id into v_track_id
    from public.tracks t
    where t.provider_ids->>'appleMusic'=v_apple_id
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
          'itunes_public_pulse',v_track_url,v_preview,
          case when v_track_url is null then '{}'::jsonb else jsonb_build_object('appleMusic',v_track_url) end,
          array['Apple Music']::text[],v_year
        )
        returning id into v_track_id;
        v_inserted := v_inserted+1;
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

    update public.tracks t set
      album=coalesce(t.album,v_album),
      duration_sec=coalesce(t.duration_sec,v_duration),
      artwork_url=coalesce(t.artwork_url,v_artwork),
      preview_url=coalesce(nullif(t.preview_url,''),v_preview),
      source=coalesce(t.source,'itunes_public_pulse'),
      source_url=coalesce(t.source_url,v_track_url),
      release_year=coalesce(t.release_year,v_year),
      genres=case
        when v_genre is null or v_genre=any(coalesce(t.genres,array[]::text[])) then coalesce(t.genres,array[]::text[])
        else array_append(coalesce(t.genres,array[]::text[]),v_genre)
      end,
      provider_ids=coalesce(t.provider_ids,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('appleMusic',v_apple_id,'appleStorefront',v_storefront)),
      external_urls=coalesce(t.external_urls,'{}'::jsonb) || case when v_track_url is null then '{}'::jsonb else jsonb_build_object('appleMusic',v_track_url) end,
      available_on=case when 'Apple Music'=any(coalesce(t.available_on,array[]::text[]))
        then coalesce(t.available_on,array[]::text[])
        else array_append(coalesce(t.available_on,array[]::text[]),'Apple Music') end
    where t.id=v_track_id;
    v_updated := v_updated+1;
  end loop;

  return jsonb_build_object('inserted',v_inserted,'updated',v_updated);
end;
$function$;

revoke all on function public.service_music_catalog_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.service_music_catalog_ingest(jsonb) to service_role;
