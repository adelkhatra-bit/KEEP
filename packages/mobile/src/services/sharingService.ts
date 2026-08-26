/**
 * Partage KEEP — le partage est déclenché par l'utilisateur depuis son propre
 * téléphone/ordinateur. KEEP n'envoie aucun e-mail de partage côté serveur.
 * Cela évite de consommer un quota d'e-mails KEEP et sépare strictement :
 * 1) e-mail d'authentification ; 2) partage public du profil.
 */
import { Linking, Platform, Share } from 'react-native';
import { useUserStore } from '../store/useUserStore';

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
  const message = 'Découvre mon univers musical sur KEEP 🎵';

  // iOS concatène souvent `message` et `url` dans la feuille de partage.
  // Le lien ne doit donc jamais être présent dans les deux champs, sinon il
  // apparaît deux fois dans WhatsApp/Messages/Mail.
  if (Platform.OS === 'ios') {
    await Share.share({
      title: 'Mon profil KEEP',
      message,
      url: link,
    });
    return;
  }

  // Android et le web sont plus fiables avec un message autonome contenant
  // directement l'URL, sans renseigner simultanément `url`.
  await Share.share({
    title: 'Mon profil KEEP',
    message: `${message} ${link}`,
  });
}

/**
 * Partage directement via la boîte e-mail de l'utilisateur. KEEP ouvre un
 * brouillon local prérempli mais ne connaît pas les destinataires et n'expédie
 * rien via Brevo/Supabase. Le lien HTTPS reste écrit en clair pour être reconnu
 * comme cliquable par Mail, Gmail, Outlook et les webmails.
 */
export async function shareProfileByEmail(username: string): Promise<void> {
  const cleanUsername = username.trim().replace(/^@/, '');
  const link = buildPublicProfileLink(cleanUsername);
  const current = useUserStore.getState().user;
  const sameProfile = current?.username?.trim().replace(/^@/, '') === cleanUsername ? current : null;

  const identity = sameProfile
    ? [sameProfile.username ? `@${cleanUsername}` : '', sameProfile.city, sameProfile.countryCode].filter(Boolean).join(' · ')
    : `@${cleanUsername}`;
  const bio = sameProfile?.bio?.trim() ? `\n${sameProfile.bio.trim()}\n` : '';
  const genres = sameProfile?.favoriteGenres?.length
    ? `\nMes styles : ${sameProfile.favoriteGenres.slice(0, 5).join(' · ')}\n`
    : '';

  const subject = encodeURIComponent(`Découvre mon univers KEEP — @${cleanUsername}`);
  const body = encodeURIComponent(
    `Je partage mon profil KEEP avec toi.\n\n${identity}${bio}${genres}\nDécouvre mon KEEP DNA, mes morceaux gardés et les réseaux que j’ai choisi de rendre publics :\n\n${link}\n\nOuvre simplement le lien ci-dessus pour accéder directement à mon profil public KEEP.\n\nTes goûts te ressemblent. Partage ton KEEP DNA, fais grandir ta communauté.`,
  );
  const mailto = `mailto:?subject=${subject}&body=${body}`;

  // Sur une PWA / Expo Web mobile, `Linking.openURL(mailto:)` peut résoudre la
  // promesse sans réellement lancer Mail. Une navigation `mailto:` exécutée
  // directement pendant le geste utilisateur est la voie la plus fiable sur
  // Safari iOS, Chrome Android et les navigateurs desktop avec handler e-mail.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.location.assign(mailto);
    } catch {
      if (typeof document !== 'undefined') {
        const anchor = document.createElement('a');
        anchor.href = mailto;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else {
        throw new Error('email_handler_unavailable');
      }
    }
    return;
  }

  try {
    await Linking.openURL(mailto);
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.location.href = mailto;
      return;
    }
    throw error;
  }
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
