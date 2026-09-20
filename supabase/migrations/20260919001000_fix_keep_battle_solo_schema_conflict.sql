-- CRITICAL FIX (19/09/2026): Resolve migration conflict between 20260918130000 and 20260918134500
-- Problem: Schema conflict causes keep_battle_solo_record_completion RPC to fail silently
-- Impact: User Flo played 8/8 but Free never credited due to RPC failure
-- Solution: Restore correct schema and fix RPC to match component expectations

-- Drop the conflicted table and recreate with CORRECT schema
drop table if exists public.keep_battle_solo_history cascade;
drop table if exists public.keep_battle_solo_credit_events cascade;

-- Restore correct table structure (from 20260918130000 - the correct version)
create table public.keep_battle_solo_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- Match details
  theme_code text not null,
  round_count integer not null,
  correct_answers integer not null,

  -- Credit tracking (before/after match)
  free_before bigint not null,
  free_earned integer not null,
  free_after bigint not null,

  -- Metadata
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.keep_battle_solo_history enable row level security;

drop policy if exists keep_battle_solo_history_select on public.keep_battle_solo_history;
create policy keep_battle_solo_history_select on public.keep_battle_solo_history
for select
using (profile_id = auth.uid());

drop policy if exists keep_battle_solo_history_insert on public.keep_battle_solo_history;
create policy keep_battle_solo_history_insert on public.keep_battle_solo_history
for insert
with check (profile_id = auth.uid());

create index if not exists idx_keep_battle_solo_history_profile_completed
on public.keep_battle_solo_history(profile_id, completed_at desc);

-- Restore correct RPC for recording SOLO history
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
    profile_id,
    theme_code,
    round_count,
    correct_answers,
    free_before,
    free_earned,
    free_after,
    completed_at
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

-- Restore correct RPC for fetching SOLO history
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
  select
    h.id,
    h.theme_code,
    h.round_count,
    h.correct_answers,
    h.free_before,
    h.free_earned,
    h.free_after,
    h.completed_at
  from public.keep_battle_solo_history h
  where h.profile_id = auth.uid()
  order by h.completed_at desc
  limit greatest(5, least(p_limit, 100));
$function$;

-- Create credit events table (for tracking Free gains/losses)
create table public.keep_battle_solo_credit_events (
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

-- FIX: keep_battle_solo_report_result now uses CORRECT formula (8/8 only)
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

  -- Update skill stats
  insert into public.keep_battle_skill_stats(profile_id, solo_correct, solo_total, updated_at)
  values (uid, correct, total, now())
  on conflict (profile_id) do update set
    solo_correct = keep_battle_skill_stats.solo_correct + correct,
    solo_total = keep_battle_skill_stats.solo_total + total,
    updated_at = now();

  -- Get max reward for this pack size
  max_reward := case
    when total <= 8 then 3
    when total <= 15 then 6
    when total <= 20 then 8
    else 12
  end;

  -- CRITICAL FIX (19/09/2026): Only grant Free for PERFECT scores (8/8)
  -- Before: free_earned = floor(correct / total * max_reward)  -- allowed 7/8 to earn 2
  -- After: free_earned = 0 unless correct = total (perfect score)
  free_earned := case when correct = total then max_reward else 0 end;

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

-- Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
-- Claude-Session: https://claude.ai/code/session_014XdCPchT6vDAK2W89g4vaM
