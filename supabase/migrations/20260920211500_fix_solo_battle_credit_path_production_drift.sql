-- CRITIQUE (Adel, 20/09/2026, signalement "41 -> +3 -> 41" sur un score
-- parfait SOLO Battle) : vérification en direct sur la base réelle a
-- révélé que la cause n'était PAS un simple message client trompeur, mais
-- une dérive totale entre Git et la production sur ce chemin précis :
--
--   - public.keep_battle_solo_record_completion (RPC appelée par le
--     client à chaque fin de partie) N'EXISTE PAS EN BASE. La migration
--     20260919001000 qui était censée l'avoir (re)créée n'a en réalité
--     jamais été appliquée en production.
--   - public.keep_battle_solo_history a un schéma différent de celui
--     versionné : colonne `correct_count` au lieu de `correct_answers`,
--     colonnes free_before/free_earned/free_after absentes.
--   - public.keep_battle_solo_report_result est encore l'ANCIENNE version
--     (crédit partiel proportionnel, ex: 7/8 -> 2 Free) et pas le
--     correctif "score parfait uniquement" de 20260919001000.
--   - public.keep_battle_solo_history_recent (écran historique) N'EXISTE
--     PAS non plus.
--   - keep_battle_solo_history ET keep_battle_solo_credit_events
--     contiennent 0 ligne, TOTAL, depuis toujours : aucune partie SOLO
--     n'a donc jamais été enregistrée ni créditée en production, quel que
--     soit le score. Le message "Tu as gagné X Free" que voyaient les
--     joueurs reposait uniquement sur le calcul local -- rien ne
--     s'écrivait jamais côté serveur.
--
-- keep_battle_solo_history étant vide (0 ligne), cette migration
-- l'altère sans aucun risque de perte de données.
--
-- Conséquence pour la restitution des Free déjà dus : comme AUCUNE ligne
-- d'historique de partie n'a jamais été écrite, il n'existe nulle part de
-- trace exploitable pour reconstruire, partie par partie, qui a fait un
-- score parfait et quand -- contrairement à la compensation manuelle du
-- 19/09 (Flo/Teyou), estimée depuis keep_battle_skill_stats (taux de
-- réussite cumulé, pas un score par partie). Une compensation générale
-- précise n'est donc pas techniquement reconstructible depuis la base ;
-- seule une estimation par profil via keep_battle_skill_stats
-- (solo_correct/solo_total) reste possible, au même titre que ce qui a
-- déjà été fait pour Flo/Teyou.

-- 1) Aligner keep_battle_solo_history sur le schéma prévu (safe, table vide).
alter table public.keep_battle_solo_history rename column correct_count to correct_answers;
alter table public.keep_battle_solo_history add column if not exists free_before bigint not null default 0;
alter table public.keep_battle_solo_history add column if not exists free_earned integer not null default 0;
alter table public.keep_battle_solo_history add column if not exists free_after bigint not null default 0;
alter table public.keep_battle_solo_history alter column free_before drop default;
alter table public.keep_battle_solo_history alter column free_earned drop default;
alter table public.keep_battle_solo_history alter column free_after drop default;

-- 2) RLS : les policies attendues étaient absentes (RLS activé, 0 policy
-- = accès refusé à tout le monde y compris via SELECT direct).
drop policy if exists keep_battle_solo_history_select on public.keep_battle_solo_history;
create policy keep_battle_solo_history_select on public.keep_battle_solo_history
for select using (profile_id = auth.uid());

drop policy if exists keep_battle_solo_history_insert on public.keep_battle_solo_history;
create policy keep_battle_solo_history_insert on public.keep_battle_solo_history
for insert with check (profile_id = auth.uid());

create index if not exists idx_keep_battle_solo_history_profile_completed
on public.keep_battle_solo_history(profile_id, completed_at desc);

drop policy if exists keep_battle_solo_credit_events_select on public.keep_battle_solo_credit_events;
create policy keep_battle_solo_credit_events_select on public.keep_battle_solo_credit_events
for select using (profile_id = auth.uid());

