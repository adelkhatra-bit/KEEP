import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';

const root = path.resolve(__dirname, '../../../../..');
const guard = fs.readFileSync(path.join(root, 'scripts/verify-source-of-truth.cjs'), 'utf8');
const canonical = 'reconcile/claude-main-20260825';

function check(branch: string, containsProduct: boolean, env: Record<string, string> = {}) {
  const errors: string[] = [];
  vm.runInNewContext(guard, {
    __dirname: path.join(root, 'scripts'),
    require: (name: string) => name === 'child_process' ? {
      execFileSync: (command: string, args: string[]) => {
        if (command !== 'git') return '';
        if (args[0] === 'branch') return branch;
        expect(args).toEqual(['merge-base', '--is-ancestor', `refs/remotes/origin/${canonical}`, 'HEAD']);
        if (!containsProduct) throw new Error('Référence produit absente ou non intégrée');
        return '';
      },
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
  });
  it('préserve les branches Copilot uniquement avec une PR ouverte vers la base canonique', () => {
    const hygiene = fs.readFileSync(path.join(root, '.github/workflows/branch-hygiene.yml'), 'utf8');
    expect(hygiene).toContain('pull-requests: read');
    expect(hygiene.match(/-f state=open -f "head=\$\{GITHUB_REPOSITORY%\/\*\}:\$branch"/g)).toHaveLength(2);
    expect(hygiene.match(/length > 0 and all/g)).toHaveLength(2);
    expect(hygiene).toContain('KEEP REVIEW ONLY: $branch -> $canonical');
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
    const env = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF_NAME: '50/merge', GITHUB_HEAD_REF: 'copilot/fix-stories', GITHUB_BASE_REF: canonical };
    expect(check('', true, env)).toBe('');
    expect(check('', true, { ...env, GITHUB_BASE_REF: 'main' })).toContain('WRONG AGENT REVIEW BASE');
    expect(check('', true, { ...env, GITHUB_EVENT_NAME: 'push' })).toContain('WRONG BRANCH');
    expect(check('', false, env)).toContain('AGENT BRANCH MUST CONTAIN');
  });
  it('refuse une référence CI différente de la branche vérifiée', () => {
    expect(check('copilot/fix-stories', true, { GITHUB_REF_NAME: 'main' })).toContain('WRONG BRANCH');
  });
});
