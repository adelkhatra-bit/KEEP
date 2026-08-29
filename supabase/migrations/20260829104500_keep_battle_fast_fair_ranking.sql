-- KEEP Battle fairness + fast progression + winner history.
-- 1) Never serve tracks already present in the authenticated player's playlists.
-- 2) In multiplayer, exclude tracks present in any active participant playlist.
-- 3) Finalize when everybody answered OR when the deadline expires; reveal only 1.5s.
-- 4) Expose authenticated arena winner history to arena members only.

create or replace function public.keep_battle_solo_pack(p_theme_code text default 'MIX', p_round_count integer default 8)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_theme text := upper(trim(coalesce(p_theme_code, 'MIX')));
  v_round_count integer := greatest(5, least(coalesce(p_round_count, 8), 12));
  v_rounds jsonb;
begin
  if v_theme = '' then v_theme := 'MIX'; end if;
  if v_theme <> 'MIX' and not exists (
    select 1 from public.keep_battle_themes t where t.code = v_theme and t.enabled = true
  ) then v_theme := 'MIX'; end if;

  with candidates as (
    select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
      case when v_theme='MIX' then 0 when exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=v_theme) then 0 else 1 end as theme_priority
    from public.tracks t
    where t.preview_url is not null and t.preview_url<>'' and trim(coalesce(t.title,''))<>'' and trim(coalesce(t.artist,''))<>''
      and not (
        uid is not null and exists (
          select 1
          from public.playlists p
          join public.playlist_tracks pt on pt.playlist_id=p.id
          where p.owner_id=uid and pt.track_id=t.id
        )
      )
    order by theme_priority, random()
    limit v_round_count
  ), packed as (
    select row_number() over ()::integer as position,c.*,
      coalesce((select jsonb_agg(v order by random()) from (
        select c.artist::text v
        union
        select artist from (
          select trim(t2.artist) artist from public.tracks t2
          where trim(coalesce(t2.artist,''))<>'' and lower(trim(t2.artist))<>lower(trim(c.artist))
          group by trim(t2.artist) order by random() limit 2
        ) d
      ) q),'[]'::jsonb) as choices
    from candidates c
  )
  select jsonb_agg(jsonb_build_object(
    'position',p.position,'trackId',p.id,'title',p.title,'artist',p.artist,
    'artworkUrl',p.artwork_url,'previewUrl',p.preview_url,'releaseYear',p.release_year,
    'choices',p.choices,'correctAnswer',p.artist
  ) order by p.position) into v_rounds from packed p;

  if jsonb_array_length(coalesce(v_rounds,'[]'::jsonb)) < 5 then raise exception 'BATTLE_CATALOG_TOO_SMALL'; end if;
  return jsonb_build_object('mode','SOLO_TRAINING','themeCode',v_theme,'roundCount',jsonb_array_length(v_rounds),'stakeFree',0,'rewardFree',0,'rounds',v_rounds);
end;
$function$;

create or replace function public.keep_battle_arena_seed_rounds(p_arena_id uuid, p_match_no integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 a public.keep_battle_arenas%rowtype; inserted integer; rr record; opts jsonb;
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id;
 if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 delete from public.keep_battle_arena_rounds where arena_id=a.id and match_no=p_match_no;
 with candidates as(
  select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
   case when a.theme_code='MIX' then 0 when exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=a.theme_code) then 0 else 1 end theme_priority
  from public.tracks t
  where t.preview_url is not null and t.preview_url<>'' and trim(coalesce(t.title,''))<>'' and trim(coalesce(t.artist,''))<>''
    and not exists (
      select 1
      from public.keep_battle_arena_members am
      join public.playlists p on p.owner_id=am.profile_id
      join public.playlist_tracks pt on pt.playlist_id=p.id
      where am.arena_id=a.id and am.seat_status='ACTIVE' and pt.track_id=t.id
    )
  order by theme_priority,md5(t.id::text||a.id::text||p_match_no::text||a.theme_code)
  limit a.round_count
 )
 insert into public.keep_battle_arena_rounds(arena_id,match_no,position,track_id,title_snapshot,artist_snapshot,artwork_url,preview_url,release_year_snapshot)
 select a.id,p_match_no,row_number()over()::smallint,id,title,artist,artwork_url,preview_url,release_year from candidates;
 get diagnostics inserted=row_count;
 if inserted<5 then raise exception 'BATTLE_CATALOG_TOO_SMALL'; end if;

 for rr in select id,artist_snapshot from public.keep_battle_arena_rounds where arena_id=a.id and match_no=p_match_no loop
   select coalesce(jsonb_agg(v order by md5(v||rr.id::text)),'[]'::jsonb) into opts
   from (
     select rr.artist_snapshot::text v
     union
     select artist from (
       select distinct trim(artist) artist
       from public.tracks
       where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
       order by md5(trim(artist)||rr.id::text)
       limit 2
     )d
   )q;
   update public.keep_battle_arena_rounds set choices=opts where id=rr.id;
 end loop;
end;
$function$;

create or replace function public.keep_battle_arena_finalize_round(p_arena_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare a public.keep_battle_arenas%rowtype; r public.keep_battle_arena_rounds%rowtype; active_count integer; answer_count integer;
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id for update;
 if not found or a.status<>'ACTIVE' then return; end if;
 select * into r from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round for update;
 if not found or r.finalized_at is not null then return; end if;
 select count(*) into active_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 select count(*) into answer_count from public.keep_battle_arena_answers where round_id=r.id;
 if answer_count<active_count and coalesce(r.closes_at,now()+interval '1 second')>now() then return; end if;

 update public.keep_battle_arena_answers
 set is_correct=(lower(trim(coalesce(selected_answer,'')))=lower(trim(r.artist_snapshot))),
     points=case when lower(trim(coalesce(selected_answer,'')))=lower(trim(r.artist_snapshot)) then 1000 else 0 end
 where round_id=r.id;

 update public.keep_battle_arena_members m
 set score=m.score+case when z.is_correct then 1000 else 0 end,
     correct_predictions=m.correct_predictions+case when z.is_correct then 1 else 0 end,
     total_response_ms=m.total_response_ms+case when z.is_correct then z.response_ms else 0 end
 from public.keep_battle_arena_answers z
 where m.arena_id=a.id and m.profile_id=z.profile_id and z.round_id=r.id and m.seat_status='ACTIVE';

 update public.keep_battle_arena_rounds set finalized_at=now(),reveal_until=now()+interval '1500 milliseconds' where id=r.id;
end;
$function$;

create or replace function public.keep_battle_arena_winner_history(p_arena_id uuid, p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.keep_battle_arena_members where arena_id=p_arena_id and profile_id=uid) then
    raise exception 'BATTLE_ARENA_FORBIDDEN';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'matchNo',x.match_no,
    'profileId',x.profile_id,
    'username',x.username,
    'avatarUrl',x.avatar_url,
    'score',x.score,
    'responseMs',x.total_response_ms,
    'createdAt',x.created_at
  ) order by x.match_no desc),'[]'::jsonb)
  into result
  from (
    select r.match_no,r.profile_id,p.username,p.avatar_url,r.score,r.total_response_ms,r.created_at
    from public.keep_battle_arena_match_results r
    join public.profiles p on p.id=r.profile_id
    where r.arena_id=p_arena_id and r.placement=1
    order by r.match_no desc
    limit greatest(1,least(coalesce(p_limit,10),20))
  ) x;
  return result;
end;
$function$;

revoke all on function public.keep_battle_arena_winner_history(uuid,integer) from public, anon;
grant execute on function public.keep_battle_arena_winner_history(uuid,integer) to authenticated;
