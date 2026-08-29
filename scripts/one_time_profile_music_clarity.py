from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly once, got {count}')
    return text.replace(old, new, 1)

# 1) Preserve both the original Écouter discoverer and the immediate relay profile.
state_path = Path('packages/mobile/src/services/publicProfileStateService.ts')
state = state_path.read_text()
state = replace_once(state, """export type PublicProfileKeep = {
  decisionId: string;
  keptAt: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  track: CanonicalTrack;
  sourceUserId?: string;
  sourceProfileId?: string;
  sourceUsername?: string;
  sourceType?: string;
  creditSource: 'LISTEN' | 'SOCIAL';
};""", """export type PublicProfileKeep = {
  decisionId: string;
  keptAt: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  track: CanonicalTrack;
  /** Historical alias for the original discoverer id. */
  sourceUserId?: string;
  /** First user in the social chain who originally discovered the track with Écouter. */
  originUserId?: string;
  originUsername?: string;
  /** Immediate profile from which this user copied the track. */
  sourceProfileId?: string;
  sourceUsername?: string;
  sourceType?: string;
  creditSource: 'LISTEN' | 'SOCIAL';
};""", 'PublicProfileKeep type')
state = replace_once(state, """function normalizeKeepRow(row: any, fallbackVisibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC'): PublicProfileKeep {
  const context = row?.context && typeof row.context === 'object' ? row.context : {};
  const sourceProfileId = row?.source_user_id || context.sourceProfileId
    ? String(row?.source_user_id || context.sourceProfileId)
    : undefined;
  const social = Boolean(
    sourceProfileId
    || row?.source_type === 'profile'
    || context.creditPolicy === 'SOCIAL_ZERO_CREDIT',
  );""", """function normalizeKeepRow(row: any, fallbackVisibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC'): PublicProfileKeep {
  const context = row?.context && typeof row.context === 'object' ? row.context : {};
  const originUserId = row?.source_user_id ? String(row.source_user_id) : undefined;
  const contextSourceProfileId = typeof context.sourceProfileId === 'string' && context.sourceProfileId.trim()
    ? context.sourceProfileId.trim()
    : undefined;
  const sourceProfileId = contextSourceProfileId || originUserId;
  const social = Boolean(
    originUserId
    || sourceProfileId
    || row?.source_type === 'profile'
    || context.creditPolicy === 'SOCIAL_ZERO_CREDIT',
  );""", 'normalizeKeepRow header')
state = replace_once(state, """    sourceUserId: row?.source_user_id ? String(row.source_user_id) : undefined,
    sourceProfileId,
    sourceUsername: context.sourceUsername ? String(context.sourceUsername) : undefined,
    sourceType: row?.source_type ? String(row.source_type) : undefined,""", """    sourceUserId: originUserId,
    originUserId,
    originUsername: context.originUsername ? String(context.originUsername) : undefined,
    sourceProfileId,
    sourceUsername: context.sourceUsername ? String(context.sourceUsername) : undefined,
    sourceType: row?.source_type ? String(row.source_type) : undefined,""", 'normalizeKeepRow provenance')
