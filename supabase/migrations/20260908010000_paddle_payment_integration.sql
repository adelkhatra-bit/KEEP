-- Adel 08/09/2026 : "je vis a Dubai, j'ai pas de societe ... est-ce que t'as
-- prevu de mettre le lien et toutes les instructions" -- Paddle choisi comme
-- "merchant of record" (Paddle est le vendeur officiel partout dans le
-- monde, gere la TVA a notre place, accepte un particulier sans societe
-- enregistree). Ce fichier prepare tout le cote base de donnees ; il ne
-- reste qu'a coller les vraies cles Paddle dans integration_secrets (Super
-- Admin > Integrations) et les vrais paddle_price_id une fois les produits
-- crees sur le dashboard Paddle.

alter table public.plan_prices add column if not exists paddle_price_id text;
create unique index if not exists idx_plan_prices_paddle_price_id on public.plan_prices(paddle_price_id) where paddle_price_id is not null;

-- Catalogue public (lecture seule) : le client mobile/web doit savoir quel
-- paddle_price_id ouvrir au checkout pour un plan+periode donnes, sans avoir
-- besoin d'un acces service-role.
CREATE OR REPLACE FUNCTION public.keep_plan_paddle_catalog()
 RETURNS TABLE(plan_code text, period text, paddle_price_id text, amount numeric, currency_code text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.code::text, pp.period::text, pp.paddle_price_id, pp.amount, pp.currency_code
  from public.plan_prices pp
  join public.plans p on p.id = pp.plan_id
  where pp.is_active = true and pp.paddle_price_id is not null;
$function$;

revoke all on function public.keep_plan_paddle_catalog() from public;
grant execute on function public.keep_plan_paddle_catalog() to anon, authenticated;

-- Ecrit par le webhook Paddle (edge function keep-paddle-webhook, cle
-- service-role) apres verification de la signature HMAC Paddle -- jamais
-- appelable par le client mobile/web directement. Reutilise exactement le
-- meme index unique partiel (channel, store_original_transaction_id) deja
-- construit pour Apple IAP / Google Play Billing : Paddle est un troisieme
-- canal 'WEB', identifie par son subscription id Paddle.
CREATE OR REPLACE FUNCTION public.service_paddle_upsert_subscription(
  p_profile_id uuid,
  p_paddle_subscription_id text,
  p_paddle_price_id text,
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

  return jsonb_build_object('subscriptionId', v_subscription.id, 'planCode', v_plan.code::text, 'status', v_subscription.status::text);
end;
$function$;

-- Reserve au role service (l'edge function keep-paddle-webhook utilise la
-- cle service-role) : jamais expose au client mobile/web, l'authenticite
-- vient de la verification HMAC Paddle faite dans l'edge function elle-meme.
revoke all on function public.service_paddle_upsert_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean) from public;
grant execute on function public.service_paddle_upsert_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean) to service_role;
