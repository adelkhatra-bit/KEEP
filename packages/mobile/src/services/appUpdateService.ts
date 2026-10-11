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
  return String(process.env.EXPO_PUBLIC_BUILD_SHA || process.env.EXPO_PUBLIC_BUILD_ID || '').trim();
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
  // Ne jamais utiliser reload() ici : Chrome peut revalider version.json puis
  // conserver l'ancien index/bundle en cache. C'est exactement le cas où
  // l'utilisateur voit "Nouvelle version" mais retrouve visuellement l'ancien
  // écran après avoir cliqué sur Mettre à jour.
  //
  // On recharge TOUJOURS le vrai fichier racine GitHub Pages avec un nonce
  // unique, puis on restaure la route courante via __keep_route. Le HTML et le
  // bundle hashé sont alors relus depuis la version qui vient d'être déployée.
  const basePath = '/KEEP';
  const { pathname, search, hash } = window.location;
  const route = pathname.replace(new RegExp(`^${basePath}`), '') + search + hash;
  const params = new URLSearchParams();
  params.set('__keep_update', String(Date.now()));
  if (route && route !== '/') params.set('__keep_route', route);
  window.location.replace(`${basePath}/?${params.toString()}`);
}


export type AppUpdateApplyResult = 'RELOADING' | 'CURRENT' | 'UNSUPPORTED' | 'FAILED';

/**
 * Action unique derrière tous les boutons « mettre à jour ».
 *
 * Web : recharge cache-bustée du site officiel.
 * iOS/Android production : demande à EAS Update la dernière OTA compatible,
 * la télécharge si nécessaire puis relance réellement le bundle. Un bouton
 * de mise à jour ne doit jamais être décoratif.
 */
export async function applyLatestAppUpdate(): Promise<AppUpdateApplyResult> {
  if (Platform.OS === 'web') {
    reloadToLatest();
    return 'RELOADING';
  }

  try {
    const Updates = await import('expo-updates');
    if (!Updates.isEnabled) return 'UNSUPPORTED';

    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      const fetched = await Updates.fetchUpdateAsync();
      if ('isNew' in fetched && fetched.isNew === false) {
        // Une update peut déjà être téléchargée localement : reloadAsync()
        // choisit quand même le bundle OTA le plus récent disponible.
      }
    }

    await Updates.reloadAsync();
    return check.isAvailable ? 'RELOADING' : 'CURRENT';
  } catch {
    return 'FAILED';
  }
}
