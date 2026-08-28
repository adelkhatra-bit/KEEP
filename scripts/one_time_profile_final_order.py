from pathlib import Path

path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
source = path.read_text(encoding='utf-8')

old = '''      <ProfileCounterRow kind="keeps" items={[
        { value: profileTotalKeepCount, label: 'KEEP total' },
        { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
      ]} />

      <View style={s.dna}>
        <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>KEEP DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
        {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=><View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>)}</View> : <Text style={s.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>}
      </View>

      <View style={[s.ownerActions, { marginHorizontal: 18 }]}>
        <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel="Partager mon profil"><Text style={s.ownerActionText}>PARTAGER</Text></TouchableOpacity>
        <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>
      </View>
'''

new = '''      <View style={[s.ownerActions, { marginHorizontal: 18 }]}>
        <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel="Partager mon profil"><Text style={s.ownerActionText}>PARTAGER</Text></TouchableOpacity>
        <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>
      </View>

      <View style={s.dna}>
        <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>KEEP DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
        {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=><View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>)}</View> : <Text style={s.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>}
      </View>

      <ProfileCounterRow kind="keeps" items={[
        { value: profileTotalKeepCount, label: 'KEEP total' },
        { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
      ]} />
'''

if source.count(old) != 1:
    raise SystemExit(f'Expected one final-order anchor, got {source.count(old)}')

source = source.replace(old, new, 1)
path.write_text(source, encoding='utf-8')
