#!/usr/bin/env node
/**
 * Canal de communication partagé entre agents KEEP (demande explicite d'Adel du
 * 25/08/2026 -- "je veux que vous puissiez communiquer tous les trois"). Claude
 * Code et Codex CLI (accès filesystem réel) l'utilisent directement ; Claude
 * Design (session de chat sans accès machine, voir AGENTS.md) y participe via
 * Adel qui colle son contenu -- ce n'est pas un vrai canal temps réel pour lui,
 * c'est la limite technique honnête, pas une fonctionnalité manquante.
 *
 * Fichier partagé : AGENT_MESSAGES.md (racine du repo, COMMITÉ -- contrairement
 * à .agent-lock.json qui est un état machine local jetable, ce journal doit
 * survivre et être visible sur GitHub pour que Codex le voie après un pull).
 *
 * Usage :
 *   node scripts/agent-message.cjs post <claude|codex|design> "message"
 *   node scripts/agent-message.cjs read [--last N]
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'AGENT_MESSAGES.md');
const HEADER = '# KEEP — Journal de communication entre agents\n\nAjouté automatiquement via `scripts/agent-message.cjs`. Le plus récent en bas.\n\n';

function ensureFile() {
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, HEADER, 'utf8');
}

const [, , cmd, ...rest] = process.argv;

if (cmd === 'post') {
  const [owner, ...msgParts] = rest;
  const message = msgParts.join(' ');
  if (!owner || !message) {
    console.error('Usage: agent-message.cjs post <claude|codex|design> "message"');
    process.exit(2);
  }
  ensureFile();
  const timestamp = new Date().toISOString();
  const entry = `## [${timestamp}] ${owner}\n\n${message}\n\n`;
  fs.appendFileSync(LOG_FILE, entry, 'utf8');
  console.log(`Message ajouté par "${owner}".`);
  process.exit(0);
} else if (cmd === 'read') {
  ensureFile();
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const lastFlagIndex = rest.indexOf('--last');
  if (lastFlagIndex >= 0 && rest[lastFlagIndex + 1]) {
    const n = Number(rest[lastFlagIndex + 1]);
    const entries = content.split(/^## /m).slice(1);
    const tail = entries.slice(-n).map((e) => '## ' + e).join('');
    console.log(tail || '(aucun message)');
  } else {
    console.log(content);
  }
  process.exit(0);
} else {
  console.error('Usage: agent-message.cjs <post|read> ...');
  process.exit(2);
}
