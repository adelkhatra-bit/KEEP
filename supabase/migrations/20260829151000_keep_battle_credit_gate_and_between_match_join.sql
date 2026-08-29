create or replace function public.keep_battle_challenge_send(p_target_id uuid, p_theme_code text default 'MIX') returns jsonb language plpgsql security definer set search_path='public' as $function$
declare uid uuid:=auth.uid(); v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX')); c public.keep_battle_challenges%rowtype; my_name text; v_created boolean:=false; min_free integer:=3;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 if public.keep_theoretical_free_credit_remaining_for_profile(p_target_id)<min_free then raise exception 'BATTLE_TARGET_NO_CREDIT'; end if;
 if not exists(select 1 from public.keep_battle_solo_presence where profile_id=p_target_id and status='AVAILABLE' and last_seen_at>now()-interval '20 seconds') then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;
 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
 select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
 if not found then
   insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,expires_at) values(uid,p_target_id,v_theme,now()+interval '15 seconds') on conflict (challenger_id,target_id) where status='PENDING' do nothing returning * into c;
   v_created:=found;
   if not v_created then select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1; end if;
 end if;
 if c.id is null then raise exception 'BATTLE_CHALLENGE_CREATE_FAILED'; end if;
 if v_created then
   select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
   insert into public.notifications(profile_id,type,title,body,data) values(p_target_id,'BATTLE_CHALLENGE','⚡ Battle KEEP ?',format('@%s te défie. Accepte ou refuse directement dans KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'themeCode',v_theme,'expiresAt',c.expires_at,'presentation','battle_inline','openMode','stay_in_place'));
 end if;
 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at,'deduped',not v_created);
end;$function$;

create or replace function public.keep_battle_arena_join(p_arena_code text) returns jsonb language plpgsql security definer set search_path='public' as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; active_count integer; queue_count integer; next_status text; min_free integer:=3;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
 select * into a from public.keep_battle_arenas where arena_code=upper(trim(p_arena_code)) for update;
 if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 if a.status in('CLOSED','EXPIRED') or a.expires_at<=now() then raise exception 'BATTLE_ARENA_CLOSED'; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 next_status:=case when a.status='ACTIVE' then 'QUEUED' when active_count<a.max_players then 'ACTIVE' else 'QUEUED' end;
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,next_status) on conflict(arena_id,profile_id) do update set seat_status=case when keep_battle_arena_members.seat_status in('LEFT','ELIMINATED') then excluded.seat_status else keep_battle_arena_members.seat_status end;
 if (select seat_status from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid)='ACTIVE' then if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then update public.keep_battle_arena_members set seat_status='QUEUED' where arena_id=a.id and profile_id=uid; end if; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
 return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'status',a.status,'players',active_count,'maxPlayers',a.max_players,'queue',queue_count,'myStatus',(select seat_status from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid),'stakeFree',min_free);
end;$function$;