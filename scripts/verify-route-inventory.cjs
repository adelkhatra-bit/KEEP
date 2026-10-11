#!/usr/bin/env node
/**
 * Inventaire des routes Loki (lot n°6, étape sûre — 05/10/2026).
 *
 * Règle d'Adel : « rien n'est supprimé, tout ce qui existe reste accessible en
 * 1 clic ». Ce contrôle empêche toute réorganisation (barre d'onglets, menu ☰)
 * de faire disparaître silencieusement une destination :
 *   1. chaque route enregistrée dans Navigation.tsx (onglets + pile + liens
 *      profonds) doit rester présente dans config/route-inventory.json ;
 *   2. chaque cible `navigate('X')` / `screen: 'X'` utilisée dans le code doit
 *      correspondre à une route enregistrée (pas de bouton mort) ;
 *   3. chaque route a au moins un point d'entrée (onglet, lien profond ou
 *      navigate) — sinon écran « orphelin ».
 *
 * Usage : node scripts/verify-route-inventory.cjs            (contrôle)
 *         node scripts/verify-route-inventory.cjs --update   (ajoute les nouvelles routes)
 * Une route ne peut être retirée qu'en éditant explicitement l'inventaire
 * (donc dans le même commit, avec décision écrite d'Adel).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mobile = path.join(root, 'packages', 'mobile');
const navFile = path.join(mobile, 'src', 'navigation', 'Navigation.tsx');
const inventoryFile = path.join(root, 'config', 'route-inventory.json');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '__tests__', 'dist-web', '.expo'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

const nav = fs.readFileSync(navFile, 'utf8');
const tabs = [...nav.matchAll(/<Tab\.Screen\s+name="([A-Za-z]+)"/g)].map((m) => m[1]);
const stack = [...nav.matchAll(/<RootStack\.Screen\s+name="([A-Za-z]+)"/g)].map((m) => m[1]);
const linkBlock = nav.slice(nav.indexOf('const linking'), nav.indexOf('function MainTabs'));
const deepLinks = [...linkBlock.matchAll(/^\s{6,}([A-Za-z]+):\s*'([^']+)'/gm)].map((m) => `${m[1]}=${m[2]}`);
const registered = new Set([...tabs, ...stack]);

const sources = [...walk(path.join(mobile, 'src')), path.join(mobile, 'App.tsx')];
const targets = new Map();
for (const file of sources) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/navigate\(\s*['"]([A-Za-z]+)['"]/g)) {
    if (!targets.has(m[1])) targets.set(m[1], new Set());
    targets.get(m[1]).add(path.relative(root, file));
  }
  for (const m of text.matchAll(/screen:\s*['"]([A-Za-z]+)['"]/g)) {
    if (!targets.has(m[1])) targets.set(m[1], new Set());
    targets.get(m[1]).add(path.relative(root, file));
  }
}

const current = { tabs: [...tabs].sort(), stack: [...stack].sort(), deepLinks: [...deepLinks].sort() };
const failures = [];

for (const [name, files] of targets) {
  if (!registered.has(name)) failures.push(`cible de navigation inconnue « ${name} » (${[...files].slice(0, 3).join(', ')}) : bouton mort`);
}
for (const name of registered) {
  const hasEntry = tabs.includes(name) || deepLinks.some((d) => d.startsWith(`${name}=`)) || targets.has(name) || name === 'Main';
  if (!hasEntry) failures.push(`route « ${name} » sans aucun point d'entrée (écran orphelin)`);
}

if (process.argv.includes('--update')) {
  const prev = fs.existsSync(inventoryFile) ? JSON.parse(fs.readFileSync(inventoryFile, 'utf8')) : { tabs: [], stack: [], deepLinks: [] };
  const merged = {};
  for (const key of ['tabs', 'stack', 'deepLinks']) merged[key] = [...new Set([...(prev[key] || []), ...current[key]])].sort();
  fs.mkdirSync(path.dirname(inventoryFile), { recursive: true });
  fs.writeFileSync(inventoryFile, JSON.stringify(merged, null, 2) + '\n');
  console.log('✅ Inventaire enregistré :', JSON.stringify({ tabs: merged.tabs.length, stack: merged.stack.length, deepLinks: merged.deepLinks.length }));
  process.exit(failures.length ? 1 : 0);
}

if (!fs.existsSync(inventoryFile)) {
  console.error('❌ config/route-inventory.json absent : lance --update une première fois.');
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
for (const key of ['tabs', 'stack', 'deepLinks']) {
  for (const item of baseline[key] || []) {
    if (!current[key].includes(item)) failures.push(`${key} : « ${item} » a disparu de Navigation.tsx (rien ne doit être supprimé sans décision d'Adel)`);
  }
}

if (failures.length) {
  console.error('❌ Inventaire des routes en échec :\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log(`✅ Inventaire des routes OK : ${tabs.length} onglets, ${stack.length} écrans, ${deepLinks.length} liens profonds, ${targets.size} cibles de navigation toutes valides.`);
