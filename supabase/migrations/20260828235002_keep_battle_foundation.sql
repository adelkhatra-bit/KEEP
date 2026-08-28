-- KEEP BATTLE — additive social game foundation.
-- Game decisions never overwrite canonical keep_decisions.

create table if not exists public.keep_battles (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid references public.profiles(id) on delete set null,
  status text not null default 'WAITING' check (status in ('WAITING','ACTIVE','COMPLETED','EXPIRED')),
  mode text not null default 'PREDICT_TASTE' check (mode in ('PREDICT_TASTE')),
  round_count smallint not null default 8 check (round_count between 5 and 20),
  challenger_score integer not null default 0,
  opponent_score integer not null default 0,
  compatibility_score integer,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists public.keep_battle_rounds (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.keep_battles(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  track_id uuid references public.tracks(id) on delete set null,
  title_snapshot text not null,
  artist_snapshot text not null,
  artwork_url text,
  preview_url text,
  created_at timestamptz not null default now(),
  unique (battle_id, position)
);

create table if not exists public.keep_battle_moves (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.keep_battles(id) on delete cascade,
  round_id uuid not null references public.keep_battle_rounds(id) on delete cascade,
  player_id uuid references public.profiles(id) on delete set null,
  slot text not null check (slot in ('CHALLENGER','OPPONENT')),
  actual_decision text not null check (actual_decision in ('KEEP','PASS')),
  predicted_other_decision text not null check (predicted_other_decision in ('KEEP','PASS')),
  points_awarded integer not null default 0,
  submitted_at timestamptz not null default now(),
  unique (round_id, slot)
);

create table if not exists public.keep_battle_stats (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  battles_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  reads_correct integer not null default 0,
  reads_total integer not null default 0,
  mutual_keeps integer not null default 0,
  xp bigint not null default 0,
  current_win_streak integer not null default 0,
  best_win_streak integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_keep_battles_challenger_created on public.keep_battles(challenger_id, created_at desc);
create index if not exists idx_keep_battles_opponent_created on public.keep_battles(opponent_id, created_at desc);
create index if not exists idx_keep_battles_status_expires on public.keep_battles(status, expires_at);
create index if not exists idx_keep_battle_rounds_battle_position on public.keep_battle_rounds(battle_id, position);
create index if not exists idx_keep_battle_moves_battle_slot on public.keep_battle_moves(battle_id, slot);
create index if not exists idx_tracks_preview_created on public.tracks(created_at desc) where preview_url is not null and preview_url <> '';

alter table public.keep_battles enable row level security;
alter table public.keep_battle_rounds enable row level security;
alter table public.keep_battle_moves enable row level security;
alter table public.keep_battle_stats enable row level security;

revoke all on public.keep_battles from anon, authenticated;
revoke all on public.keep_battle_rounds from anon, authenticated;
revoke all on public.keep_battle_moves from anon, authenticated;
revoke all on public.keep_battle_stats from anon, authenticated;

create or replace function public.keep_battle_create(p_round_count integer default 8, p_opponent_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_battle public.keep_battles%rowtype;
  v_rounds integer := greatest(5, least(coalesce(p_round_count,8), 12));
  v_inserted integer := 0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id=v_user) then raise exception 'PROFILE_REQUIRED'; end if;
  if p_opponent_id = v_user then raise exception 'SELF_BATTLE_NOT_ALLOWED'; end if;
  if p_opponent_id is not null and not exists (
    select 1 from public.profiles where id=p_opponent_id and is_public=true and coalesce(discovery_hidden,false)=false
  ) then raise exception 'OPPONENT_NOT_AVAILABLE'; end if;

  insert into public.keep_battles(challenger_id, opponent_id, round_count)
  values (v_user, p_opponent_id, v_rounds)
  returning * into v_battle;

  with me as (
    select coalesce(favorite_artists,'{}'::text[]) artists
    from public.profiles where id=v_user
  ), candidates as (
    select t.id,t.title,t.artist,t.artwork_url,t.preview_url,
      case when exists (
        select 1 from me, unnest(me.artists) a
        where lower(trim(a)) = lower(trim(t.artist))
      ) then 0 else 1 end as affinity
    from public.tracks t
    where t.preview_url is not null and t.preview_url <> ''
      and trim(coalesce(t.title,'')) <> '' and trim(coalesce(t.artist,'')) <> ''
    order by affinity, md5(t.id::text || v_battle.id::text)
    limit v_rounds
  )
  insert into public.keep_battle_rounds(battle_id,position,track_id,title_snapshot,artist_snapshot,artwork_url,preview_url)
  select v_battle.id, row_number() over ()::smallint, id,title,artist,artwork_url,preview_url
  from candidates;

  get diagnostics v_inserted = row_count;
  if v_inserted < 5 then
    delete from public.keep_battles where id=v_battle.id;
    raise exception 'BATTLE_CATALOG_TOO_SMALL';
  end if;
  if v_inserted <> v_rounds then
    update public.keep_battles set round_count=v_inserted where id=v_battle.id returning * into v_battle;
  end if;

  return jsonb_build_object(
    'id', v_battle.id,
    'inviteCode', v_battle.invite_code,
    'status', v_battle.status,
    'roundCount', v_battle.round_count,
    'expiresAt', v_battle.expires_at
  );
end;
$$;

create or replace function public.keep_battle_join(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_battle public.keep_battles%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_battle from public.keep_battles
  where invite_code = upper(trim(p_invite_code))
  for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if v_battle.expires_at <= now() then
    update public.keep_battles set status='EXPIRED' where id=v_battle.id and status <> 'COMPLETED';
    raise exception 'BATTLE_EXPIRED';
  end if;
  if v_battle.challenger_id = v_user then return jsonb_build_object('id',v_battle.id,'status',v_battle.status,'role','CHALLENGER'); end if;
  if v_battle.opponent_id is not null and v_battle.opponent_id <> v_user then raise exception 'BATTLE_RESERVED'; end if;

  update public.keep_battles
  set opponent_id=v_user, status='ACTIVE', accepted_at=coalesce(accepted_at,now())
  where id=v_battle.id
  returning * into v_battle;

  return jsonb_build_object('id',v_battle.id,'status',v_battle.status,'role','OPPONENT');
end;
$$;

create or replace function public.keep_battle_state(p_battle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_battle public.keep_battles%rowtype;
  v_slot text;
  v_rounds jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_battle from public.keep_battles where id=p_battle_id;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if v_battle.challenger_id=v_user then v_slot := 'CHALLENGER';
  elsif v_battle.opponent_id=v_user then v_slot := 'OPPONENT';
  else raise exception 'BATTLE_FORBIDDEN'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'position', r.position,
    'track', jsonb_build_object('id',r.track_id,'title',r.title_snapshot,'artist',r.artist_snapshot,'artworkUrl',r.artwork_url,'previewUrl',r.preview_url),
    'myMove', case when mine.id is null then null else jsonb_build_object('actual',mine.actual_decision,'prediction',mine.predicted_other_decision,'points',mine.points_awarded) end,
    'opponentMove', case when mine.id is not null and theirs.id is not null then jsonb_build_object('actual',theirs.actual_decision,'prediction',theirs.predicted_other_decision,'points',theirs.points_awarded) else null end,
    'resolved', (mine.id is not null and theirs.id is not null)
  ) order by r.position),'[]'::jsonb)
  into v_rounds
  from public.keep_battle_rounds r
  left join public.keep_battle_moves mine on mine.round_id=r.id and mine.slot=v_slot
  left join public.keep_battle_moves theirs on theirs.round_id=r.id and theirs.slot=(case when v_slot='CHALLENGER' then 'OPPONENT' else 'CHALLENGER' end)
  where r.battle_id=v_battle.id;

  return jsonb_build_object(
    'id',v_battle.id,'inviteCode',v_battle.invite_code,'status',v_battle.status,'role',v_slot,
    'roundCount',v_battle.round_count,'challengerScore',v_battle.challenger_score,'opponentScore',v_battle.opponent_score,
    'compatibilityScore',v_battle.compatibility_score,'expiresAt',v_battle.expires_at,'rounds',v_rounds
  );
end;
$$;

create or replace function public.keep_battle_submit_move(
  p_battle_id uuid,
  p_position integer,
  p_actual_decision text,
  p_predicted_other_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_battle public.keep_battles%rowtype;
  v_round public.keep_battle_rounds%rowtype;
  v_slot text;
  v_other_slot text;
  v_mine public.keep_battle_moves%rowtype;
  v_other public.keep_battle_moves%rowtype;
  v_my_points integer := 0;
  v_other_points integer := 0;
  v_total integer;
  v_complete boolean := false;
  v_challenger_correct integer := 0;
  v_opponent_correct integer := 0;
  v_mutual integer := 0;
  v_challenger_total integer := 0;
  v_opponent_total integer := 0;
  v_equal integer := 0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if upper(p_actual_decision) not in ('KEEP','PASS') or upper(p_predicted_other_decision) not in ('KEEP','PASS') then
    raise exception 'INVALID_BATTLE_DECISION';
  end if;

  select * into v_battle from public.keep_battles where id=p_battle_id for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if v_battle.status in ('COMPLETED','EXPIRED') then raise exception 'BATTLE_CLOSED'; end if;
  if v_battle.expires_at <= now() then
    update public.keep_battles set status='EXPIRED' where id=v_battle.id;
    raise exception 'BATTLE_EXPIRED';
  end if;

  if v_battle.challenger_id=v_user then v_slot:='CHALLENGER'; v_other_slot:='OPPONENT';
  elsif v_battle.opponent_id=v_user then v_slot:='OPPONENT'; v_other_slot:='CHALLENGER';
  else raise exception 'BATTLE_FORBIDDEN'; end if;

  select * into v_round from public.keep_battle_rounds where battle_id=v_battle.id and position=p_position;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;

  insert into public.keep_battle_moves(battle_id,round_id,player_id,slot,actual_decision,predicted_other_decision)
  values(v_battle.id,v_round.id,v_user,v_slot,upper(p_actual_decision),upper(p_predicted_other_decision))
  on conflict (round_id,slot) do nothing;

  select * into v_mine from public.keep_battle_moves where round_id=v_round.id and slot=v_slot;
  select * into v_other from public.keep_battle_moves where round_id=v_round.id and slot=v_other_slot;

  if v_other.id is not null then
    v_my_points := (case when v_mine.predicted_other_decision=v_other.actual_decision then 100 else 0 end)
      + (case when v_mine.actual_decision='KEEP' and v_other.actual_decision='KEEP' then 25 else 0 end);
    v_other_points := (case when v_other.predicted_other_decision=v_mine.actual_decision then 100 else 0 end)
      + (case when v_mine.actual_decision='KEEP' and v_other.actual_decision='KEEP' then 25 else 0 end);
    update public.keep_battle_moves set points_awarded=v_my_points where id=v_mine.id;
    update public.keep_battle_moves set points_awarded=v_other_points where id=v_other.id;
  end if;

  select count(*) into v_total from public.keep_battle_rounds where battle_id=v_battle.id;
  select (count(*) = v_total*2) into v_complete from public.keep_battle_moves where battle_id=v_battle.id;

  if v_complete and v_battle.opponent_id is not null then
    select
      coalesce(sum(points_awarded) filter(where slot='CHALLENGER'),0)::int,
      coalesce(sum(points_awarded) filter(where slot='OPPONENT'),0)::int
    into v_challenger_total,v_opponent_total
    from public.keep_battle_moves where battle_id=v_battle.id;

    select
      count(*) filter(where c.predicted_other_decision=o.actual_decision)::int,
      count(*) filter(where o.predicted_other_decision=c.actual_decision)::int,
      count(*) filter(where c.actual_decision='KEEP' and o.actual_decision='KEEP')::int,
      count(*) filter(where c.actual_decision=o.actual_decision)::int
    into v_challenger_correct,v_opponent_correct,v_mutual,v_equal
    from public.keep_battle_rounds r
    join public.keep_battle_moves c on c.round_id=r.id and c.slot='CHALLENGER'
    join public.keep_battle_moves o on o.round_id=r.id and o.slot='OPPONENT'
    where r.battle_id=v_battle.id;

    update public.keep_battles set
      challenger_score=v_challenger_total,
      opponent_score=v_opponent_total,
      compatibility_score=round(100.0*v_equal/nullif(v_total,0))::int,
      status='COMPLETED', completed_at=now()
    where id=v_battle.id and status <> 'COMPLETED';

    insert into public.keep_battle_stats(profile_id,battles_played,wins,losses,draws,reads_correct,reads_total,mutual_keeps,xp,current_win_streak,best_win_streak,updated_at)
    values(v_battle.challenger_id,1,case when v_challenger_total>v_opponent_total then 1 else 0 end,case when v_challenger_total<v_opponent_total then 1 else 0 end,case when v_challenger_total=v_opponent_total then 1 else 0 end,v_challenger_correct,v_total,v_mutual,v_challenger_total+50,case when v_challenger_total>v_opponent_total then 1 else 0 end,case when v_challenger_total>v_opponent_total then 1 else 0 end,now())
    on conflict(profile_id) do update set battles_played=keep_battle_stats.battles_played+1,wins=keep_battle_stats.wins+excluded.wins,losses=keep_battle_stats.losses+excluded.losses,draws=keep_battle_stats.draws+excluded.draws,reads_correct=keep_battle_stats.reads_correct+excluded.reads_correct,reads_total=keep_battle_stats.reads_total+excluded.reads_total,mutual_keeps=keep_battle_stats.mutual_keeps+excluded.mutual_keeps,xp=keep_battle_stats.xp+excluded.xp,current_win_streak=case when excluded.wins=1 then keep_battle_stats.current_win_streak+1 else 0 end,best_win_streak=greatest(keep_battle_stats.best_win_streak,case when excluded.wins=1 then keep_battle_stats.current_win_streak+1 else keep_battle_stats.best_win_streak end),updated_at=now();

    insert into public.keep_battle_stats(profile_id,battles_played,wins,losses,draws,reads_correct,reads_total,mutual_keeps,xp,current_win_streak,best_win_streak,updated_at)
    values(v_battle.opponent_id,1,case when v_opponent_total>v_challenger_total then 1 else 0 end,case when v_opponent_total<v_challenger_total then 1 else 0 end,case when v_opponent_total=v_challenger_total then 1 else 0 end,v_opponent_correct,v_total,v_mutual,v_opponent_total+50,case when v_opponent_total>v_challenger_total then 1 else 0 end,case when v_opponent_total>v_challenger_total then 1 else 0 end,now())
    on conflict(profile_id) do update set battles_played=keep_battle_stats.battles_played+1,wins=keep_battle_stats.wins+excluded.wins,losses=keep_battle_stats.losses+excluded.losses,draws=keep_battle_stats.draws+excluded.draws,reads_correct=keep_battle_stats.reads_correct+excluded.reads_correct,reads_total=keep_battle_stats.reads_total+excluded.reads_total,mutual_keeps=keep_battle_stats.mutual_keeps+excluded.mutual_keeps,xp=keep_battle_stats.xp+excluded.xp,current_win_streak=case when excluded.wins=1 then keep_battle_stats.current_win_streak+1 else 0 end,best_win_streak=greatest(keep_battle_stats.best_win_streak,case when excluded.wins=1 then keep_battle_stats.current_win_streak+1 else keep_battle_stats.best_win_streak end),updated_at=now();
  end if;

  return public.keep_battle_state(v_battle.id);
end;
$$;

create or replace function public.keep_battle_my_stats()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'battlesPlayed',coalesce(s.battles_played,0),'wins',coalesce(s.wins,0),'losses',coalesce(s.losses,0),'draws',coalesce(s.draws,0),
    'readsCorrect',coalesce(s.reads_correct,0),'readsTotal',coalesce(s.reads_total,0),
    'readAccuracy',case when coalesce(s.reads_total,0)>0 then round(100.0*s.reads_correct/s.reads_total)::int else 0 end,
    'mutualKeeps',coalesce(s.mutual_keeps,0),'xp',coalesce(s.xp,0),
    'currentWinStreak',coalesce(s.current_win_streak,0),'bestWinStreak',coalesce(s.best_win_streak,0)
  )
  from (select auth.uid() id) me
  left join public.keep_battle_stats s on s.profile_id=me.id;
$$;

grant execute on function public.keep_battle_create(integer,uuid) to authenticated;
grant execute on function public.keep_battle_join(text) to authenticated;
grant execute on function public.keep_battle_state(uuid) to authenticated;
grant execute on function public.keep_battle_submit_move(uuid,integer,text,text) to authenticated;
grant execute on function public.keep_battle_my_stats() to authenticated;
