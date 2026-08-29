from pathlib import Path
import re

path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
text = path.read_text()
original = text

old_group_block = re.compile(
    r"  const artists = useMemo\(\(\) => Array\.from\(new Set\(publicKeptTracks\.map\(\(entry\) => entry\.track\.artist\)\)\), \[publicKeptTracks\]\);\n"
    r"  const albums = useMemo\(\(\) => Array\.from\(new Set\(publicKeptTracks\.map\(\(entry\) => entry\.track\.album\)\.filter\(Boolean\) as string\[\]\)\), \[publicKeptTracks\]\);\n"
    r"  const displayPlaylists = useMemo<ProviderPlaylist\[\]>\(\(\) => \{.*?\n  \}, \[playlistPreferences, providerId, providerPlaylists, publicKeptTracks\.length, smartAlbums\]\);",
    re.S,
)
new_group_block = """  const artistGroups = useMemo(() => {
    const groups = new Map<string, { name: string; tracks: CanonicalTrack[] }>();
    for (const entry of publicKeptTracks) {
      const name = entry.track.artist.trim();
      if (!name) continue;
      const key = name.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/\\s+/g, ' ');
      const group = groups.get(key) ?? { name, tracks: [] };
      if (!group.tracks.some((track) => track.id === entry.track.id)) group.tracks.push(entry.track);
      groups.set(key, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [publicKeptTracks]);
  const albumGroups = useMemo(() => {
    const groups = new Map<string, { key: string; album: string; artist: string; tracks: CanonicalTrack[] }>();
    for (const entry of publicKeptTracks) {
      const album = entry.track.album?.trim();
      const artist = entry.track.artist.trim();
      if (!album || !artist) continue;
      const normalize = (value: string) => value.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/\\s+/g, ' ');
      const key = `${normalize(artist)}|${normalize(album)}`;
      const group = groups.get(key) ?? { key, album, artist, tracks: [] };
      if (!group.tracks.some((track) => track.id === entry.track.id)) group.tracks.push(entry.track);
      groups.set(key, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album));
  }, [publicKeptTracks]);
  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => smartAlbums.map(smartAlbumAsProviderPlaylist), [smartAlbums]);"""
text, count = old_group_block.subn(new_group_block, text, count=1)
if count != 1:
    raise SystemExit(f'Expected grouping block once, got {count}')

text = text.replace(
    "<Text style={s.ownerKeepHint}>KEEP construit ton univers : Vibes, artistes et albums. Tu gardes le contrôle du Public/Privé et des noms.</Text>",
    "<Text style={s.ownerKeepHint}>KEEP construit ton univers : Vibes (styles/ambiances), Artistes (interprètes) et Albums (albums d’origine). Tu gardes le contrôle du Public/Privé et des noms.</Text>",
    1,
)

