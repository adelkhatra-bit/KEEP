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
