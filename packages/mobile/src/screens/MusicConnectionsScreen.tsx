import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MusicServiceIcon, { MUSIC_SERVICE_BRAND_COLORS } from '../components/MusicServiceIcon';
import MusicServiceActivationModal from '../components/MusicServiceActivationModal';
import {
  clearKeylessMusicExport,
  KEYLESS_MUSIC_SERVICES,
  KeylessExportQueue,
  loadKeylessMusicExport,
  MusicServiceKey,
  openMusicService,
} from '../services/keylessMusicBridge';
import {
  claimMusicService,
  loadMusicServiceSelections,
  musicServicePlanLabel,
  MusicServiceSelectionState,
} from '../services/musicServiceSelectionService';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

const EMPTY_SELECTION: MusicServiceSelectionState = { services: [], used: 0, limit: 1, plan: 'FREE' };

type ActivationPrompt = { service: MusicServiceKey; name: string };

function nextPlan(plan: MusicServiceSelectionState['plan']) {
  if (plan === 'FREE') return 'PREMIUM';
  if (plan === 'PREMIUM') return 'CREATOR_PRO';
  return 'VENUE_PRO';
}

function nextPlanLabel(plan: MusicServiceSelectionState['plan']) {
  if (plan === 'FREE') return 'Premium 2,99 € · jusqu’à 3 services';
  if (plan === 'PREMIUM') return 'Creator Pro 9,99 € · jusqu’à 5 services';
  return 'Venue Pro 29,99 € · tous les services';
}

