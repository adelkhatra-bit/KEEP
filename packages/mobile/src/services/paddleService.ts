import { Platform } from 'react-native';
import { supabase } from './supabaseClient';
import { useUserStore } from '../store/useUserStore';

/**
 * Adel (08/09/2026) : "je vis a Dubai, j'ai pas de societe ... j'ai juste a
 * mettre connecter ensuite ca me dirige direct sur le mode de paiement et
 * j'ai juste a payer" -- Paddle est un "merchant of record" (Paddle est le
 * vendeur legal partout dans le monde, gere la TVA a notre place, accepte un
 * particulier sans societe enregistree). Checkout web uniquement pour
 * l'instant (Paddle.js ne tourne pas dans un WebView natif iOS/Android --
 * l'achat natif reste IAP StoreKit/Play Billing, voir iapService.ts).
 *
 * Rien ne s'active tant que PADDLE_SELLER_ID/PADDLE_CLIENT_TOKEN ne sont pas
 * renseignes dans Super Admin > Integrations : paddleAvailable() reste false
 * et l'appli garde son comportement honnete actuel (pas de faux bouton
 * d'achat), conformement a la regle CLAUDE.md "ne jamais pretendre que le
 * CTA d'achat encaisse tant que le paiement n'est pas reellement cable".
 */

declare global {
  interface Window {
    Paddle?: {
      Initialize: (options: { token: string; pwCustomer?: Record<string, unknown> }) => void;
      Checkout: {
        open: (options: {
          items: { priceId: string; quantity: number }[];
          customer?: { email?: string };
          customData?: Record<string, unknown>;
          settings?: { successUrl?: string };
        }) => void;
      };
    };
  }
}

export type PaddleCatalogEntry = {
  planCode: string;
  period: 'MONTHLY' | 'YEARLY';
  paddlePriceId: string;
  amount: number;
  currencyCode: string;
};

let scriptLoadPromise: Promise<void> | null = null;

function loadPaddleScript(): Promise<void> {
  if (Platform.OS !== 'web') return Promise.reject(new Error('PADDLE_WEB_ONLY'));
  if (typeof window !== 'undefined' && window.Paddle) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('PADDLE_SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

let clientConfigCache: { sellerId: string | null; clientToken: string | null } | null = null;

async function loadPaddleClientConfig() {
  if (clientConfigCache) return clientConfigCache;
  if (!supabase) return { sellerId: null, clientToken: null };
  const { data, error } = await supabase.rpc('keep_paddle_client_config');
  clientConfigCache = error || !data ? { sellerId: null, clientToken: null } : { sellerId: data.sellerId ?? null, clientToken: data.clientToken ?? null };
  return clientConfigCache;
}

export async function loadPaddleCatalog(): Promise<PaddleCatalogEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_plan_paddle_catalog');
  if (error || !Array.isArray(data)) return [];
  return data.map((row: any) => ({
    planCode: String(row.plan_code),
    period: row.period === 'YEARLY' ? 'YEARLY' : 'MONTHLY',
    paddlePriceId: String(row.paddle_price_id),
    amount: Number(row.amount),
    currencyCode: String(row.currency_code),
  }));
}

/** true seulement si Paddle est reellement configure ET qu'on est sur web -- jamais sur l'app native (App/Play Store exigent leur propre IAP pour un abonnement numerique). */
export async function paddleCheckoutAvailable(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  const config = await loadPaddleClientConfig();
  return Boolean(config.sellerId && config.clientToken);
}

async function ensurePaddleInitialized(): Promise<boolean> {
  const config = await loadPaddleClientConfig();
  if (!config.sellerId || !config.clientToken) return false;
  await loadPaddleScript();
  if (!window.Paddle) return false;
  window.Paddle.Initialize({ token: config.clientToken });
  return true;
}

export async function openPaddleCheckout(paddlePriceId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const ready = await ensurePaddleInitialized();
    if (!ready || !window.Paddle) return { ok: false, reason: 'PADDLE_NOT_CONFIGURED' };
    const profileId = useUserStore.getState().user?.id;
    if (!profileId) return { ok: false, reason: 'ACCOUNT_REQUIRED' };
    window.Paddle.Checkout.open({
      items: [{ priceId: paddlePriceId, quantity: 1 }],
      // Adel (07/09/2026, garde deja etablie ailleurs) : la couleur/l'etat
      // d'un compte doit toujours se recalculer depuis la source de verite
      // reelle -- ici, keep-paddle-webhook lit ce profileId pour savoir QUI
      // vient de payer, jamais un id devine ou mis en cache cote client.
      customData: { profileId },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'CHECKOUT_FAILED' };
  }
}
