create extension if not exists pg_cron with schema extensions;

create table if not exists public.keep_auto_repair_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  stale_challenges_expired integer not null default 0,
  battle_rounds_finalized integer not null default 0,
  battle_rounds_advanced integer not null default 0,
  notes text
);
alter table public.keep_auto_repair_log enable row level security;

create or replace function public.keep_system_auto_repair()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_expired int:=0; v_finalized int:=0; v_advanced int:=0; r record;
begin
 update public.keep_battle_challenges set status='EXPIRED',updated_at=now() where status='PENDING' and expires_at<=now();
 get diagnostics v_expired = row_count;
 for r in select a.id from public.keep_battle_arenas a join public.keep_battle_arena_rounds rr on rr.arena_id=a.id and rr.match_no=a.match_no and rr.position=a.current_round where a.status='ACTIVE' and rr.finalized_at is null and rr.closes_at<=now() loop
  perform public.keep_battle_arena_finalize_round(r.id); v_finalized:=v_finalized+1;
 end loop;
 for r in select a.id from public.keep_battle_arenas a join public.keep_battle_arena_rounds rr on rr.arena_id=a.id and rr.match_no=a.match_no and rr.position=a.current_round where a.status='ACTIVE' and rr.finalized_at is not null and rr.reveal_until<=now() loop
  perform public.keep_battle_arena_advance_after_reveal(r.id); v_advanced:=v_advanced+1;
 end loop;
 insert into public.keep_auto_repair_log(stale_challenges_expired,battle_rounds_finalized,battle_rounds_advanced,notes) values(v_expired,v_finalized,v_advanced,'SAFE_AUTOREPAIR');
 delete from public.keep_auto_repair_log where ran_at < now()-interval '30 days';
 return jsonb_build_object('expiredChallenges',v_expired,'finalizedRounds',v_finalized,'advancedRounds',v_advanced,'ranAt',now());
end;$$;
revoke all on function public.keep_system_auto_repair() from public,anon,authenticated;

select cron.unschedule(jobid) from cron.job where jobname='keep-system-auto-repair';
select cron.schedule('keep-system-auto-repair','* * * * *','select public.keep_system_auto_repair();');

create or replace function public.admin_auto_repair_status()
returns table(ran_at timestamptz, stale_challenges_expired integer, battle_rounds_finalized integer, battle_rounds_advanced integer, notes text)
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED'; end if;
 return query select l.ran_at,l.stale_challenges_expired,l.battle_rounds_finalized,l.battle_rounds_advanced,l.notes from public.keep_auto_repair_log l order by l.ran_at desc limit 20;
end;$$;
revoke all on function public.admin_auto_repair_status() from public,anon;
grant execute on function public.admin_auto_repair_status() to authenticated;
