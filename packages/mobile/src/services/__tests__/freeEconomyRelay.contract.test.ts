// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

describe('[ECONOMIE-FREE-04-10] — contrat canonique', () => {
  const pricing = readNormalized(repoRoot, 'docs', 'PRICING_STRATEGY.md');
  const agents = readNormalized(repoRoot, 'AGENTS.md');
  const claude = readNormalized(repoRoot, 'CLAUDE.md');
  const referral = readNormalized(repoRoot, 'packages', 'mobile', 'src', 'services', 'referralService.ts');
  const recognitionAdmin = readNormalized(repoRoot, 'supabase', 'functions', 'keep-recognition-admin-test', 'index.ts');

  it('garde une seule source de vérité Économie FREE référencée par tous les agents', () => {
    expect(pricing).toContain('Économie FREE');
    expect(pricing).toContain('LISTEN_DAILY');
    expect(pricing).toContain('listens_per_day');
    expect(agents).toContain('docs/PRICING_STRATEGY.md');
    expect(claude).toContain('docs/PRICING_STRATEGY.md');
  });

  it('garde le fallback parrainage aligné sur +2 sans anciens paliers et plafond 20', () => {
    expect(referral).toContain(
      'freePerSignup: 2, bonus3: 0, bonus5: 0, bonus10: 0, monthlyCap: 20',
    );
    expect(referral).not.toContain(
      'freePerSignup: 2, bonus3: 3, bonus5: 5, bonus10: 10, monthlyCap: 40',
    );
  });

  it('conserve le code fournisseur AudD et le détail exact dans le test Super Admin', () => {
    expect(recognitionAdmin).toContain('providerCode?: number');
    expect(recognitionAdmin).toContain('AudD #${code}: ${detail.slice(0, 160)}.');
    expect(recognitionAdmin).not.toContain(
      'message: "AudD refuse le token actuellement enregistré."',
    );
  });
});
