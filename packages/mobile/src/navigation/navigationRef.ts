import { confirmLeaveGame } from '../services/gameExitGuard';
import { createNavigationContainerRef } from '@react-navigation/native';

// Adel (02/09/2026) : "il pourra recevoir des invite dans n'importe quelle
// page" -- accepter un Battle depuis le bandeau global (GlobalNotificationBanner,
// monté hors de <Navigation/>) doit pouvoir ouvrir l'écran Battle même si
// l'utilisateur est ailleurs dans l'app (pas de prop `navigation` disponible
// à cet endroit).
export const navigationRef = createNavigationContainerRef();

// Adel (29/09/2026) : toute navigation déclenchée hors des écrans
// (notification, push, lien partagé) pendant un Solo en cours passe par la
// garde unique : popup « Quitter la partie ? » (partie déjà comptée).
function guardedNavigate(...args: any[]) {
  confirmLeaveGame(() => (navigationRef.navigate as any)(...args));
}

export function navigateToBattleArena(arenaId: string) {
  if (!navigationRef.isReady()) return;
  guardedNavigate('Main', { screen: 'Parties', params: { arenaId, openBattle: true } });
}

export function navigateToEvent(eventId: string) {
  if (!eventId || !navigationRef.isReady()) return;
  guardedNavigate('Main', { screen: 'Parties', params: { openEventId: eventId, source: 'EVENT_BANNER' } });
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
  guardedNavigate('PublicProfile', { username: clean });
}


export function navigateFromNotificationData(data: Record<string, unknown> | null | undefined, attempt = 0) {
  const payload = data || {};
  if (!navigationRef.isReady()) {
    if (attempt >= 20) return;
    setTimeout(() => navigateFromNotificationData(payload, attempt + 1), 150);
    return;
  }
  const arenaId = String(payload.arenaId ?? payload.arena_id ?? '').trim();
  if (arenaId) {
    guardedNavigate('Main', { screen: 'Parties', params: { arenaId, openBattle: true } });
    return;
  }
  const eventId = String(payload.eventId ?? payload.event_id ?? '').trim();
  if (eventId) {
    guardedNavigate('Main', { screen: 'Parties', params: { openEventId: eventId, source: 'NOTIFICATION' } });
    return;
  }
  const username = String(payload.username ?? payload.profileUsername ?? payload.creator_username ?? '').trim().replace(/^@+/, '');
  if (username) {
    guardedNavigate('PublicProfile', { username });
    return;
  }
  const offerId = String(payload.offerId ?? payload.offer_id ?? '').trim();
  if (offerId) {
    guardedNavigate('Main', { screen: 'MyMusic', params: { manageSaleOfferId: offerId } });
    return;
  }
  const entryId = String(payload.entryId ?? payload.entry_id ?? '').trim();
  if (entryId) {
    guardedNavigate('Main', { screen: 'Listen', params: { entryId } });
    return;
  }
  guardedNavigate('Notifications');
}
