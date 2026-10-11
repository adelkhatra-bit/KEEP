create or replace function public.keep_battle_notification_dedupe()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_arena_id text;
begin
  if new.type not in ('BATTLE_INVITE','BATTLE_CHALLENGE') then return new; end if;
  v_arena_id := coalesce(new.data->>'arenaId', new.data->>'arena_id', '');
  if v_arena_id = '' then return new; end if;

  if new.type = 'BATTLE_INVITE' then
    if exists (
      select 1 from public.notifications n
      where n.profile_id = new.profile_id
        and n.type = 'BATTLE_CHALLENGE'
        and coalesce(n.data->>'arenaId', n.data->>'arena_id', '') = v_arena_id
        and n.created_at >= now() - interval '5 minutes'
    ) then
      return null;
    end if;
    return new;
  end if;

  delete from public.notifications n
  where n.profile_id = new.profile_id
    and n.type = 'BATTLE_INVITE'
    and coalesce(n.data->>'arenaId', n.data->>'arena_id', '') = v_arena_id
    and n.created_at >= now() - interval '5 minutes';

  return new;
end;
$function$;

drop trigger if exists trg_keep_battle_notification_dedupe on public.notifications;
create trigger trg_keep_battle_notification_dedupe
before insert on public.notifications
for each row execute function public.keep_battle_notification_dedupe();

delete from public.notifications generic
where generic.type='BATTLE_INVITE'
  and generic.created_at > now() - interval '24 hours'
  and exists (
    select 1 from public.notifications direct
    where direct.profile_id=generic.profile_id
      and direct.type='BATTLE_CHALLENGE'
      and coalesce(direct.data->>'arenaId',direct.data->>'arena_id','') =
          coalesce(generic.data->>'arenaId',generic.data->>'arena_id','')
      and abs(extract(epoch from (direct.created_at-generic.created_at))) <= 300
  );

update public.keep_battle_challenges
set status='EXPIRED',
    expires_at=least(expires_at,created_at+interval '90 seconds'),
    updated_at=now()
where id in (
  '8bf1bd1d-37b9-4199-9a96-e78b10b00a74'::uuid,
  '2a8af622-1b3e-4e0f-91b6-417b5aed9899'::uuid
)
and status='DECLINED';

delete from public.notifications
where type='BATTLE_CHALLENGE_DECLINED'
  and data->>'challengeId' in (
    '8bf1bd1d-37b9-4199-9a96-e78b10b00a74',
    '2a8af622-1b3e-4e0f-91b6-417b5aed9899'
  );
