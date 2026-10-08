-- Additive Pulse optimisation; no catalog, attribution or user-history rewrite.
-- The repository's previous RPC allowed three tracks/artist and only excluded
-- KEPT/hidden. Apply issue 63's explicit exclusions before computing popularity.
create index if not exists idx_loki_pulse_kept_track
  on public.keep_decisions(track_id) where decision = 'KEPT';
create index if not exists idx_loki_pulse_recent_profile
  on public.profile_loki_pulse_events(profile_id, last_shown_at, track_id);
create index if not exists idx_loki_pulse_notification_day
  on public.notifications(profile_id, created_at) where type = 'LOKI_PULSE_NEW';

create or replace function public.keep_loki_pulse(p_limit integer default 36)
returns table(
  track_id uuid, title text, artist text, album text, artwork_url text, preview_url text,
  genres text[], provider_ids jsonb, external_urls jsonb, available_on text[],
  release_year smallint, relevance_score numeric, is_new boolean
)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid := auth.uid();
  v_limit integer := greatest(4, least(coalesce(p_limit,36),60));
  v_new_count integer := 0;
  v_can_mark boolean := false;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  create temporary table if not exists tmp_loki_pulse_candidates(
    track_id uuid primary key, title text, artist text, album text, artwork_url text, preview_url text,
    genres text[], provider_ids jsonb, external_urls jsonb, available_on text[], release_year smallint,
    relevance_score numeric, is_new boolean
  ) on commit drop;
  truncate tmp_loki_pulse_candidates;

  with prefs as (
    select
      p.id as uid,
      array(select distinct public.keep_music_style_key(g) from unnest(coalesce(p.favorite_genres,array[]::text[])) g where nullif(trim(g),'') is not null) as declared_genre_keys,
      array(select distinct public.keep_music_style_key(g) from unnest(coalesce(p.inferred_genres,array[]::text[])) g where nullif(trim(g),'') is not null) as inferred_genre_keys,
      array(select distinct lower(trim(a)) from unnest(coalesce(p.favorite_artists,array[]::text[])) a where nullif(trim(a),'') is not null) as declared_artist_keys,
      array(select distinct lower(trim(a)) from unnest(coalesce(p.inferred_artists,array[]::text[])) a where nullif(trim(a),'') is not null) as inferred_artist_keys,
      array(select distinct upper(trim(c)) from unnest(coalesce(p.music_country_codes,array[]::text[])) c where nullif(trim(c),'') is not null) as countries,
      array(select distinct lower(trim(l)) from unnest(coalesce(p.music_language_codes,array[]::text[])) l where nullif(trim(l),'') is not null) as languages,
      coalesce(kbmp.theme_codes,array[]::text[]) as battle
    from public.profiles p
    left join public.keep_battle_match_preferences kbmp on kbmp.profile_id=p.id
    where p.id=uid
  ),
  prefs2 as materialized (
    select p.*,
      array(select upper(mc.code) from public.music_country_catalog mc where exists (
        select 1 from unnest(coalesce(mc.language_codes,array[]::text[])) ml where lower(trim(ml)) = any(p.languages)
      )) as language_storefronts,
      array(select upper(x) from unnest(p.battle) x) as battle_keys
    from prefs p
  ),
  eligible as materialized (
    select t.*, e.last_shown_at, e.profile_id as event_profile_id
    from public.tracks t
    left join public.profile_loki_pulse_events e on e.profile_id=uid and e.track_id=t.id
    where nullif(trim(coalesce(t.preview_url,'')),'') is not null
      and nullif(trim(coalesce(t.title,'')),'') is not null
      and nullif(trim(coalesce(t.artist,'')),'') is not null
      and e.hidden_at is null
      and e.kept_at is null
      and (e.last_shown_at is null or e.last_shown_at <= now()-interval '3 days')
      and not exists (
        select 1 from public.keep_decisions kd
        where kd.profile_id=uid and kd.track_id=t.id and kd.decision in ('KEPT','PASSED')
      )
      and not exists (
        select 1 from public.track_likes tl
        where tl.profile_id=uid and tl.track_id=t.id::text
      )
  ),
  base as (
    select
      t.id as track_id,t.title,t.artist,t.album,t.artwork_url,t.preview_url,
      coalesce(t.genres,array[]::text[]) as genres,
      coalesce(t.provider_ids,'{}'::jsonb) as provider_ids,
      coalesce(t.external_urls,'{}'::jsonb) as external_urls,
      coalesce(t.available_on,array[]::text[]) as available_on,t.release_year,
      t.last_shown_at,t.event_profile_id,
      kp.cnt as keep_count,lp.cnt as listen_count,
      coalesce(ts.battle_match,false) as battle_match,coalesce(ts.affinity_weight,0) as affinity_weight,
      p.declared_genre_keys,p.inferred_genre_keys,p.declared_artist_keys,p.inferred_artist_keys,
      p.countries,p.language_storefronts,
      upper(trim(coalesce(t.provider_ids->>'appleStorefront',''))) as storefront,
      array(select distinct public.keep_music_style_key(g) from unnest(coalesce(t.genres,array[]::text[])) g where nullif(trim(g),'') is not null) as track_genre_keys
    from prefs2 p
    cross join eligible t
    -- Scores saturate at 25/12: counting further rows cannot change the rank.
    cross join lateral (
      select count(*)::int as cnt from (
        select 1 from public.keep_decisions kd where kd.track_id=t.id and kd.decision='KEPT' limit 25
      ) capped
    ) kp
    cross join lateral (
      select count(*)::int as cnt from (
        select 1 from public.profile_swipe_listens psl where psl.track_id=t.id limit 12
      ) capped
    ) lp
    left join lateral (
      select bool_or(upper(btt.theme_code)=any(p.battle_keys)) as battle_match,
        max(a.weight) filter (where
          (a.country_code is not null and upper(a.country_code)=any(p.countries))
          or (a.language_code is not null and lower(a.language_code)=any(p.languages))
        ) as affinity_weight
      from public.keep_battle_track_themes btt
      left join public.music_pulse_theme_affinity a on a.theme_code=btt.theme_code
      where btt.track_id=t.id
    ) ts on true
  ),
  scored as (
    select b.*,(
      case when b.track_genre_keys && b.declared_genre_keys then 90 else 0 end
      + case when b.track_genre_keys && b.inferred_genre_keys then 58 else 0 end
      + case when lower(trim(b.artist))=any(b.declared_artist_keys) then 105 else 0 end
      + case when lower(trim(b.artist))=any(b.inferred_artist_keys) then 72 else 0 end
      + case when b.storefront=any(b.countries) then 65 else 0 end
      + case when b.storefront=any(b.language_storefronts) then 30 else 0 end
      + case when b.battle_match then 35 else 0 end
      + b.affinity_weight + least(25,b.keep_count)::numeric + least(12,b.listen_count)::numeric
      + case when b.event_profile_id is null then 18 else 0 end
      - case when b.last_shown_at >= now()-interval '6 hours' then 40
             when b.last_shown_at >= now()-interval '24 hours' then 20
             when b.last_shown_at >= now()-interval '7 days' then 6 else 0 end
    )::numeric as relevance_score, b.event_profile_id is null as is_new
    from base b
  ),
  ranked as (
    select s.*,row_number() over(
      partition by lower(trim(s.artist))
      order by s.relevance_score desc,s.is_new desc,md5(uid::text||':'||s.track_id::text||':'||current_date::text)
    ) as artist_rank
    from scored s
  )
  insert into tmp_loki_pulse_candidates(
    track_id,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on,release_year,relevance_score,is_new
  )
  select r.track_id,r.title,r.artist,r.album,r.artwork_url,r.preview_url,r.genres,r.provider_ids,r.external_urls,r.available_on,r.release_year,r.relevance_score,r.is_new
  from ranked r
  where r.artist_rank<=2
  order by r.relevance_score desc,r.is_new desc,md5(uid::text||':'||r.track_id::text||':'||current_date::text)
  limit v_limit;

  select count(*) into v_new_count from tmp_loki_pulse_candidates c where c.is_new=true;
  v_can_mark := pg_try_advisory_xact_lock(hashtext(uid::text));
  if v_can_mark then
    insert into public.profile_loki_pulse_events(profile_id,track_id,first_shown_at,last_shown_at)
    select uid,c.track_id,now(),now() from tmp_loki_pulse_candidates c
    on conflict on constraint profile_loki_pulse_events_pkey
    do update set last_shown_at=excluded.last_shown_at;

    if v_new_count>0 and not exists(
      select 1 from public.notifications n where n.profile_id=uid and n.type='LOKI_PULSE_NEW' and n.created_at>=date_trunc('day',now())
    ) then
      insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
      values(uid,'LOKI_PULSE_NEW','Nouvelles trouvailles dans ton Pulse',
        v_new_count||case when v_new_count>1 then ' nouvelles musiques t’attendent.' else ' nouvelle musique t’attend.' end,
        jsonb_build_object('event','LOKI_PULSE_NEW','trackCount',v_new_count,'source','Loki Pulse'),'CREATED',0);
    end if;
  end if;

  return query
  select c.track_id,c.title,c.artist,c.album,c.artwork_url,c.preview_url,c.genres,c.provider_ids,c.external_urls,c.available_on,c.release_year,c.relevance_score,c.is_new
  from tmp_loki_pulse_candidates c
  order by c.relevance_score desc,c.is_new desc,c.title;
end;
$function$;

revoke all on function public.keep_loki_pulse(integer) from public,anon;
grant execute on function public.keep_loki_pulse(integer) to authenticated;
