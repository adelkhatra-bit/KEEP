-- Adel (04/09/2026) : "c'est deloyal qui perdent tous ... si on joue a
-- plusieurs, le premier gagne un truc, le deuxieme peut gagner un truc
-- aussi" -- BUG DE CONCEPTION CONFIRME (lecture directe de la fonction
-- live) : dans un Battle a 3 joueurs ou plus, SEUL le numero 1 gagnait
-- quoi que ce soit (winner_gain = stake * losers_count) ; le 2e, le 3e...
-- perdaient TOUS leur mise complete, exactement comme le dernier. Pour un
-- Battle a 2 joueurs, rien ne change (le perdant unique finance le
-- gagnant, comme avant). A partir de 3 joueurs actifs, le pot forme par les
-- perdants (placement >= 3) est desormais partage entre le 1er et le 2e
-- (65/35 par defaut, reglable via remote_config sans redeploiement) : les
-- deux podiums gagnent reellement des Free, seuls les non-podiums perdent
-- leur mise.
create or replace function public.keep_battle_arena_finish_match(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a public.keep_battle_arenas%rowtype; active_count integer; winner uuid; runner_up uuid; candidate uuid; next_match integer;
  stake integer:=3; losers_count integer:=0; winner_gain integer:=0; runner_gain integer:=0; pool integer:=0; share1 integer:=65;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found or a.status<>'ACTIVE' then return; end if;
  stake:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1),3));
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
    -- Podium a 2 places : seuls les placements >= 3 financent le pot.
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
    -- 2 joueurs (ou repli si le 2e n'a pas pu etre determine) : comportement
    -- historique inchange, gagnant unique.
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
  -- Adel : plus de pré-verrouillage/élimination ici -- keep_battle_arena_start
  -- s'en charge, en sécurité, seulement quand une revanche est confirmée.
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
