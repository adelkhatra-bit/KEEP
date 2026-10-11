-- Loki Music — rendre la preuve de paiement immuable dès que l'acheteur
-- signale "J'AI PAYÉ". Le vendeur doit toujours pouvoir consulter exactement
-- la preuve qui était jointe au moment du signalement.

drop policy if exists playlist_payment_proofs_insert_own on storage.objects;
create policy playlist_payment_proofs_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'playlist-payment-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.playlist_sale_payments p
    where p.id::text = (storage.foldername(name))[2]
      and p.buyer_id = (select auth.uid())
      and p.status = 'PENDING'
      and p.buyer_marked_paid_at is null
  )
);

drop policy if exists playlist_payment_proofs_delete_buyer_pending on storage.objects;
create policy playlist_payment_proofs_delete_buyer_pending
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'playlist-payment-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.playlist_sale_payments p
    where p.id::text = (storage.foldername(name))[2]
      and p.buyer_id = (select auth.uid())
      and p.status = 'PENDING'
      and p.buyer_marked_paid_at is null
  )
);

create or replace function public.keep_playlist_sale_attach_payment_proof(
  p_payment_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage
as $function$
declare
  uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_path text := trim(coalesce(p_storage_path, ''));
  v_name text := left(trim(coalesce(p_file_name, 'preuve')), 180);
  v_mime text := lower(trim(coalesce(p_mime_type, '')));
  v_uploaded_at timestamptz := now();
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id and buyer_id = uid
  for update;

  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if v_payment.status <> 'PENDING' then raise exception 'PAYMENT_NOT_PENDING'; end if;
  if v_payment.buyer_marked_paid_at is not null then raise exception 'PAYMENT_ALREADY_SIGNALED'; end if;
  if v_path = '' or v_path not like uid::text || '/' || p_payment_id::text || '/%' then
    raise exception 'INVALID_PAYMENT_PROOF_PATH';
  end if;
  if v_mime not in ('image/jpeg','image/png','image/webp','application/pdf') then
    raise exception 'PAYMENT_PROOF_TYPE_NOT_ALLOWED';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'playlist-payment-proofs' and name = v_path
  ) then
    raise exception 'PAYMENT_PROOF_FILE_NOT_FOUND';
  end if;

  update public.playlist_sale_payments
  set buyer_payment_proof_path = v_path,
      buyer_payment_proof_name = coalesce(nullif(v_name, ''), 'preuve'),
      buyer_payment_proof_mime = v_mime,
      buyer_payment_proof_uploaded_at = v_uploaded_at
  where id = p_payment_id;

  return jsonb_build_object(
    'paymentId', p_payment_id,
    'proofPath', v_path,
    'proofName', coalesce(nullif(v_name, ''), 'preuve'),
    'proofMime', v_mime,
    'proofUploadedAt', v_uploaded_at
  );
end;
$function$;

