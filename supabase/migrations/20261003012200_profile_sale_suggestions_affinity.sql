-- Personalized, scalable Drop recommendations for Loki profiles.
-- Audience = followers / users who liked a track first discovered by the seller /
-- users who already kept a track from the seller. Style compatibility remains a
-- hard gate whenever both sides have genre data.

create index if not exists idx_playlist_sale_offers_active_seller_updated
  on public.playlist_sale_offers (seller_id, updated_at desc)
  where is_active = true and target_buyer_id is null;

create index if not exists idx_keep_decisions_profile_source_kept
  on public.keep_decisions (profile_id, source_user_id)
  where decision = 'KEPT' and source_user_id is not null;

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
  currency_code character,
  match_score integer
)
language sql
stable
security definer
set search_path = public, auth
as $$
with
viewer as (
  select auth.uid() as uid,
         greatest(1, least(coalesce(p_limit, 8), 20)) as limit_n
),
viewer_genres as (
  select distinct lower(trim(g)) as genre
  from (
    select unnest(coalesce(p.favorite_genres, '{}'::text[]) || coalesce(p.inferred_genres, '{}'::text[])) as g
    from public.profiles p, viewer v
    where p.id = v.uid

    union all

    select unnest(coalesce(t.genres, '{}'::text[])) as g
    from public.keep_decisions kd
    join public.tracks t on t.id = kd.track_id
    join viewer v on v.uid = kd.profile_id
    where kd.decision = 'KEPT'

    union all

    select unnest(coalesce(t.genres, '{}'::text[])) as g
    from public.track_likes tl
    join public.tracks t on t.id = tl.track_id
    join viewer v on v.uid = tl.profile_id
  ) source
  where nullif(trim(g), '') is not null
),
viewer_genre_count as (
  select count(*)::integer as known_count from viewer_genres
),
social_signals as (
  select f.followee_id as seller_id, 70 as follow_score, 0 as like_score, 0 as reprise_score
  from public.follows f
  join viewer v on v.uid = f.follower_id

  union all

  select fd.profile_id as seller_id, 0, 55, 0
  from public.track_likes tl
  join public.keep_track_first_discoveries fd on fd.track_id = tl.track_id
  join viewer v on v.uid = tl.profile_id
  where fd.profile_id <> v.uid

  union all

  select kd.source_user_id as seller_id, 0, 0, 85
  from public.keep_decisions kd
  join viewer v on v.uid = kd.profile_id
  where kd.decision = 'KEPT'
    and kd.source_user_id is not null
    and kd.source_user_id <> v.uid
),
candidate_sellers as (
  select seller_id,
         max(follow_score) + max(like_score) + max(reprise_score) as social_score
  from social_signals
  where seller_id is not null
  group by seller_id
),
offer_agg as (
  select
    o.id as offer_id,
    o.seller_id,
    p.username as seller_username,
    p.avatar_url as seller_avatar_url,
    o.playlist_name,
    count(distinct ot.track_id)::integer as track_count,
    coalesce(array_agg(distinct lower(trim(g.genre))) filter (where nullif(trim(g.genre), '') is not null), '{}'::text[]) as genres,
    o.payment_mode,
    o.price_cents,
    o.free_price,
    o.currency_code,
    o.updated_at,
    cs.social_score,
    count(distinct vg.genre) filter (where vg.genre is not null)::integer as genre_overlap
  from candidate_sellers cs
  join public.playlist_sale_offers o
    on o.seller_id = cs.seller_id
   and o.is_active = true
   and o.target_buyer_id is null
  join public.profiles p
    on p.id = o.seller_id
   and p.is_public = true
   and coalesce(p.discovery_hidden, false) = false
  left join public.playlist_sale_offer_tracks ot on ot.offer_id = o.id
  left join public.tracks t on t.id = ot.track_id
  left join lateral (
    select unnest(coalesce(t.genres, '{}'::text[])) as genre
  ) g on true
  left join viewer_genres vg
    on vg.genre = lower(trim(g.genre))
    or (
      length(vg.genre) >= 4
      and length(trim(g.genre)) >= 4
      and (
        position(vg.genre in lower(trim(g.genre))) > 0
        or position(lower(trim(g.genre)) in vg.genre) > 0
      )
    )
  join viewer v on true
  where not exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = v.uid and b.blocked_id = o.seller_id)
       or (b.blocker_id = o.seller_id and b.blocked_id = v.uid)
  )
  group by o.id, o.seller_id, p.username, p.avatar_url, o.playlist_name,
           o.payment_mode, o.price_cents, o.free_price, o.currency_code,
           o.updated_at, cs.social_score
),
ranked as (
  select
    oa.*,
    (oa.social_score + oa.genre_overlap * 30)::integer as final_score
  from offer_agg oa
  cross join viewer_genre_count vgc
  where oa.track_count > 0
    and (
      vgc.known_count = 0
      or cardinality(oa.genres) = 0
      or oa.genre_overlap > 0
    )
  order by final_score desc, oa.updated_at desc
  limit (select limit_n from viewer)
)
select
  r.offer_id,
  r.seller_id,
  r.seller_username,
  r.seller_avatar_url,
  r.playlist_name,
  r.track_count,
  coalesce((x.overlap->>'ownedCount')::integer, 0) as owned_count,
  coalesce((x.overlap->>'missingCount')::integer, r.track_count) as missing_count,
  r.genres,
  r.payment_mode,
  r.price_cents,
  r.free_price,
  r.currency_code,
  r.final_score as match_score
from ranked r
cross join lateral (
  select public.keep_playlist_sale_offer_overlap(r.offer_id) as overlap
) x
order by r.final_score desc, r.updated_at desc;
$$;

revoke all on function public.keep_profile_sale_suggestions(integer) from public, anon;
grant execute on function public.keep_profile_sale_suggestions(integer) to authenticated;
