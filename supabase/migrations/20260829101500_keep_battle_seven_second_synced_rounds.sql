update public.remote_config set value='7000'::jsonb where key='battle_arena_round_duration_ms';

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
 insert into public.notifications(profile_id,type,title,body,data) values(c.challenger_id,'BATTLE_CHALLENGE_ACCEPTED','🔥 Battle accepté',format('@%s a accepté. Synchronisation du duel…',my_name),jsonb_build_object('challengeId',c.id,'arenaId',aid,'arenaCode',acode));
 return jsonb_build_object('id',c.id,'status','ACCEPTED','arenaId',aid,'arenaCode',acode);
end;$f$;

create or replace function public.keep_battle_arena_start(p_arena_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $f$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; active_count integer; round_start timestamptz;
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id for update; if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid and seat_status='ACTIVE') then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
 if a.status='ACTIVE' then return public.keep_battle_arena_state(a.id); end if;
 for uid in select profile_id from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE' loop
   if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then update public.keep_battle_arena_members set seat_status='ELIMINATED' where arena_id=a.id and profile_id=uid; end if;
 end loop;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 if active_count<2 then raise exception 'BATTLE_ARENA_NEEDS_TWO_ELIGIBLE_PLAYERS'; end if;
 update public.keep_battle_arena_members set score=0,correct_predictions=0,total_response_ms=0,placement=null where arena_id=a.id and seat_status='ACTIVE';
 update public.keep_battle_arenas set status='ACTIVE',current_round=1,started_at=coalesce(started_at,now()),round_duration_ms=7000,updated_at=now() where id=a.id returning * into a;
 round_start:=now()+interval '900 milliseconds';
 update public.keep_battle_arena_rounds set started_at=round_start,closes_at=round_start+interval '7000 milliseconds' where arena_id=a.id and match_no=a.match_no and position=1;
 return public.keep_battle_arena_state(a.id);
end;$f$;

create or replace function public.keep_battle_arena_advance_after_reveal(p_arena_id uuid)
returns void language plpgsql security definer set search_path='public' as $f$
declare a public.keep_battle_arenas%rowtype; r public.keep_battle_arena_rounds%rowtype; next_round integer; round_start timestamptz;
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id for update;
 if not found or a.status<>'ACTIVE' then return; end if;
 select * into r from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round for update;
 if not found or r.finalized_at is null or coalesce(r.reveal_until,now()+interval '1 second')>now() then return; end if;
 next_round:=a.current_round+1;
 if next_round>a.round_count then perform public.keep_battle_arena_finish_match(a.id); return; end if;
 update public.keep_battle_arenas set current_round=next_round,updated_at=now() where id=a.id;
 round_start:=now()+interval '900 milliseconds';
 update public.keep_battle_arena_rounds set started_at=round_start,closes_at=round_start+interval '7000 milliseconds',reveal_until=null where arena_id=a.id and match_no=a.match_no and position=next_round;
end;$f$;

create or replace function public.keep_battle_arena_submit_quiz(p_arena_id uuid,p_selected_answer text)
returns jsonb language plpgsql security definer set search_path='public' as $f$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; r public.keep_battle_arena_rounds%rowtype; elapsed integer;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into a from public.keep_battle_arenas where id=p_arena_id for update; if not found or a.status<>'ACTIVE' then raise exception 'BATTLE_ARENA_NOT_ACTIVE'; end if;
 if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid and seat_status='ACTIVE') then raise exception 'BATTLE_ARENA_NOT_SEATED'; end if;
 select * into r from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round;
 if not found then raise exception 'BATTLE_ROUND_NOT_FOUND'; end if;
 if r.finalized_at is not null then return public.keep_battle_arena_state(a.id); end if;
 if r.started_at is null or now()<r.started_at then return public.keep_battle_arena_state(a.id); end if;
 if r.closes_at is null or r.closes_at<=now() then perform public.keep_battle_arena_finalize_round(a.id); return public.keep_battle_arena_state(a.id); end if;
 elapsed:=greatest(0,round(extract(epoch from(now()-r.started_at))*1000)::int);
 if elapsed>7000 then perform public.keep_battle_arena_finalize_round(a.id); return public.keep_battle_arena_state(a.id); end if;
 if not exists(select 1 from jsonb_array_elements_text(r.choices) c where lower(trim(c))=lower(trim(p_selected_answer))) then raise exception 'BATTLE_INVALID_ANSWER'; end if;
 insert into public.keep_battle_arena_answers(arena_id,round_id,match_no,profile_id,selected_answer,response_ms)
 values(a.id,r.id,a.match_no,uid,trim(p_selected_answer),elapsed)
 on conflict(round_id,profile_id) do nothing;
 perform public.keep_battle_arena_finalize_round(a.id);
 return public.keep_battle_arena_state(a.id);
end;$f$;

revoke all on function public.keep_battle_challenge_respond(uuid,boolean) from public,anon;
grant execute on function public.keep_battle_challenge_respond(uuid,boolean) to authenticated;