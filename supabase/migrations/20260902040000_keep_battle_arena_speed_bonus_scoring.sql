-- Adel (02/09/2026) : "est-ce que le système va détecter celui qui a
-- répondu le plus rapidement" -- avant, toute bonne réponse valait 1000
-- points peu importe le temps de réponse (response_ms était enregistré
-- mais jamais utilisé). Barème vitesse sur la fenêtre fixe de 10s
-- (round_duration_ms) : 1000 pts pour une réponse instantanée, dégressif
-- jusqu'à un plancher de 500 pts pour une bonne réponse juste avant la
-- fermeture -- une mauvaise réponse reste toujours à 0.
create or replace function public.keep_battle_arena_finalize_round(p_arena_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a public.keep_battle_arenas%rowtype; r public.keep_battle_arena_rounds%rowtype; active_count integer; answer_count integer;
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

 update public.keep_battle_arena_rounds set finalized_at=now(),reveal_until=now()+interval '1500 milliseconds' where id=r.id;
end;
$function$;
