create or replace function public.keep_profile_sale_suggestions(p_limit integer default 8)
returns table(offer_id uuid,seller_id uuid,seller_username text,seller_avatar_url text,playlist_name text,track_count integer,genres text[],payment_mode text,price_cents integer,free_price integer,currency_code char(3),match_score integer)
language sql stable security definer set search_path=public,auth as $$
with viewer_genres as (
 select distinct lower(trim(g)) genre from (
  select unnest(coalesce(p.favorite_genres,'{}'::text[])) g from public.profiles p where p.id=auth.uid()
  union all
  select unnest(coalesce(t.genres,'{}'::text[])) g from public.keep_decisions kd join public.tracks t on t.id=kd.track_id where kd.profile_id=auth.uid() and kd.decision='KEEP'
 ) x where nullif(trim(g),'') is not null
), affinity as (
 select p.id seller_id,
   case when exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=p.id) then 35 else 0 end
   + case when exists(select 1 from public.keep_decisions kd where kd.profile_id=auth.uid() and kd.source_user_id=p.id and kd.decision='KEEP') then 45 else 0 end as social_score
 from public.profiles p
), offers as (
 select o.id offer_id,o.seller_id,p.username seller_username,p.avatar_url seller_avatar_url,o.playlist_name,count(distinct ot.track_id)::integer track_count,
 coalesce(array_agg(distinct g.genre) filter(where g.genre is not null),'{}'::text[]) genres,o.payment_mode,o.price_cents,o.free_price,o.currency_code,
 (count(distinct vg.genre)*20 + coalesce(a.social_score,0))::integer match_score,o.updated_at
 from public.playlist_sale_offers o join public.profiles p on p.id=o.seller_id and p.is_public=true
 left join affinity a on a.seller_id=o.seller_id
 left join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id left join public.tracks t on t.id=ot.track_id
 left join lateral(select unnest(coalesce(t.genres,'{}'::text[])) genre) g on true left join viewer_genres vg on vg.genre=lower(trim(g.genre))
 where o.is_active=true and (auth.uid() is null or o.seller_id<>auth.uid())
 group by o.id,p.username,p.avatar_url,o.playlist_name,o.payment_mode,o.price_cents,o.free_price,o.currency_code,o.updated_at,a.social_score
)
select offer_id,seller_id,seller_username,seller_avatar_url,playlist_name,track_count,genres,payment_mode,price_cents,free_price,currency_code,match_score
from offers
where match_score>0 or auth.uid() is null
order by match_score desc,updated_at desc limit greatest(1,least(coalesce(p_limit,8),20)); $$;
revoke all on function public.keep_profile_sale_suggestions(integer) from public;
grant execute on function public.keep_profile_sale_suggestions(integer) to anon,authenticated;