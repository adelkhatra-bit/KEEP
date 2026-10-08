-- Une seule source de vérité pour l'ajout gratuit depuis NEW_PUBLIC_KEEP.
-- Le chemin canonique est keep-music-core -> keep_commit_follow_notification_decision.

drop function if exists public.keep_commit_public_notification_keep(uuid,text);

create or replace function public.loki_normalize_new_public_keep_notification()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if upper(coalesce(new.type,'')) = 'NEW_PUBLIC_KEEP' then
    new.body := 'Titre et artiste masqués · écoute puis ajoute gratuitement pour les révéler.';
    new.data := (coalesce(new.data,'{}'::jsonb) - 'trackTitle' - 'trackArtist' - 'artworkUrl')
      || '{"masked":true,"freeSocialKeep":true}'::jsonb;
  end if;
  return new;
end;
$function$;

update public.notifications
set body = 'Titre et artiste masqués · écoute puis ajoute gratuitement pour les révéler.',
    data = (coalesce(data,'{}'::jsonb) - 'trackTitle' - 'trackArtist' - 'artworkUrl')
      || '{"masked":true,"freeSocialKeep":true}'::jsonb
where upper(type) = 'NEW_PUBLIC_KEEP';
