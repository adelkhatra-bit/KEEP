-- Empty Battle arenas are history, not live rooms.
-- Preserve every arena/member/result row; only close stale empty WAITING shells
-- and exclude zero-player shells from the live lobby counters.

update public.keep_battle_arenas a
set status='CLOSED', updated_at=now()
where a.status='WAITING'
  and a.updated_at < now()-interval '90 seconds'
  and not exists (
    select 1
    from public.keep_battle_arena_members m
    where m.arena_id=a.id
      and m.seat_status in ('ACTIVE','QUEUED')
  );

create or replace function public.keep_battle_arena_lobby()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'waitingArenas', count(*) filter (where status='WAITING'),
    'activeArenas', count(*) filter (where status='ACTIVE'),
    'activePlayers', coalesce(sum(active_count),0),
    'queuedPlayers', coalesce(sum(queue_count),0),
    'maxVisiblePerArena', 10
  )
  from (
    select
      a.status,
      (select count(*) from public.keep_battle_arena_members m
       where m.arena_id=a.id and m.seat_status='ACTIVE') as active_count,
      (select count(*) from public.keep_battle_arena_members m
       where m.arena_id=a.id and m.seat_status='QUEUED') as queue_count
    from public.keep_battle_arenas a
    where a.status in ('WAITING','ACTIVE')
      and a.expires_at>now()
  ) s
  where active_count>0 or queue_count>0;
$function$;
