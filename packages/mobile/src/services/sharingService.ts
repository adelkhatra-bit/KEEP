/**
 * Partage KEEP — le partage est déclenché par l'utilisateur depuis son propre
 * téléphone/ordinateur. Les récompenses communautaires ne comptent que les
 * actions de partage réellement validées par la feuille système quand la
 * plateforme expose cette information. Le serveur applique en plus un plafond
 * quotidien pour empêcher qu'un spam de partages fabrique des récompenses.
 */
import { Alert, Linking, Platform, Share } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { loadCurrentPlanCode } from './planService';
import { hasFeature } from './entitlementService';
import { supabase } from './supabaseClient';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://adelkhatra-bit.github.io/KEEP').replace(/\/$/, '');

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

export const isWebShareConfigured = !isPlaceholder(WEB_URL);

function buildLink(path: string): string {
  return isWebShareConfigured ? `${WEB_URL}${path}` : `keep://${path.replace(/^\//, '')}`;
}

async function trackShare(eventName: 'profile_share' | 'profile_share_email' | 'playlist_share' | 'compare_share' | 'event_share', channel: string) {
  if (!supabase) return;
  try { await supabase.rpc('track_keep_event', { p_event_name: eventName, p_channel: channel, p_metadata: {} }); }
  catch { /* une statistique ne bloque jamais le partage */ }
}

async function shareAndTrack(
  payload: Parameters<typeof Share.share>[0],
  eventName: 'profile_share' | 'playlist_share' | 'compare_share' | 'event_share',
  channel: string,
) {
  const result = await Share.share(payload);
  // iOS distingue explicitement Partagé / Annulé. Sur Android et certaines
  // implémentations web, React Native renvoie sharedAction après ouverture.
  if (!result?.action || result.action === Share.sharedAction) await trackShare(eventName, channel);
  return result;
}

export function buildPublicProfileLink(username: string): string {
  return `${WEB_URL}/share-profile/?u=${encodeURIComponent(username.trim().replace(/^@/, ''))}`;
}

export async function shareProfile(username: string): Promise<void> {
  const link = buildPublicProfileLink(username);
  const message = `Découvre mon univers musical sur KEEP 🎵 ${link}`;
  await shareAndTrack({ title: 'Mon profil KEEP', message }, 'profile_share', Platform.OS === 'web' ? 'web_share' : 'system_share');
}

export async function shareProfileTrack(username: string, title: string, artist: string): Promise<void> {
  const link = buildPublicProfileLink(username);
  const message = `Découvre « ${title} » — ${artist} dans mon univers KEEP 🎵 ${link}`;
  await shareAndTrack({ title: `${title} sur KEEP`, message }, 'profile_share', 'track_share');
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
  const genres = sameProfile?.favoriteGenres?.length ? `\nMes styles : ${sameProfile.favoriteGenres.slice(0, 5).join(' · ')}\n` : '';

  const subjectText = `Découvre mon univers KEEP — @${cleanUsername}`;
  const bodyText = `Je partage mon profil KEEP avec toi.\n\n${identity}${bio}${genres}\nDécouvre mon KEEP DNA, mes morceaux gardés et les réseaux que j’ai choisi de rendre publics :\n\n${link}\n\nOuvre simplement le lien ci-dessus pour accéder directement à mon profil public KEEP.\n\nTes goûts te ressemblent. Partage ton KEEP DNA, fais grandir ta communauté.`;
  const subject = encodeURIComponent(subjectText);
  const body = encodeURIComponent(bodyText);
  const mailto = `mailto:?subject=${subject}&body=${body}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try { window.location.assign(mailto); }
    catch {
      if (typeof document !== 'undefined') {
        const anchor = document.createElement('a'); anchor.href = mailto; anchor.style.display = 'none'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      } else throw new Error('email_handler_unavailable');
    }
    await trackShare('profile_share_email', 'mail_client_web');
    return;
  }

  const canOpenEmail = await Linking.canOpenURL(mailto).catch(() => false);
  if (canOpenEmail) {
    await Linking.openURL(mailto);
    await trackShare('profile_share_email', 'mail_client_native');
    return;
  }

  const result = await Share.share({ title: subjectText, message: bodyText });
  if (!result?.action || result.action === Share.sharedAction) await trackShare('profile_share_email', 'mail_fallback_share');
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
    Alert.alert('Premium requis', 'Le partage de Vibes publiques est inclus à partir de KEEP Premium (2,99 €/mois).');
    return;
  }

  await shareAndTrack({ message: `Ma Vibe "${playlistName}" sur KEEP 🎵 ${buildLink(`/s/playlist/${playlistId}`)}` }, 'playlist_share', Platform.OS === 'web' ? 'web_share' : 'system_share');
}

export async function shareCompareInvite(username: string): Promise<void> {
  await shareAndTrack({ message: `Compare ton KEEP avec le mien 🎧 ${buildLink(`/s/compare/${username}`)}` }, 'compare_share', Platform.OS === 'web' ? 'web_share' : 'system_share');
}

export async function shareEvent(eventId: string, eventName: string): Promise<void> {
  await shareAndTrack({ message: `${eventName} — vu sur KEEP 🎉 ${buildLink(`/s/event/${eventId}`)}` }, 'event_share', Platform.OS === 'web' ? 'web_share' : 'system_share');
}
