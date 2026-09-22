-- Track SOLO battle history with before/after Free credits
-- Allows users to see their credit progression through SOLO matches

create table if not exists public.keep_battle_solo_history (
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

-- RPC to record SOLO battle completion with credit tracking
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

-- RPC to fetch recent SOLO history (last 50 matches)
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
