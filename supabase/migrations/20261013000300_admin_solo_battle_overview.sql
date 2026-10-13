-- Lot 5 Super Admin > Solo / Battle (12/10/2026) -- LECTURE SEULE.
-- FICHIER SEULEMENT : application en production soumise à l'accord explicite d'Adel.
-- Tolérant au schéma : keep_battle_solo_history n'a aujourd'hui NI started_at NI mise.
-- Les colonnes optionnelles sont lues via to_jsonb(h)->>'...' : si une autre équipe
-- ajoute started_at / stake_free, la RPC les utilise sans modification ; sinon durée
-- et mises restent NULL (l'UI affiche « non disponible »).
-- Parties suspectes : durée par manche < 5 s (si started_at existe) ; sans
-- started_at, on signale seulement les profils à >= 5 séries parfaites sur la période.
-- Réversible : drop function public.keep_admin_solo_battle_overview(integer).
--
-- Vérification (lecture, connecté en admin) : select public.keep_admin_solo_battle_overview(7);

create or replace function public.keep_admin_solo_battle_overview(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
  result jsonb;
begin
  if v_uid is null or not public.admin_has_role(v_uid, array['SUPER_ADMIN','ADMIN','FINANCE','MODERATOR','TECH']) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  with base as (
    select h.id, h.profile_id, h.round_count, h.correct_answers, h.completed_at, h.free_earned,
           nullif(to_jsonb(h)->>'started_at','')::timestamptz as started_at,
           nullif(to_jsonb(h)->>'stake_free','')::numeric as stake_free
    from public.keep_battle_solo_history h
    where h.completed_at >= now() - make_interval(days => v_days)
  ), calc as (
    select *, case when started_at is not null then extract(epoch from (completed_at - started_at)) end as duration_s from base
  ), perfect as (
    select profile_id, count(*) n from calc where correct_answers = round_count and round_count > 0 group by profile_id
  )
  select jsonb_build_object(
    'days', v_days,
    'gamesToday', (select count(*) from public.keep_battle_solo_history where completed_at >= date_trunc('day', now())),
    'gamesPeriod', (select count(*) from calc),
    'freeEarnedPeriod', (select coalesce(sum(free_earned),0) from calc),
    'freeStakedPeriod', (select sum(stake_free) from calc),
    'avgDurationSeconds', (select round(avg(duration_s)::numeric,1) from calc where duration_s is not null),
    'durationAvailable', exists(select 1 from calc where started_at is not null),
    'suspiciousGames', (select count(*) from calc where duration_s is not null and round_count > 0 and duration_s / round_count < 5),
    'suspiciousProfiles', (select count(*) from perfect where n >= 5)
  ) into result;
  return result;
end;
$function$;

revoke all on function public.keep_admin_solo_battle_overview(integer) from public, anon;
grant execute on function public.keep_admin_solo_battle_overview(integer) to authenticated;
