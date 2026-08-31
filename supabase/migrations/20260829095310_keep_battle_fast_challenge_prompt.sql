create or replace function public.keep_battle_challenge_send(p_target_id uuid,p_theme_code text default 'MIX') returns jsonb language plpgsql security definer set search_path='public' as $f$
declare uid uuid:=auth.uid(); v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX')); c public.keep_battle_challenges%rowtype; my_name text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 if not exists(select 1 from public.keep_battle_solo_presence where profile_id=p_target_id and status='AVAILABLE' and last_seen_at>now()-interval '20 seconds') then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;
 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
 insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,expires_at) values(uid,p_target_id,v_theme,now()+interval '15 seconds') returning * into c;
 select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
 insert into public.notifications(profile_id,type,title,body,data)
 values(p_target_id,'BATTLE_CHALLENGE','⚡ Battle KEEP ?',format('@%s te défie. Souhaites-tu jouer à un Battle afin de gagner des Free ?',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'themeCode',v_theme,'expiresAt',c.expires_at));
 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at);
end;$f$;
revoke all on function public.keep_battle_challenge_send(uuid,text) from public,anon;
grant execute on function public.keep_battle_challenge_send(uuid,text) to authenticated;
