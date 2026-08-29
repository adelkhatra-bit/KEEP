-- KEEP Battle answer-position fairness.
-- The correct choice is randomized on every round but may never occupy the
-- same slot as the immediately previous correct choice. Distractors are also
-- reshuffled so players cannot infer answers from a stable visual pattern.

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
  v_rounds jsonb := '[]'::jsonb;
  rr record;
  d1 text;
  d2 text;
  slot integer;
  prev_slot integer := 0;
  pos integer := 0;
begin
  if v_theme = '' then v_theme := 'MIX'; end if;
  if v_theme <> 'MIX' and not exists (
    select 1 from public.keep_battle_themes t where t.code = v_theme and t.enabled = true
  ) then v_theme := 'MIX'; end if;

  for rr in
    select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
      case when v_theme='MIX' then 0 when exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=v_theme) then 0 else 1 end as theme_priority
    from public.tracks t
    where t.preview_url is not null and t.preview_url<>''
      and trim(coalesce(t.title,''))<>''
      and trim(coalesce(t.artist,''))<>''
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
  loop
    pos := pos + 1;

    select artist into d1 from (
      select distinct trim(t2.artist) artist
      from public.tracks t2
      where trim(coalesce(t2.artist,''))<>''
        and lower(trim(t2.artist))<>lower(trim(rr.artist))
      order by random() limit 1
    ) x;

    select artist into d2 from (
      select distinct trim(t2.artist) artist
      from public.tracks t2
      where trim(coalesce(t2.artist,''))<>''
        and lower(trim(t2.artist))<>lower(trim(rr.artist))
        and trim(t2.artist)<>coalesce(d1,'')
      order by random() limit 1
    ) x;

    slot := floor(random()*3)::integer + 1;
    if slot = prev_slot then
      if random() < 0.5 then slot := (prev_slot % 3) + 1;
      else slot := ((prev_slot + 1) % 3) + 1;
      end if;
    end if;
    prev_slot := slot;

    v_rounds := v_rounds || jsonb_build_array(jsonb_build_object(
      'position',pos,
      'trackId',rr.id,
      'title',rr.title,
      'artist',rr.artist,
      'artworkUrl',rr.artwork_url,
      'previewUrl',rr.preview_url,
      'releaseYear',rr.release_year,
      'choices',case slot
        when 1 then jsonb_build_array(rr.artist,d1,d2)
        when 2 then jsonb_build_array(d1,rr.artist,d2)
        else jsonb_build_array(d1,d2,rr.artist)
      end,
      'correctAnswer',rr.artist
    ));
  end loop;

  if jsonb_array_length(v_rounds) < 5 then raise exception 'BATTLE_CATALOG_TOO_SMALL'; end if;
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
 a public.keep_battle_arenas%rowtype;
 inserted integer;
 rr record;
 d1 text;
 d2 text;
 slot integer;
 prev_slot integer := 0;
begin
 select * into a from public.keep_battle_arenas where id=p_arena_id;
 if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
 delete from public.keep_battle_arena_rounds where arena_id=a.id and match_no=p_match_no;

 with candidates as(
  select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
   case when a.theme_code='MIX' then 0 when exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=a.theme_code) then 0 else 1 end theme_priority
  from public.tracks t
  where t.preview_url is not null and t.preview_url<>''
    and trim(coalesce(t.title,''))<>''
    and trim(coalesce(t.artist,''))<>''
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

 for rr in
   select id,position,artist_snapshot
   from public.keep_battle_arena_rounds
   where arena_id=a.id and match_no=p_match_no
   order by position
 loop
   select artist into d1 from (
     select distinct trim(artist) artist
     from public.tracks
     where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
     order by random() limit 1
   )x;

   select artist into d2 from (
     select distinct trim(artist) artist
     from public.tracks
     where trim(coalesce(artist,''))<>''
       and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
       and trim(artist)<>coalesce(d1,'')
     order by random() limit 1
   )x;

   slot := floor(random()*3)::integer + 1;
   if slot = prev_slot then
     if random() < 0.5 then slot := (prev_slot % 3) + 1;
     else slot := ((prev_slot + 1) % 3) + 1;
     end if;
   end if;
   prev_slot := slot;

   update public.keep_battle_arena_rounds
   set choices = case slot
     when 1 then jsonb_build_array(rr.artist_snapshot,d1,d2)
     when 2 then jsonb_build_array(d1,rr.artist_snapshot,d2)
     else jsonb_build_array(d1,d2,rr.artist_snapshot)
   end
   where id=rr.id;
 end loop;
end;
$function$;
