-- 01/10/2026 — VERROU PRODUIT : bonus multijoueur sans-faute au plus rapide uniquement.
--
-- Règle confirmée :
--   * jamais en Solo ;
--   * au moins 2 joueurs ;
--   * il faut N/N bonnes réponses ;
--   * s'il y a plusieurs N/N, UN SEUL bonus : total_response_ms le plus faible ;
--   * bonus système = mise Free réelle du format.
--
-- Cette migration est volontairement postérieure à 20261001005500 : si une
-- version précédente "ALL_PERFECT_PLAYERS" a déjà été appliquée en production,
-- elle est neutralisée pour tous les futurs matchs sans retirer aucun crédit
-- historique (ledger append-only).

drop trigger if exists keep_battle_all_perfect_bonuses on public.keep_battle_arenas;
drop function if exists public.keep_battle_apply_all_perfect_bonuses();

drop trigger if exists keep_battle_fastest_perfect_bonus on public.keep_battle_arenas;

-- Le vieux bonus 1v1 était injecté directement dans le résultat Arena.
-- On le coupe pour les FUTURS matchs : le ledger dédié ci-dessous devient la
-- seule source du bonus parfait, évitant 3 Free + 3 Free sur un duel 8/8.
update public.remote_config
set value='0'::jsonb,
    description='Clé legacy désactivée. Le bonus parfait est attribué par keep_battle_perfect_bonus_events au seul sans-faute le plus rapide, pour un montant égal à la mise.',
    updated_at=now()
where key='battle_duel_perfect_bonus_free';

create or replace function public.keep_battle_apply_fastest_perfect_bonus()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  participant_count integer:=0;
  bonus_winner uuid;
  bonus_response_ms integer:=0;
  bonus_username text:='Loki';
  bonus_free integer:=0;
begin
  if not (
    old.status='ACTIVE'
    and new.status='WAITING'
    and new.match_no=old.match_no+1
  ) then
    return new;
  end if;

  select count(*)::integer into participant_count
  from public.keep_battle_arena_match_results r
  where r.arena_id=old.id and r.match_no=old.match_no;

  if participant_count<2 then
    return new;
  end if;

  -- Une seule règle de départage : parmi les parfaits N/N, temps cumulé le
  -- plus court. placement/profile_id ne servent qu'à rendre une égalité
  -- milliseconde parfaitement déterministe.
  select r.profile_id,
         greatest(0,r.total_response_ms),
         coalesce(nullif(p.username,''),'Loki')
    into bonus_winner,bonus_response_ms,bonus_username
  from public.keep_battle_arena_match_results r
  left join public.profiles p on p.id=r.profile_id
  where r.arena_id=old.id
    and r.match_no=old.match_no
    and r.correct_predictions=old.round_count
  order by r.total_response_ms asc,r.placement asc,r.profile_id asc
  limit 1;

  if bonus_winner is null then
    return new;
  end if;

  -- Idempotence robuste quelle que soit la contrainte unique héritée
  -- (arena+match ou arena+match+profile) : un match ne peut recevoir qu'un
  -- nouvel événement parfait à partir de ce verrou.
  if exists(
    select 1
    from public.keep_battle_perfect_bonus_events b
    where b.arena_id=old.id and b.match_no=old.match_no
  ) then
    return new;
  end if;

  bonus_free:=public.keep_battle_stake_for_rounds(old.round_count);

  insert into public.keep_battle_perfect_bonus_events(
    arena_id,match_no,profile_id,round_count,response_ms,amount
  )
  values(
    old.id,old.match_no,bonus_winner,old.round_count,bonus_response_ms,bonus_free
  );

  insert into public.notifications(profile_id,type,title,body,data)
  values(
    bonus_winner,
    'BATTLE_PERFECT_BONUS',
    '✨ PERFECT · LE PLUS RAPIDE !',
    format(
      '%s/%s sans faute et meilleur temps parmi les parfaits : +%s Free bonus.',
      old.round_count,old.round_count,bonus_free
    ),
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

revoke all on function public.keep_battle_apply_fastest_perfect_bonus()
from public,anon,authenticated;

create trigger keep_battle_fastest_perfect_bonus
after update of status,match_no on public.keep_battle_arenas
for each row
execute function public.keep_battle_apply_fastest_perfect_bonus();

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
    (select (value #>> '{}')::integer
       from public.remote_config
      where key='battle_arena_max_players'
      limit 1),
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
      'Bonnes réponses puis vitesse. Sans-faute : s’il y a plusieurs joueurs parfaits, seul le plus rapide reçoit le bonus Loki de +%s Free, égal à la mise.',
      stake
    )
  );
end;
$function$;

revoke all on function public.keep_battle_arena_rules(integer) from public;
grant execute on function public.keep_battle_arena_rules(integer) to anon,authenticated;
