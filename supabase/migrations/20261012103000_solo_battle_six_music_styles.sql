-- Six user-selected styles across Solo, persisted preferences and multiplayer arena seeding.
-- Preserve all other existing production function semantics, including exactly four answer choices.
-- All functions keep the same SQL signatures, privileges and SECURITY DEFINER.

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
  v_pools jsonb := '{}'::jsonb;
  v_pool uuid[];
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
        and u.ord <= 6
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

    -- Échantillon de 600 titres par style, calculé une fois (10/10/2026 : 7 s -> ~1 s).
    if not (v_pools ? v_theme) then
      if v_theme = 'MIX' then
        select coalesce(array_agg(id), array[]::uuid[]) into v_pool from (select s.id from public.tracks s tablesample system (4) where nullif(trim(s.preview_url), '') is not null order by random() limit 600) x;
      else
        select coalesce(array_agg(track_id), array[]::uuid[]) into v_pool from (select m.track_id from (select distinct m0.track_id from public.keep_battle_track_themes m0 where m0.theme_code = v_theme) m order by random() limit 600) x;
      end if;
      v_pools := v_pools || jsonb_build_object(v_theme, to_jsonb(v_pool));
    else
      select coalesce(array_agg(e::uuid), array[]::uuid[]) into v_pool from jsonb_array_elements_text(v_pools->v_theme) e;
    end if;

    -- 1) Style exact du joueur + artiste inédit.
    select t.*
    into v_track
    from public.tracks t
    where t.id = any(v_pool) and nullif(trim(t.preview_url), '') is not null
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
      where t.id = any(v_pool) and nullif(trim(t.preview_url), '') is not null
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
$function$;

