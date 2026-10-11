#!/usr/bin/env node
/**
 * Registre de versions (Adel, 11/10/2026) : « une correction n'est terminée que publiée ET vérifiée sur la version servie ».
 * Source : docs/RELEASE_REGISTER.json (écrit uniquement par le workflow de release APRÈS vérification du SHA réellement servi).
 * Rendu : section AUTO:RELEASE-REGISTER de PROJECT_STATE.md (jamais à la main).
 *
 * Usage (workflow) :
 *   node scripts/release-register.cjs add --commit <sha> --web <sha-servi> --testflight <build|n/a> --ota <groupe|n/a> \
 *        --tests <pass|fail> --changes "<changements visibles>"
 *   node scripts/release-register.cjs render      # régénère seulement la section de PROJECT_STATE.md
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const registerPath = path.join(root, 'docs', 'RELEASE_REGISTER.json');
const statePath = path.join(root, 'PROJECT_STATE.md');
const MAX_ROWS = 40;
const START = '<!-- AUTO:RELEASE-REGISTER:START -->';
const END = '<!-- AUTO:RELEASE-REGISTER:END -->';

function load() {
  try { const data = JSON.parse(fs.readFileSync(registerPath, 'utf8')); return Array.isArray(data) ? data : []; } catch { return []; }
}
const cell = (value) => String(value ?? 'n/a').replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || 'n/a';

function render(rows) {
  const lines = [
    '| Commit | SHA web en ligne | Build TestFlight | Groupe OTA | Date (UTC) | Tests | Changements visibles |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| \`${cell(r.commit).slice(0, 7)}\` | \`${cell(r.web).slice(0, 7)}\` | ${cell(r.testflight)} | ${cell(r.ota)} | ${cell(r.date)} | ${cell(r.tests)} | ${cell(r.changes)} |`),
  ];
  if (!rows.length) lines.push('| _aucune release vérifiée enregistrée_ | | | | | | |');
  return lines.join('\n');
}

function writeState(rows) {
  if (!fs.existsSync(statePath)) return;
  let content = fs.readFileSync(statePath, 'utf8');
  const a = content.indexOf(START);
  const b = content.indexOf(END);
  if (a === -1 || b === -1 || b < a) throw new Error('Marqueurs AUTO:RELEASE-REGISTER introuvables dans PROJECT_STATE.md');
  content = `${content.slice(0, a + START.length)}\n${render(rows)}\n${content.slice(b)}`;
  fs.writeFileSync(statePath, content, 'utf8');
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (require.main === module) {
  const command = process.argv[2];
  const rows = load();
  if (command === 'add') {
    const commit = arg('commit');
    const web = arg('web');
    if (!commit || !web) { console.error('--commit et --web (SHA réellement servi) sont obligatoires'); process.exit(2); }
    // Garde : on n'enregistre jamais une release dont le SHA servi n'est pas le commit annoncé.
    if (!String(web).startsWith(String(commit).slice(0, 7)) && !String(commit).startsWith(String(web).slice(0, 7))) {
      console.error(`SHA servi (${web}) différent du commit (${commit}) : rien enregistré.`); process.exit(3);
    }
    const row = { commit, web, testflight: arg('testflight') || 'n/a', ota: arg('ota') || 'n/a', date: arg('date') || new Date().toISOString().slice(0, 16).replace('T', ' '), tests: arg('tests') || 'n/a', changes: arg('changes') || 'n/a' };
    const next = [row, ...rows.filter((r) => String(r.commit).slice(0, 7) !== String(commit).slice(0, 7))].slice(0, MAX_ROWS);
    fs.writeFileSync(registerPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    writeState(next);
    console.log(`Registre mis à jour : ${String(commit).slice(0, 7)} servi en ligne.`);
  } else if (command === 'render') {
    writeState(rows);
    console.log('Registre de versions : section régénérée.');
  } else {
    console.error('Usage : release-register.cjs add --commit … --web … | render'); process.exit(2);
  }
}
module.exports = { render, load, writeState };
