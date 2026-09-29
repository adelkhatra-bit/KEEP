const fs = require('fs');
const path = require('path');

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function assertOrdered(source, markers, label) {
  const positions = markers.map((marker) => source.indexOf(marker));
  if (positions.some((position) => position < 0)) {
    throw new Error(`${label}: missing marker ${JSON.stringify({ markers, positions })}`);
  }
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index - 1] >= positions[index]) {
      throw new Error(`${label}: invalid order ${JSON.stringify({ markers, positions })}`);
    }
  }
}

function assertIncludes(source, marker, label) {
  if (!source.includes(marker)) throw new Error(`${label}: missing ${marker}`);
}

const owner = read('src/screens/ProfilePublicScreen.tsx');
assertOrdered(owner, [
  '<ProfileMotionReveal motionKey={`owner-hero:${user.id}`}',
  '<View style={s.topMetricsBar}',
  '<View style={s.collectionHeader}>',
  '<View style={s.tabsRow}>',
  'accessibilityLabel="Gérer mes musiques"',
  'accessibilityLabel="Partager mon profil Loki Music"',
  '<Text style={s.dnaTitle}>Tes styles dominants</Text>',
  '<Text style={s.socialTitle}>Mes réseaux</Text>',
], 'Owner profile collective hierarchy');

if ((owner.match(/accessibilityLabel="Partager mon profil Loki Music"/g) || []).length !== 1) {
  throw new Error('Owner profile must expose exactly one PARTAGER action');
}
if ((owner.match(/accessibilityLabel="Voir aperçu"/g) || []).length !== 1) {
  throw new Error('Owner profile must expose exactly one APERÇU action');
}

assertIncludes(owner, 'dna:{marginHorizontal:18,', 'Owner DNA frame');
assertIncludes(owner, 'topMetricsBar:{marginHorizontal:18,', 'Owner compact counter frame');

const visitor = read('src/screens/PublicUserProfileScreen.tsx');
assertOrdered(visitor, [
  '<ProfileMotionReveal motionKey={`visitor-hero:${profile.id}`}',
  '<View style={styles.unifiedCounters}>',
  '<Text style={styles.sectionTitle}>À écouter · à débloquer</Text>',
  '<View style={styles.collectionHeader}>',
  '<View style={styles.tabsRow}>',
  '<ProfileMotionReveal motionKey={`visitor-tab:${activeTab}`} compact style={styles.publicMusicSection}>',
  '<Text style={styles.dnaTitle}>Son empreinte musicale</Text>',
  '<Text style={styles.socialTitle}>Ses réseaux</Text>',
], 'Visited profile collective hierarchy');

assertIncludes(visitor, 'dna:{marginHorizontal:18,', 'Visited DNA frame');
assertIncludes(visitor, 'unifiedCounters:{marginHorizontal:18,marginTop:4,marginBottom:8,gap:2}', 'Visited compact top counter frame');
assertIncludes(visitor, 'motionKey={`visitor-hero:${profile.id}`}', 'Visited profile motion');
assertIncludes(visitor, 'accessibilityLabel={`Swiper les découvertes de ${profile.username}`}', 'Visited current Swipe action');
assertIncludes(owner, "const [battleInProgress, setBattleInProgress] = useState(false);", 'Owner Battle presence state');
assertIncludes(owner, 'accessibilityLabel={battleAvailable ? \'Ne plus recevoir de défis Battle\' : \'Recevoir des défis Battle\'}', 'Owner Battle availability control');
assertIncludes(owner, 'motionKey={`owner-hero:${user.id}`}', 'Owner profile motion');
assertIncludes(owner, '<BattleGlowButton', 'Owner animated Battle contour');
assertIncludes(visitor, '<BattleGlowButton', 'Visited animated Battle contour');
if ((owner.match(/variant="outline" size="medium" containerStyle=\{s\.ownerQuickActionFull\}/g) || []).length !== 3) {
  throw new Error('Owner APERÇU / PEPITES / BATTLE must share the same full-width outline-only geometry');
}
assertIncludes(owner, "ownerQuickActions:{gap:8,marginTop:8,width:'100%'}", 'Owner quick actions full-width group');
assertIncludes(owner, "ownerQuickActionFull:{width:'100%'}", 'Owner quick actions full-width buttons');
assertIncludes(owner, "setMenuOpen(false); setExpandedMenuItem(null); navigation.navigate('Notifications');", 'Notification bell opens notifications directly');
assertIncludes(visitor, '<BattleGlowButton', 'Visited profile Battle outline');
assertIncludes(visitor, 'style={styles.visitorActionMotion}', 'Visited profile Battle equal-width action');
assertIncludes(visitor, 'active={profilePresence.online}', 'Visited profile Battle follows live presence');

const motionButton = read('src/components/MotionActionButton.tsx');
assertIncludes(motionButton, "variant !== 'outline'", 'Outline idle motion loop');
assertIncludes(motionButton, "backgroundColor: variant === 'outline' && pressed ? colors.primaryFaint : config.bg", 'Outline press feedback without permanent fill');

const battleGlow = read('src/components/BattleGlowButton.tsx');
assertIncludes(battleGlow, 'Animated.loop(Animated.sequence([', 'Battle animated contour');
assertIncludes(battleGlow, "backgroundColor: pressedState ? 'rgba(139,92,255,0.16)' : 'transparent'", 'Battle is outline-only until pressed');

const sharedCounters = read('src/components/ProfileCounterRow.tsx');
assertIncludes(sharedCounters, "alignSelf: 'stretch'", 'Shared counter stretch alignment');
if (sharedCounters.includes("width: '100%',\n    maxWidth: '100%'")) {
  throw new Error('Shared counter must not force 100% width plus border; it can overflow its profile frame');
}

console.log('Loki profile hierarchy + alignment contract: PASS');
