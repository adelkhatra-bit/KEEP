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
    expect(preview).toContain("import { Audio, AVPlaybackStatus, InterruptionModeIOS } from 'expo-av';");
    expect(preview).toContain('interruptionModeIOS: InterruptionModeIOS.MixWithOthers,');
    expect(mic).toContain('interruptionModeIOS: InterruptionModeIOS.MixWithOthers,');
  });
});
