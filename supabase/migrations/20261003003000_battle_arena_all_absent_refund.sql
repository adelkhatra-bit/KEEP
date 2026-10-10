-- Adel (02/10/2026) : « samedi a perdu 3 Free ». Diagnostic (lecture seule) :
-- Battle Arène du 02/10, 2 joueurs, plus personne ne répondait depuis 3
-- manches → les DEUX joueurs ont été sortis dans la même manche, chacun avec
-- -3 Free, et comme il ne restait aucun joueur il n'y avait aucun gagnant :
-- les 6 Free ont disparu (personne n'a touché la cagnotte).
--
-- Règle conservée (Adel 02/09/2026) : un joueur qui manque 3 questions
-- d'affilée pendant que les autres jouent sort et perd sa mise (elle va dans
-- la cagnotte du gagnant).
-- Correction : si TOUS les joueurs encore en jeu atteignent ensemble les 3
-- absences, la partie est abandonnée : personne ne perd, chaque mise bloquée
-- est rendue (statut RELEASED, aucun événement LOSS) et chacun reçoit une
-- notification qui l'explique.
-- Additif : aucune donnée existante modifiée.

create or replace function public.keep_battle_arena_finalize_round(p_arena_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a public.keep_battle_arenas%rowtype;
  r public.keep_battle_arena_rounds%rowtype;
  active_count integer;
  answer_count integer;
  absent_count integer;
  abandoned boolean := false;
  stake integer;
  afk record;
  afk_placement integer;
  held integer;
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

 -- Tous les joueurs encore en jeu sont absents en même temps : partie abandonnée.
 select count(*) into absent_count from public.keep_battle_arena_members
 where arena_id=a.id and seat_status='ACTIVE' and consecutive_misses>=3;
 abandoned := absent_count>0 and absent_count=active_count;

 stake := public.keep_battle_stake_for_rounds(a.round_count);
 for afk in select profile_id, score, correct_predictions, total_response_ms from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' and consecutive_misses>=3
 loop
   select h.amount into held from public.keep_battle_arena_credit_holds h
   where h.arena_id=a.id and h.match_no=a.match_no and h.profile_id=afk.profile_id and h.status='LOCKED';
   if abandoned then
     update public.keep_battle_arena_credit_holds set status='RELEASED',settled_at=now()
     where arena_id=a.id and match_no=a.match_no and profile_id=afk.profile_id and status='LOCKED';
   elsif held is not null then
     insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
     values(a.id,a.match_no,afk.profile_id,'LOSS',-held)
     on conflict(arena_id,match_no,profile_id) do nothing;
     update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and profile_id=afk.profile_id and status='LOCKED';
   end if;
   update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=afk.profile_id;
   select coalesce(max(placement),0)+active_count+1 into afk_placement from public.keep_battle_arena_match_results where arena_id=a.id and match_no=a.match_no;
   insert into public.keep_battle_arena_match_results(arena_id,match_no,profile_id,placement,score,correct_predictions,total_response_ms)
   values(a.id,a.match_no,afk.profile_id,afk_placement,afk.score,afk.correct_predictions,afk.total_response_ms)
   on conflict(arena_id,match_no,profile_id) do nothing;
   insert into public.notifications(profile_id,type,title,body,data)
   values(afk.profile_id,'BATTLE_ARENA_AFK_ELIMINATED','⚡ Battle KEEP',
     case when abandoned
       then format('Partie interrompue : plus aucun joueur ne répondait depuis 3 questions. Personne ne perd : ta mise de %s Free t’est rendue.',coalesce(held,stake))
       else 'Tu as manqué 3 questions d’affilée : tu es sorti de la partie et as perdu ta mise.' end,
     jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'refunded',abandoned,'creditDelta',case when abandoned then 0 else -coalesce(held,0) end));
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
