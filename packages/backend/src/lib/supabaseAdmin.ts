import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase avec la clé service_role -- contourne RLS DÉLIBÉRÉMENT.
 * C'est le seul endroit légitime pour ça : le backend est le point de
 * contrôle de confiance que RLS est justement conçu à faire contourner par
 * un rôle serveur, jamais le client mobile/admin directement (voir
 * supabase/migrations/0006_rls.sql). Ne JAMAIS exposer cette clé côté
 * mobile/web -- elle vit uniquement dans les variables d'env du backend.
 *
 * `null` tant que SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ne sont pas
 * renseignées -- chaque appelant doit gérer ce cas explicitement (503,
 * jamais un client construit avec une URL factice).
 */
let cached: SupabaseClient | null | undefined;

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && serviceRoleKey ? createClient(url, serviceRoleKey, { auth: { persistSession: false } }) : null;
  return cached;
}

/** Réservé aux scripts de vérification -- force une réévaluation de la config. */
export function resetSupabaseAdminClientCacheForTests() {
  cached = undefined;
}
