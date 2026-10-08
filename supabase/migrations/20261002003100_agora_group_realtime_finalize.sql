-- Finalize Realtime + RLS after private Loki group tables have been created.
-- This is deliberately later than 20261002003000_agora_private_groups.sql.

do $$
begin
  if to_regclass('public.music_agora_group_messages') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='music_agora_group_messages'
     ) then
    alter publication supabase_realtime add table public.music_agora_group_messages;
  end if;

  if to_regclass('public.music_agora_group_members') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='music_agora_group_members'
     ) then
    alter publication supabase_realtime add table public.music_agora_group_members;
  end if;
end
$$;

create or replace function public.keep_agora_is_active_group_member(
  p_group_id uuid,
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth'
as $$
  select exists (
    select 1
    from public.music_agora_group_members gm
    where gm.group_id = p_group_id
      and gm.profile_id = p_profile_id
      and gm.status = 'ACTIVE'
  );
$$;

revoke all on function public.keep_agora_is_active_group_member(uuid,uuid) from public, anon;
grant execute on function public.keep_agora_is_active_group_member(uuid,uuid) to authenticated;

drop policy if exists music_agora_group_members_realtime_select on public.music_agora_group_members;
create policy music_agora_group_members_realtime_select
on public.music_agora_group_members
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or public.keep_agora_is_active_group_member(group_id, (select auth.uid()))
);

drop policy if exists music_agora_group_messages_realtime_select on public.music_agora_group_messages;
create policy music_agora_group_messages_realtime_select
on public.music_agora_group_messages
for select
to authenticated
using (
  public.keep_agora_is_active_group_member(group_id, (select auth.uid()))
);

grant select on public.music_agora_group_members to authenticated;
grant select on public.music_agora_group_messages to authenticated;

revoke insert, update, delete on public.music_agora_group_members from authenticated;
revoke insert, update, delete on public.music_agora_group_messages from authenticated;
