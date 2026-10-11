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

function assertCount(source, regex, expected, label) {
  const count = (source.match(regex) || []).length;
  if (count !== expected) throw new Error(`${label}: expected ${expected}, got ${count}`);
}

const owner = read('src/screens/ProfilePublicScreen.tsx');
assertOrdered(owner, [
  '<ProfileMotionReveal motionKey={`owner-hero:${user.id}`}',
  '<View style={s.topMetricsBar}',
  '<View style={s.collectionHeader}>',
  '<View style={s.tabsRow}>',
  'accessibilityLabel="Gérer mes musiques"',
  '<Text style={s.dnaCompactTitle}>Ton empreinte musicale</Text>',
  '<Text style={s.socialTitle}>Mes réseaux</Text>',
  'accessibilityLabel="Partager mon profil Loki Music"',
], 'Owner profile collective hierarchy');

assertCount(owner, /accessibilityLabel="Partager mon profil Loki Music"/g, 1, 'Owner PARTAGER action');
assertCount(owner, /accessibilityLabel="Voir aperçu"/g, 1, 'Owner APERÇU action');
const ownerActionsStart = owner.indexOf('<View style={s.ownerQuickActions}>');
const ownerActionsEnd = owner.indexOf('</ProfileMotionReveal>', ownerActionsStart);
const ownerActions = owner.slice(ownerActionsStart, ownerActionsEnd);
assertCount(ownerActions, /containerStyle=\{s\.ownerQuickActionFull\}/g, 3, 'Owner APERÇU / PÉPITES / BATTLE equal-width row');

assertIncludes(owner, 'testID="profile-music-dna-card"', 'Owner compact DNA card');
assertIncludes(owner, '<Text style={s.dnaEyebrow}>LOKI MUSIC DNA</Text>', 'Owner DNA branding');
assertIncludes(owner, '<Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>', 'Owner DNA percentage gauge');
assertIncludes(owner, 'const [ownerDnaExpanded, setOwnerDnaExpanded] = useState(false);', 'Owner DNA collapsed state');
assertIncludes(owner, 'testID="profile-music-dna-expanded"', 'Owner DNA expandable details');
assertIncludes(owner, 'testID="profile-loki-pulse-track-bubbles"', 'Owner separate Loki Pulse track bubbles');
assertIncludes(owner, 'style={s.lokiPulseSection}', 'Owner standalone Loki Pulse section');
assertIncludes(owner, "topMetricsBar:{marginHorizontal:0,", 'Owner compact counter frame');
assertIncludes(owner, 'profileMetaBadgeGroup:{flexDirection:\'row\'', 'Owner profile type inline group');
assertIncludes(owner, 'style={s.profileBattleInline}', 'Owner Battle inline with profile identity');

const ownerMeta = owner.slice(
  owner.indexOf('<View style={s.profileMetaTopRow}>'),
  owner.indexOf('{(user.city || user.countryCode)'),
);
assertOrdered(ownerMeta, [
  'style={[s.kindBadge',
  '<BattleGlowButton',
], 'Owner identity order profile type -> Battle');
assertCount(ownerMeta, />FREE<\/Text>/g, 0, 'Owner FREE must not appear beside profile type');

const ownerMetrics = owner.slice(
  owner.indexOf('<View style={s.topMetricsBar}'),
  owner.indexOf('{freeDetailsOpen && !isDemoMode ? ('),
);
assertOrdered(ownerMetrics, [
  '>PLUS</Text>',
  '>Abonnés</Text>',
  '>Reprises</Text>',
  '>FREE</Text>',
], 'Owner metrics order PLUS -> Abonnés -> Reprises -> FREE');
assertCount(ownerMetrics, />FREE<\/Text>/g, 1, 'Owner FREE appears exactly once in metrics');
assertIncludes(ownerMetrics, 'topMetricFreeItem', 'Owner FREE styling stays attached to metrics');

assertIncludes(owner, "const [battleInProgress, setBattleInProgress] = useState(false);", 'Owner Battle presence state');
assertIncludes(owner, "accessibilityLabel={battleAvailable ? 'Ne plus recevoir de défis Battle' : 'Recevoir des défis Battle'}", 'Owner Battle availability control');
assertIncludes(owner, '<BattleGlowButton', 'Owner animated Battle contour');
assertIncludes(owner, "ownerQuickActions:{flexDirection:'row',alignItems:'stretch',gap:8,marginTop:8,width:'100%'}", 'Owner quick actions equal-width row');
assertIncludes(owner, "ownerQuickActionFull:{flex:1,minWidth:0}", 'Owner quick actions flexible equal-width buttons');
assertIncludes(owner, 'setNotificationPanelOpen(true)', 'Notification bell opens inline side panel');
if (owner.includes("navigation.navigate('Notifications')")) throw new Error('Notification bell must stay inline and never navigate to the legacy Notifications screen');
assertIncludes(owner, '<NotificationSidePanel', 'Notification inline side panel mounted on owner profile');

