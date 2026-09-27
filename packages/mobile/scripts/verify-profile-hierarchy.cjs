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
  '<View style={s.topMetricsBar}',
  '<ProfileMotionReveal motionKey={`owner-hero:${user.id}`}',
  '<View style={s.collectionHeader}>',
  '<View style={s.tabsRow}>',
  'title="GÉRER MES MUSIQUES"',
  'accessibilityLabel="Partager mon profil Loki Music"',
  '<Text style={s.dnaTitle}>Tes styles dominants</Text>',
  '<Text style={s.socialTitle}>Mes réseaux</Text>',
], 'Owner profile collective hierarchy');

if ((owner.match(/accessibilityLabel="Partager mon profil Loki Music"/g) || []).length !== 1) {
  throw new Error('Owner profile must expose exactly one PARTAGER action');
}
if ((owner.match(/accessibilityLabel="Prévisualiser mon univers en Swipe"/g) || []).length !== 1) {
  throw new Error('Owner profile must expose exactly one SWIPE action');
}

assertIncludes(owner, 'dna:{marginHorizontal:18,', 'Owner DNA frame');
assertIncludes(owner, 'topMetricsBar:{marginHorizontal:18,', 'Owner compact counter frame');

const visitor = read('src/screens/PublicUserProfileScreen.tsx');
assertOrdered(visitor, [
  '<View style={styles.unifiedCounters}>',
  '<ProfileMotionReveal motionKey={`visitor-hero:${profile.id}`}',
  '<Text style={styles.sectionTitle}>Découvre avant tout le monde</Text>',
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
assertIncludes(visitor, "title={battleInviteBusy ? 'INVITATION EN COURS…' : 'DÉFIER EN BATTLE'}", 'Visited animated Battle action');
assertIncludes(owner, "title=\"JOUER EN SOLO\"", 'Owner animated solo Battle action');
assertIncludes(owner, 'motionKey={`owner-hero:${user.id}`}', 'Owner profile motion');

const sharedCounters = read('src/components/ProfileCounterRow.tsx');
assertIncludes(sharedCounters, "alignSelf: 'stretch'", 'Shared counter stretch alignment');
if (sharedCounters.includes("width: '100%',\n    maxWidth: '100%'")) {
  throw new Error('Shared counter must not force 100% width plus border; it can overflow its profile frame');
}

console.log('Loki profile hierarchy + alignment contract: PASS');
