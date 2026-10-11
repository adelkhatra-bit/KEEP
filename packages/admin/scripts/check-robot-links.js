// Contrôle anti-bouton cassé (07/10/2026) : chaque entrée du menu a une page ET une phrase du robot, et inversement.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'components/AdminLayout.tsx'), 'utf8');
const robot = fs.readFileSync(path.join(root, 'components/AdminRobot.tsx'), 'utf8');
const hrefs = [...layout.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
const help = [...robot.matchAll(/^  '([^']+)':/gm)].map((m) => m[1]);
const errors = [];
for (const h of hrefs) {
  const file = path.join(root, 'pages', `${h === '/' ? 'index' : h.slice(1)}.tsx`);
  if (!fs.existsSync(file)) errors.push(`page absente pour ${h}`);
  if (!help.includes(h)) errors.push(`phrase du robot absente pour ${h}`);
}
for (const h of help) if (!hrefs.includes(h)) errors.push(`phrase du robot sans entrée de menu : ${h}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK : ${hrefs.length} destinations du robot vérifiées.`);
