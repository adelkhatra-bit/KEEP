-- Audit demande par Adel 07/09/2026 ("verifie tous les utilisateurs") : trouve
-- en direct 3 holds LOCKED bloques pour de vrai sur 2 vrais comptes (teyou x2,
-- floadelissa x1 = 9 Free au total) -- toutes leurs arenes sont restees en
-- WAITING (jamais assez de joueurs pour demarrer), ont depasse expires_at, mais
-- rien ne les a jamais fermees ni rendu le credit mis en jeu au moment de
-- rejoindre. 'EXPIRED' existe deja comme statut valide (CHECK constraint,
-- utilise par keep_battle_arena_join) mais keep_system_auto_repair() -- le
-- cron qui tourne chaque minute -- ne traitait jamais ce cas : il finalise les
-- manches en retard et expire les defis en attente, jamais les arenes WAITING
-- elles-memes. Trou reel depuis la creation de cette fonction.

CREATE OR REPLACE FUNCTION public.keep_system_auto_repair()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_expired int:=0; v_finalized int:=0; v_advanced int:=0; v_arenas_expired int:=0; v_holds_released int:=0; r record;
begin
  update public.keep_battle_challenges set status='EXPIRED',updated_at=now()
  where status='PENDING' and expires_at<=now();
  get diagnostics v_expired = row_count;

  for r in
    select a.id from public.keep_battle_arenas a
    join public.keep_battle_arena_rounds rr on rr.arena_id=a.id and rr.match_no=a.match_no and rr.position=a.current_round
    where a.status='ACTIVE' and rr.finalized_at is null and rr.closes_at<=now()
  loop
    perform public.keep_battle_arena_finalize_round(r.id); v_finalized:=v_finalized+1;
  end loop;

  for r in
    select a.id from public.keep_battle_arenas a
    join public.keep_battle_arena_rounds rr on rr.arena_id=a.id and rr.match_no=a.match_no and rr.position=a.current_round
    where a.status='ACTIVE' and rr.finalized_at is not null and rr.reveal_until<=now()
  loop
    perform public.keep_battle_arena_advance_after_reveal(r.id); v_advanced:=v_advanced+1;
  end loop;

  -- Arenes jamais parties (restees WAITING) dont le delai est depasse : on les
  -- ferme et on rend aux joueurs le credit qu'ils avaient mis en jeu pour
  -- rejoindre, au lieu de le laisser bloque pour toujours.
  with released as (
    update public.keep_battle_arena_credit_holds h
    set status='RELEASED', settled_at=now()
    from public.keep_battle_arenas a
    where h.arena_id=a.id and h.status='LOCKED' and a.status='WAITING' and a.expires_at<=now()
    returning h.arena_id
  )
  select count(*) into v_holds_released from released;

  update public.keep_battle_arenas set status='EXPIRED'
  where status='WAITING' and expires_at<=now();
  get diagnostics v_arenas_expired = row_count;

  insert into public.keep_auto_repair_log(stale_challenges_expired,battle_rounds_finalized,battle_rounds_advanced,notes)
  values(v_expired,v_finalized,v_advanced, case when v_arenas_expired>0 then 'SAFE_AUTOREPAIR arenasExpired='||v_arenas_expired||' holdsReleased='||v_holds_released else 'SAFE_AUTOREPAIR' end);
  delete from public.keep_auto_repair_log where ran_at < now()-interval '30 days';
  return jsonb_build_object('expiredChallenges',v_expired,'finalizedRounds',v_finalized,'advancedRounds',v_advanced,'arenasExpired',v_arenas_expired,'holdsReleased',v_holds_released,'ranAt',now());
end;$function$;

-- Corrige immediatement les 3 holds deja bloques (pas besoin d'attendre la
-- prochaine minute de cron).
select public.keep_system_auto_repair();