old_hydrate = """async function hydrateSourceUsernames(rows: PublicProfileKeep[]): Promise<PublicProfileKeep[]> {
  if (!supabase || !rows.length) return rows;
  const ids = Array.from(new Set(rows
    .filter((row) => !row.sourceUsername)
    .map((row) => row.sourceProfileId || row.sourceUserId)
    .filter(Boolean) as string[]));
  if (!ids.length) return rows;

  const usernames = new Map<string, string>();
  const chunkSize = 100;
  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username')
      .in('id', chunk)
      .eq('is_public', true);
    if (error) continue;
    for (const profile of data ?? []) {
      if (profile?.id && profile?.username) usernames.set(String(profile.id), String(profile.username));
    }
  }

  if (!usernames.size) return rows;
  return rows.map((row) => {
    if (row.sourceUsername) return row;
    const sourceId = row.sourceProfileId || row.sourceUserId;
    const sourceUsername = sourceId ? usernames.get(sourceId) : undefined;
    return sourceUsername ? { ...row, sourceUsername } : row;
  });
}"""
new_hydrate = """async function hydrateSourceUsernames(rows: PublicProfileKeep[]): Promise<PublicProfileKeep[]> {
  if (!supabase || !rows.length) return rows;
  const ids = Array.from(new Set(rows.flatMap((row) => [
    !row.originUsername ? row.originUserId || row.sourceUserId : undefined,
    !row.sourceUsername ? row.sourceProfileId : undefined,
  ]).filter(Boolean) as string[]));
  if (!ids.length) return rows;

  const usernames = new Map<string, string>();
  const chunkSize = 100;
  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username')
      .in('id', chunk)
      .eq('is_public', true);
    if (error) continue;
    for (const profile of data ?? []) {
      if (profile?.id && profile?.username) usernames.set(String(profile.id), String(profile.username));
    }
  }

  if (!usernames.size) return rows;
  return rows.map((row) => {
    const originId = row.originUserId || row.sourceUserId;
    const sourceId = row.sourceProfileId;
    return {
      ...row,
      originUsername: row.originUsername || (originId ? usernames.get(originId) : undefined),
      sourceUsername: row.sourceUsername || (sourceId ? usernames.get(sourceId) : undefined),
    };
  });
}"""
state = replace_once(state, old_hydrate, new_hydrate, 'hydrateSourceUsernames')
state_path.write_text(state)

# 2) Own profile: strict Vibes / Artists / Albums separation + visible discovery credit.
own_path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
own = own_path.read_text()
own = replace_once(own, """    sourceProfileId: entry.sourceProfileId,
    sourceUsername: entry.sourceUsername,
  })), [serverOwnKeeps]);""", """    sourceProfileId: entry.sourceProfileId,
    sourceUsername: entry.sourceUsername,
    originUserId: entry.originUserId,
    originUsername: entry.originUsername,
  })), [serverOwnKeeps]);""", 'own canonical provenance')
own = replace_once(own, """  const artists = useMemo(() => Array.from(new Set(publicKeptTracks.map((entry) => entry.track.artist))), [publicKeptTracks]);
  const albums = useMemo(() => Array.from(new Set(publicKeptTracks.map((entry) => entry.track.album).filter(Boolean) as string[])), [publicKeptTracks]);
  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {
    const result: ProviderPlaylist[] = smartAlbums.map(smartAlbumAsProviderPlaylist);
    if (providerPlaylists.length) result.push(...providerPlaylists);
    if (!result.length && publicKeptTracks.length) {
      const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);
      result.push({ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference?.name || 'Mes KEEP', description: localPreference?.description || 'Morceaux publics gardés avec KEEP', trackCount: publicKeptTracks.length, isKeepManaged: true });
    }
    return result;
  }, [playlistPreferences, providerId, providerPlaylists, publicKeptTracks.length, smartAlbums]);""", """  const artistGroups = useMemo(() => {
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
  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => smartAlbums.map(smartAlbumAsProviderPlaylist), [smartAlbums]);""", 'own groups')
own = replace_once(own, """  const renderCompactTrack = (track: CanonicalTrack, key: string, sourceUsername?: string | null) => (
    <View key={key} style={s.keepRow}>""", """  const renderCompactTrack = (track: CanonicalTrack, key: string, originUsername?: string | null, sourceUsername?: string | null) => {
    const discoveryUsername = (originUsername || sourceUsername || user.username).replace(/^@+/, '');
    const relayUsername = sourceUsername?.replace(/^@+/, '') || '';
    const showRelay = Boolean(relayUsername && relayUsername.toLowerCase() !== discoveryUsername.toLowerCase());
    return (
    <View key={key} style={s.keepRow}>""", 'own render header')
