-- Qui a vu ma story (Adel, 05/10/2026). Additif : une table + deux RPC. Aucune donnée existante touchée.
create table if not exists public.story_views (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  viewed_at timestamptz not null default now(),
  primary key (owner_id, viewer_id, day)
);
alter table public.story_views enable row level security;
-- Aucune policy : tout passe par les RPC security definer ci-dessous.
create index if not exists story_views_owner_recent_idx on public.story_views (owner_id, viewed_at desc);

create or replace function public.keep_record_story_view(p_owner_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.story_views (owner_id, viewer_id)
  select p_owner_id, auth.uid()
  where auth.uid() is not null and p_owner_id is not null and p_owner_id <> auth.uid()
  on conflict (owner_id, viewer_id, day) do update set viewed_at = now();
$$;

create or replace function public.keep_my_story_viewers()
returns table (viewer_id uuid, username text, avatar_url text, viewed_at timestamptz, is_follower boolean, is_reprise boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select v.viewer_id, p.username, p.avatar_url, v.viewed_at,
    exists (select 1 from public.follows f where f.follower_id = v.viewer_id and f.followee_id = auth.uid()) as is_follower,
    exists (select 1 from public.keep_decisions d where d.profile_id = v.viewer_id and d.decision = 'KEPT' and d.source_user_id = auth.uid()) as is_reprise
  from public.story_views v
  join public.profiles p on p.id = v.viewer_id
  where v.owner_id = auth.uid() and v.viewed_at > now() - interval '24 hours'
  order by v.viewed_at desc
  limit 200;
$$;

revoke all on function public.keep_record_story_view(uuid) from public, anon;
revoke all on function public.keep_my_story_viewers() from public, anon;
grant execute on function public.keep_record_story_view(uuid) to authenticated;
grant execute on function public.keep_my_story_viewers() to authenticated;
