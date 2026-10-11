'use strict';

// Contrat statique : node --test scripts/problem-report-evidence.test.cjs
// SQL réel facultatif : KEEP_PROBLEM_REPORT_LOCAL_SQL=1 node --test ...
// Le mode SQL crée son propre cluster temporaire, socket Unix uniquement :
// aucun DATABASE_URL/PGHOST/projet Supabase existant n'est utilisé.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const migrations = path.join(root, 'supabase/migrations');
const filename = '20261006235000_problem_report_evidence.sql';
const sql = fs.readFileSync(path.join(migrations, filename), 'utf8');
const executable = sql.replace(/--[^\n]*/g, '');
const signatures = [
  'admin_problem_reports_with_evidence(text, integer)',
  'admin_problem_report_overview()',
  'admin_problem_report_record_fix(uuid, text, text)',
  'admin_problem_report_set_status(uuid, text)',
];
function body(name) {
  const match = executable.match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`, 'i'
  ));
  assert.ok(match, `RPC ${name} présente`);
  return match[1];
}
const overview = body('admin_problem_report_overview');
const record = body('admin_problem_report_record_fix');
const setter = body('admin_problem_report_set_status');
const listing = body('admin_problem_reports_with_evidence');

test('migration additive, une colonne seulement, aucune mutation de RLS/Storage/données historiques', () => {
  assert.match(executable, /alter table public\.app_problem_reports\s+add column if not exists regression_test_path text;/i);
  assert.equal((executable.match(/alter table/gi) || []).length, 1);
  assert.equal((executable.match(/create or replace function/gi) || []).length, 4);
  assert.doesNotMatch(executable, /\b(drop|truncate|delete|insert|create table|create policy|disable row level security)\b/i);
  assert.doesNotMatch(executable, /\bstorage\.|alter policy|alter role|grant .* on table/i);
  assert.doesNotMatch(executable, /create or replace function public\.admin_problem_reports\(/i);
  // Aucun backfill : les deux UPDATE sont uniquement dans les RPC.
  assert.equal((executable.match(/update public\.app_problem_reports/gi) || []).length, 2);
});

test('chaque RPC verrouille privilèges et rôle, y compris auth.uid null / helper null', () => {
  for (const signature of signatures) {
    const name = signature.split('(')[0];
    const definition = executable.slice(executable.indexOf(`create or replace function public.${name}(`));
    assert.match(definition.split('$function$')[0], /security definer\s+set search_path to 'public'/i);
    const fn = body(name);
    assert.match(fn, /if not coalesce\(public\.admin_has_role\(auth\.uid\(\), array\['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH'\]\), false\) then/);
    assert.ok(fn.indexOf('raise exception') < fn.search(/\b(return coalesce|select|update)\b/i));
    assert.ok(executable.includes(`revoke all on function public.${signature} from public, anon;`));
    assert.ok(executable.includes(`grant execute on function public.${signature} to authenticated;`));
    if (name !== 'admin_problem_report_set_status') {
      assert.match(fn, /raise exception 'unauthorized' using errcode = '42501'/);
    }
  }
});

test('liste JSON array réutilise tous les champs/filtrage/limite de la RPC historique', () => {
  assert.match(executable, /admin_problem_reports_with_evidence\(\s*p_status text default 'NEW', p_limit integer default 200\s*\)\s*returns jsonb/i);
  assert.match(listing, /from public\.admin_problem_reports\(p_status, p_limit\) r/);
  assert.match(listing, /to_jsonb\(r\) \|\| jsonb_build_object/);
  assert.match(listing, /'fixed_in_sha', e\.fixed_in_sha/);
  assert.match(listing, /'regression_test_path', e\.regression_test_path/);
  assert.match(listing, /'[\[][\]]'::jsonb/);
});

test('overview : comptes exacts indépendants de la borne, version native et whitelist sans payload privé', () => {
  assert.equal((overview.match(/count\(\*\) filter/g) || []).length, 3);
  assert.match(overview, /status not in \('FIXED','NEEDS_UPDATE','NOT_A_BUG'\)/);
  assert.equal((overview.match(/status in \('FIXED','NEEDS_UPDATE'\)/g) || []).length, 3);
  assert.match(overview, /where r\.platform in \('ios','android'\)\s+order by r\.created_at desc, r\.id\s+limit 1/);
  assert.match(overview, /order by r\.resolved_at desc nulls last, r\.created_at desc, r\.id\s+limit 100/);
  assert.match(overview, /'fixes_limit', 100/);
  assert.doesNotMatch(overview, /\b(message|username|user_id|context|ai_note|device|os_version|notified_at)\b|to_jsonb|select\s+\*/i);
  assert.deepEqual(
    [...overview.matchAll(/'([a-z_]+)', (?:r\.|f\.|v_|100)/g)].map(m => m[1]).sort(),
    ['app_version', 'build_sha', 'platform', 'created_at', 'id', 'screen', 'status',
      'fixed_in_sha', 'regression_test_path', 'resolved_at', 'open_count', 'fixed_count',
      'documented_count', 'latest_app', 'fixes', 'fixes_limit'].sort()
  );
});

test('validation SHA/test identique dans écriture, garde FIXED et comptage documenté', () => {
  const shaPattern = '^[0-9A-Fa-f]{40}$';
  const pathPatterns = [...executable.matchAll(/~ '(\^\(packages\/[^']+)'/g)].map(m => m[1]);
  assert.equal(pathPatterns.length, 3);
  assert.equal(new Set(pathPatterns).size, 1);
  for (const fn of [overview, record, setter]) {
    assert.ok(fn.includes(shaPattern));
    assert.match(fn, /strpos\([^,]+, '\.\.'\) = 0/);
  }
  const allowed = new RegExp(pathPatterns[0]);
  const valid = value => typeof value === 'string' && !value.includes('..') && allowed.test(value);
  for (const value of [
    'packages/mobile/src/report.test.ts', 'packages/admin/a.test.tsx',
    'packages/mobile/report.test.js', 'packages/backend/report.test.cjs',
    'scripts/problem-report-evidence.test.cjs', 'scripts/nested/report.test.cjs',
    'scripts/verify-source-of-truth.cjs',
  ]) assert.ok(valid(value), value);
  for (const value of [
    null, '', '/scripts/report.test.cjs', '../scripts/report.test.cjs',
    'packages/mobile/../report.test.ts', 'packages/mobile/foo..bar.test.ts',
    'scripts//report.test.cjs', 'scripts/./report.test.cjs',
    'https://example.test/scripts/report.test.cjs', 'C:\\scripts\\report.test.cjs',
    'scripts\\report.test.cjs', 'scripts/report.test.ts', 'packages/a.spec.ts',
    'scripts/report.test.cjs\n', 'scripts/report.test.cjs?secret=x',
    'scripts/%2e%2e/report.test.cjs', 'scripts/verify-UPPER.cjs',
    'scripts/verify-.cjs', 'scripts/report.cjs', 'scripts/report.test.cjs/extra',
  ]) assert.equal(valid(value), false, String(value));
  const sha = new RegExp(shaPattern);
  for (const value of ['a'.repeat(40), 'ABCDEF0123'.repeat(4)]) assert.ok(sha.test(value));
  for (const value of ['', 'a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40), 'a'.repeat(40) + '\n']) {
    // PostgreSQL anchors are strict; JS $ also matches before final newline.
    assert.equal(value.length === 40 && sha.test(value), false);
  }
});

test('record_fix ne crée pas de rapport ; ancien setter préserve contrat et preuves NEW/SEEN', () => {
  assert.match(record, /set status = 'FIXED', resolved_at = now\(\),\s+fixed_in_sha = lower\(p_sha\), regression_test_path = p_test\s+where id = p_id;\s+return found;/);
  assert.match(record, /INVALID_FIX_SHA/);
  assert.match(record, /INVALID_REGRESSION_TEST_PATH/);
  assert.match(setter, /if p_status not in \('NEW','SEEN','FIXED'\) then raise exception 'INVALID_STATUS'/);
  assert.match(setter, /where r\.id = p_id for update/);
  assert.match(setter, /if not found then return false/);
  assert.match(setter, /FIX_EVIDENCE_REQUIRED/);
  assert.match(setter, /resolved_at = case when p_status = 'FIXED' then now\(\) else null end/);
  assert.doesNotMatch(setter, /set[\s\S]*fixed_in_sha\s*=|set[\s\S]*regression_test_path\s*=/);
  assert.match(setter, /return found;/);
});

test('SQL local isolé : idempotence, RLS, guards, formes JSON, preuves et persistance', {
  skip: process.env.KEEP_PROBLEM_REPORT_LOCAL_SQL !== '1'
    ? 'Contrat statique uniquement ; SQL local non demandé (aucun accès production).' : false,
}, () => {
  const bin = process.env.KEEP_LOCAL_PG_BIN || '/usr/lib/postgresql/16/bin';
  for (const name of ['initdb', 'pg_ctl', 'psql']) {
    assert.ok(fs.existsSync(path.join(bin, name)), `${name} local requis ; aucun fallback réseau`);
  }
  assert.notEqual(process.getuid?.(), 0, 'initdb exige un utilisateur local non root');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-report-evidence-'));
  const data = path.join(temp, 'data');
  const port = '55439'; // Socket unique par mkdtemp ; pas de listener TCP.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  const run = (name, args, input) => execFileSync(path.join(bin, name), args, {
    env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  const query = input => run('psql', [
    '-X', '-h', temp, '-p', port, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q',
  ], input).trim();
  const value = input => JSON.parse(query(input));
  const uid = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';
  const id = '33333333-3333-3333-3333-333333333333';
  const absent = '99999999-9999-9999-9999-999999999999';
  const quote = text => text === null ? 'null' : `'${text.replaceAll("'", "''")}'`;
  const asAdmin = input => `set role authenticated; set request.jwt.claim.sub = '${uid}'; ${input}`;
  const fails = (input, expected) => {
    assert.throws(() => query(input), error => String(error.stderr).includes(expected), input);
  };
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'),
      '-o', `-k ${temp} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    query(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.admin_users(id uuid primary key, is_active boolean, role text);
      create function public.admin_has_role(p_uid uuid, p_roles text[])
      returns boolean language sql security definer set search_path = public, auth as $$
        select exists(select 1 from public.admin_users
          where id = p_uid and is_active = true and role = any(p_roles))
      $$;
      grant usage on schema public, auth to authenticated, anon;
      insert into public.admin_users values ('${uid}', true, 'ADMIN');
    `);
    for (const file of [
      '20261005200000_app_problem_reports.sql', '20261006100000_problem_report_loop.sql',
      '20261006230000_admin_problem_reports.sql', filename, filename,
    ]) query(fs.readFileSync(path.join(migrations, file), 'utf8'));
    query('grant select, insert on public.app_problem_reports to authenticated;');
    assert.deepEqual(value(asAdmin('select public.admin_problem_report_overview();')), {
      open_count: 0, fixed_count: 0, documented_count: 0, latest_app: null, fixes: [], fixes_limit: 100,
    });
    assert.deepEqual(value(asAdmin('select public.admin_problem_reports_with_evidence();')), []);
    const calls = [
      'admin_problem_reports_with_evidence()', 'admin_problem_report_overview()',
      `admin_problem_report_record_fix('${id}', '${'a'.repeat(40)}', 'scripts/a.test.cjs')`,
      `admin_problem_report_set_status('${id}', 'SEEN')`,
    ];
    for (const [index, call] of calls.entries()) {
      const error = index === 3 ? 'ADMIN_ROLE_REQUIRED' : 'unauthorized';
      fails(`set role authenticated; select public.${call};`, error);
      fails(`set role authenticated; set request.jwt.claim.sub = '${other}'; select public.${call};`, error);
      fails(`set role anon; select public.${call};`, 'permission denied');
      query(`update public.admin_users set is_active = false where id = '${uid}';`);
      fails(asAdmin(`select public.${call};`), error);
      query(`update public.admin_users set is_active = true, role = 'USER' where id = '${uid}';`);
      fails(asAdmin(`select public.${call};`), error);
      query(`update public.admin_users set role = 'ADMIN' where id = '${uid}';`);
    }
    // Vérifier les cinq rôles, pas seulement ADMIN.
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT', 'TECH']) {
      query(`update public.admin_users set role = '${role}' where id = '${uid}';`);
      for (const call of calls) query(asAdmin(`select public.${call};`));
    }
    // RLS historique : lecture/insertion own, aucune permission UPDATE utilisateur.
    query(asAdmin(`insert into public.app_problem_reports(id, message, screen)
      values ('${id}', 'payload privé', 'Settings');`));
    query(`set role authenticated; set request.jwt.claim.sub = '${other}';
      insert into public.app_problem_reports(message) values ('autre utilisateur');`);
    assert.equal(query(asAdmin('select count(*) from public.app_problem_reports;')), '1');
    fails(asAdmin(`insert into public.app_problem_reports(user_id, message)
      values ('${other}', 'ownership interdit');`), 'row-level security');
    fails(asAdmin(`update public.app_problem_reports set status = 'FIXED' where id = '${id}';`), 'permission denied');
    fails(asAdmin(`select public.admin_problem_report_set_status('${id}', 'FIXED');`), 'FIX_EVIDENCE_REQUIRED');
    assert.equal(query(asAdmin(`select public.admin_problem_report_set_status('${absent}', 'FIXED');`)), 'f');
    assert.equal(query(asAdmin(`select public.admin_problem_report_record_fix('${absent}',
      '${'a'.repeat(40)}', 'scripts/a.test.cjs');`)), 'f');
    for (const sha of [null, '', 'abc1234', 'a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40), 'a'.repeat(40) + '\n']) {
      fails(asAdmin(`select public.admin_problem_report_record_fix('${id}', ${quote(sha)}, 'scripts/a.test.cjs');`), 'INVALID_FIX_SHA');
    }
    for (const file of [
      null, '', '../scripts/a.test.cjs', '/scripts/a.test.cjs', 'https://example.test/a.test.cjs',
      'scripts/../a.test.cjs', 'scripts/a..b.test.cjs', 'scripts/a.test.ts',
      'scripts//a.test.cjs', 'scripts/./a.test.cjs', 'scripts/a.test.cjs\n',
      'C:\\scripts\\a.test.cjs', 'scripts/%2e%2e/a.test.cjs', 'scripts/verify-UPPER.cjs',
    ]) fails(asAdmin(`select public.admin_problem_report_record_fix('${id}',
      '${'a'.repeat(40)}', ${quote(file)});`), 'INVALID_REGRESSION_TEST_PATH');
    for (const file of [
      'packages/mobile/a.test.ts', 'packages/admin/src/a.test.tsx',
      'packages/mobile/a.test.js', 'packages/backend/a.test.cjs',
      'scripts/a.test.cjs', 'scripts/sub/a.test.cjs', 'scripts/verify-report.cjs',
    ]) {
      assert.equal(query(asAdmin(`select public.admin_problem_report_record_fix('${id}',
        '${'A'.repeat(40)}', '${file}');`)), 't');
      const evidence = value(queryRow());
      assert.equal(evidence.fixed_in_sha, 'a'.repeat(40));
      assert.equal(evidence.regression_test_path, file);
      assert.equal(evidence.status, 'FIXED');
      assert.ok(evidence.resolved_at);
    }
    function queryRow() {
      return `select jsonb_build_object('status', status, 'fixed_in_sha', fixed_in_sha,
        'regression_test_path', regression_test_path, 'resolved_at', resolved_at)
        from public.app_problem_reports where id = '${id}';`;
    }
    for (const status of ['SEEN', 'NEW']) {
      assert.equal(query(asAdmin(`select public.admin_problem_report_set_status('${id}', '${status}');`)), 't');
      const row = value(queryRow());
      assert.equal(row.status, status);
      assert.equal(row.resolved_at, null);
      assert.equal(row.fixed_in_sha, 'a'.repeat(40));
      assert.equal(row.regression_test_path, 'scripts/verify-report.cjs');
    }
    assert.equal(query(asAdmin(`select public.admin_problem_report_set_status('${id}', 'FIXED');`)), 't');
    fails(asAdmin(`select public.admin_problem_report_set_status('${id}', 'NEEDS_UPDATE');`), 'INVALID_STATUS');
    // SHA seul / test seul / chemin invalide : le setter lit et valide la DB.
    for (const [sha, file] of [
      ['a'.repeat(40), null], [null, 'scripts/a.test.cjs'],
      ['short', 'scripts/a.test.cjs'], ['a'.repeat(40), 'scripts/../a.test.cjs'],
    ]) {
      query(`update public.app_problem_reports set fixed_in_sha = ${quote(sha)},
        regression_test_path = ${quote(file)} where id = '${id}';`);
      fails(asAdmin(`select public.admin_problem_report_set_status('${id}', 'FIXED');`), 'FIX_EVIDENCE_REQUIRED');
    }
    query(asAdmin(`select public.admin_problem_report_record_fix('${id}',
      '${'a'.repeat(40)}', 'scripts/problem-report-evidence.test.cjs');`));
    // Counts >100, fixes non documentés conservés, dernier rapport web exclu.
    query(`
      insert into public.app_problem_reports(user_id, message, status, fixed_in_sha,
        regression_test_path, resolved_at, created_at)
      select '${other}', 'secret fixture', 'NEEDS_UPDATE', '${'b'.repeat(40)}',
        'packages/mobile/a.test.ts', '2026-10-01'::timestamptz + n * interval '1 minute',
        '2026-09-01'::timestamptz from generate_series(1, 105) n;
      insert into public.app_problem_reports(user_id, message, status, fixed_in_sha, regression_test_path)
      values ('${other}', 'secret fixture', 'FIXED', 'short', 'scripts/a.test.cjs'),
             ('${other}', 'secret fixture', 'FIXED', '${'a'.repeat(40)}', 'scripts/../a.test.cjs'),
             ('${other}', 'secret fixture', 'NEEDS_UPDATE', null, null),
             ('${other}', 'secret fixture', 'NOT_A_BUG', null, null),
             ('${other}', 'secret fixture', 'SEEN', null, null),
             ('${other}', 'secret fixture', 'CUSTOM_OPEN', null, null);
      insert into public.app_problem_reports(user_id, message, platform, app_version, build_sha, created_at)
      values ('${other}', 'secret fixture', 'android', '1.0', 'android-sha', '2030-01-01'),
             ('${other}', 'secret fixture', 'ios', '2.0', 'ios-sha', '2030-01-02'),
             ('${other}', 'secret fixture', 'web', '3.0', 'web-sha', '2030-01-03');
    `);
    const summary = value(asAdmin('select public.admin_problem_report_overview();'));
    assert.equal(summary.open_count, 6); // autre NEW + SEEN + CUSTOM_OPEN + 3 versions
    assert.equal(summary.fixed_count, 109);
    assert.equal(summary.documented_count, 106);
    assert.equal(summary.fixes.length, 100);
    assert.equal(summary.fixes_limit, 100);
    assert.equal(summary.latest_app.platform, 'ios');
    assert.equal(summary.latest_app.app_version, '2.0');
    assert.equal(summary.latest_app.build_sha, 'ios-sha');
    assert.deepEqual(Object.keys(summary.latest_app).sort(), ['app_version', 'build_sha', 'created_at', 'platform']);
    assert.deepEqual(Object.keys(summary).sort(), [
      'documented_count', 'fixed_count', 'fixes', 'fixes_limit', 'latest_app', 'open_count',
    ]);
    for (const fix of summary.fixes) assert.deepEqual(Object.keys(fix).sort(), [
      'fixed_in_sha', 'id', 'regression_test_path', 'resolved_at', 'screen', 'status',
    ]);
    assert.ok(summary.fixes.some(fix => fix.id === id));
    assert.doesNotMatch(JSON.stringify(summary), /secret fixture|payload privé|message|username|user_id|context|ai_note/);
    for (const status of ["'ALL'", 'null', "'NEW'", "'FIXED'", "'UNKNOWN'"]) {
      for (const limit of ['null', '0', '-1', '2', '200', '1000']) {
        const legacy = value(asAdmin(`select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id),
          '[]'::jsonb) from public.admin_problem_reports(${status}, ${limit}) r;`));
        const evidence = value(asAdmin(`select public.admin_problem_reports_with_evidence(${status}, ${limit});`));
        assert.deepEqual(evidence.map(({ fixed_in_sha, regression_test_path, ...old }) => old), legacy);
        for (const row of evidence) {
          assert.ok(Object.hasOwn(row, 'fixed_in_sha'));
          assert.ok(Object.hasOwn(row, 'regression_test_path'));
        }
      }
    }
    // Chaque query utilise une nouvelle connexion : preuve de persistance/rechargement.
    const before = value(queryRow());
    query(sql); // Réapplication avec données : aucune preuve/donnée perdue.
    assert.deepEqual(value(queryRow()), before);
    assert.deepEqual(value(asAdmin('select public.admin_problem_report_overview();')), summary);
  } finally {
    try {
      if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true }); // Seulement notre cluster fixture.
    }
  }
});
