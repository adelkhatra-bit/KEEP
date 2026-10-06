-- « Mon oreille » (Adel 05/10/2026, IDEA-113) : monde parallèle des connaisseurs. LECTURE SEULE, aucune donnée modifiée.
-- Flair = repérer tôt (≤ 3e à réagir) une musique que beaucoup finissent par aimer (≥ 3 ❤). Rapport communauté par style : ❤ / 😐 / 👎 reçus sur mes partages.
create or replace function public.keep_my_ear_report()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_given int; v_early int; v_early_keeps int; v_recv int; v_followers int; v_followers_30 int; v_styles int;
  v_genres jsonb; v_pioneer jsonb; v_audience jsonb; v_recent jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select count(*) into v_given from public.track_likes where profile_id = v_uid;
  select count(*) into v_early from (
    select l.track_id from public.track_likes l
    where l.profile_id = v_uid
      and (select count(*) from public.track_likes x where x.track_id = l.track_id) >= 3
      and (select count(*) from public.track_likes x where x.track_id = l.track_id and (x.created_at, x.profile_id) <= (l.created_at, l.profile_id)) <= 3
  ) e;
  select count(*) into v_early_keeps from (
    select k.track_id from public.keep_decisions k
    where k.profile_id = v_uid and k.decision = 'KEPT'
      and (select count(distinct x.profile_id) from public.keep_decisions x where x.track_id = k.track_id and x.decision = 'KEPT') >= 3
      and (select count(*) from public.keep_decisions x where x.track_id = k.track_id and x.decision = 'KEPT' and (x.created_at, x.profile_id) <= (k.created_at, k.profile_id)) <= 3
  ) e;
  select count(*) into v_recv from public.track_likes l
    where exists (select 1 from public.keep_decisions k where k.profile_id = v_uid and k.decision = 'KEPT' and k.track_id = l.track_id and l.profile_id <> v_uid);
  select count(*) into v_followers from public.follows where followee_id = v_uid;
  select count(*) into v_followers_30 from public.follows where followee_id = v_uid and created_at > now() - interval '30 days';
  select count(distinct lower(trim(g))) into v_styles from (
    select unnest(coalesce(t.genres, array[]::text[])) g from public.tracks t
    where t.id in (select track_id from public.track_likes where profile_id = v_uid union select track_id from public.keep_decisions where profile_id = v_uid and decision = 'KEPT')
  ) s where trim(g) <> '';

  -- Mes styles : musiques partagées + réactions reçues.
  with mine as (
    select distinct t.id as tid, t.genres from public.tracks t
    where t.id in (select k.track_id from public.keep_decisions k where k.profile_id = v_uid and k.decision = 'KEPT' union select sp.track_id from public.story_pins sp where sp.profile_id = v_uid)
  ),
  per as (
    select lower(trim(g)) as genre, m.tid,
      (select count(*) from public.track_likes l where l.track_id = m.tid and l.profile_id <> v_uid) as likes,
      (select count(*) from public.track_dislikes d where d.track_id = m.tid::text and d.reaction = 'MEH' and d.profile_id <> v_uid) as mehs,
      (select count(*) from public.track_dislikes d where d.track_id = m.tid::text and d.reaction = 'DISLIKE' and d.profile_id <> v_uid) as dislikes
    from mine m cross join lateral unnest(coalesce(m.genres, array[]::text[])) g where trim(g) <> ''
  )
  select coalesce(jsonb_agg(jsonb_build_object('genre', genre, 'tracks', tracks, 'likes', likes, 'mehs', mehs, 'dislikes', dislikes) order by likes desc, tracks desc), '[]'::jsonb) into v_genres
  from (select genre, count(*) as tracks, sum(likes)::int as likes, sum(mehs)::int as mehs, sum(dislikes)::int as dislikes from per group by genre order by sum(likes) desc, count(*) desc limit 12) q;

  -- Styles où j'ai été parmi les 3 premiers à réagir ou garder (style à ≥ 3 personnes).
  with sig as (
    select profile_id, lower(trim(g)) as genre, min(ts) as first_at from (
      select k.profile_id, k.created_at as ts, t.genres from public.keep_decisions k join public.tracks t on t.id = k.track_id where k.decision = 'KEPT'
      union all select l.profile_id, l.created_at, t.genres from public.track_likes l join public.tracks t on t.id = l.track_id
    ) a cross join lateral unnest(coalesce(a.genres, array[]::text[])) g where trim(g) <> '' group by profile_id, lower(trim(g))
  ),
  ranked as (select profile_id, genre, rank() over (partition by genre order by first_at) as rk, count(*) over (partition by genre) as n from sig)
  select coalesce(jsonb_agg(jsonb_build_object('genre', genre, 'rank', rk) order by rk), '[]'::jsonb) into v_pioneer
  from ranked where profile_id = v_uid and rk <= 3 and n >= 3;

  -- Goûts de ma communauté (abonnés) : opportunités.
  with fol as (select follower_id from public.follows where followee_id = v_uid),
  sig as (
    select lower(trim(g)) as genre, s.pid from (
      select k.profile_id as pid, t.genres from public.keep_decisions k join public.tracks t on t.id = k.track_id where k.decision = 'KEPT' and k.profile_id in (select follower_id from fol)
      union all select l.profile_id, t.genres from public.track_likes l join public.tracks t on t.id = l.track_id where l.profile_id in (select follower_id from fol)
    ) s cross join lateral unnest(coalesce(s.genres, array[]::text[])) g where trim(g) <> ''
  )
  select coalesce(jsonb_agg(jsonb_build_object('genre', genre, 'fans', fans) order by fans desc), '[]'::jsonb) into v_audience
  from (select genre, count(distinct pid)::int as fans from sig group by genre order by count(distinct pid) desc limit 8) q;

  return jsonb_build_object(
    'given', v_given, 'early_hits', v_early, 'early_keeps', v_early_keeps, 'received', v_recv,
    'followers', v_followers, 'followers_30', v_followers_30, 'styles_explored', v_styles,
    'genres', v_genres, 'pioneer_styles', v_pioneer, 'audience', v_audience);
end $function$;
revoke all on function public.keep_my_ear_report() from public, anon;
grant execute on function public.keep_my_ear_report() to authenticated;
