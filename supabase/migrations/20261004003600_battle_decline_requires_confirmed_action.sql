-- Refuser un Battle doit être une action distincte et confirmée.
-- L'ancienne RPC générique n'accepte plus p_accept=false : cela neutralise
-- immédiatement les anciennes builds capables d'envoyer un faux refus.

do $migration$
declare
  ddl text;
  old_block text := $old$
  if not p_accept then
    update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id;
    -- Pas de notification externe/inbox pour un refus : le challenger voit
    -- simplement que le bouton redevient disponible. Évite le doublon avec
    -- le feedback local et le bruit push.
    return jsonb_build_object('id',c.id,'status','DECLINED');
  end if;
$old$;
  new_block text := $new$
  if not p_accept then
    raise exception 'BATTLE_CHALLENGE_DECLINE_REQUIRES_CONFIRMED_ACTION';
  end if;
$new$;
begin
  select pg_get_functiondef('public.keep_battle_challenge_respond(uuid,boolean)'::regprocedure) into ddl;
  if strpos(ddl, old_block) = 0 then
    raise exception 'DECLINE_BLOCK_NOT_FOUND';
  end if;
  ddl := replace(ddl, old_block, new_block);
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

  if not found or c.target_id<>uid then raise exception 'BATTLE_CHALLENGE_FORBIDDEN'; end if;
  if c.status='DECLINED' then return jsonb_build_object('id',c.id,'status','DECLINED','idempotent',true); end if;
  if c.status='ACCEPTED' then raise exception 'BATTLE_CHALLENGE_ALREADY_ACCEPTED'; end if;
  if c.status in ('EXPIRED','CANCELLED') then raise exception 'BATTLE_CHALLENGE_EXPIRED'; end if;
  if c.status<>'PENDING' or c.expires_at<=now() then
    update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where id=c.id and status='PENDING';
    raise exception 'BATTLE_CHALLENGE_EXPIRED';
  end if;

  update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id;
  return jsonb_build_object('id',c.id,'status','DECLINED','confirmedAction',true);
end;
$function$;

revoke all on function public.keep_battle_challenge_decline_confirmed(uuid) from public;
grant execute on function public.keep_battle_challenge_decline_confirmed(uuid) to authenticated;
