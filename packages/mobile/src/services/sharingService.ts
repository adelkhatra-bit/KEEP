/**
 * Partage Loki — source unique pour TOUS les liens et messages partagés.
 *
 * Règle produit : aucune fonctionnalité ne construit son URL sociale dans son
 * coin. Tous les profils, morceaux, Vibes, sessions, comparaisons et événements
 * passent par le même landing public `/share-profile/`, déjà publié et testé en
 * HTTP 200 sur GitHub Pages. Cela évite les anciennes routes `/s/...` qui
 * n'existaient pas sur le site public et pouvaient produire un 404/400 dans
 * WhatsApp, Messages ou un navigateur externe.
 */
import { Linking, NativeModules, Platform, Share } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import { loadCurrentPlanCode } from './planService';
import { hasFeature } from './entitlementService';
import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://adelkhatra-bit.github.io/KEEP').replace(/\/$/, '');
export const KEEP_SHARE_SLOGAN = `${APP_NAME} — Tes goûts te ressemblent.`;

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

export const isWebShareConfigured = !isPlaceholder(WEB_URL);

type ShareKind = 'profile' | 'track' | 'vibe' | 'session' | 'compare' | 'event';
type ShareEvent = 'profile_share' | 'profile_share_email' | 'playlist_share' | 'compare_share' | 'event_share';

type ShareCopy = {
  kind: ShareKind;
  heading: string;
  subject: string;
  message: string;
  emailBody: string;
  link: string;
  eventName: ShareEvent;
  channel: string;
  ownProfile?: boolean;
};

function cleanUsername(value?: string | null): string {
  return String(value || '').trim().replace(/^@+/, '');
}

function currentUsername(): string {
  return cleanUsername(useUserStore.getState().user?.username);
}

/**
 * Landing public unique. Les paramètres sont uniquement descriptifs et sont
 * encodés un par un afin qu'un titre contenant &, #, ?, accents ou emoji ne
 * puisse jamais casser l'URL copiée/collée.
 */
function buildShareLanding(params: Record<string, string | number | null | undefined>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  const query = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
  return `${WEB_URL}/share-profile/${query ? `?${query}` : ''}`;
}

export function buildPublicProfileLink(username: string): string {
  return buildShareLanding({ u: cleanUsername(username), share: 'profile' });
}

export function buildPublicTrackLink(username: string, title: string, artist: string): string {
  return buildShareLanding({
    u: cleanUsername(username),
    share: 'track',
    title: title.trim(),
    artist: artist.trim(),
  });
}

async function trackShare(eventName: ShareEvent, channel: string) {
  if (!supabase) return;
  try {
    await supabase.rpc('track_keep_event', {
      p_event_name: eventName,
      p_channel: channel,
      p_metadata: { source: 'unified_keep_share' },
    });
  } catch {
    // Les statistiques ne bloquent jamais le partage utilisateur.
  }
}

async function shareSystem(copy: ShareCopy): Promise<void> {
  const result = await Share.share({ title: copy.subject, message: copy.message });
  if (!result?.action || result.action === Share.sharedAction) {
    await trackShare(copy.eventName, `${copy.channel}_${Platform.OS === 'web' ? 'web' : 'native'}`);
  }
}

