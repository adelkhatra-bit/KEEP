-- Adel (15/09/2026) : "on va utiliser le stripe de insidedombe ... j'ai deja
-- une societe" -- Stripe (compte "Loki" d'Inside Dombe, SIRET francais) comme
-- second rail de paiement pour les abonnements, a cote de Paddle. Meme
-- architecture que Paddle (voir 20260908010000_paddle_payment_integration.sql) :
-- catalogue public en lecture (plan+periode -> price id), config client
-- public (cle publishable, jamais secrete), et l'ecriture reelle de
-- l'abonnement reservee au webhook (service_role), qui est le seul endroit a
-- faire confiance a Stripe apres verification de signature.

alter table public.plan_prices add column if not exists stripe_price_id text;
create unique index if not exists idx_plan_prices_stripe_price_id on public.plan_prices(stripe_price_id) where stripe_price_id is not null;

-- Catalogue public (lecture seule) : le client mobile/web doit savoir quel
-- stripe_price_id ouvrir au checkout pour un plan+periode donnes.
CREATE OR REPLACE FUNCTION public.keep_plan_stripe_catalog()
 RETURNS TABLE(plan_code text, period text, stripe_price_id text, amount numeric, currency_code text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.code::text, pp.period::text, pp.stripe_price_id, pp.amount, pp.currency_code
  from public.plan_prices pp
  join public.plans p on p.id = pp.plan_id
  where pp.is_active = true and pp.stripe_price_id is not null;
$function$;

revoke all on function public.keep_plan_stripe_catalog() from public;
grant execute on function public.keep_plan_stripe_catalog() to anon, authenticated;

-- La cle publishable n'est pas un secret (elle tourne cote client dans
-- Stripe.js), mais elle vit dans le meme coffre-fort integration_secrets que
-- le reste -- cette fonction la sert au client comme keep_paddle_client_config
-- sert seller_id/client_token.
CREATE OR REPLACE FUNCTION public.keep_stripe_client_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return jsonb_build_object('publishableKey', null);
  end if;
  select v.decrypted_secret into v_key
  from public.integration_secrets i
  join vault.decrypted_secrets v on v.id = i.vault_secret_id
  where i.key = 'STRIPE_PUBLISHABLE_KEY' and i.is_configured = true
  limit 1;
  return jsonb_build_object('publishableKey', v_key);
end;
$function$;

revoke all on function public.keep_stripe_client_config() from public;
grant execute on function public.keep_stripe_client_config() to anon, authenticated;

-- Ecrit par le webhook Stripe (edge function keep-stripe-webhook, cle
-- service-role) apres verification de la signature Stripe -- jamais
-- appelable par le client. Meme index unique partiel (channel,
-- store_original_transaction_id) que Paddle/IAP/Play Billing : Stripe est un
-- quatrieme canal identifie par son subscription id ("sub_..."), toujours
-- sous channel 'WEB' (comme Paddle) puisque c'est aussi un paiement web.
CREATE OR REPLACE FUNCTION public.service_stripe_upsert_subscription(
  p_profile_id uuid,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean DEFAULT false
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
  if p_profile_id is null or p_stripe_subscription_id is null then raise exception 'invalid_stripe_payload'; end if;

  select * into v_price from public.plan_prices where stripe_price_id = p_stripe_price_id and is_active = true limit 1;
  if v_price.id is null then raise exception 'stripe_price_not_mapped:%', p_stripe_price_id; end if;
  select * into v_plan from public.plans where id = v_price.plan_id;

  select coalesce(nullif(country_code::text,''),'FR')::char(2) into v_country from public.profiles where id = p_profile_id;
  if v_country is null then raise exception 'profile_not_found'; end if;

  v_status := case lower(coalesce(p_status,''))
    when 'active' then 'ACTIVE'
    when 'trialing' then 'TRIALING'
    when 'past_due' then 'PAST_DUE'
    when 'unpaid' then 'PAST_DUE'
    when 'incomplete' then 'PAST_DUE'
    when 'paused' then 'EXPIRED'
    when 'canceled' then 'CANCELLED'
    when 'incomplete_expired' then 'CANCELLED'
    else 'EXPIRED'
  end::public.subscription_status;

  insert into public.subscriptions(
    profile_id, plan_id, plan_price_id, channel, status,
    country_code, currency_code, current_period_start, current_period_end,
    cancel_at_period_end, source, store_original_transaction_id
  ) values (
    p_profile_id, v_plan.id, v_price.id, 'WEB'::public.payment_channel, v_status,
    v_country, v_price.currency_code, coalesce(p_current_period_start, now()), p_current_period_end,
    coalesce(p_cancel_at_period_end, false), 'stripe', p_stripe_subscription_id
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

  return jsonb_build_object('subscriptionId', v_subscription.id, 'planCode', v_plan.code::text, 'status', v_subscription.status::text);
end;
$function$;

revoke all on function public.service_stripe_upsert_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean) from public;
grant execute on function public.service_stripe_upsert_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean) to service_role;

-- Cote lecture, pour retrouver le profil deja lie a un abonnement Stripe
-- existant (renouvellement/annulation : Stripe ne redonne pas le profileId,
-- seulement le subscription id) -- reserve service_role, meme logique que
-- l'enrichissement de transaction Paddle (handleTransactionCompleted).
CREATE OR REPLACE FUNCTION public.service_stripe_find_subscription(p_stripe_subscription_id text)
 RETURNS TABLE(profile_id uuid)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.profile_id from public.subscriptions s
  where s.channel = 'WEB'::public.payment_channel and s.store_original_transaction_id = p_stripe_subscription_id
  limit 1;
$function$;

revoke all on function public.service_stripe_find_subscription(text) from public;
grant execute on function public.service_stripe_find_subscription(text) to service_role;
