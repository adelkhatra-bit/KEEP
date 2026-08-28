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
  if (!result?.action || result.action === Share.sharedAction) await trackShare(eventName, channel);
  return result;
}

export function buildPublicProfileLink(username: string): string {
  return `${WEB_URL}/share-profile/?u=${encodeURIComponent(username.trim().replace(/^@/, ''))}`;
}

export async function shareProfile(username: string): Promise<void> {
  const link = buildPublicProfileLink(username);
  const message = `Mon KEEP raconte ce que j’écoute. Découvre mon univers musical, mes Vibes et mon KEEP DNA 🎧 ${link}`;
  await shareAndTrack({ title: 'Découvre mon KEEP', message }, 'profile_share', Platform.OS === 'web' ? 'web_share' : 'system_share');
}

type TrackShareCopy = {
  cleanUsername: string;
  title: string;
  artist: string;
  link: string;
  subject: string;
  message: string;
};

function buildTrackShareCopy(username: string, title: string, artist: string): TrackShareCopy {
  const cleanUsername = username.trim().replace(/^@/, '');
  const link = buildPublicProfileLink(cleanUsername);
  const currentUsername = useUserStore.getState().user?.username?.trim().replace(/^@/, '');
  const isOwnProfile = Boolean(currentUsername && currentUsername.toLowerCase() === cleanUsername.toLowerCase());
  const owner = isOwnProfile ? 'mon KEEP' : `le KEEP de @${cleanUsername}`;
  const message = `Ce morceau fait partie de ${owner} : « ${title} » — ${artist}. Découvre le reste de cet univers musical 🎵 ${link}`;
  return {
    cleanUsername,
    title,
    artist,
    link,
    subject: `${title} — ${artist} · KEEP`,
    message,
  };
}

async function shareTrackSystem(copy: TrackShareCopy): Promise<void> {
  await shareAndTrack({ title: copy.subject, message: copy.message }, 'profile_share', Platform.OS === 'web' ? 'track_web_share' : 'track_system_share');
}

