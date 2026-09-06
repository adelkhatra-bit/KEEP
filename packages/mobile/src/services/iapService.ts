import { Platform } from 'react-native';
import KeepIAP from 'keep-iap';
import type { KeepIAPProduct } from 'keep-iap';
import { supabase } from './supabaseClient';
import { useUserStore } from '../store/useUserStore';

/**
 * Adel (04/09/2026) : "il faut qu'on branche le paiement" -- le module natif
 * StoreKit 2 (KeepIAP) existait déjà, complet, mais rien dans l'app ne
 * l'appelait : appuyer sur "S'abonner" n'encaissait jamais rien de réel.
 *
 * Ces identifiants de produit sont la référence UNIQUE pour créer les vrais
 * produits dans App Store Connect plus tard (Bundle ID com.adelkhatra.keep,
 * confirmé dans app.json). Ils doivent être créés à l'IDENTIQUE là-bas --
 * un changement ici sans le répercuter dans App Store Connect (ou
 * inversement) casse l'achat silencieusement.
 *
 * Formule annuelle volontairement absente : OffersScreen (planService.
 * loadPlans) n'affiche aujourd'hui que le prix mensuel, donc il n'y a pas
 * encore de choix "annuel" à vendre côté app -- ajouter les produits
 * annuels est un chantier séparé, pas fait ici pour ne pas complexifier un
 * écran qui n'expose pas encore ce choix.
 */
export const IAP_PRODUCT_IDS: Record<string, string> = {
  PREMIUM: 'com.adelkhatra.keep.premium.monthly',
  CREATOR_PRO: 'com.adelkhatra.keep.creatorpro.monthly',
  VENUE_PRO: 'com.adelkhatra.keep.venuepro.monthly',
};

export function iapAvailable(): boolean {
  return Platform.OS === 'ios' && Boolean(KeepIAP?.isAvailable?.());
}

export async function loadIapProducts(): Promise<Record<string, KeepIAPProduct>> {
  if (!iapAvailable() || !KeepIAP) return {};
  const products = await KeepIAP.getProducts(Object.values(IAP_PRODUCT_IDS));
  return Object.fromEntries(products.map((product) => [product.id, product]));
}

export type PurchasePlanResult = { ok: true; planCode: string } | { ok: false; reason: string };

/**
 * Achète réellement une formule via StoreKit, puis fait vérifier la
 * transaction signée par le serveur (keep-iap-verify) avant d'activer quoi
 * que ce soit -- jamais de confiance aveugle dans la réponse du SDK client.
 */
export async function purchasePlan(planCode: string): Promise<PurchasePlanResult> {
  if (!iapAvailable() || !KeepIAP) return { ok: false, reason: 'IAP_UNAVAILABLE' };
  const productId = IAP_PRODUCT_IDS[planCode];
  if (!productId) return { ok: false, reason: 'UNKNOWN_PLAN' };
  const uid = useUserStore.getState().user?.id;
  if (!uid) return { ok: false, reason: 'AUTH_REQUIRED' };

  let transaction;
  try {
    transaction = await KeepIAP.purchase(productId, uid);
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e || 'PURCHASE_FAILED') };
  }
  if (transaction.status === 'CANCELLED') return { ok: false, reason: 'CANCELLED' };
  if (transaction.status === 'PENDING') return { ok: false, reason: 'PENDING' };
  if (transaction.status === 'UNVERIFIED') return { ok: false, reason: 'UNVERIFIED' };
  if (!transaction.jwsRepresentation) return { ok: false, reason: 'NO_TRANSACTION_SIGNATURE' };

  const verified = await verifyAndActivate(transaction.jwsRepresentation);
  if (!verified.ok) return verified;

  if (transaction.transactionId) {
    await KeepIAP.finish(transaction.transactionId).catch(() => {});
  }
  return { ok: true, planCode: verified.planCode };
}

async function verifyAndActivate(jws: string): Promise<PurchasePlanResult> {
  if (!supabase) return { ok: false, reason: 'SUPABASE_UNAVAILABLE' };
  const { data, error } = await supabase.functions.invoke('keep-iap-verify', { body: { jws } });
  if (error) return { ok: false, reason: String(error.message || 'VERIFY_FAILED') };
  if (!data?.ok) return { ok: false, reason: String(data?.error || 'VERIFY_REJECTED') };
  return { ok: true, planCode: String(data.planCode) };
}

/**
 * À appeler après une réinstallation / un nouvel appareil : redemande à
 * Apple les achats déjà payés et les fait revalider un par un côté serveur,
 * sans jamais redemander de paiement.
 */
export async function restorePurchases(): Promise<{ restored: number }> {
  if (!iapAvailable() || !KeepIAP) return { restored: 0 };
  let restored = 0;
  const transactions = await KeepIAP.restorePurchases().catch(() => []);
  for (const transaction of transactions) {
    if (!transaction.jwsRepresentation) continue;
    const result = await verifyAndActivate(transaction.jwsRepresentation);
    if (result.ok) restored += 1;
  }
  return { restored };
}

/**
 * Resynchronise silencieusement les droits actifs au démarrage. Contrairement
 * au bouton « Restaurer », cette opération ne déclenche pas AppStore.sync() et
 * n'affiche donc aucun dialogue Apple : elle propage simplement un renouvellement
 * déjà connu de StoreKit vers la source de vérité Supabase.
 */
export async function syncCurrentEntitlements(): Promise<{ synced: number }> {
  if (!iapAvailable() || !KeepIAP) return { synced: 0 };
  let synced = 0;
  const transactions = await KeepIAP.currentEntitlements().catch(() => []);
  for (const transaction of transactions) {
    if (transaction.status === 'UNVERIFIED' || !transaction.jwsRepresentation) continue;
    const result = await verifyAndActivate(transaction.jwsRepresentation);
    if (result.ok) synced += 1;
  }
  return { synced };
}
