import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Linking, Modal, TextInput, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { analyzeLibrary, LibraryAnalysis, ProviderPlaylist, CanonicalTrack } from '@keep/music';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useSessionStore } from '../store/useSessionStore';
import { SessionTrackEntry } from '../types';
import { useMusicServiceStore, MusicServiceId } from '../store/useMusicServiceStore';
import { musicEngine } from '../services/musicEngine';
import { sharePlaylist } from '../services/sharingService';
import { getPlaylistProviderUrl } from '../utils/providerLinks';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { AppAlert as Alert } from '../utils/AppAlert';

/** Un morceau gardé, qu'il vienne de la session EN COURS (pas encore archivée) ou d'une session déjà terminée -- les deux doivent apparaître ici sans délai (cf. demande explicite du 23/08/2026 : "je fais KEEP -> je vais dans Mes musiques -> il doit être là"). */
interface KeptRow {
  sessionId: string;
  entry: SessionTrackEntry;
  /** true = vit encore dans useSessionStore (session active, pas archivée) -- détermine quel store recevra le renommage/la resynchro. */
  live: boolean;
}

const SERVICE_LABELS: Record<MusicServiceId, string> = {
  apple_music: 'Apple Music',
  spotify: 'Spotify',
  youtube: 'YouTube',
  youtube_music: 'YouTube Music',
};

