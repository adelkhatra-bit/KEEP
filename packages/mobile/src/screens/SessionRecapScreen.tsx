import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { musicEngine } from '../services/musicEngine';
import TrackRow from '../components/TrackRow';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

/**
 * "TA SESSION KEEP" — récapitulatif de fin de session. Les morceaux déjà
 * gardés/passés au fil de l'eau restent tels quels ; les morceaux encore
 * `pending` peuvent être traités ici : GARDER TOUT, sélection individuelle,
 * ou laissés en attente (traitables plus tard depuis l'historique — voir
 * SessionHistoryScreen, même mécanisme).
 */
export default function SessionRecapScreen({ route, navigation }: any) {
  const { t } = useTranslation();
  const sessionId: string = route.params?.sessionId;
  const session = useSessionHistoryStore((s) => s.sessions.find((x) => x.id === sessionId));
  const { keepTrackInSession, passTrackInSession, keepAllPendingInSession, renameSession } = useSessionHistoryStore();
  const { playlists } = usePlaylistStore();
  const [processing, setProcessing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(session?.title ?? '');

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('session.recapNotFound')}</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => navigation.navigate('Main')}>
            <Text style={styles.backLinkText}>← {t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const detectedCount = session.tracks.length;
  const keptCount = session.tracks.filter((tr) => tr.status === 'kept').length;
  const pendingCount = session.tracks.filter((tr) => tr.status === 'pending').length;

  const handleKeepAll = async () => {
    setProcessing(true);
    await keepAllPendingInSession(sessionId);
    setProcessing(false);
  };

  const handleTitleBlur = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== session.title) renameSession(sessionId, trimmed);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Main')} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('session.recapTitle')}</Text>
      </View>

      <TextInput
        style={styles.titleInput}
        value={titleDraft}
        onChangeText={setTitleDraft}
        onBlur={handleTitleBlur}
        placeholder={t('session.namePlaceholder')}
        placeholderTextColor={colors.textMuted}
      />

      <View style={styles.statsRow}>
        <Text style={styles.statsText}>{t('session.detected', { count: detectedCount })}</Text>
        <Text style={styles.statsDot}>·</Text>
        <Text style={[styles.statsText, styles.statsKept]}>{t('session.kept', { count: keptCount })}</Text>
      </View>

      {pendingCount > 0 && (
        <TouchableOpacity style={styles.keepAllButton} onPress={handleKeepAll} disabled={processing}>
          <Text style={styles.keepAllButtonText}>
            {processing ? '…' : `✓ ${t('session.keepAll', { count: pendingCount })}`}
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={session.tracks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TrackRow
            entry={item}
            playlists={playlists}
            onKeep={(entryId, playlistId) => keepTrackInSession(sessionId, entryId, playlistId)}
            onPass={(entryId) => passTrackInSession(sessionId, entryId)}
          />
        )}
      />

      {musicEngine.isDemoMode && (
        <View style={styles.demoBadge}>
          <Text style={styles.demoText}>{t('demo.badge')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyText: { color: colors.textSecondary, fontSize: 15, marginBottom: spacing.lg },
  backLink: { paddingVertical: spacing.sm },
  backLinkText: { color: colors.primaryLight, fontWeight: '700' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  backArrow: { color: colors.textPrimary, fontSize: 22 },
  title: { ...typography.h2, color: colors.textPrimary },
  titleInput: {
    marginHorizontal: spacing.xl, marginTop: spacing.sm,
    color: colors.textPrimary, fontSize: 15, fontWeight: '600',
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  statsText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  statsKept: { color: colors.keep },
  statsDot: { color: colors.textMuted },
  keepAllButton: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    backgroundColor: colors.keep, borderRadius: radius.lg,
    paddingVertical: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center',
  },
  keepAllButtonText: { color: colors.black, fontWeight: '700', fontSize: 15 },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  demoBadge: {
    marginHorizontal: spacing.xl, marginBottom: spacing.md,
    backgroundColor: colors.demoBadgeBg, borderWidth: 1, borderColor: colors.demoBadgeBorder,
    borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center',
  },
  demoText: { color: colors.demoBadgeText, fontSize: 11, fontWeight: '600' },
});