create or replace function public.keep_playlist_sale_buyer_mark_paid(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage
as $function$
declare
  uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_buyer_username text;
  v_seller_username text;
  v_marked_at timestamptz;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id and buyer_id = uid
  for update;

  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if v_payment.status = 'COMPLETED' then
    return jsonb_build_object(
      'paymentId',v_payment.id,
      'status','COMPLETED',
      'buyerMarkedPaidAt',v_payment.buyer_marked_paid_at,
      'alreadyDelivered',true,
      'proofName',v_payment.buyer_payment_proof_name
    );
  end if;
  if v_payment.status <> 'PENDING' then raise exception 'PAYMENT_NOT_PENDING'; end if;

  if coalesce(v_payment.amount_free, 0) = 0
     and coalesce(v_payment.provider, '') <> 'FREE_CREDITS' then
    if nullif(trim(coalesce(v_payment.buyer_payment_proof_path, '')), '') is null then
      raise exception 'PAYMENT_PROOF_REQUIRED';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'playlist-payment-proofs'
        and name = v_payment.buyer_payment_proof_path
    ) then
      raise exception 'PAYMENT_PROOF_FILE_NOT_FOUND';
    end if;
  end if;

  select * into v_offer from public.playlist_sale_offers where id = v_payment.offer_id;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND'; end if;

  if v_payment.buyer_marked_paid_at is null then
    v_marked_at := now();
    update public.playlist_sale_payments
    set buyer_marked_paid_at = v_marked_at,
        seller_last_reminded_at = null
    where id = v_payment.id;

    select username into v_buyer_username from public.profiles where id = uid;
    select username into v_seller_username from public.profiles where id = v_payment.seller_id;

    insert into public.notifications(
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values(
      v_payment.seller_id,
      'PLAYLIST_SALE_BUYER_PAID',
      'Paiement signalé · preuve jointe',
      coalesce('@' || v_buyer_username,'Un acheteur') || ' indique avoir payé « ' ||
        v_offer.playlist_name || ' ». Ouvre la preuve, vérifie ton PayPal puis confirme uniquement si les fonds sont réellement reçus.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_BUYER_PAID',
        'paymentId',v_payment.id,
        'offerId',v_offer.id,
        'buyerId',uid,
        'buyerUsername',v_buyer_username,
        'playlistName',v_offer.playlist_name,
        'amountCents',v_payment.amount_cents,
        'currencyCode',upper(coalesce(v_payment.currency_code,'EUR')),
        'proofAttached',true,
        'proofName',v_payment.buyer_payment_proof_name,
        'soundKind','money'
      ),
      'CREATED',
      0
    );

    insert into public.notifications(
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values(
      uid,
      'PLAYLIST_SALE_WAITING_SELLER',
      'Paiement signalé',
      'Ta preuve pour « ' || v_offer.playlist_name || ' » est envoyée à ' ||
        coalesce('@' || v_seller_username,'au vendeur') ||
        '. La sélection se débloquera dès qu’il confirme avoir réellement reçu les fonds.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_WAITING_SELLER',
        'paymentId',v_payment.id,
        'offerId',v_offer.id,
        'sellerId',v_payment.seller_id,
        'sellerUsername',v_seller_username,
        'playlistName',v_offer.playlist_name,
        'proofAttached',true,
        'soundKind','money'
      ),
      'CREATED',
      0
    );
  else
    v_marked_at := v_payment.buyer_marked_paid_at;
  end if;

  return jsonb_build_object(
    'paymentId',v_payment.id,
    'status','PENDING',
    'buyerMarkedPaidAt',v_marked_at,
    'alreadyDelivered',false,
    'proofName',v_payment.buyer_payment_proof_name
  );
end;
$function$;

