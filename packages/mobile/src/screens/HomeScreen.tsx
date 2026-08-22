import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Modal, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../store/useSessionStore';
import { useMusicServiceStore } from '../store/useMusicServiceStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { musicEngine } from '../services/musicEngine';
import SessionPulse from '../components/SessionPulse';
import TrackRow from '../components/TrackRow';
import { AppAlert as Alert } from '../utils/AppAlert';

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '00:00:00';
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Écran principal — KEEP capture ce moment (parcours revu le 22/08/2026) :
 * un tap sur GARDER/PASSER, jamais de choix de playlist qui interrompt la
 * capture (cf. demande explicite "un seul clic maximum deux" et "je ne veux
 * pas être dirigé ailleurs") -- le tri/renommage se fait après coup, depuis
 * Mes musiques ou le récapitulatif. Tous les morceaux détectés restent
 * visibles en liste pendant la session, pas seulement le dernier.
 */
export default function HomeScreen({ navigation }: any) {
  const { t } = useTranslation();
  const {
    isActive, tracks, showEndPrompt, startedAt, error, micLevel,
    startSession, requestEndSession, dismissEndPrompt, keepTrack, passTrack,
  } = useSessionStore();
  const { connectedService, hasShownConnectPrompt, markConnectPromptShown, connectDemo } = useMusicServiceStore();
  const [elapsed, setElapsed] = useState(formatElapsed(startedAt));

  useEffect(() => {
    if (!isActive) return;
    setElapsed(formatElapsed(startedAt));
    const timer = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [isActive, startedAt]);

  const detectedCount = tracks.length;
  const keptCount = tracks.filter((tr) => tr.status === 'kept').length;
  // Une fois décidé (GARDER ou PASSER), le morceau disparaît immédiatement de
  // la liste active -- aucun défilement requis pour voir la suite (cf.
  // demande explicite du 22/08/2026). Le détail complet reste consultable au
  // récapitulatif de fin de session.
  const pendingTracks = tracks.filter((tr) => tr.status === 'pending');
  const decidedCount = tracks.length - pendingTracks.length;

  const finishSession = () => {
    const sessionId = requestEndSession();
    if (sessionId) {
      navigation.navigate('SessionRecap', { sessionId });
    } else {
      // 0 morceau détecté sur cette session -- rien à archiver, mais
      // l'utilisateur doit quand même avoir un retour (jamais de silence).
      Alert.alert(t('session.endNow'), t('session.emptySessionEnded'));
    }
  };

  const handleEndNow = () => finishSession();
  const handleConfirmEndFromPrompt = () => finishSession();

  const maybeShowConnectPrompt = () => {
    if (connectedService || hasShownConnectPrompt) return;
    markConnectPromptShown();
    const demoSuffix = musicEngine.isDemoMode ? ' (démo)' : '';
    Alert.alert(t('session.connectPromptTitle'), t('session.connectPromptBody'), [
      { text: `Apple Music${demoSuffix}`, onPress: () => (musicEngine.isDemoMode ? connectDemo('apple_music') : navigation.navigate('AppleMusicConnect')) },
      { text: `Spotify${demoSuffix}`, onPress: () => (musicEngine.isDemoMode ? connectDemo('spotify') : navigation.navigate('SpotifyConnect')) },
      { text: `YouTube Music${demoSuffix}`, onPress: () => (musicEngine.isDemoMode ? connectDemo('youtube_music') : Alert.alert(t('common.notConnected'), 'YouTube Music n’est pas encore branché.')) },
      { text: t('session.later'), style: 'cancel' },
    ]);
  };

  // Simple tap = garder au fil de l'eau (jamais de choix de playlist ici,
  // cf. commentaire d'en-tête) ; propose une fois de connecter un service
  // seulement si ce KEEP vient de partir en "waiting to sync".
  const handleKeepPress = (entryId: string) => {
    keepTrack(entryId).then(maybeShowConnectPrompt);
  };

  if (!isActive) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.idleHeader}>
          <Text style={styles.brand}>KEEP</Text>
          <TouchableOpacity onPress={() => navigation.navigate('SessionHistory')} hitSlop={8}>
            <Text style={styles.historyLink}>🕐 {t('history.title')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.idleBody}>
          <SessionPulse active={false} />
          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity style={styles.startButton} onPress={startSession}>
            <Text style={styles.startButtonText}>{t('session.start')}</Text>
          </TouchableOpacity>
          <Text style={styles.idleSubtitle}>{t('session.emptySubtitle')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.liveHeader}>
        <SessionPulse active level={musicEngine.isRealRecognition ? micLevel : undefined} />
        <Text style={styles.liveTitle}>{t('session.inProgress')}</Text>
        <View style={styles.liveHeaderRow}>
          <Text style={styles.timer}>{elapsed}</Text>
          <Text style={styles.liveStats}>
            {t('session.detected', { count: detectedCount })} · {t('session.kept', { count: keptCount })}
          </Text>
        </View>
      </View>

      {error && (
        <View style={styles.liveErrorBanner}>
          <Text style={styles.liveErrorText}>{error}</Text>
        </View>
      )}

      {pendingTracks.length === 0 ? (
        <Text style={styles.waitingText}>{t('session.waitingForMusic')}</Text>
      ) : (
        <FlatList
          data={pendingTracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <TrackRow entry={item} onKeep={handleKeepPress} onPass={passTrack} />}
        />
      )}

      {decidedCount > 0 && (
        <Text style={styles.decidedSummary}>
          {t('session.kept', { count: keptCount })} · {decidedCount - keptCount} {t('listen.pass').toLowerCase()}
        </Text>
      )}

      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.endButton} onPress={handleEndNow}>
          <Text style={styles.endButtonText}>■ {t('session.endNow')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showEndPrompt} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('session.endPromptTitle')}</Text>
            <Text style={styles.modalBody}>{t('session.endPromptBody')}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalContinueBtn} onPress={dismissEndPrompt}>
                <Text style={styles.modalContinueText}>{t('session.continueListening')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalEndBtn} onPress={handleConfirmEndFromPrompt}>
                <Text style={styles.modalEndText}>{t('session.endNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  idleHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
  },
  brand: { ...typography.h2, color: colors.textPrimary, letterSpacing: 1 },
  historyLink: { color: colors.primaryLight, fontSize: 13, fontWeight: '600' },
  idleBody: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  idleSubtitle: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center',
    marginTop: spacing.md, paddingHorizontal: spacing.lg,
  },
  errorText: { fontSize: 13, color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  startButton: {
    backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill, minHeight: 48, justifyContent: 'center', marginTop: spacing.xl,
  },
  startButtonText: { color: colors.white, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },

  liveHeader: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.sm },
  liveTitle: { fontSize: 13, color: colors.primaryLight, fontWeight: '700', marginTop: spacing.sm },
  liveHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: 2 },
  timer: { fontSize: 15, color: colors.textPrimary, fontWeight: '700', fontVariant: ['tabular-nums'] },
  liveStats: { fontSize: 12, color: colors.textSecondary },
  liveErrorBanner: {
    marginHorizontal: spacing.xl, marginTop: spacing.sm, marginBottom: spacing.xs,
    backgroundColor: 'rgba(255,92,114,0.12)', borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  liveErrorText: { color: colors.danger, fontSize: 12, textAlign: 'center' },

  waitingText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xxl },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  decidedSummary: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: spacing.xs },

  bottomRow: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, paddingTop: spacing.xs, gap: spacing.sm },
  endButton: {
    backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingVertical: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center',
  },
  endButtonText: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  modalBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  modalActions: { gap: spacing.md },
  modalContinueBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  modalContinueText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  modalEndBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  modalEndText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
});
