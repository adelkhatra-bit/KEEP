-- Passive music taste learning for Loki Pulse.
-- Explicit questionnaire choices stay in profiles.favorite_genres/music_language_codes/music_country_codes.
-- These tables learn separately from real behaviour, even for users who never open Battle/Solo.

create table if not exists public.profile_music_genre_affinity (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  genre_key text not null,
  genre_label text not null,
  score numeric not null default 0,
  keep_count integer not null default 0,
  listen_count integer not null default 0,
  hidden_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(profile_id,genre_key)
);

create table if not exists public.profile_music_artist_affinity (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  artist_key text not null,
  artist_label text not null,
  score numeric not null default 0,
  keep_count integer not null default 0,
  listen_count integer not null default 0,
  hidden_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(profile_id,artist_key)
);

create index if not exists idx_profile_music_genre_affinity_score on public.profile_music_genre_affinity(profile_id,score desc);
create index if not exists idx_profile_music_artist_affinity_score on public.profile_music_artist_affinity(profile_id,score desc);
create index if not exists idx_profile_swipe_listens_listener_track on public.profile_swipe_listens(listener_id,track_id);
create index if not exists idx_profile_loki_pulse_events_profile_hidden on public.profile_loki_pulse_events(profile_id,hidden_at);

alter table public.profile_music_genre_affinity enable row level security;
alter table public.profile_music_artist_affinity enable row level security;

drop policy if exists profile_music_genre_affinity_owner_read on public.profile_music_genre_affinity;
create policy profile_music_genre_affinity_owner_read
on public.profile_music_genre_affinity for select using(auth.uid()=profile_id);

drop policy if exists profile_music_artist_affinity_owner_read on public.profile_music_artist_affinity;
create policy profile_music_artist_affinity_owner_read
on public.profile_music_artist_affinity for select using(auth.uid()=profile_id);

