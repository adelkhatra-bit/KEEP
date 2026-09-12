-- Adel (02/09/2026) : "il est bloqué sur la page ... ça bloque" -- vrai bug
-- trouvé : un membre éliminé pour AFK (3 questions sans réponse) n'obtenait
-- JAMAIS de ligne dans keep_battle_arena_match_results, parce que cette
-- table n'est remplie que par keep_battle_arena_finish_match, qui ne
-- considère que les membres encore seat_status='ACTIVE' à ce moment -- or
-- l'AFK vient justement de les en sortir AVANT que finish_match ne
-- s'exécute. Résultat côté client : `arena.lastResult` (qui cherche une
-- ligne match_results pour SON profil) restait vide pour la victime de
-- l'AFK, donc son écran ne basculait jamais sur "FIN DU MATCH" -- il restait
-- coincé sur l'affichage (périmé) de la manche en cours, un écran où la
-- bannière d'invitation entrante ne s'affiche jamais non plus. D'où le
-- blocage total : impossible de voir/accepter la nouvelle invite envoyée
-- après coup.
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

 -- Absences : reset à 0 pour qui a répondu cette manche, incrémente pour qui
 -- n'a pas répondu du tout (indépendamment de bonne/mauvaise réponse).
 update public.keep_battle_arena_members m
 set consecutive_misses = 0
 where m.arena_id=a.id and m.seat_status='ACTIVE'
   and exists(select 1 from public.keep_battle_arena_answers z where z.round_id=r.id and z.profile_id=m.profile_id);

 update public.keep_battle_arena_members m
 set consecutive_misses = m.consecutive_misses + 1
 where m.arena_id=a.id and m.seat_status='ACTIVE'
   and not exists(select 1 from public.keep_battle_arena_answers z where z.round_id=r.id and z.profile_id=m.profile_id);

 stake := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1),3));
 for afk in select profile_id, score, correct_predictions, total_response_ms from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' and consecutive_misses>=3
 loop
   if exists(select 1 from public.keep_battle_arena_credit_holds where arena_id=a.id and match_no=a.match_no and profile_id=afk.profile_id and status='LOCKED') then
     insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
     values(a.id,a.match_no,afk.profile_id,'LOSS',-stake)
     on conflict(arena_id,match_no,profile_id) do nothing;
     update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and profile_id=afk.profile_id and status='LOCKED';
   end if;
   update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=afk.profile_id;
   -- Nouveau : ligne de résultat même pour un abandon AFK, sinon son écran
   -- ne bascule jamais sur "FIN DU MATCH" (voir commentaire ci-dessus).
   -- Placement toujours pire que n'importe quel membre encore actif.
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
