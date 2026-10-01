-- Scale the private-room people picker for large profile counts.
-- Mobile typeahead is prefix-based so PostgreSQL can use deterministic btree
-- pattern indexes without a full-table ILIKE '%...%' scan.

create index if not exists idx_profiles_public_username_prefix
  on public.profiles (lower(username) text_pattern_ops)
  where is_public = true;

create index if not exists idx_profiles_public_display_name_prefix
  on public.profiles (lower(coalesce(display_name,'')) text_pattern_ops)
  where is_public = true;

create or replace function public.keep_agora_group_people_search(
  p_query text default '',
  p_limit integer default 30
)
returns table(profile_id uuid, username text, avatar_url text)
language sql
stable
security definer
set search_path to 'public','auth'
as $$
  with needle as (
    select lower(btrim(coalesce(p_query,''))) as q
  )
  select p.id, p.username, p.avatar_url
  from public.profiles p
  cross join needle n
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.is_public = true
    and (
      n.q = ''
      or lower(p.username) like replace(replace(n.q, '%', '\%'), '_', '\_') || '%' escape '\'
      or lower(coalesce(p.display_name,'')) like replace(replace(n.q, '%', '\%'), '_', '\_') || '%' escape '\'
    )
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by
    case when exists (
      select 1 from public.follows f
      where (f.follower_id = auth.uid() and f.followee_id = p.id)
         or (f.followee_id = auth.uid() and f.follower_id = p.id)
    ) then 0 else 1 end,
    lower(p.username)
  limit least(greatest(coalesce(p_limit,30),1),60);
$$;
