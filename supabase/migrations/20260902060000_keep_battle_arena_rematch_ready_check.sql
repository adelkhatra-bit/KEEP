-- Adel (02/09/2026) : "quand un utilisateur veut prendre sa revanche, il faut
-- que ça envoie un popup à l'utilisateur... leur demander... souhaitez-vous
-- oui ou non, tout le monde doit recevoir un popup comme ça, celui qui veut
-- rentrer il rentre, celui qui veut arrêter il arrête." Avant, REVANCHE
-- relançait le match immédiatement pour TOUT le groupe sans leur demander
-- leur avis. Ajoute un vrai round de consentement : celui qui propose est
-- compté "prêt" automatiquement, les autres ont 20s pour répondre oui/non ;
-- dès que tout le monde a répondu (ou au bout des 20s), ceux qui n'ont pas
-- dit oui quittent le groupe et le match démarre avec ceux qui restent (s'il
-- en reste au moins 2).
alter table public.keep_battle_arenas add column if not exists rematch_deadline timestamptz;
alter table public.keep_battle_arena_members add column if not exists rematch_ready boolean;

create or replace function public.keep_battle_arena_finalize_rematch(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare a public.keep_battle_arenas%rowtype; active_count integer; undecided_count integer;
begin
  select * into a from public.keep_battle_arenas where id = p_arena_id for update;
  if not found or a.status <> 'WAITING' or a.rematch_deadline is null then return; end if;
  select count(*) into undecided_count from public.keep_battle_arena_members where arena_id = a.id and seat_status = 'ACTIVE' and rematch_ready is null;
  if undecided_count > 0 and a.rematch_deadline > now() then return; end if;
  update public.keep_battle_arena_members set seat_status = 'ELIMINATED' where arena_id = a.id and seat_status = 'ACTIVE' and coalesce(rematch_ready, false) = false;
  update public.keep_battle_arena_members set rematch_ready = null where arena_id = a.id and seat_status = 'ACTIVE';
  update public.keep_battle_arenas set rematch_deadline = null where id = a.id;
  select count(*) into active_count from public.keep_battle_arena_members where arena_id = a.id and seat_status = 'ACTIVE';
  if active_count >= 2 then
    perform public.keep_battle_arena_start(a.id);
  end if;
end;
$function$;

create or replace function public.keep_battle_arena_propose_rematch(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); a public.keep_battle_arenas%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id = p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id = a.id and profile_id = uid and seat_status = 'ACTIVE') then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
  if a.status <> 'WAITING' or a.match_no <= 1 then raise exception 'BATTLE_ARENA_NOT_READY_FOR_REMATCH'; end if;
  update public.keep_battle_arena_members set rematch_ready = (profile_id = uid) where arena_id = a.id and seat_status = 'ACTIVE';
  update public.keep_battle_arenas set rematch_deadline = now() + interval '20 seconds' where id = a.id;
  perform public.keep_battle_arena_finalize_rematch(a.id);
  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_rematch_respond(p_arena_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); a public.keep_battle_arenas%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id = p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id = a.id and profile_id = uid and seat_status = 'ACTIVE') then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
  if a.rematch_deadline is null then return public.keep_battle_arena_state(a.id); end if;
  update public.keep_battle_arena_members set rematch_ready = p_ready where arena_id = a.id and profile_id = uid;
  perform public.keep_battle_arena_finalize_rematch(a.id);
  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_state(p_arena_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; seats jsonb; board jsonb; current jsonb; me jsonb; queue_count integer; open_seats integer; cr public.keep_battle_arena_rounds%rowtype; round_winner jsonb; last_result jsonb; last_winner jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id; if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid) then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
  if a.status='ACTIVE' then
    select * into cr from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round;
    if found and cr.finalized_at is null and cr.closes_at<=now() then perform public.keep_battle_arena_finalize_round(a.id); end if;
    select * into cr from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round;
    if found and cr.finalized_at is not null and cr.reveal_until<=now() then perform public.keep_battle_arena_advance_after_reveal(a.id); end if;
    select * into a from public.keep_battle_arenas where id=p_arena_id;
  end if;
  if a.status='WAITING' and a.rematch_deadline is not null then
    perform public.keep_battle_arena_finalize_rematch(a.id);
    select * into a from public.keep_battle_arenas where id=p_arena_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'avatarUrl',x.avatar_url,'followers',x.followers,'favoriteGenres',x.favorite_genres,'favoriteArtists',x.favorite_artists,'score',x.score,'placement',x.placement,'isHost',x.profile_id=a.host_id) order by x.score desc,x.total_response_ms asc,x.joined_at asc),'[]'::jsonb) into seats
  from(select m.profile_id,p.username,p.avatar_url,p.favorite_genres,p.favorite_artists,m.score,m.placement,m.total_response_ms,m.joined_at,(select count(*) from public.follows f where f.followee_id=m.profile_id) followers from public.keep_battle_arena_members m join public.profiles p on p.id=m.profile_id where m.arena_id=a.id and m.seat_status='ACTIVE' order by m.score desc,m.total_response_ms asc,m.joined_at asc limit 10)x;
  select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'score',x.score,'placement',x.placement,'responseMs',x.total_response_ms) order by x.score desc,x.total_response_ms asc),'[]'::jsonb) into board
  from(select m.profile_id,p.username,m.score,m.placement,m.total_response_ms from public.keep_battle_arena_members m join public.profiles p on p.id=m.profile_id where m.arena_id=a.id and m.seat_status='ACTIVE' order by m.score desc,m.total_response_ms asc limit 10)x;
  select jsonb_build_object('profileId',m.profile_id,'status',m.seat_status,'score',m.score,'placement',m.placement,'rematchReady',m.rematch_ready) into me from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id=uid;
  select case when r.id is null then null else jsonb_build_object(
    'position',r.position,
    'title',case when r.finalized_at is not null then r.title_snapshot else null end,
    'artist',case when r.finalized_at is not null then r.artist_snapshot else null end,
    'releaseYear',case when r.finalized_at is not null then r.release_year_snapshot else null end,
    'artworkUrl',case when r.finalized_at is not null then r.artwork_url else null end,
    'previewUrl',r.preview_url,'choices',r.choices,'startedAt',r.started_at,'closesAt',r.closes_at,'revealUntil',r.reveal_until,'revealed',r.finalized_at is not null,
    'answered',ans.profile_id is not null,
    'myAnswer',case when ans.profile_id is null then null else jsonb_build_object('selectedAnswer',ans.selected_answer,'responseMs',ans.response_ms,'points',case when r.finalized_at is not null then ans.points else 0 end,'correct',case when r.finalized_at is not null then ans.is_correct else null end) end
  ) end into current
  from public.keep_battle_arena_rounds r left join public.keep_battle_arena_answers ans on ans.round_id=r.id and ans.profile_id=uid
  where r.arena_id=a.id and r.match_no=a.match_no and r.position=greatest(a.current_round,1);

  select case when z.profile_id is null then null else jsonb_build_object('profileId',z.profile_id,'username',p.username,'avatarUrl',p.avatar_url,'responseMs',z.response_ms) end into round_winner
  from public.keep_battle_arena_answers z join public.profiles p on p.id=z.profile_id join public.keep_battle_arena_rounds rr on rr.id=z.round_id
  where rr.arena_id=a.id and rr.match_no=a.match_no and rr.position=greatest(a.current_round,1) and rr.finalized_at is not null and z.is_correct=true
  order by z.response_ms asc,z.submitted_at asc limit 1;

  if a.match_no > 1 then
    select jsonb_build_object('matchNo',r.match_no,'placement',r.placement,'score',r.score,'correct',r.correct_predictions,'responseMs',r.total_response_ms,'creditDelta',coalesce(e.amount,0),'won',r.placement=1)
    into last_result
    from public.keep_battle_arena_match_results r left join public.keep_battle_arena_credit_events e on e.arena_id=r.arena_id and e.match_no=r.match_no and e.profile_id=r.profile_id
    where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=uid;

    select jsonb_build_object('profileId',r.profile_id,'username',p.username,'avatarUrl',p.avatar_url,'score',r.score,'responseMs',r.total_response_ms)
    into last_winner from public.keep_battle_arena_match_results r join public.profiles p on p.id=r.profile_id
    where r.arena_id=a.id and r.match_no=a.match_no-1 and r.placement=1 limit 1;
  end if;

  select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
  select greatest(0,a.max_players-count(*)) into open_seats from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'status',a.status,'maxPlayers',a.max_players,'openSeats',open_seats,'queue',queue_count,'roundCount',a.round_count,'matchNo',a.match_no,'currentRound',a.current_round,'roundDurationMs',a.round_duration_ms,'isHost',a.host_id=uid,'me',me,'seats',seats,'leaderboard',board,'round',current,'roundWinner',round_winner,'lastResult',last_result,'lastWinner',last_winner,'rematchDeadline',a.rematch_deadline);
end;
$function$;
