-- Mon classement (Adel 05/10/2026, badge à débloquer) : mes points sur 7 jours, détail et rang, quel que soit mon rang (le top 50 public ne suffit pas pour savoir « il me manque X points »).
-- Lecture seule, aucune donnée modifiée.
create or replace function public.keep_my_story_stats()
returns table(shares integer, reprises integer, followers integer, score integer, rank integer)
language sql stable security definer set search_path to 'public' as $function$
  with events as (
    select sp.profile_id as pid, 1 as pts, 'S' as kind from public.story_pins sp where sp.masked = false and sp.pinned_at > now() - interval '7 days'
    union all
    select d.source_user_id, 3, 'R' from public.keep_decisions d where d.decision = 'KEPT' and d.source_user_id is not null and d.source_user_id <> d.profile_id and d.created_at > now() - interval '7 days'
    union all
    select f.followee_id, 2, 'F' from public.follows f where f.follower_id <> f.followee_id and f.created_at > now() - interval '7 days'
  ), scored as (
    select e.pid,
      count(*) filter (where e.kind = 'S')::integer as shares,
      count(*) filter (where e.kind = 'R')::integer as reprises,
      count(*) filter (where e.kind = 'F')::integer as followers,
      sum(e.pts)::integer as score
    from events e
    join public.profiles p on p.id = e.pid and p.is_public = true and coalesce(p.discovery_hidden, false) = false
    group by e.pid
  ), ranked as (
    select s.*, (row_number() over (order by s.score desc, s.pid))::integer as rank from scored s
  )
  select coalesce(r.shares, 0), coalesce(r.reprises, 0), coalesce(r.followers, 0), coalesce(r.score, 0), r.rank
  from (select 1) x left join ranked r on r.pid = auth.uid();
$function$;
revoke all on function public.keep_my_story_stats() from public, anon;
grant execute on function public.keep_my_story_stats() to authenticated;
