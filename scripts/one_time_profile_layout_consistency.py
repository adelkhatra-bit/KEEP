from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly once, got {count}')
    return text.replace(old, new, 1)

# Own profile: social networks -> KEEP counters -> KEEP DNA.
own_path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
own = own_path.read_text(encoding='utf-8')
own_keep = '''        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}
        <ProfileCounterRow kind="keeps" items={[
          { value: profileTotalKeepCount, label: 'KEEP total' },
          { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
        ]} />
      </View>

      <View style={s.dna}>'''
own = replace_once(own, own_keep, '''        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}
      </View>

      <View style={s.dna}>''', 'own remove KEEP counters')

own_dna = '''      <View style={s.dna}>
        <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>KEEP DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
        {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=><View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>)}</View> : <Text style={s.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>}
      </View>

      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>
'''
own_reordered = '''      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>

      <ProfileCounterRow kind="keeps" items={[
        { value: profileTotalKeepCount, label: 'KEEP total' },
        { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
      ]} />

      <View style={s.dna}>
        <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>KEEP DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
        {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=><View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>)}</View> : <Text style={s.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>}
      </View>
'''
own = replace_once(own, own_dna, own_reordered, 'own reorder social/dna')
own_path.write_text(own, encoding='utf-8')

# Visitor profile: move only social networks above KEEP DNA. Keep the validated
# purple Swipe button and KEEP counters order below DNA unchanged.
visitor_path = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')
visitor = visitor_path.read_text(encoding='utf-8')
visitor_dna_social = '''        <View style={styles.dna}>
          <View style={styles.dnaHeader}><View><Text style={styles.dnaEyebrow}>KEEP DNA</Text><Text style={styles.dnaTitle}>Son empreinte musicale</Text></View><Text style={styles.publicCount}>{tracks.length}</Text></View>
          {(profile.favoriteGenres.length > 0 || profile.favoriteArtists.length > 0)
            ? <View style={styles.chips}>{[...profile.favoriteGenres, ...profile.favoriteArtists].slice(0,8).map((item) => <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>)}</View>
            : <Text style={styles.mutedSmall}>Aucune préférence musicale publique renseignée pour le moment.</Text>}
          {albums.length > 0 ? <Text style={styles.albumSummaryText} numberOfLines={2}>Albums : {albums.slice(0,5).join(' · ')}</Text> : null}
        </View>

        <View style={styles.socialHub}>
          <Text style={styles.socialTitle}>Ses réseaux</Text>
          <View style={styles.socialRow}>
            {SOCIALS.map((item) => {
              const configured = Boolean(profile.socialLinks.find((link) => link.platform === item.platform && link.url.trim()));
              return <TouchableOpacity key={item.platform} style={[styles.socialButton, configured && styles.socialButtonConfigured]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#5C5468'} /></TouchableOpacity>;
            })}
          </View>
        </View>
'''
visitor_reordered = '''        <View style={styles.socialHub}>
          <Text style={styles.socialTitle}>Ses réseaux</Text>
          <View style={styles.socialRow}>
            {SOCIALS.map((item) => {
              const configured = Boolean(profile.socialLinks.find((link) => link.platform === item.platform && link.url.trim()));
              return <TouchableOpacity key={item.platform} style={[styles.socialButton, configured && styles.socialButtonConfigured]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#5C5468'} /></TouchableOpacity>;
            })}
          </View>
        </View>

        <View style={styles.dna}>
          <View style={styles.dnaHeader}><View><Text style={styles.dnaEyebrow}>KEEP DNA</Text><Text style={styles.dnaTitle}>Son empreinte musicale</Text></View><Text style={styles.publicCount}>{tracks.length}</Text></View>
          {(profile.favoriteGenres.length > 0 || profile.favoriteArtists.length > 0)
            ? <View style={styles.chips}>{[...profile.favoriteGenres, ...profile.favoriteArtists].slice(0,8).map((item) => <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>)}</View>
            : <Text style={styles.mutedSmall}>Aucune préférence musicale publique renseignée pour le moment.</Text>}
          {albums.length > 0 ? <Text style={styles.albumSummaryText} numberOfLines={2}>Albums : {albums.slice(0,5).join(' · ')}</Text> : null}
        </View>
'''
visitor = replace_once(visitor, visitor_dna_social, visitor_reordered, 'visitor reorder social/dna')
visitor_path.write_text(visitor, encoding='utf-8')

print('Profile layout consistency patch applied.')
