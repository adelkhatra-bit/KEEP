'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const root = path.resolve(__dirname, '..');
const shared = 'supabase/functions/_shared/providerHealth.ts';
function load(file, requireFn = require) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', output)(module.exports, requireFn, module);
  return module.exports;
}
const api = load(shared);
const secrets = async (key) => key === 'ACRCLOUD_HOST' ? 'identify-eu-west-1.acrcloud.com' : 'fixture-only';

test('messages Super Admin en français, codes techniques séparés et réponses fournisseur privées', async () => {
  const original = global.fetch;
  const cases = [
    ['validateBrevoApiKey', 200, {}, true, 'ACTIVE', 'BREVO_HTTP_200', 'Clé Brevo vérifiée par le fournisseur.'],
    ['validateBrevoApiKey', 401, {}, false, 'ERROR', 'BREVO_HTTP_401', "Brevo refuse cette clé API. Rien n'a été enregistré."],
    ['validateBrevoApiKey', 403, {}, false, 'ERROR', 'BREVO_HTTP_403', "Brevo refuse cette clé API. Rien n'a été enregistré."],
    ['validateBrevoApiKey', 503, {}, false, 'ERROR', 'BREVO_HTTP_503', "Brevo n'a pas confirmé la clé. Rien n'a été enregistré."],
    ['validateYouTubeApiKey', 200, {}, true, 'ACTIVE', 'YOUTUBE_HTTP_200', 'Clé YouTube Data API vérifiée.'],
    ...['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].map(reason =>
      ['validateYouTubeApiKey', 403, { error: { errors: [{ reason }] } }, true, 'EXHAUSTED', 'YOUTUBE_QUOTA_EXHAUSTED',
        'Clé YouTube reconnue, mais quota fournisseur épuisé ou limité.']),
    ...['accessNotConfigured', 'serviceDisabled'].map(reason =>
      ['validateYouTubeApiKey', 403, { error: { errors: [{ reason }] } }, true, 'ERROR', 'YOUTUBE_HTTP_403',
        "Clé Google reconnue, mais YouTube Data API n'est pas activée sur ce projet."]),
    ['validateYouTubeApiKey', 403, {}, false, 'ERROR', 'YOUTUBE_HTTP_403', "YouTube refuse cette clé. Rien n'a été enregistré."],
    ...[0, 1001, 2004].map(code =>
      ['validateAcrCloudCredentials', 200, { status: { code } }, true, 'ACTIVE', `ACRCLOUD_HTTP_200_CODE_${code}`,
        'Identifiants ACRCloud vérifiés par le fournisseur.']),
    ...[3003, 3015].map(code =>
      ['validateAcrCloudCredentials', 200, { status: { code } }, true, 'EXHAUSTED', `ACRCLOUD_HTTP_200_CODE_${code}`,
        'Identifiants ACRCloud reconnus, mais quota fournisseur épuisé ou limité.']),
    ['validateAcrCloudCredentials', 401, { status: { code: 3000 } }, false, 'ERROR', 'ACRCLOUD_HTTP_401_CODE_3000',
      "ACRCloud n'a pas validé ces identifiants. Vérifie l'hôte, la clé et le secret."],
    ['validateAcrCloudCredentials', 503, {}, false, 'ERROR', 'ACRCLOUD_HTTP_503_CODE_-1',
      "ACRCloud n'a pas validé ces identifiants. Vérifie l'hôte, la clé et le secret."],
  ];
  const checkMessage = result => {
    assert.doesNotMatch(result.message, /^[A-Z][A-Z0-9_]+(?:\b|_)/, result.message);
    assert.doesNotMatch(result.message, /fixture-only/);
    assert.match(result.code, /^[A-Z][A-Z0-9_-]+$/);
  };
  try {
    for (const [name, http, body, valid, status, code, message] of cases) {
      global.fetch = async () => new Response(JSON.stringify({ ...body, message: 'fixture-only' }), { status: http });
      const result = name === 'validateAcrCloudCredentials'
        ? await api[name]('identify-eu-west-1.acrcloud.com', 'fixture-only', 'fixture-only')
        : await api[name]('fixture-only');
      checkMessage(result);
      assert.deepEqual({ valid: result.valid, status: result.status, code: result.code, message: result.message },
        { valid, status, code, message });
      if (name === 'validateAcrCloudCredentials') assert.equal(result.providerCode, body.status?.code ?? -1);
    }
    global.fetch = async () => { throw new Error('An invalid host must not be requested'); };
    const invalid = await api.validateAcrCloudCredentials('127.0.0.1', 'fixture-only', 'fixture-only');
    checkMessage(invalid);
    assert.equal(invalid.code, 'ACRCLOUD_INVALID_HOST');
    assert.equal(invalid.valid, false);
    assert.equal(invalid.status, 'ERROR');
  } finally { global.fetch = original; }
});

