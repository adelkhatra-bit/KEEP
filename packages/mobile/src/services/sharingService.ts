/**
 * Partage KEEP — le partage est déclenché par l'utilisateur depuis son propre
 * téléphone/ordinateur. KEEP n'envoie aucun e-mail de partage côté serveur.
 * Cela évite de consommer un quota d'e-mails KEEP et sépare strictement :
 * 1) e-mail d'authentification ; 2) partage public du profil.
 */
import { Alert, Linking, Platform, Share } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { loadCurrentPlanCode } from './planService';
import { hasFeature } from './entitlementService';

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

export async function shareProfile(username: string): Promise<void> {
  const link = buildPublicProfileLink(username);
  const message = `Découvre mon univers musical sur KEEP 🎵 ${link}`;

  // Un seul champ `message` sur toutes les plateformes. Certaines apps iOS
  // (WhatsApp notamment) dupliquent l'URL lorsque React Native reçoit à la fois
  // `message` et `url`. KEEP partage donc toujours exactement UNE URL canonique.
  await Share.share({ title: 'Mon profil KEEP', message });
}

/**
 * Partage un morceau sans héberger ni recopier l'audio : le destinataire arrive
 * sur le profil public qui porte ce KEEP. Le lien reste donc stable même si le
 * catalogue musical change de fournisseur.
 */
export async function shareProfileTrack(username: string, title: string, artist: string): Promise<void> {
  const link = buildPublicProfileLink(username);
  const message = `Découvre « ${title} » — ${artist} dans mon univers KEEP 🎵 ${link}`;
  await Share.share({ title: `${title} sur KEEP`, message });
}

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

  const subjectText = `Découvre mon univers KEEP — @${cleanUsername}`;
  const bodyText = `Je partage mon profil KEEP avec toi.\n\n${identity}${bio}${genres}\nDécouvre mon KEEP DNA, mes morceaux gardés et les réseaux que j’ai choisi de rendre publics :\n\n${link}\n\nOuvre simplement le lien ci-dessus pour accéder directement à mon profil public KEEP.\n\nTes goûts te ressemblent. Partage ton KEEP DNA, fais grandir ta communauté.`;
  const subject = encodeURIComponent(subjectText);
  const body = encodeURIComponent(bodyText);
  const mailto = `mailto:?subject=${subject}&body=${body}`;

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

  // Sur iOS/Android, ne laisse jamais l'utilisateur sur une action morte :
  // si aucun gestionnaire mail n'est installé/configuré, on retombe sur la
  // feuille de partage système avec le même contenu et la même URL canonique.
  const canOpenEmail = await Linking.canOpenURL(mailto).catch(() => false);
  if (canOpenEmail) {
    await Linking.openURL(mailto);
    return;
  }

  await Share.share({ title: subjectText, message: bodyText });
}

export async function shareSession(sessionId: string, title: string, keptCount: number): Promise<void> {
  await Share.share({ message: `${title} — ${keptCount} morceaux gardés sur KEEP 🎵 ${buildLink(`/s/session/${sessionId}`)}` });
}

export async function sharePlaylist(playlistId: string, playlistName: string): Promise<void> {
  const state = useUserStore.getState();
  if (!state.user || state.isLocalGuest || state.isDemoMode) {
    Alert.alert('Compte KEEP requis', 'Crée ton compte KEEP pour débloquer le partage. Tes musiques restent disponibles en mode gratuit.');
    return;
  }

  const planCode = await loadCurrentPlanCode(state.user.id).catch(() => 'FREE');
  if (!hasFeature(planCode, 'PUBLIC_PLAYLISTS')) {
    Alert.alert('Premium requis', 'Le partage de playlists est inclus à partir de KEEP Premium (2,99 €/mois). Tu peux arrêter à tout moment.');
    return;
  }

  await Share.share({ message: `Ma playlist "${playlistName}" sur KEEP 🎵 ${buildLink(`/s/playlist/${playlistId}`)}` });
}

export async function shareCompareInvite(username: string): Promise<void> {
  await Share.share({ message: `Compare ton KEEP avec le mien 🎧 ${buildLink(`/s/compare/${username}`)}` });
}

export async function shareEvent(eventId: string, eventName: string): Promise<void> {
  await Share.share({ message: `${eventName} — vu sur KEEP 🎉 ${buildLink(`/s/event/${eventId}`)}` });
}
