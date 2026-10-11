alter table public.playlist_sale_payments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text;

create or replace function public.keep_playlist_sale_cancel_payment(
  p_payment_id uuid,
  p_reason text default 'USER_CANCELLED'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_actor_role text;
  v_actor_username text;
  v_counterpart uuid;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id=p_payment_id
  for update;

  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_uid<>v_payment.buyer_id and v_uid<>v_payment.seller_id then raise exception 'forbidden' using errcode='42501'; end if;
  if upper(v_payment.status)='COMPLETED' then raise exception 'PAYMENT_ALREADY_COMPLETED'; end if;

  if upper(v_payment.status) in ('FAILED','REFUNDED') then
    return jsonb_build_object('paymentId',v_payment.id,'status',v_payment.status,'alreadyCancelled',true);
  end if;

  if v_payment.buyer_marked_paid_at is not null or v_payment.buyer_payment_proof_uploaded_at is not null then
    raise exception 'PAYMENT_ALREADY_REPORTED';
  end if;

  v_actor_role := case when v_uid=v_payment.buyer_id then 'BUYER' else 'SELLER' end;
  v_counterpart := case when v_actor_role='BUYER' then v_payment.seller_id else v_payment.buyer_id end;

  select * into v_offer from public.playlist_sale_offers where id=v_payment.offer_id;
  select username into v_actor_username from public.profiles where id=v_uid;

  update public.playlist_sale_payments
  set status='FAILED',
      cancelled_at=now(),
      cancelled_by=v_uid,
      cancellation_reason=left(coalesce(nullif(trim(p_reason),''),'USER_CANCELLED'),240)
  where id=v_payment.id;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values(
    v_counterpart,
    'PLAYLIST_SALE_CANCELLED',
    'Transaction annulée',
    case when v_actor_role='BUYER'
      then coalesce(nullif(v_actor_username,''),'L’acheteur')||' a annulé « '||coalesce(v_offer.playlist_name,'cette Pépite')||' ». Tu n’as plus besoin d’attendre ce paiement.'
      else coalesce(nullif(v_actor_username,''),'Le vendeur')||' a annulé « '||coalesce(v_offer.playlist_name,'cette Pépite')||' ». Tu n’as plus besoin d’attendre le déblocage.'
    end,
    jsonb_build_object(
      'event','PLAYLIST_SALE_CANCELLED','paymentId',v_payment.id,'offerId',v_payment.offer_id,
      'actorId',v_uid,'actorUsername',v_actor_username,'actorRole',v_actor_role,
      'playlistName',coalesce(v_offer.playlist_name,''),'soundKind','money'
    ),
    'CREATED',0
  );

  return jsonb_build_object('paymentId',v_payment.id,'status','FAILED','alreadyCancelled',false);
end;
$function$;

revoke all on function public.keep_playlist_sale_cancel_payment(uuid,text) from public, anon;
grant execute on function public.keep_playlist_sale_cancel_payment(uuid,text) to authenticated, service_role;

create or replace function public.keep_playlist_sale_payment_guard_status(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_payment
  from public.playlist_sale_payments
  where id=p_payment_id and (buyer_id=v_uid or seller_id=v_uid)
  limit 1;
  if v_payment.id is null then return null; end if;

  return jsonb_build_object(
    'paymentId',v_payment.id,'status',upper(coalesce(v_payment.status,'PENDING')),
    'buyerMarkedPaidAt',v_payment.buyer_marked_paid_at,
    'proofUploadedAt',v_payment.buyer_payment_proof_uploaded_at,
    'deliveredPlaylistId',v_payment.delivered_playlist_id,
    'cancelledAt',v_payment.cancelled_at,
    'cancelledBy',v_payment.cancelled_by,
    'pending',upper(coalesce(v_payment.status,'PENDING'))='PENDING'
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_payment_guard_status(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_payment_guard_status(uuid) to authenticated, service_role;