own = replace_once(own, """          {sourceUsername ? (
            <View style={s.originInline}>
              <Text style={s.originLabel}>Utilisateur</Text>
              <TouchableOpacity style={s.originUserLink} onPress={() => openSourceProfile(sourceUsername)} accessibilityLabel={`Ouvrir rapidement le profil de ${sourceUsername}`}>
                <Text style={s.originUserText}>@{sourceUsername.slice(0, 4)}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );""", """          <View style={s.originInline}>
            <Text style={s.originLabel}>Découvert en Écoute par</Text>
            <TouchableOpacity style={s.originUserLink} onPress={() => discoveryUsername.toLowerCase() === user.username.toLowerCase() ? null : openSourceProfile(discoveryUsername)} accessibilityLabel={`Ouvrir le profil de ${discoveryUsername}`}>
              <Text style={s.originUserText}>@{discoveryUsername}</Text>
            </TouchableOpacity>
            {showRelay ? <Text style={s.originRelay}>via @{relayUsername}</Text> : null}
          </View>
        </View>
      </View>
    </View>
    );
  };""", 'own provenance render')
own = replace_once(own, """      return <View style={s.keepList}>
        <Text style={s.ownerKeepHint}>KEEP construit ton univers : Vibes, artistes et albums. Tu gardes le contrôle du Public/Privé et des noms.</Text>
        {profileKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null))}
      </View>;""", """      return <View style={s.keepList}>
        <View style={s.discoveryExplainer}>
          <Text style={s.discoveryExplainerTitle}>TES DÉCOUVERTES AVEC ÉCOUTER</Text>
          <Text style={s.discoveryExplainerText}>Tes morceaux ajoutés avec Écouter sont tes découvertes. S’ils circulent ensuite de profil en profil, ton @ reste attaché comme découvreur d’origine. Une musique prise chez un autre membre garde, elle, le premier utilisateur qui l’a découverte avec Écouter.</Text>
        </View>
        <Text style={s.ownerKeepHint}>KEEP organise ensuite ton univers : Vibes (styles/ambiances), Artistes (interprètes) et Albums (albums d’origine).</Text>
        {profileKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, (entry as any).originUsername ?? entry.sourceUsername ?? null, entry.sourceUsername ?? null))}
      </View>;""", 'own KEEP explainer')
old_tabs = """    if (activeTab === 'PLAYLISTS') {
      if (!displayPlaylists.length) return <Empty text="Tes Vibes KEEP apparaîtront ici automatiquement." />;
      return <View style={s.list}>{displayPlaylists.map((playlist) => {
        const expanded = expandedPlaylistId === playlist.id;
        const tracks = playlistTracks[playlist.id] ?? [];
        const preference = preferenceFor(playlistPreferences, providerId, playlist.id);
        const smart = smartAlbums.find((album) => `keep-smart:${album.id}` === playlist.id);
        const isPublic = preference?.isPublic ?? smart?.isPublic ?? false;
        return <View key={playlist.id} style={s.playlistBlock}>
          <TouchableOpacity style={s.listRow} onPress={() => void togglePlaylist(playlist)} accessibilityLabel={`Ouvrir ${playlist.name}`}>
            {playlist.coverUrl ? <Image source={{ uri: playlist.coverUrl }} style={s.note} /> : <View style={s.note}><Text style={s.noteText}>♪</Text></View>}
            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'} · {isPublic ? 'Public' : 'Privé'}</Text></View>
            <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          <View style={s.playlistButtons}>
            <TouchableOpacity style={s.playlistShareButton} onPress={() => void openPlaylistSwipe(playlist)}><Text style={s.playlistShareText}>▶ SWIPE</Text></TouchableOpacity>
            {isPublic ? <TouchableOpacity style={s.playlistShareButton} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareText}>↗ Partager</Text></TouchableOpacity> : null}
          </View>
          {expanded ? <View style={s.playlistTracks}>{loadingPlaylistId === playlist.id ? <Text style={s.muted}>Chargement…</Text> : tracks.length ? tracks.map((track) => renderCompactTrack(track, `${playlist.id}-${track.id}`)) : <Text style={s.muted}>Aucun morceau dans cette playlist.</Text>}</View> : null}
        </View>;
      })}</View>;
    }

    const items = activeTab === 'ARTISTS' ? artists : albums;
    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;
    return <View style={s.list}>{items.map((item) => {
      const selected = publicSwipeTracks.filter((track) => activeTab === 'ARTISTS' ? track.artist === item : track.album === item);
      return <TouchableOpacity key={item} style={s.listRow} onPress={() => setSelectionSwipe({ title: item, subtitle: activeTab === 'ARTISTS' ? 'Tous les morceaux de cet artiste dans ton KEEP.' : 'Cet album dans ton KEEP, prêt à swiper.', tracks: selected })}>
        <View style={s.note}><Text style={s.noteText}>♪</Text></View>
        <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{item}</Text><Text style={s.playlistCount}>{selected.length} {selected.length > 1 ? 'morceaux' : 'morceau'} · ▶ SWIPE</Text></View>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>;
    })}</View>;
  };"""
