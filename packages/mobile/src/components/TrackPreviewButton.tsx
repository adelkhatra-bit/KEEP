import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { isTrackPreviewActive, stopTrackPreview, toggleTrackPreview } from '../services/audioPreviewService';
import { cancelAudioCapture } from '../services/micCapture';
import { useSessionStore } from '../store/useSessionStore';
import { colors } from '../theme/colors';

type Props = {
  trackKey: string;
  previewUrl?: string;
  compact?: boolean;
};

export default function TrackPreviewButton({ trackKey, previewUrl, compact = false }: Props) {
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

  const stopListeningThenPreview = async () => {
    const session = useSessionStore.getState();
    if (session.isActive) session.requestEndSession();
    // requestEndSession déclenche déjà l'arrêt ; l'attente ici garantit que le
    // micro est réellement libéré AVANT d'ouvrir la sortie audio du morceau.
    await cancelAudioCapture().catch(() => {});
    await playOrStopPreview();
  };

  const toggle = () => {
    if (!previewUrl || busy) return;
    if (playing) {
      void playOrStopPreview();
      return;
    }

    if (useSessionStore.getState().isActive) {
      Alert.alert(
        'Arrêter l’écoute KEEP ?',
        'Un morceau ne peut pas être diffusé pendant que KEEP écoute le micro. Souhaites-tu arrêter l’écoute puis lancer cet extrait ?',
        [
          { text: 'Continuer l’écoute', style: 'cancel' },
          { text: 'Arrêter et écouter', style: 'destructive', onPress: () => void stopListeningThenPreview() },
        ],
      );
      return;
    }

    void playOrStopPreview();
  };

  if (!previewUrl) {
    return compact ? null : <Text style={styles.unavailable}>Extrait indisponible</Text>;
  }

  return (
    <TouchableOpacity
      style={[styles.button, compact && styles.compact]}
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Arrêter la pré-écoute' : 'Pré-écouter ce morceau'}
    >
      <Text style={[styles.text, compact && styles.compactText]}>{busy ? '…' : playing ? '■ Stop' : '▶ Extrait'}</Text>
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
  text: { color: colors.primaryLight, fontSize: 11, fontWeight: '800' },
  compactText: { fontSize: 9 },
  unavailable: { color: colors.textMuted, fontSize: 10 },
});
