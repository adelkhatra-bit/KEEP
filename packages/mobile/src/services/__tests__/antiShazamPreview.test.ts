// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Anti-Shazam (Adel, 22/09/2026) : spec validée -- extraits courts (5-8s) à
 * offset aléatoire (15-70% du morceau), léger pitch-shift (setRateAsync,
 * ±3-5%), voix off Loki Music (expo-speech, décision "Option 2" du
 * 22/09/2026) par-dessus l'extrait, tiré au hasard parmi 5 phrases, jamais
 * mis en cache. 100% client. Scope : PlaylistSaleImmersivePreview.tsx
 * uniquement -- volontairement une fonction séparée de
 * playTrackPreviewSegment (Battle/Swipe) pour ne prendre aucun risque de
 * régression sur ces usages.
 */
describe('audioPreviewService -- playAntiShazamPreviewSegment / stopAntiShazamPreview', () => {
  const preview = readNormalized(__dirname, '..', 'audioPreviewService.ts');

  it('importe expo-speech pour la voix off (décision Adel : Option 2, pas de voix humaine enregistrée)', () => {
    expect(preview).toContain("import * as Speech from 'expo-speech';");
  });

  it('les 5 phrases exactes données par Adel sont présentes, tirées au hasard à chaque lecture', () => {
    expect(preview).toContain('const ANTI_SHAZAM_VOICE_LINES = [');
    expect(preview).toContain("'Découvre cette playlist sur Loki Music.'");
    expect(preview).toContain("'Une sélection gardée pour toi.'");
    expect(preview).toContain("'Écoute avant d’acheter.'");
    expect(preview).toContain("'La musique garde sa mémoire.'");
    expect(preview).toContain("'Loki Music — ton univers musical.'");
    expect(preview).toContain('ANTI_SHAZAM_VOICE_LINES[Math.floor(Math.random() * ANTI_SHAZAM_VOICE_LINES.length)]');
  });

  it('la voix off joue par-dessus à volume réduit (~0.25), jamais à la place de l\'extrait', () => {
    expect(preview).toContain("Speech.speak(line, { language: 'fr-FR', volume: 0.25, pitch: 1, rate: 1 });");
  });

  it('extrait de 5 à 8 secondes, recalculé à chaque appel (jamais mis en cache)', () => {
    expect(preview).toContain('const extractDurationMs = 5000 + Math.random() * 3000;');
  });

  it('offset aléatoire entre 15% et 70% du morceau, clampé pour laisser la place à l\'extrait', () => {
    expect(preview).toContain('const low = durationMillis * 0.15;');
    expect(preview).toContain('const high = Math.max(low, Math.min(durationMillis * 0.7, durationMillis - extractDurationMs));');
  });

  it('repli sur une fenêtre fixe (20-50s) si la durée du morceau est inconnue', () => {
    const fnStart = preview.indexOf('export async function playAntiShazamPreviewSegment(');
    const fnBody = preview.slice(fnStart, preview.indexOf('\n}\n', fnStart));
    const occurrences = fnBody.match(/20000 \+ Math\.random\(\) \* 30000/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2); // web + repli natif durée inconnue
  });

  it('pitch-shift ±3-5% via setRateAsync(rate, shouldCorrectPitch=false), sens tiré au hasard', () => {
    expect(preview).toContain('const rateShift = 1 + (0.03 + Math.random() * 0.02) * (Math.random() < 0.5 ? 1 : -1);');
    expect(preview).toContain('await createdSound.setRateAsync(rateShift, false);');
  });

  it('un échec de lecture (seek/pitch-shift) retombe sur une lecture simple sans traitement, jamais un silence', () => {
    expect(preview).toContain('await createdSound.setPositionAsync(0);');
    expect(preview).toContain('await createdSound.setRateAsync(1, false);');
  });

  it('résout avec la durée réelle de l\'extrait pour que l\'appelant affiche un compte à rebours correct', () => {
    expect(preview).toContain('export async function playAntiShazamPreviewSegment(');
    expect(preview).toContain('): Promise<number> {');
    expect(preview).toContain('return extractDurationMs;');
  });

  it('stopAntiShazamPreview coupe la voix off ET réinitialise le playbackRate web (pas de fuite vers Battle/Swipe)', () => {
    expect(preview).toContain('export async function stopAntiShazamPreview(key?: string): Promise<void> {');
    const fnStart = preview.indexOf('export async function stopAntiShazamPreview(');
    const fnBody = preview.slice(fnStart, preview.indexOf('\n}\n', fnStart));
    expect(fnBody).toContain('Speech.stop();');
    expect(fnBody).toContain('element.playbackRate = 1;');
    expect(fnBody).toContain('await stopTrackPreview(key);');
  });

  it('playTrackPreviewSegment (Battle/Swipe) reste totalement inchangé par cet ajout', () => {
    expect(preview).toContain('export async function playTrackPreviewSegment(');
    expect(preview).not.toContain('speakAntiShazamLine();\n\n    activeTimer = setTimeout(() => {\n      if (activeSound !== createdSound) return;\n      void serialize(async () => { await unloadActive(); });\n      onEnded?.();\n    }, Math.max(1000, Math.round(durationMillis)));');
  });
});

describe('PlaylistSaleImmersivePreview -- branché sur les fonctions anti-Shazam, pas les fonctions génériques', () => {
  const source = readNormalized(__dirname, '..', '..', 'components', 'PlaylistSaleImmersivePreview.tsx');

  it("importe playAntiShazamPreviewSegment / stopAntiShazamPreview, plus playTrackPreviewSegment / stopTrackPreview", () => {
    expect(source).toContain("import { playAntiShazamPreviewSegment, stopAntiShazamPreview } from '../services/audioPreviewService';");
    expect(source).not.toContain('playTrackPreviewSegment');
    expect(source).not.toContain('stopTrackPreview');
  });

  it('la durée fixe de 15s (PREVIEW_DURATION_MS) a disparu -- le compte à rebours suit la durée réelle rendue par le service', () => {
    expect(source).not.toContain('PREVIEW_DURATION_MS');
    expect(source).toContain('.then((durationMs) => {');
    expect(source).toContain('setSecondsLeft(Math.round(durationMs / 1000));');
  });
});

describe('Non-régression : Battle solo (playVerified/preloadTrackPreviewSegment) ne passe jamais par les fonctions anti-Shazam', () => {
  const battle = readNormalized(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx');

  it('KeepBattleMobileGameV3 continue d\'utiliser playTrackPreviewSegment/preloadTrackPreviewSegment, jamais anti-Shazam', () => {
    expect(battle).toContain("import { playTrackPreviewSegment, preloadTrackPreviewSegment, discardPreloadedTrackPreview, scheduleTrackPreviewSegment, stopTrackPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';");
    expect(battle).not.toContain('AntiShazam');
  });
});