new_tabs = """    if (activeTab === 'PLAYLISTS') {
      const explainer = <View style={s.collectionExplainer}><Text style={s.collectionExplainerTitle}>Vibes (ambiances & styles)</Text><Text style={s.collectionExplainerText}>KEEP regroupe automatiquement plusieurs morceaux compatibles par style ou ambiance. Ce ne sont ni des albums ni des événements.</Text></View>;
      if (!displayPlaylists.length) return <View style={s.list}>{explainer}<Empty text="Aucune Vibe pour le moment. KEEP en créera automatiquement quand plusieurs morceaux compatibles seront présents dans ton KEEP." /></View>;
      return <View style={s.list}>{explainer}{displayPlaylists.map((playlist) => {
        const expanded = expandedPlaylistId === playlist.id;
        const tracks = playlistTracks[playlist.id] ?? [];
        const preference = preferenceFor(playlistPreferences, providerId, playlist.id);
        const smart = smartAlbums.find((album) => `keep-smart:${album.id}` === playlist.id);
        const isPublic = preference?.isPublic ?? smart?.isPublic ?? false;
        return <View key={playlist.id} style={s.playlistBlock}>
          <TouchableOpacity style={s.listRow} onPress={() => void togglePlaylist(playlist)} accessibilityLabel={`Ouvrir ${playlist.name}`}>
            {playlist.coverUrl ? <Image source={{ uri: playlist.coverUrl }} style={s.note} /> : <View style={s.note}><Text style={s.noteText}>♪</Text></View>}
            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'} · {isPublic ? 'Public' : 'Privé'}</Text></View>
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
      const explainer = <View style={s.collectionExplainer}><Text style={s.collectionExplainerTitle}>Artistes (interprètes)</Text><Text style={s.collectionExplainerText}>Tes KEEP sont regroupés par chanteur, groupe ou interprète. Ouvre un artiste pour voir uniquement ses morceaux présents dans ton KEEP.</Text></View>;
      if (!artistGroups.length) return <View style={s.list}>{explainer}<Empty text="Tes artistes apparaîtront ici dès que KEEP identifiera les interprètes de tes morceaux." /></View>;
      return <View style={s.list}>{explainer}{artistGroups.map((group) => <TouchableOpacity key={group.name} style={s.listRow} onPress={() => setSelectionSwipe({ title: group.name, subtitle: 'Tous les morceaux de cet artiste présents dans ton KEEP.', tracks: group.tracks })}><View style={s.note}><Text style={s.noteText}>♪</Text></View><View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{group.name}</Text><Text style={s.playlistCount}>{group.tracks.length} {group.tracks.length > 1 ? 'morceaux' : 'morceau'} de cet artiste · ▶ SWIPE</Text></View><Text style={s.chevron}>›</Text></TouchableOpacity>)}</View>;
    }

    const explainer = <View style={s.collectionExplainer}><Text style={s.collectionExplainerTitle}>Albums (un artiste + un album)</Text><Text style={s.collectionExplainerText}>Un album regroupe uniquement les morceaux du même album et du même artiste présents dans ton KEEP. Deux artistes différents ne sont jamais mélangés.</Text></View>;
    if (!albumGroups.length) return <View style={s.list}>{explainer}<Empty text="Tes albums apparaîtront ici quand KEEP connaîtra le nom d’album de tes morceaux." /></View>;
    return <View style={s.list}>{explainer}{albumGroups.map((group) => <TouchableOpacity key={group.key} style={s.listRow} onPress={() => setSelectionSwipe({ title: group.album, subtitle: `Album de ${group.artist} · uniquement les morceaux présents dans ton KEEP.`, tracks: group.tracks })}><View style={s.note}><Text style={s.noteText}>♪</Text></View><View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{group.album}</Text><Text style={s.playlistCount}>{group.artist} · {group.tracks.length} {group.tracks.length > 1 ? 'morceaux' : 'morceau'} · ▶ SWIPE</Text></View><Text style={s.chevron}>›</Text></TouchableOpacity>)}</View>;
  };"""
