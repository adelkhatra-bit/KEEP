import type { CanonicalTrack } from '@keep/music';
import type { KeepNotification } from './notificationService';
import { loadMusicAgoraSharedTrack } from './musicAgoraService';
import { checkOwnKeepLibrary } from './connectedMusicLibrary';
import { loadMaskedPlaylistSaleTrackIds } from './playlistSaleService';
import { commitKeep } from './keepTrackAction';

/**
 * Notification « Nouveau morceau chez @x » (NEW_PUBLIC_KEEP).
 *
 * Adel (02/10/2026) : la notification donnait le titre et l'artiste complets
 * → un abonné pouvait écouter puis ajouter le morceau ailleurs sans passer
 * par GARDER. Règle : le titre, l'artiste et la pochette restent MASQUÉS
 * dans la notification ; l'abonné écoute un extrait masqué (15 s, le même
 * que les collections en vente) et GARDE directement depuis la
 * notification. Le titre n'est révélé qu'après l'ajout — ou tout de suite si
 * le morceau est déjà dans sa collection.
 * Le masquage est appliqué à l'affichage quel que soit le contenu de la
 * notification (les anciennes notifications contiennent encore le titre).
 */
export function isNewKeepNotification(notification: Pick<KeepNotification, 'type'> | null | undefined): boolean {
  return String(notification?.type || '').toUpperCase() === 'NEW_PUBLIC_KEEP';
}

function dataString(notification: KeepNotification, ...keys: string[]): string {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function newKeepNotificationTrackId(notification: KeepNotification): string {
  return dataString(notification, 'trackId', 'track_id');
}

export function newKeepNotificationOwner(notification: KeepNotification): { profileId: string; username: string } {
  return {
    profileId: dataString(notification, 'ownerProfileId', 'owner_profile_id'),
    username: dataString(notification, 'username'),
  };
}

export function newKeepNotificationOrigin(notification: KeepNotification): { profileId: string; username: string } {
  const owner = newKeepNotificationOwner(notification);
  return {
    profileId: dataString(notification, 'sourceProfileId', 'source_profile_id') || owner.profileId,
    username: dataString(notification, 'sourceUsername', 'source_username') || owner.username,
  };
}

/** Texte masqué : jamais de titre, d'artiste ni de pochette. */
export function maskedNewKeepCopy(notification: KeepNotification): { title: string; body: string } {
  const { username } = newKeepNotificationOwner(notification);
  return {
    title: username ? `Nouveau morceau chez ${username.replace(/^@+/, '')}` : 'Nouveau morceau',
    body: 'Titre et artiste masqués · écoute le morceau puis ajoute-le gratuitement pour les découvrir.',
  };
}

export function revealedTrackLine(track: Pick<CanonicalTrack, 'title' | 'artist'>): string {
  return [track.title, track.artist].filter(Boolean).join(' — ');
}

export type NewKeepTrackState = { track: CanonicalTrack | null; owned: boolean; saleProtected: boolean };

/** Charge le morceau (pour l'extrait et le GARDER) et dit s'il est déjà dans la collection. */
export async function loadNewKeepTrackState(notification: KeepNotification): Promise<NewKeepTrackState> {
  const trackId = newKeepNotificationTrackId(notification);
  if (!trackId) return { track: null, owned: false, saleProtected: false };
  const track = await loadMusicAgoraSharedTrack(trackId).catch(() => null);
  if (!track) return { track: null, owned: false, saleProtected: false };
  const { profileId } = newKeepNotificationOwner(notification);
  const [existing, maskedIds] = await Promise.all([
    checkOwnKeepLibrary(track).catch(() => null),
    profileId ? loadMaskedPlaylistSaleTrackIds(profileId).catch(() => []) : Promise.resolve([] as string[]),
  ]);
  return {
    track,
    owned: Boolean(existing?.exists),
    saleProtected: maskedIds.includes(track.id),
  };
}

/**
 * Ajout gratuit depuis une notification publique.
 * Le mobile réutilise le chemin canonique keep-music-core ; le serveur
 * reconnaît uniquement une vraie notification NEW_PUBLIC_KEEP du compte,
 * refuse les morceaux protégés par une vente active et conserve l'origine.
 */
export async function keepFromNewKeepNotification(
  notification: KeepNotification,
  track: CanonicalTrack,
  visibility: 'PUBLIC' | 'PRIVATE',
): Promise<{ ok: boolean; alreadyKept: boolean; error?: string }> {
  const origin = newKeepNotificationOrigin(notification);
  try {
    const result = await commitKeep(track, [], undefined, {
      visibility,
      consumeCredit: false,
      context: {
        source: 'follow_notification',
        notificationId: notification.id,
        creditPolicy: 'SOCIAL_ZERO_CREDIT',
        ...(origin.profileId ? { sourceProfileId: origin.profileId } : {}),
      },
    });
    return { ok: true, alreadyKept: result.alreadyKept };
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('SALE_PROTECTED') || message.includes('TRACK_SALE_PROTECTED')) {
      return { ok: false, alreadyKept: false, error: 'Cette musique fait partie d’une Pépite en vente. Ouvre le profil pour continuer.' };
    }
    return { ok: false, alreadyKept: false, error: 'Impossible d’ajouter ce morceau pour le moment.' };
  }
}
