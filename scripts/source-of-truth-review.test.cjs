const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/verify-source-of-truth.cjs'), 'utf8');
const guards = source.slice(0, source.indexOf('const mustExist ='));
const canonical = 'reconcile/claude-main-20260825';
const branch = 'copilot/issue50';
const repository = 'adelkhatra-bit/KEEP';
const headSha = 'a'.repeat(40);
const mergeSha = 'b'.repeat(40);

function check({ env = {}, local = branch, sha = headSha, commonHistory = true, pr } = {}) {
  const context = {
    __dirname: path.join(root, 'scripts'),
    process: { env },
    require(name) {
      if (name === 'fs') return { readFileSync: () => JSON.stringify({ pull_request: pr }) };
      if (name === 'child_process') return {
        execFileSync(_command, args) {
          if (args[0] === 'branch') return local;
          if (args[0] === 'rev-parse') return sha;
          if (args[0] === 'merge-base' && commonHistory) return 'c'.repeat(40);
          throw new Error('canonical history unavailable');
        },
      };
      return require(name);
    },
  };
  vm.createContext(context);
  return JSON.parse(vm.runInContext(`${guards}\nJSON.stringify(failures)`, context));
}

const pr = {
  base: { ref: canonical, repo: { full_name: repository } },
  head: { ref: branch, sha: headSha, repo: { full_name: repository } },
  merge_commit_sha: mergeSha,
};
const env = {
  GITHUB_REPOSITORY: repository,
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_EVENT_PATH: '/tmp/fixture-event.json',
  GITHUB_HEAD_REF: branch,
  GITHUB_BASE_REF: canonical,
  GITHUB_REF_NAME: '51/merge',
};

test('autorise la source canonique et une revue locale avec histoire commune', () => {
  assert.deepEqual(check({ local: canonical }), []);
  assert.deepEqual(check({ env: { GITHUB_REF_NAME: branch } }), []);
});
test('refuse une revue locale sans référence/histoire canonique et les branches étrangères', () => {
  assert.ok(check({ commonHistory: false }).length);
  assert.ok(check({ local: 'main' }).length);
});
test('autorise le checkout détaché et superficiel du merge GitHub de la PR canonique', () => {
  assert.deepEqual(check({ env, local: '', commonHistory: false, sha: mergeSha, pr }), []);
});
test('autorise le checkout du HEAD exact de la PR canonique', () => {
  assert.deepEqual(check({ env, sha: headSha, pr }), []);
});
test('refuse une PR vers main, même avec une ascendance canonique', () => {
  assert.ok(check({ env: { ...env, GITHUB_BASE_REF: 'main' }, pr: { ...pr, base: { ...pr.base, ref: 'main' } } }).length);
});
test('refuse un SHA substitué, un dépôt différent ou des métadonnées absentes', () => {
  assert.ok(check({ env, sha: 'd'.repeat(40), pr }).length);
  assert.ok(check({ env, pr: { ...pr, head: { ...pr.head, repo: { full_name: 'other/KEEP' } } } }).length);
  assert.ok(check({ env }).length);
});
test('refuse une branche locale différente et une base de revue contradictoire', () => {
  assert.ok(check({ env, local: 'copilot/other', pr }).length);
  assert.ok(check({ env: { GITHUB_REF_NAME: branch, GITHUB_BASE_REF: 'main' } }).length);
});
test('le contrat et le nettoyage préservent les revues sans autoriser leur publication', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'BRANCH_SOURCE_OF_TRUTH.json'), 'utf8'));
  assert.ok(contract.allowedRemoteBranches.includes('copilot/*'));
  assert.ok(!contract.forbiddenRemoteBranches.includes('copilot/*'));
  assert.deepEqual(contract.reviewBranchPolicy, { pattern: 'copilot/*', requiredBaseBranch: canonical, deploymentAllowed: false });
  const hygiene = fs.readFileSync(path.join(root, '.github/workflows/branch-hygiene.yml'), 'utf8');
  assert.match(hygiene, /"\$canonical"\|main\|dependabot\/\*\|archive\/\*\|copilot\/\*\)/);
  assert.match(hygiene, /gh pr list.*--state open.*baseRefName/);
  assert.match(hygiene, /pull-requests: read/);
  const publishing = fs.readFileSync(path.join(root, '.github/workflows/web-preview-pages.yml'), 'utf8');
  assert.ok(!publishing.includes('copilot/*'));
  const uiGuard = fs.readFileSync(path.join(root, '.github/workflows/keep-ui-baseline-guard.yml'), 'utf8');
  assert.ok(uiGuard.includes('${GITHUB_BASE_REF:-$GITHUB_REF_NAME}'));
});
