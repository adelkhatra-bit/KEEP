/**
 * Partage KEEP — le partage est déclenché par l'utilisateur depuis son propre
 * téléphone/ordinateur. KEEP n'envoie aucun e-mail de partage côté serveur.
 * Cela évite de consommer un quota d'e-mails KEEP et sépare strictement :
 * 1) e-mail d'authentification ; 2) partage public du profil.
 */
import { Linking, Share } from 'react-native';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://adelkhatra-bit.github.io/KEEP').replace(/\/$/, '');

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

export const isWebShareConfigured = !isPlaceholder(WEB_URL);

function buildLink(path: string): string {
  return isWebShareConfigured ? `${WEB_URL}${path}` : `keep://${path.replace(/^\//, '')}`;
}

export function buildPublicProfileLink(username: string): string {
  return `${WEB_URL}/share-profile/?u=${encodeURIComponent(username.trim().replace(/^@/, ''))}`;
}

/**
 * Partage natif : WhatsApp, Mail, Messages, AirDrop, etc. L'utilisateur choisit
 * l'application d'envoi. Aucun e-mail n'est expédié par KEEP.
 */
export async function shareProfile(username: string): Promise<void> {
  const link = buildPublicProfileLink(username);
  await Share.share({
    title: 'Mon profil KEEP',
    message: `Découvre mon univers musical sur KEEP 🎵 ${link}`,
    url: link,
  });
}

/**
 * Partage directement via l'application e-mail de l'utilisateur. Le message est
 * simplement prérempli ; l'envoi est effectué par son propre compte e-mail.
 */
export async function shareProfileByEmail(username: string): Promise<void> {
  const cleanUsername = username.trim().replace(/^@/, '');
  const link = buildPublicProfileLink(cleanUsername);
  const subject = encodeURIComponent(`Découvre mon KEEP — @${cleanUsername}`);
  const body = encodeURIComponent(
    `Je partage mon univers musical avec toi sur KEEP.\n\nDécouvre mon KEEP DNA, mes morceaux gardés et les réseaux que j'ai choisi de partager :\n${link}\n\nTes goûts te ressemblent. Partage ton KEEP DNA, fais grandir ta communauté.`,
  );
  await Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
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
