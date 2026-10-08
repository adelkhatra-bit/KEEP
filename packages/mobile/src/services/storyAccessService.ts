import { supabase } from './supabaseClient';
import { isStoryAccountEligible } from './storyEligibility';

/**
 * Stories + suggestions d'amis : réservées aux COMPTES RÉELS (Adel, 05/10/2026) -- connexion avec une adresse e-mail vérifiée
 * (le mot de passe est créé avec le compte). Jamais pour le mode démo, l'invité local ni un compte anonyme.
 */
export { isStoryAccountEligible };

export async function loadStoryAccess(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return isStoryAccountEligible(data.session?.user as any);
  } catch { return false; }
}
