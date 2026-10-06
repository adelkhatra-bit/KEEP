// Poids du chargement du profil (Adel, 06/10/2026 : « j'ai l'impression que c'est lourd ») : mesuré à 111 requêtes serveur en 12 s à l'ouverture du profil
// (ex. 8 pings de disponibilité Battle, 7 lectures GARDER, 4 Loki Pulse en rafale). Les écrans demandent la même chose en même temps.
// `coalesced` : tant qu'une requête identique est EN COURS, tout le monde partage sa réponse (aucun cache : une donnée jamais plus vieille que la requête en vol).
const inFlight = new Map<string, Promise<unknown>>();
export function coalesced<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => { inFlight.delete(key); });
  inFlight.set(key, promise);
  return promise;
}

// Battements de cœur : au plus un envoi par fenêtre, les appels suivants réutilisent le résultat (succès) sans retaper le serveur.
const lastBeat = new Map<string, number>();
export async function throttledBeat(key: string, everyMs: number, run: () => Promise<void>, now: () => number = Date.now): Promise<void> {
  const last = lastBeat.get(key) ?? 0;
  if (now() - last < everyMs) return;
  lastBeat.set(key, now());
  try { await run(); } catch (error) { lastBeat.delete(key); throw error; }
}
export const __resetCoalesceForTests = () => { inFlight.clear(); lastBeat.clear(); };