async function shareEmail(copy: ShareCopy): Promise<void> {
  const mailto = `mailto:?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(copy.emailBody)}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try { window.location.assign(mailto); }
    catch {
      if (typeof document === 'undefined') throw new Error('email_handler_unavailable');
      const anchor = document.createElement('a');
      anchor.href = mailto;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    await trackShare('profile_share_email', `${copy.channel}_email_web`);
    return;
  }

  const canOpen = await Linking.canOpenURL(mailto).catch(() => false);
  if (canOpen) {
    await Linking.openURL(mailto);
    await trackShare('profile_share_email', `${copy.channel}_email_native`);
    return;
  }

  await shareSystem(copy);
}

/**
 * « Copier le lien » copie volontairement le message complet Loki : contexte,
 * nom du profil ou du morceau, slogan et URL HTTPS. C'est ce texte qui doit
 * arriver dans WhatsApp quand l'utilisateur fait Coller.
 */
async function copyShareText(copy: ShareCopy): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copy.message);
      return true;
    }
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = copy.message;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand?.('copy') ?? false;
      textarea.remove();
      if (copied) return true;
    }
  }

  // Certains builds React Native exposent encore le module natif Clipboard.
  // On l'utilise sans ajouter de dépendance native ; sinon la feuille système
  // reste le fallback sécurisé et propose elle-même « Copier ».
  const nativeClipboard = (NativeModules as any)?.Clipboard ?? (NativeModules as any)?.RNCClipboard;
  if (nativeClipboard?.setString) {
    nativeClipboard.setString(copy.message);
    return true;
  }

  await Share.share({ title: copy.subject, message: copy.message });
  return false;
}

async function openQrLanding(copy: ShareCopy): Promise<void> {
  const separator = copy.link.includes('?') ? '&' : '?';
  const qrLink = `${copy.link}${separator}qr=1`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Safari iOS peut conserver un onglet intermédiaire about:blank lorsqu'un
    // lien est lancé avec window.open. Loki reste donc volontairement dans le
    // même onglet ; le bouton Retour du navigateur revient à l'écran précédent.
    window.location.assign(qrLink);
    return;
  }
  await Linking.openURL(qrLink);
}

function showWebShareSheet(copy: ShareCopy): Promise<void> {
  if (typeof document === 'undefined') return shareSystem(copy);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-keep-unified-share', copy.kind);
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', background: 'rgba(5,3,10,.78)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '14px', boxSizing: 'border-box',
      fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    });

    const sheet = document.createElement('div');
    Object.assign(sheet.style, {
      width: 'min(430px,100%)', maxHeight: '88vh', overflowY: 'auto', background: '#151020', color: '#F8F6FC',
      border: '1px solid #493369', borderRadius: '24px', padding: '18px', boxSizing: 'border-box',
      boxShadow: '0 22px 70px rgba(0,0,0,.55)',
    });

    const handle = document.createElement('div');
    Object.assign(handle.style, { width: '42px', height: '4px', borderRadius: '4px', background: '#6E5C80', margin: '0 auto 14px' });

    const brand = document.createElement('div');
    brand.textContent = APP_NAME;
    Object.assign(brand.style, { color: '#B79CFF', fontSize: '10px', fontWeight: '1000', letterSpacing: '3px', textAlign: 'center' });

    const heading = document.createElement('div');
    heading.textContent = copy.heading;
    Object.assign(heading.style, { marginTop: '5px', fontSize: '18px', lineHeight: '24px', fontWeight: '900', textAlign: 'center' });

    const slogan = document.createElement('div');
    slogan.textContent = KEEP_SHARE_SLOGAN;
    Object.assign(slogan.style, { marginTop: '7px', color: '#B79CFF', fontSize: '11px', lineHeight: '16px', fontWeight: '850', textAlign: 'center' });

    const link = document.createElement('div');
    link.textContent = copy.link;
    Object.assign(link.style, { marginTop: '13px', padding: '10px', borderRadius: '12px', background: '#0E0A14', border: '1px solid #342641', color: '#B79CFF', fontSize: '10px', lineHeight: '14px', wordBreak: 'break-all' });

    const status = document.createElement('div');
    Object.assign(status.style, { minHeight: '16px', marginTop: '8px', color: '#68F2B1', fontSize: '10px', fontWeight: '850', textAlign: 'center' });

    const finish = () => { overlay.remove(); resolve(); };
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

    const system = makeButton(copy.kind === 'profile' ? `FAIRE DÉCOUVRIR MON ${APP_NAME}` : 'PARTAGER SUR MES APPLICATIONS', true, () => shareSystem(copy));
    const email = makeButton('✉  PARTAGER PAR E-MAIL', false, () => shareEmail(copy));
    const qr = makeButton(`▦  MON QR CODE ${APP_NAME}`, false, () => openQrLanding(copy));

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = `COPIER LE LIEN ${APP_NAME}`;
    Object.assign(copyButton.style, {
      width: '100%', minHeight: '48px', marginTop: '10px', borderRadius: '16px', cursor: 'pointer',
      border: '1px solid #493369', background: '#211A2B', color: '#FFFFFF', fontWeight: '900', fontSize: '12px',
    });
    copyButton.onclick = () => {
      copyButton.disabled = true;
      void copyShareText(copy)
        .then((copied) => {
          if (copied) {
            copyButton.textContent = '✓ COPIÉ';
            status.textContent = `Copié. Le texte contient ${APP_NAME}, le slogan, le contexte et le lien.`;
          } else {
            copyButton.textContent = 'COPIER DEPUIS LA FEUILLE OUVERTE';
            status.textContent = 'Choisis « Copier » dans la feuille de partage.';
          }
        })
        .catch(() => { status.textContent = 'Copie indisponible sur ce navigateur.'; })
        .finally(() => { copyButton.disabled = false; });
    };

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Fermer';
    Object.assign(cancel.style, {
      width: '100%', minHeight: '42px', marginTop: '8px', border: '0', background: 'transparent', color:'#FFFFFF',
      cursor: 'pointer', fontWeight: '800', fontSize: '12px',
    });
    cancel.onclick = finish;
    overlay.onclick = (event) => { if (event.target === overlay) finish(); };

    // Même ordre sur profil et morceau : QR, e-mail, découverte/partage, copie.
    sheet.append(handle, brand, heading, slogan, link, qr, email, system, copyButton, status, cancel);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
  });
}

function showNativeShareSheet(copy: ShareCopy): Promise<void> {
  return new Promise((resolve) => {
    const doCopy = async () => {
      try {
        const copied = await copyShareText(copy);
        if (copied) Alert.alert('Copié', `Le texte ${APP_NAME}, le slogan et le lien ont bien été copiés.`);
      } finally { resolve(); }
    };
    Alert.alert(
      copy.heading,
      `${KEEP_SHARE_SLOGAN}\n\nQR code · e-mail · partage · copie du lien.`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve() },
        { text: `QR ${APP_NAME}`, onPress: () => { void openQrLanding(copy).catch(() => {}).finally(resolve); } },
        { text: 'E-mail', onPress: () => { void shareEmail(copy).catch(() => {}).finally(resolve); } },
        { text: 'Copier', onPress: () => { void doCopy(); } },
        { text: 'Partager', onPress: () => { void shareSystem(copy).catch(() => {}).finally(resolve); } },
      ],
      { cancelable: true, onDismiss: resolve },
    );
  });
}

async function presentShare(copy: ShareCopy): Promise<void> {
  if (Platform.OS === 'web') return showWebShareSheet(copy);
  return showNativeShareSheet(copy);
}

function buildProfileCopy(username: string): ShareCopy {
  const clean = cleanUsername(username);
  const current = useUserStore.getState().user;
  const own = Boolean(current?.username && cleanUsername(current.username).toLowerCase() === clean.toLowerCase());
  const link = buildPublicProfileLink(clean);
  const identity = own ? [current?.city, current?.countryCode].filter(Boolean).join(' · ') : '';
  const profileLine = own ? `Découvre mon profil ${APP_NAME} @${clean}` : `Découvre le profil ${APP_NAME} @${clean}`;
  const message = `${profileLine} 🎧\n${APP_NAME} DNA · Vibes · morceaux · réseaux${identity ? ` · ${identity}` : ''}\n\n${KEEP_SHARE_SLOGAN}\n${link}`;
  return {
    kind: 'profile',
    heading: own ? `Partager mon profil ${APP_NAME}` : `Partager la collection de @${clean}`,
    subject: own ? `Mon profil ${APP_NAME} — @${clean}` : `Le profil ${APP_NAME} de @${clean}`,
    message,
    emailBody: `${message}\n\nUn scan, un clic, et tu entres dans cet univers musical.`,
    link,
    eventName: 'profile_share',
    channel: own ? 'profile_owner' : 'profile_visitor',
    ownProfile: own,
  };
}

function buildTrackCopy(username: string, title: string, artist: string): ShareCopy {
  const clean = cleanUsername(username);
  const link = buildPublicTrackLink(clean, title, artist);
  const own = cleanUsername(useUserStore.getState().user?.username).toLowerCase() === clean.toLowerCase();
  const origin = own ? `mon profil @${clean}` : `le profil @${clean}`;
  const message = `🎵 ${title.trim()} — ${artist.trim()}\nRetrouve ce morceau sur ${origin} dans ${APP_NAME}.\n\n${KEEP_SHARE_SLOGAN}\n${link}`;
  return {
    kind: 'track',
    heading: `Partager ${title.trim()} — ${artist.trim()}`,
    subject: `${title.trim()} — ${artist.trim()} · ${APP_NAME}`,
    message,
    emailBody: `${message}\n\nLe lien ouvre le profil ${APP_NAME} avec le contexte de ce morceau.`,
    link,
    eventName: 'profile_share',
    channel: 'track',
  };
}

function buildContextCopy(kind: Exclude<ShareKind, 'profile' | 'track'>, label: string, id?: string, count?: number): ShareCopy {
  const username = currentUsername();
  const link = username
    ? buildShareLanding({ u: username, share: kind, label, id, count })
    : `${WEB_URL}/`;

  const details: Record<typeof kind, { heading: string; subject: string; intro: string; eventName: ShareEvent }> = {
    vibe: {
      heading: `Partager la Vibe « ${label} »`,
      subject: `${label} · Vibe ${APP_NAME}`,
      intro: `🎵 Cette Vibe ${APP_NAME} me ressemble : « ${label} ». Swipe-la et vois ce que tu garderais.`,
      eventName: 'playlist_share',
    },
    session: {
      heading: `Partager la session « ${label} »`,
      subject: `${label} · Session ${APP_NAME}`,
      intro: `🎧 Session ${APP_NAME} « ${label} »${typeof count === 'number' ? ` · ${count} morceau${count > 1 ? 'x' : ''} gardé${count > 1 ? 's' : ''}` : ''}.`,
      eventName: 'profile_share',
    },
    compare: {
      heading: `Comparer avec @${label}`,
      subject: `Compare ton ${APP_NAME} DNA avec @${label}`,
      intro: `🧬 On écoute vraiment la même chose ? Compare ton ${APP_NAME} DNA avec celui de @${label}.`,
      eventName: 'compare_share',
    },
    event: {
      heading: `Partager « ${label} »`,
      subject: `${label} · ${APP_NAME}`,
      intro: `🎉 « ${label} » est sur ${APP_NAME}. Découvre l’ambiance et rejoins-nous.`,
      eventName: 'event_share',
    },
  };

  const info = details[kind];
  const message = `${info.intro}\n\n${KEEP_SHARE_SLOGAN}\n${link}`;
  return {
    kind,
    heading: info.heading,
    subject: info.subject,
    message,
    emailBody: message,
    link,
    eventName: info.eventName,
    channel: kind,
  };
}

export async function shareProfile(username: string): Promise<void> {
  const copy = buildProfileCopy(username);
  // Le profil propriétaire possède déjà son propre modal complet avec QR. Dans
  // ce cas, son bouton principal doit ouvrir directement la feuille système.
  if (copy.ownProfile) return shareSystem(copy);
  return presentShare(copy);
}

export async function shareProfileByEmail(username: string): Promise<void> {
  return shareEmail(buildProfileCopy(username));
}

export async function copyProfileShareText(username: string): Promise<boolean> {
  return copyShareText(buildProfileCopy(username));
}

export async function shareProfileTrack(username: string, title: string, artist: string): Promise<void> {
  return presentShare(buildTrackCopy(username, title, artist));
}

export async function copyProfileTrackShareText(username: string, title: string, artist: string): Promise<boolean> {
  return copyShareText(buildTrackCopy(username, title, artist));
}

export async function shareSession(sessionId: string, title: string, keptCount: number): Promise<void> {
  return presentShare(buildContextCopy('session', title, sessionId, keptCount));
}

export async function sharePlaylist(playlistId: string, playlistName: string): Promise<void> {
  const state = useUserStore.getState();
  if (!state.user || state.isLocalGuest || state.isDemoMode) {
    Alert.alert('Compte Loki requis', `Crée ton compte ${APP_NAME} pour débloquer le partage. Tes musiques restent disponibles en mode gratuit.`);
    return;
  }

  const planCode = await loadCurrentPlanCode(state.user.id).catch(() => 'FREE');
  if (!hasFeature(planCode, 'PUBLIC_PLAYLISTS')) {
    Alert.alert('Premium requis', `Le partage de Vibes publiques est inclus à partir de ${APP_NAME} Premium (2,99 €/mois).`);
    return;
  }

  return presentShare(buildContextCopy('vibe', playlistName, playlistId));
}

export async function shareCompareInvite(username: string): Promise<void> {
  return presentShare(buildContextCopy('compare', cleanUsername(username)));
}

export async function shareEvent(eventId: string, eventName: string): Promise<void> {
  return presentShare(buildContextCopy('event', eventName, eventId));
}