test('typecheck strict Edge : dépendances npm réelles, déclarations runtime Deno minimales', () => {
  const options = { noEmit: true, strict: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true, skipLibCheck: true, esModuleInterop: true };
  const virtual = path.join(root, 'scripts/system-health-runtime.fixture.d.ts');
  const content = `
    declare namespace Deno {
      const env: { get(key:string):string|undefined };
      function serve(handler:(req:Request)=>Response|Promise<Response>):void;
    }
    declare module "jsr:@supabase/functions-js/edge-runtime.d.ts" {}
    declare module "npm:bcryptjs@2.4.3" {
      const bcrypt: { hashSync(input:string,salt:number):string }; export default bcrypt;
    }`;
  const host = ts.createCompilerHost(options);
  const read = host.readFile, exists = host.fileExists;
  host.readFile = file => file === virtual ? content : read(file);
  host.fileExists = file => file === virtual || exists(file);
  host.resolveModuleNames = (names, containing) => names.map(name =>
    ts.resolveModuleName(name.startsWith('npm:') ? name.slice(4).replace(/@(?:[0-9].*)$/, '') : name,
      containing, options, host).resolvedModule);
  const program = ts.createProgram([
    path.join(root, shared), path.join(root, 'supabase/functions/keep-system-health/index.ts'),
    path.join(root, 'supabase/functions/keep-admin-control/index.ts'), virtual,
  ], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => '\n',
  }));
});

