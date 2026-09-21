import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme';
import { loadPlaylistSaleOfferPreviewTracks, PlaylistSalePreviewTrack } from '../services/playlistSaleService';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';

const PREVIEW_DURATION_MS = 15000;

interface PlaylistSalePreviewProps {
  playlistId: string;
  trackCount?: number;
}

/**
 * BACKLOG.md priorité 1 : "Masquer le titre + l'artiste + la jaquette avant
 * achat" + "Pré-écoute de 15 secondes masquée" + "Pré-écoute masquée pour
 * une playlist complète". Chaque appui joue 15s d'un morceau différent de
 * l'offre (keep_playlist_sale_offer_preview_tracks ne renvoie jamais
 * titre/artiste/jaquette côté serveur -- le masquage n'est donc pas qu'un
 * habillage visuel, la donnée elle-même n'atteint jamais ce composant).
 */
export default function PlaylistSalePreview({ playlistId, trackCount }: PlaylistSalePreviewProps) {
  const [tracks, setTracks] = useState<PlaylistSalePreviewTrack[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const previewKeyRef = useRef(`playlist-sale-preview:${playlistId}`);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    clearCountdown();
    void stopTrackPreview(previewKeyRef.current);
  }, []);

  function clearCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  async function handlePress() {
    if (playing) {
      clearCountdown();
      await stopTrackPreview(previewKeyRef.current);
      setPlaying(false);
      return;
    }

    let available = tracks;
    if (available === null) {
      setLoading(true);
      try {
        available = await loadPlaylistSaleOfferPreviewTracks(playlistId);
      } catch {
        available = [];
      } finally {
        setLoading(false);
      }
      setTracks(available);
    }
    if (!available.length) return;

    const nextIndex = cursor % available.length;
    setCursor(nextIndex + 1);
    const track = available[nextIndex];

    setSecondsLeft(Math.round(PREVIEW_DURATION_MS / 1000));
    clearCountdown();
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    await playTrackPreviewSegment(
      previewKeyRef.current,
      track.previewUrl,
      0,
      PREVIEW_DURATION_MS,
      (isPlaying) => setPlaying(isPlaying),
      () => { clearCountdown(); setPlaying(false); },
    );
  }

  const unavailable = tracks !== null && tracks.length === 0;

  return (
    <View style={s.card}>
      <TouchableOpacity
        style={[s.button, (loading || unavailable) && s.buttonDisabled]}
        onPress={() => void handlePress()}
        disabled={loading || unavailable}
        activeOpacity={0.75}
        accessibilityLabel="Pré-écoute anonyme de cette offre"
      >
        {loading ? (
          <ActivityIndicator size="small" color="#38D990" />
        ) : (
          <Text style={s.buttonText}>
            {unavailable ? 'Aperçu indisponible' : playing ? `⏸ PRÉ-ÉCOUTE · 0:${String(secondsLeft).padStart(2, '0')}` : '▶️ Pré-écoute anonyme'}
          </Text>
        )}
      </TouchableOpacity>
      {!unavailable ? (
        <Text style={s.hint}>
          {playing
            ? `Piste masquée${trackCount ? ` · ${cursor}/${trackCount}` : ''} — titre, artiste et jaquette révélés seulement après achat.`
            : 'Écoute 15 secondes d’un morceau au hasard de cette sélection, sans savoir lequel.'}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 8,
  },
  button: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: '#0F1B16',
    borderWidth: 1,
    borderColor: '#2D5C4F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#38D990',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 6,
  },
});
