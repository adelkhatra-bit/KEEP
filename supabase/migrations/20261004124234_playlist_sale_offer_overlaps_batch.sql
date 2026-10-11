create or replace function public.keep_playlist_sale_offer_overlaps(p_offer_ids uuid[])
returns table(
  offer_id uuid,
  total_count integer,
  owned_count integer,
  missing_count integer
)
language sql
stable
security definer
set search_path = 'public','auth'
as $$
  with requested as (
    select distinct x as offer_id
    from unnest(coalesce(p_offer_ids, '{}'::uuid[])) as u(x)
    where x is not null
    limit 80
  ),
  visible as (
    select o.id as offer_id, o.seller_id, o.playlist_id
    from public.playlist_sale_offers o
    join requested r on r.offer_id = o.id
    where o.is_active = true
      and (o.target_buyer_id is null or o.target_buyer_id = auth.uid())
  ),
  expanded as (
    select v.offer_id, t.track_id
    from visible v
    cross join lateral unnest(public.keep_playlist_sale_track_ids(v.seller_id, v.playlist_id)) t(track_id)
  )
  select
    v.offer_id,
    count(e.track_id)::integer as total_count,
    count(e.track_id) filter (
      where auth.uid() is not null
        and public.keep_playlist_sale_track_is_owned(auth.uid(), e.track_id)
    )::integer as owned_count,
    (
      count(e.track_id)
      - count(e.track_id) filter (
          where auth.uid() is not null
            and public.keep_playlist_sale_track_is_owned(auth.uid(), e.track_id)
        )
    )::integer as missing_count
  from visible v
  left join expanded e on e.offer_id = v.offer_id
  group by v.offer_id;
$$;

revoke all on function public.keep_playlist_sale_offer_overlaps(uuid[]) from public;
grant execute on function public.keep_playlist_sale_offer_overlaps(uuid[]) to authenticated;
