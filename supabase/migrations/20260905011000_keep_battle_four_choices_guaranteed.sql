-- Garantit quatre artistes distincts (une seule bonne réponse) en solo et
-- en ligne. Les leurres partagent un thème réel avec le morceau, afin de ne
-- jamais injecter un artiste arabe/chinois/etc. hors des styles choisis.

alter function public.keep_battle_solo_pack(text, integer, text[])
  rename to keep_battle_solo_pack_three_choices;

create function public.keep_battle_solo_pack(
  p_theme_code text default 'MIX',
  p_round_count integer default 8,
  p_theme_codes text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  payload jsonb;
  rounds jsonb;
  round_row jsonb;
  decoys jsonb;
  choices jsonb;
  track_uuid uuid;
  idx integer;
  v_themes text[];
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
  for idx in 0..jsonb_array_length(rounds) - 1 loop
    round_row := rounds -> idx;
    track_uuid := nullif(round_row ->> 'trackId', '')::uuid;

    select coalesce(jsonb_agg(x.artist), '[]'::jsonb) into decoys
    from (
      select artist
      from (
        select distinct on (lower(trim(t.artist))) trim(t.artist) as artist, random() as rnd
        from public.tracks t
        where t.id <> track_uuid
          and trim(coalesce(t.artist, '')) <> ''
          and lower(trim(t.artist)) <> lower(trim(round_row ->> 'correctAnswer'))
          and (exists (
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
          ))
        order by lower(trim(t.artist)), rnd
      ) unique_artists
      order by rnd
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

  return jsonb_set(payload, '{rounds}', rounds, false);
end;
$function$;

create or replace function public.keep_battle_complete_four_choices()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  allowed_themes text[];
  decoys jsonb;
  rebuilt jsonb;
begin
  select case
    when a.theme_codes is not null and cardinality(a.theme_codes) > 0 then a.theme_codes[1:3]
    when a.theme_code <> 'MIX' then array[a.theme_code]
    else null
  end into allowed_themes
  from public.keep_battle_arenas a
  where a.id = new.arena_id;

  select coalesce(jsonb_agg(x.artist), '[]'::jsonb) into decoys
  from (
    select artist
    from (
      select distinct on (lower(trim(t.artist))) trim(t.artist) as artist, random() as rnd
      from public.tracks t
      where t.id <> new.track_id
        and trim(coalesce(t.artist, '')) <> ''
        and lower(trim(t.artist)) <> lower(trim(new.artist_snapshot))
        and (exists (
          select 1
          from public.keep_battle_track_themes target_theme
          join public.keep_battle_track_themes candidate_theme
            on candidate_theme.theme_code = target_theme.theme_code
          where target_theme.track_id = new.track_id
            and candidate_theme.track_id = t.id
            and (allowed_themes is null or target_theme.theme_code = any(allowed_themes))
        ) or (
          allowed_themes is null
          and not exists (select 1 from public.keep_battle_track_themes target_any where target_any.track_id = new.track_id)
          and exists (select 1 from public.keep_battle_track_themes candidate_any where candidate_any.track_id = t.id)
        ))
      order by lower(trim(t.artist)), rnd
    ) unique_artists
    order by rnd
    limit 3
  ) x;

  if jsonb_array_length(decoys) <> 3 then
    raise exception 'BATTLE_THEME_CHOICES_TOO_SMALL:%', coalesce(new.title_snapshot, new.track_id::text);
  end if;

  select jsonb_agg(value order by random()) into rebuilt
  from (
    select new.artist_snapshot as value
    union all
    select value from jsonb_array_elements_text(decoys)
  ) four;
  new.choices := rebuilt;
  return new;
end;
$function$;

drop trigger if exists keep_battle_four_choices on public.keep_battle_arena_rounds;
create trigger keep_battle_four_choices
before insert or update of choices on public.keep_battle_arena_rounds
for each row execute function public.keep_battle_complete_four_choices();

revoke all on function public.keep_battle_solo_pack_three_choices(text, integer, text[]) from public, anon, authenticated;
revoke all on function public.keep_battle_solo_pack(text, integer, text[]) from public;
grant execute on function public.keep_battle_solo_pack(text, integer, text[]) to anon, authenticated;
revoke all on function public.keep_battle_complete_four_choices() from public, anon, authenticated;
