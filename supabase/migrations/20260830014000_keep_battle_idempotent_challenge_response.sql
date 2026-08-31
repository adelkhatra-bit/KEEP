create or replace function public.keep_battle_challenge_respond(p_challenge_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 uid uuid:=auth.uid();
 c public.keep_battle_challenges%rowtype;
 a public.keep_battle_arenas%rowtype;
 created jsonb;
 started jsonb;
 aid uuid;
 acode text;
 min_free integer:=3;
 my_name text;
 active_count integer:=0;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into c from public.keep_battle_challenges where id=p_challenge_id for update;
 if not found or c.target_id<>uid then raise exception 'BATTLE_CHALLENGE_FORBIDDEN'; end if;

 -- Mobile retries are normal: if the first request committed but the HTTP
 -- response was lost, return the same decision and arena instead of failing.
 if c.status='ACCEPTED' then
   if not p_accept then raise exception 'BATTLE_CHALLENGE_ALREADY_ACCEPTED'; end if;
   if c.arena_id is null then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
   select * into a from public.keep_battle_arenas where id=c.arena_id;
   if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
   return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'idempotent',true,'arenaState',public.keep_battle_arena_state(a.id));
 end if;
 if c.status='DECLINED' then
   if p_accept then raise exception 'BATTLE_CHALLENGE_ALREADY_DECLINED'; end if;
   return jsonb_build_object('id',c.id,'status','DECLINED','idempotent',true);
 end if;
 if c.status in ('EXPIRED','CANCELLED') then raise exception 'BATTLE_CHALLENGE_EXPIRED'; end if;
 if c.status<>'PENDING' or c.expires_at<=now() then
   update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where id=c.id and status='PENDING';
   raise exception 'BATTLE_CHALLENGE_EXPIRED';
 end if;

 select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
 if not p_accept then
   update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id;
   insert into public.notifications(profile_id,type,title,body,data)
   values(c.challenger_id,'BATTLE_CHALLENGE_DECLINED','Battle refusé',format('@%s a refusé le Battle. Invite un autre joueur ou partage KEEP à un ami.',my_name),jsonb_build_object('challengeId',c.id,'targetId',uid,'suggestShare',true));
   return jsonb_build_object('id',c.id,'status','DECLINED');
 end if;

 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if public.keep_theoretical_free_credit_remaining_for_profile(c.challenger_id)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 if public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;

 if c.arena_id is not null then
   select * into a from public.keep_battle_arenas where id=c.arena_id for update;
   if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
   if a.status<>'WAITING' or a.expires_at<=now() then raise exception 'BATTLE_ARENA_NOT_OPEN_FOR_INVITES'; end if;
   select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
   if active_count>=a.max_players then raise exception 'BATTLE_ARENA_FULL'; end if;
   if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid and seat_status='ACTIVE') then
     insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status)
     values(a.id,uid,'ACTIVE')
     on conflict(arena_id,profile_id) do update set seat_status='ACTIVE',score=0,correct_predictions=0,total_response_ms=0,placement=null;
     if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then
       update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=uid;
       raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED';
     end if;
   end if;
   update public.keep_battle_challenges set status='ACCEPTED',updated_at=now() where id=c.id;
   delete from public.keep_battle_solo_presence where profile_id=uid;
   insert into public.notifications(profile_id,type,title,body,data)
   values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s rejoint votre groupe KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'arenaId',a.id,'arenaCode',a.arena_code,'joinedExistingArena',true));
   return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'joinedExistingArena',true,'arenaState',public.keep_battle_arena_state(a.id));
 end if;

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
 started:=public.keep_battle_arena_start(aid);
 insert into public.notifications(profile_id,type,title,body,data)
 values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s a accepté. Le duel démarre…',my_name),jsonb_build_object('challengeId',c.id,'arenaId',aid,'arenaCode',acode,'started',true));
 return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',aid,'arenaCode',acode,'themeCode',c.theme_code,'joinedExistingArena',false,'started',true,'arenaState',started);
end;$function$;
