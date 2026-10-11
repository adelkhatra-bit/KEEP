'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const { VERSION, SHA256, URL: RELEASE_URL, verifyArchive, install } = require('./install-actionlint.cjs');
const { REPOSITORY, BRANCH, CONTROLS, LIMITS, classify, link, reportExitCode, makeApi, pages, collect, summaryText, renderSummary, writeSummary } = require('./github-controls-report.cjs');
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const now = new Date('2026-10-06T23:00:00Z');
const base = `repos/${REPOSITORY}`;

function run(file = CONTROLS[0], overrides = {}) {
  return {
    id: 123, path: `.github/workflows/${file}`, head_sha: SHA, head_branch: BRANCH,
    head_repository: { full_name: REPOSITORY }, run_number: 42, run_attempt: 1,
    status: 'completed', conclusion: 'success',
    html_url: `https://github.com/${REPOSITORY}/actions/runs/123`,
    created_at: '2026-10-06T20:00:00Z', updated_at: '2026-10-06T21:00:00Z',
    ...overrides,
  };
}
function fixture({ runs = [], jobs = [], privateRepo = false, failRuns = false, failJobs = false, movingHead = false } = {}) {
  const calls = [];
  let headReads = 0;
  const api = async endpoint => {
    calls.push(endpoint);
    if (endpoint === base) return { private: privateRepo };
    if (endpoint === `${base}/commits/${encodeURIComponent(BRANCH)}`) {
      headReads++;
      return {
        sha: movingHead && headReads > 1 ? OTHER_SHA : SHA,
        commit: { committer: { date: '2026-10-06T19:00:00Z' } },
        html_url: `https://github.com/${REPOSITORY}/commit/${SHA}`,
      };
    }
    if (endpoint.startsWith(`${base}/actions/runs?`)) {
      if (failRuns) throw new Error('forbidden');
      return { total_count: runs.length, workflow_runs: runs };
    }
    if (endpoint.includes('/jobs?')) {
      if (failJobs) throw new Error('forbidden');
      return { total_count: jobs.length, jobs };
    }
    throw new Error(`Unexpected test endpoint ${endpoint}`);
  };
  return { api, calls };
}
const job = conclusion => ({
  id: 99, name: 'Contract', status: 'completed', conclusion,
  started_at: '2026-10-06T20:00:00Z', completed_at: '2026-10-06T21:00:00Z',
  html_url: `https://github.com/${REPOSITORY}/actions/runs/123/job/99`,
});

test('pin is explicit, official and invalid archives are refused before execution', async () => {
  assert.equal(VERSION, '1.7.7');
  assert.match(SHA256, /^[a-f0-9]{64}$/);
  assert.equal(RELEASE_URL, 'https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz');
  assert.throws(() => verifyArchive(Buffer.from('untrusted archive')), /SHA256 mismatch/);
  const destination = `/tmp/keep-actionlint-refused-${process.pid}`;
  await assert.rejects(install(destination, async () => new Response('untrusted archive')), /SHA256 mismatch/);
  assert.equal(fs.existsSync(destination), false);
});

test('installer HTTP failure cannot execute or produce a binary', async () => {
  await assert.rejects(install('/tmp/keep-actionlint-not-installed', async () => new Response('', { status: 503 })), /HTTP 503/);
});

test('conclusions preserve success/skipped/failure/neutral/cancelled/unknown separately', () => {
  for (const [conclusion, expected] of [
    ['success', 'success'], ['skipped', 'skipped'], ['failure', 'failure'],
    ['timed_out', 'failure'], ['action_required', 'failure'], ['startup_failure', 'failure'],
    ['stale', 'failure'], ['cancelled', 'cancelled'], ['neutral', 'neutral'],
    [null, 'unknown'], ['new_value', 'unknown'],
  ]) assert.equal(classify('completed', conclusion), expected);
  assert.equal(classify('in_progress', 'success'), 'pending');
  assert.equal(classify('unknown', 'success'), 'unknown');
});

test('API transport only GETs fixed GitHub origin, no redirects, no token in URL', async () => {
  const calls = [];
  const api = makeApi('synthetic-test-token', async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ private: false }), { status: 200 });
  });
  assert.deepEqual(await api(base), { private: false });
  assert.equal(calls[0].url, `https://api.github.com/${base}`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, ['Bearer', 'synthetic-test-token'].join(' '));
  assert(!calls[0].url.includes('token'));
  await assert.rejects(api('https://evil.invalid/'), /Noncanonical/);
  await assert.rejects(api('repos/other/project/actions/runs'), /Noncanonical/);
  assert.equal(calls.length, 1);
});

