-- AUDIT CRITIQUE (18/09/2026) : Adel a signalé que les manches SOLO
-- n'affichent que 3 boutons au lieu de 4. Cause: keep_battle_solo_pack_three_choices
-- envoie 3 choix (bon + 2 leurres). Le wrapper keep_battle_solo_pack() devrait en
-- ajouter 1, mais le client ne trouve pas de 4e candidat distinct parce que les
-- leurres manquent de variété. Solution: générer 4 leurres distincts au serveur,
-- pas 2 + 1 en client. Format garanti: 4 artistes, 1 bon, 3 mauvais, pas de doublon.

create or replace function public.keep_battle_solo_pack(
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

    -- Générer 3 leurres (pas 2) pour garantir 4 choix au total
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

    -- Combiner: 1 bon + 3 leurres = 4 choix distincts, mélangés aléatoirement
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

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014XdCPchT6vDAK2W89g4vaM
