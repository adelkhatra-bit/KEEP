-- BUG FIX (19/09/2026) : Race condition sur event tickets (même pattern que artist/playlist)
-- Problème : keep_event_request_ticket_purchase() utilise SELECT + IF NULL + INSERT
-- La UNIQUE(event_id, buyer_id, status) empêche les doublons silencieux MAIS
-- cause une exception si deux threads concurrent tentent la même insertion
-- Solution : Convertir à UPSERT atomique pour éviter l'exception

create or replace function public.keep_event_request_ticket_purchase(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_existing public.event_ticket_orders%rowtype;
  v_seller_username text;
  v_payout_link text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.ticket_price_cents is null then raise exception 'EVENT_IS_FREE'; end if;
  if v_event.creator_id = uid then raise exception 'CANNOT_BUY_OWN_TICKET'; end if;

  -- UPSERT atomique : si commande PENDING existe, la retourner ; sinon créer
  insert into public.event_ticket_orders(event_id, seller_id, buyer_id, amount_cents, currency_code, status, provider)
  values (p_event_id, v_event.creator_id, uid, v_event.ticket_price_cents, 'EUR', 'PENDING', 'EXTERNAL_LINK')
  on conflict (event_id, buyer_id, status) where status in ('PENDING')
  do update set id = excluded.id
  returning * into v_existing;

  select username into v_seller_username from public.profiles where id = v_event.creator_id;
  select payout_link into v_payout_link from public.profiles where id = v_event.creator_id;

  return jsonb_build_object(
    'orderId', v_existing.id,
    'status', v_existing.status,
    'amountCents', v_existing.amount_cents,
    'currencyCode', v_existing.currency_code,
    'sellerUsername', v_seller_username,
    'payoutLink', v_payout_link
  );
end;
$function$;

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014XdCPchT6vDAK2W89g4vaM
