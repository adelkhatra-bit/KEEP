-- Adel (02/09/2026) : "il nous faut vraiment un endroit pour avoir toutes
-- les statistiques des joueurs ... celui qui répond le plus rapidement, le
-- nombre de bonnes réponses, va t'inspirer TikTok" -- premier classement
-- global cross-matchs (pas seulement "ce match" ou "cette arène") : victoires
-- totales, score cumulé, bonnes réponses, temps de réponse moyen.
create or replace function public.keep_battle_global_leaderboard(p_limit integer default 20)
returns table(profile_id uuid, username text, avatar_url text, wins integer, matches_played integer, total_score integer, total_correct integer, avg_response_ms integer)
language sql
security definer
set search_path to 'public'
as $function$
  select p.id, p.username, p.avatar_url,
    count(*) filter (where r.placement=1)::int as wins,
    count(*)::int as matches_played,
    coalesce(sum(r.score),0)::int as total_score,
    coalesce(sum(r.correct_predictions),0)::int as total_correct,
    case when sum(r.correct_predictions)>0 then (sum(r.total_response_ms) / greatest(1,sum(r.correct_predictions)))::int else null end as avg_response_ms
  from public.keep_battle_arena_match_results r
  join public.profiles p on p.id = r.profile_id
  where p.is_public = true
  group by p.id, p.username, p.avatar_url
  order by wins desc, total_score desc
  limit greatest(1, least(coalesce(p_limit,20), 50));
$function$;

revoke all on function public.keep_battle_global_leaderboard(integer) from public;
grant execute on function public.keep_battle_global_leaderboard(integer) to authenticated, anon;
