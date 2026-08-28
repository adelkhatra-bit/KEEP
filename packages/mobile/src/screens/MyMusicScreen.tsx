import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Alert, Image, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { analyzeLibrary, CanonicalTrack, LibraryAnalysis, ProviderPlaylist } from '@keep/music';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useUserStore } from '../store/useUserStore';
import { musicEngine } from '../services/musicEngine';
import { sharePlaylist } from '../services/sharingService';
import { prepareKeylessMusicExport } from '../services/keylessMusicBridge';
import { loadPlaylistPreferences, preferenceFor, savePlaylistPreference, KeepPlaylistPreference } from '../services/keepLibraryService';
import { getSmartSortAccess, QuotaAccess } from '../services/growthAccessService';
import {
  isSmartAlbumUiId,
  loadOwnSmartAlbums,
  loadSmartAlbumTracks,
  refreshOwnSmartAlbums,
  smartAlbumAsProviderPlaylist,
  SmartAlbumRecord,
} from '../services/smartAlbumService';
import TrackPreviewButton from '../components/TrackPreviewButton';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

const ALL_KEEP_VIEW_ID = 'keep-all-music-view';
type PlaylistWithTracks = { playlist: ProviderPlaylist; tracks: CanonicalTrack[] };

function trackIdentity(track: CanonicalTrack) {
  const isrc = track.isrc?.trim().toUpperCase();
  if (isrc) return `isrc:${isrc}`;
  const title = track.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const artist = track.artist.trim().toLowerCase().replace(/\s+/g, ' ');
  return `meta:${title}|${artist}`;
}

function sortGateLabel(access: QuotaAccess | null) {
  if (!access) return 'VIBES KEEP';
  if (access.unlimited) return 'VIBES AUTO · ILLIMITÉ';
  if (access.allowed && (access.remaining ?? 0) > 0) return `TESTER VIBES AUTO · ${access.remaining} RESTANT${access.remaining === 1 ? '' : 'S'}`;
  return '🔒 VIBES AUTOMATIQUES';
}