create or replace function public.keep_playlist_sale_mark_paid_and_deliver(
  p_payment_id uuid,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage
as $function$
declare
  uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_playlist_id uuid;
  v_track_ids uuid[];
  v_track_id uuid;
  v_origin_id uuid;
  v_buyer_username text;
  v_clean_reference text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_amount_text text;
  v_was_pending boolean := false;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id and seller_id = uid
  for update;
  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if v_payment.status not in ('PENDING', 'COMPLETED') then raise exception 'PAYMENT_NOT_DELIVERABLE'; end if;
  v_was_pending := v_payment.status = 'PENDING';

  if v_was_pending
     and coalesce(v_payment.amount_free, 0) = 0
     and coalesce(v_payment.provider, '') <> 'FREE_CREDITS' then
    if v_payment.buyer_marked_paid_at is null then raise exception 'BUYER_HAS_NOT_MARKED_PAID'; end if;
    if nullif(trim(coalesce(v_payment.buyer_payment_proof_path, '')), '') is null then
      raise exception 'PAYMENT_PROOF_REQUIRED';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'playlist-payment-proofs'
        and name = v_payment.buyer_payment_proof_path
    ) then
      raise exception 'PAYMENT_PROOF_FILE_NOT_FOUND';
    end if;
  end if;

  select * into v_offer from public.playlist_sale_offers where id = v_payment.offer_id;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND'; end if;
  v_track_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id, v_offer.playlist_id);
  if cardinality(v_track_ids) = 0 then raise exception 'OFFER_HAS_NO_TRACKS'; end if;

  select id into v_playlist_id
  from public.playlists
  where owner_id = v_payment.buyer_id
    and provider = 'loki_marketplace'
    and provider_playlist_id = 'purchase:' || v_payment.id::text
  limit 1;

  if v_playlist_id is null then
    insert into public.playlists(owner_id, provider, provider_playlist_id, name, description, is_public, is_smart, cover_url)
    values (
      v_payment.buyer_id,
      'loki_marketplace',
      'purchase:' || v_payment.id::text,
      v_offer.playlist_name,
      'Playlist achetée sur Loki',
      false,
      false,
      v_offer.cover_url
    )
    returning id into v_playlist_id;
  end if;

  insert into public.playlist_tracks(playlist_id, track_id, added_via)
  select v_playlist_id, track_id, 'MARKETPLACE_PURCHASE'
  from unnest(v_track_ids) track_id
  on conflict (playlist_id, track_id) do nothing;

  foreach v_track_id in array v_track_ids loop
    select coalesce(
      (select kd.source_user_id
       from public.keep_decisions kd
       where kd.profile_id = v_offer.seller_id
         and kd.track_id = v_track_id
         and kd.decision = 'KEPT'
       order by kd.created_at desc
       limit 1),
      v_offer.seller_id
    ) into v_origin_id;

    if not exists (
      select 1 from public.keep_decisions
      where profile_id = v_payment.buyer_id and track_id = v_track_id and decision = 'KEPT'
    ) then
      insert into public.keep_decisions(profile_id, track_id, decision, visibility, context, source_type, source_user_id)
      values (
        v_payment.buyer_id,
        v_track_id,
        'KEPT',
        'PRIVATE',
        jsonb_build_object('source', 'marketplace_purchase', 'paymentId', v_payment.id, 'offerId', v_offer.id, 'sellerId', v_offer.seller_id),
        'profile',
        v_origin_id
      );
    end if;
  end loop;

  update public.playlist_sale_payments
  set status = 'COMPLETED',
      delivered_playlist_id = v_playlist_id,
      delivered_at = coalesce(delivered_at, now()),
      provider_payment_id = coalesce(v_clean_reference, provider_payment_id)
  where id = v_payment.id;

  if v_was_pending then
    select username into v_buyer_username from public.profiles where id = v_payment.buyer_id;
    v_amount_text := replace(to_char(v_payment.amount_cents::numeric / 100, 'FM999999990.00'), '.', ',')
      || case when upper(coalesce(v_payment.currency_code, 'EUR')) = 'EUR'
        then ' €'
        else ' ' || upper(v_payment.currency_code)
      end;

    insert into public.notifications (
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values (
      v_offer.seller_id,
      'PLAYLIST_SALE_COMPLETED',
      '💰 Paiement reçu',
      coalesce('@' || v_buyer_username, 'Un acheteur')
        || ' a débloqué « ' || v_offer.playlist_name || ' » pour '
        || v_amount_text || ' au total.',
      jsonb_build_object(
        'event', 'PLAYLIST_SALE_COMPLETED',
        'paymentId', v_payment.id,
        'offerId', v_offer.id,
        'buyerId', v_payment.buyer_id,
        'amountCents', v_payment.amount_cents,
        'currencyCode', upper(coalesce(v_payment.currency_code, 'EUR')),
        'trackCount', cardinality(v_track_ids),
        'priceScope', 'OFFER_TOTAL',
        'soundKind', 'money'
      ),
      'CREATED',
      0
    );

    insert into public.notifications (
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values (
      v_payment.buyer_id,
      'PLAYLIST_SALE_DELIVERED',
      '✓ Sélection débloquée',
      '« ' || v_offer.playlist_name || ' » est maintenant disponible dans ton Loki Music. Choisis ensuite si tu veux la rendre publique ou la garder privée.',
      jsonb_build_object(
        'event', 'PLAYLIST_SALE_DELIVERED',
        'paymentId', v_payment.id,
        'offerId', v_offer.id,
        'sellerId', v_offer.seller_id,
        'playlistId', v_playlist_id,
        'trackCount', cardinality(v_track_ids),
        'visibilityChoicePending', true
      ),
      'CREATED',
      0
    );
  end if;

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'buyerId', v_payment.buyer_id,
    'playlistId', v_playlist_id,
    'playlistName', v_offer.playlist_name,
    'trackCount', cardinality(v_track_ids),
    'deliveredAt', now()
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_attach_payment_proof(uuid,text,text,text) from public, anon;
grant execute on function public.keep_playlist_sale_attach_payment_proof(uuid,text,text,text) to authenticated;
revoke all on function public.keep_playlist_sale_buyer_mark_paid(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_buyer_mark_paid(uuid) to authenticated;
revoke all on function public.keep_playlist_sale_mark_paid_and_deliver(uuid,text) from public, anon;
grant execute on function public.keep_playlist_sale_mark_paid_and_deliver(uuid,text) to authenticated;
