-- Stories en chapitres (Adel 05/10/2026) : chaque musique = un chapitre ; on garde le temps passé dans chacun (de son arrivée jusqu'à la musique suivante).
-- Additif uniquement : nouvelle colonne + nouvelles fonctions (ping « chapitres » et liste des vues v3) ; les anciennes (ping, v2) restent pour les téléphones pas encore à jour. Rien n'est supprimé.
alter table public.story_watch_sessions add column if not exists chapters jsonb not null default '[]'::jsonb;

create or replace function public.keep_story_watch_chapters_ping(p_session_id uuid, p_seconds integer, p_tracks_seen integer, p_last_track_id uuid, p_listened boolean, p_ended boolean default false, p_chapters jsonb default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
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
        select coalesce(jsonb_agg(jsonb_build_object('i', m.i, 's', m.sec) order by m.i), '[]'::jsonb)
        from (
          select (e->>'i')::int as i, least(max((e->>'s')::int), 7200) as sec
          from (select value as e from jsonb_array_elements(s.chapters) union all select value from jsonb_array_elements(p_chapters)) t
          where (e->>'i') ~ '^[0-9]{1,3}$' and (e->>'s') ~ '^[0-9]{1,5}$'
          group by 1
        ) m)
      else s.chapters end
  where s.id = p_session_id and s.viewer_id = auth.uid();
end $function$;

create or replace function public.keep_my_story_viewers_v3()
returns table(viewer_id uuid, username text, avatar_url text, viewed_at timestamptz, seconds integer, tracks_seen integer, tracks_total integer, listened boolean, watching boolean, left_at timestamptz, is_follower boolean, is_reprise boolean, chapters jsonb)
language sql stable security definer set search_path to 'public' as $function$
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
             from public.story_watch_sessions s2, jsonb_array_elements(s2.chapters) e
             where s2.owner_id = auth.uid() and s2.viewer_id = s.viewer_id and s2.started_at > now() - interval '24 hours'
             group by 1) c) as chapters
  from public.story_watch_sessions s
  join public.profiles p on p.id = s.viewer_id
  where s.owner_id = auth.uid() and s.started_at > now() - interval '24 hours'
  group by s.viewer_id, p.username, p.avatar_url
  order by max(s.started_at) desc
  limit 200;
$function$;
revoke all on function public.keep_story_watch_chapters_ping(uuid, integer, integer, uuid, boolean, boolean, jsonb) from public, anon;
grant execute on function public.keep_story_watch_chapters_ping(uuid, integer, integer, uuid, boolean, boolean, jsonb) to authenticated;
revoke all on function public.keep_my_story_viewers_v3() from public, anon;
grant execute on function public.keep_my_story_viewers_v3() to authenticated;