own = replace_once(own, old_tabs, new_tabs, 'own tabs')
own = replace_once(own, """originUserText:{color:'#7CF2B9',fontSize:9,fontWeight:'900'},
  list:{marginHorizontal:18,marginTop:10},""", """originUserText:{color:'#7CF2B9',fontSize:9,fontWeight:'900'},originRelay:{color:'#FFFFFF',fontSize:8,fontWeight:'800'},discoveryExplainer:{padding:10,borderRadius:12,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',marginBottom:7},discoveryExplainerTitle:{color:'#7CF2B9',fontSize:9,fontWeight:'900',letterSpacing:.7},discoveryExplainerText:{color:'#FFFFFF',fontSize:9,lineHeight:14,fontWeight:'700',marginTop:4},
  list:{marginHorizontal:18,marginTop:10},collectionExplainer:{marginBottom:8,padding:11,borderRadius:13,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},collectionExplainerTitle:{color:colors.primaryLight,fontSize:11,lineHeight:15,fontWeight:'900'},collectionExplainerText:{color:'#FFFFFF',fontSize:9,lineHeight:14,marginTop:4,fontWeight:'700'},""", 'own styles')
own_path.write_text(own)

# 3) Visited profiles: show the same original Écouter discoverer and relay chain.
public_path = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')
public = public_path.read_text()
public = replace_once(public, """  sourceUserId?: string;
  sourceProfileId?: string;
};""", """  sourceUserId?: string;
  originUserId?: string;
  originUsername?: string;
  sourceProfileId?: string;
  sourceUsername?: string;
};""", 'public keep type')
public = replace_once(public, """          sourceUserId: entry.sourceUserId,
          sourceProfileId: entry.sourceProfileId,
        } as PublicKeepTrack));""", """          sourceUserId: entry.sourceUserId,
          originUserId: entry.originUserId,
          originUsername: entry.originUsername,
          sourceProfileId: entry.sourceProfileId,
          sourceUsername: entry.sourceUsername,
        } as PublicKeepTrack));""", 'public normalized provenance')
public = public.replace("context: { source: 'public_profile_swipe', sourceProfileId: profile?.id }", "context: { source: 'public_profile_swipe', sourceProfileId: profile?.id, sourceUsername: profile?.username }", 1)
public = public.replace("context: { source: 'public_profile', sourceProfileId: profile.id }", "context: { source: 'public_profile', sourceProfileId: profile.id, sourceUsername: profile.username }", 1)
public = replace_once(public, """        <View style={styles.publicMusicSection}>
          <View style={styles.musicSectionHeader}><Text style={styles.sectionTitle}>KEEP publics</Text><Text style={styles.publicCount}>{tracks.length}</Text></View>""", """        <View style={styles.publicMusicSection}>
          <View style={styles.musicSectionHeader}><Text style={styles.sectionTitle}>KEEP publics</Text><Text style={styles.publicCount}>{tracks.length}</Text></View>
          <View style={styles.discoveryRuleCard}>
            <Text style={styles.discoveryRuleTitle}>QUI A DÉCOUVERT CE MORCEAU ?</Text>
            <Text style={styles.discoveryRuleText}>Une musique trouvée directement avec Écouter par cette personne est sa découverte. Si elle vient d’un autre profil, KEEP conserve le premier utilisateur qui l’a découverte avec Écouter, même si le morceau circule ensuite de profil en profil.</Text>
          </View>""", 'public discovery explainer')
