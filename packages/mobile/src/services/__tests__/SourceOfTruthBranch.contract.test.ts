import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync, spawnSync } from 'child_process';

const root = path.resolve(__dirname, '../../../../..');
const guard = fs.readFileSync(path.join(root, 'scripts/verify-source-of-truth.cjs'), 'utf8');
const canonical = 'reconcile/claude-main-20260825';

const headSha = 'a'.repeat(40);
const eventPath = '/tmp/keep-source-branch-event.json';
function check(branch: string, containsProduct: boolean, env: Record<string, string> = {}, contractOverride?: Record<string, unknown>, eventOverride?: unknown) {
  const errors: string[] = [];
  vm.runInNewContext(guard, {
    __dirname: path.join(root, 'scripts'),
    require: (name: string) => name === 'child_process' ? {
      execFileSync: (command: string, args: string[]) => {
        if (command !== 'git') return '';
        if (args[0] === 'branch') return branch;
        expect(args).toEqual(['merge-base', '--is-ancestor', `refs/remotes/origin/${canonical}`,
          env.GITHUB_EVENT_NAME === 'pull_request' ? headSha : 'HEAD']);
        if (!containsProduct) throw new Error('Référence produit absente ou non intégrée');
        return '';
      },
    } : name === 'fs' ? {
      ...fs,
      readFileSync: (file: string, encoding: BufferEncoding) => file === eventPath
        ? JSON.stringify(eventOverride ?? { pull_request: { head: { ref: env.GITHUB_HEAD_REF, sha: headSha, repo: { full_name: 'adelkhatra-bit/KEEP' } }, base: { ref: canonical } } })
        : file === path.join(root, 'BRANCH_SOURCE_OF_TRUTH.json') && contractOverride
        ? JSON.stringify(contractOverride)
        : fs.readFileSync(file, encoding),
    } : require(name),
    process: { env, execPath: process.execPath, exit: () => {} },
    console: { log: () => {}, error: (message: string) => errors.push(message) },
  });
  return errors.join('\n');
}

  describe('triage des fichiers protégés déjà validés', () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/agent-command-triage.yml'), 'utf8');
    const script = workflow.split("node <<'NODE'\n")[1].split('\n          NODE')[0];
    const config = JSON.parse(fs.readFileSync(path.join(root, '.github/agent-command-center.json'), 'utf8'));

    function triage(file: string, hash: string) {
      const errors: string[] = [];
      vm.runInNewContext(script, {
        require: (name: string) => name === 'child_process'
          ? { execFileSync: () => hash }
          : config,
        process: { env: { KEEP_CHANGED_PROTECTED_FILES: file }, exit: () => {} },
        console: { log: () => {}, error: (message: string) => errors.push(message) },
      });
      return errors;
    }

    it('accepte les seuls blobs exacts du shell déjà validé', () => {
      const integrityGuard = fs.readFileSync(path.join(root, 'scripts/verify-profile-data-integrity.cjs'), 'utf8');
      for (const [file, hash] of Object.entries(config.approvedProtectedFileBlobs)) {
        const actual = execFileSync('git', ['hash-object', file], { cwd: root, encoding: 'utf8' }).trim();
        expect(hash).toBe(actual);
        expect(integrityGuard).toContain(`'${file}': '${hash}'`);
        expect(triage(file, actual)).toEqual([]);
      }
    });
    it('refuse toute nouvelle modification de Navigation', () => {
      expect(triage('packages/mobile/src/navigation/Navigation.tsx', '0'.repeat(40))).toHaveLength(1);
    });
    it('refuse un fichier protégé sans validation explicite', () => {
      expect(triage('packages/mobile/src/screens/ProfileScreen.BACKUP.tsx', '0'.repeat(40))).toHaveLength(1);
    });
  });
