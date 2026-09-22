import { supabase } from './supabaseClient';

/**
 * Vérifie un feature flag réel (table `feature_flags`, gérée dans Super
 * Admin). `false` par défaut sur toute erreur/absence -- une fonctionnalité
 * gatée ne doit jamais s'activer par accident faute de réponse claire.
 *
 * Adel (21/09/2026) : "J'ai donné 1000 abonnés à adel4A via le Super Admin,
 * et les fonctions ont disparu au lieu de se débloquer." Cause réelle : le
 * flag global playlist_marketplace était désactivé (décision produit,
 * risque Apple IAP) -- ça coupait la fonction pour TOUT LE MONDE, y compris
 * les comptes de test avec des abonnés virtuels, les deux mécanismes
 * n'étant jamais reliés. Passe désormais par
 * keep_feature_flag_enabled_for_me(), qui ajoute un bypass PAR COMPTE
 * (feature_flag_test_accounts, géré dans Super Admin) sans jamais avoir à
 * rallumer le flag global pour tout le monde. Repli sur l'ancienne lecture
 * directe de la table si la RPC échoue (ex. schéma pas encore migré).
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('keep_feature_flag_enabled_for_me', { p_key: key });
    if (!error) return Boolean(data);
  } catch {
    // repli ci-dessous
  }
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('is_enabled_globally,rollout_percent')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean((data as any).is_enabled_globally) && Number((data as any).rollout_percent ?? 100) > 0;
  } catch {
    return false;
  }
}
