-- Audit multi-agent 07/09/2026 (juge base de donnees) : double-depense de credits
-- Free possible quand un joueur envoie deux requetes keep_battle_arena_join/matchmake
-- quasi simultanees sur DEUX arenes differentes. keep_theoretical_free_credit_remaining_for_profile
-- ne voit pas le hold LOCKED d'une transaction concurrente non encore committee (MVCC),
-- donc les deux transactions lisent le meme solde restant et posent chacune leur mise.
-- Fix : verrou advisory par (profil) au tout debut de keep_battle_arena_lock_stake, qui
-- serialise tous les appels concurrents pour CE joueur (toutes arenes confondues) et se
-- libere automatiquement a la fin de la transaction (COMMIT/ROLLBACK). Aucun changement
-- de comportement/contrat pour un joueur qui n'a qu'un seul appel en vol.

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

  stake:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1),3));
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