export default function MyMusicScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { playlists, isLoading, refresh } = usePlaylistStore();
  const [analysis, setAnalysis] = useState<LibraryAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [pendingGenreTracks, setPendingGenreTracks] = useState<CanonicalTrack[] | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ sessionId: string; entryId: string; live: boolean } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const connectedServices = useMusicServiceStore((s) => s.connectedServices);
  const historySessions = useSessionHistoryStore((s) => s.sessions);
  const renameTrackInSession = useSessionHistoryStore((s) => s.renameTrackInSession);
  const syncAllWaitingTracks = useSessionHistoryStore((s) => s.syncAllWaitingTracks);
  const activeSessionId = useSessionStore((s) => s.sessionId);
  const activeTracks = useSessionStore((s) => s.tracks);
  const renameTrack = useSessionStore((s) => s.renameTrack);
  const syncWaitingTracksLive = useSessionStore((s) => s.syncWaitingTracks);

  /**
   * "Mes KEEP" -- TOUS les morceaux réellement gardés, session active +
   * archivées confondues. Aucune donnée inventée : c'est un miroir direct
   * des décisions GARDER de l'utilisateur (cf. demande explicite du
   * 23/08/2026 : "je ne veux rien de dur dans le système").
   */
  const allKept: KeptRow[] = useMemo(() => {
    const fromActive: KeptRow[] = activeSessionId
      ? activeTracks.filter((t) => t.status === 'kept').map((entry) => ({ sessionId: activeSessionId, entry, live: true }))
      : [];
    const fromHistory: KeptRow[] = historySessions.flatMap((s) =>
      s.tracks.filter((t) => t.status === 'kept').map((entry) => ({ sessionId: s.id, entry, live: false }))
    );
    return [...fromActive, ...fromHistory];
  }, [activeSessionId, activeTracks, historySessions]);

  const waitingRows = useMemo(() => allKept.filter((r) => r.entry.syncState === 'waiting_sync'), [allKept]);

  const openRenameTrack = (row: KeptRow) => {
    setRenameTarget({ sessionId: row.sessionId, entryId: row.entry.id, live: row.live });
    setRenameValue(row.entry.customTitle ?? row.entry.track.title);
  };

  const confirmRenameTrack = () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (name) {
      if (renameTarget.live) renameTrack(renameTarget.entryId, name);
      else renameTrackInSession(renameTarget.sessionId, renameTarget.entryId, name);
    }
    setRenameTarget(null);
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSyncNow = async () => {
    setSyncing(true);
    await Promise.all([syncAllWaitingTracks(), syncWaitingTracksLive()]);
    await refresh();
    setSyncing(false);
  };

  const requireConnectedService = (): boolean => {
    if (connectedServices.length > 0) return true;
    Alert.alert(t('myMusic.title'), t('myMusic.requiresConnection'));
    return false;
  };

  const openCreatePlaylist = (prefillName = '', genreTracks: CanonicalTrack[] | null = null) => {
    if (!requireConnectedService()) return;
    setNewPlaylistName(prefillName);
    setPendingGenreTracks(genreTracks);
    setCreateModalOpen(true);
  };

  const confirmCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    setCreatingBusy(true);
    try {
      const session = await musicEngine.getSession();
      const created = await musicEngine.musicProvider.createPlaylist(session, name);
      if (pendingGenreTracks) {
        for (const track of pendingGenreTracks) {
          await musicEngine.musicProvider.addTrackToPlaylist(session, created.id, track);
        }
      }
      await refresh();
      setCreateModalOpen(false);
    } catch (e: any) {
      Alert.alert(t('myMusic.title'), e?.message ?? 'Erreur lors de la création.');
    } finally {
      setCreatingBusy(false);
    }
  };

  /**
   * "Ranger par style" tourne sur MES KEEP réels, pas sur les playlists d'un
   * provider -- fonctionne dès le premier GARDER, sans dépendre d'un service
   * connecté (cf. demande explicite du 23/08/2026).
   */
  const runOrganizeAnalysis = () => {
    setAnalyzing(true);
    const tracks = allKept.map((r) => r.entry.track);
    setAnalysis(analyzeLibrary([{ playlist: { id: 'mine', name: t('myMusic.myKeeps'), trackCount: tracks.length }, tracks }]));
    setAnalyzing(false);
  };

  const albums = useMemo(() => {
    const map = new Map<string, { album: string; artist: string; artworkUrl?: string; count: number }>();
    for (const row of allKept) {
      const album = row.entry.track.album;
      if (!album) continue;
      const key = `${album}::${row.entry.track.artist}`;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { album, artist: row.entry.track.artist, artworkUrl: row.entry.track.artworkUrl, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allKept]);

  const renderPlaylist = ({ item }: { item: ProviderPlaylist }) => {
    // KEEP est un miroir, jamais un hébergeur -- taper la pochette ouvre la
    // vraie plateforme quand un lien public existe (Spotify), jamais une
    // lecture simulée dans KEEP (cf. demande explicite du 22/08/2026).
    const providerId = connectedServices.length > 0 ? musicEngine.musicProvider.providerId : null;
    const providerUrl = providerId ? getPlaylistProviderUrl(providerId, item.id) : undefined;
    return (
      <View style={styles.playlistCard}>
        <TouchableOpacity
          disabled={!providerUrl}
          onPress={() => providerUrl && Linking.openURL(providerUrl).catch(() => {})}
        >
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.playlistCover} />
          ) : (
            <View style={styles.playlistCover} />
          )}
        </TouchableOpacity>
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>
          {item.description && (
            <Text style={styles.playlistDesc} numberOfLines={1}>{item.description}</Text>
          )}
          <Text style={styles.songCount}>{t('profile.trackCount', { count: item.trackCount })}</Text>
        </View>
        <TouchableOpacity
          style={styles.playlistShareBtn}
          hitSlop={8}
          onPress={() => sharePlaylist(item.id, item.name).catch(() => {})}
        >
          <Text style={styles.playlistShareBtnText}>🔗</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderKeepRow = (row: KeptRow) => (
    <View key={row.entry.id} style={styles.waitingRow}>
      <TouchableOpacity
        disabled={!row.entry.track.songLink}
        onPress={() => row.entry.track.songLink && Linking.openURL(row.entry.track.songLink).catch(() => {})}
      >
        {row.entry.track.artworkUrl ? (
          <Image source={{ uri: row.entry.track.artworkUrl }} style={styles.waitingArtwork} />
        ) : (
          <View style={[styles.waitingArtwork, styles.waitingArtworkPlaceholder]}>
            <Text style={styles.waitingArtworkGlyph}>♪</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.waitingInfo}>
        <Text style={styles.waitingTitle} numberOfLines={1}>{row.entry.customTitle ?? row.entry.track.title}</Text>
        <Text style={styles.waitingArtist} numberOfLines={1}>{row.entry.track.artist}</Text>
      </View>
      <TouchableOpacity style={styles.renameBtn} hitSlop={8} onPress={() => openRenameTrack(row)}>
        <Text style={styles.renameBtnText}>✎</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('myMusic.title')}</Text>
        <TouchableOpacity onPress={() => openCreatePlaylist()}>
          <Text style={styles.newPlaylistLink}>+ {t('myMusic.newPlaylist')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Section title={t('myMusic.myKeeps')}>
          {allKept.length === 0 ? (
            <Text style={styles.emptyHint}>{t('myMusic.myKeepsEmpty')}</Text>
          ) : (
            <View style={styles.waitingList}>{allKept.map(renderKeepRow)}</View>
          )}
        </Section>

        {waitingRows.length > 0 && (
          <Section title={t('session.waitingSync')}>
            <View style={styles.syncBanner}>
              <Text style={styles.syncBannerText}>{waitingRows.length} {t('session.waitingSync').toLowerCase()}</Text>
              {connectedServices.length > 0 ? (
                <TouchableOpacity style={styles.syncNowBtn} onPress={handleSyncNow} disabled={syncing}>
                  <Text style={styles.syncNowBtnText}>{syncing ? '…' : 'Sync now'}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.syncBannerHint}>{t('profile.connectAppleMusic')} →</Text>
              )}
            </View>
          </Section>
        )}

        <Section
          title={t('myMusic.playlists')}
          action={
            <TouchableOpacity onPress={runOrganizeAnalysis} disabled={analyzing || allKept.length === 0}>
              <Text style={[styles.organizeLink, allKept.length === 0 && styles.organizeLinkDisabled]}>
                {analyzing ? '…' : `🧹 ${t('myMusic.organizeMyMusic')}`}
              </Text>
            </TouchableOpacity>
          }
        >
          {connectedServices.length === 0 ? (
            <Text style={styles.emptyHint}>{t('myMusic.playlistsEmptyNoService')}</Text>
          ) : playlists.length === 0 && !isLoading ? (
            <Text style={styles.emptyHint}>{t('myMusic.playlistsEmpty')}</Text>
          ) : (
            <FlatList
              data={playlists}
              renderItem={renderPlaylist}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              refreshing={isLoading}
              onRefresh={refresh}
            />
          )}

          {analysis && (
            <View style={styles.analysisCard}>
              <Text style={styles.analysisLine}>{t('myMusic.songsAnalyzed', { count: analysis.totalTracks })}</Text>
              <Text style={styles.analysisLine}>{t('myMusic.suggestions', { count: analysis.unclassifiedCount })}</Text>
              <Text style={styles.analysisLine}>{t('myMusic.duplicates', { count: analysis.duplicateCount })}</Text>
              {(analysis.duplicateCount > 0 || analysis.unclassifiedCount > 0) && (
                <TouchableOpacity
                  style={styles.viewSuggestionsButton}
                  onPress={() =>
                    Alert.alert(
                      t('myMusic.viewSuggestions'),
                      analysis.duplicateGroups
                        .map((g) => `• ${g[0].title} — ${g[0].artist} (${g.length}x)`)
                        .join('\n') || 'Aucun doublon détecté pour le moment.'
                    )
                  }
                >
                  <Text style={styles.viewSuggestionsText}>{t('myMusic.viewSuggestions')}</Text>
                </TouchableOpacity>
              )}

              {analysis.byGenre.length > 0 && (
                <View style={styles.genreSection}>
                  <Text style={styles.genreSectionTitle}>{t('myMusic.groupByStyle')}</Text>
                  {analysis.byGenre.map((group) => (
                    <View key={group.genre} style={styles.genreRow}>
                      <Text style={styles.genreLabel}>{group.genre} · {group.tracks.length}</Text>
                      <TouchableOpacity onPress={() => openCreatePlaylist(group.genre, group.tracks)}>
                        <Text style={styles.genreCreateLink}>{t('myMusic.createPlaylistFor')}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </Section>

        <Section title={t('myMusic.albums')}>
          {albums.length === 0 ? (
            <Text style={styles.emptyHint}>{t('myMusic.albumsEmpty')}</Text>
          ) : (
            <View style={styles.waitingList}>
              {albums.map((a) => (
                <View key={`${a.album}::${a.artist}`} style={styles.waitingRow}>
                  {a.artworkUrl ? (
                    <Image source={{ uri: a.artworkUrl }} style={styles.waitingArtwork} />
                  ) : (
                    <View style={[styles.waitingArtwork, styles.waitingArtworkPlaceholder]}>
                      <Text style={styles.waitingArtworkGlyph}>♪</Text>
                    </View>
                  )}
                  <View style={styles.waitingInfo}>
                    <Text style={styles.waitingTitle} numberOfLines={1}>{a.album}</Text>
                    <Text style={styles.waitingArtist} numberOfLines={1}>{a.artist} · {a.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section title={t('myMusic.connectedServices')}>
          <TouchableOpacity style={styles.servicesRow} onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.servicesRowText}>
              {connectedServices.length > 0
                ? connectedServices.map((s) => `✓ ${SERVICE_LABELS[s]}`).join('  ')
                : t('myMusic.noServiceConnected')}
            </Text>
            <Text style={styles.servicesRowLink}>{t('myMusic.manage')} →</Text>
          </TouchableOpacity>
        </Section>
      </ScrollView>

      {/* KeyboardAvoidingView ajouté le 24/08/2026 (audit docs/KEEP_MODALS_AUDIT.md,
          priorité 1) -- ces 2 modales contiennent un TextInput avec autoFocus
          (le clavier s'ouvre automatiquement) mais rien ne repoussait la carte
          quand il apparaissait ; sur un vrai téléphone le clavier pouvait
          couvrir le champ ou les boutons. Même pattern que OnboardingScreen.tsx. */}
      <Modal visible={createModalOpen} transparent animationType="fade" onRequestClose={() => setCreateModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('myMusic.newPlaylist')}</Text>
            <TextInput
              style={styles.modalInput}
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              placeholder={t('myMusic.playlistNamePlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCreateModalOpen(false)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmCreatePlaylist} disabled={creatingBusy || !newPlaylistName.trim()}>
                <Text style={styles.modalConfirmText}>{creatingBusy ? '…' : t('myMusic.create')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('myMusic.renameTrack')}</Text>
            <TextInput
              style={styles.modalInput}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRenameTarget(null)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmRenameTrack} disabled={!renameValue.trim()}>
                <Text style={styles.modalConfirmText}>{t('profile.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  newPlaylistLink: { color: colors.primaryLight, fontWeight: '700', fontSize: 14 },
  title: { ...typography.h1, color: colors.textPrimary },
  scrollContent: { paddingBottom: spacing.xxxl },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  emptyHint: { color: colors.textMuted, fontSize: 13 },
  organizeLink: { color: colors.primaryLight, fontSize: 12, fontWeight: '700' },
  organizeLinkDisabled: { opacity: 0.4 },
  analysisCard: {
    marginTop: spacing.md,
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  analysisLine: { color: colors.textSecondary, fontSize: 13 },
  viewSuggestionsButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  viewSuggestionsText: { color: colors.primaryLight, fontSize: 13, fontWeight: '700' },
  playlistCard: { flexDirection: 'row', backgroundColor: colors.backgroundCard, borderRadius: radius.md, marginVertical: spacing.sm, overflow: 'hidden' },
  playlistCover: { width: 90, height: 90, backgroundColor: colors.backgroundElevated },
  playlistInfo: { flex: 1, padding: spacing.md, justifyContent: 'space-between' },
  playlistName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  playlistDesc: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  songCount: { fontSize: 12, color: colors.keep, marginTop: spacing.xs, fontWeight: '600' },
  playlistShareBtn: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md },
  playlistShareBtnText: { fontSize: 18 },
  syncBanner: {
    backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  syncBannerText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  syncBannerHint: { color: colors.primaryLight, fontSize: 12, fontWeight: '700' },
  syncNowBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  syncNowBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  waitingList: { gap: spacing.xs },
  waitingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.backgroundCard, borderRadius: radius.md, padding: spacing.sm,
  },
  // 44 -> 48 (audit Design System du 24/08/2026) -- même taille que TrackRow.
  waitingArtwork: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.backgroundElevated },
  waitingArtworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  waitingArtworkGlyph: { color: colors.textMuted, fontSize: 16 },
  waitingInfo: { flex: 1, minWidth: 0 },
  waitingTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  waitingArtist: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  renameBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  renameBtnText: { color: colors.primaryLight, fontSize: 15 },
  genreSection: { marginTop: spacing.md, gap: spacing.xs },
  genreSectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: spacing.xs },
  genreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  genreLabel: { color: colors.textSecondary, fontSize: 13 },
  genreCreateLink: { color: colors.primaryLight, fontSize: 12, fontWeight: '700' },
  servicesRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.backgroundCard, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  servicesRowText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  servicesRowLink: { color: colors.primaryLight, fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.xl },
  modalCard: {
    backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border, maxWidth: 380, width: '100%', alignSelf: 'center',
  },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md, textAlign: 'center' },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.textPrimary,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15,
  },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '700' },
  modalConfirmBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  modalConfirmText: { color: colors.white, fontWeight: '700' },
});
