-- Adel (15/09/2026) : "je ne vends pas de la musique comme un artiste, je
-- vends juste ma decouverte et ma playlist ... je te vends la maniere dont
-- ils sont ranges et les artistes que j'aime, pas la musique." Pour que ça
-- vaille quelque chose a acheter, les titres/artistes d'une playlist en
-- vente doivent rester masques ailleurs sur le profil (liste des morceaux
-- publics, styles, artistes) tant que ce n'est pas achete -- sinon tout est
-- deja visible gratuitement, rien a debloquer. KEEP ne vend et ne stocke
-- jamais l'audio, achete ou pas : seule la SELECTION (quels morceaux, dans
-- quel ordre) est le produit, jamais un fichier ni un droit sur la musique
-- elle-meme -- ce qui evite toute requalification en revendeur de musique.
--
-- Fonction publique : resout les morceaux membres d'une offre de vente
-- (smart album "keep-smart:<uuid>" OU playlist connectee via
-- provider_playlist_id), pour que le client puisse les exclure des vues
-- publiques gratuites. Ne renvoie que des identifiants, jamais de contenu.
create or replace function public.keep_playlist_sale_track_ids(p_seller_id uuid, p_playlist_id text)
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_playlist_row_id uuid;
  v_ids uuid[];
begin
  if p_seller_id is null or p_playlist_id is null or trim(p_playlist_id) = '' then return array[]::uuid[]; end if;
  if p_playlist_id like 'keep-smart:%' then
    v_playlist_row_id := nullif(substring(p_playlist_id from 12), '')::uuid;
  else
    select id into v_playlist_row_id from public.playlists
    where owner_id = p_seller_id and provider_playlist_id = p_playlist_id
    limit 1;
  end if;
  if v_playlist_row_id is null then return array[]::uuid[]; end if;
  select coalesce(array_agg(pt.track_id), array[]::uuid[]) into v_ids
  from public.playlist_tracks pt
  join public.playlists pl on pl.id = pt.playlist_id
  where pt.playlist_id = v_playlist_row_id and pl.owner_id = p_seller_id;
  return v_ids;
exception when invalid_text_representation then
  return array[]::uuid[];
end;
$function$;
grant execute on function public.keep_playlist_sale_track_ids(uuid, text) to anon, authenticated;

-- Vue d'ensemble pratique pour le client : pour un vendeur donne, tous les
-- track_id actuellement masques (union de toutes ses offres actives) en un
-- seul appel plutot qu'un aller-retour par offre.
create or replace function public.keep_playlist_sale_masked_track_ids(p_seller_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_offer record;
  v_ids uuid[] := array[]::uuid[];
  v_batch uuid[];
begin
  if p_seller_id is null then return array[]::uuid[]; end if;
  for v_offer in select playlist_id from public.playlist_sale_offers where seller_id = p_seller_id and is_active = true loop
    v_batch := public.keep_playlist_sale_track_ids(p_seller_id, v_offer.playlist_id);
    v_ids := v_ids || v_batch;
  end loop;
  return (select coalesce(array_agg(distinct x), array[]::uuid[]) from unnest(v_ids) x);
end;
$function$;
grant execute on function public.keep_playlist_sale_masked_track_ids(uuid) to anon, authenticated;
