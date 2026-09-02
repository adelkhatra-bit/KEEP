-- Adel (02/09/2026) : "lorsque quelqu'un a une très bonne note et c'est un
-- très bon joueur, qu'il ne puisse pas jouer avec des petits joueurs, un
-- petit joueur devra monter sa note en solo pour pouvoir participer" --
-- vraie catégorie de joueurs. Rien n'existait côté serveur pour mesurer un
-- niveau (le solo est 100% local aujourd'hui) : on ajoute un compteur
-- minimal (bonnes réponses solo + matchs d'arène/victoires) et une fonction
-- de palier dérivée, puis on bloque un défi quand l'écart de palier est
-- trop grand -- le petit joueur doit engranger de l'expérience en solo
-- (`keep_battle_solo_report_result`, appelé côté client à la fin d'une
-- partie solo) avant de pouvoir défier/être défié par un très bon joueur.
create table if not exists public.keep_battle_skill_stats (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  solo_correct integer not null default 0,
  solo_total integer not null default 0,
  arena_matches integer not null default 0,
  arena_wins integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.keep_battle_skill_stats enable row level security;
drop policy if exists keep_battle_skill_stats_select on public.keep_battle_skill_stats;
create policy keep_battle_skill_stats_select on public.keep_battle_skill_stats for select using (true);

create or replace function public.keep_battle_skill_tier(p_profile_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare s public.keep_battle_skill_stats%rowtype; experience integer; accuracy numeric;
begin
  select * into s from public.keep_battle_skill_stats where profile_id = p_profile_id;
  if not found then return 'DEBUTANT'; end if;
  experience := s.solo_total + s.arena_matches * 4;
  if experience < 8 then return 'DEBUTANT'; end if;
  accuracy := s.solo_correct::numeric / greatest(s.solo_total, 1);
  if s.arena_matches > 0 then
    accuracy := (accuracy + (s.arena_wins::numeric / s.arena_matches)) / 2;
  end if;
  if accuracy >= 0.7 then return 'EXPERT'; end if;
  return 'CONFIRME';
end;
$function$;

create or replace function public.keep_battle_skill_tier_rank(p_tier text)
returns integer
language sql
immutable
as $function$
  select case p_tier when 'EXPERT' then 3 when 'CONFIRME' then 2 else 1 end;
$function$;

create or replace function public.keep_battle_solo_report_result(p_correct integer, p_total integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_total is null or p_total <= 0 then return; end if;
  insert into public.keep_battle_skill_stats(profile_id, solo_correct, solo_total, updated_at)
  values (uid, greatest(0, coalesce(p_correct, 0)), p_total, now())
  on conflict (profile_id) do update set
    solo_correct = keep_battle_skill_stats.solo_correct + greatest(0, coalesce(p_correct, 0)),
    solo_total = keep_battle_skill_stats.solo_total + p_total,
    updated_at = now();
end;
$function$;

-- Écart maximum toléré : 2 (DEBUTANT<->EXPERT bloqué, DEBUTANT<->CONFIRME et
-- CONFIRME<->EXPERT autorisés -- le palier intermédiaire reste un pont).
create or replace function public.keep_battle_skill_gap_blocks(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select abs(public.keep_battle_skill_tier_rank(public.keep_battle_skill_tier(p_a)) - public.keep_battle_skill_tier_rank(public.keep_battle_skill_tier(p_b))) >= 2;
$function$;

drop function if exists public.keep_battle_solo_available(integer);
create or replace function public.keep_battle_solo_available(p_limit integer default 12)
returns table(profile_id uuid, username text, avatar_url text, theme_code text, last_seen_at timestamptz, skill_tier text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select sp.profile_id, p.username, p.avatar_url, sp.theme_code, sp.last_seen_at, public.keep_battle_skill_tier(sp.profile_id)
  from public.keep_battle_solo_presence sp
  join public.profiles p on p.id = sp.profile_id
  where sp.profile_id <> auth.uid()
    and (
      (sp.status='AVAILABLE' and sp.last_seen_at > now() - interval '20 seconds')
      or (sp.manual_available = true and sp.last_seen_at > now() - interval '30 minutes')
    )
  order by sp.last_seen_at desc
  limit greatest(1, p_limit);
$function$;

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
  decline_count integer;
  last_accepted_at timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
  perform public.keep_battle_arena_release_stale_seats(uid);
  perform public.keep_battle_arena_release_stale_seats(p_target_id);
  if public.keep_battle_skill_gap_blocks(uid, p_target_id) then raise exception 'BATTLE_SKILL_GAP_TOO_LARGE'; end if;
  select max(created_at) into last_accepted_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='ACCEPTED';
  select count(*) into decline_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>coalesce(last_accepted_at,'-infinity'::timestamptz);
  if decline_count>=2 then raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES'; end if;
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
 decline_count integer;
 last_accepted_at timestamptz;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 perform public.keep_battle_arena_release_stale_seats(uid);
 perform public.keep_battle_arena_release_stale_seats(p_target_id);
 if public.keep_battle_skill_gap_blocks(uid, p_target_id) then raise exception 'BATTLE_SKILL_GAP_TOO_LARGE'; end if;
 select max(created_at) into last_accepted_at from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='ACCEPTED';
 select count(*) into decline_count from public.keep_battle_challenges where challenger_id=uid and target_id=p_target_id and status='DECLINED' and created_at>coalesce(last_accepted_at,'-infinity'::timestamptz);
 if decline_count>=2 then raise exception 'BATTLE_TARGET_BLOCKED_TOO_MANY_DECLINES'; end if;
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

create or replace function public.keep_battle_arena_finish_match(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 a public.keep_battle_arenas%rowtype; active_count integer; winner uuid; candidate uuid; next_match integer; stake integer:=3; losers_count integer:=0; winner_gain integer:=0;
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id for update;
 if not found or a.status<>'ACTIVE' then return; end if;
 stake:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1),3));
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 with ranked as(
   select m.profile_id,m.score,m.correct_predictions,m.total_response_ms,row_number()over(order by m.score desc,m.correct_predictions desc,m.total_response_ms asc,m.joined_at asc)::int place
   from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='ACTIVE'
 )
 insert into public.keep_battle_arena_match_results(arena_id,match_no,profile_id,placement,score,correct_predictions,total_response_ms)
 select a.id,a.match_no,profile_id,place,score,correct_predictions,total_response_ms from ranked on conflict do nothing;
 select profile_id into winner from public.keep_battle_arena_match_results where arena_id=a.id and match_no=a.match_no order by placement asc limit 1;

 insert into public.keep_battle_skill_stats(profile_id, arena_matches, arena_wins)
 select m.profile_id, 1, case when m.profile_id = winner then 1 else 0 end
 from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status='ACTIVE'
 on conflict (profile_id) do update set
   arena_matches = keep_battle_skill_stats.arena_matches + 1,
   arena_wins = keep_battle_skill_stats.arena_wins + excluded.arena_wins,
   updated_at = now();

 insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
 select a.id,a.match_no,m.profile_id,'LOSS',-stake from public.keep_battle_arena_members m
 where m.arena_id=a.id and m.seat_status='ACTIVE' and m.profile_id<>winner
 on conflict(arena_id,match_no,profile_id) do nothing;
 select count(*) into losers_count from public.keep_battle_arena_credit_events where arena_id=a.id and match_no=a.match_no and result='LOSS';
 winner_gain:=stake*losers_count;
 if winner is not null and winner_gain>0 then
   insert into public.keep_battle_arena_credit_events(arena_id,match_no,profile_id,result,amount)
   values(a.id,a.match_no,winner,'WIN',winner_gain)
   on conflict(arena_id,match_no,profile_id) do update set result='WIN',amount=excluded.amount;
 end if;
 update public.keep_battle_arena_credit_holds set status='SETTLED',settled_at=now() where arena_id=a.id and match_no=a.match_no and status='LOCKED';
 update public.keep_battle_arena_members m set placement=r.placement,matches_played=m.matches_played+1
 from public.keep_battle_arena_match_results r where r.arena_id=a.id and r.match_no=a.match_no and r.profile_id=m.profile_id and m.arena_id=a.id and m.seat_status='ACTIVE';
 insert into public.notifications(profile_id,type,title,body,data)
 select winner,'BATTLE_ARENA_WIN','👑 Tu remportes le Battle !',format('+%s Free : tu termines numéro 1 de cette partie.',winner_gain),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',winner_gain,'result','WIN') where winner is not null;
 insert into public.notifications(profile_id,type,title,body,data)
 select m.profile_id,'BATTLE_ARENA_RESULT','Battle terminé',format('Le groupe reste ensemble pour le prochain Battle. -%s Free sur cette partie.',stake),jsonb_build_object('arenaId',a.id,'matchNo',a.match_no,'creditDelta',-stake,'result','LOSS')
 from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id<>winner and m.seat_status='ACTIVE';
 next_match:=a.match_no+1;
 update public.keep_battle_arenas set status='WAITING',host_id=coalesce(winner,host_id),match_no=next_match,current_round=0,updated_at=now() where id=a.id;
 perform public.keep_battle_arena_seed_rounds(a.id,next_match);
 for candidate in select profile_id from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' order by joined_at loop
   if not public.keep_battle_arena_lock_stake(a.id,next_match,candidate) then
     update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=candidate;
     insert into public.notifications(profile_id,type,title,body,data) values(candidate,'BATTLE_ARENA_NO_CREDIT','Arène KEEP',format('Il te faut au moins %s Free pour rejouer.',stake),jsonb_build_object('arenaId',a.id,'requiredFree',stake));
   end if;
 end loop;
 loop
   select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE'; exit when active_count>=a.max_players;
   select profile_id into candidate from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED' order by joined_at asc limit 1 for update skip locked; exit when candidate is null;
   if public.keep_battle_arena_lock_stake(a.id,next_match,candidate) then
     update public.keep_battle_arena_members set seat_status='ACTIVE',score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and profile_id=candidate;
     insert into public.notifications(profile_id,type,title,body,data) values(candidate,'BATTLE_ARENA_PROMOTED','🔥 Tu rejoins le groupe','Une place est disponible pour le prochain Battle.',jsonb_build_object('arenaId',a.id,'nextMatchNo',next_match,'stakeFree',stake));
   else update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=candidate; end if;
 end loop;
 update public.keep_battle_arena_members set score=0,correct_predictions=0,total_response_ms=0,placement=null,consecutive_misses=0 where arena_id=a.id and seat_status='ACTIVE';
end;
$function$;
