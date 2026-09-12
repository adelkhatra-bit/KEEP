-- Adel (04/09/2026) : "il est interdit de mettre deux fois la même musique
-- dans le même Battle ou le même Artiste" -- même bug que
-- keep_battle_arena_seed_rounds côté solo : candidates piochait "order by
-- random() limit v_round_count" sans jamais dédoublonner par artiste. Ajoute
-- un DISTINCT ON (artiste) avant le tirage final, même départage aléatoire
-- conservé, aucun autre comportement changé.
create or replace function public.keep_battle_solo_pack(p_theme_code text DEFAULT 'MIX'::text, p_round_count integer DEFAULT 8, p_theme_codes text[] DEFAULT NULL::text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_round_count integer := greatest(5, least(coalesce(p_round_count, 8), 30));
  v_rounds jsonb;
  v_label text := upper(trim(coalesce(p_theme_code, 'MIX')));
  v_themes text[];
begin
  if v_label = '' then v_label := 'MIX'; end if;

  select nullif(array_agg(distinct u.code), array[]::text[]) into v_themes
  from (select upper(trim(x)) as code from unnest(coalesce(p_theme_codes, array[]::text[])) x) u(code)
  where u.code <> '' and u.code <> 'MIX';

  if v_themes is null and v_label <> 'MIX' then
    v_themes := array[v_label];
  end if;

  if v_themes is not null and exists (
    select 1 from unnest(v_themes) c
    where not exists (select 1 from public.keep_battle_themes t where t.code = c and t.enabled = true)
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

  with ranked as (
    select t.id, t.title, t.artist, t.artwork_url, t.preview_url, random() as rnd
    from public.tracks t
    where t.preview_url is not null
      and t.preview_url <> ''
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
          select 1
          from public.playlists pl
          join public.playlist_tracks pt on pt.playlist_id=pl.id
          where pl.owner_id=v_uid and pt.track_id=t.id
        )
      )
  ), deduped as (
    select distinct on (lower(trim(artist))) id, title, artist, artwork_url, preview_url, rnd
    from ranked
    order by lower(trim(artist)), rnd
  ), candidates as (
    select id, title, artist, artwork_url, preview_url
    from deduped
    order by rnd
    limit v_round_count
  ), packed as (
    select
      row_number() over ()::integer as position,
      c.id, c.title, c.artist, c.artwork_url, c.preview_url,
      coalesce((
        select jsonb_agg(v order by random())
        from (
          select c.artist::text as v
          union
          select ranked.artist
          from (
            select artist, min(prio) as prio
            from (
              select trim(t2.artist) as artist, 0 as prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
                and v_themes is not null
                and exists (select 1 from public.keep_battle_track_themes m2 where m2.track_id=t2.id and m2.theme_code = any(v_themes))
              union all
              select trim(t2.artist) as artist, 1 as prio
              from public.tracks t2
              where trim(coalesce(t2.artist, '')) <> ''
                and lower(trim(t2.artist)) <> lower(trim(c.artist))
                and exists (select 1 from public.keep_battle_track_themes m2b where m2b.track_id=t2.id)
            ) both_pools
            group by artist
            order by min(prio), random()
            limit 2
          ) ranked
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
      'choices', p.choices,
      'correctAnswer', p.artist
    ) order by p.position
  ) into v_rounds
  from packed p;

  if jsonb_array_length(coalesce(v_rounds, '[]'::jsonb)) < 5 then
    raise exception 'BATTLE_THEME_CATALOG_TOO_SMALL:%', coalesce(array_to_string(v_themes, '+'), v_label);
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
