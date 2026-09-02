-- Adel (02/09/2026) : "je suis bloqué sur la victoire ... rejoins un nouveau
-- Battle" -- vrai bug trouvé : `finish_match` essayait de reverrouiller
-- IMMÉDIATEMENT une mise pour le match suivant, avant même qu'un des deux
-- joueurs ait demandé une revanche -- et si ce verrouillage échouait
-- (crédit Free insuffisant), il éliminait le membre SANS transaction de
-- secours (contrairement à `keep_battle_arena_start`, qui annule tout
-- proprement via `raise exception` si ça échoue). adel4A, qui venait de
-- GAGNER, se retrouvait donc éjecté de son propre groupe instantanément --
-- confirmé en base : seat_status='ELIMINATED', consecutive_misses=0 (donc
-- pas le système AFK), juste après sa victoire.
--
-- Le bouton REVANCHE (keep_battle_arena_propose_rematch ->
-- keep_battle_arena_finalize_rematch -> keep_battle_arena_start) fait DÉJÀ
-- son propre verrouillage de mise, au bon moment (quand la revanche est
-- confirmée), avec un vrai filet de sécurité transactionnel. Le
-- pré-verrouillage précoce dans finish_match était redondant et dangereux :
-- supprimé. Les membres restent ACTIVE sans mise verrouillée tant qu'une
-- revanche n'est pas explicitement confirmée.
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

 insert into public.keep_battle_skill_stats(profile_id, arena_matches, arena_wins)
 select m.profile_id, 1, case when m.profile_id = winner then 1 else 0 end
 from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='ACTIVE'
 on conflict (profile_id) do update set
   arena_matches = keep_battle_skill_stats.arena_matches + 1,
   arena_wins = keep_battle_skill_stats.arena_wins + excluded.arena_wins,
   updated_at = now();

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
