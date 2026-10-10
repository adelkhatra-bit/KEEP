-- Adel (10/10/2026) : « les spectateurs doivent rester enregistrés pendant la durée de la story ».
-- Cause racine (prouvée en lecture seule) : keep_my_story_viewers_v4 ne compte que les sessions commencées APRÈS la première
-- musique MASQUÉE des 24 h. Une musique masquée ajoutée plus tard faisait donc disparaître les spectateurs déjà présents
-- (« 0 vue » alors qu'une session existait à 00:46 UTC, pins à 01:26 UTC).
-- Correction : la fenêtre part de la PREMIÈRE musique de la story des 24 h (publique gardée OU épinglée/masquée), pas seulement des masquées.
-- Même signature, mêmes droits ; aucune donnée modifiée ou supprimée.
CREATE OR REPLACE FUNCTION public.keep_my_story_viewers_v4(p_track_id text DEFAULT NULL::text, p_published_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(viewer_id uuid, username text, avatar_url text, viewed_at timestamp with time zone, seconds integer, tracks_seen integer, tracks_total integer, listened boolean, watching boolean, left_at timestamp with time zone, is_follower boolean, is_reprise boolean, chapters jsonb, playback_progress jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select s.viewer_id, p.username, p.avatar_url, s.started_at, s.seconds, s.tracks_seen, s.tracks_total,
 s.listened, s.ended_at is null and s.last_ping_at > now() - interval '25 seconds', coalesce(s.ended_at,s.last_ping_at),
 exists(select 1 from public.follows f where f.follower_id=s.viewer_id and f.followee_id=auth.uid()),
 exists(select 1 from public.keep_decisions d where d.profile_id=s.viewer_id and d.decision='KEPT' and d.source_user_id=auth.uid()),
 s.chapters, s.playback_progress
 from (select distinct on (viewer_id) * from public.story_watch_sessions
       where owner_id=auth.uid() and started_at > now()-interval '24 hours'
       and viewer_id <> auth.uid()
       and started_at >= coalesce(
         least(
           (select min(sp.pinned_at) from public.story_pins sp
             where sp.profile_id=auth.uid() and sp.pinned_at > now()-interval '24 hours'),
           (select min(d.created_at) from public.keep_decisions d
             where d.profile_id=auth.uid() and d.decision='KEPT' and d.visibility='PUBLIC' and d.created_at > now()-interval '24 hours')
         ),
         (select max(sp.pinned_at) from public.story_pins sp where sp.profile_id=auth.uid()),
         '-infinity'::timestamptz)
       and (p_track_id is null or (
         p_published_at is not null and started_at >= p_published_at
         and playback_progress->'publications' ? p_track_id
         and replace(playback_progress->'publications'->>p_track_id, '+00:00', 'Z') = to_char(p_published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       ))
       order by viewer_id, started_at desc, id desc) s
 join public.profiles p on p.id=s.viewer_id order by s.started_at desc limit 200;
$function$;
revoke all on function public.keep_my_story_viewers_v4(text, timestamptz) from public, anon;
grant execute on function public.keep_my_story_viewers_v4(text, timestamptz) to authenticated, service_role;
