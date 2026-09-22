// Régénère UNIQUEMENT les sections dynamiques de PROJECT_STATE.md (racine du
// repo), entre des marqueurs <!-- AUTO:...:START/END -->. Les sections
// écrites à la main (Fonctionnalités actives, Points ouverts, Règles
// absolues, Fichiers critiques, APIs et clés) ne sont jamais touchées.
//
// Usage : node scripts/update-project-state.cjs
// Appelé automatiquement par .githooks/post-merge (voir CLAUDE.md, section
// "one-time setup" : git config core.hooksPath .githooks).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'PROJECT_STATE.md');

// execFileSync (pas execSync) : appelle git directement sans passer par le
// shell -- indispensable sur Windows/cmd.exe, où execSync interprète le `|`
// des formats git log ("%h|%ad|%s") comme un vrai pipe shell et casse la
// commande.
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function replaceBetweenMarkers(content, marker, newBody) {
  const start = `<!-- AUTO:${marker}:START -->`;
  const end = `<!-- AUTO:${marker}:END -->`;
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Marqueurs AUTO:${marker} introuvables ou invalides dans PROJECT_STATE.md`);
  }
  const before = content.slice(0, startIdx + start.length);
  const after = content.slice(endIdx);
  return `${before}\n${newBody}\n${after}`;
}

if (!fs.existsSync(statePath)) {
  console.error('PROJECT_STATE.md introuvable à la racine du repo -- rien à régénérer.');
  process.exit(1);
}

let content = fs.readFileSync(statePath, 'utf8');

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const headHash = git(['rev-parse', 'HEAD']);
const headShort = git(['rev-parse', '--short', 'HEAD']);
const headSubject = git(['log', '-1', '--format=%s']);
const headDate = git(['log', '-1', '--format=%ad', '--date=iso-strict']);
const dirty = git(['status', '--porcelain']).length > 0;
const now = new Date().toISOString();

const gitStateBody = [
  `- Régénéré le : ${now}`,
  `- Branche : \`${branch}\``,
  `- Dernier commit : \`${headShort}\` (${headHash}) — ${headSubject}`,
  `- Date du dernier commit : ${headDate}`,
  `- Working tree : ${dirty ? '⚠️ modifications non commitées présentes' : '✅ propre'}`,
].join('\n');

content = replaceBetweenMarkers(content, 'GIT-STATE', gitStateBody);

const commitsRaw = git(['log', '-10', '--format=%h|%ad|%an|%s', '--date=short']);
const commitsBody = commitsRaw.split('\n').filter(Boolean).map((line) => {
  const [hash, date, author, ...subjectParts] = line.split('|');
  const subject = subjectParts.join('|');
  return `- \`${hash}\` (${date}, ${author}) — ${subject}`;
}).join('\n');

content = replaceBetweenMarkers(content, 'RECENT-COMMITS', commitsBody);

fs.writeFileSync(statePath, content, 'utf8');
console.log('PROJECT_STATE.md : sections dynamiques régénérées (état git + 10 derniers commits).');
