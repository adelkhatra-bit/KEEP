-- Vues de story « façon Instagram » (Adel, 06/10/2026) : pour chaque spectateur, QUELLE musique il a vue et ce qu'il en a fait
-- (écoutée en entier / passée / arrêté ici), sans afficher de durées.
-- Cause racine du détail incohérent : les chapitres n'étaient repérés que par leur POSITION (i) dans la story ; les positions
-- glissent à chaque ajout. Additif, rien supprimé :
--   1) keep_story_watch_chapters_ping conserve aussi l'identifiant de la musique (t) envoyé par l'app ;
--   2) keep_my_story_viewers_v4 renvoie, par spectateur, les musiques vues (t, secondes max), la dernière musique de sa
--      dernière visite et si elle est terminée. L'ancienne v3 reste en place (anciennes versions de l'app).
create or replace function public.keep_story_watch_chapters_ping(
  p_session_id uuid, p_seconds integer, p_tracks_seen integer, p_last_track_id uuid, p_listened boolean,
  p_ended boolean default false, p_chapters jsonb default null::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.story_watch_sessions s set
    seconds = greatest(s.seconds, least(greatest(coalesce(p_seconds,0),0), 7200)),
    tracks_seen = greatest(s.tracks_seen, least(greatest(coalesce(p_tracks_seen,0),0), 200)),
    last_track_id = coalesce(p_last_track_id, s.last_track_id),
    listened = s.listened or coalesce(p_listened,false),
    last_ping_at = now(),
    ended_at = case when coalesce(p_ended,false) then now() else s.ended_at end,
    chapters = case
      when p_chapters is not null and jsonb_typeof(p_chapters) = 'array' and jsonb_array_length(p_chapters) <= 200 then (
        select coalesce(jsonb_agg(
          case when m.t is null then jsonb_build_object('i', m.i, 's', m.sec) else jsonb_build_object('i', m.i, 's', m.sec, 't', m.t) end
          order by m.i), '[]'::jsonb)
        from (
          select (t.e->>'i')::int as i,
                 least(max((t.e->>'s')::int), 7200) as sec,
                 max(case when (t.e->>'t') ~* '^[0-9a-f-]{36}$' then t.e->>'t' end) as t
          from (select value as e from jsonb_array_elements(s.chapters) union all select value from jsonb_array_elements(p_chapters)) t
          where (t.e->>'i') ~ '^[0-9]{1,3}$' and (t.e->>'s') ~ '^[0-9]{1,5}$'
          group by 1
        ) m)
      else s.chapters end
  where s.id = p_session_id and s.viewer_id = auth.uid();
end $function$;

create or replace function public.keep_my_story_viewers_v4()
returns table(
  viewer_id uuid, username text, avatar_url text, viewed_at timestamptz, seconds integer, tracks_seen integer, tracks_total integer,
  listened boolean, watching boolean, left_at timestamptz, is_follower boolean, is_reprise boolean,
  chapters jsonb, track_views jsonb, last_track_id uuid, last_ended boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with sess as (
    select s.* from public.story_watch_sessions s
    where s.owner_id = auth.uid() and s.started_at > now() - interval '24 hours'
  ), latest as (
    select distinct on (viewer_id) viewer_id, last_track_id, (ended_at is not null or last_ping_at < now() - interval '25 seconds') as ended
    from sess order by viewer_id, started_at desc
  )
  select s.viewer_id, p.username, p.avatar_url,
    max(s.started_at) as viewed_at,
    least(sum(s.seconds), 7200)::integer as seconds,
    max(s.tracks_seen)::integer as tracks_seen,
    max(s.tracks_total)::integer as tracks_total,
    bool_or(s.listened) as listened,
    bool_or(s.ended_at is null and s.last_ping_at > now() - interval '25 seconds') as watching,
    max(coalesce(s.ended_at, s.last_ping_at)) as left_at,
    exists (select 1 from public.follows f where f.follower_id = s.viewer_id and f.followee_id = auth.uid()) as is_follower,
    exists (select 1 from public.keep_decisions d where d.profile_id = s.viewer_id and d.decision = 'KEPT' and d.source_user_id = auth.uid()) as is_reprise,
    (select coalesce(jsonb_agg(jsonb_build_object('i', c.i, 's', c.sec) order by c.i), '[]'::jsonb)
       from (select (e.value->>'i')::int as i, sum((e.value->>'s')::int)::int as sec
             from sess s2, jsonb_array_elements(s2.chapters) e where s2.viewer_id = s.viewer_id group by 1) c) as chapters,
    -- Par musique (identifiant réel) : le plus long passage, toutes visites confondues.
    (select coalesce(jsonb_agg(jsonb_build_object('t', c.t, 's', c.sec)), '[]'::jsonb)
       from (select e.value->>'t' as t, max((e.value->>'s')::int)::int as sec
             from sess s2, jsonb_array_elements(s2.chapters) e
             where s2.viewer_id = s.viewer_id and (e.value->>'t') is not null group by 1) c) as track_views,
    (select l.last_track_id from latest l where l.viewer_id = s.viewer_id) as last_track_id,
    coalesce((select l.ended from latest l where l.viewer_id = s.viewer_id), true) as last_ended
  from sess s
  join public.profiles p on p.id = s.viewer_id
  group by s.viewer_id, p.username, p.avatar_url
  order by max(s.started_at) desc
  limit 200;
$function$;

revoke all on function public.keep_my_story_viewers_v4() from public, anon;
grant execute on function public.keep_my_story_viewers_v4() to authenticated;
