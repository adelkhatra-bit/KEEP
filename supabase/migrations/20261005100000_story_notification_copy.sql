-- Notification « nouvelle story » : titre et texte incitatifs, titre/artiste toujours masqués.
-- Additif : remplace uniquement le texte écrit par le trigger existant.
-- (La présence en ligne réutilise keep_public_profile_presence : aucune colonne ajoutée.)

-- Texte incitatif : peu d'informations, titre et artiste restent masqués.
create or replace function public.loki_normalize_new_public_keep_notification()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_name text := nullif(regexp_replace(coalesce(new.data->>'sourceUsername', new.data->>'username', ''), '^@+', ''), '');
begin
  if upper(coalesce(new.type,'')) = 'NEW_PUBLIC_KEEP' then
    if v_name is not null then
      new.title := '@' || v_name || ' a une nouvelle story';
    end if;
    new.body := 'Viens écouter avant qu''elle disparaisse.';
    new.data := (coalesce(new.data,'{}'::jsonb) - 'trackTitle' - 'trackArtist' - 'artworkUrl')
      || '{"masked":true,"freeSocialKeep":true,"story":true}'::jsonb;
  end if;
  return new;
end;
$function$;
