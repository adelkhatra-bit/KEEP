'use strict';

// node --test scripts/admin-music-overview.test.cjs
// KEEP_ADMIN_MUSIC_LOCAL_SQL=1 node --test scripts/admin-music-overview.test.cjs
// Cluster PostgreSQL 16 jetable, socket Unix seulement, sans accès production.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const migrations = path.join(root, 'supabase/migrations');
const read = filename => fs.readFileSync(path.join(migrations, filename), 'utf8');
const sql = read('20261008110000_admin_music_overview.sql');
const executable = sql.replace(/--[^\n]*/g, '');
const signature = 'public.admin_music_overview()';
const sources = {
  profiles: '0001_core_identity.sql',
  admin_users: '0005_admin.sql',
  tracks: '0002_music.sql',
  profile_music_taste_scores: '20261001204000_adaptive_music_taste_learning.sql',
  keep_track_first_discoveries: '20260928003000_immutable_first_music_discoverer.sql',
  music_library_items: '20260829001500_music_library_import_items.sql',
  profile_loki_pulse_events: '20261001183000_loki_pulse_personalized_music_rail.sql',
  keep_world_catalog_expansion_queue: '20261001233000_world_catalog_demand_expansion.sql',
};

// Exécuter les vraies déclarations évite des fixtures aux colonnes inventées.
function tableDefinition(name) {
  const match = read(sources[name]).match(new RegExp(
    `create table if not exists (?:public\\.)?${name}\\s*\\([\\s\\S]*?\\n\\);`, 'i'
  ));
  assert.ok(match, `Déclaration originale de ${name}`);
  return match[0];
}

function functionDefinition(filename, name, delimiter) {
  const source = read(filename);
  const start = source.search(new RegExp(`create or replace function public\\.${name}\\(`, 'i'));
  assert.ok(start >= 0, `Déclaration originale de ${name}`);
  const bodyStart = source.indexOf(delimiter, start);
  const end = source.indexOf(`${delimiter};`, bodyStart + delimiter.length);
  assert.ok(bodyStart >= 0 && end > bodyStart);
  return source.slice(start, end + delimiter.length + 1);
}