async function shareTrackEmail(copy: TrackShareCopy): Promise<void> {
  const subject = encodeURIComponent(copy.subject);
  const body = encodeURIComponent(`${copy.message}\n\nKEEP — Tes goûts te ressemblent.`);
  const mailto = `mailto:?subject=${subject}&body=${body}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try { window.location.assign(mailto); }
    catch {
      if (typeof document !== 'undefined') {
        const anchor = document.createElement('a');
        anchor.href = mailto;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else throw new Error('email_handler_unavailable');
    }
    await trackShare('profile_share_email', 'track_mail_client_web');
    return;
  }

  const canOpenEmail = await Linking.canOpenURL(mailto).catch(() => false);
  if (canOpenEmail) {
    await Linking.openURL(mailto);
    await trackShare('profile_share_email', 'track_mail_client_native');
    return;
  }

  const result = await Share.share({ title: copy.subject, message: `${copy.message}\n\nKEEP — Tes goûts te ressemblent.` });
  if (!result?.action || result.action === Share.sharedAction) await trackShare('profile_share_email', 'track_mail_fallback_share');
}

async function copyTrackLink(copy: TrackShareCopy): Promise<void> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(`${copy.title} — ${copy.artist}\n${copy.link}`);
    return;
  }
  await Share.share({ title: copy.subject, message: copy.link });
}

function showWebTrackShareSheet(copy: TrackShareCopy): Promise<void> {
  if (typeof document === 'undefined') return shareTrackSystem(copy);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-keep-track-share', 'true');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', background: 'rgba(5,3,10,.72)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '14px', boxSizing: 'border-box',
      fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    });

    const sheet = document.createElement('div');
    Object.assign(sheet.style, {
      width: 'min(430px,100%)', maxHeight: '86vh', overflowY: 'auto', background: '#151020', color: '#F8F6FC',
      border: '1px solid #493369', borderRadius: '24px', padding: '18px', boxSizing: 'border-box',
      boxShadow: '0 22px 70px rgba(0,0,0,.55)',
    });

    const handle = document.createElement('div');
    Object.assign(handle.style, { width: '42px', height: '4px', borderRadius: '4px', background: '#6E5C80', margin: '0 auto 14px' });

    const heading = document.createElement('div');
    heading.textContent = 'Partager ce morceau KEEP';
    Object.assign(heading.style, { fontSize: '18px', lineHeight: '24px', fontWeight: '900', textAlign: 'center' });

    const track = document.createElement('div');
    track.textContent = `${copy.title} — ${copy.artist}`;
    Object.assign(track.style, { marginTop: '8px', fontSize: '13px', lineHeight: '18px', color: '#D8CDE6', textAlign: 'center', fontWeight: '700' });

    const hint = document.createElement('div');
    hint.textContent = 'Choisis comment le partager. Le bouton principal ouvre les applications disponibles sur ton appareil : Instagram, TikTok, WhatsApp, Messages, etc.';
    Object.assign(hint.style, { marginTop: '8px', fontSize: '11px', lineHeight: '16px', color: '#9F93AD', textAlign: 'center' });

    const link = document.createElement('div');
    link.textContent = copy.link;
    Object.assign(link.style, { marginTop: '13px', padding: '10px', borderRadius: '12px', background: '#0E0A14', border: '1px solid #342641', color: '#B79CFF', fontSize: '10px', lineHeight: '14px', wordBreak: 'break-all' });

    const finish = () => {
      overlay.remove();
      resolve();
    };

    const makeButton = (label: string, primary: boolean, action: () => Promise<void>) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, {
        width: '100%', minHeight: '48px', marginTop: '10px', borderRadius: '16px', cursor: 'pointer',
        border: primary ? '1px solid #A884FA' : '1px solid #493369',
        background: primary ? '#5B3F8C' : '#211A2B', color: '#FFFFFF', fontWeight: '900', fontSize: '12px',
      });
      button.onclick = () => {
        button.disabled = true;
        void action().catch(() => {}).finally(finish);
      };
      return button;
    };

    const shareButton = makeButton('PARTAGER SUR MES APPLICATIONS', true, () => shareTrackSystem(copy));
    const emailButton = makeButton('✉  PARTAGER PAR E-MAIL', false, () => shareTrackEmail(copy));
    const copyButton = makeButton('COPIER LE LIEN DU PROFIL', false, async () => {
      await copyTrackLink(copy);
      if (typeof window !== 'undefined') window.setTimeout(() => {}, 0);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Fermer';
    Object.assign(cancel.style, {
      width: '100%', minHeight: '42px', marginTop: '8px', border: '0', background: 'transparent', color: '#AFA6BD',
      cursor: 'pointer', fontWeight: '800', fontSize: '12px',
    });
    cancel.onclick = finish;
    overlay.onclick = (event) => { if (event.target === overlay) finish(); };

    sheet.append(handle, heading, track, hint, link, shareButton, emailButton, copyButton, cancel);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
  });
}

function showNativeTrackShareSheet(copy: TrackShareCopy): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(
      'Partager ce morceau KEEP',
      `${copy.title} — ${copy.artist}\n\nChoisis comment le partager.`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve() },
        { text: 'E-mail', onPress: () => { void shareTrackEmail(copy).catch(() => {}).finally(() => resolve()); } },
        { text: 'Partager', onPress: () => { void shareTrackSystem(copy).catch(() => {}).finally(() => resolve()); } },
      ],
      { cancelable: true, onDismiss: () => resolve() },
    );
  });
}

export async function shareProfileTrack(username: string, title: string, artist: string): Promise<void> {
  const copy = buildTrackShareCopy(username, title, artist);
  if (Platform.OS === 'web') {
    await showWebTrackShareSheet(copy);
    return;
  }
  await showNativeTrackShareSheet(copy);
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

  const subjectText = `Découvre mon univers musical KEEP — @${cleanUsername}`;
  const bodyText = `Mon KEEP raconte ce que j’écoute.\n\n${identity}${bio}${genres}\nEntre dans mon univers : découvre mon KEEP DNA, mes Vibes, mes morceaux gardés et les réseaux que j’ai choisi de partager.\n\n${link}\n\nUn scan, un clic, et tu sais déjà un peu mieux qui je suis.\n\nKEEP — Tes goûts te ressemblent.`;
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
  const message = `J’ai capté ${keptCount} morceau${keptCount > 1 ? 'x' : ''} avec KEEP dans « ${title} ». Découvre la session et entre dans mon univers musical 🎧 ${buildLink(`/s/session/${sessionId}`)}`;
  await Share.share({ title: `${title} · KEEP`, message });
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

  const message = `Cette Vibe me ressemble : « ${playlistName} ». Swipe-la sur KEEP et dis-moi ce que tu aurais gardé 🎵 ${buildLink(`/s/playlist/${playlistId}`)}`;
  await shareAndTrack({ title: `${playlistName} · KEEP`, message }, 'playlist_share', Platform.OS === 'web' ? 'web_share' : 'system_share');
}

export async function shareCompareInvite(username: string): Promise<void> {
  await shareAndTrack({ message: `On écoute vraiment la même chose ? Compare ton KEEP DNA avec le mien 🎧 ${buildLink(`/s/compare/${username}`)}` }, 'compare_share', Platform.OS === 'web' ? 'web_share' : 'system_share');
}

export async function shareEvent(eventId: string, eventName: string): Promise<void> {
  await shareAndTrack({ message: `Tu viens ? « ${eventName} » est sur KEEP. Découvre l’ambiance et rejoins-nous 🎉 ${buildLink(`/s/event/${eventId}`)}` }, 'event_share', Platform.OS === 'web' ? 'web_share' : 'system_share');
}
