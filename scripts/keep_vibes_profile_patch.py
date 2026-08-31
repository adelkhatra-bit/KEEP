from pathlib import Path


def replace_once(path: Path, old: str, new: str):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, got {count}: {old[:80]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


profile = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
my_music = Path('packages/mobile/src/screens/MyMusicScreen.tsx')
visitor = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')

replace_once(
    profile,
    "  { key: 'KEEP', label: 'KEEP' }, { key: 'PLAYLISTS', label: 'Playlists' }, { key: 'ARTISTS', label: 'Artistes' }, { key: 'ALBUMS', label: 'Albums' },",
    "  { key: 'KEEP', label: 'KEEP' }, { key: 'PLAYLISTS', label: 'Vibes' }, { key: 'ARTISTS', label: 'Artistes' }, { key: 'ALBUMS', label: 'Albums' },",
)

replace_once(
    profile,
    "  const [profileSwipeOpen, setProfileSwipeOpen] = useState(false);\n",
    "  const [profileSwipeOpen, setProfileSwipeOpen] = useState(false);\n  const [selectionSwipe, setSelectionSwipe] = useState<{ title: string; subtitle: string; tracks: CanonicalTrack[] } | null>(null);\n",
)

replace_once(
    profile,
    "  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {\n    if (providerPlaylists.length) {\n      return providerPlaylists.filter((playlist) => preferenceFor(playlistPreferences, providerId, playlist.id)?.isPublic === true);\n    }\n    const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);\n    if (!publicKeptTracks.length || localPreference?.isPublic !== true) return [];\n    return [{ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference.name || 'Mes KEEP', description: localPreference.description || 'Morceaux publics gardés sur cet appareil', trackCount: publicKeptTracks.length, isKeepManaged: true }];\n  }, [playlistPreferences, providerId, providerPlaylists, publicKeptTracks.length]);",
    "  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {\n    // Sur SON profil, l'utilisateur voit toutes ses Vibes, même privées. La\n    // visibilité reste affichée et les visiteurs ne reçoivent que les Vibes\n    // publiques via les règles Supabase.\n    if (providerPlaylists.length) return providerPlaylists;\n    const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);\n    if (!keptTracks.length) return [];\n    return [{ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference?.name || 'Mes KEEP', description: localPreference?.description || 'Morceaux gardés avec KEEP', trackCount: keptTracks.length, isKeepManaged: true }];\n  }, [keptTracks.length, playlistPreferences, providerId, providerPlaylists]);",
)

replace_once(
    profile,
    "  const loadPlaylistTracks = async (playlist: ProviderPlaylist) => {\n    if (playlist.id === LOCAL_PROFILE_PLAYLIST_ID) {\n      const localTracks = publicKeptTracks.map((entry) => entry.track);\n      setPlaylistTracks((current) => ({ ...current, [playlist.id]: localTracks }));\n      return;\n    }\n    if (playlistTracks[playlist.id]) return;\n    setLoadingPlaylistId(playlist.id);\n    try {\n      const session = await musicEngine.getSession();\n      const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);\n      const visibleTracks = musicEngine.usesDemoMusicProvider ? tracks.filter((track) => publicTrackIds.has(track.id)) : tracks;\n      setPlaylistTracks((current) => ({ ...current, [playlist.id]: visibleTracks }));\n    } catch {\n      Alert.alert('Playlist', 'Impossible de charger les morceaux de cette playlist pour le moment.');\n    } finally {\n      setLoadingPlaylistId(null);\n    }\n  };",
    "  const loadPlaylistTracks = async (playlist: ProviderPlaylist): Promise<CanonicalTrack[]> => {\n    if (playlist.id === LOCAL_PROFILE_PLAYLIST_ID) {\n      const localTracks = keptTracks.map((entry) => entry.track);\n      setPlaylistTracks((current) => ({ ...current, [playlist.id]: localTracks }));\n      return localTracks;\n    }\n    if (playlistTracks[playlist.id]) return playlistTracks[playlist.id];\n    setLoadingPlaylistId(playlist.id);\n    try {\n      const session = await musicEngine.getSession();\n      const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);\n      // Le propriétaire peut voir ses titres privés. La RLS protège les Vibes\n      // publiques lorsqu'elles sont lues depuis le profil d'un autre membre.\n      const visibleTracks = tracks;\n      setPlaylistTracks((current) => ({ ...current, [playlist.id]: visibleTracks }));\n      return visibleTracks;\n    } catch {\n      Alert.alert('Vibe KEEP', 'Impossible de charger les morceaux de cette Vibe pour le moment.');\n      return [];\n    } finally {\n      setLoadingPlaylistId(null);\n    }\n  };",
)

replace_once(
    profile,
    "  const togglePlaylist = async (playlist: ProviderPlaylist) => {\n    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }\n    setExpandedPlaylistId(playlist.id);\n    await loadPlaylistTracks(playlist);\n  };",
    "  const togglePlaylist = async (playlist: ProviderPlaylist) => {\n    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }\n    setExpandedPlaylistId(playlist.id);\n    await loadPlaylistTracks(playlist);\n  };\n\n  const openPlaylistSwipe = async (playlist: ProviderPlaylist) => {\n    const tracks = await loadPlaylistTracks(playlist);\n    if (!tracks.length) {\n      Alert.alert('Vibe KEEP', 'Cette Vibe ne contient pas encore assez de morceaux à swiper.');\n      return;\n    }\n    setSelectionSwipe({ title: playlist.name, subtitle: 'Ta sélection KEEP, morceau après morceau.', tracks });\n  };",
)

replace_once(
    profile,
    "        <Text style={s.ownerKeepHint}>Le profil reste volontairement épuré. Gère Public/Privé et le rangement depuis tes sessions ou tes playlists.</Text>",
    "        <Text style={s.ownerKeepHint}>KEEP range automatiquement tes morceaux en Vibes. Tu gardes le contrôle du nom et du Public/Privé.</Text>",
)

replace_once(
    profile,
    "      if (!displayPlaylists.length) return <Empty text=\"Tes playlists publiques apparaîtront ici.\" />;",
    "      if (!displayPlaylists.length) return <Empty text=\"Tes Vibes KEEP apparaîtront ici automatiquement.\" />;",
)

replace_once(
    profile,
    "        const expanded = expandedPlaylistId === playlist.id;\n        const tracks = playlistTracks[playlist.id] ?? [];",
    "        const expanded = expandedPlaylistId === playlist.id;\n        const tracks = playlistTracks[playlist.id] ?? [];\n        const vibePreference = preferenceFor(playlistPreferences, providerId, playlist.id);\n        const vibeVisibility = vibePreference?.isPublic ? 'Public' : 'Privé';",
)

replace_once(
    profile,
    "            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'}</Text></View>",
    "            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'} · {vibeVisibility}</Text></View>",
)

replace_once(
    profile,
    "          <View style={s.playlistButtons}>\n            <TouchableOpacity style={s.playlistShareButton} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareText}>↗ Partager</Text></TouchableOpacity>\n          </View>",
    "          <View style={s.playlistButtons}>\n            <TouchableOpacity style={s.playlistShareButton} onPress={() => void openPlaylistSwipe(playlist)}><Text style={s.playlistShareText}>▶ SWIPE</Text></TouchableOpacity>\n            {vibePreference?.isPublic ? <TouchableOpacity style={s.playlistShareButton} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareText}>↗ Partager</Text></TouchableOpacity> : null}\n          </View>",
)

replace_once(
    profile,
    "    const items = activeTab === 'ARTISTS' ? artists : albums;\n    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;\n    return <View style={s.list}>{items.map((item) => <View key={item} style={s.listRow}><View style={s.note}><Text style={s.noteText}>♪</Text></View><Text style={s.listText} numberOfLines={1}>{item}</Text></View>)}</View>;",
    "    const items = activeTab === 'ARTISTS' ? artists : albums;\n    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;\n    return <View style={s.list}>{items.map((item) => {\n      const selected = publicSwipeTracks.filter((track) => activeTab === 'ARTISTS' ? track.artist === item : track.album === item);\n      return <TouchableOpacity key={item} style={s.listRow} onPress={() => setSelectionSwipe({ title: item, subtitle: activeTab === 'ARTISTS' ? 'Tous les morceaux de cet artiste dans ton KEEP.' : 'Cet album dans ton KEEP, prêt à swiper.', tracks: selected })}>\n        <View style={s.note}><Text style={s.noteText}>♪</Text></View>\n        <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{item}</Text><Text style={s.playlistCount}>{selected.length} {selected.length > 1 ? 'morceaux' : 'morceau'} · ▶ SWIPE</Text></View>\n        <Text style={s.chevron}>›</Text>\n      </TouchableOpacity>;\n    })}</View>;",
)

replace_once(
    profile,
    "    <SourceProfileQuickView",
    "    <MusicSwipeDeckModal\n      visible={Boolean(selectionSwipe)}\n      tracks={selectionSwipe?.tracks ?? []}\n      title={selectionSwipe?.title ?? 'Vibe KEEP'}\n      subtitle={selectionSwipe?.subtitle ?? 'Ta sélection KEEP.'}\n      emptyTitle=\"Aucun morceau dans cette sélection.\"\n      backLabel=\"REVENIR AU PROFIL\"\n      previewOnly\n      onClose={() => setSelectionSwipe(null)}\n    />\n\n    <SourceProfileQuickView",
)

replace_once(
    my_music,
    "          <Text style={styles.headerSubtitle} numberOfLines={2}>Ta bibliothèque KEEP complète + tes services connectés</Text>",
    "          <Text style={styles.headerSubtitle} numberOfLines={2}>Tes Vibes KEEP se rangent automatiquement + tes services connectés</Text>",
)
replace_once(
    my_music,
    "      const withTracks: PlaylistWithTracks[] = [];\n      for (const playlist of basePlaylists) {",
    "      const withTracks: PlaylistWithTracks[] = [];\n      for (const playlist of basePlaylists.filter((item) => !item.id.startsWith('keep-smart:'))) {",
)
replace_once(
    my_music,
    "        <Text style={styles.organizeButtonText}>{analyzing ? '…' : `🧹 ${t('myMusic.organizeMyMusic')}`}</Text>",
    "        <Text style={styles.organizeButtonText}>{analyzing ? '…' : '⚡ VIBES KEEP · VOIR L’ANALYSE'}</Text>",
)
replace_once(
    my_music,
    "          <Text style={styles.analysisHelp}>Le rangement intelligent utilise les styles fournis par les catalogues et apprend tes corrections. Rien n’est déplacé ou supprimé sans validation.</Text>",
    "          <Text style={styles.analysisHelp}>KEEP crée et met à jour ses Vibes automatiquement, sans clé API payante. Tu gardes le contrôle du nom et du Public/Privé ; aucun titre n’est supprimé.</Text>",
)

# Le profil visiteur garde son écran simple, mais adopte le vocabulaire KEEP et
# rend les albums directement swipables sans créer un nouveau parcours.
replace_once(
    visitor,
    "          {albums.length > 0 ? <Text style={styles.albumSummaryText} numberOfLines={2}>Albums : {albums.slice(0,5).join(' · ')}</Text> : null}",
    "          {albums.length > 0 ? <Text style={styles.albumSummaryText} numberOfLines={2}>Albums : {albums.slice(0,5).join(' · ')} · disponibles dans le SWIPE</Text> : null}",
)
replace_once(
    visitor,
    "        {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipeLaunch} onPress={() => setSwipeOpen(true)}><Text style={styles.swipeLaunchTitle}>▶ DÉCOUVRIR SON KEEP EN SWIPE</Text><Text style={styles.swipeLaunchText}>Lecture automatique des extraits · KEEP te signale les morceaux déjà présents dans tes musiques.</Text></TouchableOpacity> : null}",
    "        {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipeLaunch} onPress={() => setSwipeOpen(true)}><Text style={styles.swipeLaunchTitle}>▶ SWIPER SON UNIVERS KEEP</Text><Text style={styles.swipeLaunchText}>Vibes, artistes et albums restent un seul plaisir de découverte · aucun doublon dans ton KEEP.</Text></TouchableOpacity> : null}",
)

print('KEEP Vibes profile patch applied successfully.')
