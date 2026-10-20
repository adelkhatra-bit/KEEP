import fs from 'fs';
import path from 'path';

// ERR-SUPABASE-EGRESS-IMAGES-20261021 : un robot Playwright déclenché
// automatiquement (push, PR, planning) contre la production Supabase ne doit
// jamais retélécharger les images Storage. Le garde-fou commun
// scripts/robot-storage-guard.cjs les sert localement (1×1 px).

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const WORKFLOWS = path.join(REPO_ROOT, '.github', 'workflows');
const GUARD = 'scripts/robot-storage-guard.cjs';

// Exceptions assumées :
// - keep-journeys : tout le réseau Supabase est déjà un faux backend local ;
// - app-store-* : captures App Store déclenchées seulement par la modification
//   de leur propre fichier ; elles doivent montrer les vraies images.
const EXEMPT = /^(keep-journeys|app-store-)/;

function automaticTriggers(source: string): boolean {
  const onBlock = source.split(/\n(?=[a-z])/).find((block) => block.startsWith('on:')) || '';
  return /\n\s+(push|pull_request|schedule):/.test(onBlock);
}

describe('robots navigateur — aucune image Storage de production téléchargée', () => {
  const files = fs.readdirSync(WORKFLOWS).filter((file) => file.endsWith('.yml'));

  const concerned = files.filter((file) => {
    const source = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
    return /playwright/i.test(source)
      && /rrhqsqzcplvmwxizqnla\.supabase\.co|EXPO_PUBLIC_SUPABASE_URL|loki-web|keep-preview/.test(source)
      && automaticTriggers(source)
      && !EXEMPT.test(file);
  });

  it('couvre bien les gardiens connus', () => {
    for (const known of ['keep-human-guardian.yml', 'keep-dual-viewport-guardian.yml', 'mobile-ci.yml', 'public-trial-smoke.yml']) {
      expect(concerned).toContain(known);
    }
  });

  it.each(files.length ? files : ['none'])('%s : garde-fou Storage présent si robot de production', (file) => {
    if (!concerned.includes(file)) return;
    const source = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
    expect(source).toContain(`NODE_OPTIONS=--require $GITHUB_WORKSPACE/${GUARD}`);
    // Le garde-fou doit être posé APRÈS le checkout (le fichier doit exister).
    expect(source.indexOf(GUARD)).toBeGreaterThan(source.indexOf('actions/checkout@'));
  });

  it('le garde-fou ne sert que les GET d’images Storage', () => {
    const guard = fs.readFileSync(path.join(REPO_ROOT, GUARD), 'utf8');
    expect(guard).toContain("/\\/storage\\/v1\\/(object|render\\/image)\\/(public|sign|authenticated)\\//");
    expect(guard).toContain("if (request.method() !== 'GET') return route.fallback();");
    expect(guard).toContain("LOKI_ROBOT_ALLOW_STORAGE");
  });
});
