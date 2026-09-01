import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal, Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { CanonicalTrack } from '@keep/music';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';
import { cancelAudioCapture } from '../services/micCapture';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { useSessionStore } from '../store/useSessionStore';

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
}

/**
 * Extrait 0/10/20s + ouverture du morceau, partagé entre la carte "vient
 * d'être détecté" (HomeScreenCompact) et les lignes d'historique (TrackRow) --
 * les deux endroits doivent proposer exactement la même expérience d'écoute.
 */
export default function TrackListenControls({ track, previewKey, onPreviewFinished }: Props) {
  const [previewBusy, setPreviewBusy] = useState(false);
  const [embeddedPlayerOpen, setEmbeddedPlayerOpen] = useState(false);
  // BUG RÉEL (Adel, 01/09/2026 : "j'écoute la musique elle ne part pas, elle
  // se met indisponible") : ce composant affichait "Audio indisponible" dès
  // que le fournisseur de reconnaissance ne renvoyait aucun previewUrl/lien
  // externe direct, sans jamais tenter le même repli iTunes déjà utilisé et
  // fonctionnel dans TrackPreviewButton.tsx/MusicSwipeDeckModal.tsx.
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState(track.previewUrl ?? null);
  const [resolvingPreview, setResolvingPreview] = useState(false);

  const externalPlayUrl = track.externalUrls?.appleMusic
    || track.externalUrls?.spotify
    || track.externalUrls?.deezer
    || track.externalUrls?.universal
    || track.externalUrls?.youtubeSearch;
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
    if (track.previewUrl || embedUrl || externalPlayUrl) return;
    let live = true;
    setResolvingPreview(true);
    resolveTrackPreviewUrl(track)
      .then((url) => { if (live) setResolvedPreviewUrl(url); })
      .finally(() => { if (live) setResolvingPreview(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.title, track.artist, track.previewUrl, embedUrl, externalPlayUrl]);

  useEffect(() => () => {
    void stopTrackPreview(previewKey);
  }, [previewKey]);

  const stopKeepListening = async () => {
    const session = useSessionStore.getState();
    if (session.isActive) session.requestEndSession();
    await cancelAudioCapture().catch(() => {});
  };

  const playSnippetNow = async (positionMillis: number) => {
    if (!resolvedPreviewUrl || previewBusy) return;
    setPreviewBusy(true);
    try {
      await playTrackPreviewSegment(previewKey, resolvedPreviewUrl, positionMillis, 7000, undefined, onPreviewFinished);
    } catch {
      Alert.alert('Extrait indisponible', 'Impossible de lire cet extrait pour le moment.');
    } finally {
      setPreviewBusy(false);
    }
  };

  const playSnippet = (positionMillis: number) => {
    if (!resolvedPreviewUrl || previewBusy) return;
    if (useSessionStore.getState().isActive) {
      Alert.alert(
        'Écoute Loki en cours',
        'Le micro Loki est encore actif. Arrête la session avant de lire un extrait afin que Loki n’identifie pas le son de ton propre téléphone.',
        [
          { text: 'Continuer l’écoute', style: 'cancel' },
          { text: 'Arrêter et écouter', style: 'destructive', onPress: () => void (async () => { await stopKeepListening(); await playSnippetNow(positionMillis); })() },
        ],
      );
      return;
    }
    void playSnippetNow(positionMillis);
  };

  const openExternalNow = async () => {
    if (Platform.OS === 'web' && embedUrl) { setEmbeddedPlayerOpen(true); return; }
    if (!externalPlayUrl) return;
    try { await Linking.openURL(externalPlayUrl); }
    catch { Alert.alert('Lecture indisponible', 'Impossible d’ouvrir ce morceau pour le moment.'); }
  };

  const openExternal = () => {
    if (!embedUrl && !externalPlayUrl) return;
    if (useSessionStore.getState().isActive) {
      Alert.alert(
        'Écoute Loki en cours',
        'Le micro Loki est encore actif. Arrête la session avant d’ouvrir ce morceau afin d’éviter une fausse détection.',
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
          <TouchableOpacity style={styles.previewPill} onPress={() => playSnippet(0)} disabled={previewBusy}><Text style={styles.previewText}>{previewBusy ? '…' : '▶ 0s'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.previewPill} onPress={() => playSnippet(10000)} disabled={previewBusy}><Text style={styles.previewText}>▶ 10s</Text></TouchableOpacity>
          <TouchableOpacity style={styles.previewPill} onPress={() => playSnippet(20000)} disabled={previewBusy}><Text style={styles.previewText}>▶ 20s</Text></TouchableOpacity>
        </> : null}
        {(embedUrl || externalPlayUrl) ? <TouchableOpacity style={styles.youtubePill} onPress={openExternal}><Text style={styles.youtubeText}>{embedUrl ? '▶ Écouter ici' : resolvedPreviewUrl ? 'Ouvrir' : '▶ Écouter'}</Text></TouchableOpacity> : null}
      </View>

      {Platform.OS === 'web' && embedUrl ? (
        <Modal visible={embeddedPlayerOpen} transparent animationType="fade" onRequestClose={() => setEmbeddedPlayerOpen(false)}>
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
              <Text style={styles.embedHint}>Lecteur officiel {embedProviderLabel} intégré -- reste sur Loki.</Text>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  previewPill: { minHeight: 24, paddingHorizontal: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  previewText: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  youtubePill: { minHeight: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: '#211018', borderWidth: 1, borderColor: '#7A2035', alignItems: 'center', justifyContent: 'center' },
  youtubeText: { color: '#FF6B86', fontSize: 9, fontWeight: '900' },
  audioUnavailable: { color: colors.textMuted, fontSize: 9, marginTop: 5 },
  embedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  embedCard: { width: '100%', maxWidth: 380, borderRadius: 18, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369', padding: 14 },
  embedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  embedTitle: { color: '#F8F6FC', fontSize: 13, fontWeight: '800', flex: 1 },
  embedClose: { color: '#8F879D', fontSize: 16, fontWeight: '900', paddingHorizontal: 4 },
  embedHint: { color: '#8F879D', fontSize: 10, textAlign: 'center', marginTop: 9 },
});
