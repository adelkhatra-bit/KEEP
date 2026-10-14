-- Keep live invitations from blocking an arena after their expiry and reserve
-- each pending invitee's seat until they decide or the invitation expires.
do $migration$
declare
  ddl text;
  old_text text;
  new_text text;
begin
  select pg_get_functiondef('public.keep_battle_arena_start(uuid)'::regprocedure) into ddl;
  old_text := 'where arena_id = a.id and status = ''PENDING'';';
  new_text := 'where arena_id = a.id and status = ''PENDING'' and expires_at > now();';
  if position('and expires_at > now()' in ddl) = 0 then
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_START_PENDING_INVITE_GUARD_NOT_FOUND'; end if;
    execute replace(ddl, old_text, new_text);
  end if;

  select pg_get_functiondef('public.keep_battle_arena_challenge_send(uuid,uuid)'::regprocedure) into ddl;
  if position('for update' in ddl) = 0 then raise exception 'BATTLE_INVITE_ARENA_LOCK_NOT_FOUND'; end if;
  if position('active_count+coalesce(pending_count,0)>=a.max_players' in ddl) = 0 then
    old_text := ' active_count integer;';
    new_text := ' active_count integer;
 pending_count integer;';
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_INVITE_CAPACITY_DECLARATION_NOT_FOUND'; end if;
    ddl := replace(ddl, old_text, new_text);
    old_text := ' select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status=''ACTIVE'';
 if active_count>=a.max_players then raise exception ''BATTLE_ARENA_FULL''; end if;';
    new_text := ' select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status=''ACTIVE'';
 select count(distinct c.target_id)::integer into pending_count
 from public.keep_battle_challenges c
 where c.arena_id=a.id
   and c.status=''PENDING''
   and c.expires_at>now()
   and c.target_id<>p_target_id
   and not exists(
     select 1 from public.keep_battle_arena_members m
     where m.arena_id=a.id and m.profile_id=c.target_id and m.seat_status=''ACTIVE''
   );
 if active_count+coalesce(pending_count,0)>=a.max_players then raise exception ''BATTLE_ARENA_FULL''; end if;';
      if position(old_text in ddl) = 0 then raise exception 'BATTLE_INVITE_CAPACITY_CHECK_NOT_FOUND'; end if;
      execute replace(ddl, old_text, new_text);
    end if;

    select pg_get_functiondef('public.keep_battle_arena_state(uuid)'::regprocedure) into ddl;
    old_text := 'select greatest(0,a.max_players-count(*)) into open_seats from public.keep_battle_arena_members where arena_id=a.id and seat_status=''ACTIVE'';';
    new_text := 'select greatest(0,a.max_players
    - (select count(*) from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status=''ACTIVE'')
    - (select count(distinct c.target_id) from public.keep_battle_challenges c
       where c.arena_id=a.id and c.status=''PENDING'' and c.expires_at>now()
         and not exists(select 1 from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id=c.target_id and m.seat_status=''ACTIVE'')))
    into open_seats;';
  if position('count(distinct c.target_id) from public.keep_battle_challenges' in ddl) = 0 then
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_STATE_OPEN_SEATS_NOT_FOUND'; end if;
    execute replace(ddl, old_text, new_text);
  end if;

  select pg_get_functiondef('public.keep_battle_arena_join(text)'::regprocedure) into ddl;
  if position('active_count+coalesce(pending_count,0)<a.max_players' in ddl) = 0 then
    old_text := ' active_count integer;';
    new_text := ' active_count integer; pending_count integer;';
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_JOIN_CAPACITY_DECLARATION_NOT_FOUND'; end if;
    ddl := replace(ddl, old_text, new_text);
    old_text := ' next_status:=case when a.status=''ACTIVE'' then ''QUEUED'' when active_count<a.max_players then ''ACTIVE'' else ''QUEUED'' end;';
    new_text := ' select count(distinct c.target_id) into pending_count
 from public.keep_battle_challenges c
 where c.arena_id=a.id and c.status=''PENDING'' and c.expires_at>now()
   and not exists(select 1 from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id=c.target_id and m.seat_status=''ACTIVE'');
 next_status:=case when a.status=''ACTIVE'' then ''QUEUED'' when active_count+coalesce(pending_count,0)<a.max_players then ''ACTIVE'' else ''QUEUED'' end;';
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_JOIN_CAPACITY_CHECK_NOT_FOUND'; end if;
    execute replace(ddl, old_text, new_text);
  end if;

  select pg_get_functiondef('public.keep_battle_arena_matchmake(text)'::regprocedure) into ddl;
  if position('active_count+coalesce(pending_count,0)<a.max_players' in ddl) = 0 then
    old_text := ' active_count integer;';
    new_text := ' active_count integer; pending_count integer;';
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_MATCHMAKE_CAPACITY_DECLARATION_NOT_FOUND'; end if;
    ddl := replace(ddl, old_text, new_text);
    old_text := 'existing_status:=case when active_count<a.max_players then ''ACTIVE'' else ''QUEUED'' end;';
    new_text := 'select count(distinct c.target_id) into pending_count
  from public.keep_battle_challenges c
  where c.arena_id=a.id and c.status=''PENDING'' and c.expires_at>now()
    and not exists(select 1 from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id=c.target_id and m.seat_status=''ACTIVE'');
  existing_status:=case when active_count+coalesce(pending_count,0)<a.max_players then ''ACTIVE'' else ''QUEUED'' end;';
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_MATCHMAKE_CAPACITY_CHECK_NOT_FOUND'; end if;
    execute replace(ddl, old_text, new_text);
  end if;

  select pg_get_functiondef('public.keep_battle_open_salons(text)'::regprocedure) into ddl;
  old_text := '''openSeats'',greatest(0,y.max_players-y.players),';
  new_text := '''openSeats'',greatest(0,y.max_players-y.players-y.pending_invites),';
  if position('pending_invites' in ddl) = 0 then
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_SALON_OPEN_SEATS_NOT_FOUND'; end if;
    ddl := replace(ddl, old_text, new_text);
    old_text := '(select count(*)::int from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status=''QUEUED'') queue_count';
    new_text := '(select count(*)::int from public.keep_battle_arena_members m where m.arena_id=a.id and m.seat_status=''QUEUED'') queue_count,
         (select count(distinct c.target_id)::int from public.keep_battle_challenges c
          where c.arena_id=a.id and c.status=''PENDING'' and c.expires_at>now()
            and not exists(select 1 from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id=c.target_id and m.seat_status=''ACTIVE'')) pending_invites';
    if position(old_text in ddl) = 0 then raise exception 'BATTLE_SALON_PENDING_INVITES_NOT_FOUND'; end if;
    execute replace(ddl, old_text, new_text);
  end if;
end;
$migration$;
