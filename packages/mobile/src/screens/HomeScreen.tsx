import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../store/useSessionStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { musicEngine } from '../services/musicEngine';
import SessionPulse from '../components/SessionPulse';
import TrackRow from '../components/TrackRow';

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '00:00:00';
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Écran principal — SESSION KEEP (concept corrigé du 21/08/2026).
 * KEEP n'est pas un lecteur : cet écran démarre/pilote une session pendant
 * laquelle KEEP identifie successivement les morceaux entendus, jusqu'à
 * ce que l'utilisateur (ou le silence prolongé) y mette fin.
 */
export default function HomeScreen({ navigation }: any) {
  const { t } = useTranslation();
  const {
    isActive, tracks, showEndPrompt, startedAt, error,
    startSession, requestEndSession, dismissEndPrompt, keepTrack, passTrack,
  } = useSessionStore();
  const { playlists, refresh } = usePlaylistStore();
  const [elapsed, setElapsed] = useState(formatElapsed(startedAt));

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isActive) return;
    setElapsed(formatElapsed(startedAt));
    const timer = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => clearInterval(timer);
  }, [isActive, startedAt]);

  const detectedCount = tracks.length;
  const keptCount = tracks.filter((tr) => tr.status === 'kept').length;

  const handleEndNow = () => {
    const sessionId = requestEndSession();
    if (sessionId) navigation.navigate('SessionRecap', { sessionId });
  };

  const handleConfirmEndFromPrompt = () => {
    const sessionId = requestEndSession();
    if (sessionId) navigation.navigate('SessionRecap', { sessionId });
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
          <Text style={styles.idleTitle}>{t('session.emptyTitle')}</Text>
          <Text style={styles.idleSubtitle}>{t('session.emptySubtitle')}</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity style={styles.startButton} onPress={startSession}>
            <Text style={styles.startButtonText}>{t('session.start')}</Text>
          </TouchableOpacity>

          {musicEngine.isDemoMode && (
            <View style={styles.demoBadge}>
              <Text style={styles.demoText}>{t('demo.badge')}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.liveHeader}>
        <Text style={styles.liveTitle}>{t('session.inProgress')}</Text>
        <Text style={styles.timer}>{elapsed}</Text>
        <Text style={styles.liveStats}>
          {t('session.detected', { count: detectedCount })} · {t('session.kept', { count: keptCount })}
        </Text>
      </View>

      <SessionPulse active />

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.waitingText}>{t('session.waitingForMusic')}</Text>}
        renderItem={({ item }) => (
          <TrackRow entry={item} playlists={playlists} onKeep={keepTrack} onPass={passTrack} />
        )}
      />

      <TouchableOpacity style={styles.endButton} onPress={handleEndNow}>
        <Text style={styles.endButtonText}>{t('session.endNow')}</Text>
      </TouchableOpacity>

      {musicEngine.isDemoMode && (
        <View style={styles.demoBadge}>
          <Text style={styles.demoText}>{t('demo.badge')}</Text>
        </View>
      )}

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
  idleTitle: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.xl, textAlign: 'center' },
  idleSubtitle: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center',
    marginTop: spacing.sm, marginBottom: spacing.xxl, paddingHorizontal: spacing.lg,
  },
  errorText: { fontSize: 13, color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  startButton: {
    backgroundColor: colors.primary, paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill, minHeight: 52, justifyContent: 'center',
  },
  startButtonText: { color: colors.white, fontWeight: '700', fontSize: 16, letterSpacing: 0.5 },

  liveHeader: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.sm },
  liveTitle: { fontSize: 13, color: colors.primaryLight, fontWeight: '700', letterSpacing: 1 },
  timer: { fontSize: 34, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
  liveStats: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },

  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  waitingText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },

  endButton: {
    marginHorizontal: spacing.xl, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingVertical: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center',
  },
  endButtonText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },

  demoBadge: {
    marginHorizontal: spacing.xl, marginBottom: spacing.md,
    backgroundColor: colors.demoBadgeBg, borderWidth: 1, borderColor: colors.demoBadgeBorder,
    borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center',
  },
  demoText: { color: colors.demoBadgeText, fontSize: 11, fontWeight: '600' },

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
