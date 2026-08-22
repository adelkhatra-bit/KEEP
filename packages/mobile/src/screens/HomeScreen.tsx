import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Modal, Alert, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../store/useSessionStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { musicEngine } from '../services/musicEngine';
import SessionPulse from '../components/SessionPulse';

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '00:00:00';
  const totalSec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Écran principal — SESSION KEEP (concept corrigé du 21/08/2026, design
 * compact revu le 22/08/2026 : une seule carte "morceau du moment" avec
 * GARDER/PASSER TOUJOURS visibles, aucun défilement requis pour l'action
 * principale — tout tient sur un écran iPhone. L'historique complet de la
 * session reste consultable au récapitulatif de fin de session, pas ici.
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
  const current = tracks[0];
  const isCurrentPending = current?.status === 'pending';

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

  const handleKeepPress = () => {
    if (!current) return;
    if (playlists.length <= 1) {
      keepTrack(current.id);
      return;
    }
    Alert.alert(
      t('session.chooseDestination'),
      undefined,
      playlists.map((p) => ({ text: p.name, onPress: () => keepTrack(current.id, p.id) }))
    );
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
        <View style={styles.liveHeaderRow}>
          <Text style={styles.liveTitle}>{t('session.inProgress')}</Text>
          <Text style={styles.timer}>{elapsed}</Text>
        </View>
        <Text style={styles.liveStats}>
          {t('session.detected', { count: detectedCount })} · {t('session.kept', { count: keptCount })}
        </Text>
      </View>

      <SessionPulse active />

      {error && (
        <View style={styles.liveErrorBanner}>
          <Text style={styles.liveErrorText}>{error}</Text>
        </View>
      )}

      <View style={styles.currentCardArea}>
        {isCurrentPending ? (
          <View style={styles.currentCard}>
            {current.track.artworkUrl ? (
              <Image source={{ uri: current.track.artworkUrl }} style={styles.currentArtwork} />
            ) : (
              <View style={[styles.currentArtwork, styles.currentArtworkPlaceholder]}>
                <Text style={styles.currentArtworkGlyph}>♪</Text>
              </View>
            )}
            <View style={styles.currentInfo}>
              <Text style={styles.currentTitle} numberOfLines={1}>{current.track.title}</Text>
              <Text style={styles.currentArtist} numberOfLines={1}>{current.track.artist}</Text>
              {current.recommendations[0] && (
                <Text style={styles.currentPlaylist} numberOfLines={1}>→ {current.recommendations[0].playlistName}</Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={styles.waitingText}>{t('session.waitingForMusic')}</Text>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.passBtn, !isCurrentPending && styles.actionBtnDisabled]}
            onPress={() => current && passTrack(current.id)}
            disabled={!isCurrentPending}
          >
            <Text style={styles.passBtnText}>✕ {t('listen.pass')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.keepBtn, !isCurrentPending && styles.actionBtnDisabled]}
            onPress={handleKeepPress}
            disabled={!isCurrentPending}
          >
            <Text style={styles.keepBtnText}>✓ {t('listen.keep')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.endButton} onPress={handleEndNow}>
          <Text style={styles.endButtonText}>{t('session.endNow')}</Text>
        </TouchableOpacity>
      </View>

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

  liveHeader: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs },
  liveHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  liveTitle: { fontSize: 12, color: colors.primaryLight, fontWeight: '700', letterSpacing: 1 },
  timer: { fontSize: 20, color: colors.textPrimary, fontWeight: '700', fontVariant: ['tabular-nums'] },
  liveStats: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  liveErrorBanner: {
    marginHorizontal: spacing.xl, marginTop: spacing.sm, marginBottom: spacing.xs,
    backgroundColor: 'rgba(255,92,114,0.12)', borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  liveErrorText: { color: colors.danger, fontSize: 12, textAlign: 'center' },

  currentCardArea: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg },
  waitingText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.backgroundCard, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  currentArtwork: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.backgroundElevated },
  currentArtworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  currentArtworkGlyph: { color: colors.textMuted, fontSize: 22 },
  currentInfo: { flex: 1, minWidth: 0 },
  currentTitle: { ...typography.bodyBold, fontSize: 16, color: colors.textPrimary },
  currentArtist: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
  currentPlaylist: { fontSize: 12, color: colors.smartBadgeText, marginTop: 2 },

  actionsRow: { flexDirection: 'row', gap: spacing.md },
  actionBtn: { flex: 1, paddingVertical: spacing.lg, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  actionBtnDisabled: { opacity: 0.35 },
  passBtn: { backgroundColor: colors.pass },
  passBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  keepBtn: { backgroundColor: colors.keep },
  keepBtnText: { color: colors.black, fontWeight: '700', fontSize: 16 },

  bottomRow: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm },
  endButton: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingVertical: spacing.md, alignItems: 'center', minHeight: 44, justifyContent: 'center',
  },
  endButtonText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },

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
