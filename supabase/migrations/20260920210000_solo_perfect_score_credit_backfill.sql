-- Rattrapage GÉNÉRAL : crédite tout score SOLO parfait (correct_answers =
-- round_count) qui n'a jamais reçu son événement dans
-- keep_battle_solo_credit_events -- quelle que soit la cause (le bug de
-- conflit de schéma déjà corrigé le 19/09 dans 20260919001000, ou toute
-- autre panne silencieuse passée). Demande Adel (20/09/2026) suite au
-- signalement d'un solde qui n'augmentait pas malgré le message "Tu as
-- gagné 3 Free" : vérifier TOUS les utilisateurs concernés, pas seulement
-- le cas déjà traité manuellement.
--
-- Idempotent : rejouable sans risque, `on conflict (history_id,
-- profile_id) do nothing` empêche tout double crédit sur la même partie,
-- et une ré-exécution ne trouve simplement plus rien à rattraper.
--
-- IMPORTANT : floadelissa (d15ba595-350b-4bbe-b594-e45adbecd71a) et Teyou
-- (fb655bf8-0da2-4b95-b7b4-46fb4ab7952d) ont déjà été compensés
-- manuellement le 19/09 via admin_credit_grants (20260919110000) pour
-- leurs parties du 18-19/09 -- explicitement exclus ci-dessous pour cette
-- fenêtre précise afin de ne jamais les payer deux fois pour les mêmes
-- parties. Leurs éventuelles parties parfaites en dehors de cette fenêtre
-- restent couvertes normalement.

create temporary table _solo_backfill (
  history_id uuid,
  profile_id uuid,
  round_count integer,
  amount integer
) on commit drop;

insert into _solo_backfill (history_id, profile_id, round_count, amount)
select
  h.id,
  h.profile_id,
  h.round_count,
  case
    when h.round_count <= 8 then 3
    when h.round_count <= 15 then 6
    when h.round_count <= 20 then 8
    else 12
  end
from public.keep_battle_solo_history h
where h.correct_answers = h.round_count
  and h.round_count > 0
  and not exists (
    select 1 from public.keep_battle_solo_credit_events e where e.history_id = h.id
  )
  and not (
    h.profile_id in ('d15ba595-350b-4bbe-b594-e45adbecd71a', 'fb655bf8-0da2-4b95-b7b4-46fb4ab7952d')
    and h.completed_at < '2026-09-19T00:10:00Z'
  );

-- Crédit réel, via le MÊME ledger que le flux de jeu normal (pas
-- admin_credit_grants) : les parties rattrapées apparaissent donc
-- correctement dans l'historique "parties récentes" de l'utilisateur.
insert into public.keep_battle_solo_credit_events(history_id, profile_id, result, amount)
select history_id, profile_id, 'WIN', amount from _solo_backfill
on conflict (history_id, profile_id) do nothing;

-- Une seule notification groupée par utilisateur affecté (total rattrapé,
-- pas une notification par partie manquée).
insert into public.notifications (profile_id, type, title, body, data, push_delivery_status, push_attempt_count)
select
  profile_id,
  'SOLO_BUG_FIX',
  '🎁 Rattrapage SOLO parfait — ' || sum(amount) || ' Free',
  'On a retrouvé ' || count(*) || ' partie(s) SOLO parfaite(s) qui n''avaient pas été créditées. On vient de t''ajouter ' || sum(amount) || ' Free au total. Désolé du désagrément !',
  jsonb_build_object('event', 'SOLO_BUG_BACKFILL', 'free_credited', sum(amount), 'games_count', count(*)),
  'pending',
  0
from _solo_backfill
group by profile_id;

-- Vérification : liste exacte de ce que ce script vient de rattraper.
select p.username, b.round_count, b.amount
from _solo_backfill b
join public.profiles p on p.id = b.profile_id
order by p.username;
