create table if not exists public.music_library_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('apple_music','spotify','deezer','youtube_music','soundcloud','tidal')),
  provider_track_id text not null,
  track_id uuid references public.tracks(id) on delete set null,
  provider_uri text,
  isrc text,
  title text not null,
  artist text not null,
  album text,
  artwork_url text,
  source_kind text not null default 'saved' check (source_kind in ('saved','playlist','top','manual')),
  source_playlist_id text,
  visibility text not null default 'PRIVATE' check (visibility in ('PUBLIC','FOLLOWERS','PRIVATE')),
  imported_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(profile_id, provider, provider_track_id)
);

comment on table public.music_library_items is 'Metadata-only mirror of music saved in user-authorized providers. KEEP never stores protected provider audio bytes.';
comment on column public.music_library_items.visibility is 'Controls only whether imported metadata appears on the KEEP profile; it never changes visibility inside Spotify/Apple/Deezer.';

create index if not exists music_library_items_profile_active_idx
  on public.music_library_items(profile_id, provider, last_seen_at desc)
  where removed_at is null;
create index if not exists music_library_items_public_idx
  on public.music_library_items(profile_id, imported_at desc)
  where visibility = 'PUBLIC' and removed_at is null;
create index if not exists music_library_items_track_idx
  on public.music_library_items(track_id)
  where track_id is not null;

alter table public.music_library_items enable row level security;

drop policy if exists music_library_items_select on public.music_library_items;
create policy music_library_items_select on public.music_library_items
for select using (
  profile_id = auth.uid()
  or (
    removed_at is null
    and visibility = 'PUBLIC'
    and exists (
      select 1 from public.profiles p
      where p.id = music_library_items.profile_id and p.is_public = true
    )
  )
  or (
    removed_at is null
    and visibility = 'FOLLOWERS'
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.followee_id = music_library_items.profile_id
    )
  )
);

drop policy if exists music_library_items_insert_own on public.music_library_items;
create policy music_library_items_insert_own on public.music_library_items
for insert with check (profile_id = auth.uid());

drop policy if exists music_library_items_update_own on public.music_library_items;
create policy music_library_items_update_own on public.music_library_items
for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists music_library_items_delete_own on public.music_library_items;
create policy music_library_items_delete_own on public.music_library_items
for delete using (profile_id = auth.uid());
