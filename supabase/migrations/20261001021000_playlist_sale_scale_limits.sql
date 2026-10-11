-- KEEP / Loki Music — marketplace scale guard
-- User request 2026-10-01: no design explosion when a creator publishes many
-- collections. Server is authoritative: every code path is covered, including
-- future clients and offer edits.

insert into public.remote_config(key, value, description)
values (
  'playlist_sale_max_active_offers',
  '50'::jsonb,
  'Maximum de collections exclusives actives par vendeur. Garde-fou serveur configurable; défaut 50.'
)
on conflict (key) do nothing;

create or replace function public.keep_playlist_sale_access()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  follower_count integer := 0;
  override integer;
  threshold integer := 100;
  active_offers integer := 0;
  max_active_offers integer := 50;
  raw_limit text;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select count(*)::integer into follower_count
  from public.follows
  where followee_id = uid;

  select p.follower_count_override into override
  from public.profiles p
  where p.id = uid;
  if override is not null then follower_count := override; end if;

  select value #>> '{}' into raw_limit
  from public.remote_config
  where key='playlist_sale_max_active_offers'
  limit 1;
  if coalesce(raw_limit, '') ~ '^[0-9]+$' then
    max_active_offers := greatest(1, least(raw_limit::integer, 500));
  end if;

  threshold := coalesce(
    (select case when (value #>> '{}') ~ '^[0-9]+$' then (value #>> '{}')::integer else null end
     from public.remote_config where key='playlist_sale_follower_threshold' limit 1),
    100
  );

  select count(*)::integer into active_offers
  from public.playlist_sale_offers
  where seller_id = uid and is_active = true;

  return jsonb_build_object(
    'followers', follower_count,
    'threshold', threshold,
    'unlocked', follower_count >= threshold,
    'activeOffers', active_offers,
    'maxActiveOffers', max_active_offers
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_access() from public;
revoke all on function public.keep_playlist_sale_access() from anon;
grant execute on function public.keep_playlist_sale_access() to authenticated;

create or replace function public.keep_enforce_playlist_sale_active_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_limit integer := 50;
  v_count integer := 0;
  v_raw text;
begin
  if new.is_active is not true then return new; end if;

  select value #>> '{}' into v_raw
  from public.remote_config
  where key='playlist_sale_max_active_offers'
  limit 1;
  if coalesce(v_raw, '') ~ '^[0-9]+$' then
    v_limit := greatest(1, least(v_raw::integer, 500));
  end if;

  select count(*)::integer into v_count
  from public.playlist_sale_offers o
  where o.seller_id = new.seller_id
    and o.is_active = true
    and o.id <> new.id;

  if v_count >= v_limit then
    raise exception 'PLAYLIST_SALE_ACTIVE_LIMIT:%', v_limit;
  end if;
  return new;
end;
$function$;

revoke all on function public.keep_enforce_playlist_sale_active_limit() from public;
revoke all on function public.keep_enforce_playlist_sale_active_limit() from anon;
revoke all on function public.keep_enforce_playlist_sale_active_limit() from authenticated;

drop trigger if exists playlist_sale_active_limit_guard on public.playlist_sale_offers;
create trigger playlist_sale_active_limit_guard
before insert or update of is_active, seller_id on public.playlist_sale_offers
for each row execute function public.keep_enforce_playlist_sale_active_limit();

create or replace function public.keep_enforce_playlist_sale_track_limit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_count integer := 0;
begin
  if exists (
    select 1 from public.playlist_sale_offer_tracks x
    where x.offer_id = new.offer_id and x.track_id = new.track_id
  ) then
    return new;
  end if;

  select count(*)::integer into v_count
  from public.playlist_sale_offer_tracks x
  where x.offer_id = new.offer_id;

  if v_count >= 200 then
    raise exception 'TRACK_SELECTION_TOO_LARGE';
  end if;
  return new;
end;
$function$;

revoke all on function public.keep_enforce_playlist_sale_track_limit() from public;
revoke all on function public.keep_enforce_playlist_sale_track_limit() from anon;
revoke all on function public.keep_enforce_playlist_sale_track_limit() from authenticated;

drop trigger if exists playlist_sale_offer_track_limit_guard on public.playlist_sale_offer_tracks;
create trigger playlist_sale_offer_track_limit_guard
before insert on public.playlist_sale_offer_tracks
for each row execute function public.keep_enforce_playlist_sale_track_limit();

-- Two concrete missing indexes reported by Supabase Performance Advisor.
create index if not exists playlist_sale_track_requests_response_offer_idx
  on public.playlist_sale_track_requests(response_offer_id)
  where response_offer_id is not null;

create index if not exists music_agora_message_reports_reporter_idx
  on public.music_agora_message_reports(reporter_id);