export default function MyMusicScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { playlists, isLoading, refresh } = usePlaylistStore();
  const user = useUserStore((s) => s.user);
  const userId = user?.id ?? '';
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const setTrackVisibilityInSession = useSessionHistoryStore((s) => s.setTrackVisibilityInSession);
  const setAllKeptVisibility = useSessionHistoryStore((s) => s.setAllKeptVisibility);
  const syncUnsyncedKeeps = useSessionHistoryStore((s) => s.syncUnsyncedKeeps);
  const [analysis, setAnalysis] = useState<LibraryAnalysis | null>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tracksByPlaylist, setTracksByPlaylist] = useState<Record<string, CanonicalTrack[]>>({});
  const [loadingPlaylist, setLoadingPlaylist] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, KeepPlaylistPreference>>({});
  const [smartAlbums, setSmartAlbums] = useState<SmartAlbumRecord[]>([]);
  const [sortAccess, setSortAccess] = useState<QuotaAccess | null>(null);
  const [editing, setEditing] = useState<ProviderPlaylist | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [bulkVisibilityBusy, setBulkVisibilityBusy] = useState<'PUBLIC' | 'PRIVATE' | null>(null);

  const localKeptEntries = useMemo(() => {
    const all = sessions.flatMap((session) => session.tracks
      .filter((entry) => entry.status === 'kept')
      .map((entry) => ({ ...entry, sessionId: session.id })));
    const unique = new Map<string, (typeof all)[number]>();
    for (const entry of all) {
      const key = trackIdentity(entry.track);
      const current = unique.get(key);
      if (!current || new Date(entry.detectedAt).getTime() >= new Date(current.detectedAt).getTime()) unique.set(key, entry);
    }
    return Array.from(unique.values()).sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }, [sessions]);

  const localKeptTracks = useMemo(() => localKeptEntries.map((entry) => entry.track), [localKeptEntries]);
  const publicKeepCount = useMemo(() => localKeptEntries.filter((entry) => entry.visibility === 'PUBLIC').length, [localKeptEntries]);
  const privateKeepCount = localKeptEntries.length - publicKeepCount;
  const providerId = musicEngine.musicProvider.providerId || 'KEEP';

  const refreshSmartState = async () => {
    if (!userId || isLocalGuest || isDemoMode) {
      setSortAccess(null);
      setSmartAlbums([]);
      return;
    }
    try {
      const gate = await getSmartSortAccess(false);
      setSortAccess(gate);
      const albums = gate.unlimited ? await refreshOwnSmartAlbums() : await loadOwnSmartAlbums();
      setSmartAlbums(albums);
    } catch {
      setSortAccess(null);
      setSmartAlbums(await loadOwnSmartAlbums().catch(() => []));
    }
  };

  const refreshLibrary = async () => {
    await syncUnsyncedKeeps().catch(() => {});
    await refresh().catch(() => {});
    await refreshSmartState().catch(() => {});
  };

  useEffect(() => {
    setTracksByPlaylist({});
    setExpandedId(null);
    setAnalysis(null);
    setPreferences({});
    setSmartAlbums([]);
    setSortAccess(null);
  }, [userId]);

  useEffect(() => {
    void refreshLibrary();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshLibrary(); });
    return () => unsubscribe?.();
  }, [navigation, refresh, syncUnsyncedKeeps, userId, isLocalGuest, isDemoMode]);

  useEffect(() => {
    let live = true;
    void loadPlaylistPreferences(providerId).then((next) => { if (live) setPreferences(next); });
    return () => { live = false; };
  }, [providerId, playlists.length, smartAlbums.length, userId]);

  const basePlaylists = useMemo<ProviderPlaylist[]>(() => {
    const result: ProviderPlaylist[] = [];
    if (localKeptTracks.length) {
      result.push({
        id: ALL_KEEP_VIEW_ID,
        name: 'Toute ma musique',
        description: 'Tous tes KEEP au même endroit.',
        trackCount: localKeptTracks.length,
        isKeepManaged: true,
      });
    }
    for (const album of smartAlbums) result.push(smartAlbumAsProviderPlaylist(album));
    for (const playlist of playlists) result.push(playlist);
    return result;
  }, [localKeptTracks.length, playlists, smartAlbums]);

  const displayPlaylists = useMemo(() => basePlaylists.map((playlist) => {
    if (playlist.id === ALL_KEEP_VIEW_ID) return playlist;
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
    if (playlist.id === ALL_KEEP_VIEW_ID) {
      setTracksByPlaylist((state) => ({ ...state, [ALL_KEEP_VIEW_ID]: localKeptTracks }));
      return localKeptTracks;
    }
    setLoadingPlaylist(playlist.id);
    try {
      const tracks = isSmartAlbumUiId(playlist.id) ? await loadSmartAlbumTracks(playlist.id) : await loadProviderTracks(playlist);
      setTracksByPlaylist((state) => ({ ...state, [playlist.id]: tracks }));
      return tracks;
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

  const setWholeLibraryVisibility = async (visibility: 'PUBLIC' | 'PRIVATE') => {
    const needsChange = visibility === 'PUBLIC' ? privateKeepCount : publicKeepCount;
    if (!needsChange || bulkVisibilityBusy) return;
    setBulkVisibilityBusy(visibility);
    try {
      await setAllKeptVisibility(visibility);
    } catch (e: any) {
      Alert.alert('Visibilité', e?.message ?? 'Impossible de modifier toute la bibliothèque pour le moment.');
    } finally {
      setBulkVisibilityBusy(null);
    }
  };

  const analyzeCurrentLibrary = async () => {
    const withTracks: PlaylistWithTracks[] = [];
    for (const playlist of basePlaylists.filter((item) => !isSmartAlbumUiId(item.id))) {
      withTracks.push({ playlist, tracks: await loadTracks(playlist) });
    }
    const nextRaw = analyzeLibrary(withTracks);
    const next = nextRaw.totalTracks <= 1
      ? { ...nextRaw, unclassifiedCount: 0, duplicateGroups: [], duplicateCount: 0 }
      : nextRaw;
    setAnalysis(next);
    setAnalysisExpanded(false);
  };

  const runOrganizeAnalysis = async () => {
    if (!userId || isLocalGuest || isDemoMode) {
      navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'SMART_SORTING' });
      return;
    }
    setAnalyzing(true);
    try {
      const gate = await getSmartSortAccess(true);
      setSortAccess(gate);
      if (!gate.allowed && !gate.unlimited) {
        navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'SMART_SORTING' });
        return;
      }
      const albums = await refreshOwnSmartAlbums();
      setSmartAlbums(albums);
      await analyzeCurrentLibrary();
      const nextGate = await getSmartSortAccess(false).catch(() => gate);
      setSortAccess(nextGate);
    } catch (e: any) {
      Alert.alert('Vibes KEEP', e?.message ?? 'Impossible de ranger automatiquement la bibliothèque pour le moment.');
    } finally {
      setAnalyzing(false);
    }
  };

  const allKnownTracks = useMemo(() => {
    const map = new Map<string, CanonicalTrack>();
    for (const track of localKeptTracks) map.set(trackIdentity(track), track);
    for (const tracks of Object.values(tracksByPlaylist)) for (const track of tracks) map.set(trackIdentity(track), track);
    return Array.from(map.values());
  }, [localKeptTracks, tracksByPlaylist]);

  const genreSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const track of allKnownTracks) for (const genre of track.genres ?? []) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [allKnownTracks]);

  const analysisMessage = analysis
    ? analysis.totalTracks === 0
      ? 'Aucun morceau à analyser pour le moment.'
      : analysis.totalTracks === 1
        ? '1 morceau trouvé · KEEP attend davantage de matière.'
        : `${analysis.totalTracks} morceaux analysés · ${smartAlbums.length} Vibe${smartAlbums.length > 1 ? 's' : ''} KEEP disponible${smartAlbums.length > 1 ? 's' : ''}.`
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
      setSmartAlbums((rows) => rows.map((row) => `keep-smart:${row.id}` === editing.id ? { ...row, name: preference.name, description: preference.description, isPublic: preference.isPublic } : row));
      setEditing(null);
    } catch (e: any) {
      Alert.alert('Vibe KEEP', e?.message ?? 'Impossible d’enregistrer les modifications.');
    } finally {
      setSavingEdit(false);
    }
  };

  const localEntryForTrack = (track: CanonicalTrack) => localKeptEntries.find((item) => trackIdentity(item.track) === trackIdentity(track));

  const toggleTrackVisibility = async (track: CanonicalTrack) => {
    const entry = localEntryForTrack(track);
    if (!entry) return Alert.alert('Visibilité', 'Cette musique vient d’une Vibe ou d’un service connecté. Modifie la visibilité de sa collection.');
    const next = entry.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    try { await setTrackVisibilityInSession(entry.sessionId, entry.id, next); }
    catch { Alert.alert('Visibilité', 'Impossible de modifier la visibilité de ce morceau pour le moment.'); }
  };

  const renderTrack = (track: CanonicalTrack) => {
    const localEntry = localEntryForTrack(track);
    return <View key={trackIdentity(track)} style={styles.trackRow}>
      {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.trackCover} /> : <View style={[styles.trackCover, styles.playlistCoverFallback]}><Text style={styles.trackFallback}>♪</Text></View>}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}{track.album ? ` · ${track.album}` : ''}</Text>
      </View>
      <TrackPreviewButton trackKey={track.id} previewUrl={track.previewUrl} compact />
      {localEntry ? <TouchableOpacity style={styles.visibilityDot} onPress={() => void toggleTrackVisibility(track)}><Text style={styles.visibilityDotText}>{localEntry.visibility === 'PUBLIC' ? '◉' : '●'}</Text></TouchableOpacity> : null}
    </View>;
  };

  const renderPlaylist = ({ item }: { item: ProviderPlaylist }) => {
    const isAllKeepView = item.id === ALL_KEEP_VIEW_ID;
    const isSmart = isSmartAlbumUiId(item.id);
    const pref = isAllKeepView ? null : preferenceFor(preferences, providerId, item.id);
    const expanded = expandedId === item.id;
    const tracks = isAllKeepView ? (tracksByPlaylist[ALL_KEEP_VIEW_ID] ?? localKeptTracks) : (tracksByPlaylist[item.id] ?? []);
    const actualCount = isAllKeepView ? localKeptTracks.length : item.trackCount;
    const visibility = isAllKeepView ? `${publicKeepCount} public · ${privateKeepCount} privé` : (pref?.isPublic ? 'Public' : 'Privé');
    return <View style={[styles.playlistBlock, isSmart && styles.smartBlock]}>
      <TouchableOpacity style={styles.playlistCard} onPress={() => void togglePlaylist(item)} accessibilityLabel={`Ouvrir ${item.name}`}>
        {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.playlistCover} /> : <View style={[styles.playlistCover, styles.playlistCoverFallback]}><Text style={styles.playlistCoverText}>{isSmart ? '✦' : '♪'}</Text></View>}
        <View style={styles.playlistInfo}>
          <View style={styles.playlistTitleRow}><Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>{isSmart ? <View style={styles.smartPill}><Text style={styles.smartPillText}>VIBE</Text></View> : null}</View>
          <Text style={styles.songCount}>{actualCount} morceau{actualCount > 1 ? 'x' : ''} · {visibility}</Text>
        </View>
        {!isAllKeepView ? <TouchableOpacity style={styles.miniEdit} onPress={() => openEdit(item)}><Text style={styles.miniEditText}>✎</Text></TouchableOpacity> : null}
        <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      {expanded ? <View style={styles.tracksPanel}>
        {loadingPlaylist === item.id ? <Text style={styles.loadingText}>Chargement…</Text> : tracks.length ? tracks.map(renderTrack) : <Text style={styles.loadingText}>Aucun morceau dans cette collection.</Text>}
        {!isAllKeepView ? <View style={styles.collectionActions}>
          <TouchableOpacity style={styles.serviceMini} onPress={async () => {
            try {
              const exportTracks = tracks.length ? tracks : await loadTracks(item);
              if (!exportTracks.length) return Alert.alert('Services musicaux', 'Cette Vibe ne contient encore aucun morceau.');
              await prepareKeylessMusicExport(item.name, exportTracks);
              navigation.navigate('MusicConnections');
            } catch (e: any) {
              Alert.alert('Services musicaux', e?.message ?? 'Impossible de préparer cette Vibe.');
            }
          }}><Text style={styles.serviceMiniText}>♫ SERVICES</Text></TouchableOpacity>
          <TouchableOpacity style={styles.shareMini} onPress={() => sharePlaylist(item.id, item.name).catch(() => Alert.alert('Partager', 'Partage indisponible pour le moment.'))}><Text style={styles.shareMiniText}>↗ PARTAGER</Text></TouchableOpacity>
        </View> : null}
      </View> : null}
    </View>;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>Mes musiques</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>KEEP · Vibes · services</Text>
        </View>
        <TouchableOpacity style={styles.servicesButton} onPress={() => navigation.navigate('MusicConnections')} accessibilityLabel="Gérer les services musicaux"><Text style={styles.servicesButtonText}>＋ Services</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.vibeBar, sortAccess && !sortAccess.allowed && !sortAccess.unlimited && styles.vibeBarLocked]} onPress={() => void runOrganizeAnalysis()} disabled={analyzing}>
        <View style={styles.vibeBarCopy}><Text style={styles.vibeBarTitle}>{analyzing ? 'KEEP RANGE…' : sortGateLabel(sortAccess)}</Text><Text style={styles.vibeBarHint}>{sortAccess?.unlimited ? 'Le rangement se met à jour automatiquement.' : sortAccess?.allowed ? 'Essai disponible · tu gardes le contrôle des noms.' : 'Creator Pro requis, ou gagne un essai avec ta communauté.'}</Text></View>
        <Text style={styles.vibeArrow}>{sortAccess?.allowed || sortAccess?.unlimited ? '✦' : '🔒'}</Text>
      </TouchableOpacity>

      {localKeptEntries.length ? <View style={styles.libraryStrip}>
        <View style={styles.stat}><Text style={styles.statValue}>{publicKeepCount}</Text><Text style={styles.statLabel}>PUBLIC</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{privateKeepCount}</Text><Text style={styles.statLabel}>PRIVÉ</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{localKeptEntries.length}</Text><Text style={styles.statLabel}>TOTAL</Text></View>
        <View style={styles.visibilityTools}>
          <TouchableOpacity style={styles.visibilityMini} onPress={() => void setWholeLibraryVisibility('PUBLIC')} disabled={privateKeepCount === 0 || bulkVisibilityBusy !== null}><Text style={styles.visibilityMiniText}>◉ Public</Text></TouchableOpacity>
          <TouchableOpacity style={styles.visibilityMini} onPress={() => void setWholeLibraryVisibility('PRIVATE')} disabled={publicKeepCount === 0 || bulkVisibilityBusy !== null}><Text style={styles.visibilityMiniText}>● Privé</Text></TouchableOpacity>
        </View>
      </View> : null}

      {analysis ? <TouchableOpacity style={styles.analysisSummary} onPress={() => setAnalysisExpanded((value) => !value)}>
        <Text style={styles.analysisSummaryText} numberOfLines={2}>{analysisMessage}</Text><Text style={styles.analysisChevron}>{analysisExpanded ? '⌃' : '⌄'}</Text>
      </TouchableOpacity> : null}
      {analysis && analysisExpanded ? <View style={styles.analysisCard}>
        <Text style={styles.analysisLine}>{t('myMusic.songsAnalyzed', { count: analysis.totalTracks })}</Text>
        {genreSummary.length ? <Text style={styles.genreLine}>Styles : {genreSummary.map(([genre, count]) => `${genre} ${count}`).join(' · ')}</Text> : null}
        <Text style={styles.analysisHelp}>KEEP crée les Vibes par style sans supprimer tes morceaux. Tu peux les renommer et les rendre publiques ou privées.</Text>
      </View> : null}

      <FlatList
        data={displayPlaylists}
        renderItem={renderPlaylist}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isLoading}
        onRefresh={() => { void refreshLibrary(); }}
        ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>Aucune musique gardée</Text><Text style={styles.emptyText}>Garde quelques morceaux : KEEP construira ensuite ton univers et, selon ta formule, tes Vibes automatiques.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Main', { screen: 'Listen' })}><Text style={styles.emptyButtonText}>ÉCOUTER</Text></TouchableOpacity></View>}
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}><ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><View style={styles.editCard}>
          <Text style={styles.editTitle}>{editing && isSmartAlbumUiId(editing.id) ? 'Renommer ma Vibe' : 'Modifier la collection'}</Text>
          <Text style={styles.editHint}>Le nom et la visibilité restent entièrement sous ton contrôle.</Text>
          <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Nom" placeholderTextColor={colors.textMuted} />
          <TextInput style={[styles.input, styles.multiline]} value={editDescription} onChangeText={setEditDescription} placeholder="Description" placeholderTextColor={colors.textMuted} multiline />
          <TouchableOpacity style={styles.visibilityButton} onPress={() => setEditPublic((v) => !v)}><Text style={styles.visibilityText}>{editPublic ? '◉ Visible sur mon profil' : '● Privée'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={() => void saveEdit()} disabled={savingEdit}>{savingEdit ? <ActivityIndicator color="#fff"/> : <Text style={styles.saveText}>ENREGISTRER</Text>}</TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(null)}><Text style={styles.cancelText}>Annuler</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},
  header:{paddingVertical:13,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},headerCopy:{flex:1,minWidth:0},title:{...typography.h1,color:colors.textPrimary},headerSubtitle:{color:colors.textMuted,fontSize:10,marginTop:1},servicesButton:{backgroundColor:colors.primary,borderRadius:radius.pill,paddingHorizontal:11,minHeight:36,alignItems:'center',justifyContent:'center'},servicesButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  vibeBar:{marginHorizontal:14,marginTop:8,minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.primary,backgroundColor:'#171020',paddingHorizontal:12,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:8},vibeBarLocked:{borderColor:'#493369'},vibeBarCopy:{flex:1},vibeBarTitle:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},vibeBarHint:{color:'#D8D0E2',fontSize:8,lineHeight:12,marginTop:2,fontWeight:'700'},vibeArrow:{fontSize:16},
  libraryStrip:{marginHorizontal:14,marginTop:6,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,minHeight:64,flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:5},stat:{minWidth:48,alignItems:'center',justifyContent:'center',paddingHorizontal:4},statValue:{color:colors.textPrimary,fontSize:17,fontWeight:'900'},statLabel:{color:colors.textMuted,fontSize:7,fontWeight:'900',marginTop:1},visibilityTools:{flex:1,flexDirection:'row',justifyContent:'flex-end',gap:5},visibilityMini:{minHeight:31,paddingHorizontal:7,borderRadius:16,borderWidth:1,borderColor:'#493369',alignItems:'center',justifyContent:'center'},visibilityMiniText:{color:colors.primaryLight,fontSize:8,fontWeight:'900'},
  analysisSummary:{marginHorizontal:14,marginTop:6,minHeight:38,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:8},analysisSummaryText:{flex:1,color:colors.textPrimary,fontSize:10,lineHeight:14,fontWeight:'800'},analysisChevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},analysisCard:{marginHorizontal:14,marginTop:4,backgroundColor:colors.backgroundElevated,borderRadius:12,padding:10,gap:4},analysisLine:{color:colors.textSecondary,fontSize:11},genreLine:{color:colors.primaryLight,fontSize:10,lineHeight:15},analysisHelp:{color:colors.textMuted,fontSize:9,lineHeight:14},
  list:{paddingHorizontal:12,paddingVertical:8,flexGrow:1},playlistBlock:{backgroundColor:colors.backgroundCard,borderRadius:13,marginVertical:5,overflow:'hidden',borderWidth:1,borderColor:colors.border},smartBlock:{borderColor:'#493369'},playlistCard:{flexDirection:'row',minHeight:70,alignItems:'center'},playlistCover:{width:70,height:70,backgroundColor:colors.backgroundElevated},playlistCoverFallback:{alignItems:'center',justifyContent:'center'},playlistCoverText:{color:colors.primaryLight,fontSize:22,fontWeight:'900'},playlistInfo:{flex:1,paddingHorizontal:10},playlistTitleRow:{flexDirection:'row',alignItems:'center',gap:6},playlistName:{flexShrink:1,fontSize:14,fontWeight:'800',color:colors.textPrimary},smartPill:{paddingHorizontal:6,paddingVertical:3,borderRadius:999,backgroundColor:'#2A203A',borderWidth:1,borderColor:'#7652AF'},smartPillText:{color:'#C9B3FF',fontSize:7,fontWeight:'900'},songCount:{fontSize:9,color:colors.keep,marginTop:4,fontWeight:'700'},chevron:{color:colors.primaryLight,fontSize:18,paddingHorizontal:8},miniEdit:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border},miniEditText:{color:colors.textSecondary,fontSize:13,fontWeight:'900'},
  tracksPanel:{borderTopWidth:1,borderTopColor:colors.border,padding:8,gap:6,backgroundColor:colors.backgroundElevated},trackRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:8,paddingVertical:4},trackCover:{width:40,height:40,borderRadius:8,backgroundColor:colors.backgroundCard},trackFallback:{color:colors.primaryLight,fontSize:16},trackInfo:{flex:1},trackTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'800'},trackArtist:{color:colors.textSecondary,fontSize:9,marginTop:2},visibilityDot:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border},visibilityDotText:{color:colors.primaryLight,fontSize:10},loadingText:{color:colors.textMuted,fontSize:10,paddingVertical:8},collectionActions:{flexDirection:'row',justifyContent:'flex-end',gap:6,marginTop:2},serviceMini:{minHeight:28,paddingHorizontal:10,borderRadius:14,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},serviceMiniText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},shareMini:{minHeight:28,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:'#38D990',backgroundColor:'#123D2C',alignItems:'center',justifyContent:'center'},shareMiniText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},
  emptyCard:{margin:12,padding:18,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,alignItems:'center'},emptyTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'800'},emptyText:{color:colors.textSecondary,fontSize:11,textAlign:'center',marginTop:6,lineHeight:16},emptyButton:{marginTop:10,backgroundColor:colors.primary,borderRadius:radius.pill,minHeight:38,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},emptyButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.76)',justifyContent:'center'},modalScroll:{flexGrow:1,justifyContent:'center',padding:18},editCard:{backgroundColor:colors.backgroundCard,borderRadius:18,borderWidth:1,borderColor:colors.border,padding:16,gap:9},editTitle:{color:colors.textPrimary,fontSize:19,fontWeight:'900'},editHint:{color:colors.textMuted,fontSize:10,lineHeight:15},input:{minHeight:46,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:12,color:colors.textPrimary,fontSize:13},multiline:{minHeight:76,paddingTop:10,textAlignVertical:'top'},visibilityButton:{minHeight:42,borderRadius:12,borderWidth:1,borderColor:colors.primary,justifyContent:'center',alignItems:'center'},visibilityText:{color:colors.primaryLight,fontSize:11,fontWeight:'800'},saveButton:{minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},saveText:{color:'#FFF',fontSize:11,fontWeight:'900'},cancelButton:{minHeight:34,alignItems:'center',justifyContent:'center'},cancelText:{color:colors.textMuted,fontSize:10,fontWeight:'700'},
});