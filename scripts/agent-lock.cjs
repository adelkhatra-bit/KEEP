#!/usr/bin/env node
/**
 * Verrou de coordination réel entre agents locaux (Claude Code + Codex CLI) sur
 * C:\Users\97156\keep (demande explicite d'Adel du 25/08/2026 -- "une seule version
 * pour vous deux", pas de worktree séparé, mais pas de collision non plus).
 *
 * Fichier d'état local uniquement (.agent-lock.json, gitignoré) -- jamais partagé
 * via git, spécifique à CETTE machine. Expire seul après LOCK_TTL_MS d'inactivité :
 * un agent planté/oublié ne bloque jamais l'autre indéfiniment.
 *
 * Usage :
 *   node scripts/agent-lock.cjs status
 *   node scripts/agent-lock.cjs acquire <claude|codex> "description courte"
 *   node scripts/agent-lock.cjs release <claude|codex>
 */
const fs = require('fs');
const path = require('path');

const LOCK_FILE = path.join(__dirname, '..', '.agent-lock.json');
const LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes -- au-delà, le verrou est considéré abandonné.

function readLock() {
  try {
    const raw = fs.readFileSync(LOCK_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (Date.now() - new Date(data.acquiredAt).getTime() > LOCK_TTL_MS) return null; // expiré.
    return data;
  } catch {
    return null;
  }
}

function writeLock(owner, description) {
  const data = { owner, description: description || '', acquiredAt: new Date().toISOString(), pid: process.pid };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function clearLock() {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {}
}

const [, , cmd, owner, ...rest] = process.argv;
const description = rest.join(' ');

if (cmd === 'status') {
  const lock = readLock();
  if (!lock) {
    console.log('LIBRE -- aucun verrou actif (ou expiré).');
    process.exit(0);
  }
  const ageMin = Math.round((Date.now() - new Date(lock.acquiredAt).getTime()) / 60000);
  console.log(`OCCUPE par "${lock.owner}" depuis ${ageMin} min -- "${lock.description}"`);
  process.exit(1);
} else if (cmd === 'acquire') {
  if (!owner) {
    console.error('Usage: agent-lock.cjs acquire <claude|codex> "description"');
    process.exit(2);
  }
  const existing = readLock();
  if (existing && existing.owner !== owner) {
    const ageMin = Math.round((Date.now() - new Date(existing.acquiredAt).getTime()) / 60000);
    console.error(`REFUSE -- verrou deja detenu par "${existing.owner}" depuis ${ageMin} min ("${existing.description}"). Attends ou reessaie plus tard.`);
    process.exit(1);
  }
  writeLock(owner, description);
  console.log(`ACQUIS par "${owner}".`);
  process.exit(0);
} else if (cmd === 'release') {
  if (!owner) {
    console.error('Usage: agent-lock.cjs release <claude|codex>');
    process.exit(2);
  }
  const existing = readLock();
  if (existing && existing.owner !== owner) {
    console.error(`REFUSE -- le verrou appartient a "${existing.owner}", pas a "${owner}".`);
    process.exit(1);
  }
  clearLock();
  console.log(`LIBERE par "${owner}".`);
  process.exit(0);
} else {
  console.error('Usage: agent-lock.cjs <status|acquire|release> [claude|codex] ["description"]');
  process.exit(2);
}
