-- Loki Music Battle: fair participant-style mix.
-- Each active player gets an equal share of rounds; that player's own saved
-- Battle styles rotate inside their share. The final participant list is read
-- again at match start, including rematches, so the host never imposes styles.

CREATE OR REPLACE FUNCTION public.keep_battle_arena_seed_rounds(p_arena_id uuid, p_match_no integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.keep_battle_arenas%rowtype;
  v_member_ids uuid[] := array[]::uuid[];
  v_member_count integer := 0;
  v_recent_tracks uuid[] := array[]::uuid[];
  v_recent_artists text[] := array[]::text[];
  v_used_tracks uuid[] := array[]::uuid[];
  v_used_artists text[] := array[]::text[];
  v_all_themes text[] := array[]::text[];
  v_player_themes text[] := array[]::text[];
  v_position integer;
  v_player_index integer;
  v_player_id uuid;
  v_player_occurrence integer;
  v_theme text;
  v_actual_theme text;
  v_track record;
begin
  select * into a
  from public.keep_battle_arenas
  where id = p_arena_id;

  if not found then
    raise exception 'BATTLE_ARENA_NOT_FOUND';
  end if;

  select coalesce(array_agg(m.profile_id order by m.joined_at, m.profile_id), array[]::uuid[])
  into v_member_ids
  from public.keep_battle_arena_members m
  where m.arena_id = a.id
    and m.seat_status = 'ACTIVE';

  v_member_count := cardinality(v_member_ids);
  if v_member_count < 1 then
    raise exception 'BATTLE_ARENA_NO_ACTIVE_PLAYER';
  end if;

  -- Union informative de tous les styles des joueurs actifs.
  select coalesce(array_agg(distinct pref.code order by pref.code), array[]::text[])
  into v_all_themes
  from (
    select upper(trim(code)) as code
    from public.keep_battle_arena_members am
    join public.keep_battle_match_preferences mp on mp.profile_id = am.profile_id
    cross join lateral unnest(coalesce(mp.theme_codes, array[]::text[])) code
    where am.arena_id = a.id
      and am.seat_status = 'ACTIVE'
      and upper(trim(code)) <> ''
      and upper(trim(code)) <> 'MIX'
      and exists (
        select 1 from public.keep_battle_themes bt
        where bt.code = upper(trim(code)) and bt.enabled = true
      )
  ) pref;

  if cardinality(v_all_themes) = 0 then
    if a.theme_codes is not null and cardinality(a.theme_codes) > 0 then
      v_all_themes := a.theme_codes;
    elsif a.theme_code is not null and a.theme_code <> 'MIX' then
      v_all_themes := array[a.theme_code];
    else
      v_all_themes := array['MIX'];
    end if;
  end if;

  update public.keep_battle_arenas
  set theme_codes = v_all_themes,
      theme_code = coalesce(v_all_themes[1], theme_code),
      updated_at = now()
  where id = a.id;

  a.theme_codes := v_all_themes;
  a.theme_code := coalesce(v_all_themes[1], a.theme_code);

  delete from public.keep_battle_arena_rounds
  where arena_id = a.id
    and match_no = p_match_no;

  select coalesce(array_agg(distinct tid), array[]::uuid[])
  into v_recent_tracks
  from public.keep_battle_content_memory m
  cross join lateral unnest(m.recent_track_ids) tid
  where m.profile_id = any(v_member_ids);

  select coalesce(array_agg(distinct artist_key), array[]::text[])
  into v_recent_artists
  from public.keep_battle_content_memory m
  cross join lateral unnest(m.recent_artist_keys) artist_key
  where m.profile_id = any(v_member_ids);

  for v_position in 1..a.round_count loop
    -- Répartition équitable PAR JOUEUR : 1,2,3,1,2,3...
    v_player_index := ((v_position - 1) % v_member_count) + 1;
    v_player_id := v_member_ids[v_player_index];
    v_player_occurrence := ((v_position - 1) / v_member_count);

    select coalesce(array_agg(x.code order by x.ord), array[]::text[])
    into v_player_themes
    from (
      select upper(trim(u.code)) as code, u.ord
      from public.keep_battle_match_preferences mp
      cross join lateral unnest(coalesce(mp.theme_codes, array[]::text[])) with ordinality u(code, ord)
      where mp.profile_id = v_player_id
        and u.ord <= 3
        and upper(trim(u.code)) <> ''
        and upper(trim(u.code)) <> 'MIX'
        and exists (
          select 1 from public.keep_battle_themes bt
          where bt.code = upper(trim(u.code))
            and bt.enabled = true
        )
    ) x;

    if cardinality(v_player_themes) = 0 then
      v_player_themes := case
        when a.theme_codes is not null and cardinality(a.theme_codes) > 0 then a.theme_codes
        when a.theme_code is not null and a.theme_code <> 'MIX' then array[a.theme_code]
        else array['MIX']
      end;
    end if;

    v_theme := v_player_themes[(v_player_occurrence % cardinality(v_player_themes)) + 1];
    v_track := null;

    -- 1) Style exact du joueur + artiste inédit.
    select t.*
    into v_track
    from public.tracks t
    where nullif(trim(t.preview_url), '') is not null
      and nullif(trim(t.title), '') is not null
      and nullif(trim(t.artist), '') is not null
      and not (t.id = any(v_used_tracks))
      and not (lower(trim(t.artist)) = any(v_used_artists))
      and not exists (
        select 1
        from public.keep_battle_arena_members am
        join public.playlists p on p.owner_id = am.profile_id
        join public.playlist_tracks pt on pt.playlist_id = p.id
        where am.arena_id = a.id
          and am.seat_status = 'ACTIVE'
          and pt.track_id = t.id
      )
      and (
        v_theme = 'MIX'
        or exists (
          select 1 from public.keep_battle_track_themes m
          where m.track_id = t.id and m.theme_code = v_theme
        )
      )
    order by
      case when t.id = any(v_recent_tracks) then 1 else 0 end,
      case when lower(trim(t.artist)) = any(v_recent_artists) then 1 else 0 end,
      md5(t.id::text || a.id::text || p_match_no::text || v_position::text || v_player_id::text)
    limit 1;

    -- 2) Même style, mais autorise un artiste déjà vu si le catalogue est court.
    if v_track.id is null then
      select t.*
      into v_track
      from public.tracks t
      where nullif(trim(t.preview_url), '') is not null
        and nullif(trim(t.title), '') is not null
        and nullif(trim(t.artist), '') is not null
        and not (t.id = any(v_used_tracks))
        and not exists (
          select 1
          from public.keep_battle_arena_members am
          join public.playlists p on p.owner_id = am.profile_id
          join public.playlist_tracks pt on pt.playlist_id = p.id
          where am.arena_id = a.id
            and am.seat_status = 'ACTIVE'
            and pt.track_id = t.id
        )
        and (
          v_theme = 'MIX'
          or exists (
            select 1 from public.keep_battle_track_themes m
            where m.track_id = t.id and m.theme_code = v_theme
          )
        )
      order by
        case when t.id = any(v_recent_tracks) then 1 else 0 end,
        md5(t.id::text || a.id::text || p_match_no::text || v_position::text || v_player_id::text)
      limit 1;
    end if;

    -- 3) Repli : un des autres styles du même joueur.
    if v_track.id is null and not ('MIX' = any(v_player_themes)) then
      select t.*
      into v_track
      from public.tracks t
      where nullif(trim(t.preview_url), '') is not null
        and nullif(trim(t.title), '') is not null
        and nullif(trim(t.artist), '') is not null
        and not (t.id = any(v_used_tracks))
        and exists (
          select 1 from public.keep_battle_track_themes m
          where m.track_id = t.id and m.theme_code = any(v_player_themes)
        )
      order by
        case when t.id = any(v_recent_tracks) then 1 else 0 end,
        md5(t.id::text || a.id::text || p_match_no::text || v_position::text || v_player_id::text)
      limit 1;
    end if;

    -- 4) Dernier filet MIX pour ne jamais casser une partie.
    if v_track.id is null then
      select t.*
      into v_track
      from public.tracks t
      where nullif(trim(t.preview_url), '') is not null
        and nullif(trim(t.title), '') is not null
        and nullif(trim(t.artist), '') is not null
        and not (t.id = any(v_used_tracks))
      order by
        case when t.id = any(v_recent_tracks) then 1 else 0 end,
        md5(t.id::text || a.id::text || p_match_no::text || v_position::text || v_player_id::text)
      limit 1;
    end if;

    if v_track.id is null then
      raise exception 'BATTLE_CATALOG_TOO_SMALL';
    end if;

    v_actual_theme := v_theme;
    if v_actual_theme = 'MIX'
       or not exists (
         select 1 from public.keep_battle_track_themes m
         where m.track_id = v_track.id and m.theme_code = v_actual_theme
       )
    then
      select m.theme_code
      into v_actual_theme
      from public.keep_battle_track_themes m
      where m.track_id = v_track.id
        and (m.theme_code = any(v_player_themes) or 'MIX' = any(v_player_themes))
      order by
        case when m.theme_code = any(v_player_themes) then 0 else 1 end,
        m.confidence desc,
        m.theme_code
      limit 1;
      v_actual_theme := coalesce(v_actual_theme, v_theme, 'MIX');
    end if;

    insert into public.keep_battle_arena_rounds(
      arena_id, match_no, position, track_id, title_snapshot, artist_snapshot,
      artwork_url, preview_url, release_year_snapshot, theme_code
    )
    values (
      a.id, p_match_no, v_position, v_track.id, v_track.title, v_track.artist,
      v_track.artwork_url, v_track.preview_url, v_track.release_year, v_actual_theme
    );

    v_used_tracks := array_append(v_used_tracks, v_track.id);
    v_used_artists := array_append(v_used_artists, lower(trim(v_track.artist)));
  end loop;

  perform public.keep_battle_remember_content(
    v_member_ids,
    array(
      select r.track_id
      from public.keep_battle_arena_rounds r
      where r.arena_id = a.id and r.match_no = p_match_no
      order by r.position
    ),
    array(
      select distinct value
      from public.keep_battle_arena_rounds r
      cross join lateral jsonb_array_elements_text(r.choices) c(value)
      where r.arena_id = a.id and r.match_no = p_match_no
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.keep_battle_arena_start(p_arena_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  a public.keep_battle_arenas%rowtype;
  active_count integer;
  round_start timestamptz;
  pending_count integer;
  member_id uuid;
begin
  select * into a
  from public.keep_battle_arenas
  where id = p_arena_id
  for update;

  if not found then raise exception 'BATTLE_ARENA_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.keep_battle_arena_members
    where arena_id = a.id and profile_id = v_uid and seat_status = 'ACTIVE'
  ) then
    raise exception 'BATTLE_ARENA_FORBIDDEN';
  end if;
  if a.status = 'ACTIVE' then return public.keep_battle_arena_state(a.id); end if;

  select count(*) into pending_count
  from public.keep_battle_challenges
  where arena_id = a.id and status = 'PENDING';
  if pending_count > 0 then raise exception 'BATTLE_ARENA_PENDING_INVITES'; end if;

  for member_id in
    select profile_id
    from public.keep_battle_arena_members
    where arena_id = a.id and seat_status = 'ACTIVE'
  loop
    if not public.keep_battle_arena_lock_stake(a.id, a.match_no, member_id) then
      update public.keep_battle_arena_members
      set seat_status = 'ELIMINATED'
      where arena_id = a.id and profile_id = member_id;
    end if;
  end loop;

  select count(*) into active_count
  from public.keep_battle_arena_members
  where arena_id = a.id and seat_status = 'ACTIVE';

  if active_count < 2 then
    raise exception 'BATTLE_ARENA_NEEDS_TWO_ELIGIBLE_PLAYERS';
  end if;

  -- Source de vérité au DERNIER moment : styles de tous les joueurs qui
  -- participent réellement à ce match, y compris après une revanche.
  perform public.keep_battle_arena_seed_rounds(a.id, a.match_no);

  update public.keep_battle_arena_members
  set score = 0,
      correct_predictions = 0,
      total_response_ms = 0,
      placement = null,
      consecutive_misses = 0
  where arena_id = a.id and seat_status = 'ACTIVE';

  update public.keep_battle_arenas
  set status = 'ACTIVE',
      current_round = 1,
      started_at = coalesce(started_at, now()),
      round_duration_ms = 10000,
      updated_at = now()
  where id = a.id
  returning * into a;

  round_start := now() + interval '5 seconds';
  update public.keep_battle_arena_rounds
  set started_at = round_start,
      closes_at = round_start + interval '10 seconds'
  where arena_id = a.id
    and match_no = a.match_no
    and position = 1;

  return public.keep_battle_arena_state(a.id);
end;
$function$
;
