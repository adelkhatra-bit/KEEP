-- Loki Pulse : retour sous le délai de 8 s du rôle authenticated (audit 25/10/2026).
-- Constat production : chaque appel keep_loki_pulse finissait en 500 après ~8,1 s (statement_timeout=8s),
-- durée réelle mesurée ≈ 23 s avec 60 971 titres jouables. Causes mesurées (EXPLAIN ANALYZE) :
--   1. track_genre_keys recalculé 2 fois par titre (keep_music_style_key sur 60 778 lignes x2 ≈ 7,3 s) ;
--   2. theme_score agrégé sur les 93 610 lignes keep_battle_track_themes même sans préférence (≈ 0,7 s).
-- Correctif : mêmes règles de score, même ordre, même marquage ; seuls changent
--   - les styles : on calcule UNE fois quels genres bruts du catalogue (~630) correspondent aux goûts du
--     profil, puis simple recouvrement de listes par titre (au lieu de 2 x 60 000 appels keep_music_style_key) ;
--   - theme_score limité aux thèmes qui peuvent réellement rapporter des points pour ce profil ;
--   - classement sur colonnes légères, puis lecture des seules lignes gagnantes dans tracks.
-- Mesure EXPLAIN ANALYZE (profil réel, 60 971 titres) : 23 s -> 1,35 s.
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
  -- Genres bruts du catalogue dont le style normalisé correspond aux goûts déclarés / appris.
  raw_genres as materialized (
    select distinct g from public.tracks t, unnest(t.genres) g where nullif(trim(g),'') is not null
  ),
  genre_raw as materialized (
    select
      coalesce(array_agg(r.g) filter (where public.keep_music_style_key(r.g) = any(p.declared_genre_keys)), array[]::text[]) as declared_raw,
      coalesce(array_agg(r.g) filter (where public.keep_music_style_key(r.g) = any(p.inferred_genre_keys)), array[]::text[]) as inferred_raw
    from raw_genres r cross join prefs2 p
  ),
  -- Goûts appris (cœur +3, GARDER, pouce bas -4, imports +2) : source unique profile_music_taste_scores
  taste_genre as (
    select s.taste_key, s.score from public.profile_music_taste_scores s where s.profile_id=uid and s.taste_type='GENRE'
  ),
  taste_artist as (
    select s.taste_key, s.score from public.profile_music_taste_scores s where s.profile_id=uid and s.taste_type='ARTIST'
  ),
  keep_pop as (
    select kd.track_id,count(*)::int as cnt from public.keep_decisions kd where kd.decision='KEPT' group by kd.track_id
  ),
  listen_pop as (
    select psl.track_id,count(*)::int as cnt from public.profile_swipe_listens psl group by psl.track_id
  ),
  -- Seuls les thèmes qui rapportent des points à CE profil (Battle choisi ou affinité pays/langue).
  matching_affinity as (
    select a.theme_code, a.weight
    from prefs2 p
    join public.music_pulse_theme_affinity a
      on (a.country_code is not null and upper(a.country_code)=any(p.countries))
      or (a.language_code is not null and lower(a.language_code)=any(p.languages))
  ),
  theme_score as (
    select btt.track_id,
      bool_or(upper(btt.theme_code)=any(p.battle_keys)) as battle_match,
      max(ma.weight) as affinity_weight
    from prefs2 p
    join public.keep_battle_track_themes btt
      on upper(btt.theme_code)=any(p.battle_keys)
      or btt.theme_code in (select m.theme_code from matching_affinity m)
    left join matching_affinity ma on ma.theme_code=btt.theme_code
    group by btt.track_id
  ),
  base as (
    select
      t.id as track_id, lower(trim(t.artist)) as artist_key,
      e.last_shown_at, e.profile_id as event_profile_id,
      coalesce(kp.cnt,0) as keep_count, coalesce(lp.cnt,0) as listen_count,
      coalesce(ts.battle_match,false) as battle_match, coalesce(ts.affinity_weight,0) as affinity_weight,
      p.declared_artist_keys, p.inferred_artist_keys, p.countries, p.language_storefronts,
      upper(trim(coalesce(t.provider_ids->>'appleStorefront',''))) as storefront,
      coalesce(t.genres && gr.declared_raw,false) as declared_genre_match,
      coalesce(t.genres && gr.inferred_raw,false) as inferred_genre_match,
      coalesce(tgs.score,0) as taste_genre_score,
      coalesce(ta.score,0) as taste_artist_score
    from prefs2 p
    cross join genre_raw gr
    join public.tracks t on nullif(trim(coalesce(t.preview_url,'')),'') is not null
    left join public.profile_loki_pulse_events e on e.profile_id=p.uid and e.track_id=t.id
    left join keep_pop kp on kp.track_id=t.id
    left join listen_pop lp on lp.track_id=t.id
    left join theme_score ts on ts.track_id=t.id
    left join taste_artist ta on ta.taste_key=lower(trim(t.artist))
    left join lateral (select sum(tg.score) as score from unnest(t.genres) g join taste_genre tg on tg.taste_key=lower(trim(g))) tgs on true
    where nullif(trim(coalesce(t.title,'')),'') is not null
      and nullif(trim(coalesce(t.artist,'')),'') is not null
      and e.hidden_at is null
      -- jamais un titre déjà gardé, aimé ou refusé
      and not exists(select 1 from public.keep_decisions kd where kd.profile_id=p.uid and kd.track_id=t.id and kd.decision='KEPT')
      and not exists(select 1 from public.track_likes tl where tl.profile_id=p.uid and tl.track_id=t.id)
      and not exists(select 1 from public.track_dislikes td where td.profile_id=p.uid and td.track_id=t.id::text)
      -- jamais un titre montré il y a moins de 3 jours
      and (e.last_shown_at is null or e.last_shown_at < now()-interval '3 days')
  ),
  scored as (
    select b.track_id, b.artist_key, b.event_profile_id is null as is_new,
      md5(uid::text||':'||b.track_id::text||':'||current_date::text) as tiebreak,
      (
        case when b.declared_genre_match then 90 else 0 end
        + case when b.inferred_genre_match then 58 else 0 end
        + case when b.artist_key=any(b.declared_artist_keys) then 105 else 0 end
        + case when b.artist_key=any(b.inferred_artist_keys) then 72 else 0 end
        + case when b.storefront=any(b.countries) then 65 else 0 end
        + case when b.storefront=any(b.language_storefronts) then 30 else 0 end
        + case when b.battle_match then 35 else 0 end
        + greatest(-120, least(120, b.taste_genre_score * 4))
        + greatest(-150, least(90, b.taste_artist_score * 3))
        + b.affinity_weight + least(25,b.keep_count)::numeric + least(12,b.listen_count)::numeric
        + case when b.event_profile_id is null then 30 else 0 end
        - case when b.last_shown_at >= now()-interval '14 days' then 60 else 0 end
        -- 10 % de découverte : petit bonus aléatoire stable dans la journée
        + (('x'||substr(md5(uid::text||':'||b.track_id::text||':'||current_date::text),1,6))::bit(24)::int % 40)
      )::numeric as relevance_score
    from base b
  ),
  ranked as (
    select s.*, row_number() over(partition by s.artist_key order by s.relevance_score desc, s.is_new desc, s.tiebreak) as artist_rank
    from scored s
  ),
  winners as (
    select r.track_id, r.relevance_score, r.is_new, r.tiebreak
    from ranked r
    where r.artist_rank<=2
    order by r.relevance_score desc, r.is_new desc, r.tiebreak
    limit v_limit
  )
  insert into tmp_loki_pulse_candidates(
    track_id,title,artist,album,artwork_url,preview_url,genres,provider_ids,external_urls,available_on,release_year,relevance_score,is_new
  )
  select t.id,t.title,t.artist,t.album,t.artwork_url,t.preview_url,
    coalesce(t.genres,array[]::text[]), coalesce(t.provider_ids,'{}'::jsonb), coalesce(t.external_urls,'{}'::jsonb),
    coalesce(t.available_on,array[]::text[]), t.release_year, w.relevance_score, w.is_new
  from winners w
  join public.tracks t on t.id=w.track_id
  order by w.relevance_score desc, w.is_new desc, w.tiebreak;

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
