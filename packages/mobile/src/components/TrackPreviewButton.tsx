import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { CanonicalTrack } from '@keep/music';
import { isTrackPreviewActive, stopTrackPreview, toggleTrackPreview } from '../services/audioPreviewService';
import { cancelAudioCapture } from '../services/micCapture';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { supabase } from '../services/supabaseClient';
import { useSessionStore } from '../store/useSessionStore';
import { colors } from '../theme/colors';

type Props = {
  trackKey: string;
  previewUrl?: string;
  fallbackUrl?: string;
  compact?: boolean;
  fullWidth?: boolean;
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

export default function TrackPreviewButton({ trackKey, previewUrl, fallbackUrl, compact = false, fullWidth = false }: Props) {
  const [playing, setPlaying] = useState(() => isTrackPreviewActive(trackKey));
  const [busy, setBusy] = useState(false);
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState(previewUrl?.trim() || '');
  const [resolvedFallbackUrl, setResolvedFallbackUrl] = useState(fallbackUrl?.trim() || '');
  const [resolving, setResolving] = useState(!previewUrl && !fallbackUrl);

  useEffect(() => () => { if (playing) void stopTrackPreview(trackKey); }, [playing, trackKey]);

  useEffect(() => {
    setResolvedPreviewUrl(previewUrl?.trim() || '');
    setResolvedFallbackUrl(fallbackUrl?.trim() || '');
    if (previewUrl || fallbackUrl) {
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
        const { data, error } = await supabase
          .from('tracks')
          .select('id,title,artist,preview_url,external_urls')
          .eq('id', trackKey)
          .maybeSingle();
        if (error || !data || !live) return;

        const directPreview = typeof (data as any).preview_url === 'string' ? String((data as any).preview_url).trim() : '';
        const external = firstExternalUrl((data as any).external_urls);
        if (directPreview) {
          setResolvedPreviewUrl(directPreview);
          setResolvedFallbackUrl(external);
          return;
        }

        const candidate = {
          id: String((data as any).id || trackKey),
          title: String((data as any).title || ''),
          artist: String((data as any).artist || ''),
        } as CanonicalTrack;
        const publicPreview = candidate.title && candidate.artist ? await resolveTrackPreviewUrl(candidate) : null;
        if (!live) return;
        setResolvedPreviewUrl(publicPreview || '');
        setResolvedFallbackUrl(external);
      } finally {
        if (live) setResolving(false);
      }
    })();

    return () => { live = false; };
  }, [fallbackUrl, previewUrl, trackKey]);

  const playOrStopPreview = async () => {
    if (!resolvedPreviewUrl || busy) return;
    setBusy(true);
    try {
      await toggleTrackPreview(trackKey, resolvedPreviewUrl, setPlaying);
    } catch {
      setPlaying(false);
      Alert.alert('Lecture indisponible', 'L’extrait audio ne peut pas être lu pour le moment. Tu peux ouvrir le morceau sur sa plateforme si un lien est disponible.');
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
    if (!resolvedFallbackUrl || busy) return;
    setBusy(true);
    try {
      const canOpen = await Linking.canOpenURL(resolvedFallbackUrl).catch(() => true);
      if (!canOpen) throw new Error('unavailable');
      await Linking.openURL(resolvedFallbackUrl);
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
    if (busy || resolving) return;

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
          resolvedPreviewUrl
            ? { text: 'Arrêter et écouter', style: 'destructive', onPress: () => void stopListeningThenPreview() }
            : { text: 'Arrêter et ouvrir', style: 'destructive', onPress: () => void stopListeningThenFallback() },
        ],
      );
      return;
    }

    if (resolvedPreviewUrl) {
      void playOrStopPreview();
      return;
    }
    if (resolvedFallbackUrl) void openFallback();
  };

  if (resolving) {
    return <Text style={[styles.unavailable, fullWidth && styles.unavailableFullWidth]}>Recherche audio…</Text>;
  }

  if (!resolvedPreviewUrl && !resolvedFallbackUrl) {
    return compact ? <Text style={[styles.unavailable, fullWidth && styles.unavailableFullWidth]}>Audio indisponible</Text> : <Text style={styles.unavailable}>Extrait indisponible</Text>;
  }

  return (
    <TouchableOpacity
      style={[styles.button, compact && styles.compact, fullWidth && styles.fullWidth]}
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={resolvedPreviewUrl ? (playing ? 'Arrêter la pré-écoute' : 'Pré-écouter ce morceau') : 'Écouter ce morceau sur sa plateforme'}
    >
      <Text style={[styles.text, compact && styles.compactText]}>{busy ? '…' : resolvedPreviewUrl ? (playing ? '■ Stop' : '▶ Jouer') : '▶ Ouvrir'}</Text>
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
