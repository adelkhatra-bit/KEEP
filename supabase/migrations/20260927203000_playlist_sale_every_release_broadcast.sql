-- Restore release broadcasts: every NEW album/collection is a new event.
-- Existing audience contract is preserved: followers + profiles that previously
-- kept a discovery attributed to the seller. Edits never call this function.

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
  v_recipient record;
  v_seller_username text;
begin
  select username into v_seller_username from public.profiles where id = p_seller_id;

  for v_recipient in
    select distinct recipient.id
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
    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    values (
      v_recipient.id,
      'PLAYLIST_SALE_OFFER_CREATED',
      '◆ Nouvelle pépite à écouter',
      coalesce('@'||v_seller_username,'Un profil que tu suis')||
        ' vient de publier « '||p_playlist_name||' ». Écoute-la avant de la débloquer.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_OFFER_CREATED','offerId',p_offer_id,
        'sellerId',p_seller_id,'priceCents',p_price_cents,
        'currencyCode',p_currency_code
      ),
      'pending',0
    );
  end loop;
end;
$function$;

grant execute on function public.keep_playlist_sale_notify_followers(uuid,uuid,text,integer,text) to authenticated;

-- FREE v3 already broadcasts to followers directly. Complete that audience
-- with prior keepers who are NOT followers, avoiding duplicate notifications.
create or replace function public.keep_playlist_sale_free_prior_keepers_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.payment_mode <> 'FREE' then return new; end if;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  select distinct
    kd.profile_id,
    'PLAYLIST_SALE_NEW_OFFER',
    '◆ Nouvelle pépite à écouter',
    '@'||coalesce(p.username,'Loki')||' vient de publier « '||new.playlist_name||
      ' ». Écoute-la avant de la débloquer.',
    jsonb_build_object(
      'event','PLAYLIST_SALE_NEW_OFFER','offerId',new.id,'sellerId',new.seller_id,
      'paymentMode','FREE','freePrice',new.free_price
    ),
    'pending',0
  from public.keep_decisions kd
  join public.profiles p on p.id=new.seller_id
  left join public.notification_preferences np on np.profile_id=kd.profile_id
  where kd.source_user_id=new.seller_id
    and kd.decision='KEPT'
    and kd.profile_id<>new.seller_id
    and coalesce(np.social_enabled,true)=true
    and not exists (
      select 1 from public.follows f
      where f.follower_id=kd.profile_id and f.followee_id=new.seller_id
    );

  return new;
end;
$function$;

drop trigger if exists trg_keep_playlist_sale_free_prior_keepers_notify on public.playlist_sale_offers;
create trigger trg_keep_playlist_sale_free_prior_keepers_notify
after insert on public.playlist_sale_offers
for each row execute function public.keep_playlist_sale_free_prior_keepers_notify();
