-- Loki Music: personalized event discovery inside Pulse.
-- Organic ranking only: followed organizers > favorite artists > local country >
-- real RSVP/checked-in activity > freshness. Never sell false statistics.
-- Age gating, event approval and 24h expiration are unchanged.

CREATE OR REPLACE FUNCTION public.keep_event_story_list(p_limit integer DEFAULT 20)
 RETURNS TABLE(event_id uuid, creator_id uuid, username text, event_name text, description text, venue_name text, image_url text, starts_at timestamp with time zone, ends_at timestamp with time zone, shared_at timestamp with time zone, going_count bigint, maybe_count bigint, checked_in_count bigint, pulse_score bigint, ticket_price_cents integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  with viewer as (select p.is_adult from public.profiles p where p.id=auth.uid())
  select
    e.id,e.creator_id,p.username::text,e.name,e.description,e.venue_name,
    e.image_url,e.starts_at,e.ends_at,s.created_at,
    r.going_count,r.maybe_count,r.checked_in_count,
    (r.going_count*5 + r.maybe_count + r.checked_in_count*10)::bigint,
    e.ticket_price_cents
  from public.keep_event_story_shares s
  join public.events e on e.id=s.event_id and e.creator_id=s.profile_id
  join public.profiles p on p.id=e.creator_id
  cross join lateral (
    select
      count(*) filter(where status='GOING')::bigint as going_count,
      count(*) filter(where status='MAYBE')::bigint as maybe_count,
      count(*) filter(where checked_in_at is not null)::bigint as checked_in_count
    from public.event_rsvps where event_id=e.id
  ) r
  where e.is_disabled=false
    and e.moderation_status='APPROVED'
    and e.starts_at <= now()+interval '1 year'
    and coalesce(e.ends_at,e.starts_at+interval '6 hours')>now()
    and s.created_at>=now()-interval '24 hours'
    and (e.audience_mode <> 'ADULTS_18_PLUS' or coalesce((select is_adult from viewer),false))
  order by
    -- Followed organizers first; taste and locality decide the rest.
    case when exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=e.creator_id) then 0 else 1 end,
    case when exists(
      select 1 from public.profiles viewer
      where viewer.id=auth.uid() and exists(
        select 1 from unnest(coalesce(viewer.favorite_artists,array[]::text[])) as favorite(artist)
        join unnest(coalesce(e.dj_artist_names,array[]::text[])) as advertised(artist)
          on lower(trim(favorite.artist))=lower(trim(advertised.artist))
      )
    ) then 0 else 1 end,
    case when exists(select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.country_code=e.country_code) then 0 else 1 end,
    (r.going_count*5 + r.maybe_count + r.checked_in_count*10) desc,
    s.created_at desc
  limit least(greatest(coalesce(p_limit,20),1),30);
$function$;