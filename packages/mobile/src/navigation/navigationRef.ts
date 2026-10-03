import { confirmLeaveGame } from '../services/gameExitGuard';
import { createNavigationContainerRef } from '@react-navigation/native';
import { useGlobalChatStore } from '../store/useGlobalChatStore';

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

export function navigateToBattleRanking() {
  if (!navigationRef.isReady()) return;
  guardedNavigate('Main', { screen: 'Parties', params: { openBattle: true, openBattleRanking: true, source: 'NOTIFICATION_RANK' } });
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
  const type = String(payload.notificationType ?? payload.type ?? payload.event ?? payload.kind ?? '').trim().toUpperCase();
  const notificationId = String(payload.notificationId ?? payload.notification_id ?? '').trim();

  if (type === 'PROFILE_VIEW') {
    const visitorUsername = String(payload.viewerUsername ?? payload.viewer_username ?? payload.username ?? '').trim().replace(/^@+/, '');
    if (visitorUsername) {
      guardedNavigate('PublicProfile', { username: visitorUsername });
      return;
    }
  }

  if (type.startsWith('AGORA_') || type.startsWith('CHAT_')) {
    const groupId = String(payload.groupId ?? payload.group_id ?? '').trim();
    const groupName = String(payload.groupName ?? payload.group_name ?? '').trim();
    const senderId = String(payload.senderId ?? payload.sender_id ?? payload.actorId ?? payload.actor_id ?? '').trim();
    const senderUsername = String(payload.senderUsername ?? payload.sender_username ?? payload.actorUsername ?? payload.actor_username ?? '').trim().replace(/^@+/, '');
    const messageRaw = payload.messageId ?? payload.message_id;
    const messageId = typeof messageRaw === 'number' ? messageRaw : Number(String(messageRaw || '')) || null;
    if (type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE') {
      useGlobalChatStore.getState().openSettings();
    } else {
      useGlobalChatStore.getState().open({
        groupId: groupId || null,
        groupName: groupName || null,
        targetProfileId: groupId ? null : (senderId || null),
        targetUsername: groupId ? null : (senderUsername || null),
        messageId,
      });
    }
    return;
  }

  if (type === 'SOLO_RANK_UP' || type === 'BATTLE_SOLO_RANK_CHANGED') {
    guardedNavigate('Main', { screen: 'Parties', params: { openBattle: true, openBattleRanking: true, source: 'NOTIFICATION_RANK' } });
    return;
  }

  if (type === 'NEW_PUBLIC_KEEP' || type.startsWith('PLAYLIST_SALE_PAYMENT') || type === 'PLAYLIST_SALE_BUYER_PAID' || type === 'PLAYLIST_SALE_WAITING_SELLER') {
    guardedNavigate('Notifications', notificationId ? { focusNotificationId: notificationId } : undefined);
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
