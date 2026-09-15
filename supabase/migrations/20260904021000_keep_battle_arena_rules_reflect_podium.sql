-- Adel (04/09/2026) : "oublie pas de rajouter aussi dans les offres de bien
-- expliquer les règles pour les Battle" -- keep_battle_arena_rules
-- décrivait encore "un seul gagnant, chaque perdant transfère sa mise au
-- vainqueur" (winner-takes-all), alors que le podium à 2 places existe
-- déjà depuis 20260904007000_keep_battle_arena_group_podium_payout pour
-- les Battle à 3 joueurs et plus. Corrige la description ET expose le
-- vrai pourcentage configuré (battle_arena_payout_share_rank1) pour que
-- l'écran Offres n'affiche plus jamais une règle fausse.
create or replace function public.keep_battle_arena_rules()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  stake integer := 3;
  max_players integer := 10;
  share1 integer := 65;
  pool_at_full integer;
  winner_gain_at_full integer;
begin
  stake := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1), 3));
  max_players := least(10, greatest(2, coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_max_players' limit 1), 10)));
  share1 := greatest(1, least(99, coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_payout_share_rank1' limit 1), 65)));
  pool_at_full := stake * greatest(0, max_players - 2);
  winner_gain_at_full := case when max_players >= 3 then round(pool_at_full * share1 / 100.0)::integer else stake * (max_players - 1) end;
  return jsonb_build_object(
    'stakeFree', stake, 'minimumFreeRequired', stake, 'maxPlayers', max_players, 'singleWinner', false,
    'answerLockedOnTap', true, 'ranking', 'CORRECT_ANSWERS_THEN_SPEED', 'fullArenaNetPrize', winner_gain_at_full,
    'payoutShareRank1', share1,
    'ruleText', format(
      'Il faut au moins %s Free pour entrer. À 2 joueurs : le vainqueur remporte la mise de l’adversaire. À 3 joueurs et plus : le 1er et le 2e se partagent la mise de tous ceux classés 3e et plus (%s%% / %s%%).',
      stake, share1, 100 - share1
    )
  );
end;
$function$;
