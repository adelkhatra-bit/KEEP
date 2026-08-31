update public.remote_config
set value='6000'::jsonb
where key='battle_arena_round_duration_ms';

update public.keep_battle_arenas
set round_duration_ms=6000
where status in ('WAITING','ACTIVE');

alter table public.keep_battle_arenas
alter column round_duration_ms set default 6000;

create or replace function public.keep_battle_arena_submit_quiz(p_arena_id uuid, p_selected_answer text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; r public.keep_battle_arena_rounds%rowtype; elapsed integer;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into a from public.keep_battle_arenas where id=p_arena_id for update;
 if not found or a.status<>'ACTIVE' then raise exception 'BATTLE_ARENA_NOT_ACTIVE'; end if;
 if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid and seat_status='ACTIVE') then raise exception 'BATTLE_ARENA_NOT_SEATED'; end if;
 select * into r from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round;
 if not found then raise exception 'BATTLE_ROUND_NOT_FOUND'; end if;
 if r.finalized_at is not null then return public.keep_battle_arena_state(a.id); end if;
 if r.closes_at is null or r.closes_at<=now() then perform public.keep_battle_arena_finalize_round(a.id); return public.keep_battle_arena_state(a.id); end if;
 elapsed:=greatest(0,round(extract(epoch from(now()-r.started_at))*1000)::int);
 if elapsed>6000 then perform public.keep_battle_arena_finalize_round(a.id); return public.keep_battle_arena_state(a.id); end if;
 if not exists(select 1 from jsonb_array_elements_text(r.choices) c where lower(trim(c))=lower(trim(p_selected_answer))) then raise exception 'BATTLE_INVALID_ANSWER'; end if;
 insert into public.keep_battle_arena_answers(arena_id,round_id,match_no,profile_id,selected_answer,response_ms)
 values(a.id,r.id,a.match_no,uid,trim(p_selected_answer),elapsed)
 on conflict(round_id,profile_id) do nothing;
 perform public.keep_battle_arena_finalize_round(a.id);
 return public.keep_battle_arena_state(a.id);
end;
$function$;

revoke all on function public.keep_battle_arena_submit_quiz(uuid,text) from public, anon;
grant execute on function public.keep_battle_arena_submit_quiz(uuid,text) to authenticated;
