-- Adel (02/09/2026) : "il faut mettre d'un côté les gagnants d'un côté les
-- perdants le nombre de secondes en tout petit ... pas besoin de mettre des
-- photos, tu peux juste mettre les trophées ... ça va t'inspirer TikTok pour
-- les matchs" -- l'écran de fin de match n'exposait que MON propre résultat
-- (lastResult) et le SEUL vainqueur (lastWinner), jamais le classement complet
-- de tous les participants du match qui vient de se terminer. Ajoute
-- lastMatchResults : tous les participants du match précédent, classés.
create or replace function public.keep_battle_arena_state(p_arena_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; seats jsonb; board jsonb; current jsonb; me jsonb; queue_count integer; open_seats integer; cr public.keep_battle_arena_rounds%rowtype; round_winner jsonb; last_result jsonb; last_winner jsonb; last_match_results jsonb;
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

    select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'placement',x.placement,'score',x.score,'correct',x.correct_predictions,'responseMs',x.total_response_ms,'won',x.placement=1) order by x.placement asc),'[]'::jsonb)
    into last_match_results
    from(select r.profile_id,p.username,r.placement,r.score,r.correct_predictions,r.total_response_ms from public.keep_battle_arena_match_results r join public.profiles p on p.id=r.profile_id where r.arena_id=a.id and r.match_no=a.match_no-1)x;
  end if;

  select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
  select greatest(0,a.max_players-count(*)) into open_seats from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
  return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'status',a.status,'maxPlayers',a.max_players,'openSeats',open_seats,'queue',queue_count,'roundCount',a.round_count,'matchNo',a.match_no,'currentRound',a.current_round,'roundDurationMs',a.round_duration_ms,'isHost',a.host_id=uid,'me',me,'seats',seats,'leaderboard',board,'round',current,'roundWinner',round_winner,'lastResult',last_result,'lastWinner',last_winner,'lastMatchResults',coalesce(last_match_results,'[]'::jsonb),'rematchDeadline',a.rematch_deadline);
end;
$function$;
