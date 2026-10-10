-- Adel (02/10/2026, retour d'un joueur) : « il est important pour le
-- classement d'aller au bout des parties » + « dans le classement, mettre les
-- abandons de partie en duo ou en solo ».
-- Avant : aucun abandon n'était compté ; le classement ne regardait que les
-- victoires et le score.
-- Maintenant :
-- - keep_battle_abandons : un abandon de Battle par joueur et par match,
--   alimenté AUTOMATIQUEMENT par les notifications que le serveur crée déjà
--   (BATTLE_ARENA_FORFEIT = a quitté ; BATTLE_ARENA_AFK_ELIMINATED = sorti
--   après 3 questions sans réponse). Aucune fonction de jeu n'est modifiée.
--   L'historique existant est repris depuis ces notifications.
-- - Abandons Solo : parties lancées (keep_battle_solo_daily_usage.starts)
--   moins parties terminées (keep_battle_solo_history), jamais négatif.
-- - Classement : colonne `abandons` (Battle + Solo) ; à victoires égales,
--   celui qui abandonne le moins passe devant.
-- Additif : aucune donnée utilisateur modifiée ni supprimée.

create table if not exists public.keep_battle_abandons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('FORFEIT','AFK')),
  arena_id uuid,
  match_no integer,
  created_at timestamptz not null default now(),
  unique (profile_id, arena_id, match_no)
);
create index if not exists keep_battle_abandons_profile_idx on public.keep_battle_abandons(profile_id);
alter table public.keep_battle_abandons enable row level security;
revoke all on public.keep_battle_abandons from anon, authenticated;

create or replace function public.keep_battle_record_abandon_from_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.type in ('BATTLE_ARENA_FORFEIT','BATTLE_ARENA_AFK_ELIMINATED') then
    insert into public.keep_battle_abandons(profile_id, reason, arena_id, match_no, created_at)
    values (
      new.profile_id,
      case when new.type = 'BATTLE_ARENA_FORFEIT' then 'FORFEIT' else 'AFK' end,
      nullif(new.data->>'arenaId','')::uuid,
      nullif(new.data->>'matchNo','')::integer,
      coalesce(new.created_at, now())
    )
    on conflict (profile_id, arena_id, match_no) do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function public.keep_battle_record_abandon_from_notification() from public, anon, authenticated;

drop trigger if exists notifications_record_battle_abandon on public.notifications;
create trigger notifications_record_battle_abandon
  after insert on public.notifications
  for each row execute function public.keep_battle_record_abandon_from_notification();

-- Reprise de l'historique (abandons déjà notifiés).
insert into public.keep_battle_abandons(profile_id, reason, arena_id, match_no, created_at)
select n.profile_id,
       case when n.type = 'BATTLE_ARENA_FORFEIT' then 'FORFEIT' else 'AFK' end,
       nullif(n.data->>'arenaId','')::uuid,
       nullif(n.data->>'matchNo','')::integer,
       n.created_at
from public.notifications n
where n.type in ('BATTLE_ARENA_FORFEIT','BATTLE_ARENA_AFK_ELIMINATED')
on conflict (profile_id, arena_id, match_no) do nothing;

-- Classement : même calcul qu'avant + abandons (type de retour modifié →
-- la fonction doit être recréée ; mêmes droits qu'avant).
drop function if exists public.keep_battle_global_leaderboard(integer);
create function public.keep_battle_global_leaderboard(p_limit integer default 20)
 returns table(profile_id uuid, username text, avatar_url text, wins integer, matches_played integer, total_score integer, total_correct integer, avg_response_ms integer, top_theme_code text, skill_tier text, is_online boolean, presence_theme_code text, abandons integer)
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
  ),
  battle_abandons as (
    select ab.profile_id, count(*)::int as n from public.keep_battle_abandons ab group by ab.profile_id
  ),
  solo_abandons as (
    select u.profile_id,
           greatest(0, coalesce(sum(u.starts),0) - coalesce((select count(*) from public.keep_battle_solo_history h where h.profile_id = u.profile_id),0))::int as n
    from public.keep_battle_solo_daily_usage u
    group by u.profile_id
  ),
  base as (
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
  )
  select b.id, b.username, b.avatar_url, b.wins, b.matches_played, b.total_score, b.total_correct, b.avg_response_ms,
         b.top_theme_code, b.skill_tier, b.is_online, b.presence_theme_code,
         (coalesce(ba.n,0) + coalesce(sa.n,0))::int as abandons
  from base b
  left join battle_abandons ba on ba.profile_id = b.id
  left join solo_abandons sa on sa.profile_id = b.id
  order by b.wins desc, (coalesce(ba.n,0) + coalesce(sa.n,0)) asc, b.total_score desc
  limit greatest(1, least(coalesce(p_limit,20), 50));
$function$;
grant execute on function public.keep_battle_global_leaderboard(integer) to anon, authenticated, service_role;
