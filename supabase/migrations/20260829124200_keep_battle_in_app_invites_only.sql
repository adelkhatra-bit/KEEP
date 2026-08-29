create or replace function public.keep_battle_challenge_send(p_target_id uuid, p_theme_code text default 'MIX'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 uid uuid:=auth.uid();
 v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
 c public.keep_battle_challenges%rowtype;
 v_created boolean:=false;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 if not exists(select 1 from public.keep_battle_solo_presence where profile_id=p_target_id and status='AVAILABLE' and last_seen_at>now()-interval '20 seconds') then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;

 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();

 select * into c
 from public.keep_battle_challenges
 where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now()
 order by created_at desc
 limit 1;

 if not found then
   insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,expires_at)
   values(uid,p_target_id,v_theme,now()+interval '15 seconds')
   on conflict (challenger_id,target_id) where status='PENDING' do nothing
   returning * into c;
   v_created:=found;

   if not v_created then
     select * into c
     from public.keep_battle_challenges
     where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now()
     order by created_at desc
     limit 1;
   end if;
 end if;

 if c.id is null then raise exception 'BATTLE_CHALLENGE_CREATE_FAILED'; end if;

 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at,'deduped',not v_created);
end;$function$;

-- Battle invitations are rendered directly from keep_battle_challenges inside
-- the active Battle card. Recipient notification rows are obsolete and would
-- only create a system push / navigation detour.
delete from public.notifications
where type in ('BATTLE_CHALLENGE','BATTLE_CHALLENGE_RECEIVED','BATTLE_INVITE','KEEP_BATTLE_INVITE');
