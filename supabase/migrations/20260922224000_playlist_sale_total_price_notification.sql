-- Marketplace 22/09/2026
-- A single price belongs to the complete offer/selection, never to each track.
-- Format notification money explicitly so 300 cents is rendered "3,00 €"
-- instead of a long PostgreSQL numeric representation.

create or replace function public.keep_playlist_sale_notify_followers(
  p_seller_id uuid,
  p_offer_id uuid,
  p_playlist_name text,
  p_price_cents integer,
  p_currency_code text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_last timestamptz;
  v_follower record;
  v_seller_username text;
  v_track_count integer := 0;
  v_price text;
begin
  select last_sale_offer_broadcast_at into v_last
  from public.profiles where id = p_seller_id;

  if v_last is not null and v_last > now() - interval '1 day' then
    return;
  end if;

  select username into v_seller_username from public.profiles where id = p_seller_id;
  select count(*)::integer into v_track_count
  from public.playlist_sale_offer_tracks
  where offer_id = p_offer_id;

  v_price := replace(to_char((p_price_cents::numeric / 100), 'FM999999990.00'), '.', ',')
    || case when upper(coalesce(p_currency_code, 'EUR')) = 'EUR'
      then ' €'
      else ' ' || upper(p_currency_code)
    end;

  for v_follower in
    select distinct recipient.id as follower_id
    from (
      select f.follower_id as id
      from public.follows f
      where f.followee_id = p_seller_id
      union
      select kd.profile_id as id
      from public.keep_decisions kd
      where kd.source_user_id = p_seller_id
        and kd.decision = 'KEPT'
        and kd.profile_id <> p_seller_id
    ) recipient
    left join public.notification_preferences np on np.profile_id = recipient.id
    where coalesce(np.social_enabled, true) = true
  loop
    insert into public.notifications(
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values (
      v_follower.follower_id,
      'PLAYLIST_SALE_OFFER_CREATED',
      '🏷️ Nouvelle sélection en vente',
      coalesce('@' || v_seller_username, 'Un profil que tu suis')
        || ' propose '
        || greatest(v_track_count, 1)
        || case when greatest(v_track_count, 1) > 1 then ' titres' else ' titre' end
        || ' pour ' || v_price || ' au total.',
      jsonb_build_object(
        'event', 'PLAYLIST_SALE_OFFER_CREATED',
        'offerId', p_offer_id,
        'sellerId', p_seller_id,
        'priceCents', p_price_cents,
        'currencyCode', upper(coalesce(p_currency_code, 'EUR')),
        'trackCount', v_track_count,
        'priceScope', 'OFFER_TOTAL'
      ),
      'CREATED',
      0
    );
  end loop;

  update public.profiles
  set last_sale_offer_broadcast_at = now()
  where id = p_seller_id;
end;
$function$;
