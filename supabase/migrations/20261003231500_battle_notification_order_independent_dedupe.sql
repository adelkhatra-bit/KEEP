-- Order-independent Battle invite dedupe.
-- Preserve the first notification and prevent a second equivalent notification
-- for the same recipient/arena within five minutes. Existing history is never deleted.
create or replace function public.keep_battle_notification_dedupe()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_arena_id text;
begin
  if new.type not in ('BATTLE_INVITE','BATTLE_CHALLENGE') then
    return new;
  end if;

  v_arena_id := coalesce(new.data->>'arenaId', new.data->>'arena_id', '');
  if v_arena_id = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.notifications n
    where n.profile_id = new.profile_id
      and n.type in ('BATTLE_INVITE','BATTLE_CHALLENGE')
      and coalesce(n.data->>'arenaId', n.data->>'arena_id', '') = v_arena_id
      and n.created_at >= now() - interval '5 minutes'
  ) then
    return null;
  end if;

  return new;
end;
$function$;
