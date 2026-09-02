-- Bug trouvé juste après avoir ajouté le forfait auto "3 questions sans
-- réponse" : `consecutive_misses` n'était jamais remis à 0 quand un nouveau
-- match démarre (revanche ou promotion depuis la file). Un joueur qui
-- terminait le match précédent avec 2 ratés d'affilée se faisait éliminer
-- dès la 1ère manche du match suivant ("0 pts / 0 bonnes réponses / 0.0s"
-- vu en test réel juste après le déploiement du forfait AFK). Remise à zéro
-- ajoutée partout où le score l'est déjà (même moment logique : "nouveau
-- match, compteur propre").
create or replace function public.keep_battle_arena_start(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; active_count integer; round_start timestamptz;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id for update; if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid and seat_status='ACTIVE') then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
  if a.status='ACTIVE' then return public.keep_battle_arena_state(a.id); end if;
  for uid in select profile_id from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' loop
    if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=uid; end if;
  end loop;
  select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  if active_count<2 then raise exception 'BATTLE_ARENA_NEEDS_TWO_ELIGIBLE_PLAYERS'; end if;
  update public.keep_battle_arena_members set score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and seat_status='ACTIVE';
  update public.keep_battle_arenas set status='ACTIVE',current_round=1,started_at=coalesce(started_at,now()),round_duration_ms=10000,updated_at=now() where id=a.id returning * into a;
  round_start:=now()+interval '3 seconds';
  update public.keep_battle_arena_rounds set started_at=round_start,closes_at=round_start+interval '10 seconds' where arena_id=a.id and match_no=a.match_no and position=1;
  return public.keep_battle_arena_state(a.id);
end;$function$;

create or replace function public.keep_battle_arena_finish_match(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 a public.keep_battle_arenas%rowtype; active_count integer; winner uuid; candidate uuid; next_match integer; stake integer:=3; losers_count integer:=0; winner_gain integer:=0;
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
 update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and status='LOCKED';
 update public.keep_battle_arena_members m set placement=r.placement,matches_played=m.matches_played+1
 from public.keep_battle_arena_match_results r where r.arena_id=a.id and r.match_no=a.match_no and r.profile_id=m.profile_id and m.arena_id=a.id and m.seat_status='ACTIVE';
 insert into public.notifications(profile_id,type,title,body,data)
 select winner,'BATTLE_ARENA_WIN','👑 Tu remportes le Battle !',format('+%s Free : tu termines numéro 1 de cette partie.',winner_gain),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',winner_gain,'result','WIN') where winner is not null;
 insert into public.notifications(profile_id,type,title,body,data)
 select m.profile_id,'BATTLE_ARENA_RESULT','Battle terminé',format('Le groupe reste ensemble pour le prochain Battle. -%s Free sur cette partie.',stake),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',-stake,'result','LOSS')
 from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id<>winner and m.seat_status='ACTIVE';
 next_match:=a.match_no+1;
 update public.keep_battle_arenas set status='WAITING',host_id=coalesce(winner,host_id),match_no=next_match,current_round=0,updated_at=now() where id=a.id;
 perform public.keep_battle_arena_seed_rounds(a.id,next_match);
 for candidate in select profile_id from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' order by joined_at loop
   if not public.keep_battle_arena_lock_stake(a.id,next_match,candidate) then
     update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=candidate;
     insert into public.notifications(profile_id,type,title,body,data) values(candidate,'BATTLE_ARENA_NO_CREDIT','Arène KEEP',format('Il te faut au moins %s Free pour rejouer.',stake),jsonb_build_object('arenaId',a.id,'requiredFree',stake));
   end if;
 end loop;
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
