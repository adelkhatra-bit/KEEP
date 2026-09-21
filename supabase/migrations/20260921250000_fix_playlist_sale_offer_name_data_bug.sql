-- Adel (21/09/2026) : "L'offre s'affiche avec un identifiant technique
-- incompréhensible : keep-selection:bca8c268-... Un vendeur ne peut pas
-- gérer ses ventes avec un UUID."
--
-- AUDIT effectué avant tout code (comme demandé) : vérifié directement en
-- base -- l'offre d'adel4A a réellement playlist_name =
-- 'keep-selection:bca8c268-c1ec-4d7b-80d6-1f724db35c2a', identique à son
-- playlist_id. Le code (client ET les deux versions de la RPC de création,
-- v1 du 18/09 et v2 du 20/09) sépare TOUJOURS correctement playlist_name
-- (nom donné par le vendeur) de playlist_id (identifiant technique) --
-- vérifié ligne par ligne, aucune confusion possible dans le flux actuel.
-- Cette offre date du 15/09/2026, avant même que ces migrations existent :
-- c'est une donnée orpheline d'un test antérieur, pas un bug reproductible
-- aujourd'hui. Corrigée quand même (l'utilisateur ne doit jamais voir un
-- UUID, peu importe l'origine de la donnée), et une garde-fou est ajoutée
-- pour qu'aucune donnée future ne puisse reproduire ce cas, quelle que
-- soit la voie d'insertion (RPC actuelle, future, ou script direct).
update public.playlist_sale_offers
set playlist_name = 'Sélection du ' || to_char(created_at, 'DD/MM') || ' · ' ||
  (select count(*) from public.playlist_sale_offer_tracks t where t.offer_id = playlist_sale_offers.id) ||
  ' morceau' || (case when (select count(*) from public.playlist_sale_offer_tracks t where t.offer_id = playlist_sale_offers.id) > 1 then 'x' else '' end)
where playlist_name = playlist_id or playlist_name like 'keep-selection:%';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.playlist_sale_offers'::regclass
      and conname = 'playlist_sale_offers_name_not_technical_id'
  ) then
    alter table public.playlist_sale_offers
      add constraint playlist_sale_offers_name_not_technical_id
      check (playlist_name !~ '^keep-selection:' and length(trim(playlist_name)) > 0);
  end if;
end $$;

-- FUITE RÉELLE trouvée dans le même audit (pas seulement un UUID moche) :
-- keep_playlist_sale_offers_for_profile() -- appelée pour afficher les
-- offres sur le profil PUBLIC d'un vendeur, à n'importe quel visiteur non
-- authentifié -- renvoyait le VRAI nom donné par le vendeur (ex. "Sélection
-- Chanson FR", potentiellement révélateur) ET la vraie jaquette du premier
-- morceau. Contraire à la règle déjà en place ailleurs (preview 15s,
-- masquage des morceaux) : "on ne dévoile rien avant achat". Corrigé en
-- masquant nom et jaquette pour cette vue publique uniquement -- la vue
-- vendeur (keep_playlist_sale_my_offers, authentifiée, filtrée sur
-- seller_id = auth.uid()) n'est pas touchée, le vendeur voit toujours son
-- vrai titre.
drop function if exists public.keep_playlist_sale_offers_for_profile(uuid);
create function public.keep_playlist_sale_offers_for_profile(p_profile_id uuid)
returns table(
  offer_id uuid,
  playlist_id text,
  playlist_name text,
  price_cents integer,
  currency_code text,
  cover_url text,
  track_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    o.id,
    o.playlist_id,
    'Découverte musicale',
    o.price_cents,
    o.currency_code::text,
    null::text,
    cardinality(public.keep_playlist_sale_track_ids(o.seller_id, o.playlist_id))::integer
  from public.playlist_sale_offers o
  where o.seller_id = p_profile_id and o.is_active = true
  order by o.updated_at desc;
$function$;
grant execute on function public.keep_playlist_sale_offers_for_profile(uuid) to anon, authenticated;
