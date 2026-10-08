const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const branch = 'copilot/source-contract-test';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

function verify(base, changes = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-review-contract-'));
  const eventPath = path.join(dir, 'event.json');
  const pr = {
    base: { ref: base, repo: { full_name: 'adelkhatra-bit/KEEP' }, sha: head },
    head: { ref: branch, sha: head },
    ...changes,
  };
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: pr }));
  try {
    return spawnSync(process.execPath, ['scripts/verify-source-of-truth.cjs'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'adelkhatra-bit/KEEP',
        GITHUB_HEAD_REF: branch,
        GITHUB_BASE_REF: base,
        GITHUB_REF_NAME: '53/merge',
        GITHUB_EVENT_PATH: eventPath,
      },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('Copilot PR targeting the canonical product branch passes the complete guard', () => {
  const result = verify('reconcile/claude-main-20260825');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('Copilot PR targeting main is rejected', () => {
  const result = verify('main');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /WRONG AGENT REVIEW BASE: main/);
});

test('PR metadata must identify the canonical repository and checked-out commit', () => {
  for (const changes of [
    { base: { ref: 'reconcile/claude-main-20260825', repo: { full_name: 'other/KEEP' }, sha: head } },
    { head: { ref: branch, sha: '0'.repeat(40) } },
  ]) {
    const result = verify('reconcile/claude-main-20260825', changes);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /AGENT BRANCH MUST SHARE FETCHED CANONICAL HISTORY/);
  }
});
