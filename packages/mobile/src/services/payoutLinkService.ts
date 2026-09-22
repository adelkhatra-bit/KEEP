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


export type PayoutProvider = 'PAYPAL' | 'STRIPE' | 'LYDIA' | 'OTHER';

export function detectPayoutProvider(url: string): PayoutProvider {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'paypal.me' || host.endsWith('.paypal.com')) return 'PAYPAL';
    if (host === 'buy.stripe.com' || host === 'checkout.stripe.com' || host.endsWith('.stripe.com')) return 'STRIPE';
    if (host === 'lydia-app.com' || host.endsWith('.lydia-app.com') || host === 'lydia.me') return 'LYDIA';
  } catch {}
  return 'OTHER';
}

export function payoutProviderLabel(url: string): string {
  const provider = detectPayoutProvider(url);
  if (provider === 'PAYPAL') return 'PayPal';
  if (provider === 'STRIPE') return 'Stripe';
  if (provider === 'LYDIA') return 'Lydia';
  return 'Lien de paiement';
}

/**
 * PayPal.Me accepte nativement un montant + devise dans le chemin :
 * paypal.me/pseudo/3EUR. Pour PayPal.Me uniquement, Loki prépare donc le
 * montant exact de l'offre afin que l'acheteur n'ait pas à le ressaisir.
 * Les autres prestataires conservent strictement l'URL fournie par le vendeur.
 */
export function buildPayoutCheckoutUrl(url: string, amountCents: number, currencyCode = 'EUR'): string {
  const clean = url.trim();
  if (detectPayoutProvider(clean) !== 'PAYPAL') return clean;
  try {
    const parsed = new URL(clean);
    if (parsed.hostname.toLowerCase().replace(/^www\./, '') !== 'paypal.me') return clean;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const username = segments[0];
    if (!username) return clean;
    const amount = (Math.max(0, Math.round(amountCents)) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    const currency = String(currencyCode || 'EUR').trim().toUpperCase().replace(/[^A-Z]/g, '') || 'EUR';
    parsed.pathname = `/${username}/${amount}${currency}`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return clean;
  }
}
