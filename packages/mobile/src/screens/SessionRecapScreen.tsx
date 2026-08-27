import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, View, Text, StyleSheet, TouchableOpacity, SafeAreaView, FlatList, TextInput } from 'react-native';
import type { CanonicalTrack } from '@keep/music';
import { useTranslation } from 'react-i18next';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { musicEngine } from '../services/musicEngine';
import { shareSession } from '../services/sharingService';
import TrackRow from '../components/TrackRow';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

export default function SessionRecapScreen({ route, navigation }: any) {
  const { t } = useTranslation();
  const sessionId: string = route.params?.sessionId;
  const session = useSessionHistoryStore((s) => s.sessions.find((x) => x.id === sessionId));
  const {
    keepTrackInSession,
    passTrackInSession,
    keepAllPendingInSession,
    renameSession,
    deleteSession,
    setTrackVisibilityInSession,
    refreshCreditLocks,
  } = useSessionHistoryStore();
  const { playlists } = usePlaylistStore();
  const [processing, setProcessing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(session?.title ?? '');
  const [titleSaved, setTitleSaved] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [swipeTracks, setSwipeTracks] = useState<CanonicalTrack[]>([]);

  useEffect(() => {
    void refreshCreditLocks().catch(() => {});
    const unsubscribe = navigation?.addListener?.('focus', () => {
      void refreshCreditLocks().catch(() => {});
    });
    return () => unsubscribe?.();
  }, [navigation, refreshCreditLocks]);

  const pendingSwipeTracks = useMemo<CanonicalTrack[]>(() => {
    if (!session) return [];
    return session.tracks.filter((entry) => entry.status === 'pending').map((entry) => entry.track);
  }, [session]);

  const sortedTracks = useMemo(() => {
    if (!session) return [];
    const rank = (status: string) => status === 'pending' ? 0 : status === 'kept' ? 1 : 2;
    return session.tracks.slice().sort((a, b) => {
      const statusDiff = rank(a.status) - rank(b.status);
      if (statusDiff) return statusDiff;
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
    });
  }, [session]);

  const openSwipe = () => {
    const pending = pendingSwipeTracks.slice();
    if (!pending.length) return;
    // Snapshot volontaire : le parent met à jour le statut après chaque choix.
    // Garder la liste stable évite le double saut qui obligeait à fermer puis
    // rouvrir le Swipe après PASSER/GARDER.
    setSwipeTracks(pending);
    setSwipeOpen(true);
  };

  useEffect(() => {
    if (!route.params?.openSwipe || !pendingSwipeTracks.length || swipeOpen) return;
    openSwipe();
    navigation?.setParams?.({ openSwipe: false });
  }, [route.params?.openSwipe, pendingSwipeTracks.length, swipeOpen]);

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('session.recapNotFound')}</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}>
            <Text style={styles.backLinkText}>← {t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const detectedCount = session.tracks.length;
  const keptCount = session.tracks.filter((tr) => tr.status === 'kept').length;
  const pendingCount = session.tracks.filter((tr) => tr.status === 'pending').length;
  const lockedCount = session.tracks.filter((tr) => tr.status === 'pending' && tr.creditLocked).length;

  const handleKeepAll = async () => {
    setProcessing(true);
    await refreshCreditLocks().catch(() => {});
    await keepAllPendingInSession(sessionId);
    setProcessing(false);
  };

  const handleShare = async () => {
    try {
      await shareSession(sessionId, titleDraft.trim() || t('session.recapTitle'), keptCount);
    } catch {
      // Annulé -- pas une erreur applicative.
    }
  };

  const handleTitleSave = () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      Alert.alert('Nom de session', 'Écris un nom avant de valider.');
      return;
    }
    if (trimmed !== session.title) renameSession(sessionId, trimmed);
    setTitleDraft(trimmed);
    setTitleSaved(true);
  };

  const handleTitleBlur = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== session.title) renameSession(sessionId, trimmed);
  };

  const handleDelete = () => {
    const message = 'Supprimer cette session de ton historique KEEP ? Les morceaux déjà envoyés vers Spotify ou Apple Music ne seront pas supprimés de ces services.';
    const run = () => {
      deleteSession(sessionId);
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('Main');
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) run();
      return;
    }
    Alert.alert('Supprimer cette session ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: run },
    ]);
  };

  const openUnlock = async () => {
    await refreshCreditLocks().catch(() => {});
    const refreshed = useSessionHistoryStore.getState().sessions.find((x) => x.id === sessionId);
    const stillLocked = refreshed?.tracks.some((tr) => tr.status === 'pending' && tr.creditLocked);
    if (!stillLocked) return;
    navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'PUBLIC_PLAYLISTS' });
  };

  const findPendingEntry = (track: CanonicalTrack) => {
    const latest = useSessionHistoryStore.getState().sessions.find((item) => item.id === sessionId);
    return latest?.tracks.find((entry) => entry.status === 'pending' && entry.track.id === track.id);
  };

  const handleSwipeKeep = async (track: CanonicalTrack, visibility: 'PUBLIC' | 'PRIVATE') => {
    const entry = findPendingEntry(track);
    if (!entry) return true;
    await refreshCreditLocks().catch(() => {});
    await keepTrackInSession(sessionId, entry.id, undefined, visibility);
    const refreshed = useSessionHistoryStore.getState().sessions.find((item) => item.id === sessionId)?.tracks.find((item) => item.id === entry.id);
    if (refreshed?.creditLocked) {
      setSwipeOpen(false);
      setSwipeTracks([]);
      await openUnlock();
      return false;
    }
    return true;
  };

  const handleSwipePass = async (track: CanonicalTrack) => {
    const entry = findPendingEntry(track);
    if (entry) passTrackInSession(sessionId, entry.id);
    return true;
  };

  const closeSwipe = () => {
    setSwipeOpen(false);
    setSwipeTracks([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('session.recapTitle')}</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={8} style={styles.shareBtn}>
          <Text style={styles.shareBtnText}>🔗</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.nameLabel}>NOM DE LA SESSION</Text>
      <View style={styles.titleEditRow}>
        <TextInput
          style={styles.titleInput}
          value={titleDraft}
          onChangeText={(value) => { setTitleDraft(value); setTitleSaved(false); }}
          onBlur={handleTitleBlur}
          onSubmitEditing={handleTitleSave}
          placeholder={t('session.namePlaceholder')}
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.validateTitleButton} onPress={handleTitleSave} accessibilityRole="button" accessibilityLabel="Valider le nom de la session">
          <Text style={styles.validateTitleText}>VALIDER</Text>
        </TouchableOpacity>
      </View>
      <Text style={titleSaved ? styles.titleSaved : styles.titleHint}>{titleSaved ? '✓ Nom enregistré' : 'Écris un nom puis appuie sur VALIDER.'}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statsCopy}>
          <Text style={styles.statsText}>{t('session.detected', { count: detectedCount })}</Text>
          <Text style={styles.statsDot}>·</Text>
          <Text style={[styles.statsText, styles.statsKept]}>{t('session.kept', { count: keptCount })}</Text>
        </View>
        {pendingCount > 0 ? <TouchableOpacity style={styles.pendingPill} onPress={openSwipe} accessibilityRole="button" accessibilityLabel={`Trier ${pendingCount} musiques`}><Text style={styles.pendingPillText}>À TRIER · {pendingCount}</Text></TouchableOpacity> : null}
      </View>

      {lockedCount > 0 ? (
        <TouchableOpacity style={styles.lockedBanner} onPress={() => { void openUnlock(); }}>
          <Text style={styles.lockedBannerTitle}>🔒 {lockedCount} morceau{lockedCount > 1 ? 'x' : ''} en attente</Text>
          <Text style={styles.lockedBannerText}>KEEP vérifie d’abord ton solde. S’il reste des crédits, le cadenas disparaît automatiquement ; sinon appuie ici pour voir Premium.</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.visibilityHint}>À trier en premier · Public = visible sur ton profil KEEP · Privé = visible seulement par toi.</Text>

      <FlatList
        data={sortedTracks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TrackRow
            entry={item}
            playlists={playlists}
            onKeep={(entryId, playlistId) => keepTrackInSession(sessionId, entryId, playlistId, 'PRIVATE')}
            onPass={(entryId) => passTrackInSession(sessionId, entryId)}
            onVisibilityChange={(entryId, visibility) => { void setTrackVisibilityInSession(sessionId, entryId, visibility); }}
            onUnlock={() => { void openUnlock(); }}
          />
        )}
      />

      <View style={styles.sessionActionsRow}>
        {pendingCount > 0 ? (
          <TouchableOpacity style={[styles.compactAction, styles.swipeAction]} onPress={openSwipe} accessibilityRole="button" accessibilityLabel="Trier la session en swipe">
            <Text style={styles.swipeActionText}>↔ À TRIER · {pendingCount}</Text>
          </TouchableOpacity>
        ) : null}
        {pendingCount > 0 ? (
          <TouchableOpacity style={[styles.compactAction, styles.keepAllButton]} onPress={handleKeepAll} disabled={processing} accessibilityRole="button" accessibilityLabel="Garder tous les morceaux en attente">
            <Text style={styles.keepAllButtonText}>{processing ? '…' : `✓ GARDER TOUT (${pendingCount})`}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.compactAction, styles.deleteSessionButton]} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Supprimer cette session">
          <Text style={styles.deleteSessionText}>SUPPRIMER</Text>
        </TouchableOpacity>
      </View>

      {musicEngine.isDemoMode && (
        <View style={styles.demoBadge}>
          <Text style={styles.demoText}>{t('demo.badge')}</Text>
        </View>
      )}

      <MusicSwipeDeckModal
        visible={swipeOpen}
        tracks={swipeTracks}
        title="Trier cette session"
        subtitle={`${swipeTracks.length} musique${swipeTracks.length > 1 ? 's' : ''} à valider · PASSER ou GARDER enchaîne automatiquement la suivante.`}
        emptyTitle="Session triée. Toutes les musiques ont été validées."
        loop={false}
        askVisibilityOnKeep
        onClose={closeSwipe}
        onKeep={handleSwipeKeep}
        onPass={handleSwipePass}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  emptyText: { color: colors.textSecondary, fontSize: 15, marginBottom: spacing.lg },
  backLink: { paddingVertical: spacing.sm },
  backLinkText: { color: colors.primaryLight, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  backArrow: { color: colors.textPrimary, fontSize: 22 },
  title: { ...typography.h2, color: colors.textPrimary, flex: 1 },
  shareBtn: { padding: spacing.xs },
  shareBtnText: { fontSize: 20 },
  nameLabel: { marginHorizontal: spacing.xl, marginTop: spacing.xs, color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: .8 },
  titleEditRow: { marginHorizontal: spacing.xl, marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleInput: { flex: 1, minHeight: 44, color: colors.textPrimary, fontSize: 15, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  validateTitleButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  validateTitleText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: .4 },
  titleHint: { marginHorizontal: spacing.xl, marginTop: 4, color: colors.textMuted, fontSize: 9 },
  titleSaved: { marginHorizontal: spacing.xl, marginTop: 4, color: colors.keep, fontSize: 9, fontWeight: '800' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  statsCopy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  statsText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  statsKept: { color: colors.keep },
  statsDot: { color: colors.textMuted },
  pendingPill: { minHeight: 30, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.primaryLight },
  pendingPillText: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: .35 },
  lockedBanner: { marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#1A1225', borderWidth: 1, borderColor: colors.primaryLight },
  lockedBannerTitle: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },
  lockedBannerText: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 4 },
  visibilityHint: { color: colors.textMuted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: spacing.xl },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  sessionActionsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 7, marginHorizontal: spacing.xl, marginBottom: spacing.md },
  compactAction: { flex: 1, minHeight: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  swipeAction: { backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.primaryLight },
  swipeActionText: { color: colors.primaryLight, fontSize: 9, fontWeight: '900' },
  keepAllButton: { backgroundColor: colors.keep, borderWidth: 1, borderColor: colors.keep },
  keepAllButtonText: { color: colors.black, fontWeight: '900', fontSize: 9, textAlign: 'center' },
  deleteSessionButton: { borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.backgroundCard },
  deleteSessionText: { color: colors.danger, fontSize: 9, fontWeight: '900' },
  demoBadge: { marginHorizontal: spacing.xl, marginBottom: spacing.md, backgroundColor: colors.demoBadgeBg, borderWidth: 1, borderColor: colors.demoBadgeBorder, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  demoText: { color: colors.demoBadgeText, fontSize: 11, fontWeight: '600' },
});