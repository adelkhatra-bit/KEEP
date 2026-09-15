-- Adel (03/09/2026) : test reel -- "je clique sur le premier, une fois
-- dedans on peut rien faire, y a même pas d'invite à faire, il manque un
-- morceau" -- keep_battle_open_salons (players > 0) laissait passer des
-- salons ou UNE SEULE personne attend un adversaire (WAITING, personne en
-- face) : rien a regarder, juste quelqu'un seul. "Le salon a visiter, c'est
-- quand les deux [joueurs] sont en train de jouer" -- un match vraiment "en
-- direct" digne d'etre propose a un spectateur exige au moins DEUX joueurs
-- actifs simultanement.
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
    where x.players >= 2
    order by x.theme_order, x.players desc, x.created_at asc
    limit 12
  ) y;
$function$;
