import { Platform } from 'react-native';

/**
 * Adel (02/09/2026) : "comme une application normale ... popup pour qu'il
 * puisse faire sa mise à jour, toujours avoir la possibilité de dire je la
 * ferai plus tard" -- KEEP est un site statique (GitHub Pages), pas une app
 * distribuée par un store : "mettre à jour" veut juste dire recharger la
 * page pour récupérer le nouveau bundle déjà déployé. `version.json` est
 * écrit par le workflow de déploiement (web-preview-pages.yml) avec le
 * commit exact déployé ; EXPO_PUBLIC_BUILD_SHA est injecté dans CE bundle au
 * même moment, avec le même commit -- comparer les deux dit avec certitude
 * si l'onglet ouvert tourne sur une version plus vieille que ce qui est en
 * ligne, sans jamais deviner.
 */
export function getCurrentBuildSha(): string {
  return String(process.env.EXPO_PUBLIC_BUILD_SHA || '').trim();
}

export async function fetchLatestBuildSha(): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(`/KEEP/version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const sha = String(data?.sha || '').trim();
    return sha || null;
  } catch {
    return null;
  }
}

export function reloadToLatest(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.location.reload();
}
