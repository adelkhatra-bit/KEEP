-- Adel (14/09/2026) : "sur le profil utilisateur, fait pareil quand on va
-- visiter un autre utilisateur" -- le vendeur peut deja fixer un prix
-- (keep_playlist_sale_set_price), mais un visiteur n'avait aucun moyen de
-- voir ces offres (RLS playlist_sale_offers = lecture de ses propres lignes
-- uniquement). Fonction publique dediee, ne renvoie QUE ce qui doit etre
-- visible (nom, prix, devise) pour les offres ACTIVES d'un vendeur donne --
-- jamais les lignes d'autres vendeurs, jamais un champ prive.
create or replace function public.keep_playlist_sale_offers_for_profile(p_profile_id uuid)
returns table(playlist_id text, playlist_name text, price_cents integer, currency_code text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select playlist_id, playlist_name, price_cents, currency_code
  from public.playlist_sale_offers
  where seller_id = p_profile_id and is_active = true
  order by updated_at desc;
$function$;
grant execute on function public.keep_playlist_sale_offers_for_profile(uuid) to anon, authenticated;
