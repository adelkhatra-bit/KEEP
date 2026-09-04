import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
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
import {
  importProviderFavorites,
  ImportProvider,
  loadProviderConnectionStates,
  ProviderConnectionMap,
  startProviderConnection,
  SyncProvider,
} from '../services/musicProviderSyncService';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

const EMPTY_SELECTION: MusicServiceSelectionState = { services: [], used: 0, limit: 1, plan: 'FREE' };
const EMPTY_PROVIDER_CONNECTIONS: ProviderConnectionMap = {
  spotify: { configured: false, connected: false, connection: null },
  deezer: { configured: false, connected: false, connection: null },
  youtube_music: { configured: false, connected: false, connection: null },
  soundcloud: { configured: false, connected: false, connection: null },
};

type ActivationPrompt = { service: MusicServiceKey; name: string };

function isSyncProvider(service: MusicServiceKey): service is SyncProvider {
  return service === 'spotify' || service === 'deezer' || service === 'youtube_music' || service === 'soundcloud';
}

function isImportProvider(service: SyncProvider): service is ImportProvider {
  return service === 'spotify' || service === 'deezer';
}

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

function showMessage(title: string, message: string) {
  Alert.alert(title, message);
}

export default function MusicConnectionsScreen({ navigation }: any) {
  const [queue, setQueue] = useState<KeylessExportQueue | null>(null);
  const [selection, setSelection] = useState<MusicServiceSelectionState>(EMPTY_SELECTION);
  const [providerConnections, setProviderConnections] = useState<ProviderConnectionMap>(EMPTY_PROVIDER_CONNECTIONS);
  const [selectionLoading, setSelectionLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<MusicServiceKey | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState<SyncProvider | null>(null);
  const [activatingService, setActivatingService] = useState<MusicServiceKey | null>(null);
  const [activationPrompt, setActivationPrompt] = useState<ActivationPrompt | null>(null);

  const refresh = useCallback(async () => {
    const [nextQueue, nextSelection, nextConnections] = await Promise.all([
      loadKeylessMusicExport(),
      loadMusicServiceSelections().catch(() => EMPTY_SELECTION),
      loadProviderConnectionStates().catch(() => EMPTY_PROVIDER_CONNECTIONS),
    ]);
    setQueue(nextQueue);
    setSelection(nextSelection);
    setProviderConnections(nextConnections);
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
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      if (/^keep:\/\/music-connections/i.test(url)) void refresh();
    });
    return () => {
      unsubscribe?.();
      linkSubscription.remove();
    };
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

  const connectProvider = async (provider: SyncProvider, name: string) => {
    if (providerBusy || busy) return;
    setProviderBusy(provider);
    try {
      const state = providerConnections[provider];
      if (!state.configured) {
        showMessage('Connexion fournisseur', `${name} n’est pas encore configuré dans le Super Admin Loki.`);
        return;
      }
      await startProviderConnection(provider);
    } catch (error: any) {
      const message = String(error?.message || 'Connexion impossible.');
      showMessage('Connexion fournisseur', message.includes('AUTH_REQUIRED') ? 'Connecte d’abord ton compte Loki.' : message);
    } finally {
      setProviderBusy(null);
    }
  };

  const importFavorites = async (provider: ImportProvider, name: string) => {
    if (providerBusy || busy) return;
    setProviderBusy(provider);
    try {
      const result = await importProviderFavorites(provider);
      showMessage('Bibliothèque Loki', `${result.imported} favori${result.imported > 1 ? 's' : ''} ${name} synchronisé${result.imported > 1 ? 's' : ''}. Ils restent privés par défaut tant que tu ne choisis pas de les partager.`);
      await refresh();
    } catch (error: any) {
      showMessage('Import impossible', String(error?.message || 'Impossible d’importer cette bibliothèque.'));
    } finally {
      setProviderBusy(null);
    }
  };

  const openOffers = () => navigation.navigate('Offers', { focusPlan: nextPlan(selection.plan), sourceFeature: 'MUSIC_SERVICES' });

  const showUpgrade = () => {
    if (selection.plan === 'VENUE_PRO') {
      Alert.alert('Tous tes services sont déjà disponibles', 'Venue Pro permet d’utiliser tous les services musicaux proposés par Loki.');
      return;
    }

    const message = `${musicServicePlanLabel(selection.plan)} permet ${selection.limit} service${selection.limit > 1 ? 's' : ''}.\n\n${nextPlanLabel(selection.plan)}.`;
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

      const verified = await loadMusicServiceSelections();
      setSelection(verified);
      if (!verified.services.includes(service)) throw new Error('ACTIVATION_NOT_PERSISTED');

      if (isSyncProvider(service)) {
        const state = providerConnections[service];
        if (state.configured && !state.connected) {
          try {
            await startProviderConnection(service);
          } catch (oauthError: any) {
            showMessage('Service Loki activé', `${name} est bien réservé dans Loki. La connexion du compte fournisseur n’a pas pu démarrer : ${String(oauthError?.message || 'réessaie plus tard')}`);
          }
        } else if (state.connected) {
          showMessage('Service déjà connecté', `${name} est actif et ton compte fournisseur est déjà relié à Loki.`);
        } else {
          showMessage('Service Loki activé', `${name} est actif dans Loki. Ajoute ses identifiants dans le Super Admin pour permettre la connexion OAuth et l’import automatique.`);
        }
        return true;
      }

      useConnectedService(service);
      return true;
    } catch (e: any) {
      const text = e?.message?.includes('AUTH_REQUIRED')
        ? 'Connecte ton compte Loki pour choisir tes services musicaux.'
        : 'Impossible d’activer ce service pour le moment.';
      Alert.alert('Loki', text);
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
        Alert.alert('Service réservé', message, [
          { text: 'Fermer', style: 'cancel' },
          { text: 'Voir les offres', onPress: openOffers },
        ]);
        return;
      }

      if (isSyncProvider(service)) {
        const providerState = providerConnections[service];
        if (!providerState.connected) {
          void connectProvider(service, name);
          return;
        }
        if (!queue?.tracks.length && isImportProvider(service)) {
          void importFavorites(service, name);
          return;
        }
      }

      useConnectedService(service);
      return;
    }

    if (selection.used >= selection.limit) {
      showUpgrade();
      return;
    }

    setActivationPrompt({ service, name });
  };

  const finishExport = async () => {
    await clearKeylessMusicExport();
    setQueue(null);
    setSelectedService(null);
    setTrackIndex(0);
    Alert.alert('Loki', 'C’est terminé. Tes Vibes restent rangées dans Loki.');
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
        <TouchableOpacity style={styles.backButton} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} hitSlop={8}>
          <Text style={styles.back}>‹ Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Services musicaux</Text>
        <Text style={styles.subtitle}>Loki range ta musique. Choisis ensuite les services que tu utilises vraiment.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.keylessCard}>
          <View style={styles.keylessTop}>
            <View style={styles.keylessBadge}><Text style={styles.keylessBadgeText}>{musicServicePlanLabel(selection.plan).toUpperCase()}</Text></View>
            <Text style={styles.keylessTitle}>{selectionLoading ? 'Chargement…' : `${selection.used} / ${selection.limit} service${selection.limit > 1 ? 's' : ''} choisi${selection.used > 1 ? 's' : ''}`}</Text>
          </View>
          <Text style={styles.keylessText}>Tes choix restent attachés à ton compte. Plus ta formule évolue, plus Loki te laisse utiliser de services en parallèle.</Text>
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
              <Text style={styles.exportHint}>Choisis un de tes services actifs. Loki gardera la file prête pendant que tu passes dans l’autre application.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{queue?.tracks.length && !selectedService ? 'Choisir la destination' : 'Tes services'}</Text>
          <Text style={styles.sectionHint}>ACTIF = réservé par ta formule · CONNECTÉ = compte fournisseur OAuth réellement relié.</Text>
        </View>

        {KEYLESS_MUSIC_SERVICES.map((provider) => {
          const brandColor = MUSIC_SERVICE_BRAND_COLORS[provider.key];
          const claimed = selection.services.includes(provider.key);
          const active = claimed && activeServices.has(provider.key);
          const slotFull = !claimed && selection.used >= selection.limit;
          const reserved = claimed && !active;
          const selected = selectedService === provider.key;
          const activating = activatingService === provider.key;
          const syncProvider = isSyncProvider(provider.key) ? provider.key : null;
          const providerState = syncProvider ? providerConnections[syncProvider] : null;
          const connected = Boolean(providerState?.connected);
          const providerActionBusy = syncProvider === providerBusy;
          const activeDescription = connected
            ? (queue?.tracks.length ? `${provider.name} connecté · sélectionne-le comme destination.` : `${provider.name} connecté · touche pour importer ou actualiser tes favoris dans Loki.`)
            : syncProvider && providerState?.configured
              ? `${provider.shortDescription} · touche pour connecter ton compte ${provider.name}.`
              : syncProvider
                ? `${provider.shortDescription} · configuration fournisseur requise dans le Super Admin.`
                : provider.shortDescription;
          const actionLabel = activating || providerActionBusy
            ? 'PATIENTER…'
            : active
              ? connected
                ? (queue?.tracks.length ? 'CHOISIR' : syncProvider && isImportProvider(syncProvider) ? 'IMPORTER' : 'OUVRIR')
                : syncProvider ? 'CONNECTER' : (queue?.tracks.length ? 'CHOISIR' : 'OUVRIR')
              : slotFull || reserved ? '🔒' : 'ACTIVER';

          return (
            <TouchableOpacity
              key={provider.key}
              style={[styles.card, { borderColor: active ? brandColor : selected ? brandColor : colors.border }, (selected || active) && styles.cardSelected]}
              onPress={() => confirmService(provider.key, provider.name)}
              disabled={Boolean(activatingService || providerBusy)}
              accessibilityLabel={`${active ? actionLabel : 'Choisir'} ${provider.name}`}
            >
              <View style={[styles.logo, { borderColor: brandColor }]}>
                <MusicServiceIcon service={provider.key} size={27} />
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{provider.name}</Text>
                  {active ? <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIF</Text></View> : null}
                  {connected ? <View style={styles.connectedBadge}><Text style={styles.connectedBadgeText}>CONNECTÉ</Text></View> : null}
                  {reserved ? <View style={styles.lockBadge}><Text style={styles.lockBadgeText}>🔒 RÉSERVÉ</Text></View> : null}
                </View>
                <Text style={styles.description}>{active ? activeDescription : reserved ? 'Ce choix est conservé. Réactive-le en retrouvant une formule compatible.' : slotFull ? `🔒 ${nextPlanLabel(selection.plan)}` : 'Choisis ce service pour l’associer à ton compte Loki.'}</Text>
              </View>
              <View style={[styles.openPill, (slotFull || reserved) && styles.lockPill, (activating || providerActionBusy) && styles.activatingPill]}><Text style={styles.openPillText}>{actionLabel}</Text></View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>Loki range pour toi</Text>
          <Text style={styles.ruleText}>Styles, Vibes, artistes et albums restent organisés dans Loki. Spotify et Deezer peuvent importer les favoris en métadonnées privées. YouTube Music et SoundCloud utilisent la passerelle sécurisée sans transmettre ton mot de passe à Loki.</Text>
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
  currentTrackArtist: { color:'#FFFFFF', fontSize: 12, marginTop: 3 },
  openTrackButton: { marginTop: 12, minHeight: 44, borderRadius: 22, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  openTrackButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  nextButton: { marginTop: 8, minHeight: 40, borderRadius: 20, backgroundColor: '#123D2C', borderWidth: 1, borderColor: '#38D990', alignItems: 'center', justifyContent: 'center' },
  nextButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
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
  connectedBadge: { minHeight: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: '#172A45', borderWidth: 1, borderColor: '#75B7FF', alignItems: 'center', justifyContent: 'center' },
  connectedBadgeText: { color: '#FFFFFF', fontSize: 7, fontWeight: '900' },
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
