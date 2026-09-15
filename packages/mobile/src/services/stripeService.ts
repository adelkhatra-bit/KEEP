import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

/**
 * Adel (15/09/2026) : "on va utiliser le stripe de insidedombe ... j'ai deja
 * une societe" -- second rail de paiement (abonnements) a cote de Paddle,
 * compte Stripe "Loki" d'Inside Dombe (SIRET francais). Checkout web
 * uniquement pour l'instant, meme restriction que Paddle (paddleService.ts) :
 * l'achat natif iOS/Android reste IAP StoreKit/Play Billing (voir
 * iapService.ts), Apple/Google l'exigent pour un abonnement numerique.
 *
 * Rien ne s'active tant que STRIPE_PUBLISHABLE_KEY/STRIPE_SECRET_KEY ne sont
 * pas renseignes dans Super Admin > Integrations : stripeCheckoutAvailable()
 * reste false et l'appli garde son comportement honnete actuel (pas de faux
 * bouton d'achat), conformement a la regle CLAUDE.md "ne jamais pretendre
 * que le CTA d'achat encaisse tant que le paiement n'est pas reellement
 * cable".
 */

export type StripeCatalogEntry = {
  planCode: string;
  period: 'MONTHLY' | 'YEARLY';
  stripePriceId: string;
  amount: number;
  currencyCode: string;
};

let clientConfigCache: { publishableKey: string | null } | null = null;

async function loadStripeClientConfig() {
  if (clientConfigCache) return clientConfigCache;
  if (!supabase) return { publishableKey: null };
  const { data, error } = await supabase.rpc('keep_stripe_client_config');
  clientConfigCache = error || !data ? { publishableKey: null } : { publishableKey: data.publishableKey ?? null };
  return clientConfigCache;
}

export async function loadStripeCatalog(): Promise<StripeCatalogEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_plan_stripe_catalog');
  if (error || !Array.isArray(data)) return [];
  return data.map((row: any) => ({
    planCode: String(row.plan_code),
    period: row.period === 'YEARLY' ? 'YEARLY' : 'MONTHLY',
    stripePriceId: String(row.stripe_price_id),
    amount: Number(row.amount),
    currencyCode: String(row.currency_code),
  }));
}

/** true seulement si Stripe est reellement configure ET qu'on est sur web -- jamais sur l'app native. */
export async function stripeCheckoutAvailable(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  const config = await loadStripeClientConfig();
  return Boolean(config.publishableKey);
}

export async function openStripeCheckout(planCode: string, period: 'MONTHLY' | 'YEARLY'): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (Platform.OS !== 'web') return { ok: false, reason: 'STRIPE_WEB_ONLY' };
  if (!supabase) return { ok: false, reason: 'STRIPE_NOT_CONFIGURED' };
  try {
    const { data, error } = await supabase.functions.invoke('keep-stripe-checkout', { body: { planCode, period } });
    if (error) return { ok: false, reason: String(error.message || 'CHECKOUT_FAILED') };
    if (!data?.ok || !data?.url) return { ok: false, reason: String(data?.error || 'CHECKOUT_FAILED') };
    window.location.href = data.url;
    return { ok: true };
  } catch {
    return { ok: false, reason: 'CHECKOUT_FAILED' };
  }
}
