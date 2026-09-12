-- Adel 07/09/2026 : "pour huit musiques il perd trois Free, pour 15 musiques
-- en gros plus il monte plus la mise est grosse" -- la mise Free d'un Battle
-- doit desormais suivre le nombre de manches choisi (8/15/20/30), au lieu
-- d'un montant fixe de 3 quel que soit le nombre de manches. Formule :
-- stake = ceil(base_stake_3_manches_pour_8 * round_count / 8), qui donne
-- exactement 8->3, 15->6, 20->8, 30->12 (les 4 choix actuels de l'appli).
-- "un utilisateur a 4 Free et veut faire un 30, il ne pourra pas ... il faut
-- lui dire credit insuffisant" -- toutes les portes d'entree qui verifiaient
-- un minimum FIXE (3 Free) verifient maintenant le minimum REEL du nombre de
-- manches demande, et l'erreur embarque le montant exact requis
-- (ex: 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED:12') pour un message precis
-- cote appli, sans casser les anciens `.includes('BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED')`.

CREATE OR REPLACE FUNCTION public.keep_battle_stake_for_rounds(p_round_count integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select greatest(1, ceil(
    coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1), 3)::numeric
    * greatest(1, coalesce(p_round_count, 8))::numeric / 8.0
  ))::integer;
$function$;

revoke all on function public.keep_battle_stake_for_rounds(integer) from public;
grant execute on function public.keep_battle_stake_for_rounds(integer) to anon, authenticated;

-- 1) Le verrou de mise lit desormais le round_count de l'arene concernee.
CREATE OR REPLACE FUNCTION public.keep_battle_arena_lock_stake(p_arena_id uuid, p_match_no integer, p_profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  stake integer := 3;
  remaining integer;
  plan text;
  monthly_limit integer;
  v_month_key text := to_char(now(),'YYYY-MM');
  matches_this_month integer := 0;
  v_round_count integer;
begin
  if exists(select 1 from public.keep_battle_arena_credit_holds where arena_id=p_arena_id and match_no=p_match_no and profile_id=p_profile_id and status='LOCKED') then return true; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 0));

  plan := public.keep_active_plan_code(p_profile_id);
  monthly_limit := public.keep_plan_limit(plan, 'battle_matches_per_month');
  if monthly_limit is not null then
    select matches_count into matches_this_month from public.keep_battle_monthly_match_counters where profile_id=p_profile_id and month_key=v_month_key;
    if coalesce(matches_this_month,0) >= monthly_limit then return false; end if;
  end if;

  if public.keep_profile_has_paid_battle_access(p_profile_id) then
    insert into public.keep_battle_monthly_match_counters(profile_id,month_key,matches_count,updated_at)
    values(p_profile_id,v_month_key,1,now())
    on conflict(profile_id,month_key) do update set matches_count=keep_battle_monthly_match_counters.matches_count+1,updated_at=now();
    return true;
  end if;

  select round_count into v_round_count from public.keep_battle_arenas where id=p_arena_id;
  stake := public.keep_battle_stake_for_rounds(v_round_count);
  remaining:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
  if remaining<stake then return false; end if;
  insert into public.keep_battle_arena_credit_holds(arena_id,match_no,profile_id,amount,status)
  values(p_arena_id,p_match_no,p_profile_id,stake,'LOCKED')
  on conflict(arena_id,match_no,profile_id) do update set amount=excluded.amount,status='LOCKED',settled_at=null;

  insert into public.keep_battle_monthly_match_counters(profile_id,month_key,matches_count,updated_at)
  values(p_profile_id,v_month_key,1,now())
  on conflict(profile_id,month_key) do update set matches_count=keep_battle_monthly_match_counters.matches_count+1,updated_at=now();
  return true;
end;
$function$;

