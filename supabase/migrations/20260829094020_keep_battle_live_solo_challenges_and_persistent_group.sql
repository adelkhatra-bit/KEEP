create table if not exists public.keep_battle_solo_presence (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  theme_code text not null default 'MIX',
  status text not null default 'SOLO' check (status in ('SOLO','AVAILABLE')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.keep_battle_solo_presence enable row level security;
revoke all on public.keep_battle_solo_presence from anon, authenticated;

create table if not exists public.keep_battle_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  theme_code text not null default 'MIX',
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  arena_id uuid null references public.keep_battle_arenas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '45 seconds'),
  check (challenger_id<>target_id)
);
create index if not exists keep_battle_challenges_target_pending_idx on public.keep_battle_challenges(target_id,status,created_at desc);
create index if not exists keep_battle_challenges_challenger_pending_idx on public.keep_battle_challenges(challenger_id,status,created_at desc);
alter table public.keep_battle_challenges enable row level security;
revoke all on public.keep_battle_challenges from anon, authenticated;

create or replace function public.keep_battle_solo_heartbeat(p_theme_code text default 'MIX') returns void language plpgsql security definer set search_path='public' as $f$
declare uid uuid:=auth.uid(); v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX'));
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.profiles where id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
 if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;
 insert into public.keep_battle_solo_presence(profile_id,theme_code,status,last_seen_at) values(uid,v_theme,'AVAILABLE',now())
 on conflict(profile_id) do update set theme_code=excluded.theme_code,status='AVAILABLE',last_seen_at=now();
end;$f$;

create or replace function public.keep_battle_solo_leave() returns void language plpgsql security definer set search_path='public' as $f$
begin if auth.uid() is not null then delete from public.keep_battle_solo_presence where profile_id=auth.uid(); end if; end;$f$;

create or replace function public.keep_battle_solo_available(p_limit integer default 12)
returns table(profile_id uuid,username text,avatar_url text,theme_code text,last_seen_at timestamptz)
language sql security definer set search_path='public' as $f$
 select p.id,p.username,p.avatar_url,sp.theme_code,sp.last_seen_at
 from public.keep_battle_solo_presence sp join public.profiles p on p.id=sp.profile_id
 where auth.uid() is not null and sp.profile_id<>auth.uid() and sp.status='AVAILABLE' and sp.last_seen_at>now()-interval '20 seconds' and p.is_public=true
 order by sp.last_seen_at desc limit greatest(1,least(coalesce(p_limit,12),30));
$f$;

create or replace function public.keep_battle_challenge_send(p_target_id uuid,p_theme_code text default 'MIX') returns jsonb language plpgsql security definer set search_path='public' as $f$
declare uid uuid:=auth.uid(); v_theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX')); c public.keep_battle_challenges%rowtype; my_name text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_target_id is null or p_target_id=uid then raise exception 'BATTLE_CHALLENGE_INVALID_TARGET'; end if;
 if not exists(select 1 from public.keep_battle_solo_presence where profile_id=p_target_id and status='AVAILABLE' and last_seen_at>now()-interval '20 seconds') then raise exception 'BATTLE_PLAYER_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.keep_battle_themes where code=v_theme and enabled=true) then v_theme:='MIX'; end if;
 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
 insert into public.keep_battle_challenges(challenger_id,target_id,theme_code) values(uid,p_target_id,v_theme) returning * into c;
 select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
 insert into public.notifications(profile_id,type,title,body,data) values(p_target_id,'BATTLE_CHALLENGE','⚡ Battle KEEP ?',format('@%s veut jouer avec toi.',my_name),jsonb_build_object('challengeId',c.id,'challengerId',uid,'themeCode',v_theme));
 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at);
end;$f$;

create or replace function public.keep_battle_challenge_inbox()
returns table(id uuid,challenger_id uuid,username text,avatar_url text,theme_code text,created_at timestamptz,expires_at timestamptz)
language plpgsql security definer set search_path='public' as $f$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
 return query select c.id,c.challenger_id,p.username,p.avatar_url,c.theme_code,c.created_at,c.expires_at
 from public.keep_battle_challenges c join public.profiles p on p.id=c.challenger_id
 where c.target_id=auth.uid() and c.status='PENDING' and c.expires_at>now()
 order by c.created_at desc limit 5;
