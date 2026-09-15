-- Adel (03/09/2026) : audit demandé -- "comment t'as comptabilisé combien de
-- refus pour arriver à ce blocage" + un scénario précis à vérifier : "un
-- utilisateur insiste, deux refus ... l'autre lui envoie une invite, il la
-- refuse à son tour, est-ce que ça débloque l'utilisateur pour repartir à
-- l'infini ?"
--
-- Réponse vérifiée dans le code ci-dessous : NON, ce scénario ne débloque
-- rien -- le compteur est STRICTEMENT DIRECTIONNEL (challenger_id=uid ET
-- target_id=cible). Si B refuse une invite que B a reçue de A, cette ligne a
-- challenger_id=B / target_id=A : elle n'entre JAMAIS dans le calcul du
-- blocage de A contre B (qui ne lit que challenger_id=A / target_id=B). Les
-- deux sens sont toujours comptés indépendamment. Le seul vrai reset à 0 est
-- volontaire : un nouvel ACCEPTED entre les deux, quel que soit le sens de
-- cet accord.
--
-- Vraie faille trouvée pendant cet audit, elle : avec la fenêtre unique de
-- 60 secondes demandée juste avant pour l'affichage du chronomètre, un
-- harceleur déterminé peut simplement attendre 60s puis retenter -- 2 refus,
-- 60s, 2 refus, 60s, à l'infini, sans jamais être vraiment freiné (juste au
-- rythme d'une minute). Corrigé en ajoutant un DEUXIÈME palier, plus long,
-- au-dessus du premier : au-delà de 6 refus (même sens) en 24h, blocage
-- d'1h -- le premier palier (2 refus / 60s -> pause de 60s) reste pour
-- l'usage normal/accidentel, ce second palier arrête un harcèlement soutenu
-- que le premier ne peut pas voir. Toujours temporaire, jamais permanent
-- (leçon du 02/09 : un blocage permanent des deux côtés peut créer un verrou
-- mutuel impossible à lever). Même règle pour tout le monde, dans les deux
-- fonctions d'envoi (défi direct et invitation à rejoindre une arène).
create or replace function public.keep_battle_challenge_send(p_target_id uuid, p_theme_code text DEFAULT 'MIX'::text)
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
  min_free integer:=3;
  v_notify boolean:=true;
  last_accepted_at timestamptz;
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
  select count(*) into v_daily_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), now()-interval '24 hours');
  if v_daily_count>=6 then
    select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), now()-interval '24 hours') order by created_at desc offset 5 limit 1;
    v_unblock_at:=coalesce(v_block_row_at,now())+interval '1 hour';
    raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:%', extract(epoch from v_unblock_at)::bigint;
  end if;
  select count(*) into v_recent_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), now()-interval '60 seconds');
  if v_recent_count>=2 then
    select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), now()-interval '60 seconds') order by created_at desc offset 1 limit 1;
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
    insert into public.keep_battle_challenges(challenger_id,target_id,theme_code,expires_at)
    values(uid,p_target_id,v_theme,now()+interval '90 seconds')
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
      values(p_target_id,'BATTLE_CHALLENGE','⚡ Battle KEEP ?',format('@%s te défie. Accepte ou refuse directement dans KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'themeCode',v_theme,'expiresAt',c.expires_at,'presentation','battle_inline','openMode','stay_in_place'));
    end if;
  end if;
  return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at,'deduped',not v_created);
end;$function$;

create or replace function public.keep_battle_arena_challenge_send(p_arena_id uuid, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 uid uuid:=auth.uid();
 a public.keep_battle_arenas%rowtype;
 c public.keep_battle_challenges%rowtype;
 my_name text;
 active_count integer;
 min_free integer:=3;
 v_created boolean:=false;
 last_accepted_at timestamptz;
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
 select count(*) into v_daily_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), now()-interval '24 hours');
 if v_daily_count>=6 then
   select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), now()-interval '24 hours') order by created_at desc offset 5 limit 1;
   v_unblock_at:=coalesce(v_block_row_at,now())+interval '1 hour';
   raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES:%', extract(epoch from v_unblock_at)::bigint;
 end if;
 select count(*) into v_recent_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), now()-interval '60 seconds');
 if v_recent_count>=2 then
   select created_at into v_block_row_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>greatest(coalesce(last_accepted_at,'-infinity'::timestamptz), now()-interval '60 seconds') order by created_at desc offset 1 limit 1;
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
