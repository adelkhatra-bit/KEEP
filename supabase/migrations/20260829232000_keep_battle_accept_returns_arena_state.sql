create or replace function public.keep_battle_challenge_respond(p_challenge_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 uid uuid:=auth.uid();
 c public.keep_battle_challenges%rowtype;
 created jsonb;
 aid uuid;
 acode text;
 min_free integer:=3;
 my_name text;
 arena_state jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into c from public.keep_battle_challenges where id=p_challenge_id for update;
 if not found or c.target_id<>uid then raise exception 'BATTLE_CHALLENGE_FORBIDDEN'; end if;
 if c.status='ACCEPTED' and p_accept and c.arena_id is not null then
   select arena_code into acode from public.keep_battle_arenas where id=c.arena_id;
   arena_state:=public.keep_battle_arena_state(c.arena_id);
   return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',c.arena_id,'arenaCode',acode,'themeCode',c.theme_code,'arenaState',arena_state,'replayed',true);
 end if;
 if c.status='DECLINED' and not p_accept then
   return jsonb_build_object('id',c.id,'status','DECLINED','themeCode',c.theme_code,'replayed',true);
 end if;
 if c.status<>'PENDING' then raise exception 'BATTLE_CHALLENGE_ALREADY_RESOLVED'; end if;
 if c.expires_at<=now() then
   update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where id=c.id and status='PENDING';
   raise exception 'BATTLE_CHALLENGE_EXPIRED';
 end if;
 select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
 if not p_accept then
   update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id;
   insert into public.notifications(profile_id,type,title,body,data)
   values(c.challenger_id,'BATTLE_CHALLENGE_DECLINED','Battle refusé',format('@%s a refusé le Battle. Invite un autre joueur ou partage KEEP à un ami.',my_name),jsonb_build_object('challengeId',c.id,'targetId',uid,'suggestShare',true));
   return jsonb_build_object('id',c.id,'status','DECLINED','themeCode',c.theme_code);
 end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if public.keep_theoretical_free_credit_remaining_for_profile(c.challenger_id)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 if public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_TARGET_NO_CREDIT'; end if;
 created:=public.keep_battle_arena_create(c.theme_code,8);
 aid:=(created->>'id')::uuid;
 acode:=created->>'arenaCode';
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status)
 values(aid,c.challenger_id,'ACTIVE')
 on conflict(arena_id,profile_id) do update set seat_status='ACTIVE';
 if not public.keep_battle_arena_lock_stake(aid,1,c.challenger_id) then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 perform public.keep_battle_arena_seed_rounds(aid,1);
 update public.keep_battle_challenges set status='ACCEPTED',arena_id=aid,updated_at=now() where id=c.id;
 delete from public.keep_battle_solo_presence where profile_id in(uid,c.challenger_id);
 insert into public.notifications(profile_id,type,title,body,data)
 values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s a accepté. Synchronisation du duel…',my_name),jsonb_build_object('challengeId',c.id,'arenaId',aid,'arenaCode',acode,'themeCode',c.theme_code));
 arena_state:=public.keep_battle_arena_state(aid);
 return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',aid,'arenaCode',acode,'themeCode',c.theme_code,'arenaState',arena_state);
end;$function$;
