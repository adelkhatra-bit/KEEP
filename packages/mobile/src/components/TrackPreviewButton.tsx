import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { isTrackPreviewActive, stopTrackPreview, toggleTrackPreview } from '../services/audioPreviewService';
import { cancelAudioCapture } from '../services/micCapture';
import { useSessionStore } from '../store/useSessionStore';
import { colors } from '../theme/colors';

type Props = {
  trackKey: string;
  previewUrl?: string;
  fallbackUrl?: string;
  compact?: boolean;
  fullWidth?: boolean;
};

export default function TrackPreviewButton({ trackKey, previewUrl, fallbackUrl, compact = false, fullWidth = false }: Props) {
  const [playing, setPlaying] = useState(() => isTrackPreviewActive(trackKey));
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (playing) void stopTrackPreview(trackKey); }, [playing, trackKey]);

  const playOrStopPreview = async () => {
    if (!previewUrl || busy) return;
    setBusy(true);
    try {
      await toggleTrackPreview(trackKey, previewUrl, setPlaying);
    } finally {
      setBusy(false);
    }
  };

  const stopKeepListening = async () => {
    const session = useSessionStore.getState();
    if (session.isActive) session.requestEndSession();
    await cancelAudioCapture().catch(() => {});
  };

  const stopListeningThenPreview = async () => {
    await stopKeepListening();
    await playOrStopPreview();
  };

  const openFallback = async () => {
    if (!fallbackUrl || busy) return;
    setBusy(true);
    try {
      const canOpen = await Linking.canOpenURL(fallbackUrl).catch(() => true);
      if (!canOpen) throw new Error('unavailable');
      await Linking.openURL(fallbackUrl);
    } catch {
      Alert.alert('Lecture indisponible', 'Impossible d’ouvrir ce morceau pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const stopListeningThenFallback = async () => {
    await stopKeepListening();
    await openFallback();
  };

  const toggle = () => {
    if (busy) return;

    if (playing) {
      void playOrStopPreview();
      return;
    }

    if (useSessionStore.getState().isActive) {
      Alert.alert(
        'Écoute KEEP en cours',
        'Le micro KEEP est encore actif. Pour éviter d’identifier le son de ton propre téléphone, arrête la session avant de lancer un extrait ou d’ouvrir le morceau sur une plateforme.',
        [
          { text: 'Continuer l’écoute', style: 'cancel' },
          previewUrl
            ? { text: 'Arrêter et écouter', style: 'destructive', onPress: () => void stopListeningThenPreview() }
            : { text: 'Arrêter et ouvrir', style: 'destructive', onPress: () => void stopListeningThenFallback() },
        ],
      );
      return;
    }

    if (previewUrl) {
      void playOrStopPreview();
      return;
    }
    if (fallbackUrl) void openFallback();
  };

  if (!previewUrl && !fallbackUrl) {
    return compact ? <Text style={[styles.unavailable, fullWidth && styles.unavailableFullWidth]}>Audio indisponible</Text> : <Text style={styles.unavailable}>Extrait indisponible</Text>;
  }

  return (
    <TouchableOpacity
      style={[styles.button, compact && styles.compact, fullWidth && styles.fullWidth]}
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={previewUrl ? (playing ? 'Arrêter la pré-écoute' : 'Pré-écouter ce morceau') : 'Écouter ce morceau sur sa plateforme'}
    >
      <Text style={[styles.text, compact && styles.compactText]}>{busy ? '…' : previewUrl ? (playing ? '■ Stop' : '▶ Extrait') : '▶ Écouter'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 34,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 28, paddingHorizontal: 9, borderRadius: 14 },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  text: { color: colors.primaryLight, fontSize: 11, fontWeight: '800' },
  compactText: { fontSize: 9 },
  unavailable: { color: colors.textMuted, fontSize: 10 },
  unavailableFullWidth: { width: '100%', textAlign: 'center' },
});
