#!/usr/bin/env node
/**
 * KEEP production data preservation contract.
 *
 * Treat the repository as if millions of users already exist.
 * Existing durable data must be migrated/enriched, never reset to make new
 * code fit. The guard inspects only newly-added diff lines, while existing
 * migration files are immutable once committed.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config/keep-data-preservation.json'), 'utf8'),
);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

function tablePattern(items, prefixes = []) {
  const exact = items.map(escapeRegex);
  const prefixed = prefixes.map((value) => escapeRegex(value) + '[a-z0-9_]*');
  return '(?:' + [...exact, ...prefixed].join('|') + ')';
}

const PROTECTED_TABLE = tablePattern(CONFIG.criticalTables, CONFIG.protectedTablePrefixes);
const APPEND_ONLY_TABLE = tablePattern(CONFIG.appendOnlyTables);

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

function resolveRange() {
  const candidates = [
    process.env.GITHUB_BASE_SHA,
    process.env.GITHUB_EVENT_BEFORE,
  ].filter((value) => /^[0-9a-f]{40}$/i.test(String(value || '')) && !/^0+$/.test(String(value || '')));

  for (const base of candidates) {
    const type = git(['cat-file', '-t', base]).trim();
    if (type === 'commit') return base + '..HEAD';
  }
  return 'HEAD^..HEAD';
}

function changedEntries(range) {
  return git(['diff', '--name-status', range])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/);
      const status = parts[0] || '';
      const file = parts[parts.length - 1] || '';
      return { status, file };
    });
}

function addedLines(range, file) {
  const diff = git(['diff', '--unified=0', '--no-ext-diff', range, '--', file]);
  return diff.split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

function isExplicitDeletionFlow(file, text) {
  const allowedPath = CONFIG.explicitDeletionPaths.some((prefix) => file.startsWith(prefix));
  if (allowedPath && text.includes(CONFIG.explicitDeletionMarker)) return true;
  // Exceptions ciblées et approuvées (fichier précis + marqueur dédié) : voir `explicitDeletionExceptions` dans config/keep-data-preservation.json.
  return (CONFIG.explicitDeletionExceptions || []).some((entry) => file === entry.path && text.includes(entry.marker));
}

function isExactMigrationRelocation(file, range) {
  const base = String(range || '').split('..')[0];
  if (!/^[0-9a-f]{40}$/i.test(base)) return false;
  const oldContent = git(['show', base + ':' + file]);
  if (!oldContent) return false;

  const migrationDir = path.join(ROOT, 'supabase', 'migrations');
  let names = [];
  try { names = fs.readdirSync(migrationDir); } catch { return false; }
  return names.some((name) => {
    if (!name.endsWith('.sql')) return false;
    const candidate = path.join(migrationDir, name);
    try {
      return fs.readFileSync(candidate, 'utf8') === oldContent;
    } catch {
      return false;
    }
  });
}

function findViolations(file, lines) {
  const text = lines.join('\n');
  if (!text.trim()) return [];
  const violations = [];
  const explicitDeletion = isExplicitDeletionFlow(file, text);

  if (/\bsupabase\s+db\s+(?:reset|push)\b/i.test(text)) {
    violations.push('forbidden production database command (db reset/db push)');
  }

  const destructiveRules = [
    ['DROP TABLE', new RegExp('\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?' + PROTECTED_TABLE + '\\b', 'i')],
    ['TRUNCATE', new RegExp('\\btruncate(?:\\s+table)?\\s+(?:public\\.)?' + PROTECTED_TABLE + '\\b', 'i')],
    ['DROP COLUMN', new RegExp('\\balter\\s+table\\s+(?:public\\.)?' + PROTECTED_TABLE + '[\\s\\S]{0,500}?\\bdrop\\s+column\\b', 'i')],
    ['RENAME protected table', new RegExp('\\balter\\s+table\\s+(?:public\\.)?' + PROTECTED_TABLE + '[\\s\\S]{0,300}?\\brename\\s+to\\b', 'i')],
  ];
  for (const [label, rule] of destructiveRules) {
    if (rule.test(text)) violations.push(label + ' on protected user data');
  }

  if (!explicitDeletion) {
    const deleteSql = new RegExp('\\bdelete\\s+from\\s+(?:public\\.)?' + PROTECTED_TABLE + '\\b', 'i');
    if (deleteSql.test(text)) violations.push('DELETE FROM protected user data');

    const clientDelete = new RegExp('\\.from\\(\\s*[\'"]' + PROTECTED_TABLE + '[\'"]\\s*\\)[\\s\\S]{0,320}?\\.delete\\s*\\(', 'i');
    if (clientDelete.test(text)) {
      violations.push('client/service delete() on protected user data outside isolated account deletion');
    }
  }

  const updateLedger = new RegExp('\\bupdate\\s+(?:public\\.)?' + APPEND_ONLY_TABLE + '\\b', 'i');
  if (updateLedger.test(text)) violations.push('UPDATE on append-only credit/audit ledger');

  const deleteLedger = new RegExp('\\bdelete\\s+from\\s+(?:public\\.)?' + APPEND_ONLY_TABLE + '\\b', 'i');
  if (!explicitDeletion && deleteLedger.test(text)) violations.push('DELETE on append-only credit/audit ledger');

  const mutableLedger = new RegExp('\\.from\\(\\s*[\'"]' + APPEND_ONLY_TABLE + '[\'"]\\s*\\)[\\s\\S]{0,320}?\\.(?:update|delete|upsert)\\s*\\(', 'i');
  if (!explicitDeletion && mutableLedger.test(text)) {
    violations.push('mutable client/service write on append-only credit/audit ledger');
  }

  const sqlLedgerUpsert = new RegExp('\\binsert\\s+into\\s+(?:public\\.)?' + APPEND_ONLY_TABLE + '[\\s\\S]{0,800}?\\bon\\s+conflict[\\s\\S]{0,300}?\\bdo\\s+update\\b', 'i');
  if (sqlLedgerUpsert.test(text)) violations.push('ON CONFLICT DO UPDATE on append-only credit/audit ledger');

  return violations;
}

function selfTest() {
  const tests = [
    ['drop profile', 'supabase/migrations/x.sql', ['drop table public.profiles;'], true],
    ['truncate battle', 'supabase/migrations/x.sql', ['truncate public.keep_battle_solo_history;'], true],
    ['delete score', 'supabase/migrations/x.sql', ['delete from public.keep_battle_arena_match_results;'], true],
    ['update free ledger', 'supabase/migrations/x.sql', ['update public.keep_battle_solo_credit_events set amount=0;'], true],
    ['db reset', '.github/workflows/x.yml', ['supabase db reset --linked'], true],
    ['db push', 'scripts/x.sh', ['supabase db push'], true],
    ['safe additive column', 'supabase/migrations/x.sql', ['alter table public.profiles add column if not exists locale text;'], false],
    ['safe backfill', 'supabase/migrations/x.sql', ['update public.profiles set locale = coalesce(locale, \'fr\') where locale is null;'], false],
    ['safe ledger insert', 'supabase/migrations/x.sql', ['insert into public.keep_battle_credit_events(profile_id,amount) values (auth.uid(),1);'], false],
  ];

  const failures = [];
  for (const [name, file, lines, shouldFail] of tests) {
    const failed = findViolations(file, lines).length > 0;
    if (failed !== shouldFail) failures.push(name + ': expected ' + shouldFail + ', got ' + failed);
  }
  if (failures.length) {
    console.error('KEEP DATA PRESERVATION SELF-TEST FAILED');
    failures.forEach((failure) => console.error(' - ' + failure));
    process.exit(1);
  }
  console.log('KEEP DATA PRESERVATION SELF-TEST OK — ' + tests.length + ' cases');
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const range = resolveRange();
const entries = changedEntries(range);
if (!entries.length) {
  console.log('KEEP DATA PRESERVATION: no changed files to inspect');
  process.exit(0);
}

const failures = [];
for (const entry of entries) {
  // The guard contains its own destructive strings as self-test fixtures.
  // Its behavior is validated separately by --self-test, so scanning this
  // file's fixture literals would create a guaranteed false positive.
  if (entry.file === 'scripts/verify-data-preservation.cjs') continue;

  if (/^supabase\/migrations\/.+\.sql$/i.test(entry.file) && !/^A/.test(entry.status)) {
    // Renumbering an accidentally duplicated migration version is safe only
    // when the exact SQL bytes are already preserved under another migration
    // filename. Any real edit/removal remains blocked.
    if (/^D/.test(entry.status) && isExactMigrationRelocation(entry.file, range)) continue;
    failures.push(entry.file + ': existing migration history is immutable; create a new additive migration');
    continue;
  }

  if (!/\.(sql|ts|tsx|js|cjs|mjs|sh|yml|yaml)$/i.test(entry.file)) continue;
  const violations = findViolations(entry.file, addedLines(range, entry.file));
  for (const violation of violations) failures.push(entry.file + ': ' + violation);
}

if (failures.length) {
  console.error('\nKEEP DATA PRESERVATION CONTRACT FAILED');
  console.error('FREE, scores, Battle results, purchases, profiles and music history are production assets.');
  failures.forEach((failure) => console.error(' - ' + failure));
  console.error('\nUse a new additive/backfill/tombstone migration. Never reset production to fit new code.');
  process.exit(1);
}

console.log('KEEP DATA PRESERVATION OK — ' + entries.length + ' changed files inspected (' + range + ')');
