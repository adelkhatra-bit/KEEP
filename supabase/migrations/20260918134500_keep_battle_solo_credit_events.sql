-- AUDIT CRITIQUE (18/09/2026) : Adel a remarqué que les SOLO gagnés ne
-- sont jamais crédités. keep_battle_solo_report_result n'actualise que
-- keep_battle_skill_stats, jamais aucun crédit. Résultat : 48 victoires SOLO
-- mais zéro Free gagnés affichés. Solution: table keep_battle_solo_history
-- pour historiser les SOLO complétés, puis keep_battle_solo_credit_events
-- pour tracker les Free gagnés/perdus, exactement comme ARENA et duels.

-- Table d'historique des SOLO complétés (tracking et réconciliation)
create table if not exists public.keep_battle_solo_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  round_count integer not null check (round_count >= 5 and round_count <= 30),
  theme_code text not null,
  correct_count integer not null check (correct_count >= 0),
  completed_at timestamptz not null default now(),
  unique(profile_id, completed_at)
);

create index if not exists idx_keep_battle_solo_history_profile_completed
  on public.keep_battle_solo_history(profile_id, completed_at desc);

alter table public.keep_battle_solo_history enable row level security;
revoke all on public.keep_battle_solo_history from anon, authenticated;

-- Événements de crédit SOLO (gains et pertes)
create table if not exists public.keep_battle_solo_credit_events (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.keep_battle_solo_history(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  result text not null check (result in ('WIN','LOSS')),
  amount integer not null check (amount <> 0),
  created_at timestamptz not null default now(),
  unique (history_id, profile_id)
);

create index if not exists idx_keep_battle_solo_credit_events_profile_created
  on public.keep_battle_solo_credit_events(profile_id, created_at desc);

alter table public.keep_battle_solo_credit_events enable row level security;
revoke all on public.keep_battle_solo_credit_events from anon, authenticated;

-- Helper: max Free reward for SOLO pack size
-- 8 questions → 3 Free max
-- 15 questions → 6 Free max
-- 20 questions → 8 Free max
-- 30 questions → 12 Free max
create or replace function public.keep_battle_solo_max_reward_for_round_count(p_round_count integer)
returns integer
language sql
immutable
as $$
  select case
    when p_round_count is null or p_round_count <= 0 then 0
    when p_round_count <= 8 then 3
    when p_round_count <= 15 then 6
    when p_round_count <= 20 then 8
    else 12
  end;
$$;

-- Update keep_battle_solo_report_result() to credit users based on score
-- Formula: Free earned = floor(correct_answers / total * max_reward_for_pack_size)
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
  history_record record;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_total is null or p_total <= 0 then return; end if;

  total := least(p_total, 30);
  correct := least(greatest(0, coalesce(p_correct, 0)), total);

  -- Update skill stats as before
  insert into public.keep_battle_skill_stats(profile_id, solo_correct, solo_total, updated_at)
  values (uid, correct, total, now())
  on conflict (profile_id) do update set
    solo_correct = keep_battle_skill_stats.solo_correct + correct,
    solo_total = keep_battle_skill_stats.solo_total + total,
    updated_at = now();

  -- Get max reward for this pack size, then calculate earned based on correctness
  max_reward := public.keep_battle_solo_max_reward_for_round_count(total);
  free_earned := floor(correct::numeric / total * max_reward)::integer;

  -- Find the most recent uncredited SOLO match for this user
  select h.id into history_record.id from public.keep_battle_solo_history h
  where h.profile_id = uid
    and h.completed_at >= now() - interval '5 minutes'
  order by h.completed_at desc
  limit 1;

  -- If we found a recent match and free_earned is positive, credit the user
  if history_record.id is not null and free_earned > 0 then
    insert into public.keep_battle_solo_credit_events(history_id, profile_id, result, amount)
    values (history_record.id, uid, 'WIN', free_earned)
    on conflict (history_id, profile_id) do nothing;
  end if;
end;
$function$;

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014XdCPchT6vDAK2W89g4vaM
