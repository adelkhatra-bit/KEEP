-- Adel (03/09/2026) : "l'autre utilisateur ne reçoit pas l'invite ... Tu ne
-- fais plus partie de ce groupe" -- vrai bug trouvé : toute la mécanique de
-- revanche (propose/répondre/finaliser) ne considérait QUE les membres
-- encore seat_status='ACTIVE'. Or celui qui vient de perdre par forfait AFK
-- (ou tout perdant) est déjà ELIMINATED à ce stade -- il n'était jamais
-- notifié d'une revanche, et s'il essayait quand même de répondre, le
-- serveur le rejetait avec BATTLE_ARENA_FORBIDDEN ("tu ne fais plus partie
-- de ce groupe"). Une revanche doit pouvoir réintégrer n'importe quel
-- ancien participant du groupe, pas seulement ceux qui ont survécu au
-- dernier match.
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
  -- Tous les membres du groupe (gagnant ET perdants, AFK ou non) repassent
  -- en attente de réponse -- seul le proposeur est déjà à "oui".
  update public.keep_battle_arena_members set rematch_ready = case when profile_id = uid then true else null end where arena_id = a.id;
  update public.keep_battle_arenas set rematch_deadline = now() + interval '20 seconds' where id = a.id;
  select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id = uid;
  insert into public.notifications(profile_id,type,title,body,data)
  select m.profile_id,'BATTLE_ARENA_REMATCH','🔁 Revanche proposée',format('@%s souhaite prendre sa revanche. Reviens sur Loki Battle pour répondre.',my_name),jsonb_build_object('arenaId',a.id,'arenaCode',a.arena_code)
  from public.keep_battle_arena_members m
  where m.arena_id = a.id and m.profile_id <> uid;
  perform public.keep_battle_arena_finalize_rematch(a.id);
  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_rematch_respond(p_arena_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); a public.keep_battle_arenas%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id = p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  -- N'importe quel ancien membre (même déjà ELIMINATED, ex. un perdant AFK)
  -- doit pouvoir répondre à une revanche -- seule l'appartenance au groupe
  -- compte, pas le statut de siège du dernier match.
  if not exists(select 1 from public.keep_battle_arena_members where arena_id = a.id and profile_id = uid) then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
  if a.rematch_deadline is null then return public.keep_battle_arena_state(a.id); end if;
  update public.keep_battle_arena_members set rematch_ready = p_ready where arena_id = a.id and profile_id = uid;
  perform public.keep_battle_arena_finalize_rematch(a.id);
  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_finalize_rematch(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare a public.keep_battle_arenas%rowtype; active_count integer; undecided_count integer;
begin
  select * into a from public.keep_battle_arenas where id = p_arena_id for update;
  if not found or a.status <> 'WAITING' or a.rematch_deadline is null then return; end if;
  select count(*) into undecided_count from public.keep_battle_arena_members where arena_id = a.id and rematch_ready is null;
  if undecided_count > 0 and a.rematch_deadline > now() then return; end if;
  -- Quiconque a accepté rejoint (ou réintègre) le groupe -- y compris un
  -- perdant AFK qui répond "oui" -- avant que keep_battle_arena_start ne
  -- tente son propre verrouillage de mise, en sécurité, pour tout le monde.
  update public.keep_battle_arena_members set seat_status = 'ACTIVE' where arena_id = a.id and coalesce(rematch_ready, false) = true and seat_status <> 'ACTIVE';
  update public.keep_battle_arena_members set seat_status = 'ELIMINATED' where arena_id = a.id and coalesce(rematch_ready, false) = false;
  update public.keep_battle_arena_members set rematch_ready = null where arena_id = a.id and seat_status = 'ACTIVE';
  update public.keep_battle_arenas set rematch_deadline = null where id = a.id;
  select count(*) into active_count from public.keep_battle_arena_members where arena_id = a.id and seat_status = 'ACTIVE';
  if active_count >= 2 then
    perform public.keep_battle_arena_start(a.id);
  end if;
end;
$function$;
