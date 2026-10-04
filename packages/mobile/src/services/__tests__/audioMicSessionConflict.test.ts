// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Audit runtime Adel (22/09/2026) : "beaucoup de bugs quand il joue en solo
 * avec la musique". Bug réel confirmé : audioPreviewService.ts (Battle solo,
 * Swipe, aperçus de morceau) appelait Audio.setAudioModeAsync de façon
 * totalement indépendante de micCapture.ts (capture micro pour la
 * reconnaissance), sur le MÊME état audio natif global partagé -- sans
 * coordination entre les deux files d'attente, le dernier appel gagne. Une
 * preview qui démarre pendant une capture micro active pouvait couper le
 * micro sous elle, silencieusement, sans erreur visible.
 */
describe('Conflit micro/audio -- audioPreviewService ne coupe plus une capture micro active (Adel, 22/09/2026)', () => {
  const preview = readNormalized(__dirname, '..', 'audioPreviewService.ts');
  const mic = readNormalized(__dirname, '..', 'micCapture.ts');

  it('micCapture.ts expose un état lisible de la capture micro en cours', () => {
    expect(mic).toContain('export function isNativeRecordingModeActive(): boolean {');
    expect(mic).toContain('return nativeRecordingModeDesired;');
  });

  it('audioPreviewService.ts importe et consulte cet état avant de configurer le son', () => {
    expect(preview).toContain("import { isNativeRecordingModeActive } from './micCapture';");
    expect(preview).toContain('const recordingActive = isNativeRecordingModeActive();');
  });

  it('allowsRecordingIOS et staysActiveInBackground suivent l\'état réel de la capture -- jamais forcés à false', () => {
    expect(preview).toContain('allowsRecordingIOS: recordingActive,');
    expect(preview).toContain('staysActiveInBackground: recordingActive,');
    expect(preview).not.toContain('allowsRecordingIOS: false,');
  });

  it('le mode interruption iOS est aligné avec micCapture.ts (MixWithOthers) pour ne jamais couper l\'autre flux audio', () => {
    expect(preview).toContain("type ExpoAVModule = typeof import('expo-av');");
    expect(preview).toContain("const { Audio, InterruptionModeIOS } = getNativeExpoAV();");
    expect(preview).toContain('interruptionModeIOS: recordingActive ? InterruptionModeIOS.MixWithOthers : InterruptionModeIOS.DoNotMix,');
    expect(mic).toContain('interruptionModeIOS: InterruptionModeIOS.MixWithOthers,');
  });
  it('Battle Solo attend la libération réelle du micro avant toute preview TestFlight', () => {
    const battle = readNormalized(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx');
    expect(battle).toContain("import { cancelAudioCapture } from '../services/micCapture';");
    const start = battle.indexOf('const start = async () => {');
    const cancel = battle.indexOf('await cancelAudioCapture().catch(() => {});', start);
    const play = battle.indexOf('const ok = await playVerified(', start);
    expect(cancel).toBeGreaterThan(start);
    expect(play).toBeGreaterThan(cancel);
  });

});
