import { supabase } from './supabaseClient';

/**
 * Vérifie un feature flag réel (table `feature_flags`, gérée dans Super
 * Admin). `false` par défaut sur toute erreur/absence -- une fonctionnalité
 * gatée ne doit jamais s'activer par accident faute de réponse claire.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  if (!supabase) return false;
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
