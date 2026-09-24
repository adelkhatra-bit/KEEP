-- Vente de collections musicales par lot : paiement en argent OU en FREE.
-- 24/09/2026 — aucun morceau individuel, aucun titre/artiste/jaquette révélé avant déblocage.

alter table public.playlist_sale_offers
  add column if not exists payment_mode text not null default 'MONEY',
  add column if not exists free_price integer;

alter table public.playlist_sale_payments
  add column if not exists amount_free integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.playlist_sale_offers'::regclass
      and conname='playlist_sale_offers_payment_mode_check'
  ) then
    alter table public.playlist_sale_offers
      add constraint playlist_sale_offers_payment_mode_check
      check (payment_mode in ('MONEY','FREE'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.playlist_sale_offers'::regclass
      and conname='playlist_sale_offers_free_price_check'
  ) then
    alter table public.playlist_sale_offers
      add constraint playlist_sale_offers_free_price_check
      check (
        (payment_mode='MONEY' and free_price is null and price_cents >= 0)
        or
        (payment_mode='FREE' and free_price between 1 and 500 and price_cents = 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.playlist_sale_payments'::regclass
      and conname='playlist_sale_payments_amount_free_check'
  ) then
    alter table public.playlist_sale_payments
      add constraint playlist_sale_payments_amount_free_check
      check (amount_free >= 0);
  end if;
end $$;

create table if not exists public.playlist_sale_free_transfers (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.playlist_sale_payments(id) on delete cascade,
  offer_id uuid not null references public.playlist_sale_offers(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount_free integer not null check (amount_free between 1 and 500),
  created_at timestamptz not null default now(),
  unique (offer_id, buyer_id)
);

alter table public.playlist_sale_free_transfers enable row level security;
drop policy if exists "playlist_sale_free_transfers_read_own" on public.playlist_sale_free_transfers;
create policy "playlist_sale_free_transfers_read_own"
on public.playlist_sale_free_transfers
for select
using (auth.uid()=seller_id or auth.uid()=buyer_id);

revoke insert, update, delete on public.playlist_sale_free_transfers from anon, authenticated;

create or replace function public.keep_playlist_sale_free_adjustment_for_profile(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path='public'
as $function$
  select
    coalesce((select sum(amount_free)::integer from public.playlist_sale_free_transfers where seller_id=p_uid),0)
    -
    coalesce((select sum(amount_free)::integer from public.playlist_sale_free_transfers where buyer_id=p_uid),0);
$function$;

revoke all on function public.keep_playlist_sale_free_adjustment_for_profile(uuid) from public;
grant execute on function public.keep_playlist_sale_free_adjustment_for_profile(uuid) to authenticated;

create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  guest_limit integer := 3;
  signup_bonus integer := 20;
  follower_count integer := 0;
  follower_bonus integer := 0;
  f3 integer; f5 integer; f250c integer; f1000c integer;
  referral_bonus integer := 0;
  monthly_bonus integer := 0;
  admin_grant integer := 0;
  battle_adjustment integer := 0;
  marketplace_adjustment integer := 0;
  ledger_used integer := 0;
  derived_used integer := 0;
  used integer := 0;
  capacity integer := 0;
begin
  if p_uid is null then return 0; end if;

  select count(*)::integer into follower_count from public.follows where followee_id=p_uid;
  f3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold'),250);
  f5 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold'),1000);
  f250c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits'),5);
  f1000c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits'),20);
  follower_bonus := (case when follower_count>=f3 then f250c else 0 end)
    + (case when follower_count>=f5 then f1000c else 0 end);

  referral_bonus := public.keep_referral_free_credit_bonus_for_profile(p_uid);
  monthly_bonus := public.keep_monthly_free_bonus_for_profile(p_uid);
  admin_grant := public.keep_admin_credit_grant_total_for_profile(p_uid);

  battle_adjustment := coalesce((select sum(amount)::integer from public.keep_battle_credit_events where profile_id=p_uid),0)
    + coalesce((select sum(amount)::integer from public.keep_battle_arena_credit_events where profile_id=p_uid),0)
    + coalesce((select sum(amount)::integer from public.keep_battle_solo_credit_events where profile_id=p_uid),0);

  marketplace_adjustment := public.keep_playlist_sale_free_adjustment_for_profile(p_uid);

  ledger_used := coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used := public.keep_chargeable_keep_count(p_uid);
  used := greatest(ledger_used,derived_used);

  capacity := greatest(
    used,
    guest_limit + signup_bonus + follower_bonus + referral_bonus + monthly_bonus
      + admin_grant + battle_adjustment + marketplace_adjustment
  );
  return greatest(0, capacity-used);
end;
$function$;

-- Nouveau créateur d'offre "lot" compatible € / FREE.
create or replace function public.keep_playlist_sale_set_offer_for_selection_v3(
  p_track_ids uuid[],
  p_name text,
  p_payment_mode text,
  p_price_cents integer default null,
  p_free_price integer default null,
  p_currency_code text default 'EUR',
  p_cover_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  access jsonb;
  clean_name text := coalesce(nullif(trim(p_name), ''), 'Sélection Loki');
  clean_mode text := upper(coalesce(nullif(trim(p_payment_mode), ''), 'MONEY'));
  clean_currency text := upper(coalesce(nullif(trim(p_currency_code), ''), 'EUR'));
  clean_cover text := nullif(trim(coalesce(p_cover_url, '')), '');
  clean_money integer := coalesce(p_price_cents,0);
  clean_free integer := p_free_price;
  new_offer_id uuid := gen_random_uuid();
  clean_ids uuid[];
  row_result public.playlist_sale_offers%rowtype;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_ids is null or array_length(p_track_ids,1) is null then raise exception 'TRACK_SELECTION_REQUIRED'; end if;
  if array_length(p_track_ids,1) > 200 then raise exception 'TRACK_SELECTION_TOO_LARGE'; end if;
  if clean_mode not in ('MONEY','FREE') then raise exception 'PAYMENT_MODE_INVALID'; end if;

  if clean_mode='MONEY' then
    if clean_money not in (50,100,200,300,500,1000) then raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    clean_free := null;
  else
    if clean_free is null or clean_free not in (1,3,5,10,20,50,100) then raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    clean_money := 0;
  end if;

  if length(clean_name) > 100 then raise exception 'PLAYLIST_NAME_TOO_LONG'; end if;
  if clean_cover is not null and clean_cover !~* '^https://' then raise exception 'COVER_URL_MUST_BE_HTTPS'; end if;

  access := public.keep_playlist_sale_access();
  if not (access->>'unlocked')::boolean then raise exception 'PLAYLIST_SALE_LOCKED:%', (access->>'threshold'); end if;

  select coalesce(array_agg(distinct candidate.track_id), array[]::uuid[])
  into clean_ids
  from (
    select pt.track_id
    from public.playlist_tracks pt
    join public.playlists pl on pl.id=pt.playlist_id
    where pl.owner_id=uid and pt.track_id=any(p_track_ids)
    union
    select kd.track_id
    from public.keep_decisions kd
    where kd.profile_id=uid and kd.decision='KEPT' and kd.track_id=any(p_track_ids)
  ) candidate
  where not exists (
    select 1 from public.keep_decisions kd2
    where kd2.profile_id=uid
      and kd2.track_id=candidate.track_id
      and kd2.decision='KEPT'
      and kd2.source_user_id is not null
  );

  if array_length(clean_ids,1) is null
     or array_length(clean_ids,1) <> array_length((select array_agg(distinct x) from unnest(p_track_ids) x),1)
  then
    raise exception 'TRACK_SELECTION_NOT_OWNED';
  end if;

  insert into public.playlist_sale_offers(
    id,seller_id,playlist_id,playlist_name,price_cents,currency_code,cover_url,payment_mode,free_price
  )
  values (
    new_offer_id,uid,'keep-selection:'||new_offer_id::text,clean_name,clean_money,clean_currency,clean_cover,clean_mode,clean_free
  )
  returning * into row_result;

  insert into public.playlist_sale_offer_tracks(offer_id,track_id)
  select new_offer_id,t from unnest(clean_ids) t;

  if clean_mode='MONEY' then
    perform public.keep_playlist_sale_notify_followers(uid,new_offer_id,clean_name,clean_money,clean_currency);
  else
    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    select
      f.follower_id,
      'PLAYLIST_SALE_NEW_OFFER',
      '⚡ Nouvelle collection à débloquer',
      '@'||coalesce(p.username,'Loki')||' partage une collection de '||array_length(clean_ids,1)||' découvertes pour '||clean_free||' FREE.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_NEW_OFFER',
        'offerId',new_offer_id,
        'sellerId',uid,
        'paymentMode','FREE',
        'freePrice',clean_free,
        'trackCount',array_length(clean_ids,1)
      ),
      'CREATED',
      0
    from public.follows f
    join public.profiles p on p.id=uid
    where f.followee_id=uid;
  end if;

  return jsonb_build_object(
    'id',row_result.id,
    'offerId',row_result.id,
    'playlistId',row_result.playlist_id,
    'playlistName',row_result.playlist_name,
    'paymentMode',row_result.payment_mode,
    'priceCents',row_result.price_cents,
    'freePrice',row_result.free_price,
    'currencyCode',row_result.currency_code,
    'trackCount',array_length(clean_ids,1)
  );
end;
$function$;
grant execute on function public.keep_playlist_sale_set_offer_for_selection_v3(uuid[],text,text,integer,integer,text,text) to authenticated;

drop function if exists public.keep_playlist_sale_offers_for_profile(uuid);
create function public.keep_playlist_sale_offers_for_profile(p_profile_id uuid)
returns table(
  offer_id uuid,
  playlist_id text,
  playlist_name text,
  payment_mode text,
  price_cents integer,
  free_price integer,
  currency_code text,
  cover_url text,
  track_count integer
)
language sql
stable
security definer
set search_path='public'
as $function$
  select
    o.id,
    o.playlist_id,
    o.playlist_name,
    o.payment_mode,
    o.price_cents,
    o.free_price,
    o.currency_code::text,
    null::text,
    cardinality(public.keep_playlist_sale_track_ids(o.seller_id,o.playlist_id))::integer
  from public.playlist_sale_offers o
  where o.seller_id=p_profile_id and o.is_active=true
  order by o.updated_at desc;
$function$;
grant execute on function public.keep_playlist_sale_offers_for_profile(uuid) to anon, authenticated;

drop function if exists public.keep_playlist_sale_my_offers();
create function public.keep_playlist_sale_my_offers()
returns table(
  offer_id uuid,
  playlist_id text,
  playlist_name text,
  payment_mode text,
  price_cents integer,
  free_price integer,
  currency_code text,
  is_active boolean,
  updated_at timestamptz,
  track_count integer
)
language sql
stable
security definer
set search_path='public','auth'
as $function$
  select
    o.id,o.playlist_id,o.playlist_name,o.payment_mode,o.price_cents,o.free_price,o.currency_code::text,
    o.is_active,o.updated_at,
    cardinality(public.keep_playlist_sale_track_ids(o.seller_id,o.playlist_id))::integer
  from public.playlist_sale_offers o
  where o.seller_id=auth.uid()
  order by o.updated_at desc;
$function$;
grant execute on function public.keep_playlist_sale_my_offers() to authenticated;

-- Livraison partagée, sans décision de paiement : appelée uniquement par les wrappers autorisés.
create or replace function public.keep_playlist_sale_deliver_payment_core(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','auth'
as $function$
declare
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_playlist_id uuid;
  v_track_ids uuid[];
  v_track_id uuid;
  v_origin_id uuid;
begin
  select * into v_payment from public.playlist_sale_payments where id=p_payment_id for update;
  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND'; end if;

  select * into v_offer from public.playlist_sale_offers where id=v_payment.offer_id;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND'; end if;

  v_track_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id,v_offer.playlist_id);
  if cardinality(v_track_ids)=0 then raise exception 'OFFER_HAS_NO_TRACKS'; end if;

  select id into v_playlist_id
  from public.playlists
  where owner_id=v_payment.buyer_id
    and provider='loki_marketplace'
    and provider_playlist_id='purchase:'||v_payment.id::text
  limit 1;

  if v_playlist_id is null then
    insert into public.playlists(owner_id,provider,provider_playlist_id,name,description,is_public,is_smart,cover_url)
    values (
      v_payment.buyer_id,'loki_marketplace','purchase:'||v_payment.id::text,
      v_offer.playlist_name,'Collection débloquée sur Loki Music',false,false,null
    )
    returning id into v_playlist_id;
  end if;

  insert into public.playlist_tracks(playlist_id,track_id,added_via)
  select v_playlist_id,track_id,'MARKETPLACE_PURCHASE'
  from unnest(v_track_ids) track_id
  on conflict (playlist_id,track_id) do nothing;

  foreach v_track_id in array v_track_ids loop
    select coalesce(
      (select kd.source_user_id
       from public.keep_decisions kd
       where kd.profile_id=v_offer.seller_id
         and kd.track_id=v_track_id
         and kd.decision='KEPT'
       order by kd.created_at desc
       limit 1),
      v_offer.seller_id
    ) into v_origin_id;

    if not exists (
      select 1 from public.keep_decisions
      where profile_id=v_payment.buyer_id and track_id=v_track_id and decision='KEPT'
    ) then
      insert into public.keep_decisions(profile_id,track_id,decision,visibility,context,source_type,source_user_id)
      values (
        v_payment.buyer_id,
        v_track_id,
        'KEPT',
        'PRIVATE',
        jsonb_build_object(
          'source','marketplace_purchase',
          'paymentId',v_payment.id,
          'offerId',v_offer.id,
          'sellerId',v_offer.seller_id,
          'paymentMode',v_offer.payment_mode
        ),
        'profile',
        v_origin_id
      );
    end if;
  end loop;

  update public.playlist_sale_payments
  set status='COMPLETED',
      delivered_playlist_id=v_playlist_id,
      delivered_at=coalesce(delivered_at,now())
  where id=v_payment.id;

  return jsonb_build_object(
    'paymentId',v_payment.id,
    'buyerId',v_payment.buyer_id,
    'sellerId',v_offer.seller_id,
    'offerId',v_offer.id,
    'playlistId',v_playlist_id,
    'playlistName',v_offer.playlist_name,
    'trackCount',cardinality(v_track_ids),
    'deliveredAt',now()
  );
end;
$function$;
revoke all on function public.keep_playlist_sale_deliver_payment_core(uuid) from public, anon, authenticated;

create or replace function public.keep_playlist_sale_purchase_with_free(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','auth'
as $function$
declare
  uid uuid := auth.uid();
  v_offer public.playlist_sale_offers%rowtype;
  v_payment public.playlist_sale_payments%rowtype;
  v_result jsonb;
  v_balance integer;
  v_buyer_username text;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  -- Sérialise toutes les dépenses FREE de cet acheteur.
  perform 1 from public.profiles where id=uid for update;

  select * into v_offer
  from public.playlist_sale_offers
  where id=p_offer_id and is_active=true
  for update;

  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.seller_id=uid then raise exception 'CANNOT_BUY_OWN_PLAYLIST'; end if;
  if v_offer.payment_mode <> 'FREE' or v_offer.free_price is null then raise exception 'OFFER_NOT_PAYABLE_WITH_FREE'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where offer_id=p_offer_id and buyer_id=uid and status='COMPLETED'
  order by created_at desc
  limit 1;

  if v_payment.id is not null then
    return jsonb_build_object(
      'paymentId',v_payment.id,
      'playlistId',v_payment.delivered_playlist_id,
      'trackCount',cardinality(public.keep_playlist_sale_track_ids(v_offer.seller_id,v_offer.playlist_id)),
      'freePrice',v_offer.free_price,
      'remainingFree',public.keep_theoretical_free_credit_remaining_for_profile(uid),
      'alreadyUnlocked',true
    );
  end if;

  v_balance := public.keep_theoretical_free_credit_remaining_for_profile(uid);
  if v_balance < v_offer.free_price then
    raise exception 'NOT_ENOUGH_FREE:%:%', v_balance, v_offer.free_price;
  end if;

  insert into public.playlist_sale_payments(
    offer_id,seller_id,buyer_id,amount_cents,amount_free,currency_code,platform_fee_cents,status,provider
  )
  values (
    v_offer.id,v_offer.seller_id,uid,0,v_offer.free_price,'EUR',0,'PENDING','FREE_CREDITS'
  )
  returning * into v_payment;

  insert into public.playlist_sale_free_transfers(payment_id,offer_id,seller_id,buyer_id,amount_free)
  values (v_payment.id,v_offer.id,v_offer.seller_id,uid,v_offer.free_price);

  v_result := public.keep_playlist_sale_deliver_payment_core(v_payment.id);

  select username into v_buyer_username from public.profiles where id=uid;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values (
    v_offer.seller_id,
    'PLAYLIST_SALE_COMPLETED',
    '⚡ FREE reçus',
    coalesce('@'||v_buyer_username,'Un utilisateur')||' a débloqué « '||v_offer.playlist_name||' » pour '||v_offer.free_price||' FREE.',
    jsonb_build_object(
      'event','PLAYLIST_SALE_COMPLETED',
      'paymentId',v_payment.id,
      'offerId',v_offer.id,
      'buyerId',uid,
      'paymentMode','FREE',
      'freeAmount',v_offer.free_price,
      'soundKind','money'
    ),
    'CREATED',
    0
  );

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values (
    uid,
    'PLAYLIST_SALE_DELIVERED',
    '✓ Collection débloquée',
    '« '||v_offer.playlist_name||' » est maintenant dans ton Loki Music pour '||v_offer.free_price||' FREE.',
    jsonb_build_object(
      'event','PLAYLIST_SALE_DELIVERED',
      'paymentId',v_payment.id,
      'offerId',v_offer.id,
      'sellerId',v_offer.seller_id,
      'paymentMode','FREE',
      'freeAmount',v_offer.free_price,
      'playlistId',v_result->>'playlistId'
    ),
    'CREATED',
    0
  );

  return v_result || jsonb_build_object(
    'freePrice',v_offer.free_price,
    'remainingFree',public.keep_theoretical_free_credit_remaining_for_profile(uid),
    'alreadyUnlocked',false
  );
end;
$function$;
grant execute on function public.keep_playlist_sale_purchase_with_free(uuid) to authenticated;
