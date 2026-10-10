-- Loki Music — achat groupé de plusieurs collections d'une même Boutique musicale.
-- Le paiement parent porte le vrai montant. Les paiements enfants sont techniques
-- (0 montant) et servent uniquement à réutiliser le moteur de livraison existant.

create table if not exists public.playlist_sale_bundle_payments (
  payment_id uuid primary key references public.playlist_sale_payments(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency_code char(3) not null,
  offer_count integer not null check (offer_count >= 2 and offer_count <= 50),
  created_at timestamptz not null default now()
);
alter table public.playlist_sale_bundle_payments enable row level security;
revoke all on table public.playlist_sale_bundle_payments from public,anon,authenticated;

create table if not exists public.playlist_sale_bundle_payment_items (
  payment_id uuid not null references public.playlist_sale_bundle_payments(payment_id) on delete cascade,
  offer_id uuid not null references public.playlist_sale_offers(id) on delete restrict,
  child_payment_id uuid unique references public.playlist_sale_payments(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  currency_code char(3) not null,
  position integer not null check (position >= 0),
  delivered_playlist_id uuid references public.playlists(id) on delete set null,
  delivered_at timestamptz,
  primary key(payment_id,offer_id)
);
alter table public.playlist_sale_bundle_payment_items enable row level security;
revoke all on table public.playlist_sale_bundle_payment_items from public,anon,authenticated;

create index if not exists idx_playlist_sale_bundle_items_offer
  on public.playlist_sale_bundle_payment_items(offer_id,payment_id);

do $do$
begin
  if to_regprocedure('public.keep_playlist_sale_mark_paid_and_deliver_single(uuid,text)') is null
     and to_regprocedure('public.keep_playlist_sale_mark_paid_and_deliver(uuid,text)') is not null then
    alter function public.keep_playlist_sale_mark_paid_and_deliver(uuid,text)
      rename to keep_playlist_sale_mark_paid_and_deliver_single;
  end if;
  if to_regprocedure('public.keep_playlist_sale_buyer_mark_paid_single(uuid)') is null
     and to_regprocedure('public.keep_playlist_sale_buyer_mark_paid(uuid)') is not null then
    alter function public.keep_playlist_sale_buyer_mark_paid(uuid)
      rename to keep_playlist_sale_buyer_mark_paid_single;
  end if;
end
$do$;

create or replace function public.keep_playlist_sale_request_bundle_purchase(p_offer_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  uid uuid:=auth.uid();
  v_requested uuid[];
  v_offer_ids uuid[];
  v_seller_ids uuid[];
  v_currency_codes text[];
  v_seller_id uuid;
  v_currency text;
  v_total integer;
  v_existing uuid;
  v_payment public.playlist_sale_payments%rowtype;
  v_seller_username text;
  v_payout_link text;
  v_payout_qr_url text;
  v_count integer;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select array_agg(x order by x) into v_requested
  from (select distinct unnest(coalesce(p_offer_ids,'{}'::uuid[])) x) s
  where x is not null;

  if coalesce(cardinality(v_requested),0)<2 then raise exception 'BUNDLE_REQUIRES_MULTIPLE_OFFERS'; end if;
  if cardinality(v_requested)>50 then raise exception 'BUNDLE_TOO_LARGE'; end if;

  select array_agg(distinct o.seller_id),
         array_agg(distinct upper(coalesce(o.currency_code,'EUR'))),
         count(*)
  into v_seller_ids,v_currency_codes,v_count
  from public.playlist_sale_offers o
  where o.id=any(v_requested)
    and o.is_active=true
    and o.payment_mode='MONEY'
    and o.price_cents>0
    and (o.target_buyer_id is null or o.target_buyer_id=uid);

  if v_count<>cardinality(v_requested) then raise exception 'BUNDLE_OFFER_NOT_PAYABLE'; end if;
  if cardinality(v_seller_ids)<>1 then raise exception 'BUNDLE_SINGLE_SELLER_REQUIRED'; end if;
  if cardinality(v_currency_codes)<>1 then raise exception 'BUNDLE_MULTIPLE_CURRENCIES'; end if;

  v_seller_id:=v_seller_ids[1];
  v_currency:=v_currency_codes[1];
  if v_seller_id=uid then raise exception 'CANNOT_BUY_OWN_PLAYLIST'; end if;

  select array_agg(o.id order by o.id)
  into v_offer_ids
  from public.playlist_sale_offers o
  where o.id=any(v_requested)
    and not exists(
      select 1 from public.playlist_sale_payments p
      where p.offer_id=o.id and p.buyer_id=uid and p.status='COMPLETED'
    );

  if coalesce(cardinality(v_offer_ids),0)=0 then
    return jsonb_build_object('alreadyUnlocked',true,'bundleCount',0,'amountCents',0,'currencyCode',v_currency);
  end if;

  select coalesce(sum(o.price_cents),0)::integer into v_total
  from public.playlist_sale_offers o where o.id=any(v_offer_ids);

  select username,payout_link,payout_qr_url
  into v_seller_username,v_payout_link,v_payout_qr_url
  from public.profiles where id=v_seller_id;

  if nullif(trim(coalesce(v_payout_link,'')),'') is null
     and nullif(trim(coalesce(v_payout_qr_url,'')),'') is null then
    raise exception 'SELLER_PAYOUT_NOT_CONFIGURED';
  end if;
  if nullif(trim(coalesce(v_payout_link,'')),'') is not null and v_payout_link !~* '^https://' then
    raise exception 'SELLER_PAYOUT_LINK_INSECURE';
  end if;
  if nullif(trim(coalesce(v_payout_qr_url,'')),'') is not null and v_payout_qr_url !~* '^https://' then
    raise exception 'SELLER_PAYOUT_QR_INSECURE';
  end if;

  select b.payment_id into v_existing
  from public.playlist_sale_bundle_payments b
  join public.playlist_sale_payments p on p.id=b.payment_id
  where b.buyer_id=uid
    and b.seller_id=v_seller_id
    and p.status='PENDING'
    and (
      select array_agg(i.offer_id order by i.offer_id)
      from public.playlist_sale_bundle_payment_items i
      where i.payment_id=b.payment_id
    )=v_offer_ids
  order by b.created_at desc
  limit 1;

  if v_existing is not null then
    select * into v_payment from public.playlist_sale_payments where id=v_existing;
  else
    insert into public.playlist_sale_payments(
      offer_id,seller_id,buyer_id,amount_cents,currency_code,platform_fee_cents,status,provider
    )
    values(v_offer_ids[1],v_seller_id,uid,v_total,v_currency,0,'PENDING','EXTERNAL_BUNDLE')
    returning * into v_payment;

    insert into public.playlist_sale_bundle_payments(
      payment_id,seller_id,buyer_id,amount_cents,currency_code,offer_count
    )
    values(v_payment.id,v_seller_id,uid,v_total,v_currency,cardinality(v_offer_ids));

    insert into public.playlist_sale_bundle_payment_items(
      payment_id,offer_id,amount_cents,currency_code,position
    )
    select v_payment.id,o.id,o.price_cents,upper(coalesce(o.currency_code,'EUR'))::char(3),
           row_number() over(order by array_position(v_offer_ids,o.id))-1
    from public.playlist_sale_offers o
    where o.id=any(v_offer_ids);

    insert into public.notifications(
      profile_id,type,title,body,data,push_delivery_status,push_attempt_count
    )
    values(
      uid,
      'PLAYLIST_SALE_PAYMENT_READY',
      'Prêt à payer · '||cardinality(v_offer_ids)||' collections',
      cardinality(v_offer_ids)||' Pépites de @'||coalesce(v_seller_username,'ce créateur')||
        ' · total '||replace(to_char(v_total::numeric/100,'FM999999990.00'),'.',',')||
        case when v_currency='EUR' then ' €' else ' '||v_currency end||
        '. Un seul paiement et une seule preuve.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_PAYMENT_READY','paymentId',v_payment.id,
        'sellerId',v_seller_id,'sellerUsername',v_seller_username,
        'bundle',true,'bundleCount',cardinality(v_offer_ids),
        'offerIds',to_jsonb(v_offer_ids),'amountCents',v_total,
        'currencyCode',v_currency,'payoutLink',coalesce(v_payout_link,''),
        'payoutQrUrl',coalesce(v_payout_qr_url,''),'soundKind','money'
      ),
      'CREATED',0
    );
  end if;

  return jsonb_build_object(
    'paymentId',v_payment.id,'status',v_payment.status,
    'amountCents',v_payment.amount_cents,'currencyCode',v_payment.currency_code,
    'sellerUsername',v_seller_username,'payoutLink',coalesce(v_payout_link,''),
    'payoutQrUrl',coalesce(v_payout_qr_url,''),
    'buyerMarkedPaidAt',v_payment.buyer_marked_paid_at,
    'bundle',true,'bundleCount',cardinality(v_offer_ids),'offerIds',to_jsonb(v_offer_ids)
  );
end;
$function$;

create or replace function public.keep_playlist_sale_purchase_bundle_with_free(p_offer_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  uid uuid:=auth.uid();
  v_requested uuid[];
  v_count integer;
  v_total integer;
  v_balance integer;
  v_id uuid;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_actual integer:=0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select array_agg(x order by x) into v_requested
  from (select distinct unnest(coalesce(p_offer_ids,'{}'::uuid[])) x) s
  where x is not null;
  if coalesce(cardinality(v_requested),0)<1 then raise exception 'BUNDLE_EMPTY'; end if;
  if cardinality(v_requested)>50 then raise exception 'BUNDLE_TOO_LARGE'; end if;

  select count(*) into v_count
  from public.playlist_sale_offers o
  where o.id=any(v_requested)
    and o.is_active=true and o.payment_mode='FREE'
    and o.free_price is not null and o.seller_id<>uid
    and (o.target_buyer_id is null or o.target_buyer_id=uid);
  if v_count<>cardinality(v_requested) then raise exception 'BUNDLE_OFFER_NOT_PAYABLE_WITH_FREE'; end if;

  select coalesce(sum(o.free_price),0)::integer into v_total
  from public.playlist_sale_offers o
  where o.id=any(v_requested)
    and not exists(
      select 1 from public.playlist_sale_payments p
      where p.offer_id=o.id and p.buyer_id=uid and p.status='COMPLETED'
    );

  v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(uid);
  if v_balance<v_total then raise exception 'NOT_ENOUGH_FREE:%:%',v_balance,v_total; end if;

  foreach v_id in array v_requested loop
    v_result:=public.keep_playlist_sale_purchase_with_free(v_id);
    if not coalesce((v_result->>'alreadyUnlocked')::boolean,false) then
      v_actual:=v_actual+coalesce((v_result->>'freePrice')::integer,0);
    end if;
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'bundleCount',cardinality(v_requested),'freeSpent',v_actual,
    'remainingFree',public.keep_theoretical_free_credit_remaining_for_profile(uid),
    'results',v_results
  );
end;
$function$;

create or replace function public.keep_playlist_sale_buyer_mark_bundle_paid(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,storage
as $function$
declare
  uid uuid:=auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_bundle public.playlist_sale_bundle_payments%rowtype;
  v_buyer_username text;
  v_seller_username text;
  v_marked_at timestamptz;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into v_payment
  from public.playlist_sale_payments
  where id=p_payment_id and buyer_id=uid
  for update;
  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;

  select * into v_bundle from public.playlist_sale_bundle_payments where payment_id=p_payment_id;
  if v_bundle.payment_id is null then raise exception 'BUNDLE_NOT_FOUND'; end if;

  if v_payment.status='COMPLETED' then
    return jsonb_build_object('paymentId',v_payment.id,'status','COMPLETED',
      'buyerMarkedPaidAt',v_payment.buyer_marked_paid_at,'alreadyDelivered',true);
  end if;
  if v_payment.status<>'PENDING' then raise exception 'PAYMENT_NOT_PENDING'; end if;
  if nullif(trim(coalesce(v_payment.buyer_payment_proof_path,'')),'') is null then
    raise exception 'PAYMENT_PROOF_REQUIRED';
  end if;
  if not exists(
    select 1 from storage.objects
    where bucket_id='playlist-payment-proofs' and name=v_payment.buyer_payment_proof_path
  ) then raise exception 'PAYMENT_PROOF_FILE_NOT_FOUND'; end if;

  if v_payment.buyer_marked_paid_at is null then
    v_marked_at:=now();
    update public.playlist_sale_payments
    set buyer_marked_paid_at=v_marked_at,seller_last_reminded_at=null
    where id=v_payment.id;

    select username into v_buyer_username from public.profiles where id=uid;
    select username into v_seller_username from public.profiles where id=v_payment.seller_id;

    insert into public.notifications(
      profile_id,type,title,body,data,push_delivery_status,push_attempt_count
    )
    values(
      v_payment.seller_id,'PLAYLIST_SALE_BUYER_PAID',
      'Paiement groupé signalé · preuve jointe',
      coalesce('@'||v_buyer_username,'Un acheteur')||' indique avoir payé '||
        v_bundle.offer_count||' collections. Vérifie ta preuve et ton PayPal avant de débloquer.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_BUYER_PAID','paymentId',v_payment.id,'buyerId',uid,
        'buyerUsername',v_buyer_username,'bundle',true,'bundleCount',v_bundle.offer_count,
        'amountCents',v_payment.amount_cents,'currencyCode',upper(coalesce(v_payment.currency_code,'EUR')),
        'proofAttached',true,'proofName',v_payment.buyer_payment_proof_name,'soundKind','money'
      ),
      'CREATED',0
    );

    insert into public.notifications(
      profile_id,type,title,body,data,push_delivery_status,push_attempt_count
    )
    values(
      uid,'PLAYLIST_SALE_WAITING_SELLER','Paiement groupé signalé',
      'Ta preuve pour '||v_bundle.offer_count||' collections est envoyée à '||
        coalesce('@'||v_seller_username,'au vendeur')||
        '. Elles se débloqueront ensemble après sa confirmation.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_WAITING_SELLER','paymentId',v_payment.id,
        'sellerId',v_payment.seller_id,'sellerUsername',v_seller_username,
        'bundle',true,'bundleCount',v_bundle.offer_count,'proofAttached',true,'soundKind','money'
      ),
      'CREATED',0
    );
  else
    v_marked_at:=v_payment.buyer_marked_paid_at;
  end if;

  return jsonb_build_object(
    'paymentId',v_payment.id,'status','PENDING',
    'buyerMarkedPaidAt',v_marked_at,'alreadyDelivered',false
  );
end;
$function$;

create or replace function public.keep_playlist_sale_deliver_bundle_payment(
  p_payment_id uuid,p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,storage
as $function$
declare
  uid uuid:=auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_bundle public.playlist_sale_bundle_payments%rowtype;
  v_item record;
  v_child uuid;
  v_child_result jsonb;
  v_first_playlist uuid;
  v_total_tracks integer:=0;
  v_delivered_count integer:=0;
  v_buyer_username text;
  v_was_pending boolean:=false;
  v_clean_reference text:=nullif(trim(coalesce(p_payment_reference,'')),'');
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id=p_payment_id and seller_id=uid
  for update;
  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;

  select * into v_bundle from public.playlist_sale_bundle_payments where payment_id=p_payment_id;
  if v_bundle.payment_id is null then raise exception 'BUNDLE_NOT_FOUND'; end if;
  if v_payment.status not in ('PENDING','COMPLETED') then raise exception 'PAYMENT_NOT_DELIVERABLE'; end if;
  v_was_pending:=v_payment.status='PENDING';

  if v_was_pending then
    if v_payment.buyer_marked_paid_at is null then raise exception 'BUYER_HAS_NOT_MARKED_PAID'; end if;
    if nullif(trim(coalesce(v_payment.buyer_payment_proof_path,'')),'') is null then
      raise exception 'PAYMENT_PROOF_REQUIRED';
    end if;
    if not exists(
      select 1 from storage.objects
      where bucket_id='playlist-payment-proofs' and name=v_payment.buyer_payment_proof_path
    ) then raise exception 'PAYMENT_PROOF_FILE_NOT_FOUND'; end if;
  end if;

  for v_item in
    select i.*,o.playlist_name
    from public.playlist_sale_bundle_payment_items i
    join public.playlist_sale_offers o on o.id=i.offer_id
    where i.payment_id=p_payment_id
    order by i.position
  loop
    v_child:=v_item.child_payment_id;
    if v_child is null then
      insert into public.playlist_sale_payments(
        offer_id,seller_id,buyer_id,amount_cents,currency_code,
        platform_fee_cents,status,provider,provider_payment_id
      )
      values(
        v_item.offer_id,v_payment.seller_id,v_payment.buyer_id,0,v_item.currency_code,
        0,'PENDING','BUNDLE_CHILD','bundle:'||p_payment_id::text
      )
      returning id into v_child;

      update public.playlist_sale_bundle_payment_items
      set child_payment_id=v_child
      where payment_id=p_payment_id and offer_id=v_item.offer_id;
    end if;

    v_child_result:=public.keep_playlist_sale_deliver_payment_core(v_child);
    v_total_tracks:=v_total_tracks+coalesce((v_child_result->>'trackCount')::integer,0);
    v_delivered_count:=v_delivered_count+1;
    if v_first_playlist is null and nullif(v_child_result->>'playlistId','') is not null then
      v_first_playlist:=(v_child_result->>'playlistId')::uuid;
    end if;

    update public.playlist_sale_bundle_payment_items
    set delivered_playlist_id=nullif(v_child_result->>'playlistId','')::uuid,
        delivered_at=coalesce(delivered_at,now())
    where payment_id=p_payment_id and offer_id=v_item.offer_id;
  end loop;

  update public.playlist_sale_payments
  set status='COMPLETED',
      delivered_playlist_id=coalesce(delivered_playlist_id,v_first_playlist),
      delivered_at=coalesce(delivered_at,now()),
      provider_payment_id=coalesce(v_clean_reference,provider_payment_id)
  where id=p_payment_id;

  if v_was_pending then
    select username into v_buyer_username from public.profiles where id=v_payment.buyer_id;

    insert into public.notifications(
      profile_id,type,title,body,data,push_delivery_status,push_attempt_count
    )
    values(
      v_payment.seller_id,'PLAYLIST_SALE_COMPLETED','💰 Paiement groupé reçu',
      coalesce('@'||v_buyer_username,'Un acheteur')||' a débloqué '||v_delivered_count||
        ' collections pour '||replace(to_char(v_payment.amount_cents::numeric/100,'FM999999990.00'),'.',',')||
        case when upper(coalesce(v_payment.currency_code,'EUR'))='EUR'
          then ' €' else ' '||upper(v_payment.currency_code) end||'.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_COMPLETED','paymentId',v_payment.id,
        'buyerId',v_payment.buyer_id,'bundle',true,'bundleCount',v_delivered_count,
        'amountCents',v_payment.amount_cents,
        'currencyCode',upper(coalesce(v_payment.currency_code,'EUR')),
        'trackCount',v_total_tracks,'soundKind','money'
      ),
      'CREATED',0
    );

    insert into public.notifications(
      profile_id,type,title,body,data,push_delivery_status,push_attempt_count
    )
    values(
      v_payment.buyer_id,'PLAYLIST_SALE_DELIVERED',
      '✓ '||v_delivered_count||' collections débloquées',
      'Tes '||v_delivered_count||' Pépites sont maintenant dans ton Loki Music.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_DELIVERED','paymentId',v_payment.id,
        'sellerId',v_payment.seller_id,'bundle',true,'bundleCount',v_delivered_count,
        'playlistId',v_first_playlist,'trackCount',v_total_tracks,'visibilityChoicePending',true
      ),
      'CREATED',0
    );
  end if;

  return jsonb_build_object(
    'paymentId',v_payment.id,'buyerId',v_payment.buyer_id,'playlistId',v_first_playlist,
    'playlistName',v_delivered_count||' collections','trackCount',v_total_tracks,
    'bundleCount',v_delivered_count,'deliveredAt',now()
  );
