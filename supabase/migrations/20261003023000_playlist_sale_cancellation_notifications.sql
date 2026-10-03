alter table public.playlist_sale_payments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancel_reason text;

alter table public.playlist_sale_payments
  drop constraint if exists playlist_sale_payments_status_check;

alter table public.playlist_sale_payments
  add constraint playlist_sale_payments_status_check
  check (status = any (array['PENDING'::text,'COMPLETED'::text,'FAILED'::text,'REFUNDED'::text,'CANCELLED'::text]));

create or replace function public.keep_playlist_sale_cancel_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_other_id uuid;
  v_actor_username text;
  v_playlist_name text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_payment_id is null then raise exception 'PAYMENT_REQUIRED' using errcode='22023'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id
    and (buyer_id = v_uid or seller_id = v_uid)
  for update;

  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND' using errcode='P0002'; end if;
  if upper(v_payment.status) <> 'PENDING' then raise exception 'PAYMENT_NOT_PENDING' using errcode='22023'; end if;
  if v_payment.delivered_playlist_id is not null then raise exception 'PAYMENT_ALREADY_DELIVERED' using errcode='22023'; end if;
  if v_payment.buyer_marked_paid_at is not null or v_payment.buyer_payment_proof_uploaded_at is not null or v_payment.buyer_payment_proof_path is not null then
    raise exception 'PAYMENT_ALREADY_REPORTED' using errcode='22023';
  end if;

  v_other_id := case when v_uid = v_payment.buyer_id then v_payment.seller_id else v_payment.buyer_id end;

  select username into v_actor_username from public.profiles where id = v_uid;
  select o.playlist_name into v_playlist_name from public.playlist_sale_offers o where o.id = v_payment.offer_id;

  update public.playlist_sale_payments
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancelled_by = v_uid,
      cancel_reason = 'USER_CANCELLED'
  where id = p_payment_id;

  update public.notifications
  set type = 'PLAYLIST_SALE_CANCELLED',
      title = 'Transaction annulée',
      body = coalesce(nullif(v_actor_username,''),'Un utilisateur') || ' a annulé la transaction « ' || coalesce(v_playlist_name,'Pépite') || ' ». Aucun paiement ni déblocage n’est attendu.',
      data = coalesce(data,'{}'::jsonb) || jsonb_build_object(
        'event','PLAYLIST_SALE_CANCELLED',
        'paymentId',p_payment_id,
        'offerId',v_payment.offer_id,
        'cancelledById',v_uid,
        'cancelledByUsername',v_actor_username,
        'playlistName',v_playlist_name,
        'soundKind','money'
      )
  where profile_id in (v_payment.buyer_id,v_payment.seller_id)
    and data->>'paymentId' = p_payment_id::text
    and type like 'PLAYLIST_SALE_%'
    and type not in ('PLAYLIST_SALE_COMPLETED','PLAYLIST_SALE_DELIVERED');

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  select
    v_other_id,
    'PLAYLIST_SALE_CANCELLED',
    'Transaction annulée',
    coalesce(nullif(v_actor_username,''),'Un utilisateur') || ' a annulé la transaction « ' || coalesce(v_playlist_name,'Pépite') || ' ». Tu n’as plus à attendre le paiement ou le déblocage.',
    jsonb_build_object(
      'event','PLAYLIST_SALE_CANCELLED',
      'paymentId',p_payment_id,
      'offerId',v_payment.offer_id,
      'cancelledById',v_uid,
      'cancelledByUsername',v_actor_username,
      'playlistName',v_playlist_name,
      'soundKind','money'
    ),
    'CREATED',
    0
  where v_other_id is not null
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = v_other_id
        and n.type = 'PLAYLIST_SALE_CANCELLED'
        and n.data->>'paymentId' = p_payment_id::text
    );

  return jsonb_build_object(
    'paymentId',p_payment_id,
    'status','CANCELLED',
    'notifiedProfileId',v_other_id
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_cancel_payment(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_cancel_payment(uuid) to authenticated;

create or replace function public.keep_playlist_sale_payment_guard_status(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_payment_id is null then return null; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id
    and (buyer_id = v_uid or seller_id = v_uid)
  limit 1;

  if v_payment.id is null then return null; end if;

  return jsonb_build_object(
    'paymentId',v_payment.id,
    'status',upper(coalesce(v_payment.status::text,'PENDING')),
    'buyerMarkedPaidAt',v_payment.buyer_marked_paid_at,
    'proofUploadedAt',v_payment.buyer_payment_proof_uploaded_at,
    'deliveredPlaylistId',v_payment.delivered_playlist_id,
    'pending',upper(coalesce(v_payment.status::text,'PENDING')) = 'PENDING',
    'cancelledAt',v_payment.cancelled_at,
    'cancelledBy',v_payment.cancelled_by
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_payment_guard_status(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_payment_guard_status(uuid) to authenticated;
