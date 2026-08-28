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
  "{ value: profileFollowerCount, label: 'Abonnés' }",
  '<CommunityConnectionsPanel userId={user.id}',
  '<Text style={s.socialTitle}>Mes réseaux</Text>',
  'accessibilityLabel="Partager mon profil"',
  '<Text style={s.dnaTitle}>Ton empreinte musicale</Text>',
  '<View style={s.keepCounters}>',
  "{ value: profileTotalKeepCount, label: 'KEEP total' }",
  '<View style={s.tabs}>',
], 'Owner profile collective hierarchy');

if ((owner.match(/accessibilityLabel="Partager mon profil"/g) || []).length !== 1) {
  throw new Error('Owner profile must expose exactly one PARTAGER action');
}
if ((owner.match(/accessibilityLabel="Prévisualiser mon KEEP en Swipe"/g) || []).length !== 1) {
  throw new Error('Owner profile must expose exactly one SWIPE action');
}

assertIncludes(owner, 'dna:{marginHorizontal:18,', 'Owner DNA frame');
assertIncludes(owner, 'keepCounters:{marginHorizontal:18}', 'Owner KEEP counter frame');

const visitor = read('src/screens/PublicUserProfileScreen.tsx');
assertOrdered(visitor, [
  "{ value: followerCount, label: 'Abonnés' }",
  '<Text style={styles.socialTitle}>Ses réseaux</Text>',
  '<Text style={styles.dnaTitle}>Son empreinte musicale</Text>',
  '<Text style={styles.swipeLaunchTitle}>▶ DÉCOUVRIR SON KEEP EN SWIPE</Text>',
  '<View style={styles.visitorKeepCounters}>',
  "{ value: directKeepCount, label: 'KEEP' }",
  '<View style={styles.publicMusicSection}>',
], 'Visited profile collective hierarchy');

assertIncludes(visitor, 'dna:{marginHorizontal:18,', 'Visited DNA frame');
assertIncludes(visitor, 'visitorKeepCounters:{marginHorizontal:18}', 'Visited KEEP counter frame');

const sharedCounters = read('src/components/ProfileCounterRow.tsx');
assertIncludes(sharedCounters, "alignSelf: 'stretch'", 'Shared counter stretch alignment');
if (sharedCounters.includes("width: '100%',\n    maxWidth: '100%'")) {
  throw new Error('Shared counter must not force 100% width plus border; it can overflow its profile frame');
}

console.log('KEEP profile hierarchy + alignment contract: PASS');
