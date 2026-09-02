-- Adel (02/09/2026, capture à l'appui) : "@inside n'a plus les 3 Free
-- nécessaires. Le Battle ne peut pas démarrer" -- alors qu'@inside est
-- Premium. Le correctif précédent (20260902020000) n'avait patché QUE
-- keep_battle_challenge_send, keep_battle_arena_join et
-- keep_battle_arena_lock_stake. Recherche exhaustive de TOUTE fonction
-- lisant keep_theoretical_free_credit_remaining_for_profile a trouvé 3
-- autres portes non couvertes, toutes réellement appelées par le mobile
-- (confirmé via grep des appels .rpc('keep_battle...') côté client) :
--   - keep_battle_challenge_respond : ACCEPTER un défi revérifiait le
--     solde du CHALLENGEUR original (exactement le cas de cette capture)
--     et celui de l'accepteur, sans jamais consulter les abonnements.
--   - keep_battle_arena_challenge_send : inviter un joueur dans un groupe
--     déjà en cours revérifiait le solde de la cible.
--   - keep_battle_arena_create : créer une arène (chemin utilisé quand
--     accepter un défi ouvre une toute nouvelle arène) revérifiait son
--     propre solde.
-- Même principe que le premier correctif : les abonnés payants sautent la
-- barrière d'entrée, mais restent dans le même système de mise partagée
-- une fois entrés (keep_battle_arena_lock_stake, déjà patché, gère
-- toujours la mise réelle).
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
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
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
 insert into public.keep_battle_arenas(host_id,theme_code,round_count,max_players) values(uid,theme,greatest(5,least(coalesce(p_round_count,8),12)),10) returning * into a;
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,'ACTIVE');
 if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
 perform public.keep_battle_arena_seed_rounds(a.id,1);
 begin notified := public.keep_battle_notify_followers(a.id); exception when others then notified := 0; end;
 return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'status',a.status,'players',1,'maxPlayers',10,'queue',0,'matchNo',1,'stakeFree',min_free,'followersNotified',notified);
end;
$function$;
