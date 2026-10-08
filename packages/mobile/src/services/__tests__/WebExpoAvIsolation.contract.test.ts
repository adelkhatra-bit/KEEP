import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8');

describe('Web expo-av isolation', () => {
  const mic = read(__dirname, '..', 'micCapture.ts');
  const preview = read(__dirname, '..', 'audioPreviewService.ts');
  const background = read(__dirname, '..', '..', 'components', 'BackgroundListeningLifecycle.tsx');

  it.each([
    ['micCapture', mic],
    ['audioPreviewService', preview],
    ['BackgroundListeningLifecycle', background],
  ])('%s does not statically evaluate expo-av in the browser bundle', (_name, source) => {
    expect(source).not.toContain("from 'expo-av'");
    expect(source).toContain("require('expo-av')");
  });

  it('keeps the real web microphone path on getUserMedia/Web Audio', () => {
    expect(mic).toContain('navigator.mediaDevices.getUserMedia');
    expect(mic).toContain("const capture = Platform.OS === 'web' ? captureAudioSampleWeb");
  });

  it('keeps web previews on the shared HTMLAudioElement', () => {
    expect(preview).toContain('function canUseWebAudio()');
    expect(preview).toContain('await playWebSegment');
  });

  it('keeps the native Sound type valid without importing a phantom expo-av export', () => {
    expect(preview).not.toContain("import('expo-av').NativeSound");
    expect(preview).not.toContain('NativeSound.createAsync(');
    expect(preview).toContain('Audio.Sound.createAsync(');
  });
});
