import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { isTrackPreviewActive, stopTrackPreview, toggleTrackPreview } from '../services/audioPreviewService';
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

  const toggle = async () => {
    if (!previewUrl || busy) return;
    setBusy(true);
    try {
      await toggleTrackPreview(trackKey, previewUrl, setPlaying);
    } finally {
      setBusy(false);
    }
  };

  if (!previewUrl) {
    return compact ? null : <Text style={styles.unavailable}>Extrait indisponible</Text>;
  }

  return (
    <TouchableOpacity
      style={[styles.button, compact && styles.compact]}
      onPress={() => void toggle()}
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