-- 3) Recréer la RPC manquante qui enregistre l'historique (appelée par
-- KeepBattleMobileGameV3.tsx à chaque fin de partie SOLO -- échouait
-- silencieusement en "function does not exist" jusqu'ici).
create or replace function public.keep_battle_solo_record_completion(
  p_theme_code text,
  p_round_count integer,
  p_correct_answers integer,
  p_free_before bigint,
  p_free_earned integer,
  p_free_after bigint
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  insert into public.keep_battle_solo_history (
    profile_id, theme_code, round_count, correct_answers,
    free_before, free_earned, free_after, completed_at
  ) values (
    uid,
    coalesce(nullif(trim(p_theme_code), ''), 'MIX'),
    greatest(5, least(p_round_count, 30)),
    greatest(0, least(p_correct_answers, p_round_count)),
    greatest(0, p_free_before),
    greatest(0, p_free_earned),
    greatest(0, p_free_after),
    now()
  );
end;
$function$;
grant execute on function public.keep_battle_solo_record_completion(text, integer, integer, bigint, integer, bigint) to authenticated;

-- 4) Recréer la RPC manquante utilisée par l'écran d'historique SOLO
-- (packages/mobile/src/services/keepBattleHistoryService.ts).
create or replace function public.keep_battle_solo_history_recent(p_limit integer default 50)
returns table (
  id uuid,
  theme_code text,
  round_count integer,
  correct_answers integer,
  free_before bigint,
  free_earned integer,
  free_after bigint,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select h.id, h.theme_code, h.round_count, h.correct_answers, h.free_before, h.free_earned, h.free_after, h.completed_at
  from public.keep_battle_solo_history h
  where h.profile_id = auth.uid()
  order by h.completed_at desc
  limit greatest(5, least(p_limit, 100));
$function$;
grant execute on function public.keep_battle_solo_history_recent(integer) to authenticated;

-- 5) Remplacer la version obsolète (crédit partiel) par la règle
-- "score parfait uniquement" déjà décidée par Adel le 19/09. Réutilise
-- keep_battle_solo_max_reward_for_round_count (déjà en place en
-- production, barème identique : 3/6/8/12).
create or replace function public.keep_battle_solo_report_result(p_correct integer, p_total integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  total integer;
  correct integer;
  free_earned integer;
  max_reward integer;
  matched_history_id uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_total is null or p_total <= 0 then return; end if;

  total := least(p_total, 30);
  correct := least(greatest(0, coalesce(p_correct, 0)), total);

  insert into public.keep_battle_skill_stats(profile_id, solo_correct, solo_total, updated_at)
  values (uid, correct, total, now())
  on conflict (profile_id) do update set
    solo_correct = keep_battle_skill_stats.solo_correct + correct,
    solo_total = keep_battle_skill_stats.solo_total + total,
    updated_at = now();

  max_reward := public.keep_battle_solo_max_reward_for_round_count(total);
  -- Adel (19/09/2026) : seul un score parfait donne droit à des Free.
  free_earned := case when correct = total then max_reward else 0 end;

  select h.id into matched_history_id from public.keep_battle_solo_history h
  where h.profile_id = uid
    and h.completed_at >= now() - interval '5 minutes'
  order by h.completed_at desc
  limit 1;

  if matched_history_id is not null and free_earned > 0 then
    insert into public.keep_battle_solo_credit_events(history_id, profile_id, result, amount)
    values (matched_history_id, uid, 'WIN', free_earned)
    on conflict (history_id, profile_id) do nothing;
  end if;
end;
$function$;
grant execute on function public.keep_battle_solo_report_result(integer, integer) to authenticated;

-- Vérification : les 2 RPC critiques existent maintenant réellement.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('keep_battle_solo_record_completion', 'keep_battle_solo_history_recent', 'keep_battle_solo_report_result')
order by proname;
