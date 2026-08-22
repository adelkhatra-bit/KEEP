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
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey);
  return {
    async verify(accessToken) {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return { userId: data.user.id };
    },
  };
}
