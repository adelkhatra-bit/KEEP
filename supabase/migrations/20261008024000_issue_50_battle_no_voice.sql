-- Annulation = remplacement à la même position : aucun point, échec ou FREE.
create table public.keep_battle_excluded_tracks (
  track_id uuid primary key references public.tracks(id),
  reports integer not null default 0 check (reports >= 0),
  updated_at timestamptz not null default now()
);
create table public.keep_battle_solo_report_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  pack jsonb not null,
  current_position integer not null default 1,
  created_at timestamptz not null default now()
);
create table public.keep_battle_no_voice_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  track_id uuid not null references public.tracks(id),
  arena_id uuid references public.keep_battle_arenas(id),
  round_id uuid,
  solo_token uuid references public.keep_battle_solo_report_sessions(id),
  position integer not null,
  round_started_at timestamptz,
  cancelled_answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create unique index battle_no_voice_arena_dedupe
  on public.keep_battle_no_voice_reports(profile_id, round_id, round_started_at) where arena_id is not null;
create unique index battle_no_voice_solo_dedupe
  on public.keep_battle_no_voice_reports(profile_id, solo_token, position, track_id) where solo_token is not null;
alter table public.keep_battle_excluded_tracks enable row level security;
alter table public.keep_battle_solo_report_sessions enable row level security;
alter table public.keep_battle_no_voice_reports enable row level security;
revoke all on public.keep_battle_excluded_tracks, public.keep_battle_solo_report_sessions,
  public.keep_battle_no_voice_reports from public, anon, authenticated;

create view public.keep_battle_voice_eligible_tracks as
select t.* from public.tracks t where not exists (
  select 1 from public.keep_battle_excluded_tracks e where e.track_id=t.id and e.reports>=2);
revoke all on public.keep_battle_voice_eligible_tracks from public, anon, authenticated;
grant select on public.keep_battle_voice_eligible_tracks to anon, authenticated;

-- Keep the actual canonical algorithms: style balance, playlists, memory,
-- participants and four choices. Only their candidate pool is restricted.
do $$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.keep_battle_solo_pack_three_choices(text,integer,text[])',
    'public.keep_battle_arena_seed_rounds(uuid,integer)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('public.tracks t' in definition)=0 then
      raise exception 'BATTLE_DRAW_PATCH_SOURCE_CHANGED:%',signature;
    end if;
    execute replace(definition,'public.tracks t','public.keep_battle_voice_eligible_tracks t');
  end loop;
end;
$$;
alter function public.keep_battle_solo_pack(text,integer,text[]) rename to keep_battle_solo_pack_voice_catalog;
revoke all on function public.keep_battle_solo_pack_voice_catalog(text,integer,text[]) from public,anon,authenticated;