end;$f$;

create or replace function public.keep_battle_challenge_outgoing()
returns table(id uuid,target_id uuid,username text,avatar_url text,theme_code text,status text,arena_id uuid,arena_code text,expires_at timestamptz)
language plpgsql security definer set search_path='public' as $f$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
 return query select c.id,c.target_id,p.username,p.avatar_url,c.theme_code,c.status,c.arena_id,a.arena_code,c.expires_at
 from public.keep_battle_challenges c join public.profiles p on p.id=c.target_id left join public.keep_battle_arenas a on a.id=c.arena_id
 where c.challenger_id=auth.uid() and c.created_at>now()-interval '10 minutes'
 order by c.created_at desc limit 5;
end;$f$;

create or replace function public.keep_battle_challenge_respond(p_challenge_id uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path='public' as $f$
declare uid uuid:=auth.uid(); c public.keep_battle_challenges%rowtype; created jsonb; aid uuid; acode text; min_free integer:=3; my_name text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into c from public.keep_battle_challenges where id=p_challenge_id for update;
 if not found or c.target_id<>uid then raise exception 'BATTLE_CHALLENGE_FORBIDDEN'; end if;
 if c.status<>'PENDING' or c.expires_at<=now() then update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where id=c.id and status='PENDING'; raise exception 'BATTLE_CHALLENGE_EXPIRED'; end if;
 if not p_accept then update public.keep_battle_challenges set status='DECLINED',updated_at=now() where id=c.id; return jsonb_build_object('id',c.id,'status','DECLINED'); end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if public.keep_theoretical_free_credit_remaining_for_profile(c.challenger_id)<min_free then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 created:=public.keep_battle_arena_create(c.theme_code,8); aid:=(created->>'id')::uuid; acode:=created->>'arenaCode';
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(aid,c.challenger_id,'ACTIVE') on conflict(arena_id,profile_id) do update set seat_status='ACTIVE';
 if not public.keep_battle_arena_lock_stake(aid,1,c.challenger_id) then raise exception 'BATTLE_CHALLENGER_NO_CREDIT'; end if;
 perform public.keep_battle_arena_seed_rounds(aid,1);
 update public.keep_battle_challenges set status='ACCEPTED',arena_id=aid,updated_at=now() where id=c.id;
 delete from public.keep_battle_solo_presence where profile_id in(uid,c.challenger_id);
 select coalesce(nullif(username,''),'KEEP') into my_name from public.profiles where id=uid;
 insert into public.notifications(profile_id,type,title,body,data) values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s t’attend dans le salon.',my_name),jsonb_build_object('challengeId',c.id,'arenaId',aid,'arenaCode',acode));
 return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',aid,'arenaCode',acode);
end;$f$;

revoke all on function public.keep_battle_solo_heartbeat(text) from public,anon;
revoke all on function public.keep_battle_solo_leave() from public,anon;
revoke all on function public.keep_battle_solo_available(integer) from public,anon;
revoke all on function public.keep_battle_challenge_send(uuid,text) from public,anon;
revoke all on function public.keep_battle_challenge_inbox() from public,anon;
revoke all on function public.keep_battle_challenge_outgoing() from public,anon;
revoke all on function public.keep_battle_challenge_respond(uuid,boolean) from public,anon;
grant execute on function public.keep_battle_solo_heartbeat(text) to authenticated;
grant execute on function public.keep_battle_solo_leave() to authenticated;
grant execute on function public.keep_battle_solo_available(integer) to authenticated;
grant execute on function public.keep_battle_challenge_send(uuid,text) to authenticated;
grant execute on function public.keep_battle_challenge_inbox() to authenticated;
grant execute on function public.keep_battle_challenge_outgoing() to authenticated;
grant execute on function public.keep_battle_challenge_respond(uuid,boolean) to authenticated;
