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
 my_name text;
 v_created boolean:=false;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 if not exists(select 1 from public.keep_battle_solo_presence where profile_id=p_target_id and status='AVAILABLE' and last_seen_at>now()-interval '20 seconds') then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;

 update public.keep_battle_challenges c0 set status='EXPIRED',updated_at=now() where c0.status='PENDING' and c0.expires_at<=now();

 select * into c
 from public.keep_battle_challenges c1
 where c1.challenger_id=uid and c1.target_id=p_target_id and c1.status='PENDING' and c1.expires_at>now()
 order by c1.created_at desc
 limit 1;

 if not found then
   insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,expires_at)
   values(uid,p_target_id,v_theme,now()+interval '15 seconds')
   on conflict (challenger_id,target_id) where status='PENDING' do nothing
   returning * into c;
   v_created:=found;

   if not v_created then
     select * into c
     from public.keep_battle_challenges c2
     where c2.challenger_id=uid and c2.target_id=p_target_id and c2.status='PENDING' and c2.expires_at>now()
     order by c2.created_at desc
     limit 1;
   end if;
 end if;

 if c.id is null then raise exception 'BATTLE_CHALLENGE_CREATE_FAILED'; end if;

 if v_created then
   select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
   insert into public.notifications(profile_id,type,title,body,data)
   values(
     p_target_id,
     'BATTLE_CHALLENGE',
     '⚡ Battle KEEP ?',
     format('@%s te défie. Accepte ou refuse directement dans KEEP Battle.',my_name),
     jsonb_build_object(
       'challengeId',c.id,
       'challengerId',uid,
       'themeCode',v_theme,
       'expiresAt',c.expires_at,
       'presentation','battle_inline',
       'openMode','stay_in_place'
     )
   );
 end if;

 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at,'deduped',not v_created);
end;$function$;
