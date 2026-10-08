// Contrôle anti-bouton cassé (07/10/2026) : chaque entrée du menu a une page ET une phrase du robot, et inversement.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const navigation = require('../lib/adminNavigation.json');
const contract = require('../../../config/keep-product-contract.json').adminNavigation;
const robot = fs.readFileSync(path.join(root, 'components/AdminRobot.tsx'), 'utf8');
const hrefs = navigation.flatMap((group) => group.items.map((item) => item.href));
const help = [...robot.matchAll(/^  '([^']+)':/gm)].map((m) => m[1]);
const errors = [];
if (navigation.length !== 8) errors.push('Le menu doit contenir exactement 8 rubriques.');
if (JSON.stringify(navigation.map((g) => g.title)) !== JSON.stringify(contract.sections)) errors.push('Rubriques différentes du contrat produit.');
if (new Set(hrefs).size !== hrefs.length) errors.push('Une page apparaît dans plusieurs rubriques.');
for (const group of navigation) {
  if (/\s/.test(group.title)) errors.push(`Rubrique de plusieurs mots : ${group.title}`);
  for (const item of group.items) if (/\s/.test(item.label)) errors.push(`Onglet de plusieurs mots : ${item.label}`);
}
for (const h of hrefs) {
  const file = path.join(root, 'pages', `${h === '/' ? 'index' : h.slice(1)}.tsx`);
  if (!fs.existsSync(file)) errors.push(`page absente pour ${h}`);
  if (!help.includes(h)) errors.push(`phrase du robot absente pour ${h}`);
}
for (const h of help) if (!hrefs.includes(h)) errors.push(`phrase du robot sans entrée de menu : ${h}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK : ${hrefs.length} destinations du robot vérifiées.`);
