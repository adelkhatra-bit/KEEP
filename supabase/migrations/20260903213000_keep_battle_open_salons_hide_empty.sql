-- Adel (03/09/2026) : "il y a trop d'ecriture ... je vois pas les boutons" --
-- keep_battle_open_salons listait TOUTES les arenes WAITING/ACTIVE, y
-- compris des salons crees puis jamais rejoints (0/10 joueurs) -- de simples
-- coquilles vides issues de tests precedents. Un spectateur qui tombait sur
-- l'une d'elles voyait une grille sans aucun joueur ni tuile visible (le "+"
-- se noyait seul, sans repere). On ne liste desormais que les matchs ou au
-- moins un joueur est reellement present -- la seule chose qui merite
-- vraiment le nom "match en direct".
create or replace function public.keep_battle_open_salons(p_theme_code text default null::text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',y.id,
    'arenaCode',y.arena_code,
    'themeCode',y.theme_code,
    'themeLabel',y.theme_label,
    'status',y.status,
    'players',y.players,
    'maxPlayers',y.max_players,
    'openSeats',greatest(0,y.max_players-y.players),
    'queue',y.queue_count,
    'jackpotFree',greatest(0,(y.players-1)*3),
    'hostUsername',y.host_username,
    'hostAvatarUrl',y.host_avatar_url,
    'createdAt',y.created_at
  ) order by y.theme_order,y.players desc,y.created_at asc),'[]'::jsonb)
  from (
    select x.* from (
      select a.id,a.arena_code,a.theme_code,t.label theme_label,t.sort_order theme_order,a.status,a.max_players,a.created_at,
        p.username host_username,p.avatar_url host_avatar_url,
        (select count(*)::int from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='ACTIVE') players,
        (select count(*)::int from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='QUEUED') queue_count
      from public.keep_battle_arenas a
      join public.keep_battle_themes t on t.code=a.theme_code and t.enabled=true
      join public.profiles p on p.id=a.host_id
      where a.status in('WAITING','ACTIVE') and a.expires_at>now()
        and (p_theme_code is null or trim(p_theme_code)='' or a.theme_code=upper(trim(p_theme_code)))
    ) x
    where x.players > 0
    order by x.theme_order, x.players desc, x.created_at asc
    limit 12
  ) y;
$function$;
