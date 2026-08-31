#!/usr/bin/env node
/**
 * KEEP production data preservation contract.
 *
 * Treat the repository as if millions of users already exist. New features
 * must migrate/enrich data; they must never reset it to make a new model fit.
 *
 * This guard scans ONLY newly-added diff lines so legacy migrations are not
 * retroactively rejected. Deliberate account deletion flows are explicitly
 * isolated from this global protection.
 */
const { execFileSync } = require('node:child_process');

const PROTECTED_TABLES = [
  'profiles',
  'profile_private',
  'tracks',
  'keep_decisions',
  'playlists',
  'playlist_tracks',
  'social_links',
  'follows',
  'music_library_items',
  'notifications',
  'push_tokens',
  'events',
  'event_rsvps',
];

const EXPLICIT_DELETION_PATHS = [
  'supabase/functions/delete-account/',
];

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

function changedFiles() {
  const base = process.env.GITHUB_EVENT_BEFORE || '';
  const validBase = /^[0-9a-f]{40}$/i.test(base) && !/^0+$/.test(base);
  const range = validBase ? `${base}..HEAD` : 'HEAD^..HEAD';
  const output = git(['diff', '--name-only', range]);
  return { range, files: output.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) };
}

function addedLines(range, file) {
  const diff = git(['diff', '--unified=0', '--no-ext-diff', range, '--', file]);
  return diff.split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

function protectedPattern() {
  return `(?:${PROTECTED_TABLES.join('|')})`;
}

function findViolations(file, lines) {
  const text = lines.join('\n');
  if (!text.trim()) return [];
  const table = protectedPattern();
  const violations = [];

  const sqlRules = [
    ['DROP TABLE', new RegExp(`\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?${table}\\b`, 'i')],
    ['TRUNCATE', new RegExp(`\\btruncate(?:\\s+table)?\\s+(?:public\\.)?${table}\\b`, 'i')],
    ['DELETE FROM', new RegExp(`\\bdelete\\s+from\\s+(?:public\\.)?${table}\\b`, 'i')],
    ['DROP COLUMN on protected table', new RegExp(`\\balter\\s+table\\s+(?:public\\.)?${table}[\\s\\S]{0,400}?\\bdrop\\s+column\\b`, 'i')],
  ];

  for (const [label, rule] of sqlRules) {
    if (rule.test(text)) violations.push(`${label} on protected user data`);
  }

  const isExplicitDeletionFlow = EXPLICIT_DELETION_PATHS.some((prefix) => file.startsWith(prefix));
  if (!isExplicitDeletionFlow) {
    const clientDelete = new RegExp(`\\.from\\(\\s*['\"]${table}['\"]\\s*\\)[\\s\\S]{0,260}?\\.delete\\s*\\(`, 'i');
    if (clientDelete.test(text)) violations.push('client/service delete() on protected user data outside isolated account deletion flow');
  }

  // A mirror sync may mark provider rows as removed, but must never hard-delete
  // core KEEP decisions. We permit removed_at tombstones because they preserve
  // history and can be reversed/reconciled.
  return violations;
}

const { range, files } = changedFiles();
if (!files.length) {
  console.log('KEEP DATA PRESERVATION: no changed files to inspect');
  process.exit(0);
}

const relevant = files.filter((file) => /\.(sql|ts|tsx|js|cjs|mjs)$/i.test(file));
const failures = [];
for (const file of relevant) {
  const violations = findViolations(file, addedLines(range, file));
  for (const violation of violations) failures.push(`${file}: ${violation}`);
}

if (failures.length) {
  console.error('\nKEEP DATA PRESERVATION CONTRACT FAILED');
  console.error('Existing profiles, KEEP history and social/music data are production assets.');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('\nUse an additive/backfill/tombstone migration instead of reset/delete semantics.');
  process.exit(1);
}

console.log(`KEEP DATA PRESERVATION OK — ${relevant.length} changed source/data files inspected (${range})`);