-- 2) Reglement de fin de manche (promotion depuis la file d'attente) : meme
-- mise que celle verrouillee pour cette arene (a.round_count est fixe pour
-- toute la duree de vie de l'arene).
CREATE OR REPLACE FUNCTION public.keep_battle_arena_advance_after_reveal(p_arena_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select * into r from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round for update;
  if not found or r.finalized_at is null or coalesce(r.reveal_until,now()+interval '1 second')>now() then return; end if;
  next_round:=a.current_round+1;
  if next_round>a.round_count then perform public.keep_battle_arena_finish_match(a.id); return; end if;

  stake:=public.keep_battle_stake_for_rounds(a.round_count);
  loop
    select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
    exit when active_count>=a.max_players;
    select profile_id into candidate from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED' order by joined_at asc limit 1 for update skip locked;
    exit when candidate is null;
    if public.keep_battle_arena_lock_stake(a.id,a.match_no,candidate) then
      update public.keep_battle_arena_members set seat_status='ACTIVE',score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and profile_id=candidate;
      insert into public.notifications(profile_id,type,title,body,data) values(candidate,'BATTLE_ARENA_PROMOTED','🔥 Tu rejoins le Battle','La piste est terminée : tu entres dans le match dès la prochaine.',jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'stakeFree',stake));
    else
      update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=candidate;
    end if;
  end loop;

  update public.keep_battle_arenas set current_round=next_round,updated_at=now() where id=a.id;
  round_start:=now()+interval '3 seconds';
  update public.keep_battle_arena_rounds set started_at=round_start,closes_at=round_start+interval '10 seconds',reveal_until=null where arena_id=a.id and match_no=a.match_no and position=next_round;
end;$function$;

-- 3) Elimination AFK en cours de manche.
CREATE OR REPLACE FUNCTION public.keep_battle_arena_finalize_round(p_arena_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.keep_battle_arenas%rowtype;
  r public.keep_battle_arena_rounds%rowtype;
  active_count integer;
  answer_count integer;
  stake integer;
  afk record;
  afk_placement integer;
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id for update;
 if not found or a.status<>'ACTIVE' then return; end if;
 select * into r from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round for update;
 if not found or r.finalized_at is not null then return; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 select count(*) into answer_count from public.keep_battle_arena_answers where round_id=r.id;
 if answer_count<active_count and coalesce(r.closes_at,now()+interval '1 second')>now() then return; end if;

 update public.keep_battle_arena_answers
 set is_correct=(lower(trim(coalesce(selected_answer,'')))=lower(trim(r.artist_snapshot))),
     points=case when lower(trim(coalesce(selected_answer,'')))=lower(trim(r.artist_snapshot))
       then greatest(500, 1000 - round(least(coalesce(response_ms,10000),10000)::numeric / 10000 * 500)::int)
       else 0 end
 where round_id=r.id;

 update public.keep_battle_arena_members m
 set score=m.score+coalesce(z.points,0),
     correct_predictions=m.correct_predictions+case when z.is_correct then 1 else 0 end,
     total_response_ms=m.total_response_ms+case when z.is_correct then z.response_ms else 0 end
 from public.keep_battle_arena_answers z
 where m.arena_id=a.id and m.profile_id=z.profile_id and z.round_id=r.id and m.seat_status='ACTIVE';

 update public.keep_battle_arena_members m
 set consecutive_misses = 0
 where m.arena_id=a.id and m.seat_status='ACTIVE'
   and exists(select 1 from public.keep_battle_arena_answers z where z.round_id=r.id and z.profile_id=m.profile_id);

 update public.keep_battle_arena_members m
 set consecutive_misses = m.consecutive_misses + 1
 where m.arena_id=a.id and m.seat_status='ACTIVE'
   and not exists(select 1 from public.keep_battle_arena_answers z where z.round_id=r.id and z.profile_id=m.profile_id);

 stake := public.keep_battle_stake_for_rounds(a.round_count);
 for afk in select profile_id, score, correct_predictions, total_response_ms from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' and consecutive_misses>=3
 loop
   if exists(select 1 from public.keep_battle_arena_credit_holds where arena_id=a.id and match_no=a.match_no and profile_id=afk.profile_id and status='LOCKED') then
     insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
     values(a.id,a.match_no,afk.profile_id,'LOSS',-stake)
     on conflict(arena_id,match_no,profile_id) do nothing;
     update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and profile_id=afk.profile_id and status='LOCKED';
   end if;
   update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=afk.profile_id;
   select coalesce(max(placement),0)+active_count+1 into afk_placement from public.keep_battle_arena_match_results where arena_id=a.id and match_no=a.match_no;
   insert into public.keep_battle_arena_match_results(arena_id,match_no,profile_id,placement,score,correct_predictions,total_response_ms)
   values(a.id,a.match_no,afk.profile_id,afk_placement,afk.score,afk.correct_predictions,afk.total_response_ms)
   on conflict(arena_id,match_no,profile_id) do nothing;
   insert into public.notifications(profile_id,type,title,body,data)
   values(afk.profile_id,'BATTLE_ARENA_AFK_ELIMINATED','⚡ Battle KEEP','Tu as manqué 3 questions d’affilée : tu es sorti de la partie et as perdu ta mise.',jsonb_build_object('arenaId',a.id,'matchNo',a.match_no));
 end loop;

 update public.keep_battle_arena_rounds
 set finalized_at=now(),
     reveal_until=greatest(now()+interval '2800 milliseconds', coalesce(r.closes_at,now())+interval '800 milliseconds')
 where id=r.id;

 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 if active_count<2 then
   perform public.keep_battle_arena_finish_match(a.id);
 end if;
end;
$function$;

-- 4) Reglement de fin de match (paiement du gagnant/2e, promotion de la file).
CREATE OR REPLACE FUNCTION public.keep_battle_arena_finish_match(p_arena_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.keep_battle_arenas%rowtype; active_count integer; winner uuid; runner_up uuid; candidate uuid; next_match integer;
  stake integer:=3; losers_count integer:=0; winner_gain integer:=0; runner_gain integer:=0; pool integer:=0; share1 integer:=65;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found or a.status<>'ACTIVE' then return; end if;
  stake:=public.keep_battle_stake_for_rounds(a.round_count);
  select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  with ranked as(
    select m.profile_id,m.score,m.correct_predictions,m.total_response_ms,row_number()over(order by m.score desc,m.correct_predictions desc,m.total_response_ms asc,m.joined_at asc)::int place
    from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='ACTIVE'
  )
  insert into public.keep_battle_arena_match_results(arena_id,match_no,profile_id,placement,score,correct_predictions,total_response_ms)
  select a.id,a.match_no,profile_id,place,score,correct_predictions,total_response_ms from ranked on conflict do nothing;
  select profile_id into winner from public.keep_battle_arena_match_results where arena_id=a.id and match_no=a.match_no order by placement asc limit 1;
  if active_count>=3 then
    select profile_id into runner_up from public.keep_battle_arena_match_results where arena_id=a.id and match_no=a.match_no and placement=2;
  end if;

  insert into public.keep_battle_skill_stats(profile_id, arena_matches, arena_wins)
  select m.profile_id, 1, case when m.profile_id = winner then 1 else 0 end
  from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='ACTIVE'
  on conflict (profile_id) do update set
    arena_matches = keep_battle_skill_stats.arena_matches + 1,
    arena_wins = keep_battle_skill_stats.arena_wins + excluded.arena_wins,
    updated_at = now();

  if active_count>=3 and runner_up is not null then
    insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
    select a.id,a.match_no,r.profile_id,'LOSS',-stake
    from public.keep_battle_arena_match_results r
    where r.arena_id=a.id and r.match_no=a.match_no and r.placement>=3
    on conflict(arena_id,match_no,profile_id) do nothing;
    select count(*) into losers_count from public.keep_battle_arena_credit_events where arena_id=a.id and match_no=a.match_no and result='LOSS';
    pool:=stake*losers_count;
    share1:=greatest(1,least(99,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_payout_share_rank1' limit 1),65)));
    winner_gain:=round(pool*share1/100.0)::integer;
    runner_gain:=pool-winner_gain;
    if winner is not null and winner_gain>0 then
      insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
      values(a.id,a.match_no,winner,'WIN',winner_gain)
      on conflict(arena_id,match_no,profile_id) do update set result='WIN',amount=excluded.amount;
    end if;
    if runner_gain>0 then
      insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
      values(a.id,a.match_no,runner_up,'WIN',runner_gain)
      on conflict(arena_id,match_no,profile_id) do update set result='WIN',amount=excluded.amount;
    end if;
  else
    insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
    select a.id,a.match_no,m.profile_id,'LOSS',-stake from public.keep_battle_arena_members m
    where m.arena_id=a.id and m.seat_status='ACTIVE' and m.profile_id<>winner
    on conflict(arena_id,match_no,profile_id) do nothing;
    select count(*) into losers_count from public.keep_battle_arena_credit_events where arena_id=a.id and match_no=a.match_no and result='LOSS';
    winner_gain:=stake*losers_count;
    if winner is not null and winner_gain>0 then
      insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
      values(a.id,a.match_no,winner,'WIN',winner_gain)
      on conflict(arena_id,match_no,profile_id) do update set result='WIN',amount=excluded.amount;
    end if;
  end if;

  update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and status='LOCKED';
  update public.keep_battle_arena_members m set placement=r.placement,matches_played=m.matches_played+1
  from public.keep_battle_arena_match_results r where r.arena_id=a.id and r.match_no=a.match_no and r.profile_id=m.profile_id and m.arena_id=a.id and m.seat_status='ACTIVE';
  insert into public.notifications(profile_id,type,title,body,data)
  select winner,'BATTLE_ARENA_WIN','👑 Tu remportes le Battle !',format('+%s Free : tu termines numéro 1 de cette partie.',winner_gain),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',winner_gain,'result','WIN') where winner is not null;
  insert into public.notifications(profile_id,type,title,body,data)
  select runner_up,'BATTLE_ARENA_WIN','🥈 2e place !',format('+%s Free : tu termines numéro 2 de cette partie.',runner_gain),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',runner_gain,'result','WIN') where runner_up is not null and runner_gain>0;
  insert into public.notifications(profile_id,type,title,body,data)
  select m.profile_id,'BATTLE_ARENA_RESULT','Battle terminé',format('Le groupe reste ensemble pour le prochain Battle. -%s Free sur cette partie.',stake),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',-stake,'result','LOSS')
  from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id<>winner and (runner_up is null or m.profile_id<>runner_up) and m.seat_status='ACTIVE';
  next_match:=a.match_no+1;
  update public.keep_battle_arenas set status='WAITING',host_id=coalesce(winner,host_id),match_no=next_match,current_round=0,updated_at=now() where id=a.id;
  perform public.keep_battle_arena_seed_rounds(a.id,next_match);
  loop
    select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE'; exit when active_count>=a.max_players;
    select profile_id into candidate from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED' order by joined_at asc limit 1 for update skip locked; exit when candidate is null;
    if public.keep_battle_arena_lock_stake(a.id,next_match,candidate) then
      update public.keep_battle_arena_members set seat_status='ACTIVE',score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and profile_id=candidate;
      insert into public.notifications(profile_id,type,title,body,data) values(candidate,'BATTLE_ARENA_PROMOTED','🔥 Tu rejoins le groupe','Une place est disponible pour le prochain Battle.',jsonb_build_object('arenaId',a.id,'nextMatchNo',next_match,'stakeFree',stake));
    else update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=candidate; end if;
  end loop;
  update public.keep_battle_arena_members set score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and seat_status='ACTIVE';
end;
$function$;

-- 5) Abandon volontaire en cours de match.
CREATE OR REPLACE FUNCTION public.keep_battle_arena_forfeit(p_arena_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  select * into m from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid for update;
  if not found then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;

  stake:=public.keep_battle_stake_for_rounds(a.round_count);
  select coalesce(nullif(username,''),'KEEP') into quitter_name from public.profiles where id=uid;

  if a.status <> 'ACTIVE' then
    update public.keep_battle_arena_credit_holds
       set status='RELEASED', settled_at=now()
     where arena_id=a.id and match_no=a.match_no and profile_id=uid and status='LOCKED';
    update public.keep_battle_arena_members set seat_status='LEFT', updated_at=now() where arena_id=a.id and profile_id=uid;
    delete from public.keep_battle_solo_presence where profile_id=uid;
    return jsonb_build_object('arenaId',a.id,'status','LEFT','forfeit',false);
  end if;

  select count(*) into active_before from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  if m.seat_status <> 'ACTIVE' then
    update public.keep_battle_arena_members set seat_status='LEFT', updated_at=now() where arena_id=a.id and profile_id=uid;
    delete from public.keep_battle_solo_presence where profile_id=uid;
    return jsonb_build_object('arenaId',a.id,'status','LEFT','forfeit',false);
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
  update public.keep_battle_arena_members set seat_status='LEFT',placement=greatest(2,active_before),matches_played=matches_played+1,updated_at=now()
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

    select stake * count(*) into winner_gain
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
    if not public.keep_battle_arena_lock_stake(a.id,next_match,winner) then
      update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=winner;
    end if;
  end if;

  return jsonb_build_object('arenaId',a.id,'status','LEFT','forfeit',true,'winnerId',winner,'remainingPlayers',active_after);
end;
$function$;

-- 6) Depart volontaire hors match actif (liberation de la mise reservee).
CREATE OR REPLACE FUNCTION public.keep_battle_arena_leave(p_arena_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  active_count integer;
  stake integer := 3;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id = p_arena_id for update;
  if not found then return; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id = a.id and profile_id = uid and seat_status = 'ACTIVE') then
    return;
  end if;
  if a.status = 'ACTIVE' then
    stake := public.keep_battle_stake_for_rounds(a.round_count);
    if exists(select 1 from public.keep_battle_arena_credit_holds where arena_id=a.id and match_no=a.match_no and profile_id=uid and status='LOCKED') then
      insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
      values(a.id,a.match_no,uid,'LOSS',-stake)
      on conflict(arena_id,match_no,profile_id) do nothing;
      update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and profile_id=uid and status='LOCKED';
    end if;
  end if;
  update public.keep_battle_arena_members set seat_status = 'ELIMINATED' where arena_id = a.id and profile_id = uid;
  if a.status = 'ACTIVE' then
    select count(*) into active_count from public.keep_battle_arena_members where arena_id = a.id and seat_status = 'ACTIVE';
    if active_count < 2 then
      perform public.keep_battle_arena_finish_match(a.id);
    end if;
  end if;
end;
$function$;

-- 7) Regles affichees cote appli : accepte desormais le nombre de manches
-- vise pour annoncer la vraie mise (sinon 8 par defaut).
CREATE OR REPLACE FUNCTION public.keep_battle_arena_rules(p_round_count integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  stake integer := 3;
  max_players integer := 10;
  share1 integer := 65;
  pool_at_full integer;
  winner_gain_at_full integer;
begin
  stake := public.keep_battle_stake_for_rounds(p_round_count);
  max_players := least(10, greatest(2, coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_max_players' limit 1), 10)));
  share1 := greatest(1, least(99, coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_payout_share_rank1' limit 1), 65)));
  pool_at_full := stake * greatest(0, max_players - 2);
  winner_gain_at_full := case when max_players >= 3 then round(pool_at_full * share1 / 100.0)::integer else stake * (max_players - 1) end;
  return jsonb_build_object(
    'stakeFree', stake, 'minimumFreeRequired', stake, 'maxPlayers', max_players, 'singleWinner', false,
    'answerLockedOnTap', true, 'ranking', 'CORRECT_ANSWERS_THEN_SPEED', 'fullArenaNetPrize', winner_gain_at_full,
    'payoutShareRank1', share1,
    'ruleText', format(
      'Il faut au moins %s Free pour entrer avec ce nombre de morceaux. À 2 joueurs : le vainqueur remporte la mise de l’adversaire. À 3 joueurs et plus : le 1er et le 2e se partagent la mise de tous ceux classés 3e et plus (%s%% / %s%%).',
      stake, share1, 100 - share1
    )
  );
end;
$function$;

revoke all on function public.keep_battle_arena_rules(integer) from public;
grant execute on function public.keep_battle_arena_rules(integer) to anon, authenticated;
-- l'ancienne signature 0-arg n'existe plus depuis le CREATE OR REPLACE ci-dessus
-- (meme nom, nouvelle liste de parametres = nouvelle fonction) : on la retire
-- explicitement pour eviter une signature fantome inutilisee.
DROP FUNCTION IF EXISTS public.keep_battle_arena_rules();

-- 8) Portes d'entree : le minimum exige suit desormais le nombre de manches
-- REELLEMENT demande, plus un plancher fixe de 3. L'erreur embarque le
-- montant exact ('...REQUIRED:12') sans casser les .includes() existants.
CREATE OR REPLACE FUNCTION public.keep_battle_arena_create(p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8, p_theme_codes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid:=auth.uid();
  a public.keep_battle_arenas%rowtype;
  theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
  themes text[];
  v_round_count integer:=greatest(5,least(coalesce(p_round_count,8),30));
  min_free integer:=3;
  notified integer:=0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
  min_free:=public.keep_battle_stake_for_rounds(v_round_count);
  if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED:%', min_free; end if;

  select nullif(array_agg(distinct u.code), array[]::text[]) into themes
  from (select upper(trim(x)) as code from unnest(coalesce(p_theme_codes, array[]::text[])) x) u(code)
  where u.code <> '' and u.code <> 'MIX';

  if themes is not null and exists (
    select 1 from unnest(themes) c
    where not exists (select 1 from public.keep_battle_themes t where t.code = c and t.enabled = true)
  ) then themes := null; end if;

  if themes is not null then
    theme := themes[1];
  elsif not exists(select 1 from public.keep_battle_themes where code=theme and enabled=true) then
    theme:='MIX';
  end if;

  insert into public.keep_battle_arenas(host_id,theme_code,theme_codes,round_count,max_players) values(uid,theme,themes,v_round_count,10) returning * into a;
  insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,'ACTIVE');
  if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED:%', min_free; end if;
  perform public.keep_battle_arena_seed_rounds(a.id,1);
  begin notified := public.keep_battle_notify_followers(a.id); exception when others then notified := 0; end;
  return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'themeCodes',to_jsonb(a.theme_codes),'status',a.status,'players',1,'maxPlayers',10,'queue',0,'matchNo',1,'stakeFree',min_free,'followersNotified',notified);
end;
$function$;

CREATE OR REPLACE FUNCTION public.keep_battle_arena_join(p_arena_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; active_count integer; queue_count integer; next_status text; min_free integer:=3; final_status text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into a from public.keep_battle_arenas where arena_code=upper(trim(p_arena_code)) for update;
 if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 if a.status in('CLOSED','EXPIRED') or a.expires_at<=now() then raise exception 'BATTLE_ARENA_CLOSED'; end if;
 min_free:=public.keep_battle_stake_for_rounds(a.round_count);
 if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED:%', min_free; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 next_status:=case when a.status='ACTIVE' then 'QUEUED' when active_count<a.max_players then 'ACTIVE' else 'QUEUED' end;
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,next_status)
 on conflict(arena_id,profile_id) do update set seat_status=case when keep_battle_arena_members.seat_status in('LEFT','ELIMINATED') then excluded.seat_status else keep_battle_arena_members.seat_status end;
 select seat_status into final_status from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid;
 if final_status='ACTIVE' then
   if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then
     update public.keep_battle_arena_members set seat_status='QUEUED' where arena_id=a.id and profile_id=uid;
     final_status:='QUEUED';
   elsif a.status='WAITING' then
     perform public.keep_battle_arena_seed_rounds(a.id,a.match_no);
   end if;
 end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
 return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'status',a.status,'players',active_count,'maxPlayers',a.max_players,'queue',queue_count,'myStatus',final_status,'stakeFree',min_free);
end;$function$;

CREATE OR REPLACE FUNCTION public.keep_battle_arena_matchmake(p_theme_code text DEFAULT 'MIX'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; active_count integer; queue_count integer; existing_status text; created jsonb; min_free integer:=3;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 min_free:=public.keep_battle_stake_for_rounds(8);
 if public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED:%', min_free; end if;
 select ar.* into a from public.keep_battle_arena_members m join public.keep_battle_arenas ar on ar.id=m.arena_id
 where m.profile_id=uid and m.seat_status in('ACTIVE','QUEUED') and ar.status in('WAITING','ACTIVE') and ar.expires_at>now() order by m.joined_at desc limit 1;
 if found then return public.keep_battle_arena_state(a.id); end if;
 select ar.* into a from public.keep_battle_arenas ar
 where ar.status in('WAITING','ACTIVE') and ar.expires_at>now() and ar.theme_code=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'))
 order by (select count(*) from public.keep_battle_arena_members m where m.arena_id=ar.id and m.seat_status='ACTIVE') asc,ar.created_at asc
 for update skip locked limit 1;
 if not found then
   created:=public.keep_battle_arena_create(upper(coalesce(nullif(trim(p_theme_code),''),'MIX')),8);
   return created||jsonb_build_object('autoMatched',false,'myStatus','ACTIVE');
 end if;
 min_free:=public.keep_battle_stake_for_rounds(a.round_count);
 if public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED:%', min_free; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 existing_status:=case when active_count<a.max_players then 'ACTIVE' else 'QUEUED' end;
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,existing_status)
 on conflict(arena_id,profile_id) do update set seat_status=excluded.seat_status;
 if existing_status='ACTIVE' and not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then
   update public.keep_battle_arena_members set seat_status='QUEUED' where arena_id=a.id and profile_id=uid;
 end if;
 select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
 return public.keep_battle_arena_state(a.id)||jsonb_build_object('autoMatched',true,'queue',queue_count,'myStatus',(select seat_status from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid),'stakeFree',min_free);
end;$function$;

CREATE OR REPLACE FUNCTION public.keep_battle_challenge_send(p_target_id uuid, p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid:=auth.uid();
  v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
  v_round_count integer:=greatest(5,least(coalesce(p_round_count,8),30));
  c public.keep_battle_challenges%rowtype;
  my_name text;
  v_created boolean:=false;
  min_free integer:=3;
  v_notify boolean:=true;
  last_accepted_at timestamptz;
  last_incoming_at timestamptz;
  v_reset_at timestamptz;
  v_recent_count integer;
  v_daily_count integer;
  v_block_row_at timestamptz;
  v_unblock_at timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
  perform public.keep_battle_challenge_daily_send_cap_check(uid);
  perform public.keep_battle_arena_release_stale_seats(uid);
  perform public.keep_battle_arena_release_stale_seats(p_target_id);
  if public.keep_battle_skill_gap_blocks(uid, p_target_id) then raise exception 'BATTLE_SKILL_GAP_TOO_LARGE'; end if;
  select max(created_at) into last_accepted_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='ACCEPTED';
  select max(created_at) into last_incoming_at from public.keep_battle_challenges where challenger_id=p_target_id and target_id=uid;
  v_reset_at:=greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), coalesce(last_incoming_at,'-infinity'::timestamptz));
  select count(*) into v_daily_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '24 hours');
  if v_daily_count>=6 then
    select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '24 hours') order by created_at desc offset 5 limit 1;
    v_unblock_at:=coalesce(v_block_row_at,now())+interval '1 hour';
    raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:%', extract(epoch from v_unblock_at)::bigint;
  end if;
  select count(*) into v_recent_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '60 seconds');
  if v_recent_count>=2 then
    select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '60 seconds') order by created_at desc offset 1 limit 1;
    v_unblock_at:=coalesce(v_block_row_at,now())+interval '60 seconds';
    raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:%', extract(epoch from v_unblock_at)::bigint;
  end if;
  min_free:=public.keep_battle_stake_for_rounds(v_round_count);
  if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT:%', min_free; end if;
  if not public.keep_profile_has_paid_battle_access(p_target_id) and public.keep_theoretical_free_credit_remaining_for_profile(p_target_id)<min_free then raise exception 'BATTLE_TARGET_NO_CREDIT:%', min_free; end if;
  if not exists(
    select 1 from public.keep_battle_solo_presence
    where profile_id=p_target_id
      and (
        (status='AVAILABLE' and last_seen_at>now()-interval '20 seconds')
        or (manual_available=true and last_seen_at>now()-interval '30 minutes')
      )
  ) then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
  if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;
  update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
  select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
  if not found then
    insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,round_count,expires_at)
    values(uid,p_target_id,v_theme,v_round_count,now()+interval '90 seconds')
    on conflict (challenger_id,target_id) where status='PENDING' do nothing returning * into c;
    v_created:=found;
    if not v_created then
      select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
    end if;
  end if;
  if c.id is null then raise exception 'BATTLE_CHALLENGE_CREATE_FAILED'; end if;
  if v_created then
    select coalesce(np.system_enabled,true) into v_notify from public.notification_preferences np where np.profile_id=p_target_id;
    if coalesce(v_notify,true) then
      select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
      insert into public.notifications(profile_id,type,title,body,data)
      values(p_target_id,'BATTLE_CHALLENGE','⚡ Battle KEEP ?',format('@%s te défie. Accepte ou refuse directement dans KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'themeCode',v_theme,'roundCount',v_round_count,'expiresAt',c.expires_at,'presentation','battle_inline','openMode','stay_in_place'));
    end if;
  end if;
  return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at,'deduped',not v_created,'stakeFree',min_free);
end;$function$;

CREATE OR REPLACE FUNCTION public.keep_battle_challenge_respond(p_challenge_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid:=auth.uid();
  c public.keep_battle_challenges%rowtype;
  a public.keep_battle_arenas%rowtype;
  created jsonb;
  started jsonb;
  aid uuid;
  acode text;
  min_free integer:=3;
  my_name text;
  active_count integer:=0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into c from public.keep_battle_challenges where id=p_challenge_id for update;
  if not found or c.target_id<>uid then raise exception 'BATTLE_CHALLENGE_FORBIDDEN'; end if;
  if c.status='ACCEPTED' then
    if not p_accept then raise exception 'BATTLE_CHALLENGE_ALREADY_ACCEPTED'; end if;
    if c.arena_id is null then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
    select * into a from public.keep_battle_arenas where id=c.arena_id;
    if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
    return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'idempotent',true,'arenaState',public.keep_battle_arena_state(a.id));
  end if;
  if c.status='DECLINED' then
    if p_accept then raise exception 'BATTLE_CHALLENGE_ALREADY_DECLINED'; end if;
    return jsonb_build_object('id',c.id,'status','DECLINED','idempotent',true);
  end if;
  if c.status in ('EXPIRED','CANCELLED') then raise exception 'BATTLE_CHALLENGE_EXPIRED'; end if;
  if c.status<>'PENDING' or c.expires_at<=now() then
    update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where id=c.id and status='PENDING';
    raise exception 'BATTLE_CHALLENGE_EXPIRED';
  end if;
  select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
  if not p_accept then
    update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id;
    insert into public.notifications(profile_id,type,title,body,data)
    values(c.challenger_id,'BATTLE_CHALLENGE_DECLINED','Battle refusé',format('@%s a refusé le Battle. Invite un autre joueur ou partage KEEP à un ami.',my_name),jsonb_build_object('challengeId',c.id,'targetId',uid,'suggestShare',true));
    return jsonb_build_object('id',c.id,'status','DECLINED');
  end if;
  min_free:=public.keep_battle_stake_for_rounds(c.round_count);
  if not public.keep_profile_has_paid_battle_access(c.challenger_id) and public.keep_theoretical_free_credit_remaining_for_profile(c.challenger_id)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT:%', min_free; end if;
  if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED:%', min_free; end if;
  if c.arena_id is not null then
    select * into a from public.keep_battle_arenas where id=c.arena_id for update;
    if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
    if a.status<>'WAITING' or a.expires_at<=now() then raise exception 'BATTLE_ARENA_NOT_OPEN_FOR_INVITES'; end if;
    select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
    if active_count>=a.max_players then raise exception 'BATTLE_ARENA_FULL'; end if;
    if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid and seat_status='ACTIVE') then
      insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status)
      values(a.id,uid,'ACTIVE')
      on conflict(arena_id,profile_id) do update set seat_status='ACTIVE',score=0,correct_predictions=0,total_response_ms=0,placement=null;
      if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then
        update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=uid;
        raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED:%', min_free;
      end if;
      perform public.keep_battle_arena_seed_rounds(a.id,a.match_no);
    end if;
    update public.keep_battle_challenges set status='ACCEPTED',updated_at=now() where id=c.id;
    update public.keep_battle_solo_presence set status='SOLO' where profile_id=uid;
    insert into public.notifications(profile_id,type,title,body,data)
    values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s rejoint votre groupe KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'arenaId',a.id,'arenaCode',a.arena_code,'joinedExistingArena',true));
    return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'joinedExistingArena',true,'arenaState',public.keep_battle_arena_state(a.id));
  end if;
  created:=public.keep_battle_arena_create(c.theme_code,c.round_count);
  aid:=(created->>'id')::uuid;
  acode:=created->>'arenaCode';
  insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status)
  values(aid,c.challenger_id,'ACTIVE')
  on conflict(arena_id,profile_id) do update set seat_status='ACTIVE';
  if not public.keep_battle_arena_lock_stake(aid,1,c.challenger_id) then raise exception 'BATTLE_CHALLENGER_NO_CREDIT:%', min_free; end if;
  perform public.keep_battle_arena_seed_rounds(aid,1);
  update public.keep_battle_challenges set status='ACCEPTED',arena_id=aid,updated_at=now() where id=c.id;
  update public.keep_battle_solo_presence set status='SOLO' where profile_id in(uid,c.challenger_id);
  started:=public.keep_battle_arena_start(aid);
  insert into public.notifications(profile_id,type,title,body,data)
  values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s a accepté. Le duel démarre…',my_name),jsonb_build_object('challengeId',c.id,'arenaId',aid,'arenaCode',acode,'started',true));
  return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',aid,'arenaCode',acode,'themeCode',c.theme_code,'joinedExistingArena',false,'started',true,'arenaState',started);
end;$function$;
