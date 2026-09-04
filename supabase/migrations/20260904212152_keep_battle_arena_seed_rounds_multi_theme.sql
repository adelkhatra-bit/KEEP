-- Adel (04/09/2026) : suite de keep_battle_arena_multi_theme_mix -- le
-- tirage des morceaux ET les pools de leurres doivent utiliser
-- a.theme_codes (l'UNION exacte des styles acceptés par l'hôte) quand il
-- est rempli, au lieu du filtre par thème unique. Garde le DISTINCT ON
-- (artiste) ajouté juste avant (pas de doublon d'artiste) -- rien d'autre
-- ne change.
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
  multi boolean;
begin
  select * into a from public.keep_battle_arenas where id=p_arena_id; if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  delete from public.keep_battle_arena_rounds where arena_id=a.id and match_no=p_match_no;
  multi := a.theme_codes is not null and array_length(a.theme_codes,1) > 0;

  with ranked as(
    select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year,
           md5(t.id::text||a.id::text||p_match_no::text||a.theme_code) as rnd
    from public.tracks t
    where t.preview_url is not null and t.preview_url<>''
      and trim(coalesce(t.title,''))<>''
      and trim(coalesce(t.artist,''))<>''
      and (
        (multi and exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=any(a.theme_codes)))
        or (not multi and (
          a.theme_code='MIX'
          or exists(select 1 from public.keep_battle_track_themes m where m.track_id=t.id and m.theme_code=a.theme_code)
        ))
      )
      and not exists (
        select 1
        from public.keep_battle_arena_members am
        join public.playlists p on p.owner_id=am.profile_id
        join public.playlist_tracks pt on pt.playlist_id=p.id
        where am.arena_id=a.id and am.seat_status='ACTIVE' and pt.track_id=t.id
      )
  ),
  deduped as (
    select distinct on (lower(trim(artist))) id,title,artist,artwork_url,preview_url,release_year,rnd
    from ranked
    order by lower(trim(artist)), rnd
  ),
  candidates as (
    select id,title,artist,artwork_url,preview_url,release_year
    from deduped
    order by rnd
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
      select artist, min(prio) as prio from (
        select trim(artist) as artist, 0 as prio
        from public.tracks t3
        where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and (
            (multi and exists(select 1 from public.keep_battle_track_themes m3 where m3.track_id=t3.id and m3.theme_code=any(a.theme_codes)))
            or (not multi and a.theme_code<>'MIX' and exists(select 1 from public.keep_battle_track_themes m3 where m3.track_id=t3.id and m3.theme_code=a.theme_code))
          )
        union all
        select trim(artist) as artist, 1 as prio
        from public.tracks
        where trim(coalesce(artist,''))<>'' and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
      ) both_pools
      group by artist
      order by min(prio), random()
      limit 1
    ) x;

    select artist into d2 from (
      select artist, min(prio) as prio from (
        select trim(artist) as artist, 0 as prio
        from public.tracks t4
        where trim(coalesce(artist,''))<>''
          and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and trim(artist)<>coalesce(d1,'')
          and (
            (multi and exists(select 1 from public.keep_battle_track_themes m4 where m4.track_id=t4.id and m4.theme_code=any(a.theme_codes)))
            or (not multi and a.theme_code<>'MIX' and exists(select 1 from public.keep_battle_track_themes m4 where m4.track_id=t4.id and m4.theme_code=a.theme_code))
          )
        union all
        select trim(artist) as artist, 1 as prio
        from public.tracks
        where trim(coalesce(artist,''))<>''
          and lower(trim(artist))<>lower(trim(rr.artist_snapshot))
          and trim(artist)<>coalesce(d1,'')
      ) both_pools
      group by artist
      order by min(prio), random()
      limit 1
    ) x;

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
