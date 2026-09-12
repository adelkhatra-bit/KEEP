-- Bug systémique trouvé en auditant "pourquoi @inside n'est plus disponible"
-- / "tu ne fais plus partie de ce groupe" : rien ne libère jamais le siège
-- ACTIVE ni la mise LOCKED d'un lobby WAITING abandonné (onglet fermé, appli
-- quittée sans bouton "quitter" -- normal en test web). keep_theoretical_
-- free_credit_remaining_for_profile soustrait TOUTE mise LOCKED, pour
-- toujours, peu importe l'ancienneté. adel4A avait 5 lobbies fantômes
-- ACTIVE avec mise verrouillée -> 15 Free bloqués en permanence -> la
-- relocalisation automatique de mise à la revanche suivante échouait par
-- manque de crédit "réel", et le gagnant se faisait éliminer de son propre
-- match juste après l'avoir gagné.
--
-- Corrigé en 2 temps :
-- 1) auto-nettoyage : quand un profil a un AUTRE siège ACTIVE dans un lobby
--    WAITING resté inactif plus de 20 minutes, on le libère (mise réglée
--    sans pénalité -- ce n'est pas un abandon en cours de partie, juste un
--    lobby mort) avant de continuer. Appelé au moment le plus fréquent
--    (lecture d'état d'arène + envoi d'invite), donc auto-guérison rapide
--    tant qu'au moins un des deux joueurs rouvre Battle.
-- 2) nettoyage immédiat des lobbies déjà bloqués pour ne pas attendre 20
--    minutes sur les comptes de test actuels.
create or replace function public.keep_battle_arena_release_stale_seats(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare stale record;
begin
  if p_profile_id is null then return; end if;
  for stale in
    select m.arena_id, a.match_no
    from public.keep_battle_arena_members m
    join public.keep_battle_arenas a on a.id = m.arena_id
    where m.profile_id = p_profile_id and m.seat_status = 'ACTIVE'
      and a.status = 'WAITING' and a.updated_at < now() - interval '20 minutes'
  loop
    update public.keep_battle_arena_credit_holds
    set status = 'SETTLED', settled_at = now()
    where arena_id = stale.arena_id and profile_id = p_profile_id and status = 'LOCKED';
    update public.keep_battle_arena_members
    set seat_status = 'ELIMINATED'
    where arena_id = stale.arena_id and profile_id = p_profile_id;
  end loop;
end;
$function$;

create or replace function public.keep_battle_arena_state(p_arena_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; seats jsonb; board jsonb; current jsonb; me jsonb; queue_count integer; open_seats integer; cr public.keep_battle_arena_rounds%rowtype; round_winner jsonb; last_result jsonb; last_winner jsonb; last_match_results jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.keep_battle_arena_release_stale_seats(uid);
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

    select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'placement',x.placement,'score',x.score,'correct',x.correct_predictions,'responseMs',x.total_response_ms,'won',x.placement=1) order by x.placement asc),'[]'::jsonb)
    into last_match_results
    from(select r.profile_id,p.username,r.placement,r.score,r.correct_predictions,r.total_response_ms from public.keep_battle_arena_match_results r join public.profiles p on p.id=r.profile_id where r.arena_id=a.id and r.match_no=a.match_no-1)x;
  end if;

  select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
  select greatest(0,a.max_players-count(*)) into open_seats from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'status',a.status,'maxPlayers',a.max_players,'openSeats',open_seats,'queue',queue_count,'roundCount',a.round_count,'matchNo',a.match_no,'currentRound',a.current_round,'roundDurationMs',a.round_duration_ms,'isHost',a.host_id=uid,'me',me,'seats',seats,'leaderboard',board,'round',current,'roundWinner',round_winner,'lastResult',last_result,'lastWinner',last_winner,'lastMatchResults',coalesce(last_match_results,'[]'::jsonb),'rematchDeadline',a.rematch_deadline);
end;
$function$;

-- Nettoyage immédiat des lobbies déjà fantômes (comptes de test actuels),
-- pour ne pas attendre 20 minutes sur les mises déjà bloquées trouvées en audit.
do $$
declare victim record;
begin
  for victim in select distinct profile_id from public.keep_battle_arena_members where seat_status='ACTIVE'
  loop
    perform public.keep_battle_arena_release_stale_seats(victim.profile_id);
  end loop;
end $$;
