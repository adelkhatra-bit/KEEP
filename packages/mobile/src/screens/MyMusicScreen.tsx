import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { analyzeLibrary, LibraryAnalysis, ProviderPlaylist } from '@keep/music';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { musicEngine } from '../services/musicEngine';
import { sharePlaylist } from '../services/sharingService';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

export default function MyMusicScreen() {
  const { t } = useTranslation();
  const { playlists, isLoading, refresh } = usePlaylistStore();
  const [analysis, setAnalysis] = useState<LibraryAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runOrganizeAnalysis = async () => {
    setAnalyzing(true);
    const session = await musicEngine.getSession();
    const withTracks = await Promise.all(
      playlists.map(async (playlist) => ({
        playlist,
        tracks: await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id),
      }))
    );
    setAnalysis(analyzeLibrary(withTracks));
    setAnalyzing(false);
  };

  const renderPlaylist = ({ item }: { item: ProviderPlaylist }) => (
    <View style={styles.playlistCard}>
      <View style={styles.playlistCover} />
      <View style={styles.playlistInfo}>
        <Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>
        {item.description && (
          <Text style={styles.playlistDesc} numberOfLines={1}>{item.description}</Text>
        )}
        <Text style={styles.songCount}>{item.trackCount} songs</Text>
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('myMusic.title')}</Text>
      </View>

      <TouchableOpacity style={styles.organizeButton} onPress={runOrganizeAnalysis} disabled={analyzing}>
        <Text style={styles.organizeButtonText}>
          {analyzing ? '…' : `🧹 ${t('myMusic.organizeMyMusic')}`}
        </Text>
      </TouchableOpacity>

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
        </View>
      )}

      <FlatList
        data={playlists}
        renderItem={renderPlaylist}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isLoading}
        onRefresh={refresh}
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
  header: { paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { ...typography.h1, color: colors.textPrimary },
  organizeButton: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  organizeButtonText: { color: colors.primaryLight, fontWeight: '700', fontSize: 14 },
  analysisCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  analysisLine: { color: colors.textSecondary, fontSize: 13 },
  viewSuggestionsButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  viewSuggestionsText: { color: colors.primaryLight, fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  playlistCard: { flexDirection: 'row', backgroundColor: colors.backgroundCard, borderRadius: radius.md, marginVertical: spacing.sm, overflow: 'hidden' },
  playlistCover: { width: 90, height: 90, backgroundColor: colors.backgroundElevated },
  playlistInfo: { flex: 1, padding: spacing.md, justifyContent: 'space-between' },
  playlistName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  playlistDesc: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  songCount: { fontSize: 12, color: colors.keep, marginTop: spacing.xs, fontWeight: '600' },
  playlistShareBtn: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md },
  playlistShareBtnText: { fontSize: 18 },
  demoBadge: {
    backgroundColor: colors.demoBadgeBg,
    borderTopWidth: 1,
    borderTopColor: colors.demoBadgeBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  demoText: { color: colors.demoBadgeText, fontSize: 11, fontWeight: '600' },
});
