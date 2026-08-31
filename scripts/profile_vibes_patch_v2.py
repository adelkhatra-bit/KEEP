from pathlib import Path


def replace_once(path: Path, old: str, new: str):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}: {old[:100]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')

replace_once(
    path,
    "import { KeepPlaylistPreference, loadPlaylistPreferences, preferenceFor } from '../services/keepLibraryService';\n",
    "import { KeepPlaylistPreference, loadPlaylistPreferences, preferenceFor } from '../services/keepLibraryService';\nimport { isSmartAlbumUiId, loadOwnSmartAlbums, loadSmartAlbumTracks, refreshOwnSmartAlbums, smartAlbumAsProviderPlaylist, SmartAlbumRecord } from '../services/smartAlbumService';\n",
)

replace_once(
    path,
    "  { key: 'KEEP', label: 'KEEP' }, { key: 'PLAYLISTS', label: 'Playlists' }, { key: 'ARTISTS', label: 'Artistes' }, { key: 'ALBUMS', label: 'Albums' },",
    "  { key: 'KEEP', label: 'KEEP' }, { key: 'PLAYLISTS', label: 'Vibes' }, { key: 'ARTISTS', label: 'Artistes' }, { key: 'ALBUMS', label: 'Albums' },",
)

replace_once(
    path,
    "  const [profileSwipeOpen, setProfileSwipeOpen] = useState(false);\n",
    "  const [profileSwipeOpen, setProfileSwipeOpen] = useState(false);\n  const [selectionSwipe, setSelectionSwipe] = useState<{ title: string; subtitle: string; tracks: CanonicalTrack[] } | null>(null);\n  const [smartAlbums, setSmartAlbums] = useState<SmartAlbumRecord[]>([]);\n",
)

replace_once(
    path,
    "  useEffect(() => {\n    let live = true;\n    const refreshPreferences = async () => {\n      const next = await loadPlaylistPreferences(providerId).catch(() => ({}));\n      if (live) setPlaylistPreferences(next);\n    };\n    void refreshPreferences();\n    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshPreferences(); });\n    return () => { live = false; unsubscribe?.(); };\n  }, [navigation, providerId, providerPlaylists.length]);",
    "  useEffect(() => {\n    let live = true;\n    const refreshPreferences = async () => {\n      const next = await loadPlaylistPreferences(providerId).catch(() => ({}));\n      if (live) setPlaylistPreferences(next);\n    };\n    void refreshPreferences();\n    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshPreferences(); });\n    return () => { live = false; unsubscribe?.(); };\n  }, [navigation, providerId, providerPlaylists.length, smartAlbums.length]);\n\n  useEffect(() => {\n    let live = true;\n    const refreshSmart = async () => {\n      if (accountRequired) { if (live) setSmartAlbums([]); return; }\n      try {\n        const rows = planCode === 'CREATOR_PRO' || planCode === 'VENUE_PRO'\n          ? await refreshOwnSmartAlbums()\n          : await loadOwnSmartAlbums();\n        if (live) setSmartAlbums(rows);\n      } catch { if (live) setSmartAlbums([]); }\n    };\n    void refreshSmart();\n    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshSmart(); });\n    return () => { live = false; unsubscribe?.(); };\n  }, [accountRequired, navigation, planCode, user?.id]);",
)

replace_once(
    path,
    "  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {\n    if (providerPlaylists.length) {\n      return providerPlaylists.filter((playlist) => preferenceFor(playlistPreferences, providerId, playlist.id)?.isPublic === true);\n    }\n    const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);\n    if (!publicKeptTracks.length || localPreference?.isPublic !== true) return [];\n    return [{ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference.name || 'Mes KEEP', description: localPreference.description || 'Morceaux publics gardés sur cet appareil', trackCount: publicKeptTracks.length, isKeepManaged: true }];\n  }, [playlistPreferences, providerId, providerPlaylists, publicKeptTracks.length]);",
    "  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {\n    const result: ProviderPlaylist[] = smartAlbums.map(smartAlbumAsProviderPlaylist);\n    if (providerPlaylists.length) result.push(...providerPlaylists);\n    if (!result.length && publicKeptTracks.length) {\n      const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);\n      result.push({ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference?.name || 'Mes KEEP', description: localPreference?.description || 'Morceaux publics gardés avec KEEP', trackCount: publicKeptTracks.length, isKeepManaged: true });\n    }\n    return result;\n  }, [playlistPreferences, providerId, providerPlaylists, publicKeptTracks.length, smartAlbums]);",
)

replace_once(
    path,
    "  const loadPlaylistTracks = async (playlist: ProviderPlaylist) => {\n    if (playlist.id === LOCAL_PROFILE_PLAYLIST_ID) {\n      const localTracks = publicKeptTracks.map((entry) => entry.track);\n      setPlaylistTracks((current) => ({ ...current, [playlist.id]: localTracks }));\n      return;\n    }\n    if (playlistTracks[playlist.id]) return;\n    setLoadingPlaylistId(playlist.id);\n    try {\n      const session = await musicEngine.getSession();\n      const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);\n      const visibleTracks = musicEngine.usesDemoMusicProvider ? tracks.filter((track) => publicTrackIds.has(track.id)) : tracks;\n      setPlaylistTracks((current) => ({ ...current, [playlist.id]: visibleTracks }));\n    } catch {\n      Alert.alert('Playlist', 'Impossible de charger les morceaux de cette playlist pour le moment.');\n    } finally {\n      setLoadingPlaylistId(null);\n    }\n  };",
    "  const loadPlaylistTracks = async (playlist: ProviderPlaylist): Promise<CanonicalTrack[]> => {\n    if (playlist.id === LOCAL_PROFILE_PLAYLIST_ID) {\n      const localTracks = publicKeptTracks.map((entry) => entry.track);\n      setPlaylistTracks((current) => ({ ...current, [playlist.id]: localTracks }));\n      return localTracks;\n    }\n    if (playlistTracks[playlist.id]) return playlistTracks[playlist.id];\n    setLoadingPlaylistId(playlist.id);\n    try {\n      if (isSmartAlbumUiId(playlist.id)) {\n        const tracks = await loadSmartAlbumTracks(playlist.id);\n        setPlaylistTracks((current) => ({ ...current, [playlist.id]: tracks }));\n        return tracks;\n      }\n      const session = await musicEngine.getSession();\n      const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);\n      const visibleTracks = musicEngine.usesDemoMusicProvider ? tracks.filter((track) => publicTrackIds.has(track.id)) : tracks;\n      setPlaylistTracks((current) => ({ ...current, [playlist.id]: visibleTracks }));\n      return visibleTracks;\n    } catch {\n      Alert.alert('Vibe KEEP', 'Impossible de charger les morceaux de cette collection pour le moment.');\n      return [];\n    } finally {\n      setLoadingPlaylistId(null);\n    }\n  };",
)

replace_once(
    path,
    "  const togglePlaylist = async (playlist: ProviderPlaylist) => {\n    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }\n    setExpandedPlaylistId(playlist.id);\n    await loadPlaylistTracks(playlist);\n  };",
    "  const togglePlaylist = async (playlist: ProviderPlaylist) => {\n    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }\n    setExpandedPlaylistId(playlist.id);\n    await loadPlaylistTracks(playlist);\n  };\n\n  const openPlaylistSwipe = async (playlist: ProviderPlaylist) => {\n    const tracks = await loadPlaylistTracks(playlist);\n    if (!tracks.length) return Alert.alert('Vibe KEEP', 'Cette collection ne contient pas encore de morceau à swiper.');\n    setSelectionSwipe({ title: playlist.name, subtitle: 'Ta sélection KEEP, morceau après morceau.', tracks });\n  };",
)

replace_once(
    path,
    "        <Text style={s.ownerKeepHint}>Le profil reste volontairement épuré. Gère Public/Privé et le rangement depuis tes sessions ou tes playlists.</Text>",
    "        <Text style={s.ownerKeepHint}>KEEP construit ton univers : Vibes, artistes et albums. Tu gardes le contrôle du Public/Privé et des noms.</Text>",
)

replace_once(
    path,
    "      if (!displayPlaylists.length) return <Empty text=\"Tes playlists publiques apparaîtront ici.\" />;",
    "      if (!displayPlaylists.length) return <Empty text=\"Tes Vibes KEEP apparaîtront ici automatiquement.\" />;",
)

replace_once(
    path,
    "        const expanded = expandedPlaylistId === playlist.id;\n        const tracks = playlistTracks[playlist.id] ?? [];",
    "        const expanded = expandedPlaylistId === playlist.id;\n        const tracks = playlistTracks[playlist.id] ?? [];\n        const preference = preferenceFor(playlistPreferences, providerId, playlist.id);\n        const smart = smartAlbums.find((album) => `keep-smart:${album.id}` === playlist.id);\n        const isPublic = preference?.isPublic ?? smart?.isPublic ?? false;",
)

replace_once(
    path,
    "            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'}</Text></View>",
    "            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'} · {isPublic ? 'Public' : 'Privé'}</Text></View>",
)

replace_once(
    path,
    "          <View style={s.playlistButtons}>\n            <TouchableOpacity style={s.playlistShareButton} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareText}>↗ Partager</Text></TouchableOpacity>\n          </View>",
    "          <View style={s.playlistButtons}>\n            <TouchableOpacity style={s.playlistShareButton} onPress={() => void openPlaylistSwipe(playlist)}><Text style={s.playlistShareText}>▶ SWIPE</Text></TouchableOpacity>\n            {isPublic ? <TouchableOpacity style={s.playlistShareButton} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareText}>↗ Partager</Text></TouchableOpacity> : null}\n          </View>",
)

replace_once(
    path,
    "    const items = activeTab === 'ARTISTS' ? artists : albums;\n    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;\n    return <View style={s.list}>{items.map((item) => <View key={item} style={s.listRow}><View style={s.note}><Text style={s.noteText}>♪</Text></View><Text style={s.listText} numberOfLines={1}>{item}</Text></View>)}</View>;",
    "    const items = activeTab === 'ARTISTS' ? artists : albums;\n    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;\n    return <View style={s.list}>{items.map((item) => {\n      const selected = publicSwipeTracks.filter((track) => activeTab === 'ARTISTS' ? track.artist === item : track.album === item);\n      return <TouchableOpacity key={item} style={s.listRow} onPress={() => setSelectionSwipe({ title: item, subtitle: activeTab === 'ARTISTS' ? 'Tous les morceaux de cet artiste dans ton KEEP.' : 'Cet album dans ton KEEP, prêt à swiper.', tracks: selected })}>\n        <View style={s.note}><Text style={s.noteText}>♪</Text></View>\n        <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{item}</Text><Text style={s.playlistCount}>{selected.length} {selected.length > 1 ? 'morceaux' : 'morceau'} · ▶ SWIPE</Text></View>\n        <Text style={s.chevron}>›</Text>\n      </TouchableOpacity>;\n    })}</View>;",
)

replace_once(
    path,
    "    <SourceProfileQuickView\n",
    "    <MusicSwipeDeckModal\n      visible={Boolean(selectionSwipe)}\n      tracks={selectionSwipe?.tracks ?? []}\n      title={selectionSwipe?.title ?? 'Vibe KEEP'}\n      subtitle={selectionSwipe?.subtitle ?? 'Ta sélection KEEP.'}\n      emptyTitle=\"Aucun morceau dans cette sélection.\"\n      backLabel=\"REVENIR AU PROFIL\"\n      previewOnly\n      onClose={() => setSelectionSwipe(null)}\n    />\n\n    <SourceProfileQuickView\n",
)

print('Profile KEEP Vibes v2 patch applied.')
