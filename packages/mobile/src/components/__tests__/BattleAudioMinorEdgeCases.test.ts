// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Audit runtime Adel (22/09/2026) : 2 bugs mineurs confirmés à corriger dans
 * un commit groupé, en plus du bug micro/audio déjà corrigé (a98868f).
 */
describe('audioPreviewService -- ne reste plus "en lecture" sur un extrait web plus court que prévu', () => {
  const preview = readNormalized(__dirname, '..', '..', 'services', 'audioPreviewService.ts');

  it("écoute l'évènement natif ended en plus de la minuterie artificielle", () => {
    expect(preview).toContain("element.addEventListener('ended', finish);");
  });

  it('le nettoyage (finish) ne se déclenche qu\'une seule fois, quel que soit ce qui arrive en premier', () => {
    expect(preview).toContain('let finished = false;');
    expect(preview).toContain('if (finished) return;');
    expect(preview).toContain('finished = true;');
    expect(preview).toContain("element.removeEventListener('ended', finish);");
  });

  it("la minuterie reste un filet de sécurité si ended ne se déclenche jamais", () => {
    expect(preview).toContain('activeTimer = setTimeout(finish, Math.max(700, Math.round(effectiveDuration)));');
  });
  it('recalculates the shared Battle position after buffering so slower players do not restart from the beginning', () => {
    expect(preview).toContain('syncStartEpochMs?: number');
    expect(preview).toContain('const lateByMs = syncStartEpochMs ? Math.max(0, Date.now() - syncStartEpochMs) : 0');
    expect(preview).toContain('const effectivePosition = basePosition + lateByMs');
    expect(preview).toContain('startAtEpochMs');
  });
});

describe('KeepBattleMobileGameV3 -- un extrait mort ne bloque plus le Solo', () => {
  const battle = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const preview = readNormalized(__dirname, '..', '..', 'services', 'audioPreviewService.ts');

  it('limite les retries natifs et remplace le morceau avant de rendre la main', () => {
    expect(preview).toContain('const maxAttempts = 1;');
    expect(battle).toContain('soloAudioReplacementRef');
    expect(battle).toContain("recordSoloAnswer('__AUDIO_ERROR__')");
    expect(battle).toContain("Alert.alert('Audio indisponible'");
    expect(battle).not.toContain("Alert.alert('Manche sautée'");
  });
});
