'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'packages/admin/lib/adminNavigation.ts');
const mod = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
new Function('exports', 'require', 'module', compiled)(
  mod.exports, name => require(path.resolve(path.dirname(file), name)), mod,
);
const api = mod.exports;
const expected = [
  ['accueil', 'Accueil', ['/', '/launch-center', '/operations']],
  ['utilisateurs', 'Utilisateurs', ['/users', '/team']],
  ['musique', 'Musique', ['/music', '/music-brain', '/marketplace']],
  ['communaute', 'Communauté', ['/community', '/messages']],
  ['signalements', 'Signalements', ['/moderation', '/problem-reports', '/support-center']],
  ['argent', 'Argent', ['/plans', '/costs']],
  ['reglages', 'Réglages', ['/remote-config', '/feature-flags']],
  ['cles', 'Clés', ['/integrations', '/email-test', '/notification-access']],
];

test('8 rubriques exactes, 19 anciennes pages + Musique, aucune duplication', () => {
  assert.deepEqual(api.NAV_GROUPS.map(g => [g.slug, g.title, g.items.map(i => i.href)]), expected);
  assert.equal(api.NAV.length, 20);
  assert.equal(new Set(api.NAV.map(i => i.href)).size, 20);
  const sections = fs.readFileSync(path.join(root, 'packages/admin/pages/[section].tsx'), 'utf8');
  for (const group of api.NAV_GROUPS) {
    assert.doesNotMatch(group.title, /\s/);
    for (const item of group.items) {
      assert.doesNotMatch(item.label, /\s/);
      assert.ok(fs.existsSync(path.join(root, 'packages/admin/pages', item.href === '/' ? 'index.tsx' : `${item.href.slice(1)}.tsx`)));
      assert.ok(sections.includes(`'${item.href}':`), `${item.href} réutilisée par la rubrique`);
      assert.ok(item.roles.includes('SUPER_ADMIN'));
    }
  }
});
test('chaque destination canonique résout exactement le même onglet', () => {
  for (const group of api.NAV_GROUPS) for (const item of group.items) {
    assert.equal(api.currentTab(item.href), item);
    assert.equal(api.currentTab('/[section]', group.slug, api.tabId(item)), item);
    assert.equal(api.tabHref(group, item), `/${group.slug}?tab=${api.tabId(item)}`);
  }
  assert.equal(api.currentTab('/[section]', 'argent'), api.NAV_GROUPS[5].items[0]);
  for (const tab of ['team', 'inconnu', ['plans']]) assert.equal(api.currentTab('/[section]', 'argent', tab), undefined);
  assert.equal(api.currentTab('/[section]', 'inconnu', 'index'), undefined);
});
test('rôles historiques préservés, y compris les onglets déplacés', () => {
  const expectedRoles = {
    '/': api.ALL_ROLES,
    '/users': ['SUPER_ADMIN','ADMIN','SUPPORT','MODERATOR'],
    '/team': ['SUPER_ADMIN'],
    '/launch-center': ['SUPER_ADMIN'],
    '/marketplace': ['SUPER_ADMIN','ADMIN','FINANCE'],
    '/notification-access': ['SUPER_ADMIN','ADMIN'],
    '/remote-config': ['SUPER_ADMIN','ADMIN','TECH','MARKETING'],
    '/music': ['SUPER_ADMIN','ADMIN','TECH'],
  };
  for (const [href, roles] of Object.entries(expectedRoles)) {
    assert.deepEqual(api.NAV.find(i => i.href === href).roles, roles);
  }
});
test('aide ⓘ, contrat et vue Musique sans saisie ni appel mutateur', () => {
  const hint = fs.readFileSync(path.join(root, 'packages/admin/components/Hint.tsx'), 'utf8');
  assert.match(hint, /}>ⓘ<\/button>/);
  const music = fs.readFileSync(path.join(root, 'packages/admin/pages/music.tsx'), 'utf8');
  assert.doesNotMatch(music, /<(input|textarea)|rpc\('keep_loki_pulse'|\.insert\(|\.update\(|\.delete\(/);
  assert.match(music, /setData\(null\)/);
  assert.match(music, /Indisponible/);
  const contract = require('../config/keep-product-contract.json').adminNavigation;
  assert.deepEqual(contract.sections, expected.map(g => g[1]));
  assert.equal(contract.helpTrigger, 'ⓘ');
});
