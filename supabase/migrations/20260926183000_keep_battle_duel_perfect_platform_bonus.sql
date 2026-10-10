-- Battle duel: a perfect winner gets a platform-funded bonus in addition to the opponent's stake.
-- Editable in Super Admin through remote_config.
insert into public.remote_config(key,value,description)
values ('battle_duel_perfect_bonus_free','3'::jsonb,'Bonus Free offert par la plateforme au gagnant d’un Battle à 2 lorsqu’il répond juste à toutes les manches.')
on conflict(key) do update set description=excluded.description;

create or replace function public.keep_battle_arena_finish_match(p_arena_id uuid)
returns void language plpgsql security definer set search_path='public' as $function$
declare
  a public.keep_battle_arenas%rowtype; active_count integer; winner uuid; candidate uuid; next_match integer;
  stake integer:=3; winner_gain integer:=0; platform_bonus integer:=0; winner_correct integer:=0;
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
  select r.profile_id,r.correct_predictions into winner,winner_correct
  from public.keep_battle_arena_match_results r join public.keep_battle_arena_members m on m.arena_id=r.arena_id and m.profile_id=r.profile_id
  where r.arena_id=a.id and r.match_no=a.match_no and m.seat_status='ACTIVE' order by r.placement asc limit 1;

  insert into public.keep_battle_skill_stats(profile_id,arena_matches,arena_wins)
  select m.profile_id,1,case when m.profile_id=winner then 1 else 0 end from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='ACTIVE'
  on conflict(profile_id) do update set arena_matches=keep_battle_skill_stats.arena_matches+1,arena_wins=keep_battle_skill_stats.arena_wins+excluded.arena_wins,updated_at=now();

  insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
  select a.id,a.match_no,m.profile_id,'LOSS',-coalesce((select h.amount from public.keep_battle_arena_credit_holds h where h.arena_id=a.id and h.match_no=a.match_no and h.profile_id=m.profile_id and h.status='LOCKED'),stake)
  from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='ACTIVE' and m.profile_id<>winner
  on conflict(arena_id,match_no,profile_id) do update set result='LOSS',amount=excluded.amount;

  select coalesce(-sum(amount),0)::integer into winner_gain from public.keep_battle_arena_credit_events where arena_id=a.id and match_no=a.match_no and result='LOSS';
  if active_count=2 and winner is not null and winner_correct=a.round_count then
    platform_bonus:=greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_duel_perfect_bonus_free' limit 1),3));
  end if;
  winner_gain:=winner_gain+platform_bonus;
  if winner is not null and winner_gain>0 then
    insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount) values(a.id,a.match_no,winner,'WIN',winner_gain)
    on conflict(arena_id,match_no,profile_id) do update set result='WIN',amount=excluded.amount;
  end if;

  update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and status='LOCKED';
  update public.keep_battle_arena_members m set placement=r.placement,matches_played=m.matches_played+1 from public.keep_battle_arena_match_results r where r.arena_id=a.id and r.match_no=a.match_no and r.profile_id=m.profile_id and m.arena_id=a.id and m.seat_status='ACTIVE';
  insert into public.notifications(profile_id,type,title,body,data)
  select winner,'BATTLE_ARENA_WIN','👑 Tu remportes le Battle !',
    case when platform_bonus>0 then format('+%s Free : cagnotte gagnée + %s Free offerts pour ton sans-faute.',winner_gain,platform_bonus)
         else format('+%s Free : tu remportes la cagnotte complète.',winner_gain) end,
    jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',winner_gain,'platformBonus',platform_bonus,'result','WIN')
  where winner is not null;
  insert into public.notifications(profile_id,type,title,body,data)
  select m.profile_id,'BATTLE_ARENA_RESULT','Battle terminé',format('Le gagnant remporte la cagnotte. -%s Free sur cette partie.',coalesce(abs(e.amount),stake)),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',coalesce(e.amount,-stake),'result','LOSS')
  from public.keep_battle_arena_members m left join public.keep_battle_arena_credit_events e on e.arena_id=a.id and e.match_no=a.match_no and e.profile_id=m.profile_id
  where m.arena_id=a.id and m.profile_id<>winner and m.seat_status='ACTIVE';
  next_match:=a.match_no+1;
  update public.keep_battle_arenas set status='WAITING',host_id=coalesce(winner,host_id),match_no=next_match,current_round=0,updated_at=now() where id=a.id;
  perform public.keep_battle_arena_seed_rounds(a.id,next_match);
  loop
    select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE'; exit when active_count>=a.max_players;
    select profile_id into candidate from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED' order by joined_at asc limit 1 for update skip locked; exit when candidate is null;
    if public.keep_battle_arena_lock_stake(a.id,next_match,candidate) then update public.keep_battle_arena_members set seat_status='ACTIVE',score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and profile_id=candidate;
    else update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=candidate; end if;
  end loop;
  update public.keep_battle_arena_members set score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and seat_status='ACTIVE';
end;$function$;