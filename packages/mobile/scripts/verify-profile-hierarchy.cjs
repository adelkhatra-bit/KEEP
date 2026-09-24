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
  '{user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}',
  'accessibilityLabel="Inviter ou partager mon profil"',
  '<View style={s.collectionHeader}>',
  '<View style={s.tabsRow}>',
  '<View style={s.communitySection}>',
  "{ value: profileFollowerCount, label: 'Abonnés',",
  '<CommunityConnectionsPanel userId={user.id}',
  "{ value: profileTotalKeepCount, label: 'Morceaux'",
  '<Text style={s.dnaTitle}>Ton empreinte musicale</Text>',
  '<Text style={s.socialTitle}>Mes réseaux</Text>',
], 'Owner profile collective hierarchy');

if ((owner.match(/accessibilityLabel="Inviter ou partager mon profil"/g) || []).length !== 1) {
  throw new Error('Owner profile must expose exactly one PARTAGER action');
}
if ((owner.match(/accessibilityLabel="Prévisualiser mon univers en Swipe"/g) || []).length !== 1) {
  throw new Error('Owner profile must expose exactly one SWIPE action');
}

assertIncludes(owner, 'dna:{marginHorizontal:18,', 'Owner DNA frame');
assertIncludes(owner, 'communitySection:{marginHorizontal:18,gap:2}', 'Owner community counter frame');

const visitor = read('src/screens/PublicUserProfileScreen.tsx');
assertOrdered(visitor, [
  '<ProfileMotionReveal motionKey={`visitor-hero:${profile.id}`}',
  '<Text style={styles.sectionTitle}>Découvertes à débloquer</Text>',
  '<View style={styles.unifiedCounters}>',
  "{ value: followerCount, label: 'Abonnés'",
  '<CommunityConnectionsPanel userId={profile.id}',
  "{ value: directKeepCount, label: 'Morceaux' }",
  '<View style={styles.collectionHeader}>',
  '<View style={styles.tabsRow}>',
  '<ProfileMotionReveal motionKey={`visitor-tab:${activeTab}`} compact style={styles.publicMusicSection}>',
  '<Text style={styles.dnaTitle}>Son empreinte musicale</Text>',
  '<Text style={styles.socialTitle}>Ses réseaux</Text>',
], 'Visited profile collective hierarchy');

assertIncludes(visitor, 'dna:{marginHorizontal:18,', 'Visited DNA frame');
assertIncludes(visitor, 'unifiedCounters:{marginHorizontal:18,marginTop:14,gap:2}', 'Visited unified counter frame');
assertIncludes(visitor, 'motionKey={`visitor-hero:${profile.id}`}', 'Visited profile motion');
assertIncludes(visitor, "title=\"SWIPE\"", 'Visited animated Swipe action');
assertIncludes(visitor, "title={battleInviteBusy ? 'INVITATION EN COURS…' : 'DÉFIER EN BATTLE'}", 'Visited animated Battle action');
assertIncludes(owner, "title=\"JOUER EN SOLO\"", 'Owner animated solo Battle action');
assertIncludes(owner, 'motionKey={`owner-hero:${user.id}`}', 'Owner profile motion');

const sharedCounters = read('src/components/ProfileCounterRow.tsx');
assertIncludes(sharedCounters, "alignSelf: 'stretch'", 'Shared counter stretch alignment');
if (sharedCounters.includes("width: '100%',\n    maxWidth: '100%'")) {
  throw new Error('Shared counter must not force 100% width plus border; it can overflow its profile frame');
}

console.log('Loki profile hierarchy + alignment contract: PASS');
