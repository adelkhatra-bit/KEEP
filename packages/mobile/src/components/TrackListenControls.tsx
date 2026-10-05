import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { CanonicalTrack } from '@keep/music';
import { colors } from '../theme/colors';
import { minTouchTarget, radius } from '../theme/spacing';
import { playTrackPreviewSegment, stopTrackPreview, stopTrackPreviewFast, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { cancelAudioCapture } from '../services/micCapture';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { useSessionStore } from '../store/useSessionStore';
import { resolveTrackExternalDestination } from '../services/trackExternalLinkService';
import KeepModal from './KeepModal';

interface Props {
  track: CanonicalTrack;
  previewKey: string;
  // AJOUT (31/08/2026, demande Adel : "des qu'il a fini son extrait, il
  // passe a la suivante, si je ne fais rien"). Appele quand l'extrait
  // termine SEUL (duree ecoulee), jamais quand l'utilisateur l'arrete lui-
  // meme ou change d'ecran -- comme dans MusicSwipeDeckModal.tsx, la fin
  // d'un extrait ne doit jamais valoir decision PASSER/GARDER, seulement
  // avancer la consultation.
  onPreviewFinished?: () => void;
  /** Lecture automatique uniquement dans une vue focalisée (ex. Écouter/Loki Pulse). */
  autoPlay?: boolean;
}

/**
 * Durées d'écoute 10/20/25/30s + ouverture du morceau, partagées entre la carte
 * « vient d'être détecté » (HomeScreenCompact) et les lignes d'historique
 * (TrackRow). Chaque bouton représente une vraie DURÉE, jamais un offset.
 */
export default function TrackListenControls({ track, previewKey, onPreviewFinished, autoPlay = false }: Props) {
  const [previewBusy, setPreviewBusy] = useState(false);
  const [embeddedPlayerOpen, setEmbeddedPlayerOpen] = useState(false);
  // BUG RÉEL (Adel, 01/09/2026 : "j'écoute la musique elle ne part pas, elle
  // se met indisponible") : ce composant affichait "Audio indisponible" dès
  // que le fournisseur de reconnaissance ne renvoyait aucun previewUrl/lien
  // externe direct, sans jamais tenter le même repli iTunes déjà utilisé et
  // fonctionnel dans TrackPreviewButton.tsx/MusicSwipeDeckModal.tsx.
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState(track.previewUrl ?? null);
  const [resolvingPreview, setResolvingPreview] = useState(false);
  const autoStartedKey = useRef<string | null>(null);

  const externalDestination = resolveTrackExternalDestination(track);
  const externalPlayUrl = externalDestination?.url;
  // Lecteur officiel intégré (widget Spotify/Deezer, ou IFrame Player API
  // YouTube) : reste dans Loki au lieu d'ouvrir la plateforme dans un nouvel
  // onglet. Web uniquement pour l'instant -- une iframe n'a pas d'équivalent
  // React Native direct sans dépendance WebView côté natif. Priorité Spotify
  // (widget le plus universellement disponible), Deezer puis YouTube en repli
  // -- YouTube seulement quand ACRCloud a confirmé un vrai id vidéo (vid),
  // jamais une simple recherche.
  const embedUrl = track.providerIds?.spotify
    ? `https://open.spotify.com/embed/track/${encodeURIComponent(track.providerIds.spotify)}`
    : track.providerIds?.deezer
      ? `https://widget.deezer.com/widget/dark/track/${encodeURIComponent(track.providerIds.deezer)}`
      : track.providerIds?.youtubeMusic
        ? `https://www.youtube.com/embed/${encodeURIComponent(track.providerIds.youtubeMusic)}`
        : undefined;
  const embedProviderLabel = track.providerIds?.spotify ? 'Spotify' : track.providerIds?.deezer ? 'Deezer' : 'YouTube';

  useEffect(() => {
    setResolvedPreviewUrl(track.previewUrl ?? null);
    // Un simple lien de recherche YouTube/TikTok ne constitue pas un extrait
    // jouable dans Loki Music. C'était le bug du mode démo : TrackResolver
    // fournit toujours ces liens de découverte, ce qui empêchait auparavant
    // le repli iTunes de chercher un vrai previewUrl.
    if (track.previewUrl || embedUrl) return;
    let live = true;
    setResolvingPreview(true);
    resolveTrackPreviewUrl(track)
      .then((url) => { if (live) setResolvedPreviewUrl(url); })
      .finally(() => { if (live) setResolvingPreview(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.title, track.artist, track.previewUrl, embedUrl]);

  useEffect(() => () => {
    // PASSER / changement de carte : couper instantanément l'ancien extrait.
    // Le nettoyage natif se termine en arrière-plan pour que le prochain son
    // puisse démarrer sans attente perceptible sur iPhone/TestFlight.
    stopTrackPreviewFast(previewKey);
  }, [previewKey]);

  useEffect(() => {
    autoStartedKey.current = null;
  }, [previewKey]);

  useEffect(() => {
    if (!autoPlay || !resolvedPreviewUrl || resolvingPreview) return undefined;
    const autoKey = `${previewKey}:${resolvedPreviewUrl}`;
    if (autoStartedKey.current === autoKey) return undefined;
    autoStartedKey.current = autoKey;
    let live = true;

    const run = async () => {
      // Vue focalisée seulement : pause temporaire du micro d'écoute, puis
      // reprise automatique quand l'extrait se termine.
      const session = useSessionStore.getState();
      if (session.isActive && !session.micPaused) session.pauseListening();

      for (let attempt = 0; attempt < 3 && live; attempt += 1) {
        try {
          setPreviewBusy(true);
          await playTrackPreviewSegment(
            previewKey,
            resolvedPreviewUrl,
            0,
            10000,
            resumeListeningOnStop,
            onPreviewFinished,
            true,
          );
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 220 + attempt * 260));
        } finally {
          if (live) setPreviewBusy(false);
        }
      }
      // En autoplay natif on ne montre jamais un popup qui volerait le tap
      // utilisateur. Les boutons manuels restent disponibles en repli.
      const latest = useSessionStore.getState();
      if (latest.micPaused) latest.resumeListening();
    };

    void run();
    return () => { live = false; };
  }, [autoPlay, onPreviewFinished, previewKey, resolvedPreviewUrl, resolvingPreview]);

  const stopKeepListening = async () => {
    const session = useSessionStore.getState();
    if (session.isActive) session.requestEndSession();
    await cancelAudioCapture().catch(() => {});
  };

  // Adel (05/09/2026) : "si j'appuie sur la lecture ça coupe l'écoute, et
  // quand la musique est terminée l'écoute repart" -- lire un extrait
  // exigeait AVANT tout d'arrêter complètement la session (requestEndSession,
  // qui efface aussi les morceaux déjà détectés) via une confirmation
  // bloquante. Remplacé par une simple pause (micro coupé) le temps de
  // l'extrait, reprise automatique dès que le lecteur s'arrête -- fin
  // naturelle ou stop manuel, `onStateChange` étant appelé avec false dans
  // les deux cas.
  const resumeListeningOnStop = (isPlaying: boolean) => {
    if (isPlaying) return;
    const session = useSessionStore.getState();
    if (session.micPaused) session.resumeListening();
  };

  const playSnippetNow = async (durationMillis: number) => {
    if (!resolvedPreviewUrl || previewBusy) return;
    setPreviewBusy(true);
    try {
      await playTrackPreviewSegment(previewKey, resolvedPreviewUrl, 0, durationMillis, resumeListeningOnStop, onPreviewFinished, true);
    } catch {
      Alert.alert('Extrait indisponible', 'Impossible de lire cet extrait pour le moment.');
    } finally {
      setPreviewBusy(false);
    }
  };

  const playSnippet = (durationMillis: number) => {
    if (!resolvedPreviewUrl || previewBusy) return;
    unlockWebAudioForGesture();
    const session = useSessionStore.getState();
    if (session.isActive) session.pauseListening();
    void playSnippetNow(durationMillis);
  };

  const openExternalNow = () => {
    if (Platform.OS === 'web' && embedUrl) { setEmbeddedPlayerOpen(true); return; }
    if (!externalPlayUrl) return;
    void Linking.openURL(externalPlayUrl).catch(() => Alert.alert('Lecture indisponible', 'Impossible d’ouvrir ce morceau pour le moment.'));
  };

  const openExternal = () => {
    if (!embedUrl && !externalPlayUrl) return;
    if (useSessionStore.getState().isActive) {
      Alert.alert(
        'Écoute Loki Music en cours',
        'Le micro Loki Music est encore actif. Arrête la session avant d’ouvrir ce morceau afin d’éviter une fausse détection.',
        [
          { text: 'Continuer l’écoute', style: 'cancel' },
          { text: 'Arrêter et ouvrir', style: 'destructive', onPress: () => void (async () => { await stopKeepListening(); await openExternalNow(); })() },
        ],
      );
      return;
    }
    void openExternalNow();
  };

  if (!resolvedPreviewUrl && !embedUrl && !externalPlayUrl) {
    if (resolvingPreview) return <Text style={styles.audioUnavailable}>Recherche de l’extrait…</Text>;
    return <Text style={styles.audioUnavailable}>Audio indisponible</Text>;
  }

  return (
    <>
      <View style={styles.previewRow}>
        {resolvedPreviewUrl ? <>
          <TouchableOpacity style={styles.previewPill} onPress={() => playSnippet(10000)} disabled={previewBusy} accessibilityLabel="Écouter 10 secondes"><Text style={styles.previewText}>{previewBusy ? '…' : '▶ 10s'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.previewPill} onPress={() => playSnippet(20000)} disabled={previewBusy} accessibilityLabel="Écouter 20 secondes"><Text style={styles.previewText}>▶ 20s</Text></TouchableOpacity>
          <TouchableOpacity style={styles.previewPill} onPress={() => playSnippet(25000)} disabled={previewBusy} accessibilityLabel="Écouter 25 secondes"><Text style={styles.previewText}>▶ 25s</Text></TouchableOpacity>
          <TouchableOpacity style={styles.previewPill} onPress={() => playSnippet(30000)} disabled={previewBusy} accessibilityLabel="Écouter 30 secondes"><Text style={styles.previewText}>▶ 30s</Text></TouchableOpacity>
        </> : null}
        {(embedUrl || externalPlayUrl) ? <TouchableOpacity style={styles.youtubePill} onPress={openExternal}><Text style={styles.youtubeText}>{embedUrl ? '▶ Écouter ici' : externalDestination?.exact ? '↗ Écouter sur la plateforme' : '↗ Ouvrir la recherche'}</Text></TouchableOpacity> : null}
      </View>

      {Platform.OS === 'web' && embedUrl ? (
        <KeepModal visible={embeddedPlayerOpen} transparent animationType="fade" onRequestClose={() => setEmbeddedPlayerOpen(false)}>
          <View style={styles.embedOverlay}>
            <View style={styles.embedCard}>
              <View style={styles.embedHead}>
                <Text style={styles.embedTitle} numberOfLines={1}>{track.title} · {track.artist}</Text>
                <TouchableOpacity onPress={() => setEmbeddedPlayerOpen(false)} hitSlop={8} accessibilityLabel="Fermer le lecteur"><Text style={styles.embedClose}>✕</Text></TouchableOpacity>
              </View>
              {embeddedPlayerOpen
                ? React.createElement('iframe', {
                    src: embedUrl,
                    width: '100%',
                    height: 152,
                    frameBorder: 0,
                    allow: 'autoplay; encrypted-media; clipboard-write',
                    style: { border: 0, borderRadius: 12 },
                  })
                : null}
              <Text style={styles.embedHint}>Lecteur officiel {embedProviderLabel} intégré -- reste sur Loki Music.</Text>
            </View>
          </View>
        </KeepModal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  previewPill: { minHeight: minTouchTarget, minWidth: minTouchTarget, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  previewText: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  youtubePill: { minHeight: minTouchTarget, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: '#211018', borderWidth: 1, borderColor: '#7A2035', alignItems: 'center', justifyContent: 'center' },
  youtubeText: { color: '#FF6B86', fontSize: 9, fontWeight: '900' },
  audioUnavailable: { color: colors.textMuted, fontSize: 9, marginTop: 5 },
  embedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  embedCard: { width: '100%', maxWidth: 380, borderRadius: 18, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369', padding: 14 },
  embedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  embedTitle: { color: '#F8F6FC', fontSize: 13, fontWeight: '800', flex: 1 },
  embedClose: { color: '#8F879D', fontSize: 16, fontWeight: '900', paddingHorizontal: 4 },
  embedHint: { color: '#8F879D', fontSize: 11, textAlign: 'center', marginTop: 9 },
});