test('API failures do not include response body or credentials', async () => {
  const api = makeApi('synthetic-test-token', async () => new Response('private response body', { status: 403 }));
  await assert.rejects(api(base), error => error.message === 'GitHub HTTP 403');
});

test('canonical SHA and branch filters never fall back to default branch', async () => {
  const f = fixture({ runs: [
    run(CONTROLS[0], { head_branch: 'main' }),
    run(CONTROLS[1], { head_sha: OTHER_SHA }),
    run(CONTROLS[2], { head_repository: { full_name: 'other/fork' } }),
  ] });
  const report = await collect(f.api, now);
  assert.equal(report.branch, BRANCH);
  assert.equal(report.sha, SHA);
  assert.equal(report.commitDate, '2026-10-06T19:00:00Z');
  assert.equal(report.runCounts.unknown, CONTROLS.length);
  assert.equal(report.runCounts.success, 0);
  const query = new URL(f.calls.find(c => c.includes('/actions/runs?')), 'https://api.github.com/').searchParams;
  assert.equal(query.get('branch'), BRANCH);
  assert.equal(query.get('head_sha'), SHA);
  assert.equal(query.get('created'), '>=2026-09-29T23:00:00.000Z');
  assert.equal(query.get('exclude_pull_requests'), 'true');
  assert.equal(report.complete, false);
});

test('most recent run/attempt wins, not an older successful run', async () => {
  const f = fixture({ runs: [
    run(CONTROLS[0], { run_number: 41, conclusion: 'success' }),
    run(CONTROLS[0], { run_attempt: 2, conclusion: 'failure' }),
    run(CONTROLS[0], { run_attempt: 1, conclusion: 'success' }),
  ], jobs: [job('failure'), job('skipped')] });
  const report = await collect(f.api, now);
  assert.equal(report.controls[0].category, 'failure');
  assert.equal(report.controls[0].run.attempt, 2);
  assert.equal(report.controls[0].jobCounts.skipped, 1);
  assert.equal(report.controls[0].jobCounts.success, 0);
  assert.equal(report.controls[0].jobs[0].completedAt, '2026-10-06T21:00:00Z');
  assert(f.calls.some(c => c.includes('/attempts/2/jobs?')));
});

test('successful workflow with skipped jobs never implies every job passed', async () => {
  const f = fixture({ runs: CONTROLS.map(file => run(file)), jobs: [job('success'), job('skipped')] });
  const report = await collect(f.api, now);
  assert.equal(report.complete, true);
  assert.equal(report.runCounts.success, CONTROLS.length);
  assert.equal(report.controls[0].jobCounts.skipped, 1);
  assert.equal(report.verdict, 'OBSERVED_ONLY');
  assert(!JSON.stringify(report).includes('"PASS"'));
  assert.equal(reportExitCode(report), 2);
});

test('exit 0 requires complete success of runs AND all jobs; failures exit 1, unknowns exit 2', async () => {
  const success = await collect(fixture({ runs: CONTROLS.map(file => run(file)), jobs: [job('success')] }).api, now);
  assert.equal(reportExitCode(success), 0);
  const failed = await collect(fixture({ runs: [run()], jobs: [job('failure')] }).api, now);
  assert.equal(reportExitCode(failed), 1);
  const unavailable = await collect(fixture({ failRuns: true }).api, now);
  assert.equal(reportExitCode(unavailable), 2);
});

test('skipped workflow is separate from success', async () => {
  const report = await collect(fixture({ runs: [run(CONTROLS[0], { conclusion: 'skipped' })], jobs: [job('skipped')] }).api, now);
  assert.equal(report.runCounts.skipped, 1);
  assert.equal(report.runCounts.success, 0);
});

test('unavailable runs remain unknown, not empty-success', async () => {
  const report = await collect(fixture({ failRuns: true }).api, now);
  assert.equal(report.runCounts.unknown, CONTROLS.length);
  assert.equal(report.complete, false);
  assert.match(report.issues[0], /unavailable/);
});

