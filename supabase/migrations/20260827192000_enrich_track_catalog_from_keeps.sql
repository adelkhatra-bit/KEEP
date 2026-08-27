-- KEEP 2026-08-27
-- Chaque KEEP enrichit le catalogue interne avec les métadonnées déjà obtenues
-- lors de la reconnaissance. Aucun fichier audio n'est stocké.

create or replace function public.enrich_track_from_keep_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_playback jsonb;
  v_external jsonb;
  v_available text[];
  v_source text;
  v_source_url text;
begin
  if new.decision <> 'KEPT' then
    return new;
  end if;

  v_playback := coalesce(new.context -> 'playback', '{}'::jsonb);
  v_external := case
    when jsonb_typeof(v_playback -> 'externalUrls') = 'object' then v_playback -> 'externalUrls'
    else '{}'::jsonb
  end;

  select coalesce(array_agg(value), '{}'::text[])
    into v_available
  from jsonb_array_elements_text(
    case when jsonb_typeof(v_playback -> 'availableOn') = 'array'
      then v_playback -> 'availableOn'
      else '[]'::jsonb
    end
  );

  v_source := nullif(new.context ->> 'sourcePlatform', '');
  v_source_url := nullif(new.context ->> 'sourceUrl', '');

  update public.tracks
  set preview_url = coalesce(preview_url, nullif(v_playback ->> 'previewUrl', '')),
      external_urls = coalesce(external_urls, '{}'::jsonb) || v_external,
      available_on = case
        when coalesce(cardinality(available_on), 0) = 0 and cardinality(v_available) > 0 then v_available
        else available_on
      end,
      source = coalesce(source, v_source, 'keep_recognition'),
      source_url = coalesce(source_url, v_source_url, nullif(v_external ->> 'universal', ''))
  where id = new.track_id;

  return new;
end;
$$;

revoke all on function public.enrich_track_from_keep_decision() from public;

drop trigger if exists trg_enrich_track_from_keep_decision on public.keep_decisions;
create trigger trg_enrich_track_from_keep_decision
after insert or update of context on public.keep_decisions
for each row execute function public.enrich_track_from_keep_decision();
