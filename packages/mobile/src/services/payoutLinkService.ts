import { supabase } from './supabaseClient';

/**
 * Lien de paiement personnel (Adel, 16-17/09/2026) — "l'idéal c'est que
 * l'utilisateur se fait payer directement ... avec un PayPal, un truc
 * perso". KEEP ne touche jamais l'argent : chaque vendeur colle son propre
 * lien (PayPal.me, Lydia, lien Stripe personnel...), partagé pour la vente
 * de playlists ET la vente de musique originale.
 */
function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}

export async function setMyPayoutLink(url: string): Promise<string> {
  const { data, error } = await client().rpc('keep_set_payout_link', { p_url: url });
  if (error) throw new Error(String(error.message || 'PAYOUT_LINK_SAVE_FAILED'));
  return String(data || '');
}

export async function getPayoutLinkForProfile(profileId: string): Promise<string> {
  if (!supabase || !profileId) return '';
  const { data, error } = await supabase.rpc('keep_payout_link_for_profile', { p_profile_id: profileId });
  if (error) return '';
  return String(data || '');
}