test('unavailable/empty jobs keep evidence explicitly incomplete', async () => {
  for (const options of [{ failJobs: true }, { jobs: [] }]) {
    const report = await collect(fixture({ runs: [run()], ...options }).api, now);
    assert.equal(report.controls[0].jobsComplete, false);
    assert.equal(report.complete, false);
    assert(report.issues.length > 0);
  }
});

test('pagination collects second page and declares bounds on truncation', async () => {
  const seen = [];
  const api = async endpoint => {
    seen.push(endpoint);
    return { total_count: 101, jobs: seen.length === 1 ? Array(100).fill(job('success')) : [job('skipped')] };
  };
  const result = await pages(api, `${base}/actions/runs/123/jobs?filter=latest`, 'jobs');
  assert.equal(result.items.length, 101);
  assert.equal(result.pages, 2);
  assert.equal(result.truncated, false);
  assert.match(seen[1], /per_page=100&page=2$/);
  let requests = 0;
  const bounded = await pages(async () => {
    requests++;
    return { total_count: 400, jobs: Array(100).fill(job('success')) };
  }, `${base}/actions/runs/123/jobs`, 'jobs');
  assert.equal(requests, LIMITS.maxPages);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.items.length, 300);
});

test('malformed/short pagination does not claim completeness', async () => {
  await assert.rejects(pages(async () => ({ jobs: [] }), base, 'jobs'), /Invalid/);
  const result = await pages(async () => ({ total_count: 200, jobs: [] }), base, 'jobs');
  assert.equal(result.truncated, true);
});

test('bounded runs and jobs are disclosed in report and never green', async () => {
  const f = fixture();
  const api = async endpoint => {
    if (endpoint.includes('/actions/runs?')) {
      return { total_count: 400, workflow_runs: Array(100).fill(run()) };
    }
    if (endpoint.includes('/jobs?')) {
      return { total_count: 400, jobs: Array(100).fill(job('success')) };
    }
    return f.api(endpoint);
  };
  const report = await collect(api, now);
  assert.equal(report.pagination.runs.truncated, true);
  assert.equal(report.controls[0].jobsPagination.truncated, true);
  assert.equal(report.controls[0].jobsComplete, false);
  assert.equal(report.complete, false);
  assert.equal(reportExitCode(report), 2);
});

test('changing HEAD is disclosed explicitly', async () => {
  const report = await collect(fixture({ movingHead: true }).api, now);
  assert.equal(report.sha, SHA);
  assert(report.issues.some(issue => issue.includes('HEAD changed')));
});

test('private visibility preserved and links cannot reference external hosts', async () => {
  const report = await collect(fixture({ privateRepo: true }).api, now);
  assert.equal(report.visibility, 'private');
  assert.equal(link('https://evil.invalid/'), null);
  assert.equal(link(`https://github.com/${REPOSITORY}.evil/actions`), null);
});

test('French summary lists every control, counts, SHA, dates and canonical run links', async () => {
  const report = await collect(fixture({
    runs: CONTROLS.map(file => run(file)), jobs: [job('success')],
  }).api, now);
  const summary = renderSummary(report);
  assert.match(summary, /CONTRÔLES LISTÉS RÉUSSIS — observation uniquement/);
  assert.equal(summary.split('\n').filter(line => line.startsWith('| ')).length, CONTROLS.length + 2);
  assert(summary.includes(summaryText('CI complète')));
  assert(summary.includes(summaryText('1 réussi')));
  assert(summary.includes(SHA));
  assert(summary.includes(summaryText('2026-10-06T19:00:00Z')));
  assert(summary.includes(summaryText('2026-10-06T20:00:00Z')));
  assert(summary.includes(`[Voir le contrôle](https://github.com/${REPOSITORY}/actions/runs/123)`));
  assert.match(summary, /ne prouve ni une livraison/);
  assert(!summary.includes('PASS'));
});

