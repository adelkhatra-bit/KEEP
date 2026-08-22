/**
 * Utilitaire de retry générique -- zéro import React Native/Expo
 * volontairement, pour rester exécutable et testable directement avec
 * `tsx` (voir scripts/verify-retry.ts), même convention que
 * services/appleMusicAuthHtml.ts côté packages/music.
 */
const RETRY_DELAYS_MS = [500, 1500, 4000];

/**
 * Retente `fn` après un échec (coupure réseau ponctuelle, timeout) avant
 * d'abandonner -- ne masque jamais une vraie erreur fonctionnelle, relance
 * l'erreur réelle de la dernière tentative une fois les retries épuisés.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastError;
}