describe('source unique et branches de revue Copilot', () => {
  it('aligne le contrat avec la seule base de revue autorisée', () => {
    const contract = JSON.parse(fs.readFileSync(path.join(root, 'BRANCH_SOURCE_OF_TRUTH.json'), 'utf8'));
    expect(contract.allowedRemoteBranches).toContain('copilot/*');
    expect(contract.forbiddenRemoteBranches).not.toContain('copilot/*');
    expect(contract.reviewBranches['copilot/*']).toEqual({ pullRequestBase: canonical, publicationSource: false });
    const env = { GITHUB_BASE_REF: canonical };
    for (const mutation of [
      { ...contract, allowedRemoteBranches: [canonical] },
      { ...contract, forbiddenRemoteBranches: [...contract.forbiddenRemoteBranches, 'copilot/*'] },
      { ...contract, reviewBranches: { 'copilot/*': { pullRequestBase: 'main', publicationSource: false } } },
      { ...contract, reviewBranches: { 'copilot/*': { pullRequestBase: canonical, publicationSource: true } } },
    ]) {
      expect(check('copilot/fix-stories', true, env, mutation)).toContain('BRANCH CONTRACT MUST ALLOW COPILOT REVIEW ONLY');
    }
  });
  it('préserve les branches Copilot uniquement avec une PR ouverte vers la base canonique', () => {
    const hygiene = fs.readFileSync(path.join(root, '.github/workflows/branch-hygiene.yml'), 'utf8');
    expect(hygiene).toContain('pull-requests: read');
    expect(hygiene.match(/-f state=open -f "head=\$\{GITHUB_REPOSITORY%\/\*\}:\$branch"/g)).toHaveLength(2);
    expect(hygiene.match(/length > 0 and all/g)).toHaveLength(2);
    expect(hygiene).toContain('KEEP REVIEW ONLY: $branch -> $canonical');
  });
  it('contrôle aussi une PR redirigée vers main, sans lancer le nettoyage destructif', () => {
    const hygiene = fs.readFileSync(path.join(root, '.github/workflows/branch-hygiene.yml'), 'utf8');
    expect(hygiene).toContain('types: [opened, reopened, synchronize, edited, ready_for_review]');
    expect(hygiene).toContain("if: github.event_name != 'pull_request'");
    const job = hygiene.split('  copilot-review-base:')[1].split('  remove-misleading-legacy-branches:')[0];
    const script = job.split('        run: |\n')[1].replace(/^ {10}/gm, '');
    for (const base of [canonical, 'main', 'other', '']) {
      const result = spawnSync('bash', ['-c', script], {
        env: { ...process.env, GITHUB_REPOSITORY: 'adelkhatra-bit/KEEP', REVIEW_BASE: base },
        encoding: 'utf8',
      });
      expect(result.status === 0).toBe(base === canonical);
    }
  });
  it('récupère la référence canonique dans les workflows de validation PR', () => {
    for (const file of ['mobile-ci.yml', 'keep-dual-viewport-guardian.yml', 'keep-ui-baseline-guard.yml', 'web-companion-qr-runtime.yml']) {
      const workflow = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');
      expect(workflow).toMatch(/actions\/checkout@[a-f0-9]{40}[^\n]*\n\s+with:\n\s+fetch-depth: 0/);
    }
  });
  it('accepte toujours la branche produit', () => {
    expect(check(canonical, false, { GITHUB_REF_NAME: canonical })).toBe('');
  });
  it('accepte uniquement une branche Copilot contenant le produit récupéré', () => {
    expect(check('copilot/fix-stories', true, { GITHUB_REF_NAME: 'copilot/fix-stories', GITHUB_BASE_REF: canonical })).toBe('');
  });
  it('refuse une branche Copilot périmée ou sans référence canonique', () => {
    expect(check('copilot/fix-stories', false)).toContain('AGENT BRANCH MUST CONTAIN');
  });
  it('refuse main et les branches de preview, même si elles contiennent le produit', () => {
    for (const branch of ['main', 'web-preview', 'admin-preview', 'backup/test']) {
      expect(check(branch, true)).toContain('WRONG LOCAL BRANCH');
    }
  });
  it('refuse une revue vers main ou un autre dépôt', () => {
    expect(check('copilot/fix-stories', true, { GITHUB_BASE_REF: 'main' })).toContain('WRONG AGENT REVIEW BASE');
    expect(check('copilot/fix-stories', true, { GITHUB_REPOSITORY: 'other/project' })).toContain('WRONG REPOSITORY');
  });
  it('refuse une branche de revue sans base explicite', () => {
    expect(check('copilot/fix-stories', true)).toContain('WRONG AGENT REVIEW BASE: missing');
  });
  it('accepte le checkout détaché de la CI uniquement avec une PR vers la base canonique', () => {
    const env = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath, GITHUB_REF_NAME: '50/merge', GITHUB_HEAD_REF: 'copilot/fix-stories', GITHUB_BASE_REF: canonical };
    expect(check('', true, env)).toBe('');
    expect(check('', true, { ...env, GITHUB_BASE_REF: 'main' })).toContain('WRONG AGENT REVIEW BASE');
    expect(check('', true, { ...env, GITHUB_EVENT_NAME: 'push' })).toContain('WRONG BRANCH');
    expect(check('', false, env)).toContain('AGENT BRANCH MUST CONTAIN');
    expect(check('', true, { ...env, GITHUB_EVENT_PATH: '' })).toContain('AGENT BRANCH MUST CONTAIN');
    expect(check('', true, env, undefined, { pull_request: { head: { ref: 'copilot/fix-stories', sha: headSha, repo: { full_name: 'other/repo' } }, base: { ref: canonical } } })).toContain('AGENT BRANCH MUST CONTAIN');
  });
  it('refuse une référence CI différente de la branche vérifiée', () => {
    expect(check('copilot/fix-stories', true, { GITHUB_REF_NAME: 'main' })).toContain('WRONG BRANCH');
  });
});
