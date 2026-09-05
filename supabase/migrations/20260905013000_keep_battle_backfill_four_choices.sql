-- Met aussi à niveau les arènes créées avant le passage à quatre réponses.
-- Les anciens leurres valides sont conservés ; un artiste du même thème est
-- ajouté. Aucun score, siège, chrono ou état de partie n'est modifié.

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
    when a.theme_codes is not null and cardinality(a.theme_codes) > 0 then a.theme_codes
    when a.theme_code <> 'MIX' then array[a.theme_code]
    else null
  end into allowed_themes
  from public.keep_battle_arenas a
  where a.id = new.arena_id;

  select coalesce(jsonb_agg(chosen.artist), '[]'::jsonb) into decoys
  from (
    select artist
    from (
      select distinct on (lower(trim(candidate.artist)))
        trim(candidate.artist) as artist,
        candidate.priority,
        candidate.rnd
      from (
        -- Les deux anciens faux choix restent prioritaires : cela permet de
        -- réparer sans changer inutilement une manche déjà distribuée.
        select value as artist, 0 as priority, random() as rnd
        from jsonb_array_elements_text(coalesce(new.choices, '[]'::jsonb))
        where trim(value) <> ''
          and lower(trim(value)) <> lower(trim(new.artist_snapshot))

        union all

        select trim(t.artist) as artist, 1 as priority, random() as rnd
        from public.tracks t
        where t.id <> new.track_id
          and trim(coalesce(t.artist, '')) <> ''
          and lower(trim(t.artist)) <> lower(trim(new.artist_snapshot))
          and (
            exists (
              select 1
              from public.keep_battle_track_themes target_theme
              join public.keep_battle_track_themes candidate_theme
                on candidate_theme.theme_code = target_theme.theme_code
              where target_theme.track_id = new.track_id
                and candidate_theme.track_id = t.id
                and (allowed_themes is null or target_theme.theme_code = any(allowed_themes))
            )
            or (
              not exists (
                select 1
                from public.keep_battle_track_themes target_any
                where target_any.track_id = new.track_id
              )
              and exists (
                select 1
                from public.keep_battle_track_themes candidate_any
                where candidate_any.track_id = t.id
                  and (allowed_themes is null or candidate_any.theme_code = any(allowed_themes))
              )
            )
            or (
              -- Certaines anciennes arènes portent un thème correct mais le
              -- morceau a été mal étiqueté dans le catalogue (ex. FUNK rangé
              -- DISCO). Dans ce cas, le leurre reste strictement dans le ou
              -- les styles choisis pour l'arène.
              allowed_themes is not null
              and not exists (
                select 1
                from public.keep_battle_track_themes target_allowed
                where target_allowed.track_id = new.track_id
                  and target_allowed.theme_code = any(allowed_themes)
              )
              and exists (
                select 1
                from public.keep_battle_track_themes candidate_allowed
                where candidate_allowed.track_id = t.id
                  and candidate_allowed.theme_code = any(allowed_themes)
              )
            )
          )
      ) candidate
      order by lower(trim(candidate.artist)), candidate.priority, candidate.rnd
    ) unique_artists
    order by priority, rnd
    limit 3
  ) chosen;

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

revoke all on function public.keep_battle_complete_four_choices() from public, anon, authenticated;

-- Déclenche le correcteur uniquement sur les anciennes manches encore
-- ouvertes qui n'ont pas déjà quatre réponses.
update public.keep_battle_arena_rounds r
set choices = r.choices
from public.keep_battle_arenas a
where a.id = r.arena_id
  and a.status in ('WAITING', 'ACTIVE')
  and jsonb_typeof(r.choices) = 'array'
  and jsonb_array_length(r.choices) <> 4;
