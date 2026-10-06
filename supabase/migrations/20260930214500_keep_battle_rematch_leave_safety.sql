-- KEEP/Loki Battle — sécurité de départ pendant une revanche.
-- Un joueur qui quitte explicitement ne doit jamais être réactivé par le
-- finaliseur de revanche. Le proposeur qui part avant toute acceptation
-- retire automatiquement sa demande.

create or replace function public.keep_battle_arena_propose_rematch(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  my_name text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;

  if a.status <> 'WAITING' or a.match_no <= 1 then
    raise exception 'BATTLE_ARENA_NOT_READY_FOR_REMATCH';
  end if;

  if not exists(
    select 1
    from public.keep_battle_arena_match_results r
    join public.keep_battle_arena_members m
      on m.arena_id=r.arena_id and m.profile_id=r.profile_id
    where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=uid
      and m.seat_status <> 'LEFT'
  ) then
    raise exception 'BATTLE_ARENA_FORBIDDEN';
  end if;

  if a.rematch_deadline is not null then
    if a.rematch_deadline > now() then
      if a.rematch_proposer_id=uid then
        return public.keep_battle_arena_state(a.id);
      end if;
      raise exception 'BATTLE_REMATCH_ALREADY_PENDING';
    end if;
    perform public.keep_battle_arena_finalize_rematch(a.id);
    select * into a from public.keep_battle_arenas where id=p_arena_id for update;
    if a.status <> 'WAITING' then
      return public.keep_battle_arena_state(a.id);
    end if;
  end if;

  update public.keep_battle_arena_members m
  set rematch_ready=case
    when m.profile_id=uid then true
    when m.seat_status='LEFT' then false
    else null
  end
  where m.arena_id=a.id
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=now()+interval '20 seconds',
      rematch_proposer_id=uid,
      updated_at=now()
  where id=a.id;

  select coalesce(nullif(username,''),'Loki') into my_name
  from public.profiles where id=uid;

  insert into public.notifications(profile_id,type,title,body,data)
  select r.profile_id,
         'BATTLE_ARENA_REMATCH',
         '🔁 Revanche proposée',
         format('@%s propose une revanche. Tu as 20 secondes pour répondre.',my_name),
         jsonb_build_object(
           'arenaId',a.id,
           'arenaCode',a.arena_code,
           'proposerId',uid,
           'expiresAt',now()+interval '20 seconds',
           'presentation','battle_inline'
         )
  from public.keep_battle_arena_match_results r
  join public.keep_battle_arena_members m
    on m.arena_id=r.arena_id and m.profile_id=r.profile_id
  where r.arena_id=a.id and r.match_no=a.match_no-1
    and r.profile_id<>uid
    and m.seat_status <> 'LEFT';

  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_cancel_rematch(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  accepted_others integer:=0;
  my_name text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;

  if a.rematch_deadline is null then
    return public.keep_battle_arena_state(a.id);
  end if;

  if a.rematch_deadline <= now() then
    perform public.keep_battle_arena_finalize_rematch(a.id);
    return public.keep_battle_arena_state(a.id);
  end if;

  if a.rematch_proposer_id is distinct from uid then
    raise exception 'BATTLE_REMATCH_CANCEL_FORBIDDEN';
  end if;

  select count(*) into accepted_others
  from public.keep_battle_arena_members m
  where m.arena_id=a.id
    and m.profile_id<>uid
    and m.seat_status <> 'LEFT'
    and m.rematch_ready=true
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  if accepted_others>0 then
    raise exception 'BATTLE_REMATCH_ALREADY_ACCEPTED';
  end if;

  update public.keep_battle_arena_members m
  set rematch_ready=null
  where m.arena_id=a.id
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=null,
      rematch_proposer_id=null,
      updated_at=now()
  where id=a.id;

  select coalesce(nullif(username,''),'Loki') into my_name
  from public.profiles where id=uid;

  insert into public.notifications(profile_id,type,title,body,data)
  select r.profile_id,
         'BATTLE_ARENA_REMATCH_CANCELLED',
         'Revanche retirée',
         format('@%s a retiré sa demande de revanche.',my_name),
         jsonb_build_object('arenaId',a.id,'arenaCode',a.arena_code,'proposerId',uid)
  from public.keep_battle_arena_match_results r
  join public.keep_battle_arena_members m
    on m.arena_id=r.arena_id and m.profile_id=r.profile_id
  where r.arena_id=a.id and r.match_no=a.match_no-1
    and r.profile_id<>uid
    and m.seat_status <> 'LEFT';

  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_finalize_rematch(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a public.keep_battle_arenas%rowtype;
  active_count integer:=0;
  undecided_count integer:=0;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found or a.status<>'WAITING' or a.rematch_deadline is null then return; end if;

  select count(*) into undecided_count
  from public.keep_battle_arena_members m
  where m.arena_id=a.id
    and m.seat_status <> 'LEFT'
    and m.rematch_ready is null
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  if undecided_count>0 and a.rematch_deadline>now() then return; end if;

  if a.rematch_deadline<=now() then
    insert into public.notifications(profile_id,type,title,body,data)
    select m.profile_id,
           'BATTLE_ARENA_REMATCH_MISSED',
           '⏱ Battle manqué',
           'Désolé, tu as loupé ce Battle. Attends le prochain tour.',
           jsonb_build_object('arenaId',a.id,'arenaCode',a.arena_code,'reason','REMATCH_TIMEOUT')
    from public.keep_battle_arena_members m
    where m.arena_id=a.id
      and m.seat_status <> 'LEFT'
      and m.rematch_ready is null
      and exists(
        select 1 from public.keep_battle_arena_match_results r
        where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
      );
  end if;

  update public.keep_battle_arena_members m
  set seat_status='ACTIVE'
  where m.arena_id=a.id
    and m.seat_status <> 'LEFT'
    and m.rematch_ready=true
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arena_members m
  set seat_status='ELIMINATED'
  where m.arena_id=a.id
    and m.seat_status <> 'LEFT'
    and coalesce(m.rematch_ready,false)=false
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arena_members m
  set rematch_ready=null
  where m.arena_id=a.id
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=null,
      rematch_proposer_id=null,
      updated_at=now()
  where id=a.id;

  select count(*) into active_count
  from public.keep_battle_arena_members
  where arena_id=a.id and seat_status='ACTIVE';

  if active_count>=2 then
    perform public.keep_battle_arena_start(a.id);
  end if;
end;
$function$;

create or replace function public.keep_battle_arena_leave(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  m public.keep_battle_arena_members%rowtype;
  stake integer := 3;
  active_before integer := 0;
  active_after integer := 0;
  winner uuid;
  winner_gain integer := 0;
  next_match integer;
  quitter_name text;
  accepted_others integer := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  select * into m from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid for update;
  if not found then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;

  select amount into stake from public.keep_battle_arena_credit_holds
   where arena_id=a.id and match_no=a.match_no and profile_id=uid and status='LOCKED';
  stake:=coalesce(stake,public.keep_battle_stake_for_rounds(a.round_count));
  select coalesce(nullif(username,''),'KEEP') into quitter_name from public.profiles where id=uid;

  if a.status <> 'ACTIVE' then
    if a.rematch_deadline is not null then
      select count(*) into accepted_others
      from public.keep_battle_arena_members rm
      where rm.arena_id=a.id
        and rm.profile_id<>uid
        and rm.seat_status <> 'LEFT'
        and rm.rematch_ready=true;

      if a.rematch_proposer_id=uid and accepted_others=0 then
        perform public.keep_battle_arena_cancel_rematch(a.id);
      else
        update public.keep_battle_arena_members
        set rematch_ready=false, seat_status='LEFT'
        where arena_id=a.id and profile_id=uid;
        perform public.keep_battle_arena_finalize_rematch(a.id);
      end if;
    end if;

    update public.keep_battle_arena_credit_holds
       set status='RELEASED', settled_at=now()
     where arena_id=a.id and match_no=a.match_no and profile_id=uid and status='LOCKED';
    update public.keep_battle_arena_members
       set seat_status='LEFT'
     where arena_id=a.id and profile_id=uid;
    delete from public.keep_battle_solo_presence where profile_id=uid;
    return;
  end if;

  select count(*) into active_before from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  if m.seat_status <> 'ACTIVE' then
    update public.keep_battle_arena_members set seat_status='LEFT' where arena_id=a.id and profile_id=uid;
    delete from public.keep_battle_solo_presence where profile_id=uid;
    return;
  end if;

  insert into public.keep_battle_arena_match_results(arena_id,match_no,profile_id,placement,score,correct_predictions,total_response_ms)
  values(a.id,a.match_no,uid,greatest(2,active_before),m.score,m.correct_predictions,m.total_response_ms)
  on conflict(arena_id,match_no,profile_id) do update
    set placement=greatest(2,active_before), score=excluded.score, correct_predictions=excluded.correct_predictions, total_response_ms=excluded.total_response_ms;

  insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
  values(a.id,a.match_no,uid,'LOSS',-stake)
  on conflict(arena_id,match_no,profile_id) do update set result='LOSS',amount=-stake;

  update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now()
   where arena_id=a.id and match_no=a.match_no and profile_id=uid and status='LOCKED';
  update public.keep_battle_arena_members set seat_status='LEFT',placement=greatest(2,active_before),matches_played=matches_played+1
   where arena_id=a.id and profile_id=uid;
  delete from public.keep_battle_solo_presence where profile_id=uid;

  insert into public.notifications(profile_id,type,title,body,data)
  values(uid,'BATTLE_ARENA_FORFEIT','Battle abandonné',format('Tu as quitté la partie : défaite et -%s Free.',stake),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',-stake,'result','LOSS','forfeit',true));

  select count(*) into active_after from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';

  if active_after = 1 then
    select profile_id into winner from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' limit 1;
    insert into public.keep_battle_arena_match_results(arena_id,match_no,profile_id,placement,score,correct_predictions,total_response_ms)
    select a.id,a.match_no,profile_id,1,score,correct_predictions,total_response_ms
      from public.keep_battle_arena_members where arena_id=a.id and profile_id=winner
    on conflict(arena_id,match_no,profile_id) do update set placement=1,score=excluded.score,correct_predictions=excluded.correct_predictions,total_response_ms=excluded.total_response_ms;

    select coalesce(-sum(amount),0)::integer into winner_gain
      from public.keep_battle_arena_credit_events
     where arena_id=a.id and match_no=a.match_no and result='LOSS';
    insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
    values(a.id,a.match_no,winner,'WIN',winner_gain)
    on conflict(arena_id,match_no,profile_id) do update set result='WIN',amount=excluded.amount;
    update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now()
      where arena_id=a.id and match_no=a.match_no and profile_id=winner and status='LOCKED';
    update public.keep_battle_arena_members set placement=1,matches_played=matches_played+1 where arena_id=a.id and profile_id=winner;

    insert into public.notifications(profile_id,type,title,body,data)
    values(winner,'BATTLE_ARENA_WIN','👑 Tu remportes le Battle !',format('+%s Free : ton adversaire a abandonné.',winner_gain),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',winner_gain,'result','WIN','opponentForfeit',true,'quitterId',uid));

    next_match:=a.match_no+1;
    update public.keep_battle_arenas set status='WAITING',host_id=winner,match_no=next_match,current_round=0,updated_at=now() where id=a.id;
    perform public.keep_battle_arena_seed_rounds(a.id,next_match);
    update public.keep_battle_arena_members set score=0,correct_predictions=0,total_response_ms=0,placement=null where arena_id=a.id and seat_status='ACTIVE';
  end if;
end;
$function$;

revoke all on function public.keep_battle_arena_leave(uuid) from public, anon;
grant execute on function public.keep_battle_arena_leave(uuid) to authenticated, service_role;
