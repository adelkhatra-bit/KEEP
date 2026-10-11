-- Profile opportunity rail: only surface releases from a real social/music relationship
-- and never recommend an offer whose musical genres do not intersect the viewer's taste.
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
), related_sellers as (
 select f.followee_id seller_id, 35 social_score
 from public.follows f where f.follower_id=auth.uid()
 union
 select kd.source_user_id seller_id, 45 social_score
 from public.keep_decisions kd
 where kd.profile_id=auth.uid() and kd.decision='KEEP' and kd.source_user_id is not null
), social_count as (
 select count(*)::integer n from related_sellers
), candidate_sellers as (
 select seller_id,max(social_score)::integer social_score from related_sellers group by seller_id
 union
 select p.id seller_id, 10 social_score
 from public.profiles p, social_count sc
 where sc.n=0 and p.id<>auth.uid() and p.is_public=true
 and exists (
   select 1 from public.keep_decisions kd2
   join public.tracks t2 on t2.id=kd2.track_id
   left join lateral(select unnest(coalesce(t2.genres,'{}'::text[])) genre) gg on true
   join viewer_genres vg2 on vg2.genre=lower(trim(gg.genre))
   where kd2.profile_id=p.id and kd2.decision='KEEP' and kd2.visibility='PUBLIC'
 )
), affinity as (
 select seller_id,max(social_score)::integer social_score from candidate_sellers group by seller_id
), legacy_related_sellers as (
 select f.followee_id seller_id, 35 social_score
 from public.follows f where f.follower_id=auth.uid()
 union
 select kd.source_user_id seller_id, 45 social_score
 from public.keep_decisions kd
 where kd.profile_id=auth.uid() and kd.decision='KEEP' and kd.source_user_id is not null
), legacy_affinity_unused as (
 select seller_id,max(social_score)::integer social_score from legacy_related_sellers group by seller_id
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
 group by o.id,p.username,p.avatar_url,o.playlist_name,o.payment_mode,o.price_cents,o.free_price,o.currency_code,o.updated_at,a.social_score
)
select offer_id,seller_id,seller_username,seller_avatar_url,playlist_name,track_count,genres,payment_mode,price_cents,free_price,currency_code,match_score
from offers
where genre_match_count>0
order by match_score desc,updated_at desc
limit greatest(1,least(coalesce(p_limit,8),20));
$$;
revoke all on function public.keep_profile_sale_suggestions(integer) from public;
grant execute on function public.keep_profile_sale_suggestions(integer) to authenticated;
