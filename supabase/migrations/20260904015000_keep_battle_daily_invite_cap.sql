-- Adel : suite de la question posée sur le spam d'invitations Battle
-- ("rien n'empeche d'envoyer des invites en boucle sans jamais finir un
-- match, tu veux que j'ajoute une limite ?") -- "Ok continue" = feu vert.
-- Le decline-throttle existant protege deja UNE cible precise contre les
-- invites repetees, mais rien ne limite le nombre TOTAL d'invites qu'un
-- compte peut ENVOYER par jour, tous destinataires confondus. Plafond
-- global (pas par plan, c'est de l'anti-abus, pas un levier commercial),
-- reglable dans Remote Config, genereux par defaut pour ne jamais gener un
-- usage normal.
create or replace function public.keep_battle_challenge_daily_send_cap_check(p_uid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  daily_cap integer;
  sent_today integer;
begin
  daily_cap := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_invites_per_day' limit 1), 20));
  select count(*) into sent_today from public.keep_battle_challenges where challenger_id=p_uid and created_at > now() - interval '24 hours';
  if sent_today >= daily_cap then
    raise exception 'BATTLE_DAILY_INVITE_LIMIT_REACHED';
  end if;
end;
$$;
revoke all on function public.keep_battle_challenge_daily_send_cap_check(uuid) from public;

insert into public.remote_config(key,value) values ('battle_invites_per_day','20'::jsonb) on conflict (key) do nothing;

create or replace function public.keep_battle_challenge_send(p_target_id uuid, p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid:=auth.uid();
  v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
  v_round_count integer:=greatest(5,least(coalesce(p_round_count,8),30));
  c public.keep_battle_challenges%rowtype;
  my_name text;
  v_created boolean:=false;
  min_free integer:=3;
  v_notify boolean:=true;
  last_accepted_at timestamptz;
  last_incoming_at timestamptz;
  v_reset_at timestamptz;
  v_recent_count integer;
  v_daily_count integer;
  v_block_row_at timestamptz;
  v_unblock_at timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
  perform public.keep_battle_challenge_daily_send_cap_check(uid);
  perform public.keep_battle_arena_release_stale_seats(uid);
  perform public.keep_battle_arena_release_stale_seats(p_target_id);
  if public.keep_battle_skill_gap_blocks(uid, p_target_id) then raise exception 'BATTLE_SKILL_GAP_TOO_LARGE'; end if;
  select max(created_at) into last_accepted_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='ACCEPTED';
  select max(created_at) into last_incoming_at from public.keep_battle_challenges where challenger_id=p_target_id and target_id=uid;
  v_reset_at:=greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), coalesce(last_incoming_at,'-infinity'::timestamptz));
  select count(*) into v_daily_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '24 hours');
  if v_daily_count>=6 then
    select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '24 hours') order by created_at desc offset 5 limit 1;
    v_unblock_at:=coalesce(v_block_row_at,now())+interval '1 hour';
    raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:%', extract(epoch from v_unblock_at)::bigint;
  end if;
  select count(*) into v_recent_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '60 seconds');
  if v_recent_count>=2 then
    select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '60 seconds') order by created_at desc offset 1 limit 1;
    v_unblock_at:=coalesce(v_block_row_at,now())+interval '60 seconds';
    raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:%', extract(epoch from v_unblock_at)::bigint;
  end if;
  min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
  if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
  if not public.keep_profile_has_paid_battle_access(p_target_id) and public.keep_theoretical_free_credit_remaining_for_profile(p_target_id)<min_free then raise exception 'BATTLE_TARGET_NO_CREDIT'; end if;
  if not exists(
    select 1 from public.keep_battle_solo_presence
    where profile_id=p_target_id
      and (
        (status='AVAILABLE' and last_seen_at>now()-interval '20 seconds')
        or (manual_available=true and last_seen_at>now()-interval '30 minutes')
      )
  ) then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
  if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;
  update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
  select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
  if not found then
    insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,round_count,expires_at)
    values(uid,p_target_id,v_theme,v_round_count,now()+interval '90 seconds')
    on conflict (challenger_id,target_id) where status='PENDING' do nothing returning * into c;
    v_created:=found;
    if not v_created then
      select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
    end if;
  end if;
  if c.id is null then raise exception 'BATTLE_CHALLENGE_CREATE_FAILED'; end if;
  if v_created then
    select coalesce(np.system_enabled,true) into v_notify from public.notification_preferences np where np.profile_id=p_target_id;
    if coalesce(v_notify,true) then
      select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
      insert into public.notifications(profile_id,type,title,body,data)
      values(p_target_id,'BATTLE_CHALLENGE','⚡ Battle KEEP ?',format('@%s te défie. Accepte ou refuse directement dans KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'themeCode',v_theme,'roundCount',v_round_count,'expiresAt',c.expires_at,'presentation','battle_inline','openMode','stay_in_place'));
    end if;
  end if;
  return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at,'deduped',not v_created);
end;$function$;

create or replace function public.keep_battle_arena_challenge_send(p_arena_id uuid, p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 uid uuid:=auth.uid();
 a public.keep_battle_arenas%rowtype;
 c public.keep_battle_challenges%rowtype;
 my_name text;
 active_count integer;
 min_free integer:=3;
 v_created boolean:=false;
 last_accepted_at timestamptz;
 last_incoming_at timestamptz;
 v_reset_at timestamptz;
 v_recent_count integer;
 v_daily_count integer;
 v_block_row_at timestamptz;
 v_unblock_at timestamptz;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 perform public.keep_battle_challenge_daily_send_cap_check(uid);
 perform public.keep_battle_arena_release_stale_seats(uid);
 perform public.keep_battle_arena_release_stale_seats(p_target_id);
 if public.keep_battle_skill_gap_blocks(uid, p_target_id) then raise exception 'BATTLE_SKILL_GAP_TOO_LARGE'; end if;
 select max(created_at) into last_accepted_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='ACCEPTED';
 select max(created_at) into last_incoming_at from public.keep_battle_challenges where challenger_id=p_target_id and target_id=uid;
 v_reset_at:=greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), coalesce(last_incoming_at,'-infinity'::timestamptz));
 select count(*) into v_daily_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '24 hours');
 if v_daily_count>=6 then
   select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '24 hours') order by created_at desc offset 5 limit 1;
   v_unblock_at:=coalesce(v_block_row_at,now())+interval '1 hour';
   raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:%', extract(epoch from v_unblock_at)::bigint;
 end if;
 select count(*) into v_recent_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '60 seconds');
 if v_recent_count>=2 then
   select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(v_reset_at, now()-interval '60 seconds') order by created_at desc offset 1 limit 1;
   v_unblock_at:=coalesce(v_block_row_at,now())+interval '60 seconds';
   raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:%', extract(epoch from v_unblock_at)::bigint;
 end if;
 select * into a from public.keep_battle_arenas where id=p_arena_id for update;
 if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 if a.status<>'WAITING' or a.expires_at<=now() then raise exception 'BATTLE_ARENA_NOT_OPEN_FOR_INVITES'; end if;
 if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid and seat_status='ACTIVE') then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
 if exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=p_target_id and seat_status in('ACTIVE','QUEUED')) then raise exception 'BATTLE_PLAYER_ALREADY_IN_ARENA'; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 if active_count>=a.max_players then raise exception 'BATTLE_ARENA_FULL'; end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if not public.keep_profile_has_paid_battle_access(p_target_id) and public.keep_theoretical_free_credit_remaining_for_profile(p_target_id)<min_free then raise exception 'BATTLE_TARGET_NO_CREDIT'; end if;
 if not exists(
   select 1 from public.keep_battle_solo_presence
   where profile_id=p_target_id
     and (
       (status='AVAILABLE' and last_seen_at>now()-interval '20 seconds')
       or (manual_available=true and last_seen_at>now()-interval '30 minutes')
     )
 ) then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
 select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
 if not found then
   insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,arena_id,expires_at)
   values(uid,p_target_id,a.theme_code,a.id,now()+interval '90 seconds')
   on conflict (challenger_id,target_id) where status='PENDING' do nothing returning * into c;
   v_created:=found;
   if not v_created then
     select * into c from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='PENDING' and expires_at>now() order by created_at desc limit 1;
   end if;
 end if;
 if c.id is null then raise exception 'BATTLE_CHALLENGE_CREATE_FAILED'; end if;
 if c.arena_id is null then update public.keep_battle_challenges set arena_id=a.id,theme_code=a.theme_code,updated_at=now() where id=c.id returning * into c; end if;
 if v_created then
   select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
   insert into public.notifications(profile_id,type,title,body,data)
   values(p_target_id,'BATTLE_CHALLENGE','⚡ Rejoins le Battle',format('@%s t’invite à rejoindre son groupe KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'arenaId',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'expiresAt',c.expires_at,'presentation','battle_inline','openMode','stay_in_place'));
 end if;
 return jsonb_build_object('id',c.id,'status',c.status,'arenaId',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'expiresAt',c.expires_at,'deduped',not v_created);
end;$function$;
