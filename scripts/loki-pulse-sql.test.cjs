'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const migrations = path.join(root, 'supabase/migrations');
const read = name => fs.readFileSync(path.join(migrations, name), 'utf8');
const previous = read('20261002007000_loki_pulse_fast_nonblocking.sql');
const migration = read('20261008104000_loki_pulse_query_indexes.sql');

test('RPC Pulse additive : authentification, signature, classement et écritures conservés', () => {
  assert.match(migration, /uid uuid := auth\.uid\(\)/);
  assert.match(migration, /if uid is null then raise exception 'authentication_required'/);
  assert.match(migration, /where p\.id=uid/);
  assert.match(migration, /security definer\s+set search_path to 'public','auth'/);
  assert.equal(migration.match(/returns table\([\s\S]*?\)\s*language/)[0],
    previous.match(/returns table\([\s\S]*?\)\s*language/)[0]);
  assert.equal(migration.slice(migration.indexOf('  scored as ('), migration.indexOf('  where r.artist_rank')),
    previous.slice(previous.indexOf('  scored as ('), previous.indexOf('  where r.artist_rank')));
  assert.equal(migration.slice(migration.indexOf('  v_can_mark :=')), previous.slice(previous.indexOf('  v_can_mark :=')));
  assert.match(migration, /revoke all on function public\.keep_loki_pulse\(integer\) from public,anon/);
  assert.match(migration, /grant execute on function public\.keep_loki_pulse\(integer\) to authenticated/);
  assert.doesNotMatch(migration, /\b(delete from|drop table|alter table|update public\.|insert into public\.(?:tracks|keep_decisions|user_blocks|keep_track_first_discoveries))\b/i);
});

test('exclusions personnelles avant score, likes text sans conversion UUID risquée', () => {
  const eligible = migration.slice(migration.indexOf('  eligible as materialized ('), migration.indexOf('  base as ('));
  assert.match(eligible, /e\.profile_id=uid and e\.track_id=t\.id/);
  assert.match(eligible, /e\.hidden_at is null/);
  assert.match(eligible, /e\.kept_at is null/);
  assert.match(eligible, /e\.last_shown_at <= now\(\)-interval '3 days'/);
  assert.match(eligible, /kd\.profile_id=uid and kd\.track_id=t\.id and kd\.decision in \('KEPT','PASSED'\)/);
  assert.match(eligible, /tl\.profile_id=uid and tl\.track_id=t\.id::text/);
  assert.match(migration, /where r\.artist_rank<=2/);
  assert.doesNotMatch(migration, /tl\.track_id::uuid/);
  assert.match(read('0013_public_track_likes.sql'), /track_id text not null/);
});

