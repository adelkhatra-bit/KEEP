-- Automatic music taste learning from keeps + listens, independent from explicit questionnaire choices.
create table if not exists public.profile_music_taste_genres (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  genre_key text not null,
  display_genre text not null,
  score numeric not null default 0,
  keep_events integer not null default 0,
  listen_events integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(profile_id,genre_key)
);
create index if not exists idx_profile_music_taste_genres_score on public.profile_music_taste_genres(profile_id,score desc);

create table if not exists public.profile_music_taste_artists (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  artist_key text not null,
  display_artist text not null,
  score numeric not null default 0,
  keep_events integer not null default 0,
  listen_events integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(profile_id,artist_key)
);
create index if not exists idx_profile_music_taste_artists_score on public.profile_music_taste_artists(profile_id,score desc);

alter table public.profile_music_taste_genres enable row level security;
alter table public.profile_music_taste_artists enable row level security;
drop policy if exists own_profile_music_taste_genres on public.profile_music_taste_genres;
create policy own_profile_music_taste_genres on public.profile_music_taste_genres
for select using (profile_id=auth.uid());
drop policy if exists own_profile_music_taste_artists on public.profile_music_taste_artists;
create policy own_profile_music_taste_artists on public.profile_music_taste_artists
for select using (profile_id=auth.uid());

create or replace function public.keep_learn_track_taste(
  p_profile_id uuid,
  p_track_id uuid,
  p_keep_weight numeric default 0,
  p_listen_weight numeric default 0
)
returns void
language plpgsql
security definer
set search_path=public
as $function$
declare
  t public.tracks%rowtype;
  g text;
  v_genre_key text;
  v_artist_key text;
begin
  if p_profile_id is null or p_track_id is null then return; end if;
  select * into t from public.tracks where id=p_track_id;
  if not found then return; end if;

  foreach g in array coalesce(t.genres,array[]::text[]) loop
    v_genre_key := lower(regexp_replace(trim(g),'\s+',' ','g'));
    if nullif(v_genre_key,'') is null then continue; end if;
    insert into public.profile_music_taste_genres(profile_id,genre_key,display_genre,score,keep_events,listen_events,updated_at)
    values(
      p_profile_id,v_genre_key,trim(g),
      greatest(0,p_keep_weight+p_listen_weight),
      case when p_keep_weight>0 then 1 else 0 end,
      case when p_listen_weight>0 then 1 else 0 end,
      now()
    )
    on conflict(profile_id,genre_key) do update set
      display_genre=excluded.display_genre,
      score=least(1000, public.profile_music_taste_genres.score + excluded.score),
      keep_events=public.profile_music_taste_genres.keep_events + excluded.keep_events,
      listen_events=public.profile_music_taste_genres.listen_events + excluded.listen_events,
      updated_at=now();
  end loop;

  v_artist_key := lower(regexp_replace(trim(coalesce(t.artist,'')),'\s+',' ','g'));
  if nullif(v_artist_key,'') is not null then
    insert into public.profile_music_taste_artists(profile_id,artist_key,display_artist,score,keep_events,listen_events,updated_at)
    values(
      p_profile_id,v_artist_key,trim(t.artist),
      greatest(0,p_keep_weight*0.85+p_listen_weight*0.7),
      case when p_keep_weight>0 then 1 else 0 end,
      case when p_listen_weight>0 then 1 else 0 end,
      now()
    )
    on conflict(profile_id,artist_key) do update set
      display_artist=excluded.display_artist,
      score=least(1000, public.profile_music_taste_artists.score + excluded.score),
      keep_events=public.profile_music_taste_artists.keep_events + excluded.keep_events,
      listen_events=public.profile_music_taste_artists.listen_events + excluded.listen_events,
      updated_at=now();
  end if;
