import { createNavigationContainerRef } from '@react-navigation/native';

// Adel (02/09/2026) : "il pourra recevoir des invite dans n'importe quelle
// page" -- accepter un Battle depuis le bandeau global (GlobalNotificationBanner,
// monté hors de <Navigation/>) doit pouvoir ouvrir l'écran Battle même si
// l'utilisateur est ailleurs dans l'app (pas de prop `navigation` disponible
// à cet endroit).
export const navigationRef = createNavigationContainerRef();

export function navigateToBattleArena(arenaId: string) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as any)('Main', { screen: 'Parties', params: { arenaId, openBattle: true } });
}

// Adel (08/09/2026) : "quand [quelqu'un] partage un lien il peut Swiper les
// musiques" -- un lien de partage ouvert dans un navigateur retombe sur
// `?u=<pseudo>&share=<kind>` (voir share-profile.html) une fois que le
// fallback web "OUVRIR DANS Loki" a pris le relais du schéma natif `keep://`.
// React Navigation ne mappe que le PATH `profile/:username`, jamais cette
// query string sur la racine -- sans ce pont, l'invité atterrissait sur
// l'écran d'accueil générique au lieu du profil qu'on lui avait envoyé (donc
// jamais sur le deck swipeable de PublicUserProfileScreen). Le navigateur
// n'étant prêt qu'au boot, on retente brièvement plutôt que d'abandonner au
// premier essai.
export function navigateToSharedProfile(username: string, attempt = 0) {
  const clean = username.trim().replace(/^@+/, '');
  if (!clean) return;
  if (!navigationRef.isReady()) {
    if (attempt >= 20) return;
    setTimeout(() => navigateToSharedProfile(clean, attempt + 1), 150);
    return;
  }
  (navigationRef.navigate as any)('PublicProfile', { username: clean });
}
