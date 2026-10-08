const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const protectedFiles = [
  'packages/mobile/src/screens/HomeScreenCompact.tsx',
  'packages/mobile/src/screens/NotificationsScreen.tsx',
  'packages/mobile/src/screens/MyMusicScreen.tsx',
  'packages/mobile/src/screens/ProfilePublicScreen.tsx',
];

const interactiveTags = ['TouchableOpacity', 'Pressable', 'MotionActionButton'];
const failures = [];

function openingTags(source, tag) {
  const out = [];
  const needle = '<' + tag;
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) >= 0) {
    let i = cursor + needle.length;
    let braces = 0;
    let quote = null;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === quote && source[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') braces += 1;
      else if (ch === '}') braces = Math.max(0, braces - 1);
      else if (ch === '>' && braces === 0) {
        out.push({ start: cursor, text: source.slice(cursor, i + 1) });
        cursor = i + 1;
        break;
      }
    }
    if (i >= source.length) break;
  }
  return out;
}

for (const rel of protectedFiles) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    failures.push(rel + ': fichier protégé absent');
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const tag of interactiveTags) {
    for (const opening of openingTags(source, tag)) {
      // Les composants qui délèguent explicitement tous leurs props sont des
      // wrappers : le handler peut être fourni par l'appelant.
      if (/\{\.\.\.[A-Za-z0-9_$]+\}/.test(opening.text)) continue;
      if (/\bonPress\s*=/.test(opening.text)) continue;
      const line = source.slice(0, opening.start).split(/\r?\n/).length;
      failures.push(`${rel}:${line} <${tag}> sans onPress réel`);
    }
  }
}

if (failures.length) {
  console.error('\nKEEP INTERACTION LOOP CHECK FAILED');
  console.error('Règle: intention -> action -> feedback -> résultat/retour. Aucun contrôle décoratif.\n');
  failures.forEach((item) => console.error('- ' + item));
  process.exit(1);
}

console.log('KEEP interaction loop: PASS');
console.log('Critical surfaces: every TouchableOpacity/Pressable/MotionActionButton has a real onPress.');