end;
$function$;

create or replace function public.keep_playlist_sale_buyer_mark_paid(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
begin
  if exists(select 1 from public.playlist_sale_bundle_payments where payment_id=p_payment_id) then
    return public.keep_playlist_sale_buyer_mark_bundle_paid(p_payment_id);
  end if;
  return public.keep_playlist_sale_buyer_mark_paid_single(p_payment_id);
end;
$function$;

create or replace function public.keep_playlist_sale_mark_paid_and_deliver(
  p_payment_id uuid,p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
begin
  if exists(select 1 from public.playlist_sale_bundle_payments where payment_id=p_payment_id) then
    return public.keep_playlist_sale_deliver_bundle_payment(p_payment_id,p_payment_reference);
  end if;
  return public.keep_playlist_sale_mark_paid_and_deliver_single(p_payment_id,p_payment_reference);
end;
$function$;

create or replace function public.keep_playlist_sale_my_sales()
returns table(
  id uuid,buyer_id uuid,buyer_username text,playlist_id text,playlist_name text,
  amount_cents integer,currency_code text,status text,provider text,
  provider_payment_id text,created_at timestamptz,delivered_at timestamptz
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  select
    p.id,p.buyer_id,b.username,
    case when p.provider='EXTERNAL_BUNDLE' then 'bundle:'||p.id::text else o.playlist_id end,
    case when p.provider='EXTERNAL_BUNDLE'
      then coalesce((select bp.offer_count::text||' collections'
                     from public.playlist_sale_bundle_payments bp where bp.payment_id=p.id),'Collections')
      else o.playlist_name end,
    p.amount_cents,p.currency_code,p.status,p.provider,p.provider_payment_id,p.created_at,p.delivered_at
  from public.playlist_sale_payments p
  join public.playlist_sale_offers o on o.id=p.offer_id
  join public.profiles b on b.id=p.buyer_id
  where p.seller_id=auth.uid()
    and p.provider<>'BUNDLE_CHILD'
  order by p.created_at desc;
$function$;

create or replace function public.keep_playlist_sale_my_purchases()
returns table(
  id uuid,seller_username text,playlist_name text,amount_cents integer,
  currency_code text,status text,created_at timestamptz
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  select
    p.id,s.username,
    case when p.provider='EXTERNAL_BUNDLE'
      then coalesce((select bp.offer_count::text||' collections'
                     from public.playlist_sale_bundle_payments bp where bp.payment_id=p.id),'Collections')
      else o.playlist_name end,
    p.amount_cents,p.currency_code,p.status,p.created_at
  from public.playlist_sale_payments p
  join public.playlist_sale_offers o on o.id=p.offer_id
  join public.profiles s on s.id=p.seller_id
  where p.buyer_id=auth.uid()
    and p.provider<>'BUNDLE_CHILD'
  order by p.created_at desc;
$function$;

create or replace function public.keep_playlist_sale_payment_reminders()
returns integer
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_payment record;
  v_offer public.playlist_sale_offers%rowtype;
  v_buyer_username text;
  v_count integer:=0;
  v_bundle_count integer;
  v_is_bundle boolean;
begin
  for v_payment in
    select p.* from public.playlist_sale_payments p
    where p.status='PENDING'
      and p.buyer_marked_paid_at is not null
      and p.buyer_marked_paid_at<=now()-interval '4 hours'
      and (p.seller_last_reminded_at is null or p.seller_last_reminded_at<=now()-interval '24 hours')
    order by p.buyer_marked_paid_at asc
    limit 100
    for update skip locked
  loop
    if v_payment.provider='BUNDLE_CHILD' then continue; end if;
    select * into v_offer from public.playlist_sale_offers where id=v_payment.offer_id;
    if v_offer.id is null then continue; end if;
    select username into v_buyer_username from public.profiles where id=v_payment.buyer_id;
    select offer_count into v_bundle_count
    from public.playlist_sale_bundle_payments where payment_id=v_payment.id;
    v_is_bundle:=coalesce(v_bundle_count,0)>1;

    insert into public.notifications(
      profile_id,type,title,body,data,push_delivery_status,push_attempt_count
    )
    values(
      v_payment.seller_id,'PLAYLIST_SALE_PAYMENT_REMINDER','Paiement à confirmer',
      case when v_is_bundle
        then coalesce('@'||v_buyer_username,'Un acheteur')||
             ' attend le déblocage de '||v_bundle_count||
             ' collections. Confirme uniquement si le paiement groupé est bien arrivé.'
        else coalesce('@'||v_buyer_username,'Un acheteur')||
             ' attend le déblocage de « '||v_offer.playlist_name||
             ' ». Confirme uniquement si l’argent est bien arrivé.'
      end,
      jsonb_build_object(
        'event','PLAYLIST_SALE_PAYMENT_REMINDER','paymentId',v_payment.id,
        'offerId',v_offer.id,'buyerId',v_payment.buyer_id,
        'buyerUsername',v_buyer_username,
        'playlistName',case when v_is_bundle then v_bundle_count||' collections' else v_offer.playlist_name end,
        'amountCents',v_payment.amount_cents,
        'currencyCode',upper(coalesce(v_payment.currency_code,'EUR')),
        'bundle',v_is_bundle,'bundleCount',coalesce(v_bundle_count,1),'soundKind','money'
      ),
      'CREATED',0
    );

    update public.playlist_sale_payments
    set seller_last_reminded_at=now()
    where id=v_payment.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function public.keep_playlist_sale_request_bundle_purchase(uuid[]) from public,anon;
revoke all on function public.keep_playlist_sale_purchase_bundle_with_free(uuid[]) from public,anon;
revoke all on function public.keep_playlist_sale_buyer_mark_bundle_paid(uuid) from public,anon,authenticated;
revoke all on function public.keep_playlist_sale_deliver_bundle_payment(uuid,text) from public,anon,authenticated;
revoke all on function public.keep_playlist_sale_buyer_mark_paid(uuid) from public,anon;
revoke all on function public.keep_playlist_sale_mark_paid_and_deliver(uuid,text) from public,anon;
revoke all on function public.keep_playlist_sale_my_sales() from public,anon;
revoke all on function public.keep_playlist_sale_my_purchases() from public,anon;
revoke all on function public.keep_playlist_sale_payment_reminders() from public,anon,authenticated;

grant execute on function public.keep_playlist_sale_request_bundle_purchase(uuid[]) to authenticated;
grant execute on function public.keep_playlist_sale_purchase_bundle_with_free(uuid[]) to authenticated;
grant execute on function public.keep_playlist_sale_buyer_mark_paid(uuid) to authenticated;
grant execute on function public.keep_playlist_sale_mark_paid_and_deliver(uuid,text) to authenticated;
grant execute on function public.keep_playlist_sale_my_sales() to authenticated;
grant execute on function public.keep_playlist_sale_my_purchases() to authenticated;
grant execute on function public.keep_playlist_sale_payment_reminders() to service_role;

revoke all on function public.keep_playlist_sale_mark_paid_and_deliver_single(uuid,text)
  from public,anon,authenticated;
revoke all on function public.keep_playlist_sale_buyer_mark_paid_single(uuid)
  from public,anon,authenticated;
