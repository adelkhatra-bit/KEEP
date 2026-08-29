-- KEEP Battle: never silently mix unrelated genres into a selected theme.
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
  ) then
    raise exception 'BATTLE_THEME_UNAVAILABLE';
  end if;

  with candidates as (
    select t.id, t.title, t.artist, t.artwork_url, t.preview_url
    from public.tracks t
    where t.preview_url is not null
      and t.preview_url <> ''
      and trim(coalesce(t.title, '')) <> ''
      and trim(coalesce(t.artist, '')) <> ''
      and (
        v_theme = 'MIX'
        or exists (
          select 1
          from public.keep_battle_track_themes m
          where m.track_id = t.id
            and m.theme_code = v_theme
        )
      )
    order by random()
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
          select artist
          from (
            select trim(t2.artist) as artist
            from public.tracks t2
            where trim(coalesce(t2.artist, '')) <> ''
              and lower(trim(t2.artist)) <> lower(trim(c.artist))
            group by trim(t2.artist)
            order by random()
            limit 3
          ) decoys
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
    raise exception 'BATTLE_THEME_CATALOG_TOO_SMALL:%', v_theme;
  end if;

  return jsonb_build_object(
    'mode', 'SOLO_TRAINING',
    'themeCode', v_theme,
    'roundCount', jsonb_array_length(v_rounds),
    'stakeFree', 0,
    'rewardFree', 0,
    'rounds', v_rounds
  );
end;
$$;

revoke all on function public.keep_battle_solo_pack(text, integer) from public;
grant execute on function public.keep_battle_solo_pack(text, integer) to anon, authenticated;

comment on function public.keep_battle_solo_pack(text, integer) is
'KEEP BATTLE solo training pack. Non-MIX themes are strictly filtered; unrelated genres are never used as fallback.';
