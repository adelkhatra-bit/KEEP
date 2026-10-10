-- Loki Pulse worldwide scoring: more results, country/language affinity, freshness rotation.
create table if not exists public.music_pulse_theme_affinity (
  id bigserial primary key,
  country_code text,
  language_code text,
  theme_code text not null references public.keep_battle_themes(code) on delete cascade,
  weight integer not null default 30,
  check (country_code is not null or language_code is not null)
);
create unique index if not exists music_pulse_theme_affinity_key
on public.music_pulse_theme_affinity(coalesce(country_code,''),coalesce(language_code,''),theme_code);
alter table public.music_pulse_theme_affinity enable row level security;
drop policy if exists music_pulse_theme_affinity_read on public.music_pulse_theme_affinity;
create policy music_pulse_theme_affinity_read on public.music_pulse_theme_affinity for select using(true);

insert into public.music_pulse_theme_affinity(country_code,language_code,theme_code,weight) values
('FR','fra','CHANSON_FR',45),('FR','fra','RAP_FR',45),('BE','fra','CHANSON_FR',35),('CH','fra','CHANSON_FR',35),('CA','fra','CHANSON_FR',30),
('MA','ara','RAI',45),('DZ','ara','RAI',45),('TN','ara','RAI',45),('MA','ara','ARABE',35),('DZ','ara','ARABE',35),('TN','ara','ARABE',35),
('SA','ara','ARABE',45),('AE','ara','ARABE',45),('EG','ara','EGYPTIAN_POP',45),('AE','ara','KHALEEJI',40),('SA','ara','KHALEEJI',40),
('BR','por','BRESIL',45),('BR','por','SERTANEJO',40),('BR','por','PAGODE',40),('BR','por','BAILE_FUNK',40),
('KR','kor','KPOP',50),('IN','hin','INDE',50),('TR','tur','TURC',50),('RU','rus','RUSSE',50),
('ES','spa','LATINO',35),('MX','spa','REGGAETON',45),('MX','spa','MEXICAN',45),('CO','spa','LATINO',40),('AR','spa','LATINO',40),('PR','spa','REGGAETON',45),
(null,'fra','CHANSON_FR',25),(null,'fra','RAP_FR',25),(null,'ara','ARABE',25),(null,'ara','RAI',20),(null,'por','BRESIL',20),(null,'kor','KPOP',30),(null,'hin','INDE',30),(null,'tur','TURC',30),(null,'rus','RUSSE',30),(null,'spa','LATINO',20)
on conflict do nothing;

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
