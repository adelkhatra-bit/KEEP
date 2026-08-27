import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Alert, Image, Modal, TextInput, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { analyzeLibrary, CanonicalTrack, LibraryAnalysis, ProviderPlaylist } from '@keep/music';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { musicEngine } from '../services/musicEngine';
import { sharePlaylist } from '../services/sharingService';
import { loadPlaylistPreferences, preferenceFor, savePlaylistPreference, KeepPlaylistPreference } from '../services/keepLibraryService';
import TrackPreviewButton from '../components/TrackPreviewButton';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

const LOCAL_HISTORY_PLAYLIST_ID = 'keep-local-history';

type PlaylistWithTracks = { playlist: ProviderPlaylist; tracks: CanonicalTrack[] };

export default function MyMusicScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { playlists, isLoading, refresh } = usePlaylistStore();
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const setTrackVisibilityInSession = useSessionHistoryStore((s) => s.setTrackVisibilityInSession);
  const syncUnsyncedKeeps = useSessionHistoryStore((s) => s.syncUnsyncedKeeps);
  const [analysis, setAnalysis] = useState<LibraryAnalysis | null>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tracksByPlaylist, setTracksByPlaylist] = useState<Record<string, CanonicalTrack[]>>({});
  const [loadingPlaylist, setLoadingPlaylist] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, KeepPlaylistPreference>>({});
  const [editing, setEditing] = useState<ProviderPlaylist | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const localKeptEntries = useMemo(
    () => sessions.flatMap((session) => session.tracks
      .filter((entry) => entry.status === 'kept')
      .map((entry) => ({ ...entry, sessionId: session.id }))),
    [sessions],
  );
  const localKeptTracks = useMemo(() => {
    const unique = new Map<string, CanonicalTrack>();
    for (const entry of localKeptEntries) unique.set(entry.track.id, entry.track);
    return Array.from(unique.values());
  }, [localKeptEntries]);
  const providerId = musicEngine.musicProvider.providerId || 'KEEP';

  const refreshLibrary = async () => {
    await syncUnsyncedKeeps().catch(() => {});
    await refresh().catch(() => {});
  };

  useEffect(() => {
    void refreshLibrary();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshLibrary(); });
    return () => unsubscribe?.();
  }, [navigation, refresh, syncUnsyncedKeeps]);

  useEffect(() => {
    let live = true;
    void loadPlaylistPreferences(providerId).then((next) => { if (live) setPreferences(next); });
    return () => { live = false; };
  }, [providerId, playlists.length]);

  const basePlaylists = useMemo<ProviderPlaylist[]>(() => {
    const result: ProviderPlaylist[] = [];
    if (localKeptTracks.length) {
      result.push({
        id: LOCAL_HISTORY_PLAYLIST_ID,
        name: 'Toute ma musique',
        description: 'Tous tes titres KEEP, publics ou privés. Les services connectés restent aussi disponibles juste dessous.',
        trackCount: localKeptTracks.length,
        isKeepManaged: true,
      });
    }
    for (const playlist of playlists) {
      if (playlist.id !== LOCAL_HISTORY_PLAYLIST_ID) result.push(playlist);
    }
    return result;
  }, [localKeptTracks.length, playlists]);

  const displayPlaylists = useMemo(() => basePlaylists.map((playlist) => {
    const pref = preferenceFor(preferences, providerId, playlist.id);
    return pref ? { ...playlist, name: pref.name || playlist.name, description: pref.description || playlist.description } : playlist;
  }), [basePlaylists, preferences, providerId]);

  const loadProviderTracks = async (playlist: ProviderPlaylist): Promise<CanonicalTrack[]> => {
    if (tracksByPlaylist[playlist.id]) return tracksByPlaylist[playlist.id];
    const session = await musicEngine.getSession();
    const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);
    setTracksByPlaylist((state) => ({ ...state, [playlist.id]: tracks }));
    return tracks;
  };

  const loadTracks = async (playlist: ProviderPlaylist): Promise<CanonicalTrack[]> => {
    if (playlist.id === LOCAL_HISTORY_PLAYLIST_ID) {
      setLoadingPlaylist(playlist.id);
      try {
        const unique = new Map<string, CanonicalTrack>();
        for (const track of localKeptTracks) unique.set(track.id, track);
        for (const providerPlaylist of playlists) {
          if (providerPlaylist.id === LOCAL_HISTORY_PLAYLIST_ID) continue;
          try {
            const providerTracks = await loadProviderTracks(providerPlaylist);
            for (const track of providerTracks) unique.set(track.id, track);
          } catch {
            // Un fournisseur indisponible ne doit jamais masquer les KEEP locaux.
          }
        }
        const merged = Array.from(unique.values());
        setTracksByPlaylist((state) => ({ ...state, [LOCAL_HISTORY_PLAYLIST_ID]: merged }));
        return merged;
      } finally {
        setLoadingPlaylist(null);
      }
    }
    setLoadingPlaylist(playlist.id);
    try {
      return await loadProviderTracks(playlist);
    } finally {
      setLoadingPlaylist(null);
    }
  };

  const togglePlaylist = async (playlist: ProviderPlaylist) => {
    if (expandedId === playlist.id) return setExpandedId(null);
    setExpandedId(playlist.id);
    try { await loadTracks(playlist); }
    catch (e: any) { Alert.alert('Mes musiques', e?.message ?? 'Impossible de charger les morceaux.'); }
  };

  const runOrganizeAnalysis = async () => {
    setAnalyzing(true);
    try {
      const withTracks: PlaylistWithTracks[] = [];
      for (const playlist of basePlaylists) {
        withTracks.push({ playlist, tracks: await loadTracks(playlist) });
      }
      const nextRaw = analyzeLibrary(withTracks);
      const next = nextRaw.totalTracks <= 1
        ? { ...nextRaw, unclassifiedCount: 0, duplicateGroups: [], duplicateCount: 0 }
        : nextRaw;
      setAnalysis(next);
      setAnalysisExpanded(false);
    } catch (e: any) {
      Alert.alert('Ranger ma musique', e?.message ?? 'Impossible d’analyser la bibliothèque pour le moment.');
    } finally {
      setAnalyzing(false);
    }
  };

  const allKnownTracks = useMemo(() => {
    const map = new Map<string, CanonicalTrack>();
    for (const track of localKeptTracks) map.set(track.id, track);
    for (const tracks of Object.values(tracksByPlaylist)) for (const track of tracks) map.set(track.id, track);
    return Array.from(map.values());
  }, [localKeptTracks, tracksByPlaylist]);

  const genreSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const track of allKnownTracks) {
      for (const genre of track.genres ?? []) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [allKnownTracks]);

  const analysisMessage = analysis
    ? analysis.totalTracks === 0
      ? 'Aucun morceau à analyser pour le moment.'
      : analysis.totalTracks === 1
        ? '1 morceau trouvé · rien à trier pour le moment.'
        : analysis.duplicateCount === 0 && analysis.unclassifiedCount === 0
          ? `${analysis.totalTracks} morceaux trouvés · rien à corriger pour le moment.`
          : `${analysis.totalTracks} morceaux analysés · KEEP te propose des corrections, jamais une suppression automatique.`
    : null;

  const openEdit = (playlist: ProviderPlaylist) => {
    const pref = preferenceFor(preferences, providerId, playlist.id);
    setEditing(playlist);
    setEditName(pref?.name || playlist.name);
    setEditDescription(pref?.description ?? playlist.description ?? '');
    setEditPublic(pref?.isPublic ?? false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const preference: KeepPlaylistPreference = {
      provider: providerId,
      providerPlaylistId: editing.id,
      name: editName.trim() || editing.name,
      description: editDescription.trim(),
      isPublic: editPublic,
      coverUrl: editing.coverUrl,
    };
    setSavingEdit(true);
    try {
      await savePlaylistPreference(preference);
      setPreferences((state) => ({ ...state, [`${providerId}:${editing.id}`]: preference }));
      setEditing(null);
    } catch (e: any) {
      Alert.alert('Playlist', e?.message ?? 'Impossible d’enregistrer les modifications.');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleTrackVisibility = async (trackId: string) => {
    const entry = localKeptEntries.find((item) => item.track.id === trackId);
    if (!entry) return Alert.alert('Visibilité', 'Cette musique vient d’un service connecté. Utilise la visibilité de la playlist pour contrôler son affichage public.');
    const next = entry.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    try { await setTrackVisibilityInSession(entry.sessionId, entry.id, next); }
    catch { Alert.alert('Visibilité', 'Impossible de modifier la visibilité de ce morceau pour le moment.'); }
  };

  const renderTrack = (track: CanonicalTrack) => {
    const localEntry = localKeptEntries.find((item) => item.track.id === track.id);
    const available = track.availableOn?.length ? track.availableOn.join(' · ') : Object.keys(track.providerIds ?? {}).join(' · ');
    return <View key={track.id} style={styles.trackRow}>
      {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.trackCover} /> : <View style={[styles.trackCover, styles.playlistCoverFallback]}><Text style={styles.trackFallback}>♪</Text></View>}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}{track.album ? ` · ${track.album}` : ''}</Text>
        {available ? <Text style={styles.trackAvailable} numberOfLines={1}>Disponible : {available}</Text> : null}
        <View style={styles.trackActions}>
          <TrackPreviewButton trackKey={track.id} previewUrl={track.previewUrl} compact />
          <TouchableOpacity style={styles.smallAction} onPress={() => void toggleTrackVisibility(track.id)}>
            <Text style={styles.smallActionText}>{localEntry?.visibility === 'PUBLIC' ? '👁 Public' : '🔒 Privé'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>;
  };

  const renderPlaylist = ({ item }: { item: ProviderPlaylist }) => {
    const pref = preferenceFor(preferences, providerId, item.id);
    const expanded = expandedId === item.id;
    const tracks = item.id === LOCAL_HISTORY_PLAYLIST_ID
      ? (tracksByPlaylist[LOCAL_HISTORY_PLAYLIST_ID] ?? localKeptTracks)
      : (tracksByPlaylist[item.id] ?? []);
    const actualCount = item.id === LOCAL_HISTORY_PLAYLIST_ID
      ? (tracksByPlaylist[LOCAL_HISTORY_PLAYLIST_ID]?.length ?? localKeptTracks.length)
      : item.trackCount;
    return <View style={styles.playlistBlock}>
      <TouchableOpacity style={styles.playlistCard} onPress={() => void togglePlaylist(item)} accessibilityLabel={`Ouvrir ${item.name}`}>
        {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.playlistCover} /> : <View style={[styles.playlistCover, styles.playlistCoverFallback]}><Text style={styles.playlistCoverText}>♪</Text></View>}
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>
          {item.description ? <Text style={styles.playlistDesc} numberOfLines={2}>{item.description}</Text> : null}
          <Text style={styles.songCount}>{actualCount} {actualCount > 1 ? 'morceaux' : 'morceau'} · {pref?.isPublic ? 'Public' : 'Privé'}</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      <View style={styles.playlistActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => openEdit(item)}><Text style={styles.actionText}>✎ Modifier</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => sharePlaylist(item.id, item.name).catch(() => Alert.alert('Partager', 'Le partage de cette playlist est indisponible pour le moment.'))}><Text style={styles.actionText}>↗ Partager</Text></TouchableOpacity>
      </View>
      {expanded ? <View style={styles.tracksPanel}>
        <Text style={styles.panelHint}>Touchez un morceau pour pré-écouter l’extrait disponible. KEEP ne stocke pas l’audio : il utilise l’extrait du catalogue ou ouvre la plateforme liée.</Text>
        {loadingPlaylist === item.id ? <Text style={styles.loadingText}>Chargement…</Text> : tracks.length ? tracks.map(renderTrack) : <Text style={styles.loadingText}>Aucun morceau dans cette playlist.</Text>}
      </View> : null}
    </View>;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('myMusic.title')}</Text>
          <Text style={styles.headerSubtitle}>Ta bibliothèque KEEP complète + tes services connectés</Text>
        </View>
        <TouchableOpacity style={styles.servicesButton} onPress={() => navigation.navigate('MusicConnections')}>
          <Text style={styles.servicesButtonText}>＋ Services</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.organizeButton} onPress={runOrganizeAnalysis} disabled={analyzing}>
        <Text style={styles.organizeButtonText}>{analyzing ? '…' : `🧹 ${t('myMusic.organizeMyMusic')}`}</Text>
      </TouchableOpacity>

      {analysis ? <>
        <TouchableOpacity style={styles.analysisSummary} onPress={() => setAnalysisExpanded((value) => !value)} accessibilityRole="button" accessibilityLabel="Afficher ou masquer le détail du rangement">
          <Text style={styles.analysisSummaryText} numberOfLines={2}>{analysisMessage}</Text>
          <Text style={styles.analysisChevron}>{analysisExpanded ? '⌃' : '⌄'}</Text>
        </TouchableOpacity>
        {analysisExpanded ? <View style={styles.analysisCard}>
          <Text style={styles.analysisLine}>{t('myMusic.songsAnalyzed', { count: analysis.totalTracks })}</Text>
          <Text style={styles.analysisLine}>{t('myMusic.suggestions', { count: analysis.unclassifiedCount })}</Text>
          <Text style={styles.analysisLine}>{t('myMusic.duplicates', { count: analysis.duplicateCount })}</Text>
          {genreSummary.length ? <Text style={styles.genreLine}>Styles détectés : {genreSummary.map(([genre, count]) => `${genre} (${count})`).join(' · ')}</Text> : null}
          <Text style={styles.analysisHelp}>Le rangement intelligent utilise les styles fournis par les catalogues et apprend tes corrections. Rien n’est déplacé ou supprimé sans validation.</Text>
          {(analysis.duplicateCount > 0 || analysis.unclassifiedCount > 0) ? <TouchableOpacity style={styles.viewSuggestionsButton} onPress={() => Alert.alert(t('myMusic.viewSuggestions'), analysis.duplicateGroups.map((g) => `• ${g[0].title} — ${g[0].artist} (${g.length}x)`).join('\n') || 'Des morceaux sans style sont à classer manuellement.')}><Text style={styles.viewSuggestionsText}>{t('myMusic.viewSuggestions')}</Text></TouchableOpacity> : null}
        </View> : null}
      </> : null}

      <FlatList
        data={displayPlaylists}
        renderItem={renderPlaylist}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isLoading}
        onRefresh={() => { void refreshLibrary(); }}
        ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>Aucune musique gardée</Text><Text style={styles.emptyText}>Dès que tu fais GARDER pendant une écoute, le morceau apparaît ici. Connecte Apple Music, Spotify ou Deezer pour réunir aussi tes bibliothèques externes.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('MusicConnections')}><Text style={styles.emptyButtonText}>GÉRER MES SERVICES</Text></TouchableOpacity></View>}
      />

      {musicEngine.isDemoMode ? <View style={styles.demoBadge}><Text style={styles.demoText}>{t('demo.badge')}</Text></View> : null}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.editCard}>
              <Text style={styles.editTitle}>Modifier la playlist</Text>
              <Text style={styles.editHint}>Le nom, la description et la visibilité sont ceux affichés dans KEEP. Les morceaux restent chez leurs plateformes d’origine.</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Nom de la playlist" placeholderTextColor={colors.textMuted} />
              <TextInput style={[styles.input, styles.multiline]} value={editDescription} onChangeText={setEditDescription} placeholder="Description" placeholderTextColor={colors.textMuted} multiline />
              <TouchableOpacity style={styles.visibilityButton} onPress={() => setEditPublic((v) => !v)}><Text style={styles.visibilityText}>{editPublic ? '👁 Visible sur mon profil' : '🔒 Masquée sur mon profil'}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => void saveEdit()} disabled={savingEdit}><Text style={styles.saveText}>{savingEdit ? 'Enregistrement…' : 'ENREGISTRER'}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(null)}><Text style={styles.cancelText}>Annuler</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  headerSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  servicesButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  servicesButtonText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  organizeButton: { marginHorizontal: spacing.xl, marginTop: spacing.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  organizeButtonText: { color: colors.primaryLight, fontWeight: '700', fontSize: 14 },
  analysisSummary: { marginHorizontal: spacing.xl, marginTop: spacing.sm, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  analysisSummaryText: { flex: 1, color: colors.textPrimary, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  analysisChevron: { color: colors.primaryLight, fontSize: 18, fontWeight: '900' },
  analysisCard: { marginHorizontal: spacing.xl, marginTop: spacing.xs, backgroundColor: colors.backgroundElevated, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  analysisLine: { color: colors.textSecondary, fontSize: 13 },
  genreLine: { color: colors.primaryLight, fontSize: 12, lineHeight: 17, marginTop: 4 },
  analysisHelp: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  viewSuggestionsButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  viewSuggestionsText: { color: colors.primaryLight, fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, flexGrow: 1 },
  playlistBlock: { backgroundColor: colors.backgroundCard, borderRadius: radius.md, marginVertical: spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  playlistCard: { flexDirection: 'row', minHeight: 90 },
  playlistCover: { width: 90, height: 90, backgroundColor: colors.backgroundElevated },
  playlistCoverFallback: { alignItems: 'center', justifyContent: 'center' },
  playlistCoverText: { color: colors.primaryLight, fontSize: 26, fontWeight: '900' },
  playlistInfo: { flex: 1, padding: spacing.md, justifyContent: 'center' },
  playlistName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  playlistDesc: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 16 },
  songCount: { fontSize: 12, color: colors.keep, marginTop: spacing.xs, fontWeight: '600' },
  chevron: { color: colors.primaryLight, fontSize: 20, alignSelf: 'center', paddingHorizontal: spacing.md },
  playlistActions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  actionButton: { minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  tracksPanel: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.backgroundElevated },
  panelHint: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginBottom: 2 },
  loadingText: { color: colors.textSecondary, fontSize: 12, paddingVertical: spacing.md, textAlign: 'center' },
  trackRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  trackCover: { width: 54, height: 54, borderRadius: 8, backgroundColor: colors.backgroundCard },
  trackFallback: { color: colors.primaryLight, fontSize: 18 },
  trackInfo: { flex: 1 },
  trackTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  trackArtist: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  trackAvailable: { color: colors.textMuted, fontSize: 9, marginTop: 3 },
  trackActions: { flexDirection: 'row', gap: 7, marginTop: 7, alignItems: 'center', flexWrap: 'wrap' },
  smallAction: { minHeight: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 9, justifyContent: 'center' },
  smallActionText: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  emptyCard: { margin: spacing.lg, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  emptyText: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
  emptyButton: { marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill, minHeight: 40, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  emptyButtonText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  demoBadge: { backgroundColor: colors.demoBadgeBg, borderTopWidth: 1, borderTopColor: colors.demoBadgeBorder, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  demoText: { color: colors.demoBadgeText, fontSize: 11, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.76)', justifyContent: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  editCard: { backgroundColor: colors.backgroundCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  editTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  editHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 4 },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, paddingHorizontal: spacing.md, color: colors.textPrimary, fontSize: 14 },
  multiline: { minHeight: 86, paddingTop: spacing.md, textAlignVertical: 'top' },
  visibilityButton: { minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  visibilityText: { color: colors.primaryLight, fontSize: 12, fontWeight: '800' },
  saveButton: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  saveText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  cancelButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
});