end;
$function$;
revoke all on function public.keep_learn_track_taste(uuid,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.keep_learn_track_taste(uuid,uuid,numeric,numeric) to service_role;

create or replace function public.keep_taste_from_keep_trigger()
returns trigger language plpgsql security definer set search_path=public
as $function$
begin
  if new.decision='KEPT' then
    perform public.keep_learn_track_taste(new.profile_id,new.track_id,4,0);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_keep_taste_from_keep on public.keep_decisions;
create trigger trg_keep_taste_from_keep
after insert on public.keep_decisions
for each row execute function public.keep_taste_from_keep_trigger();

create or replace function public.keep_taste_from_listen_trigger()
returns trigger language plpgsql security definer set search_path=public
as $function$
begin
  perform public.keep_learn_track_taste(new.listener_id,new.track_id,0,1);
  return new;
end;
$function$;

drop trigger if exists trg_keep_taste_from_listen on public.profile_swipe_listens;
create trigger trg_keep_taste_from_listen
after insert on public.profile_swipe_listens
for each row execute function public.keep_taste_from_listen_trigger();

-- One-time backfill from the history already owned by the platform.
insert into public.profile_music_taste_genres(profile_id,genre_key,display_genre,score,keep_events,listen_events,updated_at)
select kd.profile_id, lower(regexp_replace(trim(g),'\s+',' ','g')) as genre_key, min(trim(g)) as display_genre,
       count(*)*4::numeric, count(*)::integer, 0, now()
from public.keep_decisions kd
join public.tracks t on t.id=kd.track_id
cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
where kd.decision='KEPT' and nullif(trim(g),'') is not null
group by kd.profile_id,lower(regexp_replace(trim(g),'\s+',' ','g'))
on conflict(profile_id,genre_key) do update set
  score=greatest(public.profile_music_taste_genres.score,excluded.score),
  keep_events=greatest(public.profile_music_taste_genres.keep_events,excluded.keep_events),
  updated_at=now();

insert into public.profile_music_taste_genres(profile_id,genre_key,display_genre,score,keep_events,listen_events,updated_at)
select psl.listener_id, lower(regexp_replace(trim(g),'\s+',' ','g')) as genre_key, min(trim(g)) as display_genre,
       count(*)::numeric, 0, count(*)::integer, now()
from public.profile_swipe_listens psl
join public.tracks t on t.id=psl.track_id
cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
where nullif(trim(g),'') is not null
group by psl.listener_id,lower(regexp_replace(trim(g),'\s+',' ','g'))
on conflict(profile_id,genre_key) do update set
  score=least(1000,public.profile_music_taste_genres.score+excluded.score),
  listen_events=greatest(public.profile_music_taste_genres.listen_events,excluded.listen_events),
  updated_at=now();

insert into public.profile_music_taste_artists(profile_id,artist_key,display_artist,score,keep_events,listen_events,updated_at)
select kd.profile_id, lower(regexp_replace(trim(t.artist),'\s+',' ','g')) as artist_key, min(trim(t.artist)) as display_artist,
       count(*)*3.4::numeric, count(*)::integer, 0, now()
from public.keep_decisions kd join public.tracks t on t.id=kd.track_id
where kd.decision='KEPT' and nullif(trim(t.artist),'') is not null
group by kd.profile_id,lower(regexp_replace(trim(t.artist),'\s+',' ','g'))
on conflict(profile_id,artist_key) do update set
  score=greatest(public.profile_music_taste_artists.score,excluded.score),
  keep_events=greatest(public.profile_music_taste_artists.keep_events,excluded.keep_events),
  updated_at=now();

insert into public.profile_music_taste_artists(profile_id,artist_key,display_artist,score,keep_events,listen_events,updated_at)
select psl.listener_id, lower(regexp_replace(trim(t.artist),'\s+',' ','g')) as artist_key, min(trim(t.artist)) as display_artist,
       count(*)*0.7::numeric, 0, count(*)::integer, now()
from public.profile_swipe_listens psl join public.tracks t on t.id=psl.track_id
where nullif(trim(t.artist),'') is not null
group by psl.listener_id,lower(regexp_replace(trim(t.artist),'\s+',' ','g'))
on conflict(profile_id,artist_key) do update set
  score=least(1000,public.profile_music_taste_artists.score+excluded.score),
  listen_events=greatest(public.profile_music_taste_artists.listen_events,excluded.listen_events),
  updated_at=now();

create or replace function public.keep_music_taste_for_me()
returns jsonb
language plpgsql stable security definer set search_path=public,auth
as $function$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  return jsonb_build_object(
    'genres',coalesce((
      select jsonb_agg(jsonb_build_object('genre',display_genre,'score',round(score,2),'keeps',keep_events,'listens',listen_events) order by score desc)
      from (select * from public.profile_music_taste_genres where profile_id=uid order by score desc limit 30) x
    ),'[]'::jsonb),
    'artists',coalesce((
      select jsonb_agg(jsonb_build_object('artist',display_artist,'score',round(score,2),'keeps',keep_events,'listens',listen_events) order by score desc)
      from (select * from public.profile_music_taste_artists where profile_id=uid order by score desc limit 30) x
    ),'[]'::jsonb)
  );
end;
$function$;
revoke all on function public.keep_music_taste_for_me() from public,anon;
grant execute on function public.keep_music_taste_for_me() to authenticated;

-- Pulse learns from both explicit choices and passive behavior.
create or replace function public.keep_loki_pulse(p_limit integer default 36)
returns table(track_id uuid,title text,artist text,album text,artwork_url text,preview_url text,genres text[],provider_ids jsonb,external_urls jsonb,available_on text[],release_year smallint,relevance_score numeric,is_new boolean)
language plpgsql security definer set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_limit integer := greatest(4,least(coalesce(p_limit,36),60));
  v_genres text[] := array[]::text[];
  v_artists text[] := array[]::text[];
  v_battle text[] := array[]::text[];
  v_languages text[] := array[]::text[];
  v_countries text[] := array[]::text[];
  v_new_count integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select coalesce(favorite_genres,array[]::text[]),coalesce(favorite_artists,array[]::text[]),
         coalesce(music_language_codes,array[]::text[]),coalesce(music_country_codes,array[]::text[])
    into v_genres,v_artists,v_languages,v_countries from public.profiles where id=uid;
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
      + case when exists(select 1 from unnest(v_artists) ua where lower(trim(ua))=lower(trim(t.artist))) then 70 else 0 end
      + coalesce((
          select least(70,max(g.score)*6)
          from public.profile_music_taste_genres g
          where g.profile_id=uid and exists(
            select 1 from unnest(coalesce(t.genres,array[]::text[])) tg
            where lower(trim(tg))=g.genre_key
               or lower(trim(tg)) like '%'||g.genre_key||'%'
               or g.genre_key like '%'||lower(trim(tg))||'%'
          )
        ),0)
      + coalesce((
          select least(65,max(a.score)*5)
          from public.profile_music_taste_artists a
          where a.profile_id=uid
            and (lower(trim(t.artist))=a.artist_key or lower(trim(t.artist)) like a.artist_key||' feat.%')
        ),0)
      + case when exists(select 1 from public.keep_battle_track_themes btt join unnest(v_battle) vb on upper(vb)=upper(btt.theme_code) where btt.track_id=t.id) then 35 else 0 end
      + coalesce((
        select max(a.weight) from public.keep_battle_track_themes btt join public.music_pulse_theme_affinity a on a.theme_code=btt.theme_code
        where btt.track_id=t.id and (
          (a.country_code is not null and exists(select 1 from unnest(v_countries) vc where upper(vc)=upper(a.country_code)))
          or (a.language_code is not null and exists(select 1 from unnest(v_languages) vl where lower(vl)=lower(a.language_code)))
        )
      ),0)
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
