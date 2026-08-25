/**
 * Appels réels backend pour les plans/abonnement (cf. demande explicite du
 * 24/08/2026 -- "transforme les badges décoratifs en vrai système
 * d'abonnement... les prix doivent venir du backend, jamais hardcodés dans
 * plusieurs composants"). Même convention que profileApi.ts (authedFetch,
 * API_URL depuis EXPO_PUBLIC_API_URL).
 */
import { getSupabaseAccessToken } from './supabaseClient';
import { useUserStore } from '../store/useUserStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export interface RemotePlanPrice {
  currency_code: string;
  period: 'MONTHLY' | 'YEARLY';
  amount: number;
  is_active: boolean;
}

export interface RemotePlanEntitlement {
  is_enabled: boolean;
  features: { code: string; name: string; description: string | null };
}

export interface RemotePlan {
  id: string;
  code: 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO';
  name: string;
  description: string | null;
  trial_days: number;
  is_active: boolean;
  plan_prices: RemotePlanPrice[];
  usage_limits: { limit_key: string; limit_value: number | null }[];
  plan_entitlements: RemotePlanEntitlement[];
}

export interface RemoteSubscription {
  status?: string;
  source?: string;
  current_period_end?: string | null;
  plans: { code: RemotePlan['code']; name: string };
  plan_prices?: { amount: number; currency_code: string; period: string };
}

/** Catalogue complet -- public, pas besoin d'être connecté. `null` = hors-ligne/backend injoignable (jamais une erreur bloquante). */
export async function fetchPlans(): Promise<RemotePlan[] | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/api/billing/plans`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data: RemotePlan[] };
    return json.data;
  } catch {
    return null;
  }
}

/** Plan réellement actif de l'utilisateur courant -- `null` = pas de session/hors-ligne (l'appelant doit alors supposer FREE, jamais bloquer l'UI). */
export async function fetchMySubscription(): Promise<RemoteSubscription | null> {
  if (!API_URL) return null;
  const token = await getSupabaseAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/api/billing/me/subscription`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: RemoteSubscription };
    return json.data;
  } catch {
    return null;
  }
}

export interface RecognitionConfig {
  guestSuccessLimit: number;
  signupBonusSuccesses: number;
}

const DEFAULT_RECOGNITION_CONFIG: RecognitionConfig = { guestSuccessLimit: 3, signupBonusSuccesses: 3 };
let cachedRecognitionConfig: RecognitionConfig | null = null;

/**
 * Quota MARKETING (morceaux réellement révélés) -- voir routes/billing.ts
 * `/recognition-config` (valeurs Super Admin, remote_config, migration
 * 0020). Mis en cache en mémoire pour tout le cycle de vie de l'app (valeur
 * qui ne change pas en cours de session) -- repli 3/3 (mêmes défauts que la
 * migration) si le backend est injoignable, ne bloque jamais une session
 * pour un problème réseau.
 */
export type CreditState = 'sync_error' | 'unlimited' | 'available' | 'zero';

export interface CreditStatus {
  state: CreditState;
  /** Restant réel, jamais négatif -- 0 dès que `successCount` atteint `limit`. */
  remaining: number;
  /** Plafond total actuel (invité: guestSuccessLimit seul ; inscrit: guestSuccessLimit + signupBonusSuccesses). */
  limit: number;
  isGuest: boolean;
  guestSuccessLimit: number;
  signupBonusSuccesses: number;
}

/**
 * SEUL endroit qui calcule "combien il reste" -- cf. demande explicite du
 * 24/08/2026 (Adel, test réel : "je ne veux jamais avoir 2 téléchargements
 * restants sur un écran et épuisés sur un autre"). `checkRecognitionCredit`
 * (le GATE, appelé au vrai moment du GARDER) et `fetchCreditStatus` (l'AFFICHAGE,
 * appelé par CreditCounter/ProfileScreen/HomeScreen via useCreditStatus)
 * appellent tous les deux CETTE fonction -- aucune deuxième formule de calcul
 * du restant ne doit jamais exister ailleurs dans le code.
 */
