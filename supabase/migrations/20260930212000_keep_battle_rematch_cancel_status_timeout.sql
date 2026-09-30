-- KEEP/Loki Battle — fin de match contrôlée par les joueurs.
-- 1) Aucun nouveau match ne démarre avant un appui explicite sur REVANCHE.
-- 2) Le proposeur peut retirer sa demande tant qu'aucun autre joueur n'a accepté.
-- 3) Les réponses sont visibles par pseudo avec un délai de 20 secondes.
-- 4) À l'échéance, les non-répondants restent hors du nouveau match et reçoivent
--    une notification; si au moins deux joueurs ont accepté, le Battle repart sans eux.

alter table public.keep_battle_arenas
  add column if not exists rematch_proposer_id uuid;

create index if not exists idx_keep_battle_arenas_rematch_proposer
  on public.keep_battle_arenas(rematch_proposer_id)
  where rematch_proposer_id is not null;

create or replace function public.keep_battle_arena_propose_rematch(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  my_name text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;

  if a.status <> 'WAITING' or a.match_no <= 1 then
    raise exception 'BATTLE_ARENA_NOT_READY_FOR_REMATCH';
  end if;

  if not exists(
    select 1
    from public.keep_battle_arena_match_results r
    where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=uid
  ) then
    raise exception 'BATTLE_ARENA_FORBIDDEN';
  end if;

  if a.rematch_deadline is not null then
    if a.rematch_deadline > now() then
      if a.rematch_proposer_id=uid then
        return public.keep_battle_arena_state(a.id);
      end if;
      raise exception 'BATTLE_REMATCH_ALREADY_PENDING';
    end if;
    perform public.keep_battle_arena_finalize_rematch(a.id);
    select * into a from public.keep_battle_arenas where id=p_arena_id for update;
    if a.status <> 'WAITING' then
      return public.keep_battle_arena_state(a.id);
    end if;
  end if;

  update public.keep_battle_arena_members m
  set rematch_ready=case when m.profile_id=uid then true else null end
  where m.arena_id=a.id
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=now()+interval '20 seconds',
      rematch_proposer_id=uid,
      updated_at=now()
  where id=a.id;

  select coalesce(nullif(username,''),'Loki') into my_name
  from public.profiles where id=uid;

  insert into public.notifications(profile_id,type,title,body,data)
  select r.profile_id,
         'BATTLE_ARENA_REMATCH',
         '🔁 Revanche proposée',
         format('@%s propose une revanche. Tu as 20 secondes pour répondre.',my_name),
         jsonb_build_object(
           'arenaId',a.id,
           'arenaCode',a.arena_code,
           'proposerId',uid,
           'expiresAt',now()+interval '20 seconds',
           'presentation','battle_inline'
         )
  from public.keep_battle_arena_match_results r
  where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id<>uid;

  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_rematch_respond(p_arena_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;

  if not exists(
    select 1 from public.keep_battle_arena_match_results r
    where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=uid
  ) then
    raise exception 'BATTLE_ARENA_FORBIDDEN';
  end if;

  if a.rematch_deadline is null then
    return public.keep_battle_arena_state(a.id);
  end if;

  if a.rematch_deadline <= now() then
    perform public.keep_battle_arena_finalize_rematch(a.id);
    return public.keep_battle_arena_state(a.id);
  end if;

  update public.keep_battle_arena_members
  set rematch_ready=p_ready
  where arena_id=a.id and profile_id=uid;

  perform public.keep_battle_arena_finalize_rematch(a.id);
  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_cancel_rematch(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  accepted_others integer:=0;
  my_name text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;

  if a.rematch_deadline is null then
    return public.keep_battle_arena_state(a.id);
  end if;

  if a.rematch_deadline <= now() then
    perform public.keep_battle_arena_finalize_rematch(a.id);
    return public.keep_battle_arena_state(a.id);
  end if;

  if a.rematch_proposer_id is distinct from uid then
    raise exception 'BATTLE_REMATCH_CANCEL_FORBIDDEN';
  end if;

  select count(*) into accepted_others
  from public.keep_battle_arena_members m
  where m.arena_id=a.id
    and m.profile_id<>uid
    and m.rematch_ready=true
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  if accepted_others>0 then
    raise exception 'BATTLE_REMATCH_ALREADY_ACCEPTED';
  end if;

  update public.keep_battle_arena_members m
  set rematch_ready=null
  where m.arena_id=a.id
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=null,
      rematch_proposer_id=null,
      updated_at=now()
  where id=a.id;

  select coalesce(nullif(username,''),'Loki') into my_name
  from public.profiles where id=uid;

  insert into public.notifications(profile_id,type,title,body,data)
  select r.profile_id,
         'BATTLE_ARENA_REMATCH_CANCELLED',
         'Revanche retirée',
         format('@%s a retiré sa demande de revanche.',my_name),
         jsonb_build_object('arenaId',a.id,'arenaCode',a.arena_code,'proposerId',uid)
  from public.keep_battle_arena_match_results r
  where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id<>uid;

  return public.keep_battle_arena_state(a.id);
end;
$function$;

create or replace function public.keep_battle_arena_rematch_status(p_arena_id uuid)
returns table(
  profile_id uuid,
  username text,
  rematch_ready boolean,
  is_proposer boolean,
  is_me boolean,
  rematch_deadline timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  a public.keep_battle_arenas%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id=p_arena_id;
  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;

  if not exists(select 1 from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id=uid) then
    raise exception 'BATTLE_ARENA_FORBIDDEN';
  end if;

  return query
  select m.profile_id,
         coalesce(nullif(p.username,''),'Loki')::text,
         m.rematch_ready,
         m.profile_id=a.rematch_proposer_id,
         m.profile_id=uid,
         a.rematch_deadline
  from public.keep_battle_arena_members m
  join public.profiles p on p.id=m.profile_id
  where m.arena_id=a.id
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    )
  order by (m.profile_id=a.rematch_proposer_id) desc, lower(coalesce(p.username,'')), m.profile_id;
end;
$function$;

create or replace function public.keep_battle_arena_finalize_rematch(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a public.keep_battle_arenas%rowtype;
  active_count integer:=0;
  undecided_count integer:=0;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id for update;
  if not found or a.status<>'WAITING' or a.rematch_deadline is null then return; end if;

  select count(*) into undecided_count
  from public.keep_battle_arena_members m
  where m.arena_id=a.id
    and m.rematch_ready is null
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  if undecided_count>0 and a.rematch_deadline>now() then return; end if;

  if a.rematch_deadline<=now() then
    insert into public.notifications(profile_id,type,title,body,data)
    select m.profile_id,
           'BATTLE_ARENA_REMATCH_MISSED',
           '⏱ Battle manqué',
           'Désolé, tu as loupé ce Battle. Attends le prochain tour.',
           jsonb_build_object('arenaId',a.id,'arenaCode',a.arena_code,'reason','REMATCH_TIMEOUT')
    from public.keep_battle_arena_members m
    where m.arena_id=a.id
      and m.rematch_ready is null
      and exists(
        select 1 from public.keep_battle_arena_match_results r
        where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
      );
  end if;

  update public.keep_battle_arena_members m
  set seat_status='ACTIVE'
  where m.arena_id=a.id
    and m.rematch_ready=true
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arena_members m
  set seat_status='ELIMINATED'
  where m.arena_id=a.id
    and coalesce(m.rematch_ready,false)=false
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arena_members m
  set rematch_ready=null
  where m.arena_id=a.id
    and exists(
      select 1 from public.keep_battle_arena_match_results r
      where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=m.profile_id
    );

  update public.keep_battle_arenas
  set rematch_deadline=null,
      rematch_proposer_id=null,
      updated_at=now()
  where id=a.id;

  select count(*) into active_count
  from public.keep_battle_arena_members
  where arena_id=a.id and seat_status='ACTIVE';

  if active_count>=2 then
    perform public.keep_battle_arena_start(a.id);
  end if;
end;
$function$;

revoke all on function public.keep_battle_arena_cancel_rematch(uuid) from public, anon;
revoke all on function public.keep_battle_arena_rematch_status(uuid) from public, anon;
grant execute on function public.keep_battle_arena_cancel_rematch(uuid) to authenticated, service_role;
grant execute on function public.keep_battle_arena_rematch_status(uuid) to authenticated, service_role;
grant execute on function public.keep_battle_arena_propose_rematch(uuid) to authenticated, service_role;
grant execute on function public.keep_battle_arena_rematch_respond(uuid,boolean) to authenticated, service_role;