test('migration lecture seule : une seule RPC, aucune table ni écriture de données', () => {
  assert.equal((executable.match(/create or replace function/gi) || []).length, 1);
  assert.doesNotMatch(executable, /\b(insert|update|delete|truncate|drop|alter|create table|create policy)\b/i);
  assert.doesNotMatch(executable, /\b(perform|call)\b|select\s+(?:\*\s+from\s+)?public\.keep_loki_pulse\s*\(/i);
  assert.match(executable, /language plpgsql\s+stable security definer\s+set search_path to ''/i);
});

test('guard et privilèges : SUPER_ADMIN ADMIN TECH seulement, défaut refusé', () => {
  assert.match(executable, /if not coalesce\(public\.admin_has_role\(auth\.uid\(\), array\['SUPER_ADMIN','ADMIN','TECH'\]\), false\) then/);
  assert.match(executable, /raise exception 'unauthorized' using errcode = '42501'/);
  assert.ok(executable.indexOf('raise exception') < executable.indexOf('with real_profiles'));
  assert.match(executable, /revoke all on function public\.admin_music_overview\(\) from public, anon;/);
  assert.match(executable, /grant execute on function public\.admin_music_overview\(\) to authenticated;/);
});

test('agrégats utilisent les sources canoniques, pas les copies ou un compteur approximatif', () => {
  for (const name of Object.keys(sources).filter(name => name !== 'admin_users')) {
    assert.match(executable, new RegExp(`public\\.${name}\\b`), name);
    tableDefinition(name);
  }
  assert.match(executable, /not public\.keep_is_test_profile\(p\.id\)/);
  assert.match(executable, /s\.taste_type = 'GENRE' and s\.score > 0/);
  assert.match(executable, /i\.removed_at is null/);
  assert.match(executable, /e\.last_shown_at > e\.first_shown_at/);
  assert.match(executable, /nullif\(p\.pairs, 0\)/);
  assert.doesNotMatch(executable, /\bkeep_decisions\b|\bpg_class\b|\breltuples\b/);
});

test('latence technique : extension réelle facultative, aucune sonde RPC mutante', () => {
  assert.match(executable, /pg_catalog\.pg_extension/);
  assert.match(executable, /e\.extname = 'pg_stat_statements'/);
  assert.match(executable, /sum\(total_exec_time\) \/ nullif\(sum\(calls\), 0\)/);
  assert.match(executable, /from %I\.pg_stat_statements/);
  assert.match(executable, /dbid = \(select oid from pg_catalog\.pg_database where datname = current_database\(\)\)/);
  assert.match(executable, /object_not_in_prerequisite_state or undefined_table or insufficient_privilege/);
  assert.match(executable, /v_latency := null/);
  assert.doesNotMatch(executable, /coalesce\(v_latency,\s*0\)/);
});

test('PostgreSQL 16 local isolé : agrégats, autorisations, idempotence et lecture seule', {
  skip: process.env.KEEP_ADMIN_MUSIC_LOCAL_SQL !== '1'
    ? 'SQL local non demandé ; aucun accès production.' : false,
}, async t => {
  const bin = '/usr/lib/postgresql/16/bin';
  for (const name of ['initdb', 'pg_ctl', 'psql']) {
    assert.ok(fs.existsSync(path.join(bin, name)), `${name} local requis ; aucun fallback réseau`);
  }
  assert.notEqual(process.getuid?.(), 0, 'initdb exige un utilisateur local non root');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-admin-music-pg-'));
  const data = path.join(scratch, 'data');
  const port = '55441';
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('PG') || key === 'DATABASE_URL') delete env[key];
  }
  env.TMPDIR = scratch;
  const run = (name, args, input) => execFileSync(path.join(bin, name), args, {
    env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  const query = input => run('psql', [
    '-X', '-h', scratch, '-p', port, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q',
  ], input).trim();
  const value = input => JSON.parse(query(input));
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const admin = uuid(1);
  const quote = text => `'${text.replaceAll("'", "''")}'`;
  const asAdmin = input => `set role authenticated;
    set request.jwt.claim.sub = '${admin}'; ${input}`;
  const overview = () => value(asAdmin(`select ${signature};`));
  const withoutTime = ({ observedAt, ...summary }) => {
    assert.ok(Number.isFinite(Date.parse(observedAt)), 'Horodatage serveur réel');
    return summary;
  };
  const fails = (input, expected) => {
    assert.throws(() => query(input), error => String(error.stderr).includes(expected), input);
  };
  const tableState = () => Object.fromEntries(
    ['auth.users', ...Object.keys(sources).map(name => `public.${name}`)].map(name => [
      name, value(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb)
        from ${name} r;`),
    ])
  );
  const catalogState = () => value(`select coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', c.relname, 'kind', c.relkind,
      'rls', c.relrowsecurity, 'acl', c.relacl::text) order by n.nspname, c.relname), '[]'::jsonb)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public','auth') and c.relkind in ('r','p','S');`);
  const extensionAvailable = fs.existsSync('/usr/share/postgresql/16/extension/pg_stat_statements.control');
  let started = false;
  let populatedSummary;
  try {
    run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', data, '-l', path.join(scratch, 'postgres.log'),
      '-o', `-k ${scratch} -p ${port} -c listen_addresses=''` +
        (extensionAvailable ? ' -c shared_preload_libraries=pg_stat_statements' : ''),
      '-w', 'start']);
    started = true;
    assert.equal(query('show server_version_num;').slice(0, 2), '16');
    assert.equal(query('show listen_addresses;'), '');
    query(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema public, auth to authenticated, anon;
      ${read('0001_core_identity.sql').match(/create type [^\n]+;/g).join('\n')}
      ${read('0005_admin.sql').match(/create type admin_role[^\n]+;/)[0]}
      ${Object.keys(sources).map(tableDefinition).join('\n')}
      ${read('20261001173000_unified_test_mode_access.sql').match(
        /alter table public\.profiles\s+add column if not exists test_mode_enabled boolean not null default false;/i
      )[0]}
      ${functionDefinition('20260901000000_admin_role_scoped_flags_and_support.sql', 'admin_has_role', '$$')}
      ${functionDefinition('20261007040000_taste_signals_test_profiles_catalog_cron.sql', 'keep_is_test_profile', '$function$')}
      revoke all on function public.keep_is_test_profile(uuid) from public, anon, authenticated;
      grant execute on function public.keep_is_test_profile(uuid) to service_role;
      insert into auth.users values ('${admin}', 'admin@loki.test');
      insert into public.profiles(id, username) values ('${admin}', 'admin');
      insert into public.admin_users(id, role) values ('${admin}', 'ADMIN');
    `);
    // Pas de grants sur les tables : seul SECURITY DEFINER peut lire les fixtures.
    for (const name of Object.keys(sources)) {
      query(`alter table public.${name} enable row level security;
        revoke all on public.${name} from anon, authenticated;`);
    }

    await t.test('migration répétable, aucun changement de tables/données/RLS', () => {
      const tables = catalogState();
      const rows = tableState();
      query(sql);
      query(sql);
      assert.deepEqual(catalogState(), tables);
      assert.deepEqual(tableState(), rows);
    });

    await t.test('vide : zéros réels, listes vides, répétition et latence indisponibles null', () => {
      assert.deepEqual(withoutTime(overview()), {
        catalog: { total: 0, added24h: 0, added7d: 0 },
        queue: { pending: 0, processing: 0 },
        styles: [], discoverers: [], platforms: [],
        pulse: { pairs: 0, repeated: 0, repeatPercent: null },
        pulseLatencyMs: null,
      });
    });

    await t.test('pg_proc, ACL réelle et isolation des tables', () => {
      const properties = value(`select jsonb_build_object('definer', p.prosecdef,
        'volatility', p.provolatile, 'config', p.proconfig) from pg_catalog.pg_proc p
        where p.oid = '${signature}'::regprocedure;`);
      assert.equal(properties.definer, true);
      assert.equal(properties.volatility, 's');
      assert.deepEqual(properties.config, ['search_path=""']);
      assert.equal(query(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`), 't');
      assert.equal(query(`select has_function_privilege('anon', '${signature}', 'EXECUTE');`), 'f');
      assert.equal(query(`select count(*) from pg_catalog.pg_proc p,
        lateral aclexplode(p.proacl) a where p.oid = '${signature}'::regprocedure
        and a.grantee = 0 and a.privilege_type = 'EXECUTE';`), '0');
      for (const name of Object.keys(sources)) {
        fails(asAdmin(`select * from public.${name};`), 'permission denied');
      }
      fails(asAdmin(`select public.keep_is_test_profile('${admin}');`), 'permission denied');
    });

    await t.test('SUPER_ADMIN ADMIN TECH acceptés ; SUPPORT/autres/inactif/sans identité refusés', () => {
      for (const role of ['SUPER_ADMIN', 'ADMIN', 'TECH']) {
        query(`update public.admin_users set role = '${role}' where id = '${admin}';`);
        overview();
      }
      for (const role of ['SUPPORT', 'FINANCE', 'MARKETING', 'MODERATOR']) {
        query(`update public.admin_users set role = '${role}' where id = '${admin}';`);
        fails(asAdmin(`select ${signature};`), 'unauthorized');
      }
      query(`update public.admin_users set role = 'ADMIN', is_active = false where id = '${admin}';`);
      fails(asAdmin(`select ${signature};`), 'unauthorized');
      query(`update public.admin_users set is_active = true where id = '${admin}';`);
      fails(`set role authenticated; select ${signature};`, 'unauthorized');
      fails(`set role authenticated; set request.jwt.claim.sub = ''; select ${signature};`, 'unauthorized');
      fails(`set role authenticated; set request.jwt.claim.sub = '${uuid(999)}'; select ${signature};`, 'unauthorized');
      fails(`set role anon; set request.jwt.claim.sub = '${admin}'; select ${signature};`, 'permission denied');
      // Un helper qui renvoie NULL ne doit jamais ouvrir le garde.
      const helper = functionDefinition('20260901000000_admin_role_scoped_flags_and_support.sql', 'admin_has_role', '$$');
      try {
        query(`create or replace function public.admin_has_role(p_uid uuid, p_roles text[])
          returns boolean language sql security definer set search_path = public, auth
          as $$ select null::boolean $$;`);
        fails(asAdmin(`select ${signature};`), 'unauthorized');
      } finally {
        query(helper);
      }
    });

    await t.test('fenêtres SQL exactes 24h/7j avec bornes inclusives et file PENDING RETRY PROCESSING DONE', () => {
      const boundary = value(`begin;
        insert into public.tracks(id, title, artist, created_at) values
          ('${uuid(101)}', 'récent', 'fixture', now() - interval '1 hour'),
          ('${uuid(102)}', '24h exact', 'fixture', now() - interval '24 hours'),
          ('${uuid(103)}', '24h dépassé', 'fixture', now() - interval '24 hours 1 second'),
          ('${uuid(104)}', '7j exact', 'fixture', now() - interval '7 days'),
          ('${uuid(105)}', '7j dépassé', 'fixture', now() - interval '7 days 1 second');
        ${asAdmin(`select ${signature};`)}
        rollback;`);
      assert.deepEqual(boundary.catalog, { total: 5, added24h: 2, added7d: 4 });
      query(`insert into public.tracks(id, title, artist, created_at)
        select ('00000000-0000-0000-0000-' || lpad((100 + n)::text, 12, '0'))::uuid,
          'fixture ' || n, 'fixture', now() - case
            when n <= 3 then interval '1 hour'
            when n <= 8 then interval '2 days' else interval '8 days' end
        from generate_series(1, 20) n;
        insert into public.keep_world_catalog_expansion_queue(seed_key, query, status, next_attempt_at)
        select 'seed-' || n, 'fixture', status, now() + interval '1 day'
        from unnest(array['PENDING','PENDING','RETRY','RETRY','RETRY','PROCESSING','PROCESSING','DONE']) with ordinality q(status,n);`);
      assert.deepEqual(overview().catalog, { total: 20, added24h: 3, added7d: 8 });
      assert.deepEqual(overview().queue, { pending: 5, processing: 2 });
    });

    const realProfiles = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const testEmails = [null, 'fixture@KEEP.LOCAL', 'fixture@mailinator.com',
      'fixture@example.com', 'claude-fixture@loki.test', 'fixture@loki.test'];
    query(realProfiles.map(n => `insert into auth.users values ('${uuid(n)}', 'real-${n}@loki.test');
      insert into public.profiles(id, username) values ('${uuid(n)}', 'real-${n}');`).join('\n'));
    query(testEmails.map((email, i) => `insert into auth.users values
      ('${uuid(50 + i)}', ${email === null ? 'null' : quote(email)});
      insert into public.profiles(id, username, test_mode_enabled)
      values ('${uuid(50 + i)}', 'test-${i}', ${i === 5});`).join('\n'));

    await t.test('vraie fonction de filtrage : mode test et tous les domaines/identités réservés', () => {
      for (const n of [1, ...realProfiles]) {
        assert.equal(query(`select public.keep_is_test_profile('${uuid(n)}');`), 'f');
      }
      for (let i = 0; i < testEmails.length; i++) {
        assert.equal(query(`select public.keep_is_test_profile('${uuid(50 + i)}');`), 't');
      }
      // Un profil absent ne devient pas arbitrairement un profil de test.
      assert.equal(query(`select public.keep_is_test_profile('${uuid(999)}');`), 'f');
    });

    await t.test('top 10 genres : agrégation par clé, profils puis scores puis clé, ARTIST/score≤0 exclus', () => {
      query(`insert into public.profile_music_taste_scores(profile_id, taste_type, taste_key, display_label, score)
        values
          ('${uuid(2)}','GENRE','shared','Zulu',2),
          ('${uuid(3)}','GENRE','shared','Alpha',3),
          ('${uuid(2)}','ARTIST','artist-not-genre','Artiste',9999),
          ('${uuid(2)}','GENRE','zero','Zero',0),
          ('${uuid(2)}','GENRE','negative','Négatif',-3),
          ('${uuid(4)}','GENRE','shared','Ignoré',-100);
        insert into public.profile_music_taste_scores(profile_id, taste_type, taste_key, display_label, score)
        select '${uuid(2)}', 'GENRE', 'genre-' || lpad(n::text,2,'0'), 'Genre ' || n,
          case when n in (1,2) then 100 else 100 - n end from generate_series(1,12) n;`);
      const styles = overview().styles;
      assert.equal(styles.length, 10);
      assert.deepEqual(styles[0], { key: 'shared', label: 'Alpha', profiles: 2, score: 5 });
      assert.deepEqual(styles.slice(1).map(s => s.key),
        Array.from({ length: 9 }, (_, i) => `genre-${String(i + 1).padStart(2, '0')}`));
      assert.deepEqual(styles.slice(1).map(s => s.score), [100, 100, 97, 96, 95, 94, 93, 92, 91]);
      assert.ok(styles.slice(1).every(s => s.profiles === 1));
    });

    await t.test('classement top 10 : attribution première découverte, jamais propriétaire des copies', () => {
      query(`insert into public.keep_track_first_discoveries(track_id, profile_id, discovered_at)
        select ('00000000-0000-0000-0000-' || lpad((100 + n)::text,12,'0'))::uuid,
          case when n <= 3 then '${uuid(2)}'::uuid when n <= 5 then '${uuid(3)}'::uuid
          else ('00000000-0000-0000-0000-' || lpad((n - 2)::text,12,'0'))::uuid end,
          now() - interval '30 days' from generate_series(1,15) n;
        insert into public.music_library_items(profile_id,provider,provider_track_id,track_id,title,artist)
        select '${uuid(13)}', 'spotify', 'copy-' || n,
          ('00000000-0000-0000-0000-' || lpad((100 + n)::text,12,'0'))::uuid,
          'copie', 'fixture' from generate_series(1,3) n;`);
      const ranks = overview().discoverers;
      assert.equal(ranks.length, 10);
      assert.deepEqual(ranks[0], { id: uuid(2), username: 'real-2', tracks: 3 });
      assert.deepEqual(ranks[1], { id: uuid(3), username: 'real-3', tracks: 2 });
      assert.deepEqual(ranks.slice(2).map(d => d.id), [4,5,6,7,8,9,10,11].map(uuid));
      assert.ok(!ranks.some(d => d.id === uuid(13)), 'Copier ne donne pas la première découverte');
      const first = value(`select to_jsonb(d) from public.keep_track_first_discoveries d where track_id = '${uuid(101)}';`);
      query(`insert into public.keep_track_first_discoveries(track_id, profile_id)
        values ('${uuid(101)}','${uuid(13)}') on conflict(track_id) do nothing;`);
      overview();
      assert.deepEqual(value(`select to_jsonb(d) from public.keep_track_first_discoveries d
        where track_id = '${uuid(101)}';`), first);
    });

    await t.test('bibliothèques : items actifs par provider, pas comptes ni liens, suppression exclue', () => {
      query(`insert into public.music_library_items(profile_id,provider,provider_track_id,title,artist,removed_at,visibility)
        values
          ('${uuid(2)}','apple_music','apple-1','fixture','fixture',null,'PRIVATE'),
          ('${uuid(3)}','apple_music','apple-2','fixture','fixture',null,'PUBLIC'),
          ('${uuid(2)}','deezer','deezer-1','fixture','fixture',null,'FOLLOWERS'),
          ('${uuid(3)}','youtube_music','youtube-1','fixture','fixture',null,'PRIVATE'),
          ('${uuid(2)}','spotify','removed','fixture','fixture',now(),'PUBLIC');`);
      assert.deepEqual(overview().platforms, [
        { provider: 'spotify', items: 3 }, { provider: 'apple_music', items: 2 },
        { provider: 'deezer', items: 1 }, { provider: 'youtube_music', items: 1 },
      ]);
    });

    await t.test('répétition : couples profil/titre, arrondi réel et égalité non répétée, pas filtre temporel', () => {
      query(`insert into public.profile_loki_pulse_events(profile_id,track_id,first_shown_at,last_shown_at,hidden_at,kept_at)
        values
          ('${uuid(2)}','${uuid(101)}',now()-interval '1 hour',now(),null,null),
          ('${uuid(3)}','${uuid(101)}',now(),now(),null,null),
          ('${uuid(2)}','${uuid(102)}',now()-interval '40 days',now()-interval '30 days',now(),now()),
          ('${uuid(2)}','${uuid(103)}',now(),now(),null,null),
          ('${uuid(3)}','${uuid(102)}',now(),now(),null,null),
          ('${uuid(4)}','${uuid(101)}',now(),now(),null,null);`);
      assert.deepEqual(overview().pulse, { pairs: 6, repeated: 2, repeatPercent: 33.3 });
    });

    await t.test('profils test exclus de chaque métrique utilisateur sans cacher le catalogue global', () => {
      const before = withoutTime(overview());
      query(testEmails.map((_, i) => `
        insert into public.profile_music_taste_scores(profile_id,taste_type,taste_key,display_label,score)
        values ('${uuid(50+i)}','GENRE','test-only','Test',99999),
          ('${uuid(50+i)}','GENRE','shared','Test shared',99999);
        insert into public.keep_track_first_discoveries(track_id,profile_id)
        values ('${uuid(116+i)}','${uuid(50+i)}');
        insert into public.music_library_items(profile_id,provider,provider_track_id,title,artist)
        values ('${uuid(50+i)}','tidal','test-${i}','Test','Test');
        insert into public.profile_loki_pulse_events(profile_id,track_id,first_shown_at,last_shown_at)
        values ('${uuid(50+i)}','${uuid(101)}',now()-interval '1 day',now());`).join('\n'));
      assert.deepEqual(withoutTime(overview()), before);
      populatedSummary = before;
    });

    await t.test('rechargement/idempotence avec données : aucune mutation ni nouvelle table, transaction READ ONLY', () => {
      const rows = tableState();
      const tables = catalogState();
      query(sql);
      query(sql);
      assert.deepEqual(withoutTime(overview()), populatedSummary);
      const readonly = value(asAdmin(`begin read only; select ${signature}; commit;`));
      assert.deepEqual(withoutTime(readonly), populatedSummary);
      assert.deepEqual(tableState(), rows);
      assert.deepEqual(catalogState(), tables);
    });

    await t.test('pg_stat_statements réel : mesure locale non mutante, aucune invocation par overview', {
      skip: !extensionAvailable ? 'Extension pg_stat_statements non installée localement.' : false,
    }, () => {
      query(`create schema local_metrics;
        create extension pg_stat_statements with schema local_metrics;
        create function public.keep_loki_pulse(p_limit integer default 14)
        returns integer language plpgsql as $$
        begin perform pg_sleep(0.025); return p_limit; end $$;
        select local_metrics.pg_stat_statements_reset();`);
      assert.equal(overview().pulseLatencyMs, null, 'Pas de mesure = indisponible, jamais zéro');
      // Fixture locale lecture seule : ne jamais appeler le vrai Loki Pulse de production.
      query('select public.keep_loki_pulse(14);');
      const calls = () => Number(query(`select coalesce(sum(calls),0)
        from local_metrics.pg_stat_statements where query ~ '\\mkeep_loki_pulse\\s*\\(';`));
      const expected = Number(query(`select round((sum(total_exec_time)/nullif(sum(calls),0))::numeric,1)
        from local_metrics.pg_stat_statements
        where dbid = (select oid from pg_catalog.pg_database where datname = current_database())
        and query ~ '\\mkeep_loki_pulse\\s*\\(';`));
      const beforeCalls = calls();
      assert.equal(beforeCalls, 1);
      assert.ok(expected >= 20, 'La mesure provient du vrai moteur PostgreSQL');
      const rows = tableState();
      assert.equal(overview().pulseLatencyMs, expected);
      assert.equal(overview().pulseLatencyMs, expected);
      assert.equal(calls(), beforeCalls, 'Le tableau de bord ne lance aucune sonde Loki Pulse');
      assert.deepEqual(tableState(), rows);
      // PostgREST quote le schéma, le nom RPC et ses arguments nommés.
      query('select local_metrics.pg_stat_statements_reset();');
      query('select "public"."keep_loki_pulse"("p_limit" := 14);');
      const quotedStats = value(`select jsonb_build_object(
          'calls', sum(calls),
          'latency', round((sum(total_exec_time)/nullif(sum(calls),0))::numeric,1))
        from local_metrics.pg_stat_statements
        where query like 'select "public"."keep_loki_pulse"(%';`);
      assert.equal(quotedStats.calls, 1, 'Requête PostgREST quotée réellement enregistrée');
      assert.ok(quotedStats.latency >= 20);
      assert.equal(overview().pulseLatencyMs, quotedStats.latency,
        'La latence doit reconnaître les noms RPC quotés de PostgREST');
      const quotedCalls = query(`select sum(calls) from local_metrics.pg_stat_statements
        where query like 'select "public"."keep_loki_pulse"(%';`);
      assert.equal(quotedCalls, '1', 'Overview ne doit pas relancer la RPC quotée');
      assert.deepEqual(tableState(), rows);
      query('drop extension pg_stat_statements;');
      assert.equal(overview().pulseLatencyMs, null);
    });
  } finally {
    try {
      if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
});
