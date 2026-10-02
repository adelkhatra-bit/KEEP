import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CanonicalTrack } from '@keep/music';
import type { KeepNotification } from '../services/notificationService';
import {
  keepFromNewKeepNotification,
  loadNewKeepTrackState,
  revealedTrackLine,
} from '../services/newKeepNotification';
import { playAntiShazamPreviewSegment, stopAntiShazamPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { getCommercialRules } from '../services/growthAccessService';
import { Alert } from '../utils/keepAlert';

/**
 * Actions de la notification « Nouveau morceau chez @x » : écouter un
 * extrait masqué (15 s) et GARDER sans quitter la notification. Le titre
 * n'apparaît qu'après l'ajout, ou tout de suite s'il est déjà dans la
 * collection. Utilisé par la bannière du haut ET l'écran Notifications
 * (une seule logique : services/newKeepNotification.ts).
 */
export default function NewKeepNotificationActions({
  notification,
  onInteract,
  onKept,
}: {
  notification: KeepNotification;
  /** Appelé au premier geste (la bannière arrête alors de se refermer seule). */
  onInteract?: () => void;
  onKept?: () => void;
}) {
  const [track, setTrack] = useState<CanonicalTrack | null>(null);
  const [owned, setOwned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(false);
  const [cost, setCost] = useState(3);
  const previewKey = `new-keep-notif:${notification.id}`;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void loadNewKeepTrackState(notification).then((state) => {
      if (!mounted.current) return;
      setTrack(state.track);
      setOwned(state.owned);
      setLoading(false);
    });
    void getCommercialRules().then((rules) => { if (mounted.current) setCost(rules.freeCostPerKeep); }).catch(() => {});
    return () => {
      mounted.current = false;
      void stopAntiShazamPreview(previewKey).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification.id]);

  const togglePreview = async () => {
    onInteract?.();
    if (!track?.previewUrl) return;
    if (playing) {
      await stopAntiShazamPreview(previewKey).catch(() => {});
      setPlaying(false);
      return;
    }
    unlockWebAudioForGesture();
    try {
      await playAntiShazamPreviewSegment(previewKey, track.previewUrl, (isPlaying) => { if (mounted.current) setPlaying(isPlaying); }, () => { if (mounted.current) setPlaying(false); });
    } catch {
      setPlaying(false);
      Alert.alert('Extrait', 'Impossible de lire l’extrait pour le moment.');
    }
  };

  const keep = async (visibility: 'PUBLIC' | 'PRIVATE') => {
    if (!track || busy) return;
    setBusy(true);
    const result = await keepFromNewKeepNotification(notification, track, visibility, cost);
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) {
      Alert.alert('GARDER', result.error || 'Impossible d’ajouter ce morceau pour le moment.');
      return;
    }
    await stopAntiShazamPreview(previewKey).catch(() => {});
    setPlaying(false);
    setKept(true);
    if (result.alreadyKept) setOwned(true);
    onKept?.();
  };

  const askKeep = () => {
    onInteract?.();
    Alert.alert(
      `GARDER · ${cost} FREE`,
      `Le morceau rejoint ta collection et son titre se dévoile. ${cost} FREE seront débités (rien si tu l’as déjà).`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Privé', onPress: () => { void keep('PRIVATE'); } },
        { text: 'Public', onPress: () => { void keep('PUBLIC'); } },
      ],
    );
  };

  if (loading) {
    return <View style={s.row}><ActivityIndicator size="small" color="#B79CFF" /></View>;
  }
  if (!track) {
    return <Text style={s.muted}>Morceau indisponible.</Text>;
  }
  if (owned || kept) {
    return (
      <View testID="new-keep-revealed" style={s.revealed}>
        <Text style={s.revealedLabel}>{kept && !owned ? '✓ AJOUTÉ À TA COLLECTION' : '✓ DÉJÀ DANS TA COLLECTION'}</Text>
        <Text style={s.revealedTitle} numberOfLines={2}>{revealedTrackLine(track)}</Text>
      </View>
    );
  }
  return (
    <View style={s.row}>
      <TouchableOpacity
        testID="new-keep-listen"
        style={[s.listen, !track.previewUrl && s.disabled]}
        disabled={!track.previewUrl}
        onPress={() => { void togglePreview(); }}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Arrêter l’extrait masqué' : 'Écouter l’extrait masqué'}
      >
        <Text style={s.listenText}>{!track.previewUrl ? 'EXTRAIT INDISPONIBLE' : playing ? '■ STOP' : '▶ ÉCOUTER 15 s'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="new-keep-keep"
        style={[s.keep, busy && s.disabled]}
        disabled={busy}
        onPress={askKeep}
        accessibilityRole="button"
        accessibilityLabel={`Garder ce morceau pour ${cost} FREE`}
      >
        <Text style={s.keepText}>{busy ? 'AJOUT…' : `GARDER · ${cost} FREE`}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  listen: { flex: 1, minHeight: 38, borderRadius: 14, borderWidth: 1, borderColor: '#7C5CFC', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  listenText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  keep: { flex: 1, minHeight: 38, borderRadius: 14, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  keepText: { color: '#17130B', fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  muted: { color: '#FFFFFF', fontSize: 11, marginTop: 6, opacity: 0.8 },
  revealed: { marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#2DE1C2', backgroundColor: 'rgba(45,225,194,0.10)', paddingHorizontal: 10, paddingVertical: 7 },
  revealedLabel: { color: '#2DE1C2', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  revealedTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginTop: 2 },
});
