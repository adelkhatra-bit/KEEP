import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Alert } from '../utils/keepAlert';
import type { CanonicalTrack } from '@keep/music';
import { isTrackPreviewActive, stopTrackPreview, toggleTrackPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { cancelAudioCapture } from '../services/micCapture';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { supabase } from '../services/supabaseClient';
import { useSessionStore } from '../store/useSessionStore';
import { colors } from '../theme/colors';
import KeepModal from './KeepModal';
import { resolveEmbeddedMusicPlayer } from '../services/embeddedMusicPlayer';

type Props = {
  trackKey: string;
  previewUrl?: string;
  fallbackUrl?: string;
  compact?: boolean;
  fullWidth?: boolean;
  // Adel (08/09/2026) : "fais en sorte qu'il [Jouer] fasse la meme taille
  // que le bouton du dessous [Partager]" -- variante encore plus compacte,
  // reservee aux endroits ou Jouer voisine un petit chip comme Partager
  // (jamais appliquee a `compact` seul, qui reste utilise ailleurs en plein
  // largeur avec une cible tactile de 44).
  small?: boolean;
  // Adel (21/09/2026, maquette validée "Cartes Loki — nouveau design") :
  // carré d'action 40×40, icône seule (▶/■), même famille que les carrés
  // Aimer/Partager/Garder -- jamais combiné avec compact/fullWidth/small.
  square?: boolean;
};

type TrackAudioMetadata = {
  candidate: CanonicalTrack | null;
  directPreview: string;
  fallback: string;
};

function firstExternalUrl(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const urls = value as Record<string, unknown>;
  const priority = ['spotify', 'appleMusic', 'apple_music', 'youtube', 'deezer', 'url'];
  for (const key of priority) {
    const candidate = urls[key];
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate.trim())) return candidate.trim();
  }
  for (const candidate of Object.values(urls)) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate.trim())) return candidate.trim();
  }
  return '';
}

async function loadTrackAudioMetadata(trackKey: string): Promise<TrackAudioMetadata> {
  if (!supabase || !trackKey) return { candidate: null, directPreview: '', fallback: '' };
  const { data, error } = await supabase
    .from('tracks')
    .select('id,title,artist,preview_url,external_urls')
    .eq('id', trackKey)
    .maybeSingle();
  if (error || !data) return { candidate: null, directPreview: '', fallback: '' };

  const title = String((data as any).title || '').trim();
  const artist = String((data as any).artist || '').trim();
  return {
    directPreview: typeof (data as any).preview_url === 'string' ? String((data as any).preview_url).trim() : '',
    fallback: firstExternalUrl((data as any).external_urls),
    candidate: title && artist ? ({ id: String((data as any).id || trackKey), title, artist } as CanonicalTrack) : null,
  };
}

