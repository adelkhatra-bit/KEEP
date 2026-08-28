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

console.log('KEEP profile hierarchy contract: PASS');
