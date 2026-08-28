from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'PATCH FAILED: {label}')
    return text.replace(old, new, 1)


# Règle commune profil :
# - abonnés / abonnements restent immédiatement sous les actions profil
# - KEEP / KEEP utilisateurs sont séparés et descendus sous KEEP DNA + réseaux
# - mêmes composants et même ordre sur profil propriétaire et profil visiteur

# 1) Profil propriétaire.
p = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
s = p.read_text(encoding='utf-8')
owner_keep_block = """        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}
        <ProfileCounterRow kind=\"keeps\" items={[
          { value: profileTotalKeepCount, label: 'KEEP total' },
          { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
        ]} />
      </View>"""
owner_keep_removed = """        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}
      </View>"""
s = replace_once(s, owner_keep_block, owner_keep_removed, 'owner remove upper KEEP counters')

owner_social_end = """      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>

      <View style={s.tabs}>"""
owner_social_with_keeps = """      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>

      <View style={{ marginHorizontal: 18 }}>
        <ProfileCounterRow kind=\"keeps\" items={[
          { value: profileOwnKeepCount, label: 'KEEP' },
          { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
        ]} />
      </View>

      <View style={s.tabs}>"""
s = replace_once(s, owner_social_end, owner_social_with_keeps, 'owner lower KEEP counters')
p.write_text(s, encoding='utf-8')


# 2) Profil visité : même contrat visuel.
p = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')
s = p.read_text(encoding='utf-8')
visitor_keep_block = """          <ProfileCounterRow kind=\"connections\" items={[
            { value: followerCount, label: 'Abonnés' },
            { value: followingCount, label: 'Abonnements' },
          ]} />
          <ProfileCounterRow kind=\"keeps\" items={[
            { value: directKeepCount, label: 'KEEP' },
            { value: socialKeepCount, label: 'KEEP utilisateurs' },
          ]} />
        </View>"""
visitor_keep_removed = """          <ProfileCounterRow kind=\"connections\" items={[
            { value: followerCount, label: 'Abonnés' },
            { value: followingCount, label: 'Abonnements' },
          ]} />
        </View>"""
s = replace_once(s, visitor_keep_block, visitor_keep_removed, 'visitor remove upper KEEP counters')

visitor_social_end = """        <View style={styles.socialHub}>
          <Text style={styles.socialTitle}>Ses réseaux</Text>
          <View style={styles.socialRow}>
            {SOCIALS.map((item) => {
              const configured = Boolean(profile.socialLinks.find((link) => link.platform === item.platform && link.url.trim()));
              return <TouchableOpacity key={item.platform} style={[styles.socialButton, configured && styles.socialButtonConfigured]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#5C5468'} /></TouchableOpacity>;
            })}
          </View>
        </View>

        {tracks.length > 0 && viewer?.id !== profile.id ?"""
visitor_social_with_keeps = """        <View style={styles.socialHub}>
          <Text style={styles.socialTitle}>Ses réseaux</Text>
          <View style={styles.socialRow}>
            {SOCIALS.map((item) => {
              const configured = Boolean(profile.socialLinks.find((link) => link.platform === item.platform && link.url.trim()));
              return <TouchableOpacity key={item.platform} style={[styles.socialButton, configured && styles.socialButtonConfigured]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#5C5468'} /></TouchableOpacity>;
            })}
          </View>
        </View>

        <View style={{ marginHorizontal: 18 }}>
          <ProfileCounterRow kind=\"keeps\" items={[
            { value: directKeepCount, label: 'KEEP' },
            { value: socialKeepCount, label: 'KEEP utilisateurs' },
          ]} />
        </View>

        {tracks.length > 0 && viewer?.id !== profile.id ?"""
s = replace_once(s, visitor_social_end, visitor_social_with_keeps, 'visitor lower KEEP counters')
p.write_text(s, encoding='utf-8')


# 3) Contrat global de lisibilité : les tokens de texte secondaire restent blancs.
p = Path('packages/mobile/src/theme/colors.ts')
s = p.read_text(encoding='utf-8')
required = [
    "textPrimary: '#FFFFFF'",
    "textSecondary: '#FFFFFF'",
    "textMuted: '#FFFFFF'",
]
for marker in required:
    if marker not in s:
        raise SystemExit(f'PATCH FAILED: global white text token missing: {marker}')

# 4) Le composant partagé doit rester blanc et identique sur toutes les surfaces profil.
p = Path('packages/mobile/src/components/ProfileCounterRow.tsx')
s = p.read_text(encoding='utf-8')
for marker in ["value: { color: '#FFFFFF'", "label: { color: '#FFFFFF'"]:
    if marker not in s:
        raise SystemExit(f'PATCH FAILED: shared profile counter color: {marker}')

print('PATCH_OK_PROFILE_LAYOUT_GLOBAL')
