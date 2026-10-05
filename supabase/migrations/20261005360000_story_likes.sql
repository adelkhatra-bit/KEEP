-- J'aime sur les stories (Adel 05/10/2026, IDEA-106) : un cœur par spectateur et par musique ; le propriétaire de la story voit le nombre de « j'aime » par musique.
-- Additif : nouvelle table, aucune donnée existante touchée.
create table if not exists public.story_likes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  liker_id uuid not null references public.profiles(id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 80),
  created_at timestamptz not null default now(),
  active boolean not null default true,
  unique (owner_id, liker_id, track_id)
);
create index if not exists story_likes_owner_idx on public.story_likes (owner_id, created_at desc);
alter table public.story_likes enable row level security;
drop policy if exists story_likes_select on public.story_likes;
create policy story_likes_select on public.story_likes for select to authenticated using (owner_id = auth.uid() or liker_id = auth.uid());

-- Basculer mon « j'aime » (aucune suppression : la ligne passe active / inactive).
create or replace function public.keep_story_like_toggle(p_owner_id uuid, p_track_id text)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_active boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_owner_id is null or p_owner_id = auth.uid() or coalesce(p_track_id, '') = '' then raise exception 'STORY_LIKE_INVALID'; end if;
  update public.story_likes set active = not active, created_at = case when active then created_at else now() end
    where owner_id = p_owner_id and liker_id = auth.uid() and track_id = left(p_track_id, 80) returning active into v_active;
  if found then return v_active; end if;
  insert into public.story_likes (owner_id, liker_id, track_id) values (p_owner_id, auth.uid(), left(p_track_id, 80)) on conflict do nothing;
  return true;
end $function$;

-- Mes « j'aime » donnés sur la story d'un membre (état du cœur).
create or replace function public.keep_story_likes_mine(p_owner_id uuid)
returns table(track_id text) language sql stable security definer set search_path to 'public' as $function$
  select l.track_id from public.story_likes l where l.owner_id = p_owner_id and l.liker_id = auth.uid() and l.active;
$function$;

-- Nombre de « j'aime » par musique sur MA story (réservé au propriétaire).
create or replace function public.keep_my_story_like_counts()
returns table(track_id text, likes integer) language sql stable security definer set search_path to 'public' as $function$
  select l.track_id, count(*)::integer from public.story_likes l where l.owner_id = auth.uid() and l.active and l.created_at > now() - interval '24 hours' group by l.track_id;
$function$;

revoke all on function public.keep_story_like_toggle(uuid, text) from public, anon;
grant execute on function public.keep_story_like_toggle(uuid, text) to authenticated;
revoke all on function public.keep_story_likes_mine(uuid) from public, anon;
grant execute on function public.keep_story_likes_mine(uuid) to authenticated;
revoke all on function public.keep_my_story_like_counts() from public, anon;
grant execute on function public.keep_my_story_like_counts() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'story_likes') then
    alter publication supabase_realtime add table public.story_likes;
  end if;
end $$;