test('summary distinguishes all outcomes and incomplete job counts without a false PASS', async () => {
  const outcomes = ['success', 'skipped', 'failure', 'cancelled', 'neutral', null];
  const report = await collect(fixture({
    runs: outcomes.map((conclusion, i) => run(CONTROLS[i], { conclusion })),
    jobs: outcomes.map(job),
  }).api, now);
  const summary = renderSummary(report);
  assert.match(summary, /ÉCHEC OBSERVÉ/);
  for (const label of ['réussi', 'ignoré (skipped)', 'échec', 'annulé', 'neutre', 'inconnu']) {
    assert(summary.includes(summaryText(`1 ${label}`)));
  }
  const skipped = await collect(fixture({
    runs: CONTROLS.map(file => run(file)), jobs: [job('success'), job('skipped')],
  }).api, now);
  assert.match(renderSummary(skipped), /INCOMPLET — aucune validation globale/);
  const pending = await collect(fixture({
    runs: [run(CONTROLS[0], { status: 'in_progress' })], failJobs: true,
  }).api, now);
  const pendingSummary = renderSummary(pending);
  assert(pendingSummary.includes(summaryText('en attente / en cours')));
  assert.match(pendingSummary, /collecte incomplète/);
  assert.match(pendingSummary, /zéro avec une collecte incomplète ne signifie pas absence de jobs/);
  assert(!summary.includes('PASS'));
  assert(!pendingSummary.includes('CONTRÔLES LISTÉS RÉUSSIS'));
});

test('summary encodes Markdown and HTML and excludes untrusted metadata and unsafe URLs', async () => {
  const hostile = '<img src=x onerror=alert(1)>|[click](javascript:bad)\n# heading & `code`';
  const escaped = summaryText(hostile);
  assert(!/[<>\n|`[\]]/.test(escaped));
  assert.match(escaped, /&#60;img/);
  const report = await collect(fixture({ runs: [run()], jobs: [job('success')] }).api, now);
  report.commitDate = hostile;
  report.generatedAt = hostile;
  report.commitUrl = hostile;
  report.issues.push('synthetic-private-detail');
  report.controls[0].jobs[0].name = 'synthetic-private-detail';
  report.controls[0].reason = 'synthetic-private-detail';
  const observed = report.controls[0].run;
  observed.createdAt = hostile;
  observed.sha = 'synthetic-private-detail';
  for (const url of [
    hostile, 'javascript:bad', `https://github.com/${REPOSITORY}/actions/runs/123?token=synthetic-private-detail`,
    `https://github.com/${REPOSITORY}/actions/runs/123#${hostile}`,
    `https://github.com/${REPOSITORY}/actions/runs/999`,
    'https://github.com/other/private/actions/runs/123',
  ]) {
    observed.url = url;
    const summary = renderSummary(report);
    assert(!summary.includes(hostile));
    assert(!summary.includes('synthetic-private-detail'));
    assert(!summary.includes('[Voir le contrôle]'));
    assert.match(summary, /indisponible/);
  }
});