export default function MusicConnectionsScreen({ navigation }: any) {
  const [queue, setQueue] = useState<KeylessExportQueue | null>(null);
  const [selection, setSelection] = useState<MusicServiceSelectionState>(EMPTY_SELECTION);
  const [selectionLoading, setSelectionLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<MusicServiceKey | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [activatingService, setActivatingService] = useState<MusicServiceKey | null>(null);
  const [activationPrompt, setActivationPrompt] = useState<ActivationPrompt | null>(null);

  const refresh = useCallback(async () => {
    const [nextQueue, nextSelection] = await Promise.all([
      loadKeylessMusicExport(),
      loadMusicServiceSelections().catch(() => EMPTY_SELECTION),
    ]);
    setQueue(nextQueue);
    setSelection(nextSelection);
    setSelectionLoading(false);
    if (!nextQueue?.tracks.length) {
      setSelectedService(null);
      setTrackIndex(0);
    } else {
      setTrackIndex((value) => Math.min(value, nextQueue.tracks.length - 1));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refresh(); });
    return () => unsubscribe?.();
  }, [navigation, refresh]);

  const currentTrack = useMemo(() => queue?.tracks[trackIndex] ?? null, [queue, trackIndex]);
  const selectedName = KEYLESS_MUSIC_SERVICES.find((item) => item.key === selectedService)?.name ?? '';
  const activeServices = useMemo(() => new Set(selection.services.slice(0, selection.limit)), [selection]);

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

  const useConnectedService = (service: MusicServiceKey) => {
    if (queue?.tracks.length) {
      setSelectedService(service);
      setTrackIndex(0);
      return;
    }
    void openProvider(service);
  };

  const openOffers = () => navigation.navigate('Offers', { focusPlan: nextPlan(selection.plan), sourceFeature: 'MUSIC_SERVICES' });

  const showUpgrade = () => {
    if (selection.plan === 'VENUE_PRO') {
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert('Tous tes services sont déjà disponibles avec Venue Pro.');
      else Alert.alert('Tous tes services sont déjà disponibles', 'Venue Pro permet d’utiliser tous les services musicaux proposés par KEEP.');
      return;
    }

    const message = `${musicServicePlanLabel(selection.plan)} permet ${selection.limit} service${selection.limit > 1 ? 's' : ''}.\n\n${nextPlanLabel(selection.plan)}.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${message}\n\nVoir la formule ?`)) openOffers();
      return;
    }
    Alert.alert('Tous tes emplacements sont utilisés', message, [
      { text: 'Plus tard', style: 'cancel' },
      { text: 'Voir la formule', onPress: openOffers },
    ]);
  };

  const activateService = async (service: MusicServiceKey, name: string): Promise<boolean> => {
    if (activatingService || busy) return false;
    setActivatingService(service);
    try {
      const result = await claimMusicService(service);
      const nextSelection = { services: result.services, used: result.used, limit: result.limit, plan: result.plan };
      setSelection(nextSelection);
      if (!result.ok && result.error === 'SERVICE_LIMIT_REACHED') {
        showUpgrade();
        return false;
      }
      if (!result.ok) throw new Error(result.error || 'ACTIVATION_FAILED');

      // Relire Supabase avant d'annoncer l'activation : le bouton ACTIF ne doit
      // jamais être seulement cosmétique.
      const verified = await loadMusicServiceSelections();
      setSelection(verified);
      if (!verified.services.includes(service)) throw new Error('ACTIVATION_NOT_PERSISTED');

      useConnectedService(service);
      return true;
    } catch (e: any) {
      const text = e?.message?.includes('AUTH_REQUIRED')
        ? 'Connecte ton compte KEEP pour choisir tes services musicaux.'
        : 'Impossible d’activer ce service pour le moment.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(text);
      else Alert.alert('KEEP', text);
      return false;
    } finally {
      setActivatingService(null);
    }
  };

  const confirmService = (service: MusicServiceKey, name: string) => {
    const alreadyClaimed = selection.services.includes(service);
    if (alreadyClaimed) {
      if (!activeServices.has(service)) {
        const message = `${name} reste associé à ton compte, mais ta formule actuelle ne permet d’utiliser que ${selection.limit} service${selection.limit > 1 ? 's' : ''}.`;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          if (window.confirm(`${message}\n\nVoir les offres ?`)) openOffers();
        } else {
          Alert.alert('Service réservé', message, [
            { text: 'Fermer', style: 'cancel' },
            { text: 'Voir les offres', onPress: openOffers },
          ]);
        }
        return;
      }
      useConnectedService(service);
      return;
    }

    if (selection.used >= selection.limit) {
      showUpgrade();
      return;
    }

    // Un même popup KEEP est utilisé sur Web, iOS et Android. Le choix n'est
    // enregistré qu'après confirmation explicite de l'utilisateur.
    setActivationPrompt({ service, name });
  };

  const finishExport = async () => {
    await clearKeylessMusicExport();
    setQueue(null);
    setSelectedService(null);
    setTrackIndex(0);
    Alert.alert('KEEP', 'C’est terminé. Tes Vibes restent rangées dans KEEP.');
  };

  const nextTrack = async () => {
    if (!queue?.tracks.length) return;
    if (trackIndex >= queue.tracks.length - 1) {
      await finishExport();
      return;
    }
    setTrackIndex((value) => value + 1);
  };

  const confirmActivationPrompt = () => {
    if (!activationPrompt || activatingService) return;
    const pending = activationPrompt;
    void activateService(pending.service, pending.name).then((ok) => {
      if (ok) setActivationPrompt(null);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹ Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Services musicaux</Text>
        <Text style={styles.subtitle}>KEEP range ta musique. Choisis ensuite les services que tu utilises vraiment.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.keylessCard}>
          <View style={styles.keylessTop}>
            <View style={styles.keylessBadge}><Text style={styles.keylessBadgeText}>{musicServicePlanLabel(selection.plan).toUpperCase()}</Text></View>
            <Text style={styles.keylessTitle}>{selectionLoading ? 'Chargement…' : `${selection.used} / ${selection.limit} service${selection.limit > 1 ? 's' : ''} choisi${selection.used > 1 ? 's' : ''}`}</Text>
          </View>
          <Text style={styles.keylessText}>Tes choix restent attachés à ton compte. Plus ta formule évolue, plus KEEP te laisse utiliser de services en parallèle.</Text>
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
                  <Text style={styles.changeButtonText}>Changer de service actif</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.exportHint}>Choisis un de tes services actifs. KEEP gardera la file prête pendant que tu passes dans l’autre application.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{queue?.tracks.length && !selectedService ? 'Choisir la destination' : 'Tes services'}</Text>
          <Text style={styles.sectionHint}>Actif = déjà choisi · cadenas = ta formule doit évoluer ou l’emplacement est déjà utilisé.</Text>
        </View>

        {KEYLESS_MUSIC_SERVICES.map((provider) => {
          const brandColor = MUSIC_SERVICE_BRAND_COLORS[provider.key];
          const claimed = selection.services.includes(provider.key);
          const active = claimed && activeServices.has(provider.key);
          const slotFull = !claimed && selection.used >= selection.limit;
          const reserved = claimed && !active;
          const selected = selectedService === provider.key;
          const activating = activatingService === provider.key;
          return (
            <TouchableOpacity
              key={provider.key}
              style={[styles.card, { borderColor: active ? brandColor : selected ? brandColor : colors.border }, (selected || active) && styles.cardSelected]}
              onPress={() => confirmService(provider.key, provider.name)}
              disabled={Boolean(activatingService)}
              accessibilityLabel={`${active ? 'Ouvrir' : 'Choisir'} ${provider.name}`}
            >
              <View style={[styles.logo, { borderColor: brandColor }]}>
                <MusicServiceIcon service={provider.key} size={27} />
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{provider.name}</Text>
                  {active ? <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIF</Text></View> : null}
                  {reserved ? <View style={styles.lockBadge}><Text style={styles.lockBadgeText}>🔒 RÉSERVÉ</Text></View> : null}
                </View>
                <Text style={styles.description}>{active ? provider.shortDescription : reserved ? 'Ce choix est conservé. Réactive-le en retrouvant une formule compatible.' : slotFull ? `🔒 ${nextPlanLabel(selection.plan)}` : 'Choisis ce service pour l’associer à ton compte KEEP.'}</Text>
              </View>
              <View style={[styles.openPill, (slotFull || reserved) && styles.lockPill, activating && styles.activatingPill]}><Text style={styles.openPillText}>{activating ? 'ACTIVATION…' : active ? (queue?.tracks.length ? 'CHOISIR' : 'OUVRIR') : slotFull || reserved ? '🔒' : 'ACTIVER'}</Text></View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>KEEP range pour toi</Text>
          <Text style={styles.ruleText}>Styles, Vibes, artistes et albums restent organisés dans KEEP. Tu peux renommer tes Vibes, les swiper et choisir ensuite où retrouver chaque morceau.</Text>
        </View>

        <View style={styles.limitCard}>
          <Text style={styles.limitTitle}>Tes emplacements</Text>
          <Text style={styles.limitText}>FREE : 1 service · Premium 2,99 € : 3 · Creator Pro 9,99 € : 5 · Venue Pro 29,99 € : tous les services. Un service confirmé garde sa place sur ton compte.</Text>
        </View>
      </ScrollView>

      <MusicServiceActivationModal
        visible={Boolean(activationPrompt)}
        service={activationPrompt?.service ?? null}
        name={activationPrompt?.name ?? ''}
        planLabel={musicServicePlanLabel(selection.plan)}
        remainingAfter={Math.max(0, selection.limit - selection.used - 1)}
        busy={Boolean(activationPrompt && activatingService === activationPrompt.service)}
        onCancel={() => { if (!activatingService) setActivationPrompt(null); }}
        onConfirm={confirmActivationPrompt}
      />
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
  keylessTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  keylessBadge: { paddingHorizontal: 8, minHeight: 22, borderRadius: 11, backgroundColor: '#123D2C', borderWidth: 1, borderColor: '#38D990', alignItems: 'center', justifyContent: 'center' },
  keylessBadgeText: { color: '#8AF3BF', fontSize: 8, fontWeight: '900' },
  keylessTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  keylessText: { color: '#E2DAEA', fontSize: 11, lineHeight: 16, marginTop: 8 },
  exportCard: { backgroundColor: '#151020', borderRadius: radius.lg, borderWidth: 1, borderColor: '#8B5CF6', padding: spacing.md },
  exportEyebrow: { color: '#BFA9FF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  exportTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 3 },
  exportCount: { color:'#FFFFFF', fontSize: 10, marginTop: 2 },
  exportHint: { color: '#E2DAEA', fontSize: 11, lineHeight: 16, marginTop: 9 },
  currentTrackCard: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#0E0A14', borderWidth: 1, borderColor: '#3F3154' },
  exportProgressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exportProgress: { color: '#8AF3BF', fontSize: 9, fontWeight: '900' },
  destination: { color: '#BFA9FF', fontSize: 9, fontWeight: '900' },
  currentTrackTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 9 },
  currentTrackArtist: { color:'#FFFFFF', fontSize: 10, marginTop: 3 },
  openTrackButton: { marginTop: 12, minHeight: 44, borderRadius: 22, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  openTrackButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  nextButton: { marginTop: 8, minHeight: 40, borderRadius: 20, backgroundColor: '#123D2C', borderWidth: 1, borderColor: '#38D990', alignItems: 'center', justifyContent: 'center' },
  nextButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  changeButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  changeButtonText: { color: '#BFA9FF', fontSize: 9, fontWeight: '800' },
  sectionHeader: { marginTop: 2 },
  sectionTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  sectionHint: { color:'#FFFFFF', fontSize: 10, lineHeight: 14, marginTop: 2 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundCard, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  cardSelected: { backgroundColor: '#1B1326' },
  logo: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#0E0A14', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  activeBadge: { minHeight: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: '#123D2C', borderWidth: 1, borderColor: '#38D990', alignItems: 'center', justifyContent: 'center' },
  activeBadgeText: { color: '#8AF3BF', fontSize: 7, fontWeight: '900' },
  lockBadge: { minHeight: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: '#2B2038', borderWidth: 1, borderColor: '#6E4BA5', alignItems: 'center', justifyContent: 'center' },
  lockBadgeText: { color: '#D9C7FF', fontSize: 7, fontWeight: '900' },
  description: { color:'#FFFFFF', fontSize: 10, lineHeight: 14, marginTop: 3 },
  openPill: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center' },
  lockPill: { backgroundColor: '#21182F', borderColor: '#6E4BA5' },
  activatingPill: { backgroundColor: '#123D2C', borderColor: '#38D990' },
  openPillText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  ruleCard: { backgroundColor: '#10251B', borderRadius: radius.lg, borderWidth: 1, borderColor: '#38D990', padding: spacing.lg, marginTop: spacing.sm },
  ruleTitle: { color: '#8AF3BF', fontSize: 13, fontWeight: '900' },
  ruleText: { color: '#FFFFFF', fontSize: 11, lineHeight: 17, marginTop: spacing.sm },
  limitCard: { backgroundColor: '#171020', borderRadius: radius.lg, borderWidth: 1, borderColor: '#493369', padding: spacing.lg },
  limitTitle: { color: '#BFA9FF', fontSize: 12, fontWeight: '900' },
  limitText: { color: '#E2DAEA', fontSize: 10, lineHeight: 16, marginTop: 6 },
});