test('probes bornées, requêtes synthétiques sans email/push ni fuite (réseau simulé)', async () => {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.ok(options.signal);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ status: { code: 1001 }, data: { translations: [{ translatedText: 'Bonjour' }] } }), { status: 200 });
  };
  try {
    const results = await api.probeProviders(async (key) => key.startsWith('APPLE_') ? '' : secrets(key));
    assert.equal(results.length, 6);
    assert.equal(results.find(x => x.provider === 'APPLE_MUSIC_TOKEN').status, 'UNKNOWN');
    assert.equal(results.filter(x => x.status === 'OK').length, 5);
    assert.equal(JSON.stringify(results).includes('fixture-only'), false);
    assert.equal(calls.length, 5);
    const acr = calls.find(x => x.url.includes('acrcloud'));
    assert.equal(acr.options.body.get('sample_bytes'), '10444');
    assert.ok(acr.options.body.get('signature'));
    assert.ok(calls.some(x => x.url.includes('getReceipts') && x.options.body === '{"ids":[]}'));
    assert.ok(!calls.some(x => x.url.includes('/push/send') || x.url.includes('/smtp/email')));
  } finally { global.fetch = original; }
});
test('absence de config inconnue, quota et erreur jamais verts, secrets non retournés', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => { throw new Error('should not fetch'); };
    const absent = await api.probeProviders(async () => '');
    assert.equal(absent.filter(x => x.status === 'UNKNOWN').length, 5);
    global.fetch = async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }], message: 'fixture-only' } }), { status: 403 });
    assert.equal((await api.validateYouTubeApiKey('fixture-only')).status, 'EXHAUSTED');
    const failed = await api.probeProviders(async key => key.startsWith('APPLE_') ? '' : secrets(key));
    assert.equal(failed.filter(x => x.status === 'OK').length, 0);
    assert.equal(JSON.stringify(failed).includes('fixture-only'), false);
    assert.equal((await api.validateAcrCloudCredentials('127.0.0.1', 'fixture-only', 'fixture-only')).status, 'ERROR');
    global.fetch = async () => { throw new Error('fixture-only'); };
    const errors = await api.probeProviders(async key => key.startsWith('APPLE_') ? '' : secrets(key));
    assert.ok(errors.filter(x => x.provider !== 'APPLE_MUSIC_TOKEN').every(x => x.last_error === 'PROBE_TIMEOUT_OR_FAILURE'));
  } finally { global.fetch = original; }
});
test('signature ES256 réelle + réponse catalogue Apple simulée, sans sortir le token', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
  const original = global.fetch;
  let checked = false;
  try {
    global.fetch = async (url, options) => {
      if (new URL(url).hostname === 'api.music.apple.com') {
        const token = options.headers.get('Authorization').substring(7);
        const [header, claims, signature] = token.split('.');
        assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'ES256');
        assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).exp - JSON.parse(Buffer.from(claims, 'base64url')).iat, 600);
        assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey,
          Buffer.from(signature, 'base64url'), Buffer.from(`${header}.${claims}`)), true);
        checked = true;
        return new Response(JSON.stringify({ data: [{ id: 'fixture' }] }));
      }
      return new Response('{}');
    };
    const results = await api.probeProviders(async key => ({
      APPLE_MUSICKIT_TEAM_ID: 'FIXTURE1234', APPLE_MUSICKIT_KEY_ID: 'FIXTURE1234', APPLE_MUSICKIT_PRIVATE_KEY: pem,
    })[key] || '');
    assert.ok(checked);
    assert.equal(results.find(x => x.provider === 'APPLE_MUSIC_TOKEN').status, 'OK');
    assert.equal(JSON.stringify(results).includes('PRIVATE KEY'), false);
  } finally { global.fetch = original; }
});
test('un fournisseur muet est réellement interrompu par la borne 8 secondes', async () => {
  const original = global.fetch;
  const keepAlive = setTimeout(() => {}, 10000);
  const start = Date.now();
  global.fetch = async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  try {
    await assert.rejects(api.validateBrevoApiKey('fixture-only'));
    assert.ok(Date.now() - start >= 7900 && Date.now() - start < 9500);
  } finally { clearTimeout(keepAlive); global.fetch = original; }
});
test('worker refuse méthode, bearer seul, mauvais secret ; autorisé persiste via RPC unique', async () => {
  const original = global.Deno;
  let handler;
  let calls = [];
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fixture-worker'))).toString('hex');
  const db = {
    from: (table) => {
      assert.equal(table, 'keep_internal_worker_secrets');
      return { select: column => {
        assert.equal(column, 'secret_hash');
        return { eq: (column, value) => {
          assert.equal(column, 'name'); assert.equal(value, 'system-health-worker');
          return { maybeSingle: async () => ({ data: { secret_hash: digest } }) };
        } };
      } };
    },
    rpc: async (name) => { calls.push(name); return name === 'service_get_integration_secret' ? { data: '' } : {}; },
  };
  global.Deno = { env: { get: () => '' }, serve: fn => { handler = fn; } };
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ data: {} }));
  try {
    load('supabase/functions/keep-system-health/index.ts', name => name.startsWith('jsr:') ? {} :
      name.startsWith('npm:') ? { createClient: () => db } : api);
    assert.equal((await handler(new Request('https://local.invalid', { method: 'GET' }))).status, 405);
    for (const headers of [{ authorization: '******' }, { 'x-keep-worker-key': 'wrong' }, {}]) {
      assert.equal((await handler(new Request('https://local.invalid', { method: 'POST', headers }))).status, 401);
    }
    assert.equal(calls.length, 0);
    const response = await handler(new Request('https://local.invalid', { method: 'POST', headers: { 'x-keep-worker-key': 'fixture-worker' } }));
    assert.equal(response.status, 200);
    assert.ok(calls.includes('service_record_system_health'));
    assert.ok(calls.includes('service_collect_system_health'));
  } finally { global.Deno = original; global.fetch = originalFetch; }
});
test('gateway cron sans JWT uniquement pour worker à secret haché', () => {
  const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
  assert.match(config, /\[functions\.keep-system-health\]\s*verify_jwt\s*=\s*false/);
  const worker = fs.readFileSync(path.join(root, 'supabase/functions/keep-system-health/index.ts'), 'utf8');
  assert.ok(!worker.includes('authorization'));
  assert.ok(worker.includes('crypto.subtle.digest("SHA-256"'));
  assert.ok(worker.includes('if (error || !data?.secret_hash) return false'));
});
test('email_type admin rejoint le retry existant et envoie réellement la requête Brevo (réseau simulé)', async () => {
  const originalDeno = global.Deno, originalFetch = global.fetch;
  const keyValues = { BREVO_API_KEY: 'fixture-brevo', BREVO_SENDER_EMAIL: 'sender@example.invalid' };
  global.Deno = { env: { get: () => '' }, serve: () => {} };
  const sharedDb = { rpc: async (_name, { p_key }) => ({ data: keyValues[p_key] || '' }) };
  let brevoSent = false;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    const body = JSON.parse(options.body);
    assert.equal(body.to[0].email, 'admin@example.invalid');
    assert.ok(body.tags.includes('admin'));
    assert.equal(options.headers['api-key'], 'fixture-brevo');
    brevoSent = true;
    return new Response('{"messageId":"fixture"}', { status: 201 });
  };
  try {
    const sender = load('supabase/functions/_shared/lokiEmailSend.ts', () => ({ createClient: () => sharedDb }));
    const updates = [];
    const row = { id: 'fixture-id', recipient_email: 'admin@example.invalid', subject: 'Incident',
      html_content: '<p>Incident</p>', text_content: 'Incident', email_type: 'admin', retry_count: 0, max_retries: 5 };
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fixture-worker'))).toString('hex');
    const db = {
      from: table => {
        if (table === 'keep_internal_worker_secrets') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { secret_hash: digest } }) }) }) };
        if (table === 'integration_secrets') return { select: () => ({ in: async () => ({ data: [] }) }) };
        if (table === 'integration_runtime_status') return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          upsert: async () => ({}),
        };
        assert.equal(table, 'email_queue');
        return {
          select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [row] }) }) }) }),
          update: values => ({ eq: async () => { updates.push(values); return {}; } }),
        };
      },
    };
    let handler;
    global.Deno.serve = fn => { handler = fn; };
    load('supabase/functions/keep-email-retry-queue/index.ts', name => name.startsWith('jsr:') ? {} :
      name.startsWith('npm:') ? { createClient: () => db } : sender);
    const response = await handler(new Request('https://local.invalid', {
      method: 'POST', headers: { 'x-keep-worker-key': 'fixture-worker' },
    }));
    assert.equal(response.status, 200);
    assert.ok(brevoSent);
    assert.ok(updates.some(x => x.status === 'sent'));
  } finally { global.Deno = originalDeno; global.fetch = originalFetch; }
});

