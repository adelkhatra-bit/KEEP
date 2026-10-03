-- Sender-side cancellation for a Battle invitation that is still pending.
-- The server owns the race with ACCEPTED: once accepted, cancellation is rejected.

create or replace function public.keep_battle_challenge_cancel(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  c public.keep_battle_challenges%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into c
  from public.keep_battle_challenges
  where id = p_challenge_id
  for update;

  if not found or c.challenger_id <> uid then
    raise exception 'BATTLE_CHALLENGE_FORBIDDEN';
  end if;

  if c.status = 'CANCELLED' then
    return jsonb_build_object('id', c.id, 'status', 'CANCELLED', 'idempotent', true);
  end if;

  if c.status = 'ACCEPTED' then
    raise exception 'BATTLE_CHALLENGE_ALREADY_ACCEPTED';
  end if;

  if c.status <> 'PENDING' or c.expires_at <= now() then
    if c.status = 'PENDING' then
      update public.keep_battle_challenges
      set status='EXPIRED', updated_at=now()
      where id=c.id;
    end if;
    raise exception 'BATTLE_CHALLENGE_NOT_CANCELLABLE';
  end if;

  update public.keep_battle_challenges
  set status='CANCELLED', updated_at=now()
  where id=c.id;

  delete from public.notifications n
  where n.profile_id=c.target_id
    and n.type='BATTLE_CHALLENGE'
    and (
      n.data->>'challengeId'=c.id::text
      or n.data->>'challenge_id'=c.id::text
    );

  return jsonb_build_object(
    'id', c.id,
    'status', 'CANCELLED',
    'targetId', c.target_id
  );
end;
$function$;

revoke all on function public.keep_battle_challenge_cancel(uuid) from public, anon;
grant execute on function public.keep_battle_challenge_cancel(uuid) to authenticated;
