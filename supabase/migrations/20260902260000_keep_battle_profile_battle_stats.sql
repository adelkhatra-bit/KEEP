-- Adel (02/09/2026) : "cliquer dessus, un pop-up qui me permette de voir son
-- style musical, quel style il est vraiment imbattable, toutes les
-- statistiques ... pense à des millions d'utilisateurs, faut que ce soit
-- robuste" -- une seule RPC indexée par profil (pas le tour complet du
-- classement) pour le pop-up : total victoires/matchs/bonnes réponses/temps
-- moyen, PLUS le détail des thèmes où il gagne le plus (pas juste le
-- premier), en un seul aller-retour.
create index if not exists idx_battle_match_results_profile on public.keep_battle_arena_match_results(profile_id);

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
  )
  select jsonb_build_object(
    'wins', (select wins from totals),
    'matchesPlayed', (select matches_played from totals),
    'totalScore', (select total_score from totals),
    'totalCorrect', (select total_correct from totals),
    'avgResponseMs', (select avg_response_ms from totals),
    'topThemes', coalesce((select jsonb_agg(jsonb_build_object('themeCode', theme_code, 'wins', wins, 'matches', matches)) from by_theme), '[]'::jsonb)
  );
$function$;
