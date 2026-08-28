from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'PATCH FAILED: {label}')
    return text.replace(old, new, 1)


# Ajustement demandé uniquement sur le profil visité.
# Le profil propriétaire et le reste du design ne bougent pas.
p = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')
s = p.read_text(encoding='utf-8')

upper = """          <ProfileCounterRow kind=\"connections\" items={[
            { value: followerCount, label: 'Abonnés' },
            { value: followingCount, label: 'Abonnements' },
          ]} />
          <ProfileCounterRow kind=\"keeps\" items={[
            { value: directKeepCount, label: 'KEEP' },
            { value: socialKeepCount, label: 'KEEP utilisateurs' },
          ]} />
        </View>"""
upper_fixed = """          <ProfileCounterRow kind=\"connections\" items={[
            { value: followerCount, label: 'Abonnés' },
            { value: followingCount, label: 'Abonnements' },
          ]} />
        </View>"""
s = replace_once(s, upper, upper_fixed, 'visitor remove upper KEEP counters')

anchor = """        {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipeLaunch} onPress={() => setSwipeOpen(true)}><Text style={styles.swipeLaunchTitle}>▶ DÉCOUVRIR SON KEEP EN SWIPE</Text><Text style={styles.swipeLaunchText}>Lecture automatique des extraits · KEEP te signale les morceaux déjà présents dans tes musiques.</Text></TouchableOpacity> : null}

        <View style={styles.publicMusicSection}>"""
replacement = """        {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipeLaunch} onPress={() => setSwipeOpen(true)}><Text style={styles.swipeLaunchTitle}>▶ DÉCOUVRIR SON KEEP EN SWIPE</Text><Text style={styles.swipeLaunchText}>Lecture automatique des extraits · KEEP te signale les morceaux déjà présents dans tes musiques.</Text></TouchableOpacity> : null}

        <View style={{ marginHorizontal: 18 }}>
          <ProfileCounterRow kind=\"keeps\" items={[
            { value: directKeepCount, label: 'KEEP' },
            { value: socialKeepCount, label: 'KEEP utilisateurs' },
          ]} />
        </View>

        <View style={styles.publicMusicSection}>"""
s = replace_once(s, anchor, replacement, 'visitor add KEEP counters below swipe launch')
p.write_text(s, encoding='utf-8')

# Garde-fous : le texte secondaire global et les compteurs partagés restent blancs.
p = Path('packages/mobile/src/theme/colors.ts')
s = p.read_text(encoding='utf-8')
for marker in ["textPrimary: '#FFFFFF'", "textSecondary: '#FFFFFF'", "textMuted: '#FFFFFF'"]:
    if marker not in s:
        raise SystemExit(f'PATCH FAILED: global white text token missing: {marker}')

p = Path('packages/mobile/src/components/ProfileCounterRow.tsx')
s = p.read_text(encoding='utf-8')
for marker in ["value: { color: '#FFFFFF'", "label: { color: '#FFFFFF'"]:
    if marker not in s:
        raise SystemExit(f'PATCH FAILED: shared profile counter color: {marker}')

print('PATCH_OK_VISITOR_KEEP_BELOW_SWIPE')
