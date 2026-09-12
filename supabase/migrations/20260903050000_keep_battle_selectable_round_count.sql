-- Adel (03/09/2026) : "pouvoir choisir 8 Battle, 15 Battle ou 20/30 morceaux
-- avant de démarrer, en plus du style musical" -- le nombre de manches
-- (round_count) était déjà paramétrable pour le solo
-- (loadKeepBattleSoloPack) mais figé à 8, plafonné à 12, pour tout Battle en
-- ligne : keep_battle_challenge_respond créait l'arène avec
-- keep_battle_arena_create(theme, 8) codé en dur, et keep_battle_arena_create
-- plafonnait à 12 quoi qu'il arrive. Le nombre de manches choisi doit
-- voyager avec l'invitation elle-même (nouvelle colonne round_count sur
-- keep_battle_challenges) jusqu'à la création de l'arène au moment de
-- l'acceptation.
alter table public.keep_battle_challenges add column if not exists round_count integer not null default 8;

create or replace function public.keep_battle_arena_create(p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX')); min_free integer:=3; notified integer:=0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
  min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
  if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
  if not exists(select 1 from public.keep_battle_themes where code=theme and enabled=true) then theme:='MIX'; end if;
  insert into public.keep_battle_arenas(host_id,theme_code,round_count,max_players) values(uid,theme,greatest(5,least(coalesce(p_round_count,8),30)),10) returning * into a;
  insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,'ACTIVE');
  if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
  perform public.keep_battle_arena_seed_rounds(a.id,1);
  begin notified := public.keep_battle_notify_followers(a.id); exception when others then notified := 0; end;
  return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'status',a.status,'players',1,'maxPlayers',10,'queue',0,'matchNo',1,'stakeFree',min_free,'followersNotified',notified);
end;
$function$;

create or replace function public.keep_battle_challenge_send(p_target_id uuid, p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if not public.keep_profile_has_paid_battle_access(c.challenger_id) and public.keep_theoretical_free_credit_remaining_for_profile(c.challenger_id)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
  if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
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
      perform public.keep_battle_arena_seed_rounds(a.id,a.match_no);
    end if;
    update public.keep_battle_challenges set status='ACCEPTED',updated_at=now() where id=c.id;
    update public.keep_battle_solo_presence set status='SOLO' where profile_id=uid;
    insert into public.notifications(profile_id,type,title,body,data)
    values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s rejoint votre groupe KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'arenaId',a.id,'arenaCode',a.arena_code,'joinedExistingArena',true));
    return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'joinedExistingArena',true,'arenaState',public.keep_battle_arena_state(a.id));
  end if;
  created:=public.keep_battle_arena_create(c.theme_code,c.round_count);
  aid:=(created->>'id')::uuid;
  acode:=created->>'arenaCode';
  insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status)
  values(aid,c.challenger_id,'ACTIVE')
  on conflict(arena_id,profile_id) do update set seat_status='ACTIVE';
  if not public.keep_battle_arena_lock_stake(aid,1,c.challenger_id) then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
  perform public.keep_battle_arena_seed_rounds(aid,1);
  update public.keep_battle_challenges set status='ACCEPTED',arena_id=aid,updated_at=now() where id=c.id;
  update public.keep_battle_solo_presence set status='SOLO' where profile_id in(uid,c.challenger_id);
  started:=public.keep_battle_arena_start(aid);
  insert into public.notifications(profile_id,type,title,body,data)
  values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s a accepté. Le duel démarre…',my_name),jsonb_build_object('challengeId',c.id,'arenaId',aid,'arenaCode',acode,'started',true));
  return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',aid,'arenaCode',acode,'themeCode',c.theme_code,'joinedExistingArena',false,'started',true,'arenaState',started);
end;$function$;
