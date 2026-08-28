from pathlib import Path

OWN = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
VISITOR = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


own = OWN.read_text(encoding='utf-8')
own = replace_once(
    own,
    "import { CanonicalTrack, computeMusicDNA, DnaSourceDecision, ProviderPlaylist } from '@keep/music';",
    "import { CanonicalTrack, computeMusicDNA, DnaSourceDecision, groupTracksByAlbum, groupTracksByArtist, ProviderPlaylist } from '@keep/music';",
    'own import',
)
own = replace_once(
    own,
    "  const artists = useMemo(() => Array.from(new Set(publicKeptTracks.map((entry) => entry.track.artist))), [publicKeptTracks]);\n  const albums = useMemo(() => Array.from(new Set(publicKeptTracks.map((entry) => entry.track.album).filter(Boolean) as string[])), [publicKeptTracks]);",
    "  const artistGroups = useMemo(() => groupTracksByArtist(publicSwipeTracks), [publicSwipeTracks]);\n  const albumGroups = useMemo(() => groupTracksByAlbum(publicSwipeTracks), [publicSwipeTracks]);",
    'own groups',
)
own = replace_once(
    own,
    "    const items = activeTab === 'ARTISTS' ? artists : albums;\n    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;\n    return <View style={s.list}>{items.map((item) => {\n      const selected = publicSwipeTracks.filter((track) => activeTab === 'ARTISTS' ? track.artist === item : track.album === item);\n      return <TouchableOpacity key={item} style={s.listRow} onPress={() => setSelectionSwipe({ title: item, subtitle: activeTab === 'ARTISTS' ? 'Tous les morceaux de cet artiste dans ton KEEP.' : 'Cet album dans ton KEEP, prêt à swiper.', tracks: selected })}>\n        <View style={s.note}><Text style={s.noteText}>♪</Text></View>\n        <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{item}</Text><Text style={s.playlistCount}>{selected.length} {selected.length > 1 ? 'morceaux' : 'morceau'} · ▶ SWIPE</Text></View>\n        <Text style={s.chevron}>›</Text>\n      </TouchableOpacity>;\n    })}</View>;",
    "    const items = activeTab === 'ARTISTS' ? artistGroups : albumGroups;\n    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;\n    return <View style={s.list}>{items.map((item) => {\n      const selected = item.tracks;\n      const albumArtist = 'artist' in item ? item.artist : '';\n      const subtitle = activeTab === 'ARTISTS'\n        ? 'Tous les morceaux de cet artiste dans ton KEEP.'\n        : `${albumArtist ? `${albumArtist} · ` : ''}album complet dans ton KEEP, prêt à swiper.`;\n      return <TouchableOpacity key={item.key} style={s.listRow} onPress={() => setSelectionSwipe({ title: item.name, subtitle, tracks: selected })}>\n        <View style={s.note}><Text style={s.noteText}>♪</Text></View>\n        <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{item.name}</Text><Text style={s.playlistCount}>{albumArtist ? `${albumArtist} · ` : ''}{item.trackCount} {item.trackCount > 1 ? 'morceaux' : 'morceau'} · ▶ SWIPE</Text></View>\n        <Text style={s.chevron}>›</Text>\n      </TouchableOpacity>;\n    })}</View>;",
    'own rendering',
)
OWN.write_text(own, encoding='utf-8')

visitor = VISITOR.read_text(encoding='utf-8')
visitor = replace_once(
    visitor,
    "import { CanonicalTrack } from '@keep/music';",
    "import { CanonicalTrack, groupTracksByAlbum } from '@keep/music';",
    'visitor import',
)
visitor = replace_once(
    visitor,
    "  const albums = useMemo(() => Array.from(new Set(tracks.map((track) => track.album).filter(Boolean) as string[])), [tracks]);\n",
    "",
    'visitor old albums',
)
needle = "  const swipeTracks = useMemo<CanonicalTrack[]>(() => tracks.map((track) => ({"
start = visitor.find(needle)
if start < 0:
    raise SystemExit('visitor swipeTracks start not found')
end_marker = "  })), [tracks]);"
end = visitor.find(end_marker, start)
if end < 0:
    raise SystemExit('visitor swipeTracks end not found')
end += len(end_marker)
visitor = visitor[:end] + "\n  const albumGroups = useMemo(() => groupTracksByAlbum(swipeTracks), [swipeTracks]);" + visitor[end:]
visitor = replace_once(
    visitor,
    "          {albums.length > 0 ? <Text style={styles.albumSummaryText} numberOfLines={2}>Albums : {albums.slice(0,5).join(' · ')}</Text> : null}",
    "          {albumGroups.length > 0 ? <Text style={styles.albumSummaryText} numberOfLines={2}>Albums : {albumGroups.slice(0,5).map((album) => `${album.name} — ${album.artist}`).join(' · ')}</Text> : null}",
    'visitor album summary',
)
VISITOR.write_text(visitor, encoding='utf-8')

print('Canonical artist/album profile patch applied.')
