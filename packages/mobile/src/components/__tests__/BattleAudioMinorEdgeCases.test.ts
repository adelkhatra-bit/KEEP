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
    expect(preview).toContain('activeTimer = setTimeout(finish, Math.max(1000, Math.round(durationMillis)));');
  });
});

describe('KeepBattleMobileGameV3 -- une manche sautée (extrait mort) est maintenant visible pour le joueur', () => {
  const battle = readNormalized(__dirname, '..', 'KeepBattleMobileGameV3.tsx');

  it("affiche une alerte au lieu de sauter silencieusement la manche (avant : seulement un console.warn)", () => {
    expect(battle).toContain("Alert.alert('Manche sautée', 'Ce morceau est momentanément indisponible -- passage à la manche suivante.');");
  });
});
