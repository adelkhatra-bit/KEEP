from pathlib import Path

profile_path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
source = profile_path.read_text(encoding='utf-8')

old_owner = '''        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        <View style={s.ownerActions}>
          <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel="Partager mon profil"><Text style={s.ownerActionText}>PARTAGER</Text></TouchableOpacity>
          <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>
        </View>
        <ProfileCounterRow kind="connections" items={[
          { value: profileFollowerCount, label: 'Abonnés' },
          { value: profileFollowingCount, label: 'Abonnements' },
        ]} />
        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}
      </View>'''

new_owner = '''        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        <ProfileCounterRow kind="connections" items={[
          { value: profileFollowerCount, label: 'Abonnés' },
          { value: profileFollowingCount, label: 'Abonnements' },
        ]} />
        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}
      </View>'''

if source.count(old_owner) != 1:
    raise SystemExit(f'Owner top hierarchy anchor mismatch: {source.count(old_owner)}')
source = source.replace(old_owner, new_owner, 1)

dna_anchor = '''      <View style={s.dna}>
        <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>KEEP DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
        {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=><View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>)}</View> : <Text style={s.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>}
      </View>
'''

actions = '''
      <View style={[s.ownerActions, { marginHorizontal: 18 }]}>
        <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel="Partager mon profil"><Text style={s.ownerActionText}>PARTAGER</Text></TouchableOpacity>
        <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>
      </View>
'''

if source.count(dna_anchor) != 1:
    raise SystemExit(f'Own KEEP DNA anchor mismatch: {source.count(dna_anchor)}')
source = source.replace(dna_anchor, dna_anchor + actions, 1)

markers = [
    '<Text style={s.bio}>',
    "{ value: profileFollowerCount, label: 'Abonnés' }",
    '<Text style={s.socialTitle}>Mes réseaux</Text>',
    "{ value: profileTotalKeepCount, label: 'KEEP total' }",
    '<Text style={s.dnaTitle}>Ton empreinte musicale</Text>',
    'accessibilityLabel="Partager mon profil"',
    '<View style={s.tabs}>',
]
positions = [source.find(marker) for marker in markers]
if any(pos < 0 for pos in positions) or positions != sorted(positions):
    raise SystemExit(f'Collective owner hierarchy invalid: {positions}')

if source.count('accessibilityLabel="Partager mon profil"') != 1:
    raise SystemExit('Owner share button must exist exactly once')
if source.count('accessibilityLabel="Prévisualiser mon KEEP en Swipe"') != 1:
    raise SystemExit('Owner swipe button must exist exactly once')

profile_path.write_text(source, encoding='utf-8')
