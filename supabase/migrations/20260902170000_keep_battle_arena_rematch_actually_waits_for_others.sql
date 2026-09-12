-- Adel (02/09/2026) : "j'appuie sur revanche ça envoie pas une invitation à
-- l'autre utilisateur" -- bug réel trouvé : `propose_rematch` mettait
-- `rematch_ready = (profile_id = uid)`, ce qui vaut FALSE (pas NULL/en
-- attente) pour tous les AUTRES membres. `finalize_rematch` ne compte que
-- les `rematch_ready is null` comme "en attente" ; comme il n'y en avait
-- jamais, il finalisait IMMÉDIATEMENT et éliminait tous les autres joueurs
-- comme s'ils avaient déjà refusé -- la revanche ne partait donc jamais à
-- plusieurs, elle isolait juste le proposeur. Correction : les autres
-- membres repassent à NULL (en attente de réponse), pas FALSE. Le délai de
-- 20s existant dans `rematch_deadline` reste inchangé : qui ne répond pas
-- avant l'échéance est traité comme refusé et la partie repart sans lui
-- (voir keep_battle_arena_finalize_rematch, déjà en place).
create or replace function public.keep_battle_arena_propose_rematch(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); a public.keep_battle_arenas%rowtype; my_name text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id = p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id = a.id and profile_id = uid and seat_status = 'ACTIVE') then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
  if a.status <> 'WAITING' or a.match_no <= 1 then raise exception 'BATTLE_ARENA_NOT_READY_FOR_REMATCH'; end if;
  update public.keep_battle_arena_members set rematch_ready = case when profile_id = uid then true else null end where arena_id = a.id and seat_status = 'ACTIVE';
  update public.keep_battle_arenas set rematch_deadline = now() + interval '20 seconds' where id = a.id;
  select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id = uid;
  insert into public.notifications(profile_id,type,title,body,data)
  select m.profile_id,'BATTLE_ARENA_REMATCH','🔁 Revanche proposée',format('@%s souhaite prendre sa revanche. Reviens sur Loki Battle pour répondre.',my_name),jsonb_build_object('arenaId',a.id,'arenaCode',a.arena_code)
  from public.keep_battle_arena_members m
  where m.arena_id = a.id and m.seat_status = 'ACTIVE' and m.profile_id <> uid;
  perform public.keep_battle_arena_finalize_rematch(a.id);
  return public.keep_battle_arena_state(a.id);
end;
$function$;
