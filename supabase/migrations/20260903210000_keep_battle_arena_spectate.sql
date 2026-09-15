-- Adel (03/09/2026) : "un utilisateur pourra regarder le match en cours en
-- tant que visiteur ... et pouvoir dire je veux participer sans envoyer
-- d'invite, quand le match est termine ca fera rentrer l'utilisateur" --
-- mode spectateur, inspire des lives multi-invites (TikTok) : quelqu'un qui
-- n'est PAS membre de l'arene peut suivre un match EN COURS en lecture
-- seule (scores, manche, revelation), sans jamais voir l'etat de reponse
-- individuel d'un joueur (anti-triche + vie privee -- le spectateur ne joue
-- pas, il n'a besoin d'aucune info de reponse en cours).
--
-- Le "+" pour rejoindre AU PROCHAIN MATCH n'a rien de nouveau a construire
-- cote base : keep_battle_arena_join met deja en file (seat_status='QUEUED')
-- quand l'arene est ACTIVE, et fait entrer automatiquement au match_no
-- suivant -- exactement le mecanisme demande, deja en production pour
-- l'invitation en cours de partie.
create or replace function public.keep_battle_arena_spectate(p_arena_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  seats jsonb;
  current jsonb;
  queue_count integer;
  open_seats integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where arena_code = upper(trim(p_arena_code));
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if a.status in ('CLOSED','EXPIRED') or a.expires_at <= now() then raise exception 'BATTLE_ARENA_CLOSED'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'profileId', x.profile_id, 'username', x.username, 'avatarUrl', x.avatar_url,
    'score', x.score, 'placement', x.placement
  ) order by x.score desc, x.joined_at asc), '[]'::jsonb) into seats
  from (
    select m.profile_id, p.username, p.avatar_url, m.score, m.placement, m.joined_at
    from public.keep_battle_arena_members m join public.profiles p on p.id = m.profile_id
    where m.arena_id = a.id and m.seat_status = 'ACTIVE'
    order by m.score desc, m.joined_at asc
    limit 10
  ) x;

  select case when r.id is null then null else jsonb_build_object(
    'position', r.position,
    'artist', case when r.finalized_at is not null then r.artist_snapshot else null end,
    'artworkUrl', case when r.finalized_at is not null then r.artwork_url else null end,
    'startedAt', r.started_at, 'closesAt', r.closes_at, 'revealUntil', r.reveal_until,
    'revealed', r.finalized_at is not null
  ) end into current
  from public.keep_battle_arena_rounds r
  where r.arena_id = a.id and r.match_no = a.match_no and r.position = greatest(a.current_round, 1);

  select count(*) into queue_count from public.keep_battle_arena_members where arena_id = a.id and seat_status = 'QUEUED';
  select greatest(0, a.max_players - count(*)) into open_seats from public.keep_battle_arena_members where arena_id = a.id and seat_status = 'ACTIVE';

  return jsonb_build_object(
    'id', a.id, 'arenaCode', a.arena_code, 'themeCode', a.theme_code, 'status', a.status,
    'maxPlayers', a.max_players, 'openSeats', open_seats, 'queue', queue_count,
    'roundCount', a.round_count, 'matchNo', a.match_no, 'currentRound', a.current_round,
    'roundDurationMs', a.round_duration_ms, 'seats', seats, 'round', current
  );
end;
$function$;
