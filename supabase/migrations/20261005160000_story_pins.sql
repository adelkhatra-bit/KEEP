-- « + » de la story (Adel, 05/10/2026) : épingler une de MES musiques gardées en public dans ma story du jour.
-- Additif. Seules les musiques gardées en PUBLIC peuvent être épinglées (jamais une musique privée).
create table if not exists public.story_pins (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (profile_id, track_id)
);
alter table public.story_pins enable row level security;
drop policy if exists story_pins_select_all on public.story_pins;
create policy story_pins_select_all on public.story_pins for select to authenticated using (true);
create index if not exists story_pins_recent_idx on public.story_pins (profile_id, pinned_at desc);

create or replace function public.keep_pin_story_track(p_track_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.keep_decisions d
    where d.profile_id = auth.uid() and d.track_id = p_track_id and d.decision = 'KEPT' and d.visibility = 'PUBLIC'
  ) then
    raise exception 'STORY_PIN_REQUIRES_PUBLIC_KEEP';
  end if;
  insert into public.story_pins (profile_id, track_id) values (auth.uid(), p_track_id)
  on conflict (profile_id, track_id) do update set pinned_at = now();
  return true;
end;
$$;
revoke all on function public.keep_pin_story_track(uuid) from public, anon;
grant execute on function public.keep_pin_story_track(uuid) to authenticated;