create or replace function public.keep_refresh_profile_music_affinity(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $function$
begin
  if p_profile_id is null then return; end if;

  delete from public.profile_music_genre_affinity where profile_id=p_profile_id;
  delete from public.profile_music_artist_affinity where profile_id=p_profile_id;

  with kept as (
    select distinct kd.track_id
    from public.keep_decisions kd
    where kd.profile_id=p_profile_id and kd.decision='KEPT'
  ),
  listened as (
    select l.track_id, least(count(*),5)::integer as listen_count
    from public.profile_swipe_listens l
    where l.listener_id=p_profile_id
    group by l.track_id
  ),
  hidden as (
    select e.track_id
    from public.profile_loki_pulse_events e
    where e.profile_id=p_profile_id and e.hidden_at is not null
  ),
  genre_events as (
    select regexp_replace(lower(trim(g)),'\s+',' ','g') genre_key, trim(g) genre_label, 8::numeric delta, 1 keep_inc, 0 listen_inc, 0 hidden_inc
    from kept k join public.tracks t on t.id=k.track_id cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
    where nullif(trim(g),'') is not null
    union all
    select regexp_replace(lower(trim(g)),'\s+',' ','g'), trim(g), (l.listen_count*2)::numeric, 0, l.listen_count, 0
    from listened l join public.tracks t on t.id=l.track_id cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
    where nullif(trim(g),'') is not null
    union all
    select regexp_replace(lower(trim(g)),'\s+',' ','g'), trim(g), -6::numeric, 0, 0, 1
    from hidden h join public.tracks t on t.id=h.track_id cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
    where nullif(trim(g),'') is not null
  )
  insert into public.profile_music_genre_affinity(profile_id,genre_key,genre_label,score,keep_count,listen_count,hidden_count,updated_at)
  select p_profile_id,genre_key,min(genre_label),sum(delta),sum(keep_inc),sum(listen_inc),sum(hidden_inc),now()
  from genre_events
  where genre_key<>''
  group by genre_key;

  with kept as (
    select distinct kd.track_id
    from public.keep_decisions kd
    where kd.profile_id=p_profile_id and kd.decision='KEPT'
  ),
  listened as (
    select l.track_id, least(count(*),5)::integer as listen_count
    from public.profile_swipe_listens l
    where l.listener_id=p_profile_id
    group by l.track_id
  ),
  hidden as (
    select e.track_id
    from public.profile_loki_pulse_events e
    where e.profile_id=p_profile_id and e.hidden_at is not null
  ),
  artist_events as (
    select regexp_replace(lower(trim(t.artist)),'\s+',' ','g') artist_key, trim(t.artist) artist_label, 10::numeric delta, 1 keep_inc, 0 listen_inc, 0 hidden_inc
    from kept k join public.tracks t on t.id=k.track_id
    where nullif(trim(t.artist),'') is not null
    union all
    select regexp_replace(lower(trim(t.artist)),'\s+',' ','g'), trim(t.artist), (l.listen_count*2)::numeric, 0, l.listen_count, 0
    from listened l join public.tracks t on t.id=l.track_id
    where nullif(trim(t.artist),'') is not null
    union all
    select regexp_replace(lower(trim(t.artist)),'\s+',' ','g'), trim(t.artist), -7::numeric, 0, 0, 1
    from hidden h join public.tracks t on t.id=h.track_id
    where nullif(trim(t.artist),'') is not null
  )
  insert into public.profile_music_artist_affinity(profile_id,artist_key,artist_label,score,keep_count,listen_count,hidden_count,updated_at)
  select p_profile_id,artist_key,min(artist_label),sum(delta),sum(keep_inc),sum(listen_inc),sum(hidden_inc),now()
  from artist_events
  where artist_key<>''
  group by artist_key;
end;
$function$;

revoke all on function public.keep_refresh_profile_music_affinity(uuid) from public,anon,authenticated;
grant execute on function public.keep_refresh_profile_music_affinity(uuid) to service_role;

create or replace function public.keep_my_music_affinity()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare uid uuid:=auth.uid();
declare v_genres jsonb;
declare v_artists jsonb;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  perform public.keep_refresh_profile_music_affinity(uid);
  select coalesce(jsonb_agg(jsonb_build_object('genre',genre_label,'score',score,'keeps',keep_count,'listens',listen_count,'hidden',hidden_count) order by score desc),'[]'::jsonb)
    into v_genres
    from (select * from public.profile_music_genre_affinity where profile_id=uid and score>0 order by score desc limit 20) x;
  select coalesce(jsonb_agg(jsonb_build_object('artist',artist_label,'score',score,'keeps',keep_count,'listens',listen_count,'hidden',hidden_count) order by score desc),'[]'::jsonb)
    into v_artists
    from (select * from public.profile_music_artist_affinity where profile_id=uid and score>0 order by score desc limit 20) x;
  return jsonb_build_object('genres',v_genres,'artists',v_artists);
end;
$function$;
revoke all on function public.keep_my_music_affinity() from public,anon;
grant execute on function public.keep_my_music_affinity() to authenticated;

create or replace function public.keep_loki_pulse(p_limit integer default 36)
returns table(
  track_id uuid,title text,artist text,album text,artwork_url text,preview_url text,genres text[],
  provider_ids jsonb,external_urls jsonb,available_on text[],release_year smallint,relevance_score numeric,is_new boolean
)
language plpgsql security definer set search_path=public,auth as $function$
declare
  uid uuid := auth.uid();
  v_limit integer := greatest(4,least(coalesce(p_limit,36),60));
  v_genres text[] := array[]::text[];
  v_battle text[] := array[]::text[];
  v_languages text[] := array[]::text[];
  v_countries text[] := array[]::text[];
  v_new_count integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  perform public.keep_refresh_profile_music_affinity(uid);
  select coalesce(favorite_genres,array[]::text[]),coalesce(music_language_codes,array[]::text[]),coalesce(music_country_codes,array[]::text[])
    into v_genres,v_languages,v_countries from public.profiles where id=uid;
  select coalesce(theme_codes,array[]::text[]) into v_battle from public.keep_battle_match_preferences where profile_id=uid;

  create temporary table if not exists tmp_loki_pulse_candidates(
    track_id uuid primary key,title text,artist text,album text,artwork_url text,preview_url text,genres text[],provider_ids jsonb,external_urls jsonb,available_on text[],release_year smallint,relevance_score numeric,is_new boolean
  ) on commit drop;
  truncate tmp_loki_pulse_candidates;

  insert into tmp_loki_pulse_candidates
  select t.id,t.title,t.artist,t.album,t.artwork_url,t.preview_url,coalesce(t.genres,array[]::text[]),coalesce(t.provider_ids,'{}'::jsonb),coalesce(t.external_urls,'{}'::jsonb),coalesce(t.available_on,array[]::text[]),t.release_year,
    (
      case when exists(
        select 1 from unnest(coalesce(t.genres,array[]::text[])) tg join unnest(v_genres) ug
          on lower(tg)=lower(ug) or lower(tg) like '%'||lower(ug)||'%' or lower(ug) like '%'||lower(tg)||'%'
      ) then 80 else 0 end
      + case when exists(select 1 from public.keep_battle_track_themes btt join unnest(v_battle) vb on upper(vb)=upper(btt.theme_code) where btt.track_id=t.id) then 35 else 0 end
      + coalesce((
        select max(a.weight) from public.keep_battle_track_themes btt join public.music_pulse_theme_affinity a on a.theme_code=btt.theme_code
        where btt.track_id=t.id and (
          (a.country_code is not null and exists(select 1 from unnest(v_countries) vc where upper(vc)=upper(a.country_code)))
          or (a.language_code is not null and exists(select 1 from unnest(v_languages) vl where lower(vl)=lower(a.language_code)))
        )
      ),0)
      + least(100,coalesce((
        select max(ga.score)
        from public.profile_music_genre_affinity ga
        where ga.profile_id=uid
          and ga.score>0
          and exists(
            select 1 from unnest(coalesce(t.genres,array[]::text[])) tg
            where regexp_replace(lower(trim(tg)),'\\s+',' ','g')=ga.genre_key
               or regexp_replace(lower(trim(tg)),'\\s+',' ','g') like '%'||ga.genre_key||'%'
               or ga.genre_key like '%'||regexp_replace(lower(trim(tg)),'\\s+',' ','g')||'%'
          )
      ),0))
      + least(90,coalesce((
        select aa.score
        from public.profile_music_artist_affinity aa
        where aa.profile_id=uid
          and aa.score>0
          and aa.artist_key=regexp_replace(lower(trim(t.artist)),'\\s+',' ','g')
        limit 1
      ),0))
      + least(25,coalesce((select count(*) from public.keep_decisions kd2 where kd2.track_id=t.id and kd2.decision='KEPT'),0))::numeric
      + least(12,coalesce((select count(*) from public.profile_swipe_listens psl where psl.track_id=t.id),0))::numeric
      + case when e.profile_id is null then 18 else 0 end
      - case when e.last_shown_at >= now()-interval '6 hours' then 40 when e.last_shown_at >= now()-interval '24 hours' then 20 when e.last_shown_at >= now()-interval '7 days' then 6 else 0 end
    ) as relevance_score,
    e.profile_id is null as is_new
  from public.tracks t
  left join public.profile_loki_pulse_events e on e.profile_id=uid and e.track_id=t.id
  where nullif(trim(coalesce(t.title,'')),'') is not null
    and nullif(trim(coalesce(t.artist,'')),'') is not null
    and nullif(trim(coalesce(t.preview_url,'')),'') is not null
    and e.hidden_at is null
    and not exists(select 1 from public.keep_decisions kd where kd.profile_id=uid and kd.track_id=t.id and kd.decision='KEPT')
  order by relevance_score desc,case when e.profile_id is null then 0 else 1 end,md5(uid::text||':'||t.id::text||':'||current_date::text)
  limit v_limit;

  select count(*) into v_new_count from tmp_loki_pulse_candidates c where c.is_new=true;
  insert into public.profile_loki_pulse_events(profile_id,track_id,first_shown_at,last_shown_at)
  select uid,c.track_id,now(),now() from tmp_loki_pulse_candidates c
  on conflict on constraint profile_loki_pulse_events_pkey do update set last_shown_at=excluded.last_shown_at;

  if v_new_count>0 and not exists(select 1 from public.notifications n where n.profile_id=uid and n.type='LOKI_PULSE_NEW' and n.created_at>=date_trunc('day',now())) then
    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    values(uid,'LOKI_PULSE_NEW','Nouvelles trouvailles dans ton Pulse',v_new_count||case when v_new_count>1 then ' nouvelles musiques t’attendent.' else ' nouvelle musique t’attend.' end,jsonb_build_object('event','LOKI_PULSE_NEW','trackCount',v_new_count,'source','Loki Pulse'),'CREATED',0);
  end if;

  return query select c.track_id,c.title,c.artist,c.album,c.artwork_url,c.preview_url,c.genres,c.provider_ids,c.external_urls,c.available_on,c.release_year,c.relevance_score,c.is_new
  from tmp_loki_pulse_candidates c order by c.relevance_score desc,c.is_new desc,c.title;
end;
$function$;
revoke all on function public.keep_loki_pulse(integer) from public,anon;
grant execute on function public.keep_loki_pulse(integer) to authenticated;