create function public.keep_battle_solo_pack(p_theme_code text default 'MIX',
  p_round_count integer default 8,p_theme_codes text[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare payload jsonb; token uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  payload:=public.keep_battle_solo_pack_voice_catalog(p_theme_code,p_round_count,p_theme_codes);
  insert into public.keep_battle_solo_report_sessions(profile_id,pack)
    values(auth.uid(),payload) returning id into token;
  return payload || jsonb_build_object('reportToken',token);
end;
$$;
revoke all on function public.keep_battle_solo_pack(text,integer,text[]) from public,anon;
grant execute on function public.keep_battle_solo_pack(text,integer,text[]) to authenticated;

create function public.keep_battle_solo_round_active(p_token uuid,p_position integer,p_track_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s public.keep_battle_solo_report_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into s from public.keep_battle_solo_report_sessions
    where id=p_token and profile_id=auth.uid() for update;
  if not found or p_position is null or p_track_id is null or s.created_at<now()-interval '2 hours'
    or p_position not between s.current_position and s.current_position+1
    or (s.pack->'rounds'->(p_position-1)->>'trackId')::uuid is distinct from p_track_id
  then raise exception 'BATTLE_SOLO_ROUND_INVALID'; end if;
  update public.keep_battle_solo_report_sessions set current_position=p_position where id=s.id;
end;
$$;
revoke all on function public.keep_battle_solo_round_active(uuid,integer,uuid) from public,anon;
grant execute on function public.keep_battle_solo_round_active(uuid,integer,uuid) to authenticated;

create function public.keep_battle_report_no_voice(p_arena_id uuid,p_match_no integer,
  p_position integer,p_started_at timestamptz,p_solo_token uuid,p_track_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  a public.keep_battle_arenas%rowtype;
  r public.keep_battle_arena_rounds%rowtype;
  s public.keep_battle_solo_report_sessions%rowtype;
  replacement jsonb;
  replacement_pack jsonb;
  reported uuid;
  start_at timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_position is null or p_position<1 then raise exception 'BATTLE_ROUND_INVALID'; end if;
  if p_arena_id is not null then
    select * into a from public.keep_battle_arenas where id=p_arena_id for update;
    if not found or a.status<>'ACTIVE' or a.match_no is distinct from p_match_no
      or a.current_round is distinct from p_position
      or not exists(select 1 from public.keep_battle_arena_members
        where arena_id=a.id and profile_id=uid and seat_status='ACTIVE')
    then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
    select * into r from public.keep_battle_arena_rounds
      where arena_id=a.id and match_no=a.match_no and position=a.current_round for update;
    if not found then raise exception 'BATTLE_ROUND_INVALID'; end if;
    if exists(select 1 from public.keep_battle_no_voice_reports
      where profile_id=uid and round_id=r.id and round_started_at=p_started_at)
    then return public.keep_battle_arena_state(a.id); end if;
    if r.finalized_at is not null or r.started_at is null or r.closes_at is null
      or r.started_at is distinct from p_started_at
      or r.started_at>now() or r.closes_at<=now()
    then raise exception 'BATTLE_ROUND_INVALID'; end if;
    reported:=r.track_id;
  else
    select * into s from public.keep_battle_solo_report_sessions
      where id=p_solo_token and profile_id=uid for update;
    if not found or s.created_at<now()-interval '2 hours'
      or s.current_position is distinct from p_position
    then raise exception 'BATTLE_SOLO_ROUND_INVALID'; end if;
    if exists(select 1 from public.keep_battle_no_voice_reports
      where profile_id=uid and solo_token=s.id and position=p_position and track_id=p_track_id)
    then return jsonb_build_object('round',s.pack->'rounds'->(p_position-1)); end if;
    reported:=(s.pack->'rounds'->(p_position-1)->>'trackId')::uuid;
    if reported is null or reported is distinct from p_track_id then raise exception 'BATTLE_SOLO_ROUND_INVALID'; end if;
  end if;
  insert into public.keep_battle_no_voice_reports(
    profile_id,track_id,arena_id,round_id,solo_token,position,round_started_at,cancelled_answers)
  values(uid,reported,p_arena_id,r.id,s.id,p_position,p_started_at,
    coalesce((select jsonb_agg(to_jsonb(x)) from public.keep_battle_arena_answers x where x.round_id=r.id),'[]'::jsonb));
  insert into public.keep_battle_excluded_tracks(track_id,reports) values(reported,1)
  on conflict(track_id) do update set reports=keep_battle_excluded_tracks.reports+1,updated_at=now();
  replacement_pack:=public.keep_battle_solo_pack_voice_catalog(
    coalesce(r.theme_code,s.pack->>'themeCode','MIX'),30,null);
  select item into replacement from jsonb_array_elements(replacement_pack->'rounds') item
  where (item->>'trackId')::uuid<>reported
    and not exists(select 1 from public.keep_battle_arena_rounds used
      where used.arena_id=p_arena_id and used.match_no=p_match_no and used.track_id=(item->>'trackId')::uuid)
    and not exists(select 1 from jsonb_array_elements(coalesce(s.pack->'rounds','[]'::jsonb)) used
      where used->>'trackId'=item->>'trackId')
    and not exists(select 1 from public.keep_battle_arena_members am
      join public.playlists pl on pl.owner_id=am.profile_id
      join public.playlist_tracks pt on pt.playlist_id=pl.id
      where am.arena_id=p_arena_id and am.seat_status='ACTIVE' and pt.track_id=(item->>'trackId')::uuid)
  limit 1;
  if replacement is null then raise exception 'BATTLE_REPLACEMENT_UNAVAILABLE'; end if;
  replacement:=replacement || jsonb_build_object('position',p_position);
  if p_arena_id is null then
    update public.keep_battle_solo_report_sessions
      set pack=jsonb_set(pack,array['rounds',(p_position-1)::text],replacement) where id=s.id;
    return jsonb_build_object('round',replacement);
  end if;
  -- Preserve the unscored answers in the audit snapshot, remove only the
  -- temporary answer lock. No player, misses, stake or ledger is modified.
  delete from public.keep_battle_arena_answers where round_id=r.id;
  start_at:=now()+interval '5 seconds';
  update public.keep_battle_arena_rounds set
    track_id=(replacement->>'trackId')::uuid,title_snapshot=replacement->>'title',
    artist_snapshot=replacement->>'artist',artwork_url=replacement->>'artworkUrl',
    preview_url=replacement->>'previewUrl',theme_code=replacement->>'themeCode',
    choices=replacement->'choices',started_at=start_at,closes_at=start_at+interval '10 seconds',
    finalized_at=null,reveal_until=null where id=r.id;
  return public.keep_battle_arena_state(a.id);
end;
$$;
revoke all on function public.keep_battle_report_no_voice(uuid,integer,integer,timestamptz,uuid,uuid) from public,anon;
grant execute on function public.keep_battle_report_no_voice(uuid,integer,integer,timestamptz,uuid,uuid) to authenticated;
