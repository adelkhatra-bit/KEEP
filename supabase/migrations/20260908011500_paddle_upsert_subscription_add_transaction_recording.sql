-- Adel 08/09/2026 : suite de 20260908010000_paddle_payment_integration.sql --
-- ajoute l'enregistrement de la transaction (montant/taxe/frais) dans
-- public.transactions, exactement comme keep-iap-verify le fait deja pour
-- Apple IAP, pour garder une piste comptable complete cote Loki en plus de
-- l'etat d'abonnement.

drop function if exists public.service_paddle_upsert_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean);

CREATE OR REPLACE FUNCTION public.service_paddle_upsert_subscription(
  p_profile_id uuid,
  p_paddle_subscription_id text,
  p_paddle_price_id text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean DEFAULT false,
  p_paddle_transaction_id text DEFAULT NULL,
  p_transaction_amount numeric DEFAULT NULL,
  p_transaction_tax numeric DEFAULT NULL,
  p_transaction_fee numeric DEFAULT NULL,
  p_raw_event jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_price public.plan_prices%rowtype;
  v_plan public.plans%rowtype;
  v_country char(2);
  v_status public.subscription_status;
  v_subscription public.subscriptions%rowtype;
begin
  if p_profile_id is null or p_paddle_subscription_id is null then raise exception 'invalid_paddle_payload'; end if;

  select * into v_price from public.plan_prices where paddle_price_id = p_paddle_price_id and is_active = true limit 1;
  if v_price.id is null then raise exception 'paddle_price_not_mapped:%', p_paddle_price_id; end if;
  select * into v_plan from public.plans where id = v_price.plan_id;

  select coalesce(nullif(country_code::text,''),'FR')::char(2) into v_country from public.profiles where id = p_profile_id;
  if v_country is null then raise exception 'profile_not_found'; end if;

  v_status := case upper(coalesce(p_status,''))
    when 'ACTIVE' then 'ACTIVE'
    when 'TRIALING' then 'TRIALING'
    when 'PAST_DUE' then 'PAST_DUE'
    when 'PAUSED' then 'EXPIRED'
    when 'CANCELED' then 'CANCELLED'
    when 'CANCELLED' then 'CANCELLED'
    else 'EXPIRED'
  end::public.subscription_status;

  insert into public.subscriptions(
    profile_id, plan_id, plan_price_id, channel, status,
    country_code, currency_code, current_period_start, current_period_end,
    cancel_at_period_end, source, store_original_transaction_id
  ) values (
    p_profile_id, v_plan.id, v_price.id, 'WEB'::public.payment_channel, v_status,
    v_country, v_price.currency_code, coalesce(p_current_period_start, now()), p_current_period_end,
    coalesce(p_cancel_at_period_end, false), 'paddle', p_paddle_subscription_id
  )
  on conflict (channel, store_original_transaction_id) where store_original_transaction_id is not null
  do update set
    plan_id = excluded.plan_id,
    plan_price_id = excluded.plan_price_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = now()
  returning * into v_subscription;

  if p_paddle_transaction_id is not null and p_transaction_amount is not null
     and not exists(select 1 from public.transactions where store_transaction_id = p_paddle_transaction_id) then
    insert into public.transactions(
      profile_id, subscription_id, channel, status, amount, currency_code, country_code,
      store_transaction_id, store_commission_amount, tax_amount, raw_receipt
    ) values (
      p_profile_id, v_subscription.id, 'WEB'::public.payment_channel, 'SUCCEEDED'::public.transaction_status,
      p_transaction_amount, v_price.currency_code, v_country,
      p_paddle_transaction_id, p_transaction_fee, p_transaction_tax, p_raw_event
    );
  end if;

  return jsonb_build_object('subscriptionId', v_subscription.id, 'planCode', v_plan.code::text, 'status', v_subscription.status::text);
end;
$function$;

revoke all on function public.service_paddle_upsert_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean, text, numeric, numeric, numeric, jsonb) from public;
grant execute on function public.service_paddle_upsert_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean, text, numeric, numeric, numeric, jsonb) to service_role;
