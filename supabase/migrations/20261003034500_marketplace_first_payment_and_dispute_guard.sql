-- Loki Music · garde-fous marketplace : premier paiement, CGU vendeur et réclamation.
-- Réutilise les paiements et user_reports existants, aucune table parallèle.

create or replace function public.keep_playlist_sale_first_payment_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if upper(coalesce(new.status::text,'')) <> 'PENDING'
     or coalesce(new.amount_cents,0) <= 0
     or coalesce(new.amount_free,0) > 0
     or upper(coalesce(new.provider,'')) = 'FREE_CREDITS' then
    return new;
  end if;

  -- Après une première transaction réellement terminée, l'utilisateur
  -- retrouve le fonctionnement normal. Avant cela : une seule PENDING.
  if not exists (
    select 1 from public.playlist_sale_payments done
    where done.buyer_id = new.buyer_id
      and upper(coalesce(done.status::text,'')) = 'COMPLETED'
      and coalesce(done.amount_cents,0) > 0
  ) and exists (
    select 1 from public.playlist_sale_payments pending
    where pending.buyer_id = new.buyer_id
      and upper(coalesce(pending.status::text,'')) = 'PENDING'
      and coalesce(pending.amount_cents,0) > 0
  ) then
    raise exception 'FIRST_PAYMENT_ONE_AT_A_TIME' using errcode='42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.keep_playlist_sale_first_payment_guard() from public, anon, authenticated;

drop trigger if exists trg_playlist_sale_first_payment_guard on public.playlist_sale_payments;
create trigger trg_playlist_sale_first_payment_guard
before insert on public.playlist_sale_payments
for each row execute function public.keep_playlist_sale_first_payment_guard();

create or replace function public.keep_playlist_sale_require_seller_terms()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_terms_version constant text := '2026-10-01-chat-payments-v1';
begin
  if upper(coalesce(new.payment_mode,'')) = 'MONEY'
     and coalesce(new.is_active,true)
     and new.seller_id is not null
     and not exists (
       select 1 from public.marketplace_terms_acceptances a
       where a.profile_id = new.seller_id
         and a.terms_version = v_terms_version
     ) then
    raise exception 'TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.keep_playlist_sale_require_seller_terms() from public, anon, authenticated;

drop trigger if exists trg_playlist_sale_require_seller_terms on public.playlist_sale_offers;
create trigger trg_playlist_sale_require_seller_terms
before insert or update of payment_mode,is_active,seller_id on public.playlist_sale_offers
for each row execute function public.keep_playlist_sale_require_seller_terms();

create or replace function public.keep_playlist_sale_report_problem(
  p_payment_id uuid,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_target uuid;
  v_report_id uuid;
  v_details text := left(coalesce(nullif(trim(p_details),''),'Problème de transaction ou absence de réponse.'),1000);
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id=p_payment_id
    and (buyer_id=v_uid or seller_id=v_uid)
  limit 1;

  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if upper(coalesce(v_payment.status::text,''))='COMPLETED' then raise exception 'PAYMENT_ALREADY_COMPLETED'; end if;

  -- Une simple demande encore non payée peut être annulée. La réclamation
  -- financière devient pertinente après preuve/signalement et délai de réponse.
  if v_payment.buyer_marked_paid_at is null then
    raise exception 'PAYMENT_NOT_REPORTED_YET';
  end if;
  if v_payment.buyer_marked_paid_at > now() - interval '4 hours' then
    raise exception 'PAYMENT_REPORT_TOO_EARLY';
  end if;

  v_target := case when v_uid=v_payment.buyer_id then v_payment.seller_id else v_payment.buyer_id end;
  select * into v_offer from public.playlist_sale_offers where id=v_payment.offer_id;

  select id into v_report_id
  from public.user_reports
  where reporter_id=v_uid
    and reported_user_id=v_target
    and context->>'kind'='TRANSACTION'
    and context->>'paymentId'=p_payment_id::text
  order by created_at desc
  limit 1;

  if v_report_id is not null then return v_report_id; end if;

  insert into public.user_reports(
    reporter_id,reported_user_id,reason,details,context
  )
  values(
    v_uid,v_target,'other',v_details,
    jsonb_build_object(
      'kind','TRANSACTION',
      'paymentId',v_payment.id,
      'offerId',v_payment.offer_id,
      'playlistName',coalesce(v_offer.playlist_name,''),
      'buyerId',v_payment.buyer_id,
      'sellerId',v_payment.seller_id,
      'buyerMarkedPaidAt',v_payment.buyer_marked_paid_at,
      'proofAttached',v_payment.buyer_payment_proof_uploaded_at is not null,
      'excerpt','Transaction Loki signalée : paiement annoncé, réponse ou résolution manquante.'
    )
  )
  returning id into v_report_id;

  return v_report_id;
end;
$function$;

revoke all on function public.keep_playlist_sale_report_problem(uuid,text) from public, anon;
grant execute on function public.keep_playlist_sale_report_problem(uuid,text) to authenticated;
