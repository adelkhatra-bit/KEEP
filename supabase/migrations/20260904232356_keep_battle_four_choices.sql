-- Quatre réponses de taille identique dans les Battles en ligne. Le moteur
-- historique produit trois choix ; ce trigger ajoute uniquement un artiste
-- réel, distinct et déjà présent dans le catalogue Battle.
create or replace function public.keep_battle_complete_four_choices()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  decoy text;
begin
  if jsonb_typeof(new.choices) = 'array' and jsonb_array_length(new.choices) = 3 then
    select trim(t.artist) into decoy
    from public.tracks t
    where trim(coalesce(t.artist, '')) <> ''
      and coalesce(t.preview_url, '') <> ''
      and exists (select 1 from public.keep_battle_track_themes m where m.track_id = t.id)
      and not exists (
        select 1 from jsonb_array_elements_text(new.choices) c(value)
        where lower(trim(c.value)) = lower(trim(t.artist))
      )
    order by random()
    limit 1;

    if decoy is not null then
      new.choices := new.choices || jsonb_build_array(decoy);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists keep_battle_four_choices on public.keep_battle_arena_rounds;
create trigger keep_battle_four_choices
before insert or update of choices on public.keep_battle_arena_rounds
for each row execute function public.keep_battle_complete_four_choices();

-- Répare aussi les manches en attente déjà préparées.
update public.keep_battle_arena_rounds
set choices = choices
where jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 3;

revoke all on function public.keep_battle_complete_four_choices() from public, anon, authenticated;
