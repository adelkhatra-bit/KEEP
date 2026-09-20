-- Audit Supabase (demandé par Adel, 20/09/2026) via get_advisors(security) :
-- 4 fonctions préfixées service_* (convention "service_role uniquement" dans
-- ce projet) étaient exécutables par anon ET authenticated, alors qu'elles
-- ne sont appelées que depuis des edge functions avec la clé service_role
-- (keep-stripe-webhook, keep-paddle-webhook, keep-music-memory -- vérifié
-- dans le code avant ce correctif, aucun appel client mobile/admin trouvé).
-- Impact réel avant correctif : n'importe qui, sans authentification, aurait
-- pu appeler /rest/v1/rpc/service_stripe_upsert_subscription (ou l'équivalent
-- Paddle) avec la clé anon publique et s'attribuer un abonnement payant
-- gratuitement, ou lire à quel profil correspond un abonnement Stripe donné.
--
-- service_is_blocked_either_way n'est PAS touchée : elle est appelée
-- directement par packages/mobile/src/services/moderationService.ts en tant
-- qu'utilisateur authentifié -- son nom suit la convention service_* mais
-- c'est une fonction client légitime, pas un oubli.

do $$
declare
  fn text;
  role_name text;
  functions text[] := array[
    'public.service_lookup_fingerprint_hashes(bigint[])',
    'public.service_paddle_upsert_subscription(uuid,text,text,text,timestamptz,timestamptz,boolean,text,numeric,numeric,numeric,jsonb)',
    'public.service_stripe_find_subscription(text)',
    'public.service_stripe_upsert_subscription(uuid,text,text,text,timestamptz,timestamptz,boolean)'
  ];
begin
  foreach fn in array functions loop
    execute format('revoke all on function %s from public', fn);
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on function %s from %I', fn, role_name);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end;
$$;