function computeCreditStatus(
  successCount: number,
  isGuest: boolean,
  config: RecognitionConfig,
  isPremiumTier: boolean
): CreditStatus {
  const limit = isGuest ? config.guestSuccessLimit : config.guestSuccessLimit + config.signupBonusSuccesses;
  const remaining = Math.max(0, limit - successCount);
  return {
    state: isPremiumTier ? 'unlimited' : remaining === 0 ? 'zero' : 'available',
    remaining,
    limit,
    isGuest,
    guestSuccessLimit: config.guestSuccessLimit,
    signupBonusSuccesses: config.signupBonusSuccesses,
  };
}

/**
 * Règle produit explicite et définitive du 24/08/2026 : "Détecter/écouter =
 * 0 crédit. Un téléchargement réellement effectué = 1 crédit." -- ce
 * contrôle doit se faire au moment RÉEL du GARDER, jamais avant (jamais à la
 * détection). Centralisé ici pour que les 3 chemins de GARDER réels
 * (useSessionStore.keepTrack, useSessionHistoryStore.keepTrackInSession,
 * addExternalKeep) appliquent EXACTEMENT la même règle -- jamais une
 * quatrième logique de quota divergente. `allowed: true` = le prochain
 * incrementSuccessCount() peut avoir lieu ; c'est l'APPELANT qui l'appelle,
 * seulement après un GARDER réellement réussi.
 */
export async function checkRecognitionCredit(): Promise<{ allowed: boolean; isGuest: boolean }> {
  const userState = useUserStore.getState();
  const isGuest = !userState.user || userState.isAnonymous;
  const [sub, config] = await Promise.all([fetchMySubscription(), fetchRecognitionConfig()]);
  const isPremiumTier = sub?.plans?.code != null && sub.plans.code !== 'FREE';
  const status = computeCreditStatus(userState.successCount, isGuest, config, isPremiumTier);
  return { allowed: status.state !== 'zero', isGuest };
}

/**
 * Version AFFICHAGE de la même règle (voir computeCreditStatus) -- utilisée
 * par useCreditStatus.ts (hook partagé CreditCounter/ProfileScreen/HomeScreen).
 * `null` = hors-ligne, l'appelant garde le dernier état connu plutôt que
 * d'afficher un chiffre inventé.
 */
export async function fetchCreditStatus(): Promise<CreditStatus | null> {
  const userState = useUserStore.getState();
  const isGuest = !userState.user || userState.isAnonymous;
  try {
    const [config, sub] = await Promise.all([fetchRecognitionConfig(), fetchMySubscription()]);
    const isPremiumTier = sub?.plans?.code != null && sub.plans.code !== 'FREE';
    return computeCreditStatus(userState.successCount, isGuest, config, isPremiumTier);
  } catch {
    return null;
  }
}

export async function fetchRecognitionConfig(): Promise<RecognitionConfig> {
  if (cachedRecognitionConfig) return cachedRecognitionConfig;
  if (!API_URL) return DEFAULT_RECOGNITION_CONFIG;
  try {
    const res = await fetch(`${API_URL}/api/billing/recognition-config`);
    if (!res.ok) return DEFAULT_RECOGNITION_CONFIG;
    const json = (await res.json()) as { data: RecognitionConfig };
    cachedRecognitionConfig = json.data;
    return cachedRecognitionConfig;
  } catch {
    return DEFAULT_RECOGNITION_CONFIG;
  }
}

function monthlyPrice(plan: RemotePlan): number {
  return plan.plan_prices.find((p) => p.period === 'MONTHLY' && p.is_active)?.amount ?? 0;
}

export function formatMonthlyPrice(plan: RemotePlan): string {
  const amount = monthlyPrice(plan);
  if (amount === 0) return '0 €';
  return `${amount.toFixed(2).replace('.', ',').replace(',00', '')} €/mois`;
}
