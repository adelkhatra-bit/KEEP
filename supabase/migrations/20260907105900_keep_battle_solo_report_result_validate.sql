-- Audit multi-agent 07/09/2026 (juge base de donnees) : aucune verification que
-- p_correct <= p_total, ni de plafond sur p_total -- un client pouvait gonfler
-- indefiniment solo_correct par rapport a solo_total (ex: p_correct=999999,
-- p_total=1) en boucle, faussant keep_battle_skill_tier / le matchmaking par
-- niveau. Les packs solo vont de 5 a 30 manches (keep_battle_solo_pack) : on
-- borne p_total a ce maximum realiste et on plafonne p_correct a p_total.

CREATE OR REPLACE FUNCTION public.keep_battle_solo_report_result(p_correct integer, p_total integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  total integer;
  correct integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_total is null or p_total <= 0 then return; end if;
  total := least(p_total, 30);
  correct := least(greatest(0, coalesce(p_correct, 0)), total);
  insert into public.keep_battle_skill_stats(profile_id, solo_correct, solo_total, updated_at)
  values (uid, correct, total, now())
  on conflict (profile_id) do update set
    solo_correct = keep_battle_skill_stats.solo_correct + correct,
    solo_total = keep_battle_skill_stats.solo_total + total,
    updated_at = now();
end;
$function$;
