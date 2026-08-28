import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MusicServiceIcon, { MUSIC_SERVICE_BRAND_COLORS } from '../components/MusicServiceIcon';
import {
  clearKeylessMusicExport,
  KEYLESS_MUSIC_SERVICES,
  KeylessExportQueue,
  loadKeylessMusicExport,
  MusicServiceKey,
  openMusicService,
} from '../services/keylessMusicBridge';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

export default function MusicConnectionsScreen({ navigation }: any) {
  const [queue, setQueue] = useState<KeylessExportQueue | null>(null);
  const [selectedService, setSelectedService] = useState<MusicServiceKey | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const refreshQueue = useCallback(async () => {
    const next = await loadKeylessMusicExport();
    setQueue(next);
    if (!next?.tracks.length) {
      setSelectedService(null);
      setTrackIndex(0);
    } else {
      setTrackIndex((value) => Math.min(value, next.tracks.length - 1));
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshQueue(); });
    return () => unsubscribe?.();
  }, [navigation, refreshQueue]);

  const currentTrack = useMemo(() => queue?.tracks[trackIndex] ?? null, [queue, trackIndex]);
  const selectedName = KEYLESS_MUSIC_SERVICES.find((item) => item.key === selectedService)?.name ?? '';

  const openProvider = async (service: MusicServiceKey) => {
    setBusy(true);
    try {
      await openMusicService(service, currentTrack ?? undefined);
    } catch {
      Alert.alert('Service musical', 'Impossible d’ouvrir ce service sur cet appareil.');
    } finally {
      setBusy(false);
    }
  };

  const chooseProvider = (service: MusicServiceKey) => {
    if (queue?.tracks.length) {
      setSelectedService(service);
      setTrackIndex(0);
      return;
    }
    void openProvider(service);
  };

  const finishExport = async () => {
    await clearKeylessMusicExport();
    setQueue(null);
    setSelectedService(null);
    setTrackIndex(0);
    Alert.alert('KEEP', 'La file d’envoi est terminée. Tes Vibes restent rangées dans KEEP.');
  };

  const nextTrack = async () => {
    if (!queue?.tracks.length) return;
    if (trackIndex >= queue.tracks.length - 1) {
      await finishExport();
      return;
    }
    setTrackIndex((value) => value + 1);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹ Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Services musicaux</Text>
        <Text style={styles.subtitle}>KEEP range ta musique dans ses Vibes. Pour l’envoyer ailleurs, ce mode ouvre directement la recherche exacte dans ton service — sans clé API KEEP et sans abonnement technique.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.keylessCard}>
          <View style={styles.keylessTop}>
            <View style={styles.keylessBadge}><Text style={styles.keylessBadgeText}>SANS API</Text></View>
            <Text style={styles.keylessTitle}>Pont musical KEEP</Text>
          </View>
          <Text style={styles.keylessText}>Le rangement automatique reste fait par KEEP. Une plateforme externe ne permet pas à une autre app de modifier silencieusement ta bibliothèque sans autorisation officielle : KEEP prépare donc le bon morceau, ouvre le bon service et tu confirmes l’ajout.</Text>
        </View>

        {queue?.tracks.length ? (
          <View style={styles.exportCard}>
            <Text style={styles.exportEyebrow}>PRÊT À ENVOYER</Text>
            <Text style={styles.exportTitle}>{queue.name}</Text>
            <Text style={styles.exportCount}>{queue.tracks.length} morceau{queue.tracks.length > 1 ? 'x' : ''}</Text>
            {selectedService && currentTrack ? (
              <View style={styles.currentTrackCard}>
                <View style={styles.exportProgressRow}>
                  <Text style={styles.exportProgress}>{trackIndex + 1} / {queue.tracks.length}</Text>
                  <Text style={styles.destination}>→ {selectedName}</Text>
                </View>
                <Text style={styles.currentTrackTitle} numberOfLines={1}>{currentTrack.title}</Text>
                <Text style={styles.currentTrackArtist} numberOfLines={1}>{currentTrack.artist}{currentTrack.album ? ` · ${currentTrack.album}` : ''}</Text>
                <TouchableOpacity style={styles.openTrackButton} onPress={() => void openProvider(selectedService)} disabled={busy}>
                  <Text style={styles.openTrackButtonText}>{busy ? 'OUVERTURE…' : `OUVRIR DANS ${selectedName.toUpperCase()}`}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nextButton} onPress={() => void nextTrack()}>
                  <Text style={styles.nextButtonText}>{trackIndex === queue.tracks.length - 1 ? 'TERMINER' : 'MORCEAU SUIVANT ›'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.changeButton} onPress={() => { setSelectedService(null); setTrackIndex(0); }}>
                  <Text style={styles.changeButtonText}>Changer de service</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.exportHint}>Choisis où tu veux envoyer cette collection. KEEP gardera la file prête pendant que tu passes dans l’autre application.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{queue?.tracks.length && !selectedService ? 'Choisir la destination' : 'Tes services'}</Text>
          <Text style={styles.sectionHint}>Le lien HTTPS ouvre l’app installée quand la plateforme le permet, sinon sa version web.</Text>
        </View>

        {KEYLESS_MUSIC_SERVICES.map((provider) => {
          const brandColor = MUSIC_SERVICE_BRAND_COLORS[provider.key];
          const selected = selectedService === provider.key;
          return (
            <TouchableOpacity
              key={provider.key}
              style={[styles.card, { borderColor: selected ? brandColor : colors.border }, selected && styles.cardSelected]}
              onPress={() => chooseProvider(provider.key)}
              accessibilityLabel={`${queue?.tracks.length ? 'Envoyer vers' : 'Ouvrir'} ${provider.name}`}
            >
              <View style={[styles.logo, { borderColor: brandColor }]}>
                <MusicServiceIcon service={provider.key} size={27} />
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{provider.name}</Text>
                  <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>SANS API</Text></View>
                </View>
                <Text style={styles.description}>{provider.shortDescription}</Text>
              </View>
              <View style={styles.openPill}><Text style={styles.openPillText}>{queue?.tracks.length ? 'CHOISIR' : 'OUVRIR'}</Text></View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Ce que KEEP fait automatiquement</Text>
          <Text style={styles.ruleText}>KEEP garde les morceaux, détecte les styles, construit les Vibes, les renomme avec toi et évite de mélanger tes collections. L’envoi vers Apple Music, Spotify, Deezer, YouTube Music, SoundCloud ou TIDAL utilise ensuite ce pont gratuit.</Text>
        </View>

        <View style={styles.limitCard}>
          <Text style={styles.limitTitle}>Limite réelle du mode sans API</Text>
          <Text style={styles.limitText}>KEEP peut ouvrir la recherche exacte et guider morceau par morceau. Il ne peut pas appuyer à ta place sur « Ajouter à la playlist » dans une application tierce sans passer par l’autorisation officielle de cette plateforme.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  backButton: { alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center' },
  back: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { color: '#E9E3F0', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  keylessCard: { backgroundColor: '#171020', borderWidth: 1, borderColor: '#6E4BA5', borderRadius: radius.lg, padding: spacing.md },
  keylessTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keylessBadge: { paddingHorizontal: 8, minHeight: 22, borderRadius: 11, backgroundColor: '#123D2C', borderWidth: 1, borderColor: '#38D990', alignItems: 'center', justifyContent: 'center' },
  keylessBadgeText: { color: '#8AF3BF', fontSize: 8, fontWeight: '900' },
  keylessTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  keylessText: { color: '#E2DAEA', fontSize: 11, lineHeight: 16, marginTop: 8 },
  exportCard: { backgroundColor: '#151020', borderRadius: radius.lg, borderWidth: 1, borderColor: '#8B5CF6', padding: spacing.md },
  exportEyebrow: { color: '#BFA9FF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  exportTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 3 },
  exportCount: { color: '#BEB4C9', fontSize: 10, marginTop: 2 },
  exportHint: { color: '#E2DAEA', fontSize: 11, lineHeight: 16, marginTop: 9 },
  currentTrackCard: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#0E0A14', borderWidth: 1, borderColor: '#3F3154' },
  exportProgressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exportProgress: { color: '#8AF3BF', fontSize: 9, fontWeight: '900' },
  destination: { color: '#BFA9FF', fontSize: 9, fontWeight: '900' },
  currentTrackTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 9 },
  currentTrackArtist: { color: '#BEB4C9', fontSize: 10, marginTop: 3 },
  openTrackButton: { marginTop: 12, minHeight: 44, borderRadius: 22, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  openTrackButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  nextButton: { marginTop: 8, minHeight: 40, borderRadius: 20, backgroundColor: '#123D2C', borderWidth: 1, borderColor: '#38D990', alignItems: 'center', justifyContent: 'center' },
  nextButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  changeButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  changeButtonText: { color: '#BFA9FF', fontSize: 9, fontWeight: '800' },
  sectionHeader: { marginTop: 2 },
  sectionTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  sectionHint: { color: '#BEB4C9', fontSize: 10, lineHeight: 14, marginTop: 2 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundCard, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  cardSelected: { backgroundColor: '#1B1326' },
  logo: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#0E0A14', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  freeBadge: { minHeight: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: '#123D2C', borderWidth: 1, borderColor: '#38D990', alignItems: 'center', justifyContent: 'center' },
  freeBadgeText: { color: '#8AF3BF', fontSize: 7, fontWeight: '900' },
  description: { color: '#D8D0E2', fontSize: 10, lineHeight: 14, marginTop: 3 },
  openPill: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center' },
  openPillText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  ruleCard: { backgroundColor: '#10251B', borderRadius: radius.lg, borderWidth: 1, borderColor: '#38D990', padding: spacing.lg, marginTop: spacing.sm },
  ruleTitle: { color: '#8AF3BF', fontSize: 13, fontWeight: '900' },
  ruleText: { color: '#FFFFFF', fontSize: 11, lineHeight: 17, marginTop: spacing.sm },
  limitCard: { backgroundColor: '#171020', borderRadius: radius.lg, borderWidth: 1, borderColor: '#493369', padding: spacing.lg },
  limitTitle: { color: '#BFA9FF', fontSize: 12, fontWeight: '900' },
  limitText: { color: '#E2DAEA', fontSize: 10, lineHeight: 16, marginTop: 6 },
});
