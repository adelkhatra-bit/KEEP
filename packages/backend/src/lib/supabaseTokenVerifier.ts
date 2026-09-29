import { createClient } from '@supabase/supabase-js';
import { TokenVerifier } from './keepAuth';

/**
 * Implémentation réelle de `TokenVerifier` via Supabase Auth. Utilise
 * `auth.getUser(token)` — Supabase reste seul juge de la validité d'un
 * token (expiration, révocation), jamais réimplémenté ici (pas de
 * vérification JWT manuelle qui dupliquerait cette logique et risquerait
 * de diverger).
 *
 * Renvoie `null` (pas une exception) si Supabase n'est pas configuré, pour
 * que l'appelant réponde honnêtement "non configuré" plutôt que de
 * planter ou, pire, de laisser passer une route sensible sans protection.
 */
export function createSupabaseTokenVerifier(): TokenVerifier | null {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  // Un déploiement backend historique pouvait avoir la service_role sans
  // SUPABASE_ANON_KEY et montait alors toutes les routes /library en 503.
  // auth.getUser(token) peut être vérifié avec une clé serveur ou publishable :
  // aucune de ces clés n'est renvoyée au client.
  const verifierKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !verifierKey) return null;

  const client = createClient(url, verifierKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async verify(accessToken) {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return { userId: data.user.id };
    },
  };
}