CREATE OR REPLACE FUNCTION public.keep_battle_save_match_preferences(p_theme_codes text[], p_round_count integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_codes text[];
  v_round integer := greatest(5, least(coalesce(p_round_count, 8), 30));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select array_agg(code order by first_ord) into v_codes
  from (
    select upper(trim(code)) as code, min(ord) as first_ord
    from unnest(coalesce(p_theme_codes, array['MIX']::text[])) with ordinality u(code, ord)
    where upper(trim(coalesce(code, ''))) not in ('', 'MIX')
    group by upper(trim(code))
    order by min(ord)
    limit 6
  ) chosen;

  if v_codes is null or cardinality(v_codes)=0 then
    v_codes := array['MIX'];
  end if;

  if exists (
    select 1
    from unnest(v_codes) code
    where code <> 'MIX'
      and not exists (
        select 1 from public.keep_battle_themes t
        where t.code=code and t.enabled=true
      )
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

  insert into public.keep_battle_match_preferences(profile_id,theme_codes,round_count,updated_at)
  values(uid,v_codes,v_round,now())
  on conflict(profile_id) do update
    set theme_codes=excluded.theme_codes,
        round_count=excluded.round_count,
        updated_at=now();

  return jsonb_build_object('themeCodes',to_jsonb(v_codes),'roundCount',v_round);
end;
$function$;

CREATE OR REPLACE FUNCTION public.keep_battle_solo_pack(p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8, p_theme_codes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_round_count integer := greatest(5,least(coalesce(p_round_count,8),30));
  v_label text := upper(trim(coalesce(p_theme_code,'MIX')));
  v_themes text[];
  v_recent_tracks uuid[] := array[]::uuid[];
  v_recent_artists text[] := array[]::text[];
  v_rounds jsonb;
  v_pool_ids uuid[];
  v_sample_artists text[];
begin
  if v_label='' then v_label:='MIX'; end if;
  select array_agg(code order by first_ord) into v_themes
  from (select upper(trim(code)) as code,min(ord) as first_ord
    from unnest(coalesce(p_theme_codes,array[]::text[])) with ordinality u(code,ord)
    where upper(trim(coalesce(code,''))) not in ('','MIX')
    group by upper(trim(code)) order by min(ord) limit 6) chosen;
  if v_themes is null and v_label<>'MIX' then v_themes:=array[v_label]; end if;
  if v_themes is not null and exists (select 1 from unnest(v_themes) c
    where not exists(select 1 from public.keep_battle_themes t where t.code=c and t.enabled=true)) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;
  if v_themes is not null and cardinality(v_themes)>1 then v_label:='MIX'; end if;
  if v_uid is not null then
    select coalesce(recent_track_ids,array[]::uuid[]),coalesce(recent_artist_keys,array[]::text[])
      into v_recent_tracks,v_recent_artists from public.keep_battle_content_memory where profile_id=v_uid;
  end if;
  -- Échantillon de 500 candidats sans parcourir tout le catalogue (8 s -> 0,2-0,5 s mesuré le 10/10/2026).
  if v_themes is null then
    select array_agg(id) into v_pool_ids from (
      select s.id from public.tracks s tablesample system (4)
      where nullif(trim(s.preview_url),'') is not null and nullif(trim(s.title),'') is not null and nullif(trim(s.artist),'') is not null
      order by random() limit 500) x;
  else
    select array_agg(track_id) into v_pool_ids from (
      select m.track_id from (select distinct m0.track_id from public.keep_battle_track_themes m0 where m0.theme_code = any(v_themes)) m
      order by random() limit 500) x;
  end if;
  -- Repli : petit échantillon -> ancienne méthode exhaustive.
  if coalesce(cardinality(v_pool_ids),0) < 60 then
    select array_agg(id) into v_pool_ids from (
      select t0.id from public.tracks t0
      where nullif(trim(t0.preview_url),'') is not null and nullif(trim(t0.title),'') is not null and nullif(trim(t0.artist),'') is not null
        and (v_themes is null or exists (select 1 from public.keep_battle_track_themes m0 where m0.track_id=t0.id and m0.theme_code=any(v_themes)))
      order by random() limit 500) x;
  end if;
  select array_agg(artist) into v_sample_artists from (
    select g.artist from public.tracks g tablesample system (1) where nullif(trim(g.artist),'') is not null order by random() limit 300) y;
  with theme_list as (
    select upper(trim(code)) as code,ord::integer as theme_ord from unnest(coalesce(v_themes,array[]::text[])) with ordinality u(code,ord)
  ),
  pool as (
    select t.id,t.title,t.artist,t.artwork_url,t.preview_url,t.release_year, chosen.theme_code, chosen.theme_ord,
      case when t.id=any(v_recent_tracks) then 1 else 0 end as recent_penalty, random() as rnd
    from (select t0.* from public.tracks t0 where t0.id = any(coalesce(v_pool_ids, array[]::uuid[]))
        and nullif(trim(t0.preview_url),'') is not null and nullif(trim(t0.title),'') is not null and nullif(trim(t0.artist),'') is not null) t
    left join lateral (select tl.code as theme_code,tl.theme_ord from theme_list tl
      join public.keep_battle_track_themes m on m.track_id=t.id and m.theme_code=tl.code order by tl.theme_ord limit 1) chosen on true
    where (v_themes is null or chosen.theme_code is not null)
      and (v_uid is null or not exists (select 1 from public.playlists pl join public.playlist_tracks pt on pt.playlist_id=pl.id where pl.owner_id=v_uid and pt.track_id=t.id))
  ),
  artist_dedup as (select * from (select p.*, row_number() over(partition by lower(trim(p.artist)) order by p.recent_penalty,p.rnd) as artist_rn from pool p) x where x.artist_rn=1),
  ranked as (select d.*, case when v_themes is null then 1 else row_number() over(partition by d.theme_code order by d.recent_penalty,d.rnd) end as theme_rank from artist_dedup d),
  candidates as (select * from ranked order by case when v_themes is null then recent_penalty else theme_rank end, case when v_themes is null then 1 else theme_ord end, recent_penalty, rnd limit v_round_count),
  packed as (select row_number() over(order by case when v_themes is null then recent_penalty else theme_rank end, case when v_themes is null then 1 else theme_ord end, rnd)::integer as position,
      c.id,c.title,c.artist,c.artwork_url,c.preview_url,c.release_year, coalesce(c.theme_code,'MIX') as theme_code from candidates c),
  global_sample as (select unnest(coalesce(v_sample_artists, array[]::text[])) as artist),
  distractors as (select distinct on (lower(trim(artist))) trim(artist) as artist,prio,release_year from (select artist,release_year,0 as prio from pool union all select artist,null::smallint as release_year,1 as prio from global_sample) x order by lower(trim(artist)),prio),
  with_choices as (select p.*, coalesce((select jsonb_agg(value order by random()) from (select p.artist::text as value union all
          select d.artist from (select artist from distractors where lower(artist)<>lower(trim(p.artist))
            order by prio, case when p.release_year is not null and release_year is not null and abs(p.release_year::integer - release_year::integer) <= 10 then 0 else 1 end, case when lower(artist)=any(v_recent_artists) then 1 else 0 end, random() limit 3) d) options),'[]'::jsonb) as choices from packed p)
  select jsonb_agg(jsonb_build_object('position',x.position,'trackId',x.id,'title',x.title,'artist',x.artist,'artworkUrl',x.artwork_url,
      'previewUrl',x.preview_url,'releaseYear',x.release_year,'themeCode',x.theme_code,'choices',x.choices,'correctAnswer',x.artist) order by x.position)
  into v_rounds from with_choices x where jsonb_array_length(x.choices)=4;
  if jsonb_array_length(coalesce(v_rounds,'[]'::jsonb))<5 then
    raise exception 'BATTLE_THEME_CATALOG_TOO_SMALL:%',coalesce(array_to_string(v_themes,'+'),v_label);
  end if;
  if v_uid is not null then
    perform public.keep_battle_remember_content(array[v_uid], array(select (r->>'trackId')::uuid from jsonb_array_elements(v_rounds) r),
      array(select c.choice_value from jsonb_array_elements(v_rounds) r cross join lateral jsonb_array_elements_text(r->'choices') c(choice_value)));
  end if;
  return jsonb_build_object('mode','SOLO_TRAINING','themeCode',v_label,'themeCodes',to_jsonb(coalesce(v_themes,array['MIX']::text[])),
    'roundCount',jsonb_array_length(v_rounds),'stakeFree',0,'rewardFree',0,'rounds',v_rounds);
end;
$function$;

