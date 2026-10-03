do $migration$
declare
  ddl text;
  start_pos integer;
  end_rel integer;
  tail text;
  replacement text := $new$
  if not p_accept then
    raise exception 'BATTLE_CHALLENGE_DECLINE_REQUIRES_CONFIRMED_ACTION';
  end if;
$new$;
begin
  select pg_get_functiondef('public.keep_battle_challenge_respond(uuid,boolean)'::regprocedure) into ddl;

  -- Idempotent across the historical function variants: replace the first
  -- p_accept=false branch by position instead of matching its exact body.
  start_pos := strpos(ddl, 'if not p_accept then');
  if start_pos = 0 then
    raise exception 'DECLINE_BRANCH_NOT_FOUND';
  end if;

  tail := substr(ddl, start_pos);
  end_rel := strpos(tail, 'end if;');
  if end_rel = 0 then
    raise exception 'DECLINE_BRANCH_END_NOT_FOUND';
  end if;

  ddl := substr(ddl, 1, start_pos - 1)
      || replacement
      || substr(tail, end_rel + length('end if;'));
  execute ddl;
end;
$migration$;

create or replace function public.keep_battle_challenge_decline_confirmed(p_challenge_id uuid)
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
  where id=p_challenge_id
  for update;

  if not found or c.target_id<>uid then
    raise exception 'BATTLE_CHALLENGE_FORBIDDEN';
  end if;

  if c.status='DECLINED' then
    return jsonb_build_object('id',c.id,'status','DECLINED','idempotent',true);
  end if;
  if c.status='ACCEPTED' then raise exception 'BATTLE_CHALLENGE_ALREADY_ACCEPTED'; end if;
  if c.status in ('EXPIRED','CANCELLED') then raise exception 'BATTLE_CHALLENGE_EXPIRED'; end if;
  if c.status<>'PENDING' or c.expires_at<=now() then
    update public.keep_battle_challenges
    set status='EXPIRED',updated_at=now()
    where id=c.id and status='PENDING';
    raise exception 'BATTLE_CHALLENGE_EXPIRED';
  end if;

  update public.keep_battle_challenges
  set status='DECLINED',updated_at=now()
  where id=c.id;

  return jsonb_build_object('id',c.id,'status','DECLINED','confirmedAction',true);
end;
$function$;

revoke all on function public.keep_battle_challenge_decline_confirmed(uuid) from public;
grant execute on function public.keep_battle_challenge_decline_confirmed(uuid) to authenticated;