public = replace_once(public, """              const alreadyKept = alreadyInMyKeep(track.trackId);
              return <View key={track.id} style={styles.musicRow}>""", """              const alreadyKept = alreadyInMyKeep(track.trackId);
              const discoveryUsername = (track.originUsername || track.sourceUsername || profile.username).replace(/^@+/, '');
              const relayUsername = track.sourceUsername?.replace(/^@+/, '') || '';
              const showRelay = Boolean(relayUsername && relayUsername.toLowerCase() !== discoveryUsername.toLowerCase());
              return <View key={track.id} style={styles.musicRow}>""", 'public provenance vars')
public = replace_once(public, """                  <View style={styles.trackActions}>
                    {viewer?.id !== profile.id ? <TouchableOpacity style={[styles.keepButton, alreadyKept && styles.alreadyKeepButton]}""", """                  <View style={styles.trackOriginRow}>
                    <Text style={styles.trackOriginLabel}>Découvert en Écoute par</Text>
                    <TouchableOpacity onPress={() => discoveryUsername.toLowerCase() === profile.username.toLowerCase() ? null : navigation.navigate('PublicProfile', { username: discoveryUsername.replace(/^@+/, '') })}><Text style={styles.trackOriginUser}>@{discoveryUsername}</Text></TouchableOpacity>
                    {showRelay ? <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { username: relayUsername.replace(/^@+/, '') })}><Text style={styles.trackOriginRelay}>via @{relayUsername}</Text></TouchableOpacity> : null}
                  </View>
                  <View style={styles.trackActions}>
                    {viewer?.id !== profile.id ? <TouchableOpacity style={[styles.keepButton, alreadyKept && styles.alreadyKeepButton]}""", 'public provenance UI')
public = replace_once(public, """trackArtist:{color:colors.textMuted,fontSize:10,marginTop:2},trackActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:5,marginTop:7},""", """trackArtist:{color:colors.textMuted,fontSize:10,marginTop:2},trackOriginRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:4,marginTop:6},trackOriginLabel:{color:'#FFFFFF',fontSize:8,fontWeight:'800'},trackOriginUser:{color:'#7CF2B9',fontSize:9,fontWeight:'900'},trackOriginRelay:{color:'#FFFFFF',fontSize:8,fontWeight:'800'},trackActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:5,marginTop:7},""", 'public provenance styles')
public = replace_once(public, """publicMusicSection:{paddingHorizontal:18,marginTop:16},musicSectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:spacing.md},""", """publicMusicSection:{paddingHorizontal:18,marginTop:16},musicSectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:spacing.md},discoveryRuleCard:{padding:10,borderRadius:12,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',marginBottom:10},discoveryRuleTitle:{color:'#7CF2B9',fontSize:9,fontWeight:'900',letterSpacing:.7},discoveryRuleText:{color:'#FFFFFF',fontSize:9,lineHeight:14,fontWeight:'700',marginTop:4},""", 'public explainer styles')
public_path.write_text(public)

# 4) Offer screen explains why sharing a profile matters to the musical community.
offers_path = Path('packages/mobile/src/screens/OffersScreen.tsx')
offers = offers_path.read_text()
offers = replace_once(offers, """              <Text style={s.communityOpportunityText}>Partage tes KEEP, tes Vibes et ton univers musical. Tu peux construire une vraie communauté et devenir influent sans avoir besoin de montrer ton visage.</Text>
              <Text style={s.communityOpportunityText}>À partir de {f4} abonnés,""", """              <Text style={s.communityOpportunityText}>Partage tes KEEP, tes Vibes et ton univers musical. Tu peux construire une vraie communauté et devenir influent sans avoir besoin de montrer ton visage.</Text>
              <Text style={s.communityOpportunityText}>Chaque morceau que tu ajoutes grâce à Écouter peut porter ton @ comme découvreur d’origine. S’il est ensuite repris depuis un profil puis un autre, KEEP conserve cette attribution au premier utilisateur qui l’a découvert avec Écouter.</Text>
              <Text style={s.communityOpportunityText}>À partir de {f4} abonnés,""", 'offers discovery explanation')
offers_path.write_text(offers)
