-- Adel (02/09/2026) : "mettre aussi le style qu'il écoute ... dans quelle
-- catégorie il est très fort" -- le système sait déjà, par match, quel
-- thème (keep_battle_arenas.theme_code) et si le joueur a gagné
-- (placement=1) : on agrège ça par joueur pour trouver son thème "fort"
-- (le plus de victoires, égalité départagée par le plus de matchs joués
-- dans ce thème) et on l'expose dans le classement global.
drop function if exists public.keep_battle_global_leaderboard(integer);

create or replace function public.keep_battle_global_leaderboard(p_limit integer DEFAULT 20)
returns table(profile_id uuid, username text, avatar_url text, wins integer, matches_played integer, total_score integer, total_correct integer, avg_response_ms integer, top_theme_code text)
language sql
security definer
set search_path to 'public'
as $function$
  with per_theme as (
    select r.profile_id, a.theme_code,
      count(*) filter (where r.placement=1) as theme_wins,
      count(*) as theme_matches
    from public.keep_battle_arena_match_results r
    join public.keep_battle_arenas a on a.id = r.arena_id
    group by r.profile_id, a.theme_code
  ),
  best_theme as (
    select distinct on (profile_id) profile_id, theme_code
    from per_theme
    order by profile_id, theme_wins desc, theme_matches desc
  )
  select p.id, p.username, p.avatar_url,
    count(*) filter (where r.placement=1)::int as wins,
    count(*)::int as matches_played,
    coalesce(sum(r.score),0)::int as total_score,
    coalesce(sum(r.correct_predictions),0)::int as total_correct,
    case when sum(r.correct_predictions)>0 then (sum(r.total_response_ms) / greatest(1,sum(r.correct_predictions)))::int else null end as avg_response_ms,
    bt.theme_code as top_theme_code
  from public.keep_battle_arena_match_results r
  join public.profiles p on p.id = r.profile_id
  left join best_theme bt on bt.profile_id = r.profile_id
  where p.is_public = true
  group by p.id, p.username, p.avatar_url, bt.theme_code
  order by wins desc, total_score desc
  limit greatest(1, least(coalesce(p_limit,20), 50));
$function$;
