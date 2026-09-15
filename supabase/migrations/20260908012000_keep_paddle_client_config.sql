-- Adel 08/09/2026 : Paddle Seller ID et Client-side Token sont concus par
-- Paddle pour vivre cote navigateur (equivalent d'une cle publiable Stripe) --
-- jamais l'API Key ni le Webhook Secret, qui restent uniquement lisibles par
-- service_get_integration_secret (reserve au role service). Wrapper
-- SECURITY DEFINER expose UNIQUEMENT ces deux valeurs volontairement
-- publiques a anon/authenticated, jamais integration_secrets dans son
-- ensemble.
CREATE OR REPLACE FUNCTION public.keep_paddle_client_config()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'sellerId', public.service_get_integration_secret('PADDLE_SELLER_ID'),
    'clientToken', public.service_get_integration_secret('PADDLE_CLIENT_TOKEN')
  );
$function$;

revoke all on function public.keep_paddle_client_config() from public;
grant execute on function public.keep_paddle_client_config() to anon, authenticated;