const visitor = read('src/screens/PublicUserProfileScreen.tsx');
assertOrdered(visitor, [
  '<ProfileMotionReveal motionKey={`visitor-hero:${profile.id}`}',
  '<View style={styles.topMetricsBar}',
  '<View style={styles.collectionHeader}>',
  '<View style={styles.tabsRow}>',
  '<ProfileMotionReveal motionKey={`visitor-tab:${activeTab}`} compact style={styles.publicMusicSection}>',
  "<Text style={styles.dnaTitle}>{isOwner ? 'Mon empreinte musicale' : 'Son empreinte musicale'}</Text>",
  "<Text style={styles.socialTitle}>{isOwner ? 'Mes réseaux' : 'Ses réseaux'}</Text>",
], 'Visited profile collective hierarchy');

assertIncludes(visitor, 'testID="public-profile-loki-pulse-bubbles-card"', 'Visited Loki Pulse bubbles card');
assertIncludes(visitor, '<Text style={styles.visitorDnaSummaryScore}>{visitorStyleCoveragePercent}%</Text>', 'Visited Loki Pulse percentage gauge');
assertIncludes(visitor, "visitorPulseExpanded ? 'MASQUER' : `VOIR SES ${visitorStyleBubbles.length} STYLES`", 'Visited Loki Pulse compact styles toggle');
if (visitor.includes('Loki Music DNA')) throw new Error('Visited profile must not restore visible Loki Music DNA');
assertIncludes(visitor, "topMetricsBar:{marginHorizontal:0,", 'Visited compact top counter frame');
assertIncludes(visitor, "topMetricsSecondary:{marginHorizontal:0,", 'Visited expanded counter frame');
assertIncludes(visitor, 'const [countersExpanded, setCountersExpanded] = useState(false);', 'Visited PLUS counter expansion state');

const visitorMetrics = visitor.slice(
  visitor.indexOf('<View style={styles.topMetricsBar}'),
  visitor.indexOf('{!!profile.bio'),
);
assertOrdered(visitorMetrics, [
  '>PLUS</Text>',
  '>Abonnés</Text>',
  '>Morceaux</Text>',
  '>Reprises</Text>',
  '>Abonnements</Text>',
], 'Visited compact + expanded counter order');

assertIncludes(visitor, 'accessibilityLabel={`Swiper la musique de ${profile.username}`}', 'Visited SWIPE action');
assertIncludes(visitor, 'accessibilityLabel={`Ouvrir le tchat avec ${profile.username}`}', 'Visited TCHAT action');
assertIncludes(visitor, 'accessibilityLabel={`Défier ${profile.username} en Battle`}', 'Visited Battle action');
assertIncludes(visitor, 'accessibilityLabel={`Partager le profil de ${profile.username}`}', 'Visited PARTAGER action');
const visitorActionsStart = visitor.indexOf('{!isOwner ? (');
const visitorActionsEnd = visitor.indexOf(') : (', visitorActionsStart);
const visitorActions = visitor.slice(visitorActionsStart, visitorActionsEnd);
assertCount(visitorActions, /variant="outline" size="medium" containerStyle=\{styles\.ownerQuickActionFull\}/g, 4, 'Visited SWIPE / TCHAT / BATTLE / PARTAGER equal-width row');

const selfActionsStart = visitorActionsEnd;
const selfActionsEnd = visitor.indexOf('</ProfileMotionReveal>', selfActionsStart);
const selfActions = visitor.slice(selfActionsStart, selfActionsEnd);
assertCount(selfActions, /variant="outline" size="medium" containerStyle=\{styles\.ownerQuickActionFull\}/g, 4, 'Canonical self-profile SWIPE / MODIFIER / PÉPITES / PARTAGER equal-width row');
assertIncludes(visitor, "ownerQuickActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'stretch',gap:8,marginTop:8,width:'100%'}", 'Visited quick actions wrapped two-column row');
assertIncludes(visitor, "ownerQuickActionFull:{flexGrow:1,flexBasis:'47%',minWidth:0}", 'Visited quick actions equal-width two-column buttons');
assertIncludes(visitor, 'const online = self || profilePresence.online;', 'Visited live-presence indicator');

const motionButton = read('src/components/MotionActionButton.tsx');
assertIncludes(motionButton, "variant !== 'outline'", 'Outline idle motion loop');
assertIncludes(motionButton, "backgroundColor: variant === 'outline' && pressed ? colors.primaryFaint : config.bg", 'Outline press feedback without permanent fill');

const battleGlow = read('src/components/BattleGlowButton.tsx');
assertIncludes(battleGlow, 'Animated.loop(Animated.sequence([', 'Battle animated contour');
assertIncludes(battleGlow, "backgroundColor: pressedState ? 'rgba(124,92,252,0.28)' : active ? 'rgba(45,225,194,0.10)' : 'rgba(124,92,252,0.16)'", 'Battle keeps visible depth and press feedback');
assertIncludes(battleGlow, "const accent = active ? colors.keep : '#7C5CFC'", 'Battle animated state color');

console.log('Loki profile hierarchy + alignment contract: PASS');
console.log('owner: profile type + Battle in identity row; PLUS/Abonnés/Reprises/FREE below; DNA compact masquable -> réseaux -> Loki Pulse track bubbles -> partage');
console.log('visitor: compact PLUS + Abonnés/Morceaux, Reprises/Abonnements on expansion');
console.log('actions: owner APERÇU/PÉPITES/BATTLE and visitor SWIPE/TCHAT/BATTLE/PARTAGER equal-width rows preserved');
