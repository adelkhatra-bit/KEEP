-- Loki Music: recommandations de Pépites = lien social + compatibilité musicale.
-- Quand les goûts du visiteur sont connus, une collection sans style commun
-- ne peut pas lui être proposée. Les vendeurs sans lien social ne servent de
-- repli que si le visiteur n'a encore aucune relation exploitable.

create or replace function public.keep_profile_sale_suggestions(p_limit integer default 8)
returns table(
  offer_id uuid,
  seller_id uuid,
  seller_username text,
  seller_avatar_url text,
  playlist_name text,
  track_count integer,
  owned_count integer,
  missing_count integer,
  genres text[],
  payment_mode text,
  price_cents integer,
  free_price integer,
  currency_code char(3),
  match_score integer
)
language sql
stable
security definer
set search_path = public, auth
as $$
with viewer_genres as (
  select distinct lower(trim(g)) genre
  from (
    select unnest(coalesce(p.favorite_genres,'{}'::text[])) g
    from public.profiles p
    where p.id = auth.uid()
    union all
    select unnest(coalesce(t.genres,'{}'::text[])) g
    from public.keep_decisions kd
    join public.tracks t on t.id = kd.track_id
    where kd.profile_id = auth.uid()
      and kd.decision in ('KEEP','KEPT')
  ) x
  where nullif(trim(g),'') is not null
),
viewer_genre_count as (
  select count(*)::integer n from viewer_genres
),
active_sellers as (
  select distinct o.seller_id
  from public.playlist_sale_offers o
  where o.is_active = true
    and (auth.uid() is null or o.seller_id <> auth.uid())
),
related_sellers as (
  select f.followee_id seller_id, 35 social_score
  from public.follows f
  join active_sellers a on a.seller_id = f.followee_id
  where f.follower_id = auth.uid()
  union all
  select kd.source_user_id seller_id, 45 social_score
  from public.keep_decisions kd
  join active_sellers a on a.seller_id = kd.source_user_id
  where kd.profile_id = auth.uid()
    and kd.decision in ('KEEP','KEPT')
    and kd.source_user_id is not null
),
social_count as (
  select count(*)::integer n from related_sellers
),
fallback_sellers as (
  select a.seller_id, 10 social_score
  from active_sellers a, social_count sc
  where sc.n = 0
),
affinity as (
  select seller_id, max(social_score)::integer social_score
  from (
    select * from related_sellers
    union all
    select * from fallback_sellers
  ) x
  group by seller_id
),
offers as (
  select
    o.id offer_id,
    o.seller_id,
    p.username seller_username,
    p.avatar_url seller_avatar_url,
    o.playlist_name,
    count(distinct ot.track_id)::integer track_count,
    coalesce(array_agg(distinct trim(g.genre)) filter(where nullif(trim(g.genre),'') is not null),'{}'::text[]) genres,
    o.payment_mode,
    o.price_cents,
    o.free_price,
    o.currency_code,
    (count(distinct vg.genre) * 20 + a.social_score)::integer match_score,
    count(distinct vg.genre)::integer genre_match_count,
    o.updated_at
  from public.playlist_sale_offers o
  join affinity a on a.seller_id = o.seller_id
  join public.profiles p on p.id = o.seller_id and p.is_public = true
  join public.playlist_sale_offer_tracks ot on ot.offer_id = o.id
  join public.tracks t on t.id = ot.track_id
  left join lateral (select unnest(coalesce(t.genres,'{}'::text[])) genre) g on true
  left join viewer_genres vg on vg.genre = lower(trim(g.genre))
  where o.is_active = true
    and o.target_buyer_id is null
    and (auth.uid() is null or o.seller_id <> auth.uid())
    and not exists (
      select 1
      from public.playlist_sale_payments pay
      where pay.offer_id = o.id
        and pay.buyer_id = auth.uid()
        and pay.status = 'COMPLETED'
    )
  group by
    o.id,p.username,p.avatar_url,o.playlist_name,o.payment_mode,
    o.price_cents,o.free_price,o.currency_code,o.updated_at,a.social_score
),
ranked as (
  select o.*,
         row_number() over (
           partition by o.seller_id
           order by o.match_score desc, o.updated_at desc
         ) seller_rank
  from offers o, viewer_genre_count vgc
  where vgc.n = 0 or o.genre_match_count > 0
)
select
  o.offer_id,
  o.seller_id,
  o.seller_username,
  o.seller_avatar_url,
  o.playlist_name,
  o.track_count,
  coalesce((x.overlap->>'ownedCount')::integer,0) as owned_count,
  coalesce((x.overlap->>'missingCount')::integer,o.track_count) as missing_count,
  o.genres,
  o.payment_mode,
  o.price_cents,
  o.free_price,
  o.currency_code,
  o.match_score
from ranked o
cross join lateral (
  select public.keep_playlist_sale_offer_overlap(o.offer_id) as overlap
) x
where o.seller_rank <= 2
order by o.match_score desc, o.updated_at desc
limit greatest(1,least(coalesce(p_limit,8),20));
$$;

revoke all on function public.keep_profile_sale_suggestions(integer) from public;
grant execute on function public.keep_profile_sale_suggestions(integer) to authenticated;
