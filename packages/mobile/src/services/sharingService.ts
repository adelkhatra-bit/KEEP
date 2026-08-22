/**
 * Partage KEEP — un seul point d'entrée pour tous les partages (profil,
 * session, playlist, compare, événement), cf. règle anti-doublon.
 *
 * STATUT HONNÊTE : le lien profond `keep://...` est réel et fonctionne dès
 * qu'un destinataire a déjà KEEP installé. La résolution web publique
 * (pour qu'un destinataire SANS KEEP voie une page avant d'installer,
 * cf. demande explicite du 22/08/2026) dépend de EXPO_PUBLIC_WEB_URL,
 * servie par packages/backend/src/routes/share.ts -- non configurée tant
 * qu'aucun backend n'est déployé (voir docs/PROJECT_STATUS.md). Le partage
 * reste réel et utile sans elle (deep link direct), juste sans aperçu web
 * pour les destinataires sans l'app.
 */
import { Share } from 'react-native';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL;

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

export const isWebShareConfigured = !isPlaceholder(WEB_URL);

function buildLink(path: string): string {
  return isWebShareConfigured ? `${WEB_URL}${path}` : `keep://${path.replace(/^\//, '')}`;
}

export async function shareProfile(username: string): Promise<void> {
  await Share.share({ message: `Découvre mon KEEP 🎵 ${buildLink(`/s/profile/${username}`)}` });
}

export async function shareSession(sessionId: string, title: string, keptCount: number): Promise<void> {
  await Share.share({
    message: `${title} — ${keptCount} morceaux gardés sur KEEP 🎵 ${buildLink(`/s/session/${sessionId}`)}`,
  });
}

export async function sharePlaylist(playlistId: string, playlistName: string): Promise<void> {
  await Share.share({ message: `Ma playlist "${playlistName}" sur KEEP 🎵 ${buildLink(`/s/playlist/${playlistId}`)}` });
}

export async function shareCompareInvite(username: string): Promise<void> {
  await Share.share({ message: `Compare ton KEEP avec le mien 🎧 ${buildLink(`/s/compare/${username}`)}` });
}

export async function shareEvent(eventId: string, eventName: string): Promise<void> {
  await Share.share({ message: `${eventName} — vu sur KEEP 🎉 ${buildLink(`/s/event/${eventId}`)}` });
}
