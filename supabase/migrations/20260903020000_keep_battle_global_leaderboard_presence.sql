-- Adel (03/09/2026) : "sur la première image tu as marqué joue en solo mix
-- confirmé ... il faut rajouter ce système-là dans le classement global,
-- juste en dessous du nom" -- la ligne "● joue en solo · Mix · ⭐ Confirmé"
-- existait déjà pour les joueurs en ligne visibles depuis "Joueurs
-- disponibles" (présence + niveau, keep_battle_solo_available /
-- keep_battle_skill_tier). Le classement global n'exposait ni la présence
-- en direct ni le niveau -- ajout PUREMENT ADDITIF de 3 colonnes (aucune
-- colonne existante retirée ni renommée) : skill_tier (même fonction que
-- partout ailleurs), is_online et presence_theme_code (même critère de
-- présence que keep_battle_solo_available -- AVAILABLE depuis moins de 20s
-- OU disponibilité manuelle de moins de 30 min).
drop function if exists public.keep_battle_global_leaderboard(integer);

create or replace function public.keep_battle_global_leaderboard(p_limit integer DEFAULT 20)
returns table(profile_id uuid, username text, avatar_url text, wins integer, matches_played integer, total_score integer, total_correct integer, avg_response_ms integer, top_theme_code text, skill_tier text, is_online boolean, presence_theme_code text)
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
  ),
  online as (
    select sp.profile_id, sp.theme_code
    from public.keep_battle_solo_presence sp
    where (sp.status='AVAILABLE' and sp.last_seen_at > now() - interval '20 seconds')
       or (sp.manual_available = true and sp.last_seen_at > now() - interval '30 minutes')
  )
  select p.id, p.username, p.avatar_url,
    count(*) filter (where r.placement=1)::int as wins,
    count(*)::int as matches_played,
    coalesce(sum(r.score),0)::int as total_score,
    coalesce(sum(r.correct_predictions),0)::int as total_correct,
    case when sum(r.correct_predictions)>0 then (sum(r.total_response_ms) / greatest(1,sum(r.correct_predictions)))::int else null end as avg_response_ms,
    bt.theme_code as top_theme_code,
    public.keep_battle_skill_tier(p.id) as skill_tier,
    (o.profile_id is not null) as is_online,
    o.theme_code as presence_theme_code
  from public.keep_battle_arena_match_results r
  join public.profiles p on p.id = r.profile_id
  left join best_theme bt on bt.profile_id = r.profile_id
  left join online o on o.profile_id = p.id
  where p.is_public = true
  group by p.id, p.username, p.avatar_url, bt.theme_code, o.profile_id, o.theme_code
  order by wins desc, total_score desc
  limit greatest(1, least(coalesce(p_limit,20), 50));
$function$;