export default function TrackPreviewButton({ trackKey, previewUrl, fallbackUrl, compact = false, fullWidth = false, small = false, square = false }: Props) {
  const [playing, setPlaying] = useState(() => isTrackPreviewActive(trackKey));
  const [busy, setBusy] = useState(false);
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState(previewUrl?.trim() || '');
  const [resolvedFallbackUrl, setResolvedFallbackUrl] = useState(fallbackUrl?.trim() || '');
  const [resolving, setResolving] = useState(!previewUrl);
  const [providerOpen, setProviderOpen] = useState(false);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerFailed, setProviderFailed] = useState(false);
  const micPausedByPlayer = useRef(false);
  const embedded = resolveEmbeddedMusicPlayer(resolvedFallbackUrl);
  const NativeWebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;
  const providerUrl = embedded?.provider === 'YOUTUBE' ? `${embedded.url}&autoplay=1` : embedded?.url;
  const closeProvider = () => {
    setProviderOpen(false);
    if (micPausedByPlayer.current) {
      micPausedByPlayer.current = false;
      // Wait until the WebView is unmounted before unpausing the mic.
      setTimeout(() => { const session = useSessionStore.getState(); if (session.isActive && session.micPaused) session.resumeListening(); }, 350);
    }
  };

  useEffect(() => () => { if (playing) void stopTrackPreview(trackKey); }, [playing, trackKey]);
  useEffect(() => { setProviderOpen(false); setProviderFailed(false); }, [trackKey]);

  useEffect(() => {
    setResolvedPreviewUrl(previewUrl?.trim() || '');
    setResolvedFallbackUrl(fallbackUrl?.trim() || '');
    // Un lien vers YouTube/TikTok/Spotify n'est pas un extrait audio.
    // Même si le lien externe existe, chercher la vraie preview en bibliothèque.
    if (previewUrl) {
      setResolving(false);
      return undefined;
    }
    if (!supabase || !trackKey) {
      setResolving(false);
      return undefined;
    }

    let live = true;
    setResolving(true);
    void (async () => {
      try {
        const metadata = await loadTrackAudioMetadata(trackKey);
        if (!live) return;
        if (metadata.fallback) setResolvedFallbackUrl(metadata.fallback);
        if (metadata.directPreview) {
          setResolvedPreviewUrl(metadata.directPreview);
          return;
        }
        const publicPreview = metadata.candidate ? await resolveTrackPreviewUrl(metadata.candidate) : null;
        if (live) setResolvedPreviewUrl(publicPreview || '');
      } finally {
        if (live) setResolving(false);
      }
    })();

    return () => { live = false; };
  }, [fallbackUrl, previewUrl, trackKey]);

  const retryWithFreshPreview = async (failedUrl: string): Promise<boolean> => {
    const metadata = await loadTrackAudioMetadata(trackKey);
    if (metadata.fallback) setResolvedFallbackUrl(metadata.fallback);
    if (!metadata.candidate) return false;

    const fresh = await resolveTrackPreviewUrl(metadata.candidate, { forceRefresh: true });
    if (!fresh || fresh === failedUrl) return false;
    setResolvedPreviewUrl(fresh);
    try {
      await toggleTrackPreview(trackKey, fresh, setPlayingAndResume);
      return true;
    } catch {
      return false;
    }
  };

  // Adel (05/09/2026) : "si j'appuie sur la lecture ça coupe l'écoute, et
  // quand la musique est terminée l'écoute repart" -- lire un extrait
  // reprenait AVANT tout la session entière (requestEndSession, qui efface
  // aussi les morceaux déjà détectés) plutôt que de la mettre simplement en
  // pause le temps de l'extrait. setPlayingAndResume relance
  // resumeListening() dès que le lecteur revient à l'arrêt (fin naturelle
  // OU stop manuel), qu'elle qu'en soit la cause.
  const setPlayingAndResume = (value: boolean) => {
    setPlaying(value);
    if (!value) {
      const session = useSessionStore.getState();
      if (session.micPaused) session.resumeListening();
    }
  };

  const playOrStopPreview = async () => {
    if (!resolvedPreviewUrl || busy) return;
    setBusy(true);
    const attemptedUrl = resolvedPreviewUrl;
    try {
      await toggleTrackPreview(trackKey, attemptedUrl, setPlayingAndResume);
    } catch {
      setPlayingAndResume(false);
      const recovered = await retryWithFreshPreview(attemptedUrl).catch(() => false);
      if (!recovered) {
        setResolvedPreviewUrl('');
        Alert.alert(
          'Extrait en cours de renouvellement',
          resolvedFallbackUrl
            ? 'Cet ancien extrait n’est plus lisible. Loki Music a recherché une nouvelle source. Tu peux aussi ouvrir le morceau sur sa plateforme.'
            : 'Cet ancien extrait n’est plus lisible et aucune nouvelle source audio n’est disponible pour le moment.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const stopKeepListening = async () => {
    const session = useSessionStore.getState();
    if (session.isActive) session.requestEndSession();
    await cancelAudioCapture().catch(() => {});
  };

  const openFallback = () => {
    if (!resolvedFallbackUrl || busy) return;
    setBusy(true);
    void Linking.openURL(resolvedFallbackUrl)
      .catch(() => Alert.alert('Lecture indisponible', 'Impossible d’ouvrir ce morceau pour le moment.'))
      .finally(() => setBusy(false));
  };

  const stopListeningThenFallback = async () => {
    await stopKeepListening();
    await openFallback();
  };

  const toggle = () => {
    if (busy || resolving) return;
    unlockWebAudioForGesture();

    if (playing) {
      void playOrStopPreview();
      return;
    }

    // Adel (05/09/2026) : "si j'appuie sur la lecture ça coupe l'écoute, et
    // quand la musique est terminée l'écoute repart" -- un extrait se
    // pré-écoute désormais directement, sans confirmation bloquante : la
    // session se met juste en pause (micro coupé) le temps de l'extrait,
    // puis reprend toute seule (setPlayingAndResume). Ouvrir le morceau sur
    // une plateforme externe reste différent : impossible de savoir quand
    // l'utilisateur revient dans l'app, donc ce chemin continue d'exiger
    // une confirmation et arrête vraiment la session.
    if (resolvedPreviewUrl) {
      const session = useSessionStore.getState();
      if (session.isActive) session.pauseListening();
      void playOrStopPreview();
      return;
    }

    if (embedded) {
      const session = useSessionStore.getState();
      if (session.isActive && !session.micPaused) { session.pauseListening(); micPausedByPlayer.current = true; }
      setProviderLoading(true);
      setProviderFailed(false);
      setProviderOpen(true);
      return;
    }
    if (useSessionStore.getState().isActive) {
      Alert.alert(
        'Écoute Loki Music en cours',
        'Le micro Loki Music est encore actif. Pour éviter d’identifier le son de ton propre téléphone, arrête la session avant d’ouvrir le morceau sur une plateforme.',
        [
          { text: 'Continuer l’écoute', style: 'cancel' },
          { text: 'Arrêter et ouvrir', style: 'destructive', onPress: () => void stopListeningThenFallback() },
        ],
      );
      return;
    }

    // ▶ must never unexpectedly send someone to YouTube or another app.
    // Keep the explicit external-link action separate from pre-listening.
    Alert.alert('Préécoute indisponible', 'Cette source ne propose aucun extrait intégrable. Tu peux ouvrir sa plateforme séparément, si tu le souhaites.');
  };

  if (resolving) {
    if (square) return <TouchableOpacity style={styles.squareDisabled} disabled accessibilityLabel="Recherche audio en cours"><Text style={styles.squareText}>…</Text></TouchableOpacity>;
    return <Text style={[styles.unavailable, fullWidth && styles.unavailableFullWidth]}>Recherche audio…</Text>;
  }

  const embeddedModal = embedded && providerUrl ? (
    <KeepModal visible={providerOpen} transparent animationType="fade" onRequestClose={closeProvider}>
      <View style={styles.providerBackdrop}>
        <View style={styles.providerCard} testID="playlist-preview-inline-player">
          <View style={styles.providerHeader}>
            <Text style={styles.providerTitle}>Préécoute dans Loki Music</Text>
            <TouchableOpacity onPress={closeProvider} accessibilityRole="button" accessibilityLabel="Fermer la préécoute" style={styles.providerClose}><Text style={styles.providerCloseLabel}>✕</Text></TouchableOpacity>
          </View>
          {providerLoading ? <Text testID="provider-audio-loading" style={styles.providerHint}>Chargement du lecteur… Une publicité du fournisseur peut précéder le morceau ; patiente ou appuie sur ▶ dans le lecteur.</Text> : null}
          {providerFailed ? <Text style={styles.providerWarning}>La plateforme refuse ce lecteur. Essaie un autre morceau ou consulte sa source officielle.</Text> : null}
          {providerOpen ? Platform.OS === 'web'
            ? React.createElement('iframe' as any, {
                src: providerUrl,
                title: `Préécoute ${trackKey} dans Loki Music`,
                width: '100%', height: embedded.provider === 'YOUTUBE' ? 246 : 194,
                style: { border: 0, borderRadius: 12 },
                allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
                allowFullScreen: true,
                onLoad: () => setProviderLoading(false),
                referrerPolicy: 'strict-origin-when-cross-origin',
              })
            : NativeWebView ? <NativeWebView
                source={{ uri: providerUrl, ...(embedded.provider === 'YOUTUBE' ? { headers: { Referer: 'https://com.adelkhatra.keep' } } : {}) }}
                style={{ height: embedded.provider === 'YOUTUBE' ? 246 : 194 }}
                javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                setSupportMultipleWindows={false}
                onLoadEnd={() => setProviderLoading(false)}
                onError={() => { setProviderLoading(false); setProviderFailed(true); }}
                onHttpError={() => { setProviderLoading(false); setProviderFailed(true); }}
                onShouldStartLoadWithRequest={(request: { url: string; isTopFrame?: boolean }) => request.isTopFrame === false || request.url.startsWith(providerUrl!.split('?')[0])}
              /> : null : null}
          <Text style={styles.providerHint}>Lecteur officiel {embedded.provider}. Si le fournisseur diffuse une publicité, elle fait partie de sa lecture et ne peut pas être supprimée par Loki.</Text>
        </View>
      </View>
    </KeepModal>
  ) : null;

  if (!resolvedPreviewUrl && !resolvedFallbackUrl) {
    if (square) return <TouchableOpacity style={styles.squareDisabled} disabled accessibilityLabel="Audio indisponible"><Text style={styles.squareText}>♪</Text></TouchableOpacity>;
    return compact ? <Text style={[styles.unavailable, fullWidth && styles.unavailableFullWidth]}>Audio indisponible</Text> : <Text style={styles.unavailable}>Extrait indisponible</Text>;
  }

  if (square) {
    return (
      <>
      <TouchableOpacity
        style={[styles.square, playing && styles.squarePlaying]}
        onPress={toggle}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={resolvedPreviewUrl ? (playing ? 'Arrêter la pré-écoute' : 'Pré-écouter ce morceau') : embedded ? 'Préécouter dans Loki Music' : 'Extrait indisponible dans Loki Music'}
      >
        <Text style={[styles.squareText, playing && styles.squareTextPlaying]}>{busy ? '…' : playing ? '■' : '▶'}</Text>
      </TouchableOpacity>
      {embeddedModal}
      </>
    );
  }

  return (
    <> 
    <TouchableOpacity
      style={[styles.button, compact && styles.compact, fullWidth && styles.fullWidth, small && styles.small]}
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={resolvedPreviewUrl ? (playing ? 'Arrêter la pré-écoute' : 'Pré-écouter ce morceau') : embedded ? 'Préécouter dans Loki Music' : 'Extrait indisponible dans Loki Music'}
    >
      <Text style={[styles.text, compact && styles.compactText, small && styles.smallText]}>{busy ? '…' : resolvedPreviewUrl ? (playing ? '■ Stop' : '▶ Jouer') : embedded ? '▶ Écouter ici' : '♪ Indisponible'}</Text>
    </TouchableOpacity>
    {embeddedModal}
    {!resolvedPreviewUrl && !embedded && resolvedFallbackUrl ? <TouchableOpacity onPress={openFallback} accessibilityRole="link" accessibilityLabel="Ouvrir volontairement la plateforme musicale" style={styles.sourceLink}><Text style={styles.sourceLinkText}>↗ Voir sur la plateforme</Text></TouchableOpacity> : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22 },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  // Adel (08/09/2026) : memes dimensions que le chip "Partager" voisin
  // (trackShare dans ProfilePublicScreen). "Pourquoi tu l'as pas mis d'une
  // autre couleur ... pour qu'on comprenne que ça s'appuie" -- Jouer et
  // Partager etaient tous les deux dans la meme famille violette (juste
  // contour vs plein), donc peu distincts une fois a la meme taille. Jouer
  // reprend ici le jaune-citron deja utilise partout ailleurs dans l'app
  // pour une action de lecture/positive (Battle, RSVP "j'y vais").
  small: { minHeight: 25, paddingHorizontal: 8, borderRadius: 13, borderColor: '#E5F266' },
  text: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' },
  compactText: { fontSize: 12 },
  smallText: { fontSize: 12, color: '#E5F266' },
  unavailable: { color: colors.textMuted, fontSize: 11 },
  unavailableFullWidth: { width: '100%', textAlign: 'center' },
  // Maquette interactive validée "TrackRow" (21/09/2026,
  // https://claude.ai/artifact/9X4dx8oMmCJ3hkRGndc7BW) : fond uniforme
  // #1A1A2E pour tous les carrés d'action -- gris au repos, vert menthe
  // pendant la lecture, jamais de remplissage violet (contrairement à la
  // première maquette, corrigée depuis).
  providerBackdrop:{flex:1,backgroundColor:'rgba(3,2,12,.88)',justifyContent:'center',alignItems:'center',padding:14},
  providerCard:{width:'100%',maxWidth:520,borderWidth:1.5,borderColor:'#A78BFA',backgroundColor:'#171020',borderRadius:18,padding:14,gap:10},
  providerHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},
  providerTitle:{flex:1,color:'#FFFFFF',fontSize:15,fontWeight:'900'},
  providerClose:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  providerCloseLabel:{color:'#FFFFFF',fontSize:22},
  providerHint:{color:'#DCCFFF',fontSize:12,lineHeight:18},
  providerWarning:{color:'#FFCD93',fontSize:12,lineHeight:18},
  sourceLink:{minHeight:36,paddingHorizontal:9,justifyContent:'center',alignItems:'center'},
  sourceLinkText:{fontSize:11,color:'#DCCFFF',textDecorationLine:'underline'},
  square: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: '#8B87A0', backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' },
  squarePlaying: { borderColor: colors.success },
  squareDisabled: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center', opacity: 0.6 },
  squareText: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  squareTextPlaying: { color: colors.success },
});