// Real PostgreSQL, isolated database; Vault/pg_cron shims match the existing migration test runner.
test('migration PostgreSQL réelle : rôles, atomique, incidents concurrentiels, cron, compteurs', async (t) => {
  const database = `keep_health_test_${process.pid}`;
  const args = ['-n', '-u', 'postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1'];
  const pg = (sql, db = database) => execFileSync('sudo', [...args, '-d', db], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  pg(`create database ${database};`, 'postgres');
  try {
    pg(`
      create extension pgcrypto;
      do $$ begin
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
        if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
        if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
      end $$;
      create schema auth; create schema extensions; create schema vault; create schema cron;
      create function auth.uid() returns uuid language sql as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table auth.users(id uuid primary key,email text);
      create table public.profiles(id uuid primary key);
      create table public.admin_users(id uuid primary key,role text,is_active boolean default true);
      create table public.provider_health(provider text primary key,status text default 'unknown',last_error text,last_checked_at timestamptz,latency_ms int);
      create table public.notifications(id uuid primary key default gen_random_uuid(),profile_id uuid references profiles(id),type text,title text,body text,data jsonb,read_at timestamptz,created_at timestamptz default now(),push_delivery_status text default 'CREATED',pushed_at timestamptz,push_delivered_at timestamptz);
      create table public.push_delivery_attempts(id uuid primary key default gen_random_uuid(),notification_id uuid references notifications(id),status text,last_attempt_at timestamptz);
      create table public.email_queue(id uuid primary key default gen_random_uuid(),recipient_email text,subject text,html_content text,text_content text,email_type text,user_id uuid,metadata jsonb,status text default 'pending',created_at timestamptz default now(),sent_at timestamptz);
      create table public.app_problem_reports(id bigint,created_at timestamptz default now());
      create table public.web_pairings(id bigint,status text,expires_at timestamptz);
      create table public.keep_internal_worker_secrets(name text primary key,secret_hash text,updated_at timestamptz);
      create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
      create function vault.create_secret(text,text,text,jsonb) returns void language sql as
        'insert into vault.decrypted_secrets values($2,$1)';
      create function extensions.gen_random_bytes(integer) returns bytea language sql as 'select public.gen_random_bytes($1)';
      create function extensions.digest(bytea,text) returns bytea language sql as 'select public.digest($1,$2)';
      create table cron.job(jobid bigint generated by default as identity,jobname text,schedule text,command text,active boolean default true);
      create table cron.job_run_details(jobid bigint,status text,start_time timestamptz,end_time timestamptz);
      create function cron.unschedule(bigint) returns boolean language sql as
        'with d as (delete from cron.job where jobid=$1 returning *) select exists(select 1 from d)';
      create function cron.schedule(text,text,text) returns bigint language sql as
        'insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid';
      grant usage on schema public,auth to anon,authenticated,service_role;
    `);
    const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261008031000_system_health_monitor.sql'), 'utf8');
    pg(migration);
    pg(migration); // Replay is additive/idempotent, including one scheduler job.
    pg(`
      insert into auth.users values('00000000-0000-0000-0000-000000000001','admin@example.invalid'),('00000000-0000-0000-0000-000000000002','tech@example.invalid'),('00000000-0000-0000-0000-000000000003','inactive@example.invalid');
      insert into profiles select id from auth.users;
      insert into admin_users values('00000000-0000-0000-0000-000000000001','SUPER_ADMIN',true),('00000000-0000-0000-0000-000000000002','TECH',true),('00000000-0000-0000-0000-000000000003','SUPER_ADMIN',false);
      insert into app_problem_reports values(1,now()),(2,now()-interval '2 days');
      insert into web_pairings values(1,'WAITING',now()+interval '1 hour'),(2,'WAITING',now()-interval '1 hour');
      set role service_role;
      select service_record_system_health('[{"provider":"BREVO","status":"ERROR","last_checked_at":"2026-10-01","last_error":"PROVIDER_CHECK_FAILED"}]');
      select service_record_system_health('[{"provider":"BREVO","status":"UNKNOWN","last_checked_at":"2026-10-02","last_error":"NOT_CONFIGURED"}]');
      select service_record_system_health('[{"provider":"BREVO","status":"ERROR","last_checked_at":"2026-10-03","last_error":"PROVIDER_CHECK_FAILED"}]');
      reset role;
      do $$ begin
        if (select count(*) from notifications)<>2 or (select count(*) from email_queue)<>2 then raise exception 'duplicate incident'; end if;
      end $$;
      set role service_role;
      select service_record_system_health('[{"provider":"BREVO","status":"OK","last_checked_at":"2026-10-04"}]');
      select service_record_system_health('[{"provider":"BREVO","status":"ERROR","last_checked_at":"2026-10-05","last_error":"PROVIDER_CHECK_FAILED"}]');
      select service_record_system_health('[{"provider":"BREVO","status":"OK","last_checked_at":"2026-10-04"}]');
      reset role;
      do $$ begin
        if (select count(*) from notifications)<>4 or (select count(*) from email_queue)<>4 then raise exception 'new incident not delivered'; end if;
        if (select status from provider_health where provider='BREVO')<>'ERROR' then raise exception 'old check overwrote current'; end if;
        if (select count(*) from cron.job where jobname='keep-system-health-every-5-minutes')<>1 then raise exception 'duplicate cron'; end if;
      end $$;
      create function fail_health_email() returns trigger language plpgsql as $$
        begin if new.metadata->>'provider'='ATOMIC_TEST' then raise exception 'forced test failure'; end if; return new; end $$;
      create trigger health_atomic before insert on email_queue for each row execute function fail_health_email();
      do $$ begin
        begin
          perform service_record_system_health(jsonb_build_array(jsonb_build_object('provider','ATOMIC_TEST','status','ERROR','last_checked_at',now(),'last_error','TEST_FAILURE')));
          raise exception 'expected failure';
        exception when others then
          if sqlerrm<>'forced test failure' then raise; end if;
        end;
        if exists(select 1 from provider_health where provider='ATOMIC_TEST') or
          exists(select 1 from notifications where data->>'provider'='ATOMIC_TEST') then raise exception 'partial transaction'; end if;
      end $$;
    `);
    // Separate simultaneous connections exercise the actual row-lock incident fence.
    const concurrent = `set role service_role; select service_record_system_health(jsonb_build_array(jsonb_build_object('provider','CONCURRENT','status','ERROR','last_checked_at',now(),'last_error','TEST_FAILURE')));`;
    await Promise.all(Array.from({ length: 6 }, () => promisify(execFile)('sudo', [...args, '-d', database, '-c', concurrent])));
    pg(`
      do $$ begin
        if (select count(*) from notifications where data->>'provider'='CONCURRENT')<>2 then raise exception 'concurrent duplicate'; end if;
        if (select count(*) from email_queue where metadata->>'provider'='CONCURRENT')<>2 then raise exception 'concurrent email duplicate'; end if;
      end $$;
      insert into cron.job(jobname,schedule) values('test-cron','*/5 * * * *'),('never-run','0 0 * * *');
      insert into cron.job_run_details select jobid,'succeeded',now()-interval '10 minutes',now()-interval '9 minutes' from cron.job where jobname='test-cron';
      insert into cron.job_run_details select jobid,'failed',now()-interval '1 minute',now() from cron.job where jobname='test-cron';
      set role service_role; select service_collect_system_health(); reset role;
      update email_queue set status='failed' where id=(select id from email_queue limit 1);
      update notifications set push_delivery_status='NO_DEVICE' where id=(select id from notifications limit 1);
      insert into push_delivery_attempts(notification_id,status,last_attempt_at)
        select id,'NO_DEVICE',now() from notifications where push_delivery_status='NO_DEVICE';
      set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
      set role authenticated;
      do $$ declare h jsonb; begin
        h:=admin_system_health();
        if h->'daily'<> '{"new_reports":1,"failed_emails":1,"push_no_device":1,"waiting_qr":2}'::jsonb then raise exception 'wrong counters %',h; end if;
        if jsonb_array_length(h->'notifications')<1 then raise exception 'missing admin bell'; end if;
        if not exists(select 1 from jsonb_array_elements(h->'services') s where s->>'provider'='cron:test-cron' and s->>'status'='ERROR' and s->'metadata'->>'last_success_at' is not null and s->'metadata'->>'last_error_at' is not null) then raise exception 'cron metadata missing'; end if;
        if exists(select 1 from jsonb_array_elements(h->'services') s where s->>'provider' like 'edge:%' and s->>'status'<>'UNKNOWN') then raise exception 'edge fake green'; end if;
        begin perform service_record_system_health('[]'); raise exception 'worker granted user'; exception when insufficient_privilege then null; end;
      end $$;
      reset role;
      set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
      set role authenticated;
      do $$ begin
        begin perform admin_system_health(); raise exception 'inactive accepted'; exception when insufficient_privilege then null; end;
      end $$;
      reset role; set role anon;
      do $$ begin
        begin perform admin_system_health(); raise exception 'anon accepted'; exception when insufficient_privilege then null; end;
        begin perform service_record_system_health('[]'); raise exception 'anon write'; exception when insufficient_privilege then null; end;
      end $$;
    `);
    pg(`
      -- Empty business queues are UNKNOWN even when health alerts themselves
      -- have failed/pending/NO_DEVICE statuses.
      set role service_role; select service_collect_system_health(); reset role;
      do $$ begin
        if (select status from provider_health where provider='EMAIL_QUEUE')<>'UNKNOWN'
          or (select status from provider_health where provider='PUSH_QUEUE')<>'UNKNOWN' then
          raise exception 'own alerts poisoned queue observation';
        end if;
        if not exists(select 1 from pg_indexes where indexname='notifications_system_health_admin_idx') then raise exception 'bell index missing'; end if;
        if has_function_privilege('authenticated','service_collect_system_health()','execute')
          or has_function_privilege('anon','service_record_system_health(jsonb)','execute') then raise exception 'bad worker privilege'; end if;
      end $$;
      insert into email_queue(recipient_email,email_type,status,created_at,metadata,sent_at) values
        ('user@example.invalid','signup','pending',now()-interval '20 minutes','{}',null),
        ('user@example.invalid','signup','failed',now(),'{}',null),
        ('user@example.invalid','signup','sent',now(),'{}',now());
      insert into notifications(profile_id,type,title,push_delivery_status,created_at,pushed_at) values
        ('00000000-0000-0000-0000-000000000001','TEST_QUEUE','fixture','CREATED',now()-interval '20 minutes',null),
        ('00000000-0000-0000-0000-000000000001','TEST_QUEUE','fixture','FAILED',now(),now()),
        ('00000000-0000-0000-0000-000000000001','TEST_QUEUE','fixture','NO_DEVICE',now(),now());
      insert into push_delivery_attempts(notification_id,status,last_attempt_at)
        select id,'NO_DEVICE',now() from notifications where type='TEST_QUEUE' and push_delivery_status='NO_DEVICE';
      set role service_role; select service_collect_system_health(); select service_collect_system_health(); reset role;
      do $$ begin
        if not exists(select 1 from provider_health where provider='EMAIL_QUEUE' and status='ERROR'
          and (metadata->>'failed')::int=1 and (metadata->>'pending')::int=1 and (metadata->>'lag_seconds')::int>=1200)
          or not exists(select 1 from provider_health where provider='PUSH_QUEUE' and status='ERROR'
          and (metadata->>'failed')::int=1 and (metadata->>'pending')::int=1 and (metadata->>'no_device_24h')::int=1
          and (metadata->>'lag_seconds')::int>=1200) then raise exception 'queue telemetry missing'; end if;
        if (select count(*) from email_queue where metadata->>'provider'='EMAIL_QUEUE')<>2
          or (select count(*) from notifications where data->>'provider'='PUSH_QUEUE')<>2 then raise exception 'queue alert repeated'; end if;
      end $$;
      update email_queue set status='pending' where email_type='signup' and status='failed';
      update notifications set push_delivery_status='CREATED' where type='TEST_QUEUE' and push_delivery_status='FAILED';
      set role service_role; select service_collect_system_health(); reset role;
      do $$ begin
        if (select last_error from provider_health where provider='EMAIL_QUEUE')<>'EMAIL_QUEUE_LAG'
          or (select last_error from provider_health where provider='PUSH_QUEUE')<>'PUSH_QUEUE_LAG' then
          raise exception 'queue lag not detected without failures';
        end if;
      end $$;
      -- UNKNOWN does not resolve an open incident. Neither own successful
      -- alerts nor a suddenly empty business queue are recovery evidence.
      update email_queue set status='skipped',created_at=now()-interval '2 days',sent_at=null where email_type='signup';
      update notifications set push_delivery_status='IN_APP_ONLY',created_at=now()-interval '2 days',pushed_at=null where type='TEST_QUEUE';
      update email_queue set status='sent',sent_at=now() where metadata->>'source'='system_health';
      update notifications set push_delivery_status='DELIVERED',push_delivered_at=now() where type='ADMIN_SYSTEM_HEALTH';
      set role service_role; select service_collect_system_health(); reset role;
      set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
      set role authenticated;
      do $$ declare h jsonb; begin
        h:=admin_system_health();
        if not exists(select 1 from jsonb_array_elements(h->'services') s
          where s->>'provider'='EMAIL_QUEUE' and s->>'status'='ERROR'
          and s->'metadata'->>'incident_open'='true' and s->'metadata'->>'observation_status'='UNKNOWN') then
          raise exception 'unknown hid open incident';
        end if;
      end $$;
      reset role;
      update email_queue set status='sent',sent_at=now() where email_type='signup';
      update notifications set push_delivery_status='DELIVERED',push_delivered_at=now() where type='TEST_QUEUE';
      set role service_role; select service_collect_system_health(); reset role;
      do $$ begin
        if (select incident_open from provider_health where provider='EMAIL_QUEUE')
          or (select status from provider_health where provider='EMAIL_QUEUE')<>'OK'
          or (select incident_open from provider_health where provider='PUSH_QUEUE') then raise exception 'actual delivery did not recover'; end if;
      end $$;
      update notifications set push_delivery_status='NO_DEVICE',created_at=now(),pushed_at=now(),push_delivered_at=null where type='TEST_QUEUE';
      set role service_role; select service_collect_system_health(); reset role;
      do $$ begin
        if (select status from provider_health where provider='PUSH_QUEUE')<>'UNKNOWN'
          or (select last_error from provider_health where provider='PUSH_QUEUE')<>'PUSH_NO_DEVICE'
          or (select (metadata->>'no_device_24h')::int from provider_health where provider='PUSH_QUEUE')<>1 then
          raise exception 'no-device only was called healthy or provider outage';
        end if;
      end $$;
      insert into app_problem_reports values
        (3,date_trunc('day',now(),'UTC')+interval '1 minute'),
        (4,date_trunc('day',now(),'UTC')-interval '1 minute');
      set timezone='Pacific/Honolulu';
      set role authenticated;
      do $$ declare h jsonb; begin
        h:=admin_system_health();
        if (h->'daily'->>'new_reports')::int<>2 then raise exception 'day boundary not UTC'; end if;
        if (h->'daily'->>'push_no_device')::int<>2 then raise exception 'no-device summary diverged from actual attempts'; end if;
      end $$;
      reset role;
    `);
    await t.test('SQL : ancien succès + lag puis skip ne referment pas les incidents et ne renotifient pas', () => {
      pg(`
        update email_queue set status='skipped',sent_at=null
          where coalesce(metadata->>'source','') <> 'system_health';
        update notifications set push_delivery_status='IN_APP_ONLY',pushed_at=null,push_delivered_at=null
          where type<>'ADMIN_SYSTEM_HEALTH';
        select set_config('health_test.email_alert_count',
          (select count(*)::text from notifications where data->>'provider'='EMAIL_QUEUE'),false);
        select set_config('health_test.push_alert_count',
          (select count(*)::text from notifications where data->>'provider'='PUSH_QUEUE'),false);
        insert into email_queue(recipient_email,email_type,status,created_at,metadata,sent_at) values
          ('user@example.invalid','RECOVERY_FIXTURE','sent',now()-interval '1 hour','{}',now()-interval '1 hour'),
          ('user@example.invalid','RECOVERY_FIXTURE','pending',now()-interval '20 minutes','{}',null);
        insert into notifications(profile_id,type,title,push_delivery_status,created_at,push_delivered_at) values
          ('00000000-0000-0000-0000-000000000001','RECOVERY_FIXTURE','fixture','DELIVERED',now()-interval '1 hour',now()-interval '1 hour'),
          ('00000000-0000-0000-0000-000000000001','RECOVERY_FIXTURE','fixture','CREATED',now()-interval '20 minutes',null);
        set role service_role; select service_collect_system_health(); reset role;
        do $$ begin
          if exists(select 1 from provider_health where provider in ('EMAIL_QUEUE','PUSH_QUEUE')
            and (status<>'ERROR' or not incident_open)) then raise exception 'lag did not open incidents'; end if;
        end $$;
        update email_queue set status='skipped' where email_type='RECOVERY_FIXTURE' and status='pending';
        update notifications set push_delivery_status='IN_APP_ONLY' where type='RECOVERY_FIXTURE' and push_delivery_status='CREATED';
        set role service_role; select service_collect_system_health(); select service_collect_system_health(); reset role;
        do $$ begin
          if exists(select 1 from provider_health where provider in ('EMAIL_QUEUE','PUSH_QUEUE')
            and (status<>'UNKNOWN' or not incident_open or (metadata->>'delivered_24h')::int<>1)) then
            raise exception 'old 24h success falsely recovered an incident';
          end if;
          if (select count(*) from notifications where data->>'provider'='EMAIL_QUEUE')
            <>current_setting('health_test.email_alert_count')::int+2
            or (select count(*) from notifications where data->>'provider'='PUSH_QUEUE')
            <>current_setting('health_test.push_alert_count')::int+2 then raise exception 'incident notified again'; end if;
        end $$;
        set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
        set role authenticated;
        do $$ declare h jsonb; begin
          h:=admin_system_health();
          if (select count(*) from jsonb_array_elements(h->'services') s
            where s->>'provider' in ('EMAIL_QUEUE','PUSH_QUEUE') and s->>'status'='ERROR')<>2 then
            raise exception 'open incidents hidden from admin';
          end if;
        end $$;
        reset role;
        insert into email_queue(recipient_email,email_type,status,created_at,metadata,sent_at)
          values('user@example.invalid','RECOVERY_FIXTURE','sent',now(),'{}',now());
        insert into notifications(profile_id,type,title,push_delivery_status,push_delivered_at)
          values('00000000-0000-0000-0000-000000000001','RECOVERY_FIXTURE','fixture','DELIVERED',now());
        set role service_role; select service_collect_system_health(); reset role;
        do $$ begin
          if exists(select 1 from provider_health where provider in ('EMAIL_QUEUE','PUSH_QUEUE')
            and (status<>'OK' or incident_open)) then raise exception 'new delivery did not recover'; end if;
        end $$;
      `);
    });
    await t.test('SQL : ticket SENT seul jamais vert ; seul DELIVERED post-échec referme l’incident', () => {
      pg(`
        update notifications set push_delivery_status='IN_APP_ONLY',pushed_at=null,push_delivered_at=null
          where type<>'ADMIN_SYSTEM_HEALTH';
        insert into notifications(profile_id,type,title,push_delivery_status,pushed_at)
          values('00000000-0000-0000-0000-000000000001','TICKET_FIXTURE','fixture','SENT',now());
        set role service_role; select service_collect_system_health(); reset role;
        do $$ begin
          if not exists(select 1 from provider_health where provider='PUSH_QUEUE' and status='UNKNOWN'
            and (metadata->>'delivered_24h')::int=0 and (metadata->>'unverified_tickets')::int=1
            and (metadata->>'pending')::int=1) then raise exception 'SENT ticket reported delivery'; end if;
        end $$;
        update notifications set pushed_at=now()-interval '20 minutes' where type='TICKET_FIXTURE';
        set role service_role; select service_collect_system_health(); reset role;
        do $$ begin
          if not exists(select 1 from provider_health where provider='PUSH_QUEUE' and status='ERROR'
            and incident_open and last_error='PUSH_QUEUE_LAG') then raise exception 'unverified ticket lag not observed'; end if;
        end $$;
        update notifications set pushed_at=now() where type='TICKET_FIXTURE';
        set role service_role; select service_collect_system_health(); reset role;
        do $$ begin
          if not exists(select 1 from provider_health where provider='PUSH_QUEUE' and status='UNKNOWN'
            and incident_open) then raise exception 'fresh accepted ticket closed incident'; end if;
        end $$;
        update notifications set push_delivery_status='DELIVERED',push_delivered_at=now() where type='TICKET_FIXTURE';
        set role service_role; select service_collect_system_health(); reset role;
        do $$ begin
          if not exists(select 1 from provider_health where provider='PUSH_QUEUE' and status='OK'
            and not incident_open and (metadata->>'delivered_24h')::int=1) then raise exception 'confirmed post-error delivery did not recover'; end if;
        end $$;
      `);
    });
  } finally { pg(`drop database ${database};`, 'postgres'); }
});
