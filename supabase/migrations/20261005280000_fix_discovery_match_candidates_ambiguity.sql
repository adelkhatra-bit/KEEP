-- Suggestions d'amis par style cassées pour TOUS les utilisateurs ayant des goûts (Adel 05/10/2026) :
-- "column reference country_code is ambiguous" (variable OUT du RETURNS TABLE vs colonne). Corrigé en qualifiant chaque colonne.
-- Remplace uniquement le corps de la fonction ; signature, droits et données inchangés.
CREATE OR REPLACE FUNCTION public.keep_discovery_match_candidates(p_limit integer DEFAULT 24)
 RETURNS TABLE(profile_id uuid, username text, display_name text, avatar_url text, city text, country_code character, match_score integer, shared_tracks integer, shared_artists text[], shared_genres text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := auth.uid();
  v_artists text[];
  v_genres text[];
  v_country character;
begin
  if v_id is null then return; end if;
  select coalesce(me.favorite_artists,'{}'::text[]), coalesce(me.favorite_genres,'{}'::text[]), me.country_code
    into v_artists, v_genres, v_country
  from public.profiles me where me.id = v_id;

  return query
  with candidates as (
    select p.id as cid, p.username as cusername, p.display_name as cdisplay, p.avatar_url as cavatar, p.city as ccity, p.country_code as ccountry
    from public.profiles p
    where p.id <> v_id
      and p.is_public = true
      and coalesce(p.discovery_hidden,false) = false
      and (
        (cardinality(v_artists) > 0 and p.favorite_artists && v_artists)
        or (cardinality(v_genres) > 0 and p.favorite_genres && v_genres)
      )
    order by
      case when p.country_code = v_country then 0 else 1 end,
      p.updated_at desc
    limit greatest(1, least(coalesce(p_limit,24), 100)) * 3
  ), scored as (
    select c.*, m.score as mscore, m.shared_tracks as mtracks, m.shared_artists as martists, m.shared_genres as mgenres
    from candidates c
    cross join lateral public.keep_profile_match_score(c.cid) m
  )
  select s.cid, s.cusername, s.cdisplay, s.cavatar, s.ccity, s.ccountry,
         s.mscore, s.mtracks, s.martists, s.mgenres
  from scored s
  order by s.mscore desc, s.mtracks desc, s.cusername
  limit greatest(1, least(coalesce(p_limit,24), 100));
end;
$function$;
