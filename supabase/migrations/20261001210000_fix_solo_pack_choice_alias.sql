-- Fix Solo pack runtime: qualify jsonb choice aliases to avoid PL/pgSQL ambiguity.
CREATE OR REPLACE FUNCTION public.keep_battle_solo_pack_three_choices(p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8, p_theme_codes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_round_count integer := greatest(5, least(coalesce(p_round_count, 8), 30));
  v_rounds jsonb;
  v_label text := upper(trim(coalesce(p_theme_code, 'MIX')));
  v_themes text[];
  v_recent_tracks uuid[] := array[]::uuid[];
  v_recent_artists text[] := array[]::text[];
begin
  if v_label = '' then v_label := 'MIX'; end if;

  select nullif(array_agg(distinct u.code), array[]::text[]) into v_themes
  from (select upper(trim(x)) as code from unnest(coalesce(p_theme_codes, array[]::text[])) x) u(code)
  where u.code <> '' and u.code <> 'MIX';

  if v_themes is null and v_label <> 'MIX' then v_themes := array[v_label]; end if;
  if v_themes is not null and array_length(v_themes, 1) > 1 then v_label := 'MIX'; end if;

  if v_themes is not null and exists (
    select 1 from unnest(v_themes) c
    where not exists (select 1 from public.keep_battle_themes t where t.code = c and t.enabled = true)
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

  if v_uid is not null then
    select coalesce(recent_track_ids,array[]::uuid[]), coalesce(recent_artist_keys,array[]::text[])
    into v_recent_tracks, v_recent_artists
    from public.keep_battle_content_memory where profile_id=v_uid;
  end if;

  with ranked as (
    select t.id, t.title, t.artist, t.artwork_url, t.preview_url,
           case when t.id = any(v_recent_tracks) then 1 else 0 end as recent_penalty,
           random() as rnd
    from public.tracks t
    where t.preview_url is not null and t.preview_url <> ''
      and trim(coalesce(t.title, '')) <> ''
      and trim(coalesce(t.artist, '')) <> ''
      and (
        v_themes is null
        or exists (
          select 1 from public.keep_battle_track_themes m
          where m.track_id = t.id and m.theme_code = any(v_themes)
        )
      )
      and (
        v_uid is null
        or not exists (
          select 1 from public.playlists pl
          join public.playlist_tracks pt on pt.playlist_id=pl.id
          where pl.owner_id=v_uid and pt.track_id=t.id
        )
      )
  ), deduped as (
    select distinct on (lower(trim(artist)))
      id,title,artist,artwork_url,preview_url,recent_penalty,rnd
    from ranked
    order by lower(trim(artist)), recent_penalty, rnd
  ), candidates as (
    select id,title,artist,artwork_url,preview_url
    from deduped
    order by recent_penalty, rnd
    limit v_round_count
  ), packed as (
    select
      row_number() over ()::integer as position,
      c.id, c.title, c.artist, c.artwork_url, c.preview_url,
      (
        select m.theme_code from public.keep_battle_track_themes m
        where m.track_id = c.id and (v_themes is null or m.theme_code = any(v_themes))
        order by random() limit 1
      ) as theme_code,
      coalesce((
        select jsonb_agg(v order by random())
        from (
          select c.artist::text as v
          union
          select ranked_artist.artist
          from (
            select artist, min(theme_prio) as theme_prio, min(recent_prio) as recent_prio
            from (
              select trim(t2.artist) as artist, 0 as theme_prio,
                     case when lower(trim(t2.artist)) = any(v_recent_artists) then 1 else 0 end as recent_prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
                and v_themes is not null
                and exists (select 1 from public.keep_battle_track_themes m2 where m2.track_id=t2.id and m2.theme_code = any(v_themes))
              union all
              select trim(t2.artist) as artist, 1 as theme_prio,
                     case when lower(trim(t2.artist)) = any(v_recent_artists) then 1 else 0 end as recent_prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
                and exists (select 1 from public.keep_battle_track_themes m2b where m2b.track_id=t2.id)
            ) pools
            group by artist
            order by min(theme_prio), min(recent_prio), random()
            limit 3
          ) ranked_artist
        ) choices
      ), '[]'::jsonb) as choices
    from candidates c
  )
  select jsonb_agg(
    jsonb_build_object(
      'position', p.position,
      'trackId', p.id,
      'title', p.title,
      'artist', p.artist,
      'artworkUrl', p.artwork_url,
      'previewUrl', p.preview_url,
      'themeCode', p.theme_code,
      'choices', p.choices,
      'correctAnswer', p.artist
    ) order by p.position
  ) into v_rounds
  from packed p;

  if jsonb_array_length(coalesce(v_rounds, '[]'::jsonb)) < 5 then
    raise exception 'BATTLE_THEME_CATALOG_TOO_SMALL:%', coalesce(array_to_string(v_themes, '+'), v_label);
  end if;

  if v_uid is not null then
    perform public.keep_battle_remember_content(
      array[v_uid],
      array(select (r->>'trackId')::uuid from jsonb_array_elements(v_rounds) r),
      array(
        select c.choice_value
        from jsonb_array_elements(v_rounds) r
        cross join lateral jsonb_array_elements_text(r->'choices') c(choice_value)
      )
    );
  end if;

  return jsonb_build_object(
    'mode', 'SOLO_TRAINING',
    'themeCode', v_label,
    'roundCount', jsonb_array_length(v_rounds),
    'stakeFree', 0,
    'rewardFree', 0,
    'rounds', v_rounds
  );
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
  payload jsonb;
  rounds jsonb;
  round_row jsonb;
  decoys jsonb;
  choices jsonb;
  track_uuid uuid;
  idx integer;
  v_themes text[];
  v_recent_artists text[] := array[]::text[];
begin
  select array_agg(code order by first_ord) into v_themes
  from (
    select upper(trim(code)) as code, min(ord) as first_ord
    from unnest(coalesce(p_theme_codes, array[]::text[])) with ordinality u(code, ord)
    where upper(trim(coalesce(code, ''))) not in ('', 'MIX')
    group by upper(trim(code))
    order by min(ord)
    limit 3
  ) selected;

  payload := public.keep_battle_solo_pack_three_choices(
    p_theme_code,
    p_round_count,
    v_themes
  );
  rounds := coalesce(payload -> 'rounds', '[]'::jsonb);

  if jsonb_array_length(rounds) = 0 then return payload; end if;

  if v_uid is not null then
    select coalesce(recent_artist_keys,array[]::text[])
    into v_recent_artists
    from public.keep_battle_content_memory where profile_id=v_uid;
  end if;

  for idx in 0..jsonb_array_length(rounds) - 1 loop
    round_row := rounds -> idx;
    track_uuid := nullif(round_row ->> 'trackId', '')::uuid;

    select coalesce(jsonb_agg(x.artist), '[]'::jsonb) into decoys
    from (
      select artist
      from (
        select distinct on (lower(trim(t.artist)))
          trim(t.artist) as artist,
          case when lower(trim(t.artist)) = any(v_recent_artists) then 1 else 0 end as recent_penalty,
          random() as rnd
        from public.tracks t
        where t.id <> track_uuid
          and trim(coalesce(t.artist, '')) <> ''
          and lower(trim(t.artist)) <> lower(trim(round_row ->> 'correctAnswer'))
          and (
            exists (
              select 1
              from public.keep_battle_track_themes target_theme
              join public.keep_battle_track_themes candidate_theme
                on candidate_theme.theme_code = target_theme.theme_code
              where target_theme.track_id = track_uuid
                and candidate_theme.track_id = t.id
                and (v_themes is null or target_theme.theme_code = any(v_themes))
            ) or (
              v_themes is null
              and not exists (select 1 from public.keep_battle_track_themes target_any where target_any.track_id = track_uuid)
              and exists (select 1 from public.keep_battle_track_themes candidate_any where candidate_any.track_id = t.id)
            )
          )
        order by lower(trim(t.artist)), recent_penalty, rnd
      ) unique_artists
      order by recent_penalty, rnd
      limit 3
    ) x;

    if jsonb_array_length(decoys) <> 3 then
      raise exception 'BATTLE_THEME_CHOICES_TOO_SMALL:%', coalesce(round_row ->> 'title', track_uuid::text);
    end if;

    select jsonb_agg(value order by random()) into choices
    from (
      select round_row ->> 'correctAnswer' as value
      union all
      select value from jsonb_array_elements_text(decoys)
    ) four;

    rounds := jsonb_set(rounds, array[idx::text, 'choices'], choices, false);
  end loop;

  if v_uid is not null then
    perform public.keep_battle_remember_content(
      array[v_uid],
      array(select (r->>'trackId')::uuid from jsonb_array_elements(rounds) r),
      array(
        select c.choice_value
        from jsonb_array_elements(rounds) r
        cross join lateral jsonb_array_elements_text(r->'choices') c(choice_value)
      )
    );
  end if;

  return jsonb_set(payload, '{rounds}', rounds, false);
end;
$function$;
