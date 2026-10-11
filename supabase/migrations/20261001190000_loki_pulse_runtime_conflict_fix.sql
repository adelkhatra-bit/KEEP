-- Runtime fix for keep_loki_pulse(): output parameter track_id shadows an unqualified ON CONFLICT target in PL/pgSQL.
create or replace function public.keep_loki_pulse(p_limit integer default 14)
returns table(
  track_id uuid,
  title text,
  artist text,
  album text,
  artwork_url text,
  preview_url text,
  genres text[],
  provider_ids jsonb,
  external_urls jsonb,
  available_on text[],
  release_year smallint,
  relevance_score numeric,
  is_new boolean
)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  uid uuid := auth.uid();
  v_limit integer := greatest(4, least(coalesce(p_limit,14), 30));
  v_genres text[] := array[]::text[];
  v_battle text[] := array[]::text[];
  v_new_count integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select coalesce(favorite_genres, array[]::text[]) into v_genres
  from public.profiles where id=uid;

  select coalesce(theme_codes, array[]::text[]) into v_battle
  from public.keep_battle_match_preferences where profile_id=uid;

  create temporary table if not exists tmp_loki_pulse_candidates (
    track_id uuid primary key,
    title text,
    artist text,
    album text,
    artwork_url text,
    preview_url text,
    genres text[],
    provider_ids jsonb,
    external_urls jsonb,
    available_on text[],
    release_year smallint,
    relevance_score numeric,
    is_new boolean
  ) on commit drop;
  truncate tmp_loki_pulse_candidates;

  insert into tmp_loki_pulse_candidates
  select
    t.id,
    t.title,
    t.artist,
    t.album,
    t.artwork_url,
    t.preview_url,
    coalesce(t.genres,array[]::text[]),
    coalesce(t.provider_ids,'{}'::jsonb),
    coalesce(t.external_urls,'{}'::jsonb),
    coalesce(t.available_on,array[]::text[]),
    t.release_year,
    (
      case when exists (
        select 1
        from unnest(coalesce(t.genres,array[]::text[])) tg
        join unnest(v_genres) ug on lower(tg)=lower(ug)
      ) then 60 else 0 end
      + case when exists (
        select 1 from public.keep_battle_track_themes btt
        where btt.track_id=t.id and upper(btt.theme_code)=any(select upper(x) from unnest(v_battle) x)
      ) then 35 else 0 end
      + least(25, coalesce((select count(*) from public.keep_decisions kd2 where kd2.track_id=t.id and kd2.decision='KEPT'),0))::numeric
      + least(12, coalesce((select count(*) from public.profile_swipe_listens psl where psl.track_id=t.id),0))::numeric
      + case when t.created_at >= now()-interval '30 days' then 8 else 0 end
    ) as relevance_score,
    e.profile_id is null as is_new
  from public.tracks t
  left join public.profile_loki_pulse_events e
    on e.profile_id=uid and e.track_id=t.id
  where nullif(trim(coalesce(t.title,'')),'') is not null
    and nullif(trim(coalesce(t.artist,'')),'') is not null
    and nullif(trim(coalesce(t.preview_url,'')),'') is not null
    and e.hidden_at is null
    and not exists (
      select 1 from public.keep_decisions kd
      where kd.profile_id=uid and kd.track_id=t.id and kd.decision='KEPT'
    )
  order by
    relevance_score desc,
    case when e.profile_id is null then 0 else 1 end,
    md5(uid::text || ':' || t.id::text || ':' || current_date::text)
  limit v_limit;

  select count(*) into v_new_count from tmp_loki_pulse_candidates where is_new=true;

  insert into public.profile_loki_pulse_events(profile_id,track_id,first_shown_at,last_shown_at)
  select uid,c.track_id,now(),now()
  from tmp_loki_pulse_candidates c
  on conflict on constraint profile_loki_pulse_events_pkey
  do update set last_shown_at=excluded.last_shown_at;

  if v_new_count > 0 and not exists (
    select 1 from public.notifications n
    where n.profile_id=uid
      and n.type='LOKI_PULSE_NEW'
      and n.created_at >= date_trunc('day',now())
  ) then
    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    values(
      uid,
      'LOKI_PULSE_NEW',
      'Nouveau dans Loki Pulse',
      v_new_count || case when v_new_count>1 then ' nouvelles musiques t’attendent selon tes styles.' else ' nouvelle musique t’attend selon tes styles.' end,
      jsonb_build_object('event','LOKI_PULSE_NEW','trackCount',v_new_count,'source','Loki Pulse'),
      'CREATED',
      0
    );
  end if;

  return query
  select c.track_id,c.title,c.artist,c.album,c.artwork_url,c.preview_url,c.genres,
         c.provider_ids,c.external_urls,c.available_on,c.release_year,c.relevance_score,c.is_new
  from tmp_loki_pulse_candidates c
  order by c.relevance_score desc, c.is_new desc, c.title;
end;
$function$;
