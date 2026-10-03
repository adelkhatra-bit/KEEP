-- Loki Music · protège la suppression des notifications liées à une transaction.
-- Le client peut interroger le statut uniquement s'il est acheteur ou vendeur.

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
  if p_payment_id is null then return null; end if;

  select *
    into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id
    and (buyer_id = v_uid or seller_id = v_uid)
  limit 1;

  if v_payment.id is null then return null; end if;

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'status', upper(coalesce(v_payment.status::text, 'PENDING')),
    'buyerMarkedPaidAt', v_payment.buyer_marked_paid_at,
    'proofUploadedAt', v_payment.buyer_payment_proof_uploaded_at,
    'deliveredPlaylistId', v_payment.delivered_playlist_id,
    'pending', upper(coalesce(v_payment.status::text, 'PENDING')) <> 'COMPLETED'
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_payment_guard_status(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_payment_guard_status(uuid) to authenticated, service_role;