test('popularité plafonnée exactement aux saturations du score et index non dupliqués', () => {
  assert.match(migration, /kd\.track_id=t\.id and kd\.decision='KEPT' limit 25/);
  assert.match(migration, /psl\.track_id=t\.id limit 12/);
  assert.match(migration, /where btt\.track_id=t\.id/);
  assert.match(migration, /on public\.keep_decisions\(track_id\) where decision = 'KEPT'/);
  assert.match(read('20260924164048_profile_swipe_listen_attribution.sql'),
    /idx_profile_swipe_listens_track_created[\s\S]*?profile_swipe_listens\(track_id/);
});

// The comparison reference keeps the old full-history aggregates and applies
// only issue 63's explicit business rules, not the optimisation being tested.
function replaceOnce(sql, from, to) {
  assert.equal(sql.split(from).length, 2, `Reference anchor drifted: ${from}`);
  return sql.replace(from, to);
}
let reference = replaceOnce(previous, 'and e.hidden_at is null', `and e.hidden_at is null
      and e.kept_at is null
      and (e.last_shown_at is null or e.last_shown_at <= now()-interval '3 days')
      and not exists(select 1 from public.track_likes tl where tl.profile_id=p.uid and tl.track_id=t.id::text)`);
reference = replaceOnce(reference, "kd.profile_id=p.uid and kd.track_id=t.id and kd.decision='KEPT'",
  "kd.profile_id=p.uid and kd.track_id=t.id and kd.decision in ('KEPT','PASSED')");
reference = replaceOnce(reference, 'r.artist_rank<=3', 'r.artist_rank<=2');

function candidateQuery(sql, profile = 1, limit = 60) {
  const query = sql.match(/  with prefs as \([\s\S]*?  limit v_limit;/)[0];
  return query.replace(/  insert into tmp_loki_pulse_candidates\([\s\S]*?\n  \)\n/, '')
    .replace(/(?<![.\w])uid(?!\w)/g, `'${uuid(profile)}'::uuid`)
    .replace(/as '[^']+'::uuid/g, 'as uid')
    .replace(/\bv_limit\b/g, String(limit));
}
function uuid(n) { return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`; }

test('PostgreSQL réel : équivalence, exclusions, isolation, provenance, ACL et plans', { timeout: 120000 }, t => {
  const pgBin = process.env.KEEP_TEST_PG_BIN || '/usr/lib/postgresql/16/bin';
  if (!fs.existsSync(path.join(pgBin, 'initdb')) || process.getuid?.() === 0) {
    t.skip('PostgreSQL local non-root indisponible ; aucune preuve SQL runtime/performance.');
    return;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-pulse-pg-'));
  const data = path.join(work, 'data');
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const sql = input => execFileSync(path.join(pgBin, 'psql'),
    ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55463', '-U', 'pulse_test', 'postgres'],
    { cwd: root, input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PGOPTIONS: '-c jit=off -c client_min_messages=warning' } }).trim();
  let started = false;
  try {
    run(path.join(pgBin, 'initdb'), ['-D', data, '-U', 'pulse_test', '--auth=trust', '--no-locale']);
    run(path.join(pgBin, 'pg_ctl'), ['-D', data, '-l', path.join(work, 'postgres.log'),
      '-o', `-k ${work} -h '' -p 55463`, '-w', 'start']);
    started = true;
    // Minimal projection of the repository schema, never a production connection.
    sql(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table profiles(id uuid primary key, favorite_genres text[], inferred_genres text[],
        favorite_artists text[], inferred_artists text[], music_country_codes text[], music_language_codes text[]);
      create table tracks(id uuid primary key, title text, artist text, album text, artwork_url text,
        preview_url text, genres text[], provider_ids jsonb, external_urls jsonb, available_on text[], release_year smallint);
      create table keep_decisions(profile_id uuid, track_id uuid, decision text);
      create index idx_keep_decisions_profile_decision_track on keep_decisions(profile_id,decision,track_id);
      create unique index keep_decisions_one_kept_track_per_profile_uidx
        on keep_decisions(profile_id,track_id) where decision='KEPT';
      create table profile_swipe_listens(track_id uuid, created_at timestamptz default now());
      create index idx_profile_swipe_listens_track_created on profile_swipe_listens(track_id,created_at desc);
      create table keep_battle_match_preferences(profile_id uuid primary key, theme_codes text[]);
      create table music_country_catalog(code text, language_codes text[]);
      create table keep_battle_track_themes(track_id uuid, theme_code text, primary key(track_id,theme_code));
      create table music_pulse_theme_affinity(theme_code text, country_code text, language_code text, weight numeric);
      create index idx_music_pulse_theme_affinity_theme_code on music_pulse_theme_affinity(theme_code);
      create table notifications(profile_id uuid, type text, title text, body text, data jsonb,
        push_delivery_status text, push_attempt_count integer, created_at timestamptz default now());
    `);
    sql(read('20261001214638_fix_loki_pulse_style_key_lowercase_order.sql'));
    sql(read('0013_public_track_likes.sql'));
    sql(read('20261001183000_loki_pulse_personalized_music_rail.sql'));
    // The existing attribution table is immutable to client roles.
    sql(`create table keep_track_first_discoveries(track_id uuid primary key, profile_id uuid, discovered_at timestamptz);
      alter table keep_track_first_discoveries enable row level security;
      create table user_blocks(blocker_id uuid, blocked_id uuid, primary key(blocker_id,blocked_id));
      alter table user_blocks enable row level security;
      create policy user_blocks_owner on user_blocks using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
      grant usage on schema public,auth to authenticated,anon;
      grant select on user_blocks,profile_loki_pulse_events to authenticated;`);
    sql(`
      insert into profiles select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
        array['rock'],array['pop'],array['artist 1'],array['artist 2'],array['FR'],array['fr']
        from generate_series(1,101) n;
      insert into tracks select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
        'Track '||n, 'Artist '||(n/4), 'Album', 'https://art.invalid/'||n, 'https://preview.invalid/'||n,
        case when n%2=0 then array['rock'] else array['pop'] end,
        jsonb_build_object('appleStorefront',case when n%3=0 then 'FR' else 'US' end),
        jsonb_build_object('spotify','https://spotify.invalid/'||n), array['spotify'],2026
        from generate_series(1,5000) n;
      insert into keep_decisions select ('00000000-0000-0000-0000-'||lpad((n+2)::text,12,'0'))::uuid,t.id,'KEPT'
        from tracks t,generate_series(1,50) n
        where n<=case t.title when 'Track 13' then 0 when 'Track 14' then 1 when 'Track 15' then 24
          when 'Track 16' then 25 when 'Track 17' then 26 else 50 end;
      insert into profile_swipe_listens(track_id) select t.id from tracks t,generate_series(1,100) n
        where n<=case t.title when 'Track 13' then 0 when 'Track 14' then 1 when 'Track 15' then 11
          when 'Track 16' then 12 when 'Track 17' then 13 else 100 end;
      insert into music_country_catalog values ('FR',array['fr']),('CA',array['fr','en']);
      insert into keep_battle_match_preferences values ('${uuid(1)}',array['ROCK']);
      insert into music_pulse_theme_affinity values ('ROCK','FR',null,9),('POP',null,'fr',5),('ROCK','US',null,20);
      insert into keep_battle_track_themes select id,case when genres=array['rock'] then 'ROCK' else 'POP' end from tracks;
      update tracks set artist=case when title in ('Track 4900','Track 4902') then ' Artist 1 ' else 'ARTIST 1' end,
        genres=array['rock'],provider_ids='{"appleStorefront":"FR"}'
        where title in ('Track 4900','Track 4901','Track 4902','Track 4903');
      insert into keep_decisions values ('${uuid(1)}','${uuid(1)}','KEPT'),('${uuid(1)}','${uuid(2)}','PASSED');
      insert into track_likes values ('${uuid(1)}','${uuid(3)}',now()),('${uuid(1)}','provider:not-a-uuid',now()),
        ('${uuid(2)}','${uuid(11)}',now());
      insert into profile_loki_pulse_events(profile_id,track_id,last_shown_at,hidden_at,kept_at) values
        ('${uuid(1)}','${uuid(4)}',now()-interval '4 days',now(),null),
        ('${uuid(1)}','${uuid(5)}',now()-interval '4 days',null,now()),
        ('${uuid(1)}','${uuid(6)}',now()-interval '1 day',null,null),
        ('${uuid(1)}','${uuid(7)}',now()-interval '3 days',null,null),
        ('${uuid(1)}','${uuid(8)}',now()-interval '3 days'-interval '1 second',null,null),
        ('${uuid(2)}','${uuid(9)}',now(),now(),null);
      insert into keep_track_first_discoveries values ('${uuid(10)}','${uuid(2)}',now()-interval '1 year');
      insert into user_blocks values ('${uuid(1)}','${uuid(2)}'),('${uuid(3)}','${uuid(1)}');
      analyze;`);
    const before = JSON.parse(sql(`explain (analyze,buffers,format json) ${candidateQuery(reference)}`))[0];
    sql(migration);
    sql(migration); // Idempotent indexes and CREATE OR REPLACE.
    const after = JSON.parse(sql(`explain (analyze,buffers,format json) ${candidateQuery(migration)}`))[0];
    t.diagnostic(`Plans LOCAL : référence=${before['Execution Time']} ms, optimisé=${after['Execution Time']} ms.`);
    const comparison = sql(`begin;
      create temp table expected as ${candidateQuery(reference)}
      create temp table actual as ${candidateQuery(migration)}
      select count(*) from ((select * from expected except all select * from actual)
        union all (select * from actual except all select * from expected)) diff;
      rollback;`);
    assert.equal(comparison, '0', 'Every output column/score must match the unoptimised reference.');
    const allScores = source => candidateQuery(source).replace(/  select r\.track_id[\s\S]*$/,
      'select track_id,relevance_score,is_new from scored;');
    assert.equal(sql(`begin; create temp table expected as ${allScores(reference)}
      create temp table actual as ${allScores(migration)}
      select count(*) from ((select * from expected except all select * from actual)
        union all (select * from actual except all select * from expected)) diff; rollback;`), '0',
    'All eligible scores match, including popularity below, at and above each cap.');
    const eligibleQuery = candidateQuery(migration).replace(/  select r\.track_id[\s\S]*$/, 'select id from eligible;');
    const ids = sql(`begin;
      update profile_loki_pulse_events set last_shown_at=now()-interval '3 days'+interval '1 second'
        where profile_id='${uuid(1)}' and track_id='${uuid(6)}';
      update profile_loki_pulse_events set last_shown_at=now()-interval '3 days'
        where profile_id='${uuid(1)}' and track_id='${uuid(7)}';
      update profile_loki_pulse_events set last_shown_at=now()-interval '3 days'-interval '1 second'
        where profile_id='${uuid(1)}' and track_id='${uuid(8)}';
      ${eligibleQuery} rollback;`).split('\n');
    for (let n = 1; n <= 6; n++) assert.ok(!ids.includes(uuid(n)), `Forbidden track ${n}`);
    for (const n of [7, 8, 9, 11]) assert.ok(ids.includes(uuid(n)), `Boundary/other-user track ${n}`);
    const otherIds = sql(candidateQuery(migration, 2).replace(/  select r\.track_id[\s\S]*$/,
      'select id from eligible;')).split('\n');
    assert.ok(otherIds.includes(uuid(1)), 'Another user’s KEEP must not exclude the catalog track.');
    assert.ok(!otherIds.includes(uuid(9)), 'Own hidden event remains excluded.');
    assert.ok(!otherIds.includes(uuid(11)), 'Own like remains excluded.');
    assert.equal(sql(`with selected as (${candidateQuery(migration).replace(/;$/, '')})
      select coalesce(max(cnt),0) from (select count(*) cnt from selected group by lower(trim(artist))) s;`), '2');
    for (const limit of [4, 14, 36, 60]) {
      assert.equal(sql(`begin; create temp table expected as ${candidateQuery(reference, 1, limit)}
        create temp table actual as ${candidateQuery(migration, 1, limit)}
        select count(*) from ((select * from expected except all select * from actual)
          union all (select * from actual except all select * from expected)) diff; rollback;`), '0');
    }
    const snapshot = sql(`select jsonb_build_object(
      'origin',(select jsonb_agg(d) from keep_track_first_discoveries d),
      'blocks',(select jsonb_agg(b order by blocker_id,blocked_id) from user_blocks b),
      'decisions',(select count(*) from keep_decisions),
      'likes',(select count(*) from track_likes));`);
    assert.equal(sql(`select has_function_privilege('anon','public.keep_loki_pulse(integer)','execute');`), 'f');
    assert.equal(sql(`select has_function_privilege('authenticated','public.keep_loki_pulse(integer)','execute');`), 't');
    assert.equal(sql(`select has_table_privilege('authenticated','public.keep_track_first_discoveries','INSERT,UPDATE,DELETE');`), 'f');
    assert.throws(() => sql('select * from keep_loki_pulse(4);'), /authentication_required/);
    assert.equal(sql(`begin; set local role authenticated; set local "request.jwt.claim.sub"='${uuid(999999)}';
      select count(*) from keep_loki_pulse(60); rollback;`), '0');
    // Execute the real security-definer RPC as a client role, not only its SELECT.
    const results = JSON.parse(sql(`begin; set local role authenticated;
      set local "request.jwt.claim.sub"='${uuid(1)}';
      select jsonb_agg(r order by relevance_score desc,is_new desc,title) from keep_loki_pulse(14) r; commit;`));
    assert.equal(results.length, 14);
    assert.equal(sql(`select count(*) from profile_loki_pulse_events where profile_id='${uuid(1)}' and last_shown_at>=now()-interval '1 minute';`), '14');
    assert.equal(sql(`select count(*) from notifications where profile_id='${uuid(1)}';`), '1');
    sql(`begin; set local role authenticated; set local "request.jwt.claim.sub"='${uuid(1)}';
      select count(*) from keep_loki_pulse(14); commit;`);
    assert.equal(sql(`select count(*) from notifications where profile_id='${uuid(1)}';`), '1');
    const snapshotAfter = sql(`select jsonb_build_object(
      'origin',(select jsonb_agg(d) from keep_track_first_discoveries d),
      'blocks',(select jsonb_agg(b order by blocker_id,blocked_id) from user_blocks b),
      'decisions',(select count(*) from keep_decisions),
      'likes',(select count(*) from track_likes));`);
    assert.equal(snapshotAfter, snapshot, 'Pulse must never rewrite decisions, likes, blocks or provenance.');
    assert.equal(sql(`begin; set local role authenticated; set local "request.jwt.claim.sub"='${uuid(1)}';
      select count(*) from profile_loki_pulse_events where profile_id<>'${uuid(1)}';
      select count(*) from user_blocks where blocker_id<>'${uuid(1)}'; rollback;`), '0\n0');
    assert.match(JSON.stringify(after), /idx_loki_pulse_kept_track/);
    assert.match(JSON.stringify(after), /idx_profile_swipe_listens_track_created/);
    t.diagnostic(`LOCAL PostgreSQL : 5 000 titres, 249 828 décisions, 499 537 écoutes ; EXPLAIN ANALYZE référence=${before['Execution Time']} ms, optimisé=${after['Execution Time']} ms ; shared hit blocks référence=${before.Plan['Shared Hit Blocks']}, optimisé=${after.Plan['Shared Hit Blocks']}. Aucun SLA production déduit.`);
  } finally {
    if (started) run(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop']);
    fs.rmSync(work, { recursive: true, force: true });
  }
});
