-- Adel (14/09/2026) : "est-ce que le systeme fait la difference du style
-- musical oui ou non ? si c'est non, il faut trouver une solution."
--
-- BUG REEL confirme en base : sur adel4A (24 morceaux gardes), seuls 11
-- avaient un genre, et un seul "Hip-hop/Rap" alors que plusieurs morceaux
-- (Busta Rhymes, Ninho...) sont clairement du rap. Cause trouvee dans le
-- code : enrichMissingGenres() (keylessGenreService.ts) interroge deja le
-- catalogue iTunes gratuit pour deviner le genre d'un morceau sans genre,
-- MAIS ne persiste jamais le resultat dans public.tracks.genres -- seulement
-- un cache local AsyncStorage sur l'appareil qui a declenche l'enrichissement
-- (uniquement Creator Pro/Venue Pro automatiquement, ou un essai Vibes
-- ponctuel pour les autres formules). Le travail de detection etait donc
-- refait/perdu a chaque fois, jamais partage avec les autres utilisateurs
-- ni avec les autres ecrans (dont "Parcourir par style", ajoute aujourd'hui).
--
-- Fix : nouvelle fonction qui persiste un genre resolu APRES coup, une
-- seule fois par morceau (jamais d'ecrasement d'un genre deja renseigne,
-- jamais un client qui invente n'importe quoi -- uniquement un texte court
-- deja passe par le meme filtre cote client).
create or replace function public.keep_track_enrich_genres(p_track_id uuid, p_genres text[])
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  clean_genres text[];
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_id is null then raise exception 'TRACK_ID_REQUIRED'; end if;
  select array_agg(distinct trim(g)) into clean_genres
  from unnest(coalesce(p_genres, array[]::text[])) g
  where trim(coalesce(g,'')) <> '' and length(trim(g)) <= 40;
  if clean_genres is null or array_length(clean_genres,1) is null then return; end if;
  update public.tracks
  set genres = clean_genres
  where id = p_track_id and (genres is null or array_length(genres,1) is null or array_length(genres,1) = 0);
end;
$function$;
grant execute on function public.keep_track_enrich_genres(uuid, text[]) to authenticated;