start = text.index("    if (activeTab === 'PLAYLISTS') {")
end_marker = "    })}</View>;\n  };"
end = text.index(end_marker, start) + len(end_marker)
old_tabs = text[start:end]
new_tabs = """    if (activeTab === 'PLAYLISTS') {
      const vibeExplainer = <View style={s.collectionExplainer}>
        <Text style={s.collectionExplainerTitle}>Vibes (ambiances & styles)</Text>
        <Text style={s.collectionExplainerText}>KEEP regroupe automatiquement plusieurs morceaux qui vont ensemble par style ou ambiance. Ce ne sont ni des albums ni des événements.</Text>
      </View>;
      if (!displayPlaylists.length) return <View style={s.list}>{vibeExplainer}<Empty text="Aucune Vibe pour le moment. KEEP en créera automatiquement quand plusieurs morceaux compatibles seront présents dans ton KEEP." /></View>;
      return <View style={s.list}>{vibeExplainer}{displayPlaylists.map((playlist) => {
        const expanded = expandedPlaylistId === playlist.id;
        const tracks = playlistTracks[playlist.id] ?? [];
        const preference = preferenceFor(playlistPreferences, providerId, playlist.id);
        const smart = smartAlbums.find((album) => `keep-smart:${album.id}` === playlist.id);
        const isPublic = smart?.isPublic ?? preference?.isPublic ?? false;
        return <View key={playlist.id} style={s.playlistBlock}>
          <TouchableOpacity style={s.listRow} onPress={() => void togglePlaylist(playlist)} accessibilityLabel={`Ouvrir ${playlist.name}`}>
            {playlist.coverUrl ? <Image source={{ uri: playlist.coverUrl }} style={s.note} /> : <View style={s.note}><Text style={s.noteText}>♪</Text></View>}
            <View style={s.playlistText}>
              <Text style={s.listText} numberOfLines={1}>{playlist.name}</Text>
              {!!playlist.description && <Text style={s.playlistDescription} numberOfLines={2}>{playlist.description}</Text>}
              <Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'} · {isPublic ? 'Public' : 'Privé'}</Text>
            </View>
            <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          <View style={s.playlistButtons}>
            <TouchableOpacity style={s.playlistShareButton} onPress={() => void openPlaylistSwipe(playlist)}><Text style={s.playlistShareText}>▶ SWIPE</Text></TouchableOpacity>
            {isPublic ? <TouchableOpacity style={s.playlistShareButton} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareText}>↗ Partager</Text></TouchableOpacity> : null}
          </View>
          {expanded ? <View style={s.playlistTracks}>{loadingPlaylistId === playlist.id ? <Text style={s.muted}>Chargement…</Text> : tracks.length ? tracks.map((track) => renderCompactTrack(track, `${playlist.id}-${track.id}`)) : <Text style={s.muted}>Aucun morceau dans cette Vibe.</Text>}</View> : null}
        </View>;
      })}</View>;
    }

    if (activeTab === 'ARTISTS') {
      const artistExplainer = <View style={s.collectionExplainer}>
        <Text style={s.collectionExplainerTitle}>Artistes (interprètes)</Text>
        <Text style={s.collectionExplainerText}>Tous tes KEEP sont regroupés par chanteur, groupe ou interprète. Ouvre un artiste pour retrouver uniquement ses morceaux présents dans ton KEEP.</Text>
      </View>;
      if (!artistGroups.length) return <View style={s.list}>{artistExplainer}<Empty text="Tes artistes apparaîtront ici dès que tes KEEP contiendront des interprètes identifiés." /></View>;
      return <View style={s.list}>{artistExplainer}{artistGroups.map((group) => (
        <TouchableOpacity key={group.name} style={s.listRow} onPress={() => setSelectionSwipe({ title: group.name, subtitle: 'Tous les morceaux de cet artiste présents dans ton KEEP.', tracks: group.tracks })}>
          <View style={s.note}><Text style={s.noteText}>♪</Text></View>
          <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{group.name}</Text><Text style={s.playlistCount}>{group.tracks.length} {group.tracks.length > 1 ? 'morceaux' : 'morceau'} de cet artiste · ▶ SWIPE</Text></View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
      ))}</View>;
    }

    const albumExplainer = <View style={s.collectionExplainer}>
      <Text style={s.collectionExplainerTitle}>Albums (un artiste + un album)</Text>
      <Text style={s.collectionExplainerText}>Un album contient uniquement les morceaux de ce même album et de ce même artiste présents dans ton KEEP. Les artistes différents ne sont jamais mélangés.</Text>
    </View>;
    if (!albumGroups.length) return <View style={s.list}>{albumExplainer}<Empty text="Tes albums apparaîtront ici lorsque KEEP connaîtra le nom d’album de tes morceaux." /></View>;
    return <View style={s.list}>{albumExplainer}{albumGroups.map((group) => (
      <TouchableOpacity key={group.key} style={s.listRow} onPress={() => setSelectionSwipe({ title: group.album, subtitle: `Album de ${group.artist} · uniquement les morceaux présents dans ton KEEP.`, tracks: group.tracks })}>
        <View style={s.note}><Text style={s.noteText}>♪</Text></View>
        <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{group.album}</Text><Text style={s.playlistCount}>{group.artist} · {group.tracks.length} {group.tracks.length > 1 ? 'morceaux' : 'morceau'} · ▶ SWIPE</Text></View>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>
    ))}</View>;
  };"""
text = text[:start] + new_tabs + text[end:]

style_anchor = "  otherRewardsLine: { color: '#F8F6FC', fontSize: 10, lineHeight: 16, marginTop: 2, fontWeight: '700' },"
# The Offers styles are unrelated; ProfilePublicScreen has different styles. Insert near playlist styles instead.
playlist_style_match = re.search(r"(  playlistCount: \{[^\n]+\},)", text)
if not playlist_style_match:
    raise SystemExit('playlistCount style not found')
insert = """\n  playlistDescription: { color: '#FFFFFF', fontSize: 9, lineHeight: 13, marginTop: 2, fontWeight: '700' },\n  collectionExplainer: { marginBottom: 8, padding: 11, borderRadius: 13, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369' },\n  collectionExplainerTitle: { color: colors.primaryLight, fontSize: 11, lineHeight: 15, fontWeight: '900' },\n  collectionExplainerText: { color: '#FFFFFF', fontSize: 9, lineHeight: 14, marginTop: 4, fontWeight: '700' },"""
pos = playlist_style_match.end()
text = text[:pos] + insert + text[pos:]

if text == original:
    raise SystemExit('No changes applied')

path.write_text(text)
