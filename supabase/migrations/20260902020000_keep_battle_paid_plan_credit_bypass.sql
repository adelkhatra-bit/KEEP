-- Adel (02/09/2026) : "l'utilisateur inside est en Premium, comment ça se
-- fait que quand il veut faire un Battle en ligne ça lui dit qu'il lui faut
-- minimum 3 Free ... il faut bien vérifier que tout soit branché
-- correctement." Vérifié en direct : @inside a bien un abonnement PREMIUM
-- actif (accordé correctement dans le Super Admin, jusqu'en 2027) -- le
-- Super Admin fonctionne bien. Le vrai trou : keep_theoretical_free_credit_
-- remaining_for_profile() (et donc toute la porte d'entrée Battle) ne
-- consulte JAMAIS la table subscriptions/plans -- un abonnement payant
-- n'a jamais compté pour rien dans l'économie Free du Battle, quel que
-- soit le palier (Premium, Creator Pro, Venue Pro).
--
-- Le Battle en ligne est une vraie mise partagée entre joueurs (le gagnant
-- récupère les Free perdus par les autres, cf keep_battle_arena_finish_match)
-- -- on ne rend donc pas le Battle "gratuit" pour les payants, seulement la
-- PORTE D'ENTRÉE : un abonné payant peut toujours défier/rejoindre/miser
-- sans que son solde Free réel ne soit vérifié. S'il perd une manche, son
-- solde théorique peut redescendre (plancher à 0 comme pour tout le monde),
-- mais ça ne le bloque plus jamais pour la prochaine partie.
create or replace function public.keep_profile_has_paid_battle_access(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists(
    select 1
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.profile_id = p_uid
      and s.status = 'ACTIVE'
      and p.code <> 'FREE'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

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
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 if not public.keep_profile_has_paid_battle_access(p_target_id) and public.keep_theoretical_free_credit_remaining_for_profile(p_target_id)<min_free then raise exception 'BATTLE_TARGET_NO_CREDIT'; end if;
 if not exists(select 1 from public.keep_battle_solo_presence where profile_id=p_target_id and status='AVAILABLE' and last_seen_at>now()-interval '20 seconds') then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
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
   select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
   insert into public.notifications(profile_id,type,title,body,data)
   values(p_target_id,'BATTLE_CHALLENGE','⚡ Battle KEEP ?',format('@%s te défie. Accepte ou refuse directement dans KEEP Battle.',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'themeCode',v_theme,'expiresAt',c.expires_at,'presentation','battle_inline','openMode','stay_in_place'));
 end if;
 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at,'deduped',not v_created);
end;$function$;

create or replace function public.keep_battle_arena_join(p_arena_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; active_count integer; queue_count integer; next_status text; min_free integer:=3; final_status text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if not public.keep_profile_has_paid_battle_access(uid) and public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
 select * into a from public.keep_battle_arenas where arena_code=upper(trim(p_arena_code)) for update;
 if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 if a.status in('CLOSED','EXPIRED') or a.expires_at<=now() then raise exception 'BATTLE_ARENA_CLOSED'; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 next_status:=case when a.status='ACTIVE' then 'QUEUED' when active_count<a.max_players then 'ACTIVE' else 'QUEUED' end;
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,next_status)
 on conflict(arena_id,profile_id) do update set seat_status=case when keep_battle_arena_members.seat_status in('LEFT','ELIMINATED') then excluded.seat_status else keep_battle_arena_members.seat_status end;
 select seat_status into final_status from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid;
 if final_status='ACTIVE' then
   if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then
     update public.keep_battle_arena_members set seat_status='QUEUED' where arena_id=a.id and profile_id=uid;
     final_status:='QUEUED';
   elsif a.status='WAITING' then
     perform public.keep_battle_arena_seed_rounds(a.id,a.match_no);
   end if;
 end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
 return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'status',a.status,'players',active_count,'maxPlayers',a.max_players,'queue',queue_count,'myStatus',final_status,'stakeFree',min_free);
end;$function$;

create or replace function public.keep_battle_arena_lock_stake(p_arena_id uuid, p_match_no integer, p_profile_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare stake integer:=3; remaining integer;
begin
  stake:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1),3));
  if exists(select 1 from public.keep_battle_arena_credit_holds where arena_id=p_arena_id and match_no=p_match_no and profile_id=p_profile_id and status='LOCKED') then return true; end if;
  if public.keep_profile_has_paid_battle_access(p_profile_id) then return true; end if;
  remaining:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
  if remaining<stake then return false; end if;
  insert into public.keep_battle_arena_credit_holds(arena_id,match_no,profile_id,amount,status)
  values(p_arena_id,p_match_no,p_profile_id,stake,'LOCKED')
  on conflict(arena_id,match_no,profile_id) do update set amount=excluded.amount,status='LOCKED',settled_at=null;
  return true;
end;
$function$;
