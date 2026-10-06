-- 01/10/2026 — verrou produit : UN SEUL bonus sans-faute par Battle.
-- Si plusieurs joueurs font N/N, le bonus revient au plus rapide au temps
-- cumulé de réponse. Jamais ALL_PERFECT_PLAYERS.

create or replace function public.keep_battle_apply_fastest_perfect_bonus()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  participant_count integer := 0;
  bonus_winner uuid;
  bonus_response_ms integer := 0;
  bonus_username text := 'Loki';
  bonus_free integer := 0;
  inserted_count integer := 0;
begin
  if not (old.status='ACTIVE' and new.status='WAITING' and new.match_no=old.match_no+1) then
    return new;
  end if;

  select count(*)::integer into participant_count
  from public.keep_battle_arena_match_results r
  where r.arena_id=old.id and r.match_no=old.match_no;

  if participant_count<2 then return new; end if;

  select r.profile_id,r.total_response_ms,coalesce(nullif(p.username,''),'Loki')
    into bonus_winner,bonus_response_ms,bonus_username
  from public.keep_battle_arena_match_results r
  left join public.profiles p on p.id=r.profile_id
  where r.arena_id=old.id
    and r.match_no=old.match_no
    and r.correct_predictions=old.round_count
  order by r.total_response_ms asc,r.placement asc,r.profile_id asc
  limit 1;

  if bonus_winner is null then return new; end if;

  bonus_free:=public.keep_battle_stake_for_rounds(old.round_count);

  insert into public.keep_battle_perfect_bonus_events(
    arena_id,match_no,profile_id,round_count,response_ms,amount
  )
  values(
    old.id,old.match_no,bonus_winner,old.round_count,bonus_response_ms,bonus_free
  )
  on conflict(arena_id,match_no) do nothing;

  get diagnostics inserted_count=row_count;
  if inserted_count=0 then return new; end if;

  insert into public.notifications(profile_id,type,title,body,data)
  values(
    bonus_winner,
    'BATTLE_PERFECT_BONUS',
    '✨ SANS-FAUTE · LE PLUS RAPIDE !',
    format('%s/%s et le plus rapide des sans-faute : +%s Free bonus.',old.round_count,old.round_count,bonus_free),
    jsonb_build_object(
      'arenaId',old.id,
      'matchNo',old.match_no,
      'perfectScore',old.round_count,
      'perfectBonusFree',bonus_free,
      'perfectBonusWinnerId',bonus_winner,
      'perfectBonusWinnerUsername',bonus_username,
      'responseMs',bonus_response_ms,
      'rule','FASTEST_PERFECT_ONLY'
    )
  );
  return new;
end;
$function$;

revoke all on function public.keep_battle_apply_fastest_perfect_bonus() from public,anon,authenticated;

create or replace function public.keep_battle_arena_rules(p_round_count integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  stake integer:=3;
  max_players integer:=10;
  full_pool integer:=0;
begin
  stake:=public.keep_battle_stake_for_rounds(p_round_count);
  max_players:=least(10,greatest(2,coalesce(
    (select (value #>> '{}')::integer from public.remote_config where key='battle_arena_max_players' limit 1),
    10
  )));
  full_pool:=stake*greatest(0,max_players-1);
  return jsonb_build_object(
    'stakeFree',stake,
    'minimumFreeRequired',stake,
    'maxPlayers',max_players,
    'singleWinner',true,
    'answerLockedOnTap',true,
    'ranking','CORRECT_ANSWERS_THEN_SPEED',
    'fullArenaNetPrize',full_pool,
    'perfectScoreBonusFree',stake,
    'perfectDuelBonusFree',stake,
    'perfectBonusRule','FASTEST_PERFECT_ONLY',
    'ruleText',format(
      'Bonnes réponses puis vitesse. Le 1er remporte la cagnotte. Sans-faute : s’il y a plusieurs joueurs parfaits, seul le plus rapide reçoit le bonus Loki de +%s Free, égal à la mise.',
      stake
    )
  );
end;
$function$;
