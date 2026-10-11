-- Expose the configurable perfect-duel platform bonus to the mobile offers/rules UI.
create or replace function public.keep_battle_arena_rules(p_round_count integer default 8)
returns jsonb language plpgsql stable security definer set search_path='public' as $function$
declare
  stake integer:=3; max_players integer:=10; share1 integer:=65; pool_at_full integer; winner_gain_at_full integer; perfect_bonus integer:=3;
begin
  stake:=public.keep_battle_stake_for_rounds(p_round_count);
  max_players:=least(10,greatest(2,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_max_players' limit 1),10)));
  share1:=greatest(1,least(99,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_payout_share_rank1' limit 1),65)));
  perfect_bonus:=greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_duel_perfect_bonus_free' limit 1),3));
  pool_at_full:=stake*greatest(0,max_players-2);
  winner_gain_at_full:=case when max_players>=3 then round(pool_at_full*share1/100.0)::integer else stake*(max_players-1) end;
  return jsonb_build_object(
    'stakeFree',stake,'minimumFreeRequired',stake,'maxPlayers',max_players,'singleWinner',false,
    'answerLockedOnTap',true,'ranking','CORRECT_ANSWERS_THEN_SPEED','fullArenaNetPrize',winner_gain_at_full,
    'payoutShareRank1',share1,'perfectDuelBonusFree',perfect_bonus,
    'ruleText',format('Il faut au moins %s Free pour entrer avec ce nombre de morceaux. À 2 joueurs : le vainqueur remporte la mise de l’adversaire. S’il fait un sans-faute, Loki lui offre +%s Free. À 3 joueurs et plus : le 1er et le 2e se partagent la mise de tous ceux classés 3e et plus (%s%% / %s%%).',stake,perfect_bonus,share1,100-share1)
  );
end;$function$;
revoke all on function public.keep_battle_arena_rules(integer) from public;
grant execute on function public.keep_battle_arena_rules(integer) to anon,authenticated;