test('summary appends locally only for confirmed public visibility; absent path is a no-op', async () => {
  const directory = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'keep-summary-'));
  const summaryPath = require('node:path').join(directory, 'summary.md');
  try {
    const report = await collect(fixture().api, now);
    for (const visibility of ['private', 'unknown', undefined]) {
      assert.equal(renderSummary({ ...report, visibility }), null);
      assert.equal(writeSummary({ ...report, visibility }, summaryPath), false);
      assert.equal(fs.existsSync(summaryPath), false);
    }
    assert.equal(writeSummary(report, ''), false);
    fs.writeFileSync(summaryPath, 'Existing summary\n');
    assert.equal(writeSummary(report, summaryPath), true);
    assert.equal(fs.readFileSync(summaryPath, 'utf8'), `Existing summary\n${renderSummary(report)}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('real CLI retains JSON/exit codes and writes summary only for public successful collection', () => {
  const directory = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'keep-summary-cli-'));
  const summaryPath = require('node:path').join(directory, 'summary.md');
  const script = require.resolve('./github-controls-report.cjs');
  const execute = (mode, target = summaryPath) => {
    const preload = `
      globalThis.fetch=async url => {
        if ('${mode}' === 'unavailable') throw new Error('synthetic-private-detail');
        return new Response(JSON.stringify(
          String(url).endsWith('/KEEP') ? {private:'${mode}' === 'private'} :
          String(url).includes('/commits/') ? {sha:'${SHA}',commit:{committer:{date:'2026-10-06T19:00:00Z'}}} :
          String(url).includes('/jobs?') ? {total_count:1,jobs:[${JSON.stringify(job('success'))}]} :
          {total_count:${CONTROLS.length},workflow_runs:${JSON.stringify(CONTROLS.map(file => run(file, { conclusion: mode === 'failure' ? 'failure' : mode === 'skipped' ? 'skipped' : 'success' })))}}
        ));
      };
    `;
    return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, script], {
      encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'synthetic-test-token', GITHUB_STEP_SUMMARY: target },
    });
  };
  try {
    for (const mode of ['private', 'unavailable']) {
      const result = execute(mode);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, '');
      assert.equal(fs.existsSync(summaryPath), false);
      assert(!result.stderr.includes('synthetic-private-detail'));
    }
    for (const [mode, expected] of [['public', 0], ['skipped', 2], ['failure', 1]]) {
      const result = execute(mode);
      assert.equal(result.status, expected, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.visibility, 'public');
      assert.equal(result.stderr, '');
      const summary = fs.readFileSync(summaryPath, 'utf8');
      assert(summary.includes(SHA));
      assert(!summary.includes('synthetic-test-token'));
      assert(!summary.includes('PASS'));
      fs.unlinkSync(summaryPath);
    }
    assert.equal(execute('public', '').status, 0);
    assert.equal(fs.existsSync(summaryPath), false);
    // Local write errors do not leak the path or mask an observed failure.
    const blocked = require('node:path').join(directory, 'synthetic-private-detail', 'absent.md');
    for (const [mode, expected] of [['public', 2], ['failure', 1], ['skipped', 2]]) {
      const result = execute(mode, blocked);
      assert.equal(result.status, expected);
      assert.doesNotThrow(() => JSON.parse(result.stdout));
      assert.match(result.stderr, /Synthèse locale indisponible/);
      assert(!result.stderr.includes('synthetic-private-detail'));
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI withholds private metadata and handles unknown API without leaking body', () => {
  // Exercise the actual entry point in a subprocess; stub only the remote transport.
  const script = require.resolve('./github-controls-report.cjs');
  const preload = `
    const {Response}=globalThis;
    globalThis.fetch=async url => new Response(JSON.stringify(
      String(url).endsWith('/KEEP') ? {private:true} :
      String(url).includes('/commits/') ? {sha:'${SHA}',commit:{}} :
      {total_count:0,workflow_runs:[]}
    ));
  `;
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, script], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Rapport privé non publié/);
  assert(!result.stderr.includes(SHA));
  const unavailable = spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent("globalThis.fetch=async()=>{throw new Error('synthetic-private-body')}")}`, script,
  ], { encoding: 'utf8' });
  assert.equal(unavailable.status, 2);
  assert.equal(unavailable.stdout, '');
  assert.match(unavailable.stderr, /UNKNOWN/);
  assert(!unavailable.stderr.includes('synthetic-private-body'));
});

test('workflow is manual-only, least-privilege and has no publish or deployment', () => {
  const yaml = fs.readFileSync(require('node:path').join(__dirname, '../.github/workflows/github-controls-readonly.yml'), 'utf8');
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /contents: read/);
  assert.match(yaml, /actions: read/);
  assert(!/^\s+(push|pull_request|workflow_run|schedule):/m.test(yaml));
  assert(!/upload-artifact|GITHUB_STEP_SUMMARY|permissions:\s*write|pages: write|deploy-pages/.test(yaml));
  assert.equal((yaml.match(/github\.ref == 'refs\/heads\/reconcile\/claude-main-20260825'/g) || []).length, 3);
  assert.match(yaml, /node --test scripts\/admin-release-evidence\.test\.cjs scripts\/problem-report-evidence\.test\.cjs/);
  assert.match(yaml, /actionlint" -color \.github\/workflows\/\*\.yml/);
  // --ignore-scripts concerne npm, pas un contournement actionlint.
  assert(!/\s-ignore(?:\s|=)|-shellcheck=|-pyflakes=/.test(yaml));
});

test('real pinned actionlint validates a good workflow and rejects broken expressions', { skip: !process.env.KEEP_ACTIONLINT_BIN }, () => {
  const binary = process.env.KEEP_ACTIONLINT_BIN;
  assert.equal(execFileSync(binary, ['-version'], { encoding: 'utf8' }).split(/\r?\n/)[0], VERSION);
  const good = 'name: Fixture\non: workflow_dispatch\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n';
  assert.equal(spawnSync(binary, ['-stdin-filename', '.github/workflows/fixture.yml', '-'], { input: good, encoding: 'utf8' }).status, 0);
  const bad = good.replace('echo ok', 'echo ${{ definitely_unknown.value }}');
  const result = spawnSync(binary, ['-stdin-filename', '.github/workflows/fixture.yml', '-'], { input: bad, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /undefined variable/);
});
