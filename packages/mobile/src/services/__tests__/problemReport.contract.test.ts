import fs from 'fs';
import path from 'path';
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

describe('Signaler un problème / secousse (Adel 05/10/2026)', () => {
  const svc = read('services', 'problemReportService.ts');
  it('envoie le message avec le contexte dans app_problem_reports', () => {
    expect(svc).toContain("from('app_problem_reports')");
    for (const field of ['screen:', 'platform:', 'app_version:', 'build_sha:', 'device:']) expect(svc).toContain(field);
  });
  it('la secousse est protégée : un binaire sans expo-sensors ne plante jamais', () => {
    expect(svc).toContain("require('expo-sensors')");
    expect(svc).toMatch(/catch \{ \/\* module natif absent/);
  });
  it('la fenêtre est montée une fois dans App.tsx et accessible depuis les réglages', () => {
    expect(read('..', 'App.tsx')).toContain('<ProblemReportHost />');
    expect(read('screens', 'ProfileSettingsMobileScreen.tsx')).toContain('settings-report-problem');
  });
  it('le bouton story attend la vérification avant de proposer l\'ajout', () => {
    const deck = read('components', 'MusicSwipeDeckModal.tsx');
    expect(deck).toContain('storyIdsReady');
    expect(deck).toContain('PATIENTE');
  });
  it('Aperçu précharge le premier extrait dès le tap', () => {
    expect(read('screens', 'ProfilePublicScreen.tsx')).toContain("L'extrait du premier morceau");
  });
});
