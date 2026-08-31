update public.remote_config
set value = '4000'::jsonb
where key = 'battle_arena_round_duration_ms';

create or replace function public.keep_battle_challenge_respond(p_challenge_id uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path='public' as $f$
declare uid uuid:=auth.uid(); c public.keep_battle_challenges%rowtype; created jsonb; aid uuid; acode text; min_free integer:=3; my_name text; started jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into c from public.keep_battle_challenges where id=p_challenge_id for update;
 if not found or c.target_id<>uid then raise exception 'BATTLE_CHALLENGE_FORBIDDEN'; end if;
 if c.status<>'PENDING' or c.expires_at<=now() then update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where id=c.id and status='PENDING'; raise exception 'BATTLE_CHALLENGE_EXPIRED'; end if;
 if not p_accept then update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id; return jsonb_build_object('id',c.id,'status','DECLINED'); end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if public.keep_theoretical_free_credit_remaining_for_profile(c.challenger_id)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 created:=public.keep_battle_arena_create(c.theme_code,8); aid:=(created->>'id')::uuid; acode:=created->>'arenaCode';
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(aid,c.challenger_id,'ACTIVE') on conflict(arena_id,profile_id) do update set seat_status='ACTIVE';
 if not public.keep_battle_arena_lock_stake(aid,1,c.challenger_id) then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 perform public.keep_battle_arena_seed_rounds(aid,1);
 update public.keep_battle_challenges set status='ACCEPTED',arena_id=aid,updated_at=now() where id=c.id;
 delete from public.keep_battle_solo_presence where profile_id in(uid,c.challenger_id);
 select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
 insert into public.notifications(profile_id,type,title,body,data) values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s a accepté. Le Battle démarre maintenant.',my_name),jsonb_build_object('challengeId',c.id,'arenaId',aid,'arenaCode',acode));
 started:=public.keep_battle_arena_start(aid);
 return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',aid,'arenaCode',acode,'arenaState',started);
end;$f$;

revoke all on function public.keep_battle_challenge_respond(uuid,boolean) from public,anon;
grant execute on function public.keep_battle_challenge_respond(uuid,boolean) to authenticated;
