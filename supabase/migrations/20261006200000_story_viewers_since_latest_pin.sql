-- RECOPIE dans le dépôt d'une migration DÉJÀ APPLIQUÉE en base le 06/10/2026 par Claude navigateur (accord d'Adel).
-- keep_my_story_viewers et _v2 ne comptent que les vues postérieures à la dernière mise en story (story_pins.pinned_at).
-- Preuve en base : @adel4A 2 → 1. Contenu identique à pg_get_functiondef relevé le 06/10/2026 ~21h.
CREATE OR REPLACE FUNCTION public.keep_my_story_viewers()
 RETURNS TABLE(viewer_id uuid, username text, avatar_url text, viewed_at timestamp with time zone, is_follower boolean, is_reprise boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with since as (
    select greatest(now() - interval '24 hours',
      coalesce((select max(sp.pinned_at) from public.story_pins sp where sp.profile_id = auth.uid()), now() - interval '24 hours')) as t
  )
  select v.viewer_id, p.username, p.avatar_url, v.viewed_at,
    exists (select 1 from public.follows f where f.follower_id = v.viewer_id and f.followee_id = auth.uid()) as is_follower,
    exists (select 1 from public.keep_decisions d where d.profile_id = v.viewer_id and d.decision = 'KEPT' and d.source_user_id = auth.uid()) as is_reprise
  from public.story_views v
  join public.profiles p on p.id = v.viewer_id
  where v.owner_id = auth.uid() and v.viewed_at > (select t from since)
  order by v.viewed_at desc
  limit 200;
$function$;

CREATE OR REPLACE FUNCTION public.keep_my_story_viewers_v2()
 RETURNS TABLE(viewer_id uuid, username text, avatar_url text, viewed_at timestamp with time zone, seconds integer, tracks_seen integer, tracks_total integer, listened boolean, watching boolean, left_at timestamp with time zone, is_follower boolean, is_reprise boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with since as (
    select greatest(now() - interval '24 hours',
      coalesce((select max(sp.pinned_at) from public.story_pins sp where sp.profile_id = auth.uid()), now() - interval '24 hours')) as t
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
    exists (select 1 from public.keep_decisions d where d.profile_id = s.viewer_id and d.decision = 'KEPT' and d.source_user_id = auth.uid()) as is_reprise
  from public.story_watch_sessions s
  join public.profiles p on p.id = s.viewer_id
  where s.owner_id = auth.uid() and s.started_at > (select t from since)
  group by s.viewer_id, p.username, p.avatar_url
  order by max(s.started_at) desc
  limit 200;
$function$;
