-- 01/10/2026 — correction append-only du bonus SANS-FAUTE multijoueur.
--
-- La migration précédente a installé la règle de sélection, mais écrivait le
-- bonus en modifiant keep_battle_arena_credit_events, ledger historique
-- append-only. On ne modifie jamais un résultat financier déjà écrit.
--
-- Cette version :
--   1. retire le trigger précédent ;
--   2. crée un ledger BONUS séparé, append-only ;
--   3. crédite un seul sans-faute : le plus rapide ;
--   4. ajoute ce ledger au total des Free via le helper de grants existant ;
--   5. ne touche à aucun résultat Battle historique.

drop trigger if exists keep_battle_fastest_perfect_bonus on public.keep_battle_arenas;
drop function if exists public.keep_battle_apply_fastest_perfect_bonus();

create table if not exists public.keep_battle_perfect_bonus_events (
  id uuid primary key default gen_random_uuid(),
  arena_id uuid not null references public.keep_battle_arenas(id) on delete cascade,
  match_no integer not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  round_count integer not null check (round_count > 0),
  response_ms integer not null check (response_ms >= 0),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (arena_id, match_no)
);

create index if not exists keep_battle_perfect_bonus_profile_idx
  on public.keep_battle_perfect_bonus_events(profile_id, created_at desc);

alter table public.keep_battle_perfect_bonus_events enable row level security;
drop policy if exists "keep_battle_perfect_bonus_read_own" on public.keep_battle_perfect_bonus_events;
create policy "keep_battle_perfect_bonus_read_own"
  on public.keep_battle_perfect_bonus_events
  for select
  to authenticated
  using ((select auth.uid()) = profile_id);

revoke all on public.keep_battle_perfect_bonus_events from public, anon;
grant select on public.keep_battle_perfect_bonus_events to authenticated;

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

  insert into public.keep_battle_perfect_bonus_events(
    arena_id, match_no, profile_id, round_count, response_ms, amount
  )
  values(
    old.id, old.match_no, bonus_winner, old.round_count, bonus_response_ms, bonus_free
  )
  on conflict(arena_id, match_no) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return new;
  end if;

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

create trigger keep_battle_fastest_perfect_bonus
after update of status, match_no on public.keep_battle_arenas
for each row
execute function public.keep_battle_apply_fastest_perfect_bonus();

-- Le calcul global des Free appelle déjà ce helper. On lui ajoute simplement
-- le nouveau ledger bonus : aucun UPDATE d'un solde ni d'un ancien événement.
create or replace function public.keep_admin_credit_grant_total_for_profile(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    coalesce((select sum(g.amount)::integer from public.admin_credit_grants g where g.profile_id = p_uid),0)
    +
    coalesce((select sum(b.amount)::integer from public.keep_battle_perfect_bonus_events b where b.profile_id = p_uid),0);
$function$;
