-- Battle audio fairness: every client calibrates against the same PostgreSQL clock,
-- and every Arena round gets a 5-second preload window before the shared start.

create or replace function public.keep_server_epoch_ms()
returns bigint
language sql
volatile
security definer
set search_path = public
as $$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

revoke all on function public.keep_server_epoch_ms() from public, anon;
grant execute on function public.keep_server_epoch_ms() to authenticated;

create or replace function public.keep_battle_arena_start(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  a public.keep_battle_arenas%rowtype;
  active_count integer;
  round_start timestamptz;
  pending_count integer;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=v_uid and seat_status='ACTIVE') then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
  if a.status='ACTIVE' then return public.keep_battle_arena_state(a.id); end if;
  select count(*) into pending_count from public.keep_battle_challenges where arena_id=a.id and status='PENDING';
  if pending_count>0 then raise exception 'BATTLE_ARENA_PENDING_INVITES'; end if;
  for v_uid in select profile_id from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' loop
    if not public.keep_battle_arena_lock_stake(a.id,a.match_no,v_uid) then
      update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=v_uid;
    end if;
  end loop;
  select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  if active_count<2 then raise exception 'BATTLE_ARENA_NEEDS_TWO_ELIGIBLE_PLAYERS'; end if;
  update public.keep_battle_arena_members
  set score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0
  where arena_id=a.id and seat_status='ACTIVE';
  update public.keep_battle_arenas
  set status='ACTIVE',current_round=1,started_at=coalesce(started_at,now()),round_duration_ms=10000,updated_at=now()
  where id=a.id returning * into a;
  round_start:=now()+interval '5 seconds';
  update public.keep_battle_arena_rounds
  set started_at=round_start,closes_at=round_start+interval '10 seconds'
  where arena_id=a.id and match_no=a.match_no and position=1;
  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_advance_after_reveal(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a public.keep_battle_arenas%rowtype;
  r public.keep_battle_arena_rounds%rowtype;
  next_round integer;
  round_start timestamptz;
  active_count integer;
  candidate uuid;
  stake integer;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found or a.status<>'ACTIVE' then return; end if;
  select * into r from public.keep_battle_arena_rounds
  where arena_id=a.id and match_no=a.match_no and position=a.current_round
  for update;
  if not found or r.finalized_at is null or coalesce(r.reveal_until,now()+interval '1 second')>now() then return; end if;

  next_round:=a.current_round+1;
  if next_round>a.round_count then perform public.keep_battle_arena_finish_match(a.id); return; end if;

  stake:=public.keep_battle_stake_for_rounds(a.round_count);
  loop
    select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
    exit when active_count>=a.max_players;
    select profile_id into candidate
    from public.keep_battle_arena_members
    where arena_id=a.id and seat_status='QUEUED'
    order by joined_at asc
    limit 1
    for update skip locked;
    exit when candidate is null;
    if public.keep_battle_arena_lock_stake(a.id,a.match_no,candidate) then
      update public.keep_battle_arena_members
      set seat_status='ACTIVE',score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0
      where arena_id=a.id and profile_id=candidate;
      insert into public.notifications(profile_id,type,title,body,data)
      values(candidate,'BATTLE_ARENA_PROMOTED','🔥 Tu rejoins le Battle','La piste est terminée : tu entres dans le match dès la prochaine.',jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'stakeFree',stake));
    else
      update public.keep_battle_arena_members set seat_status='ELIMINATED'
      where arena_id=a.id and profile_id=candidate;
    end if;
  end loop;

  update public.keep_battle_arenas set current_round=next_round,updated_at=now() where id=a.id;
  round_start:=now()+interval '5 seconds';
  update public.keep_battle_arena_rounds
  set started_at=round_start,closes_at=round_start+interval '10 seconds',reveal_until=null
  where arena_id=a.id and match_no=a.match_no and position=next_round;
end;
$function$;
