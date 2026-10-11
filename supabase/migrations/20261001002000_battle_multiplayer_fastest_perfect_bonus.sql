-- 01/10/2026 — Bonus SANS-FAUTE multijoueur.
--
-- Règle produit :
--   * uniquement Battle Arena (jamais Solo) ;
--   * au moins 2 participants ;
--   * score parfait : correct_predictions = round_count ;
--   * s'il y a plusieurs sans-faute, un seul bonus système : le plus rapide
--     au temps cumulé total_response_ms ;
--   * bonus = mise réelle du pack (8=>3, 15=>6, 20=>8, 30=>12 Free).
--
-- La production possédait déjà un bonus "duel parfait" limité au gagnant
-- d'un 1v1. Ce trigger normalise le résultat FINAL après le règlement de la
-- cagnotte : il évite tout double bonus en 1v1 et étend la règle à 3..10
-- joueurs sans réécrire la fonction de règlement winner-takes-all.

create or replace function public.keep_battle_apply_fastest_perfect_bonus()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  participant_count integer := 0;
  bonus_winner uuid;
  match_winner uuid;
  bonus_free integer := 0;
  bonus_response_ms integer := 0;
  bonus_username text := 'Loki';
  base_pool integer := 0;
  held_stake integer := 0;
  desired_amount integer := 0;
begin
  if not (
    old.status = 'ACTIVE'
    and new.status = 'WAITING'
    and new.match_no = old.match_no + 1
  ) then
    return new;
  end if;

  select count(*)::integer
    into participant_count
  from public.keep_battle_arena_match_results r
  where r.arena_id = old.id
    and r.match_no = old.match_no;

  if participant_count < 2 then
    return new;
  end if;

  select r.profile_id,
         r.total_response_ms,
         coalesce(nullif(p.username,''),'Loki')
    into bonus_winner, bonus_response_ms, bonus_username
  from public.keep_battle_arena_match_results r
  left join public.profiles p on p.id = r.profile_id
  where r.arena_id = old.id
    and r.match_no = old.match_no
    and r.correct_predictions = old.round_count
  order by r.total_response_ms asc, r.placement asc, r.profile_id asc
  limit 1;

  if bonus_winner is null then
    return new;
  end if;

  bonus_free := public.keep_battle_stake_for_rounds(old.round_count);

  select r.profile_id
    into match_winner
  from public.keep_battle_arena_match_results r
  where r.arena_id = old.id
    and r.match_no = old.match_no
  order by r.placement asc
  limit 1;

  if bonus_winner = match_winner then
    -- Cagnotte normale = somme des pertes des autres joueurs.
    -- On fixe le montant final à cagnotte + bonus, ce qui neutralise
    -- proprement l'ancien bonus duel déjà présent en production.
    select coalesce(-sum(e.amount) filter (where e.amount < 0), 0)::integer
      into base_pool
    from public.keep_battle_arena_credit_events e
    where e.arena_id = old.id
      and e.match_no = old.match_no;

    desired_amount := base_pool + bonus_free;
  else
    -- Le sans-faute le plus rapide peut ne pas être premier au classement
    -- global (score vitesse). Son bonus système compense sa mise normale.
    select coalesce(max(h.amount), bonus_free)::integer
      into held_stake
    from public.keep_battle_arena_credit_holds h
    where h.arena_id = old.id
      and h.match_no = old.match_no
      and h.profile_id = bonus_winner;

    desired_amount := -greatest(0, held_stake) + bonus_free;
  end if;

  insert into public.keep_battle_arena_credit_events(
    arena_id, match_no, profile_id, result, amount
  )
  values(
    old.id,
    old.match_no,
    bonus_winner,
    case when desired_amount > 0 then 'WIN' else 'LOSS' end,
    desired_amount
  )
  on conflict(arena_id,match_no,profile_id) do update
    set amount = excluded.amount,
        result = excluded.result;

  insert into public.notifications(profile_id,type,title,body,data)
  values(
    bonus_winner,
    'BATTLE_PERFECT_BONUS',
    '✨ SANS-FAUTE · BONUS !',
    format('%s/%s et le plus rapide des sans-faute : +%s Free bonus.', old.round_count, old.round_count, bonus_free),
    jsonb_build_object(
      'arenaId', old.id,
      'matchNo', old.match_no,
      'perfectScore', old.round_count,
      'perfectBonusFree', bonus_free,
      'perfectBonusWinnerId', bonus_winner,
      'perfectBonusWinnerUsername', bonus_username,
      'responseMs', bonus_response_ms,
      'rule', 'FASTEST_PERFECT_ONLY'
    )
  );

  return new;
end;
$function$;

revoke all on function public.keep_battle_apply_fastest_perfect_bonus() from public, anon, authenticated;

drop trigger if exists keep_battle_fastest_perfect_bonus on public.keep_battle_arenas;
create trigger keep_battle_fastest_perfect_bonus
after update of status, match_no on public.keep_battle_arenas
for each row
execute function public.keep_battle_apply_fastest_perfect_bonus();

update public.remote_config
set description = 'Ancienne clé bonus duel. Le bonus SANS-FAUTE multijoueur est désormais calculé automatiquement selon la mise réelle du pack et attribué uniquement au sans-faute le plus rapide.',
    updated_at = now()
where key = 'battle_duel_perfect_bonus_free';
