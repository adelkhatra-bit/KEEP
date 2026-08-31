-- KEEP BATTLE — salons sociaux, 3 choix exacts, année de sortie et invitations abonnés.

alter table public.tracks
  add column if not exists release_year smallint;

do $$ begin
  alter table public.tracks add constraint tracks_release_year_sane
    check (release_year is null or release_year between 1900 and 2100);
exception when duplicate_object then null; end $$;

alter table public.keep_battle_arena_rounds
  add column if not exists release_year_snapshot smallint;

create or replace function public.keep_battle_notify_followers(p_arena_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  inviter record;
  theme_label text;
  inserted_count integer := 0;
  web_link text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.keep_battle_arenas where id = p_arena_id;
  if not found or a.host_id <> uid then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;

  select username, display_name into inviter from public.profiles where id = uid;
  select label into theme_label from public.keep_battle_themes where code = a.theme_code;
  theme_label := coalesce(theme_label, a.theme_code, 'Music');
  web_link := 'https://adelkhatra-bit.github.io/KEEP/Main/Discover?arena=' || a.arena_code;

  insert into public.notifications(profile_id, type, title, body, data)
  select
    f.follower_id,
    'BATTLE_INVITE',
    case when lower(coalesce(p.language_code, 'en')) = 'fr'
      then '🎧 ' || coalesce(nullif(inviter.display_name, ''), '@' || inviter.username) || ' te lance un Battle ' || theme_label
      else '🎧 ' || coalesce(nullif(inviter.display_name, ''), '@' || inviter.username) || ' challenges you to a ' || theme_label || ' Battle'
    end,
    case when lower(coalesce(p.language_code, 'en')) = 'fr'
      then 'Tu penses connaître ta musique ? Rejoins le salon et relève le défi. 3 réponses, une seule est juste.'
      else 'Think you know your music? Join the room and take the challenge. 3 choices, only one is right.'
    end,
    jsonb_build_object(
      'kind','battle_invite',
      'arenaId',a.id,
      'arenaCode',a.arena_code,
      'themeCode',a.theme_code,
      'themeLabel',theme_label,
      'inviterUsername',inviter.username,
      'inviterName',coalesce(nullif(inviter.display_name,''),inviter.username),
      'deepLink',web_link
    )
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  left join public.notification_preferences np on np.profile_id = f.follower_id
  where f.followee_id = uid
    and coalesce(np.system_enabled, true) = true
    and coalesce(np.social_enabled, true) = true;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.keep_battle_notify_followers(uuid) from public;
grant execute on function public.keep_battle_notify_followers(uuid) to authenticated;

create or replace function public.keep_battle_arena_seed_rounds(p_arena_id uuid, p_match_no integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.keep_battle_solo_pack(
  p_theme_code text default 'MIX',
  p_round_count integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
$$;

revoke all on function public.keep_battle_solo_pack(text, integer) from public;
grant execute on function public.keep_battle_solo_pack(text, integer) to anon, authenticated;

create or replace function public.keep_battle_arena_create(p_theme_code text default 'MIX', p_round_count integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; theme text:=upper(coalesce(nullif(trim(p_theme_code),''),'MIX')); min_free integer:=3; notified integer:=0;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.profiles where id=uid) then raise exception 'PROFILE_REQUIRED'; end if;
 min_free:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_min_free_required' limit 1),3));
 if public.keep_theoretical_free_credit_remaining_for_profile(uid)<min_free then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
 if not exists(select 1 from public.keep_battle_themes where code=theme and enabled=true) then theme:='MIX'; end if;
 insert into public.keep_battle_arenas(host_id,theme_code,round_count,max_players) values(uid,theme,greatest(5,least(coalesce(p_round_count,8),12)),10) returning * into a;
 insert into public.keep_battle_arena_members(arena_id,profile_id,seat_status) values(a.id,uid,'ACTIVE');
 if not public.keep_battle_arena_lock_stake(a.id,a.match_no,uid) then raise exception 'BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED'; end if;
 perform public.keep_battle_arena_seed_rounds(a.id,1);
 begin notified := public.keep_battle_notify_followers(a.id); exception when others then notified := 0; end;
 return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'status',a.status,'players',1,'maxPlayers',10,'queue',0,'matchNo',1,'stakeFree',min_free,'followersNotified',notified);
end;
$$;

create or replace function public.keep_battle_arena_state(p_arena_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid:=auth.uid(); a public.keep_battle_arenas%rowtype; seats jsonb; board jsonb; current jsonb; me jsonb; queue_count integer; open_seats integer; cr public.keep_battle_arena_rounds%rowtype; round_winner jsonb; last_result jsonb; last_winner jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into a from public.keep_battle_arenas where id=p_arena_id; if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 if not exists(select 1 from public.keep_battle_arena_members where arena_id=a.id and profile_id=uid) then raise exception 'BATTLE_ARENA_FORBIDDEN'; end if;
 if a.status='ACTIVE' then
   select * into cr from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round;
   if found and cr.finalized_at is null and cr.closes_at<=now() then perform public.keep_battle_arena_finalize_round(a.id); end if;
   select * into cr from public.keep_battle_arena_rounds where arena_id=a.id and match_no=a.match_no and position=a.current_round;
   if found and cr.finalized_at is not null and cr.reveal_until<=now() then perform public.keep_battle_arena_advance_after_reveal(a.id); end if;
   select * into a from public.keep_battle_arenas where id=p_arena_id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'avatarUrl',x.avatar_url,'followers',x.followers,'favoriteGenres',x.favorite_genres,'favoriteArtists',x.favorite_artists,'score',x.score,'placement',x.placement,'isHost',x.profile_id=a.host_id) order by x.score desc,x.total_response_ms asc,x.joined_at asc),'[]'::jsonb) into seats
 from(select m.profile_id,p.username,p.avatar_url,p.favorite_genres,p.favorite_artists,m.score,m.placement,m.total_response_ms,m.joined_at,(select count(*) from public.follows f where f.followee_id=m.profile_id) followers from public.keep_battle_arena_members m join public.profiles p on p.id=m.profile_id where m.arena_id=a.id and m.seat_status='ACTIVE' order by m.score desc,m.total_response_ms asc,m.joined_at asc limit 10)x;
 select coalesce(jsonb_agg(jsonb_build_object('profileId',x.profile_id,'username',x.username,'score',x.score,'placement',x.placement,'responseMs',x.total_response_ms) order by x.score desc,x.total_response_ms asc),'[]'::jsonb) into board
 from(select m.profile_id,p.username,m.score,m.placement,m.total_response_ms from public.keep_battle_arena_members m join public.profiles p on p.id=m.profile_id where m.arena_id=a.id and m.seat_status='ACTIVE' order by m.score desc,m.total_response_ms asc limit 10)x;
 select jsonb_build_object('profileId',m.profile_id,'status',m.seat_status,'score',m.score,'placement',m.placement) into me from public.keep_battle_arena_members m where m.arena_id=a.id and m.profile_id=uid;
 select case when r.id is null then null else jsonb_build_object(
   'position',r.position,
   'title',case when r.finalized_at is not null then r.title_snapshot else null end,
   'artist',case when r.finalized_at is not null then r.artist_snapshot else null end,
   'releaseYear',case when r.finalized_at is not null then r.release_year_snapshot else null end,
   'artworkUrl',case when r.finalized_at is not null then r.artwork_url else null end,
   'previewUrl',r.preview_url,'choices',r.choices,'startedAt',r.started_at,'closesAt',r.closes_at,'revealUntil',r.reveal_until,'revealed',r.finalized_at is not null,
   'answered',ans.profile_id is not null,
   'myAnswer',case when ans.profile_id is null then null else jsonb_build_object('selectedAnswer',ans.selected_answer,'responseMs',ans.response_ms,'points',case when r.finalized_at is not null then ans.points else 0 end,'correct',case when r.finalized_at is not null then ans.is_correct else null end) end
 ) end into current
 from public.keep_battle_arena_rounds r left join public.keep_battle_arena_answers ans on ans.round_id=r.id and ans.profile_id=uid
 where r.arena_id=a.id and r.match_no=a.match_no and r.position=greatest(a.current_round,1);

 select case when z.profile_id is null then null else jsonb_build_object('profileId',z.profile_id,'username',p.username,'avatarUrl',p.avatar_url,'responseMs',z.response_ms) end into round_winner
 from public.keep_battle_arena_answers z join public.profiles p on p.id=z.profile_id join public.keep_battle_arena_rounds rr on rr.id=z.round_id
 where rr.arena_id=a.id and rr.match_no=a.match_no and rr.position=greatest(a.current_round,1) and rr.finalized_at is not null and z.is_correct=true
 order by z.response_ms asc,z.submitted_at asc limit 1;

 if a.match_no > 1 then
   select jsonb_build_object('matchNo',r.match_no,'placement',r.placement,'score',r.score,'correct',r.correct_predictions,'responseMs',r.total_response_ms,'creditDelta',coalesce(e.amount,0),'won',r.placement=1)
   into last_result
   from public.keep_battle_arena_match_results r left join public.keep_battle_arena_credit_events e on e.arena_id=r.arena_id and e.match_no=r.match_no and e.profile_id=r.profile_id
   where r.arena_id=a.id and r.match_no=a.match_no-1 and r.profile_id=uid;

   select jsonb_build_object('profileId',r.profile_id,'username',p.username,'avatarUrl',p.avatar_url,'score',r.score,'responseMs',r.total_response_ms)
   into last_winner from public.keep_battle_arena_match_results r join public.profiles p on p.id=r.profile_id
   where r.arena_id=a.id and r.match_no=a.match_no-1 and r.placement=1 limit 1;
 end if;

 select count(*) into queue_count from public.keep_battle_arena_members where arena_id=a.id and seat_status='QUEUED';
 select greatest(0,a.max_players-count(*)) into open_seats from public.keep_battle_arena_members where arena_id=a.id and seat_status='ACTIVE';
 return jsonb_build_object('id',a.id,'arenaCode',a.arena_code,'themeCode',a.theme_code,'status',a.status,'maxPlayers',a.max_players,'openSeats',open_seats,'queue',queue_count,'roundCount',a.round_count,'matchNo',a.match_no,'currentRound',a.current_round,'roundDurationMs',a.round_duration_ms,'isHost',a.host_id=uid,'me',me,'seats',seats,'leaderboard',board,'round',current,'roundWinner',round_winner,'lastResult',last_result,'lastWinner',last_winner);
end;
$$;
