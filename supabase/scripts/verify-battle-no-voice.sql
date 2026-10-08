-- Targeted PostgreSQL regression; test database only. Roll back all fixtures.
begin;
insert into auth.users(id,email) values
('50000000-0000-0000-0000-000000000001','battle-one@example.invalid'),
('50000000-0000-0000-0000-000000000002','battle-two@example.invalid'),
('50000000-0000-0000-0000-000000000003','battle-outsider@example.invalid');
insert into public.profiles(id,username) values
('50000000-0000-0000-0000-000000000001','battle_test_one'),
('50000000-0000-0000-0000-000000000002','battle_test_two'),
('50000000-0000-0000-0000-000000000003','battle_test_outsider')
on conflict(id) do nothing;
insert into public.tracks(title,artist,preview_url)
select 'Battle voice fixture '||n,'Battle unique artist '||n,'https://audio.example.invalid/'||n
from generate_series(1,80) n;
insert into public.keep_battle_track_themes(track_id,theme_code)
select id,'POP' from public.tracks where title like 'Battle voice fixture %'
on conflict do nothing;

select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$
declare
  pack jsonb;
  token uuid;
  token2 uuid;
  original uuid;
  result jsonb;
  arena uuid;
  round_started timestamptz;
  before_members jsonb;
  after_members jsonb;
  reports_before integer;
begin
  pack:=public.keep_battle_solo_pack('POP',8,array['POP']);
  token:=(pack->>'reportToken')::uuid;
  original:=(pack->'rounds'->0->>'trackId')::uuid;
  perform public.keep_battle_solo_round_active(token,1,original);
  result:=public.keep_battle_report_no_voice(null,null,1,null,token,original);
  assert result->'round'->>'trackId'<>original::text,'Solo replacement must differ';
  assert (select reports=1 from public.keep_battle_excluded_tracks where track_id=original),'Report increments once';
  perform public.keep_battle_report_no_voice(null,null,1,null,token,original);
  assert (select reports=1 from public.keep_battle_excluded_tracks where track_id=original),'Duplicate report must be idempotent';
  assert (select jsonb_array_length(session.pack->'rounds')=8 from public.keep_battle_solo_report_sessions session where id=token),'Denominator stays intact';
  assert not exists(select 1 from public.keep_battle_solo_credit_events),'No Solo credit emitted by cancellation';
  assert not exists(select 1 from public.keep_battle_solo_history),'No Solo result emitted by cancellation';
  insert into public.keep_battle_solo_report_sessions(profile_id,pack)
    values(auth.uid(),pack) returning id into token2;
  perform public.keep_battle_report_no_voice(null,null,1,null,token2,original);
  assert (select reports=2 from public.keep_battle_excluded_tracks where track_id=original),'Independent round adds one report';
  result:=public.keep_battle_solo_pack('POP',30,array['POP']);
  assert not exists(select 1 from jsonb_array_elements(result->'rounds') x where x->>'trackId'=original::text),'Excluded track never drawn Solo';
  begin
    perform public.keep_battle_report_no_voice(null,null,2,null,token,original);
    raise exception 'Invalid position accepted';
  exception when others then
    if sqlerrm<>'BATTLE_SOLO_ROUND_INVALID' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
  begin
    perform public.keep_battle_report_no_voice(null,null,1,null,token,original);
    raise exception 'Foreign Solo accepted';
  exception when others then
    if sqlerrm<>'BATTLE_SOLO_ROUND_INVALID' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
  insert into public.keep_battle_arenas(host_id,theme_code,round_count)
    values(auth.uid(),'POP',8) returning id into arena;
  insert into public.keep_battle_arena_members(arena_id,profile_id)
    values(arena,auth.uid()),(arena,'50000000-0000-0000-0000-000000000002');
  perform public.keep_battle_arena_seed_rounds(arena,1);
  assert not exists(select 1 from public.keep_battle_arena_rounds where arena_id=arena and track_id=original),'Excluded track never drawn online';
  update public.keep_battle_arenas set status='ACTIVE',current_round=1 where id=arena;
  round_started:=now()-interval '1 second';
  update public.keep_battle_arena_rounds set started_at=round_started,closes_at=now()+interval '9 seconds'
    where arena_id=arena and position=1;
  select track_id into original from public.keep_battle_arena_rounds where arena_id=arena and position=1;
  insert into public.keep_battle_arena_answers(arena_id,round_id,match_no,profile_id,response_ms,selected_answer)
    select arena,id,1,'50000000-0000-0000-0000-000000000002',500,artist_snapshot
    from public.keep_battle_arena_rounds where arena_id=arena and position=1;
  select jsonb_agg(to_jsonb(m) order by profile_id) into before_members
    from public.keep_battle_arena_members m where arena_id=arena;
  result:=public.keep_battle_report_no_voice(arena,1,1,round_started,null,null);
  select jsonb_agg(to_jsonb(m) order by profile_id) into after_members
    from public.keep_battle_arena_members m where arena_id=arena;
  assert before_members=after_members,'Cancellation never changes scores, misses, seats or placement';
  assert (select track_id<>original and started_at>now() from public.keep_battle_arena_rounds where arena_id=arena and position=1),'Shared replacement uses unchanged five-second preload';
  assert (select round_count=8 from public.keep_battle_arenas where id=arena),'Bonus denominator unchanged';
  assert exists(select 1 from public.keep_battle_no_voice_reports where arena_id=arena and jsonb_array_length(cancelled_answers)=1),'Unscored answers retained in audit';
  assert not exists(select 1 from public.keep_battle_arena_credit_events where arena_id=arena),'No FREE transfer';
  perform public.keep_battle_report_no_voice(arena,1,1,round_started,null,null);
  assert (select reports=1 from public.keep_battle_excluded_tracks where track_id=original),'Online duplicate report idempotent';
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
  begin
    perform public.keep_battle_report_no_voice(arena,1,1,round_started,null,null);
    raise exception 'Outsider arena accepted';
  exception when others then
    if sqlerrm<>'BATTLE_ARENA_FORBIDDEN' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.keep_battle_report_no_voice(arena,1,1,round_started,null,null);
    raise exception 'Anonymous arena accepted';
  exception when others then
    if sqlerrm<>'AUTH_REQUIRED' then raise; end if;
  end;
  assert not has_table_privilege('authenticated','public.keep_battle_excluded_tracks','INSERT'),'No privileged client upsert';
  assert not has_function_privilege('anon','public.keep_battle_report_no_voice(uuid,integer,integer,timestamptz,uuid,uuid)','EXECUTE'),'Anonymous RPC forbidden';
  raise notice 'Battle no-voice runtime assertions passed';
end;
$$;
rollback;
