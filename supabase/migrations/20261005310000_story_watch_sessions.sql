-- Vues de story fiables façon Instagram (Adel 05/10/2026) : une vue n'est créée qu'après un délai de présence réelle (côté app) et suit :
-- temps passé, musiques vues, écoute, instant du départ ; le propriétaire voit le détail et reçoit le départ en temps réel. Additif uniquement.
create table if not exists public.story_watch_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_ping_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds integer not null default 0,
  tracks_seen integer not null default 0,
  tracks_total integer not null default 0,
  last_track_id uuid,
  listened boolean not null default false
);
create index if not exists story_watch_sessions_owner_idx on public.story_watch_sessions (owner_id, started_at desc);
create index if not exists story_watch_sessions_viewer_idx on public.story_watch_sessions (viewer_id, started_at desc);
alter table public.story_watch_sessions enable row level security;
drop policy if exists story_watch_owner_select on public.story_watch_sessions;
create policy story_watch_owner_select on public.story_watch_sessions for select to authenticated using (owner_id = auth.uid() or viewer_id = auth.uid());

create or replace function public.keep_story_watch_start(p_owner_id uuid, p_tracks_total integer default 0)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_owner_id is null or p_owner_id = auth.uid() then return null; end if;
  insert into public.story_watch_sessions (owner_id, viewer_id, tracks_total) values (p_owner_id, auth.uid(), greatest(0, least(coalesce(p_tracks_total,0), 200))) returning id into v_id;
  -- Compatibilité : la vue du jour (compteur existant) n'est enregistrée qu'ici, c'est-à-dire après le délai de présence.
  insert into public.story_views (owner_id, viewer_id) values (p_owner_id, auth.uid())
  on conflict (owner_id, viewer_id, day) do update set viewed_at = now();
  return v_id;
end $function$;

create or replace function public.keep_story_watch_ping(p_session_id uuid, p_seconds integer, p_tracks_seen integer, p_last_track_id uuid, p_listened boolean, p_ended boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.story_watch_sessions s set
    seconds = greatest(s.seconds, least(greatest(coalesce(p_seconds,0),0), 7200)),
    tracks_seen = greatest(s.tracks_seen, least(greatest(coalesce(p_tracks_seen,0),0), 200)),
    last_track_id = coalesce(p_last_track_id, s.last_track_id),
    listened = s.listened or coalesce(p_listened,false),
    last_ping_at = now(),
    ended_at = case when coalesce(p_ended,false) then now() else s.ended_at end
  where s.id = p_session_id and s.viewer_id = auth.uid();
end $function$;

create or replace function public.keep_my_story_viewers_v2()
returns table(viewer_id uuid, username text, avatar_url text, viewed_at timestamptz, seconds integer, tracks_seen integer, tracks_total integer, listened boolean, watching boolean, left_at timestamptz, is_follower boolean, is_reprise boolean)
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
    exists (select 1 from public.keep_decisions d where d.profile_id = s.viewer_id and d.decision = 'KEPT' and d.source_user_id = auth.uid()) as is_reprise
  from public.story_watch_sessions s
  join public.profiles p on p.id = s.viewer_id
  where s.owner_id = auth.uid() and s.started_at > now() - interval '24 hours'
  group by s.viewer_id, p.username, p.avatar_url
  order by max(s.started_at) desc
  limit 200;
$function$;

revoke all on function public.keep_story_watch_start(uuid, integer) from public, anon;
grant execute on function public.keep_story_watch_start(uuid, integer) to authenticated;
revoke all on function public.keep_story_watch_ping(uuid, integer, integer, uuid, boolean, boolean) from public, anon;
grant execute on function public.keep_story_watch_ping(uuid, integer, integer, uuid, boolean, boolean) to authenticated;
revoke all on function public.keep_my_story_viewers_v2() from public, anon;
grant execute on function public.keep_my_story_viewers_v2() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'story_watch_sessions') then
    alter publication supabase_realtime add table public.story_watch_sessions;
  end if;
end $$;
