-- Adel (29/09/2026) : « l'algorithme des ventes n'est pas propre… imagine
-- 5 millions d'utilisateurs ».
--
-- Audit de keep_profile_sale_suggestions (20260927143000) :
-- 1. Une sélection déjà débloquée par le visiteur (paiement COMPLETED) lui
--    était encore proposée : publicité pour un contenu qu'il possède.
-- 2. Repli « aucun lien social » : balayait TOUS les profils publics et,
--    pour chacun, ses keep_decisions -> coût proportionnel au nombre
--    d'utilisateurs. On part maintenant des seuls vendeurs ayant une offre
--    active (ensemble beaucoup plus petit), sans changer la règle métier.
-- 3. Deux CTE « legacy » jamais utilisées sont supprimées.
-- 4. Un même vendeur pouvait occuper toute la liste : au plus 2 sélections
--    par vendeur pour garder de la diversité.
-- Règles inchangées : jamais sa propre offre, uniquement des offres actives
-- de profils publics, au moins un style en commun avec le visiteur, score =
-- styles communs × 20 + lien social (35 abonné, 45 source d'un keep, 10
-- repli), puis les plus récentes.

create or replace function public.keep_profile_sale_suggestions(p_limit integer default 8)
returns table(offer_id uuid,seller_id uuid,seller_username text,seller_avatar_url text,playlist_name text,track_count integer,genres text[],payment_mode text,price_cents integer,free_price integer,currency_code char(3),match_score integer)
language sql stable security definer set search_path=public,auth as $$
with viewer_genres as (
 select distinct lower(trim(g)) genre from (
  select unnest(coalesce(p.favorite_genres,'{}'::text[])) g from public.profiles p where p.id=auth.uid()
  union all
  select unnest(coalesce(t.genres,'{}'::text[])) g
  from public.keep_decisions kd join public.tracks t on t.id=kd.track_id
  where kd.profile_id=auth.uid() and kd.decision='KEEP'
 ) x where nullif(trim(g),'') is not null
), active_sellers as (
 select distinct o.seller_id from public.playlist_sale_offers o
 where o.is_active=true and o.seller_id<>auth.uid()
), related_sellers as (
 select f.followee_id seller_id, 35 social_score
 from public.follows f join active_sellers a on a.seller_id=f.followee_id
 where f.follower_id=auth.uid()
 union all
 select kd.source_user_id seller_id, 45 social_score
 from public.keep_decisions kd join active_sellers a on a.seller_id=kd.source_user_id
 where kd.profile_id=auth.uid() and kd.decision='KEEP'
), fallback_sellers as (
 select a.seller_id, 10 social_score
 from active_sellers a
 where not exists (select 1 from related_sellers)
), affinity as (
 select seller_id, max(social_score)::integer social_score
 from (select * from related_sellers union all select * from fallback_sellers) x
 group by seller_id
), offers as (
 select o.id offer_id,o.seller_id,p.username seller_username,p.avatar_url seller_avatar_url,o.playlist_name,
 count(distinct ot.track_id)::integer track_count,
 coalesce(array_agg(distinct trim(g.genre)) filter(where nullif(trim(g.genre),'') is not null),'{}'::text[]) genres,
 o.payment_mode,o.price_cents,o.free_price,o.currency_code,
 (count(distinct vg.genre)*20 + a.social_score)::integer match_score,o.updated_at,
 count(distinct vg.genre)::integer genre_match_count
 from public.playlist_sale_offers o
 join affinity a on a.seller_id=o.seller_id
 join public.profiles p on p.id=o.seller_id and p.is_public=true
 join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id
 join public.tracks t on t.id=ot.track_id
 left join lateral(select unnest(coalesce(t.genres,'{}'::text[])) genre) g on true
 left join viewer_genres vg on vg.genre=lower(trim(g.genre))
 where o.is_active=true and o.seller_id<>auth.uid()
   and not exists (
     select 1 from public.playlist_sale_payments pay
     where pay.offer_id=o.id and pay.buyer_id=auth.uid() and pay.status='COMPLETED'
   )
 group by o.id,p.username,p.avatar_url,o.playlist_name,o.payment_mode,o.price_cents,o.free_price,o.currency_code,o.updated_at,a.social_score
), ranked as (
 select *, row_number() over (partition by seller_id order by match_score desc, updated_at desc) seller_rank
 from offers where genre_match_count>0
)
select offer_id,seller_id,seller_username,seller_avatar_url,playlist_name,track_count,genres,payment_mode,price_cents,free_price,currency_code,match_score
from ranked
where seller_rank<=2
order by match_score desc,updated_at desc
limit greatest(1,least(coalesce(p_limit,8),20));
$$;
revoke all on function public.keep_profile_sale_suggestions(integer) from public;
grant execute on function public.keep_profile_sale_suggestions(integer) to authenticated;

-- Index de soutien (idempotents) pour les filtres ci-dessus.
create index if not exists playlist_sale_offers_active_seller_idx on public.playlist_sale_offers(seller_id) where is_active;
create index if not exists playlist_sale_payments_buyer_offer_idx on public.playlist_sale_payments(buyer_id, offer_id) where status='COMPLETED';
