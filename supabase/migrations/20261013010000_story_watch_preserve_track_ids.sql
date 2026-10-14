-- Supabase production migration story_watch_preserve_track_ids_20261013.
-- Conserve t=UUID réel par chapitre de story (PC et iPhone) pour ne plus
-- attribuer une vue au mauvais titre après modification de l'ordre.
create or replace function public.keep_story_watch_chapters_ping(
  p_session_id uuid, p_seconds integer, p_tracks_seen integer,
  p_last_track_id uuid, p_listened boolean,
  p_ended boolean default false, p_chapters jsonb default null::jsonb
) returns void language plpgsql security definer set search_path to 'public'
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
      when p_chapters is not null and jsonb_typeof(p_chapters) = 'array'
        and jsonb_array_length(p_chapters) <= 200 then (
        select coalesce(jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object('i', m.i, 's', m.sec, 't', m.track_id))
          order by m.i, m.track_id nulls last
        ), '[]'::jsonb)
        from (
          select (entry.e->>'i')::int as i,
                 least(max((entry.e->>'s')::int), 7200) as sec,
                 nullif(entry.e->>'t', '') as track_id
          from (
            select value as e from jsonb_array_elements(coalesce(s.chapters, '[]'::jsonb))
            union all
            select value as e from jsonb_array_elements(p_chapters)
          ) entry
          where (entry.e->>'i') ~ '^[0-9]{1,3}$'
            and (entry.e->>'s') ~ '^[0-9]{1,5}$'
            and (not entry.e ? 't' or (entry.e->>'t') ~ '^[0-9a-fA-F-]{36}$')
          group by 1, 3
        ) m)
      else s.chapters end
  where s.id = p_session_id and s.viewer_id = auth.uid();
end $function$;
revoke all on function public.keep_story_watch_chapters_ping(uuid,integer,integer,uuid,boolean,boolean,jsonb) from public, anon;
grant execute on function public.keep_story_watch_chapters_ping(uuid,integer,integer,uuid,boolean,boolean,jsonb) to authenticated, service_role;
