create or replace function public.keep_battle_challenge_outgoing()
returns table(id uuid, target_id uuid, username text, avatar_url text, theme_code text, status text, arena_id uuid, arena_code text, expires_at timestamptz)
language plpgsql security definer set search_path='public' as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.keep_battle_challenges c
  set status='EXPIRED',updated_at=now()
  where c.status='PENDING' and c.expires_at<=now();
  return query
  select c.id,c.target_id,p.username,p.avatar_url,c.theme_code,c.status,c.arena_id,a.arena_code,c.expires_at
  from public.keep_battle_challenges c
  join public.profiles p on p.id=c.target_id
  left join public.keep_battle_arenas a on a.id=c.arena_id
  where c.challenger_id=auth.uid() and c.created_at>now()-interval '10 minutes'
  order by c.created_at desc
  limit 5;
end;
$function$;

create or replace function public.keep_battle_challenge_respond(p_challenge_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path='public' as $function$
declare uid uuid:=auth.uid(); c public.keep_battle_challenges%rowtype; created jsonb; aid uuid; acode text; min_free integer:=3; my_name text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into c from public.keep_battle_challenges where id=p_challenge_id for update;
 if not found or c.target_id<>uid then raise exception 'BATTLE_CHALLENGE_FORBIDDEN'; end if;
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
 created:=public.keep_battle_arena_create(c.theme_code,8); aid:=(created->>'id')::uuid; acode:=created->>'arenaCode';
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(aid,c.challenger_id,'ACTIVE') on conflict(arena_id,profile_id) do update set seat_status='ACTIVE';
 if not public.keep_battle_arena_lock_stake(aid,1,c.challenger_id) then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 perform public.keep_battle_arena_seed_rounds(aid,1);
 update public.keep_battle_challenges set status='ACCEPTED',arena_id=aid,updated_at=now() where id=c.id;
 delete from public.keep_battle_solo_presence where profile_id in(uid,c.challenger_id);
 insert into public.notifications(profile_id,type,title,body,data)
 values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s a accepté. Synchronisation du duel…',my_name),jsonb_build_object('challengeId',c.id,'arenaId',aid,'arenaCode',acode));
 return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',aid,'arenaCode',acode);
end;$function$;
