-- Mirrors Supabase migration 20261001214553 already applied remotely.
-- Loki Pulse ranking uses persisted style + country/storefront + language signals.

create or replace function public.keep_music_style_key(p_value text)
returns text
language sql
immutable
set search_path=public
as $function$
  with normalized as (
    select regexp_replace(
      lower(
        translate(
          trim(coalesce(p_value,'')),
          'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝŸýÿ',
          'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYYyy'
        )
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ) as v
  )
  select case
    when v in ('electronic','electronique','electronica') then 'electronic'
    when v in ('classical','classique','musiqueclassique') then 'classical'
    when v in ('soundtrack','bandeoriginale','originalscore') then 'soundtrack'
    when v in ('world','worldwide','worldmusic','musiquesdumonde') then 'world'
    when v in ('hiphop','hiphoprap','rap') then 'hiphoprap'
    when v in ('rb','rbsoul','rhythmandblues') then 'rbsoul'
    when v in ('urbanlatin','urbanolatino','latin','latinmusic','musiquelatine') then 'latin'
    when v in ('rai','raimaghreb','raidumaghreb','afriquedunord') then 'rai'
    when v in ('afrobeat','afrobeats') then 'afrobeats'
    when v in ('kpop','koreanpop') then 'kpop'
    when v in ('brazilian','bresil','brazil') then 'brazilian'
    else v
  end
  from normalized;
$function$;

revoke all on function public.keep_music_style_key(text) from public,anon;
grant execute on function public.keep_music_style_key(text) to authenticated,service_role;

with locale as (
  select
    upper(country_code) as code,
    array_agg(distinct lower(language_code) order by lower(language_code))
      filter (where nullif(trim(language_code),'') is not null) as languages
  from public.music_pulse_theme_affinity
  where nullif(trim(country_code),'') is not null
  group by upper(country_code)
)
update public.music_country_catalog c
set language_codes = locale.languages,
    updated_at = now()
from locale
where upper(c.code)=locale.code
  and locale.languages is not null
  and cardinality(locale.languages)>0;

create or replace function public.keep_loki_pulse(p_limit integer default 36)
returns table(
  track_id uuid,title text,artist text,album text,artwork_url text,preview_url text,genres text[],
  provider_ids jsonb,external_urls jsonb,available_on text[],release_year smallint,relevance_score numeric,is_new boolean
)
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_limit integer := greatest(4,least(coalesce(p_limit,36),60));
  v_declared_genres text[] := array[]::text[];
  v_inferred_genres text[] := array[]::text[];
  v_declared_artists text[] := array[]::text[];
  v_inferred_artists text[] := array[]::text[];
  v_battle text[] := array[]::text[];
  v_languages text[] := array[]::text[];
  v_countries text[] := array[]::text[];
  v_new_count integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select coalesce(favorite_genres,array[]::text[]),
         coalesce(inferred_genres,array[]::text[]),
         coalesce(favorite_artists,array[]::text[]),
         coalesce(inferred_artists,array[]::text[]),
         coalesce(music_language_codes,array[]::text[]),
         coalesce(music_country_codes,array[]::text[])
    into v_declared_genres,v_inferred_genres,v_declared_artists,v_inferred_artists,v_languages,v_countries
  from public.profiles where id=uid;

  select coalesce(theme_codes,array[]::text[]) into v_battle
  from public.keep_battle_match_preferences where profile_id=uid;

  create temporary table if not exists tmp_loki_pulse_candidates(
    track_id uuid primary key,title text,artist text,album text,artwork_url text,preview_url text,
    genres text[],provider_ids jsonb,external_urls jsonb,available_on text[],release_year smallint,
    relevance_score numeric,is_new boolean
  ) on commit drop;
  truncate tmp_loki_pulse_candidates;

  with scored as (
    select
      t.id as track_id,t.title,t.artist,t.album,t.artwork_url,t.preview_url,
      coalesce(t.genres,array[]::text[]) as genres,coalesce(t.provider_ids,'{}'::jsonb) as provider_ids,
      coalesce(t.external_urls,'{}'::jsonb) as external_urls,coalesce(t.available_on,array[]::text[]) as available_on,t.release_year,
      (
        case when exists(
          select 1 from unnest(coalesce(t.genres,array[]::text[])) tg
          join unnest(v_declared_genres) ug
            on public.keep_music_style_key(tg)=public.keep_music_style_key(ug)
            or lower(tg)=lower(ug)
            or lower(tg) like '%'||lower(ug)||'%'
            or lower(ug) like '%'||lower(tg)||'%'
        ) then 90 else 0 end
        + case when exists(
          select 1 from unnest(coalesce(t.genres,array[]::text[])) tg
          join unnest(v_inferred_genres) ug
            on public.keep_music_style_key(tg)=public.keep_music_style_key(ug)
            or lower(tg)=lower(ug)
            or lower(tg) like '%'||lower(ug)||'%'
            or lower(ug) like '%'||lower(tg)||'%'
        ) then 58 else 0 end
        + case when exists(select 1 from unnest(v_declared_artists) a where lower(trim(a))=lower(trim(t.artist))) then 105 else 0 end
        + case when exists(select 1 from unnest(v_inferred_artists) a where lower(trim(a))=lower(trim(t.artist))) then 72 else 0 end
        + case when exists(
          select 1 from unnest(v_countries) vc
          where upper(trim(vc))=upper(trim(coalesce(t.provider_ids->>'appleStorefront','')))
        ) then 65 else 0 end
        + case when exists(
          select 1
          from public.music_country_catalog mc
          cross join lateral unnest(coalesce(mc.language_codes,array[]::text[])) ml
          where upper(mc.code)=upper(trim(coalesce(t.provider_ids->>'appleStorefront','')))
            and exists(
              select 1 from unnest(v_languages) vl
              where lower(trim(vl))=lower(trim(ml))
            )
        ) then 30 else 0 end
        + case when exists(
          select 1 from public.keep_battle_track_themes btt
          join unnest(v_battle) vb on upper(vb)=upper(btt.theme_code)
          where btt.track_id=t.id
        ) then 35 else 0 end
        + coalesce((
          select max(a.weight)
          from public.keep_battle_track_themes btt
          join public.music_pulse_theme_affinity a on a.theme_code=btt.theme_code
          where btt.track_id=t.id
            and (
              (a.country_code is not null and exists(select 1 from unnest(v_countries) vc where upper(vc)=upper(a.country_code)))
              or (a.language_code is not null and exists(select 1 from unnest(v_languages) vl where lower(vl)=lower(a.language_code)))
            )
        ),0)
        + least(25,coalesce((select count(*) from public.keep_decisions kd2 where kd2.track_id=t.id and kd2.decision='KEPT'),0))::numeric
        + least(12,coalesce((select count(*) from public.profile_swipe_listens psl where psl.track_id=t.id),0))::numeric
        + case when e.profile_id is null then 18 else 0 end
        - case when e.last_shown_at >= now()-interval '6 hours' then 40
               when e.last_shown_at >= now()-interval '24 hours' then 20
               when e.last_shown_at >= now()-interval '7 days' then 6
               else 0 end
      ) as relevance_score,
      e.profile_id is null as is_new
    from public.tracks t
    left join public.profile_loki_pulse_events e on e.profile_id=uid and e.track_id=t.id
    where nullif(trim(coalesce(t.title,'')),'') is not null
      and nullif(trim(coalesce(t.artist,'')),'') is not null
      and nullif(trim(coalesce(t.preview_url,'')),'') is not null
      and e.hidden_at is null
      and not exists(
        select 1 from public.keep_decisions kd
        where kd.profile_id=uid and kd.track_id=t.id and kd.decision='KEPT'
      )
  ), ranked as (
    select scored.*,
           row_number() over(
             partition by lower(trim(scored.artist))
             order by scored.relevance_score desc,
                      scored.is_new desc,
                      md5(uid::text||':'||scored.track_id::text||':'||current_date::text)
           ) as artist_rank
    from scored
  )
  insert into tmp_loki_pulse_candidates(
    track_id,title,artist,album,artwork_url,preview_url,genres,
    provider_ids,external_urls,available_on,release_year,relevance_score,is_new
  )
  select
    r.track_id,r.title,r.artist,r.album,r.artwork_url,r.preview_url,r.genres,
    r.provider_ids,r.external_urls,r.available_on,r.release_year,r.relevance_score,r.is_new
  from ranked r
  where r.artist_rank <= 3
  order by r.relevance_score desc,
           r.is_new desc,
           md5(uid::text||':'||r.track_id::text||':'||current_date::text)
  limit v_limit;

  select count(*) into v_new_count from tmp_loki_pulse_candidates c where c.is_new=true;

  insert into public.profile_loki_pulse_events(profile_id,track_id,first_shown_at,last_shown_at)
  select uid,c.track_id,now(),now()
  from tmp_loki_pulse_candidates c
  on conflict on constraint profile_loki_pulse_events_pkey
  do update set last_shown_at=excluded.last_shown_at;

  if v_new_count>0 and not exists(
    select 1 from public.notifications n
    where n.profile_id=uid
      and n.type='LOKI_PULSE_NEW'
      and n.created_at>=date_trunc('day',now())
  ) then
    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    values(
      uid,'LOKI_PULSE_NEW','Nouvelles trouvailles dans ton Pulse',
      v_new_count||case when v_new_count>1 then ' nouvelles musiques t’attendent.' else ' nouvelle musique t’attend.' end,
      jsonb_build_object('event','LOKI_PULSE_NEW','trackCount',v_new_count,'source','Loki Pulse'),
      'CREATED',0
    );
  end if;

  return query
  select c.track_id,c.title,c.artist,c.album,c.artwork_url,c.preview_url,c.genres,
         c.provider_ids,c.external_urls,c.available_on,c.release_year,c.relevance_score,c.is_new
  from tmp_loki_pulse_candidates c
  order by c.relevance_score desc,c.is_new desc,c.title;
end;
$function$;

revoke all on function public.keep_loki_pulse(integer) from public,anon;
grant execute on function public.keep_loki_pulse(integer) to authenticated;
