create table if not exists public.track_likes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  track_id text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, track_id)
);

alter table public.track_likes enable row level security;

drop policy if exists track_likes_select on public.track_likes;
create policy track_likes_select on public.track_likes for select using (true);

drop policy if exists track_likes_insert_own on public.track_likes;
create policy track_likes_insert_own on public.track_likes for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists track_likes_delete_own on public.track_likes;
create policy track_likes_delete_own on public.track_likes for delete to authenticated using (profile_id = auth.uid());

create index if not exists idx_track_likes_track_id on public.track_likes(track_id);
