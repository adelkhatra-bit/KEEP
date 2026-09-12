-- Adel (04/09/2026) : "il faut mettre le nombre d'utilisateur [abonnés], le
-- nombre de Free qu'il a et le nombre de Free qu'il a gagné" -- sur la fiche
-- stats d'un joueur (déjà publique côté Battle : victoires, matchs, styles),
-- ajoute abonnés + solde Free actuel + Free gagné au total au Battle. Même
-- source unifiée que partout ailleurs (keep_theoretical_free_credit_remaining_for_profile),
-- et le même total "gagné" que keep_battle_credit_status.
create or replace function public.keep_battle_profile_battle_stats(p_profile_id uuid, p_theme_limit integer default 3)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  with mine as (
    select r.*, a.theme_code
    from public.keep_battle_arena_match_results r
    join public.keep_battle_arenas a on a.id = r.arena_id
    where r.profile_id = p_profile_id
  ),
  totals as (
    select
      count(*) filter (where placement = 1) as wins,
      count(*) as matches_played,
      coalesce(sum(score), 0) as total_score,
      coalesce(sum(correct_predictions), 0) as total_correct,
      case when sum(correct_predictions) > 0 then (sum(total_response_ms) / greatest(1, sum(correct_predictions)))::int else null end as avg_response_ms
    from mine
  ),
  by_theme as (
    select theme_code,
      count(*) filter (where placement = 1) as wins,
      count(*) as matches
    from mine
    group by theme_code
    order by wins desc, matches desc
    limit greatest(1, least(coalesce(p_theme_limit, 3), 10))
  ),
  credit as (
    select coalesce(sum(amount) filter (where amount > 0), 0)::integer as free_won
    from public.keep_battle_credit_events
    where profile_id = p_profile_id
  )
  select jsonb_build_object(
    'wins', (select wins from totals),
    'matchesPlayed', (select matches_played from totals),
    'totalScore', (select total_score from totals),
    'totalCorrect', (select total_correct from totals),
    'avgResponseMs', (select avg_response_ms from totals),
    'topThemes', coalesce((select jsonb_agg(jsonb_build_object('themeCode', theme_code, 'wins', wins, 'matches', matches)) from by_theme), '[]'::jsonb),
    'followers', (select count(*)::integer from public.follows f where f.followee_id = p_profile_id),
    'freeBalance', public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id),
    'freeWon', (select free_won from credit)
  );
$function$;
